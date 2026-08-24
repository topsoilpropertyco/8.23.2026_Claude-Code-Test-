// The morning coach.
//
// Parses a manually logged night, positions it against the user's own history,
// and returns one specific lever for tonight. Deliberately rule-based rather
// than generated: the advice is traceable to the logged numbers and to a fact
// already in the library, so it can never invent a statistic.
//
// The recommendation is always drawn from a real fact's "Tonight's 1% Move",
// which keeps the coaching tied to the same evidence base as the nudges.

import { loadLibraries } from './facts.js';
import { mean, stdev, zScore, percentileRank, trailing, confidence } from './stats.js';

const NUM = /-?\d+(?:\.\d+)?/g;

/**
 * Forgiving parse of a logged night.
 * Accepts "84", "84 7.5", "84 7.5 4", "score 84, 7h30, felt 4".
 * A lone number above 14 reads as a score; 14 or below reads as hours, since
 * no sleep score is that low.
 */
export function parseEntry(text) {
  const nums = (String(text).match(NUM) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { ok: false, reason: 'no numbers found' };

  let score = null;
  let hours = null;
  let feel = null;
  const rest = [...nums];

  if (rest[0] > 14) score = Math.round(rest.shift());
  if (rest.length && rest[0] > 0 && rest[0] <= 14) hours = rest.shift();
  const feelAt = rest.findIndex((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  if (feelAt !== -1) feel = rest.splice(feelAt, 1)[0];

  if (score === null && hours === null) return { ok: false, reason: 'could not read a score or hours' };
  if (score !== null && (score < 1 || score > 100)) return { ok: false, reason: 'score must be 1-100' };

  return { ok: true, score, hours, feel };
}

/* ------------------------------------------------------------------ levers */

// Each lever names the situation it answers and the fact categories that carry
// a useful move for it. The move text itself comes from the library.
const LEVERS = [
  { id: 'duration', when: 'short sleep', categories: ['cognition', 'immunity', 'hormones'] },
  { id: 'environment', when: 'poor efficiency', categories: ['environment'] },
  { id: 'circadian', when: 'timing drift', categories: ['circadian'] },
  { id: 'regularity', when: 'inconsistency', categories: ['longevity'] },
  { id: 'autonomic', when: 'elevated arousal', categories: ['cardiometabolic'] },
  { id: 'consolidate', when: 'a strong night — protect it', categories: ['longevity', 'brain'] },
];

function chooseLever({ score, hours, feel, baseline, recentSpread }) {
  if (hours !== null && hours < 7) return LEVERS[0];
  if (feel !== null && feel <= 2 && baseline !== null && score !== null && score >= baseline) return LEVERS[4];
  if (recentSpread !== null && recentSpread > 9) return LEVERS[3];
  if (baseline !== null && score !== null && score < baseline - 4) return LEVERS[1];
  if (baseline !== null && score !== null && score > baseline + 4) return LEVERS[5];
  return LEVERS[2];
}

/** Rotate within the lever's fact pool so the same advice never lands twice running. */
function moveFor(lever, rotation) {
  const { facts } = loadLibraries();
  const pool = facts.filter((f) => lever.categories.includes(f.category));
  if (pool.length === 0) return null;
  return pool[rotation % pool.length];
}

/* ---------------------------------------------------------------- response */

const fmt1 = (n) => n.toFixed(1);
const signed = (n, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const arrow = (n) => (n > 0.05 ? '▲' : n < -0.05 ? '▼' : '▶');

export function buildCoachResponse({ entry, history, rotation = 0, morningPrompt = null }) {
  const scores = history.map((h) => h.score).filter((s) => typeof s === 'number');
  const n = scores.length;
  const tier = confidence(n);
  const lines = ['SLEEP OS  //  MORNING COACH', ''];

  const score = entry.score;
  const detail = [];
  if (score !== null) detail.push(`Score ${score}`);
  if (entry.hours !== null) detail.push(`${entry.hours}h`);
  if (entry.feel !== null) detail.push(`feel ${entry.feel}/5`);
  lines.push(`${detail.join('  ·  ')}   logged.`);
  lines.push('');

  /* --- positioning, only as far as the sample supports ------------------- */

  if (tier === 'seeding') {
    lines.push(`${n + 1} night${n === 0 ? '' : 's'} on the record. Around seven and the comparisons start meaning something. Keep logging.`);
  } else if (score !== null) {
    const base = mean(scores);
    const delta = score - base;
    lines.push(`Your ${n}-night average is ${fmt1(base)}. Last night ran ${arrow(delta)} ${signed(delta)} against it.`);

    if (tier === 'monthly' || tier === 'full') {
      const z = zScore(score, scores);
      if (z !== null) lines.push(`That is ${signed(z, 2)} SD from your own mean.`);
    }
    if (tier === 'full') {
      const p = percentileRank(score, scores);
      if (p !== null) lines.push(`It sits at the ${p.toFixed(0)}th percentile of every night you have logged.`);
    }

    const tw = trailing(scores, [7, 30, 90]);
    if (tw.length) {
      lines.push('');
      for (const t of tw) {
        const d = score - t.avg;
        lines.push(`T${t.window}${t.partial ? `*` : ''}  ${fmt1(t.avg)}   ${arrow(d)} ${signed(d)}`);
      }
      if (tw.some((t) => t.partial)) lines.push('* window not full yet');
    }
  }

  /* --- one lever for tonight --------------------------------------------- */

  const baseline = n >= 3 ? mean(scores) : null;
  const spread = n >= 7 ? stdev(scores.slice(-14)) : null;
  const lever = chooseLever({ score, hours: entry.hours, feel: entry.feel, baseline, recentSpread: spread });
  const fact = moveFor(lever, rotation);

  if (fact) {
    lines.push('');
    lines.push(`Tonight's leverage — ${lever.when}:`);
    lines.push(fact.move);
    lines.push('');
    lines.push(fact.truth);
  }

  if (morningPrompt) {
    lines.push('');
    lines.push('─────');
    lines.push(morningPrompt.text);
  }

  return { text: lines.join('\n'), lever: lever.id, factId: fact?.id ?? null, tier };
}
