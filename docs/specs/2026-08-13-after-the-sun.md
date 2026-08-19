# After the Sun — night comes to `/sunpath`

**Spec written 2026-08-13, before implementation.**

Follows the night instrument on `/daylight` (Gate 0 `#15`, night bar `#16`, darkness ribbon
`#17`, moon strip `#18`) and replaces that roadmap's cancelled Slice 4
(`docs/specs/2026-08-11-darkness-data-audit.md`, Update 2026-08-13).

---

## Problem

`/sunpath` has seven sections and every one asks the same question: **what does the sun do,
by latitude and season?** Deep-time drift of the turnings, the analemma, the widening swing
of sunrise azimuth, the rate of change near a solstice.

It never asks that question with the sign flipped. The page is silent on what the sun's
absence gives you — and that silence hides the most surprising fact available to it:

| latitude (the page's own picker) | Jun 21 | Sep 23 | Dec 21 | year's range | nights with **no** true dark |
|---|---|---|---|---|---|
| Equator (0°) | 9.4 h | 9.6 h | 9.4 h | **0.2 h** | 0 |
| Tropic (23.5°N) | 7.5 h | 9.4 h | 10.6 h | 3.1 h | 0 |
| Mid-latitude (45°N) | 3.3 h | 8.5 h | 11.7 h | 8.4 h | 0 |
| High-latitude (60°N) | 0.0 h | 6.9 h | 12.6 h | 12.6 h | **123** |
| Arctic (70°N) | 0.0 h | 3.3 h | 13.6 h | 13.6 h | **177** |

*The 0.0 h entries are the absence of a night, not a night of zero length — see D5. The
"year's range" column is the span across the whole series including those absences; the
range across the nights that exist is 11.7 h at 60° and 12.4 h at 70°, which is what the
shipped caption states.*

*The zero-night counts are good to **±1 day**. Declination is sampled once per night, at
midday, while the event it decides falls some twelve hours later; an independent
integration at 1–2 s resolution gives 122 and 176 where this page gives 123 and 177. The
counts are quoted here as this page computes them.*

*An earlier draft justified that tolerance by citing the page's "stated accuracy
(**"approximate but visualization-correct"**, ~0.5°)". The page states no such thing —
the phrase appears nowhere in this repository except in the sentence that attributed it —
and ~0.5° is the accuracy of the **equation of time, in minutes**, a different quantity.
`js/sunpath-math.js` puts the Spencer declination series at **~0.05°**. The ±1 day is a
sampling-cadence artefact, not a series-accuracy one, and it needed no citation to say so.*

At the equator every night of the year is the same length. At 45° it nearly quadruples
across the year. At 70° true dark does not come at all for nearly half of it.

That is the same latitude story "Where dawn comes from" already tells about sunrise — told
after sunset, using the same picker, the same five latitudes, and the same default.

### What we already have

Nothing here needs new astronomy or new libraries:

| Need | Source | Already loaded on `/sunpath`? |
|---|---|---|
| astronomical dusk/dawn (sun −18°) | `SunPathMath.astronomicalDuskUTC` / `astronomicalDawnUTC` | **yes** |
| the four turnings, Meeus-accurate | `window.Turnings.getTurningsForYear(year)` | **yes** |
| the latitude picker (0 / 23.5 / 45 / 60 / 70) | `js/sunpath-tools.js` `DAWN_LATITUDES` | **yes** |
| geolocation, "your sky" | `js/sunpath.js` `getCurrentPosition` / `yourSky` | **yes** |
| moon illuminance across a night | `MoonLux` + `js/night-math.js` `nightMoonLux` | no — 10.5 KB to add (measured; see D6) |
| measured sky brightness, 7 routes | `assets/darkness/*.json` | no — 52 KB, and only §3 needs it |

---

## Decisions

### D1 — Three changes, not four sections

The four ideas collapse. `/sunpath` already has seven sections; four more would make it
eleven, and this site's aesthetic is restraint.

- **§A The dark hours** — one new section. Ideas 1 and 4 are the same instrument: a curve of
  true dark across the year, driven by the latitude picker, with "your sky" as its
  personalisation rather than a separate feature.
- **§B The turnings, after dark** — ~~an extension of the existing "A calendar of turnings"
  section~~ **CUT 2026-08-13 by the budget gate (D6).** +10.52 KB for the moon half against
  a +12.00 KB budget already 4.91 KB spent. One change ships.
- **§C Two drifts** — ~~one new section, beside the existing deep-time opener~~
  **CANCELLED 2026-08-13 by its own audit (D7).** The effect is +0.071 mag against 0.32 mag
  of parameter slack, and points the opposite way to the story. Two changes ship, not three.

### D2 — §A reuses the existing picker, latitudes and default

Same `DAWN_LATITUDES` ladder (0 / 23.5 / 45 / 60 / 70), same 45° default, same button
idiom. A reader who has parsed "Where dawn comes from" transfers everything. Introducing a
second latitude vocabulary on one page would be the change that makes the page feel long.

### D3 — "Your sky" extends what exists; it does not become a control

`js/sunpath.js` already geolocates. §A adds one thing to it: given your latitude, your
longest night, and — above ~48.5° — the dates true dark does not come. If geolocation is
refused or unavailable, §A works exactly as before on the picker. Never a blocking prompt.

### D4 — "True dark" means astronomical night, and the page says so once

Sun below −18°. Not civil (−6°) or nautical (−12°). The bar on `/daylight` already draws
this boundary and calls it true dark; using a second definition across two pages of one
almanac would be worse than using a stricter one.

**Consequence that must be stated, not hidden:** above ~48.5° astronomical night does not
occur near midsummer. That is not a gap in the data — it is the fact. It is *why* 60° and
70° show zero.

**And the same boundary has a far side.** Above 84.5° the sun does not climb to 18° *below*
the horizon near midwinter, and the night lasts the whole day. Both conditions reach
`darkHoursOn` as the same `null` from `hourAngleHalfSpan`, and reading that null as "no
night" tells a reader at Amundsen–Scott the opposite of their sky.

`darkHoursOn` therefore returns exactly **0** if and only if there is no astronomical night,
across the band where every night ends — and `null`, meaning *not modelled*, above it. It
does not disambiguate the two conditions; it declines the latitudes where they are
ambiguous. Why it stopped trying is D12. Nothing here disturbs `hourAngleHalfSpan` or
`twilightUTC`: six exported functions and two shipped instruments on `/daylight` read those
nulls, and the domain guard sits above them, in `darkHoursOn` alone.

### D5 — A night with no true dark is drawn as an absence, never a zero

This is the binding lesson from `/daylight`, which shipped **seven** bugs of one family:
correct arithmetic rendering to something no reader can see, or prose contradicting the
pixels beside it. Two of the seven were introduced by fix waves.

A zero-height bar, a zero-width segment, or a line at y=baseline all *look* like a very
short night. They are not: they are no night. §A must draw the zero-dark stretch as a
visibly different thing — a break in the curve, a band, an explicit marker — and the prose
must name it.

**And the assertions must read the emitted elements, not the model that produced them.**
The mechanism behind those seven bugs, established by research across the whole history:
*a fix gets verified against the metric it was written to move, while the property it broke
was covered only by a test asserting against an upstream proxy for the rendered output.*

### D6 — §B is CUT. The budget gate fired on 2026-08-13.

*Measured before any of §B was written, which is what D9's budget is for.*

*Every figure in this spec is gzipped per file with Node `zlib`, level 9 — the tool
`js/sunpath-budget.test.js` computes with. The first draft mixed tools: it recorded a
baseline from Apple `gzip -9` (90.94 KB) and subtracted it from a Node total, so the "+4.61
KB" it published was one implementation minus another.*

| | gzipped (Node `zlib`, level 9) |
|---|---|
| `/sunpath` before this branch (`b270938`) | 90.63 KB |
| after §A, at HEAD | 107.71 KB — **+11.83 KB** |
| §B's `moon-lux.js` + `night-math.js` | **+10.50 KB** |
| projected feature total | **+22.36 KB** against a **+12.00 KB** budget |

*The gate fired when §A stood at +4.91 KB and §B's modules would have taken it to +15.43.
The review fix waves have since taken §A itself to +11.86 — mostly comment, and still inside
the budget — which only makes the verdict wider.*

*That figure moved twice for reasons worth recording. The polar refusal (D12) cost +0.98 and
the band's edges (the tenth instance) +0.54. Then the review found the gate was never
measuring `sunpath/index.html` itself, only the assets it references — so every byte of new
markup had been worth exactly zero to it. Counting the document adds +0.25 KB of this
branch's own growth and 5.05 KB of pre-existing baseline. Three times now this gate has
missed something, and all three times the miss was worth zero: an unresolvable path, a mixed
gzip implementation, and the document. It now carries a self-test proving it responds to
growth at all.*

*The review fix wave pushed §A to **+11.82 KB** — 0.18 KB of headroom — before any comment
was trimmed. Half the weight of both JS files is comment, and this codebase ships comments
on purpose. But a lot of what the wave added was *archaeology*: paragraphs recording what a
comment used to say wrongly. That belongs here, in a document nobody downloads, not in
served bytes. Trimming five of those blocks and one CSS block returned 1.30 KB, and a second trim after the D10 clause returned 0.70 KB more. The
operative reasoning stayed in place. D9 held without being raised, which is the only outcome
consistent with having cut §B rather than raise it.*

D9 says §B is cut before the budget is raised, and it is. Not deferred behind a placeholder
— cut, as §C was.

The measurement makes it easy rather than painful. §B's content is *"at this turning, at
your latitude, the dark lasts N hours and there may be a moon in it."* The dark half is
already on the page in §A, from modules already loaded. The moon half costs **more than
twice what all of §A spent** to add one clause to four rows. `/daylight` went 52 → 106 KB by
accepting that trade four times, each increase small on its own.

If the turnings ever want their night, the cheap version is available: §A already computes
`darkHoursOn` for any date, so the four hinges could carry a dark duration for nothing. It
is the *moon* that does not fit, and the moon is the half that needed the modules.

*Original decision retained below, for whoever revisits it.*

### D6 (original) — §B says, per turning, what the night is like

The existing section already frames the four hinges as "marked across cultures by walks,
processions, and gatherings" — most of which happen at night or before dawn. For each
turning, at the reader's latitude: how long true dark lasts, and whether a moon is up in it
(`nightMoonLux`, the honest quantity — illuminance across the dark window, not phase).

This is the one place the moon math earns its 10.5 KB on this page. If §B is cut, the moon
modules come out with it.

### D7 — §C is CANCELLED. The gate ran on 2026-08-13 and failed it.

*Original decision — §C gated on a 2012 epoch audit — is superseded. The audit was run
before any of §C was built; this is its verdict, kept in full because the reasoning is the
useful part.*

The 2012 epoch exists and is nominally sound: all three tiles the seven routes need
(`h17v04`, `h17v05`, `h31v05`) resolve at version **002**, confirming Gate 0's Q5 for
exactly these tiles. Granules were fetched and hashed. The data is not the problem.

**Two findings killed it.**

**1. The drift is smaller than the instrument's own slack.** One frozen calibration
(A = 1.2087e-09, p = 0.716133 — the shipped 2025 fit) applied to both epochs, 3,288 samples:

| route | drift (mag) | darker | brighter |
|---|---|---|---|
| camino-norte | +0.165 | 79.1% | 8.2% |
| camino-primitivo | +0.107 | 57.4% | 13.7% |
| camino-ingles | +0.076 | 50.9% | 21.4% |
| camino-frances | +0.056 | 47.0% | 27.2% |
| shikoku-88 | +0.035 | 32.6% | 16.2% |
| kumano-kodo | −0.010 | 2.6% | 2.6% |
| camino-portugues | −0.053 | 42.6% | 38.1% |
| **all, n-weighted** | **+0.071** | | |

Gate 0 recorded that alpha alone shifts a single value by up to **0.32 mag**. The whole
n-weighted effect is **+0.071**; the largest single route is half the alpha slack. This is
the same overclaim that cancelled star counts on 2026-08-13, and it fails for the same
reason: an effect inside the error bar is not a finding.

**2. The sign is the opposite of the story.** Positive means the modelled sky got *darker*.
Physically plausible — Spain's LED conversion cuts upward spill, and Santiago's raw radiance
is down 50.5% — but the premise was "Earth's tilt drifts over millennia, our light over a
decade." The data says the light receded, weakly, with two routes disagreeing about even
that. A section reading *"the sky over these routes got very slightly darker, by an amount
we cannot distinguish from our own calibration slack"* does not earn a place on the page.

**Method finding, recorded so it is not rediscovered.** Refitting calibration per epoch —
what `bake_darkness.py --epoch 2012` does — fits each epoch's radiance to the *same* fixed
2015 ground truth, absorbing the change into A and p. Measured at the five reference sites:
refit-per-epoch gives a mean drift of **−0.012**, frozen calibration **+0.153**. The naive
approach would have produced a confident, well-tested, meaningless answer.

**Pipeline bug found and fixed.** `bake_darkness.py`'s region cache was keyed
`(region, alpha)` with no epoch, so a second epoch silently received the first's field —
it reported *0.0% change at every site* on the first run. Harmless in a single-epoch bake,
fatal for any two-epoch work. Fixed with a regression test in the same change as this
amendment.

**Consequence for the rest of the spec:** the +12 KB budget (D9) now has one fewer claimant,
and no Earthdata dependency remains. The 276 MB of 2012 tiles stay in the gitignored cache
should better calibration ever make the question answerable.

The 2012→2025 drift story needs a second baked epoch. `assets/darkness/` holds 2025 only.

- Gate 0's **Q5 is already answered**: the whole 2012–2025 series was reprocessed under
  version 002, so year-over-year comparison is valid. That is the expensive question,
  settled.
- A **difference is more defensible than an absolute value** — systematic calibration error
  partly cancels. This is why drift survived the Slice 4 cancellation when star counts did
  not.
- But the epoch must still be baked and gated. §C **ships when its data does**, and the
  spec is written in full so that work is unblocked, not so the section can be faked.

**Critical path.** The equinox is 2026-09-23, 41 days out, and all four are wanted by then.
The bake is therefore the long pole and starts first. The Earthdata token **expires
~10 Oct 2026 and appeared in a session transcript — rotate it before any bake.**

### D8 — No star counts, no Milky Way. Carried forward, not re-litigated

Measured against Gate 0's own ±0.32 mag, **1,899 of 3,288 samples (57.8%) sit within one
error bar of a naked-eye Milky Way threshold**. The claim would flip on our own calibration
error for most of the route. Cancelled on 2026-08-13; not deferred, not revisited here.

### D9 — A page-weight budget, because `/daylight` never got one

`/sunpath` is **90.6 KB gzipped** today (Node `zlib` −9, per file), of which **21.1 KB is
vendor** — d3-geo 12.8, d3-array 5.8, topojson 2.5, all gzipped — serving the hero globe
alone. Unpacked those three are 59.3 KB, and quoting *that* figure inside a sentence about a
gzipped page (as the first draft of this line did) overstates the vendor share by 2.8×. It
is the same raw-vs-gzip confusion the sibling spec already corrected once.

`/daylight` went 52.1 → 106.0 KB across three slices with no budget, and every slice
argued its own increase was small. This spec sets one up front: **+12 KB gzipped, total.**

Consequences that follow from it, not the other way round:
- §A costs ~0 — it is arithmetic over modules already loaded.
- §B's moon modules (`moon-lux.js`, `night-math.js`) are the main spend. If they will not
  fit, §B is cut before the budget is raised.
- §C must not load `assets/darkness/*.json` (52 KB) into the page. It ships a **small
  pre-computed drift summary**, baked at build time — not the raw artifacts.

### D10 — The text equivalent is the sentence, and it carries what the picture carries

Same discipline as the ribbon and the moon strip: `role="img"` flattens an SVG subtree, so
per-element titles are inert. One accessible name, mirrored into real DOM text outside the
SVG, stating the same facts a sighted reader gets — including the zero-dark stretch (D5),
which is the one a curve conveys most cheaply and prose most easily omits.

**Known debt carried in deliberately:** the moon strip's marks are a spatial affordance with
no textual analogue. Do not repeat that here — if §A marks the turnings on the curve, the
sentence names them.

### D11 — What this must never claim

- Not a darkness *forecast*. Sky brightness is not visibility; there is no cloud model.
- No "best night to see X" ranking. `/daylight` answers per-walk questions; this page
  teaches how the sky works.
- No per-kilometre or per-site claim from §C. Shikoku remains 49.8% interpolated with no
  held-out validation; the drift is a route-scale statement or it is nothing.

---

### D12 — Above 84.5° the instrument declines, added 2026-08-14

D4's first implementation tried to tell the two nulls apart by recomputing the sun's
greatest altitude and returning 24 when it stayed below −18°. It was wrong in a way worth
recording, because it is the ninth instance of this project's signature failure: **correct
arithmetic rendering to something no reader can see, or prose contradicting the pixels
beside it.**

The disambiguator sampled declination at the night's midpoint; the twilight functions it
was adjudicating sampled it twelve hours earlier. On the day a polar night *begins* — dusk
exists, the following dawn does not — those two samples fall either side of the threshold.
At 85°N on 11 December 2026 the gap was **0.026°**, and the function reported **0 hours**:
"no astronomical night at all", printed between a 22.4-hour night and a 24-hour one. It did
that at 93% of the latitudes the branch was written to serve.

**The decision: refuse the domain rather than model it badly.** `modelsNightHere(lat)` is
false above `MAX_MODELLED_LAT_DEG`; `darkHoursOn` and `darkHoursYear` return `null` there,
and both readouts say so in prose — the plot draws nothing and the caption explains, the
"your sky" clause states the same. A reader above the line is told the instrument does not
model their sky, which is true, rather than shown a number that is not.

Nothing on the page loses anything: the picker offers 0–70°, and `drawDarkHours` has no
other caller.

**The edge is 84.5°, not the 84.56° that geometry textbooks give.** 84.56 = 90 − 23.44 + 18
uses textbook obliquity; the Spencer truncated series in `sunpath-math.js` peaks at
**23.4556°**, which puts the real edge at 84.5444° and left the first constant 0.016°
*inside* the band it was meant to exclude. `js/sunpath-math.test.js` re-derives the peak
from the series itself and fails if the two ever part company again. The same sweep checks
73,383 latitude-days inside the domain for a noon sun at or below −18° (worst case:
−17.956°) and 73,383 across the whole globe for the specific sentence that was shipped —
`darkHoursOn` answering 0 on a day the sun never rose to within 18° of the horizon.

**Cost:** +0.98 KB gzipped, 0.69 KB of it comment. Recorded rather than absorbed, per D9.

## Non-goals

- No change to the hero globe, the analemma, or the archive tabs.
- No second latitude vocabulary (D2).
- No new vendor dependency. Nothing here needs d3.
- No ongoing Earthdata dependency. One bake for §C, behind its gate, then done.

---

## Acceptance criteria

1. §A uses `DAWN_LATITUDES` unchanged — same five latitudes, same 45° default.
2. §A's curve reproduces the table above at all five latitudes, ±0.1 h.
3. A zero-dark night renders as a visible absence, distinguishable from a short night, and
   the prose names it (D5).
4. 60° shows 123 zero-nights and 70° shows 177, both stated and drawn.
5. The equator's flatness (0.2 h range) is legible — it is the section's punchline.
6. `/sunpath` works with geolocation refused, and never blocks on a prompt (D3).
7. ~~§B states, per turning and per latitude, the dark duration and whether a moon is up.~~
   **Cut by the budget gate (D6).** §B does not ship.
8. ~~§B's moon figure is `nightMoonLux`'s illuminance across the dark window, not phase.~~
   Cut with it.
9. ~~`role="img"` + one mirrored accessible name + outside-SVG text; no per-element titles.~~
   **Departed from deliberately — the SVG ships `aria-hidden="true"`. See "Departures from
   the spec, and why".** Outside-SVG text and no per-element titles hold as written.
10. The text equivalent names the zero-dark stretch and any marked turning (D10).
11. **`/sunpath` grows by no more than 12 KB gzipped**, measured per-file (not
    concatenated — that understates it), and the figure is recorded with the commit it was
    measured at.
12. §C does not ship. Its gate ran and failed (D7); there is no placeholder and no stub.
13. Every assertion about what is drawn reads emitted elements, not the model (D5).
14. No spec figure is stated without a test that recomputes it. The pattern is the one in
    `js/muted-contrast.test.js`, which parses this repo's specs and recomputes from source,
    and it is now genuinely extended to *this* spec: the Result section's four contrast rows
    are parsed and recomputed from `css/sunpath.css` by `js/muted-contrast.test.js`, and its
    post-§A weight row by `js/sunpath-budget.test.js`. (Claimed and not done in the first
    pass: no test read this document at all.)

---

## Verification plan

- Recompute the D-table at all five latitudes from `sunpath-math.js` and assert against the
  drawn output, not the intermediate values.
- Assert the zero-dark case at 60° and 70° specifically — it is the case a curve renders
  most plausibly wrong.
- Mutation-check every guard: one that survives deletion with the suite green is not a
  guard. Thirteen vacuous assertions were found across three review rounds on the moon
  strip alone.
- Page weight measured before and after, per-file gzip, against AC #11.
- `/ce-code-review` before the PR, as with `#15`–`#18`.

## Open questions

- ~~**§C's shape.**~~ Resolved by cancellation (D7). Deciding presentation before seeing the
  data is how the ribbon's first band ramp went wrong — so the data was fetched and measured
  first, and it said no. That is the question working, not the question going unanswered.

## Result — 2026-08-13

**One change shipped of the three specced, and both cuts were made by measurement.**

§A, the dark hours, is on the page. §C was cancelled by its own data audit (D7) and §B by
its own budget gate (D6) — neither by anyone's judgement in the moment, which is what the
gates were written for.

### Page weight, against the budget

| | gzipped (Node `zlib`, level 9, per file) |
|---|---|
| `/sunpath` at `b270938` (spec only, no code) | 90.63 KB |
| **after §A** | **107.71 KB — +11.83 KB** |
| budget | 12.00 KB |
| §B, had it shipped | +10.50 KB → 22.36 KB total, over |

The figure is **pinned by a test** (`js/sunpath-budget.test.js`), which recomputes it
per-file from the shipped page and then reads this row back out of this document and
compares. Three numbers drifted in this repo's specs across three review rounds on the
sibling page — and this one drifted too, three ways at once (95.85 in D6, 95.55 here, 95.54
in the test's own output) inside a paragraph claiming it could not. What made that possible
was a baseline measured with Apple `gzip -9` and a total computed with Node `zlib`: a
subtraction across two implementations. One tool now, named in the table, on both sides of
the subtraction.

Of the +11.86 KB, +4.91 was §A as first written and the rest is the review fix waves —
overwhelmingly comment, plus the polar branch, the shared caption facts and the widened
axis.

### Contrast

| | light parchment | dark parchment | `#0a0a12` |
|---|---|---|---|
| the curve | 6.110:1 | 5.130:1 | 5.773:1 |
| the no-night band's edge, vs the page | 3.954:1 | 6.416:1 | 7.220:1 |
| a turning mark, vs the page | 3.954:1 | 6.416:1 | 7.220:1 |
| the no-night wash, **vs the curve** | 5.098:1 | 3.968:1 | 4.652:1 |

Every mark carrying essential information clears Task 7's 3:1 floor (WCAG 1.4.11). The band
carries its share on an **edge** at full strength rather than on the wash: taking the wash
itself to 3:1 needs alpha 0.84 in light mode, which is a wall of stone across a third of the
plot. The wash behind it measures 1.198 / 1.293 / 1.241:1 against the page and is asked to
clear nothing — it is redundant reinforcement, and saying so is the difference between a
floor and a number picked to match what was built.

The last row is the one that matters and it is asserted, not observed. A stretch with no
night drawn as a fainter shade of the curve would read as *less of this*; it is not less
dark, it is no dark. Both marks are also held to one device pixel on the narrowest column
the page renders at: under that a stroke is antialiased to a fainter colour than it
declares, and every figure in this table would be a fiction.

The four figures above are read back out of this table and recomputed from the shipped
stylesheet by `js/muted-contrast.test.js` (AC #14).

### What the tests hold

- The spec's own latitude table, recomputed from the shipped twilight functions rather than
  copied. That keeps this document honest about what the code does and **nothing more** — a
  test that recomputes from the thing it tests pins the code to itself and can never find an
  error in it. It is a documentation guard, not an accuracy one, and the first draft of this
  section called it a strength.
- **Anchored outside the repo**, which is the convention every other section of
  `js/sunpath-math.test.js` already follows: published astronomical twilight times for León,
  Reykjavík and the equator on the night of 15 October 2026 (api.sunrise-sunset.org, an
  independent implementation of the NOAA equations, queried 2026-08-13), differenced into a
  night length; plus Reykjavík on 21 June, where the same source reports no astronomical
  twilight at all and `darkHoursOn` returns exactly 0. Measuring true dark at −17° instead of
  −18° turns all four red.
- The boundary at 48.56° checked against its derivation (at the June solstice the sun's
  midnight altitude is `lat − 66.56°`), not against an observed number — and its far side,
  where the night stops ending, re-derived from the declination series in use rather than
  from textbook obliquity (D12).
- The curve **breaks** around a zero-dark stretch: 60° draws as two segments covering 242 of
  365 nights, 70° as two covering 188, and **no emitted point sits on the baseline**.
- Mutation-checked, re-measured at HEAD after every fix wave including the last: running the
  curve through the zeros turns **5** render assertions red; a zero-height band turns **1**;
  nautical twilight instead of astronomical turns **24** in the math suite and **26** in the
  render suite; clamping a no-night to 0.01 instead of exact zero turns **6** math and **2**
  render red and then crashes both on a run that is no longer there.
- Added by the last two fixes: deleting either domain guard, restoring the textbook 84.56°
  edge, over-refusing to 60°, or reading the twilight null as 24 all turn the math suite red
  (D12); re-stroking the band, drawing its edges horizontally, or dropping them turn the
  render suite red, and re-stroking it turns `muted-contrast` red as well (the tenth
  instance); forcing the caption's qualifier permanently on turns **6** render assertions
  red and permanently off turns **8**.
- *These counts have been wrong twice.* The first pair published here (18 and 4) was measured
  at Task 1 and went stale when Task 2 added tests to the same file; the second (23 and 25)
  went stale when the qualifier guard was added. They are re-measured, not recalled.

### Known debt, left deliberately — 2026-08-14

The review found these and they are not fixed. Naming them is the point; a review whose
leftovers dissolve into silence is how the first seven instances accumulated.

- ~~**`js/sunpath-math.js` grew +2.79 KB gzipped, and `/daylight` and `/moonpath` both load
  it** without calling one dark-hours function.~~ **Resolved 2026-08-14** by
  `js/page-weight.test.js`, a ratchet over all 21 pages — not the module split, which would
  have cost more on `/sunpath` than it saved elsewhere. `/daylight` is pinned at 112.48 KB,
  the heaviest page on the site, ahead of `/sunpath`'s 107.43. Building it turned up two
  blind spots of its own: the scan matched only absolute asset paths, so the root page (which
  writes them relative) measured 22.10 KB against a real 63.86; and page discovery looked
  only for `index.html`, so ten top-level `.html` pages were invisible to the assertion
  claiming every page was weighed.
- **The y axis rescales above 14 h with no axis, ticks or gridline drawn.** Only the caption
  carries units, so two latitudes on two different scales are visually identical. Unreachable
  from the picker (0–70°, all under 14 h) and from "your sky" (which draws nothing), so it is
  latent — but `drawDarkHours` is exported and the render suite draws at the edge. Drawing an
  axis is a design change, and at +11.86 KB against +12.00 there is no room to make it
  carelessly.
- **The turning-mark idx range guard survives deletion**, and a partially-valid `Turnings`
  return (some keys good, some malformed) has no coverage. The all-valid and all-absent and
  all-throwing cases do.
- **`init()` still calls its six setups in sequence with no isolation between them.** The
  dark-hours section can no longer take the others down — its own throw path is wrapped — but
  any of the other five can still take out the ones after it. Fixing that properly means
  wrapping all six, which is a change to five sections this branch did not otherwise touch.

The page-weight budget is the binding constraint on all of these, which is D9 working as
intended rather than an excuse: it cost §B a whole feature, and it is now costing polish.

### Departures from the spec, and why

- **AC #9 asked for `role="img"`. The SVG ships `aria-hidden="true"`.** `role="img"`
  flattens the subtree, which is what AC #9 was defending against — but this page already
  has an answer to that, and it is the stronger one: `setupDawnSweep` and `setupAnalemma`
  both hide their plot outright and carry the whole reading in a real DOM paragraph beside
  it. There is then no subtree to flatten, no accessible name to keep in sync with the
  caption, and no per-element `<title>` that can look like coverage while being inert. The
  rest of AC #9 — outside-SVG text, no per-element titles — ships as written. Undisclosed in
  the first pass, which is the part that was wrong.
- **`DARK_MAX_H` is a floor, not a fixed axis.** The five picker latitudes all fit under
  14 h, and sharing one scale is what makes them comparable. The renderer may be handed any
  latitude the instrument models — the render suite draws at the edge, where the longest
  night runs 23.0 h — so
  the axis grows to hold the series rather than drawing a curve above the top of the box.
  (Its name still says ceiling. Left as-is: renaming it touches the CSS and the render
  suite for no behaviour change, and it is on the open list below.)

### The eighth instance, found in review

`/daylight` shipped seven bugs of one family (D5): correct arithmetic rendering to something
no reader can see, or prose contradicting the pixels beside it. This section shipped an
eighth into review, in the one channel D10 exists to protect.

`darkHoursSentence` took its minimum with `Math.min` across the whole series — including the
zeros that are `darkHoursOn`'s sentinel for *this night has no night*. So the caption at 60°
read *"true dark lasts between **0.0** and 12.6 hours a night"* and then, two clauses later,
*"for 123 nights there is no astronomical night at all"*. The renderer obeyed D5 exactly; it
was the sentence that did not, and because the SVG is `aria-hidden` that sentence is the
entire representation for a screen reader, a crawler or an LLM. The real figures are 0.9 h
and a swing of 11.7 h at 60°, 1.2 h and 12.4 h at 70°.

The mechanism was the familiar one: the caption's guards asserted that certain numbers
*appeared* in the string, and every number it printed did appear. Nothing asserted what it
did not say. `js/sunpath-render.test.js` now asserts the absence — the caption may not
match `/between 0\.0 /` — alongside the figures.

### The tenth instance — the guard and the element that drew past it

Found the same day as D12, and worth its own entry because the mechanism is the one that
keeps producing these rather than a new mistake.

`js/sunpath-render.test.js` asserted *"not one curve point sits on the baseline"* — D5's
rule, enforced on the polyline. `.sunpath-dark-none` shipped as a **stroked rect**, and a
stroked rect draws all four sides. Its bottom edge is a horizontal line along
`y = h − padB`: the baseline. In `--stone` at full strength that line measures **1.251:1
against the curve's own ink** in dark mode — near enough to read as a flat piece of curve at
zero, which is precisely and only what D5 exists to prevent. The renderer obeyed the rule;
the stylesheet drew the forbidden thing in an element the guard never looked at.

The design comment above the rule had already worked out that the wash cannot carry 3:1 and
that *"the rule around it is the mark"*. It was right about the wash and wrong about the
rule: a rectangle's rule is four lines, and one of them lands where nothing may land.

**Fixed structurally, not by tuning.** The wash is `stroke: none`, and the mark is two
`.sunpath-dark-edge` **vertical** rules at the stretch's ends, emitted as their own
elements. Vertical is load-bearing: the edges measure 1.545:1 and 1.251:1 against the curve
and would fail any colour-separation floor. They are told apart from the curve by
orientation, which is a real distinction and not a colour one — so the render suite enforces
the orientation (*"both edges are vertical"*, *"nothing at all draws a horizontal rule along
the baseline"*, checked across **every** emitted element rather than the polyline's points)
and `js/muted-contrast.test.js` holds the `stroke: none` that makes it possible. Restoring
the stroke turns both suites red.

The contrast figures are unchanged — same colour, same alpha, a different element carrying
it: 3.954 / 6.416 / 7.220 against the page.

### One thing found on the way

The hemispheres are not mirrors. −60° loses **116** nights to the midnight sun where +60°
loses 123, and −70° loses 170 against 177 — southern summer is the shorter season, because
Earth moves fastest near perihelion in January. The first draft of that assertion used the
mirrored number and would have passed anyway on a weaker branch.
