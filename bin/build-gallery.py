#!/usr/bin/env python3
"""Build web/phase5-screens.html -- the six redesigned screens, presented.

Renders shots/s5/*.png into a single self-contained page. Prerequisite:
    python3 bin/build-screens.py && node bin/render.mjs shots/s5 s1=... s6=...
The built page is gitignored; re-run this to rebuild it.
"""
import base64, os

SCREENS = [
 ("s1","Where am I?","Score first, percentile second, same size","mp2, then your revision-2 note on order and size",
  "Every figure measured."),
 ("s2","How rare is a night like this?","The curve, banded and dual-labelled","v7, then your revision-2 note on colour bands",
  "Band edges and bar shape modelled and labelled; 81st is the measured rank."),
 ("s3","How far from ordinary?","The SD scale, spelled out","mp4 + your ask for a percentile under each tick",
  "Positions measured; tick percentiles modelled and labelled."),
 ("s4","How many nights have I beaten?","One square per night, banded","v15, renamed and banded in revision 2",
  "Fully measured, and the thirds are exact index cuts."),
 ("s5","Am I heading the right direction?","Last night first, one baseline","v4, rebuilt in revision 2",
  "T7/T30/T90 measured. T180/T365 now wired in code, pending the key."),
 ("s6","What actually happened?","The night in full, with real proportions","the tables you kept picking",
  "Every value measured and unrounded."),
 ("n1","How do I compare with everyone else?","Against published Oura member data","your ask for a national comparison",
  "Member average 77.0 is real. Percentile is absent because Oura publishes no spread."),
 ("n2","Where would I rank as a country?","Your average on the country ladder","your ask for a national comparison",
  "Country averages as published by Oura for 2024."),
]
RULES = [
 ("Light ground","Five picks, five light grounds. Never near-black."),
 ("Percentile in words, count in pictures","The headline speaks percentile. The raw ratio gets drawn, never narrated."),
 ("Percentile leads, rank supports","Rank is marginalia, not a headline."),
 ("Every axis is dual-labelled","Raw unit on top, percentile aligned directly beneath."),
 ("Comparable series are tabular","Aligned rows, never prose. Narrative context may be prose."),
 ("Name the unit, not the occasion","&ldquo;Sleep score 88&rdquo;, not &ldquo;Last night, 88&rdquo;."),
 ("Make it explicit","You should never have to ask what a mark means. The comparison rule is stated on screen."),
 ("One element, one screen, one question","Six screens instead of one crowded one."),
]

DECK_URL = "https://claude.ai/code/artifact/5312e387-8baf-4998-90f2-c5bba7987e34"

def b64(k):
    with open(f"shots/s5/{k}.png","rb") as f: return base64.b64encode(f.read()).decode()

cards = "".join(f'''<figure class="card">
  <figcaption class="cap">
    <span class="n mono">{i+1}</span>
    <div><h3>{q}</h3><p class="el mono">{el}</p></div>
  </figcaption>
  <img src="data:image/png;base64,{b64(k)}" width="390" height="844" loading="lazy" alt="{q}">
  <p class="src mono"><b>From</b> {src}</p>
  <p class="src mono prov"><b>Data</b> {prov}</p>
</figure>''' for i,(k,q,el,src,prov) in enumerate(SCREENS))

rules = "".join(f'<li><h4>{h}</h4><p>{b}</p></li>' for h,b in RULES)

html = f'''<title>Six Screens, One Question Each</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
/* One committed theme. These six screens are a single light-ground design, so
   there is no bake-off neutrality problem to solve here -- the surround is a
   warm stone chosen to let paper screens sit forward. Every colour explicit. */
:root{{
  --ground:#6E675E; --panel:#635D55; --well:#575249;
  --ink:#FAF7F1; --quiet:#CFC7BA; --faint:#A79E92; --rule:#847C72;
  --accent:#9DC0E0; --up:#8ED4A2;
  --serif:'Newsreader',Georgia,serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--ground);color:var(--ink);font-family:var(--serif);font-size:17px;
  line-height:1.6;padding:clamp(22px,4vw,58px) clamp(16px,4vw,44px) 90px;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1180px;margin:0 auto}}
.mono{{font-family:var(--mono);font-variant-numeric:tabular-nums}}
.eyebrow{{font-family:var(--mono);font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}}
h1{{font-size:clamp(34px,6vw,64px);line-height:1.04;letter-spacing:-.02em;font-weight:500;
  margin-top:14px;max-width:16ch;text-wrap:balance}}
.stand{{margin-top:20px;max-width:60ch;font-size:clamp(16px,1.5vw,19px);color:var(--quiet)}}
.stand b{{color:var(--ink);font-weight:500}}
.grid{{display:grid;gap:clamp(20px,2.4vw,34px);margin-top:clamp(34px,4vw,54px);
  grid-template-columns:repeat(auto-fill,minmax(290px,1fr))}}
.card{{display:flex;flex-direction:column;gap:12px}}
.cap{{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;
  border-bottom:1px solid var(--rule);padding-bottom:10px}}
.cap .n{{font-size:15px;font-weight:600;color:var(--accent)}}
.cap h3{{font-size:18px;font-weight:500;line-height:1.25;letter-spacing:-.01em}}
.el{{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-top:5px}}
.card img{{display:block;width:100%;height:auto;border:1px solid var(--rule)}}
.src{{font-size:10px;line-height:1.55;color:var(--quiet);letter-spacing:.02em}}
.src b{{color:var(--faint);letter-spacing:.14em;text-transform:uppercase;font-size:8.5px;
  display:inline-block;margin-right:5px}}
.prov{{color:var(--faint)}}
section{{margin-top:clamp(44px,5.5vw,80px);border-top:1px solid var(--rule);padding-top:18px}}
section h2{{font-size:clamp(22px,3vw,34px);font-weight:500;letter-spacing:-.02em}}
section .lede{{margin-top:10px;max-width:64ch;color:var(--quiet)}}
.rules{{list-style:none;display:grid;gap:16px;margin-top:26px;
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}}
.rules li{{background:var(--panel);padding:18px 20px;border-left:3px solid var(--accent)}}
.rules h4{{font-size:16px;font-weight:600;letter-spacing:-.01em}}
.rules p{{margin-top:7px;font-size:14.5px;color:var(--quiet)}}
.notes{{display:grid;gap:clamp(16px,2vw,26px);margin-top:26px;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}}
.note{{background:var(--panel);padding:22px 24px}}
.note h3{{font-size:18px;font-weight:600;letter-spacing:-.01em}}
.note p{{margin-top:11px;font-size:15px;color:var(--quiet)}}
.note p+p{{margin-top:9px}}
.note b{{color:var(--ink);font-weight:600}}
.note .hr{{height:1px;background:var(--rule);margin:14px 0}}
code{{font-family:var(--mono);font-size:.82em;background:var(--well);padding:1px 5px;color:var(--ink)}}
a.deck{{display:inline-block;font-family:var(--mono);font-size:13px;letter-spacing:.06em;
  background:var(--accent);color:#17202A;text-decoration:none;padding:11px 18px;font-weight:600}}
a.deck:hover{{background:#B9D4EC}}
a.deck:focus-visible{{outline:2px solid var(--ink);outline-offset:3px}}
footer{{margin-top:clamp(40px,5vw,70px);border-top:1px solid var(--rule);padding-top:16px;
  font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--faint);display:flex;flex-wrap:wrap;gap:8px 26px}}
</style>
<div class="wrap">
<header>
  <p class="eyebrow">Sleep OS &middot; Phase 5 &middot; revision 2</p>
  <h1>Six screens, one question each</h1>
  <p class="stand">You picked five screens out of twenty-seven and told me what worked in
  each. Those picks compile into eight rules, and the rules say the answer is not one
  crowded screen — it is <b>six screens that each answer exactly one thing.</b>
  Two questions run underneath all of it: <b>where am I</b>, and <b>am I heading the right
  direction.</b> The second one had never been answered before this.</p>
  <p class="stand" style="margin-top:12px"><b>Two families now.</b> Warm paper means measured
  against your own 1,042 nights. Cool blue means measured against published Oura member data.
  Every screen states which it is, in the ground colour and in words.</p>
  <p class="stand" style="margin-top:12px">Revision 2, from your notes: the score now leads
  and shares the percentile's size; the curve and the grid are banded into thirds of your own
  history; and the direction screen is rebuilt around <b>one stated baseline</b> instead of a
  chain you had to decode.</p>
</header>

<div class="grid">{cards}</div>

<section>
  <h2>Swipe them</h2>
  <p class="lede">All eight as one deck — swipe on a phone, arrow keys or the numbered
  dots on a desktop. The dots carry the same provenance colour, so you always know which
  family you are in. This link now ships at the foot of the morning Telegram reply.</p>
  <p style="margin-top:16px"><a class="deck" href="{DECK_URL}">Open the deck &rarr;</a></p>
</section>

<section>
  <h2>What your picks actually said</h2>
  <p class="lede">Compiled from five screenshots. Several of these came from what you
  <em>rejected</em>, which was sharper than what you praised.</p>
  <ul class="rules">{rules}</ul>
</section>

<section>
  <h2>Where the numbers come from</h2>
  <p class="lede">Two of your asks needed data that does not exist in this repository.
  Neither was invented.</p>
  <div class="notes">
    <div class="note">
      <h3>Trailing 180 and 365 — you were right</h3>
      <p>I said the data did not exist. It does. <code>trailing()</code> in
      <code>src/stats.js</code> already defaults to <code>[7, 30, 90, 180, 365]</code>, and
      <code>src/coach.js</code> was <b>explicitly narrowing the call to [7, 30, 90]</b> and
      throwing the other two away. That caller is now fixed, so the product emits all five.</p>
      <div class="hr"></div>
      <p>What is still true is narrower: this build cannot open the encrypted log
      (<code>SLEEPOS_DATA_KEY</code> is not present), so it cannot print the two values here.
      Screen 5 shows both rows as <b>pending</b> rather than filling them with a plausible
      number — that invention is exactly what one generated screen was marked down for
      last round.</p>
    </div>
    <div class="note">
      <h3>Measured versus modelled, kept apart</h3>
      <p>You asked for a percentile under every tick. Only <b>one</b> real anchor exists:
      score 88 sits at the 81st percentile, from the true 844/197 split.</p>
      <div class="hr"></div>
      <p>Every other tick percentile is read off a normal curve fitted to your real mean
      and SD — and that fit puts last night at the <b>82nd</b> while your measured rank is
      the <b>81st</b>, about a point apart, because 1,042 real nights are not perfectly
      normal. Screens 2 and 3 say so on the screen rather than quietly picking one.</p>
      <div class="hr"></div>
      <p>The waffle on screen 4 and the strip positions on screen 3 need no model at all —
      they run on counts and on mean, SD and z, all measured.</p>
    </div>
    <div class="note">
      <h3>The direction reading is real</h3>
      <p>Chaining each window against the next longer one turns three flat numbers into an
      answer. Your last 30 nights sit <b style="color:var(--up)">5.3 points</b> above your
      last 90; the last 7 hold steady.</p>
      <div class="hr"></div>
      <p>Read plainly: there was a bad ninety-day stretch, the last thirty have climbed out
      of it, and the last week is holding. <b>Improving.</b> That comes straight out of
      T7 79.4, T30 79.2, T90 73.9 against a lifetime mean of 79.3 — no modelling involved.</p>
    </div>
  </div>
</section>

<footer>
  <span>Night of Sunday 23 August 2026</span>
  <span>Score 88 &middot; 81st percentile &middot; rank 198 of 1,042</span>
  <span>All six verified at 390&times;844</span>
  <span>Newsreader / IBM Plex Mono</span>
</footer>
</div>
'''
os.makedirs("web", exist_ok=True)
open("web/phase5-screens.html","w").write(html)
print("wrote web/phase5-screens.html  %.2f MB" % (os.path.getsize("web/phase5-screens.html")/1e6))
