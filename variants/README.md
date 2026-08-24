# Variants

Five screens, built as five independent designers would build them. Each idea
was written here **before** the screen was made.

Not five palettes of one layout — five different structural answers to the same
question, in five different visual worlds.

All five carry identical data (DESIGN.md §6) and obey the anti-patterns (§8).
Everything else — palette, type, structure — is the variant's own.

---

## v1 — THE LEDGER
**Designer:** a Swiss modernist who mostly works in print.
**Structural idea:** *no chart at all.* The night is a ruled table. The score is
a slab of type at 200px, flush left against a hard margin, and everything else
is a hairline-ruled ledger beneath it. Rules do all the structural work; there
is not a single box, border or shadow on the screen.
**Palette:** warm near-black, bone, one vermilion.
**Type:** Archivo Black / Archivo.
**Borrowed from:** Lumy's ruled table, NYTimes' hairlines, (Not Boring)
Weather's willingness to give 40% of the viewport to one numeral.

## v2 — THE NIGHT
**Designer:** someone who makes data sculptures.
**Structural idea:** *the night as one unbroken form.* The hypnogram stops being
a chart and becomes a single continuous ribbon running the full width, with no
axes, no gridlines and no legend. The score is set inside the form rather than
above it. Shape carries the data; type only names it.
**Palette:** deep blue-black, bone, one ice blue.
**Type:** Sora Light at display scale / IBM Plex Mono for figures.
**Borrowed from:** Ultrahuman gave its whole screen to the form — correct
instinct, but it then buried its own headline number at 15px. This keeps the
form and fixes that.

## v3 — THE DIAL
**Designer:** a watchmaker.
**Structural idea:** *the night as an arc.* 23:15 → 07:26 drawn as a radial
sweep built from individual minute ticks, each tick coloured by sleep stage, so
the dial is simultaneously a clock and a hypnogram. Score at the centre of the
face. Time is the organising principle, not duration.
**Palette:** true black, warm amber, grey.
**Type:** Chivo / IBM Plex Mono.
**Borrowed from:** Eight Sleep's fine radial tick arc, pushed much further —
their ticks are decorative, these encode the night.

## v4 — THE ALMANAC
**Designer:** someone who typesets printed statistical annuals.
**Structural idea:** *the distribution is the design.* All 1,042 prior nights
drawn as a dense field of small marks, with last night picked out in red. You
read your position before you read your score. Deliberately **light mode** on
warm paper — the one variant that rejects the dark default outright, to test
whether the category's darkness is a real requirement or an inherited habit.
**Palette:** warm paper, near-black ink, one red.
**Type:** Instrument Serif / IBM Plex Mono.
**Borrowed from:** komoot's warm light ground, Tolan's serif, and printed
almanacs where a single marked cell in a field of thousands reads instantly.

## v5 — THE DISPATCH
**Designer:** a magazine art director.
**Structural idea:** *prose is the headline.* The screen opens with a sentence,
not a number — "You slept better than 81% of your nights" — set as a serif
display paragraph with the figures woven into the line. The marginalia becomes a
colophon at the foot of the page. The most linguistic of the five, and the one
that most resists being a dashboard.
**Palette:** deep green-black, cream, brass.
**Type:** Fraunces / Newsreader.
**Borrowed from:** The Weather Channel opens with "It's 52° and partly cloudy."
rather than a number and a label; Tolan's cream-and-serif editorial page.

---

## Outcome notes

Filled in after building, before scoring. See the judging report for scores.

---

# Set B & C — widening the gene pool

Seth's note on 2026-08-24: *"I feel like you just used the examples of
inspiration you got from this one MCP connector."*

Fair, and worth being precise about what was and wasn't true. The five variants
in Set A were hand-authored — zero Magic Patterns generations were spent. But
the **reference corpus** behind them was 18 Mobbin screens, and every one of
those was a consumer health or sleep app. One gene pool. Even designing
*against* that corpus (the Set A finding was that none of them makes the number
big) is still being steered by it.

So Sets B and C take their source discipline from outside app design entirely.
Nothing here is drawn from a Mobbin screen. Each variant names a real design
tradition and commits to it — its palette, its typeface, its grammar — rather
than borrowing a look.

The 8:1 display-to-body floor, the six-colour-role cap, 390×844, and the
real unrounded Oura values from DESIGN.md §6 all still bind.

## Set B — foreign disciplines

| | Name | Source discipline | Palette | Type |
|---|---|---|---|---|
| v6 | **The Instrument** | Lab test gear — Tektronix scopes, glass-cockpit avionics | Phosphor green on instrument black | Monospace + condensed engineering |
| v7 | **The Broadsheet** | Newspaper graphics desk — FT / NYT annotated statistics | Salmon newsprint, ink, one blue | Serif headline + sans annotation |
| v8 | **Ma (間)** | Japanese negative space — the interval is the subject | Sumi on off-white, one seal red | Light sans, enormous leading |
| v9 | **The Specimen** | Type foundry specimen sheet | Paper white, black, one fluoro | The number *as* the specimen |
| v10 | **The Panel** | Transit signage — Vignelli's NYC subway diagram | Flat signal blocks on slate | Grotesque, all caps, tight |

## Set C — further out

| | Name | Source discipline | Palette | Type |
|---|---|---|---|---|
| v11 | **The Chart** | Hospital record — ruled vitals sheet, stamped header | Clinical pale green, one red flag | Ruled grid, stamp, typewriter |
| v12 | **The Terminal** | Unix ops dashboards — htop, k9s | Terminal black, amber, one cyan | Monospace only, ASCII rules |
| v13 | **The Receipt** | Thermal till roll / boarding pass | Receipt white, dot-matrix black | Condensed mono, tear edge |
| v14 | **The Seismograph** | Strip-chart recorders — seismogram, ECG | Recorder paper, stylus red | Trace is the hero, score stamped |
| v15 | **The Brutalist** | Brutalist web — visible structure, no comfort | Raw white, hard black, hazard yellow | System fonts, oversized, unsmoothed |

## Outcome notes

Set A judged in `JUDGING.md` — v1 Ledger 22, v3 Dial 22, v4 Almanac 21,
v5 Dispatch 19, v2 Night 16. Sets B and C are judged against the same
`RUBRIC.md` in `JUDGING.md` under "Round two".
