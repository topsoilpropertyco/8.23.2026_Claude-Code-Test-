// Builds the live "last night" screen.
//
// Unlike web/build.js, nothing here is synthetic. It reads the encrypted Oura
// telemetry, takes the most recent scored night, computes the baseline from
// every night before it, and writes those values into the composite design as
// its embedded JSON block. The design file itself is the template -- there is
// no second copy of the markup to drift out of sync.
//
// The telemetry is encrypted with SLEEPOS_DATA_KEY, which lives only in the
// repository secrets, so this runs in CI. Without the key it refuses rather
// than falling back to invented numbers.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig } from '../src/facts.js';
import { hasKey } from '../src/crypto.js';
import { readTelemetry } from '../src/telemetry.js';
import { percentileRank, zScore, mean, stdev } from '../src/stats.js';
import { localTimeString } from '../src/time.js';

const TEMPLATE = join(ROOT, 'variants/composite/index.html');
const OUT = join(ROOT, 'web/night.html');

/* ------------------------------------------------------------ formatting */

const hm = (s) => {
  if (s == null) return null;
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
const hMinM = (s) => {
  if (s == null) return null;
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const mmss = (s) => {
  if (s == null) return null;
  return s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
};
const clock = (iso, tz) => (iso ? localTimeString(new Date(iso), tz).slice(0, 5) : null);
const dateLabel = (d) => {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}`;
};

/* ----------------------------------------------------------- the hypnogram */

// Oura's own five-minute series is the truth. When a night predates the field
// being captured, a reconstruction is built from the stage durations instead --
// proportionally correct, invented in order -- and labelled as such so the
// screen never implies precision it does not have.
export function reconstructPhases(rec) {
  const five = (s) => Math.round((s ?? 0) / 300);
  const want = { 1: five(rec.deep_sleep_duration), 3: five(rec.rem_sleep_duration),
                 2: five(rec.light_sleep_duration), 4: five(rec.awake_time) };
  const total = want[1] + want[2] + want[3] + want[4];
  if (!total) return '';

  // Physiology, not randomness: deep is front-loaded, REM back-loaded, light
  // fills the rest, and waking is spread thinly across the whole night.
  const out = new Array(total).fill(2);
  let placed = 0;
  for (let i = 0; i < want[1] && placed < total; i++) {
    out[Math.min(total - 1, Math.round((i / Math.max(1, want[1])) * total * 0.45))] = 1;
    placed++;
  }
  for (let i = 0; i < want[3]; i++) {
    out[Math.min(total - 1, Math.round(total * 0.35 + (i / Math.max(1, want[3])) * total * 0.62))] = 3;
  }
  for (let i = 0; i < want[4]; i++) {
    out[Math.min(total - 1, Math.round((i + 0.5) * (total / Math.max(1, want[4]))))] = 4;
  }
  return out.join('');
}

/* -------------------------------------------------------------------- build */

export function buildNightData(records, tz) {
  const scored = records.filter((r) => r.sleep_score != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!scored.length) throw new Error('no scored nights in telemetry');

  const last = scored[scored.length - 1];
  const history = scored.slice(0, -1).map((r) => r.sleep_score);
  if (history.length < 30) throw new Error(`only ${history.length} prior nights; need 30 for a baseline`);

  // Counted, not derived from the percentile, so the sentence is literally true.
  const betterThan = history.filter((s) => s < last.sleep_score).length;

  return {
    date: last.date,
    dateLabel: dateLabel(last.date),
    score: last.sleep_score,
    readiness: last.readiness_score ?? '—',
    percentile: Math.round(percentileRank(last.sleep_score, history)),
    betterThan,
    n: history.length,
    z: Number(zScore(last.sleep_score, history).toFixed(2)),
    mean: Number(mean(history).toFixed(1)),
    sd: Number(stdev(history).toFixed(2)),
    bedtime: clock(last.bedtime_start, tz) ?? '—',
    wake: clock(last.bedtime_end, tz) ?? '—',
    deep: hm(last.deep_sleep_duration) ?? '—',
    rem: hm(last.rem_sleep_duration) ?? '—',
    light: hm(last.light_sleep_duration) ?? '—',
    awake: hm(last.awake_time) ?? '—',
    asleep: hMinM(last.total_sleep_duration) ?? '—',
    efficiency: last.efficiency ?? '—',
    latency: mmss(last.latency) ?? '—',
    phases: last.sleep_phase_5_min || reconstructPhases(last),
    phasesSource: last.sleep_phase_5_min ? 'oura' : 'reconstructed',
  };
}

export function renderNight(templateHtml, data) {
  const open = '<script id="night" type="application/json">';
  const start = templateHtml.indexOf(open);
  const end = templateHtml.indexOf('</script>', start);
  if (start === -1 || end === -1) throw new Error('composite template has no night data block');
  return templateHtml.slice(0, start + open.length) +
    '\n' + JSON.stringify(data, null, 1) + '\n' +
    templateHtml.slice(end);
}

/* ---------------------------------------------------------------------- cli */

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!hasKey()) {
    console.error(
      'build-night: SLEEPOS_DATA_KEY is not set, so the telemetry cannot be read.\n' +
      '             Refusing to emit a screen full of invented numbers.\n' +
      '             This builds in CI, where the secret exists.');
    process.exit(1);
  }
  const config = loadConfig();
  const data = buildNightData(readTelemetry(), config.timezone);
  writeFileSync(OUT, renderNight(readFileSync(TEMPLATE, 'utf8'), data));
  console.log(
    `build-night: ${data.date} · score ${data.score} · ${data.percentile}th of ${data.n} ` +
    `· hypnogram ${data.phasesSource} (${data.phases.length} ticks) → web/night.html`);
}
