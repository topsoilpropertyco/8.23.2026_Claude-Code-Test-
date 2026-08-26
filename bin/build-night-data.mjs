#!/usr/bin/env node
// Extracts everything the screens need for ONE night from real telemetry.
//
// This exists because the screens used to carry their night in source: the
// builder opened with `SCORE, BELOW, ABOVE, RANK, PCT = 88, 844, 197, 198, 81`.
// That made the whole deck a photograph of one morning. Rebuilding it changed
// nothing, because there was no input to change -- the numbers were the code.
// Seth caught it the only way it could be caught, by getting a message about a
// 74 whose link showed him an 88.
//
// So the night is now data. build-screens.py reads this file and refuses to run
// without it, which means a stale score is no longer expressible: there is
// nowhere left to hardcode one.
//
//   node bin/build-night-data.mjs              # latest night in telemetry
//   node bin/build-night-data.mjs 2026-08-24   # a specific night
//   node bin/build-night-data.mjs --sample 74  # marked sample, for design work only

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readTelemetry } from '../src/telemetry.js';
import { analyseNight, fromTelemetry } from '../src/night.js';
import { mean as avg, stdev, percentileRank, trailing } from '../src/stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const wanted = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : null;

// A marked sample, so the layout can be checked where the key does not exist --
// and so that changing the score visibly changes the screens, which is the
// regression this whole file exists to prevent. Every screen renders a SAMPLE
// banner off this flag. data/last-night.json is gitignored precisely so a sample
// can never be committed and mistaken for a night.
if (process.argv.includes('--sample')) {
  const s = Number(process.argv[process.argv.indexOf('--sample') + 1]) || 74;
  const R = { mean: 79.3, sd: 9.54, n: 1042 };
  const lo = 30, hi = 100, mu = (R.mean - lo) / (hi - lo), v = (R.sd / (hi - lo)) ** 2;
  const k = (mu * (1 - mu)) / v - 1;
  const cdf = (x, a, b) => {           // regularised incomplete beta, series form
    let sum = 0;
    const lb = (n) => { let t = 0; for (let i = 2; i < n; i++) t += Math.log(i); return t; };
    for (let i = 0; i < 4000; i++) {
      const t = (i + 0.5) / 4000;
      sum += Math.pow(t, a - 1) * Math.pow(1 - t, b - 1) * (t <= x ? 1 : 0);
    }
    let norm = 0;
    for (let i = 0; i < 4000; i++) { const t = (i + 0.5) / 4000; norm += Math.pow(t, a - 1) * Math.pow(1 - t, b - 1); }
    return sum / norm;
  };
  const p = cdf((s - lo) / (hi - lo), mu * k, (1 - mu) * k) * 100;
  const below = Math.round((p / 100) * R.n), above = R.n - below - 1;
  const out = {
    _comment: 'SAMPLE -- not a real night. Generated with --sample for layout work only.',
    sample: true, generated: new Date().toISOString(), date: 'SAMPLE', score: s,
    population: { ...R, median: 80, first: 'SAMPLE', last: 'SAMPLE' },
    standing: { below, above, ties: 1, rank: above + 1, percentile: +p.toFixed(1),
                z: +((s - R.mean) / R.sd).toFixed(2) },
    trailing: [7, 30, 90, 180, 365].map((w) => ({ window: w, days: w, avg: null, partial: false })),
    night: { asleepMinutes: null, asleepLabel: null, inBedMinutes: null, deep: null, rem: null,
             light: null, awake: null, efficiency: null, latency: null, hrv: null,
             restingHr: null, breath: null, bedtimeStart: null, bedtimeEnd: null, hypnogram: null },
  };
  writeFileSync(join(ROOT, 'data/last-night.json'), JSON.stringify(out, null, 2));

  console.log(`build-night-data: SAMPLE score ${s} · ${out.standing.percentile}th percentile `
    + `· rank ${out.standing.rank}/${R.n} — layout only, never a real night`);
  process.exit(0);
}

// Mapped into the canonical shape src/night.js works in, so the analysis that
// runs here is the identical function the browser runs against the embedded
// series. One implementation, so the file the screens are generated from and the
// object the date picker feeds those same templates cannot disagree.
const canonical = readTelemetry()
  .filter((r) => typeof r.sleep_score === 'number')
  .map(fromTelemetry);

const all = readTelemetry()
  .filter((r) => typeof r.sleep_score === 'number')
  .sort((a, b) => a.date.localeCompare(b.date));

if (!all.length) {
  console.error('build-night-data: no readable telemetry.');
  console.error('  The history is AES-256-GCM encrypted; set SLEEPOS_DATA_KEY to read it.');
  console.error('  Refusing to emit a night, because an invented one would render as real.');
  process.exit(1);
}

const night = wanted ? all.find((r) => r.date === wanted) : all[all.length - 1];
if (!night) {
  console.error(`build-night-data: no night on ${wanted}.`);
  process.exit(1);
}

const scores = all.map((r) => r.sleep_score);
const m = avg(scores), sd = stdev(scores);
const score = night.sleep_score;


// The analysis itself now comes from src/night.js. What used to be seventy lines
// of arithmetic here was the only copy of it, which is exactly why the screens
// could describe one night and no other: the maths lived on the server, beside
// the key. It is a pure function of (nights, date) now, so the browser runs it
// too.
const analysed = analyseNight({ nights: canonical, date: wanted || null });
if (!analysed) {
  console.error(`build-night-data: no night on ${wanted || 'record'}.`);
  process.exit(1);
}

const out = {
  _comment: 'One night, extracted from real telemetry by bin/build-night-data.mjs. '
    + 'Never hand-edit: build-screens.py renders whatever is here as fact.',
  ...analysed,
  generated: new Date().toISOString(),
};

writeFileSync(join(ROOT, 'data/last-night.json'), JSON.stringify(out, null, 2));

// The whole history, for the interactive dashboard's charts. One night per row,
// short keys because this is a thousand-plus records embedded in a page: d date,
// s score, t total sleep minutes, dp/rm/lt/aw stage minutes, ef efficiency,
// la latency, hv HRV, hr lowest heart rate, br breathing rate.
//
// Gitignored like last-night.json -- it is the real record in plaintext, and the
// only place it is allowed to exist is inside the encrypted page.
const mn = (sec) => (typeof sec === 'number' ? Math.round(sec / 60) : null);
writeFileSync(join(ROOT, 'data/series.json'), JSON.stringify({
  _comment: 'Full night history for the dashboard. Generated; never hand-edited.',
  generated: out.generated,
  nights: all.map((r) => ({
    d: r.date, s: r.sleep_score,
    t: mn(r.total_sleep_duration), dp: mn(r.deep_sleep_duration),
    rm: mn(r.rem_sleep_duration), lt: mn(r.light_sleep_duration),
    aw: mn(r.awake_time), ef: r.efficiency, la: mn(r.latency),
    hv: r.average_hrv, hr: r.lowest_heart_rate,
    br: typeof r.average_breath === 'number' ? Math.round(r.average_breath * 10) / 10 : null,
    // Added so a night chosen in the browser can show what screen 6 shows for
    // last night. Without these the date picker could render seven screens.
    ib: mn(r.time_in_bed), bs: r.bedtime_start ?? null, be: r.bedtime_end ?? null,
  })),
}));

// A score-free health record, committed to the repository so the pipeline can be
// inspected without waiting on a job to finish. That matters now the engine runs
// for six hours at a stretch: Actions will not serve a step's log until the job
// ends, so a long window is otherwise a black box until the evening.
//
// Deliberately carries no scores and no vital VALUES -- this file is public.
// Counts and booleans only, which is enough to answer the questions that
// actually come up: did the ingest run, did the sleep period arrive, how many
// vitals were readable, how far behind is the ring.
const vitals = ['deep', 'rem', 'light', 'awake', 'asleepMinutes', 'inBedMinutes',
                'efficiency', 'latency', 'hrv', 'restingHr', 'breath',
                'bedtimeStart', 'bedtimeEnd'];
const present = vitals.filter((k) => out.night[k] !== null && out.night[k] !== undefined).length;
writeFileSync(join(ROOT, 'state/health.json'), `${JSON.stringify({
  _comment: 'Score-free pipeline health, written by bin/build-night-data.mjs. Public file: '
    + 'counts and booleans only, never a score or a vital value.',
  generated: out.generated,
  night: out.date,
  daysBehind: out.daysBehind,
  stale: out.stale,
  nightsOnRecord: out.population.n,
  // The one that has been wrong twice: the score comes from daily_sleep and every
  // duration, stage and vital comes from the sleep period, which was arriving one
  // row short.
  hasSleepPeriod: out.night.asleepMinutes !== null,
  vitalsPresent: present,
  vitalsTotal: vitals.length,
  hypnogram: Boolean(out.night.hypnogram),
}, null, 2)}\n`);
console.log(`build-night-data: ${out.date} score ${score} · rank ${out.standing.rank}/${out.population.n} `
  + `· ${out.standing.percentile}th percentile · mean ${out.population.mean} sd ${out.population.sd}`);
if (out.stale) {
  console.warn(`build-night-data: WARNING the newest Oura night is ${out.daysBehind} days old. `
    + 'The ring has not synced. Screens will name the date they actually show.');
}
