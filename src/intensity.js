// How big should this reply be?
//
// Constant-magnitude reward flattens into noise. A system that answers every
// input with the same four lines stops being read inside a fortnight -- the eye
// learns the shape and skips it. So the size of a reply is itself a variable:
// most are short, some are ordinary, and occasionally one is worth stopping for.
//
// This is the same precedent already sitting in config as `jackpot`, lifted out
// of the fact rotation so the coach and the journal replies can share it.
//
// Three rules, in priority order:
//
// 1. Earned beats random. A milestone, a personal best, a night unlike any
//    other on record -- those go large because there is genuinely more to say,
//    not because a die came up six.
// 2. Effort caps size. Two words in gets a warm line back, never an essay.
//    If the reward attaches to typing anything, the optimal move becomes
//    typing anything.
// 3. Everything else rolls. Deterministically, from a seed, so the same day
//    re-run gives the same answer and a retry cannot fish for a bigger one.

import { rngFrom } from './rng.js';

export const LEVELS = ['brief', 'standard', 'deep'];

// Weights for the ordinary case. Deep is roughly one in ten -- close to the
// 1-in-7 jackpot already in config, a shade rarer because a deep reply costs
// the reader more attention than a rotated fact does.
const BASE = { brief: 0.62, standard: 0.28, deep: 0.10 };

// What each level is allowed to spend. `words` is a target the writer is asked
// to hit; `maxTokens` and `effort` are the hard API ceiling behind it.
export const BUDGETS = {
  brief:    { sentences: 1, words: 25,  maxTokens: 700,  effort: 'low',    extras: [] },
  standard: { sentences: 3, words: 60,  maxTokens: 1200, effort: 'low',    extras: ['context'] },
  deep:     { sentences: 6, words: 130, maxTokens: 2400, effort: 'medium', extras: ['context', 'pattern', 'streak'] },
};

const rank = (level) => LEVELS.indexOf(level);
const clamp = (level, floor, ceiling) => {
  let i = rank(level);
  if (floor) i = Math.max(i, rank(floor));
  if (ceiling) i = Math.min(i, rank(ceiling));
  return LEVELS[i];
};

/**
 * Decide how large a reply should be.
 *
 * @param {object}  o
 * @param {string}  o.seed       anything stable for this reply -- date + kind.
 *                               The same seed always returns the same level.
 * @param {boolean} [o.milestone] a named occasion. Goes deep, no roll.
 * @param {number}  [o.rarity]   0-1: how unusual this input is against history.
 *                               At 0.9+ there is real news, so the floor lifts
 *                               and the deep odds roughly treble.
 * @param {number}  [o.effort]   0-1: how much the person put in. Below 0.3 the
 *                               reply is capped at brief.
 * @param {string}  [o.floor]    caller-imposed minimum level
 * @param {string}  [o.ceiling]  caller-imposed maximum level
 * @returns {{level: string, budget: object, reason: string}}
 */
export function pickIntensity({
  seed = '', milestone = false, rarity = 0, effort = 1, floor = null, ceiling = null,
} = {}) {
  // Effort caps before anything else can lift, except a milestone -- showing up
  // on the night a streak lands is the behaviour being rewarded, so a short
  // entry still gets the milestone.
  const lowEffort = effort < 0.3;

  if (milestone) {
    return { level: clamp('deep', floor, ceiling), budget: BUDGETS[clamp('deep', floor, ceiling)], reason: 'milestone' };
  }

  const cap = lowEffort ? clamp('brief', null, ceiling) : ceiling;

  if (lowEffort) {
    const level = clamp('brief', null, cap);
    return { level, budget: BUDGETS[level], reason: 'short input' };
  }

  const w = { ...BASE };
  let reason = 'roll';
  let effectiveFloor = floor;

  if (rarity >= 0.9) {
    // A night genuinely unlike the others. There is more to say, so say it.
    w.deep = 0.30;
    w.standard = 0.50;
    w.brief = 0.20;
    effectiveFloor = clamp('standard', floor, null);
    reason = 'rare night';
  } else if (rarity >= 0.7) {
    w.deep = 0.18;
    w.standard = 0.37;
    w.brief = 0.45;
    reason = 'notable night';
  }

  const roll = rngFrom(`sleep-os:intensity:${seed}`)();
  let acc = 0;
  let picked = 'brief';
  for (const level of LEVELS) {
    acc += w[level];
    if (roll < acc) { picked = level; break; }
    picked = level;
  }

  const level = clamp(picked, effectiveFloor, cap);
  return { level, budget: BUDGETS[level], reason };
}

/**
 * How unusual is this night, on a 0-1 scale, against the person's own record?
 *
 * Deliberately within-person. Being at the 99th percentile of Oura's members
 * is not news about tonight; being two standard deviations from your own mean
 * is. Returns 0 when there is not enough history to make the claim.
 */
export function rarityOf(value, series) {
  const xs = (series ?? []).filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (typeof value !== 'number' || !Number.isFinite(value) || xs.length < 14) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  if (!sd) return 0;
  const z = Math.abs((value - m) / sd);
  // A best or worst on record is always news, whatever the spread says.
  if (value >= Math.max(...xs) || value <= Math.min(...xs)) return 1;
  return Math.min(1, z / 2.5);
}

/**
 * How much did the person actually put in? Length is a crude proxy and it is
 * the honest one available: a longer, considered entry is more to work with.
 */
export function effortOf(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.min(1, words / 20);
}
