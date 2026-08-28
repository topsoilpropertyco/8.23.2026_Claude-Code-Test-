# PRIME DIRECTIVES (inbox sweep 2026-08)

These survive context compaction. Re-read before any Gmail write.

1. NEVER send. `send_message`, `reply`, `forward` SEND IMMEDIATELY. They are
   never correct in this project. Outbound writing happens only via
   `create_draft`.
2. NEVER trash, delete, or mark spam. Not a message, not a thread, not a label.
   `trash_*`, `apply_sensitive_*`, `mark_*_spam`, `delete_label` are forbidden.
3. NEVER remove a label. `unlabel_thread` / `unlabel_message` /
   `update_message_labels` with `removeLabelIds` are forbidden. Adding only.
4. NEVER touch a pre-existing draft. 553 drafts predate this run. Only drafts
   whose IDs are recorded in the ledger `drafts` table are ours.
5. Archiving (removing INBOX) happens ONLY on Seth's explicit per-class
   approval, and it is the ONLY exception to rule 3.
6. Ambiguous? Mark UNSURE or FENCE and move on. Never force a call to keep a
   count tidy.
7. No email content is ever committed to git. See .gitignore.

## State lives on disk, not in the transcript
`inbox-sweep/data/ledger/sweep.db` is the single source of truth. Query it with
`bin/sweep.py`. Never rebuild state from memory; re-read the ledger.

## Verified session facts (2026-08-28)
- Account: s.saeugling@gmail.com (confirmed via in:sent sender). 553 drafts.
- `label:` on this MCP server takes the Gmail-normalized DISPLAY NAME with
  spaces as hyphens, NOT the label ID. `label:Label_118` returns {}.
  `&` in a label name breaks the operator entirely and cannot be escaped.
- TO_ANSWER = `label:!-SS-To-Do/1---To-Answer-and-Do` = Label_2586574970074772607
  (Seth renamed "&" to "and" on 2026-08-28 to unblock this.)
- TO_READ = `label:!-SS-To-Do/2---To-Read` = Label_3387007617100381248
- `label:parent` does NOT match sublabels. Scope is the two parent labels exactly.
- `search_threads` previews only the ~5 OLDEST messages per thread. A preview of
  >=5 messages is truncated; the newest message is unseen. Those threads need
  `get_thread` before any judgment about who spoke last.
