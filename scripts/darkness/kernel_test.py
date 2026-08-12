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


DEG_PER_PX = 15.0 / 3600.0  # VNP46A4 native resolution

print('shape and symmetry')
k = K.build_kernel(alpha=2.0, d0_km=1.0, radius_km=100.0,
                   deg_per_px=DEG_PER_PX, mean_lat_deg=0.0)
ok(k.shape[0] % 2 == 1 and k.shape[1] % 2 == 1, 'both dimensions are odd')
ok(np.allclose(k, k[::-1, :]), 'symmetric top to bottom')
ok(np.allclose(k, k[:, ::-1]), 'symmetric left to right')
cy, cx = k.shape[0] // 2, k.shape[1] // 2
ok(k[cy, cx] == k.max(), 'centre is the maximum')
pixel_area_km2 = (DEG_PER_PX * K.KM_PER_DEG_LAT) ** 2 * math.cos(math.radians(0.0))
ok(abs(k[cy, cx] - pixel_area_km2) < 1e-9,
   'centre equals the pixel ground area before normalisation')

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

print('pixel-area scaling')
# This is the property the fix in build_kernel exists to create: without
# the pixel-area factor, kernel sums scale with 1/cos(lat) and a fit
# calibrated at one latitude silently mispredicts at another.
sum_ratio = float(k43.sum() / k.sum())
ok(abs(sum_ratio - 1.0) < 0.01,
   'kernel sums at 0N and 43N agree within 1%% after area scaling (ratio %.4f)'
   % sum_ratio)

print('decay and truncation')
ok(k[cy, cx] > k[cy, cx + 10] > k[cy, cx + 100], 'decays monotonically outward')
ok(k.min() == 0.0, 'corners beyond the radius are zero')
ok(float(k[0, 0]) == 0.0, 'the far corner is truncated')
ok(np.all(k >= 0.0), 'no negative weights')
ok(np.isfinite(k).all(), 'all weights are finite')

steep = K.build_kernel(alpha=3.0, d0_km=1.0, radius_km=100.0,
                       deg_per_px=DEG_PER_PX, mean_lat_deg=0.0)
ok(steep[cy, cx + 50] < k[cy, cx + 50], 'a larger alpha decays faster')

print('pole guard')
for lat, why in [(90.0, 'exactly at the north pole'),
                 (-90.0, 'exactly at the south pole'),
                 (89.95, 'inside the guard band, the case the old cosine check missed')]:
    try:
        K.build_kernel(2.0, 1.0, 100.0, DEG_PER_PX, lat)
        ok(False, 'raises when %s (%.2f)' % (why, lat))
    except ValueError:
        ok(True, 'raises when %s (%.2f)' % (why, lat))

k89 = K.build_kernel(2.0, 1.0, 100.0, DEG_PER_PX, 89.0)
ok(k89.shape[0] % 2 == 1 and k89.shape[1] % 2 == 1,
   'a latitude just outside the guard band (89.0) still builds')
ok(K.MAX_ABS_LATITUDE_DEG == 89.9, 'the guard band starts at 89.9 degrees')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
