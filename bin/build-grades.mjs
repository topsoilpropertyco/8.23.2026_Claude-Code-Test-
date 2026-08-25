#!/usr/bin/env node
// Builds the score table for SETH'S OWN nights, and the markdown to check it by.
//
// Empirical wherever it can be. Given real telemetry this does no modelling at
// all: it counts nights. Every percentile is a census of his own history, which
// is why this table has no confidence column and the member table needs one --
// the member percentiles rest on an SD Oura has never published, his rest on
// 1,042 nights that actually happened.
//
// Without the decryption key there is nothing to count, so it falls back to a
// beta fit on the recorded mean, SD and count, and stamps `modelled: true` on
// the output. Every consumer of that flag must say so on its face. A provisional
// number that looks final is worse than no number.
//
//   node bin/build-grades.mjs            # write data/my-score-table.json + markdown
//   node bin/build-grades.mjs --check    # fail if the output is modelled

import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreSeries } from '../src/telemetry.js';
import { gradesFor, loadReference, memberStanding } from '../src/grades.js';
import { mean as avg, stdev, percentileRank } from '../src/stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LO = 40, HI = 99;

// Recorded from his real history in an earlier session that held the key. Used
// only for the modelled fallback, never when the real nights are readable.
const RECORDED = { mean: 79.3, sd: 9.54, n: 1042 };

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularised incomplete beta, by continued fraction. */
function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  if (x > (a + 1) / (a + b + 2)) return 1 - betaCdf(1 - x, b, a);
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2);
    let num;
    if (i === 0) num = 1;
    else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= c * d;
    if (Math.abs(1 - c * d) < 1e-10) break;
  }
  return (front * (f - 1)) / a;
}

/** Beta on [lo, 100] matched to a mean and SD -- bounded, and able to skew left. */
function fitBeta({ mean: m, sd }, lo = 30, hi = 100) {
  const range = hi - lo;
  const mu = (m - lo) / range;
  const v = (sd / range) ** 2;
  const k = (mu * (1 - mu)) / v - 1;
  return { a: mu * k, b: (1 - mu) * k, lo, hi };
}

const series = scoreSeries();
const scores = series.map((r) => r.score).filter(Number.isFinite);
const modelled = scores.length < 30;

let rows;
let population;

if (!modelled) {
  const m = avg(scores), sd = stdev(scores);
  population = {
    label: 'Your own nights', mean: +m.toFixed(2), sd: +sd.toFixed(2), n: scores.length,
    median: [...scores].sort((x, y) => x - y)[Math.floor(scores.length / 2)],
    first: series[0].date, last: series[series.length - 1].date, modelled: false,
  };
  rows = [];
  for (let s = LO; s <= HI; s++) {
    const at = scores.filter((x) => x === s).length;
    const worse = scores.filter((x) => x < s).length;
    const p = percentileRank(s, scores);
    rows.push({
      score: s, percentile: +p.toFixed(1), nights: at, worse, better: scores.length - worse - at,
      sd: sd ? +((s - m) / sd).toFixed(2) : null,
      // A percentile is exact; whether it is *stable* depends on how many nights
      // sit nearby. Fewer than three is a thin estimate, not a wrong one.
      thin: at < 3,
      grades: gradesFor(p),
    });
  }
} else {
  const fit = fitBeta(RECORDED);
  population = {
    label: 'Your own nights', ...RECORDED, median: null,
    modelled: true,
    modelNote: 'Telemetry unreadable in this environment (no SLEEPOS_DATA_KEY). '
      + 'Percentiles are a beta fit on the recorded mean, SD and count, not counted nights. '
      + 'Re-run where the key is present to replace every row with a census.',
  };
  rows = [];
  for (let s = LO; s <= HI; s++) {
    const p = betaCdf((s - fit.lo) / (fit.hi - fit.lo), fit.a, fit.b) * 100;
    rows.push({
      score: s, percentile: +p.toFixed(1), nights: null,
      worse: Math.round((p / 100) * RECORDED.n),
      better: RECORDED.n - Math.round((p / 100) * RECORDED.n),
      sd: +((s - RECORDED.mean) / RECORDED.sd).toFixed(2),
      thin: p < 2 || p > 98, grades: gradesFor(p),
    });
  }
}

const out = {
  _comment: 'Seth\'s own nights, score to percentile to three letter grades. Generated by '
    + 'bin/build-grades.mjs. Same three curves as the member table so the two are comparable.',
  population, generated: new Date().toISOString().slice(0, 10), table: rows,
};
writeFileSync(join(ROOT, 'data/my-score-table.json'), JSON.stringify(out, null, 2));

/* ------------------------------------------------------------------ markdown */

const ref = loadReference();
const g = (r) => `${r.grades.standard} | ${r.grades.bell} | **${r.grades.curved}**`;
const L = [];
L.push('# My own score table');
L.push('');
L.push('**Every sleep score from 40 to 99, where it sits among my own nights, and the same three');
L.push('letter grades the member table uses.** Generated by `bin/build-grades.mjs`.');
L.push('');
if (modelled) {
  L.push('> ⚠️ **PROVISIONAL — MODELLED, NOT COUNTED.** ' + population.modelNote);
} else {
  L.push(`Population: **my own ${population.n} nights**, ${population.first} to ${population.last}. `
    + `Mean **${population.mean}**, median **${population.median}**, SD **${population.sd}**.`);
  L.push('');
  L.push('**Every percentile here is counted, not modelled.** This table needs no confidence column');
  L.push('and no inferred spread: it is a census of nights that actually happened. That is the one');
  L.push('way it is strictly stronger than the member table, whose percentiles rest on an SD Oura');
  L.push('has never published.');
}
L.push('');
L.push('## The three curves');
L.push('');
L.push('Identical to the member table, deliberately. Holding them fixed is what makes the two');
L.push('screens comparable: one score, two populations, and the gap between the grades is the');
L.push('thing worth looking at.');
L.push('');
L.push('One property to know before reading the Standard column: **it fails ~60% of my nights and');
L.push('always will.** Standard puts its pass line at the 60th percentile, and a pass line at the');
L.push('60th percentile fails 60% of any dataset, forever, however well I sleep. It is a fact about');
L.push('ranking, not about sleep. The Curved column is the one that moves.');
L.push('');
L.push('## The table');
L.push('');
L.push('| Score | Percentile | Nights | Worse | Better | SD | Standard | Bell | **Curved** | vs members |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const m = memberStanding(r.score);
  const delta = m.percentile !== null ? (m.percentile - r.percentile) : null;
  const vs = delta === null ? '—'
    : `${m.display ? m.percentile.toFixed(1) : '·'} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`;
  L.push(`| ${r.score} | ${r.percentile.toFixed(1)}${r.thin ? ' ·' : ''} | ${r.nights ?? '—'} | ${r.worse} | ${r.better} | `
    + `${r.sd >= 0 ? '+' : ''}${r.sd.toFixed(2)} | ${g(r)} | ${vs} |`);
}
L.push('');
L.push('`·` marks a thin row: the percentile is exact, but few of my nights sit at that score, so it');
L.push('moves easily. In the **vs members** column, `·` means the member table has that row at low');
L.push('confidence and is not allowed to print a number for it.');
L.push('');
L.push('## What the comparison says');
L.push('');
const anchors = [88, 79, 77, 70];
L.push('| Score | Among my nights | Among member nights | Curved: mine → members |');
L.push('|---|---|---|---|');
for (const s of anchors) {
  const r = rows.find((x) => x.score === s);
  const m = memberStanding(s);
  L.push(`| ${s} | ${r.percentile.toFixed(1)} (**${r.grades.curved}**) | `
    + `${m.display ? m.percentile.toFixed(1) : 'suppressed'} (**${m.grades.curved}**) | `
    + `${r.grades.curved} → ${m.grades.curved} |`);
}
L.push('');
const mine88 = rows.find((x) => x.score === 88);
const mem88 = memberStanding(88);
L.push(`An 88 is the **${mine88.percentile.toFixed(1)}th** percentile of my own nights and the `
  + `**${mem88.percentile.toFixed(1)}th** of member nights. The gap is the whole story: I sleep better`);
L.push('than the member average, so my own history is the tougher field. Graded against Oura members');
L.push(`an 88 is a **${mem88.grades.curved}**; graded against my own nights it is a `
  + `**${mine88.grades.curved}**.`);
L.push('');
L.push('---');
L.push('');
L.push('*Member-night figures from `references/07-SCORE-REFERENCE-TABLE.md`; see');
L.push('`references/07-VERIFICATION.md` for what was checked and the one defect found in it.*');
writeFileSync(join(ROOT, 'references/08-MY-SCORE-TABLE.md'), L.join('\n') + '\n');

if (process.argv.includes('--check') && modelled) {
  console.error('build-grades: output is MODELLED. Re-run where SLEEPOS_DATA_KEY is set.');
  process.exit(1);
}
console.log(`build-grades: ${rows.length} rows, ${modelled ? 'MODELLED (provisional)' : `empirical from ${population.n} nights`}`);
console.log('  data/my-score-table.json');
console.log('  references/08-MY-SCORE-TABLE.md');
