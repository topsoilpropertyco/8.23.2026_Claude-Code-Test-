# Seth's taste log — Phase 5 redesign inputs

One screenshot at a time. Nothing final until Seth says he's finished.
Two columns per pick: what he SAID, and what I OBSERVE independently.

---

## Pick 1 — v4 THE ALMANAC (hand-authored, round one, scored 21, ranked 6= of 27)

Identified from the artifact: warm paper ground, Instrument Serif headline,
IBM Plex Mono labels, one red `#B03A2B`, 1,042 prior nights as a dot field.
Viewed on phone, scrolled inside the published bake-off sheet.

### What Seth said
- Likes the **trailing block being clear** — T7 / T30 / T90.
- WANTS ADDED: **trailing 180** and **trailing 365**.
- WANTS ADDED: a **small arrow** beside each trailing number —
  green = above, yellow = about the same, red = below.
- WANTS CLEARER: the percentile. "Top 81%" or "81st percentile" —
  spell the word out rather than leaving a bare `81%` inside the sentence.
- Likes **rank out of all nights**.
- Likes the **distribution** ("standard distribution curve").

### What I observe
- **It is light mode on warm paper.** The only one of the first five that
  rejected the category's dark default outright. First real signal on ground.
- **The headline is a full sentence**, not a number: *"You slept better than
  81% of the nights you have on record."* This is the v15/v13 mechanism —
  comparison as declarative English. He credited the trailing rows and the
  curve, but the sentence is very likely what makes this screen land first.
  Flag, don't assume.
- **Hero 88 is NOT the top element.** It sits below the sentence and the
  distribution, at roughly a third the optical weight it has in other variants.
  He did not mention the 88 at all.
- The distribution is a **dot-matrix column field**, not a smooth curve — each
  dot is a night. He called it a curve. He may be responding to the *shape*
  rather than the dot technique; worth testing which he actually wants.
- Serif display + mono utility, no sans anywhere.
- **Crown nights (351 / 33.7%)** is on this screen. He didn't mention it.

### Open questions raised (resolve at compile, not now)
1. **The arrows need a defined referent.** Green/yellow/red against *what*?
   Two readings: (a) last night's 88 vs that trailing mean — under which all
   five arrows are green today, so the encoding never varies and carries no
   information; (b) each trailing window vs the next longer one, i.e. is the
   recent trend rising — under which T7 79.4 > T30 79.2 > T90 73.9 reads as a
   genuine improving trend and the colour actually moves. (b) is far more
   informative. Must confirm.
2. **T180 and T365 do not exist in the data.** DESIGN.md §6 carries T7/T30/T90
   only. Inventing them is exactly the failure mp6 was marked down for
   (a fabricated series start date). Either compute them from the real log or
   ship the rows as explicitly unavailable. Do not fabricate.
3. Three semantic colours (green/yellow/red) against DESIGN.md §4's "exactly
   one accent". Semantic status colour is legitimately separate from an accent
   — but it is a real departure from the house rule and should be recorded.
