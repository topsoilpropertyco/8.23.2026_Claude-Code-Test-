#!/usr/bin/env python3
"""Deal extract ledger. No network access by construction: this file can read
its own database and reason about what it holds. It cannot touch Gmail."""
import os, sys, json, sqlite3, argparse, re
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB   = os.path.join(ROOT, "data", "ledger", "deals.db")

LABELS = {
  "SWEEP07": "! SS To Do/0 - AI Sweep 2026-08/07 Storage and real estate",
  "ACQ":     "! SS To Do/3Z Real Estate/A Acquisition Team",
  "HOTLEAD": "! SS To Do/3Z Real Estate/A Acquisition Team/Hot Lead Alert",
  "SELFSTG": "! SS To Do/3Z Real Estate/B Self-Storage",
  "SANFORD": "! SS To Do/3Z Real Estate/B Self-Storage/Sanford Storage",
  "DEALSTP": "! SS To Do/3Z Real Estate/B Self-Storage/Self-Storage Deals To Process",
  "SOFTWRE": "! SS To Do/3Z Real Estate/B Self-Storage/Self-Storage Lead Sources/Software to Test",
}
EXPECTED = {"SWEEP07":190,"ACQ":182,"HOTLEAD":152,"SELFSTG":659,
            "SANFORD":530,"DEALSTP":153,"SOFTWRE":19}

SCHEMA = """
CREATE TABLE IF NOT EXISTS threads(
  thread_id TEXT PRIMARY KEY,
  labels TEXT,                -- pipe-joined scope keys this thread came from
  subject TEXT, senders TEXT, recipients TEXT,
  first_date TEXT, last_date TEXT, msg_count INTEGER,
  body_read INTEGER DEFAULT 0,       -- 1 once a full get_thread has happened
  has_attachments INTEGER DEFAULT 0,
  property_id TEXT,                  -- NULL until resolved
  no_property INTEGER DEFAULT 0,     -- 1 = thread genuinely contains no property
  thread_summary TEXT,
  confidence TEXT,                   -- high | medium | unsure
  notes TEXT,
  ingested_at TEXT, extracted_at TEXT
);
CREATE TABLE IF NOT EXISTS facts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL, msg_id TEXT,
  property_key TEXT,                 -- normalized address or provisional key
  field TEXT NOT NULL, value TEXT NOT NULL,
  evidence_quote TEXT NOT NULL,      -- verbatim source text. no quote, no fact.
  confidence TEXT NOT NULL,          -- stated | inferred | unsure
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS properties(
  property_id TEXT PRIMARY KEY,
  address_raw TEXT, address_norm TEXT, city TEXT, state TEXT, zip TEXT,
  property_name TEXT, property_type TEXT,
  ownership_status TEXT, ownership_evidence TEXT,
  deal_status TEXT,
  owner_name TEXT, owner_emails TEXT, owner_phones TEXT,
  broker_name TEXT, broker_contact TEXT,
  asking_price TEXT, offer_price TEXT, unit_count TEXT, sqft TEXT,
  noi TEXT, cap_rate TEXT, rent_roll TEXT, expense_ratio TEXT,
  first_contact TEXT, last_contact TEXT,
  thread_ids TEXT, thread_count INTEGER,
  links TEXT, attachments TEXT,
  property_notes TEXT,
  merge_confidence TEXT, review_flag TEXT
);
CREATE TABLE IF NOT EXISTS review_queue(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, detail TEXT, thread_ids TEXT, property_ids TEXT,
  resolved INTEGER DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, stage TEXT, msg TEXT
);
CREATE INDEX IF NOT EXISTS ix_facts_thread ON facts(thread_id);
CREATE INDEX IF NOT EXISTS ix_facts_prop   ON facts(property_key);
CREATE INDEX IF NOT EXISTS ix_threads_prop ON threads(property_id);
"""

def now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")
def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    c.executescript(SCHEMA); c.commit(); return c
def logit(c, stage, msg):
    c.execute("INSERT INTO log(ts,stage,msg) VALUES(?,?,?)", (now(), stage, msg)); c.commit()

def cmd_init(a):
    c = db(); logit(c, "init", "schema ready")
    print("ledger:", DB)
    for k,v in LABELS.items(): print("  %-8s %-4d %s" % (k, EXPECTED[k], v))

def cmd_enum(a):
    """Ingest thread ids from a TSV of: thread_id<TAB>scope_key[<TAB>subject...]"""
    c = db(); new = seen = 0
    for path in a.files:
        for line in open(path):
            line = line.rstrip("\n")
            if not line.strip(): continue
            parts = line.split("\t")
            tid, scope = parts[0].strip(), parts[1].strip()
            subj = parts[2].strip() if len(parts) > 2 else None
            r = c.execute("SELECT labels FROM threads WHERE thread_id=?", (tid,)).fetchone()
            if r:
                labs = set(filter(None, (r["labels"] or "").split("|")))
                if scope not in labs:
                    labs.add(scope)
                    c.execute("UPDATE threads SET labels=? WHERE thread_id=?",
                              ("|".join(sorted(labs)), tid))
                seen += 1
            else:
                c.execute("""INSERT INTO threads(thread_id,labels,subject,ingested_at)
                             VALUES(?,?,?,?)""", (tid, scope, subj, now())); new += 1
    c.commit(); logit(c, "enum", "new=%d dup=%d" % (new, seen))
    print("new threads: %d   already known: %d" % (new, seen))
    cmd_stats(a)

# --- read tiers -------------------------------------------------------------
# Every thread is opened. The tier decides HOW MUCH of it we read, and is set
# from evidence about the thread class, never to save effort on a deal thread.
#   T1-full     human deal correspondence -> full get_thread, extract facts
#   T2-subject  machine nudge whose ONLY payload is the subject line
#   T3-confirm  boilerplate with a verified-empty body (payload is an image or
#               an external dashboard link) -> open, confirm empty, log, move on
# A rule only fires on an exact subject shape. Anything unmatched stays T1.
TIER_RULES = [
  ("T3-confirm", r"^REVA (Start|End) of Day Report"),
  ("T3-confirm", r"^Storage Near Me Stanford Ads Report - "),
  ("T1-full",    r"^Hot Lead Alert$"),          # payload is the BODY, per message
]

def cmd_tier(a):
    c = db(); total = 0
    for tier, pat in TIER_RULES:
        rx = re.compile(pat)
        n = 0
        for r in c.execute("SELECT thread_id,subject FROM threads WHERE subject IS NOT NULL"):
            if rx.search(r["subject"] or ""):
                c.execute("UPDATE threads SET read_tier=? WHERE thread_id=?", (tier, r["thread_id"]))
                n += 1
        print("%-11s %-42s %4d" % (tier, pat, n)); total += n
    c.commit(); logit(c, "tier", "assigned=%d" % total)
    print("\nby tier:")
    for r in c.execute("""SELECT COALESCE(read_tier,'(unassigned -> T1 default)') t, COUNT(*) n
                          FROM threads GROUP BY 1 ORDER BY n DESC"""):
        print("  %-30s %4d" % (r["t"], r["n"]))

def cmd_stats(a):
    c = db()
    tot = c.execute("SELECT COUNT(*) n FROM threads").fetchone()["n"]
    print("\nunique threads: %d" % tot)
    print("read in full  : %d" % c.execute("SELECT COUNT(*) n FROM threads WHERE body_read=1").fetchone()["n"])
    print("facts recorded: %d" % c.execute("SELECT COUNT(*) n FROM facts").fetchone()["n"])
    print("properties    : %d" % c.execute("SELECT COUNT(*) n FROM properties").fetchone()["n"])
    print("\nper label (a thread can carry several):")
    for k in LABELS:
        n = c.execute("SELECT COUNT(*) n FROM threads WHERE labels LIKE ?", ("%"+k+"%",)).fetchone()["n"]
        exp = EXPECTED[k]
        flag = "" if n == exp else "   <-- expected %d" % exp
        print("  %-8s %4d%s" % (k, n, flag))
    print("\noverlap: %d label-memberships across %d threads" % (
        sum(len((r["labels"] or "").split("|")) for r in c.execute("SELECT labels FROM threads")), tot))

def cmd_pending(a):
    c = db()
    rows = c.execute("""SELECT thread_id,labels,subject FROM threads
                        WHERE body_read=0 ORDER BY thread_id LIMIT ?""", (a.limit,)).fetchall()
    for r in rows: print("%s\t%s\t%s" % (r["thread_id"], r["labels"], (r["subject"] or "")[:70]))
    print("-- %d shown, %d unread remain" % (len(rows),
        c.execute("SELECT COUNT(*) n FROM threads WHERE body_read=0").fetchone()["n"]))

def main():
    ap = argparse.ArgumentParser(prog="deals")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("init");  s.set_defaults(f=cmd_init)
    s = sub.add_parser("enum");  s.add_argument("files", nargs="+"); s.set_defaults(f=cmd_enum)
    s = sub.add_parser("tier");  s.set_defaults(f=cmd_tier)
    s = sub.add_parser("stats"); s.set_defaults(f=cmd_stats)
    s = sub.add_parser("pending"); s.add_argument("--limit", type=int, default=40); s.set_defaults(f=cmd_pending)
    a = ap.parse_args(); a.f(a)

if __name__ == "__main__": main()
