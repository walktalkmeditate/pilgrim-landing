# The Night Worth Walking — Implementation Plan

> **For agentic workers:** steps use checkbox (`- [x]`) syntax for tracking. Spec:
> `docs/specs/2026-08-13-night-worth-walking.md`.

**Goal:** Draw a moon strip beneath the darkness ribbon on the same kilometre axis, so a
reader can see which nights of their own walk have a dark sky and which have a lantern —
and slide the start date to hunt for the alignment they want.

**Architecture:** Pure math in `js/daylight-math.js` (night schedule, per-night moon,
selection and suppression), rendering in `js/daylight.js` alongside `renderRibbon`, styling
in `css/daylight.css`. No new page, no new dependency, no change to `assets/`.

**Tech stack:** Plain ES5-flavoured IIFE modules, hand-rolled test harnesses run as
`node js/foo.test.js`. Existing astronomy: `SunPathMath.moonAltAzAt`,
`astronomicalDuskUTC` / `astronomicalDawnUTC`, `MoonLux.moonLuxAt` / `kFromPhase` /
`luxBracketFor`, `Moon.getMoonPhase`.

## Global constraints

- `assets/darkness/*.json` and `assets/daylight/*.json` are committed data — **read only**.
- The moon strip shares the ribbon's axis exactly: `RIBBON_X1 = 48`, `RIBBON_X2 = 552`.
- Contrast floors: **1.25:1 adjacent, 3:1 extremes**, over parchment, dark, and `#0a0a12`,
  measured at the duty the renderer actually produces — never a modelled ramp.
- Lux bracket boundaries are `luxBracketFor`'s existing 0.005 / 0.05 / 0.2, not new ones.
- Shikoku's daily distance constant is **25 km**, stated in code and copy.
- A guard that survives deletion with the suite green is not a guard — mutation-check
  every one.
- No commit may leave a suite red.

## Decision summary (pulled from spec)

| | |
|---|---|
| D1 | Two strips, one km axis, same 48–552 inset |
| D2 | Mean moon lux across astronomical night, 25 samples — not phase |
| D3 | Stage = night on six routes; shikoku = `round(spanKm / 25)` nights; pace is not an input |
| D4 | Cumulative `distanceKm` where it tiles within 1.0 km; waypoint span on shikoku; fail loudly otherwise |
| D5 | Shikoku blocks state a phase range and look distinct from a night |
| D6 | `dl-date` is night 1; sliding it moves only the moon strip |
| D7 | Two clauses max, both suppressed when unearned |
| D8 | Warm/silver ramp, five steps on `luxBracketFor`'s boundaries |
| D9 | Reacts to route + date; not stage, not pace |
| D10 | `role="img"` label is the text equivalent |
| D11 | Custom routes and shape-invalid artifacts hide the section |

## File structure

| file | responsibility |
|---|---|
| `js/daylight-math.js` | export `darknessBandStatsInRange` (exists, unexported); add `stagePlacements`, `nightSchedule` — both pure |
| `js/night-math.js` | **new.** The astronomy-composing math: `nightMoonLux`, `moonBandForLux`, `buildNightCells`, `selectNotableNights`, `nightSummarySentence` |
| `js/daylight-math.test.js` | pure-math coverage incl. the two suppression routes |
| `js/daylight.js` | `renderMoonStrip`, wiring into the route/date path |
| `js/daylight-render.test.js` | SVG geometry assertions against the fake DOM |
| `js/daylight-ribbon-wiring.test.js` | date-slide and no-react-to-stage/pace wiring |
| `css/daylight.css` | the silver ramp, block styling, blank-gap styling |
| `js/muted-contrast.test.js` | the silver ramp joins the real-duty sweep |
| `daylight/index.html` | the strip's container and label |

**Why a new module.** `js/daylight-math.js` states "No external dependencies" in its
header and owns the pure walking and placement math; `nightMoonLux` needs
`SunPathMath`, `MoonLux` and `Moon`. Diluting the pure module or burying testable math in
the render module are both worse than one small new file. Its `<script>` tag is added in
Task 5, when the page first uses it, not before.

Note the precedent cited during the slice — `js/moon-lux.js` in Slice 1 — is only a
partial match: that split was motivated by *multi-page* bundle sharing (`/moonpath` and
`/daylight` both load it, so `/daylight` avoids moonpath.js's 69 KB). `night-math.js` is
loaded by `/daylight` alone, so the header-contract argument above is the whole
justification, not the bundle-size one.

---

## Task 1: Stage placement — red, then green

**Files:** `js/daylight-math.test.js`, `js/daylight-math.js`

- [x] Write failing tests for `stagePlacements(stages, coveredKm)`: returns
      `[{index, loKm, hiKm, nights}]`; uses cumulative `distanceKm` when
      `|Σ distanceKm − coveredKm| <= 1.0`; uses first/last waypoint `kmFromStart` otherwise;
      **throws** when neither fits. Pin the seven real routes: six cumulative, shikoku
      by span with 288.1 km of gaps and 32 nights in blocks of 1–7.
- [x] Run: `node js/daylight-math.test.js` — expect FAIL, function not defined.
- [x] Implement `stagePlacements`. Export `darknessBandStatsInRange` in the same change
      (it exists at `js/daylight-math.js:655` but is absent from the `api` object).
- [x] Run: expect PASS.
- [x] Commit.

## Task 2: The night schedule and per-night moon

**Files:** `js/daylight-math.test.js`, `js/daylight-math.js`

- [x] Write failing tests for `nightSchedule(placements, startDate)` → one entry per night
      with `{nightIndex, date, loKm, hiKm, isBlock, blockNights}`, and for
      `nightMoonLux(date, lat, lon)` → `{mean, peak, usableFrac, hours}` from 25 samples
      across astronomical dusk→dawn. Pin camino-frances from 2026-10-12: 33 nights, mean
      lux spanning 0.0000–0.2333, night 15 at 100% usable.
- [x] Run — expect FAIL.
- [x] Implement both. `nightMoonLux` returns `null` when the dark window does not close
      (high latitude, midsummer); callers must handle it rather than drawing NaN.
- [x] Run — expect PASS.
- [x] Commit.

## Task 3: Banding and the notable-night selection, with suppression

**Files:** `js/daylight-math.test.js`, `js/daylight-math.js`

- [x] Write failing tests for `moonBandForLux(lux)` on `luxBracketFor`'s boundaries
      (0 / 0.005 / 0.05 / 0.2), boundary values landing in the **brighter** band to match
      the ribbon's documented tie rule, and for `selectNotableNights(schedule)`:
  - camino-frances → sky night 27 (O Cebreiro→Triacastela), lantern night 15
  - **camino-ingles → lantern clause suppressed** (brightest instant 0.0380 lux, highest
    nightly mean 0.0067 — neither reaches the 0.05 usable threshold)
  - **kumano-kodo → sky clause suppressed** (flat band 4.00, spread < 1 band)
  - a one-night walk → both suppressed
- [x] Run — expect FAIL.
- [x] Implement. Suppression is a returned absence, not an empty string.
- [x] Run — expect PASS.
- [x] Commit.

## Task 4: The sentence

**Files:** `js/daylight-math.test.js`, `js/daylight-math.js`

- [x] Write failing tests for `nightSummarySentence(schedule, notable, routeLabel)`:
      states the walk length in nights, names only unsuppressed clauses, and — the
      ribbon's hardest-won lesson — **the nights it names must be the nights the strip
      will draw**. Assert across all seven routes.
- [x] Run — expect FAIL.
- [x] Implement following `darknessSummarySentence`'s prose shape.
- [x] Run — expect PASS.
- [x] Commit.

## Task 5: The strip renders

**Files:** `js/daylight-render.test.js`, `js/daylight.js`, `daylight/index.html`

- [x] Write failing render tests: first cell `x1 === 48`, last `x2 === 552`, cells tile with
      no gaps *except* shikoku's 288.1 km of real gaps which must be absent elements (not
      zero-width ones), blocks carry a distinct class, `role="img"` label matches the prose.
- [x] Run — expect FAIL.
- [x] Implement `renderMoonStrip` beside `renderRibbon`; add the container to the page.
- [x] Run — expect PASS.
- [x] Commit.

## Task 6: Wiring — the date slides it, the stage and pace do not

**Files:** `js/daylight-ribbon-wiring.test.js`, `js/daylight.js`

- [x] Write failing wiring tests: changing `dl-date` re-renders the moon strip and leaves
      the ribbon's elements byte-identical; changing `dl-stage` and `dl-pace` change
      neither; a custom route hides both; a shape-invalid artifact hides both with exactly
      one warning; the `_currentRoute` currency guard holds for a stale in-flight load.
- [x] Run — expect FAIL.
- [x] Implement the wiring.
- [x] **Mutation-check each guard**: delete it, confirm the named assertions go red,
      restore, confirm green. Record the deltas in the commit message.
- [x] Run — expect PASS.
- [x] Commit.

## Task 7: The silver ramp and the contrast sweep

**Files:** `css/daylight.css`, `js/muted-contrast.test.js`

- [x] Write failing contrast tests: the silver ramp over parchment, dark parchment and
      `#0a0a12`, at the duty real merged runs produce, asserting 1.25:1 adjacent and 3:1
      extremes — and asserting the silver ramp is distinguishable from the darkness ramp
      so the two strips cannot be confused.
- [x] Run — expect FAIL.
- [x] Implement the ramp; tune alphas until the floors clear.
- [x] Run — expect PASS.
- [x] Commit.

## Task 8: Page weight, recorded

**Files:** the spec's Result section

- [x] Measure `/daylight` gzipped JS+CSS before and after this slice (it was 77.7 KB after
      Slices 1–2, up 49% from 52.1 KB).
- [x] Record the number in the spec's Result section whether or not it is comfortable —
      the spec's open question exists so this is not decided by accident.
- [x] Commit.

---

## Verification before PR

- All suites green via `for t in js/*.test.js; do node "$t"; done`, and `.githooks/pre-commit`.
  Note: `js/daylight-perf.test.js` is load-sensitive — never judge it while agents run.
- Stated-vs-drawn parity for the sentence against the strip on all seven routes.
- Suppression confirmed on camino-ingles and kumano-kodo specifically.
- Every new guard mutation-checked.
- `/ce-code-review` before the PR, as with Slices 1–2.

## What this plan does NOT include

Star counts and Milky Way visibility (Slice 4), weather or cloud, a best-month
recommendation, per-night pages, ICS changes, and any modification to `assets/`.
