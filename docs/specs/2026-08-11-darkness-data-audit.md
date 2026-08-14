# Darkness Data Audit — Gate 0

**Date:** 2026-08-11
**Status:** Complete — gate passed, 2026-08-11
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
| Light-pollution source | **NASA Black Marble VNP46A4** (CC0) | Falchi 2016 is CC BY-NC; VIIRS VNL is fine on licence but its host is OAuth-walled — see below |
| Propagation model | **Empirical distance-decay blur**, calibrated against ground-truth SQM sites | Captures the "city 15 km away washes your sky" effect without a full atmospheric model |
| Coverage | **Seven baked routes only** | A few KB per route as static JSON. `/daylight` custom-route mode and `/moonpath` show no darkness. No global grid payload |
| Sampling resolution | **1 km along the waypoint polyline** | 3,288 samples total |

---

## 1. Data sources and the license chain

Three licenses stack in the finished artifact. All three must be recorded, and the artifact must carry attribution for each.

| Source | What it provides | License | Verdict |
|---|---|---|---|
| **NASA Black Marble VNP46A4** annual composites (LAADS DAAC) | Lunar- and atmosphere-corrected upward radiance, nW/cm²/sr, 15 arcsec, 10°×10° HDF5 tiles | **CC0** | ✅ ship — no restriction; citation given anyway |
| **VIIRS VNL annual composites** (Earth Observation Group, Colorado School of Mines) | The same quantity, uncorrected for moonlight | CC BY 4.0 | ⚠️ not used — see below |
| **open-pilgrimages waypoints** (`../open-pilgrimages/routes/*/waypoints.geojson`) | Kilometre-indexed points along all seven routes | ODbL v1.0 | ✅ ship — derived database, see below |
| **Falchi et al. 2016 World Atlas** (GFZ Data Services, DOI `10.5880/GFZ.1.4.2016.001`) | Modeled zenith sky brightness, mcd/m², 30 arcsec | **CC BY-NC 4.0** | ❌ **excluded** |

### Falchi exclusion — recorded so it is not re-proposed

The World Atlas is the obvious source: it publishes exactly the quantity we want (modeled zenith artificial sky brightness) rather than a proxy. It is excluded on licensing, not quality.

CC BY-NC forbids commercial use. Pilgrim's site is GPLv3, and GPLv3 does not permit additional downstream restrictions to be layered onto the work it covers. The baked artifact would also ride the CDN into the iOS and Android apps, which market a product. One could argue a data file in a repo is an aggregate rather than a derivative — but the argument is genuinely unsettled precisely where certainty matters most, and a cleanly-licensed alternative exists.

**The Falchi *method* remains usable.** Techniques are not copyrightable. The published propagation approach can inform our kernel; only the output raster is off-limits.

### ODbL and the derived-database question

The darkness array is indexed against ODbL geometry, which plausibly makes it a derived database under ODbL §4.4. Resolution: the artifact ships under ODbL with attribution to OpenStreetMap contributors, alongside the CC0 attribution for Black Marble. The repo already bakes from this source (`assets/daylight/`, `assets/collective-routes.json`), so this is not a new obligation — but it has not been named explicitly before, and the darkness artifact should name it. (Earlier drafts of this section said "the CC BY 4.0 attribution for VIIRS" — stale from before VNL was set aside for VNP46A4; the shipped `citation` array names only Black Marble CC0 and OpenStreetMap ODbL, and VIIRS VNL's CC BY 4.0 licence never appears in the artifact at all.)

### Why VNP46A4 rather than VIIRS VNL

VNL was the original choice and remains cleanly licensed. It was set aside for two reasons, in this order:

1. **Moonlight.** VNP46A4 is lunar- and atmosphere-corrected; VNL is not. Moonlight is precisely the contamination this project cares about, since the same moon that brightens a satellite's view is the lantern a walker reads the path by. Correcting for it at source is a real improvement, not a workaround.
2. **Access.** Every data path under `eogdata.mines.edu` redirects to OAuth at `eogauth.mines.edu`. The site is up — landing pages return 200 — but the wall proved impassable in practice.

Alternatives checked and rejected: NASA LAADS and Google Earth Engine are also account-gated (Earth Engine additionally requires a paid Cloud project for commercial use); the World Bank *Light Every Night* mirror on AWS is genuinely open and CC BY 4.0, but publishes only per-orbit **nightly** granules. Compositing those ourselves would mean re-implementing cloud masking, moonlight removal, stray-light correction and swath mosaicking — weeks of work producing an unvalidated composite to feed a gate whose entire purpose is validation.

### Known acquisition constraint

LAADS DAAC requires a free **Earthdata Login** account and an app key (bearer token). The token cannot be committed; the acquisition script reads it from the environment and its header documents the registration step.

### Tiles

Black Marble ships 10°×10° tiles of 2400×2400 pixels. Derived from the actual route extents plus the 100 km kernel margin:

| Region | Extent (lon / lat) | Tiles |
|---|---|---|
| Iberia | −9.88 → −0.04 / 39.94 → 44.78 | `h17v04`, `h17v05` |
| Japan | 131.32 → 136.97 / 31.53 → 35.56 | `h31v05` |

Three tiles, roughly 92 MB each. Iberia straddles the 40° parallel and needs a vertical mosaic of its two tiles; Japan fits in one. This is a large improvement on VNL, which ships a single multi-gigabyte global raster.

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

It catches gross misconfiguration and nothing finer than that. A correct chord path runs about **0.76** of the kilometre axis, because straight lines cut the corners of a meandering trail. A polyline that jumps between branches or across a loop runs **5–6×** it. There is no ambiguous middle, so on the question "did we pick the right waypoint types for this route" the gate is decisive.

**It is not a positional-quality measure, and reading it as one is backwards.** The ratio is a single number averaged over an entire route, so dense and sparse stretches cancel inside it: camino-frances runs 1.153× across its densely-waypointed segments and 0.845× across its sparse ones, landing at an overall 1.10 that reveals neither. Worse, sparsity actively *rewards* a lower ratio — fewer vertices means more corner-cutting, which shortens the polyline and pulls the ratio toward the same ~0.76 a dense, faithful route also produces. Shikoku scores 0.76, squarely inside the gate, while resting on waypoints a mean 12.6 km apart. The gate cannot distinguish that 0.76 from camino-frances's, and was never designed to — see "Coverage gaps and the propagation kernel" below for the per-segment measure that can.

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

### Coverage gaps and the propagation kernel

An earlier version of this section claimed every coverage gap sits "far inside the 100 km propagation kernel, so an interpolated position between waypoints cannot move a sample outside the blur that produced it." That is measurably false. The kernel is truncated at 100 km, but that radius is where it is cut off, not where its weight lives — it is sharply peaked, with **26.2% of its mass within 1 km, 46.4% within 2 km, 71.2% within 5 km, and 84.5% within 10 km**. Past 5 km, an interpolated position between two real waypoints is standing in for ground the kernel would weight substantially differently from the waypoint it is nearest to.

`interpolated_fraction()` (`scripts/darkness/geometry.py`) measures this per route: the fraction of shipped 1 km samples landing more than `INTERPOLATION_HORIZON_KM` (5 km) along the route from the nearest real waypoint, plus the gap distribution between waypoints. Measured for this bake:

| Route | Waypoints | Mean gap | p90 gap | Max gap | Interpolated fraction | Within 0.25 limit |
|---|---|---|---|---|---|---|
| camino-frances | 1,300 | 0.6 km | 1.6 km | 13.0 km | 0.7% | yes |
| camino-norte | 1,418 | 0.6 km | 1.4 km | 16.7 km | 1.0% | yes |
| camino-primitivo | 270 | 1.0 km | 2.7 km | 12.7 km | 1.1% | yes |
| camino-portugues | 652 | 0.4 km | 0.9 km | 4.7 km | 0.0% | yes |
| camino-ingles | 220 | 0.5 km | 1.2 km | 8.0 km | 0.0% | yes |
| kumano-kodo | 13 | 3.2 km | 6.0 km | 6.7 km | 0.0% | yes |
| shikoku-88 | 87 | 12.6 km | 34.4 km | 80.7 km | **49.8%** | **no** |

Six routes clear `MAX_INTERPOLATED_FRACTION = 0.25` comfortably — most of their samples sit within a kilometre or two of a real waypoint. **Shikoku does not.** Its 87 temples average 12.6 km apart (p90 34.4 km, worst gap 80.7 km, on the loop's remote southern coast), so very nearly half of its 1,081 shipped samples are more than 5 km from a real waypoint. A separate, out-of-band check comparing shipped Shikoku values against the value at the nearest real route point found **8% of samples differing by more than the 0.5 mag validation tolerance, 16% by more than 0.30 mag, worst case 1.63 mag** — large enough to change which descriptive band a reader would see for that stretch of trail.

This is disclosed here, not resolved. `assets/darkness/meta.json` records `maxGapKm`, `p90GapKm`, `meanGapKm`, `interpolatedFraction` and `withinInterpolationLimit` per route under a `geometry` block, and every route's own artifact carries the same numbers under `positionalConfidence`, so a consumer holding one route file does not need `meta.json` to know whether its positions are trustworthy. Shikoku ships with `withinInterpolationLimit: false`. Whether to ship it qualified, resample its polyline more densely, or drop it is a decision for whoever reads that disclosure — deliberately not made by this gate.

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

**Blurred field.** `B_raw(p) = Σ_q w(|p − q|) · L(q) · A_px` where `L` is radiance and `A_px` is the ground area of one pixel.

The `A_px` term is what makes this a discrete area integral rather than a bare sum, and it is load-bearing across regions. Within one region it is constant and the fitted `A` absorbs it; between Iberia and Japan it is not, because pixel ground area varies with latitude. Omitting it ran Japan's radiance 11.8% low against the scale the calibration was fitted on — about 0.1 mag too dark on every Shikoku and Kumano sample, on exactly the routes that carry no held-out validation. It is folded into the kernel itself, so the convolution stays a plain sum.

**Calibration.** Total sky luminance is natural background plus artificial light, summed in luminance space and converted back to magnitudes:

```
B_sky = −2.5 · log₁₀( 10^(−0.4 · M_nat) + A · B_raw^p )
```

with `M_nat = 22.0` mag/arcsec² fixed — the natural sky floor set by airglow, zodiacal light and integrated starlight, below which no sky reads regardless of artificial light. Two fitted parameters (`A`, `p`) plus one searched (`α`).

This replaced an earlier `log₁₀(B_sky) = a · log₁₀(B_raw) + b` form, fit as a straight line in log space. That form is unbounded as `B_raw → 0`: extrapolated past the darkest calibration site, it predicted skies darker than physically possible — 9.8% of samples in the first real bake landed past the natural floor, up to 23.3 mag/arcsec². Summing luminance rather than fitting log-magnitude directly keeps every prediction at or below `M_nat` by construction, and fits the calibration sites at least as well.

### Two implementation traps

**Latitude distortion.** At 43°N, 15 arcsec of longitude is ~340 m while 15 arcsec of latitude is ~460 m. A kernel that is circular in pixel space is an ellipse on the ground. Rather than reprojecting each regional crop to a local equidistant projection — an extra resampling pass that would interpolate radiance values that don't need touching — the kernel itself is built anisotropically in pixel space, wider in columns than in rows by `1/cos(mean latitude)`, so it is circular in ground-distance terms without moving a single source pixel. This is equivalent to reprojecting and preferable to it: same ground-distance correctness, no resampling error. Skipping it silently biases every Iberian sample.

**Convolution cost.** A 100 km radius at 15 arcsec is a ~216-pixel radius, so the kernel is ~433 px across. Convolving an Iberia-sized crop (roughly 2,300 × 900 px) against that directly is on the order of 10¹¹ multiply-adds — intractable. Crop to a bounding box around each route plus a 100 km margin (one for Iberia, one for Shikoku/Kii), then FFT-convolve; that runs in seconds under numpy/scipy.

---

## 4. Validation protocol

**All reference sites must come from one instrument.** This was learned the hard way — see the Result. Mixing two published sources put half the set on a different scale and produced a gate that failed for a reason nothing about the model.

Five same-instrument sites are too few to reserve a fixed held-out slice, so **leave-one-out replaces the split**: every site is predicted by a fit that never saw it, and none is permanently spent. That is stricter than a 5/3 split, not looser — every point gets held out, and nobody can choose which.

Each site needs a **published, citable SQM or sky-brightness reading** with a date and a source URL, recorded in the audit table.

**Pass criteria — both must hold, and each is judged with the model appropriate to it:**

1. **Amplitude — leave-one-out.** Worst absolute residual within **±0.5 mag/arcsec²**, comparable to the spread between SQM units in the field. Each site is predicted by a fit trained without it.
2. **Ordering — the single full-set fit.** Darker measured sites produce darker computed values, no inversions.

The two criteria deliberately use different models. Every leave-one-out prediction comes from a *different* fit, so comparing them against each other measures training-set differences as much as model error — two sites can swap places on noise alone. Ordering therefore has to be judged by one consistent model across all sites.

Descriptive bands ("as dark as it gets in Spain", star counts) are deliberately not a criterion here — banding is a Slice 2 presentation decision and is out of scope for this gate. Validate the number, not the words wrapped around it.

**Failure routes to section 7.** Do not widen the tolerance to make the gate pass.

---

## 5. Tooling and reproducibility

New directory `scripts/darkness/`, holding a Python acquisition script (numpy, scipy, rasterio).

This **deliberately breaks the repo's "no dependencies beyond Node's built-ins" bake rule**, and the README must say so rather than leaving a silent exception. The justification: reading a 90 MB HDF5 grid and FFT-convolving it is not dependency-free Node work, and pretending otherwise would produce something worse than an honest exception.

The property that actually matters is preserved: **the runtime reads only a committed static artifact.** No new runtime dependency, no network call, no build step, no change to how any page loads.

The script runs rarely — only when NASA publishes a new annual composite. It must record, in `meta.json`:

- product name, version and year
- SHA-256 of each source tile
- kernel parameters (`α`, `d₀`, `R`) and the fitted `A`, `p`, `M_nat`
- the reference sites, their leave-one-out residuals, and the gate verdict
- the excluded sites and why each was rejected
- both citation strings
- the `open-pilgrimages` commit SHA the geometry came from

Given identical inputs and recorded parameters, a re-run must be byte-identical — same guarantee as `bake-daylight-routes` and `bake-collective-routes`.

---

## 6. Artifact schema

`assets/darkness/<route-id>.json`:

```json
{
  "route": "camino-frances",
  "epoch": 2025,
  "stepKm": 1,
  "coveredKm": 763.7,
  "unit": "mag/arcsec2",
  "values": [21.4, 21.3, 20.8, "…764 entries…"]
}
```

`coveredKm` is the span the waypoints actually reach, which is not always the route's published length — Shikoku's cover 1,080 of its 1,200 km. Recording it keeps a short ribbon legible as a known limit rather than a mystery.

`assets/darkness/meta.json` carries everything shared: product name and version (VNP46A4 v002) plus the epoch year, checksums, kernel and calibration parameters, the validation table, attributions, and the geometry commit SHA.

Values are plain numbers at three significant figures. No clever quantization — 764 numbers is roughly 5 KB, and boring wins.

`unit` is load-bearing: it is `"mag/arcsec2"` if the gate passes and `"nW/cm2/sr"` if the section 7 fallback applies. Downstream slices branch on it rather than assuming.

---

## 7. The honest fallback

If held-out validation fails, do not launder the number into a sky-brightness claim it cannot support.

Ship banded **upward radiance** instead, and change the language from *how dark the sky is here* to *how lit this place is*. Set `unit` to `"nW/cm2/sr"`, drop the star-count translation, and describe the ribbon as measured ground light rather than modeled sky brightness.

This is a weaker claim and still a true one, and it still produces a beautiful ribbon. Deciding it now, in writing, is far better than deciding it later under shipping pressure — which is when the temptation to widen a tolerance arrives.

---

## 8. Resolved questions

| # | Question | Resolution |
|---|---|---|
| Q1 | Which product version and year? | **VNP46A4 v002, `A2025001`.** CMR collection `C3860065683-LAADS`. Years 2012–2025 are all available and all carry processing version 002. |
| Q2 | Which science dataset? | **`AllAngle_Composite_Snow_Free`**, under `//HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data_Fields/`. float32, 2400×2400, fill value `-999.9`, already in nW/cm²/sr with no scale factor to apply. Replaces the VNL-specific masked/unmasked question, which does not arise for this product. |
| Q3 | Which reference sites? | **Five**, resolved in `scripts/darkness/sites.py`, all from Bará 2016 (*R. Soc. open sci.* 3:160541) — single-instrument Galician SQM readings spanning **18.60–21.60 mag/arcsec²**. Four more sites (Japan Ministry of the Environment 星空観察 survey, Shikoku and Kii) were tried and moved to `EXCLUDED_SITES` on a scale mismatch — see the Result. There is no three-site held-out slice: §4 replaced a fixed split with leave-one-out once five same-instrument sites turned out too few to spend one on. 17.55, this question's old lower bound, is Takamatsu — an excluded site, not a reference one. |
| Q4 | Is there a published regression to cite? | **Yes, but not usable as-is.** Fernández-Ruiz et al. 2023 (*Remote Sens.* 15, 4189) eq. 3 gives `20.93 − 0.95·log₁₀(L)`, r²=0.96 — but it regresses the bare pixel under the photometer in the TESS band and is validated only over 19.41–21.12, and four of our five reference sites (all but Guísamo) fall outside that. Falchi 2016 publishes no directly usable formula. **Decision: fit locally, and report both in the result.** |
| Q5 | Are years inter-comparable for the drift story? | **Yes.** The entire 2012–2025 series was reprocessed under version 002, so year-over-year comparison is valid. This unblocks Slice 4, which is still out of scope here. |

### Georeferencing

GDAL reports no geotransform for these HDF5 grids, so it is constructed from the tile ID: a tile `hHHvVV` covers longitude `−180 + 10·HH` east for 10°, and latitude `90 − 10·VV` south for 10°, over 2400×2400 pixels — exactly 15 arcsec.

### Verified provenance

Downloaded 2026-08-11:

```
f630b820d1fe171f777c7fe2f52521bbcca9f4efc5984ac2f23298da2a20e423  VNP46A4.A2025001.h17v04.h5
51be78e8a75b27b8b8d538ab3d89c94efa0d7c091ffca0662b4180eb50b3beb2  VNP46A4.A2025001.h17v05.h5
6a53be99083e904cd931be6564be224cc7e10b63f55193376fa8d7a2228751a9  VNP46A4.A2025001.h31v05.h5
```

Sanity check on `h31v05`, raw nW/cm²/sr: Takamatsu centre 76.99, Kōchi centre 39.91, Kumano Hongu 0.60, Shikoku mountain interior 0.00, open sea 0.00. Correctly ordered, and the bright end lines up with the Takamatsu reference site at 17.55 mag/arcsec².

---

## Result — 2026-08-11

### Verdict

**The sky-brightness claim is approved.** `unit` is `mag/arcsec2` across all seven routes. 3,288 samples, deterministic across runs.

| | |
|---|---|
| Product | NASA Black Marble VNP46A4 v002, `A2025001`, band `AllAngle_Composite_Snow_Free` |
| Kernel | `α` = 3.00, `d₀` = 1 km, `R` = 100 km |
| Calibration | `M_nat` = 22.0, `A` = 1.2087e-09, `p` = 0.7161 |
| Amplitude (leave-one-out) | worst **0.3781** against a 0.5 tolerance |
| Ordering (full-set fit) | monotonic |
| Full-set worst residual | 0.2643 |

Per-site leave-one-out residuals: Santiago +0.378, Guísamo −0.276, O Cebreiro −0.057, Labrada +0.042, Vigo −0.163.

The tolerance was never widened. Sites did change role after the first failure: the four Japanese sites moved to excluded, and Vigo rejoined the reference set. Both moves follow directly from what the failure exposed, not from wanting a different answer — the instrument-scale mismatch that ruled out the Japanese sites (below), and the fact that Vigo's exclusion had rested on a ≤18.5 mag threshold that existed only to balance against the Japanese sites' range, a reason that no longer applied once they were gone. The verdict does not rest on any single site: dropping any one of the five reference sites and re-running the full alpha search and gate still passes in every case, worst case a leave-one-out residual of 0.4816 mag/arcsec² with Vigo dropped.

### The gate failed first, and the failure was the point

The initial run missed by **0.000344 mag** — a margin small enough to be genuinely tempting. Diagnosing it rather than nudging it found the real problem: the eight reference sites came from two sources on incompatible scales. Fitting the four Galician sites alone gave a worst residual of 0.271, so the model was sound; applying that same relation to the four Japanese sites gave a **+1.164 mag mean offset with a 1.559 spread** — not a constant, so not correctable. The clearest evidence sits in the raw data: Santiago carries roughly twice Takamatsu's radiance yet is published 1.5 mag darker.

Bará 2016 reports SQM m1/3 on clear, moonless nights. The Japan MoE 星空観察 survey reports camera-band medians across all conditions. Those are different quantities. Task 6 had flagged a possible 0.12–0.41 mag offset; the truth was three times larger and not a fixed offset at all.

Resolution: calibrate on the five Galician sites alone, one instrument, and record the four Japanese sites in `EXCLUDED_SITES` with the reason. Vigo (18.60) rejoined the set — it had been excluded only for missing a ≤18.5 threshold that existed to balance against the Japanese sites, a reason that died with them.

### Two corrections found after the pipeline "worked"

**Ordering was being judged across leave-one-out folds.** Each fold's prediction comes from a different fit, so comparing them measures training-set differences as much as model error. It surfaced as Santiago and Guísamo landing 0.0022 apart when they are measured 0.70 apart — coin-flip ordering that would move with the FFT or the numpy build. Amplitude now comes from leave-one-out, ordering from the single full-set fit.

**The first passing bake produced physically impossible values.** 321 of 3,288 samples (9.8%) were darker than the ~22.0 mag/arcsec² natural sky floor — Kumano 71.8% of its length, Shikoku with a maximum of 23.30. `mag = a·log₁₀(raw) + b` is unbounded as radiance approaches zero, while real sky brightness asymptotes to airglow, zodiacal light and starlight. The model is now bounded by construction (section 3), which also fits better: leave-one-out worst improved from 0.4254 to 0.3781. Zero unphysical samples remain.

Every test passed through both of these. Only reading the actual output caught the second.

### Range produced

| Route | Samples | Covered | Range (mag/arcsec²) |
|---|---|---|---|
| camino-frances | 764 | 763.7 km | 18.00 – 21.80 |
| camino-norte | 785 | 784.3 km | 18.00 – 21.50 |
| camino-primitivo | 263 | 262.9 km | 18.50 – 21.80 |
| camino-portugues | 244 | 243.0 km | 18.30 – 20.80 |
| camino-ingles | 112 | 111.6 km | 18.40 – 20.90 |
| shikoku-88 | 1,081 | 1080.0 km | 19.20 – 21.90 |
| kumano-kodo | 39 | 38.0 km | 21.60 – 21.80 |

### Carried forward — read this before Slice 2

**Japan has no held-out validation.** The conversion is atmospheric physics plus one satellite band and should transfer, but the only Japanese ground truth available disagrees by over a magnitude and we cannot prove the fault lies in those measurements rather than in the model. The 1.56 spread across four Japanese sites points at the readings, since a wrong model would bias consistently — suggestive, not conclusive. **The Camino ribbons rest on validated ground; Shikoku and Kumano rest on an assumption.** If Slice 2 puts a number in front of a reader, that distinction belongs in the copy, or the Japanese routes stay qualitative.

**Shikoku's positions are half-interpolated.** Its 87 temple waypoints average 12.6 km apart (p90 34.4 km, max 80.7 km on the loop's remote southern coast), so 49.8% of its 1,081 shipped samples sit more than 5 km along the route from a real waypoint — outside `MAX_INTERPOLATED_FRACTION = 0.25` (see "Coverage gaps and the propagation kernel" in section 2). Every other route ships at ≤1.1% interpolated. This compounds the validation gap above rather than standing apart from it: Shikoku's per-kilometre *positions*, not just its calibration, are the weaker half of this artifact. `assets/darkness/shikoku-88.json` carries `positionalConfidence.withinInterpolationLimit: false` so this travels with the data even for a consumer who never opens `meta.json`. Deciding whether to ship the underlying data qualified, resample it more densely, or drop it entirely remains open and is not this gate's call.

**Binding on Slice 2, not advisory.** Because of the above, Slice 2 must not render per-kilometre detail, star counts, or a "darkest stage" claim for Shikoku. This was decided explicitly by the project owner at this gate, not left as a default Slice 2 is free to revisit on its own — a future Slice 2 author who disagrees needs to bring it back to this decision, not quietly ship the feature. Kumano and the five Caminos are not restricted by this; Shikoku's 49.8% interpolated fraction and `withinInterpolationLimit: false` are what trigger it.

**Bright-end extrapolation has no floor, unlike the dark end.** `M_NAT_MAG` bounds every prediction at the dark end by construction (section 3), but nothing analogous bounds the bright end — a sample brighter than the brightest calibration anchor (Vigo, 18.60) is extrapolating past every reference site with no physical ceiling holding it back. Measured for this bake: 3.6% of Iberia's 2,168 samples (78 of them) read brighter than 18.60. `bake_darkness.py` prints this fraction at bake time so it stays visible run to run rather than requiring a one-off audit to rediscover.

**α is not identified by the five-site reference set.** Leave-one-out worst residual falls monotonically across the whole search grid — 0.641 at α=2.0 to 0.290 at α=5.0 — so without the ordering constraint α would simply run to the grid's edge; there's no interior optimum. What actually pins α=3.00 is the monotonicity check alone, holding by **0.0413 mag** between O Cebreiro (21.60) and Labrada (21.50) — two sites whose published readings differ by 0.10 mag, less than SQM unit-to-unit spread — and it flips at α=3.5. Dropping a single reference site moves the chosen α across the whole grid: without Santiago it lands at 2.00, without O Cebreiro at 4.00, without Labrada at 5.00. Comparing α=2.5 against the shipped α=3.00 — both clear the gate — moves individual route samples by 0.08 mag on average and up to 0.32 mag at the extreme, across all 3,288 samples. **The sky-brightness claim survives this: amplitude passes everywhere from α=2.5 to 5.0.** The per-kilometre numbers do not — read any single value as good to a few tenths of a magnitude, not to the three significant figures it ships with.

**Kumano spans 0.20 mag over its whole length.** It is uniformly dark, which is true and unsurprising for a 39 km mountain trail, but it means its ribbon will be nearly featureless. That is a design problem for Slice 2, not a data problem.

**Extrapolation beyond the calibration range.** The reference sites span 18.60–21.60. Values darker than 21.60 are extrapolated, though now bounded by the natural floor rather than running free.

**Q5 answered early.** The whole 2012–2025 series carries processing version 002, so year-over-year comparison is valid and Slice 4's drift story is unblocked.


## 9. Deliverables

- [x] This document, updated with resolved Q1–Q4 and the completed validation table
- [x] `scripts/darkness/` acquisition script, documented, with the EOG registration step in its header
- [x] `assets/darkness/*.json` — seven route files plus `meta.json`
- [x] A README section explaining the Python exception to the Node-only bake rule
- [x] **A written go/no-go on the sky-brightness claim**

## 10. Definition of done

The gate is complete when a downstream slice can read `assets/darkness/camino-frances.json`, trust `unit`, and render a ribbon without needing to know anything about VIIRS, kernels, or licenses.

## 11. Out of scope

Explicitly not in this gate, to keep it from sprawling:

- Any UI. No ribbon, no bar changes, no copy.
- Arbitrary-coordinate darkness. Seven routes only; no global grid.
- The 2012→present drift series. Gate 0 bakes **one** epoch. Q5 is recorded for Slice 4, not answered here.

  **Update, 2026-08-13 — Slice 4 is cancelled as scoped.** After Slices 1–3 shipped
  (PRs #15–#18), the four-slice roadmap's last entry was reviewed and dropped. It bundled
  four unrelated things with very different merit:

  - **Star counts / 天の川 visibility — cancelled outright, not deferred again.** Measured
    against this gate's own ±0.32 mag uncertainty, **1,899 of 3,288 samples (57.8%) sit
    within one error bar of a naked-eye Milky Way threshold (20.5–21.0 mag/arcsec²)**. For
    most of the route a visible/not-visible claim would flip on our own calibration error.
    That is the exact overclaim this gate exists to prevent, and no amount of presentation
    care fixes it — only a better calibration would, which this project is not going to do.
  - **The 2012→2025 drift story — kept, but relocated.** Q5 stands: the whole series is
    version 002, so the comparison is valid, and a *difference* is more defensible than an
    absolute value because systematic calibration error partly cancels. But its home is
    `/sunpath`, whose opening section is already about the turnings drifting over
    millennia — Earth's tilt on a 13,000-year scale beside our own light on a 13-year one.
    It does not belong as a fourth strip on `/daylight`, which now carries three
    instruments at 106 KB gzipped with no budget.
  - **Moon-vs-town line, night goshuin seal — neither needs a slice.** Small, and separable.

  The practical consequence for this gate: **no second epoch is baked, and no ongoing
  Earthdata dependency exists.** `assets/darkness/` is a snapshot, not a feed — light
  pollution moves a few percent a year and the 2025 epoch does not rot. If the drift story
  is built on `/sunpath` it needs exactly one more bake (2012) behind its own gate, after
  which the dependency ends for good.
- Star-count translation. That is a presentation decision for Slice 2, and it depends on this gate's go/no-go.
