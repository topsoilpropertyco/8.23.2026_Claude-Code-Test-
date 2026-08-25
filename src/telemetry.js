// Oura telemetry store.
//
// One normalised record per night, merged from four endpoints and written as
// encrypted NDJSON alongside the journal. The raw /sleep payload carries
// per-30-second arrays -- heart rate, HRV, movement, sleep phases -- running to
// tens of kilobytes a night. None of that is kept: the analytics only need
// summary fields, and committing the raw arrays to a git repository every day
// would bloat it for no benefit.

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';
import { encryptLine, decryptLine, hasKey, MissingKeyError } from './crypto.js';

// Overridable for the same reason journal.js and state.js are. This is the third
// file to need it: without it, any test that exercises the append path writes
// fabricated nights into the REAL 1,043-night history, and a fake night is not
// cosmetic here -- it shifts the mean, the SD and every percentile on every
// screen. The two files fixed before this one were each fixed in isolation.
const STATE_DIR = process.env.SLEEPOS_STATE_DIR || join(ROOT, 'state');
const FILE = join(STATE_DIR, 'telemetry.enc');

/** Pick the night's main sleep: the long_sleep period, else the longest one. */
function mainSleep(periods) {
  if (!periods?.length) return null;
  return (
    periods.find((p) => p.type === 'long_sleep') ??
    periods.reduce((a, b) => ((b.total_sleep_duration ?? 0) > (a.total_sleep_duration ?? 0) ? b : a))
  );
}

/** Merge one day's rows from the four collections into a single record. */
export function normalise({ day, sleep, readiness, stress, periods }) {
  const p = mainSleep(periods);

  return {
    date: day,
    sleep_score: sleep?.score ?? null,
    readiness_score: readiness?.score ?? null,
    temperature_deviation: readiness?.temperature_deviation ?? null,

    total_sleep_duration: p?.total_sleep_duration ?? null,
    deep_sleep_duration: p?.deep_sleep_duration ?? null,
    rem_sleep_duration: p?.rem_sleep_duration ?? null,
    light_sleep_duration: p?.light_sleep_duration ?? null,
    awake_time: p?.awake_time ?? null,
    time_in_bed: p?.time_in_bed ?? null,
    efficiency: p?.efficiency ?? null,
    latency: p?.latency ?? null,
    restless_periods: p?.restless_periods ?? null,

    average_hrv: p?.average_hrv ?? null,
    average_heart_rate: p?.average_heart_rate ?? null,
    lowest_heart_rate: p?.lowest_heart_rate ?? null,
    average_breath: p?.average_breath ?? null,

    bedtime_start: p?.bedtime_start ?? null,
    bedtime_end: p?.bedtime_end ?? null,

    // Oura's own hypnogram: one digit per five minutes of the sleep period,
    // 1=deep 2=light 3=REM 4=awake. Until this was captured the last-night
    // dial had to be drawn from a sequence reconstructed to match the
    // published stage totals -- correct in proportion, invented in order.
    // With this stored, the dial is the actual night.
    sleep_phase_5_min: p?.sleep_phase_5_min ?? null,

    sleep_contributors: sleep?.contributors ?? null,
    readiness_contributors: readiness?.contributors ?? null,
    stress_summary: stress?.day_summary ?? null,
    stress_high: stress?.stress_high ?? null,
    recovery_high: stress?.recovery_high ?? null,

    fetched_at: new Date().toISOString(),
  };
}

export function readTelemetry() {
  if (!existsSync(FILE) || !hasKey()) return [];
  const byDate = new Map();
  for (const line of readFileSync(FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(decryptLine(line));
      // A later record for the same date supersedes an earlier one, so a
      // re-fetch corrects a night that was incomplete when first pulled.
      if (record?.date) byDate.set(record.date, record);
    } catch {
      /* skip unreadable line */
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Rewrite the whole file from a record set, one encrypted line per night. */
export function writeTelemetry(records) {
  if (!hasKey()) throw new MissingKeyError();
  mkdirSync(STATE_DIR, { recursive: true });
  const lines = records.map((r) => encryptLine(JSON.stringify(r)));
  writeFileSync(FILE, lines.length ? `${lines.join('\n')}\n` : '');
  return records.length;
}

/**
 * Merge new records in.
 *
 * Appends rather than rewriting. The whole file is ~1.4 MB after a three-year
 * backfill, and this is committed to git on every ingest -- rewriting it daily
 * would add a fresh 1.4 MB blob to history each time, half a gigabyte a year,
 * for the sake of one new night. Appending adds about a kilobyte instead, and
 * readTelemetry() already resolves duplicates by keeping the latest record for
 * a date, so a correction is just another append.
 *
 * Records identical to what is already stored are skipped, so a re-run that
 * fetches nothing new writes nothing at all.
 */
export function upsertTelemetry(incoming) {
  if (!hasKey()) throw new MissingKeyError();

  const existing = new Map(readTelemetry().map((r) => [r.date, r]));
  const fresh = [];
  let added = 0;
  let updated = 0;

  for (const record of incoming) {
    if (!record?.date) continue;
    const prior = existing.get(record.date);
    if (prior && sameNight(prior, record)) continue;
    if (prior) updated++;
    else added++;
    fresh.push(record);
  }

  // appendFileSync is reached ONLY when there is something new, which is why a
  // missing import here survived for days: every night with no new data returned
  // cleanly and the one path that mattered threw a ReferenceError that dispatch
  // caught and logged as "continuing". The regression test below appends.
  if (fresh.length) {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(FILE, `${fresh.map((r) => encryptLine(JSON.stringify(r))).join('\n')}\n`);
  }

  return { added, updated, total: existing.size + added };
}

// fetched_at changes on every pull, so comparing whole records would make every
// re-fetch look like a change. Compare only the measurements.
const COMPARED = [
  'sleep_score', 'readiness_score', 'total_sleep_duration', 'deep_sleep_duration',
  'rem_sleep_duration', 'light_sleep_duration', 'awake_time', 'time_in_bed',
  'efficiency', 'latency', 'average_hrv', 'average_heart_rate', 'lowest_heart_rate',
];
function sameNight(a, b) {
  return COMPARED.every((k) => a[k] === b[k]);
}

/**
 * Rewrite the file with one line per night, dropping superseded records.
 * Worth running occasionally once corrections have accumulated.
 */
export function compactTelemetry() {
  const records = readTelemetry();
  const before = existsSync(FILE) ? readFileSync(FILE, 'utf8').split('\n').filter(Boolean).length : 0;
  writeTelemetry(records);
  return { before, after: records.length };
}

export function hasNight(date) {
  return readTelemetry().some((r) => r.date === date && r.sleep_score != null);
}

/**
 * A night is COMPLETE only when its sleep period has arrived too.
 *
 * This distinction is the reason thirteen vitals rendered as dashes. The score
 * comes from daily_sleep and every duration, stage, HRV and heart-rate figure
 * comes from the sleep period, and Oura publishes the score first. hasNight only
 * asks about the score, so the moment one landed the ingest declared the night
 * settled and stopped retrying -- permanently, for that date. The period then
 * never arrived, and the screen had a real score with nothing behind it.
 *
 * I spent two passes on the request parameters looking for this and it was never
 * there: the pull was correct, it just stopped too early.
 */
export function nightComplete(date) {
  return readTelemetry().some(
    (r) => r.date === date && r.sleep_score != null && r.total_sleep_duration != null,
  );
}

/** Sleep scores oldest-first, for the statistics layer. */
export function scoreSeries() {
  return readTelemetry()
    .filter((r) => typeof r.sleep_score === 'number')
    .map((r) => ({ date: r.date, score: r.sleep_score }));
}

export { FILE as TELEMETRY_PATH };
