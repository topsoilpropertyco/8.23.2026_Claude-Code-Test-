#!/usr/bin/env python3
"""Re-apply the CURRENT redaction rules to every subject already in the ledger.

Redaction runs at ingest, which means a row ingested before a pattern was fixed
keeps the old, unredacted text forever. That is exactly what happened: "rented
Unit \\d+" did not match "Unit P2", so two tenant names sat in the database until
the privacy check's review list surfaced them.

Fixing a pattern is therefore only half the job. This makes the fix retroactive,
so redaction improvements apply to the whole corpus rather than only to whatever
is ingested next.
"""
import sqlite3, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harvest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB   = os.path.join(ROOT, "data", "ledger", "deals.db")

c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
rows = c.execute("SELECT thread_id,subject FROM threads WHERE subject IS NOT NULL").fetchall()
changed = 0
for r in rows:
    new = harvest.redact(r["subject"])
    if new != r["subject"]:
        c.execute("UPDATE threads SET subject=? WHERE thread_id=?", (new, r["thread_id"]))
        print("  %s\n    was: %s\n    now: %s" % (r["thread_id"], r["subject"][:88], new[:88]))
        changed += 1
c.commit()
print("re-redacted %d of %d subjects" % (changed, len(rows)))
