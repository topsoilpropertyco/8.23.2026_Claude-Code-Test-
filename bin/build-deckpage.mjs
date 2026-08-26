// The eight screens, as one swipeable page.
//
// The screens were always web pages. variants/s1/index.html through g2 are
// self-contained documents at a fixed 390x844 -- iPhone size -- and the album
// Seth gets every morning is those same documents opened in a browser and
// photographed. The PNG is a lossy last step, not the source.
//
// So when he asked why the link could not look exactly like the screens, the
// honest answer was that it could, and that I had built something else instead:
// a separate dashboard, from scratch, rather than publishing the screens he
// already liked. This file corrects that. It does not re-implement anything --
// it wraps the very documents that get photographed.
//
// Each screen goes in an iframe with srcdoc, which matters for two reasons.
// Rendering is byte-identical to the photograph because it IS the same document
// in its own browsing context, and eight full documents with eight sets of
// global CSS cannot collide when each one has its own.
//
// No JavaScript. Not out of minimalism: the last page failed precisely because
// it needed script to run and the loader injected it as inert markup. Horizontal
// scroll-snap and anchor links are CSS and HTML, so there is nothing left to
// fail to execute. Swipe works because it is a real scroll container.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.env.SLEEPOS_DECKPAGE_OUT || 'web/deck.html');

// The same list, in the same order, that the album sends.
const SCREENS = ['s1', 's2', 's3', 's4', 's5', 's6', 'g1', 'g2'];

const nightPath = resolve(ROOT, process.env.SLEEPOS_NIGHT || 'data/last-night.json');
const night = existsSync(nightPath) ? JSON.parse(readFileSync(nightPath, 'utf8')) : {};

// Every screen links out to fonts.googleapis.com. On a CI runner rendering a
// screenshot that is fine; on a phone it is eight iframes each waiting on a
// third party, and a slow response means the screens paint in Times New Roman --
// which is exactly "not the same as the album". The vendored stylesheet is
// published next to the page as one cached file, so the request is same-origin,
// happens once, and works offline afterwards. A relative href is correct here:
// a srcdoc document resolves relative URLs against its parent's base URL.
const FONTS_HREF = process.env.SLEEPOS_FONTS_HREF ?? 'fonts.css';
const GOOGLE_FONTS = /<link[^>]+href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\s*/g;

const useVendoredFonts = (html) => html.replace(GOOGLE_FONTS, '')
  .replace(/<style>/, `<link rel="stylesheet" href="${FONTS_HREF}">\n<style>`);

const screens = SCREENS.map((key) => {
  const file = join(ROOT, 'variants', key, 'index.html');
  if (!existsSync(file)) return null;
  const html = useVendoredFonts(readFileSync(file, 'utf8'));
  // The title carries the screen's own name -- "s1 — Where am I" -- which is a
  // better label than anything invented here.
  const title = (html.match(/<title>([^<]*)<\/title>/) ?? [, key])[1]
    .replace(/^[sg]\d+\s*[—-]\s*/, '').trim() || key;
  return { key, html, title };
}).filter(Boolean);

if (!screens.length) {
  console.error('build-deckpage: no screens found in variants/. Run bin/build-screens.py first.');
  process.exit(1);
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const heading = night.stale
  ? `${night.date} · ${night.daysBehind} days back`
  : night.date ? `Last night · ${night.date}` : 'Last night';

const page = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sleep OS — ${esc(night.date ?? 'last night')}</title>
<link rel="stylesheet" href="${FONTS_HREF}">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--w:390px;--h:844px;--ink:#F4F0E6;--dim:#A8A29A;--bg:#78756F;--line:#8E8B84}
html,body{background:var(--bg);height:100%}
body{font-family:'IBM Plex Mono',ui-monospace,monospace;color:var(--ink);
  display:flex;flex-direction:column;overflow:hidden}

/* No page header. Every screen already carries its own -- "SLEEP OS · 1 OF 8 ·
   WHERE AM I" -- and a second one above it would be both redundant and, worse,
   would push a 844px screen off a 852px phone. The chrome added here was doing
   exactly that: the first render clipped the footer line off every screen. */

/* The reel. One real scroll container, so a swipe is a swipe -- no gesture
   handler to get wrong, and the browser's own momentum and snapping apply. */
.reel{flex:1 1 auto;display:flex;overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x mandatory;scroll-behavior:smooth;
  -webkit-overflow-scrolling:touch;scrollbar-width:none}
.reel::-webkit-scrollbar{display:none}
.screen{flex:0 0 100%;scroll-snap-align:center;display:flex;
  justify-content:center;align-items:flex-start}
/* Always laid out at exactly 390x844 -- the size the screens were designed and
   photographed at -- and then scaled as a whole to fit whatever space there is.
   Scaling the frame keeps every proportion the album has; letting the screen
   reflow to the viewport would be the one change that makes the link stop
   looking like the album.
   --k defaults to 1, so with no JavaScript at all this is the unscaled screen,
   which is right on a phone and merely clipped on something shorter. The script
   at the end sets --k to fit; it is an enhancement, never a requirement. */
.screen iframe{width:var(--w);height:var(--h);border:0;display:block;
  background:#F4F0E6;transform:scale(var(--k,1));transform-origin:top center}

/* Navigation is anchor links, which need no script: the browser scrolls the
   snap container to the target. */
nav{flex:0 0 auto;display:flex;gap:5px;justify-content:center;align-items:center;
  padding:6px 8px calc(6px + env(safe-area-inset-bottom));flex-wrap:wrap}
nav a{display:grid;place-items:center;min-width:26px;height:26px;padding:0 6px;
  font-size:10px;text-decoration:none;color:var(--dim);
  border:1px solid var(--line);border-radius:2px;letter-spacing:.06em}
nav a:hover,nav a:focus{color:var(--ink);border-color:var(--ink);outline:0}
nav a:target{color:var(--ink)}
.hint{width:100%;text-align:center;font-size:10px;color:var(--dim);
  letter-spacing:.1em;padding-top:4px}

@media (max-height:760px){
  header{padding:6px 12px 4px}
  nav{padding:5px 10px 8px}
}
</style></head>
<body>
<div class="reel" id="reel">
${screens.map((s, i) => `  <section class="screen" id="${s.key}">
    <iframe title="${esc(`${i + 1} of ${screens.length} — ${s.title}`)}" loading="${i < 2 ? 'eager' : 'lazy'}"
      srcdoc="${esc(s.html)}"></iframe>
  </section>`).join('\n')}
</div>

<nav>
${screens.map((s, i) => `  <a href="#${s.key}" title="${esc(s.title)}">${i + 1}</a>`).join('\n')}
  <span class="hint">${esc(heading)} &middot; swipe, or tap a number</span>
</nav>
<script>
// Fit the fixed-size screen to the space actually available. Twelve lines, and
// everything above works without them: --k defaults to 1, which is the true
// size. This only ever shrinks a screen that would otherwise be clipped.
(function () {
  var reel = document.getElementById('reel');
  function fit() {
    var w = reel.clientWidth, h = reel.clientHeight;
    if (!w || !h) return;
    // 0.995 because setting --k can itself change the layout it was measured
    // from -- the first pass overshot by two pixels and clipped the footer rule
    // off the bottom of every screen. A second pass on the next frame settles
    // it, and the margin means rounding can never clip.
    var k = Math.min(w / 390, h / 844) * 0.995;
    document.documentElement.style.setProperty('--k', String(Math.min(1, k)));
  }
  fit();
  requestAnimationFrame(fit);
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);
})();
</script>
</body></html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page);
const kb = (page.length / 1024).toFixed(0);
console.log(`build-deckpage: ${OUT.replace(ROOT + '/', '')}  ${kb} KB  `
  + `(${screens.length} screens: ${screens.map((s) => s.key).join(', ')})`);
