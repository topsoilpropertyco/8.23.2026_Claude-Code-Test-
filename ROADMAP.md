# Sleep OS — Build Roadmap

Last updated: 2026-08-23

---

## Where we are right now

**Phase 1 is built, tested, and pushed. It is not yet running on its own.**

Everything works — the bot is live, four cards have been delivered to Telegram
successfully, 18 tests pass. The single thing standing between "built" and
"running" is two repository secrets that have not been added yet. Until they
are, the engine only fires when triggered by hand from a session.

| | |
|---|---|
| Repo | `topsoilpropertyco/8.23.2026_Claude-Code-Test-` |
| Branch | `claude/first-app-build-3wp3ge` |
| Bot | `@SleepOSMissionTopOnePercent_Bot` |
| Chat | `8760828708` (Salus) |
| Timezone | `America/Detroit` |
| Library | 55 facts — 40 sleep science, 15 lucid |

---

## The five phases

### Phase 1 — Reminder engine · **BUILT, NOT LIVE**

The core product. Six cadenced nudges a day pulled from the fact library and
delivered to Telegram.

Done:
- 55 facts captured verbatim, five-field card structure preserved
- Rotation that cycles the whole pool before repeating (~9.2 days at 6/day)
- Slot affinity (~92% on-theme), jackpot drops on ~1 in 7 sends
- Gaussian jitter to ±20 min, deterministic per day
- DST-safe wall-clock scheduling
- CLI: `today`, `preview`, `dispatch`, `send`, `whoami`, `stats`
- GitHub Actions workflow polling every 10 minutes
- 18 tests, zero runtime dependencies

Remaining:
- [ ] Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to repo secrets
- [ ] Decide public vs private repo (Actions minutes)
- [ ] Confirm phone notifications actually surface
- [ ] Revoke and replace the bot token (it was pasted into a chat transcript)

### Phase 1.5 — Content hardening · **NOT STARTED**

Cheap, high-value, no new infrastructure.

- [ ] Add 3–4 caffeine/adenosine facts — `afternoon_boundary` has only 5 tagged
      facts, so it runs off-theme a third of the time versus ~100% elsewhere
- [ ] Add citations to the 40 sleep science facts (the `[cite: ]` placeholders
      came through empty; the lucid library does have sources)
- [ ] Optional: tighten the reframe voice toward the punchier example
      ("60 extra minutes in bed eliminates nearly 40% of your daily stress
      load") rather than the longer "Imagine a pharmaceutical company..." form

### Phase 2 — Oura ingestion · **NOT STARTED**

Needs: an Oura Personal Access Token.

- [ ] Oura API v2 client with bearer auth and 429 handling
- [ ] **Full historical backfill on day one** — the endpoints accept date
      ranges, so an entire year of history lands immediately instead of waiting
      months to accumulate. This is what makes Phase 3 useful straight away.
- [ ] Daily pull at 11:00 AM local with exponential-backoff retry until the
      ring has synced
- [ ] Telemetry storage alongside the existing state files

Note: Oura webhooks require a registered OAuth application; a Personal Access
Token cannot subscribe to them. Plan is cron-only, which the original spec
already designs a fallback for.

### Phase 3 — Analytics · **NOT STARTED**

Depends on Phase 2. All pure computation, no new dependencies.

- [ ] Rolling 90-day mean and standard deviation
- [ ] Z-scores and percentile ranks
- [ ] Trailing windows: T7, T30, T90, T180, T365
- [ ] Ticker deltas with direction and colour
- [ ] MSRI composite signal index with EWMA smoothing
- [ ] Morning brief delivered to Telegram

Three decisions needed before MSRI can be implemented, all flagged earlier:
`CDF_Percentile_Multiplier` is referenced but never defined; the autonomic and
architecture factors are unbounded above so the index is not actually bounded
0–100 as specified; and the EWMA has no seed value for the first night.

Also worth revisiting: sleep scores are bounded at 100 and left-skewed, so a
normal-distribution CDF will distort percentiles at the top end. An empirical
percentile rank against actual history is simpler and more honest.

### Phase 4 — Public surface · **NOT STARTED**

Two possible shapes, and the cheaper one may be the right one:

**Option A (cheap).** A static site on GitHub Pages reading the same fact JSON.
Landing page, Science Vault with category filters, the brand palette. No
database, no auth, no hosting cost. Days of work, not weeks.

**Option B (full).** Next.js + Supabase + auth + onboarding wizard + multi-user
dashboards, per the original super prompts. Only worth it if other people are
actually going to sign up.

Given this is a solo build and a free public good, Option A delivers most of the
visible value for a fraction of the work. Revisit when Phases 1–3 are proven.

### Phase 5 — Behavioural engagement · **NOT STARTED**

The identity-based micro-journaling layer. Telegram inline keyboards make this
genuinely cheap — tap a habit, complete a sentence stem, log a reflection, all
inside the notification. No app, no web page.

Depends on Phase 3 for the Z-score-driven prompt routing (identity
consolidation when high, atomic micro-steps at baseline, attribution correction
when low).

---

## Recommended order

1. **Set the two secrets.** Two minutes. Nothing else is worth doing until the
   engine actually interrupts you at 9 PM unprompted, because that is the whole
   thesis.
2. **Live for a week.** Learn which slots you act on and which you ignore.
3. **Phase 1.5** in parallel — content work needs no infrastructure.
4. **Phase 2 + 3 together.** Backfill makes them land as one useful thing
   rather than two half-features.
5. **Phase 4 and 5** once the daily loop is proven.

---

## Open questions

- Public or private repo?
- Voice pass on the fact library — punchier reframes, or leave as authored?
- MSRI formula decisions (see Phase 3)
- Phase 4: static Science Vault, or the full Next.js application?
