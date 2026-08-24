# RUBRIC.md

Written before any variant existed. A rubric authored afterwards only ratifies
whatever turned up.

Six criteria, 1–5. A 3 is competent. A 5 is rare and should stay rare.

---

### 1. Distinctiveness
*Could this be another app, or only this one?*

- **5** — Screenshot it, strip the data, and it is still identifiable. A specific
  designer clearly made specific decisions someone else would not have.
- **3** — Well made, but recognisably from the category.
- **1** — Swap the logo and it ships as anything.

### 2. Typographic quality
*Hierarchy, scale contrast, restraint.*

- **5** — Display-to-body contrast of 8:1 or better and it feels inevitable, not
  loud. Faces are chosen, not defaulted. Optical alignment, not just metric.
- **3** — Clear hierarchy, unremarkable faces.
- **1** — Everything between 13 and 34px; the eye has nowhere to land.

### 3. Data legibility
*Last night, read in under one second.*

- **5** — The answer lands before you have decided to look for it, and the
  comparison to baseline lands immediately after, without a second fixation.
- **3** — Findable in two or three seconds.
- **1** — You have to read labels to know what you are looking at.

### 4. Motion quality
*Purposeful, physical, not decorative.*

- **5** — Motion clarifies the hierarchy: the thing that matters arrives first
  and heaviest. Nothing moves that did not need to. Reduced-motion is designed,
  not disabled.
- **3** — Pleasant, adds nothing.
- **1** — Decoration, or a counting-up hero.

### 5. Restraint
*What was left out.*

- **5** — Something obviously useful was cut and the screen is stronger for it.
  Negative space is doing structural work.
- **3** — Nothing extraneous, nothing sacrificed either.
- **1** — Everything available is on screen.

### 6. Craft
*Alignment, optical spacing, edge cases.*

- **5** — Optical alignment beats metric alignment where they disagree. Tabular
  figures line up. Nothing is 1px off. It survives a long value and a missing one.
- **3** — Clean on inspection.
- **1** — Drifting baselines, inconsistent gaps, misaligned numerals.

---

**Scoring discipline:** if all five land at 3, say so plainly. That is a finding
about the spec, not an argument for more generations.

---

# Decision — the 8:1 type floor stands (2026-08-24)

Seth delegated this. Recording the call and the reasoning, because it decides
which design references are usable from here.

## The question

Four variants land far under the floor — v10 signage 3.6:1, v11 clinical form
3.2:1, v13 receipt 5:1, v14 strip-chart recorder 3.6:1. Not through
carelessness: signage, forms, receipts and recorders have no concept of a hero
number. They **distribute** emphasis where this screen needs to **concentrate**
it. So either the floor stands and those disciplines are out, or it bends.

## The call: the floor stands

Three reasons.

**1. The floor is a proxy for the real criterion, and the proxy held up.** What
actually matters is criterion 3 — the answer landing in under a second. Across
sixteen screens the correlation was strong: v15 at 20:1 scored 5 on legibility,
v1 at 18:1 scored 5, v11 at 3.2:1 scored 3. The exception is instructive rather
than disqualifying: v13 scored 4 on legibility at 5:1, because *"you beat your
average by +8.7 points"* is unmissable even set small. But it got there on
sentence quality, not typography, and it still lost restraint 1/5 for keeping
everything on screen.

**2. The use case is unusually unforgiving.** This is read half-awake, at 7am,
one-handed, on a lock screen. That is closer to instrumentation than to a
document. Distributed emphasis is the right model for a chart a clinician reads
at a desk and the wrong one for a glance before your feet hit the floor.

**3. Dropping it costs one mechanism; keeping it costs one aesthetic.** Which
is the asymmetry that settles it — see below.

## What is explicitly *not* being thrown away

**v11's reference interval is the single best idea in the whole bake-off** and
it has nothing to do with typography. A clinical chart never prints a value
without the range it should fall in, which makes "compared to what" native to
the form instead of bolted on. That mechanism is portable. The discipline's
flat emphasis is not.

So: **borrow the mechanism, drop the emphasis model.** A future revision may
add a reference interval to the composite, set at whatever size the floor
allows. What it may not do is flatten the hierarchy to be faithful to the
source.

## Consequences

- v10, v11, v13 and v14 remain valuable as **references**, not as candidate
  finished screens.
- The composite already clears the floor: 132px against 11px marginalia is
  **12:1**.
- Criterion 2 is unchanged. This note is the rationale, not an amendment.
- **Reopen this** if a generated design in a later round scores 5 on legibility
  while under the floor. One counterexample would mean the proxy is wrong, and
  the proxy is only worth keeping while it predicts.
