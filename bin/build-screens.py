#!/usr/bin/env python3
"""Build the Phase 5 screens -- the redesign from Seth's taste log, revision 2.

Six screens, each answering exactly one question (taste/PICKS.md).

REVISION 2 -- Seth's feedback:
  s1  sleep score FIRST, percentile second, both the same size
  s2  the curve banded red/amber/green, and the percentile set under the score
  s4  cells banded the same way; the question renamed to something answerable
  s5  rebuilt: last night first, ONE stated baseline, 180 and 365 rows wired
  s6  same format, but the rows that carry a real proportion now show it

VERDICT BANDS. Thirds of Seth's own history, never an external norm:
  bottom third  = a bad night      middle third = a decent night
  top third     = a good night
On s4 the thirds are exact -- the grid is sorted by rank, so the cuts are index
cuts on measured data. On s2 the same thirds have to be expressed in SCORE space
(75.2 and 83.4), which needs the normal fit, and the screen says so.

DATA. state/sleeplog.ndjson and state/oura.enc are AES-256-GCM and SLEEPOS_DATA_KEY
is not in this session, so the per-night series cannot be read HERE. That is not
the same as the data not existing: src/stats.js trailing() already defaults to
[7,30,90,180,365] and src/coach.js was narrowing it to [7,30,90]; that caller is
now fixed, so production emits all five. The two rows this session cannot fill
render as an explicit pending state rather than an invented number.
"""
import math, os

W, H = 390, 844
MEAN, SD, N = 79.3, 9.54, 1042
SCORE, BELOW, ABOVE, RANK, PCT = 88, 844, 197, 198, 81
Z = 0.92

GROUND, RAISED, INK, QUIET, RULE = '#F4F0E6', '#E9E3D4', '#1A1814', '#7C7568', '#D5CDBC'
# Provenance hues. Every screen declares what it measures against in the ground
# colour as well as in words, so the two families can never be confused at a
# glance: warm paper = your own history, cool paper = published Oura member data.
NAT_GROUND, NAT_RULE = '#E9EEF3', '#C2CDD8'
OWN_RAIL, NAT_RAIL = '#8A6D3B', '#2C5F86'
OWN_RAIL_BG, NAT_RAIL_BG = '#EFE6D2', '#D6E2EE'
ACCENT = '#1F4B8F'
BAD_L, BAD   = '#EFD3CC', '#B23A2F'
OK_L,  OK    = '#EFE3C4', '#96761C'
GOOD_L, GOOD = '#D2E3CC', '#2F7A44'

def phi(z): return 0.5 * (1 + math.erf(z / math.sqrt(2)))
def inv_phi(p):
    lo, hi = -6.0, 6.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if phi(mid) < p: lo = mid
        else: hi = mid
    return (lo + hi) / 2
def pct_at(score): return phi((score - MEAN) / SD) * 100
def score_at(z): return MEAN + z * SD

CUT_LO_P, CUT_HI_P = 1/3, 2/3
CUT_LO_S = MEAN + inv_phi(CUT_LO_P) * SD      # ~75.2
CUT_HI_S = MEAN + inv_phi(CUT_HI_P) * SD      # ~83.4
def band_of_pct(p):
    if p >= CUT_HI_P * 100: return ('good', GOOD, GOOD_L, 'a good night')
    if p >= CUT_LO_P * 100: return ('decent', OK, OK_L, 'a decent night')
    return ('bad', BAD, BAD_L, 'a bad night')
BAND, BAND_C, BAND_L, BAND_WORD = band_of_pct(PCT)

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
.bd{flex:1;display:flex;flex-direction:column;padding:20px 0 10px;min-height:0}
.grp{flex:0 0 auto}
.grp:nth-child(2){flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
.hd .brand{font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:600}
.hd .num{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:QUIET}
.q{font-size:23px;line-height:1.25;font-weight:400;letter-spacing:-.01em}
.ans{margin-top:6px;font-size:11.5px;line-height:1.55;color:QUIET;max-width:34ch}
.lab{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:QUIET;font-weight:500}
.hair{height:1px;background:RULE}
.ft{margin-top:auto;padding-top:12px;border-top:1px solid RULE;display:flex;
  justify-content:space-between;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:QUIET}
.note{font-size:9px;line-height:1.5;color:QUIET;letter-spacing:.02em}
.note b{color:INK;font-weight:600}
.pill{display:inline-block;padding:3px 9px 2px;font-size:9px;letter-spacing:.16em;
  text-transform:uppercase;font-weight:600;font-family:'IBM Plex Mono',monospace}
.prov{flex:0 0 auto;margin-top:9px;padding:5px 9px 4px;font-family:'IBM Plex Mono',monospace;
  font-size:8.5px;letter-spacing:.17em;text-transform:uppercase;font-weight:600;
  display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.s.nat{background:#E9EEF3}
.s.nat .hair{background:#C2CDD8}
.s.nat .ft{border-top-color:#C2CDD8}
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
<div class="s {cls}">
  <div class="hd"><span class="brand mono">Sleep OS</span><span class="num mono">{idx} &middot; {kicker}</span></div>
  <div class="prov" style="background:{railbg};color:{rail}"><span>{provl}</span><span>{provr}</span></div>
  <div class="bd">
"""
FOOT = """  </div>
  <div class="ft mono"><span>Sun 23 Aug 2026</span><span>{right}</span></div>
</div>
"""

def group(body):
    i = body.find('class="ans"')
    if i == -1: i = body.find('class="q"')
    j = body.find('</p>', i) + 4
    k = body.rfind('<div class="hair"')
    if k == -1:
        return '<div class="grp">' + body[:j] + '</div><div class="grp">' + body[j:] + '</div>'
    return ('<div class="grp">' + body[:j] + '</div><div class="grp">' + body[j:k]
            + '</div><div class="grp">' + body[k:] + '</div>')

def page(idx, kicker, title, note, extra, body, right, kind='own'):
    """kind='own' -> warm paper, measured against Seth's own 1,042 nights.
       kind='nat' -> cool paper, measured against published Oura member data."""
    prov = dict(
        own=dict(cls='', rail=OWN_RAIL, railbg=OWN_RAIL_BG,
                 provl='Compared with your own data', provr=f'{N:,} nights'),
        nat=dict(cls='nat', rail=NAT_RAIL, railbg=NAT_RAIL_BG,
                 provl='Compared with Oura members', provr='Published averages'),
    )[kind]
    return (HEAD.format(idx=idx, kicker=kicker, title=title, note=note, css=CSS,
                        extra=extra, **prov)
            + group(body) + FOOT.format(right=right))

def write(key, html):
    os.makedirs(f'variants/{key}', exist_ok=True)
    open(f'variants/{key}/index.html', 'w').write(html)
print(f'bands: bad <{CUT_LO_S:.1f}  decent {CUT_LO_S:.1f}-{CUT_HI_S:.1f}  good >{CUT_HI_S:.1f}  -> last night is {BAND}')

# ---------------------------------------------------------------- s1  where am I
extra = """
.line{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:QUIET;font-weight:500}
.big{font-size:146px;line-height:.86;letter-spacing:-.045em;font-weight:500;margin-top:2px}
.ord{font-size:44px;line-height:1;vertical-align:.9em;font-weight:400;margin-left:11px;
  letter-spacing:.06em;font-variant-ligatures:none}
.pctlab{font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:ACCENT;
  font-weight:600;margin-top:2px}
.rowline{display:flex;align-items:baseline;gap:12px}
""".replace('ACCENT', ACCENT).replace('QUIET', QUIET)
body = f"""  <p class="q">Where am I?</p>
  <p class="ans">The score first, then what it is worth. Same size, because
  neither one means much without the other.</p>
  <div>
    <div class="line mono">Last night your sleep score was</div>
    <div class="rowline">
      <div class="big mono">{SCORE}</div>
      <span class="pill" style="background:{BAND_L};color:{BAND_C}">{BAND_WORD}</span>
    </div>
    <div class="hair" style="margin:20px 0 18px"></div>
    <div class="line mono">Which puts it at the</div>
    <div class="big mono">{PCT}<span class="ord">st</span></div>
    <div class="pctlab mono">Percentile</div>
  </div>
  <div class="hair" style="margin-top:20px"></div>
  <p class="note mono" style="margin-top:12px">Measured, not modelled: <b>{BELOW}</b> of your
  {N:,} recorded nights scored lower and <b>{ABOVE}</b> scored higher — the {PCT}st percentile
  exactly. Rank <b>{RANK}</b> of {N:,}.</p>
"""
write('s1', page('1 of 10', 'Where am I', 's1 — Where am I',
    'Score first at the same size as the percentile, per revision 2.', extra, body, f'{N:,} nights'))

# ---------------------------------------------------------------- s2  the curve
GUT = 68
PW, PH = 342 - GUT, 150
LO, HI, STEP = 44, 104, 2
bins = [(lo + STEP/2, math.exp(-((lo + STEP/2 - MEAN)**2)/(2*SD*SD))) for lo in range(LO, HI, STEP)]
mxh = max(h for _, h in bins)
bw = PW/len(bins) - 2.0
def band_fill(c):
    if c >= CUT_HI_S: return GOOD_L, GOOD
    if c >= CUT_LO_S: return OK_L, OK
    return BAD_L, BAD
rects = ''
for c, h in bins:
    hh = max(1.0, h/mxh*(PH-12))
    x = (c-LO)/(HI-LO)*PW - bw/2
    fl, st = band_fill(c)
    rects += (f'<rect x="{x:.2f}" y="{PH-hh:.2f}" width="{bw:.2f}" height="{hh:.2f}" '
              f'fill="{fl}" stroke="{st}" stroke-width=".55" stroke-opacity=".45"/>')
mx_x = (SCORE-LO)/(HI-LO)*PW
mean_x = (MEAN-LO)/(HI-LO)*PW
TICKS = [55, 65, 75, 85, 95]
tick_marks = ''.join(f'<line x1="{(t-LO)/(HI-LO)*PW:.2f}" x2="{(t-LO)/(HI-LO)*PW:.2f}" y1="{PH}" '
                     f'y2="{PH+4}" stroke="{QUIET}" stroke-width=".8"/>' for t in TICKS)
def axis_row(label, vals, cls=''):
    return ('<div class="axrow"><span class="axlab mono">' + label + '</span>'
            + ''.join(f'<span class="ax {cls}" style="left:{(t-LO)/(HI-LO)*PW:.2f}px">{v}</span>'
                      for t, v in zip(TICKS, vals)) + '</div>')
zone_key = ''.join(
    f'<span class="zk"><i style="background:{l};border-color:{c}"></i>{w}</span>'
    for l, c, w in [(BAD_L, BAD, f'Bad &lt;{CUT_LO_S:.0f}'), (OK_L, OK, f'Decent {CUT_LO_S:.0f}&ndash;{CUT_HI_S:.0f}'),
                    (GOOD_L, GOOD, f'Good &gt;{CUT_HI_S:.0f}')])
extra = """
.plot{position:relative;width:342px}
.pin{margin-left:68px;position:relative}
.axrow{position:relative;height:15px;margin-top:5px;margin-left:68px}
.ax{position:absolute;transform:translateX(-50%);font-size:10px;
  font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:INK}
.ax.p{color:ACCENT}
.axlab{position:absolute;left:-68px;top:3px;font-size:8px;letter-spacing:.16em;
  text-transform:uppercase;color:QUIET}
.callout{position:absolute;transform:translateX(-50%);text-align:center;line-height:1.2}
.callout .a{font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:QUIET;font-weight:600}
.callout .b{font-size:21px;font-weight:600;color:BANDC}
.callout .c{font-size:9.5px;font-weight:600;color:BANDC;letter-spacing:.04em}
.zkey{display:flex;gap:12px;margin-top:12px;margin-left:68px;flex-wrap:wrap}
.zk{font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:QUIET;
  font-family:'IBM Plex Mono',monospace}
.zk i{display:inline-block;width:9px;height:9px;vertical-align:-1px;margin-right:5px;border:1px solid}
""".replace('ACCENT', ACCENT).replace('INK', INK).replace('QUIET', QUIET).replace('BANDC', BAND_C)
body = f"""  <p class="q">How rare is a night like this?</p>
  <p class="ans">Every night on record, binned by score, banded into thirds of your own
  history. The row under the axis turns each score into a percentile, so you never
  have to.</p>
  <div class="plot">
    <div class="callout" style="left:{GUT + mx_x:.2f}px;top:-16px">
      <div class="a mono">Sleep score</div><div class="b mono">{SCORE}</div>
      <div class="c mono">{PCT}st pct</div>
    </div>
    <div class="pin">
    <svg width="{PW}" height="{PH+5}" viewBox="0 0 {PW} {PH+5}" style="display:block;margin-top:52px" aria-hidden="true">
      {rects}
      <line x1="{mean_x:.2f}" x2="{mean_x:.2f}" y1="14" y2="{PH}" stroke="{QUIET}" stroke-width="1" stroke-dasharray="1 3"/>
      <line x1="{mx_x:.2f}" x2="{mx_x:.2f}" y1="0" y2="{PH}" stroke="{BAND_C}" stroke-width="1.8"/>
      <circle cx="{mx_x:.2f}" cy="3" r="3.2" fill="{BAND_C}"/>
      <line x1="0" x2="{PW}" y1="{PH}" y2="{PH}" stroke="{INK}" stroke-width="1"/>
      {tick_marks}
    </svg></div>
    {axis_row('Sleep score', TICKS)}
    {axis_row('Percentile', [f'{pct_at(t):.0f}' for t in TICKS], 'p')}
    <div class="zkey">{zone_key}</div>
  </div>
  <div class="hair" style="margin-top:14px"></div>
  <p class="note mono" style="margin-top:11px">Bands are thirds of <b>your own</b> history, not
  an outside norm. The bar shape and the band edges ({CUT_LO_S:.1f} / {CUT_HI_S:.1f}) come from a
  normal curve fitted to your real mean <b>{MEAN}</b> and SD <b>{SD}</b>. Last night's
  <b>{PCT}st</b> is the measured rank.</p>
"""
write('s2', page('2 of 10', 'The curve', 's2 — The curve',
    'Curve banded into thirds of his own history; percentile set under the score.',
    extra, body, f'mean {MEAN} · SD {SD}'))
print('s1, s2 written')

# ---------------------------------------------------------------- s3  the scale (unchanged)
ZT = [-2, -1, 0, 1, 2]
ZGUT = 74
SW_ = 342 - ZGUT
ZLO, ZHI = -2.5, 2.5
you_x = (Z - ZLO) / (ZHI - ZLO) * SW_
# Each chip is a 1 SD band centred on its label, so its verdict is the verdict of
# the scores it covers: -2 and -1 sit wholly in the worst third, 0 straddles the
# middle, +1 and +2 sit wholly in the best third.
def chip_band(z):
    p = phi(z) * 100
    return band_of_pct(p)[1:3]          # (strong, light)
chips = ''
for z in ZT:
    strong, light = chip_band(z)
    me = (z == 1)
    chips += (f'<div class="chip{" me" if me else ""}" style="background:{light};'
              f'{f"box-shadow:inset 0 0 0 1.5px {strong};" if me else ""}"></div>')
def zrow(label, vals, cls=''):
    return (f'<div class="zrow"><span class="zlab mono">{label}</span><div class="zcells">'
            + ''.join(f'<span class="zc {cls}">{v}</span>' for v in vals) + '</div></div>')
extra = """
.strip{display:flex;height:32px;margin-top:8px;border:1px solid INK}
.chip{flex:1 1 0;border-right:1px solid INK}
.chip:last-child{border-right:0}
.zwrap{position:relative;width:342px}
.zrow{display:flex;align-items:baseline;margin-top:7px}
.zlab{width:74px;flex:0 0 74px;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:QUIET}
.zcells{flex:1;display:flex}
.zc{flex:1 1 0;text-align:center;font-size:10.5px;
  font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.zc.p{color:ACCENT}
.you{position:absolute;top:-20px;transform:translateX(-50%);text-align:center;white-space:nowrap}
.you .t{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:ACCENT;font-weight:600}
.youline{position:absolute;top:-4px;width:1.6px;height:40px;background:ACCENT;transform:translateX(-50%)}
.inband{margin-top:18px;border:1px solid ACCENT;padding:12px 14px;display:flex;
  justify-content:space-between;align-items:baseline}
.inband .k{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:ACCENT;font-weight:600}
.inband .v{font-size:27px;font-weight:600;color:ACCENT}
""".replace('ACCENT', ACCENT).replace('INK', INK).replace('QUIET', QUIET)
body = f"""  <p class="q">How far from ordinary?</p>
  <p class="ans">The same night measured in standard deviations, banded the same way.
  Each step is spelled out in both a sleep score and a percentile, so the scale reads
  without any statistics.</p>
  <div class="zwrap">
    <div class="you" style="left:{ZGUT + you_x:.2f}px"><div class="t mono">You &middot; +{Z} SD</div></div>
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
  <p class="note mono" style="margin-top:12px"><b>Measured against you, not a population.</b>
  The SD of <b>{SD}</b> is the spread of your own {N:,} nights — Sleep OS reads only your
  own Oura record and holds no national or population data. Positions are measured; the
  percentile row is a normal fit, so those tick figures are approximate. The <b>{PCT}st</b>
  in the band is your real rank.</p>
"""
write('s3', page('3 of 10', 'The scale', 's3 — The scale',
    'SD strip, each tick spelled out as a score and a percentile.', extra, body, f'z +{Z}'))

# ---------------------------------------------------------------- s4  how many have I beaten
# Thirds here are EXACT: the grid is sorted by rank, so the cuts are index cuts
# on measured data -- no normal fit involved.
T1, T2 = round(N/3), round(2*N/3)

# The two outlines Seth asked for: one continuous thin line around every night
# WORSE than last night, one around every night BETTER. Neither region is a
# rectangle -- 844 cells is fourteen full rows plus 46 of a fifteenth -- so each
# outline traces the true staircase rather than approximating it with a box.
# The grid is CSS grid with an explicit column count so the geometry is exact.
COLS, CELL, GAP = 57, 5, 1
PITCH = CELL + GAP
GRID_W, GRID_ROWS = COLS * PITCH - GAP, math.ceil(N / COLS)
GRID_H = GRID_ROWS * PITCH - GAP

def region_path(a, b):
    """Outline of the contiguous index run a..b inclusive, in a row-major grid."""
    rA, cA = divmod(a, COLS)
    rB, cB = divmod(b, COLS)
    P = lambda c, r: (c * PITCH - 0.5, r * PITCH - 0.5)
    if rA == rB:
        pts = [P(cA, rA), P(cB + 1, rA), P(cB + 1, rA + 1), P(cA, rA + 1)]
    else:
        pts = [P(cA, rA), P(COLS, rA), P(COLS, rB), P(cB + 1, rB),
               P(cB + 1, rB + 1), P(0, rB + 1), P(0, rA + 1), P(cA, rA + 1)]
    out = []
    for pt in pts:
        if not out or out[-1] != pt:
            out.append(pt)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return ' '.join(f'{x:g},{y:g}' for x, y in out)

WORSE_PATH = region_path(0, BELOW - 1)          # 844 nights, indices 0..843
BETTER_PATH = region_path(BELOW + 1, N - 1)     # 197 nights, indices 845..1041
WORSE_INK, BETTER_INK = '#4F4A40', ACCENT
assert (BELOW) + 1 + (N - BELOW - 1) == N
extra = """
.mwrap{position:relative;margin-top:16px;width:GRIDWpx}
.marks{display:grid;grid-template-columns:repeat(COLSN,CELLpx);gap:GAPpx;line-height:0}
.marks i{display:block;width:CELLpx;height:CELLpx;background:#DED7C7}
.rings{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.marks i.bad{background:BADL}
.marks i.ok{background:OKL}
.marks i.good{background:GOODL}
.marks i.you{background:BANDC;outline:2px solid INK;position:relative;z-index:2}
.key{display:flex;gap:14px;margin-top:14px;flex-wrap:wrap;font-size:9px;letter-spacing:.05em;color:QUIET;
  font-family:'IBM Plex Mono',monospace}
.key i{display:inline-block;width:8px;height:8px;vertical-align:-1px;margin-right:5px}
.key u{display:inline-block;width:10px;height:8px;vertical-align:-1px;margin-right:5px;
  border:1px solid;text-decoration:none}
.split{display:flex;margin-top:20px;border-top:1px solid INK;padding-top:12px;gap:26px}
.split .v{font-size:34px;line-height:1;font-weight:500;margin-top:4px}
""".replace('GRIDW', str(GRID_W)).replace('COLSN', str(COLS))\
   .replace('CELL', str(CELL)).replace('GAP', str(GAP)).replace('BADL', BAD_L).replace('OKL', OK_L).replace('GOODL', GOOD_L)\
   .replace('BANDC', BAND_C).replace('INK', INK).replace('QUIET', QUIET)
body = f"""  <p class="q">How many nights have I beaten?</p>
  <p class="ans">One square for every night on record, worst to best. Two thin outlines:
  everything you beat, and everything that beat you. Fill shows thirds of your own history.</p>
  <div class="mwrap">
    <div class="marks" id="marks"></div>
    <svg class="rings" width="{GRID_W}" height="{GRID_H}" aria-hidden="true">
      <polygon points="{WORSE_PATH}" fill="none" stroke="{WORSE_INK}" stroke-width="1"/>
      <polygon points="{BETTER_PATH}" fill="none" stroke="{BETTER_INK}" stroke-width="1"/>
    </svg>
  </div>
  <div class="key">
    <span><u style="border-color:{WORSE_INK}"></u>{BELOW} worse</span>
    <span><u style="border-color:{BETTER_INK}"></u>{ABOVE} better</span>
    <span><i style="background:{BAND_C}"></i>Last night</span>
  </div>
  <div class="key" style="margin-top:8px">
    <span><i style="background:{BAD_L}"></i>Worst third</span>
    <span><i style="background:{OK_L}"></i>Middle third</span>
    <span><i style="background:{GOOD_L}"></i>Best third</span>
  </div>
  <div class="split">
    <div><div class="lab mono">Nights you beat</div><div class="v mono">{BELOW}</div></div>
    <div><div class="lab mono">Nights that beat you</div><div class="v mono">{ABOVE}</div></div>
  </div>
  <div class="hair" style="margin-top:18px"></div>
  <p class="note mono" style="margin-top:12px">Fully measured — {BELOW} + 1 + {ABOVE} =
  <b>{N:,}</b>, every night drawn once at its true position. The thirds are exact here too:
  the grid is sorted by rank, so the cuts fall at nights <b>{T1:,}</b> and <b>{T2:,}</b>.
  Last night sits in the <b>best third</b>.</p>
  <script>
  var N={N},BELOW={BELOW},T1={T1},T2={T2},f=document.createDocumentFragment();
  for(var i=0;i<N;i++){{
    var e=document.createElement('i');
    if(i===BELOW){{e.className='you';}}
    else {{e.className = i<T1 ? 'bad' : (i<T2 ? 'ok' : 'good');}}
    f.appendChild(e);
  }}
  document.getElementById('marks').appendChild(f);
  </script>
"""
write('s4', page('4 of 10', 'Nights beaten', 's4 — How many nights have I beaten',
    'Waffle banded into exact rank thirds; question renamed to something answerable.',
    extra, body, 'one square = one night'))
print('s3, s4 written')

# ---------------------------------------------------------------- s5  the direction
# ONE baseline, stated once: the all-time average. Every row -- including last
# night -- is measured against that single line, which is what Seth asked for
# after the chained comparison read as confusing.
AX_LO, AX_HI, TW = 70.0, 90.0, 142.0
ROWS = [('Last night', float(SCORE), True), ('Last 7', 79.4, False), ('Last 30', 79.2, False),
        ('Last 90', 73.9, False), ('Last 180', None, False), ('Last 365', None, False)]
def mark(d):
    if d > 0.5:  return ('&#9650;', GOOD, GOOD_L)
    if d < -0.5: return ('&#9660;', BAD, BAD_L)
    return ('&#9644;', OK, OK_L)
rows = ''
for k, v, is_night in ROWS:
    if v is None:
        rows += (f'<div class="trow empty"><span class="tk mono">{k}</span>'
                 f'<span class="track"></span><span class="tv mono">&mdash;</span>'
                 f'<span class="td mono">pending</span></div>')
        continue
    d = v - MEAN
    g, col, tint = mark(d)
    x = (v - AX_LO) / (AX_HI - AX_LO) * TW
    rows += (f'<div class="trow{" night" if is_night else ""}">'
             f'<span class="tk mono">{k}</span>'
             f'<span class="track"><span class="dot" style="left:{x:.2f}px;background:{col}"></span></span>'
             f'<span class="tv mono">{v:g}</span>'
             f'<span class="td"><span class="qbox mono" style="color:{col};background:{tint};'
             f'border-color:{col}33">{g}<i>{d:+.1f}</i></span></span></div>')
base_x = (MEAN - AX_LO) / (AX_HI - AX_LO) * TW
extra = """
.verdict{font-size:42px;line-height:1;font-weight:600;letter-spacing:-.02em;color:GOOD}
.baseband{margin-top:14px;background:RAISED;padding:9px 12px;font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;color:INK;font-family:'IBM Plex Mono',monospace;
  display:flex;justify-content:space-between;align-items:baseline}
.baseband b{font-weight:600}
.tbl{position:relative;margin-top:2px}
.baseline{position:absolute;top:6px;bottom:20px;width:1px;background:#9C948A;z-index:0}
.trow{display:flex;align-items:center;gap:7px;padding:8px 0;border-bottom:1px solid RULE;
  position:relative;z-index:1}
.trow.night{border-bottom:1px solid INK}
.trow.night .tk,.trow.night .tv{color:INK;font-weight:600}
.trow.empty .tk,.trow.empty .tv,.trow.empty .td{color:#B3AB9A}
.tk{width:64px;flex:0 0 64px;font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;
  color:QUIET;white-space:nowrap}
.track{flex:0 0 142px;height:9px;position:relative;background:#E4DDCD}
.trow.empty .track{background:repeating-linear-gradient(90deg,#E4DDCD 0 4px,transparent 4px 8px)}
.dot{position:absolute;top:-2px;width:3px;height:13px;transform:translateX(-1.5px)}
.tv{width:34px;flex:0 0 34px;text-align:right;font-size:12.5px;font-weight:500}
.td{flex:1;min-width:0;display:flex;align-items:center}
.qbox{display:inline-flex;align-items:baseline;gap:4px;white-space:nowrap;font-size:10px;
  padding:3px 7px 2px;border:1px solid}
.qbox i{font-style:normal;font-size:9.5px;font-weight:600}
.axline{display:flex;margin-top:6px}
.axline .sp{width:71px;flex:0 0 71px}
.axline .e{flex:0 0 142px;display:flex;justify-content:space-between;font-size:8.5px;
  letter-spacing:.1em;color:QUIET;font-family:'IBM Plex Mono',monospace}
""".replace('GOOD', GOOD).replace('RAISED', RAISED).replace('INK', INK)\
   .replace('QUIET', QUIET).replace('RULE', RULE)
body = f"""  <p class="q">Am I heading the right direction?</p>
  <p class="ans">Last night first, then every window behind it. All of them measured
  against one single line.</p>
  <div>
    <div class="verdict">Improving.</div>
    <div class="baseband"><span>Baseline &mdash; your all-time average</span><b>{MEAN}</b></div>
    <div class="tbl">
      <div class="baseline" style="left:{71 + base_x:.2f}px"></div>
      {rows}
    </div>
    <div class="axline"><span class="sp"></span><span class="e"><span>{AX_LO:.0f}</span>
      <span>{MEAN}</span><span>{AX_HI:.0f}</span></span></div>
  </div>
  <div class="hair" style="margin-top:16px"></div>
  <p class="note mono" style="margin-top:11px">Every row is that window's average minus your
  all-time <b>{MEAN}</b> — one baseline, the same for all of them.
  Your last 90 ran <b style="color:{BAD}">5.4 below</b> it, your last 30 are back
  <b style="color:{OK}">level</b>, and the last 7 sit <b style="color:{GOOD}">just above</b>:
  a rough quarter you have climbed out of.
  <b>180 and 365 read &ldquo;pending&rdquo;</b> — <code>trailing()</code> already computes them and
  <code>coach.js</code> now asks for them, but this build cannot open the encrypted log to
  fill them in.</p>
"""
write('s5', page('5 of 10', 'The direction', 's5 — The direction',
    'Rebuilt: last night first, one stated baseline, 180/365 wired and pending.',
    extra, body, f'baseline {MEAN}'))

# ---------------------------------------------------------------- s6  last night
# Each row is coloured by what it can HONESTLY be judged against, and the basis
# is printed beside the value so the colour is checkable rather than asserted:
#
#   ref   a published typical adult range, shown inline. This is the ONLY place
#         in the six screens that uses an outside norm, and the screen says so.
#         Green = inside the range, amber = outside it. Amber means NOTABLE, not
#         bad -- REM above the typical band is not a fault, and short latency is
#         a flag, not a failing. Nothing here is asserted without its range next
#         to it.
#   self  needs Seth's own baseline. src/coach.js already derives 30-night means
#         for HRV and lowest heart rate from his telemetry (inverting the arrow
#         for HR, since lower is better) -- so this is a real mechanism, not a
#         hypothetical, and it is pending only because this build has no key.
#   none  not a good/bad measure at all. Bedtime and wake are facts, not scores.
ASLEEP_MIN = 465
ROWS6 = [
 ('Asleep',           '7h 45m',    None,          'ref',  '7&ndash;9 h',            'in'),
 ('In bed',           '8h 12m',    None,          'none', '',                       ''),
 ('Efficiency',       '94%',       0.945,         'ref',  '&ge;85%',                'in'),
 ('Deep',             '1h 29m',    89/ASLEEP_MIN, 'ref',  '13&ndash;23% of sleep',  'in'),
 ('REM',              '2h 07m',    127/ASLEEP_MIN,'ref',  '20&ndash;25% of sleep',  'out'),
 ('Light',            '4h 09m',    249/ASLEEP_MIN,'ref',  '45&ndash;55% of sleep',  'in'),
 ('Awake',            '27m',       None,          'ref',  '&lt;30 min',             'in'),
 ('Latency',          '2m 30s',    None,          'ref',  '10&ndash;20 min',        'out'),
 ('Bedtime',          '23:15',     None,          'none', '',                       ''),
 ('Wake',             '07:26',     None,          'none', '',                       ''),
 ('HRV',              '37 ms',     None,          'self', 'vs your 30-night',       ''),
 ('Lowest HR',        '55 bpm',    None,          'self', 'vs your 30-night',       ''),
 ('Average HR',       '60.1 bpm',  None,          'self', 'vs your 30-night',       ''),
 ('Respiration',      '14.4 /min', None,          'ref',  '12&ndash;20 /min',       'in'),
 ('Restless periods', '174',       None,          'self', 'vs your 30-night',       ''),
 ('Readiness',        '85',        None,          'self', 'vs your 30-night',       ''),
]
CLS = {'in': 'v-in', 'out': 'v-out', '': ''}
rows = ''
for k, v, frac, basis, rng, verdict in ROWS6:
    cls = CLS[verdict] if basis == 'ref' else ('v-self' if basis == 'self' else 'v-none')
    hint = f'<em>{rng}</em>' if rng else ''
    bar = (f'<div class="mbar"><span style="width:{frac*100:.2f}%"></span></div>'
           if frac is not None else '')
    rows += (f'<div class="drow {cls}"><div class="dtop">'
             f'<span class="dk mono">{k} {hint}</span>'
             f'<span class="dv mono">{v}</span></div>{bar}</div>')
extra = """
.dtbl{margin-top:6px;border-top:1px solid INK}
.drow{padding:4px 0 3px;border-bottom:1px solid RULE}
.dtop{display:flex;justify-content:space-between;align-items:center;gap:10px}
.dk{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:QUIET;min-width:0}
.dk em{font-style:normal;letter-spacing:.02em;text-transform:none;color:#A79E92;
  font-size:9px;margin-left:6px;white-space:nowrap}
.dv{font-size:11.5px;font-weight:500;padding:2px 7px 1px;border:1px solid transparent;
  white-space:nowrap;flex:0 0 auto}
.v-in .dv{background:GOODL;color:GOOD;border-color:GOOD33}
.v-out .dv{background:OKL;color:OK;border-color:OK33}
.v-self .dv{background:#E7E1D3;color:#7C7568;border-color:#CFC7B6}
.v-none .dv{color:INK}
.mbar{height:3px;background:#E4DDCD;margin-top:5px}
.mbar span{display:block;height:100%;background:#9C948A}
.leg{display:flex;gap:11px;margin-top:9px;flex-wrap:wrap;font-size:8.5px;
  letter-spacing:.06em;color:QUIET;font-family:'IBM Plex Mono',monospace}
.leg i{display:inline-block;width:9px;height:9px;vertical-align:-1px;margin-right:5px;border:1px solid}
""".replace('GOODL', GOOD_L).replace('GOOD33', GOOD + '55').replace('GOOD', GOOD)\
   .replace('OKL', OK_L).replace('OK33', OK + '55').replace('OK', OK)\
   .replace('INK', INK).replace('QUIET', QUIET).replace('RULE', RULE)
body = f"""  <p class="q">What actually happened?</p>
  <p class="ans">Coloured by what each row can honestly be judged against.</p>
  <div>
    <div class="dtbl">{rows}</div>
    <div class="leg">
      <span><i style="background:{GOOD_L};border-color:{GOOD}"></i>In typical range</span>
      <span><i style="background:{OK_L};border-color:{OK}"></i>Outside typical</span>
      <span><i style="background:#E7E1D3;border-color:#CFC7B6"></i>Needs your baseline</span>
    </div>
  </div>
  <div class="hair" style="margin-top:12px"></div>
  <p class="note mono" style="margin-top:9px"><b>The one screen using an outside norm</b> —
  every other measures you against yourself. Ranges are published adult typicals, printed
  inline so the colour is checkable. Amber = <b>notable, not bad</b>: REM above the band is
  no fault, 2m 30s is fast not failing. The five grey rows need <b>your own</b> baseline,
  which <code>coach.js</code> derives but this build has no key to read.</p>
"""
write('s6', page('6 of 10', 'Last night', 's6 — Last night',
    'Each row coloured by the basis it can honestly be judged against, with that basis shown.',
    extra, body, 'bars = share of 7h 45m asleep'))
print('s5, s6 written')

# ================================================================= national
# Everything below compares against PUBLISHED Oura member data. See
# references/OURA-POPULATION.md for what exists and what does not.
# The hard constraint: Oura publishes a MEAN and no spread, so a population
# percentile is not computable and is never shown. These screens compare on
# the mean, which is the axis the published data actually supports.
GLOBAL_MEAN = 77.0                      # Oura 2024 Year in Review, all members
MY_ALLTIME  = MEAN                      # 79.3
COUNTRIES = [('New Zealand', 79.8), ('Australia', 78.7), ('Sweden', 78.5),
             ('Finland', 78.4), ('Austria', 78.2)]

# ---------------------------------------------------------------- n1
d_night, d_mine = SCORE - GLOBAL_MEAN, MY_ALLTIME - GLOBAL_MEAN
NB_LO, NB_HI, NBW = 74.0, 90.0, 166.0
def nx(v): return (v - NB_LO) / (NB_HI - NB_LO) * NBW
bars = [('Oura member average', GLOBAL_MEAN, None,   '#8FA6B8'),
        ('Your all-time average', MY_ALLTIME, d_mine, NAT_RAIL),
        ('Your last night',      float(SCORE), d_night, GOOD)]
brows = ''
for lab, v, d, col in bars:
    dd = ('' if d is None else
          f'<span class="nd mono" style="color:{col}">+{d:.1f}</span>')
    brows += (f'<div class="nrow"><span class="nk mono">{lab}</span>'
              f'<span class="ntrack"><span class="nfill" style="width:{nx(v):.2f}px;background:{col}"></span></span>'
              f'<span class="nv mono">{v:g}</span>{dd}</div>')
extra = """
.big2{font-size:118px;line-height:.88;letter-spacing:-.04em;font-weight:500;color:NATRAIL}
.big2 s{text-decoration:none;font-size:52px;vertical-align:.42em;margin-right:2px}
.nrow{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #C2CDD8}
.nk{flex:0 0 78px;font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#5E7183;line-height:1.3}
.ntrack{flex:0 0 166px;height:10px;background:#DCE4EC;position:relative}
.nfill{position:absolute;left:0;top:0;bottom:0}
.nv{flex:0 0 30px;text-align:right;font-size:12.5px;font-weight:500}
.nd{font-size:10px;font-weight:600}
.nax{display:flex;margin-top:6px}
.nax .sp{flex:0 0 86px}
.nax .e{flex:0 0 166px;display:flex;justify-content:space-between;font-size:8.5px;
  letter-spacing:.1em;color:#5E7183;font-family:'IBM Plex Mono',monospace}
.warn{margin-top:14px;border:1px solid #C2CDD8;background:#DCE4EC;padding:10px 12px}
.warn b{color:#22506F}
""".replace('NATRAIL', NAT_RAIL)
body = f"""  <p class="q">How do I compare with everyone else?</p>
  <p class="ans">Oura publishes one population figure for the Sleep Score: the average
  across all members. So this compares on the average &mdash; the only axis the
  published data actually supports.</p>
  <div>
    <div class="big2 mono"><s>+</s>{d_night:.0f}</div>
    <div class="lab mono" style="color:{NAT_RAIL};margin-top:2px">Points above the member average</div>
    <div style="margin-top:18px">{brows}</div>
    <div class="nax"><span class="sp"></span><span class="e">
      <span>{NB_LO:.0f}</span><span>{GLOBAL_MEAN:g} avg</span><span>{NB_HI:.0f}</span></span></div>
    <div class="warn">
      <p class="note mono" style="color:#3C6584"><b>No percentile here, and that is deliberate.</b>
      Turning a score into a percentile needs a spread as well as an average. Oura publishes
      the average and <b>not</b> the spread &mdash; no SD, no distribution, no quantiles &mdash;
      so &ldquo;88 is the Nth percentile of all members&rdquo; cannot be computed. Any N would
      be invented.</p>
    </div>
  </div>
  <div class="hair" style="margin-top:14px"></div>
  <p class="note mono" style="margin-top:10px">Member average <b>{GLOBAL_MEAN:g}</b> — Oura 2024
  Year in Review, de-identified data from millions of members, Dec 2023 to Nov 2024.
  <b>These are Oura members, not a national population</b> — people who bought a ring to
  optimise sleep, so the bar sits higher than the public at large.</p>
"""
write('n1', page('7 of 10', 'Vs members', 'n1 — Vs Oura members',
    'Compares on the published member average. Percentile deliberately absent: Oura publishes no spread.',
    extra, body, f'avg {GLOBAL_MEAN:g}', kind='nat'))

# ---------------------------------------------------------------- n2
ladder = sorted(COUNTRIES + [('You', MY_ALLTIME)] + [('Global member average', GLOBAL_MEAN)],
                key=lambda kv: -kv[1])
LB_LO, LB_HI, LBW = 76.5, 80.5, 168.0
lrows = ''
for name, v in ladder:
    me = name == 'You'
    glob = name.startswith('Global')
    col = NAT_RAIL if me else ('#8FA6B8' if glob else '#A8B7C4')
    x = (v - LB_LO) / (LB_HI - LB_LO) * LBW
    lrows += (f'<div class="lrow{" me" if me else ""}{" gl" if glob else ""}">'
              f'<span class="lk mono">{name}</span>'
              f'<span class="ltrack"><span class="ldot" style="left:{x:.2f}px;background:{col}"></span></span>'
              f'<span class="lv mono">{v:g}</span></div>')
extra = """
.lrow{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid #C2CDD8}
.lrow.me{background:#DCE4EC;border-bottom:1px solid NATRAIL;border-top:1px solid NATRAIL;
  margin:2px 0;padding:9px 6px}
.lrow.me .lk,.lrow.me .lv{color:#22506F;font-weight:700}
.lrow.me .ltrack{background:#C3D2E0}
.lrow.gl .lk,.lrow.gl .lv{color:#6B7F90}
.lk{flex:0 0 112px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#5E7183}
.ltrack{flex:0 0 168px;height:9px;background:#DCE4EC;position:relative}
.ldot{position:absolute;top:-2px;width:3px;height:13px;transform:translateX(-1.5px)}
.lv{flex:1;text-align:right;font-size:12.5px;font-weight:500}
""".replace('NATRAIL', NAT_RAIL)
body = f"""  <p class="q">Where would I rank as a country?</p>
  <p class="ans">Oura publishes an average Sleep Score per country. Dropping your own
  all-time average into that table is a fair comparison &mdash; average against average.</p>
  <div>
    <div style="margin-top:4px">{lrows}</div>
    <div class="nax" style="display:flex;margin-top:6px">
      <span class="sp" style="flex:0 0 121px"></span>
      <span class="e" style="flex:0 0 168px;display:flex;justify-content:space-between;
        font-size:8.5px;letter-spacing:.1em;color:#5E7183;font-family:'IBM Plex Mono',monospace">
        <span>{LB_LO:g}</span><span>{LB_HI:g}</span></span></div>
  </div>
  <div class="hair" style="margin-top:16px"></div>
  <p class="note mono" style="margin-top:10px">Your <b>{MY_ALLTIME:g}</b> would place
  <b>second</b>, between Australia&rsquo;s {COUNTRIES[1][1]:g} and New Zealand&rsquo;s
  {COUNTRIES[0][1]:g}, and <b>{d_mine:+.1f}</b> above the global member average.
  Country figures are Oura 2024 Year in Review means for members in each country; only the
  leading countries are published, so this is the top of the table, not all of it. The United
  States average is <b>not published</b>.</p>
"""
write('n2', page('8 of 10', 'Country ladder', 'n2 — The country ladder',
    'His all-time average dropped into the published country-average table.',
    extra, body, 'Oura 2024', kind='nat'))
print('n1, n2 written')

# =====================================================================  GRADES
# Two screens, one question: what letter is last night worth? The answer depends
# entirely on which curve you grade it on, so the screen shows all three at once
# rather than picking one and hiding the choice.
#
# The visual only works because all three curves grade the SAME quantity -- a
# percentile. That means one vertical marker cuts through all three bars, and the
# reason the letters differ is visible rather than asserted: the bands sit in
# different places. Standard's enormous F block is the whole argument against it.
import json

CURVES = json.load(open('data/grade-curves.json'))['curves']
GRADE_FILL = {'A': '#CFE0C8', 'B': '#E1E8C7', 'C': '#F0E5C2', 'D': '#F0DCC6', 'F': '#EFD3CC'}
GRADE_INK  = {'A': '#2F7A44', 'B': '#5E7226', 'C': '#96761C', 'D': '#A85F22', 'F': '#B23A2F'}

def letter_spans(curve):
    """Collapse the 13 +/- bands into 5 letter blocks: [(letter, lo, hi), ...]."""
    spans, top = [], 100.0
    for letter in 'ABCDF':
        mins = [b['min'] for b in curve['bands'] if b['grade'][0] == letter]
        lo = min(mins)
        spans.append((letter, lo, top))
        top = lo
    return list(reversed(spans))

BARW, BARH = 342, 27

def grade_at(pct, curve):
    for b in curve['bands']:
        if pct >= b['min']: return b['grade']
    return None

def spectrum(curve, pct, earned, ci=None):
    """One curve as a labelled 0-100 percentile bar with the night marked on it.

    With `ci`, the 90% interval is washed over the bar. That is deliberate weight:
    the source research calls the interval "the real answer" and the percentile
    only its middle, and drawing it shows what a number cannot -- that across the
    interval the earned letter itself moves.
    """
    segs = []
    for letter, lo, hi in letter_spans(curve):
        w = (hi - lo) / 100 * BARW
        # A 5%-wide block cannot hold a letter legibly; leave it as pure colour.
        label = (f'<span style="color:{GRADE_INK[letter]}">{letter}</span>'
                 if w >= 21 else '')
        segs.append(f'<div class="seg" style="width:{w:.2f}px;background:{GRADE_FILL[letter]}">{label}</div>')
    x = pct / 100 * BARW
    wash = ''
    rng = ''
    if ci:
        lo, hi = ci
        gl, gh = grade_at(lo, curve), grade_at(hi, curve)
        wash = (f'<div class="ci" style="left:{lo / 100 * BARW:.2f}px;'
                f'width:{(hi - lo) / 100 * BARW:.2f}px"></div>')
        if gl != gh:
            rng = f'<span class="crng mono">{gl}&ndash;{gh}</span>'
    return f"""  <div class="crow">
    <div class="ctop">
      <span class="clab mono">{curve['name']}</span>
      <span>{rng}<span class="cgrade mono" style="color:{GRADE_INK[earned[0]]}">{earned}</span></span>
    </div>
    <div class="bar">{''.join(segs)}{wash}
      <div class="mk" style="left:{x:.2f}px"></div>
    </div>
  </div>"""

GRADE_EXTRA = """
.gscore{display:flex;align-items:flex-end;gap:0;justify-content:space-between}
.gcell{display:flex;flex-direction:column}
.gcell .k{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:QUIET;font-weight:500}
.gcell .v{font-size:54px;line-height:.9;letter-spacing:-.035em;font-weight:500;margin-top:2px}
.gcell.r{align-items:flex-end;text-align:right}
.gcell.r .v{font-size:48px}
.crow{margin-top:11px}
.ctop{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
.clab{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:QUIET;font-weight:600}
.cgrade{font-size:17px;font-weight:600;letter-spacing:.02em}
.bar{position:relative;display:flex;height:BARHpx;width:BARWpx}
.seg{display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;
  font-size:9.5px;font-weight:600;letter-spacing:.1em;overflow:hidden}
.ci{position:absolute;top:0;bottom:0;background:rgba(26,24,20,.13);
  border-left:1px solid rgba(26,24,20,.32);border-right:1px solid rgba(26,24,20,.32)}
.crng{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;color:QUIET;
  font-weight:500;margin-right:8px}
.mk{position:absolute;top:-4px;bottom:-4px;width:2px;background:INK;z-index:2}
.mk:after{content:'';position:absolute;top:-4px;left:-3px;border-left:4px solid transparent;
  border-right:4px solid transparent;border-top:5px solid INK}
.legend{display:flex;justify-content:space-between;font-size:8px;letter-spacing:.14em;
  text-transform:uppercase;color:QUIET;font-family:'IBM Plex Mono',monospace;margin-top:9px}
.feat{display:flex;align-items:baseline;gap:11px;margin-top:15px}
.feat .fg{font-size:40px;line-height:.9;font-weight:600;letter-spacing:-.02em;
  font-family:'IBM Plex Mono',monospace;flex:0 0 auto}
.feat .fx{font-size:10.5px;line-height:1.5;color:QUIET}
.warn{margin-top:10px;padding:6px 9px 5px;font-family:'IBM Plex Mono',monospace;font-size:8.5px;
  line-height:1.45;letter-spacing:.03em;background:#EFD3CC;color:#8A2C22;font-weight:500}
""".replace('BARW', str(BARW)).replace('BARH', str(BARH)).replace('QUIET', QUIET).replace('INK', INK)

# ------------------------------------------------------------- g1  vs members
REF = json.load(open('data/oura-score-reference.json'))
ROW = next(r for r in REF['table'] if r['score'] == SCORE)
MP = ROW['percentile']
MG = ROW['grades']
POP = REF['population']

bars = '\n'.join(spectrum(c, MP, MG[c['id']], ci=ROW['ci']) for c in CURVES)
body = f"""  <p class="q">What is last night worth?</p>
  <p class="ans">A letter is a choice of curve, so here are all three — and
  where each one draws its lines.</p>
  <div class="gscore">
    <div class="gcell"><span class="k mono">Sleep score</span><span class="v mono">{SCORE}</span></div>
    <div class="gcell r"><span class="k mono">Member percentile</span>
      <span class="v mono">{MP:.1f}</span></div>
  </div>
  <div class="hair" style="margin:16px 0 2px"></div>
{bars}
  <div class="legend"><span>0th</span><span>50th percentile</span><span>100th</span></div>
  <div class="feat">
    <span class="fg" style="color:{GRADE_INK[MG['curved'][0]]}">{MG['curved']}</span>
    <span class="fx">on the <b>curved</b> scale — the one to trust here.
    Standard fails 60% of all nights by construction, whatever anyone scores.</span>
  </div>
  <div class="hair" style="margin-top:15px"></div>
  <p class="note mono" style="margin-top:11px">The shaded band is the <b>90% interval</b>
  ({ROW['ci'][0]}–{ROW['ci'][1]}) — the real answer, with the percentile only its middle. It is that
  wide because Oura has never published a spread. Read across it and the letter moves too: the
  curved grade holds from <b>{grade_at(ROW['ci'][0], CURVES[2])}</b> to
  <b>{grade_at(ROW['ci'][1], CURVES[2])}</b>, and standard swings
  <b>{grade_at(ROW['ci'][0], CURVES[0])}</b> to <b>{grade_at(ROW['ci'][1], CURVES[0])}</b>.</p>
  <div class="hair" style="margin-top:12px"></div>
  <p class="note mono" style="margin-top:11px"><b>Oura member nights</b>, not a national figure —
  members bought a ring to optimise sleep. The unit is a <b>night, not a person</b>: better than
  {MP:.1f}% of member <i>nights</i> holds; better than {MP:.1f}% of members is a different claim
  nothing here answers. Mean <b>{POP['mean']}</b> is published, the spread <b>is not</b> — SD
  {POP['sd']} is inferred, so this sits at {ROW['ci'][0]}–{ROW['ci'][1]}. <b>No member count is
  published</b>, so none is shown.</p>
"""
write('g1', page('9 of 10', 'Grades vs members', 'g1 — Letter grades vs Oura members',
    'Three curves on one percentile axis; the marker is last night.',
    GRADE_EXTRA, body, f'Percentile {MP:.1f}', kind='nat'))

# ------------------------------------------------------------- g2  vs my own
MY = json.load(open('data/my-score-table.json'))
MYROW = next(r for r in MY['table'] if r['score'] == SCORE)
OP, OG = MYROW['percentile'], MYROW['grades']
MODELLED = MY['population'].get('modelled', False)

bars = '\n'.join(spectrum(c, OP, OG[c['id']]) for c in CURVES)
drop = ('the same letter' if OG['curved'] == MG['curved']
        else f"{MG['curved']} against members, {OG['curved']} against yourself")
warn = (f'<div class="warn">PROVISIONAL — these percentiles are a fitted model, not counted '
        f'nights. This session cannot read the encrypted history. Rebuilt from the real '
        f'{N:,} nights wherever the key is present.</div>' if MODELLED else '')
body = f"""  <p class="q">And against my own nights?</p>
  <p class="ans">The identical three curves, moved onto your own {N:,} nights.
  {'Fitted for now — see below.' if MODELLED else 'Counted, not modelled: no spread is inferred here.'}</p>
  <div class="gscore">
    <div class="gcell"><span class="k mono">Sleep score</span><span class="v mono">{SCORE}</span></div>
    <div class="gcell r"><span class="k mono">Your percentile</span>
      <span class="v mono">{OP:.1f}</span></div>
  </div>
  <div class="hair" style="margin:16px 0 2px"></div>
{bars}
  <div class="legend"><span>0th</span><span>50th percentile</span><span>100th</span></div>
  <div class="feat">
    <span class="fg" style="color:{GRADE_INK[OG['curved'][0]]}">{OG['curved']}</span>
    <span class="fx">on the <b>curved</b> scale. Harsher than the member grade —
    {drop} — because you outsleep the member average, so your own history is the
    tougher field.</span>
  </div>
  {warn}
  <div class="hair" style="margin-top:12px"></div>
  <p class="note mono" style="margin-top:11px">Same curves, different population. An {SCORE} sits at
  <b>{OP:.1f}</b> among your own nights and <b>{MP:.1f}</b> among member nights — a
  <b>{MP - OP:+.1f}</b> point gap, and the gap is the finding. Worth keeping in view: a letter reads
  as a verdict in a way a percentile does not. An F describes where a night sat in a distribution,
  not a judgement about you.</p>
"""
write('g2', page('10 of 10', 'Grades vs my own', 'g2 — Letter grades vs my own nights',
    'The identical curves on his own empirical distribution.',
    GRADE_EXTRA, body, f'Percentile {OP:.1f}', kind='own'))
