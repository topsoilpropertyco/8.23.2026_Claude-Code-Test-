# Motion vocabulary

Source: motion.dev documentation, fetched 2026-08-24. Framer's MCP is not
connected; Motion is the open-source library and its docs are public, so
nothing was lost by going direct.

## What the library actually defaults to

| Parameter | Default | Note |
|---|---|---|
| `stiffness` | 1 | The bare default is far too slack for UI; always override. |
| `damping` | 10 | |
| `mass` | 1 | |
| `bounce` | 0.25 | Duration-based springs only. |
| tween `duration` | 0.3s | 0.8s when multiple keyframes are defined. |

Important: setting `stiffness`, `damping` or `mass` **overrides** `bounce` and
`duration`. Pick one model or the other, never both.

## The three springs this project uses

Named here so every variant pulls from the same vocabulary.

```js
// SETTLE — the standard. Entrance of any substantial element.
// Arrives with authority, one almost-imperceptible overshoot, done.
{ type: 'spring', stiffness: 260, damping: 30, mass: 1 }     // ~450ms

// GLIDE — for large type and full-bleed forms. Heavier, no visible bounce.
// Anything at display scale must not wobble; it reads as cheap instantly.
{ type: 'spring', stiffness: 140, damping: 26, mass: 1.1 }   // ~700ms

// TAP — micro-feedback on press. Fast, slightly springy, forgettable.
{ type: 'spring', stiffness: 500, damping: 28, mass: 0.6 }   // ~250ms
```

## Easing, where a tween is more honest than a spring

```css
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);    /* reveals, opacity */
--ease-in-out:    cubic-bezier(0.65, 0, 0.35, 1);   /* state changes */
--ease-draw:      cubic-bezier(0.16, 1, 0.3, 1);    /* stroke drawing, long */
```

## Duration bands

| Band | Range | Used for |
|---|---|---|
| Micro | 120–200ms | Hover, press, focus ring |
| Element | 350–500ms | A single item entering |
| View | 600–900ms | Full screen entrance, stroke draws |

Nothing exceeds 900ms. A screen you open at 7am must not make you wait.

## Stagger

40ms between siblings. Enough to read as sequence, short enough that the whole
entrance lands inside the view band.

## What does NOT animate

This list matters more than the ones above.

- The hero numeral never counts up. Counting is a party trick; the number is
  the content and it should simply be there.
- No looping, breathing, pulsing or floating. Nothing moves unprompted.
- No parallax.
- No animated gradients.
- Numbers in the marginalia do not tick, roll or shuffle.
- No entrance animation on anything below the fold.
- Under `prefers-reduced-motion`, all of it collapses to a 1-frame opacity
  settle. Not disabled — collapsed. The screen still feels intentional.
