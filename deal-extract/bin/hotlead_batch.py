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

# Contact details are buried in prose: "best to reach him is thru email
# thomas@p27inc.com", "(423) 483-8330 spoke with Mark". Seth asked for owner
# emails and phones as DATA, so they are lifted into their own fields. The
# evidence quote stays the full message body, so the extraction is checkable.
# The trailing [\w.]+ must not end on a dot: "email him at x@yahoo.com." would
# otherwise capture the sentence-ending period and yield an address that fails
# validation on CRM import.
EMAIL_RX = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# The domain is spelled as repeated dot-then-label rather than a loose [\w.]* run:
# a note that reads "ghgfour@hotmail.com.....willing to sell" otherwise swallows the
# ellipsis and the next word, and the CRM gets an address that will never deliver.
PHONE_RX = re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")

def key_for(name, state):
    # Apostrophes are DELETED, not treated as separators: "Taylor's Mini Storage"
    # must key as taylors-mini-storage, never taylor-s-mini-storage, or a second
    # pass that spells the name without the apostrophe opens a duplicate row for
    # a property already in the ledger. Ampersands DO separate -- "G & S" is two
    # initials -- so they stay in the generic run below.
    n = ("%s %s" % (name, state)).lower().replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9]+", "-", n).strip("-")

c = sqlite3.connect(DB)
props = facts = 0
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line.strip(): continue
    parts = line.split("\t")
    if len(parts) < 5:
        sys.exit("bad row (need >=5 fields): %r" % line)
    tid, mid, name, state, contact = parts[:5]
    notes   = parts[5] if len(parts) > 5 else ""
    address = parts[6] if len(parts) > 6 else ""
    # Asking price is NOT auto-extracted. Prose mixes asking prices with rents
    # ("$800 a month"), monthly revenue and per-unit rates, and a regex cannot
    # tell them apart. It is filled only where a human read states it plainly.
    asking  = parts[7] if len(parts) > 7 else ""
    # Free-form extras as field=value;field=value. Keeps NOI, property tax,
    # occupancy, unit counts and broker details as their own fields without
    # adding a column per concept. Same rule applies: the evidence quote is the
    # whole message, so each value can be checked against its sentence.
    extras  = parts[8] if len(parts) > 8 else ""
    # The evidence quote must be able to stand alone. Falling back to just the
    # state would store "NC" as the proof for an entire property row.
    quote = (notes or " ".join(x for x in (address, name, state, contact) if x.strip())).strip()
    if not quote:
        sys.exit("refused: no evidence text for %s" % mid)
    # Some Hot Lead messages carry NO property name -- just a state and a phone
    # that rang out. Inventing a name would be the single worst failure mode
    # here, so these get a provisional key tied to the message and are flagged
    # for review rather than guessed at.
    if not name.strip() and address.strip():
        key = key_for(address, "")
    elif not name.strip():
        key = "unnamed-%s" % mid
        if not address.strip(): c.execute("""INSERT INTO review_queue(kind,detail,thread_ids,created_at)
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
    if address.strip(): rows.append(("address_raw", address.strip(), "stated"))
    if asking.strip():  rows.append(("asking_price", asking.strip(), "stated"))
    if contact.strip(): rows.append(("contact_raw", contact.strip(), "stated"))
    if notes.strip():   rows.append(("call_notes",  notes.strip(),   "stated"))
    blob = " ".join((contact, notes))
    for em in dict.fromkeys(EMAIL_RX.findall(blob)):
        rows.append(("owner_email", em, "stated"))
    for ph in dict.fromkeys(PHONE_RX.findall(blob)):
        rows.append(("owner_phone", ph.strip(), "stated"))
    for pair in extras.split(";"):
        if "=" in pair:
            f, _, v = pair.partition("=")
            if f.strip() and v.strip(): rows.append((f.strip(), v.strip(), "stated"))
    for field, value, conf in rows:
        c.execute("""INSERT INTO facts(thread_id,msg_id,property_key,field,value,
                     evidence_quote,confidence,created_at) VALUES(?,?,?,?,?,?,?,?)""",
                  (tid, mid, key, field, value, quote, conf, now()))
        facts += 1
    props += 1
    c.execute("UPDATE threads SET body_read=1, extracted_at=? WHERE thread_id=?", (now(), tid))
c.commit()
print("recorded %d properties, %d facts" % (props, facts), file=sys.stderr)
