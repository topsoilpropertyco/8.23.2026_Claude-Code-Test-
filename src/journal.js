// Journal and sleep-log storage.
//
// Two append-only logs beside the delivery history. Append-only because the
// value of a journal is the sequence: entries are never rewritten, only added,
// so the record of what you actually thought on a given night stays honest.

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';
import { encryptLine, decryptLine, hasKey, MissingKeyError } from './crypto.js';

const DIR = join(ROOT, 'state');
const JOURNAL = join(DIR, 'journal.ndjson');
const SLEEPLOG = join(DIR, 'sleeplog.ndjson');

function read(path) {
  if (!existsSync(path)) return [];
  if (!hasKey()) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(decryptLine(line));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function append(path, record) {
  if (!hasKey()) throw new MissingKeyError();
  mkdirSync(DIR, { recursive: true });
  appendFileSync(path, `${encryptLine(JSON.stringify(record))}\n`);
  return record;
}

/** Rewrite a plaintext log as ciphertext. Used once, at migration. */
export function encryptFileInPlace(path) {
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const out = lines.map((line) => (line.trim().startsWith('{') ? encryptLine(line.trim()) : line));
  writeFileSync(path, out.length ? `${out.join('\n')}\n` : '');
  return out.length;
}

export const JOURNAL_PATH = JOURNAL;
export const SLEEPLOG_PATH = SLEEPLOG;

export const readJournal = () => read(JOURNAL);
export const readSleepLog = () => read(SLEEPLOG);

export function addJournalEntry(entry) {
  return append(JOURNAL, { at: new Date().toISOString(), ...entry });
}

/** One entry per calendar date; a re-send for the same date supersedes the old one. */
export function addSleepEntry(entry) {
  return append(SLEEPLOG, { at: new Date().toISOString(), ...entry });
}

/** Latest entry per date, oldest first. */
export function sleepSeries() {
  const byDate = new Map();
  for (const e of readSleepLog()) byDate.set(e.date, e);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
