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
ok(near_zero <= 22.0,
   'a near-zero raw value still predicts at or below 22.0 mag/arcsec2')
ok(near_zero > 22.0 - 0.5,
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
ok(inverted['gradedPairs'] == 1, 'the one pair clears the separation minimum')
ok(inverted['ungradedPairs'] == 0, 'no pair is dropped')

print('validate — ties in measured data are not inversions')
tied = C.validate([21.32, 21.28, 20.05], [21.3, 21.3, 20.0])
ok(tied['monotonic'], 'a tie in measured values is not an inversion')
ok(tied['passed'], 'a tied-but-consistent case passes the gate')
ok(tied['gradedPairs'] == 2, 'the two pairs clear of the tie are graded')
ok(tied['ungradedPairs'] == 1, 'the tied pair is counted, not silently dropped')

print('validate — a sub-minimum gap is ungradeable, not an inversion')
near_tie = C.validate([21.50, 21.60], [21.60, 21.58])
ok(near_tie['monotonic'],
   'a sub-minimum gap cannot fail monotonicity, even if inverted')
ok(near_tie['gradedPairs'] == 0,
   'the only pair is narrower than the separation minimum')
ok(near_tie['ungradedPairs'] == 1,
   'it is counted as ungradeable, not silently dropped')

print('validate — a gap at the separation minimum is gradeable')
boundary = C.validate([21.50, 21.60], [21.60, 21.55])
ok(not boundary['monotonic'],
   'a gap of exactly 0.05 is gradeable, so the inversion is caught')
ok(boundary['gradedPairs'] == 1, 'the boundary pair counts as graded')
ok(boundary['ungradedPairs'] == 0, 'no pair is dropped at the boundary')

print('deciding_pair — the closest gradeable pair by predicted margin')
decided = C.deciding_pair([10.05, 10.10, 11.80], [10.0, 10.2, 12.0])
ok(decided is not None, 'a gradeable pair exists to decide the verdict')
ok(decided[0] == 0 and decided[1] == 1,
   'the pair with the smallest predicted gap is identified')
approx(decided[2], 0.05, 1e-9, 'its predicted margin is reported')

print('deciding_pair — no gradeable pairs means no decider')
ok(C.deciding_pair([1.0, 2.0], [21.60, 21.60]) is None,
   'an all-tied set has no pair to decide monotonicity')

print('validate — tolerance is not a free parameter')
ok(C.TOLERANCE_MAG == 0.5, 'the default tolerance is 0.5 mag/arcsec2')

print('the natural floor is not a free parameter')
ok(C.M_NAT_MAG == 22.0, 'the natural sky floor is 22.0 mag/arcsec2')

print('the monotonicity separation minimum is not a free parameter')
ok(C.MIN_MEASURED_SEPARATION_MAG == 0.05,
   'the minimum gradeable measured separation is 0.05 mag/arcsec2')

print('')
print('%d passed, %d failed' % (passed, failed))
for f in failures:
    print('  FAILED: ' + f)
sys.exit(1 if failed else 0)
