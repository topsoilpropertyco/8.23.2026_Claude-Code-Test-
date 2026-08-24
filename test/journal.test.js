import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/facts.js';
import { loadPrompts, selectPrompt, morningPrompt, intakeRequest } from '../src/prompts.js';
import { parseEntry, buildCoachResponse } from '../src/coach.js';
import { trailing, percentileRank, zScore, confidence, stdev } from '../src/stats.js';
import { buildDaySchedule } from '../src/schedule.js';
import { renderMessage, renderIntake } from '../src/render.js';

const config = loadConfig();
const { prompts } = loadPrompts();

/* ------------------------------------------------------------------ prompts */

test('every prompt names a defined mechanism and at least one slot', () => {
  const { mechanisms } = loadPrompts();
  const slotIds = config.slots.map((s) => s.id);
  for (const p of prompts) {
    assert.ok(mechanisms[p.mechanism], `${p.id} has undefined mechanism ${p.mechanism}`);
    assert.ok(p.slots.length > 0, `${p.id} has no slots`);
    for (const s of p.slots) assert.ok(slotIds.includes(s), `${p.id} targets unknown slot ${s}`);
    assert.ok(p.text.length > 10);
  }
});

test('prompt rotation uses every prompt before repeating', () => {
  let state = {};
  const seen = [];
  for (let i = 0; i < prompts.length; i++) {
    const slot = config.slots.filter((s) => s.type !== 'intake')[i % 6];
    const r = selectPrompt({ state, slotId: slot.id, lastMechanism: null });
    state = { ...state, promptCycle: r.promptCycle, promptRemaining: r.promptRemaining };
    seen.push(r.prompt.id);
  }
  assert.equal(new Set(seen).size, prompts.length, 'a prompt repeated inside one cycle');
  assert.equal(state.promptRemaining.length, 0);
});

test('prompt selection avoids repeating the previous mechanism', () => {
  let state = {};
  let last = null;
  let repeats = 0;
  for (let i = 0; i < 40; i++) {
    const slot = config.slots.filter((s) => s.type !== 'intake')[i % 6];
    const r = selectPrompt({ state, slotId: slot.id, lastMechanism: last });
    state = { ...state, promptCycle: r.promptCycle, promptRemaining: r.promptRemaining };
    if (r.prompt.mechanism === last) repeats++;
    last = r.prompt.mechanism;
  }
  assert.ok(repeats <= 2, `mechanism repeated back-to-back ${repeats} times`);
});

test('prompt selection prefers a prompt tagged for the slot', () => {
  const r = selectPrompt({ state: {}, slotId: 'work_shutdown', lastMechanism: null });
  assert.ok(r.prompt.slots.includes('work_shutdown'));
});

test('morning prompts rotate and the intake request explains the format', () => {
  const a = morningPrompt(0), b = morningPrompt(1);
  assert.notEqual(a.id, b.id);
  assert.equal(morningPrompt(0).id, morningPrompt(loadPrompts().intake.prompts.length).id);
  assert.match(intakeRequest(), /84/);
});

/* ------------------------------------------------------------------ parsing */

test('sleep entries parse from the documented shapes', () => {
  assert.deepEqual(parseEntry('84'), { ok: true, score: 84, hours: null, feel: null });
  assert.deepEqual(parseEntry('84 7.5'), { ok: true, score: 84, hours: 7.5, feel: null });
  assert.deepEqual(parseEntry('84 7.5 4'), { ok: true, score: 84, hours: 7.5, feel: 4 });
  assert.deepEqual(parseEntry('  84,7.5,4 '), { ok: true, score: 84, hours: 7.5, feel: 4 });
});

test('a lone number below 15 reads as hours, not a score', () => {
  assert.deepEqual(parseEntry('7.5'), { ok: true, score: null, hours: 7.5, feel: null });
});

test('unparseable and out-of-range entries are rejected, not guessed at', () => {
  assert.equal(parseEntry('hello').ok, false);
  assert.equal(parseEntry('').ok, false);
  assert.equal(parseEntry('420').ok, false);
});

/* -------------------------------------------------------------------- stats */

test('confidence tiers step with the size of the record', () => {
  assert.equal(confidence(0), 'seeding');
  assert.equal(confidence(5), 'emerging');
  assert.equal(confidence(10), 'weekly');
  assert.equal(confidence(20), 'monthly');
  assert.equal(confidence(60), 'full');
});

test('trailing windows covering the same nights collapse to one row', () => {
  const t = trailing([70, 80, 75, 82, 78], [7, 30, 90]);
  assert.equal(t.length, 1, 'identical windows were repeated');
  assert.equal(t[0].days, 5);
});

test('percentile rank is empirical and bounded by the actual record', () => {
  const h = [60, 70, 80, 90];
  assert.equal(percentileRank(95, h), 100);
  assert.equal(percentileRank(55, h), 0);
  assert.equal(percentileRank(75, h), 50);
});

test('z-score and stdev refuse to answer without enough data', () => {
  assert.equal(stdev([80]), null);
  assert.equal(zScore(80, [80]), null);
  assert.equal(zScore(80, [80, 80, 80]), null, 'zero variance must not divide by zero');
});

/* -------------------------------------------------------------------- coach */

const history = (n) =>
  [71, 78, 83, 66, 80, 74, 88, 79, 62, 85, 77, 81, 73, 90, 68, 84, 76, 79, 71, 86, 80, 75, 82, 69, 87, 78, 83, 72, 81, 77, 85, 74, 79]
    .slice(0, n)
    .map((score, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, score }));

test('the coach claims no statistics it cannot support', () => {
  const r = buildCoachResponse({ entry: parseEntry('84'), history: history(2) });
  assert.equal(r.tier, 'seeding');
  assert.doesNotMatch(r.text, /SD from your own mean/);
  assert.doesNotMatch(r.text, /percentile/);
  assert.match(r.text, /Keep logging/);
});

test('z-score appears only once the record is a month deep', () => {
  assert.doesNotMatch(buildCoachResponse({ entry: parseEntry('84'), history: history(10) }).text, /SD from/);
  assert.match(buildCoachResponse({ entry: parseEntry('84'), history: history(20) }).text, /SD from/);
});

test('percentile appears only at the full tier', () => {
  assert.doesNotMatch(buildCoachResponse({ entry: parseEntry('84'), history: history(20) }).text, /percentile/);
  assert.match(buildCoachResponse({ entry: parseEntry('84'), history: history(33) }).text, /percentile/);
});

test('short sleep routes to the duration lever whatever the score says', () => {
  const r = buildCoachResponse({ entry: parseEntry('88 5.5'), history: history(20) });
  assert.equal(r.lever, 'duration');
});

test('a strong night routes to consolidation, not to sleeping longer', () => {
  const r = buildCoachResponse({ entry: parseEntry('92 8'), history: history(20) });
  assert.equal(r.lever, 'consolidate');
});

test('every coach response ends with one concrete move drawn from the library', async () => {
  const { loadLibraries } = await import('../src/facts.js');
  const { byId } = loadLibraries();
  for (const n of [0, 4, 12, 25, 33]) {
    const r = buildCoachResponse({ entry: parseEntry('79 7 3'), history: history(n) });
    assert.ok(r.factId, `no move offered at ${n} nights`);
    assert.ok(r.text.includes(byId.get(r.factId).move), 'the move text was altered');
  }
});

/* ---------------------------------------------------------------- rendering */

test('a delivered card carries its journal prompt verbatim', () => {
  const slot = buildDaySchedule(config, '2026-09-01').find((s) => s.id === 'work_shutdown');
  const prompt = prompts[0];
  const fact = { reframe: 'a', proof: 'b', currency: 'c', move: 'd', truth: 'e' };
  const text = renderMessage({ fact, slot, jackpot: false, prompt });
  assert.ok(text.includes(prompt.text));
});

test('the intake slot asks for data and carries no fact', () => {
  const slot = buildDaySchedule(config, '2026-09-01').find((s) => s.id === 'intake');
  const text = renderIntake({ slot, request: intakeRequest() });
  assert.match(text, /Morning Intake/);
  assert.doesNotMatch(text, /The High-Yield Reframe/);
});

test('the intake fires at a fixed time so it can become a habit', () => {
  for (const d of ['2026-09-01', '2026-09-02', '2026-11-14']) {
    const slot = buildDaySchedule(config, d).find((s) => s.id === 'intake');
    assert.equal(slot.offsetMinutes, 0, 'intake was jittered');
    assert.equal(slot.targetLabel, '6:00 AM');
  }
});

test('fact slots are still jittered', () => {
  const offsets = new Set();
  for (let d = 1; d <= 15; d++) {
    const slot = buildDaySchedule(config, `2026-09-${String(d).padStart(2, '0')}`).find((s) => s.id === 'work_shutdown');
    offsets.add(slot.offsetMinutes);
  }
  assert.ok(offsets.size > 4);
});

/* ------------------------------------------------------------- encryption */

test('a journal record round-trips through encryption', async () => {
  const { encryptLine, decryptLine } = await import('../src/crypto.js');
  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';

  const record = JSON.stringify({ text: 'When I reach for my phone, I will go get a book.', date: '2026-08-23' });
  const cipher = encryptLine(record);

  assert.notEqual(cipher, record);
  assert.doesNotMatch(cipher, /phone|book/, 'plaintext leaked into the ciphertext');
  assert.equal(decryptLine(cipher), record);
});

test('the same record encrypts differently every time', async () => {
  const { encryptLine } = await import('../src/crypto.js');
  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
  assert.notEqual(encryptLine('same input'), encryptLine('same input'), 'IV is not being randomised');
});

test('a wrong key yields nothing rather than garbage', async () => {
  const { encryptLine, decryptLine } = await import('../src/crypto.js');
  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
  const cipher = encryptLine('{"secret":true}');

  process.env.SLEEPOS_DATA_KEY = 'd3Jvbmdrd3Jvbmdrd3Jvbmdrd3Jvbmdrd3JvbmdrMTI=';
  assert.equal(decryptLine(cipher), '', 'a tampered or foreign record should be dropped');

  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
});

test('pre-encryption plaintext records stay readable', async () => {
  const { decryptLine } = await import('../src/crypto.js');
  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
  assert.equal(decryptLine('{"legacy":true}'), '{"legacy":true}');
});

test('writing without a key fails loudly instead of writing plaintext', async () => {
  const { encryptLine, MissingKeyError } = await import('../src/crypto.js');
  const saved = process.env.SLEEPOS_DATA_KEY;
  delete process.env.SLEEPOS_DATA_KEY;
  assert.throws(() => encryptLine('anything'), MissingKeyError);
  process.env.SLEEPOS_DATA_KEY = saved;
});

/* -------------------------------------------------------------- telemetry */

test('a night normalises to summary fields only, never the raw arrays', async () => {
  const { normalise } = await import('../src/telemetry.js');
  const record = normalise({
    day: '2026-08-23',
    sleep: { score: 88, contributors: { deep_sleep: 95 } },
    readiness: { score: 85, temperature_deviation: 0.11 },
    stress: { day_summary: 'normal', stress_high: 3600, recovery_high: 1800 },
    periods: [
      { type: 'long_sleep', total_sleep_duration: 27870, deep_sleep_duration: 5340, average_hrv: 37,
        lowest_heart_rate: 55, efficiency: 94, heart_rate: { items: new Array(500).fill(60) },
        movement_30_sec: '1'.repeat(1000), sleep_phase_30_sec: '4'.repeat(1000) },
    ],
  });

  assert.equal(record.sleep_score, 88);
  assert.equal(record.average_hrv, 37);
  assert.equal(record.stress_summary, 'normal');
  // The bulky per-interval series must not be carried into storage.
  assert.equal(record.heart_rate, undefined);
  assert.equal(record.movement_30_sec, undefined);
  assert.equal(record.sleep_phase_30_sec, undefined);
  assert.ok(JSON.stringify(record).length < 900, 'record is far larger than a summary should be');
});

test('the main sleep is chosen over naps', async () => {
  const { normalise } = await import('../src/telemetry.js');
  const r = normalise({
    day: '2026-08-23',
    periods: [
      { type: 'sleep', total_sleep_duration: 1800, efficiency: 50 },
      { type: 'long_sleep', total_sleep_duration: 27870, efficiency: 94 },
    ],
  });
  assert.equal(r.efficiency, 94);
});

test('a night with no sleep period still yields a record rather than throwing', async () => {
  const { normalise } = await import('../src/telemetry.js');
  const r = normalise({ day: '2026-08-23', sleep: { score: 70 } });
  assert.equal(r.date, '2026-08-23');
  assert.equal(r.sleep_score, 70);
  assert.equal(r.average_hrv, null);
});

test('percentiles read as ordinals, not "81th"', async () => {
  const { buildCoachResponse, parseEntry } = await import('../src/coach.js');
  const history = Array.from({ length: 40 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, score: 60 + i }));
  const text = buildCoachResponse({ entry: parseEntry('95'), history, useOura: false }).text;
  assert.doesNotMatch(text, /\d(1th|2th|3th)\b/, 'malformed ordinal');
  assert.match(text, /\d+(st|nd|rd|th) percentile/);
});

test('the coach falls back to the manual log when Oura has no record', async () => {
  const { buildCoachResponse, parseEntry } = await import('../src/coach.js');
  const history = Array.from({ length: 20 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, score: 75 + (i % 5) }));
  const r = buildCoachResponse({ entry: parseEntry('84'), history, date: '1999-01-01' });
  assert.ok(r.factId, 'no lever offered');
  assert.doesNotMatch(r.text, /Oura says/);
});

/* ----------------------------------------------------------- ingest gating */

test('the Oura pull waits until the configured hour, then retries until the night lands', async () => {
  const { shouldIngest } = await import('../src/dispatch.js');
  const { zonedWallTimeToDate, parseClock } = await import('../src/time.js');
  const at = (hhmm) => zonedWallTimeToDate('2026-08-24', parseClock(hhmm), config.timezone);
  const base = { config, dateString: '2026-08-24', connected: true, settled: false };

  // Too early: Oura will not have the night yet.
  for (const t of ['00:30', '06:05', '08:00', '10:59']) {
    assert.equal(shouldIngest({ ...base, now: at(t) }), false, `should not pull at ${t}`);
  }

  // From the pull hour it tries, and keeps trying on every poll.
  for (const t of ['11:00', '11:10', '14:00', '22:00']) {
    assert.equal(shouldIngest({ ...base, now: at(t) }), true, `should pull at ${t}`);
  }
});

test('once the night is on record the pull stops making requests', async () => {
  const { shouldIngest } = await import('../src/dispatch.js');
  const { zonedWallTimeToDate, parseClock } = await import('../src/time.js');
  const now = zonedWallTimeToDate('2026-08-24', parseClock('15:00'), config.timezone);

  assert.equal(shouldIngest({ config, dateString: '2026-08-24', now, connected: true, settled: false }), true);
  assert.equal(shouldIngest({ config, dateString: '2026-08-24', now, connected: true, settled: true }), false);
});

test('no Oura connection means no pull attempt at all', async () => {
  const { shouldIngest } = await import('../src/dispatch.js');
  const { zonedWallTimeToDate, parseClock } = await import('../src/time.js');
  const now = zonedWallTimeToDate('2026-08-24', parseClock('15:00'), config.timezone);
  assert.equal(shouldIngest({ config, dateString: '2026-08-24', now, connected: false, settled: false }), false);
});

test('a night carries Oura\'s own five-minute hypnogram when present', async () => {
  const { normalise } = await import('../src/telemetry.js');
  const withPhases = normalise({
    day: '2026-08-23',
    sleep: { score: 88 },
    readiness: { score: 85 },
    stress: null,
    periods: [{ type: 'long_sleep', total_sleep_duration: 27870, sleep_phase_5_min: '4221133' }],
  });
  assert.equal(withPhases.sleep_phase_5_min, '4221133');

  // Oura omits it on short or unscored periods; that must be null, not undefined,
  // so the field round-trips through JSON and the dial can detect its absence.
  const without = normalise({
    day: '2026-08-22',
    sleep: { score: 74 },
    readiness: null,
    stress: null,
    periods: [{ type: 'long_sleep', total_sleep_duration: 21000 }],
  });
  assert.equal(without.sleep_phase_5_min, null);
  assert.ok('sleep_phase_5_min' in JSON.parse(JSON.stringify(without)));
});

test('the last-night screen is built from real telemetry, never invented', async () => {
  const { buildNightData, renderNight, reconstructPhases } =
    await import('../web/build-night.js');
  const { readFileSync } = await import('node:fs');

  // 40 prior nights plus the real night of 2026-08-23.
  const prior = Array.from({ length: 40 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    sleep_score: 70 + (i % 17),
  }));
  const last = {
    date: '2026-08-23', sleep_score: 88, readiness_score: 85,
    total_sleep_duration: 27870, deep_sleep_duration: 5340, rem_sleep_duration: 7590,
    light_sleep_duration: 14940, awake_time: 1644, time_in_bed: 29514,
    efficiency: 94, latency: 150,
    bedtime_start: '2026-08-23T23:15:00-04:00', bedtime_end: '2026-08-24T07:26:00-04:00',
    sleep_phase_5_min: '1'.repeat(18) + '2'.repeat(50) + '3'.repeat(25) + '4'.repeat(5),
  };

  const d = buildNightData([...prior, last], 'America/Detroit');

  assert.equal(d.score, 88);
  assert.equal(d.n, 40);
  // The sentence must be literally true: a count, not a percentile rounded back.
  assert.equal(d.betterThan, prior.filter((p) => p.sleep_score < 88).length);
  assert.equal(d.asleep, '7h 45m');          // never rounded to 8h
  assert.equal(d.deep, '1:29');
  assert.equal(d.latency, '2m 30s');
  assert.equal(d.bedtime, '23:15');
  assert.equal(d.wake, '07:26');
  assert.equal(d.phasesSource, 'oura');

  // A night from before the field was captured is labelled, not silently faked.
  const older = buildNightData([...prior, { ...last, sleep_phase_5_min: null }], 'America/Detroit');
  assert.equal(older.phasesSource, 'reconstructed');
  assert.ok(older.phases.length > 80);
  assert.ok(/^[1234]+$/.test(older.phases));

  // Reconstruction keeps the published stage proportions.
  const p = reconstructPhases(last);
  const share = (c) => p.split('').filter((x) => x === c).length / p.length;
  assert.ok(Math.abs(share('1') - 5340 / 29514) < 0.06, 'deep share off');
  assert.ok(Math.abs(share('3') - 7590 / 29514) < 0.06, 'REM share off');

  // The rendered screen carries the data and stays a single self-contained file.
  const html = renderNight(readFileSync('variants/composite/index.html', 'utf8'), d);
  assert.ok(html.includes('"score": 88'));
  assert.ok(html.includes('"betterThan"'));
  assert.equal(html.split('<script id="night"').length, 2, 'exactly one data block');
});

test('a baseline too thin to be meaningful is refused', async () => {
  const { buildNightData } = await import('../web/build-night.js');
  const thin = Array.from({ length: 10 }, (_, i) => ({ date: `2026-08-0${i}`, sleep_score: 80 }));
  assert.throws(() => buildNightData([...thin, { date: '2026-08-23', sleep_score: 88 }],
    'America/Detroit'), /need 30/);
});

/* ------------------------------------------------------- Phase 6: habits */

test('habit anchors do not jitter, because a cue at 7:52 is not a 7:30 habit', () => {
  const config = loadConfig();
  const habitSlots = config.slots.filter((s) => s.type === 'habit');
  assert.equal(habitSlots.length, 2, 'expected morning_light and blue_blockers');

  // Across a month, every habit slot must land exactly on its anchor while the
  // fact slots move around. That contrast is the whole scheduling argument.
  let factMoved = false;
  for (let d = 1; d <= 28; d++) {
    const schedule = buildDaySchedule(config, `2026-09-${String(d).padStart(2, '0')}`);
    for (const s of schedule) {
      if (s.type === 'habit') assert.equal(s.offsetMinutes, 0, `${s.id} jittered on day ${d}`);
      if (s.type === 'fact' && s.offsetMinutes !== 0) factMoved = true;
    }
  }
  assert.ok(factMoved, 'fact slots should still jitter');
});

test('the glasses cue owns the evening light window', () => {
  const config = loadConfig();
  const at = (id) => config.slots.find((s) => s.id === id).anchor;
  // Both messages are about light; thirty minutes apart they would collide.
  const gap = Number(at('blue_blockers').slice(0, 2)) - Number(at('evening_winddown').slice(0, 2));
  assert.ok(gap >= 1, `wind-down ${at('evening_winddown')} too close to ${at('blue_blockers')}`);
});

test('a habit rotates every reason before repeating any', async () => {
  const { loadHabits, selectRationale } = await import('../src/habits.js');
  const habits = loadHabits();

  for (const [habitId, habit] of Object.entries(habits)) {
    assert.ok(habit.why.length >= 20, `${habitId} needs 20+ reasons, has ${habit.why.length}`);

    const state = {};
    const seen = [];
    for (let d = 0; d < habit.why.length; d++) {
      const pick = selectRationale({ habit, habitId, state, dateString: `2026-09-${d + 1}` });
      state.habitRotation = { ...state.habitRotation, [habitId]: { cycle: pick.cycle, remaining: pick.remaining } };
      seen.push(pick.why.id);
    }
    assert.equal(new Set(seen).size, habit.why.length, `${habitId} repeated inside one cycle`);
  }
});

test('the two habits rotate independently', async () => {
  const { loadHabits, selectRationale } = await import('../src/habits.js');
  const habits = loadHabits();
  const state = {};

  selectRationale({ habit: habits.morning_light, habitId: 'morning_light', state, dateString: '2026-09-01' });
  const before = state.habitRotation;
  // Advancing one habit must not consume the other's pool.
  const a = selectRationale({ habit: habits.blue_blockers, habitId: 'blue_blockers', state, dateString: '2026-09-01' });
  assert.ok(a.why.id.startsWith('bb'), 'blue_blockers drew from the wrong pool');
  assert.equal(before, state.habitRotation, 'selectRationale must not mutate rotation state itself');
});

test('the habit message leads with the cue, so it works from a lock screen', async () => {
  const { loadHabits, selectRationale } = await import('../src/habits.js');
  const { renderHabit } = await import('../src/render.js');
  const habits = loadHabits();
  const habit = habits.blue_blockers;
  const pick = selectRationale({ habit, habitId: 'blue_blockers', state: {}, dateString: '2026-08-24' });

  const slot = { name: '08: Blue Blockers', targetLabel: '7:30 PM' };
  const text = renderHabit({ habit, slot, why: pick.why, showOptional: false });

  assert.equal(text.split('\n')[0], habit.cue, 'first line must be the cue');
  assert.ok(!text.includes('*') && !text.includes('_'), 'no markdown, per the locked format');
  assert.ok(text.includes(pick.why.why));
});

test('the optional line is deterministic for a date and off for habits without one', async () => {
  const { loadHabits, selectRationale } = await import('../src/habits.js');
  const habits = loadHabits();

  const a = selectRationale({ habit: habits.morning_light, habitId: 'morning_light', state: {}, dateString: '2026-08-24' });
  const b = selectRationale({ habit: habits.morning_light, habitId: 'morning_light', state: {}, dateString: '2026-08-24' });
  assert.equal(a.showOptional, b.showOptional, 're-running the same day must not re-roll');

  const bb = selectRationale({ habit: habits.blue_blockers, habitId: 'blue_blockers', state: {}, dateString: '2026-08-24' });
  assert.equal(bb.showOptional, false, 'blue_blockers has no optional line');

  // Over a month it should appear sometimes and not always.
  let shown = 0;
  for (let d = 1; d <= 30; d++) {
    const r = selectRationale({ habit: habits.morning_light, habitId: 'morning_light', state: {}, dateString: `2026-09-${d}` });
    if (r.showOptional) shown++;
  }
  assert.ok(shown > 2 && shown < 22, `optional line appeared ${shown}/30 times`);
});

/* -------------------------------------------------- Phase 7: affirmations */

test('every mechanism in the prompt library has something to say back', async () => {
  const { loadAffirmations } = await import('../src/affirm.js');
  const lib = loadAffirmations();
  const prompts = loadPrompts();
  const list = Array.isArray(prompts) ? prompts : (prompts.prompts ?? Object.values(prompts).flat());
  const mechanisms = [...new Set(list.map((p) => p.mechanism).filter(Boolean))];

  assert.ok(mechanisms.length >= 10);
  for (const m of mechanisms) {
    assert.ok(lib.mechanism[m]?.length, `no affirmation for mechanism ${m}`);
  }
});

test('no journal entry is ever met with silence', async () => {
  const { buildAffirmation, loadAffirmations } = await import('../src/affirm.js');
  const lib = loadAffirmations();

  const inputs = ['', '   ', 'ok', 'no', '.', 'A properly considered entry about last night.',
    'x'.repeat(600), '🙂', '84 7.5 4 but as prose'];
  for (const text of inputs) {
    for (const mech of [null, 'identity', 'not_a_real_mechanism']) {
      const r = buildAffirmation({ text, mechanism: mech, streak: 0, state: {}, dateString: '2026-08-24', library: lib });
      assert.ok(r.text && r.text.trim().length > 0, `silent on ${JSON.stringify(text)} / ${mech}`);
    }
  }
});

test('a two-word entry is answered warmly but not effusively', async () => {
  const { buildAffirmation, loadAffirmations, isShortEntry } = await import('../src/affirm.js');
  const lib = loadAffirmations();
  assert.ok(isShortEntry('slept ok'));
  assert.ok(!isShortEntry('I moved my shutdown earlier and it made the whole evening calmer.'));

  // Even with a rich mechanism available, a throwaway entry gets the short
  // shape -- rewarding it fully would teach that throwaway entries pay.
  const r = buildAffirmation({ text: 'slept ok', mechanism: 'mental_contrasting', streak: 9,
    state: {}, dateString: '2026-08-24', library: lib });
  assert.equal(r.shape, 'short');
  assert.ok(lib.short.some((line) => r.text.startsWith(line)), 'should open with a short line');
  assert.ok(!Object.values(lib.mechanism).flat().some((line) => r.text.includes(line)),
    'a throwaway entry must not draw the full mechanism reply');
  // A streak may still ride along: it rewards showing up, which is exactly what
  // a two-word entry did. That is evidence, not effusive praise.
});

test('affirmations do not repeat while others are unseen', async () => {
  const { buildAffirmation, loadAffirmations } = await import('../src/affirm.js');
  const lib = loadAffirmations();
  const state = {};
  const seen = [];
  const long = 'A considered entry about how the evening actually went and what I would change.';
  for (let i = 0; i < lib.identity.length; i++) {
    seen.push(buildAffirmation({ text: long, mechanism: null, streak: 0, state,
      dateString: `2026-09-${i + 1}`, library: lib }).text);
  }
  assert.equal(new Set(seen).size, lib.identity.length, 'identity pool repeated early');
});

test('a milestone outranks everything and a thin streak is not named', async () => {
  const { buildAffirmation, loadAffirmations } = await import('../src/affirm.js');
  const lib = loadAffirmations();
  const long = 'A considered entry about how the evening actually went and what I would change.';

  const m = buildAffirmation({ text: long, mechanism: 'anchoring', streak: 7, state: {},
    dateString: '2026-08-24', library: lib });
  assert.equal(m.shape, 'milestone');
  assert.equal(m.text, lib.milestone['7']);

  // Streaks of 1 or 2 are not worth announcing and must never appear.
  for (let s = 0; s <= 2; s++) {
    for (let d = 1; d <= 28; d++) {
      const r = buildAffirmation({ text: long, mechanism: 'anchoring', streak: s, state: {},
        dateString: `2026-09-${d}`, library: lib });
      assert.equal(r.streakShown, false, `streak ${s} announced on day ${d}`);
    }
  }
});

test('the streak line is occasional, not constant', async () => {
  const { buildAffirmation, loadAffirmations } = await import('../src/affirm.js');
  const lib = loadAffirmations();
  const long = 'A considered entry about how the evening actually went and what I would change.';
  let shown = 0;
  for (let d = 1; d <= 60; d++) {
    const r = buildAffirmation({ text: long, mechanism: 'anchoring', streak: 5, state: {},
      dateString: `2026-10-${d}`, library: lib });
    if (r.streakShown) shown++;
  }
  // Constant-magnitude reward flattens into noise; never showing wastes the
  // strongest line available. Both extremes are failures.
  assert.ok(shown > 3 && shown < 40, `streak line appeared ${shown}/60 times`);
});

test('a streak must reach today, and a gap breaks it', async () => {
  const { journalStreak } = await import('../src/journal.js');
  const e = (date) => ({ date });
  assert.equal(journalStreak([e('2026-08-22'), e('2026-08-23'), e('2026-08-24')], '2026-08-24'), 3);
  assert.equal(journalStreak([e('2026-08-20'), e('2026-08-22'), e('2026-08-24')], '2026-08-24'), 1);
  assert.equal(journalStreak([e('2026-08-22'), e('2026-08-23')], '2026-08-24'), 0, 'must reach today');
  assert.equal(journalStreak([e('2026-08-23'), e('2026-08-23'), e('2026-08-24')], '2026-08-24'), 2, 'two entries in a day are one day');
  assert.equal(journalStreak([e('2026-07-31'), e('2026-08-01')], '2026-08-01'), 2, 'must cross a month boundary');
  assert.equal(journalStreak([], '2026-08-24'), 0);
});

/* ----------------------------------------- regressions from the bug sweep */

// These two exercise the real write path, so they must run against a scratch
// state directory. Pointing them at state/ appends fabricated entries to the
// real journal and inflates the streak.
const SCRATCH = mkdtempSync(join(tmpdir(), 'sleep-os-test-'));
process.env.SLEEPOS_STATE_DIR = SCRATCH;

test('a failed affirmation does not cause the journal entry to be written twice', async () => {
  const { processInbox } = await import('../src/inbox.js');
  const { readJournal } = await import('../src/journal.js');

  const before = readJournal().length;
  const config = loadConfig();
  const state = { inboxOffset: 0, pending: [] };

  const update = {
    update_id: 990001,
    message: { message_id: 1, chat: { id: 42 }, text: 'A real reflection about how the evening went and what I would change tomorrow.' },
  };

  // Telegram accepts nothing. The entry must still be recorded exactly once,
  // and the update must still be acknowledged -- otherwise the next poll
  // rewrites the same entry, forever, on any persistent failure.
  const failing = async () => { throw new Error('400 Bad Request'); };
  const res = await processInbox({
    config, state, token: 'x', chatId: '42', now: new Date(),
    log: () => {}, send: failing, fetchUpdates: async () => [update],
  });

  const after = readJournal();
  assert.equal(after.length, before + 1, 'entry should be written exactly once');
  assert.equal(state.inboxOffset, update.update_id + 1, 'update must be acknowledged despite the send failing');
  assert.ok(res.handled.find((h) => h.type === 'journal')?.affirmed?.startsWith('FAILED'),
    'the failure should be recorded, not swallowed silently');

  // And a second poll of the same update must not re-add it.
  const res2 = await processInbox({
    config, state, token: 'x', chatId: '42', now: new Date(),
    log: () => {}, send: failing, fetchUpdates: async () => [],
  });
  assert.equal(readJournal().length, before + 1, 'no duplicate on the next poll');
  assert.equal(res2.count, 0);
});

test('a journal entry gets exactly one reply when Telegram is healthy', async () => {
  const { processInbox } = await import('../src/inbox.js');
  const config = loadConfig();
  const state = { inboxOffset: 0, pending: [] };
  const sends = [];
  const send = async (_t, _c, text) => { sends.push(text); return { message_id: sends.length }; };

  await processInbox({
    config, state, token: 'x', chatId: '42', now: new Date(), log: () => {}, send,
    fetchUpdates: async () => [{
      update_id: 990002,
      message: { message_id: 2, chat: { id: 42 }, text: 'Another considered entry about the wind-down and what actually helped.' },
    }],
  });

  assert.equal(sends.length, 1, 'exactly one reply, never zero and never two');
  assert.ok(sends[0].trim().length > 0);
});

test('only fact slots draw from the fact library', async () => {
  const { loadHabits } = await import('../src/habits.js');
  const config = loadConfig();
  const habits = loadHabits();

  for (const slot of config.slots) {
    assert.ok(['fact', 'intake', 'habit'].includes(slot.type), `slot ${slot.id} has type ${slot.type}`);
    if (slot.type === 'habit') {
      // A typo here would throw at send time, in production, at 7:15am.
      assert.ok(habits[slot.habit], `slot ${slot.id} names unknown habit ${slot.habit}`);
    }
  }
});

test('slot display numbers match delivery order', () => {
  const config = loadConfig();
  const byTime = [...config.slots].sort((a, b) => a.anchor.localeCompare(b.anchor));
  byTime.forEach((slot, i) => {
    const shown = Number(slot.name.slice(0, 2));
    assert.equal(shown, i, `${slot.name} fires ${i + 1}th at ${slot.anchor}`);
  });
});
