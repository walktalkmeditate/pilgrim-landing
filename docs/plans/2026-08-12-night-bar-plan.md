# Night Bar Implementation Plan

**Spec:** [`docs/specs/2026-08-12-night-bar.md`](../specs/2026-08-12-night-bar.md)
**Status:** Complete, with one item deferred to a human (see the final slice)
**Goal:** Extend the `/daylight` bar past sunrise and sunset into the night — true dark, a moon-lantern band, a dark-adaptation mark — without breaking the walk-window reading the page exists for, and rename the page "The Light Budget" along the way.
**Architecture:** `js/daylight-math.js` gains a pure `barDomainUTC(output)` that widens the bar's time axis with a conditional fallback-and-margin (D1/D2). `js/daylight.js`'s `renderSVG` draws the new layers against that domain instead of `[sunrise, sunset]`. Moon-lux math (`moonLuxAt`, `luxBracketFor`, `kFromPhase`) lives in a new `js/moon-lux.js`, shared by `/daylight` and `/moonpath` (D6). No new page, no new external host, no new dependency.
**Tech Stack:** Vanilla JS, zero npm deps, node-based hand-rolled test harnesses matching the existing `js/*.test.js` idiom. No pytest/vitest/jest. No new dependency introduced.

This plan is written after the fact. Every slice below shipped; "Shipped as" cites the real commit. The branch was built in two phases with an independent code review between them — the review's findings are what the second phase fixes, and that shape is preserved here rather than smoothed over, per the spec's "What this cost, and why."

## Decision summary (pulled from spec)

| ID | Decision |
|---|---|
| D1 | Domain widens to `[earliest twilight − 60 min, latest twilight + 60 min]`, fallback chain astro → nautical → civil → sunrise/sunset. |
| D2 | The 60-minute margin only applies on a side where astronomical twilight itself exists. |
| D3 | Twilight/true-dark band strokes use `butt` caps, not `round` — nesting bleeds otherwise. |
| D4 | The moon-lantern band is gated on solar altitude (skips `[civilDawn, civilDusk]`), not lunar altitude alone. |
| D5 | Dark adaptation marks at `astronomicalDusk + 20 min`; the 60-minute margin (D1) is what gives it room to read. |
| D6 | `moonLuxAt`/`luxBracketFor`/`kFromPhase` move to `js/moon-lux.js`; `moonpath.js` aliases them. |
| D7 | Page renamed "The Light Budget"; URL and ICS `PRODID`'s real constraint (the `UID`, not `PRODID`) both stay put. |
| D8 | New night facts are surfaced as accessible-name clauses and plain-language annotation text, not only bar geometry. |

---

## File structure

**Created:**
- `js/moon-lux.js` — `moonLuxAt`, `luxBracketFor`, `kFromPhase` (D6)
- `js/moon-lux.test.js` — 20 assertions, direct proof of the module
- `js/daylight-render.test.js` — 65 assertions, fake-DOM `renderSVG` harness (did not exist before this branch — see spec, "What this cost")

**Modified:**
- `js/daylight.js` — `barDomainUTC` consumption, true-dark segments, moon-lantern band, dark-adaptation mark, accessible-name clauses, `recompute()` night-fact annotations, debounced custom-coordinate inputs
- `js/daylight-math.js` — new `barDomainUTC(output)`, `BAR_DOMAIN_MARGIN_MS`, renamed ICS `PRODID`
- `js/daylight-math.test.js` — `barDomainUTC` fixtures (normal case, fallback rungs ×2, real-pipeline fallback ×2, no-sunrise, polar ×2), updated `PRODID` assertion
- `js/daylight-perf.test.js` — header rename only
- `css/daylight.css` — `.dl-bar-truedark`, `.dl-bar-moonlight`, `.dl-bar-tick-adapt`, `.dl-bar-label-adapt`; five band classes moved `round` → `butt`; label contrast tokens moved `--stone` → `--ink`; constellation `fill-opacity` restated where it used to leak
- `js/moonpath.js` — aliases `luxBracketFor`/`moonLuxAt`/`kFromPhase` from `js/moon-lux.js` instead of keeping its own copies
- `js/muted-contrast.test.js` — new sweep over `css/daylight.css`'s SVG `fill`/`fill-opacity` labels
- `daylight/index.html`, `moonpath/index.html`, `sunpath/index.html`, `llms.txt`, `sitemap.xml` — the rename (D7) and, for `daylight/index.html`, the `js/moon-lux.js` script tag and the taller `viewBox`

**Not modified:** `assets/darkness/`, `scripts/darkness/` — see spec, "Relationship to the darkness gate."

---

## Phase 1 — Build it

### Slice 1: Moon-lux math steps out of `moonpath.js`

**Files:** `js/moon-lux.js` (new), `js/moon-lux.test.js` (new), `js/moonpath.js`
**Decisions:** D6 (extraction half; the `kFromPhase` promotion lands in Slice 13)
**What happened:** `moonLuxAt` and `luxBracketFor` moved verbatim — same maths, same D19 bracket thresholds, same Krisciunas & Schaefer attribution — into a small UMD/IIFE module in the `daylight-math.js` idiom. `moonpath.js` began aliasing both from it. `js/moonpath.test.js` passing unchanged (362/362) is the behaviour-preservation proof.
**Shipped as:** `c4f0c35` — `refactor(moon): the lux math steps out of moonpath.js into its own file`

### Slice 2: Widen the domain; draw true dark, twilight bands, the moon lantern, the adaptation mark

**Files:** `js/daylight-math.js` (`barDomainUTC` new), `js/daylight.js`, `css/daylight.css`
**Decisions:** D1, D2 (initial, unconditional-margin form — corrected in Slice 8), D4 (initial, lunar-altitude-only gate — corrected in Slice 7), D5 (initial 30-minute margin — corrected in Slice 6)
**What happened:** `utcToBarX` moved from taking `(sunrise, sunset)` to taking the new widened domain; eight call sites were updated. A `dl-bar-truedark` segment fills each domain margin. A moon-lantern band samples lunar altitude every 10 minutes and paints by lux bracket. A `dl-bar-tick-adapt` mark lands 20 minutes after astronomical dusk. This is the commit that made the three enrichment-era twilight bands (see spec, "What this cost") finally *nest* at distinct widths — proven correct by coordinate, not yet proven visible.
**Shipped as:** `fea6d0c` — `fix(night): the twilight gradient finally nests, and the night gets a lantern`

### Slice 3: Rename to "The Light Budget"

**Files:** `daylight/index.html`, `moonpath/index.html`, `sunpath/index.html`, `js/daylight-math.js` (ICS `PRODID`)
**Decisions:** D7 (the rename lands here; the `PRODID` self-correction is Slice 12)
**What happened:** Every reader-facing surface updated. The URL, the nav link text, and `llms.txt`'s lowercase description were left alone on purpose (D7 explains why).
**Shipped as:** `063e21c` — `feat(daylight): Daylight Walk Budget becomes The Light Budget`

---

**Independent review.** `/ce-code-review` ran against the branch at this point (run `20260812-103004-6d7b0175`; nine reviewer personas, 16 findings at or above the confidence gate). Root cause of the headline finding: the domain widened and eight `utcToBarX` call sites were updated correctly, but the daylight band's own fill, the sunrise/sunset ticks and labels, and the reverse-mode buffer band still drew from the raw `BAR_X1`/`BAR_X2` pixel-edge literals — the bar was drawing in two coordinate systems at once. Phase 2 is that review's fix waves, committed in the order below.

---

## Phase 2 — Make it true

### Slice 4: A render-test harness — and it's red

**Files:** `js/daylight-render.test.js` (new)
**Decisions:** none new — test infrastructure that every later slice in this phase depends on
**What happened:** No test had ever called `renderSVG`. This file installs a ~30-line fake `document` (`createElementNS` returning a node that records tag/attrs/textContent/children) so `renderSVG` runs under plain Node, then asserts against an independently re-derived `utcToBarX` oracle. First run: 12 of 24 assertions failed, reproducing the review's coordinate-collision finding as concrete, numeric mismatches rather than a description of one.
**Shipped as:** `f1cbaa5` — `test(daylight): renderSVG had no test — here it is, and it's red`

### Slice 5: Fix the coordinate collision

**Files:** `js/daylight.js`, `css/daylight.css`
**Decisions:** D3
**What happened:** `sunriseX`/`sunsetX` computed once near the top of `renderSVG` and reused at every site that used to hardcode `BAR_X1`/`BAR_X2`, including the duplicated reverse-mode tick block and the buffer-band guard. Swept the file for any remaining `BAR_X1`/`BAR_X2` uses — the four genuine ones (the constant definitions, `utcToBarX` itself, the full-width track rail, and the now-tick's bounds guard) were left alone, since they're actually about the bar's pixel extent. Five band classes moved `round` → `butt` (D3) in the same commit, since the nesting this fix makes real is exactly what the cap overhang would blur.
**Shipped as:** `56bb389` — `fix(night): the daylight band and its ticks finally sit at sunrise and sunset`
**Result:** `js/daylight-render.test.js` 24/24.

### Slice 6: The eyes-adjust mark steps back from the edge

**Files:** `js/daylight.js`, `js/daylight-math.js`
**Decisions:** D5 (margin 30 → 60 min), D1 (margin value)
**What happened:** The adaptation mark and the domain margin were both anchored to `astronomicalDusk`, so at the original 30-minute margin the mark always landed exactly 10 minutes from the edge — measured at x = 570.0–570.5px on a bar ending at 576. Widened the margin to 60 so the mark sits 40 minutes inside the edge, and gave its label its own row, clear of both the "now" row and the sunrise/sunset row.
**Shipped as:** `4c02070` — `fix(night): the eyes-adjust mark steps back from the edge`

### Slice 7: The moon band stops claiming light in broad daylight

**Files:** `js/daylight.js`
**Decisions:** D4
**What happened:** `computeMoonBandRuns` gated only on lunar altitude. Gated it on solar altitude too — skip `[civilDawn, civilDusk]` (or the sunrise/sunset fallback) — and flush the in-progress run at that boundary so a run never bridges the gap.
**Shipped as:** `1022160` — `fix(night): the moon band stops claiming light in broad daylight`

### Slice 8: The margin stops padding the bar with dead space

**Files:** `js/daylight-math.js`
**Decisions:** D2
**What happened:** Made the margin conditional on `astronomicalDawn`/`Dusk` existing for that side, per D2's reasoning (a fallback rung isn't "true dark," so it gets no margin to make room for a segment that was never going to draw).
**Shipped as:** `ce22b20` — `fix(night): the margin stops padding the bar with dead space`

### Slice 9: The night bar's labels finally clear AA

**Files:** `css/daylight.css`, `js/muted-contrast.test.js`
**Decisions:** supports D8 (the new facts need to be legible, not just present)
**What happened:** `.dl-bar-label-adapt` shipped at 2.05:1 against parchment — `--stone` tops out at 3.95:1 at any opacity, so the token itself moved to `--ink`. `muted-contrast.test.js` had never walked `daylight.css`, so this was invisible to it; extending the sweep there found two siblings failing the same way (`.dl-bar-label`, `.dl-bar-label-now`) plus a second bug the sweep's cascade-modeling caught: the constellation override restated `fill` but not `fill-opacity`, so the light-mode opacity was silently multiplying back in.
**Shipped as:** `867dd83` — `fix(a11y): the night bar's labels finally clear AA`

### Slice 10: The bar's accessible name finally describes the whole night

**Files:** `js/daylight.js`
**Decisions:** D8
**What happened:** Split the moon-band renderer into a pure `computeMoonBandRuns` (sampling, no DOM) and `paintMoonBand` (paints the runs) so `titleText` could ask whether the moon band has anything visible to describe, without re-sampling the domain a second time. Each new clause gated on the field that decides whether the corresponding element draws.
**Shipped as:** `e2dbba9` — `fix(a11y): the bar's accessible name finally describes the whole night`

### Slice 11: The night's facts get a voice outside the SVG

**Files:** `js/daylight.js`
**Decisions:** D8
**What happened:** `recompute()` gained the plain-language annotation and `moonBrightnessAtAdapt`. Surfacing this cost three more `timeInTz()` calls per `recompute()`, and building a fresh `Intl.DateTimeFormat` per call turned out to cost ~3ms each in this environment — enough to push `recompute()`'s median past its 0.5ms budget. Fixed at the root: formatters are now cached per `(ianaTz, clockFmt)` pair instead of rebuilt per call, which also speeds up every pre-existing call site.
**Shipped as:** `ce1d454` — `fix(a11y): the night's facts get a voice outside the SVG`

### Slice 12: The rename finally reaches every corner

**Files:** `js/daylight-math.js`, `js/daylight-math.test.js`, `css/daylight.css`, `js/daylight.js`, `js/daylight-perf.test.js`, `js/daylight-render.test.js`, `sitemap.xml`, `llms.txt`
**Decisions:** D7 (completes it; the `PRODID`-orphaning belief is retracted here)
**What happened:** Four leftover header comments still said "Daylight Walk Budget." The ICS `PRODID` and its pinning assertion were updated. `sitemap.xml`'s `/daylight/` `lastmod` moved to the day's date per the repo's "only NEW or genuinely modified URLs get today's date" convention.
**Shipped as:** `4d8fc13` — `fix(daylight): the rename finally reaches every corner`

### Slice 13: `kFromPhase` joins `moon-lux.js`

**Files:** `js/moon-lux.js`, `js/moon-lux.test.js`, `js/daylight.js`, `js/moonpath.js`
**Decisions:** D6 (completes it)
**What happened:** Two changes to the same file. First, a correction: `js/moon-lux.js`'s header claimed `js/moonpath.test.js` as behaviour-preserving proof for both `moonLuxAt` and `luxBracketFor`, but `moonpath.test.js` only ever asserted `moonLuxAtCoord` is `typeof === 'number'` and `>= 0` for the former — weak enough that a stub returning `0.0` would pass. Confirmed by mutation. The header now cites `moon-lux.test.js`'s own value assertions for `moonLuxAt`. Second, a real promotion: `kFromPhase` moved here from duplicate inline copies in `js/daylight.js` and `js/moonpath.js` (D6).
**Shipped as:** `e930003` — `refactor(moon): kFromPhase joins moon-lux.js, and its header stops overclaiming`

### Slice 14: The fallback rungs prove themselves through real skies

**Files:** `js/daylight-math.test.js`
**Decisions:** D1 (verification)
**What happened:** The fallback chain (D1) had only been exercised through hand-nulled fixture objects, never through the actual astronomy pipeline that produces those nulls in practice. Sampled `recompute()` across latitudes near the June solstice to find two genuinely reachable cases: lat 55°/lon 10° (rung 2 — falls back to civil) and lat 50°/lon 10° (rung 1 — falls back to nautical).
**Shipped as:** `f9b213e` — `test(daylight): the fallback rungs prove themselves through real skies`

### Slice 15: Polish — debounced inputs, a quieter legend

**Files:** `js/daylight.js`
**Decisions:** none new; hygiene
**What happened:** Two guardrails from the cleanup review, neither a live bug. Lat/lon/distance/elevation inputs now coalesce keystrokes via `requestAnimationFrame`, mirroring `js/moonpath.js`'s existing date-scrubber pattern. The moon legend now matches `renderSVG`'s own bail-out in reverse mode when `latestDepartUTC` is null, instead of describing moon ticks the bar never drew (affected 18 of 365 days at Burgos).
**Shipped as:** `1f75926` — `polish(daylight): the bar keeps up with the keys, and the legend stops overtalking`

---

## Slice 16: This spec and plan

**Files:** `docs/specs/2026-08-12-night-bar.md`, `docs/plans/2026-08-12-night-bar-plan.md`
**What happened:** Written from `git log main..HEAD`, the diff, the shipped code, and the code-review artifact at `/tmp/compound-engineering/ce-code-review/20260812-103004-6d7b0175/` — documentation only, no code touched.

## Slice 17 (deferred): real browser render + re-review changed scope

**Status:** Not started.
**What's needed:** Every verification to date — this plan included — is numeric and test-based: a fake-DOM harness, contrast arithmetic against parsed CSS, pure-function assertions. No one has opened `/daylight` in an actual browser since this branch began. Given the May precedent the spec records (a geometrically-broken feature read as "correctly subtle" under a visual-only check), the reverse gap — code proven correct numerically but never actually looked at — is the deliberately-named remaining risk. This needs a human with a real browser: light, dark, and constellation themes; a stage with the full twilight sequence and one near a fallback rung; a re-review of whatever, if anything, the render surfaces that the numeric suites couldn't see.

---

## Verification (final state, 2026-08-12, `1f75926`)

| Suite | Result |
|---|---|
| `node js/daylight-render.test.js` | 65/65 |
| `node js/daylight-math.test.js` | 65/65 |
| `node js/muted-contrast.test.js` | 5/5 |
| `node js/moon-lux.test.js` | 20/20 |
| `node js/moonpath.test.js` (regression) | 362/362 |
| `node js/sunpath-math.test.js` (regression) | 111/111 |
| `node js/daylight-perf.test.js` | median 0.13–0.17ms (budget 0.5ms) — pass; p99 8.9–33.1ms (budget 5ms) across repeated runs — noisy, reproduces identically on `main`, pre-existing and unrelated to this branch |
| `node scripts/validate-metadata.mjs` | 22 pages, 18 JSON-LD blocks, no issues |
| `grep -rl "Daylight Walk Budget" …` outside `docs/` | no matches |

## What this plan does NOT include

- **The darkness ribbon, "the night worth walking," or the finishing layer.** The other three night-instrument slices named in the darkness-audit spec. Not started; each is its own future spec.
- **Any change to `assets/darkness/` or `scripts/darkness/`.** This branch is architecturally independent of that gate's artifact — see spec, "Relationship to the darkness gate."
- **A fix for the six carried-forward AA failures** (`.daylight-input::placeholder`, `.daylight-unit-label`, `.dl-routes-index`, `.dl-prefs-toggle`, `.dl-prefs-legend`, `.dl-share-hint`). Named in the spec so they aren't lost; out of scope for this branch, which touches the bar, not the picker panel or footer.
- **A real browser render.** Slice 17, above — the one item this plan does not close out.
