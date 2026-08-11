"""Resample pilgrimage route geometry to evenly-spaced sample points.

Geometry comes from ../open-pilgrimages/routes/<id>/route.geojson (ODbL,
OpenStreetMap contributors). Vertex spacing there is roughly 20-40 m, so
linear interpolation between vertices is well within tolerance at a 1 km
step.
"""
import math

R_EARTH_KM = 6371.0088

# Shikoku's geometry is a MultiLineString. Concatenating its parts assumes
# they are contiguous; a large jump between one part's end and the next
# part's start would silently desync the kilometre index from the stage
# boundaries /daylight already reports. Fail loudly instead.
MAX_PART_GAP_KM = 5.0


def haversine_km(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * R_EARTH_KM * math.asin(math.sqrt(a))


def route_coords(geojson):
    """Flatten a route.geojson into a single ordered list of (lon, lat)."""
    features = geojson.get('features', [geojson])
    coords = []
    for feature in features:
        geom = feature.get('geometry', feature)
        kind = geom.get('type')
        if kind == 'LineString':
            _append_part(coords, geom['coordinates'])
        elif kind == 'MultiLineString':
            for part in geom['coordinates']:
                _append_part(coords, part)
        else:
            raise ValueError('unsupported geometry type: %s' % kind)
    if len(coords) < 2:
        raise ValueError('route geometry has fewer than two coordinates')
    return coords


def _append_part(coords, part):
    if coords:
        lon_prev, lat_prev = coords[-1]
        lon_next, lat_next = part[0][0], part[0][1]
        gap = haversine_km(lat_prev, lon_prev, lat_next, lon_next)
        if gap > MAX_PART_GAP_KM:
            raise ValueError(
                'geometry parts are %.1f km apart, above the %.1f km limit; '
                'concatenation order is probably wrong' % (gap, MAX_PART_GAP_KM))
    for c in part:
        coords.append((float(c[0]), float(c[1])))


def resample_route(coords, step_km):
    """Walk the line, emitting (lat, lon) every step_km of ground distance."""
    if len(coords) < 2:
        raise ValueError('need at least two coordinates to resample')
    out = [(coords[0][1], coords[0][0])]
    target = step_km
    walked = 0.0
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        seg = haversine_km(lat1, lon1, lat2, lon2)
        if seg <= 0.0:
            continue
        while target <= walked + seg:
            f = (target - walked) / seg
            out.append((lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f))
            target += step_km
        walked += seg
    return out
