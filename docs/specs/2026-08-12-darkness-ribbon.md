# The Darkness Ribbon

**Date:** 2026-08-12
**Status:** Not Started
**Branch:** `feat/darkness-ribbon`
**Parent:** [`2026-08-11-darkness-data-audit.md`](./2026-08-11-darkness-data-audit.md) — Gate 0, which produced and validated the per-kilometre darkness artifact this slice renders. Its "Carried forward" section is binding on this work — see "Relationship to Gate 0" below for the exact mapping from that section to the decisions here.
**Precedent:** [`2026-08-12-night-bar.md`](./2026-08-12-night-bar.md) — the immediately preceding slice on this same page. Its D8 (accessible names that state exactly what's drawn, plus the same facts restated as real DOM text outside the SVG) and its closing lesson ("SVG geometry needs coordinate assertions, not eyeballing") both apply directly here.
**Also informing this:** [`2026-05-13-daylight-enrichment.md`](./2026-05-13-daylight-enrichment.md) — the older precedent for adding a layer to this bar, including its AC #13 no-crowding discipline, which this spec extends rather than repeats.
**Context:** The darkness-data-audit spec names four downstream slices consuming `assets/darkness/`. The night bar was the first, and deliberately touched none of that artifact (see its own "Relationship to the darkness gate"). This is the second.

---

## Problem

`assets/darkness/` holds, for each of seven baked pilgrimage routes, a per-kilometre modeled sky-brightness value in mag/arcsec² — validated by Gate 0 (five Galician reference sites, leave-one-out, worst residual 0.378 against a 0.5 tolerance), licensed cleanly (NASA Black Marble VNP46A4, CC0; route geometry, ODbL), and committed. Nothing reads it. `grep -rn "assets/darkness\|darkness\." js/ daylight/ css/` (excluding tests and this spec) returns nothing outside `scripts/darkness/` itself.

A walker who opens `/daylight` for a stage today already gets one night-shaped answer, from the slice directly above this one on the same page: does it get properly dark tonight, on this stage, and when. That is a **time** question — is it, right now, past astronomical dusk. The data Gate 0 built answers a different, **place** question: independent of tonight's clock, weather, or moon, how dark does the sky get *along this trail* — where does a town's glow reach, and where does the sky actually open up. Those two darks must not collide in a reader's head. The bar above already claims the phrase "true dark" for the time question (`js/daylight.js`, `titleText` and the plain-language annotation in `recompute()`); this slice's band names are chosen in part to avoid echoing it — see D9.

### Relationship to Gate 0

This slice is architecturally simple with respect to the gate: it reads `assets/darkness/<route>.json` as committed, static input, and changes nothing under `scripts/darkness/` or `assets/darkness/`. Gate 0's own definition of done anticipated exactly this: "a downstream slice can read `assets/darkness/camino-frances.json`, trust `unit`, and render a ribbon without needing to know anything about VIIRS, kernels, or licenses."

Gate 0's "Carried forward" section is binding here, clause by clause:

| Gate 0 carried-forward clause | This spec |
|---|---|
| "Japan has no held-out validation... if Slice 2 puts a number in front of a reader, that distinction belongs in the copy, or the Japanese routes stay qualitative." | D4 |
| "Shikoku's positions are half-interpolated... Slice 2 must not render per-kilometre detail, star counts, or a 'darkest stage' claim for Shikoku... binding on Slice 2, not advisory." | D3, and D5 resolved to *no* star counts anywhere this slice, not only for Shikoku |
| "α is not identified by the five-site reference set... read any single value as good to a few tenths of a magnitude, not to the three significant figures it ships with." | D1 (bands, not a gradient), D7 (precision ceiling), AC #4 |
| "Kumano spans 0.20 mag over its whole length... that is a design problem for Slice 2, not a data problem." | D6 |

None of these are re-litigated below; they are treated as settled and are implemented, not re-argued.

**A fifth carried-forward point the table above doesn't map to any decision, because none of D1–D13 addresses it.** Gate 0 excluded Falchi's World Atlas partly because CC BY-NC "would also ride the CDN into the iOS and Android apps, which market a product" (`docs/specs/2026-08-11-darkness-data-audit.md`, "Falchi exclusion") — a claim about where this data was headed, not only about where it sat that day. Nothing has moved on that claim since, and this slice doesn't move it either: there is no `publish-darkness` script, and no iOS or Android consumption of `assets/darkness/` is scoped in any spec, this one included. The repo has a precedent for exactly this fork — `scripts/publish-collective-routes` pushes `assets/collective-routes.json` to `cdn.pilgrimapp.org` because the site and both apps read one shared object, and `docs/specs/2026-07-17-collective-trail.md`'s own non-goals name the deferral explicitly ("Mobile apps (iOS / Android). Phase two, separate spec, iOS-first."). This slice follows the same web-first, apps-phase-two pattern, just without ever writing it down before now: it renders `assets/darkness/` on `/daylight` only. Stated here so it reads as a deferred decision, not a forgotten one — a `publish-darkness` step and app consumption remain undecided-when, not dropped. Gate 0's CC0-over-CC-BY-NC choice is what keeps that door open for whenever they're built; this spec does not build them, and does not need to for Gate 0's rationale to have been the right call.

---

## Decisions

### D1 — Coarse bands, not a gradient

Five steps at 18.5 / 19.5 / 20.5 / 21.3 mag/arcsec². The data supports roughly 0.3 mag of precision (D7), so a smooth gradient would render distinctions the calibration cannot defend — it would look better and assert more than is true. Discrete steps are the honest form, and they let each step carry a name.

The distribution below was independently recomputed for this spec directly from the seven committed artifacts (`node` one-liner over `assets/darkness/*.json`, classifying each of the 3,288 `values[]` entries against the four boundaries above), not copied from the working brief. It matches exactly:

| route | <18.5 | 18.5–19.5 | 19.5–20.5 | 20.5–21.3 | >21.3 |
|---|---|---|---|---|---|
| camino-frances | 3% | 8% | 21% | 39% | 30% |
| camino-ingles | 2% | 18% | 46% | 34% | 0% |
| camino-norte | 3% | 14% | 34% | 43% | 7% |
| camino-portugues | 5% | 20% | 66% | 10% | 0% |
| camino-primitivo | 0% | 6% | 8% | 34% | 52% |
| shikoku-88 | 0% | 1% | 17% | 32% | 51% |
| kumano-kodo | 0% | 0% | 0% | 0% | 100% |

The bands discriminate: the Primitivo and Kumano are genuinely dark, the Portugués essentially never is. That the same five boundaries, applied uniformly across seven routes shaped by entirely different geography, still separate them this cleanly is the evidence the banding works — a coarser or finer boundary set would either flatten this contrast or manufacture noise the data can't back.

### D2 — It lives below the bar on `/daylight`

Unchanged from the working brief. The bar answers "will the light hold today"; the ribbon answers "how dark is this route." Same page, same route picker, no new URL — continuing the project's decision to deepen the three existing instruments rather than add a fourth. The cost: this page is getting dense. It now carries a picker, a custom-route panel, a mode toggle, a preferences expander, a time bar with three nested twilight bands plus a moon-lantern band plus a dark-adaptation mark, two conditional legends, annotations, a share control, an ICS export — and now a second instrument beneath all of it. AC #11 names this explicitly rather than let it accumulate silently.

### D3 — Shikoku renders at stage resolution, not per kilometre

Gate 0 records as *binding* that `shikoku-88` is 49.8% interpolated and must not carry per-kilometre detail. The artifact's own `positionalConfidence.withinInterpolationLimit` field (verified present and `false` for `shikoku-88`, `true` for all six other routes — see "Artifact shape, verified" below) is what gates this, not a hardcoded route id, so a future re-bake that changes which routes clear the interpolation limit changes this behaviour automatically.

**The coarsening rule itself is also data-driven, not a Shikoku-specific constant.** When `withinInterpolationLimit` is `false`, the ribbon aggregates into fixed-width windows of `ceil(positionalConfidence.p90GapKm / 10) × 10` km — the smallest round-ten window at or above the distance within which 90% of the route's real waypoint gaps fall. For Shikoku today that evaluates to `ceil(34.4 / 10) × 10 = 40` km (positionalConfidence: `meanGapKm: 12.56`, `p90GapKm: 34.4`, `maxGapKm: 80.7`). Each window's band is the band containing the **median** of the raw 1 km values falling inside it (median rather than mean, since roughly half of Shikoku's samples are themselves interpolated between real waypoints — a median resists a single long interpolated run pulling the window's displayed band toward it more than a mean would). This is "the resolution its positions can actually support" made concrete: a reader is never shown a boundary finer than the data can locate.

Two consequences worth stating plainly rather than leaving implicit:

- Shikoku's ribbon still shows real texture — roughly 27 windows across ~1,080 km, not one flat bar — because the underlying 5-band composition genuinely varies along the route (D1's table: 1/17/32/51 across the four bands it touches). Coarsening the *positions* doesn't erase the *shape*.
- `coveredKm` for Shikoku is 1,080.5, not the route's stated 1,200 (`assets/daylight/route-meta.json`'s `distanceKm`). The ribbon only ever draws to 1,080.5 — see AC #9 for why the right-edge label must say so rather than silently drawing a shorter bar under an unchanged "1,200 km" implication.

### D4 — Routes without held-out validation are visibly marked

Every artifact carries a top-level `heldOutValidation` boolean (verified: `true` for the five Caminos, `false` for `shikoku-88` and `kumano-kodo` — confirmed by reading each route's own JSON file directly, not only `meta.json`'s summary). Gated on that field, two independent channels mark it, because a reader must not come away thinking those two ribbons rest on the same footing as the Caminos, and colour is never allowed to be the sole carrier of an important claim (see D11):

1. **Text.** The per-route summary sentence (D10) appends, only for these two routes: *"Not checked against a ground reading here, the way the five Camino routes are."* Plain, factual, no alarm register — matching how the rest of this page states its other limits (the reverse-mode "longer than today's daylight" annotation, the polar-day/night annotations).
2. **Stroke.** The ribbon's band-run strokes render dashed rather than solid for these two routes, reusing a visual grammar this exact page already has rather than inventing one: `.dl-bar-buffer`, `.dl-bar-tick-adapt`, and `.dl-bar-moon-tick` already use `stroke-dasharray` to mean "softer, secondary, less definitive" on the bar directly above. The ribbon borrows that meaning rather than assert a new one.

Shikoku carries both this marking *and* D3's coarsening (it fails both `heldOutValidation` and `withinInterpolationLimit`); Kumano carries only this marking (it fails `heldOutValidation` alone — its `positionalConfidence.withinInterpolationLimit` is `true`, `p90GapKm` a comfortable 6.0 km). The five Caminos carry neither. These are two independent boolean fields, not one combined "trust level" — the ribbon must key each visual/textual treatment off its own field.

### D5 — Star counts: not this slice

The working brief left this open: "Decide whether to include them at all — if you do, they belong in the band legend, never on the ribbon itself." Decision: **no star counts in this slice, for any route.**

A star count is a second derived model stacked on a value already carrying ±0.32 mag of uncertainty (D7) — converting sky brightness to a naked-eye visible-star estimate has its own scatter (local horizon, aerosols, observer eyesight) that this project has not characterized, cited, or validated at all. Gate 0 scoped this out explicitly ("Star-count translation. That is a presentation decision for Slice 2, and it depends on this gate's go/no-go") and its own risk framing named "'about 4,000 stars here' becomes unsupportable" as exactly the kind of claim a failed gate would have made indefensible. The gate passed — but passing makes the *magnitude* claim defensible, not a star-count claim nobody has built or checked yet. Introducing a new, uncited astronomical conversion under an already-dense page (D2) is the wrong place to also introduce a new unvalidated model. If a future slice adds star counts, D5 fixes where they may live if they do: the band legend/summary text, never inline on the ribbon path itself, and — extending the same logic — gated on `heldOutValidation` the same way the summary sentence already is.

### D6 — Kumano renders as one flat band

100% of its 39 km sits in the darkest step (D1's table). This requires **no special-casing in the renderer** — `kumano-kodo`'s `positionalConfidence.withinInterpolationLimit` is `true` (verified: `p90GapKm: 6.0`, well inside the limit), so it takes the same per-kilometre rendering path as the five Caminos; its flatness is an emergent property of real data, not a simplification the code performs. That is true and worth stating plainly rather than engineering around: a uniformly dark 39 km mountain trail should look uniformly dark. D10's summary-sentence algorithm produces this naturally too — with only one band clearing the 5% naming threshold, the sentence collapses to a single clause ("As it was, the whole way") rather than a contrived list.

### D7 — Nothing may imply more precision than ±0.32 mag

Gate 0's carried-forward section: α is not identified by the five-site reference set, and individual values shift by up to 0.32 mag depending on where in the qualifying range (2.5–5.0) it's chosen. This constrains three things directly:

- **Band widths.** D1's three gaps are 18.5→19.5 = 1.0 mag, 19.5→20.5 = 1.0 mag, and 20.5→21.3 = 0.8 mag (the top band, 21.3 and darker, has no upper bound, so there is no fourth gap to measure). Even the narrowest, 0.8 mag, clears the ±0.32 mag swing more than twice over (0.8 > 2 × 0.32 = 0.64), so no single sample can cross more than one boundary under the full range of α that clears Gate 0's own gate. The property holds; the boundaries are not uniformly ≥1.0 apart, and a spec whose entire subject is not overstating precision should not overstate its own.
- **No numeric display.** No raw mag/arcsec² value — per-kilometre or otherwise — appears anywhere in the ribbon's rendered output, its accessible name, or its summary text (AC #4). The only numbers permitted are: whole-percent band shares (rounded, aggregated across many kilometres, where the ±0.32 mag swing averages out rather than compounds), and plain distance figures (a geometric quantity from summed waypoint positions, not a modeled radiance value — D7's precision ceiling doesn't apply to it).
- **Copy.** No band name or summary clause asserts a precise threshold ("darker than 21.3") — band names are used, not the boundary numbers themselves, in any reader-facing text.

---

## What this slice must still decide — resolved here

### D8 — Ribbon form, and the two-axis problem

**This is the sharpest design problem in the slice.** The bar's x-axis is clock time, today, for one stage; the ribbon's x-axis is cumulative distance along the whole route, independent of any date. Stacking two horizontal strips on one page, sharing a page width, invites exactly the misreading the brief warns about: a reader's eye assumes column-alignment carries meaning across stacked rows (compare a dual-axis line chart, the canonical example of this failure). Three deliberately layered mechanisms prevent it, none alone sufficient:

1. **A separate `<svg>` element, not more rows inside `dl-bar-svg`.** The bar's `id="dl-bar-svg"` keeps its own `viewBox="0 0 600 84"` and `role="img"` unchanged. The ribbon gets its own element (`id="dl-ribbon-svg"`, a distinct, shorter `viewBox`, e.g. `"0 0 600 40"`) with its own `role="img"` and its own dynamic `aria-label`. This makes "these are two different instruments" true in the DOM, not only on screen — a screen-reader user hits two separate accessible objects with two separate, single-purpose names, rather than one `aria-label` straining to narrate both a clock and a map. It also removes any temptation to reuse `utcToBarX` (a function of *time*) for a *distance* input by accident, the exact class of coordinate-system bug the night bar's own "What this cost, and why" section spent a full incident on.
2. **A plain-language caption in normal HTML flow, before any new geometry.** A quiet `<p>` (not a heading — this page has exactly one heading, `<h1>The Light Budget</h1>`, and introduces every other sub-area through small paragraph text, not a new heading level) sitting between the walk-budget output and the new SVG: *"How dark this route gets, start to finish."* This is the cheapest, most direct mechanism — a reader is told in words that the axis changed before their eye reaches anything that could be misread, and it costs nothing (real DOM text, always present, not dependent on the SVG rendering at all).
3. **No shared ticks, gridlines, or connecting geometry.** Nothing draws from a bar element (sunrise tick, "now" mark, adaptation mark) down into the ribbon, and the ribbon's own end-labels are distance figures ("0 km" / the route's `coveredKm`, formatted via the existing `fmtDistance`), never clock times. The two rows share left/right pixel bounds (`X1 = 24`, `X2 = 576` — the same numbers as `BAR_X1`/`BAR_X2`) purely so the page's margins stay visually consistent, the way two unrelated paragraphs share a column width; this is a layout coincidence, stated as such, not a shared coordinate system, and no code comment or variable name should imply otherwise.

**Placement.** The ribbon's container is a sibling *after* `#dl-output`'s closing tag (which currently sits between it and `<noscript>`), not a descendant of it. This matters for a reason more concrete than tidiness: `#dl-output` is `aria-live="polite"` (verified: `daylight/index.html`), tuned to announce the walk-budget result changing as a reader edits date, pace, start time, or stage. The ribbon updates on a different cadence — only when the *route* changes (D13) — so nesting it inside that region would mean either it goes silent on every recalculation it has nothing to do with, or (worse) it rides along and gets re-announced for a reason unrelated to it. A sibling section, its own `<section aria-label="Darkness along the route">`, with no `aria-live` of its own (it isn't a live-recalculated result; it's route-scoped reference content, closer in kind to the existing `dl-routes-index` aside than to the walk-budget line), keeps the two announcement behaviours from ever being confused with one another.

**Height and weight.** The ribbon renders taller and heavier than any single band in the bar above it (a wider stroke than the bar's nested 10px twilight bands) — a deliberate visual choice so it reads as its own solid "ground" strip rather than one more thin layer absorbed into the bar's own gradient stack directly above it. Colour direction reuses the bar's own established logic rather than inventing a new one: the bar already runs warm stone tones for daylight (`rgba(184, 175, 162, 0.22)`) toward a cool blue-grey for true dark (`rgba(150, 165, 195, 0.06)`, chosen — per the bar's own CSS comment — specifically because "light mode's baseline is warm, so this is where 'night' actually starts reading as a different thing"). The ribbon's five bands step along the same warm-to-cool direction, brightest to darkest, so a reader who has already parsed the bar above transfers that intuition for free.

### D9 — Band names

Final: **town glow · edge of town · countryside · open dark · as it was**, mapped in that order to the five bands of D1 (brightest to darkest).

Four of the working brief's five working titles survive unchanged. The fourth, "properly dark" (for 20.5–21.3), is replaced with **"open dark."** Reason: the bar directly above this ribbon already claims "true dark" as a specific, technical, time-bound term (astronomical dusk to astronomical dawn, tonight). "Properly dark" is close enough in shape — adjective-plus-*dark*, similarly weighted — that a reader skimming both instruments on one page could plausibly conflate a *place* claim ("this stretch of trail runs properly dark") with the *time* claim directly above it ("it is properly — i.e. truly — dark right now"). "Open dark" keeps the settlement-distance metaphor running through bands one to four (town glow → edge of town → countryside → open dark), reads naturally, and doesn't rhyme against the bar's own vocabulary.

The fifth band keeps the brief's pivot to a different register on purpose: "as it was" is the only name that reaches past the settlement metaphor into something closer to history, and it's earned only there — the darkest band this dataset can show, the nearest analogue to a sky before artificial light existed at all. It is a name, not a scientific claim; the summary sentence that uses it (D10) never asserts the band is literally pristine or free of all light pollution, only that it's the darkest step this ribbon draws. This also quietly seeds Slice 4's future drift story (2012→present) without committing to it here.

### D10 — How the reader learns what a band means

No persistent five-swatch legend, no hover states, no per-segment tooltips (this page has none anywhere, and `role="img"` would hide a per-segment `<title>` from assistive tech regardless — the bar's own established lesson). Instead, **one quiet sentence beneath the ribbon**, present whenever a route is loaded, doing three jobs at once: teaching the vocabulary in use (PRODUCT.md's "show, don't tell"), giving a sighted reader the composition a five-colour gradient alone can't state precisely, and serving as the outside-SVG text-equivalent D8/AC #5 require.

**Algorithm.** Bands are sorted by share, descending; any band at or above 5% is named, rounded to the nearest whole percent; anything below is silently dropped (real, not hedged — a 2% or 0% band contributes nothing worth a reader's attention). Rendered as:

- One qualifying band: *"{Name}, the whole way."*
- Two: *"Mostly {A} ({a}%) and {B} ({b}%)."*
- Three or four: *"Mostly {A} ({a}%) and {B} ({b}%), with some {C} ({c}%) and {D} ({d}%)"* (the "and {D}" clause only when a fourth band qualifies).

Worked, from the verified D1 table (route label, `fmtDistance(coveredKm)`, then the sentence):

- **Camino Primitivo — 262.9 km.** "Mostly as it was (52%) and open dark (34%), with some countryside (8%) and edge of town (6%)."
- **Kumano Kodo — 38.0 km.** "As it was, the whole way." *(only one band clears 5% — D6's flatness falls out of the algorithm, not a special case for it.)*
- **Camino de Santiago (Francés) — 763.7 km.** "Mostly open dark (39%) and as it was (30%), with some countryside (21%) and edge of town (8%)." *(town glow's 3% is real but too small to name.)*

For Shikoku, D3 and D4 both attach: *"Shikoku 88 Temple Pilgrimage — 1,080.5 of its 1,200 km sampled. Mostly as it was (51%) and open dark (32%), with some countryside (17%). Not checked against a ground reading here, the way the five Camino routes are."* The "N of M km sampled" lead-in (rather than the plain "— N km." form the other six routes use) fires only when `coveredKm` and `route-meta.json`'s stated `distanceKm` differ by more than 5 km — comfortably separating Shikoku's genuine 120 km gap from the five-Caminos-plus-Kumano's sub-1 km rounding at their last sample (verified below), so the callout never fires where it would just be noise.

**A small, honest side-finding.** `fmtDistance` (`js/daylight.js`) formats km as `km.toFixed(1) + ' km'` with no thousands separator — never a problem before, because no value it has ever formatted exceeded 112–784 km. Shikoku's `coveredKm` (1,080.5) and stated length (1,200) are the first inputs this page will ever hand it that cross 1,000. This slice should extend `fmtDistance` itself to add a thousands separator at ≥1,000 rather than special-case it locally in the ribbon's own text-building — one shared helper behaving consistently everywhere it's called, and since no existing call site has ever reached four digits, the change is invisible everywhere except the one new place that needs it.

### D11 — Accessibility: text equivalence, and colour is never the only signal

This extends the night bar's own D8 (accessible names state exactly what's drawn; the same facts also exist as real DOM text outside the SVG, because `role="img"` flattens everything inside it) rather than re-deriving it:

- The ribbon `<svg>` carries `role="img"` and a dynamic `aria-label` mirroring the D10 summary sentence, with a matching `<title>` child element — the same dual-placement pattern `renderSVG` already uses for the bar (`svgEl.setAttribute('aria-label', titleText)` alongside an appended `<title>`).
- The D10 sentence *also* exists as a real paragraph outside the SVG (not only inside the accessible name), so it survives being read, copied, or found by an in-page search — matching the bar's own `recompute()` annotation, which exists specifically because an `aria-label` alone is a single announced string, not explorable text.
- **Band identity never rests on hue alone.** The five bands step by hue (warm → cool, D8) *and* by monotonic lightness/fill-opacity together — mirroring the bar's own nested twilight bands, which already step opacity (0.22 → 0.14 → 0.09 → 0.05) alongside their shared hue for exactly this reason. A reader with a colour-vision deficiency who cannot separate the hue shift can still separate the bands by lightness alone.
- **The unvalidated marking (D4) is never colour-only either** — its dashed stroke is a shape change, not a colour change, readable in monochrome or under any colour-vision profile, on top of the text clause carrying the actual claim.
- No hover, no per-segment `<title>`, no tooltip — consistent with the rest of this page and explicitly a non-goal (see below), not an oversight.

### D12 — Custom routes have no darkness data, and show none

Not a new decision so much as an inherited scope boundary made concrete: Gate 0 scoped darkness to "Seven baked routes only... `/daylight` custom-route mode and `/moonpath` show no darkness. No global grid payload" (§11, Out of scope). A custom route's arbitrary lat/lon has no corresponding polyline in `assets/darkness/` and never will under this scope, so there is nothing partial or approximate to show — not "unknown," genuinely absent.

The entire ribbon section (caption, svg, summary sentence) is hidden via the section's own `hidden` attribute whenever `state.route === 'custom'` or no route is selected yet, exactly mirroring how `dl-share-wrap`, `dl-ics-wrap`, `dl-routes-index`, and the permalink line already toggle visibility on the same page for the same reason (a feature that only makes sense for a named baked route). No apologetic placeholder text, no "no data available for this route" message — the existing precedents on this page hide silently when a feature doesn't apply, and a new, louder pattern here would be inconsistent for no reason tied to this feature specifically.

### D13 — The ribbon reacts to the route picker only, not the stage picker

The bar above answers a stage-and-date-scoped question; D2 already frames the ribbon as answering a route-scoped one ("how dark is *this route*"). That framing turns out to be load-bearing, not just poetic, once the actual data is checked.

**Verified during this spec's writing:** summing each route's per-stage `distanceKm` from `assets/daylight/<route>.json` (the array the stage picker is built from) and comparing the total against that same route's `coveredKm` in `assets/darkness/<route>.json`:

| route | Σ daylight-stage `distanceKm` | darkness `coveredKm` | diff |
|---|---|---|---|
| camino-frances | 763.7 | 763.7 | 0.0 |
| camino-ingles | 111.6 | 111.6 | 0.0 |
| camino-norte | 784.3 | 784.3 | 0.0 |
| camino-portugues | 243.0 | 243.0 | 0.0 |
| camino-primitivo | 262.9 | 262.9 | 0.0 |
| kumano-kodo | 38.5 | 38.0 | 0.5 |
| **shikoku-88** | **907.3** | **1,080.5** | **−173.2** |

Six of seven routes agree to rounding. Shikoku's two bakes disagree by 173.2 km — about 19% of the smaller figure. This isn't a rounding artifact; it's two independent pipelines (`scripts/bake-daylight-routes`, presumably route.geojson- or itinerary-derived, versus `scripts/darkness/`'s `waypoints.geojson`-`sacred_site`-only axis, per Gate 0 §2) that were never reconciled onto the same kilometre zero-point or the same underlying geometry for this one route. Gate 0 itself records the same pathology from a different angle: `route.geojson` alone sums to 2,112–2,216 km against a stated 1,200 for Shikoku, depending on ordering strategy.

**Decision:** the ribbon does not attempt to compute "this stage's span" as a highlighted sub-range of the route-level ribbon. Bracketing a stage would require summing prior stages' `distanceKm` to derive a cumulative start offset, then locating that offset on the darkness artifact's own cumulative-km axis — exactly the mapping just shown to disagree by 19% on Shikoku, the one route D3 and D4 already flag as needing the most care, not the least. Shipping a confident-looking bracket on a route whose two source geometries don't even agree on total length would be a *positional* overclaim layered on top of the *value* overclaim D7 already guards against — the same failure mode, one axis over.

Concretely: `onRouteChange()` triggers a darkness-data fetch/render (new `loadDarknessData(routeId)`, mirroring `loadStageData`'s existing XHR-and-cache pattern against `_stageData`, caching into a parallel `_darknessData`); `onFieldChange()` (stage, date, pace, start time, buffer — every other input on this page) does not touch it. This is checked directly rather than only asserted: the ribbon's pure render function takes a route's darkness JSON and nothing else — no stage, no date — so calling it twice with the same route data and different stage/date state must be provably identical (AC #7).

A future slice could revisit stage-bracketing if the two bakes are ever reconciled onto one shared kilometre axis — that is a data-pipeline fix, not a rendering one, and is out of scope here.

---

## Non-goals

- **Star counts.** D5, resolved no, for any route, this slice.
- **Stage-level bracketing or highlighting on the ribbon.** D13.
- **Hover states, tooltips, or per-segment `<title>` elements.** D11 — consistent with the rest of the page, and moot under `role="img"` regardless.
- **A new page or URL.** D2, inherited unchanged from the working brief.
- **Arbitrary-coordinate darkness for custom routes.** D12, inherited from Gate 0 §11.
- **The 2012→present drift story.** That is Slice 4 in the darkness-audit spec's four-slice roadmap ("the night worth walking" and "the finishing layer" are the other two). Gate 0 baked one epoch (2025); this slice renders that one epoch.
- **A UI for Gate 0 §7's radiance-only fallback.** All seven shipped routes carry `unit: "mag/arcsec2"` today (verified against every artifact) — the sky-brightness claim, not the weaker radiance one. This slice adds a defensive guard (AC #10) so a future re-bake that ever ships a route under the fallback unit fails safe (renders nothing for that route) rather than silently mislabeling a radiance figure as a magnitude — it does not build the separate "how lit this place is" copy register Gate 0 §7 describes, since no shipped data needs it yet.
- **Any change to `scripts/darkness/` or `assets/darkness/`.** Read-only input to this slice, exactly as Gate 0's own definition of done anticipated.

---

## Acceptance criteria

- [ ] **AC #1 — Band boundaries (18.5 / 19.5 / 20.5 / 21.3 mag/arcsec²) and the measured distribution (D1).** A pure function reads each route's `values[]` and reproduces the exact percentage table in D1, for all seven committed artifacts — not a fixture standing in for them. Will be verified by a new section of `js/daylight-math.test.js` that requires the real `assets/darkness/*.json` files directly (mirroring Gate 0's own Task 1 Step 6, which re-verified its geometry against real waypoint data rather than only synthetic fixtures) and asserts the table above, cell by cell.

- [ ] **AC #2 — Shikoku's coarse rendering is keyed off `positionalConfidence.withinInterpolationLimit`, not a hardcoded route id (D3).** Will be verified two ways in `js/daylight-render.test.js`: (a) against the real `shikoku-88.json` (coarsens) and a real Camino plus `kumano-kodo.json` (do not coarsen); (b) against a synthetic fixture route — any id other than `"shikoku-88"` — with `withinInterpolationLimit: false` forced, proving the behaviour follows the field even when the name gives no hint. (b) is the assertion that actually protects against a future hardcoded-id regression; (a) alone would not catch it.

- [ ] **AC #3 — `heldOutValidation: false` routes carry both the text clause and the dashed stroke; `true` routes carry neither (D4).** Verified the same two ways as AC #2 — real Shikoku/Kumano (marked) against a real Camino (unmarked), plus a synthetic fixture proving the behaviour is field-driven rather than name-driven.

- [ ] **AC #4 — No per-kilometre or raw magnitude value ever renders as text (D5, D7).** A sweep in `js/daylight-render.test.js` collects every text-bearing value the ribbon produces — every SVG `<text>`/`<title>` `textContent`, the `aria-label`, and the outside-SVG summary paragraph — and asserts none contains a decimal-magnitude-shaped number (regex for a bare `\d+\.\d` outside of a whole-percent or km-distance context) and none contains star-count vocabulary. This single sweep also enforces D5's "no star counts" as a standing regression check, not merely a decision recorded in prose.

- [ ] **AC #5 — Text-readable equivalence: the accessible name and the outside-SVG summary both exist, and say the same thing (D8, D11).** Verified by `js/daylight-render.test.js` asserting the ribbon svg's `aria-label` and the sibling summary paragraph's `textContent` both carry the D10 sentence, for a multi-band route (camino-primitivo) and a single-band route (kumano-kodo) — proving the equivalence holds at both ends of the "how many bands qualify" range, not only the common case.

- [ ] **AC #6 — Custom routes and the unselected state render no ribbon section at all (D12).** Verified by `js/daylight-render.test.js` asserting the ribbon section's `hidden` attribute is `true` for `state.route === 'custom'` and for no route selected, and `false` once any real baked route id loads.

- [ ] **AC #7 — The ribbon's rendered output depends only on which route is loaded, never on stage, date, pace, start time, or buffer (D13).** Verified directly rather than by simulating DOM events: calling the ribbon's pure render path twice with the same route's darkness JSON and two different stage/date/pace states must produce byte-identical output. `js/daylight-render.test.js`.

- [ ] **AC #8 — The bar and the ribbon are structurally two instruments, never one (D8).** Verified by `js/daylight-render.test.js` asserting: the ribbon's svg element id is distinct from `dl-bar-svg`; the ribbon's container is a sibling of `#dl-output`, not a descendant of it (so it sits outside the `aria-live="polite"` region); no drawn element in the ribbon shares a coordinate function with `utcToBarX`. The "does this read calmly to a human eye" half of this problem is not test-shaped and is folded into AC #11 instead of claimed here.

- [ ] **AC #9 — The ribbon's right-edge label reflects `coveredKm`, not `route-meta.json`'s stated `distanceKm`; Shikoku's shortfall is named in its summary sentence (D3, D10).** Verified by `js/daylight-render.test.js` comparing the rendered right-edge label against the fixture's `coveredKm` for camino-frances (where covered ≈ stated) and shikoku-88 (where it does not), and asserting the "N of M km sampled" lead-in appears only when the two figures differ by more than 5 km.

- [ ] **AC #10 — A route whose artifact does not carry `unit: "mag/arcsec2"` renders no ribbon, rather than mislabeling a different quantity (Gate 0 §7 alignment).** Verified by a synthetic fixture with `unit: "nW/cm2/sr"` in `js/daylight-render.test.js`, asserting the ribbon section stays hidden. All seven real shipped routes pass `unit === "mag/arcsec2"` today (independently re-checked while writing this spec), so this exercises a path no current data reaches — the point is that it fails safe if that ever changes, per Gate 0's own instruction to branch on the field rather than assume it.

- [ ] **AC #11 — No-crowding pass, in the enrichment spec's style, naming the accumulating density explicitly.** Manual, not automated — matching how the enrichment spec's own AC #13 is recorded ("a quality gate, not a unit-testable criterion"). At implementation time, after a cooldown, the author confirms in writing (in this slice's own launch note) that the walk-budget result — this page's actual reason to exist, per PRODUCT.md's "the walk is the point" — remains the visual protagonist against everything now stacked around it: the picker, the three-layer twilight bar, the moon band, and the new ribbon together. If the ribbon competes for attention rather than sitting quietly beneath the result, its stroke width or opacity is reduced and the check re-run, the same remedy the enrichment spec used.

- [ ] **AC #12 — Any new label or caption colour clears WCAG AA in light, dark, and constellation themes.** `js/muted-contrast.test.js` already sweeps `css/daylight.css`'s SVG label classes generically (its own header: "will cover any new label colours"); this slice's new classes (the ribbon's end-distance labels, the summary paragraph, and any dashed-stroke treatment that also carries a fill) are added to that sweep's existing `SVG_LABELS`/text-rule lists rather than checked by a new, parallel mechanism.

---

## Verification plan

1. `node js/daylight-math.test.js` — new band-classification and distribution-table assertions (AC #1), plus any new pure helpers this slice adds (aggregation-window computation, run-merging), pass alongside all existing assertions.
2. `node js/daylight-render.test.js` — every AC above with a render-level assertion (AC #2–#10) passes; existing bar assertions (65/65 as of the night bar) remain green, proving the ribbon's addition doesn't perturb the bar it sits beneath.
3. `node js/muted-contrast.test.js` — AC #12; existing daylight-bar-label assertions remain green.
4. `grep -rn "assets/darkness" js/ daylight/ css/` — outside tests, now shows exactly the new loading/rendering code this slice adds, not more.
5. Manual: AC #11's no-crowding pass, recorded in writing once implemented.
6. Manual: a real-browser render (light, dark, constellation) on a route from each of the three cells that matter — a validated Camino (solid, fine), Kumano (dashed, fine), Shikoku (dashed, coarse) — following the night bar's own closing lesson that no amount of numeric/DOM-level proof substitutes for someone actually looking at it.
