"""Calibration and validation — test harness.

Run via:  .venv/bin/python scripts/darkness/calibrate_test.py
"""
import contextlib
import io
import math
import sys
import os
import warnings

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calibrate as C

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


print('fit recovers known parameters')
raw = [0.01, 0.1, 1.0, 10.0, 100.0]
truth_A, truth_p = 3e-10, 0.7
natural = 10.0 ** (-0.4 * C.M_NAT_MAG)
measured = [-2.5 * math.log10(natural + truth_A * (r ** truth_p)) for r in raw]
params, resid = C.fit_calibration(raw, measured)
fit_A, fit_p = params
ok(abs(fit_A - truth_A) <= truth_A * 1e-3,
   'A recovered  (%.6e vs %.6e)' % (fit_A, truth_A))
approx(fit_p, truth_p, 1e-4, 'p recovered')
ok(max(abs(r) for r in resid) < 1e-6, 'residuals vanish on exact data')

print('predict')
pred = C.predict(raw, params)
ok(len(pred) == len(raw), 'one prediction per input')
approx(pred[0], measured[0], 1e-6, 'prediction matches the fit')

print('predictions cannot exceed the natural sky floor')
near_zero = C.predict([1e-12], params)[0]
ok(near_zero <= C.M_NAT_MAG,
   'a near-zero raw value still predicts at or below M_NAT_MAG')
ok(near_zero > C.M_NAT_MAG - 0.5,
   'a near-zero raw value predicts close to the natural floor, not far below it')

print('magnitude decreases monotonically as raw increases')
swept = [10.0 ** k for k in range(-6, 4)]
swept_pred = C.predict(swept, params)
ok(all(swept_pred[i] > swept_pred[i + 1] for i in range(len(swept_pred) - 1)),
   'more raw radiance always predicts a numerically smaller magnitude')

print('fit_calibration and predict refuse non-positive raw values, quietly')
with warnings.catch_warnings():
    warnings.simplefilter('always')
    stderr_capture = io.StringIO()
    with contextlib.redirect_stderr(stderr_capture):
        try:
            C.fit_calibration([0.1, 0.0, 10.0], [1.0, 2.0, 3.0])
            ok(False, 'fit_calibration raises on a zero raw value')
        except ValueError:
            ok(True, 'fit_calibration raises on a zero raw value')

        try:
            C.fit_calibration([0.1, -1.0, 10.0], [1.0, 2.0, 3.0])
            ok(False, 'fit_calibration raises on a negative raw value')
        except ValueError:
            ok(True, 'fit_calibration raises on a negative raw value')

        try:
            C.predict([1.0, 0.0, -5.0], params)
            ok(False, 'predict raises on a zero or negative raw value')
        except ValueError:
            ok(True, 'predict raises on a zero or negative raw value')
    captured = stderr_capture.getvalue()
    ok('RuntimeWarning' not in captured, 'no RuntimeWarning reaches stderr')

print('validate — passing case')
res = C.validate([21.0, 20.0, 18.0], [21.2, 20.1, 18.3])
ok(res['passed'], 'close and correctly ordered passes')
ok(res['monotonic'], 'ordering flagged monotonic')
approx(res['max_abs_residual'], 0.3, 1e-9, 'max residual reported')

print('validate — tolerance boundary')
ok(C.validate([21.0], [21.5])['within_tolerance'],
   'exactly 0.5 is within tolerance')
ok(not C.validate([21.0], [21.51])['within_tolerance'],
   '0.51 is outside tolerance')
ok(not C.validate([21.0], [21.51])['passed'], 'exceeding tolerance fails')

print('validate — ordering')
inverted = C.validate([20.0, 21.0], [21.0, 20.0])
ok(not inverted['monotonic'], 'an inversion is detected')
ok(not inverted['passed'], 'an inversion fails the gate')

print('validate — ties in measured data are not inversions')
tied = C.validate([21.32, 21.28, 20.05], [21.3, 21.3, 20.0])
ok(tied['monotonic'], 'a tie in measured values is not an inversion')
ok(tied['passed'], 'a tied-but-consistent case passes the gate')

print('validate — tolerance is not a free parameter')
ok(C.TOLERANCE_MAG == 0.5, 'the default tolerance is 0.5 mag/arcsec2')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
