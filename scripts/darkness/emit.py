"""Serialise darkness artifacts.

Every file the pipeline writes goes through dumps(), so re-running with
identical inputs produces byte-identical output — the same guarantee
bake-daylight-routes and bake-collective-routes make.
"""
import json
import math

UNIT_SKY = 'mag/arcsec2'
UNIT_RADIANCE = 'nW/cm2/sr'
UNITS = (UNIT_SKY, UNIT_RADIANCE)


def round_sig(value, digits=3):
    v = float(value)
    if not math.isfinite(v):
        raise ValueError('cannot round a non-finite value: %r' % v)
    if v == 0.0:
        return 0.0
    places = digits - int(math.floor(math.log10(abs(v)))) - 1
    return round(v, places)


def route_artifact(route_id, epoch, step_km, unit, values, covered_km,
                   positional_confidence, held_out_validation, bake_id):
    """One route's darkness profile.

    values is the authoritative sample count for the route; coveredKm is
    descriptive only. coveredKm is the kilometre span the waypoints
    actually reach, which is not always the route's published length —
    Shikoku's waypoints cover 1080 of its 1200 km. Recording it keeps a
    short ribbon legible as a known limit rather than a mystery.

    coveredKm is rounded to a fixed one decimal place, not significant
    figures. Significant-figure rounding drops to zero decimal places
    once a covered span reaches the thousands (Shikoku), which can land
    an exact x.5 km remainder on Python's round-half-to-even boundary
    instead of a stable, predictable value. The assertion below is what
    actually keeps coveredKm and values honest against each other:
    resample_polyline() never places a sample past the last whole
    step_km within the waypoints' span, so floor(coveredKm / stepKm) + 1
    must equal len(values) — a relationship a consumer holding only this
    file can check for itself.

    positional_confidence is geometry.interpolated_fraction()'s stats for
    this route (interpolatedFraction, maxGapKm, p90GapKm, meanGapKm) plus
    whether it cleared geometry.MAX_INTERPOLATED_FRACTION
    (withinInterpolationLimit). meta.json records the same numbers for
    every route in one place; carrying a copy here means a consumer
    holding only this file can judge whether its positions are
    trustworthy without opening meta.json.

    held_out_validation is whether this route's region contains any of
    the leave-one-out reference sites the calibration was judged
    against — true for the five Caminos (Galicia), false for Shikoku and
    Kumano. Japan's conversion rests on the same physics but was never
    scored against a held-out Japanese reading.

    bake_id ties this file to the meta.json it was baked alongside — see
    bake_darkness.compute_bake_id().
    """
    if unit not in UNITS:
        raise ValueError('unknown unit %r; expected one of %r' % (unit, UNITS))
    if not values:
        raise ValueError('route %s has no sample values' % route_id)

    covered_km = float(covered_km)
    if not math.isfinite(covered_km):
        raise ValueError('coveredKm must be finite, got %r' % covered_km)
    covered_rounded = round(covered_km, 1)
    expected_count = math.floor(covered_rounded / step_km) + 1
    if expected_count != len(values):
        raise ValueError(
            'route %s: coveredKm %.1f at stepKm %s implies %d samples '
            '(floor(coveredKm / stepKm) + 1), but got %d values'
            % (route_id, covered_rounded, step_km, expected_count, len(values)))

    return {
        'route': route_id,
        'epoch': epoch,
        'bakeId': bake_id,
        'stepKm': step_km,
        'coveredKm': covered_rounded,
        'unit': unit,
        'values': [round_sig(v) for v in values],
        'heldOutValidation': bool(held_out_validation),
        'positionalConfidence': {
            'interpolatedFraction': round_sig(positional_confidence['interpolatedFraction']),
            'maxGapKm': round_sig(positional_confidence['maxGapKm'], 4),
            'p90GapKm': round_sig(positional_confidence['p90GapKm'], 4),
            'meanGapKm': round_sig(positional_confidence['meanGapKm'], 4),
            'withinInterpolationLimit': bool(positional_confidence['withinInterpolationLimit']),
        },
    }


def dumps(obj):
    """The one canonical serialiser. Deterministic by construction."""
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n'
