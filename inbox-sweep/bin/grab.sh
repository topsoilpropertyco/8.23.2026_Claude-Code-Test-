#!/bin/sh
# Ingest the most recent persisted MCP tool-result as raw search_threads JSON.
# $1 = destination name under data/raw/
TR=/root/.claude/projects/-home-user-8-23-2026-Claude-Code-Test-/8cad1ee7-a051-5703-aa8a-f259485863e7/tool-results
SRC=$(ls -t $TR/*.txt 2>/dev/null | head -1)
[ -z "$SRC" ] && { echo "no tool-result files"; exit 1; }
D="$(dirname $0)/../data/raw/$1.json"
cp "$SRC" "$D"
python3 -c "
import json,sys
d=json.load(open('$D'))
print('threads:',len(d.get('threads',[])))
print('NEXT:',d.get('nextPageToken','(end)'))
"
python3 "$(dirname $0)/sweep.py" ingest "$D"
