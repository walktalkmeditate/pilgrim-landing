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


print('counts')
ok(len(S.REFERENCE_SITES) == 5, 'five reference sites')
ok(len(S.EXCLUDED_SITES) == 4, 'four excluded sites')

print('no overlap')
ref_names = [s['name'] for s in S.REFERENCE_SITES]
excluded_names = [s['name'] for s in S.EXCLUDED_SITES]
ok(len(set(ref_names) & set(excluded_names)) == 0,
   'no name appears in both REFERENCE_SITES and EXCLUDED_SITES')

print('every reference entry is complete and citable')
for site in S.REFERENCE_SITES:
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

print('single instrument')
ref_sources = set(site['source_url'] for site in S.REFERENCE_SITES)
ok(len(ref_sources) == 1,
   'every reference site cites the same source_url')

print('range')
refmags = [s['mag_arcsec2'] for s in S.REFERENCE_SITES]
ok(max(refmags) - min(refmags) >= 3.0,
   'the reference set spans at least 3 magnitudes')

print('every excluded entry explains itself')
for site in S.EXCLUDED_SITES:
    label = site.get('name', '<unnamed>')
    ok(site.get('excluded_because') not in (None, ''),
       '%s has a non-empty excluded_because' % label)

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
