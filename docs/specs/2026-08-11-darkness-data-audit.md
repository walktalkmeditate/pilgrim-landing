# Darkness Data Audit — Gate 0

**Date:** 2026-08-11
**Status:** Not Started
**Purpose:** Produce a committed, openly-licensed, validated darkness artifact covering all seven baked pilgrimage routes — or a documented decision to make a weaker claim. Every downstream slice of the night instrument consumes this artifact, so it lands first and alone.

Precedent: [`2026-05-14-moonpath-port-licensing.md`](./2026-05-14-moonpath-port-licensing.md). Same shape — resolve licensing and data provenance at a gate, before any UI work assumes the data exists.

---

## Why this is a gate

The night instrument has four downstream slices (night bar, darkness ribbon, "the night worth walking", and the finishing layer). Three of the four consume a per-kilometre darkness value and assume that value means *how dark the sky is here*.

That assumption may not survive contact with the data. If it doesn't:

- the ribbon's labels change
- "about 4,000 stars here" becomes unsupportable
- the 2012→present drift story needs reframing

Discovering that after the ribbon is built is expensive. Discovering it now costs a few days.

---

## Decisions already locked

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Deepen the existing three instruments; no new page | The route ribbon lands on `/daylight`, which already has route + stage pickers and a per-stage coordinate set |
| Light-pollution source | **VIIRS VNL** (CC BY 4.0) | Falchi 2016 is CC BY-NC — see exclusion below |
| Propagation model | **Empirical distance-decay blur**, calibrated against ground-truth SQM sites | Captures the "city 15 km away washes your sky" effect without a full atmospheric model |
| Coverage | **Seven baked routes only** | A few KB per route as static JSON. `/daylight` custom-route mode and `/moonpath` show no darkness. No global grid payload |
| Sampling resolution | **1 km along the waypoint polyline** | 3,288 samples total |

---

## 1. Data sources and the license chain

Three licenses stack in the finished artifact. All three must be recorded, and the artifact must carry attribution for each.

| Source | What it provides | License | Verdict |
|---|---|---|---|
| **VIIRS VNL annual composites** (NOAA/NASA via Earth Observation Group, Colorado School of Mines) | Upward radiance, nW/cm²/sr, 15 arcsec (~500 m at equator) | CC BY 4.0 | ✅ ship — attribution required |
| **open-pilgrimages waypoints** (`../open-pilgrimages/routes/*/waypoints.geojson`) | Kilometre-indexed points along all seven routes | ODbL v1.0 | ✅ ship — derived database, see below |
| **Falchi et al. 2016 World Atlas** (GFZ Data Services, DOI `10.5880/GFZ.1.4.2016.001`) | Modeled zenith sky brightness, mcd/m², 30 arcsec | **CC BY-NC 4.0** | ❌ **excluded** |

### Falchi exclusion — recorded so it is not re-proposed

The World Atlas is the obvious source: it publishes exactly the quantity we want (modeled zenith artificial sky brightness) rather than a proxy. It is excluded on licensing, not quality.

CC BY-NC forbids commercial use. Pilgrim's site is GPLv3, and GPLv3 does not permit additional downstream restrictions to be layered onto the work it covers. The baked artifact would also ride the CDN into the iOS and Android apps, which market a product. One could argue a data file in a repo is an aggregate rather than a derivative — but the argument is genuinely unsettled precisely where certainty matters most, and a cleanly-licensed alternative exists.

**The Falchi *method* remains usable.** Techniques are not copyrightable. The published propagation approach can inform our kernel; only the output raster is off-limits.

### ODbL and the derived-database question

The darkness array is indexed against ODbL geometry, which plausibly makes it a derived database under ODbL §4.4. Resolution: the artifact ships under ODbL with attribution to OpenStreetMap contributors, alongside the CC BY 4.0 attribution for VIIRS. The repo already bakes from this source (`assets/daylight/`, `assets/collective-routes.json`), so this is not a new obligation — but it has not been named explicitly before, and the darkness artifact should name it.

### Known acquisition constraint

`eogdata.mines.edu` redirects to OAuth (`eogauth.mines.edu`). Downloading VNL composites requires a free EOG account. The acquisition script therefore needs credentials, which cannot be committed. Document the registration step in the script's header and read credentials from the environment.

---

## 2. Sampling design

**`route.geojson` cannot supply the kilometre axis.** This was assumed during planning and disproved during Task 1, whose `MAX_PART_GAP_KM` guard fired on real data. Measured:

- **shikoku-88** — a MultiLineString of 77 parts drawn from 89 OSM relations, summing to **2,112 km against 1,200 stated**, before any ordering. Greedy endpoint stitching makes it worse: 2,216 km, requiring a 33 km leap. The geometry is a superset of the route — variants, alternates, duplicated ways — so ordering cannot fix it.
- **camino-frances** — a single LineString, but **994 km against 764**, with 47 vertex jumps over 1 km totalling 110 km.
- **kumano-kodo** — seven features that are seven *different trails* (Nakahechi, Kohechi, Ōkumotorigoe, and others) totalling 228 km against 39 stated. Kohechi alone is 96.6 km.

The axis comes from `waypoints.geojson` instead, where every point carries a `kmFromStart` that upstream has already projected onto the route.

### Procedure

1. **Select waypoint types per route.** No single rule works. The five Caminos use every type; the two Japanese routes use `sacred_site` only, because amenity `kmFromStart` values are ambiguous around Shikoku's loop and across Kumano's seven branches.
2. **Group by `kmFromStart` and drop ambiguous buckets.** Where several waypoints share a kilometre, take their centroid — but discard any bucket whose points spread more than **2.0 km** from that centroid. Shikoku has 145 waypoints filed at km 728 spanning 68 km; averaging those lands in the sea.
3. **Sort by kilometre and interpolate** to uniform 1 km steps across the covered span.
4. **Validate.** Fail loudly unless the polyline's length divided by its kilometre span falls within **[0.5, 1.5]**.

### Why that ratio gate

It cleanly separates a working configuration from a broken one. A correct chord path runs about **0.76** of the kilometre axis, because straight lines cut the corners of a meandering trail. A polyline that jumps between branches or across a loop runs **5–6×** it. There is no ambiguous middle.

| Route | Types | Kept | Coverage | Ratio | Samples |
|---|---|---|---|---|---|
| shikoku-88 | `sacred_site` | 87 | 0–1080 of 1200 km | 0.76 | 1,081 |
| camino-norte | all | 1,418 | 0–784 of 784 km | 1.07 | 785 |
| camino-frances | all | 1,300 | 0–764 of 764 km | 1.10 | 764 |
| camino-primitivo | all | 270 | 0–263 of 263 km | 0.90 | 263 |
| camino-portugues | all | 652 | 0–243 of 243 km | 1.25 | 244 |
| camino-ingles | all | 220 | 0–112 of 112 km | 1.08 | 112 |
| kumano-kodo | `sacred_site` | 13 | 0–38 of 39 km | 0.76 | 39 |
| **Total** | | | | | **3,288** |

Shikoku keeps 87 of its 88 temples: two share a single `kmFromStart` and collapse into one centroid.

Every coverage gap is far inside the 100 km propagation kernel, so an interpolated position between waypoints cannot move a sample outside the blur that produced it.

**Shikoku covers 1,080 km of its stated 1,200.** The artifact records `coveredKm` so this reads as a known limit rather than a mysteriously short ribbon.

### Accepted imprecision

Waypoints include off-route amenities, so the interpolated line wanders a few hundred metres off the trail — median centroid spread on the Francés is 0.13 km, 95th percentile 0.44 km. Against a 100 km kernel this is immaterial. The positions are *near* the route, not *on* it, and the spec says so rather than implying a precision the data does not have.

At 1 km the ribbon shows the sky darkening *between towns*, which is the effect worth rendering. Coarser loses it; finer buys nothing at VIIRS's ~500 m native resolution.

---

## 3. The propagation kernel

### The problem

Point-sampling VIIRS is wrong, and wrong invisibly.

Sky brightness above a location is produced by light emitted across a wide surrounding area and scattered back down by the atmosphere — meaningful contributions arrive from up to ~100 km away. The pixel beneath a walker's feet describes the lights *at that pixel*. A stage 15 km outside León sits on dark pixels and under a visibly washed sky. Naive sampling would call it dark.

This failure mode passes every test that doesn't include ground truth, and it corrupts exactly the rural stages the ribbon exists to celebrate.

### The approach

Convolve the raster once with a distance-decay kernel, then point-sample the blurred result. One expensive raster operation, ~3,405 trivial lookups.

**Kernel form.** Radially symmetric, truncated at R = 100 km:

```
w(d) = (1 + d/d₀)^(−α)        for d ≤ R
```

with `d₀ = 1 km` as a core-softening constant and `α` a shape parameter. Start from a prior of α ≈ 2 (roughly inverse-square falloff of scattered contribution) and grid-search a small range.

**Blurred field.** `B_raw(p) = Σ_q w(|p − q|) · L(q)` where `L` is VIIRS radiance.

**Calibration.** Fit in log space:

```
log₁₀(B_sky) = a · log₁₀(B_raw) + b
```

Two fitted parameters (`a`, `b`) plus one searched (`α`).

### Two implementation traps

**Latitude distortion.** At 43°N, 15 arcsec of longitude is ~340 m while 15 arcsec of latitude is ~460 m. A kernel that is circular in pixel space is an ellipse on the ground. Reproject each regional crop to a local equidistant projection before convolving. Skipping this silently biases every Iberian sample.

**Convolution cost.** A 100 km radius at 15 arcsec is a ~216-pixel radius, so the kernel is ~433 px across. Convolving an Iberia-sized crop (roughly 2,300 × 900 px) against that directly is on the order of 10¹¹ multiply-adds — intractable. Crop to a bounding box around each route plus a 100 km margin (one for Iberia, one for Shikoku/Kii), then FFT-convolve; that runs in seconds under numpy/scipy.

---

## 4. Validation protocol

Three fitted or searched parameters against five points would be curve-fitting dressed as validation. Split the sites.

- **5 calibration sites** — used to fit `a`, `b`, and select `α`.
- **3 held-out validation sites** — never seen during fitting. These decide the gate.

Sites must span the full range: a certified dark-sky park, rural, small town, suburb, city centre. Each needs a **published, citable SQM or sky-brightness reading** with a date and a source URL, recorded in the audit table. Prefer sites in or near Spain and Japan so the calibration reflects the geography we actually ship.

**Pass criteria — both must hold on the held-out sites:**

1. Ordering is monotonic: darker measured sites produce darker computed values, no inversions.
2. Residuals within **±0.5 mag/arcsec²**, comparable to the spread between SQM units in the field.

Descriptive bands ("as dark as it gets in Spain", star counts) are deliberately not a criterion here — banding is a Slice 2 presentation decision and is out of scope for this gate. Validate the number, not the words wrapped around it.

**Failure routes to section 7.** Do not widen the tolerance to make the gate pass.

---

## 5. Tooling and reproducibility

New directory `scripts/darkness/`, holding a Python acquisition script (numpy, scipy, rasterio).

This **deliberately breaks the repo's "no dependencies beyond Node's built-ins" bake rule**, and the README must say so rather than leaving a silent exception. The justification: reading a multi-gigabyte compressed GeoTIFF and FFT-convolving it is not dependency-free Node work, and pretending otherwise would produce something worse than an honest exception.

The property that actually matters is preserved: **the runtime reads only a committed static artifact.** No new runtime dependency, no network call, no build step, no change to how any page loads.

The script runs rarely — only when EOG publishes a new annual composite. It must record, in `meta.json`:

- VNL version string and year
- SHA-256 of each source raster
- kernel parameters (`α`, `d₀`, `R`) and fitted `a`, `b`
- the full calibration and validation table
- both attribution strings
- the `open-pilgrimages` commit SHA the geometry came from

Given identical inputs and recorded parameters, a re-run must be byte-identical — same guarantee as `bake-daylight-routes` and `bake-collective-routes`.

---

## 6. Artifact schema

`assets/darkness/<route-id>.json`:

```json
{
  "route": "camino-frances",
  "epoch": 2024,
  "stepKm": 1,
  "coveredKm": 764,
  "unit": "mag/arcsec2",
  "values": [21.4, 21.3, 20.8, "…765 entries…"]
}
```

`coveredKm` is the span the waypoints actually reach, which is not always the route's published length — Shikoku's cover 1,080 of its 1,200 km. Recording it keeps a short ribbon legible as a known limit rather than a mystery.

`assets/darkness/meta.json` carries everything shared: VNL version, checksums, kernel and calibration parameters, the validation table, attributions, and the geometry commit SHA.

Values are plain numbers at three significant figures. No clever quantization — 764 numbers is roughly 5 KB, and boring wins.

`unit` is load-bearing: it is `"mag/arcsec2"` if the gate passes and `"nW/cm2/sr"` if the section 7 fallback applies. Downstream slices branch on it rather than assuming.

---

## 7. The honest fallback

If held-out validation fails, do not launder the number into a sky-brightness claim it cannot support.

Ship banded **upward radiance** instead, and change the language from *how dark the sky is here* to *how lit this place is*. Set `unit` to `"nW/cm2/sr"`, drop the star-count translation, and describe the ribbon as measured ground light rather than modeled sky brightness.

This is a weaker claim and still a true one, and it still produces a beautiful ribbon. Deciding it now, in writing, is far better than deciding it later under shipping pressure — which is when the temptation to widen a tolerance arrives.

---

## 8. Open questions to resolve during execution

| # | Question | Blocks |
|---|---|---|
| Q1 | Which VNL version and year? V2.2 documentation lists 2012–2020; newer releases likely extend further. Requires an EOG account to confirm — the directory listing is behind OAuth. | Everything |
| Q2 | Masked or unmasked composite? The masked product removes background noise and ephemeral lights (fires, flares). Masked is probably right for a sky-glow proxy; confirm against the calibration sites. | Kernel calibration |
| Q3 | Which eight reference sites, with which citable published readings? | Validation |
| Q4 | Does an existing published VIIRS-radiance→sky-brightness regression fit better than fitting our own? Prefer citing one if it validates. | Calibration |
| Q5 | Which years are available for the 2012→present drift story, and are they inter-comparable? VNL processing versions changed across the series; year-over-year comparison may need the intercalibrated product. | Slice 4 only — do not let it block this gate |

---

## 9. Deliverables

- [ ] This document, updated with resolved Q1–Q4 and the completed validation table
- [ ] `scripts/darkness/` acquisition script, documented, with the EOG registration step in its header
- [ ] `assets/darkness/*.json` — seven route files plus `meta.json`
- [ ] A README section explaining the Python exception to the Node-only bake rule
- [ ] **A written go/no-go on the sky-brightness claim**

## 10. Definition of done

The gate is complete when a downstream slice can read `assets/darkness/camino-frances.json`, trust `unit`, and render a ribbon without needing to know anything about VIIRS, kernels, or licenses.

## 11. Out of scope

Explicitly not in this gate, to keep it from sprawling:

- Any UI. No ribbon, no bar changes, no copy.
- Arbitrary-coordinate darkness. Seven routes only; no global grid.
- The 2012→present drift series. Gate 0 bakes **one** epoch. Q5 is recorded for Slice 4, not answered here.
- Star-count translation. That is a presentation decision for Slice 2, and it depends on this gate's go/no-go.
