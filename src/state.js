// Persisted state.
//
// Two files, both committed by the workflow so the rotation survives across
// runs on an ephemeral runner:
//   state/state.json     - current cycle, remaining queue, today's sends
//   state/history.ndjson - append-only record of every notification sent
//
// state.json is deliberately small: send records older than the retention
// window are dropped from it, because history.ndjson is the durable log.

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './facts.js';

const STATE_DIR = join(ROOT, 'state');
const STATE_FILE = join(STATE_DIR, 'state.json');
const HISTORY_FILE = join(STATE_DIR, 'history.ndjson');
const RETAIN_DAYS = 40;

const EMPTY = { version: 1, cycle: 0, remaining: null, sends: {} };

export function loadState() {
  if (!existsSync(STATE_FILE)) return { ...EMPTY };
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) };
  } catch {
    // A corrupt state file should not stop tonight's 9 PM nudge; the rotation
    // simply restarts rather than the engine going silent.
    return { ...EMPTY };
  }
}

export function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  const dates = Object.keys(state.sends ?? {}).sort();
  const keep = dates.slice(-RETAIN_DAYS);
  const trimmed = {};
  for (const d of keep) trimmed[d] = state.sends[d];
  writeFileSync(STATE_FILE, `${JSON.stringify({ ...state, sends: trimmed }, null, 2)}\n`);
}

export function sentSlotsFor(state, dateString) {
  return Object.keys(state.sends?.[dateString] ?? {});
}

export function recordSend(state, dateString, slotId, record, { persist = true } = {}) {
  state.sends ??= {};
  state.sends[dateString] ??= {};
  state.sends[dateString][slotId] = record;

  // Dry runs mutate the in-memory state so the preview stays coherent across
  // slots, but must never touch the durable delivery log.
  if (!persist) return state;

  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(HISTORY_FILE, `${JSON.stringify({ date: dateString, slot: slotId, ...record })}\n`);
  return state;
}

export function readHistory() {
  if (!existsSync(HISTORY_FILE)) return [];
  return readFileSync(HISTORY_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
