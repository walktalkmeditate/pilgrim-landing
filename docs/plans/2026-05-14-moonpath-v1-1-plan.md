# /moonpath v1.1 Implementation Plan

**Spec:** `docs/specs/2026-05-14-moonpath-v1-1.md`
**Goal:** Add a page-level date scrubber, 8 interstitial prose slots, an eclipse pointer widget, and a moonrise azimuth dial to `/moonpath/` — all bundled into the existing PR #3 on the `moonpath` branch.
**Architecture:** Single-branch incremental work on top of PR #3's v1 commits. Each slice ships one feature top-to-bottom (math → render → wire-up → test). The page's existing two-layer `recompute(state)` + DOM glue stays the spine; `state.now` becomes the scrubber-controlled instant. Standstill slider element is removed and its job is taken over by the page-level scrubber.
**Tech Stack:** Vanilla JS, zero npm deps, node-based tests, dual-export pattern. Reuses /sunpath fonts + analytics + theme system via the shared `<head>`.

**Status:** draft v1 — addresses 6-round doc-review on the spec; plan iterates once more after `jutsu swarm doc-review` on this file.

**Branch:** `moonpath` (continues from `53df0d5`). NOT a new branch — v1.1 ships in the same PR as v1.
**PR:** #3 (https://github.com/walktalkmeditate/pilgrim-landing/pull/3)

> **For implementers (human or agent):** execute this plan task-by-task with `subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking. Per-slice ACs map to spec ACs by number — verify after each slice that the cited AC is satisfied.

---

## Decision summary (from spec, decisions D24–D30)

| ID | Decision | Slice |
|---|---|---|
| D24 | Date scrubber: integer-tick log scale base 1.0293, ±500 ticks | 2 |
| D25 | INTERSTITIAL_TABLE: `{sectionId → {stateKey → prose}}`, 24-32 strings, empty default hides element | 5 |
| D26 | Eclipse helpers: both coord-aware, Meeus Ch.54, lunar requires horizon-overlap | 1, 4 |
| D27 | Eclipse text format + ±3000 yr scrubYear fallback | 4 |
| D28 | Azimuth domain `[0°, 360°)`, 8 cardinal buckets, half-open closed-left/open-right, due-north wraps `[337.5, 360) ∪ [0, 22.5)`; circumpolar returns null | 1, 3 |
| D29 | Scrubber range mirrors v1 D20 (±5000 yr) | 2 |
| D30 | Tide window: `|scrubbed − now| ≤ 30 × 86_400_000 ms` inclusive | 2 |

---

## File structure

**Modified:**
- `js/sunpath-math.js` — ADD `nextSolarEclipseAfter`, `nextLunarEclipseAfter`, `moonriseAzimuthAt`. Existing exports untouched.
- `js/sunpath-math.test.js` — APPEND ≥3 fixtures per new helper (USNO eclipse + timeanddate.com azimuth canonical refs).
- `js/moonpath.js` — Many additions: `scrubberValueToInstant`, `cardinalProseFor`, `interstitialFor`, `INTERSTITIAL_TABLE`, `renderDateScrubber`, `renderMoonriseAzimuthDial`, `renderEclipsePointer`, `renderInterstitial`. DELETE `renderStandstillSlider` (v1). MODIFY `recompute(state)` to read scrubbed `state.now` + emit new fields. MODIFY `renderStandstillAnnotation` to read scrubbed year from state. MODIFY `setupEventListeners` to rAF-throttle scrubber `input`.
- `js/moonpath.test.js` — APPEND tests: `scrubberValueToInstant` boundary, `cardinalProseFor` 8-bucket boundary + wrap, `interstitialFor` + `INTERSTITIAL_TABLE` shape, rAF-throttle stub test, scrub-time tide window fixture.
- `moonpath/index.html` — Reorder widget sections per spec preamble (azimuth dial slot 2, eclipse pointer slot 7). ADD scrubber `<input>` at top + above-scrubber two-tier accuracy footnote. ADD 8 `<p class="mp-interstitial">` placeholders between widget pairs. ADD azimuth-dial section + eclipse-pointer section. REMOVE v1 standstill slider element.
- `css/moonpath.css` — ADD `.mp-scrubber`, `.mp-scrubber-label`, `.mp-azimuth-svg`, `.mp-eclipse-pointer`, `.mp-interstitial`, dimmed-state for circumpolar. REMOVE old `.mp-standstill-slider` rules.

**Generated/data:** none. No new ICS files. No new ports.

**Total:** 6 source files modified, 0 created.

---

## Slice DAG

```
slice 1 (math helpers) ──────┐
                              ├──→ slice 3 (azimuth dial) ───┐
slice 2 (scrubber + layout) ──┼──→ slice 4 (eclipse pointer) ┼──→ slice 6 (wire + smoke)
                              └──→ slice 5 (interstitials) ──┘
```

**Critical path:** slice 1 and slice 2 run in parallel (independent). Slices 3, 4, 5 each depend on BOTH slice 1 (math) and slice 2 (layout pins), so all three start once 1+2 complete and can run in parallel. Slice 6 wraps after 3+4+5.

---

### Slice 1: Math foundations — 3 new helpers in sunpath-math.js

**Files:**
- Modify: `js/sunpath-math.js` (add 3 helpers), `js/sunpath-math.test.js` (append fixtures)

**Spec ACs covered:** AC #9 (eclipse helpers + fixtures), AC #11 (azimuth math + fixtures).
**Decisions:** D26 (eclipse signatures + horizon filter), D28 (azimuth domain + circumpolar).
**No dependencies.** Parallelizable with slice 2.

**Acceptance:**
- [ ] `js/sunpath-math.js` exports 3 new functions with stable signatures:
  - `nextSolarEclipseAfter(date, lat, lon)` → `{utcMs, magnitudePct}` per D26 (linear magnitude per Meeus, NOT area).
  - `nextLunarEclipseAfter(date, lat, lon)` → `{utcMs, kind}` where `kind ∈ {'total', 'partial', 'penumbral'}`. Visibility: any portion of eclipse window overlaps `moon-above-horizon-at-(lat, lon)`.
  - `moonriseAzimuthAt(date, lat, lon)` → number in `[0, 360)` (compass bearing, 0 = N clockwise) OR `null` when moon does not rise that day (circumpolar).
- [ ] `js/sunpath-math.test.js` appends ≥3 fixtures per helper = 9 new assertions minimum.
  - Eclipse fixtures vs USNO published predictions; tolerance ±1 day, ±5 pct-points magnitude.
  - Azimuth fixtures vs timeanddate.com or USNO; tolerance ±3°.
  - Eclipse fixtures exclude grazing events (true magnitude <5% or >95%).
- [ ] No regressions in `js/sunpath-math.test.js`'s existing 82 assertions.
- [ ] Commit: `feat(moonpath): slice 1.1 — eclipse + moonrise-azimuth math helpers`

**Steps:**
- [ ] Read `js/sunpath-math.js` end-to-end to understand existing IIFE/dual-export + Meeus Ch. 47 lunar position helpers.
- [ ] Implement `moonriseAzimuthAt`: extend the existing `moonriseUTC` (which already finds the rise instant). After finding the rise instant, evaluate `moonAltAzAt(riseInstant, lat, lon).azimuth`. Return that. If `moonriseUTC` returns `null` (no rise that day), return `null`.
- [ ] Pick 3 reference azimuth fixtures from timeanddate.com (suggest: Honolulu 2026-05-14, Boston 2026-06-21, Kyoto 2026-12-21 — variety of latitudes). Bake as test fixtures with provenance comments.
- [ ] Add `moonriseAzimuthAt` to the `api` export object.
- [ ] Write RED tests; run `node js/sunpath-math.test.js`; confirm RED.
- [ ] Implement until GREEN.
- [ ] Implement `nextSolarEclipseAfter`: walk forward from `date` searching for solar conjunctions where the moon's apparent radius overlaps the sun's at observer (lat, lon). Use Meeus Ch. 54 simplified penumbral check (penumbra-coarse band filter). Return `{utcMs: rise-precise time, magnitudePct: 0-100 linear magnitude}`. ~80 LOC.
- [ ] Implement `nextLunarEclipseAfter`: walk forward searching for full moons whose ecliptic latitude is within the umbra (penumbra) cone. For each candidate, compute the eclipse window (entry-to-exit). Filter: any portion of window must overlap with `moonAltAzAt(t, lat, lon).altitude > 0`. Return `{utcMs: peak instant, kind: 'total'|'partial'|'penumbral'}`. ~100 LOC.
- [ ] Pick 3 reference fixtures per eclipse helper from USNO (next-eclipse predictions catalog). Bake fixtures with provenance.
- [ ] Add both to `api` export.
- [ ] Write RED → implement → GREEN.
- [ ] Run full test suite; confirm no regressions.
- [ ] Commit per the slice's final step.

---

### Slice 2: Date scrubber + layout reorder + delete v1 standstill slider

**Files:**
- Modify: `moonpath/index.html`, `js/moonpath.js`, `js/moonpath.test.js`, `css/moonpath.css`

**Spec ACs covered:** AC #1 (scrubber present), AC #2 (scrubber drives 9 widgets), AC #3 (default URL `?date=` else `now`), AC #4 (keyboard + a11y), AC #13 (tide ±30 day boundary fallback), AC #14 (page-level accuracy footnote), AC #19 (rAF-throttle test).
**Decisions:** D24 (log scale), D29 (range), D30 (tide window).
**No dependencies.** Parallelizable with slice 1.

**Acceptance:**
- [ ] `<input type="range" id="mp-date-scrubber" min="-500" max="500" step="1" value="0">` exists at top of `<main>` widget stack.
- [ ] Helper `scrubberValueToInstant(i, nowMs)` exported from `js/moonpath.js`:
  - `i=0 → nowMs`
  - `i=±500 → nowMs ± round(1.0293^500 − 1) * 86_400_000` ms
  - Uses formula `sign(i) * (1.0293 ** |i| − 1)` * 86_400_000, rounded to nearest integer ms.
- [ ] Tide-section logic respects D30: `|state.now − nowMs| ≤ 30 * 86_400_000` shows curve; outside shows fallback line.
- [ ] `js/moonpath.test.js` adds:
  - `scrubberValueToInstant(0, ...) === nowMs`
  - `scrubberValueToInstant(1, ...)` and `(-1, ...)` correct (~42 min diff)
  - `scrubberValueToInstant(500, ...)` ~ 5,150 yr forward (sanity bound)
  - Tide-window fixture: `recompute({lat, lon, now: nowMs + 30*86_400_000, ports})` returns curve; `recompute({lat, lon, now: nowMs + 30*86_400_000 + 1, ports})` returns fallback.
  - rAF-throttle stub: stub `requestAnimationFrame` fires exactly 5 times, dispatch 100 synthetic `input` events on scrubber, assert `recomputeCount === 5` AND last call uses last input value.
- [ ] Widget section order in `moonpath/index.html` reordered to: dome → azimuth-dial (NEW placeholder slot) → phase → earthshine → apparent-size → lux → eclipse-pointer (NEW placeholder slot) → standstill → tide. (Slots 2 and 7 are placeholders with empty `<section>` markup — slices 3+4 will fill them in.)
- [ ] v1 standstill slider element + its `<label>` are DELETED from HTML; `renderStandstillSlider` function removed from `js/moonpath.js`.
- [ ] Standstill annotation now reads year from `new Date(state.now).getFullYear()`.
- [ ] Two-tier accuracy footnote moved to `<p class="mp-scrubber-footnote">` above the scrubber. Old standstill-section footnote removed.
- [ ] Scrubber init reads `parseParams(location.search).date`: if valid → scrubber value computed by reverse-mapping that instant to nearest tick; else `i=0`.
- [ ] All 5 existing test suites still green.
- [ ] Commit: `feat(moonpath): slice 1.2 — page-level date scrubber + layout reorder`

**Steps:**
- [ ] Implement `scrubberValueToInstant(i, nowMs)` pure function in `js/moonpath.js`. Add to `api` export.
- [ ] Implement reverse `instantToScrubberValue(ms, nowMs)` for URL-param init. Algebraic inverse of `daysFromNow(i) = sign(i) * (1.0293^|i| − 1)`:
  ```
  daysDiff = (ms − nowMs) / 86_400_000
  i = sign(daysDiff) * round( ln(|daysDiff| + 1) / ln(1.0293) )
  ```
  Clamped to `[-500, 500]`. Round-trip property: `instantToScrubberValue(scrubberValueToInstant(i, now), now)` should return `i` within ±1 (rounding tolerance) for all `i ∈ [-500, 500]`. Tested in `js/moonpath.test.js`.
- [ ] Write RED tests for `scrubberValueToInstant` boundary cases.
- [ ] Implement until GREEN.
- [ ] Edit `moonpath/index.html`: reorder widget `<section>` blocks. Add placeholder empty `<section id="mp-azimuth">` after dome, placeholder `<section id="mp-eclipse">` after lux. Add `<input type="range" id="mp-date-scrubber">` at top of `<main>` widget stack. Add `<p class="mp-scrubber-footnote">` above it. Add 8 `<p class="mp-interstitial">` elements between adjacent widget sections (will be populated by slice 5; for now they sit with `hidden` attribute as empty placeholders).
- [ ] Delete v1's standstill slider `<input>` element + `<label>` from HTML.
- [ ] Edit `js/moonpath.js`:
  - Delete `renderStandstillSlider` function.
  - Modify `renderStandstillAnnotation` to read scrubbed year from `state.now`.
  - Modify `recompute(state)`: tide section honors D30 (compare `|state.now - state.nowOriginal|`).
  - **Contract change — `state.nowOriginal`:** add a new optional input field `state.nowOriginal` (Date or number) representing the true wall-clock `now` captured at page load. When absent, `recompute` defaults `nowOriginal = state.now` (backward-compat — v1 tests pass without modification). The page bootstrap sets it once on initial load; subsequent scrub events update only `state.now`. Document in the existing `recompute` JSDoc comment.
  - Add `setupScrubberListeners(els, state)` that wires the scrubber's `input` event through a single rAF coalesce → recompute → render pipeline.
- [ ] Edit `css/moonpath.css`: add `.mp-scrubber`, `.mp-scrubber-label`, `.mp-scrubber-footnote`, `.mp-interstitial`. Remove old `.mp-standstill-slider` rules.
- [ ] Write the rAF-throttle test in `js/moonpath.test.js` (stub `global.requestAnimationFrame`, dispatch synthetic events, count `recompute` calls).
- [ ] Run all 5 test suites; confirm no regressions.
- [ ] Manual smoke: open `/moonpath/?lat=21.307&lon=-157.867` in browser, verify scrubber visible at top, drag → standstill widget's year label updates, tide section transitions to D30 fallback past day 30.
- [ ] Commit.

---

### Slice 3: Moonrise azimuth dial widget (slot 2)

**Files:**
- Modify: `js/moonpath.js`, `js/moonpath.test.js`, `moonpath/index.html` (slot 2 markup), `css/moonpath.css`

**Spec ACs covered:** AC #10 (dial renders in slot 2), AC #12 (cardinal lookup determinism).
**Decisions:** D28 (azimuth domain + buckets + circumpolar).
**Depends on:** slice 1 (`moonriseAzimuthAt` helper), slice 2 (layout, slot 2 placeholder).

**Acceptance:**
- [ ] `js/moonpath.js` adds `cardinalProseFor(bearingDeg)` returning one of 8 strings per D28 bucket table.
- [ ] `recompute(state)` output adds `moonriseAzimuthDeg` field (number 0-360 or `null`).
- [ ] `renderMoonriseAzimuthDial(output, svgEl, labelEl)` renders compass-rose SVG (120×120) with N/E/S/W labels + single needle at the moonrise bearing. When `moonriseAzimuthDeg === null`, dial renders dimmed (`.mp-azimuth-dial--circumpolar` class, 50% opacity) with no needle; label reads *"Moon does not rise tonight — circumpolar."*
- [ ] `js/moonpath.test.js` adds:
  - `cardinalProseFor` 8-bucket boundary test at 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5 (each lands in upper bucket / wraps).
  - Domain test: `cardinalProseFor(359.999)` returns "due north" (wraps into the `[337.5, 360)` half-open bucket). Helper documents that 360 is **out of domain** (`moonriseAzimuthAt` per D28 returns values strictly in `[0, 360)`, never 360); behavior at exactly 360 is undefined and unfixtured.
  - `recompute` fixture for high-latitude winter coord (e.g., Tromsø 69.6°N at winter solstice) returns `moonriseAzimuthDeg: null`.
- [ ] CSS: `.mp-azimuth-svg`, `.mp-azimuth-needle`, `.mp-azimuth-dial--circumpolar` rules; restrained Stamen-style strokes.
- [ ] No regressions in existing test suites.
- [ ] Commit: `feat(moonpath): slice 1.3 — moonrise azimuth dial`

**Steps:**
- [ ] Implement `cardinalProseFor(bearingDeg)` per D28 bucket table. Add to `api` export.
- [ ] Write RED tests for the 8 boundary values + wrap case.
- [ ] Implement until GREEN.
- [ ] Modify `recompute(state)`: call `SunPathMath.moonriseAzimuthAt(state.now, lat, lon)`. Pack into `moonriseAzimuthDeg`.
- [ ] Write `renderMoonriseAzimuthDial(output, svgEl, labelEl)`:
  - SVG: 120×120 viewBox. Compass rose: circle + 4 cardinal tick lines + N/E/S/W labels at small offsets.
  - Needle: when `moonriseAzimuthDeg !== null`, draw line from center to perimeter at `bearingDeg` (0=N, clockwise). Else render no needle + add `mp-azimuth-dial--circumpolar` class to svg.
  - Label below: when not null → `Moon rises at ${bearingDeg.toFixed(0)}° tonight — look toward ${cardinalProseFor(bearingDeg)}.` Else → `Moon does not rise tonight — circumpolar.`
- [ ] Wire `renderMoonriseAzimuthDial` into render pipeline.
- [ ] Fill in `moonpath/index.html` slot 2 markup: `<section id="mp-azimuth" class="moonpath-section moonpath-section--widget"><h2>Moonrise direction</h2><svg id="mp-azimuth-svg" viewBox="0 0 120 120"></svg><p id="mp-azimuth-label" class="mp-azimuth-label"></p></section>`.
- [ ] Add CSS styles.
- [ ] Manual smoke: verify dial renders + needle points roughly east-ish for Honolulu tonight (moon rising in the east is typical). Pan scrubber to past, watch needle rotate. Pan to Tromsø winter, verify circumpolar state.
- [ ] Run all tests; confirm green.
- [ ] Commit.

---

### Slice 4: Eclipse pointer widget (slot 7)

**Files:**
- Modify: `js/moonpath.js`, `js/moonpath.test.js`, `moonpath/index.html` (slot 7 markup), `css/moonpath.css`

**Spec ACs covered:** AC #8 (eclipse pointer in slot 7 + fallback).
**Decisions:** D26 (helper contracts), D27 (text format + ±3000 yr fallback).
**Depends on:** slice 1 (eclipse helpers), slice 2 (layout, slot 7 placeholder).

**Acceptance:**
- [ ] `recompute(state)` output adds `nextSolarEclipse` and `nextLunarEclipse` fields (objects per D26, or `null` when `|new Date(state.now).getFullYear() − new Date(state.nowOriginal).getFullYear()| > 3000`). Boundary at exactly ±3000 yr **inclusive** = computed; > 3000 = `null`.
- [ ] `renderEclipsePointer(output, sectionEl)` renders:
  - Two `<p>` lines per D27 when both eclipses available.
  - Single fallback line *"Eclipse predictions unavailable beyond ±3,000 yr — Meeus low-precision envelope."* when scrub year outside `[currentYear - 3000, currentYear + 3000]`.
  - Magnitude formatted as `magnitude N%` (linear, per D27); date as ISO `YYYY-MM-DD`; lunar kind as `total | partial | penumbral`.
- [ ] `js/moonpath.test.js` adds:
  - `recompute` fixture with `state.now = currentYear + 3001` → `nextSolarEclipse === null`, render outputs fallback string.
  - `recompute` fixture with `state.now = currentYear + 3000` → renders eclipse pointer (boundary inclusive).
- [ ] CSS: `.mp-eclipse-pointer`, `.mp-eclipse-line`, `.mp-eclipse-fallback`.
- [ ] No regressions.
- [ ] Commit: `feat(moonpath): slice 1.4 — eclipse pointer widget`

**Steps:**
- [ ] Modify `recompute(state)`:
  - Compute `scrubYear = new Date(state.now).getFullYear()`.
  - If `|scrubYear - currentYear| > 3000`, set both eclipse fields to `null`.
  - Else, call `SunPathMath.nextSolarEclipseAfter(state.now, lat, lon)` + `nextLunarEclipseAfter(state.now, lat, lon)`. Pack into output.
- [ ] Implement `renderEclipsePointer(output, sectionEl)`:
  - If both fields `null` → render fallback line.
  - Else → render two `<p>` lines with formatted date + magnitude/kind.
- [ ] Wire into render pipeline.
- [ ] Fill in `moonpath/index.html` slot 7 markup: `<section id="mp-eclipse" class="moonpath-section moonpath-section--widget"><h2>Next eclipse</h2><div id="mp-eclipse-content"></div></section>`.
- [ ] Add CSS.
- [ ] Write boundary tests (scrubYear = currentYear ± 3000 / ± 3001).
- [ ] Run RED → GREEN.
- [ ] Manual smoke: at default `now`, verify both lines render with sensible dates (within a year or two). Scrub to year 6000 → fallback line visible. Scrub back → eclipses return.
- [ ] Run all tests.
- [ ] Commit.

---

### Slice 5: Interstitial prose system (8 slots)

**Files:**
- Modify: `js/moonpath.js`, `js/moonpath.test.js`, `moonpath/index.html`, `css/moonpath.css`

**Spec ACs covered:** AC #5 (8 interstitial DOM elements), AC #6 (recompute on scrub), AC #7 (table shape + count).
**Decisions:** D25 (sectionId-first table, empty default hides).
**Depends on:** slice 2 (widget order pinned, placeholder `<p class="mp-interstitial">` elements exist).

**Acceptance:**
- [ ] `INTERSTITIAL_TABLE` const exists in `js/moonpath.js` as object of `{sectionId → {stateKey → prose}}` with **24–32 curated strings total**, **≥2 entries per sub-table**.
- [ ] `interstitialFor(output, sectionId)` pure function exported. Returns string (empty string `''` when no curated match — the `default` key value). **State-key priority order (most specific first, locked in code):** `isCircumpolar:true` → `isMoonBelowHorizon:true` → `springNeapState:<value>` → `k_bucket:<value>` → `default`. Tested via fixture: an output with both `isCircumpolar=true` and `k_bucket='bright'` returns the circumpolar string, not the brightness string.
- [ ] `renderInterstitial(output, sectionId, pEl)` reads `interstitialFor(...)`. Sets `pEl.textContent` + removes `hidden` attribute when non-empty; sets `hidden` attribute when empty. Italic styling via CSS.
- [ ] 8 `<p class="mp-interstitial">` elements exist in DOM (from slice 2's placeholders), with `data-section-id` attributes matching the 8 inter-section slot IDs.
- [ ] On every `recompute(state) → render` cycle, all 8 interstitials are re-rendered.
- [ ] `js/moonpath.test.js` table-shape tests:
  - `Object.keys(INTERSTITIAL_TABLE).length === 8` (one sub-table per slot).
  - For each sub-table: at least 2 **curated** (non-`default`) entries (`Object.keys(subTable).filter(k => k !== 'default').length >= 2`).
  - Sum across all 8 sub-tables of curated entries (excluding any `default` key) is in `[24, 32]`.
  - The `default` key value, when present, MUST be the empty string `''`. All non-`default` entries MUST be non-empty strings.
  - No entry (including `default`) contains `<` or `>`.
  - No entry contains the banned word; **constructed at runtime via `String.fromCharCode(...)` so the literal never appears in source**, preventing the slice-6 grep gate from matching the test file itself.
- [ ] DOM assertion test: `document.querySelectorAll('p.mp-interstitial').length === 8` (skipped under node-only env via `typeof document === 'undefined'` guard; manually verified in slice 6 browser smoke instead).
- [ ] No regressions.
- [ ] Commit: `feat(moonpath): slice 1.5 — interstitial prose system`

**Steps:**
- [ ] Define `INTERSTITIAL_TABLE` const in `js/moonpath.js`:
  ```js
  const INTERSTITIAL_TABLE = {
    'between-dome-and-azimuth': {
      'isCircumpolar:true':  'Tonight at your latitude the moon never sets — circumpolar.',
      'isMoonBelowHorizon:true':  'Moon is below the horizon all night here.',
      'default': '',
    },
    'between-azimuth-and-phase': {
      'k_bucket:bright': 'Bright enough for shadow-walking.',
      'k_bucket:faint':  'A thin sliver, barely lit.',
      'default': '',
    },
    // ... 6 more slots
  };
  ```
  Curate 24–32 strings total, ≥2 per slot. Almanac voice. Brand-aligned per `memory/almanac_aesthetic.md`.
- [ ] Implement `interstitialFor(output, sectionId)`:
  - Look up `INTERSTITIAL_TABLE[sectionId]`.
  - Iterate state-key probes in priority order (e.g., `isCircumpolar:true` > `isMoonBelowHorizon:true` > `springNeapState:spring` > `k_bucket:bright` > default).
  - Return first match's prose, or `''` for the default.
- [ ] Implement `renderInterstitial(output, sectionId, pEl)`.
- [ ] Wire 8 interstitial renders into the main render pipeline.
- [ ] Update `moonpath/index.html`: 8 `<p class="mp-interstitial" data-section-id="...">` elements at the 8 inter-section positions.
- [ ] Add CSS: `.mp-interstitial { font-style: italic; color: var(--stone); margin: 1rem 0; }`. `.mp-interstitial[hidden] { display: none; }`.
- [ ] Write table-shape tests.
- [ ] Run tests; confirm green.
- [ ] Manual smoke: scrub through dates, verify interstitials appear/disappear at state transitions (e.g., spring tide week vs neap, full moon vs new moon).
- [ ] Commit.

---

### Slice 6: Wire-up + launch smoke

**Files:**
- Modify: `js/moonpath.js` (final integration), `docs/specs/2026-05-14-moonpath-launch.md` (append v1.1 section)

**Spec ACs covered:** AC #15-#18 (v1 grep gates still clean), all v1.1 ACs end-to-end.
**Depends on:** slices 1-5.

**Acceptance:**
- [ ] All 19 v1.1 ACs check green when manually walked through.
- [ ] All 5 test suites pass: sunpath-math (82 + 9 new = 91), daylight-math (33), daylight-perf, tide-math (12), moonpath (155 + slice-specific additions ≈ 200+).
- [ ] v1 grep gate (scoped to non-test files): `grep -riE 'supermoon' moonpath/ js/sunpath-math.js js/tide-math.js css/moonpath.css js/moonpath.js` returns nothing. **(Excludes `*.test.js` files to avoid self-collision with slice 5's negative-assertion test; the test uses runtime-constructed string anyway.)**
- [ ] `test -f package.json && echo bad || echo ok` echoes `ok`.
- [ ] No new third-party hosts introduced.
- [ ] Browser smoke recorded in `docs/specs/2026-05-14-moonpath-launch.md` v1.1 section: 3 themes × 2 scrub positions (now, +100 ticks) screenshotted.
- [ ] PR #3 description updated to reflect v1 + v1.1 bundle.
- [ ] Commit: `docs(moonpath): slice 1.6 — v1.1 wire-up + launch smoke`

**Steps:**
- [ ] Verify scrubber drives all 9 widget renders end-to-end. Fix any wiring gaps where a widget didn't re-render on scrub.
- [ ] Run all 5 test suites; record output.
- [ ] Run grep gates; record output.
- [ ] Open `/moonpath/` in browser. Cycle through light/dark/star themes. At each theme, screenshot scrubber-at-now and scrubber-at-+100-ticks (date ~6 mo future). 6 screenshots total — embed or reference in launch doc.
- [ ] Update PR #3 description to add a "v1.1 enhancements" section.
- [ ] Append v1.1 section to `docs/specs/2026-05-14-moonpath-launch.md` with AC verification table + screenshots reference + deferred items.
- [ ] Commit.

---

## What this plan does NOT include

- Eclipse path maps / shadow rendering (spec non-goal).
- Two-coord overlay (spec non-goal, deferred to v2).
- Memory ribbon (spec non-goal, deferred to v1.2).
- Libration map (spec non-goal, deferred to v1.2/v2).
- New tide ports (out of scope; the 8 deferred ports stay deferred).
- Audio tide-clock (spec non-goal).

## Risks specific to execution

- **Meeus Ch. 54 implementation complexity.** Eclipse math (slice 1) is the heaviest math new code in v1.1 — ~180 LOC for the two eclipse helpers. Mitigation: implement against a small fixture set first (3 known eclipses per type from USNO catalog), iterate until tolerance passes. Skip the "magnitude band" optimization until basic visibility works.
- **rAF stub flakiness in test.** The rAF-throttle test (AC #19) requires a stub that fires its callback in a controlled order. Mitigation: store-and-flush pattern (stub captures callbacks in a queue, test code explicitly flushes 5 times). No use of `setTimeout` in the test.
- **State-key priority order in `interstitialFor`.** With ≥2 entries per slot keyed on different dimensions, two keys might both match a single output. Mitigation: pin a documented priority order in `interstitialFor`'s implementation (most specific → least specific) so curators can reason about which line will fire.
- **Branch divergence on PR #3.** Continuing v1.1 on the same branch makes the PR larger (30+ commits). Mitigation: keep slice commit messages clear with `slice 1.N` prefix so PR reviewers can checkout-and-step. If PR diff balloons past ~7000 LOC, consider splitting v1.1 into its own PR.
- **D24 base imprecision — accepted, not blocking.** Spec `1.0293^500 ≈ 5,150 yr` is ~3% over the ±5,000 yr target. Slice 2 AC verifies the bound matches the formula (~5,150 yr); D29 amends in the post-merge release notes to read "±5,150 yr (effective)" if the discrepancy bothers anyone. Decision: accept the overshoot.

## Verification plan

1. `jutsu swarm doc-review docs/plans/2026-05-14-moonpath-v1-1-plan.md` → fix findings, iterate.
2. `scope-check` per slice for cost-tier classification.
3. Implement via subagent-driven-development on `moonpath` branch.
4. After slice 6: `jutsu swarm pr-review --pr 3 --personas claim-auditor-claude,cross-file-gemini,claim-auditor-deepseek` to re-review the full PR with v1 + v1.1.
5. Triage findings, fix or defer.
6. Browser smoke in 3 themes (light, dark, star) before merge.
