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

src, scope, out = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(src))
threads = d.get("threads", [])
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
