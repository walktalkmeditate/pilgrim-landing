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
