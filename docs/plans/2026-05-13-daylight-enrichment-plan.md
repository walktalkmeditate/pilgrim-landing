# Daylight Enrichment v2 Implementation Plan

**Spec:** `docs/specs/2026-05-13-daylight-enrichment.md`
**Goal:** Deepen the existing `/daylight/` widget with six layers (twilight bands, moon overlay, sacred-site waypoint ticks, ICS export, per-route spider dial, discoverability links) without crowding the bar or expanding to new pages.
**Architecture:** Each enrichment is one quiet visual or interactive layer over the v1 hub + 7 per-route SEO pages. Math extends `js/sunpath-math.js` (twilight + moon). Bake script grows to produce waypoint arrays + per-route spider-dial SVG. ICS export lives in `js/daylight-math.js` as a pure helper. All layers must pass the spec's "does it crowd the bar?" first-glance test (AC #13). *(Earlier draft of this plan included a 7-day cooldown gate before slice 1; lifted on 2026-05-13 by user direction — implementation proceeds directly on the `daylight-enrichment-v2` branch and lands as one PR.)*
**Tech Stack:** Vanilla JS, zero npm deps, node-based tests matching existing patterns. No new external hosts. Existing two-layer `recompute(state)` + DOM-glue architecture preserved.

> **For implementers (human or agent):** execute this plan task-by-task with `subagent-driven-development` (recommended) or `executing-plans` (separate-session mode). Steps use checkbox (`- [ ]`) syntax for tracking. Each slice maps its acceptance items to the spec's numbered ACs (AC #N) for traceability.

## Decision summary (pulled from spec)

| ID | Decision |
|---|---|
| D7 | Spider-dial scale: normalize axes to max across all currently-baked routes. |
| D8 | Moon glyph: fixed position right of bar, vertically centered. |
| D9 | ICS v1 emits UTC-only DTSTART/DTEND. `stageTz` reserved in `buildICS` signature, unused. |
| D10 | Permalink copy: `direct link: /daylight/<route>/`. No alternative wording. |

---

## File structure

**Modified:**
- `js/sunpath-math.js` — add 6 twilight functions (civil/nautical/astronomical × dawn/dusk) + 3 moon functions (`moonriseUTC`, `moonsetUTC`, `moonPhaseAtUTC`). Generalize internal sunrise/sunset math to accept an elevation parameter.
- `js/sunpath-math.test.js` — append fixtures: twilight references (≥6 assertions: 3 bands × 2 lat-lon-date combos), moon rise/set (≥3 locations on 2026-10-15), moon phase passthrough.
- `js/daylight.js` — render twilight bands, moon ticks + glyph, waypoint ticks, ICS save link, permalink line, routes-index population.
- `js/daylight-math.js` — add `buildICS(opts)` pure helper.
- `js/daylight-math.test.js` — append `buildICS` correctness test (VEVENT field presence, mode branching, RFC 5545 escaping).
- `css/daylight.css` — twilight band styles, moon glyph slot, waypoint tick class, spider dial class, permalink + routes-index typography.
- `daylight/index.html` — slot for moon glyph SVG, permalink `<p>`, routes-index `<aside>`.
- `scripts/bake-daylight-routes` — read each route's `waypoints.geojson`, filter to `type === 'sacred_site'`, apply 3 km density-decimation, write per-stage `waypoints` array into `assets/daylight/<route>.json`. Compute cross-route max for spider-dial axes. Generate per-route spider-dial SVG and inject into baked HTML.
- `scripts/bake-daylight-routes-templates/route.html` — `<svg class="dl-spider-dial">` slot in the static body content above the picker panel.
- `assets/daylight/*.json` — regenerated with new waypoints arrays (idempotent rebake).
- `daylight/<route>/index.html` — regenerated with spider-dial SVG (idempotent rebake).

**Not modified:** the v1 hub layout structure (`<section>` ordering, picker panel internals, custom-route panel). Only additions.

**No new files.** Nine existing files extended.

---

## Slice DAG

```
slice 1 (math)         ─┬──→ slice 2 (twilight render) ─┐
                        └──→ slice 3 (moon render)      ├──→ slice 8 (verify + launch)
slice 4 (bake ext)     ────→ slice 5 (waypoint render) ─┤
slice 6 (ICS export)   ─────────────────────────────────┤
slice 7 (discover)     ─────────────────────────────────┘

  (slices 1, 4, 6, 7 are parallelizable starting points)
```

Critical path: `1 → 2 → 8` OR `4 → 5 → 8` (whichever is slower). Slices 6 + 7 are independent and can land any time before slice 8. Slices 2, 3, 5 each depend on a different upstream (1, 1, 4 respectively); they're parallel-safe relative to each other but conflict on the same file (`js/daylight.js` + `css/daylight.css`) — implement sequentially to avoid merge churn.

---

### Slice 1: Math foundations — twilight + moon

**Files:**
- Modify: `js/sunpath-math.js`, `js/sunpath-math.test.js`

**Spec ACs covered:** AC #1 (twilight math), AC #3 (moon math).
**Decision refs:** D9 partial (buildICS doesn't live here, but moon math precision shapes the test tolerance).
**No dependencies.** Parallelizable with slices 4, 6, 7.

**Acceptance:**
- [ ] `sunpath-math.js` exports six new twilight functions with signature `(lat, lon, date)`: `civilDawnUTC`, `civilDuskUTC`, `nauticalDawnUTC`, `nauticalDuskUTC`, `astronomicalDawnUTC`, `astronomicalDuskUTC`. Each returns a JS `Date` UTC instant or `null` when the sun does not reach that elevation at the given lat/date.
- [ ] `sunpath-math.js` exports three new moon functions: `moonriseUTC(lat, lon, date)`, `moonsetUTC(lat, lon, date)`, `moonPhaseAtUTC(date)`. `moonPhaseAtUTC` is a thin one-line re-export of `Moon.getMoonPhase` from `js/moon.js`. **Null contract:** `moonriseUTC` and `moonsetUTC` return `null` when no moonrise or moonset occurs within the 24-hour UTC window centered on the given `date` (common at high latitudes during the lunar month, and at the poles year-round). Renderer in slice 3 relies on this null contract.
- [ ] Twilight test fixtures: ≥6 assertions (civil + nautical + astronomical, each ×2 mid-latitude locations like León 2026-10-15 + Tokushima 2026-10-15) within ±2 min of baked NOAA reference values.
- [ ] Moon rise/set test fixtures: ≥3 assertions (Tokushima, León, Reykjavik 2026-10-15) within ±15 min of published almanac values.
- [ ] Moon phase passthrough test: `moonPhaseAtUTC(d) === Moon.getMoonPhase(d)` (strict-equal on the numeric `[0, 1]` return value) for at least 2 sample dates. `Moon.getMoonPhase` returns a primitive number per its current implementation, so strict-equal is the right check.
- [ ] Both test files run via `node js/sunpath-math.test.js` and exit 0.

**Steps:**
- [ ] Open `js/sunpath-math.js`. Identify the internal hour-angle math currently used by `daylightHours` and `sunriseUTC`/`sunsetUTC`. Generalize it to take an elevation parameter (default keeps the existing `-0.833°` refraction constant for back-compat).
- [ ] Add the six twilight wrappers, each calling the generalized helper with `-6°` / `-12°` / `-18°`.
- [ ] Read `js/moon.js`. Confirm `Moon.getMoonPhase` signature. Implement `moonPhaseAtUTC` as `function moonPhaseAtUTC(d) { return Moon.getMoonPhase(d); }` (or equivalent if moon.js exposes a slightly different name — match exactly).
- [ ] Implement `moonriseUTC` and `moonsetUTC` using the low-precision Meeus algorithm (suggested resolution to spec Q1). Aim for ±15 min accuracy — document the algorithm choice + tolerance in a code comment.
- [ ] Append all 9 new functions to the public `api` object at file bottom.
- [ ] Fetch NOAA twilight reference values for the test locations (one-time author check, bake as numeric literals). Add fixtures to `sunpath-math.test.js`. Run RED first, then GREEN.
- [ ] Fetch moon rise/set reference values from a published almanac (e.g., timeanddate.com). Add fixtures. Confirm GREEN.
- [ ] Add the phase-passthrough test (no fixture needed, just byte-equal assertion).
- [ ] Run `node js/sunpath-math.test.js` — confirm all-green, no regressions on existing 36 assertions.
- [ ] Commit: `feat(daylight): slice 1 — twilight (6 fns) + moon (3 fns) math`.

---

### Slice 2: Twilight bands rendering

**Files:**
- Modify: `js/daylight.js`, `css/daylight.css`

**Spec ACs covered:** AC #2 (twilight band rendering).
**Depends on:** slice 1.

**Acceptance:**
- [ ] `recompute(state)` output object grows three new optional fields: `civilDawn/Dusk`, `nauticalDawn/Dusk`, `astronomicalDawn/Dusk` (each a `Date` or `null`). Computed using the slice-1 functions only when needed (lazy compute is fine; eager is also fine if perf gate holds).
- [ ] `renderSVG` draws three concentric muted bands behind the existing daylight band (rendered BEFORE the existing band in the SVG draw order, so the existing band overlays them): civil (lightest opacity), nautical (slightly darker), astronomical (darkest). Each band extends from the sunrise/sunset markers outward to the corresponding twilight endpoint.
- [ ] **Partial-null handling:** the three bands are independent. If `astronomicalDawn === null` but `civilDawn !== null`, the civil and nautical bands still render on the dawn side; the astronomical band is omitted. Same partition on the dusk side. Each side of each band is decided independently — six independent draw decisions, no JS error when any subset returns null.
- [ ] Existing daylight band stays the visual protagonist — the new bands are clearly subordinate in opacity.
- [ ] Perf test still passes (median ≤ 0.5 ms, p99 ≤ 5 ms).

**Steps:**
- [ ] In `recompute(state)`, after the existing sunrise/sunset compute, call the six twilight functions. Add results to the return object. Handle `null` returns.
- [ ] In `renderSVG`, draw the three new band lines BEFORE the existing daylight band (so the existing band renders on top). Use the same `BAR_X`/`BAR_Y`/`utcToBarX` helpers.
- [ ] Add CSS classes: `.dl-bar-civil`, `.dl-bar-nautical`, `.dl-bar-astronomical` with stroke-widths matching the existing daylight band and ascending opacity (civil most translucent, astronomical least). Stroke color: same `var(--stone)` family.
- [ ] Skip drawing any band whose dawn or dusk Date is null.
- [ ] Run all three test suites. Confirm green + perf within thresholds.
- [ ] Manual browser smoke at a high-latitude fixture (Reykjavik in summer — astronomical band may go null while civil persists). Verify graceful rendering.
- [ ] Commit: `feat(daylight): slice 2 — twilight bands on SVG`.

---

### Slice 3: Moon overlay rendering

**Files:**
- Modify: `js/daylight.js`, `css/daylight.css`, `daylight/index.html`

**Spec ACs covered:** AC #4 (moon rendering).
**Depends on:** slice 1.

**Acceptance:**
- [ ] `recompute(state)` output grows `moonriseUTC`, `moonsetUTC`, `moonPhase` fields.
- [ ] `renderSVG` adds small dashed tick marks (visually distinct from solid sun ticks) at moonrise + moonset UTC instants, only when those values are non-null and within the bar's daylight-span domain.
- [ ] Hub HTML has a slot (e.g., `<div id="dl-moon-glyph">`) positioned to the **right of the SVG bar element specifically (NOT the output panel)**, vertically centered with the bar's y-axis. CSS uses `position: absolute` relative to a container that wraps the SVG (not the panel), so the glyph stays anchored to the bar even if the panel grows below.
- [ ] On render, a 16px crescent/full glyph rendered via `Moon.renderMoon` appears in the slot, reflecting `output.moonPhase`.
- [ ] No labels on either the ticks or the glyph.
- [ ] Constellation/dark mode CSS adjusts the moon glyph palette if needed.

**Steps:**
- [ ] Add the three new output fields to `recompute(state)`.
- [ ] Add the moon-glyph slot div to `daylight/index.html` (near the output panel area, but positioned via CSS to be right of the bar).
- [ ] Mirror the slot addition in `scripts/bake-daylight-routes-templates/route.html` so per-route pages get it too (defer rebake until end of slice).
- [ ] In `renderSVG`, draw dashed tick marks at moonriseUTC + moonsetUTC if non-null and within the bar's UTC range. Use CSS class `.dl-bar-moon-tick`.
- [ ] In `runAndRender` (the DOM-glue render), call `Moon.renderMoon(dom.moonGlyph, output.moonPhase)` (or equivalent — check `Moon.renderMoon`'s real signature; if it doesn't accept a phase arg, set the phase via a data attribute and let renderMoon read it).
- [ ] Add CSS: `.dl-bar-moon-tick` (dashed stroke), `.dl-moon-glyph` positioning (absolute right-center relative to output panel), `body.constellation .dl-moon-glyph` palette override if needed.
- [ ] Rebake per-route HTML. Verify idempotency: `git diff --exit-code daylight/*/index.html` after double-bake.
- [ ] Manual browser smoke at a date when the moon is full + at a date when it's new (check the glyph reads correctly). Test in light + dark + star themes.
- [ ] Commit: `feat(daylight): slice 3 — moon ticks + phase glyph`.

---

### Slice 4: Bake script extensions — waypoints + spider dial

**Files:**
- Modify: `scripts/bake-daylight-routes`, `scripts/bake-daylight-routes-templates/route.html`
- Regenerated: `assets/daylight/*.json`, `daylight/<route>/index.html`

**Spec ACs covered:** AC #5 (waypoint baking), AC #9 (spider dial baking), AC #10 (spider dial accessibility).
**Decision refs:** D7 (spider scale = max across baked routes).
**No dependencies.** Parallelizable with slices 1, 6, 7.

**Acceptance:**
- [ ] Bake script reads each route's `../open-pilgrimages/routes/<id>/waypoints.geojson`. Fails loud (per existing D2 pattern) if the file is absent or has zero `type === 'sacred_site'` features.
- [ ] Per-stage `waypoints` array written into `assets/daylight/<route>.json`. Each record: `{ name, kmFromStart }`. Decimation: at most one waypoint per 3 km of `kmFromStart` (constant named `WAYPOINT_MIN_SPACING_KM` in the script). First waypoint wins within each window.
- [ ] Bake script computes max axis values across all baked routes (cross-route reduce). Stores as constants used during per-route HTML generation. **Note on idempotency:** the cross-route normalization is idempotent only when the route set is unchanged. Adding or removing a route from `ROUTE_IDS` legitimately re-scales every other route's dial — this is intended behavior (relative shape is the point per D7) but means the rebake will diff every per-route HTML on route-set changes. Document this in the bake script's header comment.
- [ ] Per-route HTML template `route.html` gains a `<svg class="dl-spider-dial">` slot positioned between the `daylight-stages-prose` section and the picker panel.
- [ ] Bake injects per-route spider-dial SVG: 4-arm polygon with each axis scaled to `value / max(value across routes)`. Axes (formulas locked):
   - **(a) distance:** `metadata.overview.distanceKm`.
   - **(b) elevation gain:** sum of `stages[i].elevationGainMeters` across stages.
   - **(c) stage count:** `stages.length` (per-route constant, treated as the axis value).
   - **(d) sacred-site density:** `(total sacred_site count post-decimation) / metadata.overview.distanceKm`. Density unit: sites per km. Computed per route, normalized per-axis to the cross-route max.
   Faint stroke, no labels, no fill.
- [ ] SVG includes a static `<title>` describing all four axis values for screen readers (per AC #10).
- [ ] Idempotency: `git diff --exit-code assets/daylight/ daylight/*/index.html` clean after double-bake **with the same `ROUTE_IDS` set**. Adding or removing a route is expected to diff per-route HTMLs (per the D7 note above) — this is not an idempotency failure.

**Steps:**
- [ ] Read one route's `waypoints.geojson` (e.g., shikoku-88). Confirm schema — `properties.type`, `properties.stageIndex`, `properties.kmFromStart`, `properties.name`.
- [ ] In the bake script, add a `loadWaypointsForRoute(routeId)` function: read the geojson, filter to `type === 'sacred_site'`, group by `stageIndex`.
- [ ] Add density-decimation: within each stage's waypoint list (sorted by `kmFromStart`), keep the first; for each subsequent waypoint, keep only if `kmFromStart - lastKept.kmFromStart >= WAYPOINT_MIN_SPACING_KM`. Skip otherwise.
- [ ] Wire into `bakeStage`: include `waypoints: [{name, kmFromStart}]` in the stage record. Fail loud if waypoints.geojson is missing or has zero sacred_sites.
- [ ] Compute cross-route axis maxes. Store as locals during the JSON pass; reuse during the HTML pass.
- [ ] Write a `buildSpiderDialSVG(routeMeta, axisMaxes)` helper that produces a small SVG string (~120px square, 4-arm polygon, computed from normalized axis values). Include the `<title>` element.
- [ ] Add the `{{spider_dial_svg}}` placeholder to `route.html` template. Substitute during the HTML pass.
- [ ] Run the bake. Verify 7 per-route JSONs have waypoints arrays and 7 per-route HTMLs have spider dials.
- [ ] Run bake again. Confirm `git diff --exit-code` clean.
- [ ] Read 2-3 sample HTMLs by eye, confirm the spider dial looks reasonable (no NaN, no zero-area polygon for Camino Inglés).
- [ ] Commit: `feat(daylight): slice 4 — bake waypoints + per-route spider dial`.

---

### Slice 5: Waypoint ticks rendering

**Files:**
- Modify: `js/daylight.js`, `css/daylight.css`

**Spec ACs covered:** AC #6 (waypoint rendering).
**Depends on:** slice 4.

**Acceptance:**
- [ ] `renderSVG` reads `stage.waypoints` (from the baked stage data already loaded) and draws tiny ticks below the walk-window segment at positions `BAR_X_walkStart + (kmFromStart / stage.distanceKm) * (BAR_X_walkEnd - BAR_X_walkStart)`.
- [ ] Tick stroke is thin and faint; no label text.
- [ ] Ticks are limited to waypoints where `kmFromStart` falls within `[0, distanceKm]` (the renderer trusts decimation but still guards against out-of-range data).
- [ ] In reverse mode, ticks position correctly within the walk-window between `latestDepartUTC` and `walkEndUTC`.

**Steps:**
- [ ] In `renderSVG`, after the walk-segment line, iterate `stage.waypoints` (if present). For each, compute the x-position via a new `kmToBarX(kmFromStart, stage.distanceKm, walkStartX, walkEndX)` helper that maps stage-km linearly from `walkStartX` (at km=0) to `walkEndX` (at km=distanceKm). **Direction-agnostic semantic:** the formula treats `kmFromStart` as a physical-distance offset from the stage's named start point. In both forward and reverse modes, `walkStartX` corresponds to the physical start (where `kmFromStart=0`) and `walkEndX` to the physical end. Reverse mode does not invert the mapping — the pilgrim walks the same physical stage from start to end regardless of which time-direction the calculator solves for.
- [ ] Draw small `<line>` ticks below the walk segment line. Use class `.dl-bar-waypoint`.
- [ ] Guard against `kmFromStart < 0 || kmFromStart > stage.distanceKm`.
- [ ] Add CSS: `.dl-bar-waypoint` thin faint stroke. Constellation override.
- [ ] Test in browser: pick shikoku-88 stage 0 (the dense temple stage). Confirm post-decimation ticks render without crowding.
- [ ] Test on a Camino stage (sparse waypoints). Confirm ticks still appear correctly positioned.
- [ ] Commit: `feat(daylight): slice 5 — sacred-site waypoint ticks on bar`.

---

### Slice 6: ICS export

**Files:**
- Modify: `js/daylight-math.js`, `js/daylight-math.test.js`, `js/daylight.js`, `css/daylight.css`, `daylight/index.html`

**Spec ACs covered:** AC #7 (ICS download), AC #8 (ICS test).
**Decision refs:** D9 (UTC-only, `stageTz` reserved unused).
**No dependencies.** Parallelizable with slices 1, 4, 7.

**Acceptance:**
- [ ] `js/daylight-math.js` exports a pure `buildICS({routeName, stageLabel, startUTC, endUTC, urlHref, mode, stageTz, descriptionLine})` function. Returns a string parseable as valid VCALENDAR with one VEVENT. **`descriptionLine` content:** the caller passes the exact prose currently rendered in the output panel's result line (e.g., `"Walk 24.2 km · Arrive ∼17:42 · 6h 50m walking · 39 min cushion before sunset"`). The helper escapes RFC 5545 special chars but does not generate the prose — that stays the renderer's job.
- [ ] Forward mode: DTSTART = startUTC, DTEND = endUTC. Reverse mode: DTSTART = startUTC (= latestDepartUTC), DTEND = endUTC (= walkEndUTC). The function doesn't care which mode; the caller passes the right UTC instants.
- [ ] VEVENT includes SUMMARY (route name + stage label), DESCRIPTION (descriptionLine, with RFC 5545 escaping for `·` and `−` and line-folding for long lines), URL (urlHref), CATEGORIES=`Pilgrimage,Walking`, VALARM at `-P1D`.
- [ ] `stageTz` is in the signature but unused in v1's body. Document this in the function's code comment. **Negative test:** the test suite asserts that two `buildICS` calls with identical args except `stageTz: 'Asia/Tokyo'` vs `stageTz: 'Europe/Madrid'` produce byte-identical output. This guards against a future change silently reading `stageTz` and breaking D9 without anyone noticing.
- [ ] `daylight-math.test.js` asserts the returned string for both forward and reverse fixtures contains the required VEVENT fields (DTSTART, DTEND, SUMMARY, DESCRIPTION, URL, CATEGORIES, BEGIN:VALARM, END:VALARM).
- [ ] Hub HTML has a "Save to calendar" link in the output panel, hidden by default.
- [ ] When `recompute(state)` returns a non-error result with non-null start+end times, the link is shown. Click triggers a data-URI download with filename like `daylight-<route>-<date>.ics`.

**Steps:**
- [ ] Implement `buildICS` in `js/daylight-math.js`. Reference `/sunpath/turnings-2026.ics` for the VCALENDAR shape.
- [ ] Add the `escapeICS` helper for the DESCRIPTION field (escape `\`, `,`, `;`, `\n` per RFC 5545; line-fold lines over 75 chars).
- [ ] Add `buildICS` tests covering both modes + special-char escaping. RED first, GREEN.
- [ ] Add the "Save to calendar" link to `daylight/index.html` (and per-route template).
- [ ] In `runAndRender`, after the result is computed, show/hide the link based on output validity. Wire the click to build the ICS string + trigger download via `data:text/calendar;charset=utf-8;base64,` URI.
- [ ] Style the link in `css/daylight.css` to match the existing share-button restraint (text-link, no chrome).
- [ ] Manual smoke: download an ICS, open in Apple Calendar or Google Calendar, verify event lands correctly.
- [ ] Rebake per-route HTML if the template changed. Verify idempotency.
- [ ] Commit: `feat(daylight): slice 6 — .ics export`.

---

### Slice 7: Discoverability — permalink + routes index

**Files:**
- Modify: `js/daylight.js`, `css/daylight.css`, `daylight/index.html`

**Spec ACs covered:** AC #11 (permalink line), AC #12 (routes index).
**Decision refs:** D10 (permalink copy = `direct link: /daylight/<route>/`).
**No dependencies.** Parallelizable with slices 1, 4, 6.

**Acceptance:**
- [ ] Hub renders `<p class="dl-permalink">` below the output panel when `state.route` is a named route (not `"custom"` and not empty). Hidden in the bare-hub / custom / unselected states.
- [ ] Permalink text: `direct link: /daylight/${state.route}/`. Italic, small, low-emphasis.
- [ ] Routes-index `<aside class="dl-routes-index">` rendered in the footer area, above the existing footer links. Visible at all times.
- [ ] Routes-index content built dynamically at page load from `assets/daylight/route-meta.json` — no hardcoded route count or names in HTML or JS. *(Note: `route-meta.json` is produced by v1's bake script — it is a pre-existing input here, not new in v2. The plan's File Structure section reflects that it's already in `assets/daylight/`.)*
- [ ] Each entry is an italic `<a href="/daylight/<route-id>/">`; entries are comma-separated.
- [ ] Intro phrase: exactly `Or browse: ` — same hard-lock as D10's permalink wording. No launch-smoke escape hatch on copy.

**Steps:**
- [ ] Add `<p class="dl-permalink" hidden>` slot to `daylight/index.html` below the output panel (and the per-route template; defer rebake).
- [ ] Add `<aside class="dl-routes-index" hidden>` slot to `daylight/index.html` and template, positioned in the footer area.
- [ ] In `runAndRender` (or a sibling fn), show/hide the permalink based on `state.route`. Update its inner text via `textContent = 'direct link: /daylight/' + state.route + '/'`.
- [ ] On page load (after `loadRouteMeta` resolves), populate the routes-index with one `<a>` per entry. Comma-separate via DOM (use `, ` text nodes between anchors). Show the aside.
- [ ] Add CSS: `.dl-permalink` italic small font + low opacity; `.dl-permalink code` slightly different family if available (matching the project's monospace fallback); `.dl-routes-index` similar restraint, intro phrase italic.
- [ ] Add CSS `[hidden]` overrides for both classes if their default `display` is `block` or `flex` (matching the pattern from v1's hidden-attribute fix).
- [ ] Rebake per-route HTML if template changed. Verify idempotency.
- [ ] Browser smoke: hub bare URL → routes index visible, permalink hidden. Pick a route → permalink appears with correct text. Switch to custom → permalink hides.
- [ ] Commit: `feat(daylight): slice 7 — permalink + routes index`.

---

### Slice 8: Verify + launch smoke

**Files:**
- Create: `docs/specs/2026-05-13-daylight-enrichment-launch.md`
- No code modifications.

**Spec ACs covered:** AC #13 (no-crowding subjective gate), AC #14 (no new third-party hosts), AC #15 (no npm deps), AC #16 (all tests pass), AC #17 (perf gate).
**Depends on:** slices 1-7 (this is the final verification slice).

**Acceptance:**
- [ ] All 3 test suites pass: `node js/sunpath-math.test.js && node js/daylight-math.test.js && node js/daylight-perf.test.js` exit 0.
- [ ] Perf gate: `daylight-perf.test.js` exercises the new twilight + moon code paths. **Fixed input:** a mid-latitude equinox-window fixture (suggested: León 2026-03-20, standard pace, mid-day start) chosen so that all three twilight bands and both moon rise/set values are non-null — guarantees no `null` sentinel early-exits during the 1000-iteration loop. Median ≤ 0.5 ms, p99 ≤ 5 ms.
- [ ] Third-party host grep clean: `grep -rE "googletagmanager|doubleclick|facebook.net" daylight/ assets/daylight/ js/daylight*.js css/daylight.css` returns nothing.
- [ ] No npm deps introduced: no `package.json` in repo root.
- [ ] Bake script idempotency: `git diff --exit-code assets/daylight/ daylight/*/index.html` after double-bake.
- [ ] Geolocation grep still clean: all `navigator.geolocation` hits inside the locate-button click handler.
- [ ] **No-crowding subjective gate (AC #13):** 24-hour-cooled fresh-eyes pass on the bar with all v2 layers active. Author confirms in writing in the launch doc that the daylight span, walk window, and sun markers remain the visual protagonists. If any new layer dominates, reduce its stroke/opacity and re-pass. **Cap:** at most **2 demotion passes**. If after 2 passes the bar still reads crowded, the offending layer is disabled (CSS `display: none` or feature-flagged off in `recompute`) and a follow-up issue captured for a v2.1 redesign. The bar's first-glance test never blocks ship indefinitely.
- [ ] Manual Lighthouse mobile audit on hub + one per-route page: Performance ≥ 90, no console errors. Notes in launch doc.
- [ ] ICS download tested manually in Apple Calendar (or Google Calendar). Event renders correctly. Captured in launch doc.
- [ ] All three themes (light, dark, star) inspected. Bar renders correctly in each. Moon glyph + waypoint ticks + twilight bands visible in dark themes per the existing constellation CSS pattern.

**Steps:**
- [ ] Create `docs/specs/2026-05-13-daylight-enrichment-launch.md`. Record branch name + first/last commit SHAs.
- [ ] Run all 3 test suites. Record output.
- [ ] Run the bake script twice. Record idempotency result.
- [ ] Run all the greps from AC #14/AC #15. Record clean output.
- [ ] Open hub in browser. Cycle through all 3 themes via the moon-toggle. Verify rendering in each.
- [ ] Open shikoku-88 per-route page. Same theme cycle. Confirm spider dial renders with all 4 arms.
- [ ] Download an ICS. Import into a real calendar app. Confirm event lands on the right day with the right times.
- [ ] Wait 24 hours. Re-open the page with fresh eyes. Make the AC #13 no-crowding judgment. Record in launch doc.
- [ ] If any layer needs visual demotion, edit the CSS and re-pass.
- [ ] Run Lighthouse mobile audit. Record scores.
- [ ] Commit launch doc: `docs(daylight): slice 8 — v2 enrichment launch smoke`.

---

## What this plan does NOT include

- **Hover labels on waypoint ticks.** v2 ticks are visual depth only. Tooltips/popovers are out of scope (deferred to v3 per spec).
- **Lunar overlay beyond rise/set + phase.** No eclipses, perigee/apogee, lunar mansions.
- **Mountain shadow / horizon obstructions.** Twilight math uses geometric horizon.
- **Multi-day itineraries / sequential stage planning.** v2 is still one stage, one walk.
- **New top-level pages.** No `/daylight/twilight/`, `/daylight/moon/`, etc.
- **Account state / saved walks.** URL params + localStorage prefs only.

## Risks specific to execution (not in spec)

- **Lighthouse audit in agent env.** As with v1, Lighthouse can't be run in the agent's environment without Chrome. The launch doc captures the audit as "deferred to human" unless the implementer has a real browser available.
- **Moon glyph palette in star mode.** `Moon.renderMoon` may render a bright-white moon against the dark constellation background that looks louder than the rest of the bar. If the visual test surfaces this, add a CSS opacity override in the constellation block.
- **Spider dial visual collapse for Camino Inglés.** Smallest route across all 4 axes → tiny near-degenerate polygon. If launch smoke reveals it looks broken rather than just small, swap to logarithmic axis scaling. Captured as a risk in the spec already.
- **Cross-slice file conflicts.** Slices 2, 3, 5, 6, 7 all modify `js/daylight.js` and `css/daylight.css`. Slice 4 is **bake-script-only** — it touches `scripts/bake-daylight-routes`, the template, and the generated outputs; it does NOT modify `js/daylight.js` (the spider dial is server-rendered HTML, no client-side render code). Sequential implementation of slices 2/3/5/6/7 avoids merge conflicts on the shared client files. If parallelized via subagents, rebase carefully between slices.
- **v1 not yet pushed to remote at v2 implementation start.** v2 builds on v1's commits which are local-only on `main`. The PR for v2 will be opened against `main`; if v1 is rebased or amended after v2 branches, conflicts surface at merge time. Mitigation: push v1's `main` to origin before merging v2's PR (or merge v2 into main locally first, then push everything together).
