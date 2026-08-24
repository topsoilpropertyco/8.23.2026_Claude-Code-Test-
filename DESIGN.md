# DESIGN.md — Sleep OS, last-night screen

Single source of truth. Every later phase reads this file.

---

## 1. Point of view

This app has one user. It does not need to appeal broadly, survive a committee,
or explain itself to a first-time visitor. That is a licence most product design
never gets, and spending it on a safe layout would be the only real failure.

The position: **last night's number means nothing on its own.** 88 is neither
good nor bad until it is placed against the 1,042 nights that came before it.
So the screen's dominant element is not a score — it is a score *and its
position*, treated as one indivisible thing. Everything else on the screen is
marginalia, set small, and trusted to be read only when wanted.

Editorial, not dashboard. One dominant element. Restraint as the primary move —
what is left out is the design.

## 2. Variant licence — read this before the constraints below

Five variants are being produced as five independent designers would produce
them. **Each variant declares its own palette and type stack.** The constraints
in §3–§5 below define the *house* position; a variant may depart from them if it
states the departure and the reason in `variants/README.md`.

What is **not** negotiable across all five:

- The real data in §6, unaltered
- The anti-patterns in §8
- Data legibility: last night readable in under one second
- One dominant element per screen

## 3. Type

House default. Variants override freely.

| Role | Face | Size | Weight | Tracking / leading |
|---|---|---|---|---|
| Hero numeral | variant's display face | **160–220px** | 500–800 | −0.04em, 0.85 |
| Section rule label | variant's utility face | 11px | 500 | 0.18em, uppercase |
| Marginalia value | variant's utility face | 13px | 500 | tabular-nums |
| Marginalia label | variant's utility face | 11px | 400 | 0.06em |
| Statement line | variant's text face | 17–19px | 400 | 1.45 |

The hero must be **at least 8× the marginalia**. The category convention is
roughly 2:1 (34px over 17px) and it produces no hierarchy at all. If the number
does not feel slightly too large in isolation, it is too small in context.

## 4. Colour roles

Six roles, no more. A variant may pick any hues, but must fill exactly these
slots and must not add a seventh.

| Role | Job |
|---|---|
| `ground` | The page. Sets the whole mood. |
| `raised` | The one elevated plane, if the variant uses one at all. |
| `ink` | Primary type. |
| `ink-quiet` | Marginalia, labels, rules. |
| `accent` | **Exactly one.** Marks last night and nothing else. |
| `data` | A single ramp derived from `ink`, for any distribution or form. |

The accent appears **no more than three times** on the screen. If it appears on
every element it is not an accent, it is a second body colour.

## 5. Space and rhythm

Base unit **4px**. Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128.

Viewport target **390 × 844** — an iPhone held at 7am. Not responsive-everything;
this is one screen for one moment.

Grid decision: **no uniform grid.** An editorial screen with a single dominant
element does not benefit from a column system — it benefits from one strong left
margin, a consistent optical baseline, and deliberate asymmetry. Variants that
choose a grid must say why.

## 6. The data — real, unaltered

From the Oura account, night of 2026-08-23, against 1,042 prior nights.

```
sleep score          88
readiness            85
asleep               7h 45m        (27,870s)
in bed               8h 12m        (29,514s)
efficiency           94%
deep                 1h 29m        (5,340s)
REM                  2h 07m        (7,590s)
light                4h 09m        (14,940s)
awake                27m           (1,644s)
latency              2m 30s        (150s)
bedtime              23:15
wake                 07:26
average HRV          37 ms
lowest heart rate    55 bpm
average heart rate   60.1 bpm
respiratory rate     14.4 /min
restless periods     174

all-time mean        79.3   (1,042 nights, 2023-08-25 →)
standard deviation   9.54
z-score              +0.92 SD
percentile           81st
T7                   79.4
T30                  79.2
T90                  73.9
crown nights         351 of 1,043  (33.7%)
```

Never round these. 7h 45m is true; "8h 00m" is a lie that makes the design feel
like a template.

## 7. Motion

Pulled from `references/MOTION.md`. Springs `SETTLE` / `GLIDE` / `TAP`, easings
`--ease-out-quart` / `--ease-in-out` / `--ease-draw`, 40ms stagger, three
duration bands topping out at 900ms.

**Entrance:** ground first, then the dominant element on `GLIDE`, then
marginalia staggered on `SETTLE`. Whole sequence under 600ms.

**Does not animate:** the hero never counts up; nothing loops, breathes, pulses
or floats; no parallax; no animated gradients; no numeric ticking; nothing below
the fold. Under `prefers-reduced-motion` everything collapses to a single
opacity settle.

## 8. Anti-patterns — hard bans

Banned unless personally overruled:

- Four-KPI-tile row across the top
- Uniform card grid with equal-weight cards
- Purple or blue-violet gradients
- Glassmorphism / frosted blur panels
- Emoji as interface iconography
- Generic sans-serif at default weights and default sizes
- Charts with visible gridlines, axis ticks, and a legend when three labels would do
- Any element labeled "Overview," "Insights," "Analytics," or "Dashboard"
- Rounded-corner-everything at a uniform 8px
- Placeholder or suspiciously round data
- Decorative animation with no informational purpose
- More than one accent color

## 9. Reference set

See `references/REFERENCES.md`. Mobbin was paywalled; that file is the weakest
artefact in this run and says so. The operative finding stands regardless: the
in-category default is a ring, a four-tile row, a legended hypnogram, a week
strip, and cool blue-violet on near-black. Five apps ship that screen. The bar
is a screen that could not be any of them.
