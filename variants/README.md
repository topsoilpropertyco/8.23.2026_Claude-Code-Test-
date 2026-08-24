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

---

# Round three — the generated variants

Eleven screens that **no single model hand-authored**. Six came from Magic
Patterns (`mp1`–`mp6`), five from Lovable as one project with five routes
(`lv1`–`lv5`). Every one is a port of what the tool actually emitted; the ports
are mechanical (JSX to HTML, Tailwind utilities and shadcn components expanded
to the CSS they compile to) and every departure from the generated source is
listed in the file's own head comment and in `JUDGING.md`.

The rule from `SUPERPROMPT-PHASE4.md` §6 was followed: **no generation was ever
re-rolled because its output was off.** Weak output is a finding. Where a
generator shipped a real defect, it was fixed in code here and recorded.

## Magic Patterns — 6 generations, 6 designs, 0 re-rolls

## mp1 — THE PLUMB LINE
**Direction given:** subtractive — least ink that carries score and comparison.
**Structural idea:** the hero's *right edge* is the marker. A 176px `88` hangs
above a hairline percentile axis, and a single accent rule drops from the
numeral's right edge onto the axis at 81%. The comparison is not an annotation
next to the number; it is the number's own position in space.
**Palette:** bone `#F2F0EA`, ink `#16171A`, one blue `#2436D4`.
**Type:** Schibsted Grotesk. **16:1.**
**Fixed here:** "198 above" → "197 above" (844 below + this night + 197 above
= 1,042; the generator double-counted the night itself).

## mp2 — THE PERCENTILE
**Direction given:** comparison-first — ranking is the hero.
**Structural idea:** inverts the hierarchy outright. `81` `st` at 148px Bodoni,
the score `88` demoted to a 30px footer mark. A fitted normal fills the middle
with the bars left of 88 inked and those right of it hollow.
**Palette:** paper `#F2EEE3`, ink `#16140E`, one violet `#5B2BD9`.
**Type:** Bodoni Moda / Public Sans. **16:1.**
**Fixed here:** the 78px label column wrapped "TRAILING 30" and "TRAILING 90"
onto two lines, breaking the baseline of two of three rows.
**Departure, kept:** the accent is a blue-violet — the exact hue `DESIGN.md` §9
names as the category default. Not sanded off; it is the finding.

## mp3 — THE NIGHT LOG
**Direction given:** editorial photographic — imagery, which none of the 15 use.
**Structural idea:** a magazine opening spread. Type set over a night ground
with a scrim, a vignette, twenty stars and an `feTurbulence` grain, and an
italic Bodoni standfirst carrying the comparison as a *sentence*.
**Palette:** near-black `#0A0E0F`, bone `#EDE7DF`, one pink `#E0457B`.
**Type:** Bodoni Moda / IBM Plex Sans. **19:1.**
**Departures, kept:** the accent appears four times, over `DESIGN.md` §4's
limit of three. IBM Plex Sans is a near-collision with v1/v3's IBM Plex Mono —
a different family, same superfamily. And the photographic ground mostly did
not arrive: at `soft-light` 0.42 over a near-black field the grain is invisible
and what remains is a dark radial gradient.

## mp4 — THE DYED SWATCH
**Direction given:** colour as data, no chart of any kind.
**Structural idea:** the screen *is* the datum. The whole ground is dyed to the
night's standing — `#2F5F3F`, which is literally the `+1 SD` chip of the
calibration strip printed below it — and a five-chip key tells you how to read
the field. Deeper is better. No data mark is drawn anywhere.
**Palette:** dye `#2F5F3F`, bone `#F3EFDF`, dark `#163A28`, four key chips.
**Type:** Bodoni Moda / Spectral. **21:1.**
**Fixed here:** the "last night" caret sat at 46% while its own label sat at
50%, so the marker missed the thing it marked; and the calibration label wrapped,
leaving "MEAN" as a widow hard against the chips.

## mp5 — THE WOVEN BAND
**Direction given:** physical object — not an instrument, not a document.
**Structural idea:** the night as a **woven textile**. All 24 real hypnogram
segments are the weft of a 196×486 band — 486px for 492 minutes — with a
selvedge down both edges, a raking sheen, a linen grain and a knotted fringe at
the foot. The material carries the data; no chart is drawn on top of it.
**Palette:** flax `#E7E0D2`, ink `#221E1A`, one blue `#25409B`.
**Type:** Jost / DM Mono. **15:1.**
**Fixed here:** three wrapping failures the source did not show — the whole
comparison line broke mid-phrase in a 132px column ("+0.92 SD · 81st /
percentile"), and both footer durations split to "7h / 45m" and "8h / 12m".
**Departure, kept:** the accent does double duty as the REM stage *and* the
last-night marker, which breaks `DESIGN.md` §4's "accent marks last night and
nothing else." The consequence is visible: the band reads as blue stripes
rather than as one marked night.

## mp6 — THE PLATE
**Direction given:** none. This is Magic Patterns' own default.
**Structural idea:** an engraved statistical plate. A 104px `88` sits directly
on the distribution of every prior night, its own accent rule and dot dropping
through the histogram beneath it.
**Palette:** paper `#F2EEE4`, ink `#191813`, one blue `#2E4EA7`.
**Type:** Bodoni Moda / Libre Franklin. **12:1** — the lowest of the eleven.
**Fixed here — four defects, all found by rendering, none visible in the source
read:** `σ` inside a `text-transform: uppercase` label rendered as capital
**Σ**; "198 above" off by one again; "Kept nightly since 12 October 2023" was
invented, the series starts 25 August 2023; and "every night, scored 46 → 100"
presented the plot's axis bounds as the observed range of the data. The Awake
stage label was also clipped to "AWA" by `overflow: hidden` on an 18.8px column.

## Lovable — 1 project, 5 routes, 1 message, 9.3 credits

Lovable was asked for five routes in one project rather than five projects, and
it built all five in a single pass without asking to confirm between them. It
ran its own headless screenshot checks while building and self-corrected an
accent overuse in `/v4` before finishing.

## lv1 — SUBTRACTIVE
**Structural idea:** the same mechanism mp1 found, arrived at independently —
the hero's right edge lands exactly on the percentile mark of the rule beneath
it. Ends by naming its own cut: *"No stages. No heart rate."*
**Palette:** bone `#F2EFE9`, ink `#17150F`, one claret `#7A1F3D`.
**Type:** Bodoni Moda / Karla. **18:1.**

## lv2 — COMPARISON-FIRST
**Structural idea:** `81` at 188px in Big Shoulders, the score `88` pushed into
a raised footer plate at 52px. A filled normal curve underneath, inked to the
left of last night and hollow to the right.
**Palette:** near-black `#14161A`, raised `#1E2228`, one blue `#0A84C4`.
**Type:** Big Shoulders Display / Bricolage Grotesque. **19:1.**
**Fixed here:** the axis row placed "79.3 mean" with flex auto-margins, landing
it at ~44% of an axis where the mean actually falls at 62%. Under a drawn
distribution that reads as a positioned tick, so it is pinned to the true x.

## lv3 — DENSE, SHADCN-NATIVE (the control)
**Structural idea:** deliberately the screen Lovable wants to make. Card, Badge,
Separator; score, sparkline, hypnogram, stage bars and an eight-row vitals grid.
Asked for its best version of its own default, and this is it.
**Palette:** `#F6F5F2` ground, one green `#2F7D32`, four-step grey ramp.
**Type:** Manrope. **8.7:1** — clears the floor by the narrowest margin here.
**Departure, kept:** an 8px rounded card, which `DESIGN.md` §8 discourages, and
the comparison set at 11px beside a 96px score — round one's exact failure,
reproduced by the tool's own defaults. That is the point of the control.

## lv4 — RULEBREAK (deliberately anti-shadcn)
**Structural idea:** zero radius, no shadcn component anywhere, hairline rules
between every band. The 128px Syne `88` sits on a magenta bar whose *length* is
the percentile, with a rank ladder in a right-hand column. The night is drawn in
50 character cells of `█▓▒░`.
**Palette:** `#0B0B0B`, bone `#F4F1E8`, one magenta `#FF2E93`.
**Type:** Syne / Familjen Grotesk / Spline Sans Mono. **13:1.**
**Fixed here:** the 50-cell run measured 362px inside a 350px container at the
generated 12px — it broke its own gutter and lined up with nothing. Reduced to
11.5px, which fits exactly.
**Departure, kept:** the block-glyph chart is close to unreadable — at this size
`▓`, `▒` and `░` render as near-identical dither, so REM, light and awake are
not separable. It was asked to push off its defaults and it did; the cost is
legibility, and that is the honest result.

## lv5 — FREE
**Structural idea:** the distribution turned on its side. A 24-row vertical
histogram stands beside a 156px Playfair `88`, top row = 100, with the marker
row in teal visibly above the bulge. Then the declarative sentence — the v15
mechanism — in 19px Playfair.
**Palette:** `#FBF7F0`, ink `#211D1A`, one teal `#0E8C7F`.
**Type:** Playfair Display / Outfit. **16:1.**
**Fixed here:** the trailing-statistics line wrapped, orphaning "73.9".
**Note:** the teal is a near-collision with v7's `#0D7680` — a different value,
adjacent hue.
