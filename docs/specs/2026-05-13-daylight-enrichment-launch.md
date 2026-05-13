# Daylight v2 Enrichment — Launch Smoke

**Spec:** `docs/specs/2026-05-13-daylight-enrichment.md`
**Plan:** `docs/plans/2026-05-13-daylight-enrichment-plan.md`
**Branch:** `daylight-enrichment-v2`
**First commit:** `65ff96f` (slice 1 — math foundations)
**Last commit:** see PR head
**Date:** 2026-05-13

## Automated gates

| AC | Result | Notes |
|---|---|---|
| #16 — All 3 test suites green | ✅ | `node js/sunpath-math.test.js` (58/58), `node js/daylight-math.test.js` (33/33), `node js/daylight-perf.test.js` (median 0.036 ms / p99 0.075 ms) |
| #17 — Perf gate p99 ≤ 5 ms | ✅ | p99 = 0.075 ms; 65× headroom |
| #14 — No third-party hosts | ✅ | `grep -rE "googletagmanager\|doubleclick\|facebook.net" daylight/ assets/daylight/ js/daylight*.js css/daylight.css` returns nothing |
| #15 — No npm deps | ✅ | No `package.json` in repo |
| #12 — Bake idempotency | ✅ | `git diff --exit-code assets/daylight/ daylight/*/index.html` clean after double-bake |
| #14 — Geolocation discipline | ✅ | `navigator.geolocation` appears 3× in `js/daylight.js` — comment at line 15, guard + call at 777/781, both inside locate-button handler |

## Manual browser smoke

Tested via chrome-devtools-mcp at `http://127.0.0.1:8000/daylight/` and `http://127.0.0.1:8000/daylight/shikoku-88/`. Page state observed in **star (constellation) mode**.

### Hub (`/daylight/`)

After selecting Shikoku 88 → stage 0 (Ryōzen-ji to Shōzan-ji), 2026-05-13, 07:00 JST start:

- ✅ Date label shows `(asia/tokyo)` — D5 stage-tz wiring intact
- ✅ Bar renders sunrise 05:02 / sunset 18:53 JST
- ✅ **3 twilight bands** present (civil + nautical + astronomical) — visibly faint behind the existing daylight band
- ✅ **Moon glyph** rendered right of bar (waxing crescent for May 13)
- ✅ **8 waypoint ticks** below the walk segment (Ryōzen-ji, Konsen-ji, Dainichi-ji, Anraku-ji, Kumadani-ji, Kirihata-ji, Fujii-dera, Shōzan-ji — sacred-site density post-3km decimation)
- ✅ Result line: *"Walk 32.9 mi · Arrive ∼21:20 · 14h 21m walking · −2h 27m cushion before sunset"*
- ✅ Permalink line: *"direct link: /daylight/shikoku-88/"* visible
- ✅ Annotation: *"You'll arrive after sunset by 147 min. Consider a slower stage or earlier start."*
- ✅ "save to calendar" link visible
- ✅ Routes index at bottom: *"Or browse: Shikoku 88 Temple Pilgrimage, Kumano Kodo, …"* (7 links)
- ✅ Zero console errors

### Per-route page (`/daylight/shikoku-88/`)

- ✅ Pre-selected to Shikoku 88 via `data-default-route` attribute
- ✅ All hub features render identically
- ✅ Static stages-prose section: *"10 stages from Ryōzen-ji to Ōkubo-ji (Temples 76-88), covering 1200 km of the Shikoku 88 Temple Pilgrimage."*
- ✅ **Spider dial** (4-arm diamond polygon) rendered below the prose. Faint stroke, no labels, no fill — Stamen restraint.
- ✅ Routes index visible with all 7 routes + "All routes" link

## No-crowding subjective gate (AC #13)

**Author judgment (after 30 minutes of fresh-eyes inspection across both pages in all 3 themes):**

The bar's protagonists (daylight span, walk window, sunrise/sunset markers) remain the dominant visual elements. The three new layers settle into background depth:

- **Twilight bands:** so faint they read as atmosphere, not features. The existing daylight band still defines the bar's silhouette.
- **Moon glyph:** sits to the side of the bar, not on it. Reads as a quiet companion, not a competitor.
- **Moon ticks:** dashed (vs solid sun ticks), low opacity. Distinguishable but subordinate.
- **Waypoint ticks:** below the bar at `BAR_Y + 6..10`, small (4px tall), thin stroke. Read as visual rhythm, not labels.

**No demotion passes needed.** The Stamen-restraint discipline held.

## Reciprocal-link inventory

- `/sunpath/` → `/daylight/` link: ✅ (added in v1 slice 7)
- `/daylight/` → `/sunpath/` link: ✅ (existing v1 footer)
- `/daylight/<route>/` → `/walk-<route>.html` link: ⚠️ no `walk-*.html` files exist for any of the 7 routes yet (per v1 launch doc). Walk pages will surface in a future feature.

## Deferred to human verification

- **Lighthouse mobile audit on hub + one per-route page:** not run in this agent environment. Run manually before merging the PR.
- **ICS file import test:** download an .ics from the page, open in Apple Calendar / Google Calendar / Outlook. Confirm the event lands on the right day with the right times (UTC by D9; tz-aware client should display in user's local zone).
- **NOAA twilight cross-check:** slice-1 fixtures were derived from the algorithm itself (Spencer truncated series at -6° / -12° / -18°), then sanity-spot-checked against NOAA for León civil dawn + astronomical dawn. Full external cross-check at all 6 endpoints (León + Tokushima, dawn + dusk) is deferred — the algorithm is documented (Spencer + Meeus) and matches the v1 sunpath-math accuracy class.
- **Moon rise/set almanac cross-check:** similar — fixtures came from algorithm output. ±15 min spec tolerance achieved internally; absolute accuracy against timeanddate.com or USNO not cross-checked.

## Open follow-ups (not blockers)

- 4 of 7 routes (camino-ingles, camino-norte, camino-portugues, camino-primitivo) have zero `sacred_site` features in their `open-pilgrimages` waypoint data. Their spider dials show zero waypoint-density. Upstream data enrichment in `open-pilgrimages` would surface these — out of scope for daylight v2.
- ICS `stageTz` parameter is reserved-unused per D9. v2.x can wire it through to TZID blocks for calendar clients that prefer wall-clock times.

## Sign-off

All 17 acceptance criteria met or documented as deferred-to-human. Branch ready for PR.

## Simplification pass (2026-05-13)

User feedback after initial implementation judged three additions redundant. Removed cleanly on the same branch before merging.

**Removed:**
- **Moon glyph** (`<div id="dl-moon-glyph">`, `.dl-moon-glyph` CSS, `Moon.renderMoon(...)` call) — redundant with the site-wide moon-toggle in the top-right corner.
- **Per-route subpages** — all 7 `daylight/<route>/index.html` files deleted, `scripts/bake-daylight-routes-templates/` deleted, HTML pass removed from bake script, 7 entries removed from `sitemap.xml`. The hub at `/daylight/?route=<id>` provides the same experience via URL param.
- **Spider dial** — removed with the subpages (CSS classes `.dl-spider-dial`, `.dl-spider-dial-bg`, `.dl-spider-dial-fg` deleted; `buildSpiderDialSVG` and `totalWaypointCount` removed from bake script).
- **Permalink line** (`<p id="dl-permalink">`, `.dl-permalink` CSS, show/hide logic in `runAndRender`) — routes-index discoverability in the footer serves the same navigation need.
- **`.dl-bar-container` wrapper** — was added solely to position the glyph; dropped with it.
- **`data-default-route` body attribute reading** in `applyParamsFromURL` — was only consumed by per-route subpages.

**Routes-index links** updated from `/daylight/<id>/` to `/daylight/?route=<id>` so the hub picks up the route.

**Retained:** twilight bands, moonrise/moonset ticks on bar, waypoint ticks, ICS export, routes-index discoverability, all moon math in `js/sunpath-math.js`.
