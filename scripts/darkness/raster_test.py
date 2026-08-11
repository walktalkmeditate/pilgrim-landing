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
