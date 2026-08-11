"""Fit blurred radiance to measured sky brightness, and judge the fit.

Five calibration sites set the parameters. Three held-out sites decide
the gate. The tolerance is fixed by the spec and must not be widened to
make a failing run pass.
"""
import numpy as np

TOLERANCE_MAG = 0.5


def fit_calibration(raw, measured):
    """Least-squares fit of  mag = a * log10(raw) + b."""
    x = np.log10(np.asarray(raw, dtype=float))
    y = np.asarray(measured, dtype=float)
    if not np.isfinite(x).all():
        raise ValueError('non-positive raw value: cannot take a logarithm')
    design = np.vstack([x, np.ones_like(x)]).T
    (a, b), _, _, _ = np.linalg.lstsq(design, y, rcond=None)
    residuals = (y - (a * x + b)).tolist()
    return float(a), float(b), residuals


def predict(raw, a, b):
    x = np.log10(np.asarray(raw, dtype=float))
    return (a * x + b).tolist()


def validate(predicted, measured, tol=TOLERANCE_MAG):
    """Judge held-out sites. Both criteria must hold."""
    p = np.asarray(predicted, dtype=float)
    m = np.asarray(measured, dtype=float)
    residual = p - m
    max_abs = float(np.max(np.abs(residual)))
    within = bool(max_abs <= tol)
    monotonic = bool(np.array_equal(np.argsort(p, kind='stable'),
                                    np.argsort(m, kind='stable')))
    return {
        'monotonic': monotonic,
        'within_tolerance': within,
        'max_abs_residual': max_abs,
        'residuals': residual.tolist(),
        'passed': monotonic and within,
    }
