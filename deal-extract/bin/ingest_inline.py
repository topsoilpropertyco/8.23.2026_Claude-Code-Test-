#!/usr/bin/env python3
"""Ingest a page that arrived INLINE in the transcript rather than as a file.

search_threads pages only persist to disk when they exceed the tool-result cap.
Smaller pages come back inline and have to be transcribed by hand. That
transcription used to carry its own copy of the redaction table, which is how
several tenant-name shapes slipped through. This reuses harvest.redact() so the
inline path and the file path cannot drift apart.

stdin:  thread_id|subject     (one per line)
usage:  ingest_inline.py <SCOPE> <out.tsv>
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harvest

scope, out = sys.argv[1], sys.argv[2]
n = total = 0
with open(out, "w") as f:
    for line in sys.stdin:
        line = line.rstrip("\n")
        if not line.strip(): continue
        tid, subj = line.split("|", 1)
        clean = harvest.redact(" ".join(subj.split()))
        if clean != subj.strip(): n += 1
        f.write("%s\t%s\t%s\n" % (tid.strip(), scope, clean))
        total += 1
print("wrote %d rows (%d redacted) -> %s" % (total, n, out), file=sys.stderr)
