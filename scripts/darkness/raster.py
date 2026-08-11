"""Convolve a radiance raster and sample it at geographic points.

A 100 km radius at 15 arcsec is a ~216-pixel radius, so the kernel is
~433 px across. Convolving an Iberia-sized crop against that directly is
on the order of 1e11 multiply-adds; FFT convolution over the same crop
runs in seconds.
"""
import math

import numpy as np
from scipy.signal import fftconvolve


def convolve_field(radiance, kern):
    """Blur radiance by the propagation kernel, preserving shape."""
    return fftconvolve(np.asarray(radiance, dtype=float),
                       np.asarray(kern, dtype=float),
                       mode='same')


def sample_bilinear(arr, west_deg, north_deg, deg_per_px, lat, lon):
    """Bilinearly sample arr at (lat, lon).

    west_deg / north_deg are the CORNER of the upper-left pixel, matching
    the GeoTIFF transform. Pixel centres sit half a pixel inside, so the
    half-pixel offset below is load-bearing.
    """
    x = (lon - west_deg) / deg_per_px - 0.5
    y = (north_deg - lat) / deg_per_px - 0.5

    x0 = int(math.floor(x))
    y0 = int(math.floor(y))

    if x0 < 0 or y0 < 0 or x0 + 1 >= arr.shape[1] or y0 + 1 >= arr.shape[0]:
        raise IndexError(
            'point (%.5f, %.5f) falls outside the raster crop' % (lat, lon))

    fx = x - x0
    fy = y - y0

    top = arr[y0, x0] * (1.0 - fx) + arr[y0, x0 + 1] * fx
    bottom = arr[y0 + 1, x0] * (1.0 - fx) + arr[y0 + 1, x0 + 1] * fx
    return float(top * (1.0 - fy) + bottom * fy)
