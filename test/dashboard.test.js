import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'bin/build-dashboard.mjs'), 'utf8');

// Its own fixture in a scratch directory. The real series and night files are
// generated from encrypted telemetry and gitignored, so a test that depended on
// them would fail on a clean checkout -- and a test that WROTE them would be the
// state-pollution bug that has already bitten this repo four times.
const DIR = mkdtempSync(join(tmpdir(), 'sleepos-dash-'));
const nights = [];
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 400; i++) {
  const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  const s = Math.max(45, Math.min(96, Math.round(79 + (rnd() - 0.5) * 24)));
  nights.push({ d, s, t: 400, dp: 80, rm: 95, lt: 210, aw: 20,
                ef: 90, la: 12, hv: 38, hr: 55, br: 14.2 });
}
writeFileSync(join(DIR, 'series.json'), JSON.stringify({ generated: 'x', nights }));
writeFileSync(join(DIR, 'night.json'), JSON.stringify({
  date: '2025-02-04', score: 74, sample: false, stale: false, daysBehind: 0,
}));

const build = () => {
  execFileSync('node', ['bin/build-dashboard.mjs'], {
    cwd: ROOT, stdio: 'pipe',
    env: { ...process.env,
      SLEEPOS_SERIES: join(DIR, 'series.json'),
      SLEEPOS_NIGHT: join(DIR, 'night.json'),
      SLEEPOS_DASHBOARD_OUT: join(DIR, 'deck.html') },
  });
  return readFileSync(join(DIR, 'deck.html'), 'utf8');
};

test('the dashboard carries the data, not a picture of it', () => {
  // The point of the rewrite. Eight fixed 390x844 renders answered one question
  // each, the same way every morning; you could scroll past them but not ask
  // anything of them. The page now holds every night and does its own maths.
  const html = build();
  const m = /<script id="payload" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'no data payload in the page');
  const d = JSON.parse(m[1]);
  assert.ok(Array.isArray(d.nights) && d.nights.length > 100,
    `expected the full history, got ${d.nights?.length} nights`);
  assert.ok(d.nights.every((n) => typeof n.s === 'number'), 'every night needs a score');
  assert.ok(d.curves.length === 3, 'all three grade curves must be present');
  // No iframes: the old page embedded eight pre-rendered documents.
  assert.ok(!html.includes('<iframe'), 'a dashboard that embeds renders is still static');
});

test('it is genuinely interactive, not a taller static page', () => {
  const html = build();
  for (const [what, probe] of [
    ['a range selector', 'id="ranges"'],
    ['a hover tooltip', "id=\"tip\""],
    ['a crosshair on the line', "id='cross'".replace(/'/g, '"')],
    ['a score slider', 'id="scoreSlider"'],
    ['a sortable table', 'aria-sort'],
  ]) {
    assert.ok(html.includes(probe), `missing ${what}`);
  }
  // Sorting and range changes must recompute rather than swap prebuilt views.
  assert.ok(src.includes('function drawTable'), 'the table must be rendered from data');
  assert.ok(src.includes('addEventListener'), 'nothing is wired up');
});

test('percentiles are counted, never fitted', () => {
  // Sleep scores are bounded at 100 and left-skewed; a normal fit puts nights
  // above 100, which cannot happen. The page counts nights.
  assert.ok(src.includes('const pctOf'), 'no empirical percentile');
  assert.ok(!/erf|gaussian|normalCdf/i.test(src.split('const html =')[0]),
    'the page must not reach for a normal approximation');
});

test('low-confidence member rows are omitted, not printed', () => {
  const html = build();
  const d = JSON.parse(/<script id="payload"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
  // Oura publishes no spread, so 26 of 60 rows rest on extrapolation into a part
  // of the curve where nothing was observed. Those may grade but never show a
  // number, so they do not travel to the page at all.
  const scores = d.member.table.map((r) => r.score);
  assert.ok(scores.length > 0);
  for (const s of scores) {
    assert.ok(s >= 60 && s <= 93, `score ${s} is a low-confidence row and must not ship`);
  }
});

test('the one categorical colour is the validated dark step', () => {
  // Validated with the dataviz palette script against the #1a1a19 surface: the
  // lightness band, chroma floor and 3:1 contrast all pass. Status colours are
  // the reserved set and always ship beside a label.
  assert.ok(src.includes('--series:#3987e5'), 'the series colour must be the validated step');
  assert.ok(src.includes('--surface:#1a1a19'), 'validated against this surface');
  for (const status of ['#0ca30c', '#fab219', '#d03b3b']) {
    assert.ok(src.includes(status), `missing reserved status colour ${status}`);
  }
  // Never a second series colour invented on the fly.
  const invented = src.match(/--series-\d/g);
  assert.equal(invented, null, 'a second categorical slot means validating the pair');
});

test('the chart viewBox tracks the viewport so axis type stays legible', () => {
  // A fixed 900-unit viewBox squeezed into a 362px phone renders 9px text at
  // 3.6px. Measured at 390px wide the viewBox is 328 and the text lands at 9px.
  assert.ok(src.includes('const chartW'), 'the viewBox must be responsive');
  assert.ok(src.includes('innerWidth < 560'), 'no phone breakpoint');
});

test('a wide table scrolls in its own container rather than wrapping', () => {
  const html = build();
  assert.ok(html.includes('class="tblwrap scroll"'), 'the table needs its own scroller');
  assert.ok(html.includes('white-space:nowrap'), 'cells must not wrap into two-line rows');
});

test('sample and stale nights are labelled on the page itself', () => {
  const html = build();
  assert.ok(html.includes('id="banner"'), 'no banner slot');
  assert.ok(src.includes('D.sample') && src.includes('D.stale'),
    'both provisional states must reach the page');
});
