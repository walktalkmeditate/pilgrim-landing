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
ok(len(S.EXCLUDED_SITES) == 13, 'thirteen excluded sites')

print('reference site identity is pinned, not just its count')
# A count alone would let a lateral swap through -- five sites from Bará
# 2016 table 1 that are not Santiago, Guísamo, O Cebreiro, Labrada and
# Vigo would still pass every check above. Pinning the names catches
# that swap even if the replacement site is otherwise well-formed.
ok([s['name'] for s in S.REFERENCE_SITES] == [
    'Santiago de Compostela (urban centre, Galicia)',
    'Guísamo (periurban, A Coruña, Galicia)',
    'O Cebreiro (mountain, Lugo, Galicia)',
    'Labrada (rural, Abadín, Lugo, Galicia)',
    'Vigo (Harbour, Pontevedra, Galicia)',
], 'REFERENCE_SITES names are exactly these five, in this order')

print('the Bará 2016 table-1 roster is closed')
bara_url = 'https://doi.org/10.1098/rsos.160541'
bara_excluded = [s for s in S.EXCLUDED_SITES if s['source_url'] == bara_url]
ok(len(bara_excluded) == 9,
   'nine Bará 2016 table-1 sites are recorded as excluded, not just the '
   'two (Xares, Cabeza de Manzaneda) the source paper itself flags')
ok(len(S.REFERENCE_SITES) + len(bara_excluded) == 14,
   'all fourteen Bará 2016 table-1 detectors are accounted for, as '
   'either a reference or an excluded site -- none silently missing')

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
