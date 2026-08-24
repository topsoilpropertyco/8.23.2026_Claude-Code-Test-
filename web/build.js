// Builds the Sleep OS dashboard preview.
//
// Wired to the real engine: the fact library, the jittered cadence and the
// statistics are all computed by the same code that drives Telegram.
//
// The night series is real whenever the telemetry can be decrypted -- that is,
// in CI, where SLEEPOS_DATA_KEY exists. Locally, with no key, it falls back to
// a seeded synthetic series so the layout can still be worked on, and the page
// says so in as many words. It used to be synthetic unconditionally, with a
// comment claiming the ring was not connected; that stopped being true when
// 1,043 nights were backfilled.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadLibraries, loadConfig, ROOT } from '../src/facts.js';
import { buildDaySchedule } from '../src/schedule.js';
import { selectFact } from '../src/selector.js';
import { loadHabits, selectRationale } from '../src/habits.js';
import { rngFrom, gaussian } from '../src/rng.js';
import { readJournal, sleepSeries } from '../src/journal.js';
import { loadPrompts } from '../src/prompts.js';
import { localDateString } from '../src/time.js';
import { hasKey } from '../src/crypto.js';
import { msri as computeMsri } from '../src/msri.js';
import { readTelemetry } from '../src/telemetry.js';

const { facts } = loadLibraries();
const config = loadConfig();
const NOW = new Date();
const today = localDateString(NOW, config.timezone);

/* ---------------------------------------------------------------- telemetry */

function realNights() {
  if (!hasKey()) return null;
  try {
    const rows = readTelemetry()
      .filter((r) => r.sleep_score != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: r.date, score: r.sleep_score }));
    return rows.length >= 30 ? rows : null;
  } catch {
    return null;                       // unreadable is the same as absent here
  }
}

function syntheticNights() {
  const rng = rngFrom('sleep-os:preview-telemetry');
  const out = [];
  for (let i = 399; i >= 0; i--) {
    const d = new Date(NOW.getTime() - i * 86400000);
    // A slow upward drift plus night-to-night noise, clamped to Oura's range.
    const drift = 71 + (399 - i) * 0.017;
    const score = Math.round(Math.max(41, Math.min(96, drift + gaussian(rng, 6.5, 16))));
    out.push({ date: localDateString(d, config.timezone), score });
  }
  return out;
}

const real = realNights();
const NIGHTS_ARE_REAL = real !== null;
const nights = real ?? syntheticNights();

const scores = nights.map((n) => n.score);
const last = scores[scores.length - 1];
const hist = scores.slice(0, -1);

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const stdev = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const erf = (x) => {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};

const mu = mean(hist.slice(-90));
const sigma = stdev(hist.slice(-90));
const z = (last - mu) / sigma;
const percentile = 0.5 * (1 + erf(z / Math.SQRT2)) * 100;

const trailing = [7, 30, 90, 180, 365].map((k) => {
  const window = hist.slice(-Math.min(k, hist.length));
  const avg = mean(window);
  return {
    window: `T${k}`,
    label: { 7: 'Short-term recovery', 30: 'Monthly baseline', 90: 'Seasonal baseline', 180: 'Mid-year drift', 365: 'Annual macro (TTM)' }[k],
    avg,
    delta: last - avg,
    partial: hist.length < k,
    days: window.length,
  };
});

// MSRI. Computed by src/msri.js from the real telemetry: personal HRV and
// resting-heart-rate baselines, capped factors, and a genuinely seeded EWMA.
// The previous version interpolated every biometric from the sleep score, so
// the index could not disagree with the number it was corroborating, and the
// dashboard called it "EWMA-filtered" when no EWMA existed.
//
// Without the decryption key there are no biometrics to read, so it reports
// nothing rather than a figure derived from invented inputs.
const msriResult = NIGHTS_ARE_REAL
  ? computeMsri(readTelemetry())
  : { value: null, reason: 'no decryption key on this machine', coverage: 0 };

/* ----------------------------------------------------------------- cadence */

const schedule = buildDaySchedule(config, today);
let scratch = { version: 1, cycle: 4, remaining: null, sends: {} };
// Only fact slots draw from the fact library. This used to call selectFact for
// every slot, which put a random sleep card under "Morning Intake" and, once
// habit anchors landed, under both of those too -- and burned three rotation
// positions per build, so the remaining-in-cycle count was wrong as well.
const habitDefs = loadHabits();
let habitScratch = {};
const cadence = schedule.map((slot) => {
  const delivered = NOW >= slot.targetAt;

  if (slot.type === 'intake') {
    return { slot, kind: 'intake', label: 'intake', delivered };
  }

  if (slot.type === 'habit') {
    const habit = habitDefs[slot.habit];
    const pick = selectRationale({ habit, habitId: slot.habit, state: habitScratch, dateString: today });
    habitScratch = { habitRotation: { ...(habitScratch.habitRotation ?? {}),
      [slot.habit]: { cycle: pick.cycle, remaining: pick.remaining } } };
    return { slot, kind: 'habit', label: 'habit', habit, why: pick.why, delivered };
  }

  const choice = selectFact({ facts, state: scratch, slotId: slot.id, dateString: today, config });
  scratch = { ...scratch, cycle: choice.cycle, remaining: choice.remaining };
  return { slot, kind: 'fact', fact: choice.fact, jackpot: choice.jackpot,
           label: choice.fact.category, delivered };
});
const factSlotCount = cadence.filter((c) => c.kind === 'fact').length;
const next = cadence.find((c) => !c.delivered);
const cycleRemaining = scratch.remaining.length;

/* ----------------------------------------------------------------- journal */

// Real entries once they exist; otherwise a worked example of the shape, so
// the section is never an empty box on a fresh install.
const { prompts: promptDefs } = loadPrompts();
const promptById = new Map(promptDefs.map((p) => [p.id, p]));
const realJournal = readJournal();
const journalIsReal = realJournal.length > 0;

const journal = journalIsReal
  ? realJournal.slice(-4).reverse().map((e) => ({
      date: e.date,
      stem: promptById.get(e.promptId)?.text ?? 'Unprompted entry',
      answer: e.text,
      tag: (e.mechanism ?? 'note').replace(/_/g, ' '),
    }))
  : [
      { date: 'example', stem: 'Name the exact moment tonight this is most likely to break. Finish the sentence: When ______ happens, I will ______.', answer: 'When the 9pm alert lands mid-email, I close the lid and finish it at 6am.', tag: 'implementation intention' },
      { date: 'example', stem: 'Which version of yourself did today\'s choices vote for? The operator, or the one who stays up?', answer: 'Operator. Kitchen shut at 7, phone out of the bedroom.', tag: 'identity' },
      { date: 'example', stem: 'Why does this one actually matter to you? Not in general. To you, this week.', answer: 'Because I was short with the kids twice this week and both times I was under seven hours.', tag: 'elaborative interrogation' },
    ];

const loggedNights = sleepSeries();

/* -------------------------------------------------------------------- chart */

const series = nights.slice(-30);
const W = 840, H = 190, PL = 44, PR = 16, PT = 16, PB = 26;
const lo = Math.min(...series.map((n) => n.score)) - 4;
const hi = Math.max(...series.map((n) => n.score)) + 4;
const px = (i) => PL + (i * (W - PL - PR)) / (series.length - 1);
const py = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
const linePath = series.map((n, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(n.score).toFixed(1)}`).join(' ');
const areaPath = `${linePath} L${px(series.length - 1).toFixed(1)} ${(H - PB).toFixed(1)} L${PL} ${(H - PB).toFixed(1)} Z`;
const gridVals = [];
for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) gridVals.push(v);

/* --------------------------------------------------------------------- html */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sign = (n, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
const dir = (n) => (n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat');
const arrow = (n) => (n > 0.05 ? '▲' : n < -0.05 ? '▼' : '▶');

const fmtDate = new Date(NOW).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: config.timezone });

const html = `<title>Sleep OS Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
/* Sleep OS commits to a single dark world by design: the product is a
   low-arousal, low-blue-light night interface, and a light mode would
   contradict its whole thesis. Every colour is therefore painted explicitly
   from a token so the page holds on any host ground. */
:root{
  --obsidian:#050814; --navy:#0A1128; --slate:#101F42;
  --tarheel:#7BAFD4; --ice:#B9D6F2;
  --vapor:#F0F4F8; --steel:#8A99AD;
  --up:#00C805; --down:#FF3B30; --flat:#8E8E93;
  --line:rgba(123,175,212,.14);
  --line-soft:rgba(123,175,212,.07);
  --sans:'Inter',system-ui,-apple-system,'Helvetica Neue',sans-serif;
  --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--navy); color:var(--vapor);
  font-family:var(--sans); font-size:15px; line-height:1.55;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:900px;margin:0 auto;padding:34px 22px 72px}
h1,h2,h3{margin:0;text-wrap:balance}

.eyebrow{
  font-family:var(--mono); font-size:10.5px; font-weight:500;
  letter-spacing:.16em; text-transform:uppercase; color:var(--steel);
}

/* masthead */
.mast{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;
  padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:30px}
.mark{font-size:19px;font-weight:800;letter-spacing:.19em;color:var(--vapor)}
.mark span{color:var(--tarheel)}
.mast .sub{margin-top:5px;font-size:13px;color:var(--steel)}
.pill{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;
  border:1px solid var(--line);background:var(--slate);
  font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ice)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--flat);flex:none}
.dot.live{background:var(--up)}

section{margin-bottom:34px}
.head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-bottom:13px}
.card{background:var(--slate);border:1px solid var(--line);border-radius:12px}

/* next nudge */
.next{padding:24px 26px;display:flex;justify-content:space-between;align-items:center;gap:26px;flex-wrap:wrap}
.next .slotname{font-size:20px;font-weight:700;letter-spacing:-.01em;margin:7px 0 5px}
.next .obj{font-size:13.5px;color:var(--steel);max-width:44ch}
.count{text-align:right}
.count .t{font-family:var(--mono);font-size:39px;font-weight:700;color:var(--tarheel);
  letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
.count .at{font-family:var(--mono);font-size:11.5px;color:var(--steel);margin-top:7px;letter-spacing:.05em}
.sealed{margin-top:16px;padding-top:15px;border-top:1px dashed var(--line);
  font-size:12.5px;color:var(--steel);width:100%}

/* cadence rail */
.rail{display:flex;flex-direction:column}
.slot{display:grid;grid-template-columns:70px 18px 1fr auto;gap:13px;align-items:center;
  padding:12px 18px;border-bottom:1px solid var(--line-soft)}
.slot:last-child{border-bottom:0}
.slot .tm{font-family:var(--mono);font-size:12.5px;color:var(--vapor);font-variant-numeric:tabular-nums}
.slot.pending .tm{color:var(--steel)}
.node{display:block;width:9px;height:9px;border-radius:50%;border:1.5px solid var(--steel);margin:0 auto}
.slot.done .node{background:var(--tarheel);border-color:var(--tarheel)}
.slot.now .node{background:var(--ice);border-color:var(--ice);box-shadow:0 0 0 4px rgba(185,214,242,.16)}
.slot .nm{font-size:13.5px;font-weight:500}
.slot.pending .nm{color:var(--steel);font-weight:400}
.chip{font-family:var(--mono);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;
  padding:3px 8px;border-radius:5px;border:1px solid var(--line);color:var(--steel);white-space:nowrap}
.chip.jack{border-color:rgba(185,214,242,.4);color:var(--ice)}

/* stat grid */
.stats{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:1px;background:var(--line-soft);
  border:1px solid var(--line);border-radius:12px;overflow:hidden}
.stat{background:var(--slate);padding:19px 20px}
.stat .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--steel)}
.stat .v{font-family:var(--mono);font-weight:700;font-size:31px;margin-top:9px;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;line-height:1;color:var(--vapor)}
.stat.hero .v{font-size:52px;color:var(--tarheel)}
.stat .n{font-size:11.5px;color:var(--steel);margin-top:8px}
.crown{display:inline-flex;align-items:center;gap:5px;margin-top:9px;font-family:var(--mono);
  font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ice)}

/* ticker */
.tick{display:grid;grid-template-columns:52px 1fr 74px 96px 84px;gap:13px;align-items:center;
  padding:12px 18px;border-bottom:1px solid var(--line-soft)}
.tick:last-child{border-bottom:0}
.tick .w{font-family:var(--mono);font-size:12.5px;font-weight:700;color:var(--ice)}
.tick .l{font-size:12.5px;color:var(--steel)}
.tick .a{font-family:var(--mono);font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums;color:var(--vapor)}
.tick .d{font-family:var(--mono);font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums;
  display:flex;align-items:center;justify-content:flex-end;gap:6px}
.up{color:var(--up)} .down{color:var(--down)} .flat{color:var(--flat)}
.bar{position:relative;height:5px;background:var(--line-soft);border-radius:3px}
.bar i{position:absolute;top:0;height:5px;border-radius:3px;display:block}
.bar em{position:absolute;top:-3px;bottom:-3px;left:50%;width:1px;background:var(--line);display:block}

/* chart */
.chartwrap{padding:18px 8px 8px;overflow-x:auto}
svg{display:block;min-width:620px}
.gl{stroke:var(--line-soft);stroke-width:1}
.gt{font-family:var(--mono);font-size:9.5px;fill:var(--steel)}
.cross{stroke:var(--ice);stroke-width:1;stroke-dasharray:3 3;opacity:0}
.tip{position:absolute;pointer-events:none;opacity:0;transition:opacity .1s;
  background:var(--obsidian);border:1px solid var(--line);border-radius:7px;padding:8px 11px;
  font-family:var(--mono);font-size:11px;color:var(--vapor);white-space:nowrap;z-index:5}
.chartbox{position:relative}

/* journal */
.entry{padding:16px 20px;border-bottom:1px solid var(--line-soft)}
.entry:last-child{border-bottom:0}
.entry .meta{display:flex;gap:10px;align-items:center;margin-bottom:8px}
.entry .stem{font-size:13.5px;color:var(--steel);line-height:1.6}
.entry .ans{color:var(--ice);font-weight:500}

/* library */
.lib{padding:19px 20px}
.prog{height:5px;background:var(--line-soft);border-radius:3px;overflow:hidden;margin:13px 0 9px}
.prog i{display:block;height:5px;background:var(--tarheel);border-radius:3px}

footer{margin-top:44px;padding-top:22px;border-top:1px solid var(--line);
  font-size:11.5px;color:var(--steel);line-height:1.7}
footer strong{color:var(--ice);font-weight:600}

@media (max-width:680px){
  .stats{grid-template-columns:1fr 1fr}
  .tick{grid-template-columns:40px 1fr 52px 74px;gap:9px;padding:11px 14px}
  .tick .bar{display:none}
  .tick .l{font-size:12px}
  .head span.eyebrow{display:none}
  .count{text-align:left}
  .slot{grid-template-columns:64px 16px 1fr;gap:10px}
  .slot .chip{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
:focus-visible{outline:2px solid var(--ice);outline-offset:2px}
</style>

<div class="wrap">

  <header class="mast">
    <div>
      <div class="mark">SLEEP<span>OS</span></div>
      <div class="sub">${esc(fmtDate)} · Detroit</div>
    </div>
    <div class="pill"><span class="dot"></span> Engine not deployed</div>
  </header>

  <section>
    <div class="head"><h2 class="eyebrow">Next nudge</h2></div>
    <div class="card next">
      <div>
        <div class="eyebrow">${esc(next ? next.slot.name : 'Day complete')}</div>
        <div class="slotname">${esc(next ? next.slot.name.replace(/^\d+:\s*/, '') : 'All six delivered')}</div>
        <div class="obj">${esc(next ? next.slot.objective : 'The cadence resets at 8:00 AM tomorrow.')}</div>
      </div>
      <div class="count">
        <div class="t" id="countdown" data-target="${next ? next.slot.targetAt.toISOString() : ''}">--:--</div>
        <div class="at">${esc(next ? `ARRIVES ${next.slot.targetLabel}` : 'CADENCE COMPLETE')}</div>
      </div>
      <div class="sealed">The card itself stays sealed until it fires. Knowing what is coming is what kills the effect.</div>
    </div>
  </section>

  <section>
    <div class="head">
      <h2 class="eyebrow">Today's cadence</h2>
      <span class="eyebrow">${cadence.filter((c) => c.delivered).length} of ${cadence.length} delivered</span>
    </div>
    <div class="card rail">
      ${cadence.map((c) => {
        const state = c.delivered ? 'done' : c === next ? 'now' : 'pending';
        return `<div class="slot ${state}">
        <div class="tm">${esc(c.slot.targetLabel)}</div>
        <div><span class="node"></span></div>
        <div class="nm">${esc(c.slot.name.replace(/^\d+:\s*/, ''))}</div>
        <div class="chip ${c.jackpot ? 'jack' : ''}">${esc(c.delivered ? (c.jackpot ? 'jackpot · ' + c.label : c.label) : 'sealed')}</div>
      </div>`;
      }).join('')}
    </div>
  </section>

  <section>
    <div class="head">
      <h2 class="eyebrow">Last night</h2>
      <span class="eyebrow">Oura · ${esc(nights[nights.length - 1].date)}</span>
    </div>
    <div class="stats">
      <div class="stat hero">
        <div class="k">Sleep score</div>
        <div class="v">${last}</div>
        ${last >= 85 ? '<div class="crown">♛ Crown day</div>' : `<div class="n">${last >= 70 ? 'Good' : last >= 60 ? 'Fair' : 'Pay attention'} · crown at 85</div>`}
      </div>
      <div class="stat">
        <div class="k">Standard score</div>
        <div class="v">${sign(z, 2)}</div>
        <div class="n">SD vs 90-night mean</div>
      </div>
      <div class="stat">
        <div class="k">Percentile</div>
        <div class="v">${percentile.toFixed(2)}</div>
        <div class="n">of your own history</div>
      </div>
      <div class="stat">
        <div class="k">MSRI</div>
        <div class="v">${msriResult.value == null ? '—' : msriResult.value.toFixed(1)}</div>
        <div class="n">${msriResult.value == null
          ? esc(msriResult.reason)
          : `${msriResult.window}-night EWMA · ${msriResult.coverage} nights`}</div>
      </div>
    </div>
  </section>

  <section>
    <div class="head">
      <h2 class="eyebrow">Trailing windows</h2>
      <span class="eyebrow">Last night vs rolling average</span>
    </div>
    <div class="card">
      ${trailing.map((t) => {
        const d = dir(t.delta);
        const w = Math.min(50, Math.abs(t.delta) * 4.5);
        const style = t.delta >= 0 ? `left:50%;width:${w}%;background:var(--up)` : `right:50%;width:${w}%;background:var(--down)`;
        return `<div class="tick">
        <div class="w">${esc(t.window)}</div>
        <div class="l">${esc(t.label)}${t.partial ? ` <span style="color:var(--flat)">· ${t.days}d so far</span>` : ''}</div>
        <div class="a">${t.avg.toFixed(1)}</div>
        <div class="d ${d}"><span aria-hidden="true">${arrow(t.delta)}</span><span>${sign(t.delta)}</span></div>
        <div class="bar"><em></em><i style="${style}"></i></div>
      </div>`;
      }).join('')}
    </div>
  </section>

  <section>
    <div class="head">
      <h2 class="eyebrow">Sleep score · last 30 nights</h2>
      <span class="eyebrow">Range ${Math.min(...series.map((s) => s.score))}–${Math.max(...series.map((s) => s.score))}</span>
    </div>
    <div class="card chartwrap chartbox">
      <div class="tip" id="tip"></div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" id="chart" role="img"
           aria-label="Sleep score over the last 30 nights, ranging ${Math.min(...series.map((s) => s.score))} to ${Math.max(...series.map((s) => s.score))}.">
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7BAFD4" stop-opacity=".30"/>
            <stop offset="100%" stop-color="#7BAFD4" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${gridVals.map((v) => `<line class="gl" x1="${PL}" y1="${py(v).toFixed(1)}" x2="${W - PR}" y2="${py(v).toFixed(1)}"/>
        <text class="gt" x="${PL - 9}" y="${(py(v) + 3.5).toFixed(1)}" text-anchor="end">${v}</text>`).join('')}
        <path d="${areaPath}" fill="url(#fill)"/>
        <path d="${linePath}" fill="none" stroke="#7BAFD4" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <line class="cross" id="cross" y1="${PT}" y2="${H - PB}"/>
        <circle id="hoverdot" r="4.5" fill="#B9D6F2" stroke="#101F42" stroke-width="2" opacity="0"/>
        <circle cx="${px(series.length - 1).toFixed(1)}" cy="${py(last).toFixed(1)}" r="4.5"
                fill="#B9D6F2" stroke="#101F42" stroke-width="2"/>
        <text class="gt" x="${PL}" y="${H - 8}">${esc(series[0].date.slice(5))}</text>
        <text class="gt" x="${W - PR}" y="${H - 8}" text-anchor="end">last night</text>
      </svg>
    </div>
  </section>

  <section>
    <div class="head">
      <h2 class="eyebrow">Journal</h2>
      <span class="eyebrow">${journalIsReal ? `${realJournal.length} entries · answered in Telegram` : 'Example entries · none logged yet'}</span>
    </div>
    <div class="card">
      ${journal.map((j) => `<div class="entry">
        <div class="meta"><span class="chip">${esc(j.tag)}</span><span class="eyebrow">${esc(j.date)}</span></div>
        <div class="stem">${esc(j.stem)} <span class="ans">${esc(j.answer)}</span></div>
      </div>`).join('')}
    </div>
  </section>

  <section>
    <div class="head">
      <h2 class="eyebrow">Library rotation</h2>
      <span class="eyebrow">Cycle ${scratch.cycle}</span>
    </div>
    <div class="card lib">
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span>${facts.length - cycleRemaining} of ${facts.length} facts used this cycle</span>
        <span class="eyebrow">${cycleRemaining} remaining</span>
      </div>
      <div class="prog"><i style="width:${(((facts.length - cycleRemaining) / facts.length) * 100).toFixed(1)}%"></i></div>
      <div style="font-size:12px;color:var(--steel)">
        ${facts.filter((f) => f.library === 'sleep').length} sleep science ·
        ${facts.filter((f) => f.library === 'lucid').length} lucid ·
        ${facts.filter((f) => f.intensity === 'high').length} jackpot-eligible ·
        full cycle ≈ ${(facts.length / factSlotCount).toFixed(1)} days
      </div>
    </div>
  </section>

  <footer>
    <strong>${NIGHTS_ARE_REAL ? 'Live build' : 'Preview build'}.</strong> The cadence, jitter, rotation and fact
    library above are live — computed by the same engine that sends to Telegram. ${NIGHTS_ARE_REAL
      ? `The ${nights.length.toLocaleString('en-US')} nights charted are real Oura measurements, unrounded.`
      : 'The Oura telemetry here is generated from a fixed seed, because this machine has no decryption key for '
        + 'the real series — the nights are invented even though the maths on them is not.'}
    The z-score, percentile and trailing windows are derived from the series in the chart. MSRI is computed
    separately from the night-by-night biometrics — HRV and resting heart rate against your own baselines, not
    population figures — and is only shown when those measurements are actually readable.<br><br>
    Sleep OS is a behavioural reminder tool. It is not medical advice, diagnosis, or treatment.
  </footer>
</div>

<script>
(function(){
  var el=document.getElementById('countdown'), target=el&&el.dataset.target?new Date(el.dataset.target):null;
  function tick(){
    if(!target){return;}
    var ms=target-new Date();
    if(ms<=0){el.textContent='NOW';return;}
    var h=Math.floor(ms/3600000), m=Math.floor(ms%3600000/60000), s=Math.floor(ms%60000/1000);
    el.textContent=(h>0? h+'h '+String(m).padStart(2,'0')+'m' : m+'m '+String(s).padStart(2,'0')+'s');
  }
  tick(); setInterval(tick,1000);

  var data=${JSON.stringify(series)}, PL=${PL}, PR=${PR}, W=${W};
  var svg=document.getElementById('chart'), cross=document.getElementById('cross'),
      dot=document.getElementById('hoverdot'), tip=document.getElementById('tip'),
      box=svg.parentElement;
  function xAt(i){return PL+i*(W-PL-PR)/(data.length-1);}
  function yAt(v){return ${PT}+(1-(v-${lo})/(${hi}-${lo}))*(${H}-${PT}-${PB});}
  function move(e){
    var r=svg.getBoundingClientRect(), cx=e.clientX!=null?e.clientX:e.touches[0].clientX;
    var vx=(cx-r.left)/r.width*W;
    var i=Math.round((vx-PL)/((W-PL-PR)/(data.length-1)));
    i=Math.max(0,Math.min(data.length-1,i));
    var d=data[i], x=xAt(i), y=yAt(d.score);
    cross.setAttribute('x1',x); cross.setAttribute('x2',x); cross.style.opacity=1;
    dot.setAttribute('cx',x); dot.setAttribute('cy',y); dot.style.opacity=1;
    tip.textContent=d.date+'   '+d.score;
    tip.style.opacity=1;
    var bx=box.getBoundingClientRect();
    tip.style.left=Math.min(bx.width-tip.offsetWidth-8,Math.max(4,x/W*r.width-tip.offsetWidth/2))+'px';
    tip.style.top=Math.max(4,y/${H}*r.height-40)+'px';
  }
  function leave(){cross.style.opacity=0;dot.style.opacity=0;tip.style.opacity=0;}
  svg.addEventListener('mousemove',move);
  svg.addEventListener('mouseleave',leave);
  svg.addEventListener('touchmove',function(e){move(e);e.preventDefault();},{passive:false});
  svg.addEventListener('touchend',leave);
})();
</script>`;

writeFileSync(join(ROOT, 'web/dashboard.html'), html);
console.log('built web/dashboard.html');
console.log(`  last night ${last} · z ${sign(z, 2)} · p${percentile.toFixed(2)}` +
  `  MSRI ${msriResult.value == null ? `— (${msriResult.reason})` : msriResult.value.toFixed(1)}`);
console.log(`  next slot: ${next ? next.slot.name + ' @ ' + next.slot.targetLabel : 'none left today'}`);
