# Sleep OS — roadmap

## How this file works

Seth drops ideas whenever he has them. Nothing stops to build them. They land in
**Inbox** raw, get triaged into a phase with enough specification to be picked
up cold, and stay there until they're scheduled.

A phase is only "ready" when it names what it touches, what decision it needs
from Seth, and how you'd know it worked.

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

---

# Phase 6 — Habit anchors

**Status:** specified, not started. This is the newest idea and the next thing
to build.

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
  see Phase 8.*

## Done when

Both messages arrive at fixed times daily, the cue is actionable from a lock
screen, the rationale differs every day for at least 20 days, jitter is
provably off, and the existing 55-fact rotation is untouched.

---

# Phase 7 — Generator bake-off

**Status:** fully specified in `SUPERPROMPT-PHASE4.md`. Needs a session with the
Magic Patterns and Lovable connectors live.

At least 5 designs from each tool, scored on the same rubric, ranked against the
existing 16, published as one artifact. The question it exists to answer: **all
16 current screens were made by one model — does a different maker produce
something structurally different, or does everything converge?**

Budget: 6 Magic Patterns generations (0 spent). Lovable spends real credits —
one project with five routes, not five projects.

---

# Phase 8 — Getting the night screen in front of you

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

# Phase 9 — Statistical integrity

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
