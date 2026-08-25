import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = readFileSync(join(ROOT, '.github/workflows/sleep-os.yml'), 'utf8');

// Minimal reader for the handful of scalars asserted below. A YAML dependency is
// not worth adding to a repo with none, and these are all flat `key: value`.
const scalar = (key, from = 0) => {
  const m = new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm').exec(wf.slice(from));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
};

test('the job timeout allows the serve window to finish', () => {
  // THE BUG THIS EXISTS FOR. timeout-minutes was 10, set when a run took four
  // minutes. The Serve step asked for 350 and a job timeout caps every step
  // inside it, so the first two long windows were killed at ~9.5 minutes with
  // the loop logging a clean heartbeat right up to the cut. Nothing in the suite
  // could see it, because the loop was correct and the container was not.
  const jobTimeout = Number(scalar('timeout-minutes'));
  const serveSeconds = Number(/serve (\d+)/.exec(wf)?.[1]);
  assert.ok(Number.isFinite(jobTimeout), 'the job needs an explicit timeout');
  assert.ok(Number.isFinite(serveSeconds), 'could not find the serve window length');

  const windowMin = serveSeconds / 60;
  assert.ok(jobTimeout > windowMin,
    `job timeout ${jobTimeout} min must exceed the serve window ${windowMin} min`);
  // GitHub's hard ceiling for a job is 360 minutes.
  assert.ok(jobTimeout <= 360, `job timeout ${jobTimeout} exceeds GitHub's 360-minute limit`);
  assert.ok(windowMin + 5 <= jobTimeout,
    'leave headroom for the steps that run before the window opens');
});

test('every step timeout is inside the job timeout', () => {
  const jobTimeout = Number(scalar('timeout-minutes'));
  const all = [...wf.matchAll(/^\s*timeout-minutes:\s*(\d+)/gm)].map((m) => Number(m[1]));
  for (const t of all) {
    assert.ok(t <= jobTimeout,
      `a step asks for ${t} min inside a ${jobTimeout} min job — the job wins, silently`);
  }
});

test('the cron is frequent enough to replace a killed window', () => {
  const cron = /cron:\s*'([^']+)'/.exec(wf)?.[1];
  assert.ok(cron, 'no cron found');
  // Long jobs do get killed. concurrency queues rather than cancels, so a
  // frequent cron keeps a hot spare ready to take over in minutes.
  assert.match(cron, /^\*\/(\d+) /, `expected a minute-interval cron, got ${cron}`);
  const every = Number(/^\*\/(\d+) /.exec(cron)[1]);
  assert.ok(every <= 30, `a ${every}-minute cron leaves too long a gap after a kill`);
});

test('concurrency queues rather than cancels the live window', () => {
  assert.match(wf, /concurrency:/);
  assert.equal(scalar('cancel-in-progress'), 'false',
    'cancelling in progress would have a new run kill the window that is working');
});

test('the delivery path cannot fail the run', () => {
  // A broken screenshot or a rejected push must never stop a reminder.
  const serveAt = wf.indexOf('- name: Serve');
  assert.ok(serveAt > 0);
  const block = wf.slice(serveAt, serveAt + 700);
  assert.match(block, /continue-on-error:\s*true/);
});
