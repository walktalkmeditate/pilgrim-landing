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

short = [(0, 0.0, 0.0), (10, 0.0, 6 * KM_DEG)]
approx(G.polyline_ratio(short), 0.6, 1e-6, 'a chord across a meander scores 0.6')

print('validate_polyline')
approx(G.validate_polyline(straight), 1.0, 1e-6, 'a sane polyline validates and returns its ratio')
approx(G.validate_polyline(short), 0.6, 1e-6, 'a chord well inside the bounds validates')
ok(G.RATIO_BOUNDS == (0.5, 1.5), 'bounds are [0.5, 1.5]')

try:
    G.validate_polyline(zigzag)
    ok(False, 'a branch-hopping polyline is rejected')
except ValueError:
    ok(True, 'a branch-hopping polyline is rejected')

too_short = [(0, 0.0, 0.0), (10, 0.0, 4 * KM_DEG)]
try:
    G.validate_polyline(too_short)
    ok(False, 'a polyline below the lower bound is rejected')
except ValueError:
    ok(True, 'a polyline below the lower bound is rejected')

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
