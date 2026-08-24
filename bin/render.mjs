// Headless renderer + geometry auditor for the Sleep OS variant screens.
// Usage: node bin/render.mjs <out-dir> <name=target> [name=target ...]
// target is a local html path or an http(s) URL.
//
// Renders at 390x844, deviceScaleFactor 2, and asserts the things that have
// actually broken in this project: the screen is exactly 390x844, nothing
// overflows it horizontally, fonts really loaded (a silent fallback is a
// different design), no element with text-transform:uppercase contains a Greek
// glyph (uppercase turns mu into M and sigma into a summation sign), and no
// nowrap element relies on runs of spaces.
//
// TWO THINGS LEARNED THE HARD WAY, both load-bearing:
//
// 1. Settle the animations before the shutter. Headless chromium does not
//    advance the CSS animation clock reliably, so an entrance animation with
//    fill-mode both/forwards from an opacity:0 base photographs at its FROM
//    state -- invisible, or half-faded, or offset. Every generated screen in
//    round three animates that way; screenshotting naively produced a grey hero
//    and would have produced five blank Lovable screens. getAnimations().finish()
//    fixes it. An infinite animation cannot finish, so it is cancelled and
//    reported -- DESIGN.md 7 bans looping, so that report is itself a check.
//
// 2. Do not use waitUntil:'networkidle'. Google Fonts through the agent proxy
//    can hang it. domcontentloaded plus a settle is enough, and the fontLoaded
//    map confirms the faces arrived.
//
// The chromium that ships in this environment lives at chromium-1194, and it
// needs the agent proxy passed explicitly or every external request resets.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir, ...specs] = process.argv.slice(2);
if (!outDir || !specs.length) { console.error('usage: render.mjs <out-dir> <name=target>...'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: EXEC,
  proxy: proxy ? { server: proxy } : undefined,
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const report = [];

for (const spec of specs) {
  const i = spec.indexOf('=');
  const name = spec.slice(0, i), target = spec.slice(i + 1);
  const url = /^https?:/.test(target) ? target : 'file://' + resolve(target);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1400);
    // Headless chromium does not advance the CSS animation clock reliably, so an
    // entrance animation with fill-mode:both screenshots at its FROM state
    // (opacity 0, offset). Settle every animation to its end state before we look.
    // An infinite animation cannot finish -- record it (DESIGN.md bans looping) and cancel.
    const looping = await page.evaluate(() => {
      const inf = [];
      for (const a of document.getAnimations()) {
        try {
          const t = a.effect && a.effect.getTiming();
          if (t && t.iterations === Infinity) { inf.push(a.animationName || String(a.id || 'anon')); a.cancel(); }
          else a.finish();
        } catch (e) { try { a.cancel(); } catch (_) {} }
      }
      return inf;
    });
    await page.waitForTimeout(120);
    const audit = await page.evaluate(() => {
      const de = document.documentElement, b = document.body;
      // Find the screen element: the deepest element that is ~390 wide and ~844 tall.
      let screenEl = null;
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (Math.abs(r.width - 390) < 1.5 && Math.abs(r.height - 844) < 1.5) screenEl = el;
      }
      // Anything sticking out horizontally past the 390 box.
      const over = [];
      const base = screenEl ? screenEl.getBoundingClientRect() : { left: 0, right: 390 };
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > base.right + 0.5 || r.left < base.left - 0.5) {
          over.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40),
                      left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1) });
        }
      }
      // Font sizes actually in use, for the 8:1 type-contrast check.
      const sizes = new Map();
      for (const el of document.querySelectorAll('*')) {
        if (/^(script|style|title|noscript)$/i.test(el.tagName)) continue;
        if (!el.textContent || !el.textContent.trim()) continue;
        const hasOwnText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!hasOwnText) continue;
        const cs = getComputedStyle(el);
        const px = Math.round(parseFloat(cs.fontSize));
        const t = el.textContent.trim().slice(0, 24);
        if (!sizes.has(px)) sizes.set(px, []);
        if (sizes.get(px).length < 3) sizes.get(px).push(t);
      }
      // Greek-letter mangling check: any uppercase-transformed element containing mu/sigma.
      const greek = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.textTransform !== 'uppercase') continue;
        const txt = el.textContent || '';
        if (/[μσµ]/.test(txt)) greek.push(el.textContent.trim().slice(0, 40));
      }
      // nowrap elements containing runs of 2+ spaces (space-collapse trap).
      const collapse = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (!/nowrap/.test(cs.whiteSpace)) continue;
        for (const n of el.childNodes) if (n.nodeType === 3 && /  /.test(n.textContent)) {
          collapse.push(n.textContent.trim().slice(0, 40)); break;
        }
      }
      const famsWanted = new Set();
      for (const el of document.querySelectorAll('*')) {
        for (const f of getComputedStyle(el).fontFamily.split(',')) {
          const n = f.replace(/["']/g, '').trim();
          if (n && !/^(serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|cursive|fantasy|-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica Neue|Arial|Times New Roman|Georgia|emoji|math|fangsong)$/i.test(n)) famsWanted.add(n);
        }
      }
      const fontLoaded = {};
      for (const n of famsWanted) fontLoaded[n] = document.fonts.check(`24px "${n}"`);
      const fonts = new Set();
      for (const el of document.querySelectorAll('*')) fonts.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim());
      return {
        docScrollW: de.scrollWidth, bodyScrollW: b.scrollWidth,
        screenFound: !!screenEl,
        screenW: screenEl ? +screenEl.getBoundingClientRect().width.toFixed(2) : null,
        screenH: screenEl ? +screenEl.getBoundingClientRect().height.toFixed(2) : null,
        screenScrollW: screenEl ? screenEl.scrollWidth : null,
        screenScrollH: screenEl ? screenEl.scrollHeight : null,
        overflow: over.slice(0, 8), overflowCount: over.length,
        sizes: [...sizes.entries()].sort((a, b) => b[0] - a[0]),
        greek, collapse, fonts: [...fonts].filter(Boolean), fontLoaded,
        text: (screenEl || b).innerText.replace(/\n{2,}/g, '\n'),
      };
    });
    if (audit.sizes.length) {
      const hi = audit.sizes[0][0];
      const body = audit.sizes.filter(([px]) => px <= 20).map(([px]) => px);
      const lo = body.length ? Math.max(...body) : audit.sizes[audit.sizes.length - 1][0];
      audit.typeRatio = +(hi / lo).toFixed(2);
      audit.typeHi = hi; audit.typeLo = lo;
    }
    audit.errors = errs.slice(0, 5);
    audit.looping = looping;
    const shot = `${outDir}/${name}.png`;
    const el = audit.screenFound ? await page.$(`xpath=//*`) : null;
    await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 390, height: 844 } });
    report.push({ name, target, shot, ...audit });
  } catch (e) {
    report.push({ name, target, error: String(e).slice(0, 300) });
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
