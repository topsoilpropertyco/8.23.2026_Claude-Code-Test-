#!/usr/bin/env python3
"""Turn a persisted search_threads tool-result file into an enum TSV.

Rationale: search_threads at pageSize=50 with MINIMAL view always overflows the
tool-result size cap, so the harness writes the JSON to disk instead of into the
transcript. That file is free to read from bash. jq-ing it into a TSV means a
whole 50-thread page costs zero context. Never read these files with Read.

Emits: thread_id<TAB>scope<TAB>subject
Prints to stderr: nextPageToken, thread count, and per-thread message counts so
multi-message threads (Hot Lead Alert bundles several properties in one thread)
are visible without opening the payload.
"""
import json, sys, os

# --- scope guard ------------------------------------------------------------
# A page harvested under the wrong scope key silently corrupts the ledger: the
# threads are real, the label attribution is not, and nothing downstream can
# tell. This happened once (a DEALSTP page filed as SWEEP07). So: pin each scope
# to the Gmail label id that dominates its pages, and refuse a mismatch.
PINS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "label-pins.json")

def dominant_label(threads):
    c = {}
    for t in threads:
        for m in t.get("messages", []):
            for l in m.get("labelIds", []):
                if l.startswith("Label_"): c[l] = c.get(l, 0) + 1
    return max(c, key=c.get) if c else None

def check_scope(scope, threads):
    lid = dominant_label(threads)
    if lid is None:
        print("warn: no user label on this page; cannot verify scope", file=sys.stderr); return
    pins = json.load(open(PINS_PATH)) if os.path.exists(PINS_PATH) else {}
    if scope in pins and pins[scope] != lid:
        sys.exit("REFUSED: page's dominant label %s does not match the id pinned "
                 "for %s (%s). Wrong scope key, or wrong page token."
                 % (lid, scope, pins[scope]))
    if scope not in pins:
        pins[scope] = lid
        json.dump(pins, open(PINS_PATH, "w"), indent=1)
        print("pinned %s -> %s" % (scope, lid), file=sys.stderr)

src, scope, out = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(src))
threads = d.get("threads", [])
check_scope(scope, threads)
rows, multi = [], 0
with open(out, "w") as f:
    for t in threads:
        tid = t["id"]
        msgs = t.get("messages", [])
        if len(msgs) > 1: multi += 1
        # subject of the OLDEST message present; search previews oldest-first
        subj = ""
        for m in msgs:
            if m.get("subject"): subj = m["subject"]; break
        subj = " ".join(subj.split())          # kill tabs/newlines, keep content
        f.write("%s\t%s\t%s\n" % (tid, scope, subj))
        rows.append(tid)
print("wrote %d rows -> %s" % (len(rows), out), file=sys.stderr)
print("multi-message threads on this page: %d" % multi, file=sys.stderr)
print("NEXT=%s" % d.get("nextPageToken", ""), file=sys.stderr)
