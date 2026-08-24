// Habit anchors.
//
// The inverse of the fact rotation. A fact slot varies what it tells you; a
// habit anchor keeps the instruction identical every single day and rotates
// only the reason. Same action, fresh argument.
//
// That difference decides the scheduling too. The +/-20 minute jitter that
// keeps the fact rotation from feeling robotic is exactly wrong here: a habit
// forms on a consistent trigger, and a cue at 7:52 is not a 7:30 habit. Habit
// slots therefore set `jitter: false` in config, which buildDaySchedule already
// honours -- no scheduling code was needed for this.
//
// Rotation follows the same discipline as the fact library: one cycle is a
// single pass through every rationale, nothing repeats until the pool is
// exhausted, then it reshuffles and the cycle advances. With 24 per habit that
// is a reason a day for the better part of a month before anything comes round
// again.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';
import { rngFrom, shuffle } from './rng.js';

const FILE = join(ROOT, 'data/habits.json');

export function loadHabits() {
  const { habits } = JSON.parse(readFileSync(FILE, 'utf8'));
  for (const [id, h] of Object.entries(habits)) {
    if (!h.cue) throw new Error(`habit ${id} has no cue`);
    if (!Array.isArray(h.why) || !h.why.length) throw new Error(`habit ${id} has no rationales`);
  }
  return habits;
}

export function buildHabitCycle(habit, cycleNumber) {
  return shuffle(habit.why, rngFrom(`sleep-os:habit-cycle:${cycleNumber}`));
}

/**
 * Next rationale for a habit, with per-habit rotation state.
 *
 * State is keyed by habit id so the two habits rotate independently -- adding a
 * third later cannot disturb either of them.
 */
export function selectRationale({ habit, habitId, state, dateString }) {
  const rot = state.habitRotation?.[habitId] ?? { cycle: 0, remaining: [] };
  let { cycle, remaining } = rot;

  if (!remaining?.length) {
    cycle += 1;
    remaining = buildHabitCycle(habit, cycle).map((w) => w.id);
  }

  const [nextId, ...rest] = remaining;
  const why = habit.why.find((w) => w.id === nextId) ?? habit.why[0];

  // Deterministic from the date, so a re-run on the same day makes the same
  // call rather than re-rolling the optional line.
  const showOptional = habit.optional
    ? rngFrom(`sleep-os:habit-optional:${habitId}:${dateString}`)() < (habit.optionalOdds ?? 0)
    : false;

  return { why, showOptional, cycle, remaining: rest };
}
