"""Radially-symmetric light-propagation kernel.

Sky glow above a point is produced by light emitted across a wide
surrounding area and scattered back down. Convolving the radiance raster
with this kernel once, then point-sampling the result, approximates that
without a full atmospheric model.

Form:  w(d) = (1 + d/d0) ** -alpha   for d <= radius, else 0.

The kernel is built in ground-distance space, so it is wider in columns
than in rows away from the equator. Only alpha is searched during
calibration; d0 and radius are fixed by the spec.
"""
import math

import numpy as np

# A local flat-earth pixel scale, not a great-circle radius — deliberately
# distinct from geometry.py's R_EARTH_KM (6371.0088), which measures
# point-to-point distance instead of converting a fixed pixel grid. The
# 0.1% gap between the two is immaterial at this kernel's 100 km radius,
# so it is left as-is rather than unified.
KM_PER_DEG_LAT = 111.32

# cos(mean_lat_deg) alone never guards the pole: cos(90°) is ~6e-17,
# positive not zero, so km_per_px_x quietly shrinks toward zero instead of
# failing. This bound catches it directly, in degrees, before that
# arithmetic runs.
MAX_ABS_LATITUDE_DEG = 89.9


def build_kernel(alpha, d0_km, radius_km, deg_per_px, mean_lat_deg):
    if abs(mean_lat_deg) >= MAX_ABS_LATITUDE_DEG:
        raise ValueError(
            'mean latitude %.4f is within %.1f degrees of a pole; the '
            'longitude scale collapses and the kernel would be unbounded'
            % (mean_lat_deg, 90.0 - MAX_ABS_LATITUDE_DEG))

    km_per_px_y = deg_per_px * KM_PER_DEG_LAT
    km_per_px_x = deg_per_px * KM_PER_DEG_LAT * math.cos(math.radians(mean_lat_deg))

    ny = int(math.ceil(radius_km / km_per_px_y))
    nx = int(math.ceil(radius_km / km_per_px_x))

    yy = (np.arange(-ny, ny + 1, dtype=float) * km_per_px_y)[:, None]
    xx = (np.arange(-nx, nx + 1, dtype=float) * km_per_px_x)[None, :]
    d = np.sqrt(yy * yy + xx * xx)

    w = (1.0 + d / d0_km) ** (-float(alpha))
    w[d > radius_km] = 0.0
    return w
