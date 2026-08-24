# SUPER PROMPT — Sleep OS Phase 4: Magic Patterns + Lovable design rounds

**Paste this entire file as your first message in a new Claude Code session.**
Everything needed is in here. Do not ask the user clarifying questions before
you have read to the end and run Step 0.

Repo: `https://github.com/topsoilpropertyco/8.23.2026_Claude-Code-Test-`
Branch to work on: create `claude/phase4-generators` off `main`.

---

## 0. MISSION

Fifteen versions of one mobile screen already exist. **All fifteen were
hand-authored by a single model.** They vary the *references* but not the
*maker*. That is the gap.

Your job: produce **at least 5 designs from Magic Patterns** and **at least 5
designs from Lovable**, of the same screen, then score all of them against the
existing rubric, rank them, and publish a comparison artifact in the same form
as the existing one.

The point is **maker diversity**. Do not sand off what the tools produce to
match the hand-authored set. Divergence is the deliverable.

Existing comparison artifact (for format reference):
https://claude.ai/code/artifact/971e5513-09ca-4887-ae46-9a0e5b89faa6

---

## 1. STEP 0 — VERIFY THE TOOLS BEFORE ANYTHING ELSE

Do not start designing until this passes.

1. Call `ListConnectors`. Confirm **Lovable**, **Magic Patterns** and **Mobbin**
   all show `connected: true` AND `enabledInChat: true`.
2. Load schemas: `ToolSearch` →
   `select:mcp__Magic_Patterns__create_design,mcp__Magic_Patterns__get_design_status,mcp__Lovable__list_workspaces`

**Naming caveat — this has already burned one session.** Depending on how the
session exposes connectors, the tools are namespaced either by friendly name
(`mcp__Magic_Patterns__create_design`) **or by the connector's
`installedServerId` UUID**:

| Connector | installedServerId |
|---|---|
| Magic Patterns | `3a44007c-f5cf-4d0d-bc5a-c0a6bbff4c98` |
| Lovable | `2a2ed7f7-31bb-435d-94fc-e8c25d0a31ee` |
| Mobbin | `90e64d8f-0d47-4a6d-a034-ad969e5a3b18` |

If the friendly names return "No matching deferred tools found", **retry with
the UUID prefix** (`mcp__3a44007c-…__create_design`) before concluding anything
is broken.

**Do NOT use `claude mcp list` as your availability check.** In a cloud session
it returns "No MCP servers configured" even when Magic Patterns is executing
fine — connectors are injected by the harness, not configured locally. It is a
false negative. `ListConnectors` is the check.

If both naming schemes fail: the connectors have dropped from this session.
That is not fixable from inside. Start another session — it is a session-level
drop and a fresh session comes up clean.

---

## 2. WHAT THIS PRODUCT IS

**Sleep OS.** A solo behavioural reminder system for one user (Seth, Detroit,
America/Detroit). It sends science-backed sleep facts to Telegram on a varying
cadence, asks one high-leverage journal question per fact, prompts a 6 AM
manual sleep log, and returns coaching with standard deviations and percentile
rank. It pulls Oura data automatically and runs unattended on GitHub Actions.

**The screen you are designing** is the "last night" screen — the one view that
answers: *how did I sleep, and how does that compare to every night before it?*

Read these before designing:

| File | What it holds |
|---|---|
| `DESIGN.md` | Point of view, constraints, §6 the real data |
| `RUBRIC.md` | The six scoring criteria |
| `JUDGING.md` | All 15 scored, plus round-two findings |
| `variants/README.md` | What each of the 15 attempted |
| `references/MOTION.md` | Spring configs, easings, the "does not animate" list |
| `compare.html` | Live 15-up (open from a checkout) |

---

## 3. THE DATA — REAL, NEVER ROUNDED

Night of **Sunday 23 August 2026** (23 August 2026 IS a Sunday; 24 August is a
Monday — one variant already got this wrong).

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

all-time mean        79.3   (1,042 nights, from 2023-08-25)
standard deviation   9.54
z-score              +0.92 SD
percentile           81st
rank                 198 of 1,042   (better than 844 of them)
T7                   79.4
T30                  79.2
T90                  73.9
crown nights         351 of 1,043  (33.7%)
```

From DESIGN.md: *"Never round these. 7h 45m is true; '8h 00m' is a lie that
makes the design feel like a template."*

**Hypnogram segments** (minutes, chronological, sum to 492 = 8h 12m, and to the
published per-stage totals). Use these if you draw the night:

```js
const NIGHT=[['w',3],['l',22],['d',38],['l',14],['r',12],['l',18],['d',31],['l',20],
 ['r',26],['w',4],['l',24],['d',20],['l',22],['r',34],['l',16],['w',6],['l',30],
 ['r',30],['l',27],['w',8],['l',28],['r',25],['l',28],['w',6]];
// w=awake(27) d=deep(89) r=REM(127) l=light(249)
```

Notable moments, already verified: bedtime 23:15 · longest deep begins 23:40
(38m) · first long REM 01:53 (26m) · longest REM 03:29 (34m) · longest waking
05:52 (8m) · rose 07:26.

---

## 4. THE RUBRIC — VERBATIM

Six criteria, 1–5. A 3 is competent. A 5 is rare and should stay rare.

1. **Distinctiveness** — *Could this be another app, or only this one?*
   5 = strip the data and it is still identifiable. 1 = swap the logo and it ships as anything.
2. **Typographic quality** — *Hierarchy, scale contrast, restraint.*
   5 = display-to-body contrast of **8:1 or better** and it feels inevitable, not loud.
   1 = everything between 13 and 34px.
3. **Data legibility** — *Last night, read in under one second.*
   5 = the answer lands before you decided to look, **and the comparison to
   baseline lands immediately after, without a second fixation.**
4. **Motion quality** — *Purposeful, physical, not decorative.*
   5 = motion clarifies hierarchy; reduced-motion is designed, not disabled.
   1 = decoration, or a counting-up hero.
5. **Restraint** — *What was left out.*
   5 = something obviously useful was cut and the screen is stronger for it.
   1 = everything available is on screen.
6. **Craft** — *Alignment, optical spacing, edge cases.*
   5 = optical beats metric alignment; tabular figures; survives a long value and a missing one.

**Scoring discipline:** if all land at 3, say so plainly. That is a finding
about the spec, not an argument for more generations.

**Motion:** the existing 15 all score 1 because none animates. If your
generated designs DO animate, score motion honestly and report the "with
motion" and "less motion" columns separately so the comparison stays fair.

---

## 5. WHAT ALREADY EXISTS — DO NOT REUSE THESE

Fifteen variants in `variants/v1`…`v15`. **No new design may reuse a palette or
a typeface from this table.** Collisions make the comparison useless.

| | Name | Source discipline | Accent | Typefaces | /25 |
|---|---|---|---|---|---|
| v1 | The Ledger | Swiss modernist print | `#D9401F` vermilion | Archivo Black, IBM Plex Mono | 22 |
| v2 | The Night | Data sculpture ribbon | `#9FC7E8` ice | Sora Light | 16 |
| v3 | The Dial | Watchmaker, 99 minute-ticks | `#E8A33D` amber | Chivo Black, IBM Plex Mono | 22 |
| v4 | The Almanac | Statistical annual, mark field | `#B03A2B` red | Instrument Serif | 21 |
| v5 | The Dispatch | Magazine art director | `#C9A227` brass | Fraunces | 19 |
| v6 | The Instrument | Tektronix scope / avionics | `#46F08A` phosphor | Share Tech Mono, Barlow Condensed | 18 |
| v7 | The Broadsheet | FT/NYT graphics desk | `#0D7680` teal | Newsreader, Archivo | 20 |
| v8 | Ma 間 | Japanese negative space | `#A8322A` seal red | Noto Serif JP, Noto Sans JP | **22** |
| v9 | The Specimen | Type foundry sheet | `#E4FF00` fluoro | Anton, Space Mono | 17 |
| v10 | The Panel | Vignelli transit signage | `#FFB800` signal | Archivo | 17 |
| v11 | The Chart | Hospital vitals record | `#BE3227` chart red | Courier Prime, Barlow Condensed | 17 |
| v12 | The Terminal | htop / k9s | `#FFB000` amber | JetBrains Mono only | 19 |
| v13 | The Receipt | Thermal till roll | ink `#15130F` | Sono | 17 |
| v14 | The Seismograph | Drum strip-chart recorder | `#C22E1C` stylus | Roboto Mono, Roboto Condensed | 18 |
| v15 | The Brutalist | Brutalist web | `#FFE800` hazard | Helvetica / system | 20 |

Top of all fifteen is a three-way tie: **v1 22, v3 22, v8 22.**

### The three findings you are testing against

1. **Round one's failure was the comparison.** Not one of the first five made
   "where this night sits" as dominant as the score. Three later ones fixed it —
   and each by borrowing a form that already had a grammar for comparison rather
   than inventing a chart: v7's standfirst sentence, v13's *you saved* line,
   v15's flat declaration *"you slept better than 844 of your last 1,042 nights."*
2. **Borrowed forms are nearly all maximal.** Nine of ten scored 1–3 on
   restraint. Instrument panels, newspapers, clinical forms, terminals and till
   rolls are dense by design. The one subtractive discipline (ma) won the round.
3. **Four variants cannot pass the 8:1 type floor** (v10 3.6:1, v11 3.2:1,
   v13 5:1, v14 3.6:1) because signage, forms, receipts and recorders have no
   concept of a hero number. **This is unresolved — ask Seth before compositing.**

**What to push the generators toward:** a screen that is both *restrained* and
makes the comparison land in the same glance as the score. Nothing in the
fifteen does both well.

---

## 6. HARD CONSTRAINTS

From Seth, verbatim where quoted:

- **"Never re-run a generation because the output was slightly off. Fix it in
  code yourself."** A weak generation is a finding to report, not a retry.
- **Lovable costs real credits per message.** Batch intent into as few messages
  as possible. Seth's instruction of 2026-08-24 authorises this round.
- **Magic Patterns:** the original cap was *"6 generations total in Phase 2
  without asking me first."* Seth has since asked for **≥5 designs from each
  tool**, which supersedes it. Budget **6 generations**, one per design. Zero
  spent so far.
- Every design renders at **exactly 390×844**, no horizontal overflow.
- **Real unrounded values only.**
- **Six colour roles maximum, one accent.**
- **No palette or typeface from the table in §5.**
- Self-contained HTML. Google Fonts is the only permitted external host.

---

## 7. THE BRIEF TO SEND THE GENERATORS

Send this, adapted per variant. Vary the *direction* line each time.

> One mobile screen, 390×844, for a personal sleep app. It answers a single
> question: **how did I sleep last night, and how does that compare to every
> night before it?**
>
> Data — real, do not round:
> score 88 · readiness 85 · asleep 7h 45m · in bed 8h 12m · efficiency 94% ·
> deep 1h 29m · REM 2h 07m · light 4h 09m · awake 27m · latency 2m 30s ·
> bedtime 23:15 · wake 07:26 · HRV 37 ms · lowest HR 55 bpm · avg HR 60.1 bpm ·
> respiration 14.4/min · restless 174.
> Baseline: 1,042 prior nights, mean 79.3, SD 9.54, z +0.92, 81st percentile,
> rank 198 of 1,042 — better than 844 of them. T7 79.4 · T30 79.2 · T90 73.9.
>
> **The comparison must land in the same glance as the score.** Most attempts
> treat "where this night sits" as an annotation hanging off the number. Do not.
>
> Display-to-body type contrast of at least 8:1. One accent colour. Commit to a
> real design tradition and its palette and typefaces.
>
> Banned, because fifteen prior attempts already covered them: dark UI with a
> progress ring; card grids; gradient heroes; Inter or Space Grotesk; emoji as
> section markers; centred everything; rounded cards with an accent rail.

### Six directions for Magic Patterns (one generation each, no re-rolls)

1. **Subtractive** — the least ink that can carry both the score and the
   comparison. Aim at the restraint 5 that only v8 reached.
2. **Comparison-first** — the distribution or ranking IS the hero; the score is
   secondary but still instantly readable.
3. **Editorial photographic** — a real image or texture ground, type set over it.
   Nothing in the fifteen uses imagery at all.
4. **Colour-as-data** — the whole screen's hue encodes the score against
   baseline; no chart at all.
5. **Physical object** — the night rendered as a tangible thing (a card, a tile,
   a woven band). Not an instrument, not a document — those are taken.
6. **Free** — let Magic Patterns pick. Give it the brief with no direction line
   and see what its own defaults produce. This is the honest read on the tool.

### Five directions for Lovable

Lovable builds React + Tailwind + shadcn. It will fight you toward a
conventional dashboard — **that is itself a finding, record it.**

Recommended: **one project, five routes** (`/v1`…`/v5`), not five projects.
Far cheaper in credits and easier to screenshot. Ask for:

1. Same subtractive brief as MP-1.
2. Same comparison-first brief as MP-2.
3. A direction Lovable is good at: dense, well-structured, shadcn-native — the
   best version of the thing it wants to make anyway.
4. Deliberately anti-shadcn: no Card, no Badge, no default radius, custom type.
   Tests whether the tool can be pushed off its defaults.
5. Free — no direction, just the brief.

Use `plan_mode=true` on the first message to agree the approach before it
writes code. Then `get_diff` to review. Capture `preview_url` and `editor_url`.

---

## 8. RENDER AND VERIFY — NON-NEGOTIABLE

Round two found **seven real bugs that only rendering exposed** and reading the
source did not. Do not skip this.

```bash
npm install --no-save playwright-core     # chromium is preinstalled
```
Launch with `executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome'`,
viewport `390×844`, `deviceScaleFactor: 2`. Do **not** use
`waitUntil: 'networkidle'` — Google Fonts through the proxy can hang it. Use
`domcontentloaded` plus a ~1.2s settle.

For every design assert: `scrollWidth === 390` and the screen element is
exactly `844` tall. Then **look at the screenshot**.

Bugs that actually occurred, check for each:

- `text-transform: uppercase` turns **μ into Μ** and **σ into Σ**. Hit six
  variants. Guard with a `.grk { text-transform: none !important }` span.
- `white-space: nowrap` **still collapses runs of spaces** — it slid a whole
  block-glyph chart left. Use `pre`.
- A chart wider than its container is silently clipped, taking the marker with
  it. Measure the glyph/element fit against real container width.
- `.parent div { border-left: … }` also matches grandchildren. Use `>`.
- An overlay panel covering data underneath it.
- Claims the data does not support (one variant said "best of the past week";
  T7 is a *mean*, not a maximum).
- Wrong weekday or date.

---

## 9. SCORE AND RANK

Score every generated design against all six rubric criteria. Append to
`JUDGING.md` as **"Round three — Magic Patterns and Lovable"** with:

- One table per tool: `Distinct | Type | Legib. | Motion | Restraint | Craft | Total`
- Then a **combined ranking of all designs, old and new**, so Seth can see
  whether a generator beat the hand-authored set.
- Per-design prose: one line per criterion explaining the score, in the same
  voice as the existing entries.
- **A direct answer to the maker-diversity question:** did the generators
  produce anything structurally different from what one model produced by hand,
  or did they converge on the same shapes? This is the whole reason the round
  exists — answer it explicitly, and be willing to say "no" if that is true.
- Note any direction where the tool refused or drifted, and what it drifted
  toward. Tool defaults are data.

---

## 10. PUBLISH THE ARTIFACT

Match the existing comparison artifact's approach:

- **Embed PNG screenshots as base64 data URIs.** Do not use relative-path
  iframes — they break once published. ~2.7MB for 15 was fine; cap is 16MB.
- Load the `artifact-design` skill before writing the page.
- Single committed theme with every colour explicit. The existing sheet uses a
  fixed warm mid-grey `#78756F` **on purpose** — a theme-following ground would
  flatter dark screens on a dark host and light screens on a light host, which
  is the exact bias a bake-off must not have. Keep that.
- Group by maker: Hand-authored (15) · Magic Patterns · Lovable.
- Per card: number, name, direction, screenshot, palette dots, typefaces,
  per-criterion score chips, total.
- Close with the maker-diversity verdict from §9.
- Give it a real title and a favicon. Publish and hand Seth the URL.

---

## 11. GIT DISCIPLINE

**The repo has an unattended writer.** A GitHub Actions cron runs every 10
minutes and commits `chore(state): rotation update …` to `main`. It will race
you.

- Work on `claude/phase4-generators`. Do not push to `main`.
- If you must fetch main, `git fetch origin main && git rebase origin/main`.
- Do **not** disable the workflow. It is the live product.
- Do not open a pull request unless Seth asks.
- Commit generated variants under `variants/mp1`…`mp6` and `variants/lv1`…`lv5`.
- Run `node --test test/*.test.js` before any push — **53 tests must stay green.**

---

## 12. DEFINITION OF DONE

- [ ] ≥5 Magic Patterns designs, ≥5 Lovable designs, in the repo
- [ ] Every one renders at exactly 390×844, verified headless, **and looked at**
- [ ] No palette or typeface reused from §5
- [ ] Real unrounded values throughout; hypnogram sums to 492
- [ ] All scored against all six criteria; combined ranking published
- [ ] The maker-diversity question answered explicitly
- [ ] Artifact published with embedded screenshots; URL given to Seth
- [ ] `JUDGING.md` updated; 53 tests green; pushed to `claude/phase4-generators`
- [ ] Generation spend reported: how many MP generations, how many Lovable messages

## 13. REPORT BACK

Tell Seth, in this order: the artifact URL; the combined top five across all
makers; whether either generator beat the hand-authored 22; the
maker-diversity verdict; what the tools refused to do; and exact spend.

Be honest if the generators lost. That is a real result and more useful than a
flattering one.
