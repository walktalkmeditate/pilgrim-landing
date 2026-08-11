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

print('round_sig rejects non-finite values')
for bad, label in [(float('nan'), 'NaN'), (float('inf'), '+inf'), (float('-inf'), '-inf')]:
    try:
        E.round_sig(bad)
        ok(False, 'raises on %s' % label)
    except ValueError:
        ok(True, 'raises on %s' % label)

print('artifact shape')
pos_conf = {'interpolatedFraction': 0.08123, 'maxGapKm': 34.567,
           'p90GapKm': 12.345, 'meanGapKm': 5.4321,
           'withinInterpolationLimit': True}
art = E.route_artifact('camino-frances', 2024, 1, E.UNIT_SKY,
                       [21.4372, 20.11, 18.0], 764.0, pos_conf)
ok(art['route'] == 'camino-frances', 'route id carried')
ok(art['epoch'] == 2024, 'epoch carried')
ok(art['stepKm'] == 1, 'step carried')
ok(art['coveredKm'] == 764.0, 'covered span carried')
ok(art['unit'] == 'mag/arcsec2', 'unit carried')
ok(art['values'] == [21.4, 20.1, 18.0], 'values rounded')
ok(list(art.keys()) == ['route', 'epoch', 'stepKm', 'coveredKm', 'unit', 'values',
                        'positionalConfidence'],
   'key order is fixed')

print('positionalConfidence shape')
conf = art['positionalConfidence']
ok(conf['interpolatedFraction'] == 0.0812, 'interpolated fraction rounded to three figures')
ok(conf['maxGapKm'] == 34.57, 'max gap rounded to four figures')
ok(conf['p90GapKm'] == 12.35, 'p90 gap rounded to four figures')
ok(conf['meanGapKm'] == 5.432, 'mean gap rounded to four figures')
ok(conf['withinInterpolationLimit'] is True, 'within-limit flag carried')
ok(list(conf.keys()) == ['interpolatedFraction', 'maxGapKm', 'p90GapKm',
                         'meanGapKm', 'withinInterpolationLimit'],
   'positionalConfidence key order is fixed')

failing_conf = dict(pos_conf, withinInterpolationLimit=False)
over = E.route_artifact('shikoku-88', 2024, 1, E.UNIT_SKY, [21.0], 1080.0, failing_conf)
ok(over['positionalConfidence']['withinInterpolationLimit'] is False,
   'a route over the interpolation limit carries that verdict, not just its number')

print('the fallback unit is reachable')
fb = E.route_artifact('kumano-kodo', 2024, 1, E.UNIT_RADIANCE, [0.512], 38.0, pos_conf)
ok(fb['unit'] == 'nW/cm2/sr', 'radiance unit carried')

print('rejects bad input')
for bad, why in [(('x', 2024, 1, 'bogus/unit', [1.0], 10.0, pos_conf), 'an unknown unit'),
                 (('x', 2024, 1, E.UNIT_SKY, [], 10.0, pos_conf), 'an empty value list'),
                 (('x', 2024, 1, E.UNIT_SKY, [21.4, float('nan'), 18.0], 10.0, pos_conf),
                  'a NaN among the value list')]:
    try:
        E.route_artifact(*bad)
        ok(False, 'raises on %s' % why)
    except ValueError:
        ok(True, 'raises on %s' % why)

print('determinism')
a = E.dumps(art)
b = E.dumps(E.route_artifact('camino-frances', 2024, 1, E.UNIT_SKY,
                             [21.4372, 20.11, 18.0], 764.0, pos_conf))
ok(a == b, 'two runs serialise identically')
ok(a.endswith('\n'), 'output ends with a newline')
ok(json.loads(a) == art, 'output round-trips through json')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
