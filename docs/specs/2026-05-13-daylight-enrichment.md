# Spec: Daylight Walk Budget — v2 Enrichment Bundle

**Status:** draft v3 — addresses doc-review rounds 1+2, decisions D7-D10 locked, ready for round-3 convergence check
**Date:** 2026-05-13
**Parent:** `docs/specs/2026-05-12-daylight-walk-budget.md` (v1, shipped 2026-05-13)
**Lineage:** entry #2 of the contemplative-instrument almanac; v2 deepens the same widget without expanding scope into new pages.

## Problem

**Problem:** v1 answers "do I have enough light to finish before sunset?" — a clean yes/no glance. But pilgrims do not actually walk to *sunset*; they walk to *usable light*. They want to know which villages they will pass and when. They want the moon (pre-dawn starts are common on long stages). They want to save the answer to their calendar so they do not have to look at the page again the next morning. None of that exists in v1.

**Who feels it:** Pilgrims who have already discovered `/daylight/` and use it more than once. The mid-walk re-evaluation use-case (one rest stop, one glance) is well-served by v1. The night-before planning use-case (laid out tomorrow on the table, picking start times) is under-served.

**When:** The evening before a stage, on a phone or laptop. Pilgrim is reading the bar and asking follow-up questions v1 does not answer.

**Today's workaround:** Tab-juggle: a separate tide/moon site, a separate gazetteer for waypoint towns, a manual calendar entry typed into the phone.

**Cost of doing nothing:** `/daylight/` stays a one-touch tool when it could be a small night-before companion. Repeat visits taper off. The almanac thesis (entries get richer; visitors come back) gets undercut by an underpopulated entry #2.

## In scope (the v2 bundle)

Six additions, all to the existing `/daylight/` hub + per-route pages. No new top-level pages. No new third-party hosts. Vanilla JS, zero npm deps. Each addition must pass the **"does it crowd the bar?"** test: a first-time pilgrim arrives at the page and the bar is still the protagonist.

1. **Civil + nautical + astronomical twilight bands.** Extend the SVG bar past sunset and before sunrise with three translucent bands corresponding to civil (-6°), nautical (-12°), and astronomical (-18°) solar elevation. Adds math to `js/sunpath-math.js`: generalize `daylightHours(lat, date)` to accept an optional `elevationDeg` parameter (current `-0.833°` remains the default for back-compat), then export **six new functions**: `civilDawnUTC`, `civilDuskUTC`, `nauticalDawnUTC`, `nauticalDuskUTC`, `astronomicalDawnUTC`, `astronomicalDuskUTC`. Each is a thin wrapper around the generalized `sunriseUTC` / `sunsetUTC` with the appropriate elevation constant. Renderer adds three concentric muted bands behind the existing daylight band.

2. **Moon overlay.** A faint crescent/full glyph rendered **at a fixed position to the right of the bar (vertically centered)** for the moon's *current phase*, plus tiny dashed ticks at *moonrise* and *moonset* on the bar itself for the chosen date and stage coordinate. Requires extending the math layer: `js/sunpath-math.js` gains `moonriseUTC`, `moonsetUTC`, and `moonPhaseAtUTC` (the last is a **thin re-export** of `Moon.getMoonPhase` from `js/moon.js` — kept as a one-line wrapper inside `sunpath-math.js` so consumers have a single import surface; the real math stays in `js/moon.js` to avoid duplication). Rise/set is new astronomy code: **low-precision Meeus algorithm**, ±15 min tolerance target (sufficient for "is there moonlight tonight?" decisions).

3. **Stage waypoint ticks.** Waypoint data lives in `../open-pilgrimages/routes/<id>/waypoints.geojson` — confirmed during this spec authoring on the `shikoku-88` route (`properties.stageIndex`, `properties.kmFromStart`, `properties.type` with values including `sacred_site` and `supply`, `properties.name`, `properties.tags`, plus route-specific properties like `templeNumber` for Shikoku). Daylight v1 did **not** render these waypoints — they're untouched data in the sibling repo. **v2 renders them for the first time.** The bake script extends to write a `waypoints` array per stage in `assets/daylight/<route>.json`, filtered to `type === 'sacred_site'`. The bake script also asserts (D1-style fail-loud) that each route's `waypoints.geojson` exists and contains at least one `sacred_site` feature; if not, the bake fails with a clear message rather than silently producing empty arrays. Renderer adds small ticks below the walk-window segment, positioned by `kmFromStart / stage.distanceKm`. No hover labels; the ticks are visual depth suggesting "these places along the way." Hover/click can come in v3.

4. **`.ics` export.** A small text-link "Save to calendar" appears below the result line when the page has a valid result. Click generates an ICS string client-side and triggers a data-URI download. ICS shape mirrors `/sunpath/turnings-*.ics` (VCALENDAR + single VEVENT) with DTSTART = startUTC, DTEND = arrivalUTC, SUMMARY = "Walk: <route name> stage <N>", DESCRIPTION = the result-line prose, URL = the current `window.location.href`, CATEGORIES = "Pilgrimage,Walking". A 1-day VALARM reminder. Reverse-mode export: DTSTART = latestDepartureUTC, DTEND = walkEndUTC.

5. **Spider dial per-route SEO page.** Each `/daylight/<route>/index.html` gains one small (~120px square) SVG spider chart in the static body content, between the `daylight-stages-prose` section and the picker panel. Four axes: total distance (km), total elevation gain (m), typical stage count, waypoint density (waypoints per km). Server-baked by `scripts/bake-daylight-routes` — no client JS. Provides visual differentiation between per-route pages for crawlers and casual visitors. Stamen-grade restraint: faint stroke, no axis labels, no numbers — the dial is a shape, not a chart.

6. **Discoverability.** Two small additions to the hub `/daylight/index.html`:
   - **Permalink line** below the output panel: when a named route is selected (i.e., `state.route` is one of the baked route ids, not `"custom"` and not empty), render `<p class="dl-permalink"><em>direct link: <code>/daylight/${state.route}/</code></em></p>`. The `state.route` value IS the route slug — open-pilgrimages route ids (`shikoku-88`, `camino-frances`, etc.) are already the URL slugs; no mapping needed. Quiet, italic, Lato monospace numerals if the project palette supports it. One sentence. No copy button (we already have one in custom-mode share).
   - **Routes index** in the footer area, above the existing `daylight-footer-links`: a small `<aside class="dl-routes-index">` listing every currently-baked route's per-route page as a comma-separated set of italic links. The hub reads the routes list from `assets/daylight/route-meta.json` at page load (same source as the route picker) — **no hardcoded "7" in the markup**. Field-Notes-almanac feel — like the printed index at the back of a book. Intro text: *"Or browse: "*.

## Non-goals

- **Tide / moonrise-pose / lunar eclipse anything beyond rise/set + phase.** Lunar phase + ephemeris is in scope. Eclipses, perigee, apogee, lunar mansions are out of scope.
- **Mountain shadow / horizon obstructions.** Twilight math uses geometric horizon. Real local horizon (mountain casting shadow at -3° instead of -0.833°) was a v1 non-goal and remains a v2 non-goal.
- **Hover labels on waypoint ticks.** Ticks are visual depth only. Tooltips, popovers, modal panels — out of scope for v2.
- **Weather, precipitation, cloud cover.** Brand voice. Permanent non-goal.
- **Multi-day itineraries / sequential stage planning.** v2 is still "one stage, one walk." Multi-day is a future spec.
- **New top-level pages.** No `/daylight/twilight/`, no `/daylight/moon/`, no `/daylight/calendar/`. Everything lands inside the existing hub + 7 per-route pages.
- **Saved walks / login / account state.** URL params + localStorage prefs only. No server-side state.
- **Lunar calendar export.** ICS export covers the walk; lunar events get their own future entry if anything.
- **Different ICS event per route or per stage.** One walk = one VEVENT. Multi-stage itineraries would generate multiple VEVENTs; out of scope.
- **Per-route spider-dial calibration tuning beyond v1 defaults.** The axes scale to the max value across the 7 baked routes; we ship the v1 axis scaling and revisit if a future route makes the dial visually broken.

## Acceptance criteria

1. [ ] **Twilight band math:** `sunpath-math.js` exports **six** functions — `civilDawnUTC`, `civilDuskUTC`, `nauticalDawnUTC`, `nauticalDuskUTC`, `astronomicalDawnUTC`, `astronomicalDuskUTC` — each with signature `(lat, lon, date)` returning a JS `Date` UTC instant or `null` (when the sun does not reach that elevation at the given lat/date — common at high latitudes). The underlying generalized `sunriseUTC`/`sunsetUTC` continues to be exported but is not load-bearing for the renderer (the renderer uses the named twilight wrappers). Unit test in `sunpath-math.test.js` asserts at least 2 baked NOAA twilight reference values per twilight band (civil + nautical + astronomical = 6 fixture assertions minimum) agree to within ±2 minutes for mid-latitude locations (León 2026-10-15, Tokushima 2026-10-15).
2. [ ] **Twilight band rendering:** the SVG bar renders 3 concentric muted bands behind the daylight band: civil (lightest opacity), nautical (slightly darker), astronomical (darkest). Bands extend from the sunrise/sunset markers outward. When the band returns `null` (no civil/nautical/astronomical event on the date at the latitude), the band is omitted without a JS error. Visually verified manually and recorded in the launch doc.
3. [ ] **Moon math:** `sunpath-math.js` exports `moonriseUTC(lat, lon, date)`, `moonsetUTC(lat, lon, date)`, `moonPhaseAtUTC(date)`. Tolerance: **±15 minutes** for moonrise/moonset against published almanac values for at least 3 sample locations (Tokushima, León, Reykjavik on 2026-10-15). `moonPhaseAtUTC` is a thin one-line re-export of `Moon.getMoonPhase` from `js/moon.js` (returns a number in `[0, 1]`) — the source of truth stays in `moon.js`; `sunpath-math.js` just provides a stable import surface. Unit test in `sunpath-math.test.js`.
4. [ ] **Moon rendering:** when moonrise/moonset is non-null for the chosen date+coord, the SVG bar adds small dashed tick marks (visually distinct from the solid sun ticks) at those UTC instants. A 16px crescent/full glyph rendered via `Moon.renderMoon` appears **right of the bar, vertically centered with the bar's y-axis** (fixed position, NOT positioned at a specific UTC instant). No labels.
5. [ ] **Waypoint baking:** `scripts/bake-daylight-routes` reads each route's `waypoints.geojson`, filters to `properties.type === 'sacred_site'`, and writes a `waypoints` array per stage in `assets/daylight/<route>.json`. Each waypoint record: `{ name, kmFromStart }`. **Density-decimation:** if more than one sacred_site falls within any contiguous 3-km window in a stage, the bake keeps the FIRST in that window and drops the rest. The 3-km threshold is named as a constant `WAYPOINT_MIN_SPACING_KM` in the script. (This handles Shikoku 88 stage 0's 12 temples without crowding the bar; on the Camino routes the filter is mostly a no-op since sacred_sites are sparser.) Bake script remains byte-identical idempotent: `git diff --exit-code assets/daylight/ daylight/*/index.html` after double-run.
6. [ ] **Waypoint rendering:** when stage data includes waypoints, the SVG renderer draws tiny ticks below the walk-window segment at positions `BAR_X_walkStart + (kmFromStart / stage.distanceKm) * (BAR_X_walkEnd - BAR_X_walkStart)`. Tick stroke: thin, faint, no label text. Limited to waypoints where `kmFromStart` falls within `[0, distanceKm]` (stage-local). Decimation (per AC #5) happens at bake time, so the renderer trusts the input — no post-bake overlap collapse logic.
7. [ ] **ICS download:** "Save to calendar" link appears in the output panel only when `recompute(state)` returns a valid result (not in error / polar-day-null / polar-night-null states). Click triggers a download of a `.ics` file. The file parses as a valid VCALENDAR with one VEVENT. **Forward mode:** DTSTART = `output.startUTC`, DTEND = `output.arrivalUTC`. **Reverse mode:** DTSTART = `output.latestDepartUTC`, DTEND = `output.walkEndUTC`. *(Verified during spec authoring: v1's `recompute()` already returns these four fields at `js/daylight.js:181-194`. AC #7 has no hidden v1-shape dependency.)* SUMMARY contains the route name and stage label; DESCRIPTION includes the rendered result-line prose (with `·` and `−` escaped per RFC 5545 line-folding rules); URL is `window.location.href`; CATEGORIES = `Pilgrimage,Walking`; one VALARM at `-P1D`.
8. [ ] **ICS test:** an automated test in `js/daylight-math.test.js` calls a new pure helper `buildICS({routeName, stageLabel, startUTC, endUTC, urlHref, mode, stageTz, descriptionLine})` and asserts the returned string contains all required VEVENT fields. The `stageTz` parameter is included in the signature per **D9** but unused in v1's body (emits UTC-only DTSTART/DTEND). Documented in `buildICS`'s code comment so a future reader doesn't try to wire it in without context. The download trigger is DOM-side and tested manually; the ICS string generation is pure and gated by this test.
9. [ ] **Spider dial baking:** the bake script writes a `<svg class="dl-spider-dial">` element into the per-route HTML template at the spec'd position. The dial is a **4-arm polygon** with one arm per axis: (a) total distance km, (b) total elevation gain m, (c) stage count, (d) **sacred-sites density (sacred_site waypoints per km, post-decimation per AC #5)**. Axis scaling: each axis normalized to the maximum value across **all currently-baked routes** (computed at bake time across whatever route count is present — currently 7, but the script must not hardcode that number). Faint stroke, no labels, no fill. Idempotent across double-runs of the bake script.
10. [ ] **Spider dial accessibility:** the per-route SVG includes a static `<title>` element describing **all four** axis values (e.g., "Camino Frances: 764 km, 12000 m elevation gain, 33 stages, 0.4 sacred sites per km"). Screen readers announce the title; visual users see only the shape.
11. [ ] **Permalink line:** the hub renders `<p class="dl-permalink">` containing the text `direct link: /daylight/${state.route}/` when `state.route` is a named route (not `"custom"` and not empty). `state.route` is the same string used as the URL slug — no mapping. Hidden in the bare-hub / custom / unselected states.
12. [ ] **Routes index:** the hub footer area renders a `<aside class="dl-routes-index">` containing a small italic intro phrase plus one link per currently-baked route, comma-separated. Link list is built from `assets/daylight/route-meta.json` at page load (no hardcoded route count). Visible on the hub at all times (no state-dependent visibility).
13. [ ] **No crowding of the bar (subjective launch checkpoint, not automated):** during the launch smoke, the author makes a 24-hour-cooled fresh-eyes pass on the bar and confirms in writing in `docs/specs/2026-05-13-daylight-enrichment-launch.md` that the daylight span, walk window, and sun markers remain the visual protagonists relative to the new layers (twilight bands, moon glyph, moon ticks, waypoint ticks). If any new layer dominates visually, that layer's stroke/opacity is reduced and the check re-run. This is a quality gate, not a unit-testable criterion.
14. [ ] **No new third-party hosts:** `grep -rE "googletagmanager|doubleclick|facebook.net" daylight/ assets/daylight/ js/daylight*.js css/daylight.css` returns nothing. No external font/CDN/analytics additions.
15. [ ] **No npm deps introduced:** still zero `package.json` in repo; tests still run via `node js/<file>.test.js`.
16. [ ] **All existing tests pass:** sunpath-math (now with new fixtures), daylight-math (now with ICS-builder test), daylight-perf — all exit 0.
17. [ ] **Perf gate holds:** `recompute()` p99 remains ≤ 5 ms in `daylight-perf.test.js` despite the new math (twilight + moon ephemeris). The perf test's fixed input must be updated so it actually exercises the new code paths — twilight and moon must be computed during the 1000-iteration loop, not skipped because of a null sentinel. If perf is at risk, lazy-compute twilight/moon only when their rendering is active.

## Architecture (sketch)

```
js/sunpath-math.js                 # EXTEND: twilight (6 fns: civil/nautical/astronomical × dawn/dusk), moon (3 fns: moonriseUTC, moonsetUTC, moonPhaseAtUTC)
js/sunpath-math.test.js            # APPEND: twilight + moon fixtures
js/daylight.js                     # EXTEND: render bands, moon glyph, waypoint ticks, ics button, permalink line, routes index, dynamic route-meta consumption
js/daylight-math.js                # EXTEND: add buildICS pure helper (signature in AC #8)
js/daylight-math.test.js           # APPEND: buildICS test
css/daylight.css                   # EXTEND: bands, dial, permalink, routes index, moon glyph
daylight/index.html                # EXTEND: routes index <aside> (footer-area), permalink slot (below output panel), moon glyph slot
scripts/bake-daylight-routes       # EXTEND: waypoint extraction (sacred_site filter + density-decimation), spider-dial SVG injection, cross-route max-axis computation
scripts/bake-daylight-routes-templates/route.html  # EXTEND: spider-dial <svg> slot in the static body content
assets/daylight/*.json             # MODIFIED: stages now carry waypoints array (idempotent rebake)
daylight/<route>/index.html        # MODIFIED: spider dial baked in (idempotent rebake)
```

No new files. Six existing files extended (`daylight-math.js` joins as a modified file because `buildICS` lives there).

## Open questions

**Blocking (must resolve before implementation):**

- **Q1:** Which Meeus algorithm precision should we adopt for moonrise/moonset? Meeus's "Astronomical Algorithms" offers a low-precision (±5 min) and higher-precision form (±1 min, much more code). The spec mandates ±15 min — low-precision is sufficient and roughly 30 LOC. *(Suggested resolution: low-precision; document the choice in a code comment + the test tolerance.)*
- **Q2:** Are waypoint coordinates baked or only `{ name, kmFromStart }`? `kmFromStart` is sufficient for tick positioning; coordinates would enable future hover labels with mini-maps. *(Suggested resolution: bake `{ name, kmFromStart }` only — keeps the JSON small and the v2 visual stays simple. Coordinates can be added in v3 if waypoint hover lands.)*

**Resolved inline during spec authoring (kept for traceability):**

- **D7 (was Q3) — Spider-dial scale.** Normalize each axis to the **max across all currently-baked routes** (computed at bake time). The dial is comparative; relative shape is the point.
- **D8 (was Q4) — Moon glyph position.** Fixed position right of the bar, vertically centered. No time-aligned placement (would crowd the bar).
- **D9 (was Q5) — ICS TZID handling.** v1 of the ICS helper emits **UTC-only DTSTART/DTEND**. The `stageTz` parameter is included in `buildICS`'s signature but unused in v1 — reserved for a v2.x follow-up that adds a TZID block, so signature stays stable. (Trade-off: some calendar clients render UTC events with timezone math, which is correct but reads as "the walk starts at 22:00 UTC" rather than "07:00 in Madrid." Acceptable for first ship.)
- **D10 (was Q6) — Permalink copy.** `direct link: /daylight/<route>/`. No alternative wording. The spec hard-codes this; revisit only if launch smoke surfaces a real readability problem.

## Risks

- **Risk:** New math (twilight + moon ephemeris) regresses `recompute()` perf below the 5ms p99 gate. *Mitigation:* lazy-compute — only call moonrise/moonset if the moon overlay is enabled; only compute twilight if the band would be visible (sun rises/sets normally). Worst case, gate the new math behind a `prefs.enableEnrichment` toggle (would need a third pref key). Re-run perf test after first rough integration; if median > 0.2 ms, refactor before continuing.
- **Risk:** Waypoint ticks crowd the bar visually for routes with many sacred sites (Shikoku 88 has 88 temples; stage 0 contains 12 temples). *Mitigation:* the `type === 'sacred_site'` filter helps; if still crowded, additionally reduce density by every-Nth selection (`waypoint.kmFromStart` modulo a chosen interval km — e.g., one waypoint per 3 km maximum). Apply at bake time so the renderer stays simple. Address during launch smoke if needed.
- **Risk:** Spider-dial axis normalization makes Camino Inglés (~112 km) look like a sad shrunk **quadrilateral** next to Camino Frances (~764 km). *Mitigation:* document the normalization choice; if it looks bad in launch smoke, swap to a logarithmic axis or per-route absolute scaling.
- **Risk:** Moon glyph rendered via `Moon.renderMoon` may not match the constellation/dark-mode palette and could appear bright-white against the dark background. *Mitigation:* read `moon.js` rendering carefully; if needed, pass a fill-color argument or add a CSS override.
- **Risk:** ICS export's `DESCRIPTION` includes the rendered prose line which contains characters like `·` and `−`. ICS spec is finicky about line wrapping and special chars. *Mitigation:* use a small ICS-escape helper; test with at least one real calendar import (Apple Calendar, Google Calendar) during launch smoke.
- **Risk:** v2 ships before v1 is settled. v1 was committed to main 2026-05-13. *Mitigation:* this spec is dated 2026-05-13. Ship v1 → wait a week → start v2. Confirm with user before implementation.

## Verification plan

0. **Pre-implementation gate:** confirm v1 has been live (or merged on `main`) for **at least 7 days** before starting v2 implementation. Capture confirmation in `docs/specs/2026-05-13-daylight-enrichment-launch.md` as the first entry. Rationale: v1 may surface its own follow-up issues that should be folded into v2's scope or change v2's priorities. The spec being drafted on the same day as v1 ships is intentional — spec authoring during the cooldown is encouraged; only the *implementation* waits 7 days.
1. After implementation, walk through the 17 acceptance criteria one-to-one. Note that **AC #13** (no-crowding subjective gate) and **AC #15** (no-npm-deps repo-state assertion) are not automated — verify manually and record findings in the launch doc rather than expecting a green test.
2. Run all 3 test suites: `node js/sunpath-math.test.js && node js/daylight-math.test.js && node js/daylight-perf.test.js`. All exit 0.
3. Run the bake script + idempotency check: `node scripts/bake-daylight-routes && git diff --exit-code assets/daylight/ daylight/*/index.html`.
4. Manual browser smoke on hub + one per-route page in all 3 themes (light, dark, star). Capture screenshots in `docs/specs/2026-05-13-daylight-enrichment-launch.md`.
5. Manual ICS import: download generated `.ics`, open in Apple Calendar (or equivalent), verify event renders correctly.
6. Manual "no crowding" test: show the bar to a fresh viewer (or wait 24h and re-look with fresh eyes); confirm it still passes the first-glance test from AC #13.
7. Manual third-party-host grep per AC #14.
