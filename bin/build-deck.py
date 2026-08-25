#!/usr/bin/env python3
"""Build web/deck.html -- the eight screens as one swipeable, clickable deck.

Each screen is embedded in its own <iframe srcdoc>. That is deliberate: the
screens are independently generated documents that reuse the same class names
(.q, .big, .hair, .track ...), so concatenating them into one document would
have them overwrite each other's styles. An iframe gives each one a real
document scope, costs nothing at this size, and keeps every screen byte-identical
to the standalone file that was verified at 390x844.

Navigation: native horizontal scroll-snap (so a phone swipe just works), plus
arrow keys, plus clickable dots. No framework, no external requests beyond the
Google Fonts the screens already use.
"""
import html, os, json

ORDER = [
    ('s1', 'Where am I',        'own'), ('s2', 'The curve',      'own'),
    ('s3', 'The scale',         'own'), ('s4', 'Nights beaten',  'own'),
    ('s5', 'The direction',     'own'), ('s6', 'Last night',     'own'),
    ('g1', 'Grade vs members',  'nat'), ('g2', 'Grade vs my own', 'own'),
]
panes, dots = '', ''
for i, (key, label, kind) in enumerate(ORDER):
    doc = open(f'variants/{key}/index.html').read()
    panes += (f'<section class="pane" id="p{i}" data-kind="{kind}">'
              f'<div class="stage"><iframe title="{label}" loading="lazy" '
              f'srcdoc="{html.escape(doc, quote=True)}"></iframe></div></section>')
    dots += (f'<button class="dot {kind}" data-i="{i}" aria-label="{label}">'
             f'<span>{i+1}</span></button>')

html_out = f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sleep OS — last night</title>
<meta name="theme-color" content="#1A1814">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{height:100%;overflow:hidden;background:#26241F;
  font-family:'IBM Plex Mono',ui-monospace,monospace;-webkit-font-smoothing:antialiased}}
#rail{{display:flex;height:100%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch;scrollbar-width:none}}
#rail::-webkit-scrollbar{{display:none}}
.pane{{flex:0 0 100%;height:100%;scroll-snap-align:center;scroll-snap-stop:always;
  display:flex;align-items:center;justify-content:center}}
.stage{{width:390px;height:844px;transform:scale(var(--k,1));transform-origin:center center;
  box-shadow:0 18px 50px -18px rgba(0,0,0,.65)}}
iframe{{width:390px;height:844px;border:0;display:block;background:#F4F0E6}}
#bar{{position:fixed;left:0;right:0;bottom:0;padding:10px 12px calc(10px + env(safe-area-inset-bottom));
  display:flex;gap:7px;justify-content:center;align-items:center;
  background:linear-gradient(to top,rgba(38,36,31,.96),rgba(38,36,31,0))}}
.dot{{width:26px;height:26px;border-radius:50%;border:1px solid #6E6862;background:transparent;
  color:#9A938B;font:600 10px/1 'IBM Plex Mono',monospace;cursor:pointer;
  display:flex;align-items:center;justify-content:center;padding:0;
  transition:background .16s,color .16s,border-color .16s}}
.dot.nat{{border-color:#5B7C97;color:#8FAEC7}}
.dot[aria-current="true"]{{background:#EFE6D2;color:#1A1814;border-color:#EFE6D2}}
.dot.nat[aria-current="true"]{{background:#D6E2EE;color:#22506F;border-color:#D6E2EE}}
.dot:focus-visible{{outline:2px solid #fff;outline-offset:2px}}
#cap{{position:fixed;top:0;left:0;right:0;padding:calc(9px + env(safe-area-inset-top)) 14px 9px;
  display:flex;justify-content:space-between;align-items:baseline;gap:10px;
  font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:#B7AFA5;
  background:linear-gradient(to bottom,rgba(38,36,31,.96),rgba(38,36,31,0));pointer-events:none}}
#cap b{{color:#F4F0E6;font-weight:600}}
@media (prefers-reduced-motion:reduce){{#rail{{scroll-behavior:auto}}}}
</style></head>
<body>
<div id="cap"><span><b>Sleep OS</b> &middot; Sun 23 Aug 2026</span><span id="ctr">1 / {len(ORDER)}</span></div>
<div id="rail">{panes}</div>
<nav id="bar" aria-label="Screens">{dots}</nav>
<script>
(function(){{
  var rail=document.getElementById('rail'), panes=[].slice.call(rail.children),
      dots=[].slice.call(document.querySelectorAll('.dot')), ctr=document.getElementById('ctr'),
      N={len(ORDER)}, cur=0;

  // Scale the fixed 390x844 screen to whatever viewport we are actually on,
  // leaving room for the caption and the dot bar. Never upscale past 1.
  function fit(){{
    var k=Math.min(1, (window.innerWidth-24)/390, (window.innerHeight-104)/844);
    document.documentElement.style.setProperty('--k', k.toFixed(4));
  }}
  function mark(i){{
    if(i===cur) return; cur=i;
    dots.forEach(function(d,j){{ d.setAttribute('aria-current', j===i?'true':'false'); }});
    ctr.textContent=(i+1)+' / '+N;
  }}
  function go(i){{
    i=Math.max(0,Math.min(N-1,i));
    panes[i].scrollIntoView({{behavior:'smooth',inline:'center',block:'nearest'}});
    mark(i);
  }}
  dots.forEach(function(d){{ d.addEventListener('click',function(){{ go(+d.dataset.i); }}); }});
  addEventListener('keydown',function(e){{
    if(e.key==='ArrowRight'||e.key===' ') {{ e.preventDefault(); go(cur+1); }}
    if(e.key==='ArrowLeft') {{ e.preventDefault(); go(cur-1); }}
    if(e.key==='Home') go(0); if(e.key==='End') go(N-1);
  }});
  // Track the pane actually in view, so swiping updates the dots too.
  if('IntersectionObserver' in window){{
    var io=new IntersectionObserver(function(es){{
      es.forEach(function(en){{ if(en.isIntersecting && en.intersectionRatio>0.55)
        mark(panes.indexOf(en.target)); }});
    }},{{root:rail,threshold:[0.55]}});
    panes.forEach(function(p){{ io.observe(p); }});
  }}
  addEventListener('resize',fit); fit(); mark(0);
  dots[0].setAttribute('aria-current','true');
}})();
</script>
</body></html>'''
os.makedirs('web', exist_ok=True)
open('web/deck.html', 'w').write(html_out)
print('wrote web/deck.html  %.2f MB  (%d screens)' % (os.path.getsize('web/deck.html')/1e6, len(ORDER)))
