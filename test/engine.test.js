import test from 'node:test';
import assert from 'node:assert/strict';

import { loadLibraries, loadConfig, CARD_FIELDS } from '../src/facts.js';
import { buildCycle, cycleMixRatio } from '../src/playlist.js';
import { selectFact } from '../src/selector.js';
import { buildDaySchedule, dueSlots } from '../src/schedule.js';
import { renderCard, renderMessage } from '../src/render.js';
import { zonedWallTimeToDate, localDateString, parseClock } from '../src/time.js';
import { rngFrom, gaussian } from '../src/rng.js';

const { facts } = loadLibraries();
const config = loadConfig();

test('library loads 55 facts with every card field populated', () => {
  assert.equal(facts.length, 55);
  assert.equal(facts.filter((f) => f.library === 'sleep').length, 40);
  assert.equal(facts.filter((f) => f.library === 'lucid').length, 15);
  for (const fact of facts) {
    for (const field of CARD_FIELDS) assert.ok(fact[field].length > 0, `${fact.id}.${field}`);
  }
});

test('a cycle contains every fact exactly once', () => {
  for (const n of [0, 1, 7, 42]) {
    const cycle = buildCycle(facts, n);
    assert.equal(cycle.length, facts.length);
    assert.equal(new Set(cycle.map((f) => f.id)).size, facts.length);
  }
});

test('cycles reshuffle between rounds', () => {
  const a = buildCycle(facts, 0).map((f) => f.id).join();
  const b = buildCycle(facts, 1).map((f) => f.id).join();
  assert.notEqual(a, b);
});

test('cycle build is deterministic for a given cycle number', () => {
  assert.equal(
    buildCycle(facts, 3).map((f) => f.id).join(),
    buildCycle(facts, 3).map((f) => f.id).join(),
  );
});

test('mix ratio holds near 70/30 across every quarter of a cycle', () => {
  const cycle = buildCycle(facts, 0);
  assert.ok(Math.abs(cycleMixRatio(cycle).lucid - 0.273) < 0.01);

  const quarter = Math.floor(cycle.length / 4);
  for (let i = 0; i < 4; i++) {
    const slice = cycle.slice(i * quarter, (i + 1) * quarter);
    const lucid = slice.filter((f) => f.library === 'lucid').length / slice.length;
    assert.ok(lucid > 0.15 && lucid < 0.42, `quarter ${i} lucid share was ${lucid}`);
  }
});

test('no fact repeats until the pool is exhausted, then the cycle turns over', () => {
  let state = { version: 1, cycle: 0, remaining: null, sends: {} };
  const seen = [];

  for (let i = 0; i < facts.length; i++) {
    const slot = config.slots[i % config.slots.length];
    const choice = selectFact({ facts, state, slotId: slot.id, dateString: '2026-09-01', config });
    state = { ...state, cycle: choice.cycle, remaining: choice.remaining };
    seen.push(choice.fact.id);
  }

  assert.equal(new Set(seen).size, facts.length, 'a fact repeated inside one cycle');
  assert.equal(state.remaining.length, 0);

  const next = selectFact({ facts, state, slotId: config.slots[0].id, dateString: '2026-09-10', config });
  assert.equal(next.cycle, 1, 'cycle did not advance when the pool emptied');
  assert.equal(next.remaining.length, facts.length - 1);
});

test('selection prefers facts tagged for the firing slot', () => {
  const state = { version: 1, cycle: 0, remaining: null, sends: {} };
  const choice = selectFact({ facts, state, slotId: 'terminal_bedtime', dateString: '2026-09-01', config });
  assert.ok(choice.fact.slots.includes('terminal_bedtime'));
});

test('jackpot fires near the configured 1-in-7 rate and only on high-intensity cards', () => {
  let state = { version: 1, cycle: 0, remaining: null, sends: {} };
  let jackpots = 0;
  const sends = 210;

  for (let i = 0; i < sends; i++) {
    const slot = config.slots[i % config.slots.length];
    const date = `2026-09-${String((i % 28) + 1).padStart(2, '0')}`;
    const choice = selectFact({ facts, state, slotId: slot.id, dateString: `${date}-${i}`, config });
    state = { ...state, cycle: choice.cycle, remaining: choice.remaining };
    if (choice.jackpot) {
      jackpots++;
      assert.equal(choice.fact.intensity, 'high', 'jackpot styling on a standard card');
    }
  }

  const rate = jackpots / sends;
  assert.ok(rate > 0.07 && rate < 0.22, `jackpot rate was ${rate}`);
});

test('jitter stays inside the configured window and is stable for a given day', () => {
  const a = buildDaySchedule(config, '2026-09-01');
  const b = buildDaySchedule(config, '2026-09-01');
  assert.deepEqual(a.map((s) => s.targetMinutes), b.map((s) => s.targetMinutes));

  for (const slot of a) {
    assert.ok(Math.abs(slot.offsetMinutes) <= config.jitter.maxMinutes, `${slot.id} offset ${slot.offsetMinutes}`);
  }

  const varied = new Set();
  for (let d = 1; d <= 20; d++) {
    const date = `2026-09-${String(d).padStart(2, '0')}`;
    varied.add(buildDaySchedule(config, date).find((s) => s.id === 'work_shutdown').offsetMinutes);
  }
  assert.ok(varied.size > 5, 'jitter is not varying across days');
});

test('gaussian jitter clamps to the maximum', () => {
  const rng = rngFrom('clamp-check');
  for (let i = 0; i < 5000; i++) {
    const v = gaussian(rng, 10, 20);
    assert.ok(v >= -20 && v <= 20);
  }
});

test('wall times resolve across the daylight saving boundary', () => {
  const tz = 'America/Detroit';
  // Detroit is UTC-4 in summer, UTC-5 in winter.
  assert.equal(zonedWallTimeToDate('2026-08-23', parseClock('21:00'), tz).toISOString(), '2026-08-24T01:00:00.000Z');
  assert.equal(zonedWallTimeToDate('2026-01-15', parseClock('21:00'), tz).toISOString(), '2026-01-16T02:00:00.000Z');
  // The day the clocks go forward (2026-03-08 in the US).
  assert.equal(zonedWallTimeToDate('2026-03-08', parseClock('21:00'), tz).toISOString(), '2026-03-09T01:00:00.000Z');
});

test('local date rolls at local midnight, not UTC midnight', () => {
  // 03:30 UTC on the 24th is still 23:30 on the 23rd in Detroit.
  assert.equal(localDateString(new Date('2026-08-24T03:30:00Z'), 'America/Detroit'), '2026-08-23');
});

test('a slot is due once its target passes and never twice in a day', () => {
  const schedule = buildDaySchedule(config, '2026-09-01');
  const shutdown = schedule.find((s) => s.id === 'work_shutdown');

  const before = new Date(shutdown.targetAt.getTime() - 60000);
  assert.ok(!dueSlots(schedule, before, [], 75).due.some((s) => s.id === 'work_shutdown'));

  const after = new Date(shutdown.targetAt.getTime() + 60000);
  assert.ok(dueSlots(schedule, after, [], 75).due.some((s) => s.id === 'work_shutdown'));

  assert.ok(!dueSlots(schedule, after, ['work_shutdown'], 75).due.some((s) => s.id === 'work_shutdown'));
});

test('a slot missed by more than the lateness window is skipped, not sent late', () => {
  const schedule = buildDaySchedule(config, '2026-09-01');
  const shutdown = schedule.find((s) => s.id === 'work_shutdown');
  const late = new Date(shutdown.targetAt.getTime() + 90 * 60000);

  const { due, missed } = dueSlots(schedule, late, [], 75);
  assert.ok(!due.some((s) => s.id === 'work_shutdown'));
  assert.ok(missed.some((s) => s.id === 'work_shutdown'));
});

test('rendered cards carry all five labels verbatim and no markdown', () => {
  const fact = facts[0];
  const card = renderCard(fact);

  for (const label of ['The High-Yield Reframe', 'The Data Proof', 'The Daily Currency', "Tonight's 1% Move", 'The Root Truth']) {
    assert.ok(card.includes(`${label}:`), `missing ${label}`);
  }
  for (const field of CARD_FIELDS) assert.ok(card.includes(fact[field]), `${field} was altered`);

  assert.ok(!/[*_`]|^\s*[-•]\s/m.test(card), 'card contains markdown or bullet characters');
});

test('the message header names the slot, and jackpots are labelled', () => {
  const slot = buildDaySchedule(config, '2026-09-01')[0];
  assert.ok(renderMessage({ fact: facts[0], slot, jackpot: false }).includes(slot.name));
  assert.ok(renderMessage({ fact: facts[0], slot, jackpot: true }).includes('JACKPOT'));
});

test('a dry run leaves the durable delivery log untouched', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { dispatch } = await import('../src/dispatch.js');
  const { ROOT } = await import('../src/facts.js');
  const { join } = await import('node:path');

  const historyPath = join(ROOT, 'state/history.ndjson');
  const before = existsSync(historyPath) ? readFileSync(historyPath, 'utf8') : '';

  await dispatch({ force: 'work_shutdown', dryRun: true, log: () => {} });

  const after = existsSync(historyPath) ? readFileSync(historyPath, 'utf8') : '';
  assert.equal(after, before, 'dry run wrote to history.ndjson');
});

test('the dispatcher never fires a slot whose target time has not arrived', async () => {
  const { dispatch } = await import('../src/dispatch.js');
  const schedule = buildDaySchedule(config, localDateString(new Date(), config.timezone));

  // Walk the day and check the real invariant: whatever comes back as sent must
  // already be due. Asserting a count instead would only be testing whether the
  // on-disk state file happens to be empty.
  for (const slot of schedule) {
    const now = new Date(slot.targetAt.getTime() + 30_000);
    const result = await dispatch({ now, dryRun: true, log: () => {} });
    for (const s of result.sent) {
      assert.ok(s.slot.targetAt <= now, `${s.slot.id} fired ${s.slot.targetAt - now}ms early`);
    }
  }
});

