#!/usr/bin/env python3
"""Build the Phase 4 bake-off comparison sheet.

Emits web/phase4-bakeoff.html: all twenty-seven last-night screens grouped by
maker, scored against RUBRIC.md, with each screenshot embedded as a base64 PNG
so the published page has no external dependencies.

Prerequisite: render the screens first, which is what produces shots/final/*.png

    node bin/render.mjs shots/final v1=variants/v1/index.html ...

Render in batches -- the whole set takes longer than a couple of minutes.

The built page and shots/ are gitignored, matching how web/dashboard.html is
handled: it is a generated artifact, and it is large. Re-run this to rebuild it.

Two deliberate choices, both load-bearing:

  * The sheet has ONE committed theme and does not follow the viewer's. A
    theme-following ground would flatter the dark screens on a dark host and the
    light screens on a light host, which is the exact bias a bake-off must not
    have. The ground is the same fixed warm mid-grey #78756F as compare.html.

  * Cards have no fill. Every screen sits directly on that neutral grey, so the
    surround is identical for all twenty-seven. Cards separate by hairline.

Scores are the ones recorded in JUDGING.md. Ranking is on the "less motion"
basis (total minus the motion criterion) because none of the fifteen
hand-authored screens animates and the comparison has to be like for like.
"""

import base64, os, json

D = [
 # key, name, maker, direction/one-liner, [Dist,Type,Legib,Motion,Restr,Craft], accent, accentname, faces
 ("v1","The Ledger","hand","Swiss modernist print. No chart at all — the night as a hairline ruled table under a slab of type.",[4,5,5,1,4,4],"#D9401F","Vermilion","Archivo Black / IBM Plex Mono"),
 ("v2","The Night","hand","Data sculpture. The hypnogram becomes one unbroken ribbon; shape carries the data.",[3,4,3,1,3,3],"#9FC7E8","Ice","Sora Light"),
 ("v3","The Dial","hand","Watchmaker. 99 minute-ticks coloured by stage — clock and hypnogram in a single mark.",[5,4,5,1,4,4],"#E8A33D","Amber","Chivo Black / IBM Plex Mono"),
 ("v4","The Almanac","hand","Statistical annual. 1,042 prior nights as a field of marks, last night picked out in red.",[5,5,4,1,3,4],"#B03A2B","Red","Instrument Serif"),
 ("v5","The Dispatch","hand","Magazine art director. Editorial furniture — kicker, standfirst, folio.",[4,5,2,1,4,4],"#C9A227","Brass","Fraunces"),
 ("v6","The Instrument","hand","Tektronix scope and avionics. Phosphor on black, everything a readout.",[4,4,4,1,2,4],"#46F08A","Phosphor","Share Tech Mono / Barlow Condensed"),
 ("v7","The Broadsheet","hand","FT/NYT graphics desk. The comparison carried by a standfirst sentence.",[4,4,5,1,3,4],"#0D7680","Teal","Newsreader / Archivo"),
 ("v8","Ma 間","hand","Japanese negative space. The one subtractive discipline in the first fifteen — and it won its round.",[5,5,3,1,5,4],"#A8322A","Seal red","Noto Serif JP / Noto Sans JP"),
 ("v9","The Specimen","hand","Type foundry sheet. The number as specimen, set at poster scale.",[4,5,3,1,2,3],"#E4FF00","Fluoro","Anton / Space Mono"),
 ("v10","The Panel","hand","Vignelli transit signage. Signage distributes emphasis where this screen must concentrate it.",[4,2,4,1,3,4],"#FFB800","Signal","Archivo"),
 ("v11","The Chart","hand","Hospital vitals record. Its reference interval is the best single idea in the bake-off.",[5,2,3,1,2,5],"#BE3227","Chart red","Courier Prime / Barlow Condensed"),
 ("v12","The Terminal","hand","htop / k9s. One monospace face doing every job.",[4,4,5,1,2,4],"#FFB000","Amber","JetBrains Mono"),
 ("v13","The Receipt","hand","Thermal till roll. A receipt already has a grammar for comparison: the YOU SAVED line.",[5,3,4,1,1,4],"#15130F","Ink","Sono"),
 ("v14","The Seismograph","hand","Drum strip-chart recorder. A calm night is a flat trace — you read the stillness.",[5,2,3,1,3,5],"#C22E1C","Stylus","Roboto Mono / Roboto Condensed"),
 ("v15","The Brutalist","hand","Brutalist web. The comparison declared in flat English, no decoding required.",[4,5,5,1,2,4],"#FFE800","Hazard","Helvetica / system"),
 ("composite","The Composite","hand","Built from the winners: v3's dial, v15's declarative sentence, v8's restraint. Given the Phase 5 motion pass.",[4,5,5,4,4,4],"#E8A33D","Amber","Chivo Black / IBM Plex Mono"),

 ("mp1","The Plumb Line","mp","Subtractive. The hero's right edge <em>is</em> the marker — an accent rule drops from the numeral onto the percentile axis at 81%.",[3,5,5,3,3,4],"#2436D4","Blue","Schibsted Grotesk"),
 ("mp2","The Percentile","mp","Comparison-first. 81<span class=\"sup\">st</span> at 148px Bodoni; the score 88 demoted to a 30px footer mark.",[3,5,4,2,2,3],"#5B2BD9","Violet","Bodoni Moda / Public Sans"),
 ("mp3","The Night Log","mp","Editorial photographic. Night ground, scrim, grain — and an italic standfirst carrying the comparison as a sentence.",[3,4,4,1,2,3],"#E0457B","Pink","Bodoni Moda / IBM Plex Sans"),
 ("mp4","The Dyed Swatch","mp","Colour as data, no chart anywhere. The ground <em>is</em> the datum — dyed to +1 SD, with a calibration key to read it by.",[5,5,5,1,2,4],"#2F5F3F","Dye green","Bodoni Moda / Spectral"),
 ("mp5","The Woven Band","mp","Physical object. All 24 real hypnogram segments as the weft of a woven band — selvedge, sheen, knotted fringe.",[5,4,3,1,2,4],"#25409B","Blue","Jost / DM Mono"),
 ("mp6","The Plate","mp","<strong>Free — no direction given.</strong> An engraved statistical plate; the 88 sits directly on its own marker.",[3,4,5,1,2,2],"#2E4EA7","Blue","Bodoni Moda / Libre Franklin"),

 ("lv1","Subtractive","lv","The only screen in twenty-seven that cuts something and says so: <em>“No stages. No heart rate.”</em>",[3,5,5,4,5,4],"#7A1F3D","Claret","Bodoni Moda / Karla"),
 ("lv2","Comparison-first","lv","81 at 188px Big Shoulders over a filled normal curve; the score relegated to a raised footer plate.",[2,4,5,3,3,3],"#0A84C4","Blue","Big Shoulders Display / Bricolage Grotesque"),
 ("lv3","Dense shadcn","lv","<strong>The control.</strong> Its own default vocabulary, asked for at its best — and round one's exact failure reproduced.",[1,3,3,3,1,4],"#2F7D32","Green","Manrope"),
 ("lv4","Rulebreak","lv","Deliberately anti-shadcn. Zero radius, magenta, the night drawn in 50 block-glyph character cells.",[4,4,3,3,2,2],"#FF2E93","Magenta","Syne / Familjen Grotesk / Spline Sans Mono"),
 ("lv5","Free","lv","<strong>Free — no direction given.</strong> The distribution turned on its side, standing beside a 156px Playfair 88.",[4,5,5,3,2,4],"#0E8C7F","Teal","Playfair Display / Outfit"),
]

CRIT = ["Distinct","Type","Legib","Motion","Restraint","Craft"]
MAKER = {"hand":"Hand-authored","mp":"Magic Patterns","lv":"Lovable"}

def less(s): return sum(s) - s[3]

# combined rank on the less-motion basis, ties share a rank
order = sorted(D, key=lambda r: -less(r[4]))
ranks, prev, rk = {}, None, 0
for i, r in enumerate(order):
    lm = less(r[4])
    if lm != prev: rk = i + 1; prev = lm
    ranks[r[0]] = rk
tied = {}
for r in D: tied[ranks[r[0]]] = tied.get(ranks[r[0]], 0) + 1

def b64(k):
    with open(f"shots/final/{k}.png","rb") as f:
        return base64.b64encode(f.read()).decode()

def chips(s):
    out = []
    for name, v in zip(CRIT, s):
        out.append(f'<div class="chip lv{v}"><span class="cn">{name}</span><span class="cv">{v}</span></div>')
    return "".join(out)

def card(r):
    key, name, maker, note, s, acc, accname, faces = r
    rank = ranks[key]
    t = sum(s); lm = less(s)
    shared = tied[rank] > 1
    return f'''<article class="card">
  <header class="chead">
    <div class="rank"><span class="rnum">{rank}</span><span class="rlab">{"=" if shared else ""}</span></div>
    <div class="cid">
      <h3>{name}</h3>
      <p class="ckey">{key.upper()} &middot; {MAKER[maker]}</p>
    </div>
    <div class="ctot"><span class="tv">{lm}</span><span class="tl">of 25</span></div>
  </header>
  <p class="cnote">{note}</p>
  <figure class="shot">
    <img src="data:image/png;base64,{b64(key)}" width="390" height="844" loading="lazy"
         alt="{name} — the last-night screen at 390 by 844">
  </figure>
  <div class="cmeta">
    <span class="swatchline"><i class="sw" style="background:{acc}"></i>{accname}</span>
    <span class="faces">{faces}</span>
  </div>
  <div class="chips">{chips(s)}</div>
  <p class="cmotion">Total with motion <b>{t}</b> of 30</p>
</article>'''

def section(mk, blurb):
    rows = sorted([r for r in D if r[2] == mk], key=lambda r: -less(r[4]))
    return f'''<section class="maker" id="{mk}">
  <div class="mhead">
    <h2>{MAKER[mk]}</h2>
    <span class="mcount">{len(rows)} screens</span>
  </div>
  <p class="mblurb">{blurb}</p>
  <div class="grid">{"".join(card(r) for r in rows)}</div>
</section>'''

podium = sorted(D, key=lambda r: (-less(r[4]), r[0]))[:6]
pod = "".join(
  f'<li><span class="pr">{ranks[r[0]]}{"=" if tied[ranks[r[0]]]>1 else ""}</span>'
  f'<span class="pn">{r[1]}</span><span class="pm">{MAKER[r[2]]}</span>'
  f'<span class="ps">{less(r[4])}</span></li>' for r in podium)

EV = [
 ("The typefaces converged, hard.",
  "Five of eleven independently chose <strong>Bodoni Moda</strong> — mp2, mp3, mp4, mp6 and lv1 — across two tools sharing no prompt beyond a ban list of the fifteen faces already used. lv5 reached for Playfair Display, the same didone instinct. Given a free choice of every face on Google Fonts, two unrelated generators picked the same display serif more often than not."),
 ("Both free runs landed on ground the fifteen already held.",
  "The honest read on a tool is what it does with no direction. Magic Patterns unprompted made an engraved statistical plate — v4 The Almanac's territory. Lovable unprompted made an editorial serif screen on warm paper — adjacent to v5 The Dispatch. Neither invented a form the hand-authored set lacked."),
 ("Two makers invented the identical mechanism.",
  "mp1 and lv1 both land the hero's <em>right edge</em> on the percentile mark of the rule beneath it. Same device, same geometry — <strong>301.02px in both</strong>. Different tools, same brief, one answer. That is convergence measurable to two decimal places."),
 ("All eleven share a build habit the fifteen do not.",
  "Every generated screen is a flex column with <code>margin-top: auto</code> on a footer, authored for content that under-fills a fixed 844px. So every one carries a dead void, from 100px up to roughly 300px in lv4. Eight of eleven then fill the lower half with a two-column ledger of eight to eighteen rows. That is not eleven designers; it is one habit expressed eleven times."),
 ("Restraint failed systematically — and not for round two's reason.",
  "Nine of eleven scored 1–2 on restraint. Round two blamed borrowed forms for being maximal by nature, but these were not borrowing. <strong>Generators default to completeness.</strong> Given seventeen values they will place seventeen values; “subtractive” had to be said out loud to get anything else."),
 ("Where they won, they won on things a brief can specify.",
  "The two real gains are both portable mechanisms, not styles: lv1's <em>declared</em> subtraction, and mp4's pre-attentive colour channel. Every other novel form here traces directly to a direction line in the brief."),
]
ev = "".join(
  f'<li><span class="en">{i+1}</span><div><h4>{h}</h4><p>{b}</p></div></li>'
  for i,(h,b) in enumerate(EV))

html = f'''<title>The Maker Diversity Bake-Off</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gabarito:wght@500;600;700;900&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Martian+Mono:wght@400;500;700&display=swap">
<style>
/* ---------------------------------------------------------------------------
   SINGLE COMMITTED THEME, ON PURPOSE. This sheet does not follow the viewer's
   theme and has no dark/light variants. A theme-following ground would flatter
   the dark screens on a dark host and the light screens on a light host, which
   is precisely the bias a bake-off must not have. The ground is the same fixed
   warm mid-grey #78756F the live compare.html uses, for the same reason.
   Every colour below is explicit.
   --------------------------------------------------------------------------- */
:root{{
  --ground:#78756F; --panel:#69665F; --well:#5D5A54;
  --ink:#FBFAF8; --ink-quiet:#C9C4BC; --ink-faint:#A8A39B;
  --rule:#8B8880; --rule-soft:#827E77;
  --accent:#8FB2C6;
  --display:'Gabarito',system-ui,sans-serif;
  --prose:'Source Serif 4',Georgia,serif;
  --data:'Martian Mono',ui-monospace,monospace;
  --maxw:1400px;
}}
*{{box-sizing:border-box;margin:0;padding:0}}
html{{-webkit-text-size-adjust:100%}}
body{{background:var(--ground);color:var(--ink);font-family:var(--prose);
  font-size:16px;line-height:1.6;padding:clamp(20px,4vw,56px) clamp(16px,4vw,44px) 96px;
  -webkit-font-smoothing:antialiased}}
.sheet{{max-width:var(--maxw);margin:0 auto}}
.eyebrow{{font-family:var(--data);font-size:10px;font-weight:500;letter-spacing:.22em;
  text-transform:uppercase;color:var(--accent)}}
h1{{font-family:var(--display);font-weight:900;font-size:clamp(34px,6.2vw,68px);
  line-height:1.02;letter-spacing:-.03em;margin-top:14px;text-wrap:balance;max-width:19ch}}
.standfirst{{font-size:clamp(16px,1.5vw,19px);line-height:1.55;color:var(--ink);
  max-width:62ch;margin-top:20px}}
.standfirst em{{color:var(--accent);font-style:italic}}

/* verdict ------------------------------------------------------------------ */
.verdict{{margin-top:clamp(30px,4vw,52px);background:var(--panel);
  border-top:2px solid var(--accent);padding:clamp(22px,3vw,36px)}}
.verdict h2{{font-family:var(--display);font-weight:700;font-size:clamp(22px,2.6vw,32px);
  line-height:1.15;letter-spacing:-.02em;max-width:34ch;text-wrap:balance}}
.verdict .q{{font-family:var(--data);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--ink-faint);margin-bottom:12px}}
.verdict p{{max-width:66ch;margin-top:16px;color:var(--ink-quiet)}}
.verdict p strong{{color:var(--ink)}}
.gains{{display:grid;gap:14px;margin-top:24px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}}
.gain{{background:var(--well);padding:18px 20px;border-left:3px solid var(--accent)}}
.gain h3{{font-family:var(--display);font-weight:600;font-size:15px;letter-spacing:-.01em}}
.gain p{{font-size:14.5px;margin-top:8px;color:var(--ink-quiet);max-width:none}}

/* podium + spend ----------------------------------------------------------- */
.strips{{display:grid;gap:clamp(16px,2vw,26px);margin-top:clamp(26px,3vw,40px);
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}}
.strip{{background:var(--panel);padding:22px 24px}}
.strip h3{{font-family:var(--data);font-size:10px;font-weight:500;letter-spacing:.2em;
  text-transform:uppercase;color:var(--ink-faint);padding-bottom:12px;
  border-bottom:1px solid var(--rule)}}
.podium{{list-style:none}}
.podium li{{display:grid;grid-template-columns:2.6em 1fr auto 2.6em;align-items:baseline;
  gap:10px;padding:9px 0;border-bottom:1px solid var(--rule-soft)}}
.podium li:last-child{{border-bottom:0}}
.pr{{font-family:var(--data);font-size:12px;font-weight:700;color:var(--accent)}}
.pn{{font-family:var(--display);font-weight:600;font-size:15px}}
.pm{{font-family:var(--data);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-faint)}}
.ps{{font-family:var(--data);font-size:14px;font-weight:700;text-align:right;
  font-variant-numeric:tabular-nums}}
.spend{{list-style:none}}
.spend li{{display:flex;justify-content:space-between;align-items:baseline;gap:16px;
  padding:9px 0;border-bottom:1px solid var(--rule-soft);font-size:14.5px;color:var(--ink-quiet)}}
.spend li:last-child{{border-bottom:0}}
.spend b{{font-family:var(--data);font-size:13px;color:var(--ink);
  font-variant-numeric:tabular-nums;white-space:nowrap}}

/* maker sections ----------------------------------------------------------- */
.maker{{margin-top:clamp(46px,6vw,84px)}}
.mhead{{display:flex;align-items:baseline;gap:16px;border-top:1px solid var(--rule);
  padding-top:16px;flex-wrap:wrap}}
.mhead h2{{font-family:var(--display);font-weight:700;font-size:clamp(22px,3vw,34px);
  letter-spacing:-.02em}}
.mcount{{font-family:var(--data);font-size:10px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--accent)}}
.mblurb{{max-width:70ch;margin-top:10px;color:var(--ink-quiet);font-size:15.5px}}
.grid{{display:grid;gap:clamp(18px,2.2vw,30px);margin-top:28px;
  grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}}

/* card --------------------------------------------------------------------- */
.card{{background:transparent;border:1px solid var(--rule-soft);padding:17px;
  display:flex;flex-direction:column;gap:14px}}
.chead{{display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:12px;
  border-bottom:1px solid var(--rule);padding-bottom:12px}}
.rank{{font-family:var(--data);display:flex;align-items:baseline}}
.rnum{{font-size:19px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}}
.rlab{{font-size:12px;color:var(--accent)}}
.cid h3{{font-family:var(--display);font-weight:700;font-size:18px;letter-spacing:-.015em;
  line-height:1.2}}
.ckey{{font-family:var(--data);font-size:9px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--ink-faint);margin-top:4px}}
.ctot{{text-align:right;font-family:var(--data);line-height:1}}
.tv{{display:block;font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}}
.tl{{display:block;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-faint);margin-top:5px}}
.cnote{{font-size:14.5px;line-height:1.5;color:var(--ink-quiet)}}
.cnote em{{color:var(--ink);font-style:italic}}
.cnote strong{{color:var(--ink)}}
.sup{{font-size:.7em;vertical-align:.4em}}
.shot{{background:#000;border:1px solid var(--rule)}}
.shot img{{display:block;width:100%;height:auto}}
.cmeta{{display:flex;flex-wrap:wrap;gap:6px 16px;font-family:var(--data);font-size:9px;
  letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}}
.sw{{display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:-1px;
  margin-right:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}}
.faces{{flex:1;min-width:0}}
.chips{{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:auto}}
.chip{{display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 2px 6px;
  background:var(--well);border-top:2px solid var(--rule-soft)}}
.cn{{font-family:var(--data);font-size:7px;letter-spacing:.04em;text-transform:uppercase;
  color:var(--ink-faint);text-align:center;line-height:1.1}}
.cv{{font-family:var(--data);font-size:14px;font-weight:700;line-height:1;
  font-variant-numeric:tabular-nums}}
/* score encoded in form as well as number */
.chip.lv1{{border-top-color:#5C5954}} .chip.lv1 .cv{{color:var(--ink-faint)}}
.chip.lv2{{border-top-color:#6E6A63}} .chip.lv2 .cv{{color:var(--ink-faint)}}
.chip.lv3{{border-top-color:#9A958C}} .chip.lv3 .cv{{color:var(--ink-quiet)}}
.chip.lv4{{border-top-color:#C6C0B6}} .chip.lv4 .cv{{color:var(--ink)}}
.chip.lv5{{border-top-color:var(--accent);background:#5E7A88}} .chip.lv5 .cv{{color:#FFF}}
.cmotion{{font-family:var(--data);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-faint)}}
.cmotion b{{color:var(--ink-quiet)}}

/* evidence ---------------------------------------------------------------- */
.evidence{{margin-top:clamp(46px,6vw,84px);border-top:1px solid var(--rule);padding-top:16px}}
.evidence h2{{font-family:var(--display);font-weight:700;font-size:clamp(22px,3vw,34px);
  letter-spacing:-.02em}}
.evidence .lede{{max-width:66ch;margin-top:12px;color:var(--ink-quiet)}}
.evlist{{list-style:none;margin-top:30px;display:grid;gap:20px}}
.evlist li{{display:grid;grid-template-columns:auto 1fr;gap:18px;background:var(--panel);
  padding:20px 22px}}
.en{{font-family:var(--data);font-size:13px;font-weight:700;color:var(--accent);
  font-variant-numeric:tabular-nums}}
.evlist h4{{font-family:var(--display);font-weight:600;font-size:17px;letter-spacing:-.015em;
  line-height:1.25;text-wrap:balance}}
.evlist p{{margin-top:8px;color:var(--ink-quiet);max-width:74ch;font-size:15px}}
.evlist strong{{color:var(--ink)}}
.evlist em{{color:var(--ink);font-style:italic}}
code{{font-family:var(--data);font-size:.84em;background:var(--well);padding:1px 5px;
  color:var(--ink)}}

.notes{{margin-top:clamp(30px,4vw,48px);display:grid;gap:clamp(16px,2vw,26px);
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}}
.note{{background:var(--panel);padding:24px}}
.note h3{{font-family:var(--display);font-weight:700;font-size:19px;letter-spacing:-.015em}}
.note p{{margin-top:12px;color:var(--ink-quiet);font-size:15px}}
.note p+p{{margin-top:10px}}
.note strong{{color:var(--ink)}}
.note em{{color:var(--ink);font-style:italic}}
.rule{{height:1px;background:var(--rule);margin:14px 0}}

footer{{margin-top:clamp(40px,5vw,70px);border-top:1px solid var(--rule);padding-top:18px;
  font-family:var(--data);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--ink-faint);display:flex;flex-wrap:wrap;gap:8px 26px}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}}}
</style>

<div class="sheet">
<header>
  <p class="eyebrow">Sleep OS · Phase 4 · round three</p>
  <h1>Did the generators find anything new?</h1>
  <p class="standfirst">Twenty-seven versions of one mobile screen — the last-night screen, which
  answers <em>how did I sleep, and how does that compare to every night before it?</em>
  Sixteen were hand-authored by a single model. Six came from Magic Patterns, five from Lovable.
  Same night, same unrounded values, same rubric written before any of them existed.
  This round changes the <em>maker</em>, and asks whether that changes the work.</p>
</header>

<section class="verdict">
  <p class="q">The question this round exists to settle</p>
  <h2>Largely no. The novelty tracked the brief, not the maker.</h2>
  <p>The generators converged on each other's typefaces, re-derived each other's mechanisms to
  two decimal places, shared a layout habit none of the sixteen has, and returned to
  hand-authored territory whenever they were left to choose. <strong>No generated screen beat
  the hand-authored 22. One tied it.</strong> They also produced the two lowest-scoring screens
  of the twenty-seven. Median: hand-authored <strong>19</strong>, generated <strong>17</strong>.</p>
  <p>But it is a split, not a shutout — because two ideas came out of it that fifteen
  hand-authored attempts never reached:</p>
  <div class="gains">
    <div class="gain">
      <h3>lv1 finally answers the restraint criterion</h3>
      <p>The first screen in twenty-seven to cut something obviously useful and be stronger for
      it — no stages, no vitals, no hypnogram — and then <em>name the cut on screen</em>:
      “No stages. No heart rate.” Fifteen hand-authored attempts never managed it.</p>
    </div>
    <div class="gain">
      <h3>mp4 makes the comparison pre-attentive</h3>
      <p>Every other screen here, hand-authored or generated, makes you read something. mp4's
      ground <em>is</em> the value — dyed to +1 SD, with a key to read it by. You see the answer
      before you decide to look. That channel was untested before this round.</p>
    </div>
  </div>
</section>

<div class="strips">
  <div class="strip">
    <h3>Top of all twenty-seven · motion subtracted</h3>
    <ol class="podium">{pod}</ol>
  </div>
  <div class="strip">
    <h3>What it cost</h3>
    <ul class="spend">
      <li><span>Magic Patterns generations</span><b>6 of 6 · 0 re-rolls</b></li>
      <li><span>Lovable messages</span><b>1 · 9.3 credits</b></li>
      <li><span>Lovable projects</span><b>1 project, 5 routes</b></li>
      <li><span>Generations re-run because output was off</span><b>none</b></li>
      <li><span>Defects found by rendering</span><b>17 · 13 fixed</b></li>
    </ul>
  </div>
</div>

{section("hand","Fifteen independent treatments plus the composite built from the winners. All sixteen hand-authored by one model, varying the reference discipline but never the maker. None of the fifteen animates, so all fifteen score 1 on motion; the composite was given a dedicated motion pass.")}
{section("mp","Six generations, one per direction, zero re-rolls. Five directions were named in the brief; mp6 was given the brief with no direction line at all, which makes it the honest read on the tool's own defaults.")}
{section("lv","One project, five routes, one message. Lovable builds React, Tailwind and shadcn, so lv3 deliberately asks for the best version of the screen it wants to make anyway — the control — and lv4 pushes hard the other way. lv5 was given no direction.")}

<section class="evidence">
  <h2>The evidence</h2>
  <p class="lede">Six findings, all pointing the same way. Each is a measurement, not an
  impression.</p>
  <ol class="evlist">{ev}</ol>
</section>

<div class="notes">
  <div class="note">
    <h3>What only rendering caught</h3>
    <p>Round two found seven bugs that reading the source did not. Round three found
    <strong>seventeen</strong> across eleven screens — thirteen fixed in code, four left in place
    as findings.</p>
    <div class="rule"></div>
    <p>The harness needed fixing first, and it would have silently corrupted every judgement
    here: <strong>headless chromium does not advance the CSS animation clock reliably.</strong>
    Every generated screen animates in from <code>opacity: 0</code> with a filled entrance, so
    screenshotted naively they capture at their <em>start</em> state — mp1's hero measured
    <code>opacity: 0</code> and photographed grey instead of ink, and all five Lovable screens
    would have come out blank. Fix: settle every animation to its end before the shutter.</p>
    <div class="rule"></div>
    <p>Two named traps fired exactly as predicted. <strong>Uppercase turned σ into Σ</strong> in
    mp6's footer. <strong>A chart outgrew its container</strong> — lv4's 50-cell glyph run
    measured 362px inside 350px, breaking its own gutter and aligning with nothing.</p>
  </div>
  <div class="note">
    <h3>Generators invent facts; hand-authoring miscounts pixels</h3>
    <p>This is the sharper result. Round two's seven bugs were all layout faults. Of round
    three's seventeen, <strong>four are data-integrity failures</strong>.</p>
    <div class="rule"></div>
    <p>mp6 wrote <em>“Kept nightly since 12 October 2023”</em> — a date that appears nowhere in
    the data; the series starts 25 August 2023. It also presented its plot's own axis bounds as
    the observed range of the night scores. And two independent generations made the same
    off-by-one on nights above: 844 + 198 = 1,042 double-counts the night itself. It is 844
    below, this night, then 197 above.</p>
    <div class="rule"></div>
    <p>On a screen whose only job is to be trusted about numbers, that failure mode is worse
    than a misaligned rule — and <strong>no amount of looking at a screenshot catches it.</strong>
    It needs someone who knows what the data actually says.</p>
  </div>
  <div class="note">
    <h3>Where the tools drifted</h3>
    <p><strong>Neither tool refused anything.</strong> No direction was declined, no constraint
    pushed back on.</p>
    <div class="rule"></div>
    <p>Magic Patterns drifted to the category's default hue — mp2's accent is a blue-violet,
    the exact family the design doc names as the in-category default, despite a ban list of
    fourteen hex values. It also did not deliver the photographic direction: asked for the one
    thing none of the fifteen has, it produced gradients and a grain invisible at
    <code>soft-light</code> over near-black, closing back onto a dark gradient screen.</p>
    <div class="rule"></div>
    <p>Lovable was the better instruction-follower: it guarded μ and σ against the uppercase
    trap unprompted in three routes, used <code>white-space: pre</code> correctly, ran its own
    headless checks while building, and self-corrected an accent overuse before finishing.
    Magic Patterns shipped the Σ bug.</p>
    <div class="rule"></div>
    <p>And the thing Lovable most wants to build is the thing this spec least wants: lv3, its own
    default asked for at its best, scores <strong>12 of 25</strong> — last of twenty-seven.</p>
  </div>
</div>

<footer>
  <span>Night of Sunday 23 August 2026</span>
  <span>Score 88 · 81st percentile · rank 198 of 1,042</span>
  <span>All screens 390×844, verified</span>
  <span>Ground fixed at #78756F so no screen is flattered</span>
</footer>
</div>
'''
open("web/phase4-bakeoff.html","w").write(html)
print("wrote web/phase4-bakeoff.html  %.2f MB" % (os.path.getsize("web/phase4-bakeoff.html")/1e6))
