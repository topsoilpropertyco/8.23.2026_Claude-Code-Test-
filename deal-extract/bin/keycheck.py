#!/usr/bin/env python3
"""Fail loudly when two property_keys are probably one property.

Two ways the ledger grows a duplicate row for a single facility:
  * punctuation drift in the key itself -- taylor-s- vs taylors-;
  * two names for one place -- a header name in one pass, the body name in
    another -- which shows up as two keys sharing a street address.
Neither is visible in a fact count, and both survive straight into the CRM as
two rows somebody calls twice. This is run before every export.
"""
import sqlite3, re, sys, os, collections
DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                  "data", "ledger", "deals.db")
squash = lambda k: re.sub(r"[^a-z0-9]", "", k)
def norm_addr(a):
    a = a.lower()
    a = re.sub(r"\b(united states|usa)\b", " ", a)
    a = re.sub(r"[^a-z0-9]+", " ", a)
    a = re.sub(r"\b(\d{5})-\d{4}\b", r"\1", a)
    return " ".join(a.split())

def main():
    c = sqlite3.connect(DB); hits = 0
    keys = [r[0] for r in c.execute("SELECT DISTINCT property_key FROM facts")]
    g = collections.defaultdict(list)
    for k in keys: g[squash(k)].append(k)
    for _, ks in sorted(g.items()):
        if len(ks) > 1:
            hits += 1; print("PUNCTUATION VARIANTS: %s" % ks)
    a = collections.defaultdict(set)
    for key, val in c.execute("SELECT property_key,value FROM facts WHERE field='address_raw'"):
        n = norm_addr(val)
        # a bare town/state or a PO box is not evidence of sameness
        if len(n.split()) >= 4 and not n.startswith("po box") and "unknown" not in n:
            a[n].add(key)
    for n, ks in sorted(a.items()):
        if len(ks) > 1:
            hits += 1; print("SHARED ADDRESS: %s\n   %s" % (n, sorted(ks)))
    print("\n%d possible duplicate group(s)" % hits)
    return 1 if hits else 0

if __name__ == "__main__":
    sys.exit(main())
