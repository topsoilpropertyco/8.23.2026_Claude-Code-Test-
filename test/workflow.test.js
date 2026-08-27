import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

// The step block for one named step, and the shell script inside it.
const stepBlock = (name) => {
  const at = wf.indexOf(`      - name: ${name}\n`);
  assert.ok(at > 0, `no step named ${name}`);
  const next = wf.indexOf('\n      - name: ', at + 1);
  return wf.slice(at, next === -1 ? undefined : next);
};
const runScript = (name) => {
  const block = stepBlock(name);
  const at = block.indexOf('run: |\n');
  assert.ok(at > 0, `${name} has no block run: script`);
  return block.slice(at + 'run: |\n'.length)
    .split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n');
};

test('the window queues its own successor rather than trusting the scheduler', () => {
  // THE OUTAGE THIS EXISTS FOR. On 2026-08-26 GitHub created no scheduled run
  // for 22 hours. The */30 cron was supposed to cover that, on the reading that
  // any one firing keeps a window open -- but the firings are not independent:
  // when the scheduler stops for a repository it stops for every entry at once.
  // Forty-four consecutive firings were dropped and the 9pm cue, the 10pm cue,
  // the intake and the deck all went missing. The chain is what replaces that
  // assumption; this test is what stops it being deleted as redundant.
  const block = stepBlock('Queue the next window');
  assert.match(block, /secrets\.SLEEPOS_DISPATCH_TOKEN/,
    'the chain needs a PAT: GitHub creates no run from a GITHUB_TOKEN dispatch');
  assert.match(block, /actions\/workflows\/sleep-os\.yml\/dispatches/,
    'the successor must be this same workflow, or the chain queues the wrong thing');
  assert.match(block, /continue-on-error:\s*true/,
    'a failed handover must never stop the cues this window still has to send');
});

test('the successor is queued before the window opens, not after', () => {
  // Long windows do get killed -- the first one died to a reclaimed runner with
  // no successor behind it. A step at the end of the job never runs in that
  // case, so the spare has to be queued up front.
  const chainAt = wf.indexOf('      - name: Queue the next window');
  const serveAt = wf.indexOf('      - name: Serve');
  assert.ok(chainAt > 0 && serveAt > 0);
  assert.ok(chainAt < serveAt,
    'queue the successor before serving, so a killed window still has one waiting');
});

test('a missing dispatch token degrades the chain without breaking the run', () => {
  // The secret is the one part of this that lives outside the repo, so the
  // no-token path is the one that has to be provably harmless: it says what is
  // missing and gets out of the way, leaving the cron behaviour that shipped
  // before the chain existed.
  const script = runScript('Queue the next window');
  const out = execFileSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'o/r', GITHUB_REF_NAME: 'main' },
  });
  assert.match(out, /::notice::/, 'a missing token should be reported, not silent');
  assert.doesNotMatch(out, /::error::/);
});

test('the chain does not spawn a window from a one-shot run', () => {
  // A forced slot and a dry run are single passes a person asked for. Chaining
  // off them would start a real six-hour window nobody requested, and a dry run
  // would stop being dry.
  const guard = /^\s*if:\s*(.+)$/m.exec(stepBlock('Queue the next window'))?.[1];
  assert.ok(guard, 'the chain step needs a guard');
  for (const one of ["inputs.slot == ''", 'inputs.dry_run != true', "inputs.oura_action == ''"]) {
    assert.ok(guard.includes(one), `the chain must be gated on ${one}, guard was: ${guard}`);
  }
});

test('the delivery path cannot fail the run', () => {
  // A broken screenshot or a rejected push must never stop a reminder.
  const serveAt = wf.indexOf('- name: Serve');
  assert.ok(serveAt > 0);
  const block = wf.slice(serveAt, serveAt + 700);
  assert.match(block, /continue-on-error:\s*true/);
});
