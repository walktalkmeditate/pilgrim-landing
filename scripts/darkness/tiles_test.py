"""Black Marble tile georeferencing — test harness.

Run via:  .venv/bin/python scripts/darkness/tiles_test.py
"""
import hashlib
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tiles as T

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


print('grid constants')
approx(T.DEG_PER_PX, 15.0 / 3600.0, 1e-12, 'pixels are 15 arcsec')
ok(T.TILE_PX == 2400, 'tiles are 2400 px square')
approx(T.TILE_PX * T.DEG_PER_PX, 10.0, 1e-9, 'a tile spans ten degrees')

print('tile_id')
ok(T.tile_id(-9.0, 43.0) == 'h17v04', 'western Iberia is h17v04')
ok(T.tile_id(-9.0, 39.9) == 'h17v05', 'southern Iberia drops to v05')
ok(T.tile_id(133.5, 33.7) == 'h31v05', 'Shikoku is h31v05')
ok(T.tile_id(135.7, 33.8) == 'h31v05', 'Kii shares Shikoku tile')
ok(T.tile_id(-179.9, 89.9) == 'h00v00', 'north-west corner of the world')
ok(T.tile_id(0.0, 0.0) == 'h18v09', 'null island')

print('tile_origin — round trip')
for tid in ('h17v04', 'h17v05', 'h31v05', 'h00v00', 'h18v09'):
    west, north = T.tile_origin(tid)
    ok(T.tile_id(west + 0.001, north - 0.001) == tid,
       '%s origin lands back in its own tile' % tid)

west, north = T.tile_origin('h17v04')
approx(west, -10.0, 1e-9, 'h17 starts at 10 west')
approx(north, 50.0, 1e-9, 'v04 starts at 50 north')
west, north = T.tile_origin('h31v05')
approx(west, 130.0, 1e-9, 'h31 starts at 130 east')
approx(north, 40.0, 1e-9, 'v05 starts at 40 north')

print('tiles_for — which tiles a bbox needs')
ok(T.tiles_for(-9.9, -0.03, 39.9, 44.8) == [['h17v04'], ['h17v05']],
   'Iberia needs two tiles stacked vertically')
ok(T.tiles_for(131.3, 137.0, 31.5, 35.6) == [['h31v05']],
   'Japan needs one tile')
ok(T.tiles_for(-0.5, 0.5, 43.0, 43.5) == [['h17v04', 'h18v04']],
   'a bbox crossing the meridian needs two tiles side by side')

print('tile_filename / tile_path')
ok(T.tile_filename(2025, 'h17v04') == 'VNP46A4.A2025001.h17v04.h5',
   'filename follows the product naming convention')
ok(T.tile_path('/data', 2025, 'h17v04') == '/data/VNP46A4.A2025001.h17v04.h5',
   'path joins data_dir and filename')

print('require_tile')
with tempfile.TemporaryDirectory() as tmp:
    try:
        T.require_tile(tmp, 2025, 'h17v04')
        ok(False, 'raises when the tile file does not exist')
    except SystemExit as exc:
        ok(True, 'raises when the tile file does not exist')
        message = str(exc)
        ok('.venv/bin/python scripts/darkness/fetch_tiles.py --year 2025' in message,
           'the error names the real invocation, not a bare script name')
        ok('VNP46A4.A2025001.h17v04.h5' in message,
           'the error names the actual missing file')

    present = T.tile_path(tmp, 2025, 'h17v04')
    open(present, 'wb').close()
    ok(T.require_tile(tmp, 2025, 'h17v04') == present,
       'an existing tile returns its path without complaint')

print('read_mosaic — a missing tile fails before any rasterio call')
with tempfile.TemporaryDirectory() as tmp:
    try:
        T.read_mosaic(tmp, 2025, 131.3, 137.0, 31.5, 35.6)
        ok(False, 'raises when a tile the bbox needs is not on disk')
    except SystemExit as exc:
        ok(True, 'raises when a tile the bbox needs is not on disk')
        message = str(exc)
        ok('h31v05' in message, 'the error names the missing tile')
        ok('fetch_tiles.py --year 2025' in message,
           'the error names the real invocation to fetch it, via require_tile')

print('sha256_file')
with tempfile.TemporaryDirectory() as tmp:
    sample = os.path.join(tmp, 'sample.bin')
    with open(sample, 'wb') as handle:
        handle.write(b'pilgrim')
    ok(T.sha256_file(sample) == hashlib.sha256(b'pilgrim').hexdigest(),
       'matches a hash computed directly over the same bytes')
    ok(T.sha256_file(sample) == T.sha256_file(sample),
       'hashing the same file twice is deterministic')

print('manifest round-trip')
with tempfile.TemporaryDirectory() as tmp:
    ok(T.read_manifest(tmp) == {}, 'a data dir with no manifest yet reads as empty')
    entry = {'VNP46A4.A2025001.h17v04.h5': 'VNP46A4.A2025001.h17v04.002.2025999999999.h5'}
    T.write_manifest(tmp, entry)
    ok(T.read_manifest(tmp) == entry, 'what was written reads back unchanged')
    ok(os.path.exists(os.path.join(tmp, 'manifest.json')),
       'the manifest lives in the data dir under a fixed name')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
