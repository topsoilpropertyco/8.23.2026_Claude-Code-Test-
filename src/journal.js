// Journal and sleep-log storage.
//
// Two append-only logs beside the delivery history. Append-only because the
// value of a journal is the sequence: entries are never rewritten, only added,
// so the record of what you actually thought on a given night stays honest.

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';
import { encryptLine, decryptLine, hasKey, looksEncrypted, MissingKeyError } from './crypto.js';

// Overridable so tests can exercise the real write paths without touching the
// real journal. A test that appends to state/journal.ndjson corrupts the streak
// and would commit fabricated entries -- which is exactly what happened once.
const DIR = process.env.SLEEPOS_STATE_DIR || join(ROOT, 'state');
const JOURNAL = join(DIR, 'journal.ndjson');
const SLEEPLOG = join(DIR, 'sleeplog.ndjson');

/**
 * Read a log, and account for what could NOT be read.
 *
 * The old version returned [] both when a log was empty and when it was
 * unreadable, which meant a missing or rotated SLEEPOS_DATA_KEY looked exactly
 * like "you have never logged anything". That is the worst possible failure
 * for this app: the coach would cheerfully report 0 nights on the record while
 * 1,042 sat encrypted on disk, and appends would keep succeeding under the new
 * key, quietly splitting the log across two keys with no error anywhere.
 *
 * Reading is still resilient -- one corrupt record never takes the file down --
 * but the damage is now counted and surfaced instead of swallowed.
 */
function readAccounted(path) {
  if (!existsSync(path)) return { entries: [], lines: 0, unreadable: 0, keyPresent: hasKey() };
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const keyPresent = hasKey();
  const entries = [];
  let unreadable = 0;
  for (const line of lines) {
    if (!keyPresent && looksEncrypted(line)) { unreadable += 1; continue; }
    try {
      const plain = decryptLine(line);
      if (!plain) { unreadable += 1; continue; }
      entries.push(JSON.parse(plain));
    } catch {
      unreadable += 1;
    }
  }
  return { entries, lines: lines.length, unreadable, keyPresent };
}

function read(path) {
  return readAccounted(path).entries;
}

/**
 * Health of both logs, for the CLI and for any caller that must not mistake
 * "unreadable" for "empty". `unreadable > 0` always means something is wrong.
 */
export function logHealth() {
  const j = readAccounted(JOURNAL);
  const s = readAccounted(SLEEPLOG);
  const files = { journal: { path: JOURNAL, ...j }, sleeplog: { path: SLEEPLOG, ...s } };
  for (const f of Object.values(files)) delete f.entries;
  const unreadable = j.unreadable + s.unreadable;
  return {
    ok: unreadable === 0,
    keyPresent: hasKey(),
    unreadable,
    // Records exist on disk and not one of them decoded: key absent or wrong.
    totallyBlind: (j.lines + s.lines) > 0 && (j.entries.length + s.entries.length) === 0,
    files,
  };
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

/**
 * Consecutive days ending today that carry at least one journal entry.
 *
 * A streak is the strongest thing the affirmation layer can say, because it is
 * evidence rather than an adjective: "nine nights running" is a fact about who
 * you are, where "well done" is a gold star. So it has to be honest -- the run
 * must reach today, and a missed day breaks it rather than being forgiven.
 */
export function journalStreak(entries, todayString) {
  const days = new Set(entries.map((e) => e.date).filter(Boolean));
  if (!days.has(todayString)) return 0;

  let streak = 0;
  // Walk backwards in UTC from the given date string. Dates are already local
  // calendar strings, so stepping by 86,400,000 ms never crosses a DST seam.
  const cursor = new Date(`${todayString}T00:00:00Z`);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - 86400000);
  }
  return streak;
}
