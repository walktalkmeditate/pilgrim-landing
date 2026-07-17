# Spec: Collective Trail — the daily pilgrimage

**Status:** draft v2 — doc-review round 1 applied (completeness / implementability / consistency lenses + code/data verification). Q-A/Q-B resolved (see "Resolved since draft"). Ready for re-review.
**Date:** 2026-07-17
**Origin:** conversation 2026-07-17, reframed from "randomize the walked count" → "a daily-rotating **real** pilgrimage route with the collective's **real** distance mapped onto it." Sits alongside the almanac lineage ([`/sunpath`](../../sunpath/), [`/moonpath`](../../moonpath/), [`/daylight`](../../daylight/)) and reuses their established pattern: a build-time bake script over the sibling `../open-pilgrimages` dataset → static JSON asset → vanilla-JS render.

## Problem

**Problem:** The "Collective Trail" (homepage §10 + `/now`) maps the collective's cumulative walking distance onto **one hardcoded route** ("Together, the Via Francigena walked N times"), and it sits on that route for months because the milestone is deterministic and the distance grows slowly (~6 km/day). It reads as frozen, it hides how many real pilgrimages exist, and its route/distance tables are **hardcoded in three places that disagree** with each other and with the real dataset sitting one directory over.

**Who feels it:** Visitors to `pilgrimapp.org` and `/now` — the quiet audience the site is built for. And the maintainer, who has three drifting route tables to keep in sync by hand.

**When:** Every page load. The homepage trail is one-shot (never re-fetches); `/now` polls every 30 s but the *route* never moves, so both feel static.

**Today's workaround:** None. The line is edited by hand when someone notices it's stale; the km thresholds are invented numbers, not real route lengths.

**Cost of doing nothing:** A centerpiece "we walk together" moment feels dead. We forfeit the wonder in `open-pilgrimages` (7 real routes, real distances, real annual pilgrim counts, per-stage reflections) that is already ours, already open-licensed, and already consumed by `/daylight`. The three-table drift keeps compounding.

## Current state (verified during spec authoring)

- **Homepage trail** — `index.html` §10 ("The Collective Trail"), inline `<script>` at `index.html:1778`. Hardcoded `routes[]` (`index.html:1792`): Kumano 40 / Via Francigena 100 / Camino 800 / Shikoku 1200 / Te Araroa 3000 / Appalachian 3500 / the Moon 384400. Renders an **abstract SVG squiggle** ("trail-svg"), not a map. `drawTrail` plots a **labeled marker per route** from that table (`index.html:1850–1868`). **One-shot** `fetch('https://walk.pilgrimapp.org/api/now')` (`index.html:1992`) — no polling.
- **`/now`** — `now.html`, inline `<script>` at `now.html:79`. A *different* hardcoded `PILGRIMAGES[]` (`now.html:81`): Kumano 70 / St. Olav 643 / Camino 800 / Shikoku 1200 / Via Francigena 1900 / Appalachian 3525 / PCT 4265. **Polls every 30 s** (`now.html:190`). The rotating lines render into `#cumulative-line` + `#milestone-line` inside `<section class="cumulative">` (`now.html:68–71`) — which is **outside** the page's only `aria-live="polite"` region (that wraps `<section class="active">`, `now.html:55`).
- **API** — `GET https://walk.pilgrimapp.org/api/now` returns `{ total_walks, total_distance_km, total_meditation_min, last_walk_at, streak_days, completions_last_hour, estimated_active }`. Live-verified: `total_distance_km ≈ 694.5`, `streak_days 122`, `Cache-Control: public, max-age=30`, `Access-Control-Allow-Origin: *`. Both pages already read `total_distance_km` (`index.html:1903`, `now.html:179`) as `data.total_distance_km || 0` (i.e. a failed/empty fetch yields `0`). **`total_distance_km` is the only API input this feature needs.**
- **`/daylight` is a single page selecting routes by query param.** `daylight/` contains **only `index.html`** — there are **no** per-route directories. The page reads `location.search` and the daylight feature builds its own cross-links as `/daylight/?route=<id>` (`js/daylight.js:1070`), loading per-route data from `/assets/daylight/<id>.json` (`js/daylight.js:1142`). (An earlier daylight spec proposed per-route `/daylight/<slug>/` pages; they were never built.) Any link to `/daylight/<id>/` would 404 on the static host.
- **`open-pilgrimages`** — 7 routes (`camino-frances`, `camino-ingles`, `camino-norte`, `camino-portugues`, `camino-primitivo`, `kumano-kodo`, `shikoku-88`), `schemaVersion: 1.0.0`, ODbL-1.0 data. Verified field paths (present in **all 7**): `overview.distanceKm` (Kumano **39**, Camino Francés **764**), `overview.bestMonths` + `overview.peakMonths` (arrays of **1-based** month ints, e.g. Kumano `[3,4,5,10,11]`), `overview.countries`, `tradition` (an **object**: `tradition.type`, `tradition.primaryFaith`), `stages[].interior.reflection` + `interior.theme` (**localized objects**, e.g. `{ "en": "What did you leave behind at the gate?" }` — every stage has one; per-route reflection counts: frances 33, ingles 6, norte 34, portugues 11, primitivo 11, kumano 4, shikoku 10), `stats.annualPilgrims.latest {count, year, note}`, `stats.dataNote`, `stats.seasonalDistribution` (array of `{ season, months, intensity, note }`).
- **Existing bake precedent** — `scripts/bake-daylight-routes` (idempotent, fail-loud, zero deps) iterates a **hardcoded `ROUTE_IDS` array** and reads each route's files directly under `../open-pilgrimages/routes/<id>/`; it does **not** read `index.json` and writes **no** HTML. Tests run by direct `node <file>` invocation (no `test` script in `package.json`); modules use UMD-style `typeof module !== 'undefined'` export (`js/sunpath-math.js:939`). This feature mirrors that **contract**, not the daylight code line-for-line.

## Decisions locked during spec authoring

- **D1 — Real number, rotating lens.** The count is **never fabricated**. For a chosen route of length `km`, `times = total_distance_km / km` (live from `/api/now`). Rotating *which route* we measure against keeps every statement true; it is a different window on the same real distance.
- **D2 — Single source of truth via bake script.** New `scripts/bake-collective-routes` reads the sibling checkout `../open-pilgrimages/routes/<id>/` for each id in a **hardcoded `ROUTE_IDS`** list (the 7 routes) and writes `assets/collective-routes.json`. Both `index.html` and `now.html` read that one asset through a shared module; the two divergent inline tables are deleted. "Updates when `open-pilgrimages` updates" = re-run the bake. **It mirrors `bake-daylight-routes`'s fail-loud + idempotent contract** (not its exact reads): exit non-zero with `bake-collective-routes: missing or invalid <path> — <reason>` when the sibling repo is absent, a required file is missing/invalid, or `schemaVersion ≠ 1.0.0`; **idempotent** (no timestamp in output; re-running yields byte-identical files, `git diff --exit-code assets/collective-routes.json`).
- **D3 — Rotation cadence is daily, deterministic by UTC date; route selection is independent of distance.** The selected route is a pure function of `(UTC date, UTC month)` — **not** of `total_distance_km`. It changes **at most once per UTC day** and is identical for every visitor that day (shareable: "today the collective walks toward the Kumano Kodo"). `total_distance_km` drives only the numbers/phrasing, so the 30 s poll updates the *figures* under a *stable* route. This is the fix for "not updating": the numbers were always live, the *route* was frozen, and now it turns once a day.
- **D4 — Rotation pool = 7 dataset routes + 3 cosmic horizons.** Horizons are hardcoded in the bake script (`kind: "cosmic"`), each carrying a `preposition` + `body` so phrasing composes cleanly (see D5): **around · the Earth** (40,075 km, circumference), **to · the Moon** (384,400 km), **to · the Sun** (149,600,000 km, one astronomical unit). The triad reads as an expanding arc — circle home, journey to the Moon, reach for the Sun. At 694.5 km every horizon is distant (Earth ≈ 1.7 %, Moon ≈ 0.18 %, Sun ≈ 0.0005 %), so all three always render in the "toward" branch and act as the permanent forward horizon once real routes are surpassed.
- **D5 — Phrasing: two entry kinds, exact templates, no ungrammatical output.** `phase` is `"reached"` (`times ≥ 1`) or `"toward"` (`times < 1`). `PERCENT_FLOOR = 1.0`.
  - **Pilgrimage (route), reached:** `floor(times) ≥ 2` → "Together, we've walked the {nameEn} {floor(times)} times." `floor(times) === 1` → "Together, one {nameEn} complete." (mirrors the current code's `>= 2` guard at `index.html:1808`, avoiding "1 times").
  - **Pilgrimage, toward:** "We are {round(times×100)}% of the way to one {nameEn}." (whole-percent; the shortest sub-1 route still reads ≥ 1 %).
  - **Cosmic, toward (always):** if `times×100 ≥ PERCENT_FLOOR` → "We are {(times×100).toFixed(1)}% of the way {preposition} {body}." (one decimal, so Earth reads "1.7%", not a rounded "2%"). Else → "{round(km_to_go).toLocaleString()} km {preposition} {body}." Examples: Earth → "We are 1.7% of the way around the Earth."; Moon → "383,706 km to the Moon."; Sun → "149,599,306 km to the Sun."
  - **Cold start:** when `total_distance_km ≤ 0` (or the fetch failed and fell back to 0), render the current gentle copy "The path is beginning." — never "0% of the way…".
- **D6 — Season-aware selection (enhancement #1), fully specified.** Selection is deterministic and reproducible:
  - `month = utcDate.getUTCMonth() + 1` (1-based, matching `bestMonths`); `seed = Number("YYYYMMDD")` from the UTC date.
  - **Weights:** every entry starts at weight `1`; `+2` if `month ∈ bestMonths`; a further `+3` if `month ∈ peakMonths` (so a peak-month route = weight `6`, best-but-not-peak = `3`, off-season route = `1`). Cosmic entries have no months → constant weight `1`.
  - **Pick:** build `weightedList` by repeating each entry `weight` times in a **stable canonical order** (pilgrimages by `id` ascending, then horizons in Earth, Moon, Sun order); `index = seed % weightedList.length`; the chosen entry is `weightedList[index]`.
  - **Season clause (render):** when the chosen route is in season (`month ∈ bestMonths`), append "Its season is {seasonName} — and it is {seasonName} now." `seasonName` comes from an in-module **Northern-hemisphere** month→season map (`12,1,2 → winter; 3,4,5 → spring; 6,7,8 → summer; 9,10,11 → autumn`). All 7 current routes are Northern-hemisphere; a future Southern-hemisphere route (see Non-goals) needs a per-route hemisphere flag before its season clause is correct — until then its clause is suppressed (render only when the map's month bucket matches the route's hemisphere, defaulting N).
- **D7 — Daily texture (enhancement #2) from the dataset, not invented.** The bake extracts `interior.reflection.en` (and `.theme.en`) from each stage into `reflections[]`. When the chosen route has reflections, render one — index `seed % reflections.length` — as an italic contemplative line, e.g. *"What did you leave behind at the gate?"* Omit if `reflections` is empty. Source is `open-pilgrimages` (authored by walk·talk·meditate, ODbL) — no third-party text.
- **D8 — `/daylight` cross-link (enhancement #3).** For the 7 dataset routes, render a quiet "find its light →" link to **`/daylight/?route=<id>`** (the scheme the daylight page itself uses, `js/daylight.js:1070`). Cosmic entries get no link.
- **D9 — Honest annual figure (enhancement #5), qualifier-mandatory.** When `stats.annualPilgrims.latest` exists, the bake stores `annual = { count, year, metricNote, source }` where `metricNote` is derived from `latest.note` / `dataNote`. Render `{count.toLocaleString()} {metricNote} ({year})`. The count is **never** rendered as a bare "N walked / N pilgrims": Kumano's number is *"foreign overnight visitors in the Hongu area,"* not walkers, and the render must carry that qualifier. Omit entirely when `annual` is null. v1 uses this automatic qualifier form; curated per-route sentences are a later upgrade.
- **D10 — Milestone crossings (enhancement #4): `/now`-only, per-visitor, fetch-guarded.** Crossings are a **`/now`-only** feature (the live, above-the-fold "what happened while you were away" page) — the homepage does **not** detect or display crossings, which avoids two writers on one key and avoids the homepage silently consuming a crossing into a below-the-fold section. A single key `pilgrim.collective.lastSeenKm` stores the previous visit's total. On `/now` load, **only after a fetch that returns a finite `total_distance_km > 0`**: any route whose `km ∈ (lastSeenKm, currentTotalKm]` renders once as "Since you were last here, together we completed the {nameEn}."; then `lastSeenKm` is set to `currentTotalKm`. First visit (no key) sets the baseline silently, shows nothing. On fetch failure / non-finite / `0`, render nothing and **leave the key untouched** (no baseline poisoning). Cosmic horizons are excluded from crossing detection (never completed).
- **D11 — No backend changes.** The feature runs entirely on the existing `/api/now` payload + the baked asset + `localStorage`. No API contract change.

## In scope

- `scripts/bake-collective-routes` — Node, zero deps, mirrors `bake-daylight-routes`'s fail-loud + idempotent contract. Iterates hardcoded `ROUTE_IDS` (the 7), reading `../open-pilgrimages/routes/<id>/{metadata.json, stages.json, stats.json}`. Writes `assets/collective-routes.json`:
  ```
  {
    "pilgrimages": [
      { "id", "nameEn",                 // metadata.name.en
        "km",                           // overview.distanceKm
        "bestMonths", "peakMonths",     // overview.* (1-based ints; may be [])
        "reflections": [ "…", … ],      // stages[].interior.reflection.en (may be [])
        "annual": { "count", "year", "metricNote", "source" } | null
      }, …                              // all 7 routes
    ],
    "horizons": [
      { "id": "around-earth", "preposition": "around", "body": "the Earth", "km": 40075,     "kind": "cosmic" },
      { "id": "to-the-moon",  "preposition": "to",     "body": "the Moon",  "km": 384400,    "kind": "cosmic" },
      { "id": "to-the-sun",   "preposition": "to",     "body": "the Sun",   "km": 149600000, "kind": "cosmic" }
    ]
  }
  ```
  (No `faith`/`countries` — nothing consumes them in v1.)
- `js/collective-routes.js` — one shared, pure, node-testable module. Signature `select(totalDistanceKm, utcDate, asset)`; it derives `month` internally as `utcDate.getUTCMonth()+1` and the seed from the UTC date. Returns a render model: `{ entry, times, phase: "reached"|"toward", label, seasonLine|null, reflection|null, daylightHref|null, annualLine|null }`. Selection (D3/D6) uses only `(utcDate, month)`; `totalDistanceKm` feeds only `times`/phrasing. Crossing detection is a separate `/now`-only function `crossingsSince(prevKm, totalKm, asset)` (D10). All selection/phrasing lives here — the single place the two pages call.
- `index.html` §10 and `now.html` rewired to consume `js/collective-routes.js`; both inline route tables removed. **Two-source load:** each page fetches `assets/collective-routes.json` **once** at load (cached), and keeps its existing `/api/now` cadence (homepage one-shot, `/now` 30 s poll). First render waits for the asset; if the asset loads but `/api/now` fails, render the cold-start copy (D5); if the asset fails to load, leave the existing static fallback text. The SVG-squiggle path is kept as-is; **`drawTrail`'s per-route markers are re-fed from the baked `pilgrimages`** (same visual behavior, new data source) so deleting the inline table doesn't strip the marker layer.
- `/now`: add `aria-live="polite"` to `<section class="cumulative">` so the rotating cumulative/milestone lines are announced (they currently sit outside any live region); reserve a `min-height` on the rotating-text container so daily swaps don't shift siblings.
- ODbL attribution: a quiet "route data: [open-pilgrimages](https://github.com/walktalkmeditate/open-pilgrimages) · ODbL" credit wherever dataset text/stats surface.
- Node tests for the bake (idempotency + fail-loud) and for `collective-routes.js` (selection determinism, both phrasing branches incl. `floor==1` and cold-start, cosmic template strings, season weighting, crossing interval incl. failed-fetch no-op, qualifier-mandatory annual line), following the `js/sunpath-math.test.js` harness — no new deps, run via `node js/collective-routes.test.js`.

## Non-goals

- **Mobile apps (iOS / Android).** Phase two, **separate spec, iOS-first**: Android's `PilgrimageProgress.kt` is pinned iOS-verbatim (`pilgrim-android/CLAUDE.md` parity target `pilgrim-ios main @ c1745e8`), so it mirrors iOS after the fact. iOS already carries an **approved-but-unbuilt** design (`pilgrim-ios/docs/superpowers/specs/2026-03-23-pilgrimage-route-packages-design.md`) this would extend. Out of scope here.
- **A geographic map or any map library.** No MapLibre/Mapbox, no tiles, no route GeoJSON on the web. The abstract SVG trail we already have *is* the visualization. (Confirmed with the requester.)
- **Random or fabricated numbers.** Per D1 the count is always the real `total_distance_km ÷ route length`.
- **Backend / `/api` changes.** Per D11.
- **New routes beyond the dataset's 7** (e.g. Appalachian Trail, PCT, Te Araroa, full Via Francigena). Additions flow **upstream into `open-pilgrimages`** (matches the daylight precedent), then in via the bake. No hardcoded "great trails" tier (resolved). **Note:** a future Southern-hemisphere route (e.g. Te Araroa) will render a wrong season clause under D6's Northern map until a per-route hemisphere flag is added — flagged, not solved here (its clause is suppressed meanwhile).
- **Curated per-route editorial epigraphs / annual sentences.** v1 uses the dataset's own `interior.reflection` (D7) and the automatic qualifier form (D9). Hand-written copy is a later upgrade.
- **Localization beyond English.** `name.en` / `interior.*.en` only, matching the daylight v1 rule.
- **A daily shareable OG image** (enhancement #6). Phase two; leverages the existing `render-og-now.html` pipeline.
- **Crossings on the homepage.** Per D10, the crossing moment is `/now`-only.
- **Badges, ranks, streak-as-competition, or notifications.** Off-brand (vanity numbers / growth loops), explicitly never.

## Acceptance criteria

1. [ ] `scripts/bake-collective-routes` run from repo root writes `assets/collective-routes.json` containing all **7** dataset routes under `pilgrimages` and the **3** cosmic entries under `horizons`, with the D-defined shape.
2. [ ] **Idempotent:** running the bake twice in succession produces byte-identical output (`git diff --exit-code assets/collective-routes.json` is clean). No timestamp in the file.
3. [ ] **Fail-loud on required fields:** with `../open-pilgrimages` absent, or a route missing `schemaVersion` / `id` / `name.en` / `overview.distanceKm`, the bake exits non-zero with a single-line `bake-collective-routes: missing or invalid <path> — <reason>`. (`bestMonths`, `peakMonths`, `reflections`, `annual` are **optional** — see AC #4.)
4. [ ] **Graceful optional fields:** unit test the module against a **synthetic sparse fixture** (no shipped route exercises this — all 7 have `bestMonths`/`peakMonths`/`reflections`/`stats`) whose entry lacks `bestMonths` (→ weight 1, never in-season, no season clause), `reflections: []` (→ no reflection line, no empty node), and `annual: null` (→ no annual line). Bake tolerates their absence.
5. [ ] **Selection is deterministic and distance-independent:** `js/collective-routes.js` returns the same chosen `entry` for the same `(utcDate)` regardless of `totalDistanceKm`; changing only `totalDistanceKm` changes the *numbers* but never the *route*. A fixed fixture (e.g. `utcDate = 2026-10-15`) asserts a **named** expected entry id, computed from the D6 weights + `seed % weightedList.length`.
6. [ ] **Phrasing branches** (tests assert the render-model/string, not a fragile substring):
   - `total=694.5`, Kumano (`km=39`, `times=17.8`) → "walked the Kumano Kodo 17 times" (`floor≥2`).
   - a route with `1 ≤ times < 2` → "one {nameEn} complete" (never "1 times").
   - Camino Francés (`km=764`, `times=0.909`) → toward branch, "We are 91% of the way to one Camino Francés" (whole percent).
   - Earth (`times=0.0173`) → "We are 1.7% of the way around the Earth" (one decimal; not "2%").
   - Moon (`times=0.00181`) → "383,706 km to the Moon"; Sun → "149,599,306 km to the Sun".
   - `total=0` → "The path is beginning."
   Assertion for the "times" form: `n = floor(times)`, `n ≥ 1`, `n===1` uses the "one … complete" copy.
7. [ ] **Season weighting** (D6): with `utcDate` in **2026-10-01 … 2026-10-30** (October ∈ Kumano's `bestMonths` and Camino peak season), on **≥ 60 %** of those 30 days the selected entry is a route whose `bestMonths` includes 10 (cosmic picks count as *not* in-season). Per-day selection reproduces exactly from the D6 formula. In-season selections render the "…and it is autumn now" clause; off-season selections omit it.
8. [ ] **Daily texture** (D7): when the chosen route has `reflections`, exactly one italic reflection renders, index `seed % reflections.length`; empty → nothing renders (no empty element, no layout shift). Reflection strings are the `.en` values (never `[object Object]`).
9. [ ] **`/daylight` link** (D8): each of the 7 dataset routes renders a link resolving to `/daylight/?route=<id>` (verified against `js/daylight.js:1070`'s scheme); cosmic entries render no link.
10. [ ] **Honest annual figure** (D9): the Kumano render, when its annual line shows, contains the substring **"overnight visitors"** (from the baked `metricNote`) and does **not** assert those people "walked" the route. Routes with `annual: null` show no annual line. (Assert against `metricNote`, not the place-name spelling — the data reads "Hongu", no macron.)
11. [ ] **Milestone crossing** (D10, `/now` only): with `localStorage['pilgrim.collective.lastSeenKm']` below a route length and a fetched finite `total > that length`, the "Since you were last here… completed the {nameEn}" line renders once and the key advances to `total`; with no key set, nothing renders and the baseline is written; with a **failed/`0`/non-finite** fetch, nothing renders **and the key is unchanged** (no poisoning). The homepage never runs this path. Interval logic `(lastSeen, current]` and the failed-fetch no-op are unit-tested.
12. [ ] **Tables unified:** after the change, `grep -nE "Via Francigena|Appalachian|Te Araroa|km: *[0-9]" index.html now.html` finds **no** hardcoded route/distance table in either page; both derive routes from `assets/collective-routes.json`, including `drawTrail`'s markers.
13. [ ] **Daily cadence** (D3): the chosen route is a pure function of the UTC date — it does not change across a 30 s `/now` poll within the same UTC day (asserted by calling `select` twice with the same `utcDate` and different `totalDistanceKm` and comparing `entry.id`). Live numbers still update per fetch.
14. [ ] **Brand network rule:** no new third-party host, script, or font is introduced; `assets/collective-routes.json` is same-origin; the bake and both pages use only vanilla JS / Node built-ins.
15. [ ] **Attribution:** an ODbL "route data: open-pilgrimages" credit is present where dataset text/stats surface.
16. [ ] **Accessibility / no layout shift:** `<section class="cumulative">` on `/now` carries `aria-live="polite"`, and the rotating-text container has a reserved `min-height` (or equivalent reserved space) so a daily route/text swap does not move sibling content. (Structural check — no runtime CLS metric gate.)

## Resolved since draft

- **Route pool (was Q-A): dataset only.** 7 dataset routes + 3 cosmic horizons; no hardcoded "great trails" tier. Appalachian / PCT / Te Araroa / full Via Francigena are added **upstream to `open-pilgrimages`** when wanted, then flow in via the bake.
- **Third horizon (was Q-B): to the Sun.** One astronomical unit, **149,600,000 km** — chosen over the Sun's circumference (~4.375M km) and Earth's orbit (~940M km), for the "to the Moon → to the Sun" parallel and the strongest final rung. See D4/D5.

## Open questions

- **Q-C (non-blocking): reflection vs. theme for texture.** D7 uses `interior.reflection.en` (the question form reads as contemplation). If the requester prefers the one-word `interior.theme.en` ("Entry", "Awakening") or a narrative fragment, it's a one-line change. Defaulting to `reflection`.

## Risks

- **Slow-moving distance.** ~6 km/day means crossings (D10) are rare and "toward" lines dominate for the long routes. *Mitigation:* daily rotation (D3) + season texture (D6/D7) carry the freshness even when numbers barely move; crossings are a garnish, not the engine.
- **Metric heterogeneity (D9).** Compostela certificates vs. Kumano overnight visitors vs. Shikoku completions are not comparable. *Mitigation:* qualifier-mandatory rendering (AC #10); never a bare count.
- **Dataset schema drift.** `open-pilgrimages` is `1.0.0`; a future minor may add fields. *Mitigation:* bake reads only stable fields, fails loud on required, tolerates missing optional (AC #3–4) — same posture as daylight.
- **ODbL obligation.** Surfacing dataset text/stats derives from an ODbL database. *Mitigation:* attribution credit (AC #15). Low risk (same org, `walktalkmeditate`), but documented.
- **Northern-hemisphere season assumption.** D6's month→season map is Northern. *Mitigation:* season clause suppressed for any future Southern-hemisphere route until a per-route hemisphere flag lands (noted in Non-goals).
- **Only 7 routes.** "How many pilgrimages exist" lands softer than dozens. *Mitigation:* it grows as the dataset grows — the entire reason for sourcing from it rather than hardcoding.

## Verification plan

Bake once → confirm AC #1–#3 (shape, idempotency via a second run + `git diff`, and a forced fail-loud). `node js/collective-routes.test.js` covers AC #5–#8, #11, #13 with fixtures. Manual browser pass on `index.html` + `/now` against the live `/api/now` for AC #9, #12, #14, #16 (DevTools: one asset fetch, no third-party hosts, `aria-live` present, no visible shift on a simulated date change).
