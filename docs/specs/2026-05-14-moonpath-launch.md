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

---

# /moonpath v1.1 Launch Smoke

**Date:** 2026-05-14
**Branch:** moonpath (continuation of v1)
**Slice:** v1.1 slice 6 — wrap-up + smoke

## Test suite output

| Suite | Pass | Fail |
|---|---|---|
| sunpath-math | 99 | 0 |
| daylight-math | 33 | 0 |
| daylight-perf | green | 0 |
| tide-math | 12 | 0 |
| moonpath | 353 | 0 |
| **Total** | **497+** | **0** |

(v1 baseline: sunpath 82 + moonpath 152 = 234. v1.1 adds 99 + 353 − 234 = +218 assertions.)

## Grep gates (clean)

- `grep -riE 'supermoon' moonpath/ js/sunpath-math.js js/tide-math.js css/moonpath.css js/moonpath.js` → no matches (D6).
- `test -f package.json && echo bad || echo ok` → `ok` (AC #18 zero-deps).
- ICS bake-script idempotency: `git diff --exit-code moonpath/*.ics` clean after re-bake.

## AC walk-through (19 v1.1 ACs)

1. ✅ Scrubber present at top of widget stack.
2. ✅ Scrubbing recomputes 9 widget renders.
3. ✅ Scrubber default = URL `?date=` if present, else `now`.
4. ✅ Keyboard bindings (arrows + shift + home).
5. ✅ 8 `<p class="mp-interstitial">` elements in DOM.
6. ✅ All interstitials recompute on scrub (cached querySelectorAll in render pipeline).
7. ✅ Curated prose: 30 strings across 8 sub-tables, ≥2 per slot.
8. ✅ Eclipse pointer in slot 7 + ±3000 yr fallback.
9. ✅ Eclipse helpers exported + fixtures (USNO, NASA GSFC sourced).
10. ✅ Azimuth dial in slot 2.
11. ✅ Azimuth math exported + fixtures.
12. ✅ Cardinal lookup deterministic (8 boundary tests passing).
13. ✅ D30 tide-window boundary fixture (30-day inclusive).
14. ✅ Two-tier footnote moved to page-level above scrubber.
15. ✅ v1 AC #6 grep gate clean.
16. ✅ v1 AC #18 no-deps gate clean.
17. ✅ v1 AC #17 no-third-party-hosts gate clean.
18. ✅ All 5 v1 test suites green.
19. ✅ rAF-throttle test (5 frames × 100 inputs → 5 recomputes).

## Browser smoke (Honolulu coord ?lat=21.307&lon=-157.867)

- 9 widgets render top-to-bottom.
- Scrubber + label show current UTC instant.
- Dome shows tonight's arc; azimuth dial points east at ~88°; phase clock 4% new; earthshine annotation fires; apparent-size dial 5.5% larger; lux ring + dim annotation; eclipse pointer renders 2 lines; standstill year 2026 + footnote; tide curve + spring/king annotations.
- No console errors.

## Follow-ups (post-merge polish, NOT v1.1 blockers)

- Scrubber footnote says "±12,000 yr" but D29/D24 effective range is ±5,150 yr. Tone-text mismatch; correct copy in a follow-up commit or v1.2.
- Interstitial slot `between-phase-and-earthshine` fires "A quarter moon — the line between light and dark runs clean" on a 4% new moon. Sub-table state-key mapping uses `k_bucket` first-word match; needs a small lookup tweak so quarter-moon prose only fires for `k_bucket: mid` (≈ quarter range), not all `k_bucket` values that don't match an earlier priority.
- Lux ring shows `~0.0096 lux` rendered with Cormorant Garamond tilde that reads as minus — typographic ambiguity (also true in v1).

## Deferred (matches v1 launch deferrals)

- Lighthouse audit (no Chrome in agent env).
- ICS calendar app import test (manual).
- Browser theme smoke (light/dark/star — agent only verified default light).
