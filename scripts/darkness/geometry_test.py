"""Route geometry resampling — test harness.

Run via:  .venv/bin/python scripts/darkness/geometry_test.py
"""
import math
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
       '%s  (%.4f vs %.4f)' % (label, actual, expected))


print('haversine')
approx(G.haversine_km(0, 0, 0, 1), 111.195, 0.01, 'one degree of longitude at equator')
approx(G.haversine_km(0, 0, 1, 0), 111.195, 0.01, 'one degree of latitude')
approx(G.haversine_km(43, -5, 43, -5), 0.0, 1e-9, 'zero distance')

print('route_coords')
line = {'type': 'Feature',
        'geometry': {'type': 'LineString', 'coordinates': [[0, 0], [1, 0]]}}
ok(G.route_coords(line) == [(0.0, 0.0), (1.0, 0.0)], 'LineString passes through')

multi = {'type': 'Feature',
         'geometry': {'type': 'MultiLineString',
                      'coordinates': [[[0, 0], [0.5, 0]], [[0.5, 0], [1, 0]]]}}
ok(len(G.route_coords(multi)) == 4, 'MultiLineString parts concatenate in file order')

try:
    G.route_coords({'type': 'Feature',
                    'geometry': {'type': 'Point', 'coordinates': [0, 0]}})
    ok(False, 'unsupported geometry raises')
except ValueError:
    ok(True, 'unsupported geometry raises')

print('resample_route')
pts = G.resample_route([(0.0, 0.0), (1.0, 0.0)], 1.0)
ok(len(pts) == 112, 'equator degree at 1 km yields 112 points (got %d)' % len(pts))
approx(pts[0][0], 0.0, 1e-9, 'first point is the route start (lat)')
approx(pts[0][1], 0.0, 1e-9, 'first point is the route start (lon)')
approx(G.haversine_km(pts[0][0], pts[0][1], pts[1][0], pts[1][1]), 1.0, 0.001,
       'consecutive samples are 1 km apart')
approx(G.haversine_km(pts[0][0], pts[0][1], pts[50][0], pts[50][1]), 50.0, 0.01,
       'fiftieth sample is 50 km along')

ok(G.resample_route([(0.0, 0.0), (1.0, 0.0)], 1.0) ==
   G.resample_route([(0.0, 0.0), (1.0, 0.0)], 1.0), 'resampling is deterministic')

dupe = G.resample_route([(0.0, 0.0), (0.0, 0.0), (1.0, 0.0)], 1.0)
ok(len(dupe) == 112, 'zero-length segments are skipped')

try:
    G.resample_route([(0.0, 0.0)], 1.0)
    ok(False, 'single coordinate raises')
except ValueError:
    ok(True, 'single coordinate raises')

print('part-gap fail-loud')
gapped = {'type': 'Feature',
          'geometry': {'type': 'MultiLineString',
                       'coordinates': [[[0, 0], [0.1, 0]], [[5, 0], [5.1, 0]]]}}
try:
    G.route_coords(gapped)
    ok(False, 'a gap beyond MAX_PART_GAP_KM raises')
except ValueError:
    ok(True, 'a gap beyond MAX_PART_GAP_KM raises')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
