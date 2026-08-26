// One night's analysis, computed rather than stored.
//
// This is the arithmetic behind every screen: where a night sits in the whole
// record, how it compares to the trailing windows, and what the stages did. It
// used to live inside bin/build-night-data.mjs, which reads the encrypted
// telemetry -- so it could only ever describe the latest night, on a machine
// holding the data key.
//
// Pulling it out is what makes a date picker possible. The function takes a
// plain array of nights and a date, so the same code answers for any night, and
// the browser can run it against the history already embedded in the page. There
// is no second implementation to drift: the file the screens are generated from
// on the server and the object the browser hands those same templates come out
// of this one function.
//
// Durations are MINUTES throughout. Oura reports seconds and the embedded series
// stores minutes; rounding once, at the edge, means the server path and the
// browser path cannot disagree about a night by a few seconds of rounding.

import { mean, stdev, percentileRank, trailing } from './stats.js';

/**
 * The canonical night record this module works in. Callers map into it:
 * telemetry rows on the server, series rows in the browser.
 *
 * d  date (YYYY-MM-DD)   s  sleep score
 * t  total sleep         ib in bed          dp deep   rm REM   lt light   aw awake
 * ef efficiency (%)      la latency         hv HRV (ms)   hr lowest heart rate
 * br breathing rate      bs bedtime start (ISO)   be bedtime end (ISO)
 * hp hypnogram (string)
 */

const asMinutes = (seconds) =>
  (typeof seconds === 'number' && Number.isFinite(seconds) ? Math.round(seconds / 60) : null);

/** Map one Oura telemetry row into the canonical shape. */
export function fromTelemetry(r) {
  return {
    d: r.date,
    s: r.sleep_score,
    t: asMinutes(r.total_sleep_duration),
    ib: asMinutes(r.time_in_bed),
    dp: asMinutes(r.deep_sleep_duration),
    rm: asMinutes(r.rem_sleep_duration),
    lt: asMinutes(r.light_sleep_duration),
    aw: asMinutes(r.awake_time),
    ef: r.efficiency ?? null,
    la: asMinutes(r.latency),
    hv: r.average_hrv ?? null,
    hr: r.lowest_heart_rate ?? null,
    // Oura reports breathing rate to three decimals, which is noise rather than
    // precision. Rounded here so every consumer agrees on the figure.
    br: typeof r.average_breath === 'number' ? Math.round(r.average_breath * 10) / 10 : null,
    bs: r.bedtime_start ?? null,
    be: r.bedtime_end ?? null,
    hp: r.sleep_phase_5_min ?? null,
  };
}

const hhmm = (m) =>
  (m === null || m === undefined ? null : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);

const stage = (m) => (m === null || m === undefined ? null : { minutes: m, label: hhmm(m) });

/** Nights with a real score, oldest first. Anything unscored is not a data point. */
export function scoredNights(nights) {
  return (nights ?? [])
    .filter((r) => r && typeof r.s === 'number' && Number.isFinite(r.s) && typeof r.d === 'string')
    .sort((a, b) => a.d.localeCompare(b.d));
}

/**
 * Analyse one night against the whole record.
 *
 * @param {object}   o
 * @param {object[]} o.nights   canonical records; order does not matter
 * @param {string}   [o.date]   which night. Omitted means the newest on record.
 * @param {string}   [o.today]  for the staleness check; defaults to the real date
 * @returns {object|null} the same shape data/last-night.json carries, or null
 *                        when the requested night is not in the record
 */
export function analyseNight({ nights, date = null, today = null } = {}) {
  const all = scoredNights(nights);
  if (!all.length) return null;

  const night = date ? all.find((r) => r.d === date) : all[all.length - 1];
  if (!night) return null;

  const scores = all.map((r) => r.s);
  const m = mean(scores);
  const sd = stdev(scores);
  const score = night.s;

  // below/above exclude ties so the three counts always sum to n -- screen 4
  // draws one outline box per group and a gap would show as a missing cell.
  const below = scores.filter((s) => s < score).length;
  const above = scores.filter((s) => s > score).length;
  const ties = scores.length - below - above;

  // Trailing windows end at the night being asked about, so an older date gives
  // that night's context rather than today's. This is the property that makes
  // browsing backwards meaningful instead of merely possible.
  const idx = all.indexOf(night);
  const upto = all.slice(0, idx + 1).map((r) => r.s);

  const now = today ?? new Date().toISOString().slice(0, 10);
  const spanMs = Date.parse(`${now}T00:00:00Z`) - Date.parse(`${night.d}T00:00:00Z`);
  // A malformed date parses to NaN, and NaN would print as "NaN days back" while
  // every comparison against it quietly returns false -- so a stale night would
  // read as current. 0 is the honest answer when the span cannot be computed.
  const daysBehind = Number.isFinite(spanMs) ? Math.round(spanMs / 86400000) : 0;

  return {
    generated: null,          // stamped by the caller that writes a file
    date: night.d,
    requested: date || 'latest',
    daysBehind,
    // Only meaningful for "give me the latest": a night asked for by name is not
    // stale, it is history.
    stale: !date && daysBehind >= 2,
    score,
    population: {
      n: scores.length,
      // stdev() is null below two nights -- there is no spread in a single
      // point -- and calling toFixed on it threw. A one-night history is not an
      // edge case, it is day one, so 0 spread is reported rather than crashing.
      mean: m === null ? score : +m.toFixed(2),
      sd: sd === null ? 0 : +sd.toFixed(2),
      median: [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)],
      first: all[0].d,
      last: all[all.length - 1].d,
    },
    standing: {
      below,
      above,
      ties,
      rank: above + 1,        // 1 = best night on record
      // percentileRank returns null below two nights. Rather than invent a
      // convention, the same definition it uses -- (below + half the ties) / n --
      // is applied, which puts the only night on record at its own median. The
      // screens gate their percentile language on the sample size anyway.
      percentile: +(percentileRank(score, scores)
        ?? ((below + 0.5 * ties) / scores.length) * 100).toFixed(1),
      z: sd ? +((score - m) / sd).toFixed(2) : null,
    },
    trailing: trailing(upto).map((t) => ({
      window: t.window,
      days: t.days,
      avg: t.avg === null ? null : +t.avg.toFixed(1),
      partial: t.partial,
    })),
    night: {
      asleepMinutes: night.t ?? null,
      asleepLabel: hhmm(night.t ?? null),
      inBedMinutes: night.ib ?? null,
      deep: stage(night.dp ?? null),
      rem: stage(night.rm ?? null),
      light: stage(night.lt ?? null),
      awake: stage(night.aw ?? null),
      efficiency: night.ef ?? null,
      latency: night.la ?? null,
      hrv: night.hv ?? null,
      restingHr: night.hr ?? null,
      breath: night.br ?? null,
      bedtimeStart: night.bs ?? null,
      bedtimeEnd: night.be ?? null,
      hypnogram: night.hp ?? null,
    },
  };
}

/** Every date with a score, oldest first — the set a date picker may offer. */
export function availableDates(nights) {
  return scoredNights(nights).map((r) => r.d);
}
