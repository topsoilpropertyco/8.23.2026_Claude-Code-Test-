#!/usr/bin/env python3
"""Post-leave inbox backlog sweep: durable ledger, rules classifier, reports.

The ledger is SQLite on disk. Every stage is idempotent and resumable, so the
run survives context compaction, session death, and partial failures.

Nothing in this file can send, trash, or delete anything. It has no network
access at all -- Gmail I/O happens via MCP tool calls whose raw JSON responses
are dumped into data/raw/ and ingested here.
"""
import argparse, json, os, re, sqlite3, sys, textwrap
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "ledger", "sweep.db")

SCOPE = {
    "Label_2586574970074772607": "TO_ANSWER",
    "Label_3387007617100381248": "TO_READ",
}
# Routing destinations, confirmed against live list_labels 2026-08-28.
# Applied only in the labelling phase, only additively, never before Seth has
# seen the counts they would move.
ROUTE = {
    "STORAGE":      ("Label_4136281187421876366",
                     "! SS To Do/3Z Real Estate/B Self-Storage/Self-Storage Deals To Process"),
    "SELF-NOTE-AI": ("Label_1703807149117918775",
                     "! SS To Do/3a - AI Content to Learn From"),
}

# Personal identifiers live in config/identity.py, which is git-ignored. The
# engine stays generic so it can be committed; the names that make it useful
# never reach a remote. See config/identity.example.py for the shape.
_here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_here, "config"))
try:
    from identity import (SETH, ASSISTANTS, PEOPLE, FAMILY_NAMES, STORAGE_NAMES)
except ImportError:
    sys.exit("missing config/identity.py -- copy config/identity.example.py "
             "and fill it in. It is git-ignored by design.")

SCHEMA = """
CREATE TABLE IF NOT EXISTS threads (
  thread_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  subject TEXT, snippet TEXT,
  msg_count INTEGER, preview_count INTEGER, preview_truncated INTEGER DEFAULT 0,
  unread INTEGER DEFAULT 0,
  first_date TEXT, last_date TEXT,
  last_sender TEXT, last_sender_is_seth INTEGER DEFAULT 0,
  senders TEXT, externals TEXT, ext_recips TEXT, label_ids TEXT,
  body_read INTEGER DEFAULT 0, body_digest TEXT, needs_enrich INTEGER DEFAULT 0,
  cls TEXT, priority INTEGER DEFAULT 0, tags TEXT,
  reason TEXT, rule TEXT, decided_by TEXT,
  sweep_label TEXT, draft_id TEXT, action_taken TEXT, notes TEXT,
  ingested_at TEXT, classified_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  msg_id TEXT PRIMARY KEY, thread_id TEXT, sender TEXT, date TEXT,
  subject TEXT, snippet TEXT, label_ids TEXT, recips TEXT
);
CREATE TABLE IF NOT EXISTS drafts (
  draft_id TEXT PRIMARY KEY, thread_id TEXT, reply_to_msg_id TEXT,
  to_addr TEXT, subject TEXT, body TEXT, placeholders INTEGER,
  created_at TEXT, verified INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, stage TEXT, msg TEXT
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, subject TEXT, call TEXT, why TEXT
);
CREATE INDEX IF NOT EXISTS ix_cls ON threads(cls);
CREATE INDEX IF NOT EXISTS ix_scope ON threads(scope);
"""

def now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")

# Columns added after the first ledger was created. CREATE TABLE IF NOT EXISTS
# will not add them, and rebuilding the ledger would discard recorded judgement,
# so they are applied as idempotent migrations instead.
MIGRATIONS = [
    ("threads", "ext_recips", "TEXT"),
    ("threads", "needs_enrich", "INTEGER DEFAULT 0"),
    ("threads", "deadline_at", "TEXT"),
]

def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    for table, col, decl in MIGRATIONS:
        have = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
        if col not in have:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    c.commit()
    return c

def logit(c, stage, msg):
    c.execute("INSERT INTO log(ts,stage,msg) VALUES(?,?,?)", (now(), stage, msg))

def addr(s):
    if not s: return ""
    m = re.search(r"<([^>]+)>", s)
    return (m.group(1) if m else s).strip().lower()

def is_seth(a): return addr(a) in SETH

# ---------------------------------------------------------------- ingest

KEYMAP = {"i":"id","f":"sender","d":"date","s":"subject","p":"snippet",
          "l":"labelIds","r":"toRecipients","n":"internalDate"}
# single-letter label aliases keep the compact dumps small
LBL = {"A":"Label_2586574970074772607","R":"Label_3387007617100381248",
       "U":"UNREAD","S":"SENT","I":"IMPORTANT","T":"STARRED","X":"TRASH","N":"INBOX"}

def expand(path):
    """Compact JSONL -> the raw search_threads shape, so one ingest path serves both.

    Compact form is one thread per line: {"t":tid,"m":[{i,f,d,s,p,l,r},...]}
    Messages are written in chronological order; we synthesise internalDate from
    the index so ordering survives the round trip.
    """
    threads = []
    for ln, line in enumerate(open(path, encoding="utf-8")):
        line = line.strip()
        if not line or line.startswith("#"): continue
        o = json.loads(line)
        msgs = []
        for k, m in enumerate(o["m"]):
            d = {KEYMAP.get(kk, kk): vv for kk, vv in m.items()}
            if "labelIds" in d:
                d["labelIds"] = [LBL.get(x, x) for x in d["labelIds"]]
            d.setdefault("internalDate", str(k))
            d["threadId"] = o["t"]
            d.setdefault("id", f"{o['t']}-{k}")
            msgs.append(d)
        threads.append({"id": o["t"], "messages": msgs})
    return {"threads": threads}

def cmd_enum(args):
    """Cheap completeness pass.

    Enumerates threads from METADATA_ONLY searches, which carry no subject or
    snippet. The point is the guarantee: every thread in scope gets a ledger row
    so reconciliation can prove nothing was missed. Rows land with
    needs_enrich=1 and are filled in later, and only where it pays.

    Input is TSV: thread_id, msg_count, last_sender, last_date, flags
    where flags is any of u(nread) s(eth spoke last) a/r (scope label).
    Never downgrades a row that already has a subject.
    """
    c = db(); new = seen = 0
    for path in args.files:
        for line in open(path, encoding="utf-8"):
            line = line.rstrip("\n")
            if not line.strip() or line.startswith("#"): continue
            f = line.split("\t")
            if len(f) < 5:
                print(f"SKIP malformed: {line[:60]}"); continue
            tid, n, snd, dt, flags = f[0], int(f[1]), f[2].lower(), f[3], f[4]
            scope = "TO_READ" if "r" in flags else "TO_ANSWER"
            row = c.execute("SELECT subject FROM threads WHERE thread_id=?", (tid,)).fetchone()
            if row:
                seen += 1
                continue  # already have it, possibly enriched; never clobber
            c.execute("""INSERT INTO threads
                (thread_id,scope,msg_count,preview_count,preview_truncated,unread,
                 last_date,last_sender,last_sender_is_seth,senders,externals,
                 ext_recips,needs_enrich,ingested_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?)""",
                (tid, scope, n, n, 1 if n >= 5 else 0, 1 if "u" in flags else 0,
                 dt, snd, 1 if snd in SETH else 0, snd,
                 "" if snd in SETH else snd, "", now()))
            new += 1
    c.commit()
    tot = c.execute("SELECT COUNT(*) FROM threads").fetchone()[0]
    ne = c.execute("SELECT COUNT(*) FROM threads WHERE needs_enrich=1").fetchone()[0]
    print(f"enum: +{new} new, {seen} already present, total {tot}, awaiting enrichment {ne}")

def cmd_ingest(args):
    c = db(); new = upd = 0
    for path in args.files:
        raw = expand(path) if path.endswith(".jsonl") else json.load(open(path))
        for t in raw.get("threads", []):
            msgs = t.get("messages", [])
            if not msgs: continue
            tid = t["id"]
            msgs = sorted(msgs, key=lambda m: int(m.get("internalDate") or 0))
            labels = set()
            for m in msgs: labels |= set(m.get("labelIds") or [])
            scope = next((v for k, v in SCOPE.items() if k in labels), None)
            if scope is None:
                # thread matched the query but no scope label on any previewed
                # message; record it so reconciliation can see the anomaly
                scope = "OUT_OF_SCOPE"
            last = msgs[-1]
            senders = []
            for m in msgs:
                a = addr(m.get("sender"))
                if a and a not in senders: senders.append(a)
            ext = [s for s in senders if s not in SETH]
            # External RECIPIENTS matter as much as senders: a thread where Seth
            # wrote to someone and got silence has no external sender, but it is
            # emphatically not a note to self. It is a thread he is waiting on.
            erec = []
            for m in msgs:
                for a in (m.get("toRecipients") or []) + (m.get("ccRecipients") or []):
                    a = addr(a)
                    if a and a not in SETH and a not in erec and "@" in a:
                        erec.append(a)
            subj = next((m.get("subject") for m in msgs if m.get("subject")), "") or ""
            snip = next((m.get("snippet") for m in msgs if m.get("snippet")), "") or ""
            row = dict(
                thread_id=tid, scope=scope, subject=subj, snippet=snip,
                msg_count=len(msgs), preview_count=len(msgs),
                preview_truncated=1 if len(msgs) >= 5 else 0,
                unread=1 if "UNREAD" in labels else 0,
                first_date=msgs[0].get("date"), last_date=last.get("date"),
                last_sender=addr(last.get("sender")),
                last_sender_is_seth=1 if is_seth(last.get("sender")) else 0,
                senders="|".join(senders), externals="|".join(ext),
                ext_recips="|".join(erec),
                label_ids="|".join(sorted(labels)), ingested_at=now(),
            )
            cur = c.execute("SELECT thread_id FROM threads WHERE thread_id=?", (tid,)).fetchone()
            if cur:
                # never clobber a decision already recorded
                c.execute("""UPDATE threads SET scope=?,subject=?,snippet=?,msg_count=?,
                    preview_count=?,preview_truncated=?,unread=?,first_date=?,last_date=?,
                    last_sender=?,last_sender_is_seth=?,senders=?,externals=?,
                    ext_recips=?,label_ids=?,needs_enrich=0
                    WHERE thread_id=?""",
                    (row["scope"],row["subject"],row["snippet"],row["msg_count"],
                     row["preview_count"],row["preview_truncated"],row["unread"],
                     row["first_date"],row["last_date"],row["last_sender"],
                     row["last_sender_is_seth"],row["senders"],row["externals"],
                     row["ext_recips"],row["label_ids"],tid))
                upd += 1
            else:
                c.execute("INSERT INTO threads({}) VALUES({})".format(
                    ",".join(row), ",".join("?"*len(row))), tuple(row.values()))
                new += 1
            for m in msgs:
                c.execute("""INSERT OR REPLACE INTO messages
                    (msg_id,thread_id,sender,date,subject,snippet,label_ids,recips)
                    VALUES(?,?,?,?,?,?,?,?)""",
                    (m.get("id"), tid, addr(m.get("sender")), m.get("date"),
                     m.get("subject"), m.get("snippet"),
                     "|".join(m.get("labelIds") or []),
                     "|".join((m.get("toRecipients") or []) + (m.get("ccRecipients") or []))))
        logit(c, "ingest", f"{os.path.basename(path)}: {len(raw.get('threads',[]))} threads")
    c.commit()
    print(f"ingest: +{new} new, {upd} updated, total {c.execute('SELECT COUNT(*) FROM threads').fetchone()[0]}")

# ---------------------------------------------------------------- rules

# Automated / no-reply-expected senders
# Bulk / automated senders, recognised structurally rather than by brand.
# Two signals do almost all the work and generalise to senders never seen:
#   1. a ROLE local part  (no-reply, alerts, receipts, orders, statements...)
#   2. a BULK SUBDOMAIN   (email.x.com, welcome.x.com, t.x.com, alerts.x.com...)
# Brands come and go; these two shapes do not.
ROLE_LOCAL = re.compile(r"""(?ix) ^ (
  no[-._]?reply\w* | do[-._]?not[-._]?reply\w* | donotreply\w* | reply |
  mailer([-.]daemon)? | bounce\w* | postmaster | notifications? | notify |
  alerts? | ealerts? | updates? | news(letter)? | mail(ing)? | messages? |
  billing | invoices? | receipts? | statements? | payments? | orders? |
  reviews? | surveys? | rewards? | promotions? | offers? | deals? |
  store | shop | team | connect | hello | greetings | marketing |
  accountreview | online[-._]?banking | customercare | care |
  services? | subscriptions? | membership | auto[-._]?pay
) ([-+.][\w.+-]*)? @ """)

# The first label of a multi-label domain, e.g. the "email" in email.brand.com.
BULK_SUBDOMAIN = re.compile(r"""(?ix) @ (
  e?mail\w* | m | t | r | e | em | go | link | click | track\w* | send\w* |
  info | welcome | news\w* | alerts? | ealerts? | notifications? | notify |
  updates? | reply | noreply | marketing | promo\w* | offers? | deals? |
  campaign\w* | comms? | communications? | messages? | reviews? | surveys? |
  members? | member | account\w* | billing | receipts? | orders? | shop |
  store | connect | hello | team | support | help | service\w*
) \. [\w-]+ \. """)

# Known bulk-sending platforms, which give it away regardless of local part.
ESP = re.compile(r"""(?ix)
  mailchimp | sendgrid | ccsend | constantcontact | hubspot | substack |
  beehiiv | convertkit | klaviyo | sparkpost | mandrill | intercom |
  shopifyemail | narvar | yotpo | mailgun | postmark | customer\.io |
  braze | iterable | salesforce | exacttarget | marketo | pardot |
  amazonses | mailjet | zendesk | freshdesk | helpscout | front\.com |
  docusign | calendly | eventbrite | surveymonkey | typeform | qualtrics
""")

# Ambiguous local parts: a shared inbox that may be staffed by a human. These
# are the addresses that made a physiotherapist's personal check-in look like a
# robot, so they only count as automated when the CONTENT also looks bulk.
SOFT_ROLE = re.compile(r"(?i)^(help|support|info|contact|hello|admin|office|"
                       r"sales|service|enquir\w*|inquir\w*)([-+.][\w.+-]*)?@")

def automated_sender(a, content_is_bulk=False):
    """True when this address is a machine or a bulk platform, not a person.

    `content_is_bulk` lets an ambiguous shared inbox (help@, support@, info@)
    be resolved by what the message actually says rather than by its address.
    """
    a = (a or "").lower()
    if not a or "@" not in a: return False
    if ROLE_LOCAL.search(a): return True
    if BULK_SUBDOMAIN.search(a): return True
    if ESP.search(a): return True
    if content_is_bulk and SOFT_ROLE.search(a): return True
    return False

AUTOMATED = re.compile(r"""(?ix)
  no[-._]?reply | do[-._]?not[-._]?reply | donotreply | mailer | bounce |
  postmaster | @ mail\w*\.
""")

RECEIPT = re.compile(r"""(?ix)
  receipt | invoice | statement\b | your order | order \s* (confirmation|\#|shipped) |
  payment \s* (received|confirmation|due|posted) | tracking | shipped | delivered |
  has \s* shipped | autopay | \bach\b | deposit | withdrawal | transaction |
  billing | subscription \s* (renew|confirm) | e-?statement | tax \s* document
""")

NEWSLETTER = re.compile(r"""(?ix)
  newsletter | digest | weekly \s* (round|recap|update) | this \s* week \s* in |
  \bissue \s* \#?\d+ | unsubscribe | webinar | \bsale\b | % \s* off | discount |
  limited \s* time | last \s* chance | don'?t \s* miss | register \s* now |
  free \s* trial | new \s* (episode|post|article) | podcast | blog
""")

NOTIFY = re.compile(r"""(?ix)
  notification | reminder | alert | daily \s* report | security | password |
  sign-?in | verify | verification | confirm \s* your | activity | mentioned \s* you |
  assigned \s* you | commented | shared \s* (a|with) | calendar | invitation |
  accepted | declined | rsvp | out \s* of \s* office | automatic \s* reply
""")

# Storage / real-estate routing (Seth handles this pile separately)
# Roman Melbourne, Seth's self-storage closer, mails from several addresses;
# Nicola Grant cold-calls for the same pipeline. Both route to the storage pile.
STORAGE_SENDERS = re.compile(r"(?ix)" + STORAGE_NAMES + r"| appfolio | crexi | propstream | reireply")
STORAGE_LABELS = ("Label_4911723388541969300","Label_4294090956074018031",
                  "Label_4136281187421876366","Label_2984689739998955583",
                  "Label_7316740583511116514","Label_1861540869407009750",
                  "Label_2819708874346904587","Label_9143657928115181778",
                  "Label_9157753509643815041","Label_8086688622411937848",
                  "Label_8296779178521236240","Label_455694785532046745",
                  "Label_929996908638638954","Label_3444400162136926024")
STORAGE = re.compile(r"""(?ix)
  self.?storage | \bstorage\b | mini.?storage | \bwarehouse | campground | \brv \s* park |
  \bcap \s* rate | \bnoi\b | \bloi\b | letter \s* of \s* intent | purchase \s* (and \s* sale|agreement) |
  \bpsa\b | due \s* diligence | off.?market | \bbroker | \blisting\b | \bacreage | \bparcel |
  \bzoning | \btitle \s* (company|work|search) | \bescrow | \bclosing\b | seller \s* financ |
  \bfacility\b | \bunits? \s* (mix|occupancy) | occupancy | sanford | \bobx\b | longyards |
  mansfield | barbecue \s* church | tricore | \bcre\b | commercial \s* real \s* estate |
  \bland \s* (for \s* sale|deal) | \bacquisition | hot \s* lead |
  \bplat\b | \bdeed\b | \bmylar\b | recombination | \bsurvey(or)? \b | \b1031\b |
  meekins | longview | \bnnn\b | registered \s* agent | \bsubsidiar | \bllc\b |
  \btenant | \blease\b | \blandlord | \brent\b | property \s* (tax|manager) |
  owner \s* (contact|statement) | \bdialing\b | cold \s* call | \bcomps?\b |
  \bmeekins | orlando \s* meekins | inspection \s* report | \bappraisal
""")

MONEY = re.compile(r"""(?ix)
  \binvoice | \bpayment | \bwire\b | \bach\b | \bpaid\b | \bowe | past \s* due |
  outstanding \s* balance | \bcontract | \bagreement | \bsigned? | docusign |
  \blegal | attorney | lawyer | \btax | \birs\b | \baudit | \binsurance |
  \bloan | \bmortgage | \blender | underwrit | \bfunder | \bgrant\b | \bboard\b |
  \binvestor | \bequity | \bcapital | \bbudget | reimburse | \bsalary | payroll
""")

DEADLINE = re.compile(r"""(?ix)
  \bdeadline | \bdue \s* (by|on|date) | expires? | expiring | \basap\b | urgent |
  by \s* (monday|tuesday|wednesday|thursday|friday|end \s* of) | time.?sensitive |
  final \s* notice | last \s* call | respond \s* by | \brsvp
""")

# PEOPLE imported from config/identity.py
# Family and medical. Deliberately broad: a false positive costs one extra line
# in the fire report, a false negative buries a child's surgery.
# Family and medical. Names come from config/identity.py; the medical
# vocabulary is generic and stays here. Deliberately broad: a false positive
# costs one extra line in the fire report, a false negative buries a surgery.
FAMILY = re.compile(r"(?ix)" + FAMILY_NAMES + r"""
  | immuniz | pediatric | \bdaycare\b | preschool | \bobgyn\b |
  \bdoctor | \bdentist | \bclinic\b | \bsurgery\b | \bhospital | mychart |
  \bmedical\b | diagnosis | prescription | \bprenatal | \btherapy\b | urgent \s* care |
  health \s* insurance | \bdeductible | \bhdhp\b | \bmom\b | \bdad\b
""")

# An email Seth sent himself about AI. His existing 3a label is already the
# workflow for these, so they route there rather than into the digest.
AI_NOTE = re.compile(r"""(?ix)
  \bai\b | \bagent(s|ic)?\b | \bllm\b | \bgpt\b | claude | grok | hermes | kimi |
  codex | copilot | \bprompt | open \s* source \s* model | model \s* weights |
  vibe \s* cod | \bmcp\b | \brag\b | fine.?tun | \bopenai\b | anthropic |
  \bbuzz\b | \bskills?\b
""")

# A note to self that is actually a task, not something to read. Archiving these
# would throw away Seth's own to-do list.
SELF_TODO = re.compile(r"""(?ix)
  # An imperative opening, which is how Seth writes himself a task.
  ^ \s* (?:\d\)\s*)? (seth|do|go|print|send|mail|call|buy|pay|dispute|cancel|book|
     file|upload|check|fix|ask|tell|assign|schedule|renew|update|delete|add|make|
     create|setup|set \s* up|sign \s* up|use|open|move|click|login|log \s* in|
     connect|task|deep \s* work|remember|figure|start|finish|review|order|
     apply|enroll|complete|confirm|find|get|put|write|record|draft|build) \b |
  \bseth \s* (task|do|send|maybe|close \s* out) \b | \btask \s* (for|make|-) |
  \bdispute\b | \bmake \s* sure | needs? \s* doing | \btodo\b | \bdo \s* this |
  \b(print|mail) \s+ (the \s+)? form | and \s* mail \s* it | add \s* to \s* sop |
  ^ \s* (did|does|is|are|has|have) \b .{0,80} \? | \bwaiting \s* on\b |
  \bmaybe \s* (ask|call|push|get) \b
""")

GIFT = re.compile(r"(?i)\b(gift|guest)\s*tracker\b|\bgift\s*\$")

RELAY = re.compile(r"(?i)@txt\.voice\.google\.com|@sms\.|voice\.google\.com")

# Automated sender, but Seth still has to DO something. No reply is expected,
# so these are not REPLY, but they are emphatically not DEAD either. This class
# is the one the original rubric was missing, and post-leave it is where the
# things that actually bite you live.
ACTION = re.compile(r"""(?ix)
  requires? \s* your \s* (acknowledg|attention|action|signature) | action \s* required |
  immediate \s* attention | needs? \s* (doing|your \s* attention) | please \s* (update|provide|complete|submit|sign|authorize|login|log \s* in) |
  update \s* your | complete \s* your | \bsign \s* (here|the) | e-?signature | authorize |
  \bdue \s* date | overdue | past \s* due | expires? | expiring | do \s* not \s* roll \s* over |
  \bclaim \s* (your|was) | collect \s* your | uncashed | \bcheck \s* reminder |
  verify \s* your | confirm \s* your | \brecall\b | secure \s* message | needs \s* pulling
""")

def blob(r):
    return " ".join(filter(None, [r["subject"] or "", r["snippet"] or "", r["senders"] or ""]))

def classify_row(r):
    """Return (cls, priority, tags, reason, rule) or None to defer to a human read."""
    b = blob(r); sndrs = (r["senders"] or ""); labels = (r["label_ids"] or "")
    tags = []

    ext = [s for s in (r["externals"] or "").split("|") if s]
    ext += [s for s in (r["senders"] or "").split("|") if s in ASSISTANTS]
    ext = list(dict.fromkeys(ext))
    relay = any(RELAY.search(s) for s in ext)
    b0 = " ".join(filter(None, [r["subject"] or "", r["snippet"] or ""]))
    bulkish = bool(RECEIPT.search(b0) or NEWSLETTER.search(b0) or NOTIFY.search(b0))
    automated = (bool(ext) and not relay
                 and all(automated_sender(s, bulkish) for s in ext))
    # tag matching must never see Seth's own addresses, or he flags as family
    btag = " ".join(filter(None, [r["subject"] or "", r["snippet"] or "", " ".join(ext)]))

    # --- flags (cross-cutting, computed before class)
    if MONEY.search(btag): tags.append("money/legal")
    if DEADLINE.search(btag): tags.append("deadline")
    if FAMILY.search(btag): tags.append("family")
    for k, v in PEOPLE.items():
        if k in btag.lower(): tags.append(v)

    # veto:relational outranks every route, including storage.
    # Brad Zitzner, Scott Emerick and Trilink are principals in Seth's deals,
    # not deal flow. Roman and Nicola are people Seth pays to send him leads;
    # their mail belongs in a process-later pile. A partner's mail does not,
    # however much storage vocabulary it carries. Over-capture is the safe
    # direction here: the cost of reviewing one extra thread is a minute, the
    # cost of burying a partner commitment for a year is the relationship.
    if any("relational" in t for t in tags):
        return ("RELATIONAL", 1, tags,
                "partner / investor thread, veto:relational — Seth reviews personally, "
                "nothing sent, drafts marked [SETH: relational, review closely]",
                "R0-relational")

    storage = (STORAGE.search(b) or STORAGE_SENDERS.search(sndrs)
               or any(l in labels for l in STORAGE_LABELS))

    # --- routing rules, most specific first
    if storage:
        return ("STORAGE", 0, tags, "storage / real-estate pile, Seth handles separately", "R1-storage")

    if r["scope"] == "TO_READ":
        if automated and ACTION.search(btag) and (MONEY.search(btag) or DEADLINE.search(btag)):
            return ("ACTION", 1, tags, "automated, but requires an action from Seth", "R7-action")
        if RECEIPT.search(b) and automated:
            return ("READ-RECEIPT", 0, tags, "automated receipt or statement", "R2-receipt")
        if automated and NEWSLETTER.search(b):
            return ("READ-PROMO", 0, tags, "bulk newsletter or promotion", "R3-promo")
        if automated and NOTIFY.search(b):
            return ("READ-NOTIFY", 0, tags, "automated notification", "R4-notify")
        if automated:
            return ("READ-PROMO", 0, tags, "automated sender, no reply expected", "R5-bulk")
        return ("NEEDS_READ", 0, tags, "human mail in To Read", "R0-defer")

    # --- TO_ANSWER
    if not ext:
        subj = (r["subject"] or "")
        erec = [x for x in (r["ext_recips"] or "").split("|") if x]
        # A real counterparty was written to and never answered.
        if erec:
            return ("SETH-SENT", 1, tags,
                    f"Seth wrote to {', '.join(erec[:2])} and got no reply",
                    "R6c-seth-sent")
        # No recipient data available (older compact dumps). Anything carrying
        # money, deadline, or medical language is too consequential to call a
        # note to self on sender evidence alone.
        if MONEY.search(btag) or DEADLINE.search(btag) or FAMILY.search(btag):
            return ("NEEDS_READ", 0, tags,
                    "sender looks like a self-note but the content is consequential",
                    "R0-defer-consequential")
        if GIFT.search(subj):
            return ("GIFT-LOG", 0, [],
                    "gift logged to self, feeds the thank-you list", "R6d-gift")
        if SELF_TODO.search(subj) and not AI_NOTE.search(subj):
            return ("SELF-TODO", 1, tags,
                    "note to self that is a task, not reading material", "R6a-self-todo")
        if AI_NOTE.search(subj):
            return ("SELF-NOTE-AI", -1, [],
                    "self-note about AI, routes to the 3a AI reading label", "R6b-self-ai")
        return ("SELF-NOTE", -1, [],
                "self-note, non-AI, goes to the reading digest", "R6-self")
    if automated:
        if ACTION.search(btag):
            return ("ACTION", 1, tags, "automated, but requires an action from Seth", "R7-action")
        if RECEIPT.search(btag):
            return ("DEAD", 0, tags, "automated receipt, nothing to answer", "R8-auto-receipt")
        return ("DEAD", 0, tags, "automated sender, no reply expected", "R9-automated")
    return ("NEEDS_READ", 0, tags, "real human correspondence", "R0-defer")

def drip_senders(c, min_threads=6, template_share=0.7):
    """Senders who mail a recurring templated series.

    Volume alone cannot distinguish a machine from a close correspondent: Seth's
    wife and his business partner both clear any thread-count bar. The signal
    that actually separates them is subject TEMPLATING. "Couch to 5k for AI -
    Day 27 take action" and "... Day 28 ..." collapse to one normalised form;
    Claire's subjects collapse to many. A sender is a drip only when most of
    their subjects reduce to the same skeleton.
    """
    def skeleton(subj):
        t = (subj or "").lower()
        t = re.sub(r"^(re|fwd|fw)\s*:\s*", "", t)
        t = re.sub(r"\d+", "#", t)                       # dates, day numbers, ids
        t = re.sub(r"[^a-z#\s]", " ", t)
        return " ".join(t.split())[:60]

    drips = set()
    rows = c.execute("""SELECT last_sender s, subject FROM threads
                        WHERE last_sender IS NOT NULL AND last_sender != ''
                          AND subject IS NOT NULL AND subject != ''""").fetchall()
    by_sender = {}
    for r in rows:
        by_sender.setdefault(r["s"], []).append(skeleton(r["subject"]))
    for snd, subs in by_sender.items():
        if snd in SETH or len(subs) < min_threads:
            continue
        counts = {}
        for k in subs: counts[k] = counts.get(k, 0) + 1
        if max(counts.values()) / len(subs) >= template_share:
            drips.add(snd)
    return drips

def cmd_classify(args):
    c = db(); hits = {}; n = 0
    DRIP = drip_senders(c)
    if DRIP:
        print(f"drip senders detected: {', '.join(sorted(DRIP))}")
    rows = c.execute("SELECT * FROM threads WHERE cls IS NULL OR decided_by='rule'").fetchall()
    for r in rows:
        # A row with no subject was only enumerated, never read. Judging it on a
        # sender address alone would quietly bucket it as handled. Mark it
        # pending so reconciliation and the reports both show the real debt.
        # Storage routing is decidable from the sender alone for Roman, Nicola
        # and the deal counterparties, so an unread subject is no obstacle.
        if (r["needs_enrich"] and not (r["subject"] or "").strip()
                and r["last_sender"] and STORAGE_SENDERS.search(r["last_sender"])):
            c.execute("""UPDATE threads SET cls='STORAGE',priority=0,decided_by='rule',
                rule='R1-storage-sender',reason='storage counterparty, routed on sender',
                classified_at=? WHERE thread_id=?""", (now(), r["thread_id"]))
            hits["R1-storage-sender"] = hits.get("R1-storage-sender", 0) + 1; n += 1
            continue
        if (r["needs_enrich"] and not (r["subject"] or "").strip()
                and r["scope"] == "TO_READ" and r["last_sender"]
                and automated_sender(r["last_sender"])):
            c.execute("""UPDATE threads SET cls='READ-BULK',priority=0,
                decided_by='rule',rule='R11-bulk-sender',
                reason='machine sender, decidable without reading the subject',
                classified_at=? WHERE thread_id=?""", (now(), r["thread_id"]))
            hits["R11-bulk-sender"] = hits.get("R11-bulk-sender", 0) + 1; n += 1
            continue
        if r["needs_enrich"] and not (r["subject"] or "").strip():
            c.execute("""UPDATE threads SET cls='NEEDS_ENRICH',decided_by='rule',
                         rule='R00-unenriched',reason='enumerated only, no subject read yet',
                         classified_at=? WHERE thread_id=?""", (now(), r["thread_id"]))
            hits["R00-unenriched"] = hits.get("R00-unenriched", 0) + 1; n += 1
            continue
        if (r["last_sender"] in DRIP and not r["last_sender_is_seth"]
                and (r["subject"] or "").strip()):
            tg = []
            b = " ".join(filter(None, [r["subject"] or "", r["snippet"] or ""]))
            if MONEY.search(b): tg.append("money/legal")
            if DEADLINE.search(b): tg.append("deadline")
            if FAMILY.search(b): tg.append("family")
            if not tg:
                c.execute("""UPDATE threads SET cls='DRIP',priority=0,tags='',
                    reason='recurring single-message series from this sender',
                    rule='R10-drip',decided_by='rule',classified_at=? WHERE thread_id=?""",
                    (now(), r["thread_id"]))
                hits["R10-drip"] = hits.get("R10-drip", 0) + 1; n += 1
                continue
        res = classify_row(r)
        if res is None:
            continue
        cls, pri, tags, reason, rule = res
        if pri == -1:
            pri = 0
        else:
            pri = 1 if (pri == 1 or any(t in ("money/legal","deadline","family")
                        or "relational" in t for t in tags)) else 0
        c.execute("""UPDATE threads SET cls=?,priority=?,tags=?,reason=?,rule=?,
                     decided_by='rule',classified_at=? WHERE thread_id=?""",
                  (cls, pri, "|".join(sorted(set(tags))), reason, rule, now(), r["thread_id"]))
        hits[rule] = hits.get(rule, 0) + 1; n += 1
    c.commit()
    print(f"classified {n} threads")
    for k in sorted(hits, key=lambda x: -hits[x]): print(f"  {k:18} {hits[k]:5}")

# ---------------------------------------------------------------- reports

def cmd_stats(args):
    c = db()
    print(f"{'scope':12} {'class':16} {'n':>5} {'pri':>5} {'unread':>7}")
    for r in c.execute("""SELECT scope, COALESCE(cls,'(unclassified)') cls, COUNT(*) n,
                          SUM(priority) p, SUM(unread) u FROM threads
                          GROUP BY scope, cls ORDER BY scope, n DESC"""):
        print(f"{r['scope']:12} {r['cls']:16} {r['n']:5} {r['p'] or 0:5} {r['u'] or 0:7}")
    tot = c.execute("SELECT COUNT(*) FROM threads").fetchone()[0]
    print(f"\ntotal threads in ledger: {tot}")

def cmd_recon(args):
    c = db()
    print("RECONCILIATION")
    for scope, expected in (("TO_ANSWER", args.answer), ("TO_READ", args.read)):
        got = c.execute("SELECT COUNT(*) FROM threads WHERE scope=?", (scope,)).fetchone()[0]
        trash = c.execute("SELECT COUNT(*) FROM threads WHERE scope=? AND cls='IN-TRASH'",
                          (scope,)).fetchone()[0]
        if not expected:
            flag = "no expected count given"
        elif got >= expected:
            # Gmail's label threadsTotal does not count threads whose only
            # labelled message is in Trash, but this sweep records them, so the
            # ledger legitimately runs slightly ahead. Ahead is covered.
            extra = got - expected
            flag = ("COMPLETE" if extra == 0 else
                    f"COMPLETE (+{extra}, of which {trash} are trash-only threads "
                    f"Gmail excludes from its own count)")
        else:
            flag = f"INCOMPLETE, {expected - got} threads unaccounted"
        print(f"  {scope:10} ledger={got:5} label_count={expected or '?':>5}  {flag}")
    un = c.execute("SELECT COUNT(*) FROM threads WHERE cls IS NULL").fetchone()[0]
    oos = c.execute("SELECT COUNT(*) FROM threads WHERE scope='OUT_OF_SCOPE'").fetchone()[0]
    trunc = c.execute("SELECT COUNT(*) FROM threads WHERE preview_truncated=1 AND body_read=0").fetchone()[0]
    ne = c.execute("SELECT COUNT(*) FROM threads WHERE needs_enrich=1").fetchone()[0]
    print(f"  unclassified: {un}   out-of-scope: {oos}   truncated-preview unread-by-agent: {trunc}")
    print(f"  enumerated but not yet enriched (no subject read): {ne}")

def cmd_fire(args):
    """The report Seth reads first: who is waiting, what has a clock on it.

    Ranked by whether a human is actually blocked on him, not by class.
    """
    c = db()
    out = []
    out.append("# WHAT IS ON FIRE")
    out.append(f"\nGenerated {now()} from {c.execute('SELECT COUNT(*) FROM threads').fetchone()[0]} threads in the ledger.")
    out.append("Ledger is the source of truth; this file is regenerated, never hand-edited.\n")

    def score(r):
        """Rank by consequence. Age matters, but only as a tiebreaker."""
        sc = 0
        tags = (r["tags"] or "")
        if r["priority"]: sc += 4
        if "money/legal" in tags: sc += 3
        if "deadline" in tags: sc += 3
        if "family" in tags: sc += 3
        if "relational" in tags: sc += 2
        # a counterparty who wrote more than once without an answer is chasing
        if (r["msg_count"] or 0) >= 2 and not r["last_sender_is_seth"]: sc += 2
        if (r["msg_count"] or 0) >= 4: sc += 1
        if r["cls"] in ("ACTION", "SELF-TODO"): sc += 2
        blob_ = ((r["subject"] or "") + " " + (r["snippet"] or ""))
        # An actual question is an actual ask.
        if "?" in blob_: sc += 2
        # A family member forwarding an automated notice is FYI, not a request.
        # It still appears, just below the things that are genuinely waiting.
        if (re.match(r"(?i)\s*(fwd|fw)\s*:", r["subject"] or "")
                and re.search(r"(?i)forwarded (message|from)", blob_)
                and "?" not in blob_):
            sc -= 4
        try:
            d = datetime.fromisoformat((r["last_date"] or "").replace("Z", "+00:00"))
            days = (datetime.now(timezone.utc) - d).days
            sc += min(days / 30.0, 3.0)          # capped, so age cannot dominate
        except Exception: pass
        return -sc

    def block(title, note, rows, allow_unread=False):
        # A row with no subject is one I never actually read. Ranking it against
        # rows I did read is false precision: it floats up on its tags alone and
        # pushes legible, actionable items down. Those rows get their own section,
        # as an explicit admission rather than a silent dilution of this list.
        if not allow_unread:
            rows = [r for r in rows if (r["subject"] or "").strip()]
        if not rows: return
        rows = sorted(rows, key=score)
        out.append(f"\n## {title}")
        out.append(f"_{note}_\n")
        for r in rows:
            age = ""
            try:
                d = datetime.fromisoformat((r["last_date"] or "").replace("Z","+00:00"))
                age = f"{(datetime.now(timezone.utc)-d).days}d"
            except Exception: pass
            tg = f"  `{r['tags']}`" if r["tags"] else ""
            out.append(f"- **{(r['subject'] or '(no subject)')[:88]}**")
            out.append(f"  {r['last_sender']} | last msg {age} ago | {r['msg_count']} msgs | {r['cls']}{tg}")
            out.append(f"  {(r['snippet'] or '')[:150]}")
            out.append(f"  https://mail.google.com/mail/u/0/#all/{r['thread_id']}")

    # 0. Anything with a real date attached, soonest first. This outranks every
    # other consideration: a thing that expires on Sunday does not care how many
    # messages are in its thread or who spoke last.
    dated = c.execute("""SELECT * FROM threads WHERE deadline_at IS NOT NULL
                         AND deadline_at != '' ORDER BY deadline_at ASC""").fetchall()
    if dated:
        out.append("\n## DATED DEADLINES, soonest first")
        out.append("_Every item here has a real calendar date. Anything marked PAST is already "
                   "blown; it is listed because the damage is usually still reversible._\n")
        today = datetime.now(timezone.utc).date()
        for r in dated:
            try:
                dl = datetime.fromisoformat(r["deadline_at"]).date()
                n = (dl - today).days
                when = ("PAST by %dd" % -n) if n < 0 else ("TODAY" if n == 0 else "in %dd" % n)
            except Exception:
                when = "?"
            out.append(f"- **{r['deadline_at']}  ({when})**  {(r['subject'] or '(no subject)')[:80]}")
            out.append(f"  {r['last_sender']} | {r['cls']}")
            out.append(f"  {(r['reason'] or '')}")
            out.append(f"  https://mail.google.com/mail/u/0/#all/{r['thread_id']}")

    # 1. A human wrote last and Seth never answered, and it is not bulk mail
    block("Someone is waiting on you",
          "External human spoke last, no reply from Seth. Ranked by consequence; "
          "recurring drip senders are excluded and clustered separately.",
          c.execute("""SELECT * FROM threads WHERE last_sender_is_seth=0
              AND cls IN ('NEEDS_READ','REPLY','ACK','FENCE','DELEGATE')""").fetchall()[:400])

    # 2. Clock-bound or money-bound, whatever the class
    block("Money, legal, or a deadline",
          "Flagged by content regardless of class. Includes the storage pile.",
          c.execute("""SELECT * FROM threads WHERE priority=1
              ORDER BY last_date DESC LIMIT ?""", (args.limit,)).fetchall())

    # 3. Things needing an action, no reply
    block("You must do something, no reply needed",
          "No email to send. A form, a signature, a payment, a credit about to expire.",
          c.execute("SELECT * FROM threads WHERE cls='ACTION' ORDER BY last_date DESC").fetchall())

    block("I could not read these, and they carry a signal",
          "No subject or body was ever returned for these, so I am not judging them. "
          "They are listed because their sender or flags suggest they matter. Your eyes needed.",
          c.execute("""SELECT * FROM threads WHERE (subject IS NULL OR subject='')
              AND last_sender_is_seth=0
              AND (priority=1 OR tags LIKE '%family%' OR tags LIKE '%money%'
                   OR tags LIKE '%relational%' OR tags LIKE '%deadline%')
              ORDER BY last_date DESC""").fetchall(), allow_unread=True)

    block("Your own to-do notes, pulled out of the reading pile",
          "You mailed these to yourself as tasks. They are not reading material and "
          "must not be archived with the link dumps.",
          c.execute("SELECT * FROM threads WHERE cls='SELF-TODO' ORDER BY last_date DESC").fetchall())

    # 4. Seth spoke last: he is the one waiting
    block("You wrote and nobody ever answered",
          "No reply ever came. Oldest first; some of these are a quarter old.",
          c.execute("""SELECT * FROM threads WHERE cls='SETH-SENT'
              ORDER BY last_date ASC LIMIT ?""", (args.limit,)).fetchall())

    block("You are waiting on them",
          "Seth spoke last. Candidates for a nudge, not a reply.",
          c.execute("""SELECT * FROM threads WHERE last_sender_is_seth=1
              AND cls NOT IN ('SELF-NOTE','DEAD') AND msg_count>1
              ORDER BY last_date ASC LIMIT ?""", (args.limit,)).fetchall())

    txt = "\n".join(out)
    open(os.path.join(ROOT, "FIRE-REPORT.md"), "w", encoding="utf-8").write(txt + "\n")
    print(f"wrote FIRE-REPORT.md ({len(txt)} chars)")

def cmd_pending(args):
    c = db()
    q = "SELECT * FROM threads WHERE cls=? "
    p = [args.cls]
    if args.scope: q += "AND scope=? "; p.append(args.scope)
    if args.priority: q += "AND priority=1 "
    q += "ORDER BY priority DESC, last_date DESC LIMIT ?"; p.append(args.limit)
    for r in c.execute(q, p):
        print(json.dumps({k: r[k] for k in
            ("thread_id","scope","subject","snippet","last_sender","last_date",
             "msg_count","preview_truncated","unread","last_sender_is_seth","tags")},
            ensure_ascii=False))

def cmd_set(args):
    c = db()
    for tid in args.thread_ids:
        c.execute("""UPDATE threads SET cls=?,reason=?,priority=?,decided_by='agent',
                     rule=?,classified_at=? WHERE thread_id=?""",
                  (args.cls, args.reason, 1 if args.priority else 0,
                   args.rule or "agent-read", now(), tid))
    c.commit(); print(f"set {len(args.thread_ids)} -> {args.cls}")

def cmd_routes(args):
    c = db()
    print("Threads that WOULD be labelled, per destination. Nothing applied yet.\n")
    for cls, (lid, name) in ROUTE.items():
        n = c.execute("SELECT COUNT(*) FROM threads WHERE cls=? AND sweep_label IS NULL",
                      (cls,)).fetchone()[0]
        print(f"  {n:5}  {cls:14} -> {name}")
    for cls in ("SELF-NOTE", "SELF-TODO", "ACTION", "NEEDS_READ", "DEAD"):
        n = c.execute("SELECT COUNT(*) FROM threads WHERE cls=?", (cls,)).fetchone()[0]
        print(f"  {n:5}  {cls:14} -> (no route yet)")

def cmd_senders(args):
    c = db()
    q = "SELECT last_sender s, COUNT(*) n, SUM(unread) u FROM threads WHERE 1=1 "
    p = []
    if args.scope: q += "AND scope=? "; p.append(args.scope)
    if args.cls: q += "AND cls=? "; p.append(args.cls)
    q += "GROUP BY s ORDER BY n DESC LIMIT ?"; p.append(args.limit)
    for r in c.execute(q, p): print(f"{r['n']:5} {r['u'] or 0:5}  {r['s']}")

BANNED = {"em dash": "—", "en dash": "–", "horizontal bar": "―",
          "minus sign": "−", "curly apostrophe": "’", "curly quote L": "“",
          "curly quote R": "”", "ellipsis char": "…", "nbsp": " "}
EMOJI = re.compile("[\U0001F300-\U0001FAFF\U0001F000-\U0001F2FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]")

def lint_text(t):
    bad = [n for n, ch in BANNED.items() if ch in t]
    if EMOJI.search(t): bad.append("emoji")
    return bad

def cmd_lint(args):
    fail = 0
    for path in args.files:
        t = open(path, encoding="utf-8").read()
        bad = lint_text(t)
        ph = len(re.findall(r"\[SETH:", t))
        if bad: fail += 1; print(f"FAIL {path}: {', '.join(bad)}")
        else: print(f"ok   {path}  placeholders={ph}")
    sys.exit(1 if fail else 0)

def cmd_note(args):
    c = db(); c.execute("INSERT INTO decisions(ts,subject,call,why) VALUES(?,?,?,?)",
                        (now(), args.subject, args.call, args.why)); c.commit()
    print("logged")

def main():
    ap = argparse.ArgumentParser(prog="sweep")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("enum"); s.add_argument("files", nargs="+"); s.set_defaults(f=cmd_enum)
    s = sub.add_parser("ingest"); s.add_argument("files", nargs="+"); s.set_defaults(f=cmd_ingest)
    s = sub.add_parser("classify"); s.set_defaults(f=cmd_classify)
    s = sub.add_parser("stats"); s.set_defaults(f=cmd_stats)
    s = sub.add_parser("recon"); s.add_argument("--answer", type=int); s.add_argument("--read", type=int); s.set_defaults(f=cmd_recon)
    s = sub.add_parser("fire"); s.add_argument("--limit", type=int, default=40); s.set_defaults(f=cmd_fire)
    s = sub.add_parser("pending"); s.add_argument("cls"); s.add_argument("--scope"); s.add_argument("--limit", type=int, default=25); s.add_argument("--priority", action="store_true"); s.set_defaults(f=cmd_pending)
    s = sub.add_parser("set"); s.add_argument("thread_ids", nargs="+"); s.add_argument("--cls", required=True); s.add_argument("--reason", default=""); s.add_argument("--rule"); s.add_argument("--priority", action="store_true"); s.set_defaults(f=cmd_set)
    s = sub.add_parser("routes"); s.set_defaults(f=cmd_routes)
    s = sub.add_parser("senders"); s.add_argument("--scope"); s.add_argument("--cls"); s.add_argument("--limit", type=int, default=40); s.set_defaults(f=cmd_senders)
    s = sub.add_parser("lint"); s.add_argument("files", nargs="+"); s.set_defaults(f=cmd_lint)
    s = sub.add_parser("note"); s.add_argument("--subject", required=True); s.add_argument("--call", required=True); s.add_argument("--why", required=True); s.set_defaults(f=cmd_note)

    a = ap.parse_args(); a.f(a)

if __name__ == "__main__":
    main()
