# Sleep OS — Build Roadmap

Last updated: 2026-08-23

---

## Where we are

**Phase 1 is complete and running unattended.** Cards deliver, replies come
back, nights get logged, the coach responds, the journal records it — all on a
schedule GitHub drives with no involvement from anyone.

Verified: four workflow runs, three consecutive green, the last one reading the
encrypted journal successfully. The repository is public (unlimited Actions
minutes), and the journal is unreadable to anyone without the data key.

The first message to arrive with nobody watching will be the 6:00 AM intake.

| | |
|---|---|
| Repo | `topsoilpropertyco/8.23.2026_Claude-Code-Test-` |
| Branch | `claude/first-app-build-3wp3ge` |
| Bot | `@SleepOSMissionTopOnePercent_Bot` |
| Chat | `8760828708` (Salus) |
| Timezone | `America/Detroit` |
| Target bedtime | 22:30 |
| Library | 55 facts · 28 journal prompts · 7 morning prompts |
| Secrets | `SLEEPOS_TELEGRAM_BOT_TOKEN`, `SLEEPOS_TELEGRAM_CHAT_ID`, `SLEEPOS_DATA_KEY` |
| Visibility | Public — unlimited Actions minutes |
| Tests | 45 passing, zero runtime dependencies |

---

## Phase 1 — Reminder engine · **BUILT**

Seven slots a day: a 6 AM intake plus six fact cards, drawn from a 55-fact
library that cycles fully before repeating.

- Rotation with no repeats until the pool is exhausted (~9.2 days at full cadence)
- Slot affinity at 93–100% on-theme
- Jackpot drops on ~1 in 7 sends, restricted to the 23 high-intensity cards
- Gaussian jitter to ±20 min on fact slots; the intake stays fixed so it can
  become a habit
- DST-safe wall-clock scheduling in `America/Detroit`
- GitHub Actions polls every 10 minutes and sends whatever is due
- CLI: `today`, `preview`, `dispatch`, `send`, `whoami`, `stats`, `journal`

## Phase 1.6 — Journal, intake and coach · **BUILT**

- 28 prompts across 12 named behaviour-change mechanisms, one per card,
  rotating independently of the facts and never repeating a mechanism twice
  running
- Reply capture through `getUpdates` polling on the existing schedule — no
  webhook, no server, no public endpoint
- Replies matched back to the card that prompted them
- 6:00 AM manual intake with a forgiving parse
- Rule-based morning coach with confidence tiers, so no statistic is claimed
  before the record supports it; every recommendation is drawn from a real
  fact's move

## Phase 1.5 — Content hardening · **CLOSED**

- ~~Citations for the 40 sleep facts~~ — dropped. Solo build, not needed.
- ~~More caffeine facts~~ — resolved differently. Seth does not drink coffee,
  so the 4 PM slot was repointed at the boundaries that actually apply to him:
  dinner timing, locking tonight's shutdown, and an occasional kombucha cutoff
  at 12:30 PM. Pool widened from 5 facts to 9; on-theme rate 67% → 93%.

---

## Phase 2 — Oura ingestion · **NEXT UP**

**Needs from Seth:** an Oura Personal Access Token.

- Oura API v2 client with bearer auth and 429 handling
- **Full historical backfill on day one.** The endpoints accept date ranges, so
  an entire year of history lands immediately rather than accumulating over
  months. This is what makes Phase 3 useful the day it ships instead of the
  following season.
- Daily pull at 11:00 AM local with exponential-backoff retry until the ring
  has synced
- Reconciliation against the manual log — the manual entry stays, because
  writing it down by hand is the behavioural point; Oura becomes the source of
  truth for the analytics

Note: Oura webhooks need a registered OAuth application and cannot be driven by
a Personal Access Token, so this is cron-only. The original spec already
designs that fallback.

## Phase 3 — Analytics · **AFTER PHASE 2**

- Rolling mean and standard deviation, z-scores, percentile ranks
- Trailing windows T7 / T30 / T90 / T180 / T365 with ticker deltas
- MSRI composite index with EWMA smoothing
- The morning coach upgrades from manual score to full biometric context

Three decisions still open before MSRI can be implemented properly:

1. `CDF_Percentile_Multiplier` is referenced in the spec but never defined.
2. The autonomic and architecture factors are unbounded above, so the index is
   not actually bounded 0–100 as claimed. Even with caps it currently pins near
   95 on an average night and cannot discriminate.
3. The EWMA has no seed value for the first night.

Also settled in passing: the coach already uses an **empirical** percentile
rank rather than a normal CDF, because sleep scores are bounded at 100 and
left-skewed. Phase 3 should keep that choice.

## Phase 4 — Live dashboard · **AFTER PHASE 3**

The preview at `web/dashboard.html` already exists and is wired to the live
engine. Making it real means pointing it at actual history instead of seeded
telemetry, then publishing to GitHub Pages — free, no server, rebuilt on every
workflow run.

The original spec called for Next.js, Supabase, auth and an onboarding wizard.
For a solo app that is a great deal of machinery for very little; a static page
reading the same JSON delivers the visible value at a fraction of the cost.
Revisit only if other people are going to sign up.

## Phase 5 — Deeper engagement · **LARGELY ALREADY BUILT**

Phase 1.6 delivered most of what this was going to be. What is left:

- Z-score-driven prompt routing (identity consolidation on strong nights,
  atomic micro-steps at baseline, attribution correction on poor ones) — needs
  Phase 3
- Weekly, monthly and quarterly milestone deep-dives
- Streak tracking and compounding visualisations

---

## Reliability work done alongside Phase 1

- Telegram calls retry with backoff and honour rate limits, so a network blip
  no longer costs a card
- State conflicts resolve in favour of the run that did the sending, so a lost
  push race cannot cause a duplicate delivery
- Inbound messages are acknowledged only after they are safely stored, so a
  failed write leaves the message queued rather than dropping it
- Journal and sleep log are AES-256-GCM encrypted per record; plaintext was
  scrubbed from git history before the repository went public
- `web/dashboard.html` is a build artifact, not tracked content — it embeds
  real journal text

## Recommended order

1. **Live with it for a week.** Which slots get acted on, whether the prompts
   stay interesting, whether a nine-day fact loop is too tight.
2. **Phase 2 + 3 together**, once there is an Oura token. Backfill makes them
   land as one useful thing rather than two half-features.
3. **Phase 4**, then the rest of Phase 5.

## Open questions

- Revoke and replace the bot token, which was pasted into a chat transcript.
  Housekeeping, not urgent.
- MSRI formula decisions (see Phase 3).
