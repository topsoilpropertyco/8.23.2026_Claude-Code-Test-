# Seth's taste log — Phase 5 redesign inputs

One screenshot at a time. Nothing final until Seth says he's finished.
Two columns per pick: what he SAID, and what I OBSERVE independently.

---

## Pick 1 — v4 THE ALMANAC (hand-authored, round one, scored 21, ranked 6= of 27)

Identified from the artifact: warm paper ground, Instrument Serif headline,
IBM Plex Mono labels, one red `#B03A2B`, 1,042 prior nights as a dot field.
Viewed on phone, scrolled inside the published bake-off sheet.

### What Seth said
- Likes the **trailing block being clear** — T7 / T30 / T90.
- WANTS ADDED: **trailing 180** and **trailing 365**.
- WANTS ADDED: a **small arrow** beside each trailing number —
  green = above, yellow = about the same, red = below.
- WANTS CLEARER: the percentile. "Top 81%" or "81st percentile" —
  spell the word out rather than leaving a bare `81%` inside the sentence.
- Likes **rank out of all nights**.
- Likes the **distribution** ("standard distribution curve").

### What I observe
- **It is light mode on warm paper.** The only one of the first five that
  rejected the category's dark default outright. First real signal on ground.
- **The headline is a full sentence**, not a number: *"You slept better than
  81% of the nights you have on record."* This is the v15/v13 mechanism —
  comparison as declarative English. He credited the trailing rows and the
  curve, but the sentence is very likely what makes this screen land first.
  Flag, don't assume.
- **Hero 88 is NOT the top element.** It sits below the sentence and the
  distribution, at roughly a third the optical weight it has in other variants.
  He did not mention the 88 at all.
- The distribution is a **dot-matrix column field**, not a smooth curve — each
  dot is a night. He called it a curve. He may be responding to the *shape*
  rather than the dot technique; worth testing which he actually wants.
- Serif display + mono utility, no sans anywhere.
- **Crown nights (351 / 33.7%)** is on this screen. He didn't mention it.

### Open questions raised (resolve at compile, not now)
1. **The arrows need a defined referent.** Green/yellow/red against *what*?
   Two readings: (a) last night's 88 vs that trailing mean — under which all
   five arrows are green today, so the encoding never varies and carries no
   information; (b) each trailing window vs the next longer one, i.e. is the
   recent trend rising — under which T7 79.4 > T30 79.2 > T90 73.9 reads as a
   genuine improving trend and the colour actually moves. (b) is far more
   informative. Must confirm.
2. **T180 and T365 do not exist in the data.** DESIGN.md §6 carries T7/T30/T90
   only. Inventing them is exactly the failure mp6 was marked down for
   (a fabricated series start date). Either compute them from the real log or
   ship the rows as explicitly unavailable. Do not fabricate.
3. Three semantic colours (green/yellow/red) against DESIGN.md §4's "exactly
   one accent". Semantic status colour is legitimately separate from an accent
   — but it is a real departure from the house rule and should be recorded.

---

## Pick 2 — mp4 THE DYED SWATCH (Magic Patterns, colour-as-data, scored 21, ranked 6= of 27)

Deep green dyed ground, Bodoni Moda figures, Spectral letterspaced micro-labels,
five-chip SD calibration strip. Same screenshot source: the published sheet on phone.

### What Seth said
- The thing he wants is **the calibration bar** — the −2 / −1 / 0 / +1 / +2
  standard-deviation strip. Named it explicitly as the keeper.
- WANTS ADDED: **a percentile under each SD tick**. What percentile is −1? +1?
- WANTS ADDED: **in the band he actually falls in, print the real percentile.**
- REJECTS: **the trailing means set as a sentence.** *"The trailing is too hard
  to compare."* Prefers the trailing treatment from Pick 1.

### What I observe
- **This is the first explicit rejection, and it is the most useful signal so far.**
  Same three numbers (79.4 / 79.2 / 73.9), two treatments. v4 sets them as
  labelled rows and he called them "clear". mp4 runs them into prose —
  *"Trailing means: 7-night 79.4, 30-night 79.2, 90-night 73.9"* — and he called
  them too hard to compare. **Verdict: trailing data is tabular, never prose.**
  Rows, aligned figures, one per line. This now overrides mp4's own treatment.
- Both picks so far are **distribution-forward** and both **reject near-black**.
  v4 is warm paper; mp4 is deep green over bone. Neither is the category default.
- Both picks use **letterspaced uppercase micro-labels** for every field name.
  v4 does it in mono (IBM Plex Mono), mp4 in serif (Spectral) — different faces,
  same optical treatment. He may be responding to the treatment, not the face.
- Both picks set the figures in a **high-contrast serif at display size**
  (Instrument Serif / Bodoni Moda). No sans in either pick yet.
- He is picking **elements, not screens**. Track per-element from here.

### Open questions raised
4. **Which percentile goes under the ticks — theoretical or empirical?**
   Under a normal fit: −2 = 2.3rd, −1 = 15.9th, 0 = 50th, +1 = 84.1th,
   +2 = 97.7th. But his own night is +0.92 SD, which the normal fit puts at
   **82.1st** while the empirical rank says **81st** — a 1.1 point gap, because
   1,042 real nights are not perfectly normal. Ship both numbers on one screen
   and it contradicts itself.
   **Resolution: compute every tick's percentile empirically from the real log**,
   so the strip and the rank agree. Same class of error as mp6's invented date —
   do not let a modelled number pose as a measured one.
5. **Tick percentile, or band percentile?** The five chips are bands, but the
   labels sit under chip centres. A band spans a percentile *range*
   (the +1 chip is roughly the 69th–93rd). A point value at the tick is cleaner
   and is what he asked for. Confirm the strip reads as a scale with ticks,
   not five buckets.

---

## Pick 3 — v15 THE BRUTALIST (hand-authored, round two, scored 20, ranked 8= of 27)

White ground, black bands, one hazard yellow `#FFE800`, Helvetica/system.
The keeper element: `EVERY NIGHT ON RECORD` — a waffle grid of 1,042 marks.

### What Seth said
- LIKES: **the block pattern showing how many nights were below and above.**
  "Just a cool visual."
- **Percentile beats the raw count in words.** "Thinking of percentile is still
  easier than doing the math of 'I slept better than 844 of 1,042 nights.'"

### What I observe
- **This resolves cleanly with Picks 1 and 2 rather than contradicting them,
  and the resolution is the sharpest rule yet.** v4's headline says *81%*;
  v15's says *844 of 1,042*. He liked the first and just rejected the second.
  But the grid he likes IS the raw count — 844 dark cells against 198 light.
  So: **he wants the ratio SHOWN, not STATED.** The picture does the division
  for you instantly; the sentence makes you do it yourself.
  → Headline speaks in percentile. The count gets drawn, never narrated.
- **Reconciles the apparent conflict with Pick 1.** He said he liked "rank out
  of all nights" there. Rank 198 of 1,042 is a raw count too — but it sat in
  marginalia, not in the headline. Rule: **percentile leads, rank supports.**
- **The grid is honest and that is why it works.** Verified in source: 1,042
  real marks, one per night, nothing aggregated or sampled; the marker sits at
  exactly index 844, on the true boundary. Preserve that property — a waffle
  that rounds to "1 cell = 5 nights" would lose the thing that makes it land.
- **Breaks two patterns I had provisionally logged.** This pick is a SANS
  (Helvetica/system), where Picks 1–2 were serif; and it is stark white/black
  where they were warm. So type and warmth are NOT the through-line.
  What survives all three: **light ground, distribution-forward, comparison
  made explicit.**
- **Tabular data, liked again.** v15's ledger is a hard-ruled two-column table,
  and it is the third table he has responded well to. Consistent with the
  Pick 2 rule.
- He did not mention the yellow highlighter marks on `844` / `1,042` in the
  headline — the very numbers he then said were hard to parse. Suggestive:
  emphasis did not rescue the format.

### Running through-line after three picks
- Ground: **light**, three for three.
- Comparison: **percentile in words, count in pictures.**
- Repeated data: **tables, not sentences.**
- Distribution rendered three different ways (dot field, SD strip, waffle) and
  he has now asked to keep **all three**. Open question at compile: do they
  coexist, or does one absorb the others?
