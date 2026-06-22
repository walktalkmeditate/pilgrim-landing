# Sun Path WebGL Globe — Design Spec

**Date:** 2026-06-21
**Status:** Draft — awaiting review
**Owner:** momentmaker

---

## Problem & Goal

The Sun Path globe (`/sunpath` and its 8 turning subpages) is a flat SVG
orthographic projection — correct and legible, but matte and 2D. The stated
goal is **to maximize Hacker News engagement** (upvotes, comments) on the Sun
Path launch, using a more striking globe as the lever, inspired by
[metiq.space](https://metiq.space) (HN: 147 points).

### Honest framing (carried from brainstorming)

A prettier globe alone rarely moves HN. metiq earned its points on **data
richness + explorability**, with the dark glowing aesthetic making it
*screenshot well*. For Sun Path, the engagement levers, in order, are:

1. **A hero that stops the scroll** — this globe upgrade. The thumbnail and
   first frame must earn the click.
2. **A one-sentence novel hook** — Sun Path already has it: *"watch where the
   solstice sunrise has drifted off Stonehenge's stones since they were laid."*
   The deep-time drift, surfaced on the globe (the "drift beam").
3. **Timing** — the autumn equinox (23 Sep 2026) is the documented main HN push.
   This work builds the hero *toward* that push; it is not itself a reason to
   launch early. (See Non-Goals.)

This spec covers lever #1 and wires in lever #2. It deliberately does **not**
turn Sun Path into a metiq-style data dashboard — that would fight the
contemplative-almanac brand and lose Sun Path's distinctiveness.

---

## Decisions Locked

| Decision | Choice |
| --- | --- |
| Goal | Maximize HN engagement (hero + hook + thumbnails) |
| Globe technology | Full Three.js / WebGL globe |
| Visual direction | Synthesis: glowing-coastline *instrument* base + warm city-lights glow + living day/night terminator |
| Palette | Pilgrim warm: deep space `#0a0a12`, amber/gold light (`--sun #c8893a`, `--dawn #D4A87A`), lavender stars `rgba(220,215,255)`, four turning colors. **Not** metiq cyan. |
| Layers | All 8 (see below) |
| Page stage | Dark "sky-panel" porthole for the hero; the rest of the page stays parchment/light |
| Load strategy | Progressive enhancement: WebGL primary on capable devices, lazy-loaded after first paint; SVG fallback otherwise |
| Subpages | All 8 get the upgraded globe, frozen at their turning instant, via the generated template |
| OG thumbnails | Regenerated from the new globe in this scope |

### The 8 layers → Three.js techniques

1. **Living day/night terminator + twilight band** — fragment shader using
   `dot(surfaceNormal, sunDirection)`; warm-lit day, dark night, smooth
   warm→indigo twilight band at the edge. `sunDirection` is the subsolar point
   (from `sunpath-math`) as a 3D unit vector.
2. **Subsolar point = the sun** — additive warm sprite + bright core at the
   subsolar 3D point. Cheap additive glow, **not** post-processing bloom.
3. **Warm atmosphere rim + day-side glow** — fresnel shader on a slightly
   larger back-side sphere; gold; brighter on the sun-facing limb.
4. **Glowing coastlines + graticule** — line geometry from existing
   `assets/sunpath/land-110m.json` + a graticule generator; emissive
   lavender/amber.
5. **Monuments as beacons** — gold sprites that pulse; flare brighter when
   today's sunrise azimuth aligns with the monument's alignment bearing
   (`sunpath-math.sunriseAzimuth`).
6. **Deep-time drift beam** — a gold beam from a monument along its alignment
   azimuth + a ghost beam at the historical azimuth; driven by the existing
   obliquity/drift math (`sunpath-math` + the time-machine scrub). **Live hub
   only** (see Subpages).
7. **Restrained city-lights** — warm `THREE.Points` on night-side land,
   opacity gated by the day/night shader. Deliberately sparse.
8. **Polar aurora ribbon** — a jade ribbon at the polar circle; opacity from
   declination (reuses the existing polar-glow logic).

Plus **slow idle auto-rotation**: gentle spin until interaction; pauses on
grab, when the tab is hidden, and when the globe is offscreen; respects
`prefers-reduced-motion`.

---

## Non-Goals

- **No data dashboard.** No side rails, live datasets, tickers, or metiq-style
  chrome. One idea, told quietly — but luminous.
- **No early HN launch.** This builds the hero; the launch decision and timing
  (autumn equinox) are out of scope for this spec.
- **No moonpath / daylight changes** in this pass. If the pattern proves out,
  porting the same renderer to `/moonpath` is a fast-follow, not this spec.
- **No rewrite of `sunpath-math.js`.** The astronomy is the source of truth and
  stays as-is; both renderers consume it.

---

## Architecture

### The seam: one controller, two renderers

Today `js/sunpath.js` mixes **state/interaction** (date, rotation, year-scrub,
time-lapse, idle tick, monument selection, popover) with **drawing** (SVG).
Split them along a renderer interface so the controller is pixel-agnostic:

```
GlobeRenderer interface:
  init(container, opts)        → set up DOM/canvas
  render(state)                → draw for the given state snapshot
  setRotation([lon, lat])      → apply rotation
  projectPoint([lon, lat])     → { x, y, visible }   (for popover placement)
  destroy()                    → tear down
```

`state` is computed by the controller from `sunpath-math` for the active date:
`{ date, subsolar, declination, monuments, visibleMonuments, twilightBands,
polarGlow, driftState }`.

### Modules

- **`js/sunpath-math.js`** — unchanged. Single source of astronomy truth.
- **`js/sunpath.js`** — refactored to the **controller**: owns state +
  interactions + the renderer lifecycle. Knows nothing about SVG or WebGL.
- **`js/sunpath-globe-svg.js`** (new) — today's D3-geo drawing code, extracted
  behind `GlobeRenderer`. The fallback.
- **`js/sunpath-globe-gl.js`** (new) — the Three.js renderer implementing
  `GlobeRenderer`.
- **Loader** (in the controller or a small `js/sunpath-globe-loader.js`) —
  capability detection + lazy import; picks the renderer.

### Renderer selection (progressive enhancement)

1. Render the **SVG** renderer immediately — light, instant first paint, also
   the `noscript`/no-WebGL baseline.
2. If WebGL is available **and** not `prefers-reduced-motion` **and** the device
   passes a low-end heuristic (and no `?flat` override): lazy-load the vendored
   Three.js + GL renderer **after first paint**, then swap the SVG for the GL
   globe (cross-fade). The controller re-points at the active renderer.
3. Otherwise: stay on SVG.

The SVG fallback keeps full behavior; it may get a light glow pass (warmer
subsolar, soft rim via SVG filter) so it is not jarringly plainer, but the GL
globe is the showcase. **Glow pass on SVG is optional / low priority.**

### Data flow

`sunpath-math` (pure) → controller builds `state` for `activeDate()` → active
renderer draws. `land-110m.json` and `monuments.json` load once and are shared.
The drift beam reads obliquity/azimuth helpers already in `sunpath-math`.

---

## Mobile / Performance Budget

metiq's #1 complaint was mobile, and ~90% of its traffic was mobile — this is
the make-or-break axis for the launch.

- **Lazy-load** Three.js after first paint; never block initial render.
- **Render-on-demand:** draw only while rotating/animating (idle spin, drift
  scrub, time-lapse). The sun barely moves, so static frames need no redraw.
- **Pause** the render loop when the tab is hidden (`visibilitychange`) or the
  globe is offscreen (`IntersectionObserver`).
- **DPR capped** (~1.5–2); fewer sphere segments and fewer city-light points on
  small/low-end devices.
- **Cheap additive glow**, not `UnrealBloomPass`/post-processing.
- **Three.js vendored + pinned** in `js/vendor/` (MIT — compatible with the
  site's GPLv3). No CDN dependency; matches the static-site ethos.

**Budget targets (to verify, not guess):** lazy chunk ≤ ~150 KB gzipped; no
regression in first-contentful-paint vs today (SVG still paints first); smooth
interaction on a mid-range phone.

---

## Subpages

The 8 permalink subpages (`sunpath/{2026,2027}-{spring-equinox,summer-solstice,
autumn-equinox,winter-solstice}/`) are **generated**, not hand-written:

- Source of truth: `scripts/sunpath/permalink-template.mjs`.
- Build: `node scripts/sunpath/build-permalinks.mjs` (writes all 8;
  `--check` is a CI drift guard).

**Work:** edit the template once — add the loader + GL renderer + vendored
Three.js to its `<script>` block, and the dark sky-panel class to the hero —
then rebuild so all 8 regenerate. **Never hand-edit the generated files.**

Each subpage freezes the globe to its turning instant via
`window.__sunpathForce`, which the controller already honors; the GL renderer
must respect it too. A frozen equinox/solstice reads beautifully (equinox =
vertical terminator, sun on the equator).

**Drift beam is live-hub only.** Subpages deliberately load a lighter script set
(no time-machine), so the deep-time scrub has no driver there. Subpages get the
full synthesis globe frozen at the instant — terminator, sun-bloom, beacons,
atmosphere, aurora, idle spin — but **no** drift scrub. This keeps them as quiet
snapshots and keeps their JS light. (A static, single-position beam on subpages
is a possible later addition, explicitly out of scope here.)

---

## OG / Social Thumbnails

The hub (`assets/og-sunpath.png`) and each subpage
(`assets/og-{year}-{key}.png`) ship pre-rendered 1200×630 PNGs that currently
show the **old flat globe**. On HN the link thumbnail is a primary click driver,
so these are regenerated from the new globe.

- Pipeline exists: `scripts/build-og-sunpath.sh` + `scripts/render-og-*.html`
  (headless screenshot of an HTML template).
- **Wrinkle:** a headless screenshot of a WebGL canvas must wait for the canvas
  to paint (and for fonts/geometry to load) before capture — add an explicit
  readiness signal/delay. Reduced-motion in the capture context will fall back
  to SVG, so the capture path must force the GL renderer (or screenshot a
  GL-forced render route).
- Output: all 9 previews show the glowing globe.

---

## Page Stage

A dark **sky-panel** porthole holds the hero globe regardless of page mode: a
deep `#0a0a12` radial background, rounded, with padding for the atmosphere glow.
The rest of `/sunpath` and the subpages stay parchment/light. CSS lives in
`css/sunpath.css`; the wrap is the existing `#sunpath-globe` container, restyled
(plus a stage class). The page's existing "star mode" dark toggle continues to
work; in star mode the whole page goes dark around an already-dark globe.

---

## Feature Parity Checklist

The GL renderer (and the preserved SVG renderer) must keep **all** current
behavior:

- [ ] Drag to rotate (with the click-vs-drag threshold for monument taps)
- [ ] Year-scrub slider (walk the year day by day)
- [ ] 24-hour time-lapse (play/stop, loop, reduced-motion skip)
- [ ] Axial-tilt inset (declination readout)
- [ ] Polar circles (arctic/antarctic glow by declination)
- [ ] Subsolar caption ("the sun is overhead at … right now")
- [ ] Monument pins → popover (name, alignment, today's sunrise azimuth, source)
- [ ] Frozen-instant mode (`window.__sunpathForce`) for subpages
- [ ] `noscript` static fallback intact
- [ ] Idle re-render each minute when live (sun keeps moving)

---

## Files Touched

**New:**
- `js/sunpath-globe-svg.js` — extracted SVG renderer (fallback)
- `js/sunpath-globe-gl.js` — Three.js renderer
- `js/sunpath-globe-loader.js` — capability detection + lazy import (or folded
  into the controller)
- `js/vendor/three.min.js` — pinned Three.js (+ note version & license)

**Modified:**
- `js/sunpath.js` — refactor into the controller
- `sunpath/index.html` — script tags + sky-panel markup
- `scripts/sunpath/permalink-template.mjs` — script tags + sky-panel markup
- `css/sunpath.css` — sky-panel stage styling
- `scripts/build-og-sunpath.sh` (+ `scripts/render-og-*.html` as needed) —
  capture the new globe; handle WebGL paint timing

**Regenerated (build output, not hand-edited):**
- `sunpath/{2026,2027}-{4 turnings}/index.html` (via `build-permalinks.mjs`)
- `assets/og-sunpath.png`, `assets/og-{year}-{key}.png` ×8

---

## Testing Strategy

- **Pure-function unit tests** (existing harness, `*.test.js`) for new testable
  seams: lon/lat → 3D vector, day/night classification from sun-dot, monument
  alignment-flare detection, capability/renderer selection.
- **No regressions** in `sunpath-math.test.js` (untouched).
- **Build drift guard:** `build-permalinks.mjs --check` must pass after template
  edits (proves all 8 regenerated cleanly).
- **Manual visual verification** in-browser: hub live, one subpage frozen, star
  mode, reduced-motion (must fall back to SVG), no-WebGL (must fall back),
  mobile viewport.
- **Performance check** via Chrome DevTools: first-paint not regressed; smooth
  interaction; lazy chunk size within budget.

---

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Three.js weight on a static almanac site | PE + lazy-load + render-on-demand; vendored & pinned; isolated to the hero |
| Mobile lag / slow paint (metiq's top complaint) | SVG paints first; GL gated on capability; DPR cap, fewer segments, cheap glow, pause when hidden/offscreen |
| Brand drift toward sci-fi dashboard | Warm palette, sky-panel only on the hero, no data chrome, contemplative copy unchanged |
| WebGL OG screenshots capture a blank canvas | Explicit readiness signal/delay; force GL renderer in capture path |
| Subpage drift inconsistency | Drift beam scoped to live hub only; subpages are frozen snapshots by design |
| Renderer-swap flicker on load | SVG → GL cross-fade; only swap once GL is fully initialized |

---

## Acceptance Criteria

- The `/sunpath` hub shows the WebGL synthesis globe with all 8 layers, in the
  warm palette, on capable devices.
- All 8 subpages show the same globe frozen at their turning instant (no drift
  scrub), regenerated from the template; `build-permalinks.mjs --check` passes.
- On no-WebGL / `prefers-reduced-motion` / low-end, the SVG globe renders with
  full feature parity; `noscript` fallback intact.
- All current interactions and the frozen-instant mode work on both renderers.
- First paint is not regressed; mobile interaction is smooth within budget.
- All 9 OG thumbnails show the new globe.

---

## Open Questions

- **Drift-beam UI on the hub:** reuse the existing "Walk through time" scrub to
  drive the beam (recommended), or add a dedicated control on the globe? Default:
  reuse the existing scrub. *(Resolve during planning.)*
- **Three.js version** to pin, and whether the globe uses raw Three.js line/
  point geometry or a thin helper. Default: raw Three.js, no extra dependency.
  *(Resolve during planning.)*
