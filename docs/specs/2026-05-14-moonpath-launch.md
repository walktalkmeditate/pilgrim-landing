# /moonpath/ Launch Smoke — Slice 8

**Date:** 2026-05-14
**Branch:** moonpath
**Slice:** 8 — discoverability + sitemap + verify + launch

---

## Acceptance-gate results

| Gate | Status | Notes |
|---|---|---|
| `/sunpath/` sibling-link to `/moonpath/` added | PASS | In "Tomorrow vs today" section + footer |
| `/daylight/` sibling-link to `/moonpath/` added | PASS | Footer links area |
| `llms.txt` lists `/moonpath/` alongside `/sunpath/` + `/daylight/` | PASS | "Companion site" section updated |
| `sitemap.xml` adds `/moonpath/` (priority 0.9, lastmod 2026-05-14) | PASS | |
| `sitemap.xml` adds 2 full-moon ICS URLs | PASS | full-moons-2026.ics, full-moons-2027.ics |
| `sitemap.xml` adds one `<url>` per actual `moonpath/tides-*.ics` (D22) | PASS | 4 entries, derived from disk |
| Existing sitemap lastmods preserved | PASS | All pre-existing entries untouched |
| AC #18 — `test -f package.json && echo bad || echo ok` | PASS | Output: `ok` |
| All 5 test suites green | PASS | See below |

---

## Test-suite output summary

| Suite | Assertions | Result |
|---|---|---|
| sunpath-math | 82 passed, 0 failed | all green |
| daylight-math | 33 passed, 0 failed | all green |
| daylight-perf | — | all green |
| tide-math | 12 passed, 0 failed | all green |
| moonpath | 152 passed, 0 failed | all green |

No regressions across any suite.

---

## D22 sitemap ⊆ baked-files invariant

```
$ ls moonpath/*.ics | wc -l
6

$ ls moonpath/tides-*.ics | wc -l
4
```

Disk contents:
- `moonpath/full-moons-2026.ics`
- `moonpath/full-moons-2027.ics`
- `moonpath/tides-boston.ics`
- `moonpath/tides-honolulu.ics`
- `moonpath/tides-newlyn.ics`
- `moonpath/tides-san-francisco.ics`

Sitemap `moonpath/*` entries: 1 (hub) + 2 (full-moons) + 4 (tides) = 7 entries total.
Tides-* sitemap count (4) = tides-* disk count (4). Invariant holds.

---

## Deferred items (require human action)

### Lighthouse audit

Deferred to human — agent cannot run Chrome. Suggested command when running locally:

```
npx lighthouse https://pilgrimapp.org/moonpath/ --only-categories=performance,accessibility --output=html
```

Target: Performance ≥ 90, no third-party requests, no console errors.

### ICS import test

Deferred to human — requires a real calendar application.

Steps:
1. Download `https://pilgrimapp.org/moonpath/full-moons-2026.ics`
2. Open in Apple Calendar (or Google Calendar)
3. Confirm all full moon events land on correct dates
4. Repeat with `https://pilgrimapp.org/moonpath/tides-boston.ics` (or whichever tide port is nearest to you)
5. Confirm king-tide events appear with correct dates and VALARM reminder

### Browser smoke (light / dark / star themes)

Deferred to human — agent cannot run a browser.

Steps:
1. Open `/moonpath/` locally or on staging
2. Click the moon-phase toggle to cycle through light → dark → star themes
3. Verify layout, color palette, and SVG widgets render correctly in all three
4. Test with a coastal coord (e.g., Boston: 42.3601, -71.0589) to confirm tide section appears
5. Test with an inland coord (e.g., Denver: 39.7392, -104.9903) to confirm tide section hides + fallback line shows
6. Verify geolocation button fires only on explicit tap (AC #19)
7. Verify no console errors in DevTools

---

## D6 supermoon ban verification

```
$ grep -riE 'supermoon' moonpath/ js/moonpath*.js js/sunpath-math.js js/tide-math.js css/moonpath.css
(no output — ban holds)
```

---

## Cross-links added this slice

- `sunpath/index.html`: `/moonpath/` sibling-link in "Tomorrow vs today" section body, plus footer
- `daylight/index.html`: `/moonpath/` sibling-link in footer links row
- `llms.txt`: `/moonpath/` bullet in "Companion site" → "Current almanac entries" list
- `sitemap.xml`: 7 new `<url>` entries for moonpath hub + ICS assets
