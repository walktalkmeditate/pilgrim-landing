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
| `node js/muted-contrast.test.js` | 7/7 (was 5 before Slice 8, 6 after it; the 7th is the band-separation correction below) |
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

### Band fills — distinguishability, not AA (D11; not text, so AC #12 doesn't gate these)

**Correction, 2026-08-12.** This section originally reported the table below as "thin... but not a slice-8 regression." That was wrong. 1.02–1.04:1 adjacent-pair contrast in light mode is not thin, it's indistinguishable — the five bands rendered as a flat strip, and the honest description is a defect, not a legibility note. The framing here was corrected in place rather than left standing with a caveat bolted on; the original figures are kept below because they're the evidence the defect existed, not because they're still current.

**As shipped in Slice 8 (defective):**

| | band-0 | band-1 | band-2 | band-3 | band-4 | adjacent min | full span (0↔4) |
|---|---|---|---|---|---|---|---|
| light vs `#F5F0E8` | 1.191:1 | 1.160:1 | 1.126:1 | 1.087:1 | 1.067:1 | 1.019:1 | 1.116:1 |
| constellation vs `#0a0a12` | 2.632:1 | 2.074:1 | 1.636:1 | 1.322:1 | 1.134:1 | 1.166:1 | 2.322:1 |

WCAG contrast is luminance-only and blind to hue. Light mode's bands were differentiated primarily by hue (warm stone → cool blue-grey, D8) with opacity as the secondary, colour-blind-safe channel (D11); constellation mode held one hue (lavender, matching the site's star-mode vocabulary elsewhere) and carried all the separation on opacity alone. Both ranges were too narrow — light mode spanned fill-opacity 0.30 → 0.09 of a single light stone tone, so even the two extremes (band-0 vs band-4) only reached 1.116:1, below the threshold of human perception for two adjacent regions.

**Fixed.** Bands now step opacity band-0 → band-4 (the reverse of the original, and deliberately so — see the CSS comment above `.dl-ribbon-band-0` in `css/daylight.css` for the full reasoning), light mode gains a genuine tonal ramp from the unchanged warm `rgba(184,175,162,0.30)` (band-0) to a new dark cool slate `rgba(55,66,88,0.63)` (band-4), and constellation mode keeps its single lavender hue but widens fill-opacity from 0.10 to 0.44 — capped below `.dl-ribbon-summary`'s own 0.55, so the loudest band still reads quieter than the sentence already stating the same fact in words. Targets: ≥1.25:1 every adjacent pair, ≥2.0:1 band-0-vs-band-4, both themes. Measured (same WCAG formula, `js/muted-contrast.test.js`'s new ribbon-band-separation assertions, which now gate this permanently — see "Automated gates" above, 7/7):

| | band-0 | band-1 | band-2 | band-3 | band-4 | adjacent min | full span (0↔4) |
|---|---|---|---|---|---|---|---|
| light vs `#F5F0E8` | 1.191:1 | 1.547:1 | 1.993:1 | 2.600:1 | 3.397:1 | 1.289:1 | 2.853:1 |
| constellation vs `STATIC_PARCHMENT.dark` `#1C1914` (test's proxy bg, per the AA section above) | 1.283:1 | 1.690:1 | 2.179:1 | 2.803:1 | 3.686:1 | 1.287:1 | 2.874:1 |
| constellation vs `#0a0a12` (true bg, checked separately) | 1.212:1 | 1.588:1 | 2.074:1 | 2.725:1 | 3.661:1 | 1.306:1 | 3.020:1 |

Both targets clear with real margin in both themes; the true constellation background scores slightly *better* than the proxy the test asserts against, so passing the test is the stricter claim, same relationship the AA section above already established for this proxy. Real-browser screenshots (camino-frances, light and constellation, headless Chrome) confirm it reads as a textured, five-step strip rather than a flat wash in both themes — no longer merely asserted by the numbers.

Band identity still never rests on hue alone (D11): hue and opacity both step band to band, exactly as before. A third, fully independent channel (band height, a hairline between adjacent runs) was considered per D11's spirit and rejected — the widened opacity ramp alone clears both targets with margin and reads as five steps by eye, so a geometric channel on top would add rendering complexity and visual weight without a demonstrated gap to close, working against D2's own "this page is getting dense" concern and PRODUCT.md's "quiet over loud." If a future palette pass ever narrows the range again, `js/muted-contrast.test.js` fails before it ships.

## Slice 9 — no-crowding pass (AC #11), 2026-08-12

**Author judgment, after direct inspection of the live page in a real browser** — chrome-devtools MCP driving headless Chrome against a local `python3 -m http.server 8000` (not just reading the source and confirming the mechanisms exist). Checked: camino-primitivo (solid, multi-band), kumano-kodo (dashed, single-band), shikoku-88 (dashed, coarse-windowed), camino-frances (solid, multi-band); light, plain-dark, and constellation themes; 1280px and 375px viewports; preferences panel expanded to surface the densest realistic state. ~15 route/theme/viewport combinations, zero console errors on any of them.

- **The walk-budget result stays the protagonist.** In every configuration, "Walk 13.2 mi · Arrive ∼12:40 · 5h 41m walking · 8h 36m cushion before sunset" (or equivalent) is the only non-italic, larger-serif line on the page. Everything else — picker labels, annotations, the ribbon's caption and summary — is smaller and italic. Matches the May enrichment doc's finding for the bar alone; holds with the ribbon added beneath it.
- **The ribbon does not compete for attention — if anything it undersells itself.** At shipped size it's the quietest element on the page, quieter than the annotation lines above it (see the contrast findings above — same fact, restated as a visual judgment rather than a number).
- **Two-axis risk (D8), checked in practice.** Did not mistake the ribbon's distance axis for the bar's time axis at any point. Beyond the spec's three planned defences — separate `<svg>`; the "How dark this route gets, start to finish." caption in normal flow; no shared ticks (all confirmed: the accessibility tree shows "Walk-budget result" and "Darkness along the route" as sibling regions under `<main>`, not nested, and the bar's `aria-label` and the ribbon's are two independent sentences with zero shared vocabulary) — a fourth, unplanned mechanism does real work: the two instruments don't *look* alike. The bar reads as a dial (nested gradient bands, circular start/end markers, a highlighted terracotta walk segment, a dashed tick); the ribbon reads as a flat tiled swatch strip with no ticks at all. The shape difference alone would probably have been enough.
- **Mobile (375px).** No horizontal overflow (`document.body.scrollWidth === document.body.clientWidth`, checked directly, not eyeballed). End labels don't collide with the summary paragraph. Shikoku's longer "N of M sampled" sentence wraps cleanly across two lines.
- **Summary-sentence spot check.** camino-primitivo and camino-frances both reproduced the spec's own D10 worked examples verbatim off the live DOM (`"Mostly as it was (52%) and open dark (34%), with some countryside (8%) and edge of town (6%)."` and `"Mostly open dark (39%) and as it was (30%), with some countryside (21%) and edge of town (8%)."`), and Kumano's matched too (`"As it was, the whole way. Not checked against a ground reading here, the way the five Camino routes are."`) — not this pass's job to re-verify (that's AC #1/#9 in the automated suites), but a good sign nothing drifted between spec and shipped copy.

**Verdict: not crowded.** The page carries more now than it did before this branch, but the ribbon adds one quiet horizontal strip and two lines of small italic text below a result that was already the visual anchor — it doesn't change where a reader's eye lands first. No demotion pass on stroke-width or opacity was needed.

**Correction, 2026-08-12.** This pass did find the light-mode band-separation problem documented under Slice 8 above, and originally recorded it here as a minor legibility note rather than what it was: a defect. "Not crowded" is still the right verdict for what this pass exists to check — a reader's eye landing on the ribbon or the bar before the result, or confusing the two axes, didn't happen once across three routes, three themes, and two viewports, and crowding (competing for attention) is genuinely a different failure from indistinguishability (competing for too little) — a no-crowding pass isn't the right instrument to catch the latter, and didn't claim to. But naming a defect and then filing it as "worth mentioning, not a regression" understated it regardless of which pass surfaced it first. The band fills have since been re-tuned and are gated by a permanent regression test (Slice 8's corrected section above); this pass's own job — crowding — was never the thing that needed fixing, and its "not crowded" verdict stands unchanged.

## Sign-off

AC #11 and AC #12 met, recorded above. All automated suites green. Both pre-commit hooks pass. No change to `assets/darkness/` or `scripts/darkness/`. Ready to merge as the close of the darkness-ribbon implementation wave.

**Post-launch correction, 2026-08-12.** The band-fill distinguishability defect this note originally soft-pedaled (Slice 8's band-fills table, Slice 9's closing paragraph) has been fixed: bands re-tuned in `css/daylight.css`, a permanent regression test added to `js/muted-contrast.test.js` (now 7/7), and the result re-verified against real-browser screenshots in both themes. See the corrected sections above for the numbers and reasoning; this line exists so a reader scanning only the sign-off doesn't miss that the record above it was revised, not just annotated.
