# Darkness Ribbon Implementation Plan

**Spec:** [`docs/specs/2026-08-12-darkness-ribbon.md`](../specs/2026-08-12-darkness-ribbon.md)
**Status:** Complete, plus two fix waves and a third documentation-and-decisions pass — see "Fix waves" below
**Goal:** Draw the per-kilometre darkness artifact Gate 0 committed as a five-band ribbon beneath the existing time bar on `/daylight`, without letting a reader mistake its distance axis for the bar's clock axis, without overclaiming precision the data doesn't have, and without adding to the page's density unexamined.
**Architecture:** Pure darkness math (band classification, Shikoku's coarse-aggregation window, run-merging, the summary-sentence algorithm) lands in `js/daylight-math.js`, alongside the module's existing pure helpers (`barDomainUTC`, `buildICS`, `walkingMinutes`) — directly unit-testable, no DOM. The ribbon's own pixel-coordinate function (`kmToRibbonX`) stays private inside `js/daylight.js`, exactly mirroring how `utcToBarX`/`kmToBarX` are already private there and proven only through an independently re-derived oracle in the render-test harness — not exported, not shared, so a distance axis can never be silently fed into a time-axis function or vice versa. The ribbon renders into its own `<svg id="dl-ribbon-svg">`, a DOM sibling of `#dl-output` rather than a descendant, so it never inherits that region's `aria-live="polite"` behaviour. No new files; every change extends something that already exists.
**Tech Stack:** Vanilla JS, zero npm deps, the repo's existing hand-rolled `js/*.test.js` harness idiom (`passed`/`failed` counters, `✓`/`✗` output, `node js/<file>.test.js`). No new dependency, no new page, no new URL.

**Correction, third fix wave (2026-08-12):** this document read "has not been executed... there are no commit hashes to cite yet" from first draft all the way through two implementation fix waves — 21 commits, every slice below shipped, several slices' own "What this slice does" already carrying real commit-hash corrections inline (see Slice 5) — while the header above and every slice's own `Status` field still said `Not Started`. That was a defect in this document, not in the work. Every slice below is now marked against the commit that actually shipped it; see "Fix waves" (after Slice 9) for the two rounds of fixes on top of the original nine, and the spec's own "Result" section for final suite counts.

## Decision summary (pulled from spec)

| ID | Decision |
|---|---|
| D1 | Five coarse bands at 18.5 / 19.5 / 20.5 / 21.3 mag/arcsec² — not a gradient. |
| D2 | Lives below the bar on `/daylight`; no new page, no new URL. |
| D3 | Shikoku aggregates into `ceil(p90GapKm/10)×10` km windows (today: 40 km), keyed off `positionalConfidence.withinInterpolationLimit`, not a hardcoded route id. |
| D4 | `heldOutValidation: false` routes (Shikoku, Kumano) get a text clause *and* a dashed stroke — two independent channels, keyed off the field. |
| D5 | No star counts, any route, this slice. |
| D6 | Kumano renders as one flat band via the same code path as every other route — no special case. |
| D7 | Band widths, numeric display, and copy all respect the ±0.32 mag ceiling from Gate 0's α-sensitivity finding. |
| D8 | The ribbon is a separate `<svg>`, a sibling of `#dl-output` (outside its `aria-live` region), preceded by a plain-language caption. Originally shared pixel *bounds* with the bar (never its coordinate system); fix wave 3 found that alone let column-alignment misread as meaningful, so the ribbon now insets 24 units past the bar's own edges on each side — a fourth, geometric defence. |
| D9 | Band names: town glow · edge of town · countryside · open dark · as it was — "open dark" replaces the brief's "properly dark" to avoid echoing the bar's own "true dark." |
| D10 | One dynamic summary sentence beneath the ribbon (≥5%-share bands, descending, rounded) replaces a persistent swatch legend. |
| D11 | Dual-channel accessibility throughout: aria-label + outside-SVG text; hue + lightness; text + stroke-shape for the unvalidated marking. |
| D12 | Custom routes and the unselected state: the whole ribbon section stays `hidden` — inherited from Gate 0 §11, not a new scope decision. |
| D13 | Reacts to the route picker only. Stage-bracketing is explicitly not attempted, grounded in a verified 173.2 km (19%) mismatch between the daylight-bake's summed stage distances and the darkness-bake's `coveredKm` for Shikoku. |

---

## File structure

**Created:** none. Every file this plan touches already exists.

**Modified:**
- `js/daylight-math.js` — new pure exports: `DARKNESS_BAND_BOUNDS`, `DARKNESS_BAND_NAMES`, `darknessBandForValue`, `darknessBandCounts`, `darknessAggregateWindowKm`, `mergeDarknessRuns`, `darknessSummarySentence`
- `js/daylight-math.test.js` — fixtures and assertions for all of the above, including the real seven artifacts (AC #1)
- `js/daylight.js` — `renderRibbon` (new, beside `renderSVG`), private `kmToRibbonX`, `loadDarknessData` + `_darknessData` cache (mirroring `loadStageData`/`_stageData`), `onRouteChange` wiring, ribbon-section `hidden` toggling, the `fmtDistance` thousands-separator extension
- `js/daylight-render.test.js` — the bulk of new assertions: synthetic darkness fixtures (including the field-driven counter-example fixtures AC #2 and #3 require), an `expectedRibbonX` oracle mirroring `expectedBarX`'s existing shape, and the render-level assertions for AC #2 through AC #10
- `css/daylight.css` — five band fill/stroke classes (solid) plus their dashed variants (D4), end-distance-label class, summary-paragraph class, and `body.constellation`/dark-mode overrides mirroring the bar's existing per-class theme blocks
- `js/muted-contrast.test.js` — the ribbon's new label/caption selectors added to the existing `css/daylight.css` sweep
- `daylight/index.html` — the new ribbon `<section>` (caption paragraph, `dl-ribbon-svg`, summary paragraph), inserted as a sibling immediately after `#dl-output`'s closing tag, before `<noscript>`

**Not modified:** `scripts/darkness/`, `assets/darkness/` — read-only input to this slice, per the spec's "Relationship to Gate 0."

---

## Slice 1: The pure-math harness gets darkness fixtures — red

**Files:** `js/daylight-math.test.js`
**Decisions:** scaffolding for D1, D3, D7
**What this slice does:** Adds a new section to `js/daylight-math.test.js` asserting against `DaylightMath.DARKNESS_BAND_BOUNDS`, `DARKNESS_BAND_NAMES`, `darknessBandForValue`, `darknessBandCounts`, and `darknessAggregateWindowKm` — none of which exist yet. Includes: boundary-edge fixtures (values exactly at 18.5/19.5/20.5/21.3, proving which side of each cut they land on); the full seven-route distribution table from spec D1, read from the real `assets/darkness/*.json` files directly rather than a hand-built fixture, so this assertion can never silently drift from what's actually shipped; and the `darknessAggregateWindowKm` formula against hand-computed cases (`p90GapKm: 34.4` → `40`, `p90GapKm: 6.0` → `10`, an exact-multiple case like `p90GapKm: 30.0` → `30`, proving the `ceil` doesn't round a clean multiple upward past itself).
**Expected outcome:** `node js/daylight-math.test.js` fails immediately — `DaylightMath.darknessBandForValue is not a function` (or equivalent) — a clean, named absence, the same shape as Gate 0's own plan citing `ModuleNotFoundError: No module named 'X'` as its expected red state, not an uninformative crash.
**Status:** Complete
**Shipped as:** `4e4e284 — test(darkness): the ribbon's band math gets fixtures, and fails clean`

## Slice 2: The pure darkness math lands

**Files:** `js/daylight-math.js`
**Decisions:** D1, D3, D6, D7
**What this slice does:** Implements the five functions Slice 1 asserts against. `darknessBandForValue(mag)` — a direct index into `DARKNESS_BAND_BOUNDS`. `darknessBandCounts(values)` — a single pass, no per-route special-casing (this is what makes D6 true "for free": Kumano's all-one-band result falls out of running the same function against its `values[]`, not a branch that checks the route id). `darknessAggregateWindowKm(positionalConfidence)` — returns `null` when `withinInterpolationLimit` is `true` (no aggregation), else `Math.ceil(positionalConfidence.p90GapKm / 10) * 10`. `mergeDarknessRuns(values, stepKm, aggregateWindowKm)` — walks the per-km array; with no window, merges consecutive same-band kilometres into runs (the same run-merging shape `computeMoonBandRuns` already uses in `js/daylight.js`, reused as a pattern, not literally shared code, since one walks a time axis and the other a distance axis); with a window, buckets into fixed-width spans first and classifies each bucket by the *median* of its raw values before merging.
**Turns green:** Slice 1's suite, in full (AC #1).
**Status:** Complete
**Shipped as:** `ed5f45b — feat(darkness): band math lands — five steps, and Shikoku's coarse window`

## Slice 3: The render harness gets darkness fixtures — red

**Files:** `js/daylight-render.test.js`
**Decisions:** scaffolding for D2, D3, D4, D5, D8, D9, D10, D12, D13
**What this slice does:** Extends the fake-DOM harness with everything the ribbon's render-level assertions need, none of it wired to real behaviour yet:
- Synthetic darkness-JSON fixtures: a validated multi-band route (shaped like `camino-primitivo`'s real numbers), a validated single-band route (shaped like `kumano-kodo`'s), and — critically for AC #2 and #3 — a fixture route under a name that is *not* `"shikoku-88"` or `"kumano-kodo"`, with `withinInterpolationLimit: false` and `heldOutValidation: false` forced by hand. This is the assertion that actually proves the renderer reads the field rather than the route id; testing only against the real Shikoku/Kumano data would pass even a hardcoded `if (routeId === 'shikoku-88')` check.
- A fixture with `unit: "nW/cm2/sr"` (AC #10) — a shape no real shipped route currently has.
- An `expectedRibbonX(kmFromStart, coveredKm)` oracle, independently re-deriving the same linear-interpolation formula `kmToRibbonX` will implement — mirroring `expectedBarX`'s existing role in this file exactly, including the comment explaining why: `kmToRibbonX` will be module-private, so a leftover bug in it and a correct oracle disagree here the same way a leftover `BAR_X1` literal disagreed with a correct `utcToBarX` call in the night bar's own regression.
- The full set of render-level assertions from spec AC #2 through AC #9, written against `Daylight.renderRibbon` and a `dl-ribbon-svg` element that don't exist yet, plus a DOM-structure assertion that the ribbon's container is a sibling of `#dl-output`, not nested inside it (AC #8).
**Expected outcome:** `node js/daylight-render.test.js` fails immediately on the first ribbon assertion — `Daylight.renderRibbon is not a function` — while every pre-existing bar assertion (65/65 as of the night bar) continues to pass, proving this slice is additive and hasn't disturbed the bar it sits beneath.
**Status:** Complete
**Shipped as:** `8d59067 — test(darkness): the ribbon gets its geometry assertions, and fails clean`

## Slice 4: `renderRibbon` draws the geometry

**Files:** `js/daylight.js`
**Decisions:** D3, D4, D8, D9
**What this slice does:** Adds `renderRibbon(darknessData, svgEl, unitSystem)` beside `renderSVG`, plus the private `kmToRibbonX`. Consumes `mergeDarknessRuns`'s output (Slice 2) to draw one stroke segment per run, coloured/named by `DARKNESS_BAND_NAMES[bandIdx]` in the warm-to-cool direction the bar's own twilight bands already establish, stepping fill-opacity alongside hue per D11. Draws the two end-distance labels from `coveredKm` (not `route-meta.json`'s stated `distanceKm` — AC #9), via the existing `fmtDistance`. Applies the dashed-stroke treatment (D4) when `heldOutValidation === false`. Sets `dl-ribbon-svg`'s `role="img"` and a first-pass `aria-label` (the full summary-sentence wiring lands in Slice 5; this slice can ship a minimal accessible name — e.g. just the route label and distance — so the element is never accessible-name-less in the interim). Also adds the ribbon `<section>` markup to `daylight/index.html`, `hidden` by default, positioned as a sibling immediately after `#dl-output`.
**Turns green:** The geometry-shaped assertions from Slice 3 — AC #2, #3, #4 (partially — the numeric-sweep half), #8, #9. The text-equivalence assertions (AC #5) and the sentence-dependent half of AC #9 remain red pending Slice 5.
**Status:** Complete
**Shipped as:** `3e06704 — feat(darkness): the ribbon draws — five bands, tiled edge to edge`

## Slice 5: The summary sentence, and text equivalence

**Files:** `js/daylight-math.js`, `js/daylight-math.test.js`, `js/daylight.js`
**Decisions:** D5, D10, D11
**What this slice does:** Implements `darknessSummarySentence(routeLabel, darknessData, unitSystem)` in `daylight-math.js` (pure — takes band counts and metadata, returns a string; testable directly against the worked examples in spec D10 without any DOM), covering: the ≥5%-share/descending/rounded selection rule; the one/two/three-or-four-band sentence templates; the "N of M km sampled" lead-in gated on a >5 km gap between `coveredKm` and stated `distanceKm`; and the `heldOutValidation`-gated trailing clause. `renderRibbon` (Slice 4) is updated to set the real `aria-label`/`<title>` from this sentence and to write the same sentence into a real sibling `<p>` outside the SVG. Also lands the `fmtDistance` thousands-separator fix (spec D10's side-finding) — `js/daylight-math.js` or `js/daylight.js` wherever `fmtDistance` ends up living is not expected to change; only its formatting behaviour above 999 changes, verified against the pre-existing call sites (every current stage distance is well under 1,000, so the thousands separator itself changes no existing rendered text). **Correction, second fix wave:** the commit that actually landed this (`bd84ce4`) bundled a second change alongside the thousands separator — the unit suffix's separator moved from a plain space to a non-breaking one (`' km'` → `' km'`), on every call, not only above 999. That part is not invisible: it changes two pieces of pre-existing rendered text this slice never named as in scope — the walk-budget result line and the ICS `DESCRIPTION` built from it. The change was kept (it stops a number like "1,080.5" wrapping onto its own line away from "km"), but "no existing rendered text changes" was true only of the thousands-separator half of this slice's `fmtDistance` edit, not the whole of it.
**Turns green:** The remaining Slice 3 assertions — AC #4 (fully — the sweep now also checks the sentence text), #5, #9 (fully).
**Status:** Complete
**Shipped as:** `bd84ce4 — feat(darkness): the ribbon speaks its own sentence — inside the frame and out`

## Slice 6: The route picker wires it up

**Files:** `js/daylight.js`
**Decisions:** D12, D13
**What this slice does:** `loadDarknessData(routeId)` — an XHR fetch of `/assets/darkness/<routeId>.json`, cached into `_darknessData`, mirroring `loadStageData`'s existing shape against `_stageData` line for line. Called from `onRouteChange()` only — never from `onFieldChange()`, which every other input (stage, date, pace, start time, buffer) already routes through. The ribbon section's `hidden` attribute is set from `state.route === 'custom' || !state.route`, matching the existing pattern `dl-share-wrap`/`dl-routes-index` already use. Because `renderRibbon` (Slice 4) takes only darkness data as input — no stage, no date — the "reacts to route only" claim (AC #7) is architectural, not just an event-wiring choice: there is no code path by which a stage or date change could reach it.
**Turns green:** AC #6, AC #7.
**Status:** Complete
**Shipped as:** `934fbef — feat(darkness): the route picker wakes the ribbon`

## Slice 7: The unit-field guard

**Files:** `js/daylight.js`
**Decisions:** Gate 0 §7 alignment (spec, "What this slice must still decide," AC #10)
**What this slice does:** `loadDarknessData`'s success handler checks `unit === 'mag/arcsec2'` before calling `renderRibbon`; anything else (today, nothing — all seven routes pass) leaves the ribbon section `hidden` rather than rendering a mislabeled value. Small and deliberately separated from Slice 6 rather than folded in, so its own red/green cycle is visible on its own: the synthetic `unit: "nW/cm2/sr"` fixture from Slice 3 is what turns green here.
**Turns green:** AC #10.
**Status:** Complete
**Shipped as:** `ce0ee8b — feat(darkness): the unit guard fails loudly, not just quietly`

## Slice 8: Themes, and the contrast sweep catches up

**Files:** `css/daylight.css`, `js/muted-contrast.test.js`
**Decisions:** D8, D11
**What this slice does:** `body.constellation`/dark-mode overrides for the five band classes and their dashed variants, mirroring the bar's existing `body.constellation .dl-bar-*` block structure rather than inventing new selector conventions. The end-distance-label and summary-paragraph classes are added to `js/muted-contrast.test.js`'s existing `css/daylight.css` sweep (its own header already documents that it "will cover any new label colours" — this slice is that coverage arriving, not a new mechanism).
**Turns green:** AC #12.
**Status:** Complete
**Shipped as:** `2fa99ac — fix(darkness): the ribbon clears AA in both themes — the sweep catches up`

## Slice 9: The no-crowding pass

**Files:** none (a written finding, recorded once the above ships — likely appended to this plan or a short launch note, following the enrichment spec's own precedent of recording its AC #13 confirmation in writing)
**Decisions:** D2, AC #11
**What this slice does:** After a cooldown, a fresh-eyes look at `/daylight` with a real route loaded, checking specifically whether the walk-budget result still reads as the page's protagonist against the picker, the three-layer twilight bar, the moon band, and the new ribbon all stacked together. If the ribbon competes rather than sits quietly beneath the result, its stroke width or opacity is reduced here and the check re-run — the same remedy the May enrichment spec used at its own AC #13.
**Turns green:** AC #11 (manual).
**Status:** Complete
**Shipped as:** `4115520 — docs(darkness): the no-crowding pass, looked at and written down`

---

## Fix waves (the commit hashes this document used to say didn't exist yet)

Slices 1–9 above are the original nine; these are the two implementation fix waves that followed them, plus this update's own third pass. Each commit's own message is the accurate record of what it did — listed here, in shipped order, rather than re-narrated, so this section can't drift from the commits it cites the way the old Status fields drifted from the work.

**Fix waves 1–2** (findings from review and from the launch note's own post-launch corrections):

| Commit | Message |
|---|---|
| `3b8fa6b` | fix(darkness): the five bands finally step apart, in both themes |
| `40fbfc4` | docs(darkness): the launch note stops calling a defect a legibility note |
| `8f11c28` | fix(darkness): the ribbon stops answering for a route the reader has left |
| `d8636ba` | fix(darkness): the ribbon holds its five steps in plain dark, and dashed |
| `2220df5` | fix(darkness): the trust marker fails toward unvalidated, not trustworthy |
| `8a8ecf3` | fix(darkness): the sentence states its distance for every route, not one |
| `0dcb071` | fix(darkness): the sentence weighs its shares, and points to where, the way the strip draws them |
| `ceff8c8` | fix(darkness): a malformed artifact fails to hidden, not to a crash |
| `1b4d4ce` | test(darkness): close four mutation-survival gaps and add y-geometry checks |
| `55da5f6` | fix(darkness): a fifth band no longer vanishes from the sentence |
| `53f6f59` | fix(darkness): three small corrections — nbsp, sliver comment, export list |

**Fix wave 3** (this update, 2026-08-12 — two design decisions this document and the spec had left open, plus this document itself):

| Commit | Message |
|---|---|
| `0ee21d1` | fix(darkness): the ribbon steps back from the bar, and its slivers merge away |
| `1deba46` | docs(darkness): the CDN/apps question Gate 0 answered stops going unstated |
| `b30779f` | docs(darkness): D7 states its own band spacing correctly |

`0ee21d1` is the one code commit in this wave, and it answers two things Slice 4 and Slice 2 above shipped without deciding: D8's two-axis alignment (the ribbon now insets 24 units past the bar's own `BAR_X1`/`BAR_X2` on each side, rather than sharing them — see spec D8, mechanism 4) and `mergeDarknessRuns`'s minimum-drawable-run-width guard (generalized from "absorb an exactly-zero-width run" to "absorb any run narrower than one drawn pixel," `coveredKm / DARKNESS_RIBBON_WIDTH`, into every run rather than only the trailing one). Both are implemented, not just decided in prose; `js/daylight-math.test.js` (192/192) and `js/daylight-render.test.js` (180/180) cover them directly, including the new `absorbNarrowDarknessRuns` helper tested in isolation. `1deba46` and `b30779f` are spec-only corrections — see the spec's own "Result" section for what each changed.

---

## Verification (final state, 2026-08-12, after fix wave 3)

| Suite | Result |
|---|---|
| `node js/daylight-math.test.js` | 192/192 |
| `node js/daylight-render.test.js` | 180/180 |
| `node js/daylight-ribbon-wiring.test.js` | 38/38 |
| `node js/muted-contrast.test.js` | 8/8 |
| `node js/moon-lux.test.js`, `node js/moonpath.test.js`, `node js/sunpath-math.test.js` (regression) | Unchanged, all pass — this plan touches none of their inputs |
| `.githooks/pre-commit` (`build-permalinks --check`, `validate-metadata.mjs`) | both pass |
| `grep -rn "assets/darkness" js/ daylight/ css/` (outside tests) | exactly `js/daylight.js:1698` (`loadDarknessData`'s XHR) — nothing more |
| Manual: AC #11 no-crowding pass | Recorded in writing (Slice 9, `docs/specs/2026-08-12-darkness-ribbon-launch.md`); lighter reconfirmation after fix wave 3's geometric inset (real-browser screenshots, 1280px and 375px) — see spec AC #11 |
| Manual: real-browser render, light/dark/constellation | A validated Camino (solid, fine-grained), Kumano (dashed, fine-grained), Shikoku (dashed, coarse) — the three cells the spec's decisions actually produce; re-confirmed at 1280px and 375px during fix wave 3 |

## What this plan does NOT include

- **Star counts, in any form.** Spec D5.
- **Stage-level bracketing on the ribbon.** Spec D13 — would require reconciling the daylight-bake and darkness-bake kilometre axes first, which is a data-pipeline question, not a rendering one.
- **"The night worth walking" or "the finishing layer."** The remaining two slices in the darkness-audit spec's four-slice roadmap. Not started; each is its own future spec.
- **The 2012→present drift story.** Slice 4 in that same roadmap (confusingly numbered independently of this document's own slices — it is a separate future *spec-level* slice, not a slice of this plan).
- **Any change to `scripts/darkness/` or `assets/darkness/`.** Read-only input throughout.
- **A UI for Gate 0 §7's radiance-only fallback unit.** Slice 7 only guards against it; it does not build the fallback's own copy register, since no shipped route needs it.
- **A `publish-darkness` step, or iOS/Android consumption of `assets/darkness/`.** Named explicitly, third fix wave — see the spec's "Relationship to Gate 0." Deferred, not scoped, not dropped.
