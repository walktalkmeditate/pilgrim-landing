# The Night Worth Walking

**Slice 3 of the night instrument.** Spec written 2026-08-13, before implementation.

Predecessors: Gate 0 (`2026-08-11-darkness-data-audit.md`, PR #15), the night bar
(`2026-08-12-night-bar.md`, PR #16), the darkness ribbon
(`2026-08-12-darkness-ribbon.md`, PR #17). This slice crosses the last two.

---

## Problem

The ribbon says where the route is dark. The bar says how long a given night lasts and
when the moon is up. Neither answers the question a pilgrim actually asks before booking
a flight: **which nights of *my* walk will be worth being outside for?**

That question has two incompatible answers, and the instrument must hold both rather than
average them into a score:

- **For the sky** — you want the moon *gone*. A full moon washes out the Milky Way as
  thoroughly as a town does.
- **For the walking** — you want the moon *present*. 0.2 lux is enough to walk a known
  path without a torch.

This is the inversion the whole night instrument started from: DarkHours wants the moon
gone; a pilgrim wants a lantern. Slice 3 is where that tension becomes the instrument.

### What is already built

Nothing in this slice needs new astronomy. All of it exists:

| Need | Source |
|---|---|
| per-stage darkness over a km range | `darknessBandStatsInRange(runs, lo, hi)` — **currently not exported** |
| moon phase for a date | `Moon.getMoonPhase(date)` |
| moon altitude | `SunPathMath.moonAltAzAt(utc, lat, lon)` |
| moon illuminance | `MoonLux.moonLuxAt(k, altitudeDeg)`, `MoonLux.kFromPhase(phase)` |
| the dark window | `SunPathMath.astronomicalDuskUTC` / `astronomicalDawnUTC` |
| lux → prose brackets | `MoonLux.luxBracketFor(lux)` |

---

## Decisions

### D1 — Two strips, one kilometre axis

The moon strip renders directly beneath the darkness ribbon, on the **same x-axis, the
same 48–552 inset, and the same run geometry**. Darkness is a property of *place*; moon is
a property of *time*; the walk is what maps one onto the other. Sharing the axis is the
whole argument of the slice — the reader sees, at a glance, where a dark sky and a dark
moon coincide.

Rejected: a nights table (complete but reads as reference, and 33 rows buries the finding)
and a standout-nights-only list (quiet, but discards the instrument).

### D2 — The moon strip encodes moonlight *during that night's dark window*, not phase

A full moon that never rises gives no light. Encoding phase would be the easy, wrong
choice. Each night's value is the **mean moon illuminance across astronomical night**
(dusk at −18° to the following dawn at −18°), sampled at 25 points.

Measured on camino-frances from 2026-10-12, this spans 0.0000 → 0.2333 lux across the
walk — the full usable range, and it decouples from phase exactly where it should.

### D3 — A stage is a night, except on shikoku, where a stage is a block of nights

**Six routes: one stage = one night.** Their stages are day-sized (11–40 km, median 13–25)
because that is how those routes are published and walked, and it is how the rest of
`/daylight` already treats a stage — the stage picker, the timings and the ICS export are
all stage-scoped. Deriving a different night count here would desync this strip from the
page around it.

**Shikoku: one stage = `round(spanKm / 25)` nights**, where `spanKm` is the waypoint span
D4 places it by, and 25 km is a stated daily distance recorded here so it is a documented
assumption rather than a hidden constant. Its stages are 19–200 km; a 126 km block is about
five nights, and the copy says *about*.

**Pace is deliberately not an input.** `PACE_PRESETS` is km/h (3 / 4 / 5), not km/day, so
converting it to nights would require inventing an hours-per-walking-day constant on top of
the 25 km one. One documented assumption is better than two, and for six of seven routes it
buys nothing — their stages already are the day units.

The night count must use the **same distance measure D4 placed the stage by**. Mixing them
— cumulative `distanceKm` for nights, waypoint span for placement — would desync a cell
from its own extent on shikoku, where the two disagree by 173.2 km.

### D4 — Stage placement on the km axis: sum where it tiles, waypoints where it does not

Audited across all seven routes:

| route | Σ distanceKm | darkness coveredKm | placement |
|---|---|---|---|
| camino-frances | 763.7 | 763.7 | cumulative |
| camino-ingles | 111.6 | 111.6 | cumulative |
| camino-norte | 784.3 | 784.3 | cumulative |
| camino-portugues | 243.0 | 243.0 | cumulative |
| camino-primitivo | 262.9 | 262.9 | cumulative |
| kumano-kodo | 38.5 | 38.0 | cumulative (0.5 km slack) |
| **shikoku-88** | **907.3** | **1080.5** | **waypoint spans** |

Shikoku's `distanceKm` is an editorial per-stage estimate that under-counts by 173.2 km.
Its waypoints are route-cumulative and span 0 → 1080.5 exactly, so each stage takes its
extent from its first and last waypoint. The stages do **not** tile — there are 21–75 km
gaps between temple clusters, **288.1 km in total, 27% of the route**. Those gaps render as
**blank**, never interpolated, and the strip will visibly be more than a quarter empty.
That is the honest picture: the instrument claims only the stretches it has placed.

Measured consequence: shikoku yields 32 nights in blocks of 1–7, with per-block darkness
means spanning 2.34–4.00 — differentiated enough to be worth drawing.

Implementation must choose per route by testing `|Σ distanceKm − coveredKm| <= 1.0`, and
must fail loudly rather than silently falling back if neither method fits.

### D5 — Shikoku shows a moon range across each block, and says it is a block

A 200 km stage is roughly eight nights. Its cell states the range those nights span
(e.g. "waxing to full") rather than a single phase, and the block is visually distinct
from a single night. Shikoku's existing constraints carry forward unchanged: it is 49.8%
interpolated, has no held-out validation, renders dashed, and gets no per-kilometre claim.

Rejected: synthesising ~43 day-units at 25 km. That invents a walking schedule on the least
reliable route, which is what Gate 0 exists to prevent.

### D6 — The start date is the existing date control, and sliding it is the interaction

No new input. `dl-date` becomes night 1 of the walk. Changing it slides the entire moon
strip against a fixed darkness ribbon — a full lunation passes under a 33-night walk, so
the reader can hunt for the alignment they want. That interaction *is* the instrument.

### D7 — The closing sentence names at most two nights, and suppresses what it cannot claim

Following the ribbon's one-quiet-sentence pattern (its D10), not a legend or tooltips.

- **The sky night** — highest darkness with least moonlight.
- **The lantern night** — most usable moonlight.

Both clauses are **suppressed when unearned**:

- No lantern clause unless at least one night reaches **0.05 lux** (`luxBracketFor`'s
  `mid` threshold — "usable light along an open trail"). Verified necessary: camino-ingles
  is six nights, a fifth of a lunation, and its brightest instant across the whole walk is
  **0.0380 lux** — its highest nightly *mean* is 0.0067. Neither reaches usable. Naming a
  best lantern there would be a false claim.
- No sky clause unless the darkest and brightest nights differ by at least **one full
  band**. Verified necessary: kumano-kodo is a flat band 4.00 on all four nights, so
  "darkest night" would be arbitrary.
- A walk of one night gets no comparative clause at all.

When both are suppressed the section still renders — the strips carry the reading; only
the superlative is withheld.

### D8 — The moon strip must not read as a second darkness ribbon

Different visual language, deliberately: a warm/silver ramp against the ribbon's cool blue,
and five steps matching the ribbon's coarseness for rhythm. Boundaries follow
`luxBracketFor`'s established brackets rather than inventing new ones — 0 / 0.005 / 0.05 /
0.2 lux, which map to *none* / *barely usable* / *usable along an open trail* / *enough to
walk a known path*.

Moon lux is precisely computable, unlike darkness (±0.32 mag, ribbon D7). The strip is
coarse for visual rhythm, **not** because the underlying value is uncertain — and no copy
may imply otherwise in either direction.

### D9 — It reacts to the route and date pickers; not to stage, not to pace

The ribbon reacts to route only (its D13). This strip additionally depends on the start
date. It must **not** react to the stage picker — the walk is the whole route, and a reader
inspecting one stage's timings has not changed which nights they will walk — and per D3 it
does not react to pace either.

### D10 — Accessibility: the sentence is the text equivalent

As with the ribbon, the SVG carries `role="img"` with a label stating the walk length in
nights and the two named nights. Colour is never the only signal. Contrast floors match the
ribbon's: 1.25:1 adjacent, 2:1 extremes, across parchment, dark and `#0a0a12`.

**What marks a night, and what numbers it.** *Rewritten during the second review — the first
version of this paragraph became false when the strip started coalescing.*

- **The mark.** Adjacent cells that share a moon band are drawn as one `<line>`, because two
  abutting semi-transparent strokes composite a seam stronger than the real band steps
  around them. That was right, and it erased every true per-night boundary along with the
  false ones: 77% of named nights ended up inside a wider merged span, camino-frances drew
  33 nights as 7 lines, and the prose named "night 17" over a bar covering a third of a
  **kilometre** axis on which 17 of 33 cannot be interpolated. So the two nights the
  sentence names — and only those — carry a `.dl-moon-tick`: a short vertical stroke at the
  centre of that night's **own cell extent**, not the merged span's. A suppressed clause
  draws no mark, so the marks and the sentence always name the same nights. The mark is
  shorter than the band is tall, so band colour shows above and below it and it cannot read
  as the boundary the coalescing exists to remove. It is measured against every band it can
  sit on, on all three backgrounds (AC #12).
- **The numbering.** One scheme, everywhere: a night's number is its number in the schedule,
  counted from the start date, which is the number a reader can carry to a calendar. The
  label states the walk's own length in nights and, when the strip cannot draw all of them,
  says separately how many it drew — it does not renumber. The alternative produced
  "2 nights from 21 June. Night 3 holds usable moonlight…" over an axis reading night 1 to
  night 3: three true statements that contradict each other read left to right.

**The phase range and the moon band are two different claims, and the sentence says so.**
`getMoonPhaseName`'s "Last Quarter" bucket spans 0.6875–0.8125, so it can call a 30%-lit
waning crescent a quarter moon while the band beside it is band 1 — 40 of 366 shikoku start
dates read "…last quarter to new moon, with barely a trace of moon…". Both statements were
true and they looked like one claim contradicting itself. A phase is where the moon is in
its month; a band is how much of it was above the horizon while the sky was dark. The
sentence now says the second as "in the dark hours", and frames the first as the moon's own
passage ("under a moon going from last quarter to new").

### D11 — Custom routes and missing data show nothing

A custom route has no stages and no darkness artifact; the section stays hidden, exactly as
the ribbon does. A route whose artifact fails the ribbon's shape guard hides this section
too — one malformed-artifact path, not two.

---

## Non-goals

- **No "best time of year to walk" recommendation.** The instrument answers about a walk
  the reader is already planning. Ranking months is a different, louder product.
- **No cloud, no weather.** Sky brightness is not visibility.
- **No star counts, no Milky Way visibility claim.** Deferred to Slice 4, as in ribbon D5.
- **No per-night page, no calendar export.** The ICS export stays stage-scoped.
- **No change to `assets/darkness/`.** It is validated baked output.

---

## Acceptance criteria

1. The moon strip shares the ribbon's x-axis, inset (48–552) and run geometry exactly.
2. Each night's value is mean moon lux across astronomical night, 25 samples, not phase.
3. Six routes render one night per stage; shikoku renders `round(spanKm / 25)` nights per
   stage, computed from the same distance measure D4 placed that stage by.
4. Six routes place stages by cumulative distance; shikoku places by waypoint span; a route
   matching neither within 1.0 km fails loudly.
5. Shikoku's inter-cluster gaps render blank, never interpolated.
6. Shikoku's multi-night blocks are visually distinct from a night, and a block **that the
   sentence names** states the phase range it spans. *Narrowed during the review:* the
   original wording said every block states a range. Shikoku has ten cells, seven of them
   blocks, and this sentence is also the `role="img"` label — ten phase clauses would break
   D7's two-clause cap and bury the reading. Consequence, stated rather than hidden: on a
   start date where neither named night is a block, shikoku states no range at all.
7. Changing `dl-date` slides the moon strip; the darkness ribbon does not move.
8. Changing the stage picker or the pace picker changes neither strip.
9. The lantern clause is absent when no night reaches 0.05 lux (verify on camino-ingles).
10. The sky clause is absent when darkest and brightest differ by under one band (verify on
    kumano-kodo).
11. Stated nights in the sentence match the nights the strip draws, on all seven routes.
    *Corrected during the second review:* the check that carried this label built its night
    set from **cells**, which stopped being the same population as the emitted `<line>`s the
    moment coalescing landed. It is now measured on the drawn strip in
    `js/daylight-render.test.js` — every night named in the emitted `aria-label` lies between
    the two emitted axis labels, and the mark for it falls on a span that was actually drawn.
    The cells-based version stays in `js/daylight-math.test.js` as the prose-vs-schedule
    invariant it really is, under that name.
12. Contrast: 1.25:1 adjacent, **2:1** extremes, over parchment, dark, and `#0a0a12`,
    measured at the duty the renderer actually produces (ribbon F6's lesson).
    *Corrected during the review:* this said 3:1, which `js/muted-contrast.test.js` has
    never enforced — `RIBBON_BAND_EXTREMES_MIN` is 2.0, and it cannot be raised, because
    the darkness ribbon's own solid extremes measure 2.853:1 and 2.874:1 on two of the
    three backgrounds. The moon ramp clears either bar: **4.506 / 7.278 / 8.593:1** over
    light parchment, dark parchment and `#0a0a12`.
    *Corrected again during the second review:* this line first said 4.9 / 7.3 / 8.6, which
    were the ramp's figures **before** `bd8530e` retuned the light alphas to lift band 0 off
    the page — written into a commit whose whole purpose was correcting a misstated number.
    The figures above are recomputed from the shipped alphas.
    The `.dl-moon-tick` that marks a named night is held to **1.45:1** against every band it
    can sit on — above the ramp's own adjacent floor, because it is a 2.5×8-unit stroke over
    a 504-unit fill, and 1.25 was measurably too loose to catch three realistic drifts. Its
    binding case is band 4 in dark themes, at 1.550:1.
13. `role="img"` label states walk length in nights and names the same nights as the prose.
14. Custom routes and shape-invalid artifacts hide the section without a console error.

---

## Verification plan

- Recompute nights, darkness means and moon lux for all seven routes from the committed
  artifacts, and assert the drawn strip matches the stated sentence — the same
  stated-vs-drawn discipline that caught the ribbon's share mismatch.
- Assert suppression on the two routes that require it (AC 9, AC 10) rather than trusting
  the threshold logic in isolation.
- Contrast measured from real merged-run lengths at real duty, per the ribbon's F6 —
  never from a modelled ramp.
- Mutation-check every new guard: a guard that survives deletion with the suite green is
  not a guard. Four of the ribbon's did.
- `/daylight` page weight recorded before and after. It is at 77.7 KB gzipped after Slices
  1–2, up 49%, and this slice lands on the same page.

---

## Open questions

- **Page weight.** Slices 3 and 4 both land on `/daylight`. Whether this slice gets a
  budget, and whether the seven local scripts finally get `defer`, is unresolved and is
  called out here so it is not decided by accident.

## Result — 2026-08-13

Built as specced. All eight tasks landed; 16 suites green throughout.

### Page weight (AC-adjacent, the open question above)

`/daylight`, JS + CSS combined:

| | raw | gzipped (per-file) |
|---|---|---|
| **after Slice 3** | **329.4 KB** | **93.5 KB** |

**On the measurement.** An earlier version of this table gzipped the concatenated
stream and reported 88.7 KB. That understates by 4.8 KB: a CDN gzips each response
separately, so the cross-file dictionary sharing a single stream enjoys does not
exist in transit. The figure above is the sum of per-file `gzip -9`, which is what
a reader's browser actually downloads. The earlier Slice 1–2 figures in this repo
were measured the same wrong way and are similarly understated; the *trend* they
describe holds, the absolute numbers do not.

93.5 KB of gzipped JS+CSS is still within reasonable practice, and nothing here is
render-blocking. But the trend is the point: three slices, three increases, no
budget, and Slice 4 lands on the same page. **Recorded as unresolved.**

**Two mitigations this spec previously proposed are wrong**, and are retracted here
rather than left to mislead:

- *`defer` on the local scripts* — near-worthless. They already sit at lines 279–286
  of a 288-line document, with only `</body></html>` after them, so there is
  essentially nothing left for `defer` to unblock.
- *Dropping `universe.js` (12.1 KB) or `sunpath-math.js` (37.6 KB)* — neither is
  free. `js/main.js:81` reads `if (theme === 'star' && !window.Universe) theme =
  'dark'`, so removing `universe.js` silently downgrades the star theme on this
  page; `sunpath-math.js` is a hard dependency of both `js/daylight.js` and
  `js/night-math.js`.

The real lever, if one is wanted, is the 37.6 KB of `sunpath-math.js` and 32.2 KB of
`main.js` being loaded whole for the handful of functions this page calls — a
splitting job, not a deletion one, and out of scope here.

### Departures from the spec, and why

- **D3's night derivation.** The spec's first version derived nights from
  `distanceKm / paceKmPerDay`. `PACE_PRESETS` is km/**h** (3/4/5), not km/day, so
  that needed an invented hours-per-walking-day constant on top of the 25 km one.
  Rewritten before implementation: a stage is a night on the six day-sized routes,
  and shikoku's blocks come from `round(spanKm / 25)`. Pace is not an input.
- **A new module.** `js/night-math.js` rather than growing `js/daylight-math.js`,
  whose header states "No external dependencies" and which owns the pure walking
  and placement math. `nightMoonLux` needs `SunPathMath`, `MoonLux` and `Moon`.
  Same reasoning that produced `js/moon-lux.js` in Slice 1.
- **The light ramp darkens with moonlight** rather than brightening. A brightening
  ramp put band 0 at 1.067:1 against light parchment — correct arithmetic,
  invisible strip. On a light page more ink means more of the thing, which is what
  the darkness ribbon's own light ramp already does.
- **Cross-ramp separability is a hue test, not a luminance one.** Two five-step
  ramps spanning a theme's usable luminance range must overlap somewhere; a
  contrast floor between them would have demanded the impossible. What D8 actually
  asks is carried by hue: moon R−B of 84/88/86 against the ribbon's −5/−20/−33.

### The number that moved

camino-ingles peaks at **0.0380 lux**, not the 0.0067 first written here — that
was its highest nightly *mean*, recorded as the peak. Suppression holds either
way, but the spec said something measurably untrue and now does not.
