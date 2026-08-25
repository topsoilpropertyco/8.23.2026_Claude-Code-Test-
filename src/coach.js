// The morning coach.
//
// Parses a manually logged night, positions it against the user's own history,
// and returns one specific lever for tonight. Deliberately rule-based rather
// than generated: the advice is traceable to the logged numbers and to a fact
// already in the library, so it can never invent a statistic.
//
// The recommendation is always drawn from a real fact's "Tonight's 1% Move",
// which keeps the coaching tied to the same evidence base as the nudges.

import { loadLibraries, loadConfig } from './facts.js';
import { mean, stdev, zScore, percentileRank, trailing, confidence } from './stats.js';
import { readTelemetry, scoreSeries } from './telemetry.js';
import { deckUrl } from './deckurl.js';

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

function chooseLever({ score, hours, feel, baseline, recentSpread, night, baselines }) {
  // With real telemetry the weakest contributor picks the lever directly,
  // rather than being guessed at from one number.
  if (night) {
    const hoursSlept = night.total_sleep_duration ? night.total_sleep_duration / 3600 : hours;
    if (hoursSlept != null && hoursSlept < 7) return LEVERS[0];
    if (night.efficiency != null && night.efficiency < 85) return LEVERS[1];
    if (baselines?.hrv && night.average_hrv != null && night.average_hrv < baselines.hrv * 0.85) return LEVERS[4];
    if (baselines?.rhr && night.lowest_heart_rate != null && night.lowest_heart_rate > baselines.rhr + 3) return LEVERS[4];
    if (night.latency != null && night.latency > 1200) return LEVERS[2];
    if (recentSpread !== null && recentSpread > 9) return LEVERS[3];
    if (baseline !== null && night.sleep_score != null && night.sleep_score > baseline + 4) return LEVERS[5];
    return LEVERS[2];
  }

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
const ordinal = (n) => {
  const i = Math.round(n);
  const rem100 = i % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${i}th`;
  return `${i}${['th', 'st', 'nd', 'rd'][i % 10] ?? 'th'}`;
};
const signed = (n, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const arrow = (n) => (n > 0.05 ? '▲' : n < -0.05 ? '▼' : '▶');

const hhmm = (seconds) => {
  if (seconds == null) return null;
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/**
 * @param {object}   opts
 * @param {object}   opts.entry        parsed manual entry
 * @param {object[]} opts.history      fallback history when Oura is absent
 * @param {string}   [opts.date]       the night being logged, for the Oura lookup
 * @param {boolean}  [opts.useOura]    prefer telemetry over the manual log
 */
export function buildCoachResponse({ entry, history, rotation = 0, morningPrompt = null, date = null, useOura = true, screensUrl = undefined }) {
  // Oura, when connected, is the source of truth for the numbers. The manual
  // entry is kept because writing it down by hand is the behavioural point --
  // but the analysis runs on the measurement, not the recollection.
  let night = null;
  let telemetry = [];
  if (useOura) {
    try {
      telemetry = readTelemetry();
      if (date) night = telemetry.find((r) => r.date === date && r.sleep_score != null) ?? null;
    } catch {
      telemetry = [];
    }
  }

  const ouraScores = night ? scoreSeries().filter((s) => s.date < date) : [];
  const scores = ouraScores.length
    ? ouraScores.map((s) => s.score)
    : history.map((h) => h.score).filter((s) => typeof s === 'number');
  const n = scores.length;
  const tier = confidence(n);
  const lines = ['SLEEP OS  //  MORNING COACH', ''];

  const score = night?.sleep_score ?? entry.score;

  const detail = [];
  if (entry.score !== null) detail.push(`Score ${entry.score}`);
  if (entry.hours !== null) detail.push(`${entry.hours}h`);
  if (entry.feel !== null) detail.push(`feel ${entry.feel}/5`);
  if (detail.length) lines.push(`${detail.join('  ·  ')}   logged.`);

  if (night) {
    // Naming the gap between what you remembered and what the ring measured is
    // itself useful: a consistent bias is a calibration signal.
    if (entry.score !== null && entry.score !== night.sleep_score) {
      const gap = night.sleep_score - entry.score;
      lines.push(`Oura says ${night.sleep_score} — ${gap > 0 ? gap + ' higher' : Math.abs(gap) + ' lower'} than you logged.`);
    } else if (entry.score !== null) {
      lines.push(`Oura agrees: ${night.sleep_score}.`);
    } else {
      lines.push(`Oura: ${night.sleep_score}.`);
    }

    const bits = [];
    if (night.total_sleep_duration) bits.push(hhmm(night.total_sleep_duration) + ' asleep');
    if (night.efficiency != null) bits.push(night.efficiency + '% efficient');
    if (night.deep_sleep_duration) bits.push(hhmm(night.deep_sleep_duration) + ' deep');
    if (night.rem_sleep_duration) bits.push(hhmm(night.rem_sleep_duration) + ' REM');
    if (bits.length) lines.push(bits.join('  ·  '));

    const auto = [];
    if (night.average_hrv != null) auto.push('HRV ' + night.average_hrv + 'ms');
    if (night.lowest_heart_rate != null) auto.push('low HR ' + night.lowest_heart_rate);
    if (night.readiness_score != null) auto.push('readiness ' + night.readiness_score);
    if (auto.length) lines.push(auto.join('  ·  '));
  }
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
      if (p !== null) lines.push(`It sits at the ${ordinal(p)} percentile of every night you have logged.`);
    }

    // 180 and 365 were being discarded here: trailing() already defaults to
    // [7, 30, 90, 180, 365] and handles short and duplicate windows itself
    // (a window with fewer than two nights is dropped, and two windows covering
    // the identical slice collapse to one). Narrowing the call threw away two
    // real baselines the log can already support.
    const tw = trailing(scores);
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

  // 30-night baselines for the autonomic comparison.
  const recent = telemetry.filter((r) => r.date < (date ?? '9999')).slice(-30);
  const hrvs = recent.map((r) => r.average_hrv).filter((v) => typeof v === 'number');
  const rhrs = recent.map((r) => r.lowest_heart_rate).filter((v) => typeof v === 'number');
  const baselines = { hrv: hrvs.length >= 7 ? mean(hrvs) : null, rhr: rhrs.length >= 7 ? mean(rhrs) : null };

  if (night && (baselines.hrv || baselines.rhr)) {
    const vs = [];
    if (baselines.hrv && night.average_hrv != null) {
      const d = night.average_hrv - baselines.hrv;
      vs.push(`HRV ${arrow(d)} ${signed(d)}ms vs 30-night`);
    }
    if (baselines.rhr && night.lowest_heart_rate != null) {
      const d = night.lowest_heart_rate - baselines.rhr;
      // A lower resting heart rate is the good direction, so the arrow inverts.
      vs.push(`low HR ${arrow(-d)} ${signed(d)} vs 30-night`);
    }
    if (vs.length) {
      lines.push('');
      lines.push(vs.join('   '));
    }
  }

  const lever = chooseLever({
    score, hours: entry.hours, feel: entry.feel, baseline, recentSpread: spread, night, baselines,
  });
  const fact = moveFor(lever, rotation);

  if (fact) {
    lines.push('');
    lines.push(`Tonight's leverage — ${lever.when}:`);
    lines.push(fact.move);
    lines.push('');
    lines.push(fact.truth);
  }

  // The dashboard link, key and all. deckUrl() returns null when there is no
  // configured base or no data key to derive from, and null omits the line --
  // never a bare base, which would load and then report itself undecryptable.
  // An explicit screensUrl from the caller is used verbatim so tests can drive
  // this without touching config.json or needing a key.
  const url = screensUrl !== undefined ? screensUrl : deckUrl();
  if (url) {
    lines.push('');
    lines.push(`See the whole night → ${url}`);
  }

  if (morningPrompt) {
    lines.push('');
    lines.push('─────');
    lines.push(morningPrompt.text);
  }

  return { text: lines.join('\n'), lever: lever.id, factId: fact?.id ?? null, tier };
}
