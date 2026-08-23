// Fact library loading.
//
// The libraries in data/ are the product. Everything else in this repo is
// replaceable; those two JSON files are not. They are loaded verbatim and the
// five card fields are never rewritten at runtime.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CARD_FIELDS = ['reframe', 'proof', 'currency', 'move', 'truth'];

export const CARD_LABELS = {
  reframe: 'The High-Yield Reframe',
  proof: 'The Data Proof',
  currency: 'The Daily Currency',
  move: "Tonight's 1% Move",
  truth: 'The Root Truth',
};

export function loadLibraries() {
  const sleep = JSON.parse(readFileSync(join(ROOT, 'data/facts.sleep.json'), 'utf8'));
  const lucid = JSON.parse(readFileSync(join(ROOT, 'data/facts.lucid.json'), 'utf8'));

  const facts = [
    ...sleep.facts.map((f) => ({ ...f, library: 'sleep' })),
    ...lucid.facts.map((f) => ({ ...f, library: 'lucid' })),
  ];

  const seen = new Set();
  for (const fact of facts) {
    if (seen.has(fact.id)) throw new Error(`Duplicate fact id: ${fact.id}`);
    seen.add(fact.id);
    for (const field of CARD_FIELDS) {
      if (!fact[field] || typeof fact[field] !== 'string') {
        throw new Error(`Fact ${fact.id} is missing "${field}"`);
      }
    }
    if (!Array.isArray(fact.slots) || fact.slots.length === 0) {
      throw new Error(`Fact ${fact.id} has no slot affinity`);
    }
  }

  return { facts, byId: new Map(facts.map((f) => [f.id, f])) };
}

export function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
}

export { ROOT };
