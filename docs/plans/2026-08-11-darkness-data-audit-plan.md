# Darkness Data Audit (Gate 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a validated, openly-licensed per-kilometre darkness artifact for all seven baked pilgrimage routes, plus a written go/no-go on whether the number may be called sky brightness.

**Architecture:** A one-time Python pipeline in `scripts/darkness/` samples VIIRS radiance along real route geometry. Because sky glow travels, the raster is convolved once with a distance-decay kernel before sampling — a stage outside León sits on dark pixels under a washed sky, and point-sampling would miss that. Values are calibrated against published SQM readings from five sites and judged against three held-out sites. Output is static JSON committed to `assets/darkness/`; nothing new runs in the browser.

**Tech Stack:** Python 3 with numpy, scipy, rasterio. Hand-rolled test harnesses matching the repo's existing convention. No pytest, no package.json, no build step.

**Spec:** [`docs/specs/2026-08-11-darkness-data-audit.md`](../specs/2026-08-11-darkness-data-audit.md)

## Global Constraints

- **Runtime is untouched.** The browser reads only committed static JSON. No new network call, no new runtime dependency, no build step, no change to how any page loads.
- **Python is confined to `scripts/darkness/`.** This breaks the repo's "no dependencies beyond Node's built-ins" bake rule. The repo README must name the exception explicitly (Task 9) rather than leave it silent.
- **Tests follow the existing idiom.** Hand-rolled harnesses with `passed`/`failed` counters and `✓`/`✗` output, run directly (`.venv/bin/python scripts/darkness/geometry_test.py`). Mirror `js/daylight-math.test.js`. Do not introduce pytest.
- **Sampling step is exactly 1 km**, along the waypoint polyline from `../open-pilgrimages/routes/*/waypoints.geojson`. `route.geojson` cannot be used — it is raw OSM and sums to far more than the published distance (spec §2).
- **Per-route waypoint type filter.** Shikoku and Kumano use `sacred_site` only; the five Caminos use every type. A polyline whose length falls outside 0.5-1.5x its kilometre span is rejected — **do not widen the bounds to get past it**.
- **Seven routes only.** No arbitrary-coordinate support, no global grid.
- **Kernel form is fixed:** `w(d) = (1 + d/d₀)^(−α)` for `d ≤ R`, with `d₀ = 1 km` and `R = 100 km`. Only `α` is searched.
- **Pass criteria are fixed:** monotonic ordering AND max absolute residual `≤ 0.5` mag/arcsec² on the three held-out sites. **Do not widen the tolerance to make the gate pass** — failure routes to the section 7 fallback.
- **Determinism:** given identical inputs and recorded parameters, a re-run produces byte-identical artifacts. Same guarantee as `bake-daylight-routes`.
- **Attribution is mandatory** in `meta.json`: VIIRS VNL (CC BY 4.0) and OpenStreetMap contributors (ODbL).
- **Falchi 2016 is excluded** (CC BY-NC). Do not reintroduce it, including "just for validation."

---

### Task 1: Waypoint polyline → 1 km sample points

Pure geometry. No raster, no network. This is the foundation every later task indexes against.

**Amended after the original Task 1.** The first version read `route.geojson` and was committed as `f9bf06f`; its `MAX_PART_GAP_KM` guard then fired on real data and proved that file cannot supply a kilometre axis (spec §2 records the measurements). `haversine_km` survives unchanged. The loader is replaced.

**Files:**
- Create: `scripts/darkness/requirements.txt`
- Modify: `scripts/darkness/geometry.py` (replace `route_coords` / `resample_route`; keep `haversine_km`)
- Modify: `scripts/darkness/geometry_test.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `haversine_km(lat1, lon1, lat2, lon2) -> float`
  - `route_polyline(geojson: dict, types) -> list[tuple[float, float, float]]` — `(km, lat, lon)` ascending by km
  - `polyline_ratio(polyline) -> float`
  - `validate_polyline(polyline) -> float` — returns the ratio, raises `ValueError` outside bounds
  - `resample_polyline(polyline, step_km) -> list[tuple[float, float]]` — `(lat, lon)` pairs
  - `WAYPOINT_TYPES: dict[str, tuple | None]`, `MAX_BUCKET_SPREAD_KM = 2.0`, `RATIO_BOUNDS = (0.5, 1.5)`

- [ ] **Step 1: Create the virtualenv and pin dependencies**

Tasks 2 onward import numpy and scipy, so the environment has to exist before the first test that needs it. The system `python3` on macOS has neither — running a test against it fails with `ModuleNotFoundError` that looks like a red test but isn't one.

Create `scripts/darkness/requirements.txt`:

```
numpy==2.1.3
scipy==1.14.1
rasterio==1.4.3
```

Then:

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/darkness/requirements.txt
```

Confirm: `.venv/bin/python -c "import numpy, scipy, rasterio; print('ok')"` prints `ok`.

**Use `.venv/bin/python` for every test command in this plan.**

The repo's `.gitignore` does not cover virtualenvs yet, so add:

```
# Python virtualenv for scripts/darkness/
.venv/
```

- [ ] **Step 2: Write the failing test**

Replace the whole of `scripts/darkness/geometry_test.py` with:

```python
"""Waypoint polyline resampling — test harness.

Run via:  .venv/bin/python scripts/darkness/geometry_test.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geometry as G

passed = 0
failed = 0
failures = []


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print('  ✓ ' + label)
    else:
        failed += 1
        failures.append(label)
        print('  ✗ ' + label)


def approx(actual, expected, tol, label):
    ok(abs(actual - expected) <= tol,
       '%s  (%.6f vs %.6f)' % (label, actual, expected))


# One degree of longitude at the equator is 111.1951 km, so this many degrees
# is exactly one kilometre. It makes every fixture below hand-checkable.
KM_DEG = 0.0089932036


def wp(km, lat, lon, kind='sacred_site'):
    return {'type': 'Feature',
            'properties': {'kmFromStart': km, 'type': kind},
            'geometry': {'type': 'Point', 'coordinates': [lon, lat]}}


def fc(features):
    return {'type': 'FeatureCollection', 'features': features}


print('haversine')
approx(G.haversine_km(0, 0, 0, 1), 111.195, 0.01, 'one degree of longitude at equator')
approx(G.haversine_km(0, 0, 1, 0), 111.195, 0.01, 'one degree of latitude')
approx(G.haversine_km(43, -5, 43, -5), 0.0, 1e-9, 'zero distance')
approx(G.haversine_km(0, 0, 0, KM_DEG), 1.0, 1e-6, 'KM_DEG is one kilometre')

print('route_polyline')
line = fc([wp(2, 0.0, 2 * KM_DEG), wp(0, 0.0, 0.0), wp(1, 0.0, KM_DEG)])
pl = G.route_polyline(line, None)
ok([p[0] for p in pl] == [0, 1, 2], 'sorted ascending by kilometre')
approx(pl[1][2], KM_DEG, 1e-12, 'longitude carried through')
approx(pl[1][1], 0.0, 1e-12, 'latitude carried through')

print('route_polyline — type filter')
mixed = fc([wp(0, 0.0, 0.0, 'sacred_site'),
            wp(1, 0.0, KM_DEG, 'supply'),
            wp(2, 0.0, 2 * KM_DEG, 'sacred_site')])
ok([p[0] for p in G.route_polyline(mixed, ('sacred_site',))] == [0, 2],
   'only the requested types are kept')
ok([p[0] for p in G.route_polyline(mixed, None)] == [0, 1, 2],
   'types=None keeps everything')

print('route_polyline — missing kmFromStart is skipped')
nokm = fc([wp(0, 0.0, 0.0), wp(1, 0.0, KM_DEG),
           {'type': 'Feature', 'properties': {'type': 'sacred_site'},
            'geometry': {'type': 'Point', 'coordinates': [0.5, 0.0]}}])
ok(len(G.route_polyline(nokm, None)) == 2, 'a waypoint without kmFromStart is dropped')

print('route_polyline — same-km centroid')
shared = fc([wp(0, 0.0, 0.0),
             wp(1, 0.0, 0.0), wp(1, 0.0, 2 * KM_DEG),
             wp(2, 0.0, 2 * KM_DEG)])
pl = G.route_polyline(shared, None)
ok(len(pl) == 3, 'points sharing a kilometre collapse to one')
approx(pl[1][2], KM_DEG, 1e-9, 'the collapsed point is their centroid')

print('route_polyline — wide buckets are dropped')
# Two points 3.8 km apart sit 1.9 km from their centroid — inside the limit.
# Deliberately not testing exactly 2.0: a float knife-edge would make the
# test flap rather than tell you anything.
inside = fc([wp(0, 0.0, 0.0),
             wp(1, 0.0, -1.9 * KM_DEG), wp(1, 0.0, 1.9 * KM_DEG),
             wp(2, 0.0, 2 * KM_DEG)])
ok(len(G.route_polyline(inside, None)) == 3, 'a bucket inside the limit is kept')

too_wide = fc([wp(0, 0.0, 0.0),
               wp(1, 0.0, -2.1 * KM_DEG), wp(1, 0.0, 2.1 * KM_DEG),
               wp(2, 0.0, 2 * KM_DEG)])
ok([p[0] for p in G.route_polyline(too_wide, None)] == [0, 2],
   'a bucket spread beyond the limit is dropped')

ok(G.MAX_BUCKET_SPREAD_KM == 2.0, 'the spread limit is 2.0 km')

print('route_polyline — refuses unusable input')
for bad, why in [(fc([]), 'no features'),
                 (fc([wp(0, 0.0, 0.0)]), 'a single waypoint')]:
    try:
        G.route_polyline(bad, None)
        ok(False, 'raises on %s' % why)
    except ValueError:
        ok(True, 'raises on %s' % why)

print('polyline_ratio')
straight = [(0, 0.0, 0.0), (1, 0.0, KM_DEG), (2, 0.0, 2 * KM_DEG)]
approx(G.polyline_ratio(straight), 1.0, 1e-6, 'a straight polyline scores 1.0')

zigzag = [(0, 0.0, 0.0), (1, 0.0, 10 * KM_DEG), (2, 0.0, 0.0)]
approx(G.polyline_ratio(zigzag), 10.0, 1e-6, 'a branch-hopping polyline scores 10')

short = [(0, 0.0, 0.0), (10, 0.0, 5 * KM_DEG)]
approx(G.polyline_ratio(short), 0.5, 1e-6, 'a chord across a meander scores 0.5')

print('validate_polyline')
approx(G.validate_polyline(straight), 1.0, 1e-6, 'a sane polyline validates and returns its ratio')
approx(G.validate_polyline(short), 0.5, 1e-6, 'exactly 0.5 is inside the bounds')
ok(G.RATIO_BOUNDS == (0.5, 1.5), 'bounds are [0.5, 1.5]')

try:
    G.validate_polyline(zigzag)
    ok(False, 'a branch-hopping polyline is rejected')
except ValueError:
    ok(True, 'a branch-hopping polyline is rejected')

try:
    G.validate_polyline([(5, 0.0, 0.0), (5, 0.0, KM_DEG)])
    ok(False, 'a zero kilometre span is rejected')
except ValueError:
    ok(True, 'a zero kilometre span is rejected')

print('resample_polyline')
pts = G.resample_polyline(straight, 1.0)
ok(len(pts) == 3, 'a 2 km span at 1 km yields 3 points (got %d)' % len(pts))
approx(pts[0][1], 0.0, 1e-12, 'starts at the first waypoint')
approx(pts[2][1], 2 * KM_DEG, 1e-12, 'ends at the last waypoint')
approx(G.haversine_km(pts[0][0], pts[0][1], pts[1][0], pts[1][1]), 1.0, 1e-6,
       'consecutive samples are 1 km apart')

sparse = [(0, 0.0, 0.0), (10, 0.0, 10 * KM_DEG)]
pts = G.resample_polyline(sparse, 1.0)
ok(len(pts) == 11, 'interpolates across a 10 km waypoint gap (got %d)' % len(pts))
approx(pts[5][1], 5 * KM_DEG, 1e-9, 'the midpoint interpolates linearly')

ragged = [(0, 0.0, 0.0), (2.5, 0.0, 2.5 * KM_DEG)]
ok(len(G.resample_polyline(ragged, 1.0)) == 3,
   'a fractional span truncates rather than overshooting')

ok(G.resample_polyline(straight, 1.0) == G.resample_polyline(straight, 1.0),
   'resampling is deterministic')

print('WAYPOINT_TYPES')
ok(G.WAYPOINT_TYPES['shikoku-88'] == ('sacred_site',), 'shikoku uses temples')
ok(G.WAYPOINT_TYPES['kumano-kodo'] == ('sacred_site',), 'kumano uses shrines')
ok(G.WAYPOINT_TYPES['camino-frances'] is None, 'the caminos use every type')
ok(len(G.WAYPOINT_TYPES) == 7, 'all seven routes are configured')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/bin/python scripts/darkness/geometry_test.py`
Expected: FAIL with `AttributeError: module 'geometry' has no attribute 'route_polyline'`

- [ ] **Step 4: Write minimal implementation**

Replace the whole of `scripts/darkness/geometry.py` with:

```python
"""Build a kilometre-indexed polyline for a pilgrimage route.

The route line itself cannot be used. `route.geojson` in the sibling
open-pilgrimages repo is raw OpenStreetMap output — a superset of the walked
route containing variants, alternates and duplicated ways — so it sums to far
more than the published distance and no ordering fixes it. Spec section 2
records the measurements.

`waypoints.geojson` works instead: every waypoint carries a kmFromStart that
upstream already projected onto the route, which is the axis we need.
"""
import math

R_EARTH_KM = 6371.0088

# Which waypoint types define each route's line.
#
# The Caminos use every type: their amenities sit within a few hundred metres
# of the trail. The two Japanese routes cannot — amenity kilometres are
# ambiguous around Shikoku's loop and across Kumano's seven branches, and
# including them produces a polyline five to six times its own kilometre span.
# Their sacred sites (Shikoku's 88 temples, Kumano's oji shrines) are the
# route.
WAYPOINT_TYPES = {
    'shikoku-88': ('sacred_site',),
    'kumano-kodo': ('sacred_site',),
    'camino-frances': None,
    'camino-ingles': None,
    'camino-norte': None,
    'camino-portugues': None,
    'camino-primitivo': None,
}

# Several waypoints often share a kilometre. Their centroid stands in for the
# route there — unless they disagree by more than this, which means the
# projection is unreliable. Shikoku files 145 waypoints at km 728 spanning
# 68 km; their centroid lands in the sea.
MAX_BUCKET_SPREAD_KM = 2.0

# A polyline's length divided by its kilometre span. A correct chord path runs
# about 0.76, cutting the corners of a meandering trail. A polyline that jumps
# between branches runs 5-6. Nothing real lands in between.
RATIO_BOUNDS = (0.5, 1.5)


def haversine_km(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * R_EARTH_KM * math.asin(math.sqrt(a))


def route_polyline(geojson, types):
    """Waypoints as an ascending list of (km, lat, lon).

    types is a tuple of waypoint types to keep, or None to keep all.
    """
    buckets = {}
    for feature in geojson.get('features', []):
        props = feature.get('properties', {})
        km = props.get('kmFromStart')
        if km is None:
            continue
        if types is not None and props.get('type') not in types:
            continue
        lon, lat = feature['geometry']['coordinates'][:2]
        buckets.setdefault(float(km), []).append((float(lat), float(lon)))

    polyline = []
    for km in sorted(buckets):
        points = buckets[km]
        lat = sum(p[0] for p in points) / len(points)
        lon = sum(p[1] for p in points) / len(points)
        spread = max(haversine_km(lat, lon, p[0], p[1]) for p in points)
        if spread > MAX_BUCKET_SPREAD_KM:
            continue
        polyline.append((km, lat, lon))

    if len(polyline) < 2:
        raise ValueError(
            'only %d usable waypoint(s) after filtering; need at least two'
            % len(polyline))
    return polyline


def polyline_ratio(polyline):
    """Polyline length divided by the kilometre span it claims to cover."""
    span = polyline[-1][0] - polyline[0][0]
    if span <= 0.0:
        raise ValueError('waypoint kilometres do not advance')
    length = sum(haversine_km(polyline[i][1], polyline[i][2],
                              polyline[i + 1][1], polyline[i + 1][2])
                 for i in range(len(polyline) - 1))
    return length / span


def validate_polyline(polyline):
    """Fail loudly when the waypoint selection produced nonsense."""
    ratio = polyline_ratio(polyline)
    low, high = RATIO_BOUNDS
    if not (low <= ratio <= high):
        raise ValueError(
            'polyline runs %.2f x its kilometre span, outside [%.1f, %.1f] — '
            'the waypoint type filter is probably wrong for this route'
            % (ratio, low, high))
    return ratio


def resample_polyline(polyline, step_km):
    """Positions every step_km across the polyline's covered span."""
    start = polyline[0][0]
    end = polyline[-1][0]
    count = int(math.floor((end - start) / step_km)) + 1

    out = []
    seg = 0
    for i in range(count):
        km = start + i * step_km
        while seg + 2 < len(polyline) and polyline[seg + 1][0] < km:
            seg += 1
        km0, lat0, lon0 = polyline[seg]
        km1, lat1, lon1 = polyline[seg + 1]
        f = 0.0 if km1 == km0 else (km - km0) / (km1 - km0)
        f = max(0.0, min(1.0, f))
        out.append((lat0 + (lat1 - lat0) * f, lon0 + (lon1 - lon0) * f))
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/python scripts/darkness/geometry_test.py`
Expected: PASS — `37 passed, 0 failed`, exit 0

- [ ] **Step 6: Verify against real waypoint data**

Run:

```bash
.venv/bin/python -c "
import json, sys
sys.path.insert(0, 'scripts/darkness')
import geometry as G
stated = {'shikoku-88':1200,'kumano-kodo':39,'camino-frances':764,
          'camino-ingles':112,'camino-norte':784,'camino-portugues':243,
          'camino-primitivo':263}
for rid, km in stated.items():
    g = json.load(open('../open-pilgrimages/routes/%s/waypoints.geojson' % rid))
    pl = G.route_polyline(g, G.WAYPOINT_TYPES[rid])
    ratio = G.validate_polyline(pl)
    pts = G.resample_polyline(pl, 1.0)
    print('%-18s kept=%4d  covers %.0f-%.0f of %d km  ratio %.2f  samples %d'
          % (rid, len(pl), pl[0][0], pl[-1][0], km, ratio, len(pts)))
"
```

Expected — these were measured during planning, so they should reproduce closely:

```
shikoku-88         kept=  88  covers 0-1080 of 1200 km  ratio 0.76  samples 1081
kumano-kodo        kept=  13  covers 0-38 of 39 km      ratio 0.76  samples 39
camino-frances     kept=1300  covers 0-764 of 764 km    ratio 1.10  samples 765
camino-ingles      kept= 220  covers 0-112 of 112 km    ratio 1.07  samples 113
camino-norte       kept=1418  covers 0-784 of 784 km    ratio 1.07  samples 785
camino-portugues   kept= 652  covers 0-243 of 243 km    ratio 1.26  samples 244
camino-primitivo   kept= 270  covers 0-263 of 263 km    ratio 0.90  samples 264
```

`validate_polyline` raising on any route means the type filter is wrong for it — do not widen `RATIO_BOUNDS` to get past it. Shikoku covering 1,080 of 1,200 km is expected and recorded; the artifact carries `coveredKm` so it reads as a known limit.

- [ ] **Step 7: Commit**

```bash
git add scripts/darkness/requirements.txt .gitignore \
        scripts/darkness/geometry.py scripts/darkness/geometry_test.py
git commit -m "fix(darkness): take the kilometre axis from the waypoints"
```

---

### Task 2: Anisotropic distance-decay kernel

**Files:**
- Create: `scripts/darkness/kernel.py`
- Create: `scripts/darkness/kernel_test.py`

**Interfaces:**
- Consumes: nothing
- Produces: `build_kernel(alpha, d0_km, radius_km, deg_per_px, mean_lat_deg) -> numpy.ndarray` (2-D, odd side lengths, centre is the maximum)

A kernel that is circular in pixel space is an ellipse on the ground: at 43°N one degree of longitude is ~0.73 of one degree of latitude. Rather than reproject the raster, scale the kernel's axes. Routes span narrow latitude bands, so the route's mean latitude is accurate to well under a percent.

- [ ] **Step 1: Write the failing test**

Create `scripts/darkness/kernel_test.py`:

```python
"""Light-propagation kernel — test harness.

Run via:  .venv/bin/python scripts/darkness/kernel_test.py
"""
import math
import sys
import os

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kernel as K

passed = 0
failed = 0
failures = []


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print('  ✓ ' + label)
    else:
        failed += 1
        failures.append(label)
        print('  ✗ ' + label)


DEG_PER_PX = 15.0 / 3600.0  # VIIRS VNL native resolution

print('shape and symmetry')
k = K.build_kernel(alpha=2.0, d0_km=1.0, radius_km=100.0,
                   deg_per_px=DEG_PER_PX, mean_lat_deg=0.0)
ok(k.shape[0] % 2 == 1 and k.shape[1] % 2 == 1, 'both dimensions are odd')
ok(np.allclose(k, k[::-1, :]), 'symmetric top to bottom')
ok(np.allclose(k, k[:, ::-1]), 'symmetric left to right')
cy, cx = k.shape[0] // 2, k.shape[1] // 2
ok(k[cy, cx] == k.max(), 'centre is the maximum')
ok(abs(k[cy, cx] - 1.0) < 1e-12, 'centre equals 1.0 before normalisation')

print('anisotropy')
k43 = K.build_kernel(alpha=2.0, d0_km=1.0, radius_km=100.0,
                     deg_per_px=DEG_PER_PX, mean_lat_deg=43.0)
ok(k43.shape[1] > k43.shape[0],
   'at 43N the kernel spans more columns than rows (%d vs %d)'
   % (k43.shape[1], k43.shape[0]))
ratio = float(k43.shape[1]) / float(k43.shape[0])
ok(abs(ratio - 1.0 / math.cos(math.radians(43.0))) < 0.05,
   'column-to-row ratio tracks 1/cos(lat)  (%.3f)' % ratio)
ok(np.allclose(k43.shape, K.build_kernel(2.0, 1.0, 100.0, DEG_PER_PX, -43.0).shape),
   'southern latitudes give the same shape as northern')

print('decay and truncation')
ok(k[cy, cx] > k[cy, cx + 10] > k[cy, cx + 100], 'decays monotonically outward')
ok(k.min() == 0.0, 'corners beyond the radius are zero')
ok(float(k[0, 0]) == 0.0, 'the far corner is truncated')
ok(np.all(k >= 0.0), 'no negative weights')
ok(np.isfinite(k).all(), 'all weights are finite')

steep = K.build_kernel(alpha=3.0, d0_km=1.0, radius_km=100.0,
                       deg_per_px=DEG_PER_PX, mean_lat_deg=0.0)
ok(steep[cy, cx + 50] < k[cy, cx + 50], 'a larger alpha decays faster')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python scripts/darkness/kernel_test.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'kernel'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/darkness/kernel.py`:

```python
"""Radially-symmetric light-propagation kernel.

Sky glow above a point is produced by light emitted across a wide
surrounding area and scattered back down. Convolving the radiance raster
with this kernel once, then point-sampling the result, approximates that
without a full atmospheric model.

Form:  w(d) = (1 + d/d0) ** -alpha   for d <= radius, else 0.

The kernel is built in ground-distance space, so it is wider in columns
than in rows away from the equator. Only alpha is searched during
calibration; d0 and radius are fixed by the spec.
"""
import math

import numpy as np

KM_PER_DEG_LAT = 111.32


def build_kernel(alpha, d0_km, radius_km, deg_per_px, mean_lat_deg):
    km_per_px_y = deg_per_px * KM_PER_DEG_LAT
    km_per_px_x = deg_per_px * KM_PER_DEG_LAT * math.cos(math.radians(mean_lat_deg))
    if km_per_px_x <= 0.0:
        raise ValueError('mean latitude too close to the pole')

    ny = int(math.ceil(radius_km / km_per_px_y))
    nx = int(math.ceil(radius_km / km_per_px_x))

    yy = (np.arange(-ny, ny + 1, dtype=float) * km_per_px_y)[:, None]
    xx = (np.arange(-nx, nx + 1, dtype=float) * km_per_px_x)[None, :]
    d = np.sqrt(yy * yy + xx * xx)

    w = (1.0 + d / d0_km) ** (-float(alpha))
    w[d > radius_km] = 0.0
    return w
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python scripts/darkness/kernel_test.py`
Expected: PASS — `14 passed, 0 failed`, exit 0

- [ ] **Step 5: Commit**

```bash
git add scripts/darkness/kernel.py scripts/darkness/kernel_test.py
git commit -m "feat(darkness): how far a town throws its light"
```

---

### Task 3: Convolution and bilinear sampling

**Files:**
- Create: `scripts/darkness/raster.py`
- Create: `scripts/darkness/raster_test.py`

**Interfaces:**
- Consumes: `kernel.build_kernel`
- Produces:
  - `convolve_field(radiance: np.ndarray, kern: np.ndarray) -> np.ndarray` (same shape as input)
  - `sample_bilinear(arr, west_deg, north_deg, deg_per_px, lat, lon) -> float`

`sample_bilinear` uses **pixel-centre** convention. A GeoTIFF transform gives the upper-left *corner* of the upper-left pixel, so the centre of pixel `[0,0]` sits half a pixel inside. Getting this wrong biases every sample by half a pixel — about 250 m — which is invisible in testing and systematically wrong in the output.

- [ ] **Step 1: Write the failing test**

Create `scripts/darkness/raster_test.py`:

```python
"""Convolution and sampling — test harness.

Run via:  .venv/bin/python scripts/darkness/raster_test.py
"""
import sys
import os

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raster as R
import kernel as K

passed = 0
failed = 0
failures = []


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print('  ✓ ' + label)
    else:
        failed += 1
        failures.append(label)
        print('  ✗ ' + label)


def approx(actual, expected, tol, label):
    ok(abs(actual - expected) <= tol,
       '%s  (%.6f vs %.6f)' % (label, actual, expected))


print('convolution')
field = np.zeros((41, 41))
field[20, 20] = 1.0
kern = np.array([[0.0, 1.0, 0.0],
                 [1.0, 4.0, 1.0],
                 [0.0, 1.0, 0.0]])
out = R.convolve_field(field, kern)
ok(out.shape == field.shape, 'output keeps the input shape')
approx(out[20, 20], 4.0, 1e-9, 'impulse reproduces the kernel centre')
approx(out[19, 20], 1.0, 1e-9, 'impulse reproduces the kernel edge')
approx(out[19, 19], 0.0, 1e-9, 'impulse reproduces the kernel corner')

flat = np.ones((31, 31))
out_flat = R.convolve_field(flat, kern)
approx(out_flat[15, 15], 8.0, 1e-9, 'a flat field returns the kernel sum')

ok(np.all(R.convolve_field(np.zeros((11, 11)), kern) == 0.0),
   'an empty field stays empty')

big = K.build_kernel(2.0, 1.0, 20.0, 15.0 / 3600.0, 43.0)
ok(np.isfinite(R.convolve_field(np.ones((200, 200)), big)).all(),
   'a realistic kernel convolves without overflow')

print('bilinear sampling — pixel-centre convention')
# 4x4 grid, upper-left CORNER at (10E, 50N), 1 degree pixels.
# Pixel [r,c] centre is therefore at lon = 10 + c + 0.5, lat = 50 - r - 0.5.
#   0  1  2  3
#   4  5  6  7
#   8  9 10 11
#  12 13 14 15
arr = np.arange(16, dtype=float).reshape(4, 4)
WEST, NORTH, STEP = 10.0, 50.0, 1.0

approx(R.sample_bilinear(arr, WEST, NORTH, STEP, 49.5, 10.5), 0.0, 1e-9,
       'exact centre of pixel [0,0]')
approx(R.sample_bilinear(arr, WEST, NORTH, STEP, 48.5, 11.5), 5.0, 1e-9,
       'exact centre of pixel [1,1]')
approx(R.sample_bilinear(arr, WEST, NORTH, STEP, 47.5, 12.5), 10.0, 1e-9,
       'exact centre of pixel [2,2]')
approx(R.sample_bilinear(arr, WEST, NORTH, STEP, 49.5, 11.0), 0.5, 1e-9,
       'midway between two horizontal neighbours')
approx(R.sample_bilinear(arr, WEST, NORTH, STEP, 49.0, 10.5), 2.0, 1e-9,
       'midway between two vertical neighbours')
approx(R.sample_bilinear(arr, WEST, NORTH, STEP, 49.0, 11.0), 2.5, 1e-9,
       'centre of a four-pixel block is their mean')

# Bilinear needs a neighbour on each side, so the FINAL pixel centre is not
# interpolable. This is why bake_darkness.py crops with MARGIN_DEG well
# beyond the kernel radius — no route point ever lands near a crop edge.
for lat, lon, why in [(46.5, 13.5, 'the last pixel centre'),
                      (49.5, 9.0, 'west of the grid'),
                      (49.5, 15.0, 'east of the grid'),
                      (52.0, 10.5, 'north of the grid'),
                      (45.0, 10.5, 'south of the grid')]:
    try:
        R.sample_bilinear(arr, WEST, NORTH, STEP, lat, lon)
        ok(False, 'out of bounds raises (%s)' % why)
    except IndexError:
        ok(True, 'out of bounds raises (%s)' % why)

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python scripts/darkness/raster_test.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'raster'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/darkness/raster.py`:

```python
"""Convolve a radiance raster and sample it at geographic points.

A 100 km radius at 15 arcsec is a ~900-pixel radius, so direct
convolution is intractable. FFT convolution over a cropped region runs in
seconds.
"""
import math

import numpy as np
from scipy.signal import fftconvolve


def convolve_field(radiance, kern):
    """Blur radiance by the propagation kernel, preserving shape."""
    return fftconvolve(np.asarray(radiance, dtype=float),
                       np.asarray(kern, dtype=float),
                       mode='same')


def sample_bilinear(arr, west_deg, north_deg, deg_per_px, lat, lon):
    """Bilinearly sample arr at (lat, lon).

    west_deg / north_deg are the CORNER of the upper-left pixel, matching
    the GeoTIFF transform. Pixel centres sit half a pixel inside, so the
    half-pixel offset below is load-bearing.
    """
    x = (lon - west_deg) / deg_per_px - 0.5
    y = (north_deg - lat) / deg_per_px - 0.5

    x0 = int(math.floor(x))
    y0 = int(math.floor(y))

    if x0 < 0 or y0 < 0 or x0 + 1 >= arr.shape[1] or y0 + 1 >= arr.shape[0]:
        raise IndexError(
            'point (%.5f, %.5f) falls outside the raster crop' % (lat, lon))

    fx = x - x0
    fy = y - y0

    top = arr[y0, x0] * (1.0 - fx) + arr[y0, x0 + 1] * fx
    bottom = arr[y0 + 1, x0] * (1.0 - fx) + arr[y0 + 1, x0 + 1] * fx
    return float(top * (1.0 - fy) + bottom * fy)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python scripts/darkness/raster_test.py`
Expected: PASS — `18 passed, 0 failed`, exit 0

- [ ] **Step 5: Commit**

```bash
git add scripts/darkness/raster.py scripts/darkness/raster_test.py
git commit -m "feat(darkness): blur the map, then read it where the path runs"
```

---

### Task 4: Calibration and validation

**Files:**
- Create: `scripts/darkness/calibrate.py`
- Create: `scripts/darkness/calibrate_test.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `fit_calibration(raw: list[float], measured: list[float]) -> (a, b, residuals)`
  - `predict(raw, a, b) -> list[float]`
  - `validate(predicted, measured, tol=0.5) -> dict` with keys `monotonic`, `within_tolerance`, `max_abs_residual`, `residuals`, `passed`
  - `TOLERANCE_MAG = 0.5`

Magnitudes per square arcsecond are already a logarithmic quantity, so the fit is `mag = a·log₁₀(B_raw) + b`. This is algebraically the same relation the spec writes as `log₁₀(B_sky) = a·log₁₀(B_raw) + b`, since mag and brightness differ by a fixed logarithmic transform. A physically sensible fit gives **negative `a`** — more scattered light means a brighter, i.e. numerically smaller, magnitude.

- [ ] **Step 1: Write the failing test**

Create `scripts/darkness/calibrate_test.py`:

```python
"""Calibration and validation — test harness.

Run via:  .venv/bin/python scripts/darkness/calibrate_test.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calibrate as C

passed = 0
failed = 0
failures = []


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print('  ✓ ' + label)
    else:
        failed += 1
        failures.append(label)
        print('  ✗ ' + label)


def approx(actual, expected, tol, label):
    ok(abs(actual - expected) <= tol,
       '%s  (%.6f vs %.6f)' % (label, actual, expected))


print('fit recovers known parameters')
raw = [0.1, 1.0, 10.0, 100.0, 1000.0]
truth_a, truth_b = -1.8, 21.9
measured = [truth_a * (i - 1) + truth_b for i in range(5)]  # log10 of raw is -1..3
a, b, resid = C.fit_calibration(raw, measured)
approx(a, truth_a, 1e-9, 'slope recovered')
approx(b, truth_b, 1e-9, 'intercept recovered')
ok(max(abs(r) for r in resid) < 1e-9, 'residuals vanish on exact data')
ok(a < 0, 'more light means a numerically smaller magnitude')

print('predict')
pred = C.predict(raw, a, b)
ok(len(pred) == len(raw), 'one prediction per input')
approx(pred[0], measured[0], 1e-9, 'prediction matches the fit')

print('validate — passing case')
res = C.validate([21.0, 20.0, 18.0], [21.2, 20.1, 18.3])
ok(res['passed'], 'close and correctly ordered passes')
ok(res['monotonic'], 'ordering flagged monotonic')
approx(res['max_abs_residual'], 0.3, 1e-9, 'max residual reported')

print('validate — tolerance boundary')
ok(C.validate([21.0], [21.5])['within_tolerance'],
   'exactly 0.5 is within tolerance')
ok(not C.validate([21.0], [21.51])['within_tolerance'],
   '0.51 is outside tolerance')
ok(not C.validate([21.0], [21.51])['passed'], 'exceeding tolerance fails')

print('validate — ordering')
inverted = C.validate([20.0, 21.0], [21.0, 20.0])
ok(not inverted['monotonic'], 'an inversion is detected')
ok(not inverted['passed'], 'an inversion fails the gate')

print('validate — tolerance is not a free parameter')
ok(C.TOLERANCE_MAG == 0.5, 'the default tolerance is 0.5 mag/arcsec2')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python scripts/darkness/calibrate_test.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'calibrate'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/darkness/calibrate.py`:

```python
"""Fit blurred radiance to measured sky brightness, and judge the fit.

Five calibration sites set the parameters. Three held-out sites decide
the gate. The tolerance is fixed by the spec and must not be widened to
make a failing run pass.
"""
import numpy as np

TOLERANCE_MAG = 0.5


def fit_calibration(raw, measured):
    """Least-squares fit of  mag = a * log10(raw) + b."""
    x = np.log10(np.asarray(raw, dtype=float))
    y = np.asarray(measured, dtype=float)
    if not np.isfinite(x).all():
        raise ValueError('non-positive raw value: cannot take a logarithm')
    design = np.vstack([x, np.ones_like(x)]).T
    (a, b), _, _, _ = np.linalg.lstsq(design, y, rcond=None)
    residuals = (y - (a * x + b)).tolist()
    return float(a), float(b), residuals


def predict(raw, a, b):
    x = np.log10(np.asarray(raw, dtype=float))
    return (a * x + b).tolist()


def validate(predicted, measured, tol=TOLERANCE_MAG):
    """Judge held-out sites. Both criteria must hold."""
    p = np.asarray(predicted, dtype=float)
    m = np.asarray(measured, dtype=float)
    residual = p - m
    max_abs = float(np.max(np.abs(residual)))
    within = bool(max_abs <= tol)
    monotonic = bool(np.array_equal(np.argsort(p, kind='stable'),
                                    np.argsort(m, kind='stable')))
    return {
        'monotonic': monotonic,
        'within_tolerance': within,
        'max_abs_residual': max_abs,
        'residuals': residual.tolist(),
        'passed': monotonic and within,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python scripts/darkness/calibrate_test.py`
Expected: PASS — `15 passed, 0 failed`, exit 0

- [ ] **Step 5: Commit**

```bash
git add scripts/darkness/calibrate.py scripts/darkness/calibrate_test.py
git commit -m "feat(darkness): fit the model, then let held-out sky judge it"
```

---

### Task 5: Artifact emission

**Files:**
- Create: `scripts/darkness/emit.py`
- Create: `scripts/darkness/emit_test.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `round_sig(value: float, digits: int = 3) -> float`
  - `route_artifact(route_id, epoch, step_km, unit, values, covered_km) -> dict`
  - `dumps(obj) -> str` — the single canonical serialiser, used for every file
  - `UNIT_SKY = 'mag/arcsec2'`, `UNIT_RADIANCE = 'nW/cm2/sr'`

- [ ] **Step 1: Write the failing test**

Create `scripts/darkness/emit_test.py`:

```python
"""Artifact emission — test harness.

Run via:  .venv/bin/python scripts/darkness/emit_test.py
"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import emit as E

passed = 0
failed = 0
failures = []


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print('  ✓ ' + label)
    else:
        failed += 1
        failures.append(label)
        print('  ✗ ' + label)


print('significant-figure rounding')
ok(E.round_sig(21.4372) == 21.4, 'a magnitude keeps three figures')
ok(E.round_sig(0.0512345) == 0.0512, 'a small radiance keeps three figures')
ok(E.round_sig(1234.5) == 1230.0, 'a large value keeps three figures')
ok(E.round_sig(0.0) == 0.0, 'zero survives')
ok(E.round_sig(-3.14159) == -3.14, 'negatives round too')

print('artifact shape')
art = E.route_artifact('camino-frances', 2024, 1, E.UNIT_SKY, [21.4372, 20.11, 18.0], 764.0)
ok(art['route'] == 'camino-frances', 'route id carried')
ok(art['epoch'] == 2024, 'epoch carried')
ok(art['stepKm'] == 1, 'step carried')
ok(art['coveredKm'] == 764.0, 'covered span carried')
ok(art['unit'] == 'mag/arcsec2', 'unit carried')
ok(art['values'] == [21.4, 20.1, 18.0], 'values rounded')
ok(list(art.keys()) == ['route', 'epoch', 'stepKm', 'coveredKm', 'unit', 'values'],
   'key order is fixed')

print('the fallback unit is reachable')
fb = E.route_artifact('kumano-kodo', 2024, 1, E.UNIT_RADIANCE, [0.512], 38.0)
ok(fb['unit'] == 'nW/cm2/sr', 'radiance unit carried')

print('rejects bad input')
for bad, why in [(('x', 2024, 1, 'bogus/unit', [1.0], 10.0), 'an unknown unit'),
                 (('x', 2024, 1, E.UNIT_SKY, [], 10.0), 'an empty value list')]:
    try:
        E.route_artifact(*bad)
        ok(False, 'raises on %s' % why)
    except ValueError:
        ok(True, 'raises on %s' % why)

print('determinism')
a = E.dumps(art)
b = E.dumps(E.route_artifact('camino-frances', 2024, 1, E.UNIT_SKY,
                             [21.4372, 20.11, 18.0], 764.0))
ok(a == b, 'two runs serialise identically')
ok(a.endswith('\n'), 'output ends with a newline')
ok(json.loads(a) == art, 'output round-trips through json')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python scripts/darkness/emit_test.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'emit'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/darkness/emit.py`:

```python
"""Serialise darkness artifacts.

Every file the pipeline writes goes through dumps(), so re-running with
identical inputs produces byte-identical output — the same guarantee
bake-daylight-routes and bake-collective-routes make.
"""
import json
import math

UNIT_SKY = 'mag/arcsec2'
UNIT_RADIANCE = 'nW/cm2/sr'
UNITS = (UNIT_SKY, UNIT_RADIANCE)


def round_sig(value, digits=3):
    v = float(value)
    if v == 0.0:
        return 0.0
    places = digits - int(math.floor(math.log10(abs(v)))) - 1
    return round(v, places)


def route_artifact(route_id, epoch, step_km, unit, values, covered_km):
    """One route's darkness profile.

    covered_km is the kilometre span the waypoints actually reach, which is
    not always the route's published length — Shikoku's waypoints cover 1080
    of its 1200 km. Recording it keeps a short ribbon legible as a known
    limit rather than a mystery.
    """
    if unit not in UNITS:
        raise ValueError('unknown unit %r; expected one of %r' % (unit, UNITS))
    if not values:
        raise ValueError('route %s has no sample values' % route_id)
    return {
        'route': route_id,
        'epoch': epoch,
        'stepKm': step_km,
        'coveredKm': round_sig(covered_km, 4),
        'unit': unit,
        'values': [round_sig(v) for v in values],
    }


def dumps(obj):
    """The one canonical serialiser. Deterministic by construction."""
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python scripts/darkness/emit_test.py`
Expected: PASS — `18 passed, 0 failed`, exit 0

- [ ] **Step 5: Commit**

```bash
git add scripts/darkness/emit.py scripts/darkness/emit_test.py
git commit -m "feat(darkness): write it down the same way every time"
```

---

### Task 6: Reference sites (resolves spec Q3)

**This task is research, not code.** It cannot be completed by guessing values — every entry needs a real, citable published reading. Fabricated reference data would make the gate meaningless while appearing to pass.

**Files:**
- Create: `scripts/darkness/sites.py`
- Create: `scripts/darkness/sites_test.py`
- Modify: `docs/specs/2026-08-11-darkness-data-audit.md` (fill the Q3 row)

**Interfaces:**
- Consumes: nothing
- Produces: `CALIBRATION_SITES` and `VALIDATION_SITES`, each a list of dicts with keys `name`, `lat`, `lon`, `mag_arcsec2`, `measured_date`, `source_url`

- [ ] **Step 1: Gather eight sites with published readings**

Find eight locations with citable published SQM or sky-brightness measurements in mag/arcsec². Requirements:

- Span the full range: at least one certified dark-sky site (≥21.5), at least one city centre (≤18.5), and a spread between.
- Prefer Spain and Japan, so calibration reflects the geography actually shipped. Sites elsewhere are acceptable if the range demands them.
- Every entry needs a source URL and a measurement date. Good sources: International Dark-Sky Association park applications, the Globe at Night database, published papers with site tables, national dark-sky survey reports.
- Split five to calibration, three to validation. **Assign the split before looking at any computed value** — choosing the held-out set after seeing results is how a gate quietly stops being a gate. Put the widest-spanning five in calibration.

- [ ] **Step 2: Write the failing test**

Create `scripts/darkness/sites_test.py`:

```python
"""Reference sites — test harness.

Run via:  .venv/bin/python scripts/darkness/sites_test.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sites as S

passed = 0
failed = 0
failures = []


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print('  ✓ ' + label)
    else:
        failed += 1
        failures.append(label)
        print('  ✗ ' + label)


print('split')
ok(len(S.CALIBRATION_SITES) == 5, 'five calibration sites')
ok(len(S.VALIDATION_SITES) == 3, 'three validation sites')

names = [s['name'] for s in S.CALIBRATION_SITES + S.VALIDATION_SITES]
ok(len(set(names)) == 8, 'no site appears in both sets')

print('every entry is complete and citable')
for site in S.CALIBRATION_SITES + S.VALIDATION_SITES:
    label = site.get('name', '<unnamed>')
    for field in ('name', 'lat', 'lon', 'mag_arcsec2', 'measured_date', 'source_url'):
        ok(field in site and site[field] not in (None, ''),
           '%s has %s' % (label, field))
    ok(str(site['source_url']).startswith('http'),
       '%s cites a URL' % label)
    ok(-90.0 <= site['lat'] <= 90.0, '%s has a real latitude' % label)
    ok(-180.0 <= site['lon'] <= 180.0, '%s has a real longitude' % label)
    ok(14.0 <= site['mag_arcsec2'] <= 22.5,
       '%s has a physically plausible reading' % label)

print('range')
allmags = [s['mag_arcsec2'] for s in S.CALIBRATION_SITES + S.VALIDATION_SITES]
ok(max(allmags) >= 21.5, 'at least one genuinely dark site')
ok(min(allmags) <= 18.5, 'at least one bright urban site')
ok(max(allmags) - min(allmags) >= 3.0, 'the set spans at least 3 magnitudes')

calmags = [s['mag_arcsec2'] for s in S.CALIBRATION_SITES]
ok(max(calmags) - min(calmags) >= 3.0, 'the calibration set alone spans the range')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/bin/python scripts/darkness/sites_test.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'sites'`

- [ ] **Step 4: Write the sites module**

Create `scripts/darkness/sites.py` using this exact structure. Replace every field with researched values — the entries below show the shape and must not be shipped as-is:

```python
"""Ground-truth sky brightness readings.

Five sites set the calibration. Three are held out and decide the gate.
The split is fixed before any value is computed; moving a site between
lists after seeing results would turn the gate into a formality.

Every entry carries the source it came from. If you cannot cite it,
it does not belong here.
"""

CALIBRATION_SITES = [
    {
        'name': '<site name>',
        'lat': 0.0,
        'lon': 0.0,
        'mag_arcsec2': 0.0,
        'measured_date': '<YYYY-MM-DD>',
        'source_url': 'https://<citation>',
    },
    # ... four more, spanning at least three magnitudes
]

VALIDATION_SITES = [
    # ... three, never used for fitting
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/python scripts/darkness/sites_test.py`
Expected: PASS — `87 passed, 0 failed`, exit 0

If it fails on plausibility bounds, the reading is probably in the wrong unit. SQM readings are mag/arcsec²; do not convert from mcd/m² by eye.

- [ ] **Step 6: Search for a published regression (resolves spec Q4)**

Before committing to fitting our own `a` and `b`, check whether a peer-reviewed VIIRS-radiance→sky-brightness relation already exists. Citing a published relation is strictly better than fitting one against five points, provided it validates on the held-out set.

Search terms that reach the right literature: *VIIRS radiance zenith sky brightness regression*, *night sky brightness SQM VIIRS correlation*, *artificial sky brightness model satellite radiance*. Falchi et al. 2016 describes its propagation method in the paper itself — the **method is usable even though the output raster is CC BY-NC**, so read it for the functional form.

Record the outcome in the spec as resolved Q4, one of:

- **A published relation was found** — record the citation and its coefficients. Task 9 compares it against the fitted relation on the held-out sites and ships whichever validates better, preferring the published one on a tie.
- **No suitable relation was found** — record what was searched and why nothing fit, then proceed with the local fit.

- [ ] **Step 7: Record Q3 in the spec**

In `docs/specs/2026-08-11-darkness-data-audit.md`, replace the Q3 row of the open-questions table with a resolved-questions entry naming all eight sites, their readings, and their source URLs.

- [ ] **Step 8: Commit**

```bash
git add scripts/darkness/sites.py scripts/darkness/sites_test.py \
        docs/specs/2026-08-11-darkness-data-audit.md
git commit -m "docs(darkness): eight skies with a number already attached"
```

---

### Task 7: VNL acquisition (resolves spec Q1 and Q2)

**Files:**
- Create: `scripts/darkness/fetch_vnl.py`
- Create: `scripts/darkness/README.md`
- Modify: `docs/specs/2026-08-11-darkness-data-audit.md` (fill Q1 and Q2)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `sha256_file(path) -> str`, and a downloaded raster at a path the orchestrator reads

No unit tests — this is network and credentials. It is verified by running it.

- [ ] **Step 1: Create an EOG account and confirm what is available**

`eogdata.mines.edu` redirects to OAuth at `eogauth.mines.edu`; downloads require a free account. Register, then browse the annual composites and record:

- the newest VNL version (V2.2 documentation lists 2012–2020; later releases likely extend further)
- the newest available year
- whether to use the **masked** or unmasked product

Masked removes background noise and ephemeral lights such as fires and gas flares, which is almost certainly right for a sky-glow proxy — but confirm it against the calibration sites in Task 8 rather than assuming.

- [ ] **Step 2: Ignore the downloaded rasters**

Add to `.gitignore`:

```
# VIIRS source rasters — multi-gigabyte, fetched by scripts/darkness/fetch_vnl.py
scripts/darkness/data/
```

- [ ] **Step 3: Write the fetch script**

Create `scripts/darkness/fetch_vnl.py`:

```python
"""Download a VIIRS VNL annual composite from the Earth Observation Group.

Requires a free EOG account: https://eogdata.mines.edu/products/register/
Credentials come from the environment, never from the repo:

    export EOG_USERNAME='you@example.com'
    export EOG_PASSWORD='...'

Usage:
    .venv/bin/python scripts/darkness/fetch_vnl.py --url <composite-url> --out data/vnl-2024.tif

The SHA-256 this prints goes into assets/darkness/meta.json, so a later
reader can tell exactly which raster produced the artifact.
"""
import argparse
import hashlib
import os
import sys
import urllib.parse
import urllib.request

TOKEN_URL = ('https://eogauth.mines.edu/auth/realms/master/protocol/'
             'openid-connect/token')
CLIENT_ID = 'eogdata_oidc'


def get_token(username, password):
    body = urllib.parse.urlencode({
        'username': username,
        'password': password,
        'client_id': CLIENT_ID,
        'grant_type': 'password',
    }).encode()
    request = urllib.request.Request(TOKEN_URL, data=body)
    request.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib.request.urlopen(request) as response:
        import json
        return json.loads(response.read())['access_token']


def download(url, out_path, token):
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    request = urllib.request.Request(url)
    request.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(request) as response, open(out_path, 'wb') as handle:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            handle.write(chunk)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()

    username = os.environ.get('EOG_USERNAME')
    password = os.environ.get('EOG_PASSWORD')
    if not username or not password:
        sys.exit('EOG_USERNAME and EOG_PASSWORD must be set in the environment')

    download(args.url, args.out, get_token(username, password))
    print('wrote  %s' % args.out)
    print('sha256 %s' % sha256_file(args.out))


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Write the directory README**

Create `scripts/darkness/README.md`:

```markdown
# Darkness pipeline

Samples VIIRS night-lights radiance along pilgrimage route geometry and
writes the per-kilometre artifacts in `assets/darkness/`.

**This is the only Python in the repo, and the only place with third-party
dependencies.** Reading a multi-gigabyte compressed GeoTIFF and
FFT-convolving it is not dependency-free Node work. The property that
matters is preserved: the browser reads only the committed static JSON —
no network call, no runtime dependency, no build step.

Run this rarely: only when EOG publishes a new annual composite.

## Setup

    python3 -m venv .venv
    .venv/bin/pip install -r scripts/darkness/requirements.txt

Register for a free EOG account at
<https://eogdata.mines.edu/products/register/>, then:

    export EOG_USERNAME='you@example.com'
    export EOG_PASSWORD='...'

## Run

    .venv/bin/python scripts/darkness/fetch_vnl.py \
        --url <composite-url> --out scripts/darkness/data/vnl-<year>.tif

    .venv/bin/python scripts/darkness/bake_darkness.py \
        --raster scripts/darkness/data/vnl-<year>.tif --epoch <year>

## Tests

    for t in geometry kernel raster calibrate emit sites; do
        .venv/bin/python scripts/darkness/${t}_test.py || exit 1
    done

The tests need numpy and scipy but not rasterio, and never touch the
network.

## Determinism

Given the same raster and the same recorded parameters, a re-run produces
byte-identical artifacts. A clean `git diff assets/darkness/` confirms
nothing drifted.
```

- [ ] **Step 5: Fetch the raster and confirm it reads**

Run the fetch, then:

```bash
.venv/bin/python -c "
import rasterio
with rasterio.open('scripts/darkness/data/vnl-<year>.tif') as src:
    print('size    ', src.width, 'x', src.height)
    print('crs     ', src.crs)
    print('bounds  ', src.bounds)
    print('res     ', src.res)
"
```

Expected: EPSG:4326, resolution near `0.0041667` degrees (15 arcsec), bounds spanning roughly 180°W–180°E and 75°N–65°S.

- [ ] **Step 6: Record Q1 and Q2 in the spec**

Move Q1 and Q2 out of the open-questions table into a resolved section, naming the version, year, masked/unmasked choice, source URL, and SHA-256.

- [ ] **Step 7: Commit**

```bash
git add scripts/darkness/fetch_vnl.py scripts/darkness/README.md .gitignore \
        docs/specs/2026-08-11-darkness-data-audit.md
git commit -m "feat(darkness): fetch the satellite's view of our own light"
```

---

### Task 8: Orchestrator

**Files:**
- Create: `scripts/darkness/bake_darkness.py`

**Interfaces:**
- Consumes: `geometry`, `kernel`, `raster`, `calibrate`, `emit`, `sites`, `fetch_vnl.sha256_file`
- Produces: `assets/darkness/<route-id>.json` ×7 and `assets/darkness/meta.json`

- [ ] **Step 1: Write the orchestrator**

Create `scripts/darkness/bake_darkness.py`:

```python
"""Bake per-kilometre darkness artifacts for every route.

    .venv/bin/python scripts/darkness/bake_darkness.py --raster <tif> --epoch 2024

Crops the raster around each region, convolves once per region, samples
along the route line, calibrates against the five reference sites,
judges the three held-out sites, and writes assets/darkness/.

Exits non-zero if held-out validation fails, unless --fallback-radiance
is passed to ship the weaker claim deliberately.
"""
import argparse
import json
import os
import sys

import numpy as np
import rasterio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geometry as G
import kernel as K
import raster as R
import calibrate as C
import emit as E
import sites as S
from fetch_vnl import sha256_file

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PILGRIMAGES = os.path.join(REPO, '..', 'open-pilgrimages')
OUT_DIR = os.path.join(REPO, 'assets', 'darkness')

ROUTE_IDS = ['shikoku-88', 'kumano-kodo', 'camino-frances', 'camino-ingles',
             'camino-norte', 'camino-portugues', 'camino-primitivo']

STEP_KM = 1.0
D0_KM = 1.0
RADIUS_KM = 100.0
MARGIN_DEG = 1.2          # slightly over 100 km, so the kernel never runs off the crop
ALPHA_GRID = [1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0]

ATTRIBUTION = [
    'Light pollution: VIIRS Nighttime Lights (VNL), Earth Observation Group, '
    'Colorado School of Mines. CC BY 4.0.',
    'Route geometry: open-pilgrimages, derived from OpenStreetMap '
    'contributors. ODbL v1.0.',
]


def load_points():
    """Resample every route.

    Returns ({route_id: [(lat, lon), ...]}, {route_id: covered_km}).
    validate_polyline raises if a route's waypoint filter produced nonsense.
    """
    points = {}
    covered = {}
    for route_id in ROUTE_IDS:
        path = os.path.join(PILGRIMAGES, 'routes', route_id, 'waypoints.geojson')
        with open(path) as handle:
            geojson = json.load(handle)
        polyline = G.route_polyline(geojson, G.WAYPOINT_TYPES[route_id])
        ratio = G.validate_polyline(polyline)
        points[route_id] = G.resample_polyline(polyline, STEP_KM)
        covered[route_id] = polyline[-1][0] - polyline[0][0]
        print('  %-18s %5d samples  covers %.0f km  ratio %.2f'
              % (route_id, len(points[route_id]), covered[route_id], ratio))
    return points, covered


def crop_for(src, lats, lons):
    """Read a window around the given points, plus the kernel margin.

    boundless=True is load-bearing: if a window ever runs past the raster
    edge, a clipped read would silently disagree with window_transform and
    shift every sample. Padding with zeros keeps array and transform in
    lockstep.
    """
    west = min(lons) - MARGIN_DEG
    east = max(lons) + MARGIN_DEG
    south = min(lats) - MARGIN_DEG
    north = max(lats) + MARGIN_DEG
    window = rasterio.windows.from_bounds(west, south, east, north, src.transform)
    window = window.round_offsets().round_lengths()
    band = src.read(1, window=window, boundless=True, fill_value=0)
    band = np.nan_to_num(band, nan=0.0, posinf=0.0, neginf=0.0)
    band[band < 0.0] = 0.0
    transform = src.window_transform(window)
    return band, float(transform.c), float(transform.f)


def geometry_commit():
    """The open-pilgrimages commit the route geometry came from."""
    import subprocess
    sha = subprocess.check_output(
        ['git', '-C', PILGRIMAGES, 'rev-parse', 'HEAD']).decode().strip()
    dirty = subprocess.check_output(
        ['git', '-C', PILGRIMAGES, 'status', '--porcelain']).decode().strip()
    if dirty:
        sys.exit('../open-pilgrimages has uncommitted changes; commit or stash '
                 'them so the artifact records a real geometry revision')
    return sha


def blurred_field(src, lats, lons, alpha):
    band, west, north = crop_for(src, lats, lons)
    deg_per_px = abs(src.transform.a)
    mean_lat = float(np.mean(lats))
    kern = K.build_kernel(alpha, D0_KM, RADIUS_KM, deg_per_px, mean_lat)
    return R.convolve_field(band, kern), west, north, deg_per_px


def raw_at_sites(src, site_list, alpha):
    lats = [s['lat'] for s in site_list]
    lons = [s['lon'] for s in site_list]
    values = []
    for site in site_list:
        field, west, north, dpp = blurred_field(src, [site['lat']], [site['lon']], alpha)
        values.append(R.sample_bilinear(field, west, north, dpp,
                                        site['lat'], site['lon']))
    return values


def choose_alpha(src):
    """Grid-search alpha, keeping whichever minimises calibration residual."""
    measured = [s['mag_arcsec2'] for s in S.CALIBRATION_SITES]
    best = None
    for alpha in ALPHA_GRID:
        raw = raw_at_sites(src, S.CALIBRATION_SITES, alpha)
        if min(raw) <= 0.0:
            print('  alpha %.2f  skipped (a site sampled zero radiance)' % alpha)
            continue
        a, b, residuals = C.fit_calibration(raw, measured)
        worst = max(abs(r) for r in residuals)
        print('  alpha %.2f  a=%+.3f b=%+.3f  worst residual %.3f'
              % (alpha, a, b, worst))
        if best is None or worst < best[0]:
            best = (worst, alpha, a, b)
    if best is None:
        sys.exit('no alpha produced usable samples at every calibration site')
    return best[1], best[2], best[3]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--raster', required=True)
    parser.add_argument('--epoch', type=int, required=True)
    parser.add_argument('--fallback-radiance', action='store_true',
                        help='ship banded radiance instead of sky brightness')
    args = parser.parse_args()

    # Check this first: it exits on a dirty sibling repo, and discovering
    # that after writing seven route files would leave the tree half-baked.
    geometry_sha = geometry_commit()

    print('resampling routes')
    points, covered = load_points()

    with rasterio.open(args.raster) as src:
        print('searching alpha')
        alpha, a, b = choose_alpha(src)
        print('chose alpha=%.2f  a=%+.4f  b=%+.4f' % (alpha, a, b))

        print('validating against held-out sites')
        held_raw = raw_at_sites(src, S.VALIDATION_SITES, alpha)
        held_measured = [s['mag_arcsec2'] for s in S.VALIDATION_SITES]
        report = C.validate(C.predict(held_raw, a, b), held_measured)
        for site, resid in zip(S.VALIDATION_SITES, report['residuals']):
            print('  %-28s measured %.2f  residual %+.3f'
                  % (site['name'], site['mag_arcsec2'], resid))
        print('  monotonic=%s  within_tolerance=%s  max=%.3f'
              % (report['monotonic'], report['within_tolerance'],
                 report['max_abs_residual']))

        if not report['passed'] and not args.fallback_radiance:
            sys.exit('held-out validation FAILED. Do not widen the tolerance. '
                     'Re-run with --fallback-radiance to ship banded radiance, '
                     'per section 7 of the spec.')

        unit = E.UNIT_RADIANCE if args.fallback_radiance else E.UNIT_SKY
        print('writing artifacts as %s' % unit)
        os.makedirs(OUT_DIR, exist_ok=True)

        for route_id in ROUTE_IDS:
            pts = points[route_id]
            lats = [p[0] for p in pts]
            lons = [p[1] for p in pts]
            field, west, north, dpp = blurred_field(src, lats, lons, alpha)
            raw = [R.sample_bilinear(field, west, north, dpp, lat, lon)
                   for lat, lon in pts]
            values = raw if args.fallback_radiance else C.predict(raw, a, b)
            artifact = E.route_artifact(route_id, args.epoch, int(STEP_KM),
                                        unit, values, covered[route_id])
            path = os.path.join(OUT_DIR, route_id + '.json')
            with open(path, 'w') as handle:
                handle.write(E.dumps(artifact))
            print('  %-18s %5d values -> %s'
                  % (route_id, len(values), os.path.relpath(path, REPO)))

    meta = {
        'epoch': args.epoch,
        'unit': unit,
        'stepKm': int(STEP_KM),
        'source': {
            'raster': os.path.basename(args.raster),
            'sha256': sha256_file(args.raster),
            'geometryCommit': geometry_sha,
        },
        'kernel': {'form': '(1 + d/d0) ** -alpha',
                   'alpha': alpha, 'd0Km': D0_KM, 'radiusKm': RADIUS_KM},
        'calibration': {'a': a, 'b': b,
                        'sites': S.CALIBRATION_SITES},
        'validation': {'sites': S.VALIDATION_SITES, 'report': report},
        'attribution': ATTRIBUTION,
    }
    with open(os.path.join(OUT_DIR, 'meta.json'), 'w') as handle:
        handle.write(E.dumps(meta))
    print('wrote assets/darkness/meta.json')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Verify the resampling stage runs against real geometry**

Run: `.venv/bin/python -c "import sys; sys.path.insert(0,'scripts/darkness'); import bake_darkness as B; B.load_points()"`

Expected: seven lines, sample counts roughly matching the spec's table (shikoku-88 ~1200, camino-norte ~784, camino-frances ~764, camino-primitivo ~263, camino-portugues ~243, camino-ingles ~112, kumano-kodo ~39).

- [ ] **Step 3: Commit**

```bash
git add scripts/darkness/bake_darkness.py
git commit -m "feat(darkness): one pass over the seven roads"
```

---

### Task 9: Run the audit and decide

The gate itself. Everything before this was scaffolding.

**Files:**
- Create: `assets/darkness/*.json` (7 routes + `meta.json`)
- Modify: `docs/specs/2026-08-11-darkness-data-audit.md`
- Modify: `README.md`

- [ ] **Step 1: Run the full pipeline**

```bash
.venv/bin/python scripts/darkness/bake_darkness.py \
    --raster scripts/darkness/data/vnl-<year>.tif --epoch <year>
```

Record the printed alpha search, the fitted `a` and `b`, and the full held-out report.

- [ ] **Step 2: Sanity-check the result before trusting the gate**

A passing validation on three sites does not prove the ribbon is right. Check the shape of the output:

```bash
python3 -c "
import json
for rid in ['camino-frances','shikoku-88']:
    d = json.load(open('assets/darkness/%s.json' % rid))
    v = d['values']
    print('%-16s n=%4d  min=%.2f  max=%.2f  span=%.2f'
          % (rid, len(v), min(v), max(v), max(v)-min(v)))
"
```

Expected if the model is working: the Francés spans well over a magnitude between its darkest meseta kilometres and its passage through Burgos and León. **A nearly flat profile means the kernel is not doing its job** — most likely the crop is too small, the anisotropy is inverted, or the half-pixel offset is wrong. Investigate rather than shipping a flat ribbon.

- [ ] **Step 3: Confirm determinism**

```bash
.venv/bin/python scripts/darkness/bake_darkness.py \
    --raster scripts/darkness/data/vnl-<year>.tif --epoch <year>
git diff --stat assets/darkness/
```

Expected: empty diff. Any change means something non-deterministic leaked into the pipeline; find it before committing.

- [ ] **Step 4: Write the go/no-go**

In `docs/specs/2026-08-11-darkness-data-audit.md`, add a **Result** section recording:

- Q1–Q4 all moved out of the open-questions table into resolved entries (Q5 stays open — it belongs to Slice 4)
- the chosen alpha and the full grid-search output
- fitted `a` and `b`
- if Task 6 Step 6 found a published relation: its held-out residuals beside the fitted relation's, and which one shipped. Prefer the published relation on a tie — a citation outranks a five-point fit.
- a validation table: each held-out site, measured, predicted, residual
- the `geometryCommit` and raster SHA-256 recorded in `meta.json`
- **the decision** — either "sky brightness claim approved, `unit` is `mag/arcsec2`" or "failed validation, shipping banded radiance per section 7"
- if it failed: which criterion, by how much, and what a future attempt should try differently

Then set the document's **Status** to `Complete`.

- [ ] **Step 5: Document the Python exception in the repo README**

Add to `README.md`, after the "Collective route data" section:

```markdown
## Darkness data

`assets/darkness/` holds per-kilometre sky-darkness values along each
pilgrimage route, sampled from VIIRS night-lights radiance. Run
`scripts/darkness/bake_darkness.py` when EOG publishes a new annual
composite — see `scripts/darkness/README.md` for setup.

**This is the one place in the repo that uses Python and third-party
dependencies.** Reading a multi-gigabyte compressed GeoTIFF and
FFT-convolving it is not dependency-free Node work, and pretending
otherwise would be worse than an honest exception. The rule that still
holds everywhere: the browser reads only committed static JSON — no
network call, no runtime dependency, no build step.

Output is deterministic, so a clean `git diff assets/darkness/` confirms
nothing drifted.
```

- [ ] **Step 6: Run every test once more**

```bash
for t in geometry kernel raster calibrate emit sites; do
    .venv/bin/python scripts/darkness/${t}_test.py || echo "FAILED: $t"
done
node scripts/sunpath/build-permalinks.mjs --check
node scripts/validate-metadata.mjs
```

Expected: every harness reports `0 failed`, and both existing repo checks pass.

- [ ] **Step 7: Commit**

```bash
git add assets/darkness/ docs/specs/2026-08-11-darkness-data-audit.md README.md
git commit -m "feat(darkness): the seven roads, measured against the night"
```

---

## What this gate does not do

Recorded so the next plan does not assume otherwise:

- **No UI.** No ribbon, no bar changes, no copy, no page edits.
- **No arbitrary coordinates.** Seven routes only; `/daylight` custom mode and `/moonpath` show no darkness.
- **One epoch only.** The 2012→present drift story is Slice 4. Spec Q5 stays open on purpose.
- **No banding or star counts.** Turning a magnitude into "about 4,000 stars" is a Slice 2 presentation decision, and it depends on this gate's go/no-go.
