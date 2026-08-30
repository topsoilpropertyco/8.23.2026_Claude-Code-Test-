#!/usr/bin/env python3
"""Pivot the fact ledger into one row per property.

The ledger stores facts, not rows: many facts per property, each with its own
evidence quote and message id. A CRM wants the opposite shape -- one line per
property with everything about it on that line. This does that pivot without
losing anything:

  * a field seen more than once keeps EVERY value, joined with " | ", newest
    last. Two different asking prices are a fact about the deal, not a
    conflict to silently resolve.
  * ALL_CAPS field names are curator flags (PORTFOLIO, ALIAS, ADDRESS_CONFLICT,
    NOT_A_LEAD ...) rather than data. They are collected into `flags` so a row
    that needs human eyes says so on the row itself.
  * `status` marks rows that are NOT acquisition targets -- the facility Seth
    already owns, wrong numbers, businesses that turned out not to be storage --
    so they can be filtered out without being deleted.
  * every row carries its source thread and message ids, so any cell can be
    traced back to the mail it came from.
"""
import os, sys, csv, sqlite3, re
from collections import OrderedDict, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB   = os.path.join(HERE, "data", "ledger", "deals.db")

# Column order is deliberate: identity, then money, then contact, then the
# physical asset, then the softer intelligence, then provenance last.
COLUMNS = [
    "property_name", "address_raw", "state", "website",
    "asking_price", "price_indication", "appraised_value",
    "revenue_current", "revenue_at_new_rates", "revenue_at_full",
    "owner_name", "owner_phone", "owner_phone_best", "owner_email",
    "contact_name", "contact_phone", "contact_email", "contact_note",
    "broker_name", "broker_phone", "broker_email", "broker_note",
    "unit_count", "unit_mix", "sqft", "acreage", "buildings", "occupancy",
    "climate", "rent_card", "rent_range", "rent_note", "expansion",
    "seller_motivation", "deal_status", "deal_terms", "lead_status",
    "next_step", "data_gap", "performance", "location_note", "operating_since",
    "age", "entity", "operating_company", "ownership", "ownership_change",
    "ownership_status", "analysis_link", "attachment", "call_notes",
]
IS_FLAG = re.compile(r"^[A-Z][A-Z0-9_]*$")
NOT_A_TARGET = ("NOT_A_PROPERTY", "NOT_A_LEAD")

def main():
    out_csv = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "data", "out", "properties.csv")
    os.makedirs(os.path.dirname(out_csv), exist_ok=True)
    c = sqlite3.connect(DB)

    props = OrderedDict()
    for key, mid, tid, field, value, conf in c.execute(
            """SELECT property_key, msg_id, thread_id, field, value, confidence
               FROM facts ORDER BY property_key, id"""):
        p = props.setdefault(key, {"vals": defaultdict(list), "flags": [],
                                   "threads": OrderedDict(), "msgs": OrderedDict(),
                                   "unsure": 0, "n": 0})
        p["n"] += 1
        p["threads"][tid] = 1
        p["msgs"][mid] = 1
        if conf in ("unsure", "inferred"):
            p["unsure"] += 1
        if IS_FLAG.match(field):
            p["flags"].append("%s: %s" % (field, value))
        else:
            if value not in p["vals"][field]:
                p["vals"][field].append(value)

    extra = sorted({f for p in props.values() for f in p["vals"]} - set(COLUMNS))
    header = (["property_key", "status", "flags"] + COLUMNS + extra +
              ["fact_count", "soft_fact_count", "source_threads", "source_msgs"])

    n_target = 0
    with open(out_csv, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        for key, p in sorted(props.items()):
            flags = " || ".join(p["flags"])
            status = "not-a-target" if any(f.startswith(NOT_A_TARGET) for f in p["flags"]) else "target"
            if status == "target":
                n_target += 1
            row = [key, status, flags]
            for col in COLUMNS + extra:
                row.append(" | ".join(p["vals"].get(col, [])))
            # cross_label_link facts point at another THREAD and carry no msg_id;
            # drop the blanks rather than let one None break the whole export.
            th = " ".join(x for x in p["threads"] if x)
            ms = " ".join(x for x in p["msgs"] if x)
            row += [p["n"], p["unsure"], th, ms]
            w.writerow(row)

    print("wrote %s" % out_csv)
    print("  properties      : %d  (%d targets, %d not-a-target)"
          % (len(props), n_target, len(props) - n_target))
    print("  columns         : %d  (%d beyond the curated set)" % (len(header), len(extra)))
    print("  rows with flags : %d" % sum(1 for p in props.values() if p["flags"]))

if __name__ == "__main__":
    main()
