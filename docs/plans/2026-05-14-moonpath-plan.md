# /moonpath Implementation Plan

**Spec:** `docs/specs/2026-05-14-moonpath.md`
**Goal:** Ship `/moonpath/` — universal coord-driven moon + tide viewer, entry #3 in the contemplative-instrument almanac.
**Architecture:** Two-layer page (pure `recompute(state)` + DOM glue) mirroring /daylight. Moon math extends existing `js/sunpath-math.js`. Tide math is a new `js/tide-math.js` with harmonic synthesis from baked port constituents. ICS export is a bake-script pattern lifted from /daylight. The 200 km tide-section visibility threshold (D9) makes the tide section gracefully invisible for inland coords — universal-by-default.
**Tech Stack:** Vanilla JS, zero npm deps, node-based tests, dual-export pattern. Reuses /sunpath fonts + analytics + theme system via the shared `<head>`.

**Status:** draft v2 — addresses plan-round-1 doc-review (slider unreachable archaeo callouts, missing perigee/syzygy helpers, D3 self-reference, lux brackets mis-cited as D10). Decisions D19-D23 added inline.

> **For implementers (human or agent):** execute this plan task-by-task with `subagent-driven-development` (recommended) or `executing-plans` (separate-session mode). Steps use checkbox (`- [ ]`) syntax for tracking. Per-slice ACs map to spec ACs by number — verify after each slice that the cited AC is satisfied.

## Decision summary (pulled from spec)

| ID | Decision | Slice |
|---|---|---|
| D1 | URL: `/moonpath/` (mirrors `/sunpath/`) | 3 |
| D2 | Tide model: harmonic synthesis, 10 constituents per port, hand-baked | 1, 2 |
| D3 | 12 baked ports (provisional pending **Q1** license audit — see slice 0) | 0, 2 |
| D4 | Geolocation: explicit-tap only | 3 |
| D5 + D18 | Tz from coord IANA lookup; browser-local fallback with `(local time)` label for unresolvable coords | 3 |
| D6 | "Supermoon" word banned (verified by grep) | 4 |
| D7 | Earthshine threshold k ∈ [0.03, 0.15] | 4 |
| D8 | Standstill slider range ±2,000 yr | 5 |
| D9 | Tide section hidden when nearest port >200 km | 6 |
| D10 | Spring/neap 5-state table keyed to days-from-syzygy | 6 |
| D11 | Full-moons ICS annual; tide-port ICS weekly | 7 |
| D12 | Stub VEVENT when tide-port window is empty (RFC 5545 valid) | 7 |
| D13 | Earthshine `k = (1 − cos(2π·phase)) / 2` (computed inline in slice 4's `recompute`; not a slice-1 helper) | 4 |
| D14 | Apparent-size rounded to one decimal | 4 |
| D15 | Standstills NOT in full-moons ICS | 7 |
| D16 | Apparent-size = angular-diameter (1/distance), not linear distance | 4 |
| D17 | King-tide flag tied to tide-section visibility | 6 |
| **D19** *(new this round)* | **Lux bracket table** lives in Feature 5; 4 half-open buckets + below-horizon state. Was conflated with D10 (spring/neap) in plan v1; promoted to its own decision for citation clarity. | 4 |
| **D20** *(new this round)* | **Slider widened to ±5,000 yr** to reach pre-Common-Era archaeo callouts (Newgrange -3200, Callanish -1800). D8's ±2,000 yr Meeus-accuracy envelope is preserved as a footnote: standstill years computed within ±2,000 yr are accurate to ±1 yr; beyond, treat as illustrative anchors. Slider becomes a navigation widget, not a precision instrument, at the extremes. | 5 |
| **D21** *(new this round)* | **Perigee + syzygy helpers** added to slice 1 math inventory: `perigeeMomentAfter(date)` → next lunar perigee instant; `syzygyMomentAfter(date, kind)` where `kind ∈ {'new', 'full'}`. Needed by slice 6 (king-tide flag) + slice 7 (king-tide ICS). | 1, 6, 7 |
| **D22** *(new this round)* | **Sitemap ⊆ baked-files invariant.** Slice 8's sitemap update reads the actual `moonpath/*.ics` filenames from disk and emits one `<url>` per file. No hardcoded "12 ports" in sitemap — auto-derived from bake output. | 8 |
| **D23** *(new this round)* | **`nearestPortFor` 200 km boundary is closed-left, open-right.** Exactly 200 km → still considered "near" (tide section visible). 200.001 km → "far". Matches D9 half-open spirit. | 6 |

---

## File structure

**Created (source):**
- `moonpath/index.html` — page shell (hub-only, no subpages)
- `js/moonpath.js` — page controller, two-layer IIFE + dual-export
- `js/moonpath.test.js` — node-based test harness, covers moonpath-specific pure helpers
- `js/tide-math.js` — harmonic synthesis from constituents (~120 LOC)
- `js/tide-math.test.js` — Yokohama-canonical tide fixtures + spot-checks per port
- `css/moonpath.css` — page styles (sibling to /sunpath.css palette)
- `scripts/bake-moonpath-ics` — bake script producing 2 full-moons + 12 tide-port ICS files
- `assets/moonpath/tide-ports.json` — 12 ports × 10 harmonic constituents (committed data, ~8 KB)
- `docs/specs/2026-05-14-moonpath-port-licensing.md` — slice 0 audit artifact
- `docs/specs/2026-05-14-moonpath-launch.md` — slice 8 launch smoke

**Modified:**
- `js/sunpath-math.js` — add 4 helpers: `moonAltAzAt(date, lat, lon)`, `moonDistanceAt(date)`, `apparentDiameterAt(date)`, `lunarStandstillNear(date, year)`
- `js/sunpath-math.test.js` — append fixtures for all 4 new helpers (3 fixtures each minimum per AC #12)
- `sunpath/index.html` — add quiet `/moonpath/` sibling link in the existing daylight cross-reference section
- `daylight/index.html` — add quiet `/moonpath/` sibling link in the footer
- `sitemap.xml` — append `/moonpath/` + 2 full-moon ICS URLs + 12 tide-port ICS URLs
- `llms.txt` — add `/moonpath/` to the "Companion site" section

**Generated artifacts (committed):**
- `moonpath/full-moons-<currentYear>.ics` × 1
- `moonpath/full-moons-<currentYear+1>.ics` × 1
- `moonpath/tides-<port>.ics` × up to 12

**Total:** 10 created + 6 modified source files + ~14 generated artifacts = 30 paths after a fresh bake.

---

## Slice DAG

```
slice 0 (port-license audit) ──┬──→ slice 1 (math foundations) ──┬──→ slice 4 (sky widgets) ─────┐
                               │                                  ├──→ slice 5 (standstill) ──────┤
                               │                                  ├──→ slice 6 (tide render) ─────┤
                               └──→ slice 2 (bake tide-ports) ────┼──→ slice 6 (tide render)      ├──→ slice 8 (verify + launch)
                                                                  └──→ slice 7 (ICS export) ──────┤
slice 3 (page shell) ─────────────────────────────────────────────┴──→ slices 4, 5, 6 wire into ─┘
```

Critical path: `0 → 1 → 6 → 8` (license audit gates Yokohama fixtures, gates tide math + render, gates launch). Slice 3 (page shell) is independent and can run alongside slices 0, 1, 2. Slice 7 (ICS) depends on slice 1's math + slice 2's port JSON; it can run in parallel with slices 4/5/6.

---

### Slice 0: Port-data licensing audit (Q1)

**Files:**
- Create: `docs/specs/2026-05-14-moonpath-port-licensing.md` (no code)

**Spec gate covered:** Q1 (blocking) — resolves before tide-port JSON can be baked in slice 2. **No spec ACs satisfied yet** — this slice unblocks slice 2 + slice 6 + AC #13.
**No dependencies.** Parallelizable with slices 1 + 3.

**Acceptance:**
- [ ] For each of the 12 spec-listed ports, document the source of harmonic constituent data + its license (NOAA public domain, UK Admiralty paid, JMA terms, BoM Australia terms, etc.).
- [ ] Categorize each port: ✅ green-light to bake / ⚠️ need substitution / ❌ cannot use.
- [ ] If any port is red, propose a substitution from the same region (e.g., Tokyo Bay if Yokohama is restricted; Bristol if Dover is restricted).
- [ ] Output: a frozen final list of ≤12 ports plus their source URLs cited in the audit doc.
- [ ] **Yokohama must remain in the final list** OR be replaced by a near-equivalent Japanese coast — Yokohama is the canonical test-bed per AC #13 and substituting it requires updating the spec.

**Steps:**
- [ ] Create `docs/specs/2026-05-14-moonpath-port-licensing.md` skeleton with a 12-row table: port / lat-lon / data source URL / license / verdict.
- [ ] For each US port (Boston, San Francisco): confirm NOAA Tides and Currents publishes harmonic constituents under public domain. Cite the per-port API endpoint.
- [ ] For UK port (Dover): check UK Admiralty / National Tidal and Sea Level Facility licensing. May be paid; consider Newlyn as alternative if blocked.
- [ ] For Japan ports (Yokohama): confirm JMA / Japan Coast Guard publishes harmonic constituents publicly.
- [ ] For Iberian ports (Lisbon, A Coruña, San Sebastián): check Puertos del Estado España + Instituto Hidrográfico Português.
- [ ] For French port (Brest): check SHOM (Service Hydrographique et Océanographique de la Marine).
- [ ] For Auckland: check LINZ / Land Information New Zealand.
- [ ] For Cape Town: check SAN Hydrographic Office.
- [ ] For Mumbai: check Indian National Hydrographic Office.
- [ ] For Sydney: check Australian BoM.
- [ ] Mark each row green/yellow/red, propose substitutions, freeze the final list.
- [ ] Commit on branch: `docs(moonpath): slice 0 — port-data licensing audit (Q1)`.

---

### Slice 1: Math foundations — moon helpers + tide math

**Files:**
- Modify: `js/sunpath-math.js` (add 4 helpers), `js/sunpath-math.test.js` (append fixtures)
- Create: `js/tide-math.js`, `js/tide-math.test.js`

**Spec ACs covered:** AC #12 (moon math fixtures — 6 helpers per D21, not 4), AC #13 (tide math fixtures, Yokohama canonical).
**Decisions:** D2 (harmonic synthesis), D16 (angular diameter math), D21 (perigee/syzygy helpers).
**Depends on slice 0** for the Yokohama license verdict before baking Yokohama-specific test fixtures. If slice 0 red-flags Yokohama, the canonical test-bed swaps to a green-light substitute (suggest Tokyo Bay → Tokyo Coastal Observatory data) and AC #13 is updated. **Parallelizable with slice 3.** Removed from "parallelizable with slice 0" claim.

**Acceptance:**
- [ ] `js/sunpath-math.js` exports 6 new functions with stable signatures (4 from the spec + 2 added in plan-round-2 per D21):
   - `moonAltAzAt(date, lat, lon)` → `{ altitude: deg, azimuth: deg }` (azimuth east of north, altitude positive above horizon).
   - `moonDistanceAt(date)` → `{ distanceKm: number }`.
   - `apparentDiameterAt(date)` → `{ diameterDeg: number }` using mean distance 384,400 km.
   - `lunarStandstillNear(date, targetYear)` → `{ year: number, type: 'major'|'minor', peakDeclination: deg }`.
   - **`perigeeMomentAfter(date)` → `{ utcMs: number, distanceKm: number }`** *(D21)*. Returns the next lunar perigee instant after `date`. Used by king-tide detection (slice 6 + 7).
   - **`syzygyMomentAfter(date, kind)` → `{ utcMs: number }`** *(D21)* where `kind ∈ {'new', 'full'}`. Returns the next new/full moon UTC instant after `date`. Used by king-tide detection.
- [ ] `js/sunpath-math.test.js` appends ≥3 fixtures per helper — **18 total new assertions** (6 helpers × 3). Tolerances per AC #12 (extends to perigee/syzygy: ±2 hours each).
- [ ] `js/tide-math.js` exports `harmonicTideHeightM(unixSeconds, constituents)` → metres above MSL. Pure function. Constituent format documented at top of file (M2/S2/N2/K1/O1/P1/Q1/K2/M4/MS4 amplitude + phase per port).
- [ ] `js/tide-math.test.js` runs via `node js/tide-math.test.js`, asserts Yokohama tide heights match NOAA-published values within ±0.3 m for 5 sample (date, time) tuples (AC #13).
- [ ] No regressions in existing sunpath-math.test.js (58 v2 assertions still pass).
- [ ] Commit on branch: `feat(moonpath): slice 1 — moon math (4 helpers) + tide-math harmonic synthesis`.

**Steps:**
- [ ] Read `js/sunpath-math.js` end-to-end to understand the existing IIFE/dual-export pattern, plus the existing moonriseUTC/moonsetUTC/moonPhaseAtUTC that slice 1 of daylight v2 added.
- [ ] Implement `moonAltAzAt`: extend the existing Meeus lunar position to compute topocentric altitude + azimuth from geocentric RA/Dec via the standard horizontal-coords transform. Reuse `obliquityAtJD` and `gmstDeg` already in the file.
- [ ] Implement `moonDistanceAt`: extend the Meeus Ch. 47 truncated series for lunar distance (a handful of additional periodic terms beyond the position-only series). ~30 LOC.
- [ ] Implement `apparentDiameterAt`: `2 * atan(MOON_RADIUS_KM / distanceKm)` in degrees. Three lines.
- [ ] Implement `lunarStandstillNear`: solve for the year where lunar declination range hits its peak (~18.3° minor / ~28.5° major). The 18.6-year nodal cycle gives an analytic approximation; document accuracy envelope (±1 year within ±2000 yr per D8).
- [ ] Add all four to the `api` object export at file bottom.
- [ ] Fetch ≥3 reference values per helper from a published almanac (suggest timeanddate.com for altitude/azimuth, USNO for distance + apparent diameter, archaeoastronomy sources for standstill years). Bake as test fixtures with provenance comments.
- [ ] Write RED tests, run `node js/sunpath-math.test.js` — confirm RED.
- [ ] Implement until GREEN. Confirm v2's 58 assertions still pass.
- [ ] Create `js/tide-math.js`:
   - Hand-implement Doodson/Schureman harmonic synthesis (see NOAA tide prediction algorithm docs). ~120 LOC.
   - Function shape: `harmonicTideHeightM(unixSeconds, constituents)` where `constituents` is a JS object `{M2: {amp, phase}, S2: {...}, ...}`.
   - Module-level constants for the 10 standard constituent angular speeds (degrees per hour).
- [ ] Create `js/tide-math.test.js` matching the project's test-harness style.
- [ ] Use Honolulu as canonical test-bed (AC #13). Hand-curate Yokohama's 10 constituents from JMA-published data (deferred from slice 0; just enough for the unit tests to pass). Fetch 5 sample NOAA Yokohama tide heights → bake as fixtures.
- [ ] Run RED, implement until GREEN. ±0.3 m tolerance.
- [ ] Run all 3 v1+v2 test suites: confirm no regression.
- [ ] Commit per the slice's final step.

---

### Slice 2: Bake tide-ports.json + bake-script skeleton

**Files:**
- Create: `scripts/bake-moonpath-ics` (skeleton — JSON pass only; ICS pass comes in slice 7)
- Create: `assets/moonpath/tide-ports.json` (committed data file)

**Spec ACs covered:** AC #16 partial (bake script idempotency for JSON output).
**Decisions:** D3 (port list), D11 (bake cadence model).
**Depends on:** slice 0 (port license audit must be done before baking commercial data).

**Acceptance:**
- [ ] `assets/moonpath/tide-ports.json` contains one record per finalized port from slice 0, each with `{ id, name, lat, lon, country, constituents: { M2: {amp, phase}, ... 10 total } }`.
- [ ] Provenance: each port record has a `source` field citing the data source URL from the licensing audit.
- [ ] `scripts/bake-moonpath-ics` skeleton — reads `tide-ports.json`, validates schema, writes nothing yet (ICS bake = slice 7). Used in this slice to validate the input file is structurally well-formed.
- [ ] Bake fails loud (non-zero exit + single-line stderr) if any port record is missing constituents, source URL, or has invalid lat/lon.
- [ ] Run all existing tests: no regression.
- [ ] Commit: `feat(moonpath): slice 2 — bake tide-ports.json from licensed sources`.

**Steps:**
- [ ] Read the finalized port list from slice 0's audit doc.
- [ ] Build the JSON file by hand, one port at a time. For each: lat/lon, country code, source URL, then the 10 constituent records. Use NOAA / JMA / etc.-published harmonic-constant tables.
- [ ] Create `scripts/bake-moonpath-ics` with shebang + IIFE + the `die()` fail-loud helper pattern from `scripts/bake-daylight-routes`.
- [ ] In the script's `main()`, read the JSON, validate schema, exit 0 if all clean.
- [ ] Run idempotency: `git diff --exit-code assets/moonpath/tide-ports.json` after first commit, second run is a no-op.
- [ ] Commit.

---

### Slice 3: Page shell + empty state + URL-param wiring

**Files:**
- Create: `moonpath/index.html`, `js/moonpath.js` (skeleton), `js/moonpath.test.js`, `css/moonpath.css`

**Spec ACs covered:** AC #1 (static HTML), AC #2 (URL params + empty state), AC #15 (moonpath.test.js initial coverage), AC #17 (no third-party hosts at runtime), AC #19 (geolocation discipline).
**Decisions:** D1 (URL), D4 (geolocation), D5/D18 (tz fallback).
**No dependencies.** Parallelizable with slices 0 + 1.

**Acceptance:**
- [ ] `/moonpath/index.html` loads as a static HTML page, no build framework, mirrors `/sunpath/index.html` chrome (font loading, analytics, theme toggle).
- [ ] URL params `?lat=...&lon=...&date=...` parsed into initial state via `parseParams()`.
- [ ] Without params: empty-state block with `<button>Use my location</button>` + two `<input type="number">` fields for manual lat + lon. No auto-geolocate.
- [ ] Page passes the AC #17 grep (no new third-party hosts).
- [ ] `grep -n 'navigator.geolocation' js/moonpath.js` returns hits only inside the explicit "Use my location" click handler (AC #19).
- [ ] `js/moonpath.test.js` covers initial helpers: `parseParams()`, `nearestPortFor(lat, lon)` stub returning null until slice 6 wires it.
- [ ] All 3 existing test suites still pass.
- [ ] Commit: `feat(moonpath): slice 3 — page shell + empty state + URL params`.

**Steps:**
- [ ] Sketch `moonpath/index.html` head/body matching `sunpath/index.html` — same Google Fonts call, same analytics tag, same theme system (`/js/moon.js` + `/js/universe.js` + `/js/main.js`), same JSON-LD WebPage scaffolding.
- [ ] Body: `<div class="moon-phase" id="moon-toggle">` for theme cycle, then `<main class="moonpath-main">` with title + lede + empty-state block + (placeholder) widget slots.
- [ ] Add empty-state markup: `<section id="mp-coord-entry">` with explanation prose, the geolocate button, and the manual lat/lon inputs.
- [ ] Create `js/moonpath.js` two-layer IIFE skeleton (mirror /daylight): pure `recompute(state)` + DOM glue shell. Implement `parseParams(searchString)` first; return early before any widget render until coords are set.
- [ ] Add `navigator.geolocation.getCurrentPosition` only inside the locate-button click handler. Cache the geolocated coord into state + URL via `history.replaceState`.
- [ ] Add manual-entry submit-on-blur handlers for the two number inputs.
- [ ] Create `js/moonpath.test.js`: test `parseParams` returns expected shape; test malformed input falls back to defaults.
- [ ] Create `css/moonpath.css`: minimal styles for the empty-state block + space for future widgets. Inherit palette from `/css/styles.css`.
- [ ] Manual smoke: open `/moonpath/` in browser, confirm empty state renders, geolocate button fires only on tap, manual coord entry triggers URL update.
- [ ] Run grep gates AC #17 + AC #19. Confirm clean.
- [ ] Commit.

---

### Slice 4: Sky widgets bundle — 5 features sharing recompute output

**Files:**
- Modify: `js/moonpath.js` (extend `recompute` + add 5 render functions), `css/moonpath.css` (style 5 widgets), `js/moonpath.test.js` (add helper tests)

**Spec ACs covered:** AC #3 (moon-in-sky), AC #4 (phase clock), AC #5 (earthshine), AC #6 (apparent size + supermoon grep), AC #7 (lux brackets + below-horizon state).
**Decisions:** D6 (supermoon ban), D7 (earthshine threshold), D13 (k formula), D14 (rounding), D16 (apparent-size math).
**Depends on:** slice 1 (math foundations), slice 3 (page shell).

**Acceptance:**
- [ ] `recompute(state)` output grows fields: `moonAltAz`, `moonPhase` (k value), `moonDistanceKm`, `moonApparentDiameterDeg`, `moonLuxAtCoord`, `isMoonBelowHorizon`.
- [ ] All five widgets render in their assigned page slots.
- [ ] Earthshine annotation renders exactly when `0.03 ≤ k ≤ 0.15`, hidden otherwise (AC #5).
- [ ] Apparent-size annotation rounded to one decimal (AC #6). Grep gate clean: `grep -riE 'supermoon' moonpath/ js/moonpath*.js js/sunpath-math.js js/tide-math.js css/moonpath.css` returns nothing.
- [ ] Lux annotation uses one of 4 brackets from **D19's table** (NOT D10 — that's spring/neap) OR the "moon below horizon" line — exactly one renders (AC #7).
- [ ] `js/moonpath.test.js` adds property tests: `luxBracketFor(lux)` boundary check (values at 0.005, 0.05, 0.2 fall into upper bracket — D7 half-open discipline), `apparentSizePercentString(distanceKm)` rounding to one decimal place.
- [ ] Commit: `feat(moonpath): slice 4 — sky widgets bundle (5 features)`.

**Steps:**
- [ ] Extend `recompute(state)` to call all 4 sunpath-math moon helpers and pack results into the output object.
- [ ] Implement `luxAtCoordFor(altitude, phase)` — astronomical lux formula combining lunar illuminance + altitude + atmospheric extinction. Suggest the Krisciunas-Schaefer formula or a simpler approximation: `lux ≈ 0.32 * k * sin(altitude in rad)` for moon above horizon, 0 below. Document the approximation choice in a code comment.
- [ ] Implement `luxBracketFor(lux)` — half-open lookup table per D10. Property-test boundary values.
- [ ] Implement `apparentSizePercentString(distanceKm)` per D14 (one decimal, D16 angular-diameter formula).
- [ ] Implement render functions:
   - `renderMoonInSky(output, svgEl)` — SVG dome diagram with tonight's moon-altitude curve, rise/transit/set markers, now-tick.
   - `renderPhaseClock(output, svgEl)` — circular ring + wedge for `k` + phase-name label.
   - `renderEarthshineAnnotation(output, p)` — text element, shown/hidden based on `k` range.
   - `renderApparentSizeDial(output, svgEl)` — small dial showing today's apparent diameter vs mean.
   - `renderLuxRing(output, svgEl, p)` — brightness ring + annotation prose.
- [ ] Wire renders into the page's render pipeline in `runAndRender()`.
- [ ] Style in `css/moonpath.css` — match Stamen restraint, no chrome, dial faint strokes.
- [ ] Verify supermoon grep is clean (no accidental word in code OR copy).
- [ ] Test manually in browser at: full moon coord (max lux), new moon (below threshold), thin crescent (earthshine fires), perigee (large apparent size).
- [ ] Run tests; confirm `js/moonpath.test.js` has new boundary checks passing.
- [ ] Commit.

---

### Slice 5: Lunar standstill time-machine

**Files:**
- Modify: `js/moonpath.js` (add standstill render), `css/moonpath.css`, `moonpath/index.html` (slider slot)

**Spec ACs covered:** AC #8 (standstill slider + 3 archaeo callouts).
**Decisions:** D8 (Meeus accuracy envelope ±2,000 yr), **D20** (slider widened to ±5,000 yr to reach pre-CE archaeo years).
**Depends on:** slice 1 (lunarStandstillNear helper), slice 3 (page shell).

**Acceptance:**
- [ ] Slider `<input type="range" min="<currentYear-5000>" max="<currentYear+5000>" value="<currentYear>">` per D20. Range wide enough to reach Newgrange (-3200) and Callanish (-1800).
- [ ] Slider on-change updates a label "Year: X, nearest standstill: Y (major/minor, declination Z°)".
- [ ] At least 3 archaeoastronomy callouts trigger when slider is within ±50 years of pinned years (per AC #8 fixture table): Callanish -1800, Newgrange -3200, Chimney Rock +1100. Callouts render below the slider as quiet italic prose.
- [ ] **Two-tier accuracy footnote** below the slider: *"Standstill years are computed accurate to ±1 year within ±2,000 yr of today (Meeus low-precision envelope). Beyond that range, the slider is a navigation widget — historical anchors are pinned from archaeological literature, not derived from the model."* Visible at all slider positions; styled muted/italic per brand voice.
- [ ] Commit: `feat(moonpath): slice 5 — standstill time-machine`.

**Steps:**
- [ ] Add the slider HTML element to `moonpath/index.html` in its dedicated slot.
- [ ] In `js/moonpath.js`, add `renderStandstillSlider(state, output)` — reads current slider year, calls `SunPathMath.lunarStandstillNear(...)`, renders the result label.
- [ ] Add the archaeo-callout lookup as a const table at the top of the render function. Format: `[{site: 'Callanish', year: -1800, prose: 'Outer Hebrides — major standstill alignment observed at the Callanish stones.'}, ...]`.
- [ ] Filter by `|slider.value - site.year| <= 50` to decide which callouts fire.
- [ ] Style the slider + callouts in CSS — Stamen restraint, no chrome.
- [ ] Manual smoke: slide to -1800, verify Callanish callout fires; slide to 0, verify no callouts; slide to +1100, verify Chimney Rock fires.
- [ ] Commit.

---

### Slice 6: Tide section — curve + spring/neap + king-tide

**Files:**
- Modify: `js/moonpath.js` (add tide compute + render), `css/moonpath.css`, `js/moonpath.test.js`
- Read: `assets/moonpath/tide-ports.json` (from slice 2)

**Spec ACs covered:** AC #9 (tide curve + 200 km threshold), AC #10 (spring/neap states), AC #11 (king-tide flag).
**Decisions:** D9 (visibility), D10 (5-state table), D17 (king-tide tied to visibility), D21 (perigee/syzygy helpers), D23 (200 km closed-left/open-right).
**Depends on:** slice 1 (tide-math + perigee/syzygy helpers), slice 2 (port JSON), slice 3 (page shell).

**Acceptance:**
- [ ] `recompute(state)` adds `nearestPort`, `nearestPortDistanceKm`, `tideHeights24h`, `springNeapState`, `kingTideUpcoming` fields.
- [ ] Tide section hidden when `nearestPortDistanceKm > 200`; otherwise renders the curve.
- [ ] Hidden case shows fallback line: "Tides not applicable at this coord — nearest baked port is N km away."
- [ ] Sine-wave plot of past 24h + next 24h tide heights. High/low markers annotated.
- [ ] Spring/neap annotation reads from D10 table verbatim, exactly one state at a time.
- [ ] King-tide flag renders only when tide section visible + perigee/syzygy alignment within 30 days.
- [ ] `js/moonpath.test.js` adds `nearestPortFor(lat, lon)` round-trip property test (port's own coord returns that port). **Boundary test (D23):** coord at exactly 200 km from a port returns that port + distance 200; coord at 200.0001 km returns the port + distance >200 (so the renderer hides the section). `springNeapStateFromPhase(phase, daysFromSyzygy)` returns exactly one of 5 states.
- [ ] Commit: `feat(moonpath): slice 6 — tide section render`.

**Steps:**
- [ ] Implement `nearestPortFor(lat, lon)` — haversine distance to each port, return the closest one + distance.
- [ ] Implement `springNeapStateFromPhase(phase, daysFromSyzygy)` — D10 table lookup.
- [ ] Extend `recompute(state)` with the 5 new fields. Skip computation when nearest port >200 km.
- [ ] Implement `renderTideCurve(output, svgEl)` — sine-wave SVG plot using harmonic-synthesized heights at 30-min granularity.
- [ ] Implement `renderSpringNeapAnnotation(output, p)` and `renderKingTideFlag(output, p)`.
- [ ] Add fallback-line render when section is hidden.
- [ ] Manual smoke: pick coord near Yokohama, verify curve renders; pick coord inland (Kyoto), verify section hidden + fallback shows; pick coord mid-ocean, verify fallback.
- [ ] Run all tests.
- [ ] Commit.

---

### Slice 7: ICS calendar exports

**Files:**
- Modify: `scripts/bake-moonpath-ics` (add ICS pass beyond the slice-2 skeleton)
- Generated: `moonpath/full-moons-<year>.ics` × 2, `moonpath/tides-<port>.ics` × ≤12

**Spec ACs covered:** AC #14 (ICS export with blue-moon-year handling), AC #16 (idempotency).
**Decisions:** D11 (cadence), D12 (stub VEVENT), D15 (no standstills), D21 (uses perigee/syzygy helpers).
**Depends on:** slice 1 (moon math helpers — `moonPhaseAtUTC` for full-moon detection, `perigeeMomentAfter` + `syzygyMomentAfter` for king-tide detection), slice 2 (port JSON).

**Acceptance:**
- [ ] `scripts/bake-moonpath-ics` extended with a `bakeFullMoonsForYear(year)` function — produces VCALENDAR with all full moons in that year. **Test asserts `VEVENT_count ∈ {12, 13}`** per AC #14 (blue-moon year handling).
- [ ] `bakeTideICSForPort(port)` function — produces VCALENDAR with king tides in the next 30 days OR D12 stub VEVENT if window is empty.
- [ ] Both ICS shapes mirror `/sunpath/turnings-2026.ics` exactly (PRODID, X-WR-CALNAME, VALARM at -P1D per event).
- [ ] Idempotency holds: `git diff --exit-code moonpath/*.ics` clean after double-bake.
- [ ] Standstills are NOT in full-moons ICS (D15) — assert `grep -i standstill moonpath/full-moons-*.ics` returns nothing.
- [ ] Commit: `feat(moonpath): slice 7 — ICS calendar exports`.

**Steps:**
- [ ] Implement `bakeFullMoonsForYear(year)`: iterate through the year, find every UTC instant where moon phase ≈ 0.5 (full moon). Build VEVENT list. Always include all matches — could be 12 or 13.
- [ ] Implement `bakeTideICSForPort(port)`: walk forward 30 days from bake time, find king-tide moments (perigee + new/full alignment) at that port. If none, emit D12 stub VEVENT.
- [ ] Wire both into `main()`. Print summary line per file: "wrote moonpath/full-moons-2026.ics (13 events)".
- [ ] Run bake. Confirm output files exist and parse as valid VCALENDAR.
- [ ] Run bake again. Confirm `git diff --exit-code moonpath/` clean.
- [ ] Manual smoke: open one full-moons ICS in Apple Calendar, confirm events land on right dates. Same for one tide-port ICS.
- [ ] Commit.

---

### Slice 8: Discoverability + sitemap + verify + launch

**Files:**
- Modify: `sunpath/index.html`, `daylight/index.html`, `sitemap.xml`, `llms.txt`
- Create: `docs/specs/2026-05-14-moonpath-launch.md`

**Spec ACs covered:** AC #18 (no npm deps), AC #20 (sitemap), AC #21 (cross-links + llms.txt), AC #22 (no regressions).
**Depends on:** slices 0-7 (this is the final wrap-up).

**Acceptance:**
- [ ] `/sunpath/` adds a quiet sibling-link to `/moonpath/` in the same "Tomorrow vs today" section that already links to `/daylight/` (matches v1 daylight pattern).
- [ ] `/daylight/` adds `/moonpath/` to its footer sibling-link area.
- [ ] `llms.txt` "Companion site" section lists `/moonpath/` alongside `/sunpath/` and `/daylight/`.
- [ ] `sitemap.xml` adds entries: `/moonpath/` (priority 0.9), 2 full-moon ICS URLs, plus **one `<url>` entry per actual `moonpath/tides-*.ics` file on disk** per D22 — no hardcoded "12". The slice-8 step reads `ls moonpath/tides-*.ics` and emits one sitemap entry per match. Guarantees sitemap ⊆ baked-files set. lastmod = today for new entries only.
- [ ] `test -f package.json && echo bad || echo ok` echoes `ok` (AC #18).
- [ ] All test suites green: sunpath-math + daylight-math + daylight-perf + tide-math + moonpath. None regressed.
- [ ] Manual browser smoke in 3 themes (light/dark/star) recorded in `docs/specs/2026-05-14-moonpath-launch.md`.
- [ ] Lighthouse mobile audit on `/moonpath/`: Performance ≥ 90, no third-party requests, no console errors. Notes in launch doc.
- [ ] ICS import test: download one full-moons + one tide-port ICS, open in Apple Calendar, confirm events land. Recorded in launch doc.
- [ ] Commit: `docs(moonpath): slice 8 — discoverability + launch smoke`.

**Steps:**
- [ ] Add the /moonpath sibling-link to /sunpath in its existing daylight-cross-link section.
- [ ] Add the /moonpath sibling-link to /daylight's footer.
- [ ] Update llms.txt "Companion site" section with one new bullet per existing entry-2 pattern.
- [ ] Append sitemap entries (preserve existing lastmod values per the daylight-PR-2 discipline: only NEW or genuinely modified URLs get today's date).
- [ ] Run all 5 test suites; record output.
- [ ] Run the bake script; confirm idempotency.
- [ ] Open /moonpath/ in browser, cycle through light/dark/star themes, screenshot each.
- [ ] Run Lighthouse audit if Chrome available locally.
- [ ] Download + import an ICS into a real calendar app.
- [ ] Write the launch doc with all results.
- [ ] Commit.

---

## What this plan does NOT include

- Eclipses, libration, moonpath shadow, walkable shoreline windows — deferred to v2 per spec non-goals.
- The Apple/Google Calendar UX deep-test (just basic import). Subscribing via webcal:// is documented in launch doc but not a v1 AC.
- "supermoon" copy elsewhere on the site (only /moonpath/ is verified). If the term sneaks into a future blog post, that's a separate audit.
- Per-port subpages — spec D-decision implicit-from-/daylight: /moonpath is hub-only.

## Risks specific to execution

- **Slice 0 surfacing a red-flagged port.** If 3+ ports fail licensing review, the spec's "12-port" wording in the launch doc + sitemap needs adjustment. Plan: accept any final count ≥6 as ship-able; document the audit's verdicts publicly in `docs/specs/2026-05-14-moonpath-port-licensing.md`.
- **Meeus low-precision standstill drift.** D8 caps the slider at ±2,000 yr; the archaeo-callout fixtures (Callanish -1800, Newgrange -3200) extend slightly beyond that range. Mitigation: the callouts fire by year-match, not by computed standstill — the math doesn't need to be accurate at -3200 to display the Newgrange callout when the user slides there. Document this honestly in the slider footnote.
- **Tide harmonic synthesis storm bias.** Tide model is good for normal tides, drifts on storm-affected days. Mitigation: footnote on the tide section says "informational, not navigational" — already in spec risks.
- **Blue-moon year (2026 has 13 full moons).** Caught in spec round-3 review. Test asserts `VEVENT_count ∈ {12, 13}`, not `=== 12`. Slice 7 must respect this.
- **Bake-script weekly rebake for tide-port ICS.** D11 says weekly via CI cron, but no CI infrastructure exists in this repo today. Plan: ship slice 7's bake script; the "weekly cron" is a follow-up task (separate PR after launch).
- **Lighthouse / browser audit in agent environment.** Same as daylight launch — deferred to human.
