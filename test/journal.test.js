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

  // Driven by the configured hour rather than a literal, so lowering it is a
  // config decision and not a test rewrite. It was 11, which cost three hours of
  // latency: the morning message went out around 08:00 and the deck waited for a
  // pull that had not been attempted yet.
  const hour = config.ouraPullFromHour ?? 11;
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;

  // Before the hour, no pull.
  for (const h of [0, Math.max(0, hour - 2), hour - 1]) {
    if (h < 0 || h >= hour) continue;
    assert.equal(shouldIngest({ ...base, now: at(hh(h)) }), false, `should not pull at ${hh(h)}`);
  }
  assert.equal(shouldIngest({ ...base, now: at(`${String(hour - 1).padStart(2, '0')}:59`) }), false);

  // From the hour it tries, and keeps trying every cycle until the night lands.
  for (const h of [hour, hour + 1, 14, 22].filter((h) => h >= hour && h <= 23)) {
    assert.equal(shouldIngest({ ...base, now: at(hh(h)) }), true, `should pull at ${hh(h)}`);
  }

  // A settled night stops the retrying, whatever the hour. Without this the pull
  // would keep going out all day for a night already on record.
  assert.equal(shouldIngest({ ...base, settled: true, now: at(hh(hour + 1)) }), false);
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

/* -------------------------------------------------- L1: the listen window */

test('the listen window long-polls until its deadline and stops', async () => {
  const { listen } = await import('../src/listen.js');
  const config = loadConfig();
  const state = { inboxOffset: 0, pending: [] };

  // Virtual clock: each poll consumes its full timeout, so the window should
  // close after a predictable number of polls rather than spinning.
  let t = 0;
  const timeouts = [];
  const fetchUpdates = async (_tok, _off, opts) => {
    timeouts.push(opts.timeout);
    t += opts.timeout * 1000;
    return [];
  };

  const res = await listen({
    config, state, token: 'x', chatId: '42', seconds: 100,
    now: () => t, log: () => {}, persist: false,
    fetchUpdates, send: async () => ({ message_id: 1 }),
  });

  assert.equal(res.handled, 0);
  assert.ok(res.batches >= 2 && res.batches <= 4, `expected a few polls, got ${res.batches}`);
  assert.ok(timeouts.every((x) => x > 0), 'every poll must actually be a long poll');
  assert.ok(timeouts.every((x) => x <= 45), 'must stay under Telegram\'s 50s cap');
  // The last poll must not run past the deadline.
  assert.ok(timeouts.reduce((a, b) => a + b, 0) <= 100, 'polls overran the window');
});

test('a poll failure does not end the listen window', async () => {
  const { listen } = await import('../src/listen.js');
  const config = loadConfig();
  let t = 0;
  let calls = 0;
  const fetchUpdates = async (_tok, _off, opts) => {
    calls += 1;
    t += opts.timeout * 1000;
    if (calls === 1) throw new Error('network blip');
    return [];
  };

  const res = await listen({
    config, state: { inboxOffset: 0 }, token: 'x', chatId: '42', seconds: 90,
    now: () => t, log: () => {}, persist: false,
    fetchUpdates, send: async () => ({ message_id: 1 }),
  });

  assert.ok(calls > 1, 'should have kept polling after the failure');
  assert.ok(res.batches >= 1);
});

test('a message arriving mid-window is answered inside it', async () => {
  const { listen } = await import('../src/listen.js');
  const config = loadConfig();
  const state = { inboxOffset: 0, pending: [] };
  const sends = [];
  let t = 0;
  let polls = 0;

  const fetchUpdates = async (_tok, _off, opts) => {
    polls += 1;
    t += opts.timeout * 1000;
    if (polls === 2) {
      return [{ update_id: 991001, message: { message_id: 5, chat: { id: 42 },
        text: 'A considered entry written in the middle of the listening window.' } }];
    }
    return [];
  };

  const res = await listen({
    config, state, token: 'x', chatId: '42', seconds: 150,
    now: () => t, log: () => {}, persist: false,
    fetchUpdates, send: async (_t, _c, text) => { sends.push(text); return { message_id: sends.length }; },
  });

  assert.equal(res.handled, 1);
  assert.equal(sends.length, 1, 'the entry should have been answered');
  assert.equal(state.inboxOffset, 991002, 'offset must advance so it is not answered twice');
});

/* --------------------------------------------------------------- MSRI */

test('the EWMA is seeded with the first observation, not zero', async () => {
  const { ewma } = await import('../src/msri.js');
  assert.deepEqual(ewma([], 0.25), []);
  assert.deepEqual(ewma([80], 0.25), [80]);

  // Seeded at zero the first terms climb out of a hole that was never measured.
  const flat = ewma([80, 80, 80, 80], 0.25);
  assert.ok(flat.every((v) => Math.abs(v - 80) < 1e-9), 'a flat series must stay flat from term one');

  // A step change is approached, never overshot.
  const step = ewma([50, 100, 100, 100, 100], 0.5);
  assert.equal(step[0], 50);
  assert.ok(step.every((v, i) => i === 0 || v > step[i - 1]), 'must rise monotonically toward the step');
  assert.ok(step[step.length - 1] < 100, 'must approach, never reach or overshoot');
});

test('baselines come from Seth\'s own history, not population figures', async () => {
  const { baselineFrom } = await import('../src/msri.js');
  const recs = [
    { average_hrv: 30, lowest_heart_rate: 50 },
    { average_hrv: 40, lowest_heart_rate: 60 },
    { average_hrv: null, lowest_heart_rate: 55 },
  ];
  const b = baselineFrom(recs);
  assert.equal(b.hrv, 35);
  assert.equal(b.rhr, 55);
  assert.equal(b.n, 2, 'coverage is the smaller of the two, not the row count');
});

test('a night missing inputs scores null rather than a partial index', async () => {
  const { nightIndex } = await import('../src/msri.js');
  const baseline = { hrv: 37, rhr: 55 };
  const full = {
    total_sleep_duration: 27870, deep_sleep_duration: 5340, rem_sleep_duration: 7590,
    efficiency: 94, average_hrv: 37, lowest_heart_rate: 55,
  };
  assert.ok(nightIndex(full, baseline) > 0);

  // An index built from half its factors is a different number wearing the
  // same name, so it must refuse rather than degrade.
  for (const drop of ['average_hrv', 'lowest_heart_rate', 'efficiency',
                      'deep_sleep_duration', 'rem_sleep_duration', 'total_sleep_duration']) {
    assert.equal(nightIndex({ ...full, [drop]: null }, baseline), null, `should refuse without ${drop}`);
  }
  assert.equal(nightIndex(full, { hrv: null, rhr: 55 }), null, 'should refuse without a baseline');
  assert.equal(nightIndex(null, baseline), null);
});

test('no single factor can run the index away', async () => {
  const { nightIndex } = await import('../src/msri.js');
  const baseline = { hrv: 37, rhr: 55 };
  const base = {
    total_sleep_duration: 28800, deep_sleep_duration: 5400, rem_sleep_duration: 7500,
    efficiency: 95, average_hrv: 37, lowest_heart_rate: 55,
  };

  // An absurd HRV must not push the index past its ceiling. Unbounded factors
  // were the original defect: one strong signal pinned the number near 100 and
  // it stopped discriminating.
  const absurd = nightIndex({ ...base, average_hrv: 4000 }, baseline);
  const sane = nightIndex(base, baseline);
  assert.ok(absurd > sane, 'a better night should still score higher');
  assert.ok(absurd <= 100, `index must be bounded at 100, ran to ${absurd}`);

  // Twelve hours in bed cannot buy more than the duration weight allows.
  const marathon = nightIndex({ ...base, total_sleep_duration: 12 * 3600 }, baseline);
  assert.ok(marathon <= 100);

  // 100 means every factor hit its cap simultaneously, which should be rare.
  const perfect = nightIndex({ total_sleep_duration: 9 * 3600, deep_sleep_duration: 9000,
    rem_sleep_duration: 9000, efficiency: 100, average_hrv: 9999, lowest_heart_rate: 40 }, baseline);
  assert.ok(Math.abs(perfect - 100) < 0.01, `all caps hit should be exactly 100, got ${perfect}`);
});

test('the index refuses to report until it has enough nights', async () => {
  const { msri } = await import('../src/msri.js');
  const night = (date, hrv) => ({
    date, total_sleep_duration: 27000, deep_sleep_duration: 5200, rem_sleep_duration: 7400,
    efficiency: 92, average_hrv: hrv, lowest_heart_rate: 55,
  });

  const thin = msri([night('2026-08-01', 37), night('2026-08-02', 38)]);
  assert.equal(thin.value, null);
  assert.match(thin.reason, /need 14/);

  const enough = Array.from({ length: 20 }, (_, i) =>
    night(`2026-08-${String(i + 1).padStart(2, '0')}`, 36 + (i % 4)));
  const r = msri(enough);
  assert.ok(typeof r.value === 'number' && r.value > 0);
  assert.equal(r.coverage, 20);
  assert.equal(r.series.length, 20);
  assert.equal(r.alpha, 2 / 8, 'alpha derived from the window, not hardcoded');

  // Smoothing must actually smooth: the filtered series varies less than the raw.
  const spread = (xs) => Math.max(...xs) - Math.min(...xs);
  assert.ok(spread(r.series.map((s) => s.smoothed)) < spread(r.series.map((s) => s.raw)),
    'the filtered series should be calmer than the raw one');

  // Nights without biometrics are excluded from coverage, not silently scored.
  const withGaps = msri([...enough, { date: '2026-09-01', sleep_score: 88 }]);
  assert.equal(withGaps.coverage, 20);
  assert.equal(withGaps.total, 21);
});

test('logging a night also cues the morning light, once', async () => {
  const { processInbox } = await import('../src/inbox.js');
  const config = loadConfig();
  const day = '2026-09-15';
  // A bare score is only read as a sleep log while today's intake is open, so
  // the intake has to have gone out.
  const state = { inboxOffset: 0, pending: [], sends: { [day]: { intake: { status: 'sent' } } } };
  const sends = [];
  const send = async (_t, _c, text) => { sends.push(text); return { message_id: sends.length }; };

  const post = (id, text) => ({ update_id: id, message: { message_id: id, chat: { id: 42 }, text } });

  await processInbox({
    config, state, token: 'x', chatId: '42',
    now: new Date(`${day}T11:30:00Z`), log: () => {}, send,
    fetchUpdates: async () => [post(991001, '88 7.75 4')],
  });

  // Two messages: the coach response, then the morning-light cue.
  assert.equal(sends.length, 2, `expected coach + cue, got ${sends.length}`);
  const cue = sends[1];
  assert.ok(cue.startsWith('Outside. Eyes up. Now.'), 'the cue must lead with the cue line');
  assert.ok(cue.includes('on waking'), 'should be labelled as triggered by waking, not a clock time');
  assert.ok(state.sends[day].morning_light, 'must be recorded so the 08:15 anchor does not repeat it');
  assert.equal(state.sends[day].morning_light.trigger, 'intake-reply');

  // A second log the same day must not send it again.
  await processInbox({
    config, state, token: 'x', chatId: '42',
    now: new Date(`${day}T12:00:00Z`), log: () => {}, send,
    fetchUpdates: async () => [post(991002, '88 7.75 4')],
  });
  assert.equal(sends.length, 3, 'second log should send only the coach reply, not another cue');
});

test('the anchor is a backstop after waking, inside the useful light window', () => {
  const config = loadConfig();
  const light = config.slots.find((s) => s.id === 'morning_light');
  const wake = config.wakeTime;
  assert.ok(wake, 'config must state the wake time rather than leaving it to a comment');

  // Read from config, not carried as a literal. The previous version hardcoded
  // 07:26 in a comment and an assertion; when the real wake time turned out to be
  // 06:30 the test was still enforcing a backstop built for the wrong morning.
  //
  // Two bounds, both of which matter. Before waking, the anchor beats the intake
  // reply every day and the reply path is dead code. Too long after, the cue
  // misses the window where morning light does anything -- the slot's own
  // objective is "outdoor light within an hour of waking".
  assert.ok(light.anchor > wake, `anchor ${light.anchor} fires before he wakes at ${wake}`);
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const after = mins(light.anchor) - mins(wake);
  assert.ok(after <= 60,
    `anchor is ${after} min after waking; the light window is about an hour`);
  assert.equal(light.jitter, false);
});

test('a failed morning-light cue never breaks the intake reply', async () => {
  const { cueMorningLight } = await import('../src/inbox.js');
  const state = { sends: {} };
  const ok = await cueMorningLight({
    token: 'x', chatId: '42', state, dateString: '2026-09-16', log: () => {},
    send: async () => { throw new Error('Telegram down'); },
  });
  assert.equal(ok, false);
  assert.ok(!state.sends['2026-09-16']?.morning_light, 'a failed send must not be recorded as sent');
});

test('the morning reply carries a link to the screens when one is configured', () => {
  const history = [72, 80, 75, 84, 78, 81, 79].map((score, i) => ({
    date: `2026-08-${String(10 + i).padStart(2, '0')}`, score, hours: 7.5, feel: 4,
  }));
  const url = 'https://example.test/deck';
  const withLink = buildCoachResponse({
    entry: { ok: true, score: 88, hours: 7.75, feel: 4 },
    history, date: '2026-08-23', useOura: false, screensUrl: url,
  });
  assert.ok(withLink.text.includes(url), 'configured URL should appear in the reply');
  assert.ok(withLink.text.includes('See the whole night'), 'link should be labelled');

  // No URL configured must mean no line at all, never a dangling label.
  const without = buildCoachResponse({
    entry: { ok: true, score: 88, hours: 7.75, feel: 4 },
    history, date: '2026-08-23', useOura: false, screensUrl: '',
  });
  assert.ok(!without.text.includes('See the whole night'), 'empty URL should omit the line');
});

/* ------------------------------------- unreadable logs must not read as empty */

// The failure this guards against: SLEEPOS_DATA_KEY missing or rotated made
// read() return [] , which is indistinguishable from "you have never logged
// anything". The coach would then compare tonight against an empty past, and
// appends would keep succeeding under the new key, splitting the log in two.

test('looksEncrypted tells ciphertext apart from plaintext and junk', async () => {
  const { looksEncrypted, encryptLine } = await import('../src/crypto.js');
  const saved = process.env.SLEEPOS_DATA_KEY;
  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
  const cipher = encryptLine(JSON.stringify({ date: '2026-08-23', score: 88 }));
  process.env.SLEEPOS_DATA_KEY = saved;

  assert.equal(looksEncrypted(cipher), true, 'real ciphertext');
  assert.equal(looksEncrypted('{"date":"2026-08-23"}'), false, 'legacy plaintext record');
  assert.equal(looksEncrypted(''), false, 'blank line');
  assert.equal(looksEncrypted('   '), false, 'whitespace');
  assert.equal(looksEncrypted('short'), false, 'too short to be a record');
});

test('a log that will not decode reports unreadable rather than empty', async () => {
  const { mkdtempSync: mk, writeFileSync: wf } = await import('node:fs');
  const dir = mk(join(tmpdir(), 'sleep-os-blind-'));
  const savedDir = process.env.SLEEPOS_STATE_DIR;
  const savedKey = process.env.SLEEPOS_DATA_KEY;

  // Write three real records under one key.
  process.env.SLEEPOS_STATE_DIR = dir;
  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';
  const { encryptLine } = await import('../src/crypto.js');
  const rows = [1, 2, 3].map((i) =>
    encryptLine(JSON.stringify({ date: `2026-08-0${i}`, score: 80 + i })));
  wf(join(dir, 'sleeplog.ndjson'), rows.join('\n') + '\n');

  // journal.js caches its directory at import time, so load a fresh copy.
  const fresh = await import(`../src/journal.js?blind=${Date.now()}`);

  const good = fresh.logHealth();
  assert.equal(good.ok, true, 'correct key: log is healthy');
  assert.equal(good.unreadable, 0);
  assert.equal(fresh.readSleepLog().length, 3, 'correct key: all three readable');

  // Now the wrong key. Records still exist; none of them decode.
  process.env.SLEEPOS_DATA_KEY = 'd3Jvbmdrd3Jvbmdrd3Jvbmdrd3Jvbmdrd3JvbmdrMTI=';
  const wrong = fresh.logHealth();
  assert.equal(wrong.ok, false, 'wrong key must not report healthy');
  assert.equal(wrong.unreadable, 3, 'all three counted as unreadable');
  assert.equal(wrong.totallyBlind, true, 'records exist and none decoded');
  assert.equal(wrong.keyPresent, true, 'a key IS set, it is just the wrong one');

  // And with no key at all.
  delete process.env.SLEEPOS_DATA_KEY;
  const none = fresh.logHealth();
  assert.equal(none.ok, false, 'no key must not report healthy');
  assert.equal(none.unreadable, 3);
  assert.equal(none.keyPresent, false);

  process.env.SLEEPOS_STATE_DIR = savedDir;
  process.env.SLEEPOS_DATA_KEY = savedKey;
});

test('the blind-log message names the actual fault', async () => {
  const { blindLogMessage } = await import('../src/inbox.js');

  const wrongKey = blindLogMessage({ unreadable: 3, keyPresent: true, totallyBlind: true });
  assert.match(wrongKey, /wrong key/i, 'a set-but-wrong key is called out as wrong');
  assert.match(wrongKey, /split your log/i, 'warns that writing would split the log');

  const noKey = blindLogMessage({ unreadable: 3, keyPresent: false, totallyBlind: true });
  assert.match(noKey, /not set/i, 'an absent key is called out as absent');
  assert.match(noKey, /encrypted, not lost/i, 'reassures the data still exists');

  const partial = blindLogMessage({ unreadable: 1, keyPresent: true, totallyBlind: false });
  assert.match(partial, /partial key change/i, 'a partial failure is described as partial');
});

/* ------------------------------------------------ telegram message chunking */

test('long messages are split on natural boundaries, not mid-sentence', async () => {
  const { chunkText, TELEGRAM_TEXT_LIMIT } = await import('../src/telegram.js');

  assert.deepEqual(chunkText('short'), ['short'], 'short text passes through untouched');
  assert.equal(TELEGRAM_TEXT_LIMIT, 4096);

  const para = 'Sentence one about the night.\n\nSentence two about the night.\n\n';
  const long = para.repeat(200);
  const parts = chunkText(long);
  assert.ok(parts.length > 1, 'oversized text is split');
  for (const p of parts) {
    assert.ok(p.length <= TELEGRAM_TEXT_LIMIT, `each chunk within the limit, got ${p.length}`);
  }
  // Nothing may be lost: rejoining recovers every word.
  assert.equal(parts.join(' ').split(/\s+/).filter(Boolean).length,
               long.split(/\s+/).filter(Boolean).length, 'no words dropped');

  // A single unbroken run has no boundary to break on and must still be chunked.
  const unbroken = 'x'.repeat(10000);
  const hard = chunkText(unbroken);
  assert.ok(hard.every((p) => p.length <= TELEGRAM_TEXT_LIMIT), 'hard split respects the limit');
  assert.equal(hard.join('').length, unbroken.length, 'hard split loses nothing');
});

test('one corrupt legacy record must not block future sleep entries', async () => {
  const { mkdtempSync: mk, writeFileSync: wf, readFileSync: rf } = await import('node:fs');
  const dir = mk(join(tmpdir(), 'sleep-os-partial-'));
  const savedDir = process.env.SLEEPOS_STATE_DIR;
  const savedKey = process.env.SLEEPOS_DATA_KEY;
  process.env.SLEEPOS_STATE_DIR = dir;
  process.env.SLEEPOS_DATA_KEY = 'dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleTEyMzQ=';

  const { encryptLine } = await import('../src/crypto.js');
  // Two good records plus one that will never authenticate.
  const good = [1, 2].map((i) => encryptLine(JSON.stringify({ date: `2026-08-0${i}`, score: 80 + i })));
  const corrupt = Buffer.from('this is not a valid record at all, but it is long enough').toString('base64');
  wf(join(dir, 'sleeplog.ndjson'), [...good, corrupt].join('\n') + '\n');

  const fresh = await import(`../src/journal.js?partial=${Date.now()}`);
  const health = fresh.logHealth();

  assert.equal(health.ok, false, 'partial damage is still reported as not-ok');
  assert.equal(health.unreadable, 1, 'exactly the one corrupt record is counted');
  assert.equal(health.totallyBlind, false,
    'partial damage is NOT totally blind - good records decoded');

  // This is the property that matters: writing must still be allowed.
  assert.doesNotThrow(() => fresh.addSleepEntry({ date: '2026-08-03', score: 88 }),
    'a single corrupt legacy line must never block logging');
  assert.equal(fresh.readSleepLog().length, 3, 'the new entry joined the two readable ones');

  process.env.SLEEPOS_STATE_DIR = savedDir;
  process.env.SLEEPOS_DATA_KEY = savedKey;
});

/* --------------------------- tests must never write to real state, ever */

// This has now bitten twice. journal.js was made overridable after a test
// appended fabricated entries to the real journal; state.js was not, so a test
// that recorded a send later planted two 2026-09-15 rows in the real
// history.ndjson. That file is not cosmetic -- state.sends is what stops a slot
// double-sending -- so a stray future-dated row can suppress a real send.
test('state.js writes under SLEEPOS_STATE_DIR, never into the real state dir', async () => {
  const { mkdtempSync: mk, existsSync: ex, readFileSync: rf } = await import('node:fs');
  const { join: j } = await import('node:path');
  const dir = mk(j(tmpdir(), 'sleep-os-state-'));
  const saved = process.env.SLEEPOS_STATE_DIR;
  process.env.SLEEPOS_STATE_DIR = dir;

  const st = await import(`../src/state.js?isolated=${Date.now()}`);
  const state = st.loadState();
  st.recordSend(state, '2099-01-01', 'terminal_bedtime',
    { status: 'sent', at: new Date().toISOString() });

  assert.ok(ex(j(dir, 'history.ndjson')), 'the send was recorded in the scratch dir');
  assert.match(rf(j(dir, 'history.ndjson'), 'utf8'), /2099-01-01/,
    'the scratch history holds the record');

  // The real files must be untouched by anything above.
  const realHistory = rf(j(process.cwd(), 'state', 'history.ndjson'), 'utf8');
  assert.ok(!realHistory.includes('2099-01-01'),
    'the REAL history.ndjson must never receive a test record');

  process.env.SLEEPOS_STATE_DIR = saved;
});
