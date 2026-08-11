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
    if v == 0.0:
        return 0.0
    places = digits - int(math.floor(math.log10(abs(v)))) - 1
    return round(v, places)


def route_artifact(route_id, epoch, step_km, unit, values, covered_km):
    """One route's darkness profile.

    covered_km is the kilometre span the waypoints actually reach, which is
    not always the route's published length — Shikoku's waypoints cover 1080
    of its 1200 km. Recording it keeps a short ribbon legible as a known
    limit rather than a mystery.
    """
    if unit not in UNITS:
        raise ValueError('unknown unit %r; expected one of %r' % (unit, UNITS))
    if not values:
        raise ValueError('route %s has no sample values' % route_id)
    return {
        'route': route_id,
        'epoch': epoch,
        'stepKm': step_km,
        'coveredKm': round_sig(covered_km, 4),
        'unit': unit,
        'values': [round_sig(v) for v in values],
    }


def dumps(obj):
    """The one canonical serialiser. Deterministic by construction."""
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n'
