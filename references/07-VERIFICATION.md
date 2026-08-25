# Verification of `07-SCORE-REFERENCE-TABLE.md`

Checked on ingest, 2026-08-25, before any of it was wired into a screen. Method: parse the
main 60-row table, recompute all three grade columns from the cutoffs the document states,
and integrate the implied nightly density to recompute the claimed grade shares.

## What checks out

| Check | Result |
|---|---|
| Main table row count | 60 rows, scores 40–99, none missing |
| Percentile column monotonic in score | ✅ non-decreasing across all 60 |
| Implied density sums to 100% | ✅ 100.00%, including the 0.1% below score 40 |
| **All three grade columns recomputed from stated cutoffs** | ✅ **180/180 cells match, zero mismatches** |

The Standard and Curved cutoffs are stated explicitly in the document and reproduce exactly.

**The Bell ± cutoffs are never written down.** They were derived here as: A ≥ 90th percentile,
B ≥ 70, C ≥ 30, D ≥ 10, F below, with even thirds inside each letter (so A− 90–93.33,
A 93.33–96.67, A+ 96.67+, and so on). That derivation reproduces all 60 bell cells with no
mismatches, so it is almost certainly the intended spec — but it is an inference, and it
should be written into the source document rather than left to be re-derived.

## The one defect: the grade-share table is shifted by one score point

`## Share of actual nights earning each letter` does not follow from the table above it. The
cause is a single consistent off-by-one: the shares are computed as `100 − percentile(s)`
where `s` is the highest score *not* in that grade, rather than `percentile(s+1)`. The
percentile column means "share of nights scoring **below** this", so the share of nights at
or under score `s` is `percentile(s+1)`, not `percentile(s)`.

| | Doc | Recomputed | |
|---|---|---|---|
| Standard A | 10.9% | **8.5%** | doc's 10.9 = `100 − pct(88)`, but 88 grades B+ |
| Standard F | 56.2% | **60.4%** | doc's 56.2 = `pct(79)`, but 79 grades F, so it belongs inside |
| Bell A | 10.9% | **8.5%** | same boundary, same error |
| Bell F | 9.3% | **10.7%** | |
| Curved A | 27.5% | **23.7%** | design target was 25% |
| Curved F | 4.2% | **5.0%** | design target was 5% — recomputed value hits it exactly |

**The document's own prose contains the proof.** It argues, correctly, that "a pass line at
the 60th percentile fails 60% of everything, always, for any dataset." Standard's pass line
*is* the 60th percentile. So Standard's F share must be ~60%, which is what recomputation
gives (60.4%). The 56.2% in the share table contradicts the sentence written to explain it.

Two published summary claims inherit the error:

- "**it fails 56% of nights**" (twice, in the column guide and in *Which to use*) → **60.4%**
- "**A and B together: 20% standard · 32% bell · 60% curved**" → **16.7% · 27.5% · 56.3%**

None of this touches the percentile column, the intervals, or any individual grade. The
per-row data is sound; only the aggregate summary of it is wrong. Curved still does what it
was designed to do — it roughly triples the A+B share versus Standard, and its F share of
5.0% hits the 5% design target on the nose.

## Rules extracted for the screen build

1. **Never label this "national".** Reference population is Oura member *nights*. The
   document is explicit and repeats it in the standing caveats.
2. **The unit is a night, not a person.** "Better than 89% of member nights" is supported;
   "better than 89% of members" is not.
3. **Low-confidence rows must not display a percentile number on a screen.** Those are
   scores **40–59** and **94–99** (26 of 60 rows, all marked †). Scores 60–93 are `medium`
   and may show a number. No row is `high`.
4. **Curved is the column to feature**, per the document's own recommendation.
5. Keep Standard visible for the reason the document gives: it demonstrates what school
   cutoffs do to a rank. Its F share is a property of ranking, not of sleep quality.
6. The SD column is a distance measure and must not be used for a "better than X%" claim.
