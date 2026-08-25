import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
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

test('the configured base is a real https origin', () => {
  const base = loadConfig().screensUrl;
  assert.ok(base, 'screensUrl is the Pages base and the link cannot be built without it');
  assert.match(base, /^https:\/\//);
  assert.ok(!base.includes('#'), 'the key is added at build time, never stored in config');
});

test('delivery mode is one of the two implemented paths', () => {
  const mode = loadConfig().deckDelivery;
  assert.ok(['album', 'link'].includes(mode), `unknown deckDelivery: ${mode}`);
});

/* --------------------------------------------------------------- the payload */

const build = (secret) => {
  execFileSync('node', ['bin/build-page.mjs'],
    { cwd: ROOT, env: { ...process.env, SLEEPOS_DATA_KEY: secret }, stdio: 'pipe' });
  return readFileSync(join(ROOT, 'site/index.html'), 'utf8');
};

test('the published page carries no plaintext from the dashboard', () => {
  const page = build(KEY_A);
  const deck = readFileSync(join(ROOT, 'web/deck.html'), 'utf8');
  // Sample every distinctive run of text from the dashboard and assert none of
  // it survives into what gets served. This is the whole point of the exercise:
  // the repository is public.
  const probes = ['Last night, eight ways', 'Sleep OS —', 'nights, each panel',
                  'Grade vs members', 'Rebuilt from your own Oura record'];
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
  assert.ok(plain.includes('Last night, eight ways'), 'decrypted to the wrong thing');
  assert.ok(plain.includes('<iframe'), 'the panels are missing from the payload');
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
  assert.ok(existsSync(join(ROOT, 'site/.nojekyll')),
    'Pages would otherwise run this through Jekyll');
});
