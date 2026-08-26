// The encrypted page's loader, tested the way it is actually used.
//
// This file exists because of a bug that three rounds of testing missed, and the
// reason it was missed matters more than the bug.
//
// The published page is a loader plus ciphertext. The loader decrypts the
// dashboard and injects it by assigning to documentElement.innerHTML -- and a
// script element inserted as markup is inert by specification. When the deck was
// a stack of static screens that was harmless, and a comment in the loader said
// so. The dashboard that replaced them draws every tile, chart and table from an
// embedded payload at runtime, so nothing ran: the page rendered as a column of
// headings over empty containers with the placeholder dashes still in the header.
//
// Every check that said it worked had opened the DECRYPTED file directly, where
// scripts execute normally. The loader -- the only thing in question -- was never
// in the path being tested. So the rule this file enforces is: exercise the
// published artifact, through the loader, with a key in the fragment.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageKey } from '../src/deckurl.js';

const SECRET = 'loader-test-secret-'.repeat(4);
const KEY = pageKey(SECRET);

// A stand-in for the dashboard: inert markup, a JSON payload, and a script that
// has to run for the page to say anything. Exactly the shape of the real one.
const FIXTURE = `<!doctype html><html><head><meta charset="utf-8">
<style>body{background:#111;color:#eee}</style></head><body>
<h1 id="title">Placeholder</h1>
<span id="score">&mdash;</span>
<div id="tiles"></div>
<script id="payload" type="application/json">{"score":68,"tiles":["a","b","c"]}</script>
<script>
  const D = JSON.parse(document.getElementById('payload').textContent);
  document.getElementById('title').textContent = 'Last night.';
  document.getElementById('score').textContent = String(D.score);
  document.getElementById('tiles').innerHTML =
    D.tiles.map((t) => '<div class="tile">' + t + '</div>').join('');
</script>
</body></html>`;

function publish() {
  const dir = mkdtempSync(join(tmpdir(), 'sleep-os-loader-'));
  const src = join(dir, 'deck.html');
  writeFileSync(src, FIXTURE);
  execFileSync(process.execPath, ['bin/build-page.mjs'], {
    env: { ...process.env, SLEEPOS_DATA_KEY: SECRET, SLEEPOS_PAGE_IN: src, SLEEPOS_PAGE_OUT: dir },
    stdio: 'pipe',
  });
  return join(dir, 'index.html');
}

test('the loader re-creates injected scripts so they actually run', () => {
  // The static half of the guard. innerHTML alone is the bug; this asserts the
  // loader does the one thing that fixes it.
  const loader = readFileSync('bin/build-page.mjs', 'utf8');
  assert.match(loader, /createElement\('script'\)/,
    'the loader must re-create script elements — markup-inserted scripts never execute');
  assert.match(loader, /querySelectorAll\('script'\)/);
  assert.ok(!/does\s*\n?\s*\/\/\s*not execute scripts, which is fine/.test(loader),
    'the comment claiming scripts do not need to run described the old static deck');
});

test('the published page renders its content through the loader', async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    t.skip('playwright-core is not installed; the loader render check needs a browser');
    return;
  }
  const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  if (!existsSync(exe)) {
    t.skip(`no chromium at ${exe}; the loader render check needs a browser`);
    return;
  }

  const page = publish();
  const browser = await chromium.launch({ executablePath: exe });
  try {
    const p = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    await p.goto(`file://${page}#${KEY}`);
    await p.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 8000 })
      .catch(() => {});

    // THE ASSERTION THAT WAS MISSING. Not "does the plaintext contain tiles" --
    // it always did -- but "does a reader of the published page see them".
    assert.equal(await p.$$eval('.tile', (n) => n.length), 3,
      'the injected script never ran: the reader gets headings over empty containers');
    assert.equal(await p.textContent('#score'), '68',
      'the placeholder was never replaced, which is what a stale-looking page actually was');
    assert.equal(await p.textContent('#title'), 'Last night.');
    assert.deepEqual(errors, []);

    // And the negative case: no key, no plaintext, and a message that says why.
    const bare = await browser.newPage();
    await bare.goto(`file://${page}`);
    await bare.waitForTimeout(400);
    const text = await bare.textContent('body');
    assert.match(text, /encrypted/i, 'a keyless visitor must be told, not shown a blank page');
    assert.ok(!text.includes('Last night.'), 'no plaintext may appear without the key');

    // A wrong key must fail closed, and say so.
    const wrong = await browser.newPage();
    await wrong.goto(`file://${page}#${pageKey('a different secret entirely------------')}`);
    await wrong.waitForTimeout(400);
    const wrongText = await wrong.textContent('body');
    assert.match(wrongText, /did not decrypt/i);
    assert.ok(!wrongText.includes('Last night.'));
  } finally {
    await browser.close();
  }
});
