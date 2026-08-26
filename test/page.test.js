import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { pageKey, deckUrl } from '../src/deckurl.js';
import { loadConfig } from '../src/facts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

test('the page key is derived, stable, and reveals nothing about the data key', () => {
  const k = pageKey(KEY_A);
  assert.equal(pageKey(KEY_A), k, 'must be reproducible or every deploy breaks the bookmark');
  assert.notEqual(pageKey(KEY_B), k, 'a different data key must give a different page key');
  assert.equal(Buffer.from(k, 'base64url').length, 32, 'AES-256 needs 32 bytes');
  // The derived key ends up in a URL. It must not contain the secret it came
  // from, or handing out the link would hand out the telemetry key.
  assert.ok(!k.includes(KEY_A) && !KEY_A.includes(k));
  assert.equal(pageKey(undefined), null, 'no secret means no key, not a weak one');
});

test('the URL is never returned without its fragment', () => {
  // A bare base is worse than no link: it loads, then reports itself broken.
  const url = deckUrl({ base: 'https://example.com/x', secret: KEY_A });
  assert.match(url, /^https:\/\/example\.com\/x\/#[A-Za-z0-9_-]{43}$/);
  assert.equal(deckUrl({ base: '', secret: KEY_A }), null);
  assert.equal(deckUrl({ base: 'https://example.com', secret: undefined }), null);
  // A trailing slash on the configured base must not produce a double slash.
  assert.equal(
    deckUrl({ base: 'https://example.com/x///', secret: KEY_A }),
    deckUrl({ base: 'https://example.com/x', secret: KEY_A }),
  );
});

test('the configured base matches the repository exactly, casing included', () => {
  const base = loadConfig().screensUrl;
  assert.ok(base, 'screensUrl is the Pages base and the link cannot be built without it');
  assert.match(base, /^https:\/\//);
  assert.ok(!base.includes('#'), 'the key is added at build time, never stored in config');

  // THE BUG THIS EXISTS FOR. GitHub Pages paths are case-sensitive and this
  // repository is named 8.23.2026_Claude-Code-Test-. The config held a
  // lower-cased version, so the URL 404'd while Pages itself was working
  // perfectly -- and I handed that URL to Seth as his permanent link.
  // Derived from the actual remote rather than typed, so it cannot drift again.
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(remote);
  assert.ok(m, `could not parse the remote: ${remote}`);
  const expected = `https://${m[1]}.github.io/${m[2]}`;
  assert.equal(base, expected,
    'the Pages path is case-sensitive and must match the repository name exactly');
});

test('delivery mode is one of the implemented paths', () => {
  // 'auto' probes the published page and picks the link when it is live, the
  // album when it is not, so enabling Pages switches delivery with no code or
  // config change and a link that would 404 is never sent.
  const mode = loadConfig().deckDelivery || 'auto';
  assert.ok(['auto', 'album', 'link'].includes(mode), `unknown deckDelivery: ${mode}`);
});

/* --------------------------------------------------------------- the payload */

// Its own dashboard fixture and its own output directory, so nothing here reads
// or writes what the real pipeline uses on the runner. The dashboard and series
// files are generated from encrypted telemetry and gitignored, so a test that
// depended on them would fail on a clean checkout.
const DIR = mkdtempSync(join(tmpdir(), 'sleepos-page-'));
const nights = [];
let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 300; i++) {
  nights.push({ d: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    s: Math.max(45, Math.min(96, Math.round(79 + (rnd() - 0.5) * 22))),
    t: 400, dp: 80, rm: 95, lt: 210, aw: 20, ef: 90, la: 12, hv: 38, hr: 55, br: 14.2 });
}
writeFileSync(join(DIR, 'series.json'), JSON.stringify({ generated: 'x', nights }));
writeFileSync(join(DIR, 'night.json'), JSON.stringify({
  date: '2025-02-04', score: 74, sample: false, stale: false, daysBehind: 0 }));
execFileSync('node', ['bin/build-dashboard.mjs'], { cwd: ROOT, stdio: 'pipe',
  env: { ...process.env, SLEEPOS_SERIES: join(DIR, 'series.json'),
    SLEEPOS_NIGHT: join(DIR, 'night.json'), SLEEPOS_DASHBOARD_OUT: join(DIR, 'deck.html') } });

const build = (secret) => {
  execFileSync('node', ['bin/build-page.mjs'], {
    cwd: ROOT, stdio: 'pipe',
    env: { ...process.env, SLEEPOS_DATA_KEY: secret,
      SLEEPOS_PAGE_IN: join(DIR, 'deck.html'), SLEEPOS_PAGE_OUT: join(DIR, 'site') },
  });
  return readFileSync(join(DIR, 'site/index.html'), 'utf8');
};

test('the published page carries no plaintext from the dashboard', () => {
  const page = build(KEY_A);
  const deck = readFileSync(join(DIR, 'deck.html'), 'utf8');
  // Sample every distinctive run of text from the dashboard and assert none of
  // it survives into what gets served. This is the whole point of the exercise:
  // the repository is public.
  const probes = ['What the ring measured', 'Score over time', 'Every night',
                  'drag to any score', 'Rebuilt from your own Oura record'];
  for (const p of probes) {
    assert.ok(deck.includes(p), `probe "${p}" is not in the dashboard, so it proves nothing`);
    assert.ok(!page.includes(p), `"${p}" leaked into the published page in plaintext`);
  }
  assert.ok(!page.includes('sleep_score'));
  assert.ok(page.includes('AES-GCM'), 'the loader must actually decrypt something');
});

test('the ciphertext decrypts with the derived key and nothing else', () => {
  const page = build(KEY_A);
  const m = /type="application\/octet-stream">([A-Za-z0-9+/=]+)</.exec(page);
  assert.ok(m, 'no payload found in the page');
  const all = Buffer.from(m[1], 'base64');
  const iv = all.subarray(0, 12);
  const tag = all.subarray(12, 28);
  const body = all.subarray(28);

  const open = (secret) => {
    const d = createDecipheriv('aes-256-gcm', Buffer.from(pageKey(secret), 'base64url'), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString('utf8');
  };

  const plain = open(KEY_A);
  assert.ok(plain.includes('What the ring measured'), 'decrypted to the wrong thing');
  assert.ok(plain.includes('id="payload"'), 'the night data is missing from the payload');
  assert.ok(plain.includes('lineChart'), 'the charts are missing from the payload');
  // GCM authenticates, so a wrong key throws rather than returning garbage.
  assert.throws(() => open(KEY_B), /unable to authenticate|bad decrypt/i);
});

test('a fresh build re-encrypts rather than reusing an IV', () => {
  const grab = (p) => /type="application\/octet-stream">([A-Za-z0-9+/=]+)</.exec(p)[1];
  const a = grab(build(KEY_A));
  const b = grab(build(KEY_A));
  // Same key, same plaintext, different random IV -- identical ciphertext across
  // builds would mean the IV was fixed, which is the classic GCM footgun.
  assert.notEqual(a, b, 'the IV is not being randomised per build');
});

test('the page refuses to be indexed and does not need Jekyll', () => {
  const page = build(KEY_A);
  assert.match(page, /name="robots" content="noindex/);
  assert.ok(existsSync(join(DIR, 'site/.nojekyll')),
    'Pages would otherwise run this through Jekyll');
});
