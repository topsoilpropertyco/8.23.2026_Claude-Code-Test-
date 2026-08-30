#!/usr/bin/env python3
"""Batch fact writer for threads that do NOT follow the Hot Lead shape.

Reads TSV on stdin, one fact per line:

    thread_id <TAB> msg_id <TAB> property_key <TAB> field <TAB> value <TAB> quote [<TAB> confidence]

Rules enforced here rather than trusted to the caller:
  * a fact with an empty evidence quote is refused -- the whole ledger rests
    on being able to point at the sentence a value came from;
  * the quote must be verbatim, so it is stored untouched;
  * every thread named on stdin is marked body_read, because a fact can only
    come from a message that was actually opened;
  * property_key must already look normalized (lowercase, hyphens), which
    catches the copy-paste of a display name into the key column.
  * nothing is committed unless every row passes -- a half-written batch is
    worse than none, because the missing half is invisible.
"""
import os, sys, sqlite3, re
from datetime import datetime, timezone

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                  "data", "ledger", "deals.db")
KEY_OK = re.compile(r"^[a-z0-9][a-z0-9-]*$")
now = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")

def main():
    rows, threads, errs = [], set(), []
    for n, line in enumerate(sys.stdin, 1):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        p = line.split("\t")
        if len(p) < 6:
            errs.append("line %d: need 6 columns, got %d" % (n, len(p))); continue
        tid, mid, key, field, value, quote = (x.strip() for x in p[:6])
        conf = p[6].strip() if len(p) > 6 and p[6].strip() else "stated"
        if not quote:
            errs.append("line %d: no evidence quote for %s.%s" % (n, key, field)); continue
        if not value:
            errs.append("line %d: empty value for %s.%s" % (n, key, field)); continue
        if not KEY_OK.match(key):
            errs.append("line %d: property_key %r is not normalized" % (n, key)); continue
        rows.append((tid, mid, key, field, value, quote, conf, now()))
        threads.add(tid)
    if errs:
        sys.exit("refused, nothing written:\n  " + "\n  ".join(errs))
    if not rows:
        sys.exit("nothing on stdin")

    c = sqlite3.connect(DB)
    known = {r[0] for r in c.execute("SELECT thread_id FROM threads")}
    missing = sorted(threads - known)
    if missing:
        sys.exit("refused: thread(s) not in the enumeration: %s" % ", ".join(missing))
    c.executemany("""INSERT INTO facts(thread_id,msg_id,property_key,field,value,
                     evidence_quote,confidence,created_at) VALUES(?,?,?,?,?,?,?,?)""", rows)
    c.executemany("UPDATE threads SET body_read=1, extracted_at=? WHERE thread_id=?",
                  [(now(), t) for t in sorted(threads)])
    c.execute("INSERT INTO log(ts,stage,msg) VALUES(?,?,?)",
              (now(), "factbatch", "%d facts over %d threads" % (len(rows), len(threads))))
    c.commit()
    print("wrote %d facts across %d threads, %d properties"
          % (len(rows), len(threads), len({r[2] for r in rows})))

if __name__ == "__main__":
    main()
