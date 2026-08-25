# Oura population data — what is published, and what is not

Researched 2026-08-25 for the "compare me against the national Oura dataset"
screens. Recording the negative result as carefully as the positive one,
because the negative result is what governs the design.

## PUBLISHED AND USABLE

| Figure | Value | Source |
|---|---|---|
| Global mean Sleep Score, all members | **77.0** | Oura 2024 Year in Review — de-identified aggregated member data, Dec 2023 → Nov 2024 |
| New Zealand mean (2024) | 79.8 | Oura 2024 Year in Review |
| Australia mean (2024) | 78.7 | " |
| Sweden mean (2024) | 78.5 | " |
| Finland mean (2024) | 78.4 | " |
| Austria mean (2024) | 78.2 | " |
| New Zealand mean (2025) | 80.0 | Oura 2025 Year in Review |
| Australia mean (2025) | 79.4 | " |
| Oura's own score bands | 85–100 optimal · 70–84 good · <70 pay attention | Oura Member Care, "Sleep Score" |

## NOT PUBLISHED ANYWHERE FOUND — and this is the important part

- **No standard deviation** of the population Sleep Score.
- **No distribution, histogram, quantiles or percentile mapping.**
- **No United States country mean.** The Year in Review articles name only the
  top-ranked countries. US coverage is state-ranked qualitatively (Wyoming
  highest, DC lowest) with no figures.
- No in-app percentile-vs-members feature documented.

### Why that blocks the headline ask

Converting a score into a population percentile needs either the full
distribution or a mean **and** a spread. **Only the mean is published.** With
77.0 alone, "88 is the Nth percentile of Oura members" is not computable, and
any N would be manufactured. Not doing that.

### The SDs that turn up in search are the wrong SDs

Small clinical cohorts report things like 71.13 ± 16.75 (n=13) and 39.9 ± 18.37
(n=12, a sham-treatment arm). Those are intervention groups, not a population,
and the second is obviously unrepresentative. A frequently surfaced "mean 76,
SD 9.1" is **one individual's own night-to-night variation**.

That last confusion is the trap worth naming: **within-person spread is not
between-person spread.** Seth's own SD of 9.54 is how much *his* nights vary.
A population percentile needs how much *people* vary. Substituting one for the
other would produce a confident, sourced-looking, wrong number.

### Second caveat, independent of the maths

"National" is the wrong word for this data even where it exists. Oura members
are self-selected — they bought a $300+ ring to optimise sleep — so the member
mean of 77.0 is not a US population mean. The screens say "Oura members", never
"national". The scoring algorithm also changed (OSSA 2.0, 2023), so figures
across report years are not strictly comparable.

## WHAT THE NATIONAL SCREENS THEREFORE DO

Compare on the axis that real data supports — the **mean** — and say plainly
that percentile is unavailable:
- last night 88 vs the global member mean 77.0 → **+11.0**
- Seth's all-time 79.3 vs 77.0 → **+2.3**
- his all-time 79.3 placed on the published country ladder → sits between
  **Australia 78.7 and New Zealand 79.8**, above the global mean.

Every one of those is arithmetic on published figures. None needs a distribution.

## Sources
- https://ouraring.com/blog/2024-year-in-review/
- https://athletechnews.com/ouras-2024-year-in-review-report-highlights-recovery-trends/
- https://www.wareable.com/wearable-tech/oura-year-in-review-2025-sleep-stress-data-elemental
- https://ouraring.com/blog/2022-year-in-review-community-data/
- https://support.ouraring.com/hc/en-us/articles/360025445574-Sleep-Score
- https://www.nature.com/articles/s41746-024-01125-5 (Five million nights — sleep
  phenotypes, 33,152 people, 4.68M nights; reports phenotypes and durations,
  **not** the proprietary Sleep Score)
