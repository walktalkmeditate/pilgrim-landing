# Hidden Clearing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The seek-door crescent detaches once you scroll past the door and rides the viewport, leaning toward a fog patch hidden at a random calm spot below; stillness (or tap/hover) thins the fog and reveals the app's real seek-clearing glyph.

**Architecture:** One pure UMD core module (`js/clearing-core.js`: angle math, arc span, zone table, glyph data) unit-tested in Node, one DOM IIFE (`js/clearing.js`) loaded only by index.html, styles added to index.html's existing inline `<style>` block. A static wiring test asserts index.html is correctly wired; the page-weight ratchet is raised deliberately.

**Tech Stack:** Vanilla JS (ES5-style IIFE per house convention), no dependencies, Node built-in test scripts.

## Global Constraints

- Index-scoped only: nothing lands in `css/styles.css` or `js/main.js` (shared by 8–10 pages under weight ratchets).
- `prefers-reduced-motion: reduce`: no riding crescent at all; reveal is a plain opacity crossfade; the fog patch stays findable by tap/focus.
- The fog patch is a real `<button>` (≥44px target, focusable, labelled) — stillness reveals, hover/tap/Enter hurry.
- The glyph is the app's real `seek-clearing.svg` path, `fill="currentColor"` — never the source's hardcoded `#0a1624` (invisible on the dark section).
- The crescent arc stays centred as it opens: `stroke-dashoffset` must always equal span/2 (door baseline: `34 80` / offset 17, dash total 114).
- No analytics on the reveal, no CTA in the reveal. It is a gift.
- Commit messages follow house voice: `feat(clearing): …` lowercase, plain-spoken.

---

### Task 1: Core module — the math that leans the crescent

**Files:**
- Create: `js/clearing-core.js`
- Test: `js/clearing-core.test.js`

**Interfaces:**
- Produces (consumed by `js/clearing.js` via `window.ClearingCore`, by tests via `require`):
  - `leanAngleDeg(cx, cy, tx, ty)` → number, degrees; 0 = target due right, 90 = due below (screen coords).
  - `unwrapAngle(prevDeg, rawDeg)` → number; continuous angle nearest `prevDeg` equivalent to `rawDeg` mod 360.
  - `arcSpan(distancePx, viewportH)` → number in [34, 64]; 34 at ≥1.5×viewportH, 64 at 0, linear between.
  - `pickZone(count, rand)` → integer in [0, count-1].
  - `ZONES` → array of `{selector, side: 'left'|'right', topPct}`.
  - `GLYPH_VIEWBOX` (`'0 0 150 150'`), `GLYPH_TRANSFORM`, `GLYPH_PATH` (the seek-clearing path data).
  - `STILLNESS_MS = 4000`, `HOVER_MS = 350`, `DASH_TOTAL = 114`.

- [ ] **Step 1: Write the failing test** — `js/clearing-core.test.js` with the house ok/eq harness. Cover: lean angle quadrants (right→0, below→90, above→−90, left→±180); unwrap continuity (prev 170, raw −170 → 190; prev −170, raw 170 → −190; prev 10, raw 30 → 30); arc span clamps (far→34, zero→64, half-way→49, negative distance clamps to 64); dash centring invariant (offset = span/2 keeps arc centred for both 34 and 64); pickZone bounds (rand 0→0, rand 0.9999→count−1); zone table sanity (≥6 zones, every side ∈ {left,right}, topPct ∈ [0,100], selectors non-empty, no duplicate selectors); glyph constants (viewBox exact, path starts `m223 18`, path contains no `fill=`, length > 3000).
- [ ] **Step 2: Run `node js/clearing-core.test.js`** — expect failure: `Cannot find module './clearing-core.js'`.
- [ ] **Step 3: Implement `js/clearing-core.js`** — UMD IIFE mirroring `js/traces-glyphs.js` (dual `module.exports` / `root.ClearingCore`). Port the glyph path verbatim from `../pilgrim-ios/.../seek-clearing.svg` (keep the Arrow/QuiverAI attribution note and the `g transform`, drop the hardcoded fill). Zone table (all sections below the seek-door, patch placed in vertical padding bands so it never overlaps copy at any width):
  `.journey.section` right 7 · `.seasons.section` left 6 · `.haiku.section` right 14 · `.goshuin-section` left 8 · `.soundscape-section` right 91 · `.privacy-section` left 92 · `.story.section` right 6 · `.trail-section` left 89.
- [ ] **Step 4: Run the test — expect all green.**
- [ ] **Step 5: Commit** — `feat(clearing): the math that leans the crescent`

### Task 2: Wiring — index.html styles, scripts, and the static test

**Files:**
- Modify: `index.html` (inline `<style>` block, line ~224; script tags after `js/traces-cairn.js`, line ~1932)
- Test: `js/clearing-wiring.test.js`

**Interfaces:**
- Consumes: class names produced by Task 3's DOM module (`.clearing-fog`, `.clearing-glyph`, `.clearing-rider`, `.clearing-host`, `.is-revealed`, `.is-riding`).

- [ ] **Step 1: Write the failing wiring test** — reads `index.html` as text and asserts: `js/clearing-core.js` and `js/clearing.js` script tags present, both `defer`, core before DOM; inline style defines `.clearing-fog`, `.clearing-glyph`, `.clearing-rider`, `.clearing-host`; the `prefers-reduced-motion` block hides `.clearing-rider`; the string `#0a1624` appears nowhere in `index.html`, `js/clearing-core.js`, or `js/clearing.js` (the trap: the iOS glyph's ink fill is invisible on the dark section); `.clearing-fog` declares a min tap target ≥ 44px.
- [ ] **Step 2: Run it — expect failures on every count.**
- [ ] **Step 3: Add styles + script tags to index.html.** Styles (inside the existing inline block, after the `.seek-door` rules): `.clearing-host { position: relative }`; `.clearing-fog` — 148×148 borderless transparent button, absolutely positioned via `top` (inline style from JS) and a `left`/`right` clamp per side, radial fog on `::before` (blur 7px, opacity .55, slightly denser than the ambient blobs), focus-visible outline; `.clearing-glyph` — 64px, `color: var(--dawn)`, `opacity 0; filter: blur(9px); transform: scale(1.04)`, transitioned 2.4s ease-out; `.clearing-fog.is-revealed` — `::before` opacity → .12, glyph → `opacity .92; blur 0; scale 1`; `.clearing-rider` — `position: fixed; right: 1.25rem; top: 50%`, 28px, `color: var(--dawn)`, `opacity 0`, `pointer-events: none`, transform transitioned .9s ease-out, opacity 1.2s; `.clearing-rider.is-riding { opacity: .7 }`. Reduced-motion block: `.clearing-rider { display: none }`, glyph transition → opacity .8s only.
- [ ] **Step 4: Run the wiring test — expect green.**
- [ ] **Step 5: Commit** — `feat(clearing): the page makes room — styles and wiring`

### Task 3: The DOM module — ride, stillness, reveal

**Files:**
- Create: `js/clearing.js`

**Interfaces:**
- Consumes: `window.ClearingCore` (Task 1), `.seek-door` section and its crescent markup (index.html).

- [ ] **Step 1: Implement `js/clearing.js`** as an IIFE guarded on `window.ClearingCore` and `document.querySelector('.seek-door')`:
  - Pick a zone: filter `ZONES` to selectors that exist, `pickZone(count, Math.random)`; add `.clearing-host` to the host section; build the fog button (`aria-label="Something waits in the fog"`, inline `top: {topPct}%`, side class) containing the glyph SVG built from `GLYPH_VIEWBOX`/`GLYPH_TRANSFORM`/`GLYPH_PATH` with `fill="currentColor"`, plus a visually-hidden `role="status"` element.
  - Reduced motion (`matchMedia('(prefers-reduced-motion: reduce)')`): skip everything below except the reveal handlers (click/focus+Enter; stillness timer still runs — it needs no motion).
  - Rider: fixed-position div with the door crescent's SVG (circle r18, stroke 2.5, dasharray `34 80`, dashoffset 17), appended to `body`, `aria-hidden`. On rAF-throttled scroll/resize: riding = door's bottom < 0 and not revealed; toggle `.is-riding`. While riding: `angle = unwrapAngle(prev, leanAngleDeg(riderCx, riderCy, patchCx, patchCy))`, apply `rotate()`; `span = arcSpan(distance, innerHeight)`, apply `stroke-dasharray: span (114−span)` and `stroke-dashoffset: span/2`.
  - Stillness: IntersectionObserver (threshold .5) on the patch; while intersecting and unrevealed, a `STILLNESS_MS` timer that any `scroll` resets; firing reveals. `mouseenter` starts a `HOVER_MS` timer (`mouseleave` cancels); `click` reveals immediately.
  - `reveal()`: add `.is-revealed`, set status text `"A clearing, revealed."`, update the button label, fade the rider out and stop its listeners, disconnect the observer. One-shot.
- [ ] **Step 2: Run `node js/clearing-core.test.js && node js/clearing-wiring.test.js`** — still green (no regressions from markup the DOM module expects).
- [ ] **Step 3: Commit** — `feat(clearing): the crescent rides, stillness reveals`

### Task 4: The ratchet — pay for the clearing deliberately

**Files:**
- Modify: `js/page-weight.test.js` (BASELINE_KB `'index.html'`)

- [ ] **Step 1: Run `node js/page-weight.test.js`** — expect index.html to FAIL (growth beyond 0.50 KB drift).
- [ ] **Step 2: Raise the baseline to the measured figure** with a house-voice comment naming what the bytes buy (core module incl. the glyph path, DOM module, inline styles).
- [ ] **Step 3: Run the full suite** — `for f in js/*.test.js; node $f; or break; end` (fish). Expect all green; `daylight-perf` is load-sensitive, re-run alone if it flakes.
- [ ] **Step 4: Commit** — `chore(weight): index grows by a hidden clearing`

### Task 5: See it work — browser verification

- [ ] **Step 1:** Serve locally (`python3 -m http.server 8123`), open via chrome-devtools MCP.
- [ ] **Step 2:** Desktop pass: scroll past the seek-door → rider fades in at right edge and leans as you scroll; find the fog patch; hover → reveal settles in; screenshot before/after. Reload → patch lands in a different zone.
- [ ] **Step 3:** Mobile emulation pass (390×844): rider visible and unobtrusive; tap reveals; patch never overlaps copy in its zone.
- [ ] **Step 4:** Reduced-motion emulation: no rider; tap/stillness still reveal via crossfade.
- [ ] **Step 5:** Keyboard: Tab reaches the patch, Enter reveals, status announced.
- [ ] **Step 6:** Fix what the passes surface (zone `topPct` tuning is expected), re-run wiring + weight tests, commit — `fix(clearing): what the browser pass surfaced`
