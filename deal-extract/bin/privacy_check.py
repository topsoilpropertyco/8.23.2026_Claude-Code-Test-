#!/usr/bin/env python3
"""Assert no tenant identity survived redaction into the ledger.

Written after a first version of this check reported 14 false positives: it
flagged "[tenant] rented Unit 61" because "Unit" is capitalised and followed the
verb. A privacy check that cries wolf is worse than none -- it trains you to
wave the output through. So structural words are excluded explicitly, and the
script exits nonzero on a real hit so it can gate a commit.
"""
import sqlite3, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB   = os.path.join(ROOT, "data", "ledger", "deals.db")

# Words that legitimately follow a tenant verb and are NOT identities.
STRUCTURAL = {"Unit","All","Invoice","Notifications","Storage","The","Your",
              "New","Payment","SpareFoot","Late","Failed","Lien"}
LEAK = re.compile(r"(?:rented|Payment failed for|contact from|Incoming Call -"
                  r"|Incoming call -|failed to send to|Reply to)\s+([A-Z][a-z]+)")

def main():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    rows = c.execute("SELECT thread_id,labels,subject FROM threads "
                     "WHERE subject IS NOT NULL").fetchall()
    hits = []
    for r in rows:
        for m in LEAK.finditer(r["subject"]):
            if m.group(1) not in STRUCTURAL:
                hits.append((r["thread_id"], r["labels"], r["subject"])); break
    print("subjects checked    : %d" % len(rows))
    print("residual identities : %d" % len(hits))
    for t, l, s in hits[:20]:
        print("   %s  [%s]  %s" % (t, l, s[:90]))
    return 1 if hits else 0

if __name__ == "__main__":
    sys.exit(main())
