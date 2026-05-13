# Spec: Daylight walk-budget

**Status:** draft v3 — addresses doc-review findings through round 6 (Tobler model clarified, custom-route input model locked, perf gate descoped to node-level, edge cases partitioned)
**Date:** 2026-05-12
**Origin:** [dream archive](~/.kaijutsu/dreams/4a74c52c5e0bff8c-walking-related-games-toys-on-pilgrim-landing-t-20260512-214818.md) → reframed from "games to attract users" to "almanac of contemplative instruments." This is entry #2 of the almanac; [`/sunpath`](../../sunpath/) is entry #1.

## Problem

**Problem:** A pilgrim planning (or mid-walking) a stage cannot quickly answer "do I have enough daylight to finish before sunset?" without a weather app, a calculator, and a route guide on three separate tabs.

**Who feels it:** Pilgrims walking long routes — Shikoku 88, Kumano Kodo, the Caminos, Saigoku 33, and self-routed walkers — particularly during shoulder seasons (Oct-Nov, Mar-Apr) when daylight contracts unpredictably.

**When:** The night before a stage (planning state) or mid-stage at a rest stop (re-evaluation state).

**Today's workaround:** Tab-juggle between a sunset-time site, a paper guidebook for stage distance, and mental math for pace. Often skipped → pilgrim arrives at lodging after dark or pushes too hard.

**Cost of doing nothing:** Pilgrims keep using mismatched tools. We forfeit a natural extension of `/sunpath`, a long-tail SEO funnel (per-route, per-stage daylight queries), and a chance to demonstrate Pilgrim's voice on a problem the app's core audience actually has.

## Decisions locked during spec authoring

Originally Q1/Q2/Q3 were marked blocking. Resolved inline so the spec is contradiction-free:

- **D1 (was Q1) — Route data audit.** Verified during spec authoring: all 7 routes in `open-pilgrimages/routes/` (`shikoku-88`, `kumano-kodo`, `camino-frances`, `camino-ingles`, `camino-norte`, `camino-portugues`, `camino-primitivo`) ship a `stages.json` with `schemaVersion: 1.0.0` containing per-stage `start.coordinates` (`[lng, lat, elev_m]`), `distanceKm`, and `elevationGainMeters`. **All 7 routes ship at v1.** No gating.
- **D2 (was Q2) — Data source.** Build script reads from **sibling checkout** at `../open-pilgrimages/routes/<id>/stages.json` (assumes both repos are clones under the same parent dir, which is the existing convention per memory). Pinned-release fetching is **out of scope** for v1. **"Fails loud" contract:** the script exits with non-zero status (default `1`) and prints a single-line stderr message of the form `bake-daylight-routes: missing or invalid <path/to/stages.json> — <reason>` whenever (a) the sibling repo is absent, (b) a `routes/<id>/stages.json` is missing, (c) a stage record lacks coordinates or `ianaTz` couldn't be resolved, or (d) `schemaVersion` doesn't match the expected `1.0.0`. The deploy pipeline must invoke the bake script before publishing, so a loud failure surfaces in CI/local terminal output, not silently.
- **D3 (was Q3) — Geolocation.** **Explicit-only**: no auto-prompt on load; geolocation API fires exclusively in response to a user tap on a "use my location" button on the custom-route panel. Verified by AC #14 below.
- **D4 — Timezone.** Each baked `assets/daylight/<route>.json` carries a **stage-level `ianaTz` string** (looked up at bake time from each stage's `start.coordinates` using a build-side tz database). At runtime, all named-route sunrise/sunset times are formatted in that stage's `ianaTz` via `Intl.DateTimeFormat`. **No longitude-fallback at runtime.** Custom-route mode (user-supplied pins, no IANA lookup at runtime) uses **browser-local timezone** for both date interpretation and time formatting, with an explicit **`(local time)`** label on rendered outputs. Bake script fails loud if a baked route stage lacks `ianaTz`. **URL-portability for custom-route shares:** since custom-route times are in browser-local tz, sharing a custom-route URL across timezones yields a different wall-clock interpretation on the receiving end. The hub displays a tooltip on the share button for custom routes: *"This link's date and times reflect your local timezone."* Named-route URLs are tz-portable because the stage's `ianaTz` is the source of truth on both ends.
- **D5 — "Now" semantics for defaults.** "Current time in stage timezone" (AC #11) means: take JavaScript's `new Date()` (UTC instant of page load), then format wall-clock components via `Intl.DateTimeFormat({timeZone: stageTz})`. Date default = the wall-clock date for that stage at that moment. Example A (small offset): a pilgrim opens the page from Tokyo (UTC+9, Tue 23:00 JST) for a Camino Frances stage (Europe/Madrid, UTC+1, Tue 15:00 CET). The defaulted date is **Tuesday in Madrid**, defaulted start time **15:00 in Madrid**. Example B (date-line straddle): same Tokyo pilgrim opens at Wed 06:00 JST. In Madrid it is still Tue 22:00 CET. **The defaulted date is Tuesday in Madrid** — the stage's wall-clock truth — even though the pilgrim's local date is Wednesday. The page surfaces the stage's tz in the date field label (e.g. *"date (Europe/Madrid)"*) so this is never silent.

## In scope

- A new public page `/daylight/` (hub) with route picker + custom-route mode.
- Per-route static SEO landing pages `/daylight/<route-slug>/` for **all 7** routes from D1.
- Dual-mode toggle:
  - **Forward** (default for mid-walk state): user inputs start time → output is arrival time + minutes of daylight cushion after arrival.
  - **Reverse** (planning state): user inputs desired arrival buffer before sunset → output is latest safe departure time.
- Inputs:
  - Route (preset or "custom").
  - Stage (preset from route's stage table) OR custom: distance km + cumulative elevation gain m + start latitude/longitude (required — used to anchor sunrise/sunset times).
  - Date (default: today). Dates are interpreted in the **stage's IANA timezone** (D4). A pilgrim in Tokyo planning a Camino Frances stage sees Galician sunrise/sunset, not Tokyo's.
  - Pace preset (slow 3 km/h / standard 4 / brisk 5) OR custom min/km. Pace presets define **flat-ground walking velocity `v_flat` (km/h)**. `elevGainM` is **gross uphill gain only** (non-negative; descents not modeled in v1 — pilgrim-conservative). Slope `s = elevGainM / (distanceKm × 1000) ≥ 0` always. **v1 walking-velocity model (Tobler-inspired, not Tobler-faithful):**
    > `v(s) = v_flat × exp(-3.5 × s)`
    This is **not** a re-parameterization of canonical Tobler. Canonical Tobler is `6 × exp(-3.5 × |s + 0.05|)` and peaks at `s = -0.05` (humans walk slightly faster on shallow downhill than on flat ground). Our model **drops Tobler's `+0.05` offset entirely** and substitutes `v_flat` for Tobler's leading constant `6`. Practical consequence: at `s = 0`, our model returns `v_flat`; canonical Tobler returns `≈5.04 km/h` (at the offset-shifted peak rolloff). The two formulas agree only at `s = 0` after substitution, and diverge on small positive slopes because canonical Tobler still has the offset baked in. We accept this simplification because v1 ignores descents, so the `(s + 0.05)` shift no longer carries useful information. The exponent `-3.5` is held constant across pace presets as a v1 modeling choice — slow / standard / brisk hikers experience the same proportional slope penalty. AC #5 fixtures cover only the `standard` preset on this basis; preset-specific calibration is a v2 question if data demands it. Total walking minutes = `60 × distanceKm / v(s)`. At `s = 0` this collapses to `60 × distanceKm / v_flat`, so a flat 10 km @ standard preset = exactly 150 min.
  - Start time (forward mode) OR arrival cushion target before sunset (reverse mode, default 60 min).
- Outputs:
  - Horizontal daylight bar (SVG): sunrise marker · "now" marker (if today) · sunset marker · walk-window overlay.
  - Numeric: arrival time + cushion minutes (forward) OR latest departure + total walk duration (reverse).
  - Sunrise/sunset times for the chosen date + stage start coordinate, formatted in the stage's IANA timezone per D4.
  - Total walking time, broken down: flat-equivalent km, elevation-adjusted minutes.
- Math reuse: extend `js/sunpath-math.js` with `sunriseUTC(lat, lon, date)` and `sunsetUTC(lat, lon, date)` (both return UTC Date objects; display-side formatting is the page's job). Add a new module `js/daylight-math.js` for `walkingMinutes({distanceKm, elevGainM, pacePresetOrMinPerKm})` (Tobler hiking function per formula above). Test split: sun extensions tested in `js/sunpath-math.test.js`; walking math tested in `js/daylight-math.test.js`.
- Route stage data: per D2, bake script reads `../open-pilgrimages/routes/<route-id>/stages.json` + `metadata.json`. Writes `assets/daylight/<route-slug>.json` per route. Each stage record: `{ index, nameEn, startLat, startLon, distanceKm, elevGainM, ianaTz }`. **The IANA timezone field is `ianaTz` everywhere — in the baked schema, in D4, and in any error messages.** Coordinate axes follow open-pilgrimages convention `[lng, lat, elev_m]`; bake script extracts `lat, lng` explicitly into the baked file. **Stage indexing is 0-based**, matching `open-pilgrimages/routes/<id>/stages.json`'s `index` field. URL param `stage=N` is the integer 0-based index into the baked stages array.
- Brand voice: quiet rendering, dial/horizontal-bar geometry, no third-party scripts, no analytics beacons. **Concrete network rule:** every `<link rel="stylesheet">`, `<script src>`, `<img src>`, `@font-face`, and `fetch()` request fired from the page resolves to the site's own origin (the `pilgrim.cafe` host that already serves `/sunpath`). No new third-party hosts introduced.
- Mobile-respecting: phone-first responsive. Per D3, geolocation API fires **only** in response to a user tap on a "use my location" button on the custom-route panel. The button **auto-fills the lat/lon input fields** for the user; it does not bypass them. Manual entry remains the primary path; geolocation is a convenience shortcut.

## Non-goals

- **Mountain-shadow / solar-envelope computation.** Deferred. Adds DEM-tile dependency and visual complexity that doesn't pay for itself in v1.
- **Weather, precipitation, wind forecast.** Brand voice memory: this is an instrument, not a service. Forecast adjacencies risk drifting into widget territory.
- **Live-route GPS tracking.** This is a calculator, not a navigator. The app handles navigation.
- **Stage-table editing or user-supplied named routes.** Custom-route mode is a **single-coordinate calculator** — user enters one start lat/lon (or taps geolocate), plus distance and elevation as scalar inputs. No two-pin map drawing in v1. Named-route additions go through `open-pilgrimages` upstream.
- **Account creation, saved trips, or any persistent state beyond URL query params for walk-planning data.** The walk-planning state (route, stage, date, pace, start, mode, buffer) lives only in the URL. `localStorage` is permitted for **non-pilgrimage preferences** only — unit system (`km` vs `mi`) and clock format (`12h` vs `24h`). These two keys are the entire localStorage surface.
- **Locale-translated UI beyond English in v1.** Stage names display in their **English form** (`name.en` from `open-pilgrimages`) for v1 — page chrome is English-only and English stage names match. Japanese/Spanish/Galician renderings are a v2 question; do not silently include them in v1 HTML.
- **Lunar/twilight calculations.** Civil daylight (sunrise to sunset, 0.833° refraction) only. Astronomical/nautical/civil twilight bands are entry #3+ territory.

## Acceptance criteria

1. [ ] `/daylight/` loads as a static HTML page, no build-time framework, matching the pattern of `/sunpath/index.html`.
2. [ ] Picking each of the 7 routes in the dropdown loads its stage list without a page reload.
3. [ ] **Input handler latency:** the `recompute()` core (the pure-math portion: `walkingMinutes`, `sunriseUTC`, `sunsetUTC`, plus arithmetic to produce arrival/departure) runs as a tight loop in `js/daylight-perf.test.js` via the **existing node-based test harness pattern** (no new npm deps; matches `js/sunpath-math.test.js`). The test invokes the core 1,000 times against a fixed input, uses `process.hrtime.bigint()` for timing, and asserts: **median ≤ 0.5 ms, p99 ≤ 5 ms per call on the developer's local Node 22**. (Browser handler latency including DOM render is monitored manually via Chrome DevTools at launch time and captured in `docs/specs/2026-05-12-daylight-walk-budget-launch.md`; we don't gate the spec on browser perf without a build tool to drive it.) Lighthouse run from AC #9 catches gross regressions; the node-level math gate catches algorithm-class blow-ups.
4. [ ] Daylight math correctness: a unit test asserts `daylightHours`, new `sunriseUTC`, and new `sunsetUTC` agree with **baked NOAA Solar Calculator reference values** (copied into the test file as fixtures at author time — no runtime fetch) for **exactly these four (lat, lon, date) tuples**:
   - **León** (Camino Frances): lat 42.60°N, lon 5.57°W, date 2026-10-15.
   - **Tokushima** (Shikoku 88 Temple 1 region): lat 34.16°N, lon 134.50°E, date 2026-10-15.
   - **Quito** (equator proxy): lat 0.18°S, lon 78.47°W, date 2026-10-15.
   - **Reykjavik** (high-latitude stress test): lat 64.13°N, lon 21.94°W, date 2026-10-15.
   Tolerance: ±2 minutes for the first three (lat ≤ 60°), **±10 minutes** for Reykjavik (NOAA's published algorithm vs our Spencer truncated series in `sunpath-math.js` diverges more at high latitudes near rapid daylight-change windows; ±10 min keeps us within published implementation spread without pinning a single algorithm).
5. [ ] Tobler hiking function correctness: `walkingMinutes({distanceKm:10, elevGainM:0, pacePreset:"standard"})` returns 150.0 ± 0.5 min. `walkingMinutes({distanceKm:10, elevGainM:500, pacePreset:"standard"})` returns **178.7 ± 0.5 min** (derivation using the simplified v1 form `v(s) = v_flat × exp(-3.5 × s)`: `v(0.05) = 4 × exp(-0.175) = 4 × 0.83946 = 3.3578 km/h`; time = `60 × 10 / 3.3578 = 178.69 min`).
6. [ ] Mode round-trip: forward mode produces arrival time `A` from inputs `(s, t_start)` where `s` carries the user-selected stage-tz date. Reverse mode is then fed `(s, buffer = sunset(date_s) − A)`, **using the same stage-tz `date_s`** as the original input — the sunset reference is anchored to the user's chosen date, not the computed arrival date. The test asserts `|t_start − t_start'| ≤ 1 min` **when both legs use fractional-minute internal precision** (whole-minute display rounding applies only at the rendering layer). The round-trip property is required only when the forward arrival falls on the same stage-tz calendar day as `t_start`; cross-day arrival cases (`t_start` close to midnight, very long stage) trigger AC #15's edge-case branches instead, and round-trip determinism is not required there.
7. [ ] Per-route page `/daylight/<route>/` (for **each of the 7 routes**) has a static `<title>`, `<meta name="description">`, and Open Graph tags that include the route name, the route distance from `metadata.json`, and the word "daylight". An automated check in the build pipeline (or a one-time inspection script in `scripts/`) grep-asserts these strings across all 7 generated `index.html` files; the spec does not gate on "sampled routes".
8. [ ] Per-route pages link reciprocally with `/sunpath/`, the route's `/walk` page (if one exists), and the hub `/daylight/`.
9. [ ] **Lighthouse smoke (supplementary to AC #3):** a one-time manual Lighthouse mobile audit on the hub page + at least one per-route page records Performance ≥ 90, no third-party requests, no console errors. This is a one-shot launch smoke, not a CI gate; AC #3 is the load-bearing perf gate. Audit notes captured in `docs/specs/2026-05-12-daylight-walk-budget-launch.md` at implementation time.
10. [ ] No network requests to third-party domains at runtime. Verified by reading the compiled HTML/JS and by browser DevTools network tab.
11. [ ] **Full URL-param round-trip:** all forward-mode inputs survive a page refresh via `/daylight/?route=kumano-kodo&stage=3&date=2026-10-15&pace=standard&start=07:00&mode=forward`. Reverse-mode via `?route=...&buffer=60&mode=reverse`. Stage param uses **0-based indexing** per the open-pilgrimages convention. **Partial-param handling (per D5 "now" semantics):**
    - Missing `date`: wall-clock-now-date in the stage's `ianaTz` (or browser-local for custom routes).
    - Missing `pace`: `standard`.
    - Missing `mode`: `forward`.
    - Missing `start` (forward mode only): wall-clock-now-time in the stage's `ianaTz` (or browser-local for custom routes).
    - Missing `buffer` (reverse mode only): 60 minutes.
    - **Bare hub URL** (`/daylight/` with zero query params): hub renders with picker visible, no annotations, no error message. This is the canonical landing state and must look quiet.
    - **`route` missing while other params present** (e.g., `/daylight/?stage=3&pace=brisk`): the URL is malformed — orphan params suggest the user navigated from a stale link. Hub renders with picker visible plus an inline explanation reading *"This link is missing the route. Pick one below."* (Distinct from AC #13's invalid-route copy.)
    - **`route` present but missing `stage`** (e.g., `/daylight/?route=shikoku-88`): hub renders with route pre-selected and stage picker visible, no inline error — incomplete selection is a normal in-progress state.
12. [ ] Build script `scripts/bake-daylight-routes` regenerates **both** `assets/daylight/<route>.json` AND `daylight/<route>/index.html` for each of the 7 routes, from `../open-pilgrimages/routes/<route>/stages.json` + `metadata.json`. **Idempotent**: running the script twice in succession on the same `open-pilgrimages` checkout produces byte-identical output files in both kinds (verified by `git diff --exit-code assets/daylight/ daylight/*/index.html`).
13. [ ] **URL-param validation on hub page:** if the user lands on `/daylight/?route=<unknown>` OR `/daylight/?route=<unknown>&stage=N` OR `/daylight/?route=<valid>&stage=<out-of-range>`, the hub JS validates params and renders with the affected picker(s) reset, plus an inline explanation immediately above the picker reading: **"We couldn't find that route or stage. Pick one below."** ("Out-of-range" stage = stage index < 0 OR ≥ baked stage count for the route OR non-integer string.) **Co-params are preserved**: `date`, `pace`, `start`, `buffer`, `mode`, `elevGain` survive validation if individually well-formed; only the invalid params (route and/or stage) are reset. Once the user picks a valid route+stage, the preserved co-params auto-populate without losing their values. No JavaScript console errors, no broken UI. (Hub-side param validation only; server-level 404s for unknown `/daylight/<unknown>/` directory paths are out of scope and handled by the existing site `404.html`.)
14. [ ] **Geolocation discipline (per D3):** the geolocation API is *only* invoked from the `click` handler of the "use my location" button on the custom-route panel. Verified by (a) static grep that `navigator.geolocation` appears exactly once in `js/daylight.js`, inside that handler, and (b) a manual test loading every other entry point (`/daylight/`, each `/daylight/<route>/`) and confirming no geolocation permission prompt fires on initial render.
15. [ ] **Edge-case behavior contracts:** the page handles these states without crashing and with brand-voice-appropriate copy (no error banners, quiet inline annotations). Edge predicates are partitioned so exactly one rule applies per state:
    - **Forward mode, `t_start < sunriseUTC`:** the pilgrim is starting in the dark. Annotate *"You're starting before sunrise (HH:MM in stage timezone). The first stretch will be torchlit."* Arrival/cushion render normally on the bar.
    - **Forward mode, arrival past sunset:** the cushion line renders in muted red and is annotated *"You'll arrive after sunset by X min. Consider a slower stage or earlier start."* The walk-window overlay on the SVG extends past the sunset marker visually. (If pre-sunrise start AND past-sunset arrival both apply, both annotations show — they describe different ends of the walk.)
    - **Reverse mode, `walkingMinutes > (sunsetUTC − sunriseUTC) − buffer`:** the stage cannot fit in today's daylight even starting at sunrise. Show **no departure value**; annotate *"This stage is longer than today's daylight minus your buffer. Consider splitting it, or starting from a different stage."* No "earliest departure before sunrise" fallback is offered in this branch.
    - **Reverse mode, walk fits but `latestDeparture < sunriseUTC`:** the stage fits if pilgrim starts in the dark. Show the computed departure; annotate *"Earliest safe departure is before sunrise (HH:MM in stage timezone). Plan for a torchlit start."* This branch is reachable only when the first reverse-mode predicate above is false.
    - **Polar day** (`daylightHours` returns a value `≥ 23.95`): hide the sunrise/sunset markers; annotate *"Polar day — sun does not set on this date."* `walkingMinutes` still computes; arrival/departure are unconstrained by sunset.
    - **Polar night** (`daylightHours` returns a value `≤ 0.05`): annotate *"Polar night — sun does not rise on this date."* Walk-window math still renders; cushion is undefined and hidden.
    - **Normal day** (`0.05 < daylightHours < 23.95`): no annotation. Sunrise/sunset markers render normally.
16. [ ] **localStorage surface (per Non-goals):** exactly two keys are written by the page: `pilgrim.prefs.unitSystem` (values `km` or `mi`) and `pilgrim.prefs.clockFormat` (values `12h` or `24h`). Both are scoped under the **`pilgrim.prefs.*` namespace** — these are user-global preferences that future almanac entries (tide, bloom, etc.) will share, so they live at the user-prefs layer, not the per-entry layer. No other localStorage writes. **Mile/imperial UI is in scope for v1** (the `mi` value is a real, selectable option); when `mi` is selected, **only distance units convert** (km → mi); elevation always displays in meters in v1 (no feet support — feet display deferred to v2 alongside any other locale work).
17. [ ] **Date input format:** the date field uses `<input type="date">` (native picker). Accepted values are ISO-8601 calendar dates (`YYYY-MM-DD`) in the stage's `ianaTz` (or browser-local for custom). Allowed range: any date from year 1900 through year 2100 (avoids `Date` overflow edge cases). Out-of-range dates fall back to today.
18. [ ] **Custom-mode elevation gain input:** `elevGainM` is an optional numeric input in the custom-route panel, default `0`, accepts integers `≥ 0`. UI placeholder reads *"Elevation gain (m, optional)"* — the `m` label is fixed in v1 regardless of the user's `pilgrim.prefs.unitSystem` (no feet input v1, matching AC #16's no-feet-display rule). URL param: `elevGain=<integer>`.
19. [ ] **Malformed scalar params (uniform rule):** any URL param that fails its expected type/range is silently replaced with its default per AC #11 (or the explicit defaults below if AC #11 doesn't define one). No error banner fires for a single bad scalar — only the structural cases in AC #13 surface UI explanation. Examples:
    - `pace=fastest` (not in preset set, not a valid `Xmin/km` form) → `standard`.
    - `date=not-a-date`, `date=1899-01-01`, `date=2101-12-31` (outside the 1900–2100 range per AC #17) → wall-clock-today in stage `ianaTz`.
    - `start=25:00`, `start=abc` → wall-clock-now in stage `ianaTz`.
    - `buffer=-30`, `buffer=abc` → `60`.
    - `elevGain=abc`, `elevGain=-100` → `0`.
    - `mode=anything-else` → `forward`.
20. [ ] **Share button (custom-route only):** when route = `custom`, an output-panel "Copy share link" button copies the current URL (including all populated query params) to the clipboard via `navigator.clipboard.writeText`. Tooltip below the button reads *"This link's date and times reflect your local timezone."* Named-route output panels do not show a share button in v1 (their URLs are tz-portable; copy-paste from the address bar suffices).
21. [ ] **walkingMinutes is pure and deterministic:** `walkingMinutes(...)` is a pure function — no closures over external state, no random sources, no time-dependent inputs beyond the explicit args. This is required for AC #6 round-trip determinism; verified by code inspection.

## Architecture (sketch)

```
pilgrim-landing/
├── daylight/
│   ├── index.html                       # hub: picker + custom mode
│   ├── shikoku-88/index.html            # per-route SEO landings
│   ├── kumano-kodo/index.html
│   ├── camino-frances/index.html
│   ├── camino-ingles/index.html
│   ├── camino-norte/index.html
│   ├── camino-portugues/index.html
│   └── camino-primitivo/index.html
├── css/daylight.css
├── js/
│   ├── daylight.js                      # page controller, mode toggle, render
│   ├── daylight-math.js                 # walkingMinutes + Tobler-derived
│   ├── daylight-math.test.js
│   ├── daylight-perf.test.js            # Puppeteer-driven AC #3 perf gate
│   └── sunpath-math.js                  # EXTEND: add sunriseUTC, sunsetUTC
├── assets/daylight/
│   ├── shikoku-88.json                  # baked stage tables
│   ├── kumano-kodo.json
│   └── ... (per route)
└── scripts/
    └── bake-daylight-routes              # reads ../open-pilgrimages, writes assets/daylight/*.json
```

Per-route HTML pages are **build-time-baked static HTML**: stage names, route metadata, and a static prose summary ("Daylight for the Camino Frances, stage-by-stage…") are written into the `<body>` so crawlers see route content without executing JS. The shared JS bundle hydrates the interactive picker + math on top of the baked content. Same JS controller across hub and per-route pages; what differs is the baked HTML scaffolding and the `<title>` / `<meta>` / `<h1>`. **The single bake script `scripts/bake-daylight-routes` produces BOTH `assets/daylight/<route>.json` and `daylight/<route>/index.html`** — one script, two output kinds per route, from the same `open-pilgrimages` source. AC #12 idempotency applies to both output kinds. There is no separate HTML-generation tool.

## Open questions

**Blocking:** None. (Q1/Q2/Q3 resolved inline as D1/D2/D3 above.)

**Non-blocking (resolve during implementation):**

- **Q4:** Should the SVG daylight bar use the same color palette as `/sunpath`, or a distinct one? Visual-grammar cross-cut from brainstorm suggests shared palette.
- **Q6:** Show a "tomorrow's daylight" preview in the corner, or keep page strictly to chosen date? Adds value during night-before planning; adds clutter otherwise.

**Decided post-spec:**

- **D6 (was Q5) — Reverse-mode buffer default.** Universal 60 min across all 7 routes in v1. Per-route localization is a v2 question if user feedback signals routes with different lodging conventions need different defaults.

## Risks

- **Risk:** Tobler-derived hiking function is more conservative for mountain stages than real pilgrim pace (which depends on terrain type beyond gradient — gravel vs root-bound trail vs paved). Compounded by the v1 decision to ignore descents (no downhill speedup credit), a stage with 800m gain + 1500m loss is modeled identically to one with 800m gain + 0m loss — both biased pessimistic. *Mitigation:* Document the modeling assumption + descent-omission in a footnote on each page; custom min/km override available as escape hatch. Pre-validate with two real-pilgrim datapoints during launch smoke (one mountain, one flat) to confirm the bias is bounded.
- **Risk:** Per-route SEO pages compete with each other or with existing `/walk` pages for the same queries. *Mitigation:* Distinct title/description structure ("Daylight for ..." vs "Walking ..."); reciprocal linking signals intent to search engines.
- **Risk:** Module-scope creep — building `daylight-math.js` invites bolting unrelated math (tide phases, phenology curves) into the same file as future almanac entries land. *Mitigation:* Keep `daylight-math.js` daylight-only; each new instrument (entry #3, #4, …) gets its own math module. The shared "substrate" the almanac series leans on is **input shape** (route + stage + date + coord), **URL-param convention**, and **visual grammar** (dial / horizontal bar) — not a shared JS module. Discipline documented in *Out-of-band notes* below.
- **Risk:** Build-time bake step (`scripts/bake-daylight-routes`) becomes stale if `open-pilgrimages` updates and bake isn't re-run. *Mitigation:* Document the bake step in `README.md`; the build-time IANA tz lookup also fails loud if a stage coordinate yields no zone, surfacing data drift early.
- **Risk:** IANA tz database in the bake script becomes stale (e.g., new tz rules). *Mitigation:* `Intl.DateTimeFormat` in the browser is the formatting layer; baked tz strings are stable identifiers ("Europe/Madrid"), not rule snapshots. Browser engines update tz rules independently.

## Out-of-band notes for future entries

This spec deliberately keeps the math module scoped to daylight. The substrate value the dream surfaced (one engine, many instruments) lives at a higher layer: shared input shape (`route + stage + date + coord`), shared rendering grammar (dial / horizontal bar), shared URL-param convention. Future tide-clock or bloom-almanac entries should reuse those conventions but ship their own math module. Document this discipline in a follow-up ADR if the second instrument confirms the pattern works.

## Verification plan

1. After implementation, walk through **all 21 acceptance criteria** one-to-one against the numbered list. Each AC has a single checkable state.
2. Run `js/sunpath-math.test.js` (covers the extended `sunriseUTC` / `sunsetUTC` + existing `daylightHours`) and `js/daylight-math.test.js` (covers `walkingMinutes` / Tobler). Both must pass.
3. Manual smoke: load `/daylight/shikoku-88/?date=2026-10-15&stage=11&pace=standard&start=07:00&mode=forward`, sanity-check arrival output against an **author-side** reference (NOAA solar calculator, web). One-time author check; the test suite uses baked fixtures, not live calls.
4. Lighthouse mobile audit on the hub page + at least one per-route page. Confirm AC #9 thresholds.
5. Inspect compiled HTML + DevTools Network tab for stray third-party hosts. Confirm AC #10.
6. Confirm AC #14: grep `js/daylight.js` for `navigator.geolocation` (must appear exactly once, inside the explicit-tap handler) AND manually load each entry point with browser permission state reset, verifying no permission prompt fires on initial render.
