#!/usr/bin/env python3
"""Build web/deck.html -- the eight screens as one scrolling dashboard.

Was a horizontal swipe-snap deck. Seth asked for a dashboard he scrolls rather
than cards he swipes, so the panes now stack vertically, each under its own
heading, with a sticky summary bar carrying last night's score, percentile and
grade so the headline is readable from anywhere in the page. On a wide screen the
panes lay out two-up; on a phone it is one column of full-width cards.

Each screen stays inside its own <iframe srcdoc>. That is not laziness: the
screens are independently generated documents reusing the same class names
(.q, .big, .hair, .track ...), so concatenating them into one document would have
them overwrite each other's styles. An iframe gives each a real document scope
and keeps every pane byte-identical to the standalone file verified at 390x844.
"""
import html, json, os

ORDER = [
    ('s1', 'Where am I',       'Score, percentile, and what it is worth',        'own'),
    ('s2', 'The curve',        'Last night on the distribution of your nights',  'own'),
    ('s3', 'The scale',        'How far from ordinary, in standard deviations',   'own'),
    ('s4', 'Nights beaten',    'One square per night, worst to best',            'own'),
    ('s5', 'The direction',    'Last night against every trailing average',      'own'),
    ('s6', 'Last night',       'What actually happened, row by row',             'own'),
    ('g1', 'Grade vs members', 'Three curves against Oura member nights',        'nat'),
    ('g2', 'Grade vs my own',  'The same three curves against your own history', 'own'),
]

NIGHT = json.load(open('data/last-night.json'))
SAMPLE = NIGHT.get('sample', False)
STALE = NIGHT.get('stale', False)
CURVES = json.load(open('data/grade-curves.json'))['curves']
MY = json.load(open('data/my-score-table.json'))


def grade(pct):
    curved = next(c for c in CURVES if c['id'] == 'curved')
    for b in curved['bands']:
        if pct >= b['min']:
            return b['grade']
    return '—'


PCT = NIGHT['standing']['percentile']
ROW = next((r for r in MY['table'] if r['score'] == NIGHT['score']), None)
GRADE = ROW['grades']['curved'] if ROW else grade(PCT)

def date_label(iso):
    if SAMPLE or not iso or len(iso) != 10:
        return 'Sample night'
    y, m, d = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
    mm, yy = (m, y) if m > 2 else (m + 12, y - 1)
    kk, jj = yy % 100, yy // 100
    h = (d + (13 * (mm + 1)) // 5 + kk + kk // 4 + jj // 4 + 5 * jj) % 7
    wd = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][h]
    mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]
    return f'{wd} {d} {mon} {y}'

panes, nav = '', ''
for i, (key, label, blurb, kind) in enumerate(ORDER):
    doc = open(f'variants/{key}/index.html').read()
    panes += (
        f'<section class="card" id="p{i}" data-kind="{kind}">'
        f'<header class="ch"><span class="cn mono">{i+1:02d}</span>'
        f'<div><h2>{label}</h2><p class="mono">{blurb}</p></div></header>'
        f'<div class="stage"><iframe title="{label}" loading="lazy" '
        f'srcdoc="{html.escape(doc, quote=True)}"></iframe></div></section>'
    )
    nav += f'<a href="#p{i}" class="nl mono {kind}"><b>{i+1:02d}</b>{label}</a>'

banner = ''
if SAMPLE:
    banner = ('<div class="warn mono">Sample data — layout only, not a real night.</div>')
elif STALE:
    banner = (f'<div class="warn mono">Showing {date_label(NIGHT["date"])} — the newest night '
              f'Oura has, {NIGHT["daysBehind"]} days back. Open the Oura app to sync.</div>')

out = f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sleep OS — {date_label(NIGHT['date'])}</title>
<meta name="theme-color" content="#1A1814">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
:root{{--ink:#F4F0E6;--dim:#9A9488;--ground:#1A1814;--raised:#221F1A;--rule:#332F28}}
html{{scroll-behavior:smooth}}
body{{background:var(--ground);color:var(--ink);
  font-family:'Newsreader',Georgia,serif;-webkit-font-smoothing:antialiased;
  padding-bottom:56px}}
.mono{{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}}
.bar{{position:sticky;top:0;z-index:20;background:rgba(26,24,20,.96);
  backdrop-filter:blur(12px);border-bottom:1px solid var(--rule);
  padding:11px 18px;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}}
.bar .brand{{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.24em;
  text-transform:uppercase;font-weight:600}}
.bar .stat{{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;
  color:var(--dim)}}
.bar .stat b{{color:var(--ink);font-weight:600}}
.bar .when{{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}}
.warn{{background:#5A2A22;color:#F6DED8;padding:9px 18px;font-size:11px;
  letter-spacing:.04em;line-height:1.5}}
.hero{{padding:34px 18px 8px;max-width:1180px;margin:0 auto}}
.hero h1{{font-size:clamp(26px,6vw,40px);font-weight:400;letter-spacing:-.02em;line-height:1.15}}
.hero p{{margin-top:9px;color:var(--dim);font-size:14px;line-height:1.6;max-width:56ch}}
.nav{{display:flex;flex-wrap:wrap;gap:7px;padding:18px 18px 4px;max-width:1180px;margin:0 auto}}
.nl{{display:inline-flex;align-items:baseline;gap:7px;padding:6px 11px;
  border:1px solid var(--rule);border-radius:2px;color:var(--dim);text-decoration:none;
  font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}}
.nl b{{color:var(--ink)}}
.nl:hover{{border-color:var(--ink);color:var(--ink)}}
.nl.nat b{{color:#8FBEE0}}
.grid{{display:grid;grid-template-columns:1fr;gap:22px;
  padding:22px 18px;max-width:1180px;margin:0 auto}}
@media(min-width:900px){{.grid{{grid-template-columns:repeat(2,1fr);gap:26px}}}}
.card{{background:var(--raised);border:1px solid var(--rule);border-radius:3px;
  overflow:hidden;scroll-margin-top:64px}}
.ch{{display:flex;gap:13px;align-items:flex-start;padding:16px 18px 14px;
  border-bottom:1px solid var(--rule)}}
.ch .cn{{font-size:10px;letter-spacing:.14em;color:var(--dim);font-weight:600;
  padding-top:3px;flex:0 0 auto}}
.ch h2{{font-size:17px;font-weight:500;letter-spacing:-.01em}}
.ch p{{margin-top:3px;font-size:10.5px;letter-spacing:.03em;color:var(--dim);line-height:1.5}}
.card[data-kind=nat] .ch{{border-bottom-color:#2C5F86}}
.stage{{display:flex;justify-content:center;padding:18px 12px 22px;background:var(--ground)}}
iframe{{width:390px;height:844px;border:0;display:block;
  box-shadow:0 1px 0 var(--rule),0 18px 40px rgba(0,0,0,.4);border-radius:2px}}
@media(max-width:430px){{
  .stage{{padding:12px 0 16px}}
  iframe{{width:390px;transform-origin:top center}}
}}
.foot{{max-width:1180px;margin:0 auto;padding:8px 18px 34px;color:var(--dim);
  font-family:'IBM Plex Mono',monospace;font-size:10px;line-height:1.7;letter-spacing:.04em}}
.top{{position:fixed;right:16px;bottom:16px;z-index:30;padding:9px 13px;
  background:var(--raised);border:1px solid var(--rule);border-radius:2px;
  color:var(--dim);text-decoration:none;font-family:'IBM Plex Mono',monospace;
  font-size:10px;letter-spacing:.14em;text-transform:uppercase}}
.top:hover{{color:var(--ink);border-color:var(--ink)}}
</style></head>
<body>
<div class="bar">
  <span class="brand">Sleep OS</span>
  <span class="stat">Score <b>{NIGHT['score']}</b></span>
  <span class="stat">Percentile <b>{PCT:g}</b></span>
  <span class="stat">Curved <b>{GRADE}</b></span>
  <span class="when">{date_label(NIGHT['date'])}</span>
</div>
{banner}
<div class="hero">
  <h1>Last night, eight ways.</h1>
  <p>The same night measured against your own {NIGHT['population']['n']:,} nights, each panel
  answering one question. Scroll, or jump straight to one.</p>
</div>
<nav class="nav">{nav}</nav>
<main class="grid">{panes}</main>
<p class="foot">Rebuilt from your own Oura record every morning — nothing here is cached from a
previous night. Measured against your own history unless a panel says otherwise; the only
outside numbers are the published adult ranges on panel 06 and the Oura member figures on
panel 07, both labelled where they appear.</p>
<a href="#" class="top mono">Top</a>
</body></html>
'''
os.makedirs('web', exist_ok=True)
open('web/deck.html', 'w').write(out)
print(f'wrote web/deck.html  {len(out)/1e6:.2f} MB  ({len(ORDER)} panels, dashboard layout)')
