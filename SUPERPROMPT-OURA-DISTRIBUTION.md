# SUPER PROMPT: Build the Oura Sleep Score percentile table

**Paste this entire file as your first message in a new Claude Cowork session.**
It is self contained. Everything the run needs is here or named here.

Companion repo: `https://github.com/topsoilpropertyco/8.23.2026_Claude-Code-Test-`
Branch with the current work: `claude/phase4-generators`
Key prior artefact: `references/OURA-POPULATION.md` (the research that produced this brief)

---

## 0. HOW TO USE THIS BRIEF

Operating rules for the whole session.

1. **Work in priority order.** Every phase produces a titled, tangible work
   product. If the run dies at 40 percent, the most valuable outputs already
   exist. Build more rather than less. Comprehensive is correct here.
2. **Mark every ⬦ DECISION explicitly.** State the call, the alternatives, and
   what evidence would reverse it.
3. **Top 5 protocol at every fork.** List the five options considered, in
   priority order, why considered, why chosen or rejected, with sources. Seth
   audits this later and redirects sub steps without re-litigating from zero.
4. **Keep a running Decision Log.** Every choice plus why. Roll it up at the end.
5. **Keep a running Blind Spot roll up.** Per phase: what Seth is not asking
   that he should be. Consolidate at the end.
6. **Hard human checkpoint after Phase 2.** Phase 2 decides whether a real
   distribution exists. Everything downstream depends on that answer. Stop
   there and hand back before proceeding.
7. **Two layer construction.** Evergreen layer: the statistical method, which
   does not go stale. Time specific layer: every figure, every source, every
   algorithm version, each stamped with a date and a URL and re-verifiable.
8. **PROOF PENDING markers.** Any number you cannot trace to a primary source
   carries `PROOF PENDING` and does not enter the final table without a
   flagged confidence level.
9. **Draft only.** Nothing publishes, deploys, emails, or posts. Every artefact
   comes back as a draft.
10. **Skill selection.** At session start and before each major work product:
    scan the available skill library, use an existing skill if it makes the
    output better and say which in the Decision Log, and if you spot a
    repeating pattern worth a new skill, draft it as a deliverable rather than
    silently building a one off. Do not force a skill that does not fit.

---

## 1. NORTH STAR

**Build a defensible lookup table that converts any Oura Sleep Score from 40 to
99 into a percentile against a named reference population, with a confidence
level on every single row, and hand it back as a machine readable artefact that
Claude Code can consume directly to build comparison screens.**

Success in one sentence: Seth can look at last night's 88 and know, with a
stated and honest confidence, what percentage of a clearly defined population
of Oura wearers slept worse than that.

The failure mode to avoid is not "we could not find it." The failure mode is
**a confident, well formatted, sourced looking table that is quietly wrong.**
A table that says "we could only pin scores 60 to 95, and here is why, and here
is the uncertainty on each" is a success. A smooth table from 40 to 99 with no
error bars is a failure even if it looks better.

---

## 2. GROUND TRUTH: EXACTLY WHAT IS ALREADY KNOWN

This section is the floor. Do not re-derive it. Do challenge it if you find
better.

### 2.1 What Oura has actually published

| Figure | Value | Source and date |
|---|---|---|
| Global mean Sleep Score, all members | **77.0** | Oura 2024 Year in Review. De-identified aggregated member data, Dec 2023 to Nov 2024, described as "millions of members" |
| New Zealand mean, 2024 | 79.8 | Oura 2024 Year in Review |
| Australia mean, 2024 | 78.7 | same |
| Sweden mean, 2024 | 78.5 | same |
| Finland mean, 2024 | 78.4 | same |
| Austria mean, 2024 | 78.2 | same |
| New Zealand mean, 2025 | 80.0 | Oura 2025 Year in Review |
| Australia mean, 2025 | 79.4 | same |
| Oura's own score bands | 85 to 100 optimal, 70 to 84 good, below 70 pay attention | Oura Member Care, "Sleep Score" |
| Female members mean sleep duration | 7.24 h | Oura 2024/2025 Year in Review |
| Male members mean sleep duration | 6.8 h | same |

### 2.2 What is NOT published, after a real search

- **No standard deviation** of the population Sleep Score, at any level.
- **No distribution, histogram, quantiles, percentiles or box plot.**
- **No United States country mean.** The Year in Review coverage names only
  top ranked countries. US reporting is state ranked qualitatively (Wyoming
  highest, DC lowest) with no figures attached.
- **No in app "you are in the Nth percentile of members" feature** documented.

### 2.3 Searches already run, so you do not repeat them

Run 2026-08-25. All returned no population distribution.

1. `Oura ring average sleep score population data distribution`
2. `Oura "year in review" OR "state of sleep" aggregate member data average sleep score millions`
3. `Oura 2024 Year in Review global average sleep score 77 country averages list`
4. `"Oura" "sleep score" mean "standard deviation" study participants nightly`
5. `Oura Year in Review United States average sleep score 2024 2025`
6. `TemPredict Oura 65000 participants sleep score dataset distribution published`
7. `Oura sleep score percentile "compared to other members" population percentile ranking feature`

Pages fetched: the Oura 2022 Year in Review blog (qualitative only, no
numbers), the Wareable 2025 Year in Review writeup (403), the ATFW 2025
writeup (country means only), and an attempt at the Nature "Five million
nights" paper (auth redirect).

**Start from here. Go where these did not.**

---

## 3. WHY THE PERCENTILE CANNOT CURRENTLY BE COMPUTED

State this clearly in your own final report, because Seth needs it to survive
contact with anyone who asks "why is this hard."

A percentile is a statement about **where a value sits inside a distribution.**
To produce one you need the distribution. A distribution needs, at minimum,
a location parameter and a spread parameter. In the normal case that is a mean
and a standard deviation.

**We have the mean. We do not have the spread. One parameter is not enough.**

Concretely: the global member mean is 77.0. A score of 88 is 11 points above
that. Whether 11 points above the mean is the 60th percentile or the 97th
depends entirely on how spread out members are:

- If the population SD were 4, then 88 sits at +2.75 SD, roughly the 99.7th percentile.
- If the population SD were 9, then 88 sits at +1.22 SD, roughly the 89th percentile.
- If the population SD were 15, then 88 sits at +0.73 SD, roughly the 77th percentile.

Same score, same published mean, three completely different answers. **Any
percentile published today would be a choice of SD dressed up as a fact.**
That is why the current screen in the repo prints no percentile and says so
on the screen instead.

---

## 4. THE FOUR TRAPS. DO NOT FALL IN THEM

These are the specific ways this project gets silently wrong. Each one produces
an answer that looks correct.

### 4.1 Within person spread is not between person spread

Search engines readily surface figures like "mean 76, SD 9.1" attached to Oura
sleep scores. **That is one individual's own night to night variation.** Seth's
own SD is 9.54, which is how much *his* nights vary around *his* average.

A population percentile needs how much *people* vary from *each other*.
Those are different quantities and the between person SD is usually the larger
of the two once you aggregate to person means, but the night level pooled SD
mixes both. Using a within person SD as a population SD produces a confident,
sourced looking, wrong number. **If you find an SD, you must establish which
one it is before using it.** State it explicitly for every SD you cite.

### 4.2 "National" is the wrong word for this data even when it exists

Oura members bought a ring costing several hundred dollars, largely to optimise
sleep. They are self selected on income, health motivation, and probably age.
The member mean of 77.0 is **not** a US or global population mean.

Every deliverable must say **"Oura members"** and never "national," unless you
actually build a general population estimate by the route in 6.3, in which case
say exactly which population and which sampling frame.

### 4.3 Algorithm version drift

Oura changed its sleep staging algorithm (OSSA 2.0, 2023) and has revised the
Sleep Score over time. A distribution derived from 2020 era data, including the
large TemPredict cohort, may not be comparable to a score produced by a Gen3 or
Gen4 ring in 2026.

**Every figure you carry forward must be stamped with the algorithm era it came
from.** If you mix eras, say so and quantify the risk.

### 4.4 The tails are where fake precision lives

Seth asked for 40 to 99. Be careful. If the member mean is 77 and the spread is
moderate, then scores below roughly 50 are extraordinarily rare, and almost no
dataset will contain enough of them to pin a percentile empirically. Fitting a
smooth curve and reading off a value for score 41 produces a number with no
data behind it.

**The table must carry per row confidence and per row basis** (empirical,
interpolated, extrapolated). A row that says "score 41, percentile 0.2, basis
extrapolated, confidence low" is honest. A row that just says "0.2" is not.

---

## 5. THE FLOOR: WHAT IS ALREADY BUILT

Not a ceiling. Look for something better and if you find it, present it head to
head and recommend.

In the repo, on `claude/phase4-generators`:

- **Eight finished mobile screens** at 390x844, in `variants/s1` through `s6`
  (compared against Seth's own 1,042 nights) and `variants/n1`, `n2` (compared
  against published Oura member data).
- `references/OURA-POPULATION.md`: the research writeup this brief came from.
- `bin/build-screens.py`: generates all eight screens. This is where the new
  screens will be built once you deliver the table.
- `bin/build-deck.py`: assembles them into a swipeable web deck.
- **The visual language is already decided.** Warm paper ground plus an amber
  rail means "measured against your own data." Cool blue ground plus a blue
  rail means "measured against published Oura member data." **Your output will
  drive a third family and it will need its own hue.** Recommend one.
- **Seth's own real numbers**, for calibration and sanity checks:
  score 88, all time mean 79.3, SD 9.54, n 1,042 nights, rank 198, better than
  844, 81st percentile within his own history.

---

## 6. RESEARCH AGENDA. GO WIDE, THEN CONVERGE TO ONE ANSWER

Run these streams in parallel. Do not hand back a literature review. Hand back
a decision.

### 6.1 Stream A: find the published distribution directly

The cheapest win if it exists.

- Oura's own channels: the Pulse blog, newsroom, press kits, investor and
  partnership materials, Oura Teams and Oura for Business documentation,
  research collaborations page, any published methodology or white paper.
- Oura's API surface: the v2 API docs, any enterprise or research tier, any
  endpoint exposing aggregates or norms. Note that the consumer API is
  `usercollection`, the authorising user's own data only.
- Conference posters and abstracts: SLEEP, ESRS, World Sleep. Industry decks.
- Regulatory and clearance filings: Oura has pursued FDA pathways for some
  features. Submissions sometimes contain population statistics.
- Patent filings describing the Sleep Score algorithm. Patents often disclose
  worked examples and score component weightings.

**Ask directly.** Draft an email to Oura research or press requesting aggregate
quantiles of the Sleep Score, or a mean and SD, for a named population. Include
it as a deliverable. Do not send it. Seth sends it.

### 6.2 Stream B: recover a spread from large cohort literature

- The TemPredict corpus: 33,152 people, roughly 4.68 million nights, Jan to Oct
  2020, published as "Five million nights: temporal dynamics in human sleep
  phenotypes," npj Digital Medicine, June 2024. Get the full text and, more
  importantly, **the supplementary materials and any deposited dataset.**
  Known caveat: that paper reports sleep phenotypes and raw metrics, and as far
  as the prior search established, **not** the proprietary Sleep Score. Verify
  that. If the underlying deposited data contains score, that is the jackpot.
- Any other large Oura deployment: university cohorts, NBA and other sports
  programmes, military and first responder studies, workplace wellness
  deployments, COVID era studies.
- Search strategy that has NOT been tried: search for papers reporting Oura
  sleep score as a *covariate or outcome* with descriptive statistics tables,
  rather than searching for distributions directly. Descriptives tables often
  print mean and SD for the whole sample in Table 1.
- **For every SD you find, classify it**: within person, between person on
  nightly values, or between person on person means. Record n, population,
  date, algorithm era.

### 6.3 Stream C: construct the distribution from the score's own inputs

This is the path most likely to actually succeed, and it is the intellectually
strongest. Treat it as a first class route, not a fallback.

The Sleep Score is a weighted composite of documented contributors: total sleep
time, sleep efficiency, restfulness, REM sleep, deep sleep, latency, and
timing. Oura publishes descriptions of these contributors and their intent,
and there are community reverse engineering efforts.

The plan:
1. **Recover the scoring rubric** as precisely as possible. Oura support docs,
   patents, community reverse engineering, and any changelog of score revisions.
   Produce a documented, versioned scoring function with your uncertainty about
   each weight stated.
2. **Find a large public sleep dataset that contains the raw inputs.** Candidates
   to evaluate: the National Sleep Research Resource (sleepdata.org) which hosts
   MESA, SHHS, MrOS, CHAT and others with full polysomnography; UK Biobank
   accelerometer sleep; All of Us; NHANES actigraphy waves. These have real
   population sampling frames, which Oura's member base does not.
3. **Compute an Oura equivalent score for every night in that cohort** using the
   recovered rubric.
4. **Derive the distribution empirically** from those computed scores, and read
   percentiles straight off it.
5. **Calibrate and sanity check** against the one anchor we have: does your
   constructed distribution reproduce a mean near 77.0 for an Oura like
   subpopulation? If your general population mean comes out at 68 and Oura's
   member mean is 77, that gap is itself a finding about self selection, and it
   should be quantified rather than hidden.

⬦ **DECISION**: this route trades "Oura's actual members" for "a real
population with real sampling." State clearly which question each route answers.
They are different questions and both are legitimate.

### 6.4 Stream D: empirical crowd data, lowest rigour, use only to sanity check

r/ouraring, Oura community forums, quantified self communities, public
dashboards, GitHub repos where people publish their exported Oura data.

**This is doubly self selected** (people who own the ring AND choose to post)
and cannot be the primary source. It is useful for one thing: a rough reality
check on the shape and spread of the curve you build elsewhere. If your
constructed distribution says an 88 is the 99th percentile and half of Reddit
posts a screenshot of an 88, your model is wrong.

### 6.5 Stream E: the shape question

Even with mean and SD, a normal curve may be the wrong family. Sleep scores are
bounded at 100 and are left skewed in practice. Investigate whether a beta
distribution scaled to 0 to 100, a truncated normal, or a skew normal fits
better. Any percentile table is a function of the shape you assume, so this
choice must be explicit, justified, and tested. **Report how much the answer
moves under each family.** If score 88 lands at the 89th percentile under a
normal fit and the 84th under a beta fit, Seth needs to see both.

---

## 7. THE PHASED BUILD

### Phase 0. Set up and restate
Produce a one page restatement of the problem in your own words, plus your
working plan and which streams you are prioritising and why. Top 5 protocol on
stream prioritisation.
**Work product:** `00-PLAN.md`

### Phase 1. Exhaustive source sweep
Run streams A, B, D in parallel. Log every source: URL, date accessed, what it
claims, what it actually contains, and a quality grade. Include the negative
results, explicitly. A well documented "we checked X, Y, Z and they do not have
it" is a real deliverable and prevents the next run repeating it.
**Work product:** `01-SOURCE-LEDGER.md` plus `01-sources.json`

### Phase 2. ⬦ THE GATE: does a usable published distribution exist?
Answer yes or no, with evidence, and state confidence.

- **If YES:** carry it forward, and go straight to Phase 4. Record which
  population, which algorithm era, which spread type (per 4.1).
- **If NO:** commit to the constructive route in stream C and say so.

**HARD HUMAN CHECKPOINT. STOP HERE AND HAND BACK.** Everything downstream
depends on this answer and Seth should see it before a marathon gets spent on
the constructive route.
**Work product:** `02-GATE.md` with a one line verdict at the top.

### Phase 3. Construct the distribution (only if Phase 2 says NO)
Execute stream C end to end. Document the recovered scoring rubric, the chosen
cohort and why, the computation, and the resulting empirical distribution.
Include the calibration check against the 77.0 anchor.
Run stream E on the result: test at least three distribution families and
report the sensitivity of the final percentiles to that choice.
**Work products:** `03-RUBRIC.md`, `03-COHORT.md`, `03-DISTRIBUTION.md`,
plus the computation as a runnable script.

### Phase 4. Build the table
Produce the score to percentile mapping for every integer score from 40 to 99.

**Every row carries:**
- `score`
- `percentile` (0 to 100, one decimal)
- `ci_low` and `ci_high`, a genuine uncertainty interval
- `basis`: `empirical`, `interpolated`, or `extrapolated`
- `confidence`: `high`, `medium`, or `low`
- `n_support`: how many observations actually sit near this score, where known

Do not smooth away the uncertainty. If scores below 55 are extrapolated, the
confidence column must say so on every one of those rows.
**Work products:** `04-percentile-table.json` and `04-percentile-table.csv`

### Phase 5. The handback artefact for Claude Code
This is the thing Seth pastes back into Claude Code. Specification in section 8.
**Work product:** `05-CLAUDE-CODE-HANDOFF.md` plus `oura-percentiles.json`

### Phase 6. Report
Executive summary, Decision Log, Blind Spot roll up, file manifest, and an
explicit statement of what is still unknown and what would resolve it.
**Work product:** `06-REPORT.md`

---

## 8. THE HANDBACK ARTEFACT SPECIFICATION

Claude Code consumes this directly. Match this shape exactly.

```json
{
  "meta": {
    "reference_population": "string, precise. e.g. 'Oura members, global, all ages' or 'US adults 20+, MESA cohort, Oura-equivalent score computed'",
    "population_type": "oura_members | general_population | hybrid",
    "unit_of_observation": "night | person_mean",
    "algorithm_era": "string, e.g. 'OSSA 2.0, 2023 onward'",
    "n_people": 0,
    "n_nights": 0,
    "date_range": "YYYY-MM to YYYY-MM",
    "method": "published_distribution | reconstructed_from_inputs | fitted_from_moments",
    "distribution_family": "normal | beta | skew_normal | empirical",
    "mean": 0.0,
    "sd": 0.0,
    "sd_type": "between_person | within_person | pooled_nightly",
    "median": 0.0,
    "overall_confidence": "high | medium | low",
    "known_limitations": ["string", "..."],
    "generated": "YYYY-MM-DD"
  },
  "table": [
    {
      "score": 40,
      "percentile": 0.0,
      "ci_low": 0.0,
      "ci_high": 0.0,
      "basis": "extrapolated",
      "confidence": "low",
      "n_support": 0
    }
  ],
  "anchors": {
    "oura_global_member_mean": 77.0,
    "seth_all_time_mean": 79.3,
    "seth_last_night": 88,
    "seth_own_percentile_within_own_history": 81
  },
  "sources": [
    { "claim": "string", "value": "string", "url": "string", "accessed": "YYYY-MM-DD", "quality": "primary | secondary | inferred" }
  ]
}
```

**Rules for this file:**
- Sixty rows, scores 40 through 99 inclusive. No gaps.
- Percentile must be monotonically non decreasing as score increases. Assert it.
- If a row cannot be honestly estimated, it still appears, with
  `confidence: "low"` and a wide interval. Never omit a row and never fake one.
- `known_limitations` is not decorative. Populate it.

---

## 9. GUARDRAILS

- **No invented numbers, ever.** This project has a standing rule and it has
  already caught one generated screen inventing a plausible date. Any figure
  without a traceable source carries `PROOF PENDING` and does not silently
  enter the table.
- **No health overclaiming.** This table is a descriptive comparison, not a
  clinical instrument. It does not diagnose and must never be framed as doing so.
- **Say "Oura members," not "national,"** unless you genuinely built a general
  population estimate, in which case name the sampling frame.
- **Classify every SD** as within person, between person, or pooled, before use.
- **Stamp every figure with its algorithm era.**
- **Draft only.** The email to Oura is drafted, not sent. Nothing publishes.
- **Respect dataset terms.** NSRR, UK Biobank and All of Us have data use
  agreements and application processes. If a dataset requires an application,
  say so and draft the application. Do not scrape around a licence.
- **Privacy.** No participant level data leaves the analysis. Aggregates only.

---

## 10. WHAT TO HAND BACK

1. **Executive summary**, one page, leading with the verdict: did a published
   distribution exist, what did you build, and how much should Seth trust it.
2. **The artefact**, `oura-percentiles.json`, to the section 8 spec.
3. **File manifest** with paths.
4. **Decision Log**, every choice and why, with the Top 5 at each fork.
5. **Blind Spot roll up**, consolidated.
6. **What is still unknown**, and the specific thing that would resolve each item.

---

## 11. THEN PUT IT BACK INTO CLAUDE CODE

**This is the closing loop. Do not skip it.**

The output of this run is an input to a build. When the table is done, Seth
takes `oura-percentiles.json` and the handoff file back to Claude Code, on the
`claude/phase4-generators` branch of the Sleep OS repo, with this instruction:

> Here is the Oura population percentile table from the Cowork research run.
> Read `05-CLAUDE-CODE-HANDOFF.md` and `oura-percentiles.json`, verify the
> monotonicity and confidence columns, then extend `bin/build-screens.py` with a
> third screen family in a new hue for population percentile. Rebuild the n1
> screen so it now carries a real percentile where confidence allows, and keep
> the "no percentile" panel wherever confidence is low. Regenerate the deck,
> re-verify all screens at 390x844 with the group overlap check, and republish.

Include that paragraph verbatim at the top of `05-CLAUDE-CODE-HANDOFF.md` so it
travels with the file and Seth does not have to remember it.

---

## 12. ASANA BUILD CARD

**FILE IT**
Project: AI Buildout OS
Section: Research in flight
Title: Oura Sleep Score percentile table, population distribution
Tags: research, sleep-os, data, cowork
Assign: Seth
Due: set on kickoff

**Card body**

*Problem.* Sleep OS compares Seth's nights against his own 1,042 night history
and can produce an exact percentile there. It cannot produce a percentile
against other Oura wearers, because Oura publishes a mean (77.0 globally) and
no spread. One parameter is not enough to place a score on a curve.

*Goal.* A defensible score to percentile table, 40 to 99, against a named
reference population, with per row confidence, delivered as JSON that plugs
straight into the existing screen builder.

*Approach.* Search for a published distribution first. If none exists, recover
the Sleep Score rubric and compute Oura equivalent scores on a large public
sleep cohort, then derive the distribution empirically.

*Gate.* Hard human checkpoint after the "does it exist" phase.

*Definition of done.* `oura-percentiles.json` validating against the spec,
sixty monotonic rows, every row carrying basis and confidence, plus a decision
log and a blind spot roll up. Handed back into Claude Code to build the screens.

*Watch for.* Within person SD masquerading as population SD. "National" applied
to a self selected member base. Algorithm version drift. Fake precision in the
tails.
