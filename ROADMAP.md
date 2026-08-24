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
| S1 | **Revoke the exposed Telegram bot token** via @BotFather, then update `SLEEPOS_TELEGRAM_BOT_TOKEN` | The token was pasted into chat early on. The repo is public. Rotating it costs two minutes and closes the only known credential exposure. **Needs Seth** — BotFather is a human conversation. |
| S2 | Decide the **8:1 display-to-body type floor** | Four design variants can't meet it because signage, clinical forms, receipts and strip-chart recorders have no concept of a hero number. Either the floor stands and those disciplines are out, or it's negotiable and v11's reference-interval mechanism becomes available. **Needs Seth.** Blocks any final composite decision. |

---

## Shipped

- **Phase 1 / 1.6** — 55-fact library, jittered rotation, Telegram delivery, journal prompts, reply capture, 6 AM intake, coaching with SD and percentile
- **Phase 2** — Oura OAuth2, 1,043 nights backfilled, encrypted telemetry, biometric coach
- **Design phases 1–3** — spec, rubric, 18 real Mobbin references, 15 variants, scored comparison artifact
- **Design phase 5** — motion pass on the composite (motion 13.1.1, inlined)
- **Live last-night screen** — the composite renders from real telemetry via `web/build-night.js`, built in CI, delivered as a private workflow artifact
- **Phase 6 — habit anchors** — two daily cues, 24 rotating rationales each, jitter provably off
- **Phase 7 — closing the loop** — journal entries now get an immediate reply; no inbound path is silent

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

# Phase 8 — Generator bake-off

**Status:** fully specified in `SUPERPROMPT-PHASE4.md`. Needs a session with the
Magic Patterns and Lovable connectors live.

At least 5 designs from each tool, scored on the same rubric, ranked against the
existing 16, published as one artifact. The question it exists to answer: **all
16 current screens were made by one model — does a different maker produce
something structurally different, or does everything converge?**

Budget: 6 Magic Patterns generations (0 spent). Lovable spends real credits —
one project with five routes, not five projects.

---

# Phase 9 — Getting the night screen in front of you

**Status:** not specified. Needs a decision before it's worth planning.

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

# Phase 10 — Statistical integrity

**Status:** known defects, no user-visible symptom yet.

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
