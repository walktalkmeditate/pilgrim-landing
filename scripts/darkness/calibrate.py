"""Fit blurred radiance to measured sky brightness, and judge the fit.

The model sums natural and artificial sky luminance rather than fitting
a straight line in log space — see M_NAT_MAG below for why. The
tolerance, the natural floor, and the monotonicity separation floor
below are all fixed by the spec and must not be adjusted to make a
failing run pass.
"""
import numpy as np
from scipy.optimize import least_squares

TOLERANCE_MAG = 0.5

# Bará 2016's published sky-brightness readings carry one decimal place
# of precision (0.1 mag/arcsec2). A measured gap between two sites
# narrower than half that is finer than the source data can actually
# resolve, so it must not count as gradeable ordering evidence -- whether
# the gap is small or exactly zero. Without this floor, a single edited
# digit that shrinks a real 0.1 mag gap to zero turns a near-failing pair
# into a skipped one and can silently swing which alpha clears the gate.
# See _monotonic() below.
MIN_MEASURED_SEPARATION_MAG = 0.05

# The natural night-sky floor, in mag/arcsec2: airglow, zodiacal light and
# integrated starlight put a lower bound on how bright the darkest sky can
# read, even with zero artificial light. ~21.7-22.0 is the accepted
# natural zenith sky brightness range, and nothing on Earth reads darker;
# 22.0 is pinned as the conservative dark end of that range -- the
# darkest value the cited literature actually supports, not a claim
# beyond it. A model that is unbounded as raw radiance -> 0 (this file's
# previous mag = a*log10(raw) + b form) has no such floor: extrapolated
# past the darkest calibration site, it predicted skies that cannot
# exist -- one real bake put 9.8% of samples past this line, up to 23.3
# mag/arcsec2. Summing natural and artificial luminance before converting
# back to magnitudes keeps every prediction at or below M_NAT_MAG by
# construction, however small the artificial term gets.
M_NAT_MAG = 22.0


def _check_positive_finite(raw):
    """Refuse non-positive or non-finite raw radiance.

    Checking before it reaches log10/pow means a bad value never
    produces a RuntimeWarning — this raises a descriptive ValueError
    naming the offending value instead.
    """
    arr = np.asarray(raw, dtype=float)
    bad = arr[~(np.isfinite(arr) & (arr > 0))]
    if bad.size:
        raise ValueError('raw radiance must be a positive finite number, got %r' % float(bad[0]))
    return arr


def _luminance_mag(raw, log10_a, p):
    """mag = -2.5*log10(natural + artificial); raw must already be validated."""
    natural = 10.0 ** (-0.4 * M_NAT_MAG)
    artificial = (10.0 ** log10_a) * raw ** p
    return -2.5 * np.log10(natural + artificial)


def fit_calibration(raw, measured):
    """Least-squares fit of mag = -2.5*log10(10**(-0.4*M_NAT_MAG) + A*raw**p).

    Fits (log10(A), p) rather than (A, p) directly: optimizing in
    log10(A) keeps A implicitly positive over the whole search, so the
    artificial term can only ever add luminance, never subtract it.
    Returns (params, residuals), where params is the (A, p) tuple predict()
    expects.
    """
    raw_arr = _check_positive_finite(raw)
    y = np.asarray(measured, dtype=float)

    def residuals_fn(x):
        return _luminance_mag(raw_arr, x[0], x[1]) - y

    result = least_squares(residuals_fn, x0=[np.log10(1e-9), 1.0])
    log10_a, p = result.x
    params = (float(10.0 ** log10_a), float(p))
    # predicted - measured, matching validate()'s convention below.
    residuals = (_luminance_mag(raw_arr, log10_a, p) - y).tolist()
    return params, residuals


def predict(raw, params):
    a, p = params
    raw_arr = _check_positive_finite(raw)
    return _luminance_mag(raw_arr, np.log10(a), p).tolist()


def _gradeable_gap(m_i, m_j):
    """Is this pair's measured gap wide enough to order, given source precision?

    A gap narrower than MIN_MEASURED_SEPARATION_MAG -- including an exact
    tie -- is not evidence either way: the source data cannot say which
    site is truly darker, so no prediction ordering can contradict it.
    """
    return abs(m_i - m_j) >= MIN_MEASURED_SEPARATION_MAG


def _monotonic(predicted, measured):
    """Do darker measured sites come out darker, among gradeable pairs?

    A pair is skipped, rather than graded, when its measured gap doesn't
    clear MIN_MEASURED_SEPARATION_MAG -- and counted rather than silently
    dropped: a pair that vanishes from the criterion must be visible in
    the count, not just absent from it, or an edit that narrows a real
    gap to nothing could remove a near-failing constraint without a
    trace. Comparing argsort permutations instead would call such a pair
    an inversion and fail a gate that should pass.

    Returns (monotonic, gradeable_pairs, ungradeable_pairs).
    """
    monotonic = True
    gradeable_pairs = 0
    ungradeable_pairs = 0
    for i in range(len(measured)):
        for j in range(i + 1, len(measured)):
            if not _gradeable_gap(measured[i], measured[j]):
                ungradeable_pairs += 1
                continue
            gradeable_pairs += 1
            if (predicted[i] - predicted[j]) * (measured[i] - measured[j]) < 0.0:
                monotonic = False
    return monotonic, gradeable_pairs, ungradeable_pairs


def deciding_pair(predicted, measured):
    """The gradeable pair (i, j, margin) with the smallest |predicted gap|.

    That pair is the one presently deciding the monotonicity verdict --
    the first an edit to the data, or a slightly different fit, would
    flip. Returns None if no pair clears MIN_MEASURED_SEPARATION_MAG.
    """
    closest = None
    for i in range(len(measured)):
        for j in range(i + 1, len(measured)):
            if not _gradeable_gap(measured[i], measured[j]):
                continue
            margin = abs(predicted[i] - predicted[j])
            if closest is None or margin < closest[2]:
                closest = (i, j, margin)
    return closest


def validate(predicted, measured):
    """Judge held-out sites. Both criteria must hold."""
    p = np.asarray(predicted, dtype=float)
    m = np.asarray(measured, dtype=float)
    residual = p - m
    max_abs = float(np.max(np.abs(residual)))
    within = bool(max_abs <= TOLERANCE_MAG)
    monotonic, graded_pairs, ungraded_pairs = _monotonic(p, m)
    return {
        'monotonic': monotonic,
        'within_tolerance': within,
        'max_abs_residual': max_abs,
        'residuals': residual.tolist(),
        'gradedPairs': graded_pairs,
        'ungradedPairs': ungraded_pairs,
        'passed': monotonic and within,
    }
