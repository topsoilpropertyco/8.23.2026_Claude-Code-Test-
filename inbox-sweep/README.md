# Inbox Sweep, August 2026

Post-parental-leave backlog sweep over two Gmail triage labels. Turns a wall of
mail into a reviewable queue without sending, deleting, or losing anything.

## Why it is built this way

A 1,229-thread job cannot live in a chat transcript. Context gets compacted and
the state is gone. So all state lives in `data/ledger/sweep.db` and every stage
is idempotent: re-running skips work already recorded. The agent makes the Gmail
calls; this code owns the bookkeeping and the judgement rules.

## Layout

    bin/sweep.py    ledger, rules classifier, reports, draft linter
    bin/grab.sh     ingest a persisted MCP tool-result as raw JSON
    data/raw/       raw or compact search_threads dumps        (git-ignored)
    data/ledger/    sweep.db, the single source of truth       (git-ignored)
    CLAUDE.md       prime directives, survives compaction

Everything derived from the mailbox is git-ignored. This repo has a GitHub
remote; email content never goes near it.

## Commands

    python3 bin/sweep.py ingest data/raw/*.json   # .json raw, .jsonl compact
    python3 bin/sweep.py classify                 # rules only, never overwrites
                                                  # a call recorded by the agent
    python3 bin/sweep.py stats
    python3 bin/sweep.py fire                     # -> FIRE-REPORT.md
    python3 bin/sweep.py pending NEEDS_READ --limit 25
    python3 bin/sweep.py set <tid> --cls REPLY --reason "..."
    python3 bin/sweep.py senders --scope TO_READ  # unsubscribe hit list
    python3 bin/sweep.py lint drafts/*.txt        # banned characters
    python3 bin/sweep.py recon --answer 711 --read 518

## Classes

Rules assign only what they can defend; everything else becomes `NEEDS_READ`
and waits for a human-grade read. Conservative by design: a thread wrongly
left for review costs a minute, a thread wrongly marked dead costs a
relationship.

| class | meaning |
|---|---|
| `SELF-NOTE` | Seth mailed himself a link or an idea. A reading list, not mail. |
| `ACTION` | No reply expected, but he must do something. A form, a signature, an expiring credit. |
| `STORAGE` | Storage / real-estate pipeline. Routed out; handled on its own track. |
| `REPLY` / `ACK` | Needs a substantive answer / needs a one-liner. |
| `DELEGATE` | Belongs to Vichi, Jessabelle, or Mario. |
| `FENCE` | Judged not to need a reply, but close enough that Seth should skim it. |
| `DEAD` | Resolved, expired, or automated with nothing owed. |
| `READ-*` | To Read clusters: promo, receipt, notification, substantive. |

## Notes on this Gmail MCP server

- `label:` takes the Gmail-normalised **display name** (spaces to hyphens), not
  the label ID, despite what the tool description says. `label:Label_118`
  silently returns zero results.
- `&` anywhere in a label name breaks the operator and cannot be escaped. The
  `1 - To Answer & Do` label was renamed to `and` to make it addressable; the
  label ID and every message assignment survived the rename.
- `label:parent` does not match sublabels.
- `search_threads` previews only the ~5 **oldest** messages of a thread with no
  truncation marker, so "who spoke last" is unreliable on long threads. Those
  are flagged `preview_truncated` and need `get_thread` before judgement.
