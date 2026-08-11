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

KM_PER_DEG_LAT = 111.32


def build_kernel(alpha, d0_km, radius_km, deg_per_px, mean_lat_deg):
    km_per_px_y = deg_per_px * KM_PER_DEG_LAT
    km_per_px_x = deg_per_px * KM_PER_DEG_LAT * math.cos(math.radians(mean_lat_deg))
    if km_per_px_x <= 0.0:
        raise ValueError('mean latitude too close to the pole')

    ny = int(math.ceil(radius_km / km_per_px_y))
    nx = int(math.ceil(radius_km / km_per_px_x))

    yy = (np.arange(-ny, ny + 1, dtype=float) * km_per_px_y)[:, None]
    xx = (np.arange(-nx, nx + 1, dtype=float) * km_per_px_x)[None, :]
    d = np.sqrt(yy * yy + xx * xx)

    w = (1.0 + d / d0_km) ** (-float(alpha))
    w[d > radius_km] = 0.0
    return w
