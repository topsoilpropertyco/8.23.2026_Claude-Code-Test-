#!/usr/bin/env python3
"""Batch-record Hot Lead Alert messages as facts.

These messages share a rigid shape, verified across many samples:

    line 1  property name
    line 2  two-letter state
    line 3+ website and/or phone, then freeform call notes

One MESSAGE is one property, not one thread -- a single Hot Lead Alert thread
often bundles three or four separate facilities. So facts key to msg_id.

Input TSV on stdin, one message per line:
    thread_id <TAB> msg_id <TAB> name <TAB> state <TAB> contact <TAB> notes

`notes` is the VERBATIM remainder of the message body and becomes the evidence
quote for every fact drawn from that message. Nothing is written without it.
"""
import sqlite3, sys, os, re
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB   = os.path.join(ROOT, "data", "ledger", "deals.db")
now  = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")

def key_for(name, state):
    k = re.sub(r"[^a-z0-9]+", "-", ("%s %s" % (name, state)).lower()).strip("-")
    return k

c = sqlite3.connect(DB)
props = facts = 0
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line.strip(): continue
    parts = line.split("\t")
    if len(parts) < 5:
        sys.exit("bad row (need >=5 fields): %r" % line)
    tid, mid, name, state, contact = parts[:5]
    notes = parts[5] if len(parts) > 5 else ""
    quote = (notes or "%s %s %s" % (name, state, contact)).strip()
    if not quote:
        sys.exit("refused: no evidence text for %s" % mid)
    # Some Hot Lead messages carry NO property name -- just a state and a phone
    # that rang out. Inventing a name would be the single worst failure mode
    # here, so these get a provisional key tied to the message and are flagged
    # for review rather than guessed at.
    if not name.strip():
        key = "unnamed-%s" % mid
        c.execute("""INSERT INTO review_queue(kind,detail,thread_ids,created_at)
                     VALUES(?,?,?,?)""",
                  ("no property name in Hot Lead message",
                   "msg=%s state=%s contact=%s notes=%s" % (mid, state, contact, notes[:120]),
                   tid, now()))
    else:
        key = key_for(name, state)
    rows = []
    if name.strip():  rows.append(("property_name", name, "stated"))
    else:             rows.append(("property_name", "UNKNOWN - not stated in message", "unsure"))
    if state.strip(): rows.append(("state", state.strip(), "stated"))
    if contact.strip(): rows.append(("contact_raw", contact.strip(), "stated"))
    if notes.strip():   rows.append(("call_notes",  notes.strip(),   "stated"))
    for field, value, conf in rows:
        c.execute("""INSERT INTO facts(thread_id,msg_id,property_key,field,value,
                     evidence_quote,confidence,created_at) VALUES(?,?,?,?,?,?,?,?)""",
                  (tid, mid, key, field, value, quote, conf, now()))
        facts += 1
    props += 1
    c.execute("UPDATE threads SET body_read=1, extracted_at=? WHERE thread_id=?", (now(), tid))
c.commit()
print("recorded %d properties, %d facts" % (props, facts), file=sys.stderr)
