// Deterministic seeded randomness.
//
// Every random choice in Sleep OS (jitter offsets, jackpot rolls, per-cycle
// shuffles) is derived from a string seed. Two runs on the same day compute the
// same schedule, which is what lets the dispatcher be re-run every few minutes
// without the target times sliding around underneath it.

/** xmur3 string hash -> 32-bit seed generator. */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function rngFrom(seedString) {
  const seedGen = hashSeed(seedString);
  let a = seedGen();
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller normal sample, clamped to +/- maxAbs.
 * The playbook calls for a Gaussian jitter window rather than a flat one so the
 * delivery times cluster near the anchor but stay unpredictable at the edges.
 */
export function gaussian(rng, sigma, maxAbs) {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const value = z * sigma;
  return Math.max(-maxAbs, Math.min(maxAbs, value));
}

/** Fisher-Yates shuffle driven by a seeded rng. Returns a new array. */
export function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
