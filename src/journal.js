// Journal and sleep-log storage.
//
// Two append-only logs beside the delivery history. Append-only because the
// value of a journal is the sequence: entries are never rewritten, only added,
// so the record of what you actually thought on a given night stays honest.

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';

const DIR = join(ROOT, 'state');
const JOURNAL = join(DIR, 'journal.ndjson');
const SLEEPLOG = join(DIR, 'sleeplog.ndjson');

function read(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function append(path, record) {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
  return record;
}

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
