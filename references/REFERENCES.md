# Reference set

Mined from Mobbin, 2026-08-24. 18 screens across three buckets. Every note is a
concrete observation about a specific decision, not a vibe.

Framer's MCP is not connected; motion values came from motion.dev directly and
nothing was lost. See `references/MOTION.md`.

---

## Bucket 1 — In-category (studying what to avoid)

| App | The specific thing | Link |
|---|---|---|
| **Bevel** | Hypnogram drawn *with* dotted gridlines and axis ticks, then a 2×2 tile grid where each tile pairs a value with a tiny progress ring. Two competing visual systems on one screen. | [screen](https://mobbin.com/screens/c4c2dd72-1d95-431b-898f-ad415b4f5c39) |
| **Eight Sleep** | The "79" is the largest numeral in the category at roughly 64px, set inside a semicircular arc built from ~120 fine radial ticks. The tick arc is genuinely lovely; the number is still too small to be dominant. | [screen](https://mobbin.com/screens/752cd0a8-8a8b-4d09-a116-4e0cab9f18c4) |
| **Apple Health** | Score reduced to a word ("High") with the 84 buried inside a three-segment donut. Three contributor lines with coloured dots. Blue-violet on white. | [screen](https://mobbin.com/screens/7aecb44c-8dfc-46e9-883e-86eb5301ea19) |
| **Pillow** | A stacked bar with a four-item legend (AWAKE / REM / LIGHT / DEEP), then the same four values repeated as full-width purple gradient cards. The legend and the cards say the same thing twice. | [screen](https://mobbin.com/screens/53510f22-0b0a-49b5-bbfd-eb11c075890c) |
| **WHOOP** | Overnight heart-rate line with a labelled y-axis (30/60/90), then four labelled bars with percentages *and* durations. Dense and competent; nothing is dominant. | [screen](https://mobbin.com/screens/f91de068-fb36-4d69-a8d0-5c5b77404fb0) |
| **Ultrahuman** | Sets "84 Sleep Index" at ~15px in the top-left corner and gives the whole screen to a teal hypnogram. Actively demotes its own headline number. | [screen](https://mobbin.com/screens/8e72e1f1-2c1b-4830-ad0b-70bf82561544) |

**The finding.** Six apps, one screen. Every one has a ring or a hypnogram, a
row or grid of stats, and cool blue/purple/teal on near-black. **Not one makes
the number genuinely large.** The biggest is Eight Sleep at ~64px — under 4× its
own body text. The category has collectively decided the score is a *label* on a
chart rather than the answer to the question. That is the opening.

## Bucket 2 — Adjacent mood (calm, night, one-number-at-a-glance)

| App | The specific thing | Link |
|---|---|---|
| **(Not Boring) Weather** | The "18" is rendered as an extruded 3D solid occupying roughly 40% of the viewport height, with the forecast strip reduced to 11px beneath it. Proof that display scale is a design decision, not a constraint. | [screen](https://mobbin.com/screens/55b22e88-7f3f-4c78-80f3-03476719ea4c) |
| **Lumy** | A ruled table on near-black: icon and label flush left, value flush right, hairline rule between rows, one cyan accent on the values only. No cards, no borders, no shadows — the rules do all the structural work. | [screen](https://mobbin.com/screens/491f5781-df9b-46ea-86ec-fb258a83d369) |
| **Apple Weather** | 27° at ~96px in ultralight over a photographic sky; condition and H/L at 17px directly beneath, centred. Big, but conventional — the contrast is only about 5:1. | [screen](https://mobbin.com/screens/19c0e840-fd25-46f0-beca-25889871bc2d) |
| **Flighty** | "27°C" set left-aligned at ~44px with the condition stacked beneath, and a huge ghosted "783 Departures" bleeding off the bottom edge — type used as background texture. | [screen](https://mobbin.com/screens/cb11a929-00a9-438e-bd42-c7f08b2214f5) |
| **komoot** | Warm oat ground (#F2EFE6-ish) with olive green as the single action colour. Light mode that reads as considered rather than clinical — the antidote to white-and-blue. | [screen](https://mobbin.com/screens/512c443a-b38a-4347-8dbd-83538c95e13e) |
| **The Weather Channel** | Opens with a full sentence — "It's 52° and partly cloudy." — at ~28px serif-adjacent, instead of a number and a label. The prose *is* the headline. | [screen](https://mobbin.com/screens/2a9e8135-5669-4923-a97b-48fed3144d5e) |

## Bucket 3 — Out-of-category editorial

| App | The specific thing | Link |
|---|---|---|
| **Tolan** | Warm cream ground, sepia-brown serif display set in two stacked lines at ~44px, a short 32px em-rule beneath it, then serif body at 17px with generous 1.6 leading. No cards anywhere. The closest thing to a magazine page in an app. | [screen](https://mobbin.com/screens/d8e3ba51-2e42-4d98-b587-53b051d15380) |
| **NYTimes** | Sections separated by full-width hairline rules only — no cards, no shadows, no containers. Serif headline at ~26px over 15px body. Proof that rules and alignment out-perform boxes. | [screen](https://mobbin.com/screens/e8a3eee0-9507-4b8a-83c7-f6a21167a931) |
| **Finimize** | "SNAPSHOT" repeated and rotated at display scale in blue on black as a full-bleed graphic panel — type as texture rather than as reading matter. | [screen](https://mobbin.com/screens/177d9c7b-2278-4626-b876-e4ed51499c2c) |
| **Apple Books** | Pure black page with body text wrapping around an irregular shape. Extreme commitment to a single reading surface; zero chrome. | [screen](https://mobbin.com/screens/9d3ba691-f5b4-4157-a352-b8e66aeb6385) |
| **ElevenReader** | Serif body at ~21px with ~1.7 leading on a light grey ground, and a sheet that covers content rather than resizing it. Reading comfort over information density. | [screen](https://mobbin.com/screens/c49f78b5-dfae-46e4-9ffd-5dc410d43976) |
| **Goodreads** | Serif headline, then a dense metadata line (author, date, like count) at 12px — a clean separation between the thing and its provenance. | [screen](https://mobbin.com/screens/3343c19b-dcaf-4560-88ef-0fad830ecfae) |

---

## What is being carried into the variants

1. **Display scale is a choice.** (Not Boring) Weather gives 40% of the viewport
   to one numeral. The sleep category gives it 8%. Take the 40%.
2. **Rules, not cards.** Lumy and NYTimes both carry more information more
   legibly than any of the six sleep apps, using hairlines instead of containers.
3. **Warm grounds exist.** komoot and Tolan prove that neither "dark" nor "light"
   has to mean cool. Cool blue-black is a default, not a requirement.
4. **Prose can be the headline.** The Weather Channel opens with a sentence.
   A sleep screen could open with "You slept better than 81% of your nights."
5. **Type as texture.** Finimize and Flighty both use oversized type as ground
   rather than as content.
6. **Demote the marginalia hard.** Every good reference sets its secondary data
   at 11–13px and trusts it to be read only on demand. The sleep apps set theirs
   at 15–17px and lose the hierarchy.
