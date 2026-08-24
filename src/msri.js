// Multi-Signal Recovery Index.
//
// This replaces an inline block in web/build.js that had three problems.
//
// The dashboard labelled the number "EWMA-filtered signal" and there was no
// EWMA anywhere in the code -- it was a single night's arithmetic wearing a
// smoothing label. There is a real one here now.
//
// Every biometric input was interpolated from the sleep score by a linear ramp,
// a leftover from before the ring was connected. So "HRV" was not HRV, it was
// the score in different units, and the index could not disagree with the score
// it was supposedly corroborating. It now reads the real measurements.
//
// And the personal baselines were hardcoded (HRV 47, resting heart rate 53).
// They are computed from Seth's own history.
//
// Every factor is capped. The original spec left them unbounded above, which
// lets one strong signal carry the index past 100 and stop discriminating.
//
// The caps are asymmetric on purpose -- a genuinely strong recovery night should
// register as better than baseline, not merely at it -- which means the weighted
// sum tops out above 1. The result is normalised by that ceiling so the index is
// honestly 0-100: 100 means every factor hit its cap, which is rare by design.

const TARGET_SLEEP_SECONDS = 8 * 3600;

// Weights sum to 1. Sleep duration leads because it is the input with the most
// evidence behind it and the one Seth can actually move.
const W = { duration: 0.35, autonomic: 0.30, quality: 0.20, efficiency: 0.15 };

// Caps. Autonomic can exceed 1 because a genuinely strong recovery night should
// register as better than baseline, not merely at it -- but not without limit.
const CAP = { duration: 1, autonomic: 1.25, quality: 1.15 };

/** The largest weighted sum the caps permit. Normalising by it bounds the index. */
export const CEILING =
  W.duration * CAP.duration +
  W.autonomic * CAP.autonomic +
  W.quality * CAP.quality +
  W.efficiency * 1;

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * Personal baselines from history. Hardcoded population figures are worse than
 * useless for an index that exists to say "compared to you".
 */
export function baselineFrom(records) {
  const hrv = records.map((r) => r.average_hrv).filter((v) => typeof v === 'number');
  const rhr = records.map((r) => r.lowest_heart_rate).filter((v) => typeof v === 'number');
  return {
    hrv: mean(hrv),
    rhr: mean(rhr),
    n: Math.min(hrv.length, rhr.length),
  };
}

/**
 * One night's composite, 0-100, or null when the night lacks the inputs.
 *
 * Returning null rather than a partial score is deliberate: an index computed
 * from half its factors is not a smaller version of the same number, it is a
 * different number wearing the same name.
 */
export function nightIndex(rec, baseline) {
  if (!rec) return null;

  const tst = rec.total_sleep_duration;
  const deep = rec.deep_sleep_duration;
  const rem = rec.rem_sleep_duration;
  const eff = rec.efficiency;
  const hrv = rec.average_hrv;
  const rhr = rec.lowest_heart_rate;

  const missing = [];
  if (typeof tst !== 'number' || tst <= 0) missing.push('total_sleep_duration');
  if (typeof deep !== 'number') missing.push('deep_sleep_duration');
  if (typeof rem !== 'number') missing.push('rem_sleep_duration');
  if (typeof eff !== 'number') missing.push('efficiency');
  if (typeof hrv !== 'number') missing.push('average_hrv');
  if (typeof rhr !== 'number') missing.push('lowest_heart_rate');
  if (!baseline?.hrv || !baseline?.rhr) missing.push('baseline');
  if (missing.length) return null;

  const duration = Math.min(CAP.duration, tst / TARGET_SLEEP_SECONDS);

  // Autonomic: HRV against your own mean, penalised as resting heart rate runs
  // above your own mean. Only elevation is penalised -- a low resting rate is
  // already reflected by not being penalised, and rewarding it twice would let
  // one signal dominate.
  const autonomic = Math.min(
    CAP.autonomic,
    (hrv / baseline.hrv) * Math.exp(-0.05 * Math.max(0, rhr - baseline.rhr)),
  );

  // Restorative fraction: deep plus REM against 45% of time asleep, which is
  // roughly the healthy adult share.
  const quality = Math.min(CAP.quality, (deep + rem) / (tst * 0.45));

  const weighted =
    W.duration * duration +
    W.autonomic * autonomic +
    W.quality * quality +
    W.efficiency * (eff / 100);

  return 100 * (weighted / CEILING);
}

/**
 * Exponentially weighted moving average, seeded with the first observation.
 *
 * Seeding at zero -- the defect this replaces -- makes the first several terms
 * climb out of a hole that was never a measurement, so an index would read low
 * for a week purely because it had just started.
 */
export function ewma(values, alpha) {
  if (!values.length) return [];
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(alpha * values[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

/**
 * The filtered index over a run of nights.
 *
 * `window` is the nominal span in nights; alpha is derived from it the standard
 * way so the parameter means something a person can reason about.
 */
export function msri(records, { window = 7, minNights = 14 } = {}) {
  const sorted = [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const baseline = baselineFrom(sorted);

  const scored = sorted
    .map((r) => ({ date: r.date, value: nightIndex(r, baseline) }))
    .filter((x) => x.value != null);

  if (scored.length < minNights) {
    return {
      value: null,
      reason: `only ${scored.length} scorable nights; need ${minNights}`,
      coverage: scored.length,
      total: sorted.length,
      baseline,
      window,
    };
  }

  const alpha = 2 / (window + 1);
  const smoothed = ewma(scored.map((x) => x.value), alpha);

  return {
    value: smoothed[smoothed.length - 1],
    raw: scored[scored.length - 1].value,
    series: scored.map((x, i) => ({ date: x.date, raw: x.value, smoothed: smoothed[i] })),
    coverage: scored.length,
    total: sorted.length,
    baseline,
    window,
    alpha,
  };
}
