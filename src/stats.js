// Statistics shared by the coach today and the Oura analytics layer later.
//
// Everything here degrades honestly on small samples: with six nights logged
// there is no meaningful percentile, and the functions say so rather than
// returning a confident-looking number built on nothing.

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function stdev(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/** Abramowitz & Stegun 7.1.26 — accurate to ~1.5e-7, ample for a percentile. */
export function erf(x) {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function zScore(value, history) {
  const s = stdev(history);
  if (s === null || s === 0) return null;
  return (value - mean(history)) / s;
}

/**
 * Percentile rank. Sleep scores are bounded at 100 and left-skewed, so the
 * empirical rank against actual history is used rather than a normal CDF --
 * simpler, and it cannot claim a 99th percentile the data does not contain.
 */
export function percentileRank(value, history) {
  if (history.length < 2) return null;
  const below = history.filter((x) => x < value).length;
  const equal = history.filter((x) => x === value).length;
  return ((below + 0.5 * equal) / history.length) * 100;
}

/** Normal-CDF percentile, kept for the Oura layer where the spec asks for it. */
export function gaussianPercentile(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2)) * 100;
}

export function trailing(series, windows = [7, 30, 90, 180, 365]) {
  const seen = new Set();
  return windows
    .map((k) => {
      const slice = series.slice(-k);
      return { window: k, days: slice.length, avg: mean(slice), partial: slice.length < k };
    })
    .filter((t) => {
      if (t.days < 2) return false;
      // Two windows covering the identical slice carry identical information.
      if (seen.has(t.days)) return false;
      seen.add(t.days);
      return true;
    });
}

/**
 * How much the record can honestly support.
 * Each tier unlocks a claim the previous one could not justify.
 */
export function confidence(n) {
  if (n < 3) return 'seeding';
  if (n < 7) return 'emerging';
  if (n < 14) return 'weekly';
  if (n < 30) return 'monthly';
  return 'full';
}
