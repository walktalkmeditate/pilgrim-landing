"""Fit blurred radiance to measured sky brightness, and judge the fit.

Five calibration sites set the parameters. Three held-out sites decide
the gate. The tolerance is fixed by the spec and must not be widened to
make a failing run pass.
"""
import numpy as np

TOLERANCE_MAG = 0.5


def _log10_raw(raw):
    """log10 of raw radiance, refusing non-positive or non-finite input.

    Checking before calling np.log10 means a bad value never reaches
    it, so this never emits a RuntimeWarning — it raises a descriptive
    ValueError naming the offending value instead.
    """
    arr = np.asarray(raw, dtype=float)
    bad = arr[~(np.isfinite(arr) & (arr > 0))]
    if bad.size:
        raise ValueError('raw radiance must be a positive finite number, got %r' % float(bad[0]))
    return np.log10(arr)


def fit_calibration(raw, measured):
    """Least-squares fit of  mag = a * log10(raw) + b."""
    x = _log10_raw(raw)
    y = np.asarray(measured, dtype=float)
    design = np.vstack([x, np.ones_like(x)]).T
    (a, b), _, _, _ = np.linalg.lstsq(design, y, rcond=None)
    residuals = (y - (a * x + b)).tolist()
    return float(a), float(b), residuals


def predict(raw, a, b):
    x = _log10_raw(raw)
    return (a * x + b).tolist()


def _monotonic(predicted, measured):
    """Do darker measured sites come out darker?

    Pairs whose measured values tie are skipped: a tie means the ground
    truth cannot say which is darker, so no prediction ordering can
    contradict it. Comparing argsort permutations instead would call
    such a pair an inversion and fail a gate that should pass.
    """
    for i in range(len(measured)):
        for j in range(i + 1, len(measured)):
            if measured[i] == measured[j]:
                continue
            if (predicted[i] - predicted[j]) * (measured[i] - measured[j]) < 0.0:
                return False
    return True


def validate(predicted, measured):
    """Judge held-out sites. Both criteria must hold."""
    p = np.asarray(predicted, dtype=float)
    m = np.asarray(measured, dtype=float)
    residual = p - m
    max_abs = float(np.max(np.abs(residual)))
    within = bool(max_abs <= TOLERANCE_MAG)
    monotonic = _monotonic(p, m)
    return {
        'monotonic': monotonic,
        'within_tolerance': within,
        'max_abs_residual': max_abs,
        'residuals': residual.tolist(),
        'passed': monotonic and within,
    }
