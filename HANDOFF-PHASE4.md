# HANDOFF — Magic Patterns + Lovable rounds

Written so a session that *has* the connectors can start producing in one read.
Nothing here needs re-deriving; everything referenced is in this repo.

## Why this file exists

Sets A, B and C (15 variants) were all hand-authored by one model. They widen
the *references*; they do not widen the *maker*. Magic Patterns and Lovable are
meant to be independent generators so Seth can compare across makers, not just
across references. Neither has run.

## Read these first, in order

| File | What it gives you |
|---|---|
| `DESIGN.md` | The POV, the constraints, and §6 the real unrounded Oura values |
| `RUBRIC.md` | Six criteria, written before any variant existed |
| `JUDGING.md` | Scores for all 15 and the three findings from round two |
| `variants/README.md` | What each of the 15 was trying to do |
| `compare.html` | Live side-by-side of all 15 (open from a checkout) |

Published comparison: https://claude.ai/code/artifact/971e5513-09ca-4887-ae46-9a0e5b89faa6

## Hard constraints — from Seth, verbatim where quoted

- **Magic Patterns cap: 6 generations total.** "Magic Patterns is the only tool
  permitted to generate exploratory variants. Cap: 6 generations total in
  Phase 2 without asking me first." **0 of 6 have been spent.**
- **"Never re-run a generation because the output was slightly off. Fix it in
  code yourself."** A bad generation is a finding, not a retry.
- **Lovable costs real credits per message.** Seth's message of 2026-08-24
  ("I want you to generate new designs with both of these tools") is the
  written approval Phase 4 required. Still: batch the intent into as few
  messages as possible.
- Every variant renders at exactly **390×844**, no horizontal overflow.
- **Real unrounded values only.** DESIGN.md §6. "Never round these. 7h 45m is
  true; 8h 00m is a lie that makes the design feel like a template."
- Six colour roles maximum, **one accent**.
- No variant may reuse a palette or typeface already used in v1–v15.

## The brief to send

> One mobile screen, 390×844. It answers a single question: **how did I sleep
> last night, and how does that compare to every night before it?**
>
> Data — all real, do not round:
> score 88 · readiness 85 · asleep 7h 45m · in bed 8h 12m · efficiency 94% ·
> deep 1h 29m · REM 2h 07m · light 4h 09m · awake 27m · latency 2m 30s ·
> bedtime 23:15 · wake 07:26 · HRV 37 ms · lowest HR 55 bpm · avg HR 60.1 bpm ·
> respiration 14.4/min · restless 174.
> Baseline: 1,042 prior nights, mean 79.3, SD 9.54, z +0.92, 81st percentile,
> rank 198 of 1,042. T7 79.4 · T30 79.2 · T90 73.9.
>
> The comparison must land in the **same glance** as the score. Fifteen prior
> attempts mostly treated it as an annotation; three that succeeded did so by
> stating it in plain language rather than drawing a chart.
>
> No dark-UI-with-a-ring. No card grid. No gradient. Pick a real design
> tradition and commit to its palette and typefaces.

## Open question to resolve before a composite is built

The rubric wants **8:1 display-to-body contrast**. Four variants (v10 signage,
v11 clinical form, v13 receipt, v14 strip-chart) land at 3:1–5:1 because those
disciplines have no concept of a hero number — they distribute emphasis rather
than concentrating it. Either the floor is the point and those disciplines are
out, or the floor is negotiable and v11's reference-interval mechanism becomes
available. **Seth has not decided this.** Ask before compositing.

## Where output goes

- Magic Patterns → `variants/mp1/` … `variants/mp5/`
- Lovable → `variants/lv1/` … `variants/lv5/`, plus the Lovable project URL
- Add rows to `JUDGING.md` under "Round three"
- Rebuild `compare.html` and republish the artifact **at the same URL**
  (pass `url` to the Artifact tool — do not create a second one)

## Verification that must pass before claiming done

```
node --test test/*.test.js          # 53 tests, must stay green
```
Then render every new variant headless at 390×844 and confirm no horizontal
overflow and no clipped content. Do not assert this from reading the source —
round two found seven real bugs that only rendering exposed, including a
CSS specificity collision, a clipped chart, and two wrong timestamps.
