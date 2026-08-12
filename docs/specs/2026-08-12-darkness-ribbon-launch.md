# Darkness Ribbon — Launch Smoke

**Spec:** `docs/specs/2026-08-12-darkness-ribbon.md`
**Plan:** `docs/plans/2026-08-12-darkness-ribbon-plan.md`
**Branch:** `feat/darkness-ribbon`
**Covers:** Slices 8 (themes and contrast) and 9 (no-crowding pass) — the last implementation wave. Slices 1–7 (band math, geometry, summary sentence, route wiring, unit guard) landed in earlier commits on this branch; this note does not re-verify them.
**Date:** 2026-08-12

## Automated gates

| Suite | Result |
|---|---|
| `node js/daylight-math.test.js` | 143/143 |
| `node js/daylight-render.test.js` | 127/127 |
| `node js/muted-contrast.test.js` | 6/6 (was 5 before Slice 8; the new block covers the ribbon) |
| `node js/moon-lux.test.js`, `moonpath.test.js`, `sunpath-math.test.js` | 20/20, 362/362, 111/111 — regression, untouched by this wave |
| `.githooks/pre-commit` (`build-permalinks --check`, `validate-metadata.mjs`) | both pass |
| `grep -rn "assets/darkness" js/ daylight/ css/` (outside tests) | exactly `js/daylight.js:1611` (`loadDarknessData`'s XHR) — nothing more |

## Slice 8 — contrast table (AC #12)

Two real traps were named going in: a `body.constellation` override that restates `fill` but not `fill-opacity` (they multiply); and `--stone`, which tops out at 3.95:1 on `/daylight`'s static light parchment regardless of opacity — not an AA colour at any alpha. Both were checked directly, not assumed.

`.dl-ribbon-caption` and `.dl-ribbon-summary` had exactly the second trap: `color: var(--stone)` measured **3.954:1** in light mode (confirmed by temporarily reverting the fix and watching `muted-contrast.test.js` fail with that exact number, then restoring it — the regression test was itself regression-tested). Fixed by switching both to `--ink-fog`, the site's existing muted-text token built for this. `.dl-ribbon-label` already used the `--ink` + `fill-opacity` pattern from `.dl-bar-label` and its constellation override already restated `fill-opacity: 1`, so it had neither trap — confirmed, not assumed, by adding it to the sweep rather than eyeballing the CSS.

All figures below are computed with the exact WCAG relative-luminance formula `js/muted-contrast.test.js` implements, against `/daylight`'s real static tokens (this page does not load `js/seasonal.js`). AA small-text threshold: 4.5:1.

| Class | Light (vs `#F5F0E8`) | Constellation (vs `#0a0a12`, true bg) |
|---|---|---|
| `.dl-ribbon-caption` | `--ink-fog` `#5E5953` @ 1.0 → **6.110:1** PASS | `rgba(232,224,255,.55)` → **5.161:1** PASS |
| `.dl-ribbon-summary` | same token → **6.110:1** PASS | same rule → **5.161:1** PASS |
| `.dl-ribbon-label` (both end-distance labels) | `--ink` `#2C241E` @ fill-opacity .75 → **6.258:1** PASS | `rgba(232,224,255,.55)`, fill-opacity `1` restated → **5.161:1** PASS |

`muted-contrast.test.js` itself asserts the constellation rule against `STATIC_PARCHMENT.dark` (`#1C1914`), not the true `#0a0a12` — the same proxy it already used for `.dl-bar-label` etc. `#1C1914` is *lighter* than the real `#0a0a12` (10,10,18 vs 28,25,20 in RGB), so for a light foreground on a dark background this proxy is the stricter case (4.972:1 vs the true bg's 5.161:1) — passing it is the safer of the two claims, not a looser one.

### Band fills — distinguishability, not AA (D11; not text, so AC #12 doesn't gate these, but reported as asked)

| | band-0 | band-1 | band-2 | band-3 | band-4 | adjacent min | full span (0↔4) |
|---|---|---|---|---|---|---|---|
| light vs `#F5F0E8` | 1.191:1 | 1.160:1 | 1.126:1 | 1.087:1 | 1.067:1 | 1.019:1 | 1.116:1 |
| constellation vs `#0a0a12` | 2.632:1 | 2.074:1 | 1.636:1 | 1.322:1 | 1.134:1 | 1.166:1 | 2.322:1 |

WCAG contrast is luminance-only and blind to hue. Light mode's bands are differentiated primarily by hue (warm stone → cool blue-grey, D8) with opacity as the secondary, colour-blind-safe channel (D11); constellation mode holds one hue (lavender, matching the site's star-mode vocabulary elsewhere) and carries all the separation on opacity alone. So this table is the honest number for "what a reader who cannot use the hue channel gets," not for what a normal-vision reader sees — and by that number, light mode's lightness-only fallback is thin (adjacent bands ~1.02–1.04:1). Real-browser inspection (below) confirms it: visible but genuinely subtle in light mode, clearer in constellation and plain-dark. This isn't a slice-8 regression — D10's summary sentence is the actual authoritative statement of composition, built specifically because the spec expects the ribbon's visual alone can't state it precisely — but it's worth naming rather than letting the AA pass stand in for "looks fine."

## Slice 9 — no-crowding pass (AC #11), 2026-08-12

**Author judgment, after direct inspection of the live page in a real browser** — chrome-devtools MCP driving headless Chrome against a local `python3 -m http.server 8000` (not just reading the source and confirming the mechanisms exist). Checked: camino-primitivo (solid, multi-band), kumano-kodo (dashed, single-band), shikoku-88 (dashed, coarse-windowed), camino-frances (solid, multi-band); light, plain-dark, and constellation themes; 1280px and 375px viewports; preferences panel expanded to surface the densest realistic state. ~15 route/theme/viewport combinations, zero console errors on any of them.

- **The walk-budget result stays the protagonist.** In every configuration, "Walk 13.2 mi · Arrive ∼12:40 · 5h 41m walking · 8h 36m cushion before sunset" (or equivalent) is the only non-italic, larger-serif line on the page. Everything else — picker labels, annotations, the ribbon's caption and summary — is smaller and italic. Matches the May enrichment doc's finding for the bar alone; holds with the ribbon added beneath it.
- **The ribbon does not compete for attention — if anything it undersells itself.** At shipped size it's the quietest element on the page, quieter than the annotation lines above it (see the contrast findings above — same fact, restated as a visual judgment rather than a number).
- **Two-axis risk (D8), checked in practice.** Did not mistake the ribbon's distance axis for the bar's time axis at any point. Beyond the spec's three planned defences — separate `<svg>`; the "How dark this route gets, start to finish." caption in normal flow; no shared ticks (all confirmed: the accessibility tree shows "Walk-budget result" and "Darkness along the route" as sibling regions under `<main>`, not nested, and the bar's `aria-label` and the ribbon's are two independent sentences with zero shared vocabulary) — a fourth, unplanned mechanism does real work: the two instruments don't *look* alike. The bar reads as a dial (nested gradient bands, circular start/end markers, a highlighted terracotta walk segment, a dashed tick); the ribbon reads as a flat tiled swatch strip with no ticks at all. The shape difference alone would probably have been enough.
- **Mobile (375px).** No horizontal overflow (`document.body.scrollWidth === document.body.clientWidth`, checked directly, not eyeballed). End labels don't collide with the summary paragraph. Shikoku's longer "N of M sampled" sentence wraps cleanly across two lines.
- **Summary-sentence spot check.** camino-primitivo and camino-frances both reproduced the spec's own D10 worked examples verbatim off the live DOM (`"Mostly as it was (52%) and open dark (34%), with some countryside (8%) and edge of town (6%)."` and `"Mostly open dark (39%) and as it was (30%), with some countryside (21%) and edge of town (8%)."`), and Kumano's matched too (`"As it was, the whole way. Not checked against a ground reading here, the way the five Camino routes are."`) — not this pass's job to re-verify (that's AC #1/#9 in the automated suites), but a good sign nothing drifted between spec and shipped copy.

**Verdict: not crowded.** The page carries more now than it did before this branch, but the ribbon adds one quiet horizontal strip and two lines of small italic text below a result that was already the visual anchor — it doesn't change where a reader's eye lands first. No demotion pass on stroke-width or opacity was needed.

This is not a pass that found nothing: it found the light-mode band-separation thinness documented under Slice 8 above. That's named honestly rather than smoothed over — it just isn't a *crowding* finding (competing for attention), it's the opposite (competing for too little). I'm confident in "not crowded" specifically because the failure mode I went looking for — a reader's eye landing on the ribbon or the bar before the result, or confusing the two axes — didn't happen once across three routes, three themes, and two viewports, and the one real cost surfaced is a different, narrower thing than what this pass exists to catch.

## Sign-off

AC #11 and AC #12 met, recorded above. All automated suites green. Both pre-commit hooks pass. No change to `assets/darkness/` or `scripts/darkness/`. Ready to merge as the close of the darkness-ribbon implementation wave.
