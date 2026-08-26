// Vendor the two typefaces the screens use, as one self-contained stylesheet.
//
// Every screen links to fonts.googleapis.com. That is fine for the screenshots,
// which are rendered once on a CI runner with a network, but it is the wrong
// dependency for a page opened on a phone every morning: eight iframes each
// waiting on a third party, and if the request is slow the screens render in
// Times New Roman -- which is precisely "not the same as the album".
//
// So the faces are fetched once, here, and written into web/fonts.css as data
// URIs. Latin subsets only: the full set includes Cyrillic and Vietnamese and
// triples the weight for glyphs no screen contains.
//
// Both faces are OFL 1.1 -- Newsreader (Production Type) and IBM Plex Mono
// (IBM) -- which permits redistribution, so committing them is allowed as well
// as practical. Re-run this only to update the faces; the output is committed so
// no build ever needs the network.

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.env.SLEEPOS_FONTS_OUT || 'web/fonts.css');

// The exact query the screens ask for, so the vendored faces are the ones the
// design was built against rather than an approximation of them.
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@'
  + '0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400'
  + '&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

// Google serves different @font-face blocks by User-Agent; a modern one gets
// woff2, which every browser this page will meet supports.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const res = await fetch(CSS_URL, { headers: { 'user-agent': UA } });
if (!res.ok) {
  console.error(`vendor-fonts: the stylesheet request failed (HTTP ${res.status}).`);
  process.exit(1);
}
const css = await res.text();

// Each @font-face is preceded by a comment naming its subset.
const blocks = [...css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)]
  .filter(([, subset]) => subset === 'latin')
  .map(([, , block]) => block);

if (!blocks.length) {
  console.error('vendor-fonts: no latin @font-face blocks found; the response shape changed.');
  process.exit(1);
}

// Newsreader ships as one variable font, and Google emits a separate @font-face
// for each weight pointing at the identical file. Embedded naively that is the
// same 131 KB inlined four times -- the first run produced an 811 KB stylesheet
// for 220 KB of fonts. Faces that differ only by weight and share a file collapse
// into one declaration with a weight range, which is what a variable font is for.
const groups = new Map();
for (const block of blocks) {
  const url = (block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/) ?? [])[1] ?? '';
  const family = (block.match(/font-family:\s*'([^']+)'/) ?? [, '?'])[1];
  const style = (block.match(/font-style:\s*([^;]+);/) ?? [, 'normal'])[1].trim();
  const weight = (block.match(/font-weight:\s*([^;]+);/) ?? [, '400'])[1].trim();
  const key = `${family}|${style}|${url}`;
  const g = groups.get(key) ?? { block, weights: [] };
  // A range already ("300 600") contributes both ends.
  for (const n of weight.split(/\s+/).map(Number).filter(Number.isFinite)) g.weights.push(n);
  groups.set(key, g);
}

const merged = [...groups.values()].map(({ block, weights }) => {
  if (!weights.length) return block;
  const lo = Math.min(...weights);
  const hi = Math.max(...weights);
  return block.replace(/font-weight:\s*[^;]+;/, `font-weight: ${lo === hi ? lo : `${lo} ${hi}`};`);
});

const cache = new Map();
let fetched = 0;
const out = [];

for (const block of merged) {
  let rewritten = block;
  for (const [, url] of block.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
    if (!cache.has(url)) {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (!r.ok) {
        console.error(`vendor-fonts: ${url} failed (HTTP ${r.status}).`);
        process.exit(1);
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = url.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
      cache.set(url, `data:${mime};base64,${buf.toString('base64')}`);
      fetched += buf.length;
    }
    rewritten = rewritten.replace(url, cache.get(url));
  }
  out.push(rewritten);
}

const header = `/* Vendored by bin/vendor-fonts.mjs. Do not edit by hand.
 *
 * Newsreader and IBM Plex Mono, latin subsets, embedded as data URIs so the
 * published screens render identically to the album with no third-party
 * request. Both faces are SIL Open Font License 1.1.
 *
 * ${merged.length} faces (from ${blocks.length} declarations), ${cache.size} files,
 * ${(fetched / 1024).toFixed(0)} KB of font data.
 */\n`;

const text = header + out.join('\n') + '\n';
writeFileSync(OUT, text);
console.log(`vendor-fonts: ${OUT.replace(ROOT + '/', '')}  ${(text.length / 1024).toFixed(0)} KB  `
  + `(${merged.length} faces from ${blocks.length} declarations, ${cache.size} files, `
  + `${(fetched / 1024).toFixed(0)} KB of font data)`);
