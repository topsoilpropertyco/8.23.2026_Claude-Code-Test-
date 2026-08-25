// Letter grades for a sleep score, against two different populations.
//
// A score gets a grade only by way of a percentile, never from the raw number.
// That distinction is the whole subtlety here: the source research computed the
// standard grade from the score at first, found it wrong, and fixed it. Grading
// a rank and grading a value are different operations and only the first one
// answers "how did this night compare".
//
// Two populations, deliberately kept apart:
//
//   members  - Oura member nights. A fixed 60-row lookup table shipped in
//              data/oura-score-reference.json. Its percentiles rest on an
//              INFERRED spread (Oura publishes a mean and has never published
//              an SD), so 26 of its 60 rows are low confidence and are not
//              allowed to show a number.
//   mine     - Seth's own nights. Computed empirically from real telemetry, so
//              there is nothing to infer and no confidence problem: it is a
//              census of his own history, not a model of someone else's.
//
// The same three curves apply to both, which is the point of having both. One
// score, two populations, two different grades -- that gap is the interesting
// number, and it only reads as a comparison if the curves are held identical.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { percentileRank, mean, stdev } from './stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let _curves = null;
let _reference = null;

export function loadCurves() {
  if (!_curves) {
    const raw = JSON.parse(readFileSync(join(ROOT, 'data/grade-curves.json'), 'utf8'));
    _curves = raw.curves.slice().sort((a, b) => a.order - b.order);
  }
  return _curves;
}

export function loadReference() {
  if (!_reference) {
    _reference = JSON.parse(readFileSync(join(ROOT, 'data/oura-score-reference.json'), 'utf8'));
  }
  return _reference;
}

export const CURVE_IDS = ['standard', 'bell', 'curved'];

/** The curve to feature on a screen, per the source research. */
export const FEATURED_CURVE = 'curved';

/**
 * Grade a percentile on one curve. Bands are inclusive lower bounds ordered
 * high to low, so the first one met wins.
 */
export function gradeFor(percentile, curveId) {
  if (percentile === null || percentile === undefined || Number.isNaN(percentile)) return null;
  const curve = loadCurves().find((c) => c.id === curveId);
  if (!curve) throw new Error(`unknown curve: ${curveId}`);
  for (const band of curve.bands) if (percentile >= band.min) return band.grade;
  return null;
}

/** All three grades at once, in harshest-to-most-generous order. */
export function gradesFor(percentile) {
  if (percentile === null || percentile === undefined || Number.isNaN(percentile)) return null;
  const out = {};
  for (const id of CURVE_IDS) out[id] = gradeFor(percentile, id);
  return out;
}

/**
 * Where a score sits among Oura member nights.
 *
 * `display` is the guard that matters: low-confidence rows carry a real
 * estimate and it is the model's best guess, but it rests on extrapolation into
 * a part of the curve where nothing was ever observed. Those rows may inform a
 * grade; they may not print a number. Callers should check `display` before
 * rendering `percentile`, and fall back to `qualitative`.
 */
export function memberStanding(score) {
  const ref = loadReference();
  const row = ref.table.find((r) => r.score === Math.round(score));
  if (!row) {
    // Off the ends of the table rather than merely uncertain within it.
    const below = Math.round(score) < ref.table[0].score;
    return {
      score, percentile: null, display: false, offTable: true,
      qualitative: below ? 'below the bottom of the scale' : 'at the top of the scale',
      grades: null, confidence: 'none',
    };
  }
  const display = row.confidence !== 'low';
  return {
    score: row.score,
    percentile: row.percentile,
    display,
    offTable: false,
    qualitative: row.percentile >= 50 ? 'top few percent' : 'bottom few percent',
    ci: row.ci,
    sd: row.sd,
    sdDirection: row.sdDirection,
    basis: row.basis,
    confidence: row.confidence,
    grades: gradesFor(row.percentile),
    population: ref.population,
  };
}

/**
 * Where a score sits among Seth's own nights, computed from his real history.
 *
 * Empirical throughout. `percentileRank` counts actual nights rather than
 * fitting a curve, which matters because sleep scores are bounded at 100 and
 * left-skewed -- a normal fit puts about 1% of nights above 100, which cannot
 * happen.
 */
export function ownStanding(score, history) {
  const scores = history.map((h) => (typeof h === 'number' ? h : h.score)).filter(Number.isFinite);
  if (scores.length < 2) {
    return { score, percentile: null, display: false, grades: null, n: scores.length };
  }
  const percentile = percentileRank(score, scores);
  const m = mean(scores);
  const sd = stdev(scores);
  const at = scores.filter((s) => s === Math.round(score)).length;
  return {
    score,
    percentile,
    display: true,
    // Empirical percentiles need no confidence caveat, but a score with almost
    // no neighbours in the history is still a thin estimate worth flagging.
    thin: at < 3,
    nightsAtScore: at,
    worse: scores.filter((s) => s < score).length,
    better: scores.filter((s) => s > score).length,
    n: scores.length,
    mean: m,
    sd,
    sdFromMean: sd ? (score - m) / sd : null,
    grades: gradesFor(percentile),
  };
}

/**
 * Both standings plus the gap between them. A positive `percentileGap` means
 * the score ranks higher among member nights than among Seth's own -- which is
 * the normal case for him, because he sleeps better than the member average, so
 * he is graded against a tougher field when the field is his own history.
 */
export function compareStandings(score, history) {
  const members = memberStanding(score);
  const own = ownStanding(score, history);
  const gap =
    members.percentile !== null && own.percentile !== null
      ? members.percentile - own.percentile
      : null;
  return { score, members, own, percentileGap: gap };
}
