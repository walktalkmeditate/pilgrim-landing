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
