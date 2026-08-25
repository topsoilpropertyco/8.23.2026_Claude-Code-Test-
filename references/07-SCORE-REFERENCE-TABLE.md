# 07-SCORE-REFERENCE-TABLE.md — the reading view

**Every Oura Sleep Score from 40 to 99, what percentile it sits at among Oura member nights, and how many
standard deviations that is from the member average.**

Reference population: **Oura members, nightly observations.** Not a national or general-population figure.
Member average **77.0** (published by Oura). Pooled nightly SD **9.9** (inferred — Oura has never published
any spread). Generated 2026-08-25.

---

## Why the table starts at 40

40 is the practical floor, not an arbitrary one. On this model:

| Below this score | Share of all member nights |
|---|---|
| 40 | **0.10%** — roughly 1 night in 1,000 |
| 45 | 0.40% |
| 50 | 1.00% |
| 55 | 2.50% |
| 60 | 5.80% |

Below 40 there is essentially nothing left to resolve — the whole range 0–39 is under a tenth of one
percent of nights, and no source in the sweep contains observations there at all. Anything printed for
score 22 would be pure curve, no data. The scale tops out at 99 in practice; a clean 100 is possible but
vanishingly rare and the table treats 99 as the ceiling.

---

## How to read the columns

- **Percentile** — the share of Oura member *nights* that scored below this. **Every row now carries a
  number**, including the extremes. **Bold** = `medium` confidence. A **†** marks a `low`-confidence row:
  the estimate is real and it is the model's best guess, but it rests on pure extrapolation or on a part
  of the curve where no sourced sample has observations. Those rows are here so you can *see* the shape.
  **They should still not display a number on a screen** — that rule is unchanged and lives in the
  handoff, not in this reading view.
- **Standard** — school cutoffs applied to the percentile (90+ = A, 80s = B, 70s = C). Harsh: it fails
  56% of nights. See the warning above.
- **Curved** — the generous curve (A = top 25%, B = next 35%, C = next 25%, D = next 10%, F = bottom 5%).
  **This is the one to use on a screen.**
- **Bell curve** — the forced 10/20/40/20/10 distribution, kept for comparison.
- **90% interval** — how far the answer moves across everything we don't know (the mean's undisclosed
  aggregation, the inferred SD, the unobserved distribution shape). **This is the real answer.** The
  percentile is only its middle.
- **SD from average** — how many standard deviations the score sits from 77.0. This is a
  *distance* measure, not a percentile lookup. Because the distribution is left-skewed and bounded at
  100, +1.11 SD lands at the 89th percentile rather than the 86.7th a normal table would give.
  **Use the percentile column for any "better than X%" claim.**
- **Oura band** — Oura's own published labels.
- **Men only** — percentile against Oura members who are men (member average 73.9, published for 2023).
  Every row of that table is `low` confidence: one mixed-era year, never republished, and it assumes the
  male SD equals the all-member SD, which nobody has published. Informative, not shippable as the default.
- **Conf.** — trust in the *interval*, not its narrowness. Those are different things: score 80 is
  `medium` with a 17-point interval; score 95 is `low` with a 2.5-point one. No row is `high`, and none
  can be until a spread comes from Oura's own member base.

---

## The two letter-grade columns

**Revised twice.** First version computed the standard grade from the raw score instead of the
percentile — wrong, fixed. Second version used a **bell curve**, which did not expand A and B, because
a bell curve does not do that. This version uses a curve in the everyday sense: **softer than standard,
more A's and B's.**

### Why the bell curve didn't give out more A's — two different things share the name "curve"

| | What it does | Effect on A's |
|---|---|---|
| **Bell curve** (forced distribution) | Fixes the shares in advance: 10% A, 20% B, 40% C, 20% D, 10% F. Redistributes everyone into a preset shape. | **None.** A is pinned at 10% no matter what. |
| **Curving in the everyday sense** | The whole class moves up. Cutoffs drop, so more people clear each bar. | **Expands.** This is what you meant. |

A bell curve is a **redistribution**, not a boost. It reshuffles the middle — which is why the last
version lifted the bottom and left the top untouched. Your instinct that a curve should be *softer*
is the ordinary classroom meaning, and it is the more useful one here.

### Standard grade — school cutoffs on the percentile

| Percentile | 97+ | 93–96 | 90–92 | 87–89 | 83–86 | 80–82 | 77–79 | 73–76 | 70–72 | 67–69 | 63–66 | 60–62 | <60 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Grade | A+ | A | A− | B+ | B | B− | C+ | C | C− | D+ | D | D− | F |

### Curved grade — the generous curve

**A = top 25% · B = next 35% · C = next 25% · D = next 10% · F = bottom 5%**, with even thirds inside
each letter. A typical night lands at **B−**.

| Percentile | 91.7+ | 83.3+ | 75+ | 63.3+ | 51.7+ | 40+ | 31.7+ | 23.3+ | 15+ | 11.7+ | 8.3+ | 5+ | <5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Grade | A+ | A | A− | B+ | B | B− | C+ | C | C− | D+ | D | D− | F |

**This is a design choice, not a statistical finding.** The five shares above are the dial. Turn them
and the column changes; nothing else in the table moves. The bell-curve column is kept alongside so you
can see all three side by side.

### Share of actual nights earning each letter

| Letter | Standard | Bell curve | **Curved (in use)** |
|---|---|---|---|
| A | 10.9% | 10.9% | **27.5%** |
| B | 9.2% | 20.6% | **32.8%** |
| C | 11.4% | 39.4% | **25.5%** |
| D | 12.3% | 19.8% | **10.0%** |
| F | **56.2%** | 9.3% | **4.2%** |

A and B together: **20% standard · 32% bell · 60% curved.** That is the expansion you were expecting.

### How the three compare

| Score | Percentile | Standard | Bell curve | **Curved** |
|---|---|---|---|---|
| 60 | 5.8 | F | F | **D−** |
| 65 | 12.3 | F | D− | **D+** |
| 70 | 23.3 | F | D | **C−** |
| 74 | 35.9 | F | C− | **C+** |
| **77** | **47.9** | F | C | **B−** |
| **79** | **56.2** | F | C | **B** |
| 82 | 68.5 | D+ | C+ | **B+** |
| 85 | 79.9 | C+ | B | **A−** |
| **88** | **89.1** | B+ | B+ | **A** |
| 90 | 93.5 | A | A | **A+** |
| 95 | 99.0 | A+ | A+ | **A+** |

**Your 88 is an A on the curve, a B+ on the standard scale.** The member-average night is a B−, which
is roughly how a curved class is supposed to feel.

### Which to use

**The curved column**, for a screen. It behaves the way people expect a grade to behave, and the
"average is a B−" convention is one most people carry around already.

Keep the standard column for one reason: it shows what school cutoffs do to a rank. It fails 56% of
nights — including the member average — and it would do that no matter how well anyone slept, because
a percentile is a rank and ranks are uniform by construction. A pass line at the 60th percentile fails
60% of everything, always, for any dataset. It is an easy mistake to make and a hard one to see once
it is rendered.

One caution before this goes anywhere you look at every morning: a letter grade reads as a verdict in a
way a percentile does not. An F on a night's sleep describes where that night sat in a distribution. It
is not a judgement about you, and a run of bad nights is usually information about circumstances rather
than effort.

---

## The table

| Score | Percentile | Standard | **Curved** | Bell curve | 90% interval | SD from avg | Oura band | Men only | Conf. |
|---|---|---|---|---|---|---|---|---|---|
| **40** | 0.1 † | **F** | **F** | F | 0.0–0.4 | 3.74 below | Pay attention | 0.2 | low |
| **41** | 0.1 † | **F** | **F** | F | 0.0–0.4 | 3.64 below | Pay attention | 0.2 | low |
| **42** | 0.2 † | **F** | **F** | F | 0.0–0.5 | 3.54 below | Pay attention | 0.3 | low |
| **43** | 0.2 † | **F** | **F** | F | 0.0–0.6 | 3.43 below | Pay attention | 0.4 | low |
| **44** | 0.3 † | **F** | **F** | F | 0.0–0.7 | 3.33 below | Pay attention | 0.5 | low |
| **45** | 0.4 † | **F** | **F** | F | 0.1–0.8 | 3.23 below | Pay attention | 0.6 | low |
| **46** | 0.5 † | **F** | **F** | F | 0.1–1.0 | 3.13 below | Pay attention | 0.8 | low |
| **47** | 0.6 † | **F** | **F** | F | 0.1–1.1 | 3.03 below | Pay attention | 0.9 | low |
| **48** | 0.7 † | **F** | **F** | F | 0.1–1.3 | 2.93 below | Pay attention | 1.1 | low |
| **49** | 0.8 † | **F** | **F** | F | 0.2–1.6 | 2.83 below | Pay attention | 1.4 | low |
| **50** | 1.0 † | **F** | **F** | F | 0.3–1.9 | 2.73 below | Pay attention | 1.7 | low |
| **51** | 1.2 † | **F** | **F** | F | 0.4–2.2 | 2.63 below | Pay attention | 2.0 | low |
| **52** | 1.5 † | **F** | **F** | F | 0.5–2.6 | 2.53 below | Pay attention | 2.4 | low |
| **53** | 1.8 † | **F** | **F** | F | 0.7–3.0 | 2.42 below | Pay attention | 2.9 | low |
| **54** | 2.1 † | **F** | **F** | F | 0.9–3.5 | 2.32 below | Pay attention | 3.4 | low |
| **55** | 2.5 † | **F** | **F** | F | 1.2–4.1 | 2.22 below | Pay attention | 4.0 | low |
| **56** | 3.0 † | **F** | **F** | F | 1.5–4.7 | 2.12 below | Pay attention | 4.8 | low |
| **57** | 3.6 † | **F** | **F** | F | 2.0–5.4 | 2.02 below | Pay attention | 5.7 | low |
| **58** | 4.2 † | **F** | **F** | F | 2.5–6.3 | 1.92 below | Pay attention | 6.6 | low |
| **59** | 5.0 † | **F** | **D-** | F | 3.0–7.2 | 1.82 below | Pay attention | 7.8 | low |
| **60** | **5.8** | **F** | **D-** | F | 3.7–8.2 | 1.72 below | Fair | 9.1 | medium |
| **61** | **6.8** | **F** | **D-** | F | 4.4–9.4 | 1.62 below | Fair | 10.5 | medium |
| **62** | **8.0** | **F** | **D-** | F | 5.3–10.7 | 1.52 below | Fair | 12.2 | medium |
| **63** | **9.3** | **F** | **D** | F | 6.3–12.1 | 1.41 below | Fair | 14.0 | medium |
| **64** | **10.7** | **F** | **D** | D- | 7.5–13.7 | 1.31 below | Fair | 16.0 | medium |
| **65** | **12.3** | **F** | **D+** | D- | 8.8–15.5 | 1.21 below | Fair | 18.2 | medium |
| **66** | **14.2** | **F** | **D+** | D- | 10.3–17.5 | 1.11 below | Fair | 20.6 | medium |
| **67** | **16.2** | **F** | **C-** | D- | 12.0–19.6 | 1.01 below | Fair | 23.2 | medium |
| **68** | **18.3** | **F** | **C-** | D | 13.9–22.1 | 0.91 below | Fair | 26.0 | medium |
| **69** | **20.7** | **F** | **C-** | D | 16.1–24.7 | 0.81 below | Fair | 29.1 | medium |
| **70** | **23.3** | **F** | **C-** | D | 18.6–27.6 | 0.71 below | Good | 32.4 | medium |
| **71** | **26.1** | **F** | **C** | D+ | 21.5–30.7 | 0.61 below | Good | 35.9 | medium |
| **72** | **29.1** | **F** | **C** | D+ | 24.7–34.0 | 0.51 below | Good | 39.7 | medium |
| **73** | **32.4** | **F** | **C+** | C- | 28.1–37.6 | 0.40 below | Good | 43.7 | medium |
| **74** | **35.9** | **F** | **C+** | C- | 31.8–41.5 | 0.30 below | Good | 47.8 | medium |
| **75** | **39.7** | **F** | **C+** | C- | 35.4–45.8 | 0.20 below | Good | 52.0 | medium |
| **76** | **43.7** | **F** | **B-** | C | 39.2–50.7 | 0.10 below | Good | 56.2 | medium |
| **77** | **47.9** | **F** | **B-** | C | 42.8–56.1 | **at avg** | Good | 60.2 | medium ← member avg |
| **78** | **52.1** | **F** | **B** | C | 46.6–61.5 | 0.10 above | Good | 64.3 | medium |
| **79** | **56.2** | **F** | **B** | C | 50.5–66.8 | 0.20 above | Good | 68.3 | medium ← your mean |
| **80** | **60.4** | **D-** | **B** | C+ | 54.4–71.4 | 0.30 above | Good | 72.2 | medium |
| **81** | **64.5** | **D** | **B+** | C+ | 58.4–75.5 | 0.40 above | Good | 76.0 | medium |
| **82** | **68.5** | **D+** | **B+** | C+ | 62.5–79.0 | 0.51 above | Good | 79.5 | medium |
| **83** | **72.5** | **C-** | **B+** | B- | 66.5–82.0 | 0.61 above | Good | 82.8 | medium |
| **84** | **76.3** | **C** | **A-** | B- | 70.5–84.7 | 0.71 above | Good | 85.9 | medium |
| **85** | **79.9** | **C+** | **A-** | B | 74.4–87.1 | 0.81 above | Optimal | 88.6 | medium |
| **86** | **83.3** | **B** | **A-** | B | 78.0–89.2 | 0.91 above | Optimal | 90.9 | medium |
| **87** | **86.4** | **B** | **A** | B+ | 81.5–91.3 | 1.01 above | Optimal | 92.8 | medium |
| **88** | **89.1** | **B+** | **A** | B+ | 84.6–93.2 | 1.11 above | Optimal | 94.4 | medium ← last night |
| **89** | **91.5** | **A-** | **A** | A- | 87.5–95.0 | 1.21 above | Optimal | 95.7 | medium |
| **90** | **93.5** | **A** | **A+** | A | 89.9–96.7 | 1.31 above | Optimal | 96.8 | medium |
| **91** | **95.0** | **A** | **A+** | A | 92.1–98.0 | 1.41 above | Optimal | 97.7 | medium |
| **92** | **96.3** | **A** | **A+** | A | 93.8–98.9 | 1.52 above | Optimal | 98.5 | medium |
| **93** | **97.4** | **A+** | **A+** | A+ | 95.3–99.4 | 1.62 above | Optimal | 99.1 | medium |
| **94** | 98.3 † | **A+** | **A+** | A+ | 96.4–99.7 | 1.72 above | Optimal | 99.5 | low |
| **95** | 99.0 † | **A+** | **A+** | A+ | 97.4–99.9 | 1.82 above | Optimal | 99.7 | low |
| **96** | 99.5 † | **A+** | **A+** | A+ | 98.1–100.0 | 1.92 above | Optimal | 99.9 | low |
| **97** | 99.8 † | **A+** | **A+** | A+ | 98.7–100.0 | 2.02 above | Optimal | 100.0 | low |
| **98** | 99.9 † | **A+** | **A+** | A+ | 99.2–100.0 | 2.12 above | Optimal | 100.0 | low |
| **99** | 100.0 † | **A+** | **A+** | A+ | 99.6–100.0 | 2.22 above | Optimal | 100.0 | low |
† *estimate shown for inspection; this row is `low` confidence and should not display a number on a screen.*

---

## The rows that matter to you

| | Score | Percentile | Interval | SD from average |
|---|---|---|---|---|
| **Last night** | 88 | **89.1** | 84.6–93.2 | **1.11 SD above** |
| Your all-time mean | 79 | 56.2 | 50.5–66.8 | 0.20 SD above |
| Member average | 77 | 47.9 | 42.8–56.1 | at average |

Two readings worth holding together. **Your 88 is a genuinely strong night** — about 1.1 SD above the
member average, better than roughly nine member-nights in ten. **Your typical night is much closer to
ordinary** — 79.3 is only 0.2 SD above average, a hair over the midpoint. The gap between those two rows
is the honest story: you are a slightly-above-average sleeper who had a very good night, not a
consistently exceptional sleeper.

Note also that the percentile at score 77 is **47.9, not 50**. That is not an error, and it is the most
common thing to trip over in this table. **The mean and the 50th percentile are two different statistics**
— they only coincide when the curve is symmetric. A handful of terrible nights drag the *average* down a
long way while barely moving the *middle*, so the average night scores worse than the typical night. On
these assumptions the member **median** night is about **77.5**, and 77.0 sits just under halfway.

Full explanation, the evidence the skew assumption rests on, and a side-by-side against a median-anchored
variant: **`08-MEAN-VS-MEDIAN.md`**. Short version — the two answers differ by at most **3.6 percentile
points**, and every median-anchored value falls **inside this table's stated interval**.

---

## Why scores in the 70s land lower than they feel

The most common reaction to this table is that a score in the low 70s seems too low. Two things
explain it, and both are worth knowing before this goes on a screen.

### 1. Oura's "Good" band hides most of the information

The band labels are far coarser than they look. Here is what each one actually contains:

| Oura band | Scores | Percentile range | Share of all member nights |
|---|---|---|---|
| Pay attention | 0–59 | 0.0 → 5.8 | **5.8%** |
| Fair | 60–69 | 5.8 → 23.3 | **17.5%** |
| **Good** | **70–84** | **23.3 → 79.9** | **56.6%** |
| Optimal | 85–99 | 79.9 → 100.0 | **20.1%** |

**"Good" is 15 score points wide and holds well over half of all nights.** A 74 and an 84 are both
labelled "Good" — and they are the 36th and the 74th percentile. Nearly forty percentile points apart,
same word on the screen.

So a 74 is not a mediocre score being unfairly punished. It is a score at the *bottom edge* of a band
that contains the majority of nights. Sitting at the low end of the biggest band is, arithmetically,
around the one-third mark.

**Product implication:** the band label is doing almost no work in the range where most nights land. If
the screen shows "Good" and nothing else, it is telling you nearly nothing. That is the actual argument
for the percentile family existing.

### 2. The middle of the curve is steep

Because most nights cluster near the average, small score changes move the percentile a lot right in the
middle of the range:

| Around score | One extra score point buys |
|---|---|
| 66 | +2.0 percentile points |
| 70 | +2.8 |
| **74** | **+3.8** |
| 78 | +4.1 |
| 82 | +4.0 |
| 86 | +3.1 |
| 90 | +1.5 |

**74 → 79 is five score points and twenty percentile points** (35.9 → 56.2). That is the single most
useful fact in this table: in the 70s, a few points of score is a large move in standing. Out at 90+,
the same five points buys almost nothing because there is hardly anyone left to pass.

### 3. The honest tension worth knowing about

The one real published sample of Oura Sleep Scores — Kheirinejad 2023, 86 people, 3,990 nights —
had a **median of exactly 74**. In that sample, a 74 *was* the 50th percentile. This table puts it at
the 36th.

Both can be true: that sample was 86 mostly-young Finnish adults on pre-OSSA-2.0 firmware, and Oura's
global member base is a different and apparently better-sleeping population. But it is a genuine
3.5-point gap between the only real sample anyone has published and the modelled member median of ~77.5,
and it points the same direction — **if the real member median is lower than modelled, every percentile
in this table is slightly too harsh.** That possibility is inside the stated intervals, and it is one
more reason no row claims high confidence.


## Where the SD column and the percentile column disagree, and why that's the point

| Score | SD from average | Percentile a normal curve would give | **What this table gives** |
|---|---|---|---|
| 60 | 1.72 below | 4.3 | **5.8** |
| 70 | 0.71 below | 24.0 | **23.3** |
| 85 | 0.81 above | 79.0 | **79.9** |
| 88 | 1.11 above | 86.7 | **89.1** |
| 95 | 1.82 above | 96.5 | **99.0** |

The gaps widen at the top end because the score is **capped at 100**. A normal curve keeps allocating
probability past the ceiling — at SD 9.9 it puts about 1.1% of nights above 100, which cannot happen. This
table uses bounded, left-skew-capable shapes instead, which compresses the top of the scale and pushes
high scores to higher percentiles than a textbook z-table would.

**If you ever want a quick mental check without the table:** subtract 77, divide by 10. That gives you the
SD distance to within a rounding error. It will *not* give you the percentile — for that you need this
table, because the shape does real work above 85.

---

## Standing caveats

- **Oura members only.** Members bought a several-hundred-dollar ring largely to optimise sleep. This is
  not a statement about the general population and must never be labelled "national".
- **The unit is a night, not a person.** "Better than 89% of Oura member nights" is supported.
  "Better than 89% of Oura members" is a different claim and nothing here answers it.
- **The SD is inferred, not published.** Synthesised from six routes across cohorts of n=10 to n=100, none
  of them Oura's member base. This is the single biggest reason no row says `high`.
- **The member average carries `PROOF PENDING`.** Oura publishes 77.0 as "the mean Sleep Score *across all
  countries*", footnoted to countries with ≥2,000 members — not stated as a member-weighted mean.
- **Mixed algorithm era.** The average is post-OSSA 2.0; six of seven spread inputs predate it.
- **Descriptive comparison, not a clinical instrument.** It does not diagnose anything.
- **Valid until 2027-08-25**, or until Oura revises the Sleep Score — whichever comes first.
