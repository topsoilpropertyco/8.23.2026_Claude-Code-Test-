#!/usr/bin/env node
// Publishes site/ to the gh-pages branch, using git plumbing.
//
// WHY NOT actions/deploy-pages. The Oura ingest now happens inside the
// long-lived serve loop, hours after the job's first step, so the deck is built
// mid-run -- and a workflow step cannot run from inside a running step. A branch
// push can happen from anywhere, so publishing became a git operation rather
// than an Actions one. GitHub Pages serving from a branch is the same product;
// only the trigger differs.
//
// WHY PLUMBING RATHER THAN A CHECKOUT. hash-object / mktree / commit-tree build
// a commit without touching the working tree at all. A worktree or branch switch
// mid-run would move files under a supervisor that is concurrently reading
// config, state and telemetry from those same paths.
//
// Each publish is a fresh orphan commit force-pushed over the branch: the page
// is generated, its history has no value, and keeping one commit stops a
// 0.12 MB file accumulating a version every morning forever.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = 'gh-pages';

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const files = [
  ['index.html', 'site/index.html'],
  ['.nojekyll', 'site/.nojekyll'],
];

for (const [, path] of files) {
  if (!existsSync(join(ROOT, path))) {
    console.error(`publish-page: ${path} is missing. Run bin/build-page.mjs first.`);
    process.exit(1);
  }
}

// A tree entry is "<mode> blob <sha>\t<name>". 100644 is a normal file.
const entries = files.map(([name, path]) => {
  const sha = git('hash-object', '-w', path);
  return `100644 blob ${sha}\t${name}`;
});

const tree = execFileSync('git', ['mktree'], {
  cwd: ROOT, input: `${entries.join('\n')}\n`, encoding: 'utf8',
}).trim();

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const commit = execFileSync('git',
  ['commit-tree', tree, '-m', `Sleep OS dashboard ${stamp}Z`], {
    cwd: ROOT, encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'sleep-os[bot]', GIT_AUTHOR_EMAIL: 'sleep-os@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'sleep-os[bot]', GIT_COMMITTER_EMAIL: 'sleep-os@users.noreply.github.com',
    },
  }).trim();

// Force, deliberately: the branch holds one generated file with no history worth
// preserving, and a fast-forward would require fetching a branch this process
// never reads.
try {
  git('push', '--force', 'origin', `${commit}:refs/heads/${BRANCH}`);
} catch (err) {
  console.error(`publish-page: push to ${BRANCH} failed — ${String(err.stderr || err.message).trim()}`);
  process.exit(1);
}

console.log(`publish-page: ${BRANCH} now at ${commit.slice(0, 8)} (${entries.length} files)`);
