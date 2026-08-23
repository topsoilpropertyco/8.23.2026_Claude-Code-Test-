// Fact selection for a single send.
//
// Selection walks the current cycle's remaining queue in order, but prefers a
// fact tagged for the slot being fired if one appears inside a short lookahead
// window. That keeps 4 PM about caffeine and 9 PM about shutdown without
// abandoning the rotation guarantee: any fact skipped over stays at the front
// of the queue for the next send.

import { buildCycle } from './playlist.js';
import { rngFrom } from './rng.js';

const LOOKAHEAD = 25;

/**
 * @returns {{fact: object, jackpot: boolean, cycle: number, remaining: string[]}}
 */
export function selectFact({ facts, state, slotId, dateString, config }) {
  let cycle = state.cycle ?? 0;
  let remainingIds = Array.isArray(state.remaining) ? state.remaining.slice() : [];

  if (remainingIds.length === 0) {
    cycle = (state.cycle ?? 0) + (state.remaining ? 1 : 0);
    remainingIds = buildCycle(facts, cycle).map((f) => f.id);
  }

  const byId = new Map(facts.map((f) => [f.id, f]));
  const queue = remainingIds.map((id) => byId.get(id)).filter(Boolean);

  const jackpotRng = rngFrom(`sleep-os:jackpot:${dateString}:${slotId}`);
  const jackpot = Boolean(config.jackpot?.enabled) && jackpotRng() < (config.jackpot?.odds ?? 0);

  const window = queue.slice(0, LOOKAHEAD);
  const matchesSlot = (f) => f.slots.includes(slotId);
  const isJackpot = (f) => f.intensity === 'high';

  const pick =
    (jackpot && window.find((f) => isJackpot(f) && matchesSlot(f))) ||
    (jackpot && window.find(isJackpot)) ||
    window.find(matchesSlot) ||
    queue[0];

  return {
    fact: pick,
    // Only claim jackpot styling if a genuinely high-intensity card came up.
    jackpot: jackpot && pick.intensity === 'high',
    cycle,
    remaining: remainingIds.filter((id) => id !== pick.id),
  };
}
