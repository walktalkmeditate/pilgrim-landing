# Page-walker meditation breath — design

*Drafted 2026-04-11. Small visual polish of the existing page-walker meditation state.*

## Context

The page-walker (`.page-walker` in `index.html`, initialised by `initPageWalker()` in `js/main.js`) is a tiny walking figure that descends the left margin of the viewport as the reader scrolls. Three states drive its appearance:

- `.walking` — bobs with a two-beat cadence during active scroll
- `.meditating` — stops and shows a single breathing circle when the reader pauses
- `.whispering` — warm glow during curated audio playback

The current meditation state is functional but plain: **one** 28px circle with a 1px `var(--fog)` border, breathing from scale 0.85 → 1.45 → 0.85 over 5500ms (the same cadence the iOS app uses). The walker silhouette itself sits still during meditation.

This design refines the meditation moment into a small, contemplative ripple — keeping the 5500ms cadence and the wabi-sabi palette, but layering the breath so it reads like an actual act of presence instead of a decorative pulse.

## Scope

### In scope

- Replace the single breath ring with three concentric breath rings, staggered outward
- Warm the ring colour from `var(--fog)` (grey) to `var(--dawn)` (amber)
- Add a subtle 1.5px vertical rise to the walker silhouette on the inhale, in sync with ring 1
- Update the existing `prefers-reduced-motion` override to cover the new animations

### Out of scope (explicit YAGNI)

- No new DOM elements. Rings 2 and 3 are CSS pseudo-elements on the existing `.page-walker-breath` div.
- No changes to `js/main.js`. All state transitions (`.walking` / `.meditating` / `.whispering`) stay as they are.
- No changes to the `.walking` bob, the `.whispering` glow, the `.bowing` scale, or the trail rendering.
- No audio. No breath-count labels. No environmental effects on the trail. (These were floated as alternatives during brainstorming and rejected — they either break the walker-as-focus or add complexity without pay-off.)
- No mobile behaviour change. The page-walker is already hidden below 640px.

## Design

### Three staggered breath rings

The existing `.page-walker-breath` div remains the **inner** ring. Two pseudo-elements (`::before` and `::after`) become the **middle** and **outer** rings. All three share the same 5500ms `ease-in-out infinite` cadence, staggered by 0.4s via `animation-delay`, with progressively larger peak scales and lower peak opacities:

| Ring  | Element                         | Delay | Peak scale | Peak opacity |
| ----- | ------------------------------- | ----- | ---------- | ------------ |
| Inner | `.page-walker-breath`           | 0s    | 1.45       | 0.42         |
| Mid   | `.page-walker-breath::before`   | 0.4s  | 1.85       | 0.28         |
| Outer | `.page-walker-breath::after`    | 0.8s  | 2.35       | 0.16         |

The stagger means at any moment the three rings are at different phases of the inhale/hold/exhale cycle, so the visual reads as a continuous outward wave rather than three discrete circles pulsing in unison. The falling opacities mean the outer rings fade into the page — it feels like breath dissipating into air, not three concentric hoops.

Each ring uses the same keyframe shape as the current `page-walker-breathe` (hold at 45%–55%), with its own peak scale:

```
0%   { opacity: 0;         transform: translate(-50%, -50%) scale(0.85); }
45%  { opacity: <peak>;    transform: translate(-50%, -50%) scale(<peak>); }
55%  { opacity: <peak>;    transform: translate(-50%, -50%) scale(<peak>); }
100% { opacity: 0;         transform: translate(-50%, -50%) scale(0.85); }
```

Three keyframe blocks total (one per ring), since CSS custom properties cannot be interpolated inside `@keyframes` cleanly in all browsers.

### Warm dawn tint

All three ring borders switch from `var(--fog)` to `var(--dawn)` (#C4956A light / #D4A87A dark — the same amber already used for the walker focus drop-shadow and the horizon logo heartbeat). The meditation moment warms into dawn light. The walker's `.walking` and `.whispering` states stay untouched, so the warmth is tied specifically to the pause-to-meditate action.

### Walker silhouette rises on the inhale

A new animation `page-walker-meditate-rise` runs only while the walker has the `.meditating` class:

```
0%, 100%   { transform: translateY(0);    }
45%, 55%   { transform: translateY(-1.5px);}
```

Same 5500ms cadence. The 1.5px rise lands at the same time as ring 1's peak, so the walker and the innermost breath swell together — inhale up, exhale settles. No scale change; translate-only keeps the silhouette's proportions honest.

No conflict with the existing `.walking` bob (different class, different animation) or the `.bowing` scale on arrival (runs once, not during meditation).

### Reduced-motion

The existing block at `@media (prefers-reduced-motion: reduce) { .page-walker.walking .page-walker-figure, ... { animation: none; } }` grows to cover:

- `.page-walker-breath::before`
- `.page-walker-breath::after`
- `.page-walker.meditating .page-walker-figure` (for the rise)

Reduced-motion users see the silhouette and (optionally) a single static inner ring, with no oscillation.

## Files touched

- `css/styles.css` — breath section (~lines 921–947) and reduced-motion block (~lines 995–1000). Adds three keyframe blocks, two pseudo-element rules, one walker rise rule, extends the reduced-motion selector list.

No other files. No `index.html` change, no `js/main.js` change, no new assets.

## Verification

1. Load `index.html` at any scroll position past the hero.
2. Scroll, then stop for ~1.5s — walker enters `.meditating` state.
3. Observe three staggered amber breath rings and a gently rising silhouette.
4. Resume scrolling — all three rings and the rise stop; bob resumes.
5. With `prefers-reduced-motion: reduce` set at OS level, reload and confirm no oscillation during the meditation pause.
