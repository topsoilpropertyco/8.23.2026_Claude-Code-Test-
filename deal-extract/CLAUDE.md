# DEAL EXTRACT — house rules (2026-08)

Read before any Gmail call. These survive context compaction.

## What this project is
Read every thread in 7 real-estate labels, extract every fact about every
property, and produce one spreadsheet: one row per property, CRM-importable.

## Hard rules
1. READ ONLY. This project never labels, never drafts, never sends, never
   trashes. The only Gmail calls allowed are `search_threads`, `get_thread`,
   `get_message`, `list_labels`.
2. NEVER invent a fact. Every value written to `facts` carries `evidence_quote`,
   the verbatim text it came from, and the `msg_id` it came from. A value with
   no quote is not a value.
3. `search_threads` previews only the ~5 OLDEST messages of a thread and gives
   NO truncation marker. Never extract from a search preview. Every thread gets
   a full `get_thread` with messageFormat PLAIN_TEXT before any fact is written.
4. Ambiguous is a legal answer. Write confidence='unsure' and add to
   review_queue. Never force a value to make a row look complete.
5. State lives in data/ledger/deals.db, never in the transcript. Re-read the
   ledger after any compaction. Never rebuild state from memory.
6. Verify against Gmail, not against the tracker. The tracker lied once on a
   previous project; counts get reconciled against `list_labels`.
7. No email content is committed to git. data/ is ignored.

## Ownership rule
A partner's name is a FLAG, not a verdict. The people Seth owns property with
are listed in config/identity.py (git-ignored) as CO_OWNERS. READ THAT FILE
FIRST. At least one of them is also his partner on live acquisition targets, so
filtering on a name would delete real deals.

ownership_status = 'owned' ONLY on evidence: a closing, deed, rent roll,
property tax, insurance policy, tenant or repair mail. Otherwise 'target'.
Record the evidence in ownership_evidence. config/identity.py also carries
KNOWN_OWNED as a seed list; it is a hint to check, never a substitute for
evidence found in the thread.

## Gmail connector facts (learned the hard way)
- `label:` takes the Gmail-normalized DISPLAY NAME, spaces as hyphens, NOT the
  label ID. `label:Label_163` returns {}.
- An `&` in a label name breaks the operator entirely and cannot be escaped.
- `label:parent` does NOT match sublabels. Each sublabel must be queried.
- `resultCountEstimate` caps at 201. Never trust it as a total.
- Responses over ~50KB persist to a file instead of the transcript. That is
  free context. Prefer it for bulk reads.
- For a single-message thread, msg_id == thread_id.

## Scope — 7 labels
! SS To Do/0 - AI Sweep 2026-08/07 Storage and real estate      190
! SS To Do/3Z Real Estate/A Acquisition Team                    182
! SS To Do/3Z Real Estate/A Acquisition Team/Hot Lead Alert     152
! SS To Do/3Z Real Estate/B Self-Storage                        659
! SS To Do/3Z Real Estate/B Self-Storage/Sanford Storage        530
! SS To Do/3Z Real Estate/B Self-Storage/Self-Storage Deals To Process  153
! SS To Do/3Z Real Estate/B Self-Storage/Self-Storage Lead Sources/Software to Test  19
Threads carry several of these. Dedupe by thread_id.
