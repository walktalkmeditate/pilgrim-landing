# Launch smoke: Daylight Walk Budget — Slice 6

**Date:** 2026-05-12
**Slice:** 6 — per-route SEO pages + launch smoke
**Status:** Complete (automated checks passed; browser-dependent checks deferred to human)

## What was shipped

- `scripts/bake-daylight-routes` extended with HTML output pass
- `scripts/bake-daylight-routes-templates/route.html` — template ({{placeholder}} syntax)
- `daylight/<route>/index.html` × 7 — baked per-route SEO pages
- `sitemap.xml` — `/daylight/` + 7 per-route entries added
- `js/daylight.js` — asset fetch paths changed to root-relative; `data-default-route` fallback added

---

## AC verification

### AC #7 — Per-route HTML pages exist

All 7 routes written to `daylight/<route>/index.html`:

| Route | Path | Stages | Distance |
|---|---|---|---|
| shikoku-88 | `daylight/shikoku-88/index.html` | 10 | 1200 km |
| kumano-kodo | `daylight/kumano-kodo/index.html` | 4 | 39 km |
| camino-frances | `daylight/camino-frances/index.html` | 33 | 764 km |
| camino-ingles | `daylight/camino-ingles/index.html` | 6 | 112 km |
| camino-norte | `daylight/camino-norte/index.html` | 34 | 784 km |
| camino-portugues | `daylight/camino-portugues/index.html` | 11 | 243 km |
| camino-primitivo | `daylight/camino-primitivo/index.html` | 11 | 263 km |

### AC #8 — Unique title, description, and OG tags with route name + distance + "daylight"

Verified by bake script grep-assert (runs after every write). Each page has:
- `<title>Daylight on the <Route Name> — Pilgrim</title>`
- `<meta name="description" content="Daylight walk budgets for the <Route Name> — <X> km, <N> stages. ...">` 
- `<meta property="og:title" content="Daylight on the <Route Name>">`
- `<meta property="og:description" content="<X> km · <N> stages · daylight walk budgets">`

The word "daylight" appears 68 times per page (verified by grep count).

### AC #9 — Reciprocal links

Each per-route page links to:
- `/sunpath/` — present in footer
- `/daylight/` — present in footer as "All routes"
- `/walk-<route>.html` — **no walk pages exist at repo root; walk-link block is empty string for all 7 routes** (see reciprocal-link inventory below)

### AC #10 — Sitemap updated

`sitemap.xml` now includes:
- `https://pilgrimapp.org/daylight/`
- `https://pilgrimapp.org/daylight/shikoku-88/`
- `https://pilgrimapp.org/daylight/kumano-kodo/`
- `https://pilgrimapp.org/daylight/camino-frances/`
- `https://pilgrimapp.org/daylight/camino-ingles/`
- `https://pilgrimapp.org/daylight/camino-norte/`
- `https://pilgrimapp.org/daylight/camino-portugues/`
- `https://pilgrimapp.org/daylight/camino-primitivo/`

### AC #12 — Bake script idempotency (HTML half)

`git diff --exit-code daylight/*/index.html` after double-run: **exit code 0 (clean)**.

---

## Reciprocal-link inventory

For each per-route page, check for `walk-<route>.html` at repo root:

| Route | walk-*.html exists? | Walk link included? |
|---|---|---|
| shikoku-88 | No | No |
| kumano-kodo | No | No |
| camino-frances | No | No |
| camino-ingles | No | No |
| camino-norte | No | No |
| camino-portugues | No | No |
| camino-primitivo | No | No |

No `walk-<route>.html` files exist at repo root. Walk-link blocks are empty string for all 7 pages. The bake script will auto-include walk links when those pages are created in a future pass.

---

## AC #16 — localStorage keys

Observed in `js/daylight.js` (automated grep):

- `pilgrim.prefs.unitSystem` — set/read by unit preference radios (values: `'km'` | `'mi'`)
- `pilgrim.prefs.clockFormat` — set/read by clock format preference radios (values: `'24h'` | `'12h'`)

Namespace is `pilgrim.prefs.*` — correct and consistent.

Functional validation (does the UI round-trip correctly?) — **deferred to human browser test**.

---

## AC #17 — Date input native picker

`daylight/index.html` line 117: `<input class="daylight-input" type="date" id="dl-date" aria-label="Walk date">`

`daylight/shikoku-88/index.html` line 117: same.

`type="date"` is present, delegating to the native browser date picker. No custom date-picker JS. Visual confirmation — **deferred to human browser test**.

---

## AC #18 — elevGain placeholder text (meters)

`daylight/index.html` line 110:
```
placeholder="Elevation gain (m, optional)"
```

Units are clearly in metres. Fix is present. Same placeholder used in all 7 per-route pages (shared template).

---

## Lighthouse mobile audit (AC per spec)

**Deferred to human.** This agent environment has no browser. A human should:

1. Serve the site locally (e.g., `npx serve .` or `python3 -m http.server`)
2. Open Chrome DevTools → Lighthouse → Mobile
3. Run audits on `/daylight/` and `/daylight/shikoku-88/`
4. Record scores for Performance, Accessibility, Best Practices, SEO

Expected targets (per spec): Performance ≥ 90, no third-party requests (other than Google Fonts and walktalkmeditate.org analytics, which are pre-existing), no console errors.

---

## Third-party host grep

Command run:
```
grep -rn "googletagmanager|doubleclick|facebook.net" \
  daylight/ assets/daylight/ js/daylight*.js css/daylight.css
```

Result: **CLEAN — no matches.**

Google Fonts and `analytics.walktalkmeditate.org` are present (pre-existing on the site, allowed per project ethos — see slice 3 review rationale).

---

## Stages prose (baked static content for crawlers)

Each per-route page contains a `<section class="daylight-stages-prose">` block visible without JS:

- **shikoku-88:** 10 stages from Ryōzen-ji to Shōzan-ji (Temples 1-12) to Konzō-ji to Ōkubo-ji (Temples 76-88), covering 1200 km of the Shikoku 88 Temple Pilgrimage.
- **kumano-kodo:** 4 stages from Takijiri-oji to Takahara to Hosshinmon-oji to Kumano Hongu Taisha, covering 39 km of the Kumano Kodo.
- **camino-frances:** 33 stages from Saint-Jean-Pied-de-Port to Roncesvalles to O Pedrouzo to Santiago de Compostela, covering 764 km of the Camino de Santiago (Frances).
- **camino-ingles:** 6 stages from Ferrol to Neda to Sigüeiro to Santiago de Compostela, covering 112 km of the Camino Inglés (English Way).
- **camino-norte:** 34 stages from Irún to San Sebastián to Sobrado dos Monxes to Arzúa (joins Camino Francés), covering 784 km of the Camino del Norte (Northern Way).
- **camino-portugues:** 11 stages from Porto to Vairão to Padrón to Santiago de Compostela, covering 243 km of the Camino Portugués (Central).
- **camino-primitivo:** 11 stages from Oviedo to Grado to San Romao da Retorta to Melide, covering 263 km of the Camino Primitivo (Original Way).

---

## Test suite results

All 3 test suites pass (exit code 0):

- `node js/sunpath-math.test.js` — 36 passed, 0 failed
- `node js/daylight-math.test.js` — 11 passed, 0 failed
- `node js/daylight-perf.test.js` — median 0.004 ms (threshold ≤ 0.5 ms), p99 0.061 ms (threshold ≤ 5.0 ms)
