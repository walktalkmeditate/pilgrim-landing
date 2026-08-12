"""Orchestrator gate, alpha selection and crop arithmetic — test harness.

Run via:  .venv/bin/python scripts/darkness/bake_darkness_test.py

bake_darkness.py drives the whole pipeline through main(), which touches
disk, subprocess and the real route/tile data -- not something to run
inside a test. The pieces worth testing in isolation (which alpha wins,
whether the gate ships or exits, how a bbox becomes pixel indices) are
pure functions extracted for exactly that reason; this harness exercises
those directly with synthetic fixtures, the same way
bake-collective-routes.test.js exercises its sibling orchestrator.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_darkness as BD
import calibrate as C
import emit as E
import geometry as G
import raster as R

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


def graded(alpha, loo_worst, monotonic):
    """A minimal (alpha, loo_report, params, full_report) tuple.

    Only the two fields select_alpha() actually reads are populated --
    loo_report['max_abs_residual'] and full_report['monotonic'] -- so a
    reader can see exactly what the selection depends on. params is
    never touched by select_alpha() and is left as None.
    """
    return (alpha, {'max_abs_residual': loo_worst}, None,
            {'monotonic': monotonic})


print('select_alpha — all alphas qualify')
grid = [graded(2.0, 0.40, True), graded(3.0, 0.30, True), graded(4.0, 0.35, True)]
chosen, qualifying = BD.select_alpha(grid)
ok(chosen[0] == 3.0, 'the smallest leave-one-out worst residual wins  (got %.2f)' % chosen[0])
ok(qualifying == [2.0, 3.0, 4.0], 'every alpha that qualifies is listed, in grid order')

print('select_alpha — no alpha qualifies, falls back to smallest LOO worst overall')
grid = [graded(2.0, 0.60, False), graded(3.0, 0.55, False), graded(4.0, 0.70, True)]
chosen, qualifying = BD.select_alpha(grid)
ok(chosen[0] == 3.0,
   'fallback picks the smallest LOO worst even though nothing qualified  (got %.2f)' % chosen[0])
ok(qualifying == [],
   'no alpha is monotonic-and-within-tolerance, so nothing qualifies '
   '(alpha=4.0 is monotonic but its LOO worst 0.70 exceeds TOLERANCE_MAG=%.1f)' % C.TOLERANCE_MAG)

print('select_alpha — mixed grid: the qualifying rule picks the winner, not the raw minimum')
grid = [graded(2.0, 0.10, False),   # smallest LOO worst of all three, but not monotonic
        graded(3.0, 0.30, True),    # qualifies
        graded(4.0, 0.45, True)]    # qualifies, but worse than 3.0
chosen, qualifying = BD.select_alpha(grid)
ok(chosen[0] == 3.0,
   'alpha=2.0 has the smallest raw LOO worst (0.10) but is not monotonic, so it does not win '
   '(got %.2f)' % chosen[0])
ok(qualifying == [3.0, 4.0], 'only the monotonic, within-tolerance alphas qualify')

print('select_alpha — a LOO worst exactly at TOLERANCE_MAG qualifies (<=, not <)')
chosen, qualifying = BD.select_alpha([graded(2.0, C.TOLERANCE_MAG, True)])
ok(qualifying == [2.0], 'the tolerance boundary itself is inside the qualifying set')

print('')
print('gate_decision — the four cases')
ok(BD.gate_decision(True, False) == E.UNIT_SKY,
   'gate passes, no flag -> ships sky brightness')
ok(BD.gate_decision(False, True) == E.UNIT_RADIANCE,
   'gate fails, flag given -> ships fallback radiance')

try:
    BD.gate_decision(False, False)
    ok(False, 'gate fails without the flag exits')
except SystemExit as exc:
    ok(True, 'gate fails without the flag exits')
    ok('FAILED' in str(exc), 'the exit message says the gate FAILED')
    ok('--fallback-radiance' in str(exc), 'the exit message names the escape hatch')

try:
    BD.gate_decision(True, True)
    ok(False, 'gate passes with the flag exits (passing the flag on a passing gate is an error)')
except SystemExit as exc:
    ok(True, 'gate passes with the flag exits')
    ok('PASSED' in str(exc), 'the exit message says the gate PASSED')

print('')
print('crop_window — bbox-to-pixel arithmetic')
# 10x10 synthetic mosaic, 1-degree pixels, north-west CORNER at (0E, 10N):
# covers lon 0..10, lat 0..10.
x0, y0, x1, y1, cw, cn = BD.crop_window(
    west=2.0, east=6.0, south=3.0, north=8.0,
    mosaic_west=0.0, mosaic_north=10.0,
    mosaic_height=10, mosaic_width=10, deg_per_px=1.0)
ok((x0, y0, x1, y1) == (2, 2, 7, 8), 'pixel window matches hand-computed indices')
ok((cw, cn) == (2.0, 8.0), 'crop origin matches the hand-computed north-west corner')

print('crop_window — clamps when the bbox overhangs the mosaic to the west/north')
x0, y0, x1, y1, cw, cn = BD.crop_window(
    west=-3.0, east=4.0, south=5.0, north=12.0,
    mosaic_west=0.0, mosaic_north=10.0,
    mosaic_height=10, mosaic_width=10, deg_per_px=1.0)
ok((x0, y0) == (0, 0), 'west/north overhang clamps to the mosaic origin, not a negative index')
ok((x1, y1) == (5, 6), 'the east/south edge is unaffected and still computed normally')
ok((cw, cn) == (0.0, 10.0), 'crop origin clamps to the mosaic corner')

print('crop_window — clamps when the bbox overhangs the mosaic to the east/south')
x0, y0, x1, y1, cw, cn = BD.crop_window(
    west=5.0, east=20.0, south=-5.0, north=9.0,
    mosaic_west=0.0, mosaic_north=10.0,
    mosaic_height=10, mosaic_width=10, deg_per_px=1.0)
ok((x1, y1) == (10, 10), 'east/south overhang clamps to the mosaic shape, not past its edge')

print('crop_window + sample_bilinear — crop invariance')
# A real georeferencing regression (an off-by-one, or a swapped x/y) would
# make a cropped read disagree with the same point read from the
# uncropped mosaic. Byte-identical re-bakes cannot catch that -- a wrong
# but *consistent* crop still reproduces itself run to run. This is the
# property that can.
mosaic = np.arange(400, dtype=float).reshape(20, 20)
MW, MN, STEP = 100.0, 50.0, 1.0
cx0, cy0, cx1, cy1, ccw, ccn = BD.crop_window(
    west=105.0, east=115.0, south=35.0, north=45.0,
    mosaic_west=MW, mosaic_north=MN,
    mosaic_height=mosaic.shape[0], mosaic_width=mosaic.shape[1],
    deg_per_px=STEP)
crop = mosaic[cy0:cy1, cx0:cx1]
ok(crop.shape == (11, 11), 'the crop is smaller than the mosaic (sanity check on the fixture)')

for lat, lon in [(39.3, 109.7), (42.15, 112.85)]:
    full_value = R.sample_bilinear(mosaic, MW, MN, STEP, lat, lon)
    crop_value = R.sample_bilinear(crop, ccw, ccn, STEP, lat, lon)
    approx(crop_value, full_value, 1e-9,
          'point (%.2f, %.2f) samples the same from the crop as from the full mosaic' % (lat, lon))

print('')
print('region_of — both branches')
ok(BD.region_of(33.7, 133.5) == 'japan', 'Shikoku (lon 133.5, east of the 60 degree split) is japan')
ok(BD.region_of(42.88, -8.52) == 'iberia', 'Santiago (lon -8.52, west of the split) is iberia')
ok(BD.region_of(0.0, 60.0) == 'iberia', 'lon=60.0 exactly is not > 60, so it falls to iberia')
ok(BD.region_of(0.0, 60.001) == 'japan', 'just past the 60 degree split is japan')

print('')
print('roster identity — REGIONS and WAYPOINT_TYPES name the same routes')
regions_route_ids = sorted(rid for ids in BD.REGIONS.values() for rid in ids)
ok(regions_route_ids == sorted(G.WAYPOINT_TYPES),
   'bake_darkness.REGIONS and geometry.WAYPOINT_TYPES name the same seven routes '
   '(also enforced at import time -- see the module-level assertion in bake_darkness.py)')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
