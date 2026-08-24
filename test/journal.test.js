import test from 'node:test';
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
