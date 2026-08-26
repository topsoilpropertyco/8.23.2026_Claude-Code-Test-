#!/usr/bin/env node
// Wraps web/deck.html in an encrypted, publicly-hostable page.
//
// The problem this solves: a link has to live somewhere a scheduled run can
// redeploy, and the only such place available is GitHub Pages on this repository
// -- which is public. Sleep scores, HRV, resting heart rate and a thousand nights
// of history are not things to put on the open web.
//
// So what gets published is ciphertext. The dashboard is encrypted with
// AES-256-GCM and the page is a small loader that takes the key from the URL
// FRAGMENT -- the part after the '#', which browsers never transmit to any
// server. GitHub serves the bytes and cannot read them; anyone who finds the
// repository or the bare URL sees a page that says it needs a key.
//
// The key is derived from SLEEPOS_DATA_KEY with HKDF-SHA256 rather than being a
// new secret. Two reasons: CI already holds that secret, so nothing new has to be
// configured; and HKDF is one-way, so the derived key appearing in a URL reveals
// nothing about the key protecting the telemetry itself. It is also stable, which
// is the point -- the same link keeps working after every redeploy.
//
// What this does NOT protect against: the link itself leaking. Anyone holding the
// full URL can read the history. It travels in a private Telegram chat, which is
// the same channel already carrying the scores in plain text.
//
//   node bin/build-page.mjs           # writes site/index.html, prints the URL
//   node bin/build-page.mjs --url     # print the URL only

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { pageKey, deckUrl } from '../src/deckurl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so a test can encrypt its own fixture without reading or writing
// the files the real pipeline uses. resolve, not join: an absolute override must
// stay absolute.
const IN = resolve(ROOT, process.env.SLEEPOS_PAGE_IN || 'web/deck.html');
const SITE = resolve(ROOT, process.env.SLEEPOS_PAGE_OUT || 'site');

const secret = process.env.SLEEPOS_DATA_KEY;
if (!secret) {
  console.error('build-page: SLEEPOS_DATA_KEY is required (the page key is derived from it).');
  process.exit(1);
}

// Derived in src/deckurl.js so the encryptor and the message that hands out the
// link share one implementation.
const KEY = Buffer.from(pageKey(secret), 'base64url');
const url = deckUrl();

if (process.argv.includes('--url')) {
  if (!url) {
    console.error('build-page: no screensUrl in config.json, so there is no link to print.');
    process.exit(1);
  }
  console.log(url);
  process.exit(0);
}

const plain = Buffer.from(readFileSync(IN));
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', KEY, iv);
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
const payload = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');

// The loader is deliberately tiny and dependency-free. Everything it needs is in
// WebCrypto, which every current browser has, and the ciphertext is inline so
// there is no second request that could be blocked or cached stale.
const loader = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sleep OS</title>
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#1A1814">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1A1814;color:#F4F0E6;min-height:100vh;display:grid;place-items:center;
  font-family:ui-monospace,'SF Mono',Menlo,monospace;padding:28px;text-align:center}
.w{max-width:34ch;line-height:1.7;font-size:12.5px;letter-spacing:.04em}
.w b{display:block;font-size:11px;letter-spacing:.24em;text-transform:uppercase;
  margin-bottom:14px;color:#9A9488}
.w code{color:#E0B27A}
</style></head>
<body>
<div id="g" class="w">
  <b>Sleep OS</b>
  Decrypting&hellip;
</div>
<script id="d" type="application/octet-stream">${payload}</script>
<script>
(async () => {
  const g = document.getElementById('g');
  const fail = (m) => { g.innerHTML = '<b>Sleep OS</b>' + m; };
  const raw = (location.hash || '').replace(/^#/, '').trim();
  if (!raw) return fail('This page is encrypted. Open the full link, including the '
    + '<code>#</code> and everything after it &mdash; that part is the key and it never '
    + 'reaches any server.');
  try {
    const b64u = (s) => {
      const p = s.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(p + '='.repeat((4 - p.length % 4) % 4));
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    };
    const key = await crypto.subtle.importKey('raw', b64u(raw), 'AES-GCM', false, ['decrypt']);
    const all = Uint8Array.from(atob(document.getElementById('d').textContent.trim()),
      (c) => c.charCodeAt(0));
    // iv(12) || tag(16) || ciphertext -- WebCrypto wants the tag appended to the body.
    const iv = all.slice(0, 12);
    const tag = all.slice(12, 28);
    const body = all.slice(28);
    const joined = new Uint8Array(body.length + tag.length);
    joined.set(body); joined.set(tag, body.length);
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, joined);
    const doc = new TextDecoder().decode(out);
    // document.write() after the parser has closed APPENDS rather than replaces,
    // so the loader's own markup survived underneath the dashboard. Swapping the
    // documentElement's contents replaces head and body in one step.
    //
    // Sliced with indexOf rather than a regex on purpose: this string passes
    // through a template literal on the way out, and an escaped slash in a regex
    // literal does not survive that. It already broke once.
    const openEnd = doc.indexOf('>', doc.indexOf('<html'));
    const closeAt = doc.lastIndexOf('</html');
    document.documentElement.innerHTML =
      doc.slice(openEnd + 1, closeAt > openEnd ? closeAt : doc.length);

    // And now run the scripts, because innerHTML does not.
    //
    // This line is the whole reason the page rendered as a column of headings
    // with nothing under them. The note that used to sit here said scripts not
    // executing was "fine -- the dashboard is HTML and CSS only", and that was
    // true of the static screens this loader was written for. The dashboard that
    // replaced them draws every tile, chart, and table from the embedded payload
    // at runtime, so an injected document whose scripts never run is exactly a
    // stylesheet with no content: the headings appear, the placeholder dashes
    // stay dashes, and it looks for all the world like missing data.
    //
    // A script element inserted as markup is inert by specification. Cloning it
    // into a fresh element created by the DOM is the standard way to get it to
    // run; document order is preserved, so the JSON payload above is in place
    // before the script that reads it executes.
    for (const old of Array.from(document.querySelectorAll('script'))) {
      const fresh = document.createElement('script');
      for (const a of Array.from(old.attributes)) fresh.setAttribute(a.name, a.value);
      fresh.textContent = old.textContent;
      old.parentNode.replaceChild(fresh, old);
    }
  } catch (e) {
    fail('That key did not decrypt this page. It may be an older link &mdash; '
      + 'the newest one is in your morning message.');
  }
})();
</script>
</body></html>
`;

mkdirSync(SITE, { recursive: true });
writeFileSync(join(SITE, 'index.html'), loader);

// The vendored typefaces ride alongside, unencrypted and deliberately so. They
// are open-licensed font data with nothing personal in them, and keeping them
// out of the ciphertext means one cached same-origin request serves all eight
// screens instead of the same 220 KB being embedded once per iframe.
const fonts = resolve(ROOT, 'web/fonts.css');
if (existsSync(fonts)) {
  copyFileSync(fonts, join(SITE, 'fonts.css'));
  console.log(`build-page: fonts.css ${(statSync(fonts).size / 1024).toFixed(0)} KB (public, uncached faces)`);
} else {
  console.error('build-page: web/fonts.css is missing — the screens will fall back to system fonts.'
    + ' Run bin/vendor-fonts.mjs.');
}
// Pages would otherwise run the output through Jekyll, which strips files and
// directories beginning with an underscore and can rewrite what it thinks is
// template syntax. There is no Jekyll here; the file is already the site.
writeFileSync(join(SITE, '.nojekyll'), '');

console.log(`build-page: site/index.html  ${(loader.length / 1e6).toFixed(2)} MB `
  + `(${(plain.length / 1e6).toFixed(2)} MB plaintext, AES-256-GCM)`);
if (url) console.log(`  ${url}`);
else console.log('  set screensUrl in config.json to print the full link');
