# Sleep OS Reminder System

**You do not need to be taught. You need to be reminded.**

The behavioral software overlay for an existing sleep stack. Sleep OS does not
replace the Oura ring, the blackout curtains, the 65°F thermostat or the evening
magnesium — it sits on top of all of it as a cadence engine, delivering
science-backed reframes to a phone at the moments a trade-off is actually being
made.

Currently a **single-user build**: no accounts, no signup, no web app. One
person, one Telegram chat, six nudges a day.

---

## Status

| Phase | Scope | State |
|---|---|---|
| **1** | Fact library, rotation engine, Telegram delivery, scheduler | **Built** |
| 2 | Oura API v2 ingestion + full historical backfill | Not started |
| 3 | Z-scores, percentiles, trailing tickers, MSRI, morning brief | Not started |
| 4 | Public web app: landing page, Science Vault, onboarding | Not started |
| 5 | Milestone deep-dives, interactive micro-journaling | Not started |

---

## Setup

Three steps, about five minutes. No servers, no hosting bill, no accounts beyond
Telegram and GitHub.

### 1. Create the bot

1. Open Telegram and message **@BotFather**
2. Send `/newbot`, pick a name and a username
3. Copy the token it returns (looks like `8123456789:AAH...`)

### 2. Find your chat id

```bash
export TELEGRAM_BOT_TOKEN="paste-your-token-here"
npm run whoami
```

If it says no chats yet, send your new bot any message in Telegram (it must
receive one message before it can message you), then run `npm run whoami` again.
It will print your chat id.

```bash
export TELEGRAM_CHAT_ID="paste-your-chat-id-here"
npm run send -- work_shutdown     # fires the 9 PM card right now as a live test
```

### 3. Put it on autopilot

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**. Add both:

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the BotFather token |
| `TELEGRAM_CHAT_ID` | your chat id |

The workflow in `.github/workflows/sleep-os.yml` takes over from there. Nothing
else to deploy.

> **Actions minutes:** the workflow polls every 10 minutes (~144 runs/day).
> That is unlimited and free on a **public** repo. On a private repo it exceeds
> the free tier — either make the repo public (it is designed as an open-source
> public good anyway) or widen the cron to `*/30 * * * *`.

---

## Commands

```bash
npm run today                       # today's jittered schedule + what has fired
npm run preview                     # render all six of today's cards, send nothing
npm run send -- terminal_bedtime    # force one slot immediately
npm run send -- work_shutdown --dry-run
npm run dispatch                    # send whatever is due (this is what cron runs)
npm run stats                       # library, rotation position, delivery history
npm run whoami                      # verify bot token, discover chat id
npm test
```

---

## How it works

### The daily cadence

Six anchor times, each with a Gaussian jitter offset of up to ±20 minutes so the
notifications never become predictable wallpaper.

| Slot | Anchor | Objective |
|---|---|---|
| Morning Reflection | 8:00 AM | Re-anchor identity as a high-performance sleeper |
| Midday Essentialism | 12:00 PM | Front-load execution so work does not spill into the evening |
| Afternoon Boundary | 4:00 PM | Caffeine cutoff, 10 hours before target bedtime |
| Evening Wind-Down | 7:00 PM | Light reduction and thermal drop |
| **Hard Work Shutdown** | **9:00 PM** | **Non-negotiable laptop shutdown** |
| Terminal Bedtime Anchor | 10:00 PM | Screens off, transition to bed |

All times are wall-clock in `America/Detroit`, stored as an IANA zone so
daylight saving is handled automatically rather than drifting an hour twice a
year.

### The fact library

55 facts — 40 sleep science, 15 lucid dreaming, a 72.7 / 27.3 split that lands
almost exactly on the intended 70/30 mix. Each is a five-field card, stored and
delivered **verbatim**:

```
The High-Yield Reframe:   the hook — the scarce, expensive, secret thing
The Data Proof:           the study
The Daily Currency:       what tonight's decision actually costs you
Tonight's 1% Move:        one action
The Root Truth:           the compression
```

Sent as plain text with `parse_mode` omitted, so no asterisk or underscore in
the source text ever renders as markup.

### Rotation

One **cycle** is a single pass through all 55 facts. Nothing repeats until the
pool is exhausted; then the pool reshuffles and the next cycle begins. At full
cadence a cycle lasts about **9.2 days**.

That repetition is the design, not a shortfall — the engine runs on spaced
repetition, and a fact resurfacing every nine days is the mechanism working.
Adding facts widens the loop automatically; no code change required.

Two refinements sit on top of plain rotation:

- **Slot affinity.** Each fact is tagged with the slots it fits. Selection
  scans a 25-deep lookahead for an on-theme card before falling back to the
  queue head, so 4 PM tends to be about caffeine and 9 PM about shutdown.
  Skipped facts keep their place in the queue, so the no-repeat guarantee
  holds. Measured on-theme rate is ~92%.
- **Jackpot drops.** Roughly 1 send in 7 is flagged as a jackpot and pulls a
  high-intensity card (23 of the 55 qualify) with its own header.

### Adding facts

Append to `data/facts.sleep.json` or `data/facts.lucid.json`:

```json
{
  "id": "sleep-41",
  "category": "cognition",
  "intensity": "high",
  "slots": ["work_shutdown"],
  "reframe": "...",
  "proof": "...",
  "currency": "...",
  "move": "...",
  "truth": "..."
}
```

`npm test` validates ids, required fields and slot tags. New facts join the next
cycle automatically.

**Coverage gap worth filling:** `afternoon_boundary` has only 5 tagged facts, so
its on-theme rate is 67% against ~100% elsewhere. Three or four more caffeine,
adenosine or afternoon-timing cards would close it.

---

## Layout

```
data/          the fact libraries — the irreplaceable asset
src/
  facts.js     loading and validation
  playlist.js  per-cycle shuffle and 70/30 interleave
  selector.js  rotation, slot affinity, jackpot
  schedule.js  anchors and Gaussian jitter
  time.js      timezone-aware wall-clock maths
  render.js    the five-field plain-text card
  telegram.js  Bot API client
  state.js     rotation state and delivery history
  dispatch.js  the "what is due right now" loop
  rng.js       seeded determinism
bin/           CLI
state/         rotation state + append-only delivery log
test/          16 tests, zero dependencies
```

Zero runtime dependencies. Node 18+.

---

## Notes on the science

The sleep science library ships without per-fact citations — the source
documents used `[cite: ]` placeholders that came through empty. The lucid
dreaming library does carry sources. Adding citations to the sleep facts is
worthwhile before this is ever shown to anyone else.

Sleep OS is a behavioral reminder tool. It is not medical advice, diagnosis, or
treatment. Consult a professional for medical concerns.
