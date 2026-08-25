# Sleep OS — roadmap

## How this file works

Seth drops ideas whenever he has them. Nothing stops to build them. They land in
**Inbox** raw, get triaged into a phase with enough specification to be picked
up cold, and stay there until they're scheduled.

A phase is only "ready" when it names what it touches, what decision it needs
from Seth, and how you'd know it worked. Phase numbers are ordering, not
commitments — they get renumbered when something slots in between.

---

## Inbox — raw, not yet triaged

*(empty — everything below has been placed)*

---

## Standing items

Small, unblocked, and worth doing whenever there's a gap.

| | Item | Why it matters |
|---|---|---|
| S1 | ~~**Revoke the exposed Telegram bot token**~~ — **DONE 2026-08-25** | Seth rotated it via @BotFather and updated `SLEEPOS_TELEGRAM_BOT_TOKEN`. The old token pasted into chat early on is dead. No known credential exposure remains. |
| S2 | ~~Decide the **8:1 type floor**~~ — **DECIDED, floor stands** | Delegated to Claude 2026-08-24; reasoning in `RUBRIC.md`. v11's reference-interval mechanism is kept and portable; the flat emphasis model is not. The note names the condition to reopen. |

---

## Shipped

- **Phase 1 / 1.6** — 55-fact library, jittered rotation, Telegram delivery, journal prompts, reply capture, 6 AM intake, coaching with SD and percentile
- **Phase 2** — Oura OAuth2, 1,043 nights backfilled, encrypted telemetry, biometric coach
- **Design phases 1–3** — spec, rubric, 18 real Mobbin references, 15 variants, scored comparison artifact
- **Design phase 5** — motion pass on the composite (motion 13.1.1, inlined)
- **Live last-night screen** — the composite renders from real telemetry via `web/build-night.js`, built in CI, delivered as a private workflow artifact
- **Phase 6 — habit anchors** — two daily cues, 24 rotating rationales each, jitter provably off
- **Phase 7 — closing the loop** — journal entries now get an immediate reply; no inbound path is silent
- **L1 — replies in seconds** — long-poll listen window; originally paired with a 5-minute cron, which GitHub did not honour (see Phase 13). Now inside the long-lived `serve` window, which does deliver it
- **Phase 8 — the night screen arrives** — rendered to PNG and sent as a Telegram photo once a day, when the ingest writes a new night
- **S2 — the 8:1 type floor** — decided; it stands, with v11's reference interval carried forward separately

---

# Phase 6 — Habit anchors — SHIPPED

**Status:** built and tested. Decisions taken, since the instruction was to keep
building rather than wait:

- **M1 — fixed 07:15 anchor.** Firing off the intake reply is the better answer
  and is now cheap to add, because Phase 7 put a handler on that path. Follow-up.
- **M2 — Evening Wind-Down moved 19:00 → 18:15**, so the 19:30 glasses cue is
  the only light message in that window.
- **M3 — the shirtless-yoga line rides along on roughly one morning in three**,
  rolled deterministically from the date so a re-run never re-rolls it.
- **M4 — no journal prompt on habits.** They are actions, not ideas.

Delivered: `data/habits.json` (24 rationales per habit — a reason a day for
most of a month), `src/habits.js`, `renderHabit` in `src/render.js`, routing in
`src/dispatch.js`, and two slots with `jitter: false`.

A bug found while wiring it: the dispatch summary assumed anything that was not
an intake was a fact, and read `.fact` off an array habits never push to. Fixed.

## What Seth asked for

Two new daily messages, each cueing one specific physical habit at a specific
time, each carrying a rotating scientific reason for doing it:

1. **Evening, 7:30 PM** — "Put your blue-light blocking glasses on now," plus a
   fact about why evening short-wavelength light matters.
2. **Morning, on waking** — "Get your eyes on the sun, right now." The
   circadian-entrainment case for outdoor light immediately after waking.
   Optionally: a couple of yoga poses in the sun, shirt off.

## Why this is a new type, not two more facts

The existing 55-fact rotation varies *what it tells you* and loops forever
through the library. A habit anchor is the inverse: **the instruction never
changes, only the reason does.** Same action, every day, with a fresh argument
for it. That's a different content shape and a different scheduling policy, so
it wants its own type rather than being forced into the fact library.

Concretely, three differences:

| | Fact slot | Habit anchor |
|---|---|---|
| Content | one of 55 cards, rotating | one fixed cue + rotating rationale |
| Timing | jittered ±20 min, so it never feels robotic | **must not jitter** — a habit cue at 7:52 is not a 7:30 habit |
| Goal | keep the idea fresh | make the action automatic |

The jitter that makes the fact rotation feel alive is exactly wrong here. A
habit forms on a consistent cue. `config.json` already supports `jitter: false`
per slot, so this needs no new scheduling code.

## What it touches

| File | Change |
|---|---|
| `config.json` | two new slots, `type: "habit"`, `jitter: false` |
| `data/habits.json` | **new.** One entry per habit: fixed `cue`, fixed `action`, and a pool of rotating `why` cards |
| `src/render.js` | a habit renderer — cue first, reason second. The cue must be readable without reading the reason |
| `src/selector.js` | rotate the `why` pool per habit, looping forever, same no-repeat-until-exhausted discipline as facts |
| `src/dispatch.js` | route `type: "habit"` to the habit renderer |
| `test/` | rotation loops and never repeats early; jitter is genuinely off; cue survives a missing rationale |

## Proposed slots

```jsonc
{
  "id": "morning_light",
  "name": "07: Morning Light",
  "anchor": "07:15",            // see open question M1
  "objective": "Set the circadian clock: eyes on outdoor light within minutes of waking.",
  "type": "habit",
  "habit": "morning_light",
  "jitter": false,
  "enabled": true
},
{
  "id": "blue_blockers",
  "name": "08: Blue Blockers",
  "anchor": "19:30",
  "objective": "Cut short-wavelength light three hours before bed.",
  "type": "habit",
  "habit": "blue_blockers",
  "jitter": false,
  "enabled": true
}
```

## Content model

```jsonc
{
  "blue_blockers": {
    "cue": "Glasses on. Now.",
    "action": "Blue-light blockers, until you're asleep.",
    "why": [
      { "hook": "…", "claim": "…", "mechanism": "…" }
      // pool of 20–30, rotating, looping forever
    ]
  }
}
```

The `why` pool needs **20–30 entries per habit** so a reason doesn't repeat
inside a month. Fewer than that and the rotation becomes visible, which is the
thing that kills a daily message.

Keep the established framing — "here's the secret," "here's the expensive
thing" — but the cue line comes first and stands alone. On a phone lock screen
Seth should be able to act on the notification without opening it.

**Evidence guardrail:** morning light for circadian entrainment is solidly
supported. Evening blue-blocking is real but the literature is more mixed than
the wellness internet suggests. The `why` pool must not overclaim — if the
strongest honest version of a claim is "this probably helps and costs nothing,"
write that. The project has held to unrounded, unembellished numbers
throughout; the same standard applies to the science.

## Open questions for Seth

- **M1 — What does "upon waking" mean in practice?** Three options:
  - **(a) Fixed 07:15.** Simplest. Your Oura wake is 07:26, so it usually lands
    just before you're up. Wrong on a lie-in.
  - **(b) Fire on your intake reply.** You already answer the 6 AM intake — the
    cue could follow your first message of the day. Truly "on waking," but only
    if you reply promptly.
  - **(c) Off Oura's detected wake.** Most accurate, and **not workable**: Oura
    telemetry isn't pulled until 11:00, hours too late.

  *Recommendation: (a) now, (b) as a follow-up once the habit type exists.*

- **M2 — 7:30 PM collides with the 7:00 PM Evening Wind-Down.** Two messages 30
  minutes apart, both about light. Options: move wind-down to 18:30, fold the
  glasses cue into it, or accept the double-tap. *Recommendation: shift Evening
  Wind-Down to 18:15 so the glasses cue is the only light message in that
  window.*

- **M3 — Does the shirtless-yoga line ship every day, or rotate in?** Daily makes
  it noise; occasional makes it a nudge. *Recommendation: attach it to roughly
  one morning in three, as an optional second line.*

- **M4 — Do habit anchors get journal prompts?** Facts each carry one. Habits
  are actions, not ideas. *Recommendation: no prompt, but track completion —
  see Phase 9.*

## Done when

Both messages arrive at fixed times daily, the cue is actionable from a lock
screen, the rationale differs every day for at least 20 days, jitter is
provably off, and the existing 55-fact rotation is untouched.

---

# Phase 7 — Closing the loop on every reply — SHIPPED (polling path)

**Status:** built and tested on the existing 10-minute polling path.

**L1 was deliberately NOT decided.** Adding an always-on serverless component
to a deliberately serverless design is Seth's architectural call, not one to
take while he is not looking. So the affirmation ships on the path that already
exists: today it arrives within 0–10 minutes of a journal entry. Everything in
`src/affirm.js` is a local lookup and a deterministic roll — no model, no
network — so moving it behind a webhook later is a call-site change and nothing
more. **The instant version is still available whenever Seth wants it.**

Delivered: `data/affirmations.json` (12 mechanism pairs covering every mechanism
in the prompt library, plus identity, short, streak and milestone pools),
`src/affirm.js`, `journalStreak` in `src/journal.js`, and the missing
`sendMessage` on the journal branch of `src/inbox.js`.

## What Seth asked for

Every input to the bot gets something back. Never silence. Short, immediate,
identity-reinforcing. A reliable small reward for having filled it out, so the
habit of journaling becomes self-sustaining.

## The actual gap, measured

Three of the four inbound paths already answer. One does not:

| You send | Today |
|---|---|
| A sleep log (`84 7.5 4`) | Full coach response — SD, percentile, one improvement |
| `/status`, `/stats`, `/help` | Answers |
| An unreadable sleep log | An error with examples |
| **A journal entry** | **Logged silently. Nothing comes back.** |

`src/inbox.js` writes the entry, logs a line to the run output, and
acknowledges the Telegram update. There is no `sendMessage` on that branch.

So this is not "make the replies warmer" — it is **one missing response on the
single path where you have done the most work.** You answer a reflective prompt
and the app says nothing.

## The hard problem: latency

Reinforcement works on a scale of seconds. The engine polls GitHub Actions
**every 10 minutes**, so today a journal reply would wait 0–10 minutes for its
acknowledgement — and scheduled Actions runs are routinely late on top of that.
A reward that arrives eight minutes after the behaviour is not closing the loop;
it is a separate event.

This is the whole feature. Options:

1. **Accept 0–10 min.** Costs nothing, delivers little. The reply still lands,
   but the "hit" is gone.
2. **Poll every 5 minutes.** GitHub's floor. Doubles the run count for half the
   latency, still minutes.
3. **Telegram webhook → a tiny serverless function** (Cloudflare Worker or
   equivalent, free tier). Replies in under a second. The function does *only*
   the affirmation; GitHub Actions keeps doing the logging, coaching and
   telemetry exactly as now.

*Recommendation: 3.* It is the only option that delivers what was actually
asked for. It splits the system honestly — a fast path that acknowledges, a slow
path that thinks. The cost is the first always-on component in a deliberately
serverless design, and one more secret to hold.

**Decision needed from Seth (L1): is instant worth a serverless function, or is
"within ten minutes" good enough to start?** Everything below works either way.

## What to say

Generic praise is the failure mode. "Great job!" every time habituates within a
week and starts reading as a machine patting you on the head. Three sources of
something better, in increasing order of strength:

1. **The mechanism.** Journal entries already store which behavioural mechanism
   the prompt was targeting (`mechanism` on every entry). So the reply can name
   what you just did: *"That's mental contrasting. Most people skip straight to
   the plan."* Free personalisation from data already on disk.
2. **The streak.** *"Nine nights running."* Objective evidence, not an adjective.
   Far stronger than praise because it is a fact about who you are.
3. **Your own words.** Reflecting a fragment of what you wrote proves it was
   read. Cheapest honest version: the first clause, no LLM required.

**Identity, not performance.** "You're the kind of person who does this at
11pm" beats "well done." The former is evidence for a self-concept; the latter
is a gold star.

## Variable intensity

The config already carries a `jackpot` at odds `0.142857` — roughly one in
seven — used to make the fact rotation feel alive. The same precedent applies
here: **always reply, but vary the size.** Most acknowledgements are one line.
Occasionally the reply is bigger: a streak milestone, a rarer line, a statistic
about the journal. Constant-magnitude reward flattens into noise; varied
magnitude stays live.

## One design guardrail

Seth asked for behavioural dependency, in those words, and that is a legitimate
thing to build for yourself. The failure mode worth designing against is not
moral, it is practical: if the reward attaches to *typing something*, the
optimal move becomes typing anything. Tie the reward to evidence — the streak,
the mechanism, his own sentence — and it stays attached to the reflection
instead. Where the entry is two words, the reply should be warm and short
rather than effusive; effusive on a throwaway entry teaches that throwaway
entries pay.

## What it touches

| File | Change |
|---|---|
| `src/inbox.js` | send a reply on the journal branch — the missing `sendMessage` |
| `data/affirmations.json` | **new.** Pools by shape: mechanism-aware, streak, short-entry, milestone |
| `src/journal.js` | current streak, and total entries, for the streak line |
| `src/affirm.js` | **new.** Pick a shape, fill it, rotate so lines do not repeat inside a month |
| *(if L1 = webhook)* | a Worker that receives the update, replies, and forwards to the existing pipeline |
| `test/` | never silent on any inbound path; no repeat inside N; streak maths; two-word entry gets the short shape |

## Also worth doing while in here

The sleep-log coach response already replies but ends on an improvement note.
It should close on identity too — one line, after the numbers.

## Done when

No inbound message produces silence, ever, including when matching fails and
including on an unrecognised input. Journal replies name the mechanism or the
streak rather than praising. Nothing repeats inside a month. And Seth can say
whether it feels like a reward or like a robot — that is the only real test.

---

# Phase 8 — Generator bake-off — SHIPPED

**Status:** run 2026-08-25. Six Magic Patterns generations (zero re-rolls) and
one Lovable message (one project, five routes, 9.3 credits). All eleven scored,
ranked against the sixteen, published. Verdict recorded in `JUDGING.md`: the
generators largely converged rather than diverging — five of eleven independently
chose Bodoni Moda, two makers re-derived the same mechanism to 301.02px, and both
unprompted runs landed on ground the hand-authored set already held. No generated
screen beat the hand-authored 22; lv1 tied it, and produced the only screen in
twenty-seven that satisfies the restraint criterion.

At least 5 designs from each tool, scored on the same rubric, ranked against the
existing 16, published as one artifact. The question it exists to answer: **all
16 current screens were made by one model — does a different maker produce
something structurally different, or does everything converge?**

Budget: 6 Magic Patterns generations (0 spent). Lovable spends real credits —
one project with five routes, not five projects.

---

# Phase 9 — Getting the night screen in front of you — SHIPPED

**Status:** shipped as option 1. The screen renders headless in CI and arrives as
a Telegram photo once a day when the ingest writes a new night. The Shipped list
above records this as "Phase 8 — the night screen arrives"; the numbering drifted,
the work is the same.

`web/build-night.js` produces the real screen, but it's delivered as a **GitHub
Actions artifact** — you'd have to open Actions, find the run, download a zip.
Nobody does that daily. The screen exists and is effectively unreachable.

Options, roughly in order of effort:

1. **Telegram photo.** Render the screen headless in CI and send it as an image
   with the morning coaching. Zero new infrastructure — it rides the pipe that
   already works. Loses interactivity.
2. **Private published page.** Push to a URL only you have. Live and tappable;
   needs somewhere to host and a way to keep real biometrics off a public repo.
3. **On-demand.** A `/night` command to the bot that renders and replies. No
   daily push, no storage.

*Recommendation: 1 first — it's a day's work and gets the thing in front of you
tomorrow. 3 as a companion. 2 only if you want the motion and the press
interaction, which are the parts a screenshot throws away.*

Also folds in here: **habit completion tracking** from Phase 6 M4. If habits are
tracked, the night screen is where the streak belongs.

---

# Phase 10 — Statistical integrity — SHIPPED

**Status:** fixed in `src/msri.js`, covered by tests. `CDF_Percentile_Multiplier`
is gone rather than undefined, contributing factors are clamped, and the EWMA is
seeded with its first observation instead of zero. Verified: a flat series stays
flat from term one, and a step change is approached without overshoot.

The original defect list, kept for the record:

The MSRI composite on the dashboard has three real problems:

- `CDF_Percentile_Multiplier` is referenced but never defined
- several contributing factors are unbounded, so one bad night can dominate
- the EWMA has no seed value, so early terms are unstable

None of this affects the Telegram coaching, which uses `src/stats.js` directly
and is sound. It affects one number on the dashboard. Worth fixing before that
number is ever quoted as if it means something.

---

## Deliberately not doing

- **Multi-user.** Seth asked for a solo app. Every design decision assumes one
  person, one timezone, one history.
- **A native app.** Telegram plus a rendered screen covers it without an app
  store.
- **Auto-pulling the manual sleep log.** The 6 AM hand-entry is deliberate even
  though Oura could fill it automatically — the typing is the point.


---

# Phase 11 — The taste-driven redesign — SHIPPED

**Status:** shipped 2026-08-25. Seth reviewed the twenty-seven screens one at a
time; the picks compiled into eight rules (light ground, percentile in words and
count in pictures, percentile leads and rank supports, every axis dual-labelled,
comparable series tabular never prose, name the unit not the occasion, make it
explicit, one element per screen). Those rules produced **eight screens in two
provenance families** — six warm-paper against his own 1,042 nights, two
cool-blue against published Oura member data — plus a swipeable deck and a link
at the foot of the morning Telegram reply.

The screen that did not exist before is **s5, "Am I heading the right
direction?"** — a trend question effectively nothing in the twenty-seven
answered. Full record in `taste/PICKS.md`.

---

# Still blocked, and what would unblock it

| | Blocker | What's needed |
|---|---|---|
| **S1** | Exposed Telegram bot token | Two minutes at a computer with @BotFather, then update `SLEEPOS_TELEGRAM_BOT_TOKEN`. Only open security item. |
| ~~**Oura population percentile**~~ — **RESOLVED 2026-08-25** | Seth supplied a member-night percentile table (scores 40–99, three grading curves, 90% intervals). Saved as `references/07-SCORE-REFERENCE-TABLE.md` + `04-percentile-table.csv`, verified in `07-VERIFICATION.md`, shipped as screens g1/g2. | Still member nights, not national, and the SD behind it is inferred rather than published — so 26 of 60 rows stay unprintable and no row is high confidence. |
| **T180 / T365 values** | `coach.js` now asks for them and `trailing()` computes them, but this build has no `SLEEPOS_DATA_KEY` | Nothing. They populate automatically on the runner, which holds the key. Screen s5 shows them as "pending" until then. |

---

# Phase 12 — Letter grades — SHIPPED

Two screens, `g1` and `g2`, answering "what is last night worth?" on three
grading curves at once — standard, bell and curved, harshest to most generous.
`g1` grades against Oura member nights; `g2` against his own 1,042.

The curves are held identical across both screens on purpose. That is what makes
the comparison mean anything: an 88 is an **A** among member nights and an **A−**
among his own, because he outsleeps the member average and his own history is
the tougher field. The gap is the finding, and it only reads as a gap if the
curves do not move.

All three curves grade a **percentile**, never a raw score, so one marker cuts
through all three bars and the reason the letters differ is visible rather than
asserted. Standard's enormous F block is the argument against using it.

What is enforced in code rather than left to good intentions:

- Curve definitions live in `data/grade-curves.json`, read by both the app and
  the screen builder. A test asserts they reproduce all 180 published grade
  cells — if the files drift, every grade goes silently wrong while still
  looking plausible.
- Nothing is labelled "national". A test fails if the population label says
  national or ever acquires a member count.
- The 26 low-confidence rows grade but never print a percentile.
- `bin/build-grades.mjs` counts real nights where the key exists and stamps
  `modelled: true` where it does not; `g2` carries a provisional banner in that
  case.

**Open on this phase:** `data/my-score-table.json` in the repo is still the
fitted fallback, because no container outside the runner can read the encrypted
history. The first CI run after a telemetry change replaces it with counted
nights and uploads `references/08-MY-SCORE-TABLE.md` as the `grade-table`
artifact. Until then `g2`'s numbers are provisional and say so.


---

# Phase 13 — The scheduler was the bug — SHIPPED

The engine ran on `*/5` and assumed GitHub honoured it. Measured over twenty
consecutive scheduled runs:

| | |
|---|---|
| Requested interval | 5 min |
| **Median actual gap** | **103 min** |
| Best / worst | 51 min / 206 min |

GitHub deprioritises high-frequency crons on free public repositories. It is a
request, not a guarantee, and roughly one twentieth of it arrived.

It landed on the cues where timing is the whole point. From the delivery log:

| Slot | Target | Sent | Late |
|---|---|---|---|
| afternoon_boundary | 4:00 PM | 5:03 PM | +63 min |
| evening_winddown | 6:11 PM | 6:58 PM | +48 min |
| **work_shutdown** | 9:00 PM | **11:14 PM** | **+134 min** |
| **terminal_bedtime** | 10:00 PM | **11:14 PM** | **+74 min** |

The last two arrived in the same run, so "stop working" and "screens off" landed
together at 11:14pm. A bedtime cue that late is a notification about the past.

It also made L1 false. The design was a 200-second long poll every 5 minutes, or
near-continuous coverage; at a 103-minute gap the listen window covered about
**3% of the day**, so a reply usually waited up to an hour and a half. That was
written up as shipped and had never been measured.

**The fix: fewer, much longer runs.** An Actions job may run six hours and public
repositories have unlimited minutes, so `bin/sleep-os.js serve` stays up for
5h45m, checking what is due and holding a Telegram long poll every ~25 seconds.
Inside a run the loop is punctual to the slice, so scheduler drift became startup
latency rather than every cue's timing. The cron is every two hours and
`concurrency` queues rather than cancels, so a start that slips is still covered
by the run in flight.

What it had to get right:

- **State is pushed the moment anything is sent**, not at the end. A six-hour run
  that persisted on exit would lose an evening of delivery records if the job
  were killed, then re-send all of it.
- **Nothing ends the window.** A failed dispatch, poll, push or deck delivery is
  logged and the loop continues; four tests hold that.
- **The Oura ingest now happens mid-run**, hours after the first step, so the
  dashboard is published by pushing `gh-pages` from inside the loop
  (`bin/publish-page.mjs`, via git plumbing so the working tree is never moved
  under a running supervisor) rather than by an Actions step that can only run
  before the window opens.

**Open on this phase:** the first long window has not completed yet. Slot
punctuality inside a run is proven by unit tests against a controlled clock, not
yet by a night of real deliveries.


## Open questions, not blockers

- **Is "usually seconds" enough?** The long-poll window makes the common case a
  second or two. It is not guaranteed — GitHub's scheduler runs late under load
  and there is a gap between runs. A webhook is the only certain version, and
  it is still the first always-on component. Worth revisiting only if the delay
  is actually noticeable in use.
- **When should the night photo land?** Right now it goes out when the Oura
  ingest writes the new night, which is around 11:00. The alternative is
  holding it and attaching it to the morning coaching reply. Currently: as soon
  as the data exists.
- **The cron is now every 5 minutes.** Unlimited Actions minutes on a public
  repo, so there is no cost, but it is twice the previous run rate.
