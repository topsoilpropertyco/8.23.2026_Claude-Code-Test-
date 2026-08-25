#!/usr/bin/env node
// The interactive dashboard: one page, the whole history, manipulable.
//
// This replaces a scrolling column of eight fixed 390x844 renders. Those answered
// one question each and answered it the same way every morning; you could scroll
// past them but not ask anything of them. Seth's words: he would rather have a
// link he can "manipulate as I see fit".
//
// So the data is in the page rather than baked into a picture of the data. Every
// night is present, the ranges are selectable, every mark has a hover, and the
// table sorts. Nothing here is a screenshot.
//
// Self-contained by necessity: it is encrypted and served as one file, so there
// is no second request to make. No chart library either -- the marks are SVG
// built from the series, which is a few hundred lines and avoids shipping a
// framework inside a payload that has to stay small enough to decrypt on a phone.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

// Overridable for the same reason the state directory is: a test needs to build
// against its own fixture without writing over the files the real pipeline reads
// on the runner. Same bug class that once planted fabricated nights in the real
// history, so the override goes in before the test does, not after.
const SERIES = process.env.SLEEPOS_SERIES || 'data/series.json';
const NIGHT = process.env.SLEEPOS_NIGHT || 'data/last-night.json';
const OUT = process.env.SLEEPOS_DASHBOARD_OUT || 'web/deck.html';

const series = read(SERIES);
const night = read(NIGHT);
const curves = read('data/grade-curves.json').curves;
const memberRef = read('data/oura-score-reference.json');

const nights = series.nights.filter((n) => typeof n.s === 'number');
if (nights.length < 2) {
  console.error('build-dashboard: need at least two scored nights.');
  process.exit(1);
}

// Everything the page needs, in one payload. The page does its own maths so the
// ranges can change without a rebuild -- that is the whole point of it being
// interactive rather than rendered.
const payload = {
  generated: new Date().toISOString(),
  sample: Boolean(night.sample),
  stale: Boolean(night.stale),
  daysBehind: night.daysBehind ?? 0,
  last: { date: night.date, score: night.score },
  nights,
  curves: curves.map((c) => ({ id: c.id, name: c.name, blurb: c.blurb, bands: c.bands })),
  member: {
    label: memberRef.population.label,
    mean: memberRef.population.mean,
    // Only the rows allowed to show a number. The rest may grade but not print a
    // percentile -- they rest on extrapolation into a part of the curve where
    // nothing was ever observed.
    table: memberRef.table
      .filter((r) => r.confidence !== 'low')
      .map((r) => ({ score: r.score, pct: r.percentile, ci: r.ci })),
  },
};

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sleep OS — ${night.date}</title>
<meta name="theme-color" content="#1a1a19">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
/* Dark is selected, not an inverted light theme: these are the dark steps of the
   same ramps, validated against the #1a1a19 surface. */
:root{
  --surface:#1a1a19; --raised:#232321; --line:#34342f;
  --ink:#ffffff; --ink2:#c3c2b7; --ink3:#8a8a80;
  --series:#3987e5;                 /* the one categorical slot: validated dark */
  --good:#0ca30c; --warn:#fab219; --bad:#d03b3b;   /* reserved status, always labelled */
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--surface);color:var(--ink);font-family:'Newsreader',Georgia,serif;
  -webkit-font-smoothing:antialiased;padding-bottom:60px}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.wrap{max-width:1080px;margin:0 auto;padding:0 18px}
.bar{position:sticky;top:0;z-index:30;background:rgba(26,26,25,.96);backdrop-filter:blur(12px);
  border-bottom:1px solid var(--line);padding:10px 18px;display:flex;gap:14px;
  align-items:baseline;flex-wrap:wrap}
/* On a phone the header would wrap to two lines and eat the viewport. The date is
   the first thing to go: it is in the hero and in every table row already. */
@media(max-width:520px){
  .bar{gap:11px;padding:9px 14px}
  .bar .when{display:none}
  .wrap{padding:0 14px}
}
.bar b.brand{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.24em;
  text-transform:uppercase}
.bar .s{font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink2);letter-spacing:.08em}
.bar .s i{font-style:normal;color:var(--ink);font-weight:600}
.bar .when{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--ink3)}
.warnbar{background:#4a1f1f;color:#f7d9d9;padding:9px 18px;font-family:'IBM Plex Mono',monospace;
  font-size:11px;line-height:1.5}
h1{font-size:clamp(26px,6vw,38px);font-weight:400;letter-spacing:-.02em;padding-top:32px}
.sub{color:var(--ink2);font-size:14px;line-height:1.6;max-width:60ch;margin-top:8px}
section{margin-top:34px}
h2{font-size:17px;font-weight:500;letter-spacing:-.01em;display:flex;align-items:baseline;gap:10px}
h2 span{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--ink3);font-weight:600}
.note{font-size:11px;line-height:1.6;color:var(--ink3);margin-top:8px;max-width:70ch;
  font-family:'IBM Plex Mono',monospace;letter-spacing:.02em}
.note b{color:var(--ink2);font-weight:600}
.card{background:var(--raised);border:1px solid var(--line);border-radius:3px;
  padding:16px;margin-top:12px}
/* Filters sit in one row above the chart they drive. */
.ctl{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.ctl button{background:transparent;border:1px solid var(--line);color:var(--ink2);
  border-radius:2px;padding:6px 12px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;
  letter-spacing:.1em;text-transform:uppercase;cursor:pointer;min-height:34px}
.ctl button:hover{border-color:var(--ink2);color:var(--ink)}
.ctl button[aria-pressed=true]{background:var(--series);border-color:var(--series);color:#fff}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:12px;margin-top:14px}
.tile{background:var(--raised);border:1px solid var(--line);border-radius:3px;padding:13px 14px}
.tile .k{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--ink3);font-weight:600}
.tile .v{font-family:'IBM Plex Mono',monospace;font-size:27px;font-weight:500;
  margin-top:5px;letter-spacing:-.02em}
.tile .d{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink3);margin-top:3px}
svg{display:block;width:100%;height:auto;overflow:visible;touch-action:pan-y}
.grid line{stroke:var(--line);stroke-width:1}
.axis text{fill:var(--ink3);font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.06em}
.tip{position:fixed;z-index:60;pointer-events:none;opacity:0;transition:opacity .1s;
  background:#0e0e0d;border:1px solid var(--line);border-radius:3px;padding:9px 11px;
  font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.6;
  box-shadow:0 10px 30px rgba(0,0,0,.6);max-width:230px}
.tip .h{color:var(--ink);font-weight:600;letter-spacing:.06em}
.tip .r{color:var(--ink2);display:flex;justify-content:space-between;gap:14px}
.tip .r b{color:var(--ink);font-weight:600}
table{width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:11.5px}
th{text-align:right;padding:8px 9px;border-bottom:1px solid var(--ink2);color:var(--ink2);
  font-size:9px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;white-space:nowrap;
  user-select:none}
th:first-child,td:first-child{text-align:left}
th[aria-sort]{color:var(--ink)}
/* No wrapping: a wide table scrolls inside its own container rather than growing
   two-line rows on a phone. */
td{text-align:right;padding:7px 9px;border-bottom:1px solid var(--line);color:var(--ink2);
  white-space:nowrap}
tr:hover td{background:#26261f;color:var(--ink)}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tblwrap{max-height:420px;overflow-y:auto;margin-top:12px;border:1px solid var(--line);border-radius:3px}
.gradebar{display:flex;height:30px;margin-top:7px;border:1px solid var(--line);position:relative}
.gradebar>div:not(.mk){display:flex;align-items:center;justify-content:center;
  font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;overflow:hidden}
.gradebar .mk{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink);z-index:2}
.grow{margin-top:15px}
.grow .top{display:flex;justify-content:space-between;align-items:baseline}
.grow .nm{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--ink3);font-weight:600}
.grow .g{font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600}
.rng{display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;
  font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin-top:6px}
input[type=range]{width:100%;margin-top:14px;accent-color:var(--series);min-height:34px}
.foot{color:var(--ink3);font-family:'IBM Plex Mono',monospace;font-size:10px;line-height:1.8;
  letter-spacing:.03em;margin-top:40px;padding-top:18px;border-top:1px solid var(--line)}
</style></head>
<body data-palette="#3987e5">
<div class="bar">
  <b class="brand">Sleep OS</b>
  <span class="s">Score <i id="hScore">—</i></span>
  <span class="s">Percentile <i id="hPct">—</i></span>
  <span class="s">Curved <i id="hGrade">—</i></span>
  <span class="when" id="hWhen">—</span>
</div>
<div id="banner"></div>
<div class="wrap">
  <h1>Your sleep, all of it.</h1>
  <p class="sub">Every night on record, not a picture of one morning. Change the range,
  hover any night, sort by anything, and drag the score to see how the grades move.</p>

  <div class="tiles" id="tiles"></div>

  <section>
    <h2>Score over time <span id="trLabel"></span></h2>
    <div class="ctl" id="ranges"></div>
    <div class="card"><svg id="lineChart" viewBox="0 0 900 300" role="img"
      aria-label="Sleep score over the selected range"></svg></div>
    <p class="note">The heavy line is a 7-night rolling mean; the faint marks are the
    individual nights. Hover or drag across the chart for any single night.</p>
  </section>

  <section>
    <h2>Distribution <span>where nights fall</span></h2>
    <div class="card"><svg id="histChart" viewBox="0 0 900 260" role="img"
      aria-label="How many nights fall in each score band"></svg></div>
    <p class="note">Each bar is a two-point score band over the selected range. The
    marked line is <b id="histMark">last night</b>. Bars are coloured by the thirds of
    your own history — bottom third, middle, top — and every band is labelled, so the
    colour is never carrying the meaning alone.</p>
  </section>

  <section>
    <h2>Grades <span>drag to any score</span></h2>
    <div class="card">
      <input type="range" id="scoreSlider" min="40" max="99" step="1">
      <div class="rng"><span>40</span><span id="sliderVal" style="color:var(--ink)">—</span><span>99</span></div>
      <div id="gradeRows"></div>
    </div>
    <p class="note">All three curves grade a <b>percentile</b>, never a raw score, so one
    marker cuts through all three and the reason the letters differ is visible: the bands
    sit in different places. Percentiles here are against <b>your own nights</b>; the
    member column in the table below is the published comparison.</p>
  </section>

  <section>
    <h2>Every night <span>sortable</span></h2>
    <div class="ctl" id="tblCtl"></div>
    <div class="tblwrap scroll"><table id="tbl"><thead></thead><tbody></tbody></table></div>
    <p class="note">The table is the same data as the charts — it exists so nothing here
    depends on reading a colour or a shape. Click a heading to sort.</p>
  </section>

  <p class="foot" id="foot"></p>
</div>
<div class="tip" id="tip"></div>
<script id="payload" type="application/json">${JSON.stringify(payload)}</script>
<script>
const D = JSON.parse(document.getElementById('payload').textContent);
const N = D.nights;
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d));
const hm = (m) => (m == null ? '—' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm');
const S = getComputedStyle(document.documentElement);
const C = (n) => S.getPropertyValue(n).trim();

/* ------------------------------------------------------------------ statistics */
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
// Empirical, counting nights rather than fitting a curve: scores are bounded at
// 100 and left-skewed, so a normal fit puts nights above 100, which cannot happen.
const pctOf = (v, arr) => {
  if (arr.length < 2) return null;
  const below = arr.filter((x) => x < v).length;
  const equal = arr.filter((x) => x === v).length;
  return ((below + 0.5 * equal) / arr.length) * 100;
};
const gradeAt = (pct, curve) => {
  if (pct == null) return '—';
  for (const b of curve.bands) if (pct >= b.min) return b.grade;
  return '—';
};
const ALL = N.map((n) => n.s);
const MEAN = mean(ALL), SD = sd(ALL);
// Thirds of his own history, never an outside norm.
const sorted = [...ALL].sort((a, b) => a - b);
const T1 = sorted[Math.floor(sorted.length / 3)];
const T2 = sorted[Math.floor((2 * sorted.length) / 3)];
const bandOf = (s) => (s < T1 ? 'bad' : s < T2 ? 'mid' : 'good');
const BANDC = { bad: C('--bad'), mid: C('--warn'), good: C('--good') };
const BANDN = { bad: 'bottom third', mid: 'middle third', good: 'top third' };

/* ---------------------------------------------------------------------- ranges */
const RANGES = [['30', 30], ['90', 90], ['365', 365], ['All', 0]];
let range = 90;
const inRange = () => (range === 0 ? N : N.slice(-range));

/* --------------------------------------------------------------------- tooltip */
const tip = $('tip');
function showTip(e, html) {
  tip.innerHTML = html;
  tip.style.opacity = '1';
  const r = tip.getBoundingClientRect();
  const x = Math.min(Math.max(8, e.clientX + 14), innerWidth - r.width - 8);
  const y = Math.min(Math.max(8, e.clientY - r.height - 12), innerHeight - r.height - 8);
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
const hideTip = () => { tip.style.opacity = '0'; };
const nightTip = (n) => {
  const p = pctOf(n.s, ALL);
  return '<div class="h">' + n.d + '</div>'
    + row('Score', n.s) + row('Percentile', fmt(p) + 'th')
    + row('Asleep', hm(n.t)) + row('Efficiency', n.ef == null ? '—' : n.ef + '%')
    + row('HRV', n.hv == null ? '—' : n.hv + ' ms')
    + row('Lowest HR', n.hr == null ? '—' : n.hr + ' bpm');
};
const row = (k, v) => '<div class="r"><span>' + k + '</span><b>' + v + '</b></div>';

/* ------------------------------------------------------------------ line chart */
// On a phone the viewBox matches the rendered width 1:1, so 9px axis text renders
// at 9px rather than being scaled down to something unreadable. 62 is the wrap
// padding plus the card padding either side.
const chartW = () => (innerWidth < 560 ? Math.max(280, innerWidth - 62) : 900);
const LH = 300, LM = { t: 14, r: 14, b: 26, l: 34 };
function drawLine() {
  const LW = chartW();
  const data = inRange();
  const svg = $('lineChart');
  svg.setAttribute('viewBox', '0 0 ' + LW + ' ' + LH);
  const w = LW - LM.l - LM.r, h = LH - LM.t - LM.b;
  const lo = Math.max(0, Math.min(...data.map((n) => n.s)) - 4);
  const hi = Math.min(100, Math.max(...data.map((n) => n.s)) + 4);
  const x = (i) => LM.l + (data.length < 2 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v) => LM.t + h - ((v - lo) / (hi - lo)) * h;

  let g = '';
  // Recessive grid, four steps.
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    g += '<line x1="' + LM.l + '" x2="' + (LW - LM.r) + '" y1="' + y(v).toFixed(1)
      + '" y2="' + y(v).toFixed(1) + '"/>';
    g += '<text x="' + (LM.l - 7) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">'
      + v.toFixed(0) + '</text>';
  }
  // Individual nights recede; the rolling mean carries the shape.
  const dots = data.map((n, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(n.s).toFixed(1)
    + '" r="' + (data.length > 200 ? 1.1 : 2) + '" fill="' + C('--series') + '" opacity=".34"/>').join('');
  const K = Math.min(7, Math.max(2, Math.round(data.length / 12)));
  const roll = data.map((_, i) => {
    const s = data.slice(Math.max(0, i - K + 1), i + 1).map((n) => n.s);
    return mean(s);
  });
  const path = roll.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const meanY = y(MEAN);
  svg.innerHTML = '<g class="grid axis">' + g + '</g>'
    + '<line x1="' + LM.l + '" x2="' + (LW - LM.r) + '" y1="' + meanY.toFixed(1) + '" y2="'
      + meanY.toFixed(1) + '" stroke="' + C('--ink3') + '" stroke-width="1" stroke-dasharray="3 4"/>'
    + '<text class="axis" x="' + (LW - LM.r) + '" y="' + (meanY - 6).toFixed(1)
      + '" text-anchor="end" fill="' + C('--ink3') + '">all-time mean ' + fmt(MEAN) + '</text>'
    + dots
    + '<path d="' + path + '" fill="none" stroke="' + C('--series')
      + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    + '<g class="axis"><text x="' + LM.l + '" y="' + (LH - 6) + '">' + data[0].d + '</text>'
      + '<text x="' + (LW - LM.r) + '" y="' + (LH - 6) + '" text-anchor="end">'
      + data[data.length - 1].d + '</text></g>'
    + '<line id="cross" x1="0" x2="0" y1="' + LM.t + '" y2="' + (LM.t + h)
      + '" stroke="' + C('--ink2') + '" stroke-width="1" opacity="0"/>'
    + '<circle id="crossDot" r="4.5" fill="' + C('--series') + '" stroke="' + C('--surface')
      + '" stroke-width="2" opacity="0"/>'
    + '<rect x="' + LM.l + '" y="' + LM.t + '" width="' + w + '" height="' + h
      + '" fill="transparent" id="hit"/>';
  $('trLabel').textContent = data.length + ' nights · ' + data[0].d + ' to ' + data[data.length - 1].d;

  // Crosshair: a pointer anywhere in the plot selects the nearest night.
  const hit = svg.querySelector('#hit');
  const cross = svg.querySelector('#cross');
  const dot = svg.querySelector('#crossDot');
  const move = (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - box.left) / box.width * LW;
    const i = Math.max(0, Math.min(data.length - 1,
      Math.round(((px - LM.l) / w) * (data.length - 1))));
    const n = data[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    cross.setAttribute('opacity', '.5');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(n.s)); dot.setAttribute('opacity', '1');
    showTip(e.touches ? e.touches[0] : e, nightTip(n));
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); hideTip();
  });
}

/* ------------------------------------------------------------------- histogram */
const HH = 260, HM = { t: 14, r: 14, b: 30, l: 34 };
function drawHist() {
  const HW = chartW();
  const data = inRange();
  $('histChart').setAttribute('viewBox', '0 0 ' + HW + ' ' + HH);
  const step = 2;
  const lo = Math.floor(Math.min(...data.map((n) => n.s)) / step) * step;
  const hi = Math.ceil(Math.max(...data.map((n) => n.s)) / step) * step;
  const bins = [];
  for (let b = lo; b < hi; b += step) {
    const rows = data.filter((n) => n.s >= b && n.s < b + step);
    bins.push({ lo: b, hi: b + step, n: rows.length });
  }
  const w = HW - HM.l - HM.r, h = HH - HM.t - HM.b;
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  const bw = w / bins.length;
  const y = (v) => HM.t + h - (v / maxN) * h;

  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = (maxN * k) / 3;
    g += '<line x1="' + HM.l + '" x2="' + (HW - HM.r) + '" y1="' + y(v).toFixed(1) + '" y2="'
      + y(v).toFixed(1) + '"/><text x="' + (HM.l - 7) + '" y="' + (y(v) + 3).toFixed(1)
      + '" text-anchor="end">' + v.toFixed(0) + '</text>';
  }
  // 2px surface gap between adjacent fills; 4px rounded ends on the data end only.
  const bars = bins.map((b, i) => {
    const bh = h - (y(b.n) - HM.t);
    const col = BANDC[bandOf(b.lo)];
    const bx = HM.l + i * bw + 1.5;
    const bwid = Math.max(1, bw - 3);
    if (b.n === 0) return '';
    return '<path d="M' + bx.toFixed(1) + ' ' + (HM.t + h) + ' V' + (y(b.n) + 4).toFixed(1)
      + ' q0 -4 4 -4 h' + Math.max(0, bwid - 8).toFixed(1) + ' q4 0 4 4 V' + (HM.t + h)
      + ' Z" fill="' + col + '" data-i="' + i + '"/>';
  }).join('');

  const markScore = D.last.score;
  const mx = HM.l + ((markScore - lo) / (hi - lo)) * w;
  const svg = $('histChart');
  svg.innerHTML = '<g class="grid axis">' + g + '</g>' + bars
    + '<line x1="' + mx.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y1="' + (HM.t - 4)
      + '" y2="' + (HM.t + h + 4) + '" stroke="' + C('--ink') + '" stroke-width="2"/>'
    + '<text class="axis" x="' + mx.toFixed(1) + '" y="' + (HM.t - 8)
      + '" text-anchor="middle" fill="' + C('--ink') + '">' + markScore + '</text>'
    + '<g class="axis"><text x="' + HM.l + '" y="' + (HH - 8) + '">' + lo + '</text>'
      + '<text x="' + (HW - HM.r) + '" y="' + (HH - 8) + '" text-anchor="end">' + hi + '</text>'
      + '<text x="' + (HM.l + w / 2) + '" y="' + (HH - 8) + '" text-anchor="middle">sleep score</text></g>';

  svg.querySelectorAll('path[data-i]').forEach((el) => {
    const b = bins[Number(el.dataset.i)];
    const show = (e) => showTip(e, '<div class="h">' + b.lo + '–' + (b.hi - 1) + '</div>'
      + row('Nights', b.n) + row('Share', fmt((b.n / data.length) * 100) + '%')
      + row('Band', BANDN[bandOf(b.lo)]));
    el.addEventListener('pointerenter', show);
    el.addEventListener('pointermove', show);
    el.addEventListener('pointerleave', hideTip);
  });
  $('histMark').textContent = 'last night, ' + markScore;
}

/* ----------------------------------------------------------------- grade rows */
function drawGrades(score) {
  const pct = pctOf(score, ALL);
  const letters = ['A', 'B', 'C', 'D', 'F'];
  const fill = { A: C('--good'), B: '#5e7226', C: C('--warn'), D: '#a85f22', F: C('--bad') };
  $('gradeRows').innerHTML = D.curves.map((c) => {
    const spans = [];
    let top = 100;
    for (const L of letters) {
      const mins = c.bands.filter((b) => b.grade[0] === L).map((b) => b.min);
      const loB = Math.min(...mins);
      spans.push({ L, lo: loB, hi: top });
      top = loB;
    }
    spans.reverse();
    const segs = spans.map((s) => {
      const wpc = ((s.hi - s.lo) / 100) * 100;
      return '<div style="width:' + wpc.toFixed(2) + '%;background:' + fill[s.L]
        + ';color:#12120f">' + (wpc >= 6 ? s.L : '') + '</div>';
    }).join('');
    const earned = gradeAt(pct, c);
    return '<div class="grow"><div class="top"><span class="nm">' + c.name
      + '</span><span class="g" style="color:' + fill[earned[0]] + '">' + earned + '</span></div>'
      + '<div class="gradebar">' + segs + '<div class="mk" style="left:'
      + (pct == null ? 0 : pct).toFixed(2) + '%"></div></div></div>';
  }).join('') + '<div class="rng"><span>0th</span><span>50th percentile</span><span>100th</span></div>';
  $('sliderVal').textContent = 'score ' + score + ' · ' + fmt(pct) + 'th percentile';
}

/* ---------------------------------------------------------------------- tiles */
function drawTiles() {
  const data = inRange();
  const p = pctOf(D.last.score, ALL);
  const curved = D.curves.find((c) => c.id === 'curved');
  const memberRow = D.member.table.find((r) => r.score === D.last.score);
  const tw = [
    ['Last night', D.last.score, D.last.date],
    ['Percentile', fmt(p) + 'th', 'of your ' + ALL.length + ' nights'],
    ['Curved grade', gradeAt(p, curved), 'against yourself'],
    ['Range mean', fmt(mean(data.map((n) => n.s))), data.length + ' nights'],
    ['All-time mean', fmt(MEAN), 'SD ' + fmt(SD)],
    ['vs members', memberRow ? fmt(memberRow.pct) + 'th' : 'not shown',
      memberRow ? 'member mean ' + D.member.mean : 'no published figure'],
  ];
  $('tiles').innerHTML = tw.map(([k, v, d]) =>
    '<div class="tile"><div class="k">' + k + '</div><div class="v">' + v
    + '</div><div class="d">' + d + '</div></div>').join('');
  $('hScore').textContent = D.last.score;
  $('hPct').textContent = fmt(p);
  $('hGrade').textContent = gradeAt(p, curved);
  $('hWhen').textContent = D.sample ? 'Sample night' : D.last.date;
}

/* ---------------------------------------------------------------------- table */
const COLS = [
  ['d', 'Night', (n) => n.d], ['s', 'Score', (n) => n.s],
  ['p', 'Pctl', (n) => fmt(pctOf(n.s, ALL))],
  ['t', 'Asleep', (n) => hm(n.t)], ['ef', 'Eff', (n) => (n.ef == null ? '—' : n.ef + '%')],
  ['dp', 'Deep', (n) => hm(n.dp)], ['rm', 'REM', (n) => hm(n.rm)],
  ['la', 'Latency', (n) => hm(n.la)], ['hv', 'HRV', (n) => (n.hv == null ? '—' : n.hv)],
  ['hr', 'Low HR', (n) => (n.hr == null ? '—' : n.hr)],
];
let sortKey = 'd', sortDir = -1;
function drawTable() {
  const data = [...inRange()];
  const val = (n) => (sortKey === 'p' ? pctOf(n.s, ALL) : n[sortKey]);
  data.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null) return 1;
    if (y == null) return -1;
    return x > y ? sortDir : x < y ? -sortDir : 0;
  });
  $('tbl').querySelector('thead').innerHTML = '<tr>' + COLS.map(([k, label]) =>
    '<th data-k="' + k + '"' + (k === sortKey ? ' aria-sort="' + (sortDir === 1 ? 'ascending' : 'descending') + '"' : '')
    + '>' + label + (k === sortKey ? (sortDir === 1 ? ' ▲' : ' ▼') : '') + '</th>').join('') + '</tr>';
  $('tbl').querySelector('tbody').innerHTML = data.map((n) =>
    '<tr>' + COLS.map(([, , f]) => '<td>' + f(n) + '</td>').join('') + '</tr>').join('');
  $('tbl').querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = -1; }
    drawTable();
  }));
}

/* ----------------------------------------------------------------------- init */
$('ranges').innerHTML = RANGES.map(([label, v]) =>
  '<button data-r="' + v + '" aria-pressed="' + (v === range) + '">' + label + '</button>').join('');
$('ranges').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  range = Number(b.dataset.r);
  [...$('ranges').children].forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.r) === range)));
  redraw();
});

const slider = $('scoreSlider');
slider.value = String(D.last.score);
slider.addEventListener('input', () => drawGrades(Number(slider.value)));

if (D.sample) {
  $('banner').innerHTML = '<div class="warnbar">Sample data — layout only, not a real night.</div>';
} else if (D.stale) {
  $('banner').innerHTML = '<div class="warnbar">Showing ' + D.last.date
    + ' — the newest night Oura has, ' + D.daysBehind + ' days back. Open the Oura app to sync.</div>';
}

$('foot').innerHTML = 'Rebuilt from your own Oura record every morning — nothing here is '
  + 'cached from a previous night. Percentiles count your ' + ALL.length + ' nights directly '
  + 'rather than fitting a curve, because sleep scores are bounded at 100 and a normal fit '
  + 'would put nights above it. The only outside figure on the page is the Oura member mean '
  + 'of ' + D.member.mean + ', and rows Oura publishes at low confidence are omitted rather '
  + 'than printed. Built ' + D.generated.slice(0, 16).replace('T', ' ') + 'Z.';

function redraw() { drawTiles(); drawLine(); drawHist(); drawTable(); }
redraw();
drawGrades(D.last.score);
addEventListener('resize', () => { drawLine(); drawHist(); });
</script>
</body></html>
`;

mkdirSync(dirname(resolve(ROOT, OUT)), { recursive: true });
writeFileSync(resolve(ROOT, OUT), html);
console.log(`build-dashboard: ${OUT}  ${(html.length / 1e6).toFixed(2)} MB  `
  + `(${nights.length} nights, interactive)`);
