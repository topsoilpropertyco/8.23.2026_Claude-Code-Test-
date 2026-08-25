#!/usr/bin/env python3
"""Build the Phase 5 screens -- the redesign from Seth's taste log.

Six screens, each answering exactly one question, per taste/PICKS.md:
  s1 where am I          percentile as hero            (from mp2, + pick 1 ask)
  s2 the curve           histogram, dual-labelled axis (from v7,  + pick 4 ask)
  s3 the scale           SD strip with percentiles     (from mp4, + pick 2 ask)
  s4 every night         1,042-cell waffle             (from v15)
  s5 the direction       trailing windows + arrows     (from v4,  + pick 1 ask)
  s6 last night          the detail table              (tabular, liked repeatedly)

DATA HONESTY -- this is the part that matters.
state/sleeplog.ndjson and state/oura.enc are AES-256-GCM ciphertext and the key
is a repo secret absent from source, so the per-night series cannot be read.
Therefore:
  * MEASURED, and used as such: mean 79.3, SD 9.54, n 1,042, z +0.92,
    rank 198, 844 below / 197 above, percentile 81st, T7/T30/T90, last night.
  * MODELLED, and labelled on screen wherever it appears: the histogram SHAPE
    and every tick percentile other than last night's. A normal fit puts +0.92
    SD at the 82.1st percentile while the measured rank is the 81st; that ~1
    point gap is disclosed on s2 and s3 rather than quietly reconciled.
  * ABSENT: T180 and T365 exist nowhere in the data. They are rendered as a
    designed empty state, never invented -- inventing them is exactly what mp6
    was marked down for.
"""
import math, os

W, H = 390, 844
MEAN, SD, N = 79.3, 9.54, 1042
SCORE, BELOW, ABOVE, RANK, PCT = 88, 844, 197, 198, 81
Z = 0.92

GROUND, RAISED, INK, QUIET, RULE = '#F4F0E6', '#E9E3D4', '#1A1814', '#7C7568', '#D5CDBC'
ACCENT = '#1F4B8F'                       # non-semantic on purpose: the direction
UP, FLAT, DOWN = '#2F7A44', '#B07D1A', '#B23A2F'   # trio must not collide with it

def phi(z): return 0.5 * (1 + math.erf(z / math.sqrt(2)))
def pct_at(score): return phi((score - MEAN) / SD) * 100
def score_at(z): return MEAN + z * SD

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#78756F}
.s{position:relative;width:390px;height:844px;overflow:hidden;background:GROUND;color:INK;
  font-family:'Newsreader',Georgia,serif;font-variant-numeric:tabular-nums lining-nums;
  font-feature-settings:'tnum' 1,'lnum' 1;-webkit-font-smoothing:antialiased;
  display:flex;flex-direction:column;padding:30px 24px 26px}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.hd{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:9px;
  border-bottom:1px solid INK;flex:0 0 auto}
.bd{flex:1;display:flex;flex-direction:column;padding:22px 0 10px;min-height:0}
.grp{flex:0 0 auto}
.grp:nth-child(2){flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
.hd .brand{font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:600}
.hd .num{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:QUIET}
.q{font-size:23px;line-height:1.25;font-weight:400;letter-spacing:-.01em}
.q b{font-weight:600}
.ans{margin-top:6px;font-size:11.5px;line-height:1.55;color:QUIET;max-width:33ch}
.lab{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:QUIET;font-weight:500}
.hair{height:1px;background:RULE}
.rule{height:1px;background:INK}
.ft{margin-top:auto;padding-top:12px;border-top:1px solid RULE;display:flex;
  justify-content:space-between;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:QUIET}
.note{font-size:9px;line-height:1.5;color:QUIET;letter-spacing:.02em}
.note b{color:INK;font-weight:600}
"""
CSS = CSS.replace('GROUND', GROUND).replace('INK', INK).replace('QUIET', QUIET).replace('RULE', RULE)

HEAD = """<!doctype html>
<meta charset="utf-8">
<title>{title}</title>
<meta name="viewport" content="width=390, initial-scale=1">
<!-- {note} -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>{css}{extra}</style>
<div class="s">
  <div class="hd"><span class="brand mono">Sleep OS</span><span class="num mono">{idx} of 6 &middot; {kicker}</span></div>
  <div class="bd">
"""
FOOT = """  </div>
  <div class="ft mono"><span>Sun 23 Aug 2026</span><span>{right}</span></div>
</div>
"""

def group(body):
    """Bind each question to its own explanatory paragraph, and the closing rule
    to its provenance note, so that distributing the column with space-between
    opens gaps BETWEEN the three groups rather than inside them."""
    i = body.find('class="ans"')
    if i == -1:
        i = body.find('class="q"')
    j = body.find('</p>', i) + 4
    k = body.rfind('<div class="hair"')
    if k == -1:
        return '<div class="grp">' + body[:j] + '</div><div class="grp">' + body[j:] + '</div>'
    return ('<div class="grp">' + body[:j] + '</div>'
            + '<div class="grp">' + body[j:k] + '</div>'
            + '<div class="grp">' + body[k:] + '</div>')

def page(idx, kicker, title, note, extra, body, right):
    return (HEAD.format(idx=idx, kicker=kicker, title=title, note=note, css=CSS, extra=extra)
            + group(body) + FOOT.format(right=right))

os.makedirs('variants', exist_ok=True)
def write(key, html):
    os.makedirs(f'variants/{key}', exist_ok=True)
    open(f'variants/{key}/index.html', 'w').write(html)

# ---------------------------------------------------------------- s1  where am I
extra = """
.big{font-size:210px;line-height:.82;letter-spacing:-.05em;font-weight:500;margin-top:14px}
.ord{font-size:46px;line-height:1;vertical-align:.86em;font-weight:400;margin-left:12px;
  letter-spacing:.06em;font-variant-ligatures:none}
.pl{margin-top:2px;font-size:15px;letter-spacing:.26em;text-transform:uppercase;color:ACCENT;font-weight:600}
.grid2{display:flex;gap:34px;margin-top:26px}
.g2 .v{font-size:30px;line-height:1;font-weight:500;margin-top:5px}
""".replace('ACCENT', ACCENT).replace('INK', INK)
body = f"""  <p class="q">Where am I?</p>
  <p class="ans">Out of every night on record, last night sits here.
  One number, no arithmetic.</p>
  <div class="big">{PCT}<span class="ord">st</span></div>
  <div class="pl mono">Percentile</div>
  <div class="hair" style="margin-top:24px"></div>
  <div class="grid2">
    <div class="g2"><div class="lab mono">Rank of all nights</div>
      <div class="v mono">{RANK}<span style="color:{QUIET}">/{N:,}</span></div></div>
    <div class="g2"><div class="lab mono">Sleep score</div>
      <div class="v mono">{SCORE}</div></div>
  </div>
  <div class="hair" style="margin-top:22px"></div>
  <p class="note mono" style="margin-top:14px">Measured, not modelled: <b>{BELOW}</b> of your
  {N:,} recorded nights scored lower than last night and <b>{ABOVE}</b> scored higher.
  That is the {PCT}st percentile exactly.</p>
"""
write('s1', page(1, 'Where am I', 's1 — Where am I',
    'Percentile as the hero, rank demoted to support. Every figure here is measured.',
    extra, body, f'{N:,} nights'))

# ---------------------------------------------------------------- s2  the curve
GUT = 68
PW, PH = 342 - GUT, 158
LO, HI, STEP = 44, 104, 2
bins = []
for lo in range(LO, HI, STEP):
    c = lo + STEP / 2
    bins.append((c, math.exp(-((c - MEAN) ** 2) / (2 * SD * SD))))
mx = max(h for _, h in bins)
bw = PW / len(bins) - 2.0
rects = ''
for c, h in bins:
    hh = max(1.0, h / mx * (PH - 12))
    x = (c - LO) / (HI - LO) * PW - bw / 2
    fill = '#C9C1AE' if c < SCORE else 'none'
    stroke = 'none' if c < SCORE else '#C9C1AE'
    rects += (f'<rect x="{x:.2f}" y="{PH-hh:.2f}" width="{bw:.2f}" height="{hh:.2f}" '
              f'fill="{fill}" stroke="{stroke}" stroke-width=".8"/>')
mx_x = (SCORE - LO) / (HI - LO) * PW
gut_mx = GUT + mx_x
mean_x = (MEAN - LO) / (HI - LO) * PW
TICKS = [55, 65, 75, 85, 95]
tick_marks = ''.join(
    f'<line x1="{(t-LO)/(HI-LO)*PW:.2f}" x2="{(t-LO)/(HI-LO)*PW:.2f}" y1="{PH}" y2="{PH+4}" '
    f'stroke="{QUIET}" stroke-width=".8"/>' for t in TICKS)
def axis_row(label, vals, cls=''):
    cells = ''.join(
        f'<span class="ax {cls}" style="left:{(t-LO)/(HI-LO)*PW:.2f}px">{v}</span>'
        for t, v in zip(TICKS, vals))
    return f'<div class="axrow"><span class="axlab mono">{label}</span>{cells}</div>'
extra = """
.plot{position:relative;width:342px}
.pin{margin-left:68px;position:relative}
.axrow{position:relative;height:15px;margin-top:5px;margin-left:68px}
.ax{position:absolute;transform:translateX(-50%);font-size:10px;
  font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:INK}
.ax.p{color:ACCENT}
.axlab{position:absolute;left:-68px;top:3px;font-size:8px;letter-spacing:.16em;
  text-transform:uppercase;color:QUIET}
.callout{position:absolute;transform:translateX(-50%);text-align:center;line-height:1.25}
.callout .a{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:ACCENT;font-weight:600}
.callout .b{font-size:19px;font-weight:600;color:ACCENT}
""".replace('ACCENT', ACCENT).replace('INK', INK).replace('QUIET', QUIET)
body = f"""  <p class="q">How rare is a night like this?</p>
  <p class="ans">Every night on record, binned by score. Taller means more common.
  The row under the axis converts each score straight into a percentile, so you
  never have to.</p>
  <div class="plot">
    <div class="callout" style="left:{gut_mx:.2f}px;top:-6px">
      <div class="a mono">Sleep score</div><div class="b mono">{SCORE}</div>
    </div>
    <div class="pin">
    <svg width="{PW}" height="{PH+5}" viewBox="0 0 {PW} {PH+5}" style="display:block;margin-top:34px" aria-hidden="true">
      {rects}
      <line x1="{mean_x:.2f}" x2="{mean_x:.2f}" y1="16" y2="{PH}" stroke="{QUIET}" stroke-width="1" stroke-dasharray="1 3"/>
      <line x1="{mx_x:.2f}" x2="{mx_x:.2f}" y1="0" y2="{PH}" stroke="{ACCENT}" stroke-width="1.6"/>
      <circle cx="{mx_x:.2f}" cy="3" r="3.2" fill="{ACCENT}"/>
      <line x1="0" x2="{PW}" y1="{PH}" y2="{PH}" stroke="{INK}" stroke-width="1"/>
      {tick_marks}
    </svg></div>
    {axis_row('Sleep score', TICKS)}
    {axis_row('Percentile', [f'{pct_at(t):.0f}' for t in TICKS], 'p')}
  </div>
  <div class="hair" style="margin-top:16px"></div>
  <p class="note mono" style="margin-top:12px">The bars are a normal curve fitted to your real
  mean <b>{MEAN}</b> and SD <b>{SD}</b>; the percentile row is read off that same fit.
  Last night's <b>{PCT}st</b> is the measured rank and is the number to trust — the fitted
  curve puts it at {pct_at(SCORE):.0f}nd, about a point out, because {N:,} real nights are
  not perfectly normal.</p>
"""
write('s2', page(2, 'The curve', 's2 — The curve',
    'Histogram with a dual-labelled axis: score on top, percentile beneath. Shape is a normal fit and says so.',
    extra, body, f'mean {MEAN} · SD {SD}'))
print('s1, s2 written')

# ---------------------------------------------------------------- s3  the scale
ZT = [-2, -1, 0, 1, 2]
ZGUT = 74                       # label column
SW_ = 342 - ZGUT                # the strip itself
ZLO, ZHI = -2.5, 2.5            # five bands of 1 SD, centred on the labels
chips = ''.join(
    f'<div class="chip{" me" if z == 1 else ""}"></div>' for z in ZT)
def zrow(label, vals, cls=''):
    cells = ''.join(f'<span class="zc {cls}">{v}</span>' for v in vals)
    return f'<div class="zrow"><span class="zlab mono">{label}</span><div class="zcells">{cells}</div></div>'
you_x = (Z - ZLO) / (ZHI - ZLO) * SW_
extra = """
.strip{display:flex;height:30px;margin-top:8px;border:1px solid INK}
.chip{flex:1 1 0;background:#DDD6C6;border-right:1px solid INK}
.chip:last-child{border-right:0}
.chip.me{background:#C7D2E4}
.zwrap{position:relative;margin-top:22px;width:342px}
.zrow{display:flex;align-items:baseline;margin-top:6px}
.zlab{width:74px;flex:0 0 74px;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:QUIET}
.zcells{flex:1;display:flex}
.zc{flex:1 1 0;text-align:center;font-size:10.5px;
  font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.zc.p{color:ACCENT}
.you{position:absolute;top:-20px;transform:translateX(-50%);text-align:center;white-space:nowrap}
.you .t{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:ACCENT;font-weight:600}
.youline{position:absolute;top:-4px;width:1.6px;height:38px;background:ACCENT;transform:translateX(-50%)}
.inband{margin-top:16px;border:1px solid ACCENT;padding:12px 14px;display:flex;
  justify-content:space-between;align-items:baseline}
.inband .k{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:ACCENT;font-weight:600}
.inband .v{font-size:27px;font-weight:600;color:ACCENT}
""".replace('ACCENT', ACCENT).replace('INK', INK).replace('QUIET', QUIET)
body = f"""  <p class="q">How far from ordinary?</p>
  <p class="ans">The same night measured in standard deviations. Each step is
  spelled out in both a sleep score and a percentile, so the scale reads without
  any statistics.</p>
  <div class="zwrap">
    <div class="you" style="left:{ZGUT + you_x:.2f}px">
      <div class="t mono">You &middot; +{Z} SD</div>
    </div>
    <div style="margin-left:{ZGUT}px;position:relative">
      <div class="strip">{chips}</div>
      <div class="youline" style="left:{you_x:.2f}px"></div>
    </div>
    {zrow('Deviation', [f'{z:+d}'.replace('+0','&nbsp;0') for z in ZT])}
    {zrow('Sleep score', [f'{score_at(z):.0f}' for z in ZT])}
    {zrow('Percentile', [f'{phi(z)*100:.0f}' for z in ZT], 'p')}
  </div>
  <div class="inband">
    <div><div class="k mono">You are in this band</div>
      <div class="note mono" style="margin-top:4px">+1 SD &middot; score {score_at(1):.0f}</div></div>
    <div class="v mono">{PCT}st</div>
  </div>
  <div class="hair" style="margin-top:18px"></div>
  <p class="note mono" style="margin-top:12px">The strip's positions are measured — mean
  <b>{MEAN}</b>, SD <b>{SD}</b>, last night <b>+{Z} SD</b>. The percentile row is a normal
  fit, so the tick figures are approximate. The <b>{PCT}st</b> in the band is your real rank.</p>
"""
write('s3', page(3, 'The scale', 's3 — The scale',
    'SD calibration strip, each tick spelled out as a score and a percentile. Positions measured, tick percentiles modelled.',
    extra, body, f'z +{Z}'))

# ---------------------------------------------------------------- s4  every night
extra = """
.marks{display:flex;flex-wrap:wrap;gap:1px;line-height:0;margin-top:18px;width:342px}
.marks i{display:block;width:5px;height:5px;background:#DED7C7}
.marks i.b{background:#4A463E}
.marks i.you{background:ACCENT;outline:2px solid INK;position:relative;z-index:2}
.key{display:flex;gap:16px;margin-top:14px;flex-wrap:wrap;font-size:9.5px;letter-spacing:.06em;color:QUIET}
.key b{color:INK}
.key i{display:inline-block;width:8px;height:8px;vertical-align:-1px;margin-right:5px}
.split{display:flex;margin-top:20px;border-top:1px solid INK;padding-top:12px;gap:26px}
.split .v{font-size:34px;line-height:1;font-weight:500;margin-top:4px}
""".replace('ACCENT', ACCENT).replace('INK', INK).replace('QUIET', QUIET)
body = f"""  <p class="q">What does {BELOW} of {N:,} look like?</p>
  <p class="ans">One square for every night on record, worst to best, nothing
  averaged or sampled. Last night is the marked square.</p>
  <div class="marks" id="marks"></div>
  <div class="key mono">
    <span><i style="background:#4A463E"></i>Below <b>{BELOW}</b></span>
    <span><i style="background:{ACCENT}"></i>Last night</span>
    <span><i style="background:#DED7C7"></i>Above <b>{ABOVE}</b></span>
  </div>
  <div class="split">
    <div><div class="lab mono">Nights you beat</div><div class="v mono">{BELOW}</div></div>
    <div><div class="lab mono">Nights that beat you</div><div class="v mono">{ABOVE}</div></div>
  </div>
  <div class="hair" style="margin-top:20px"></div>
  <p class="note mono" style="margin-top:12px">Fully measured. {BELOW} + 1 + {ABOVE} =
  <b>{N:,}</b> — every night drawn once, at its true position in the order.</p>
  <script>
  var N={N},BELOW={BELOW},f=document.createDocumentFragment();
  for(var i=0;i<N;i++){{var e=document.createElement('i');
    if(i===BELOW)e.className='you';else if(i<BELOW)e.className='b';f.appendChild(e);}}
  document.getElementById('marks').appendChild(f);
  </script>
"""
write('s4', page(4, 'Every night', 's4 — Every night',
    '1,042 marks, one per night, split at the true boundary. Nothing aggregated.',
    extra, body, 'one square = one night'))
print('s3, s4 written')

# ---------------------------------------------------------------- s5  the direction
# Chain: each window against the next LONGER window that has data; the longest
# available against the lifetime mean. T180/T365 have no data and are drawn as
# an explicit empty state -- never invented.
AX_LO, AX_HI, TW = 70.0, 85.0, 182.0
WINDOWS = [('Last 7', 79.4), ('Last 30', 79.2), ('Last 90', 73.9),
           ('Last 180', None), ('Last 365', None), ('All time', MEAN)]
avail = [(k, v) for k, v in WINDOWS[:-1] if v is not None]
deltas = {}
for i, (k, v) in enumerate(avail):
    nxt = avail[i + 1][1] if i + 1 < len(avail) else MEAN
    deltas[k] = v - nxt
def arrow(d):
    if d is None: return ('', QUIET, '')
    if d > 0.5:  return ('&#9650;', UP, f'+{d:.1f}')
    if d < -0.5: return ('&#9660;', DOWN, f'{d:.1f}')
    return ('&#9644;', FLAT, f'{d:+.1f}')
rows = ''
for k, v in WINDOWS:
    last = k == 'All time'
    if v is None:
        rows += (f'<div class="trow empty"><span class="tk mono">{k}</span>'
                 f'<span class="track"></span>'
                 f'<span class="tv mono">&mdash;</span>'
                 f'<span class="ta mono">no data</span></div>')
        continue
    x = (v - AX_LO) / (AX_HI - AX_LO) * TW
    g, col, dtxt = arrow(deltas.get(k)) if not last else ('', QUIET, '')
    dot = (f'<span class="dot" style="left:{x:.2f}px;background:{ACCENT if not last else QUIET}"></span>')
    rows += (f'<div class="trow{" base" if last else ""}"><span class="tk mono">{k}</span>'
             f'<span class="track">{dot}</span>'
             f'<span class="tv mono">{v}</span>'
             f'<span class="ta mono" style="color:{col}">{g}<i>{dtxt}</i></span></div>')
mean_x = (MEAN - AX_LO) / (AX_HI - AX_LO) * TW
extra = """
.verdict{margin-top:16px;font-size:44px;line-height:1;font-weight:600;letter-spacing:-.02em;color:UP}
.tbl{position:relative;margin-top:20px}
.meanline{position:absolute;top:16px;bottom:26px;width:1px;background:QUIET;z-index:0}
.trow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid RULE;position:relative;z-index:1}
.trow.base{border-bottom:0;border-top:1px solid INK;margin-top:2px}
.trow.empty .tk,.trow.empty .tv{color:#B3AB9A}
.tk{width:58px;flex:0 0 58px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;
  color:QUIET;white-space:nowrap}
.track{flex:0 0 182px;height:9px;position:relative;background:#E4DDCD}
.trow.empty .track{background:repeating-linear-gradient(90deg,#E4DDCD 0 4px,transparent 4px 8px)}
.dot{position:absolute;top:-2px;width:3px;height:13px;transform:translateX(-1.5px)}
.tv{width:36px;flex:0 0 36px;text-align:right;font-size:12.5px;font-weight:500}
.ta{flex:1;min-width:0;font-size:10.5px;display:flex;align-items:baseline;gap:4px;white-space:nowrap}
.ta i{font-style:normal;font-size:9.5px}
.axline{display:flex;margin-top:7px}
.axline .sp{width:66px;flex:0 0 66px}
.axline .e{flex:0 0 182px;display:flex;justify-content:space-between;font-size:8.5px;
  letter-spacing:.1em;color:QUIET;font-family:'IBM Plex Mono',monospace}
""".replace('ACCENT', ACCENT).replace('INK', INK).replace('QUIET', QUIET)\
   .replace('RULE', RULE).replace('UP', UP)
body = f"""  <p class="q">Am I heading the right direction?</p>
  <div class="verdict">Improving.</div>
  <p class="ans" style="margin-top:8px">Your last 30 nights sit <b style="color:{UP}">5.3
  points</b> above your last 90 — a bad stretch you have already climbed out of.
  The last 7 are holding steady.</p>
  <div class="tbl">
    <div class="meanline" style="left:{66 + mean_x:.2f}px"></div>
    {rows}
  </div>
  <div class="axline"><span class="sp"></span><span class="e"><span>{AX_LO:.0f}</span>
    <span>mean {MEAN}</span><span>{AX_HI:.0f}</span></span></div>
  <div class="hair" style="margin-top:16px"></div>
  <p class="note mono" style="margin-top:12px">Each arrow compares that window with the next
  longer one; the longest compares with the all-time mean.
  <b style="color:{UP}">&#9650;</b> better than the window below it &middot;
  <b style="color:{FLAT}">&#9644;</b> within 0.5 &middot;
  <b style="color:{DOWN}">&#9660;</b> worse.
  <b>Last 180 and last 365 are not in the log</b> — the rows are built and stay empty
  rather than carry a number that was never measured.</p>
"""
write('s5', page(5, 'The direction', 's5 — The direction',
    'Trailing windows chained against each other. T180/T365 are a designed empty state, never fabricated.',
    extra, body, 'trailing means'))

# ---------------------------------------------------------------- s6  last night
DETAIL = [('Asleep', '7h 45m'), ('In bed', '8h 12m'), ('Efficiency', '94%'),
          ('Deep', '1h 29m'), ('REM', '2h 07m'), ('Light', '4h 09m'),
          ('Awake', '27m'), ('Latency', '2m 30s'), ('Bedtime', '23:15'),
          ('Wake', '07:26'), ('HRV', '37 ms'), ('Lowest HR', '55 bpm'),
          ('Average HR', '60.1 bpm'), ('Respiration', '14.4 /min'),
          ('Restless periods', '174'), ('Readiness', '85')]
rows = ''.join(f'<div class="drow"><span class="dk mono">{k}</span>'
               f'<span class="dv mono">{v}</span></div>' for k, v in DETAIL)
extra = """
.dtbl{margin-top:18px;border-top:1px solid INK}
.drow{display:flex;justify-content:space-between;align-items:baseline;padding:8.5px 0;
  border-bottom:1px solid RULE}
.dk{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:QUIET}
.dv{font-size:13px;font-weight:500}
""".replace('INK', INK).replace('QUIET', QUIET).replace('RULE', RULE)
body = f"""  <p class="q">What actually happened?</p>
  <p class="ans">The whole night, one row per measure, nothing ranked or
  interpreted. Here to be looked up, not read.</p>
  <div class="dtbl">{rows}</div>
"""
write('s6', page(6, 'Last night', 's6 — Last night',
    'The detail table. Every value measured and unrounded.',
    extra, body, 'Oura Gen3'))
print('s5, s6 written')
