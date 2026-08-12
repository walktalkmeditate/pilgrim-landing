"""Build a kilometre-indexed polyline for a pilgrimage route.

The route line itself cannot be used. `route.geojson` in the sibling
open-pilgrimages repo is raw OpenStreetMap output — a superset of the walked
route containing variants, alternates and duplicated ways — so it sums to far
more than the published distance and no ordering fixes it. Spec section 2
records the measurements.

`waypoints.geojson` works instead: every waypoint carries a kmFromStart that
upstream already projected onto the route, which is the axis we need.
"""
import math

R_EARTH_KM = 6371.0088

# Which waypoint types define each route's line.
#
# The Caminos use every type: their amenities sit within a few hundred metres
# of the trail. The two Japanese routes cannot — amenity kilometres are
# ambiguous around Shikoku's loop and across Kumano's seven branches, and
# including them produces a polyline five to six times its own kilometre span.
# Their sacred sites (Shikoku's 88 temples, Kumano's oji shrines) are the
# route.
WAYPOINT_TYPES = {
    'shikoku-88': ('sacred_site',),
    'kumano-kodo': ('sacred_site',),
    'camino-frances': None,
    'camino-ingles': None,
    'camino-norte': None,
    'camino-portugues': None,
    'camino-primitivo': None,
}

# Several waypoints often share a kilometre. Their centroid stands in for the
# route there — unless they disagree by more than this, which means the
# projection is unreliable. Shikoku files 145 waypoints at km 728 spanning
# 68 km; their centroid lands in the sea.
MAX_BUCKET_SPREAD_KM = 2.0

# A polyline's length divided by its kilometre span. A correct chord path runs
# about 0.76, cutting the corners of a meandering trail. A polyline that jumps
# between branches runs 5-6. Nothing real lands in between.
RATIO_BOUNDS = (0.5, 1.5)

# The propagation kernel (kernel.py) is truncated at 100 km, but that radius
# is where it is cut off, not where its weight lives: it is sharply peaked,
# with 26.2% of its mass within 1 km, 46.4% within 2 km, 71.2% within 5 km,
# and 84.5% within 10 km. Past 5 km, an interpolated position between two
# real waypoints is standing in for ground the kernel would weight
# substantially differently from the waypoint it is nearest to.
# interpolated_fraction() below measures how much of a route's shipped
# positions fall past that line. The ratio gate above cannot see this: a
# sparse, corner-cutting waypoint selection *lowers* the polyline ratio
# toward the "healthy" 0.76 rather than flagging it — see "Why that ratio
# gate" in docs/specs/2026-08-11-darkness-data-audit.md.
INTERPOLATION_HORIZON_KM = 5.0

# Above this fraction, too much of a route rests on interpolated ground to
# treat its per-kilometre values as read from the route rather than guessed
# between waypoints on it. Deliberately not enforced here — this module only
# measures. bake_darkness.py prints and records the verdict per route, in
# both meta.json and the route's own artifact, and whoever reads that
# disclosure decides whether to ship, drop or resample.
MAX_INTERPOLATED_FRACTION = 0.25


def haversine_km(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * R_EARTH_KM * math.asin(math.sqrt(a))


def route_polyline(geojson, types):
    """Waypoints as an ascending list of (km, lat, lon).

    types is a tuple of waypoint types to keep, or None to keep all.
    """
    buckets = {}
    for feature in geojson.get('features', []):
        props = feature.get('properties', {})
        km = props.get('kmFromStart')
        if km is None:
            continue
        if types is not None and props.get('type') not in types:
            continue
        coords = (feature.get('geometry') or {}).get('coordinates')
        if not coords or len(coords) < 2:
            continue
        lon, lat = coords[:2]
        buckets.setdefault(float(km), []).append((float(lat), float(lon)))

    polyline = []
    for km in sorted(buckets):
        points = buckets[km]
        lat = sum(p[0] for p in points) / len(points)
        lon = sum(p[1] for p in points) / len(points)
        spread = max(haversine_km(lat, lon, p[0], p[1]) for p in points)
        if spread > MAX_BUCKET_SPREAD_KM:
            continue
        polyline.append((km, lat, lon))

    if len(polyline) < 2:
        raise ValueError(
            'only %d usable waypoint(s) after filtering; need at least two'
            % len(polyline))
    return polyline


def polyline_ratio(polyline):
    """Polyline length divided by the kilometre span it claims to cover."""
    span = polyline[-1][0] - polyline[0][0]
    if span <= 0.0:
        raise ValueError('waypoint kilometres do not advance')
    length = sum(haversine_km(polyline[i][1], polyline[i][2],
                              polyline[i + 1][1], polyline[i + 1][2])
                 for i in range(len(polyline) - 1))
    return length / span


def validate_polyline(polyline):
    """Fail loudly when the waypoint selection produced nonsense."""
    ratio = polyline_ratio(polyline)
    low, high = RATIO_BOUNDS
    if not (low <= ratio <= high):
        raise ValueError(
            'polyline runs %.2f x its kilometre span, outside [%.1f, %.1f] — '
            'the waypoint type filter is probably wrong for this route'
            % (ratio, low, high))
    return ratio


def resample_polyline(polyline, step_km):
    """Positions every step_km across the polyline's covered span."""
    start = polyline[0][0]
    end = polyline[-1][0]
    count = int(math.floor((end - start) / step_km)) + 1

    out = []
    seg = 0
    for i in range(count):
        km = start + i * step_km
        while seg + 2 < len(polyline) and polyline[seg + 1][0] < km:
            seg += 1
        km0, lat0, lon0 = polyline[seg]
        km1, lat1, lon1 = polyline[seg + 1]
        f = 0.0 if km1 == km0 else (km - km0) / (km1 - km0)
        f = max(0.0, min(1.0, f))
        out.append((lat0 + (lat1 - lat0) * f, lon0 + (lon1 - lon0) * f))
    return out


def _percentile(values, pct):
    """Nearest-rank percentile: the smallest value whose rank covers pct%.

    values must already be sorted ascending. This is the ceiling
    convention (numpy's 'higher'), not linear interpolation between two
    ranks — it names a gap that actually exists in the data rather than a
    value interpolated between two of them, which matters when the number
    gets read as "how bad is the worst-but-one gap on this route".
    """
    n = len(values)
    rank = min(n, max(1, math.ceil((pct / 100.0) * n)))
    return values[rank - 1]


def interpolated_fraction(polyline, step_km):
    """How much of a resampled route sits far from any real waypoint.

    polyline is the (km, lat, lon) list route_polyline() produces — real
    waypoints, not resampled positions. For every kilometre
    resample_polyline(polyline, step_km) would sample, this finds the
    along-route distance to the nearest real waypoint — a difference of
    kmFromStart, since that axis already *is* the route, not a haversine
    straight line — and reports the fraction landing more than
    INTERPOLATION_HORIZON_KM from one.

    Also returns the gap distribution between consecutive real waypoints
    (max, p90, mean): the same fraction can come from one huge hole or
    many small ones, and deciding what to do about it needs to know which.
    """
    kms = [p[0] for p in polyline]
    gaps = [b - a for a, b in zip(kms, kms[1:])]
    if not gaps:
        raise ValueError('need at least two waypoints to measure gaps')

    # Mirrors resample_polyline's own stepping exactly, so the fraction
    # below is measured over the same samples the artifact ships, not a
    # different, denser or coarser grid that would answer a different
    # question.
    start, end = kms[0], kms[-1]
    count = int(math.floor((end - start) / step_km)) + 1
    far = 0
    for i in range(count):
        km = start + i * step_km
        nearest = min(abs(km - wp_km) for wp_km in kms)
        if nearest > INTERPOLATION_HORIZON_KM:
            far += 1

    gaps_sorted = sorted(gaps)
    return {
        'interpolatedFraction': far / count,
        'maxGapKm': gaps_sorted[-1],
        'p90GapKm': _percentile(gaps_sorted, 90.0),
        'meanGapKm': sum(gaps) / len(gaps),
    }
