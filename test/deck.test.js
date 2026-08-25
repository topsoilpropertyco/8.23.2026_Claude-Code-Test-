import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sendMediaGroup, MEDIA_GROUP_MAX } from '../src/telegram.js';
import { loadConfig } from '../src/facts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NIGHT_FILE = join(ROOT, 'data/last-night.json');
const SCREENS = ['s1', 's2', 's3', 's4', 's5', 's6', 'g1', 'g2'];

const build = (score) => {
  execFileSync('node', ['bin/build-night-data.mjs', '--sample', String(score)], { cwd: ROOT });
  execFileSync('python3', ['bin/build-screens.py'], { cwd: ROOT, stdio: 'pipe' });
};
const html = (k) => readFileSync(join(ROOT, `variants/${k}/index.html`), 'utf8');
// Only VISIBLE TEXT may be searched for a score. Numbers also live in CSS
// declarations (line-height:.88) and SVG coordinates (y="146.91"), and \b91\b
// matches inside 146.91 because a dot is a word boundary -- so tags and their
// attributes have to go, not just the stylesheet.
const text = (k) =>
  html(k)
    .replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');

/* ------------------------------------------------- the regression that shipped */

// The screens used to open with `SCORE, ... = 88, 844, 197, 198, 81`, which made
// the whole deck a photograph of one morning: rebuilding it changed nothing
// because there was no input to change. Seth found it by getting a message about
// a 74 whose link still showed an 88. These two tests are the guard.
// s4 (counts), s5 (trailing averages) and s6 (the night's vitals) legitimately
// never print the score. The rest state it.
const SHOWS_SCORE = ['s1', 's2', 's3', 'g1', 'g2'];

test('no screen carries a score from a previous night', () => {
  for (const score of [74, 91]) {
    build(score);
    const stale = score === 74 ? 91 : 74;
    for (const k of SCREENS) {
      assert.ok(
        !new RegExp(`\\b${stale}\\b`).test(text(k)),
        `${k} still shows ${stale} after rebuilding for ${score} -- a value is hardcoded`,
      );
    }
  }
});

test('the screens that state a score state the right one', () => {
  for (const score of [74, 91]) {
    build(score);
    for (const k of SHOWS_SCORE) {
      assert.ok(
        new RegExp(`\\b${score}\\b`).test(text(k)),
        `${k} does not mention the night's score ${score}`,
      );
    }
  }
});

test('the verdict words follow the data, not the night they were written for', () => {
  // s4 said "best third" and s3 highlighted the +1 SD band, both true only of
  // the 88 they were authored against.
  build(60);
  assert.match(text('s4'), /worst third/);
  assert.match(text('s3'), /-2 SD|-1 SD/);
  build(95);
  assert.match(text('s4'), /best third/);
  assert.match(text('s3'), /\+1 SD|\+2 SD/);
});

test('the builder refuses to run with no night rather than inventing one', () => {
  const stash = `${NIGHT_FILE}.stash`;
  assert.ok(existsSync(NIGHT_FILE));
  renameSync(NIGHT_FILE, stash);
  try {
    assert.throws(
      () => execFileSync('python3', ['bin/build-screens.py'], { cwd: ROOT, stdio: 'pipe' }),
      /./,
      'build-screens must fail without data/last-night.json',
    );
  } finally {
    renameSync(stash, NIGHT_FILE);
  }
});

test('a sample night is labelled on every screen it reaches', () => {
  build(74);
  const night = JSON.parse(readFileSync(NIGHT_FILE, 'utf8'));
  assert.equal(night.sample, true);
  for (const k of SCREENS) {
    assert.match(text(k), /SAMPLE DATA/, `${k} renders sample data with no warning`);
  }
});

test('the counts on the grid always account for every night', () => {
  build(74);
  const { standing, population } = JSON.parse(readFileSync(NIGHT_FILE, 'utf8'));
  // s4 draws one outline box per group; a gap would show as a missing cell.
  assert.equal(standing.below + standing.above + standing.ties, population.n);
  assert.equal(standing.rank, standing.above + 1);
});

/* --------------------------------------------------------------- the delivery */

test('the deck fits one Telegram album', () => {
  assert.equal(MEDIA_GROUP_MAX, 10);
  assert.ok(SCREENS.length <= MEDIA_GROUP_MAX, 'the deck must fit in a single album');
  const sender = readFileSync(join(ROOT, 'bin/send-deck.mjs'), 'utf8');
  for (const k of SCREENS) assert.ok(sender.includes(`'${k}'`), `send-deck omits ${k}`);
});

test('an album larger than the cap is refused, not silently truncated', async () => {
  // Telegram drops the remainder without erroring, so a quiet pass here would
  // mean screens going missing with nothing in the log to say so.
  await assert.rejects(
    () => sendMediaGroup('t', '1', Array(11).fill('/dev/null')),
    /exceeds Telegram's limit/,
  );
  await assert.rejects(() => sendMediaGroup('t', '1', []), /no files/);
});

test('the configured deck URL is one a scheduled run can actually redeploy', () => {
  // The original bug was a claude.ai artifact URL: nothing in a cron run can
  // republish one, so it froze on the night it was built. A Pages URL is fine --
  // CI rebuilds and redeploys the same address every morning. What must never
  // come back is a link to a one-shot published snapshot.
  const url = loadConfig().screensUrl;
  assert.ok(url, 'the dashboard needs a base URL');
  assert.ok(!/claude\.ai|\/artifact\//.test(url),
    'a published-artifact link cannot be rebuilt by CI and will go stale');
  assert.match(url, /^https:\/\/[a-z0-9.-]+\.github\.io\//,
    'expected the GitHub Pages origin this workflow deploys to');
});

test('no screen ever renders a doubled sign', () => {
  // s3 printed "+-0.56 SD" and the removed n1 printed a hero reading "+-3":
  // a literal + written into the template in front of a value already formatted
  // with its own sign. Correct for the night it was authored against, wrong for
  // every night on the other side of the mean.
  for (const score of [60, 74, 88, 95]) {
    build(score);
    for (const k of SCREENS) {
      const t = text(k).replace(/&[a-z]+;/g, ' ');
      for (const bad of ['+-', '-+', '+\u2212', '\u2212+']) {
        assert.ok(!t.includes(bad), `${k} renders "${bad}" at score ${score}`);
      }
    }
  }
});

test('the removed member-average screens stay removed', () => {
  // Seth asked for both to go: "I'm not trying to compare myself to the average".
  for (const gone of ['n1', 'n2']) {
    assert.ok(!SCREENS.includes(gone));
    assert.ok(!existsSync(join(ROOT, `variants/${gone}/index.html`)), `${gone} was rebuilt`);
  }
  // g1 stays -- it grades one night against member nights rather than averaging
  // his whole history against a stranger's.
  assert.ok(SCREENS.includes('g1'));
});
