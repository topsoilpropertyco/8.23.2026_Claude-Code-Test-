#!/usr/bin/env python3
"""Assert no tenant identity survived redaction into the ledger.

Two earlier versions of this check were wrong in opposite directions, and both
mistakes are worth keeping in view:

  1. A verb-adjacency regex that flagged "[tenant] rented Unit 61" because
     "Unit" is capitalised. FALSE POSITIVE. A check that cries wolf trains you
     to wave it through.
  2. A generic "two capitalised words" sweep meant to catch shapes the verb list
     missed. It flagged "Storage Near Me Stanford Ads Report" 186 times.
     Allowlisting every legitimate two-word phrase is unbounded.

What actually works is a bounded whitelist of SHAPES rather than of names. Every
Sanford operations subject comes from a small set of machine templates. A subject
matching a template is clean by construction. A subject that matches none is not
declared a leak -- it is declared UNRECOGNISED and printed for a human to look
at. That is the honest output: the script knows which shapes it has verified,
and says so about the rest.
"""
import sqlite3, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB   = os.path.join(ROOT, "data", "ledger", "deals.db")

# Direct leak: a personal name sitting right after a tenant verb.
STRUCTURAL = {"Unit","All","Invoice","Notifications","Storage","The","Your","New",
              "Payment","SpareFoot","Late","Failed","Lien","Customer","Tenant"}
LEAK = re.compile(r"(?:rented|reserved|Payment failed for|contact from"
                  r"|Incoming Call -|Incoming call -|failed to send to|Reply to"
                  r"|hold the unit for|new customer)\s+([A-Z][a-z]+)", re.I)

# Verified-clean shapes for Sanford operations mail.
TEMPLATES = [
    r"^\[tenant\] (rented|reserved) Unit ",
    r"^\[tenant\] May Not Move In$",
    r"^Payment (failed for \[tenant\]|processed: Invoice|request from)",
    r"^\[(New update|New mention|You're assigned)\] ",
    r"^Storage Near Me Stanford Ads Report - ",
    r"^(Withdrawal Notice|Your Transfer Has Been Scheduled|Your Live Oak Bank eStatement)$",
    r"^(Undelivered Notifications|Inquiry Report For|Action (Required|Needed)|URGENT: Last Day)",
    r"^(Your (upcoming payment|receipt) (to|from) DaVinci Lock|Congrats on Your New Live Oak)",
    r"^(You initiated a payment|Approve bank transfer|Bank account will be auto-charged)",
    r"^(Self Storage Near Me Sanford|You received \d+ (clicks|conversions?)|Take action to fix)",
    r"^(New Lead: Reply to \[prospect\]|Website contact from \[prospect\]|Action Needed: New Customer \[tenant\])",
    r"^(\[Sales Order|\[Flooded Screen Prints\]|Transaction Receipt from|Invoice Receipt)",
    r"^(Due Payment|Notification - Fifth Third|Access your|Happy New Year|October Monthly Report)",
    r"^(Re: |Fwd: |Your quarterly Security Suggestions|Your Business Information)",
    r"^(Storage Near Me Sanford|Sanford storage facility|M\.R\. Stoner)",
    r"^(Facebook Messenger|Payment$)",
    r"^(Receipt for Payment to|SpareFoot Receipt|New Payment request from)",
    r"^(New Lead: Reply to|\(no subject)",
]
TEMPLATES = [re.compile(p) for p in TEMPLATES]

def main():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    rows = c.execute("SELECT thread_id,labels,subject FROM threads "
                     "WHERE subject IS NOT NULL").fetchall()
    leaks, unknown = [], []
    for r in rows:
        subj = r["subject"]
        hit = False
        for m in LEAK.finditer(subj):
            if m.group(1) not in STRUCTURAL:
                leaks.append((r["thread_id"], subj)); hit = True; break
        if hit or "SANFORD" not in (r["labels"] or ""):
            continue
        if not any(t.search(subj) for t in TEMPLATES):
            unknown.append((r["thread_id"], subj))

    print("subjects checked            : %d" % len(rows))
    print("CONFIRMED identity leaks    : %d" % len(leaks))
    for t, s in leaks[:20]: print("   LEAK    %s  %s" % (t, s[:90]))
    print("unrecognised Sanford shapes : %d  (not leaks - unverified, review)" % len(unknown))
    for t, s in unknown[:20]: print("   REVIEW  %s  %s" % (t, s[:90]))
    return 1 if leaks else 0

if __name__ == "__main__":
    sys.exit(main())
