# After the Sun — Implementation Plan

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax. Spec:
> `docs/specs/2026-08-13-after-the-sun.md`. Read it first — its D-numbers are the contract.

**Goal:** `/sunpath` gains the half of its own subject it has never covered. A curve of true
dark across the year, driven by the latitude picker it already has; ~~and the existing
turnings calendar learns to say what each hinge's night is actually like~~ (that half is
Task 5, cut by the budget gate — see D6).

**Status: complete.** Tasks 1–4, 6 and 7 shipped; Task 5 was cut by its own first step.

**Architecture:** New pure math in `js/sunpath-math.js` (dark-hours series, zero-dark runs).
Rendering beside the existing sections in `js/sunpath-tools.js`. No new module, no new
vendor dependency, no new data file.

**Tech stack:** Plain ES5-flavoured IIFE modules, hand-rolled harnesses run as
`node js/foo.test.js`. Existing: `SunPathMath.astronomicalDuskUTC` / `astronomicalDawnUTC`,
`window.Turnings.getTurningsForYear`, `DAWN_LATITUDES`, and — for §B only —
`MoonLux` + `NightMath.nightMoonLux`.

## Global constraints

- **Budget: +12 KB gzipped for the whole feature**, measured per-file (not concatenated —
  that understates it by ~5%). `/sunpath` is **90.63 KB** today, measured with Node `zlib`
  at level 9 — the tool the budget test uses. (This line first said 90.9 KB, which was an
  Apple `gzip -9` figure; mixing the two implementations is the error the spec's Result
  section records.) If §B will not fit, §B is cut before the budget is raised. This is D9
  and it is binding.
- **A night with no true dark renders as an absence, never a zero** (D5). A zero-height bar
  looks exactly like a very short night.
- **Assertions read emitted elements, not the model that produced them** (D5). This is the
  mechanism behind seven shipped bugs on the sibling page.
- Reuse `DAWN_LATITUDES` unchanged — same five latitudes, same 45° default (D2).
- A guard that survives deletion with the suite green is not a guard. Mutation-check
  everything.
- `assets/**` is read only. Nothing here writes data.
- §C does not exist. Its gate ran and failed (D7).

## Decision summary (from the spec)

Both cuts happened after this plan was written. The rows below are the decisions as they
stand; the superseded wording is kept struck through, because the reasoning is the useful
part and the spec keeps it in full.

| | |
|---|---|
| D1 | ~~Two changes: §A one new section, §B extends the turnings calendar~~ **One change: §A only.** §B cut by D6, §C by D7 |
| D2 | §A reuses the existing picker, latitudes and 45° default |
| D3 | "Your sky" extends existing geolocation; never a blocking prompt |
| D4 | True dark = astronomical night, sun below −18°, stated once — exactly 0 h when there is none, exactly 24 h when there is nothing but |
| D5 | Zero-dark is an absence, not a zero; assert on emitted elements |
| D6 | ~~§B states per turning: dark duration, and whether a moon is up~~ **§B is CUT.** Its moon modules are +10.50 KB against a budget already 4.91 KB spent |
| D7 | §C cancelled by its own audit |
| D8 | No star counts, no Milky Way — carried forward |
| D9 | +12 KB gzipped, total |
| D10 | One accessible name, mirrored outside the SVG; marks are named in prose |
| D11 | Not a forecast; no "best night" ranking; no per-site claim |

## File structure

| file | responsibility |
|---|---|
| `js/sunpath-math.js` | add `darkHoursOn(lat, date)`, `darkHoursYear(lat, year)`, `zeroDarkRuns(series)` — all pure |
| `js/sunpath-math.test.js` | the D-table at five latitudes; the zero-dark runs; the polar 24-h case; the external twilight anchors |
| `js/sunpath-tools.js` | `setupDarkHours()` beside `setupDawnSweep()`; ~~the turnings extension~~ (Task 5, cut) |
| `js/sunpath-render.test.js` | **new.** Fake-DOM geometry assertions on emitted elements |
| `js/sunpath-budget.test.js` | **new.** The +12 KB gate, per file, one gzip implementation |
| `css/sunpath.css` | the curve, the zero-dark treatment, the turning marks |
| `sunpath/index.html` | §A's section; ~~§B's added lines~~ |

---

## Task 1: The dark-hours series — red, then green

**Files:** `js/sunpath-math.test.js`, `js/sunpath-math.js`

- [x] Write failing tests for `darkHoursOn(lat, date)` → hours of astronomical night
      following that date, and `darkHoursYear(lat, year)` → 365/366 entries. Pin the spec's
      table at all five picker latitudes, ±0.1 h:

      | lat | Jun 21 | Sep 23 | Dec 21 | zero-nights |
      |---|---|---|---|---|
      | 0 | 9.4 | 9.6 | 9.4 | 0 |
      | 23.5 | 7.5 | 9.4 | 10.6 | 0 |
      | 45 | 3.3 | 8.5 | 11.7 | 0 |
      | 60 | 0.0 | 6.9 | 12.6 | 123 |
      | 70 | 0.0 | 3.3 | 13.6 | 177 |

- [x] Run: `node js/sunpath-math.test.js` — expect FAIL, function not defined.
- [x] Implement both. A night whose window never closes returns **0**, and the caller must
      be able to tell 0-because-no-night from a short night — see Task 2. *(Superseded by
      D12: exactly 0 holds across the band where every night ends, and `null` — not modelled
      — above 84.5°, because the two opposite conditions behind that `0` cannot be told
      apart reliably at those latitudes. See the spec.)*
- [x] Run — expect PASS.
- [x] Commit.

## Task 2: Zero-dark runs, as first-class objects

**Files:** `js/sunpath-math.test.js`, `js/sunpath-math.js`

The single most likely way this feature ships wrong is a zero drawn as a very short night
(D5). The data model prevents it before the renderer can get it wrong.

- [x] Write failing tests for `zeroDarkRuns(series)` → `[{startIndex, endIndex, days}]`, the
      contiguous stretches with no astronomical night. Pin: 0 runs at 0/23.5/45; **one** run
      of 123 days at 60; **one** run of 177 days at 70. Assert the runs are contiguous and
      centred on the June solstice.
- [x] Run — expect FAIL.
- [x] Implement.
- [x] Run — expect PASS.
- [x] Commit.

## Task 3: §A renders

**Files:** `js/sunpath-render.test.js` (new), `js/sunpath-tools.js`, `sunpath/index.html`,
`css/sunpath.css`

- [x] Write failing render tests against a fake DOM, reading **emitted attributes**:
      the curve has one point per day; the zero-dark stretch emits a **distinct element**
      (not a zero-height segment of the curve); at 0° the curve is visibly flat (max−min
      ≤ 0.3 h in drawn units); the four turnings are marked; `role="img"` label matches the
      visible summary.
- [x] Run — expect FAIL.
- [x] Implement `setupDarkHours()` beside `setupDawnSweep()`, reusing `DAWN_LATITUDES` and
      the existing button idiom verbatim. Add the section to the page.
- [x] Run — expect PASS.
- [x] **Mutation-check the zero-dark treatment**: render the zero run as a zero-height
      segment instead → assertions must go red.
- [x] Commit.

## Task 4: "Your sky" folds in

**Files:** `js/sunpath-tools.js`, `js/sunpath-render.test.js`, `js/sunpath.js`

> **Corrected 2026-08-14 after review.** This task shipped a *clause*, not a redraw. The
> first bullet below said "the curve redraws for it" and was ticked; no such path was ever
> built. `drawDarkHours` has exactly two call sites — a picker click and the 45° default —
> and `js/sunpath.js` calls only `yourSkyDarkClause`, which returns a sentence and touches
> no DOM. The comment in `js/sunpath-tools.js` and the spec's own departures list repeated
> the same claim. What ships satisfies D3; what the box claimed does not exist.

- [x] Write failing tests: with a supplied latitude the *your-sky clause* reports it and
      names the longest night ~~the curve redraws for it~~; with geolocation refused or
      absent the section behaves exactly as the picker case; **no path blocks on a
      prompt** (D3).
- [x] Run — expect FAIL.
- [x] Implement against the existing `yourSky` path in `js/sunpath.js`.
- [x] Run — expect PASS. Mutation-check the refusal path.
- [x] Commit.

## ~~Task 5: §B — the turnings, after dark~~ — CUT 2026-08-13 by the budget gate (D6)

**Do not build this.** Its first step ran and it failed: `moon-lux.js` + `night-math.js` are
**+10.50 KB gzipped** against a +12.00 KB budget that §A had already spent 4.91 KB of. D9
says §B is cut before the budget is raised, and it was — not deferred behind a placeholder.
See D6 in `docs/specs/2026-08-13-after-the-sun.md` for the measurement and for what the
cheap version would be if the turnings ever want their night.

- [x] Measure `/sunpath` per-file gzipped, with and without the two modules. Record both.
- [ ] ~~Write failing tests: for each of the four turnings at the selected latitude, the
      extension states the dark duration and whether a moon is up, using
      `NightMath.nightMoonLux` (illuminance across the dark window, **not** phase — D6).~~
- [ ] ~~Run — expect FAIL.~~
- [ ] ~~Implement as an extension of the existing calendar section, not a new section.~~
- [ ] ~~Run — expect PASS.~~
- [ ] ~~Commit.~~

## Task 6: Accessibility and the text equivalent

**Files:** `js/sunpath-render.test.js`, `js/sunpath-tools.js`

- [x] Write failing tests: ~~one `role="img"` accessible name per figure~~ (departed from —
      the plot ships `aria-hidden="true"`, this page's own idiom; see "Departures from the
      spec, and why"), mirrored into real DOM text outside the SVG; the name states the
      zero-dark stretch and every marked turning (D10 — the sibling page shipped marks with
      no textual analogue; do not repeat it); no per-element `<title>` inside the hidden
      subtree.
- [x] Run — expect FAIL.
- [x] Implement.
- [x] Run — expect PASS. Mutation-check: drop the zero-dark clause from the label → red.
- [x] Commit.

## Task 7: Contrast, and the page-weight record

**Files:** `js/muted-contrast.test.js`, `js/sunpath-budget.test.js`, the spec's Result section

- [x] Add §A's new colours to the existing sweep: over light parchment, dark parchment and
      `#0a0a12`. Any mark carrying essential information clears **3:1** (WCAG 1.4.11) — the
      sibling page learned this the hard way, and learned that a mark on a full-range ramp
      cannot clear it with one colour.
- [x] Measure `/sunpath` per-file gzipped, before and after, and record it in the spec's
      Result section with the commit it was measured at — whether or not it is comfortable.
- [x] Assert the delta against the +12 KB budget in a test, so it cannot drift silently.
- [x] Commit.

---

## Verification before PR

- All suites green: `for t in js/*.test.js; do node "$t"; done`, plus
  `.venv/bin/python scripts/darkness/bake_darkness_test.py`, plus `.githooks/pre-commit`.
  Note `js/daylight-perf.test.js` is load-sensitive — never judge it while agents run.
- The D-table reproduced from the **drawn** output at all five latitudes.
- Zero-dark asserted at 60° and 70° specifically — the case a curve renders most plausibly
  wrong.
- Every new guard mutation-checked, with the pass/fail delta recorded.
- `/ce-code-review` before the PR, as with `#15`–`#18`.

## What this plan does NOT include

The drift section (cancelled, D7), star counts or Milky Way (D8), any change to the hero
globe, analemma or archive tabs, a second latitude vocabulary, and any new vendor
dependency.
