# Daylight Walk-Budget Implementation Plan

**Spec:** `docs/specs/2026-05-12-daylight-walk-budget.md`
**Goal:** Ship `/daylight/` (hub + 7 per-route SEO pages) as the second entry in pilgrim-landing's contemplative-instrument almanac, after `/sunpath`.
**Architecture:** Static HTML + vanilla JS + node-based tests, zero npm deps. Math primitives extend `js/sunpath-math.js`; walking-velocity math lives in a new `js/daylight-math.js`. A single bake script `scripts/bake-daylight-routes` reads sibling repo `../open-pilgrimages/routes/<id>/stages.json` and writes both `assets/daylight/<route>.json` (data) and `daylight/<route>/index.html` (per-route SEO pages baked from a template).
**Tech Stack:** Vanilla JS (no framework), `Intl.DateTimeFormat` for tz formatting, `process.hrtime.bigint()` for perf tests, NOAA Solar Calculator reference values baked into test fixtures. Matches the existing `js/sunpath-math.test.js` pattern.

## Decision summary (pulled from spec)

| ID | Decision |
|---|---|
| D1 | All 7 routes ship at v1 (audit confirmed during spec authoring). |
| D2 | Bake script reads sibling checkout at `../open-pilgrimages/`. |
| D3 | Geolocation: explicit "use my location" button only. |
| D4 | Per-stage IANA timezone (`ianaTz`) baked at build time. Custom routes use browser-local with `(local time)` label. |
| D5 | "Now" defaults resolve to wall-clock-now in the stage's `ianaTz` (or browser-local for custom). Date label surfaces the tz. |
| D6 | Reverse-mode buffer default: universal 60 min across all 7 routes for v1. |

> **For implementers (human or agent):** execute this plan task-by-task with `subagent-driven-development` (recommended) or `executing-plans` (separate-session mode). Steps use checkbox (`- [ ]`) syntax for tracking. Each slice maps its acceptance items to the spec's numbered ACs (e.g., "AC #4") so traceability is explicit.

---

## File structure

**Created:**
- `js/daylight-math.js` — `walkingMinutes({distanceKm, elevGainM, pacePresetOrMinPerKm})` (Tobler-inspired velocity model per spec) + pace-preset constants.
- `js/daylight-math.test.js` — node test harness (matches `sunpath-math.test.js` pattern). Covers AC #5 + AC #21 (purity, tested via `assert.strictEqual` on repeated calls).
- `js/daylight-perf.test.js` — node test, 1,000 iterations of the `recompute()` math core via `process.hrtime.bigint()`. Covers AC #3. **Owned by slice 3** (created when `daylight.js` exposes `recompute` in a node-loadable form).
- `js/daylight.js` — page controller: URL-param parse + apply, mode toggle (forward/reverse), `recompute()` (designed from the start as a pure node-importable function exposed on `module.exports` when `typeof module !== 'undefined'`, with no DOM access inside it), SVG render, annotation logic. ~250 LOC budget.
- `css/daylight.css` — page styles. Matches `/sunpath` palette (Q4 default; revisit at launch).
- `daylight/index.html` — hub page. Route picker + custom-route panel + output panel.
- `daylight/<route>/index.html` × 7 — per-route SEO landings (built by bake script in slice 6, not hand-edited).
- `assets/daylight/<route>.json` × 7 — baked stage tables: `{ index, nameEn, startLat, startLon, distanceKm, elevGainM, ianaTz }`.
- `assets/daylight/route-meta.json` — top-level route metadata (id, name, distanceKm, country) for picker rendering; written by bake script.
- `scripts/bake-daylight-routes` — single script, produces both `assets/daylight/*.json` and `daylight/*/index.html`. Built in two passes: JSON output (slice 2), HTML output (slice 6).
- `scripts/bake-daylight-routes-templates/route.html` — Mustache-style template for per-route HTML; substituted by the bake script. Plain-text template, no template engine — script does string interpolation.
- `docs/specs/2026-05-12-daylight-walk-budget-launch.md` — launch-time manual smoke notes (Lighthouse, third-party host scan, browser-perf observations). Created in slice 6.

**Modified:**
- `js/sunpath-math.js` — add `sunriseUTC(lat, lon, date)` and `sunsetUTC(lat, lon, date)` functions next to existing `daylightHours`. Append to the public `api` object at file bottom. No behavior change to existing exports.
- `js/sunpath-math.test.js` — append fixtures + assertions for new functions. Covers part of AC #4.
- `sitemap.xml` — append entries for `/daylight/` and each `/daylight/<route>/`.
- `robots.txt` — verify no exclusion for `/daylight/`. (No change expected; this is a check, not necessarily a write.)

---

## Slice DAG

```
slice 1 (math) ────────┐
                       ├──→ slice 3 (hub forward) ──→ slice 4 (reverse) ──→ slice 5 (edges/validation) ──┐
slice 2 (bake JSON) ───┘                                                                                 ├──→ slice 6 (per-route SEO + launch)
                                                                                                         │
                       (slice 1 + slice 2 parallel; everything else sequential)                          │
```

Critical path (longest chain by slice count): **(1 + 2 in parallel) → 3 → 4 → 5 → 6** — five sequential stages once the parallel-startable pair completes. Slice 2 sits on the critical path equally with slice 1; whichever finishes later gates slice 3.

---

### Slice 1: Math foundations

**Files:**
- Create: `js/daylight-math.js`, `js/daylight-math.test.js`
- Modify: `js/sunpath-math.js` (add `sunriseUTC`, `sunsetUTC` near existing `daylightHours`), `js/sunpath-math.test.js` (append fixtures)

**Spec ACs covered:** AC #4 (daylight math), AC #5 (Tobler-inspired), AC #21 (`walkingMinutes` purity).
**No dependencies.** Parallelizable with slice 2.

**Acceptance:**
- [ ] `sunpath-math.js` exports `sunriseUTC(lat, lon, date)` and `sunsetUTC(lat, lon, date)`, both returning JS `Date` UTC instants (or `null` for polar day/night per existing `daylightHours` sentinel).
- [ ] `daylight-math.js` exports `walkingMinutes({distanceKm, elevGainM, pacePresetOrMinPerKm})` + a `PACE_PRESETS` table (`slow: 3, standard: 4, brisk: 5` km/h).
- [ ] `walkingMinutes` is pure — verified by an automated test that calls the function 3 times with identical args (one fresh `Math.random()`-seeded value, two repeats) and asserts the outputs are byte-equal. No code-inspection-only acceptance.
- [ ] `sunpath-math.test.js` asserts NOAA reference values for exactly **4 fixtures**: León / Tokushima / Quito / Reykjavik on 2026-10-15 (per spec AC #4) within spec tolerances (±2 min for first three, ±10 min for Reykjavik). No additional tuples.
- [ ] `daylight-math.test.js` asserts `walkingMinutes({distanceKm:10, elevGainM:0, pacePreset:"standard"}) ≈ 150.0` and `walkingMinutes({distanceKm:10, elevGainM:500, pacePreset:"standard"}) ≈ 178.7` (both ±0.5 min). Derivation: 500m gain over 10km = mean slope s=0.05; `v(0.05) = 4 × exp(-3.5 × 0.05) = 4 × 0.83946 = 3.3578 km/h`; time = `60 × 10 / 3.3578 ≈ 178.69 min`. The 500m gain is treated as a mean slope across the stage, not a per-segment slope (consistent with the spec's flat-`s` simplification).
- [ ] Both test files runnable via `node js/<file>.test.js` and exit 0 on pass.

**Steps:**
- [ ] Read `js/sunpath-math.js` end-to-end. Note the existing `daylightHours` math; `sunriseUTC` / `sunsetUTC` will reuse the same hour-angle.
- [ ] Add `sunriseUTC(lat, lon, date)` to `sunpath-math.js`: compute solar noon UTC (from longitude + equation-of-time), subtract half-day-hour-angle, return as `Date`. Handle polar-day/night returning `null`.
- [ ] Add `sunsetUTC(lat, lon, date)` symmetrically: solar noon + half-day-hour-angle.
- [ ] Append both to the public `api` object at file bottom.
- [ ] Write failing tests in `sunpath-math.test.js` for the 4 reference tuples. Run: `node js/sunpath-math.test.js` — confirm RED.
- [ ] Populate the test with NOAA-fetched reference values (one-time author check, baked as numeric literals — no runtime fetch). Confirm GREEN.
- [ ] Create `js/daylight-math.js` with `PACE_PRESETS` + `walkingMinutes(...)` implementing `v(s) = v_flat × exp(-3.5 × s)`. Document the Tobler-inspired-not-Tobler-faithful provenance in a one-line comment.
- [ ] Create `js/daylight-math.test.js` matching `sunpath-math.test.js` style: pass/fail counter, assertion helper, RED-first test.
- [ ] Write failing tests for flat + sloped cases. Confirm RED.
- [ ] Implement. Confirm GREEN.
- [ ] Commit: `feat(daylight): slice 1 — math foundations (sun ephemeris extensions + walking velocity)`.

---

### Slice 2: Bake script — JSON output

**Files:**
- Create: `scripts/bake-daylight-routes`, `assets/daylight/*.json` (×7), `assets/daylight/route-meta.json`

**Spec ACs covered:** AC #12 partial (idempotent JSON output; HTML output deferred to slice 6).
**Decision references:** D1 (7 routes confirmed), D2 (sibling checkout), D4 (per-stage `ianaTz`).
**No dependencies.** Parallelizable with slice 1.

**Acceptance:**
- [ ] `scripts/bake-daylight-routes` is an executable node script (shebang `#!/usr/bin/env node`).
- [ ] When run from repo root with `../open-pilgrimages/` present, it produces `assets/daylight/<route>.json` for each of the 7 routes (shikoku-88, kumano-kodo, camino-frances, camino-ingles, camino-norte, camino-portugues, camino-primitivo) plus `assets/daylight/route-meta.json`.
- [ ] Each `assets/daylight/<route>.json` is a JSON array of stage records `{ index, nameEn, startLat, startLon, distanceKm, elevGainM, ianaTz }` matching the spec schema.
- [ ] `ianaTz` is resolved at bake time using a **per-route default-zone table** committed inside the bake script. Each of the 7 routes maps to one IANA zone (e.g., `shikoku-88 → Asia/Tokyo`, `kumano-kodo → Asia/Tokyo`, `camino-frances / norte / primitivo / ingles → Europe/Madrid`, `camino-portugues → Europe/Lisbon`). All stages of a route inherit that zone in v1 — this is correct for all current routes because none cross IANA zone boundaries (Camino Portugués stages near the border verified by spot-check). If a future route crosses zones, the bake script's `fails-loud` branch fires and the implementer must extend to per-stage matching. No coordinate-based nearest-zone matching in v1 (avoids tz-database npm dep and silent mismatches).
- [ ] **Idempotent (JSON half of AC #12):** running the script twice in succession produces byte-identical output; `git diff --exit-code assets/daylight/` is clean.
- [ ] **Fails loud per D2:** script exits non-zero with single-line stderr `bake-daylight-routes: missing or invalid <path> — <reason>` when sibling repo / stages.json / required fields / `schemaVersion` are absent or invalid.
- [ ] `README.md` gets a one-paragraph note describing when to run the bake script.

**Steps:**
- [ ] Read one sample `open-pilgrimages/routes/<id>/stages.json` end-to-end. Confirm schema: `start.coordinates: [lng, lat, elev_m]`, `distanceKm`, `elevationGainMeters`.
- [ ] Define the per-route IANA-zone constant table inside the bake script: `{ "shikoku-88": "Asia/Tokyo", "kumano-kodo": "Asia/Tokyo", "camino-frances": "Europe/Madrid", "camino-ingles": "Europe/Madrid", "camino-norte": "Europe/Madrid", "camino-primitivo": "Europe/Madrid", "camino-portugues": "Europe/Lisbon" }`. Each baked stage record's `ianaTz` is filled from this table by route id, not coordinates. Fails-loud if a route lacks an entry.
- [ ] Write `scripts/bake-daylight-routes` skeleton: arg parsing, sibling-repo path, route list, output dir creation.
- [ ] Implement per-route processing: read stages.json, transform to baked schema (flip lng/lat order, attach `ianaTz` from lookup, drop unused fields), write `assets/daylight/<route>.json`.
- [ ] Implement `route-meta.json` write: aggregate `id`, `name.en`, `distanceKm`, `country` from each route's `metadata.json`.
- [ ] Implement fail-loud cases: missing path, missing schemaVersion, missing required fields, tz lookup miss. Test each branch manually.
- [ ] Run the script. Confirm 7 JSONs + meta written.
- [ ] Run the script again. Confirm `git diff --exit-code assets/daylight/` is clean.
- [ ] Append README paragraph.
- [ ] Commit: `feat(daylight): slice 2 — bake script (JSON output for 7 routes)`.

---

### Slice 3: Hub page — forward mode

**Files:**
- Create: `daylight/index.html`, `css/daylight.css`, `js/daylight.js`, `js/daylight-perf.test.js`
- Read at runtime: `assets/daylight/*.json` (from slice 2)

**Spec ACs covered:** AC #1 (loads as static HTML), AC #2 (route picker), AC #3 (perf gate — `js/daylight-perf.test.js` is created in this slice, not earlier), AC #7 partial (hub page chrome — per-route landings come in slice 6), AC #11 forward-mode subset (URL param parse for forward), AC #18 (custom-mode elevGain input).
**Decision references:** D3 (geolocation explicit-only), D5 (now-semantics).
**Depends on:** slices 1 + 2.

**Acceptance:**
- [ ] `/daylight/index.html` loads as a static HTML page, no build framework, follows `/sunpath/index.html` structure.
- [ ] Route picker dropdown populated from `assets/daylight/route-meta.json` at page load.
- [ ] Selecting a route loads its stage table (`assets/daylight/<route>.json`) and populates the stage picker without page reload.
- [ ] Custom-route mode: lat/lon + distance + elevGain (optional, default 0) + "use my location" button (per D3, only this button invokes geolocation).
- [ ] Forward mode (default + only mode in slice 3): user supplies start time → page computes arrival time + cushion via `walkingMinutes` + `sunsetUTC`. Output renders as horizontal SVG bar + numeric output.
- [ ] All non-default forward-mode inputs survive URL refresh per AC #11 forward shape.
- [ ] No console errors. No third-party network requests (AC #10).
- [ ] `js/daylight-perf.test.js` exists and gates AC #3 thresholds via `process.hrtime.bigint()` on the core math path.

**Steps:**
- [ ] Read `/sunpath/index.html` head-to-toe. Note the meta/title/style conventions and inline-style discipline.
- [ ] Sketch `daylight/index.html`: `<head>` with title/meta/og + same font stack as sunpath; `<body>` with picker panel, custom-route panel, output panel (initially empty), footer with reciprocal `/sunpath` link.
- [ ] Sketch `css/daylight.css`: shared palette with `/sunpath`, dial/horizontal-bar geometry. Keep under ~150 LOC.
- [ ] Sketch `js/daylight.js`: factor into two layers. **Inner core** is pure: a `recompute(state)` function with no DOM access, exported on `module.exports.recompute` when `typeof module !== 'undefined'` (so node can `require('./daylight.js').recompute`). **Outer shell** is IIFE-style matching `sunpath.js`: reads DOM, builds state, calls `recompute`, renders SVG. The two-layer split is the architectural decision that lets the perf test exist without Puppeteer.
- [ ] Implement URL-param parser (`parseParams()`): reads `route`, `stage`, `date`, `pace`, `start`, `mode`, `elevGain`, `customLat`, `customLon`, `customDist`. Returns a normalized object.
- [ ] Implement param-validation per D5 + AC #19 defaults (no surfacing yet — that's slice 5; just default-fill the malformed cases here).
- [ ] Implement `recompute(state)`: pure function from normalized state → output object `{ arrivalUTC, cushionMin, sunriseUTC, sunsetUTC, walkMin }`. No DOM access inside; node-importable via the export shape designed in the sketch step.
- [ ] Implement SVG render: horizontal bar with sunrise / now / sunset / walk-window markers.
- [ ] Wire event listeners: route change → load stages + recompute; stage change → recompute; date / pace / start change → recompute; "use my location" → geolocate + fill custom panel + recompute (only handler that calls `navigator.geolocation`).
- [ ] Add `js/daylight-perf.test.js`: 1,000 iterations of `recompute()` via `require('./daylight.js').recompute`. Assert median ≤ 0.5 ms, p99 ≤ 5 ms via `process.hrtime.bigint()`. No refactor needed because the two-layer split was designed in the sketch step.
- [ ] Manual smoke in browser: open `/daylight/?route=shikoku-88&stage=0&date=2026-10-15&pace=standard&start=07:00`, verify output is sane (compare against NOAA solar calculator for sanity).
- [ ] Commit: `feat(daylight): slice 3 — hub page forward mode`.

---

### Slice 4: Reverse mode + URL-param round-trip

**Files:**
- Modify: `js/daylight.js` (add mode toggle + reverse-mode compute path), `daylight/index.html` (mode-toggle UI element)
- Modify: `js/daylight-math.test.js` (add round-trip test)

**Spec ACs covered:** AC #6 (round-trip determinism), AC #11 reverse-mode portion.
**Depends on:** slice 3.

**Acceptance:**
- [ ] UI mode toggle visible on output panel (radio or pill, two states: forward / reverse).
- [ ] In reverse mode: user provides buffer (default 60 min). Output is latest-safe-departure time + total walk duration.
- [ ] URL param `mode=reverse` + `buffer=N` round-trips correctly.
- [ ] AC #6 test in `daylight-math.test.js` asserts forward→reverse round-trip within ±1 min using fractional-minute internal precision and the same stage-tz date sunset reference.

**Steps:**
- [ ] Extend `recompute()` to branch on `mode`. Reverse: `latestDeparture = sunsetUTC − bufferMin − walkMin`. Internal precision is float minutes; only display rendering rounds.
- [ ] Add mode toggle to `daylight/index.html` (above output panel). Style in `daylight.css`.
- [ ] Wire toggle event listener: updates URL param via `history.replaceState`, calls `recompute()`.
- [ ] Wire buffer input (visible only in reverse mode). Default 60 per D6.
- [ ] Add round-trip test to `daylight-math.test.js`: pick a fixture `(stage, date, pace, t_start)`, run forward → get `A` → run reverse with `buffer = sunset − A` → assert `|t_start − result| ≤ 1 min`.
- [ ] Manual smoke: toggle to reverse on Shikoku stage 0, set buffer to 30 min, verify departure time is sane.
- [ ] Commit: `feat(daylight): slice 4 — reverse mode + URL round-trip`.

---

### Slice 5: Edge cases + validation + annotations + share button

**Files:**
- Modify: `js/daylight.js` (validation, annotation rendering, share button handler), `daylight/index.html` (annotation slot + share button), `css/daylight.css` (muted-red cushion + annotation typography)

**Spec ACs covered:** AC #13 (URL-param validation + reset behavior + co-param preservation), AC #15 (all edge predicates), AC #19 (malformed scalar uniform rule), AC #20 (share button, custom-route only), AC #14 (geolocation discipline grep), AC #16 (unit / clock-format toggle UI + localStorage namespace).
**Depends on:** slice 4.

**Acceptance:**
- [ ] AC #13 explanation copy appears for invalid route / out-of-range stage. Co-params preserved.
- [ ] Bare hub URL (no params): clean landing, no annotations (AC #11 fix).
- [ ] All edge predicates in AC #15 render the spec'd inline annotation. **Walk-state predicates** (the one that owns the cushion line: stage-too-long for reverse / arrival-past-sunset for forward / normal day) are mutually exclusive — exactly one applies. **Edge annotations** (pre-sunrise start, polar day, polar night) can co-occur with a walk-state predicate to describe a different aspect of the walk (e.g., forward mode with a pre-sunrise start AND a past-sunset arrival shows both annotations because they describe two different ends of the same walk).
- [ ] Polar day / polar night thresholds (`≥23.95` / `≤0.05`) honored.
- [ ] Malformed scalars (AC #19) silently default; no error UI.
- [ ] Share button appears on output panel **only when `route=custom`**, copies URL via `navigator.clipboard.writeText`.
- [ ] Static grep `grep -n 'navigator.geolocation' js/daylight.js` returns exactly one line, inside the "use my location" handler (AC #14).
- [ ] **Unit + clock toggle UI** rendered in a "preferences" panel on the hub: a km/mi pill and a 12h/24h pill. Selections persist to `localStorage` as `pilgrim.prefs.unitSystem` and `pilgrim.prefs.clockFormat`. Distances in output panel re-render on toggle (km↔mi); times re-render in 12h or 24h form. Elevation always shows in meters per AC #16. No URL params for preferences — they're user-global, not per-walk.

**Steps:**
- [ ] Implement structural-param validation (route, stage). Render the AC #13 explanation copy when invalid. Preserve co-params in URL.
- [ ] Implement bare-URL case: no annotation, picker visible.
- [ ] Implement scalar-param coercion table from AC #19 in `parseParams()`.
- [ ] Implement annotation predicate chain in `recompute()`'s output: walk through AC #15 partition rules, attach exactly one (or two for the pre-sunrise + past-sunset combo) annotation string to the output object.
- [ ] Render annotations to DOM in `js/daylight.js` render function. Style via `daylight.css`.
- [ ] Add share button to `daylight/index.html` (output-panel slot, hidden by default). Wire click handler.
- [ ] Wire show/hide logic: share button is shown only when `route=custom`.
- [ ] Build unit + clock toggle UI in `daylight/index.html` (collapsed "preferences" expander). Wire change events to write `localStorage['pilgrim.prefs.unitSystem']` / `['pilgrim.prefs.clockFormat']` and trigger a re-render. On page load, read the localStorage values to seed the toggles (defaults: `km`, `24h`).
- [ ] Verify localStorage namespace via DevTools: change unit → confirm `pilgrim.prefs.unitSystem` is the only new key under `pilgrim.*`.
- [ ] Manual smoke: try `/daylight/?route=garbage`, `/daylight/?route=shikoku-88&stage=999`, `/daylight/?route=shikoku-88&stage=0&date=garbage`, custom route at 70°N in December (polar night), pre-sunrise start. Verify each renders the spec'd state.
- [ ] Run `grep -n 'navigator.geolocation' js/daylight.js` — confirm one hit.
- [ ] Commit: `feat(daylight): slice 5 — edge cases, validation, annotations, share, preferences`.

---

### Slice 6: Per-route SEO pages + launch smoke

**Files:**
- Modify: `scripts/bake-daylight-routes` (extend with HTML output pass)
- Create: `scripts/bake-daylight-routes-templates/route.html`, `daylight/<route>/index.html` × 7, `sitemap.xml` entries, `docs/specs/2026-05-12-daylight-walk-budget-launch.md`

**Spec ACs covered:** AC #7 (full — per-route page chrome for all 7 routes), AC #8 (reciprocal linking), AC #9 (Lighthouse smoke), AC #10 (third-party host scan), AC #12 (HTML half of idempotency), AC #16 + #17 + #18 verification (manual sweep).
**Depends on:** slices 2 + 3 + 4 + 5 (per-route HTML must reference the working JS bundle + all its features).

**Acceptance:**
- [ ] `scripts/bake-daylight-routes` now also writes `daylight/<route>/index.html` for each of the 7 routes from the template. The template substitutes route name, distance, country, and a static prose summary into baked HTML so crawlers see route-specific content without JS.
- [ ] Each `/daylight/<route>/` has a unique `<title>`, `<meta name="description">`, Open Graph tags containing route name + distance + the word "daylight" (verified by an automated grep step inside the bake script).
- [ ] Reciprocal links: each per-route page links to `/sunpath/`, the route's `/walk` page (if one exists; the bake script checks for `walk-<route>.html` at the repo root and links only if present — the launch smoke checklist below verifies which routes got a `/walk` link and which did not, so the inconsistency is documented rather than silent), and the hub `/daylight/`.
- [ ] `sitemap.xml` includes `/daylight/` + each per-route page.
- [ ] Bake script idempotency now covers HTML output too: `git diff --exit-code assets/daylight/ daylight/*/index.html` after double-run.
- [ ] Manual Lighthouse mobile audit on `/daylight/` + one per-route page: Performance ≥ 90 (matches spec AC #9), no third-party requests, no console errors. Notes captured in `docs/specs/2026-05-12-daylight-walk-budget-launch.md`.
- [ ] Reciprocal-link inventory: walk through all 7 per-route pages, record which have `/walk` reciprocal links and which do not (depending on whether `walk-<route>.html` exists at launch time). Captured in the launch doc.
- [ ] Manual `grep -r "googletagmanager\|doubleclick\|facebook.net\|fonts.googleapis\|cdn.jsdelivr" daylight/ assets/daylight/ js/daylight*.js css/daylight.css` returns nothing.
- [ ] Manual sweep of AC #16 (localStorage keys present + correct namespace), #17 (date input native picker), #18 (elevGain placeholder text fixed in meters).

**Steps:**
- [ ] Write `scripts/bake-daylight-routes-templates/route.html` — a plain-text template with `{{route_name_en}}` / `{{distance_km}}` / `{{stages_prose}}` / etc. placeholders.
- [ ] Extend the bake script: after the JSON pass, loop the 7 routes, substitute template placeholders, write `daylight/<route>/index.html`.
- [ ] Add the grep-assert inside the bake script: after writing each HTML file, re-read it and verify it contains the route name + distance + word "daylight". Fail loud if not.
- [ ] Run the bake script. Confirm 7 HTMLs written.
- [ ] Run the bake script again. Confirm `git diff --exit-code daylight/*/index.html` clean.
- [ ] Append `<url>` entries to `sitemap.xml` for `/daylight/` + each per-route page.
- [ ] Verify `robots.txt` doesn't exclude `/daylight/` (read-only check).
- [ ] Open each per-route page in browser, confirm static content visible before JS hydration (disable JS to verify).
- [ ] Run Lighthouse mobile audit on hub + one per-route page. Capture scores + observations in `docs/specs/2026-05-12-daylight-walk-budget-launch.md`.
- [ ] Run the third-party-host grep, capture output (expected: empty) in launch doc.
- [ ] Manual sweep: localStorage namespace check (open DevTools, change unit preference, refresh, confirm `pilgrim.prefs.unitSystem` was written); date picker check (native UI on mobile); elevGain field label is "m"; mode toggle survives refresh.
- [ ] Commit: `feat(daylight): slice 6 — per-route SEO pages + launch smoke`.

---

## What this plan does NOT include

- **Tide / bloom / phenology / other almanac entries.** This plan is for daylight only (spec entry #2). The substrate discipline (input shape + URL convention + visual grammar) is captured in the spec's "out-of-band notes" section; future entries will reference back to it but ship as separate plans.
- **A v2-style preset-specific Tobler coefficient.** Spec defers; this plan honors that.
- **Mountain-shadow / solar-envelope DEM math.** Explicit spec non-goal.
- **App-side anything.** This is pilgrim-landing only.
- **Backend / API / database / accounts.** Static site, URL-params only.

## Risks specific to execution (not in spec)

- **Sibling-repo path assumption.** The bake script assumes `../open-pilgrimages/` is present at bake time. If the implementing agent runs from a different working directory or in a fresh-clone scenario without the sibling, slice 2 + slice 6 fail loud — which is the intended D2 behavior, but the implementer needs to clone the sibling first.
- **NOAA reference value collection.** Slice 1 needs exactly **4 reference (sunrise, sunset) tuples** (León, Tokushima, Quito, Reykjavik on 2026-10-15) baked into `sunpath-math.test.js`. Author must fetch these from NOAA Solar Calculator manually one time and document the fetch date in a test-file comment. Don't automate; the values are stable. (Earlier draft of this plan said "~10 tuples" — that was wrong; spec AC #4 specifies 4.)
- **Tz lookup table maintenance.** Slice 2 ships a per-route IANA-zone constant table (one zone per route). New routes added to `open-pilgrimages` later require extending the table; the bake script fails loud on a route without an entry. Note this in the bake script's README paragraph. Stages crossing zone boundaries within a single route would also need a per-stage upgrade — flagged but not in scope for v1 (current 7 routes don't cross zones).
