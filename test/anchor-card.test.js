import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD = join(ROOT, 'web/be-card.html');
const PNG = join(ROOT, 'assets/be-card.png');

test('the anchor card renders with no network access', () => {
  // THE PROPERTY THIS PROTECTS. The card is photographed by bin/render.mjs on
  // whatever machine happens to have it -- here, a CI runner, a laptop -- and it
  // has to come out identical every time. One <link> to Google Fonts would make
  // the type dependent on the network: the renderer deliberately does not wait
  // for networkidle (the agent proxy can hang it), so a slow font request does
  // not fail, it silently photographs in Times New Roman.
  const html = readFileSync(CARD, 'utf8');
  const urls = [...html.matchAll(/https?:\/\/[^"')\s]+/g)].map((m) => m[0]);
  assert.deepEqual(urls, [],
    `the card must be self-contained; found ${urls.length} external reference(s): ${urls.join(', ')}`);
  assert.match(html, /href="fonts\.css"/,
    'the card gets its faces from the vendored web/fonts.css');
});

test('the anchor card carries no data, only the instruction', () => {
  // The whole mechanism is that this screen never changes. A score, a date, or
  // a percentile would make it a report, and a report is read rather than
  // obeyed -- so nothing here may be templated or computed.
  // Braces alone would flag every CSS rule in the file, so this looks for the
  // substitution syntaxes only: an f-string field, a JS template hole, a Jinja
  // or Mustache tag, a PHP open. bin/build-screens.py formats its screens with
  // str.format, so a stray {} here is the likeliest way data ever leaks in.
  const html = readFileSync(CARD, 'utf8');
  for (const marker of ['${', '{{', '<?', '{ SCORE', '%(']) {
    assert.ok(!html.includes(marker),
      `found a template marker "${marker}" -- this card is static by design`);
  }
  // The two instructions and the acronym they decode to, verbatim.
  assert.match(html, /Get in <b>bed<\/b>\./);
  assert.match(html, /Close your <b>eyes<\/b>\./);
  assert.match(html, /<span class="word">Bed<\/span>/);
  assert.match(html, /<span class="word">Eyes<\/span>/);
});

test('the photograph of the card is committed and is a real PNG', () => {
  // Committed on purpose. The eight night screens embed real biometrics and
  // this repository is public, so they can only ever leave as a private
  // artifact -- but this card holds nothing personal. Committing the photograph
  // takes chromium out of the send path: delivering it is a file read, which
  // cannot fail four hours into a window the way a render can.
  const png = readFileSync(PNG);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'assets/be-card.png is not a PNG');

  // Dimensions live in the IHDR chunk, bytes 16..24. Rendered at 390x844 with
  // deviceScaleFactor 2, so a change here means the shell moved.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 780, 'expected 390pt wide at 2x');
  assert.equal(height, 1688, 'expected 844pt tall at 2x');

  assert.ok(statSync(PNG).size > 20_000, 'suspiciously small for a rendered card');
});
