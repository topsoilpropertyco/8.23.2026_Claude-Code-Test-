// Rotation playlist.
//
// The library is small on purpose and loops forever. One "cycle" is a single
// pass through all 55 facts: nothing repeats until the pool is exhausted, then
// the pool reshuffles and the cycle number advances. That is the spaced
// repetition the playbook asks for, not a bug to be padded away.
//
// The lucid facts are spread evenly through the cycle rather than clumped, so
// the 70/30 body-science-to-lucid mix holds over any stretch of the cycle
// instead of only over the whole thing.

import { rngFrom, shuffle } from './rng.js';

export function buildCycle(facts, cycleNumber) {
  const rng = rngFrom(`sleep-os:cycle:${cycleNumber}`);

  const sleep = shuffle(facts.filter((f) => f.library === 'sleep'), rng);
  const lucid = shuffle(facts.filter((f) => f.library === 'lucid'), rng);

  const total = sleep.length + lucid.length;
  const playlist = new Array(total).fill(null);

  // Place lucid facts at evenly spaced positions across the cycle.
  const lucidPositions = new Set();
  for (let i = 0; i < lucid.length; i++) {
    let pos = Math.min(total - 1, Math.round((i + 0.5) * (total / lucid.length)));
    while (lucidPositions.has(pos)) pos = (pos + 1) % total;
    lucidPositions.add(pos);
    playlist[pos] = lucid[i];
  }

  // Fill every remaining position with the shuffled sleep facts in order.
  let s = 0;
  for (let i = 0; i < total; i++) {
    if (playlist[i] === null) playlist[i] = sleep[s++];
  }

  return playlist;
}

export function cycleMixRatio(playlist) {
  const lucid = playlist.filter((f) => f.library === 'lucid').length;
  return { lucid: lucid / playlist.length, sleep: 1 - lucid / playlist.length };
}
