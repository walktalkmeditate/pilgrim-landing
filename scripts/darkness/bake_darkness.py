"""Bake per-kilometre darkness artifacts for every route.

    .venv/bin/python scripts/darkness/bake_darkness.py --epoch 2025

Mosaics the tiles each region needs, convolves once per region, samples
along the route polyline, calibrates against the five reference sites,
judges the three held-out sites, and writes assets/darkness/.

Exits non-zero if held-out validation fails, unless --fallback-radiance
is passed to ship the weaker claim deliberately.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geometry as G
import kernel as K
import raster as R
import calibrate as C
import emit as E
import sites as S
import tiles as T
from fetch_tiles import sha256_file, DATA_DIR, TILES

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PILGRIMAGES = os.path.join(REPO, '..', 'open-pilgrimages')
OUT_DIR = os.path.join(REPO, 'assets', 'darkness')

REGIONS = {
    'iberia': ['camino-frances', 'camino-ingles', 'camino-norte',
               'camino-portugues', 'camino-primitivo'],
    'japan': ['shikoku-88', 'kumano-kodo'],
}

STEP_KM = 1.0
D0_KM = 1.0
RADIUS_KM = 100.0
MARGIN_DEG = 1.2          # comfortably over 100 km, so the kernel never
                          # runs off the crop and no sample nears an edge
ALPHA_GRID = [1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0]

CITATION = [
    'Night lights: NASA Black Marble VNP46A4 v002 (VIIRS/NPP Lunar '
    'BRDF-Adjusted Nighttime Lights Yearly L3 Global 15 arc second), '
    'NASA LAADS DAAC. Public domain (CC0).',
    'Route geometry: open-pilgrimages, derived from OpenStreetMap '
    'contributors. ODbL v1.0.',
]


def geometry_commit():
    sha = subprocess.check_output(
        ['git', '-C', PILGRIMAGES, 'rev-parse', 'HEAD']).decode().strip()
    dirty = subprocess.check_output(
        ['git', '-C', PILGRIMAGES, 'status', '--porcelain']).decode().strip()
    if dirty:
        sys.exit('../open-pilgrimages has uncommitted changes; commit or '
                 'stash them so the artifact records a real revision')
    return sha


def load_points():
    """Resample every route. Returns (points, covered_km) keyed by route."""
    points = {}
    covered = {}
    for region, ids in REGIONS.items():
        for route_id in ids:
            path = os.path.join(PILGRIMAGES, 'routes', route_id,
                                'waypoints.geojson')
            with open(path) as handle:
                geojson = json.load(handle)
            polyline = G.route_polyline(geojson, G.WAYPOINT_TYPES[route_id])
            ratio = G.validate_polyline(polyline)
            points[route_id] = G.resample_polyline(polyline, STEP_KM)
            covered[route_id] = polyline[-1][0] - polyline[0][0]
            print('  %-18s %5d samples  covers %4.0f km  ratio %.2f'
                  % (route_id, len(points[route_id]), covered[route_id], ratio))
    return points, covered


def region_of(lat, lon):
    return 'japan' if lon > 60.0 else 'iberia'


def blurred_region(epoch, lats, lons, alpha):
    """Mosaic, window to the bbox plus margin, convolve. Returns field+origin."""
    west = min(lons) - MARGIN_DEG
    east = max(lons) + MARGIN_DEG
    south = min(lats) - MARGIN_DEG
    north = max(lats) + MARGIN_DEG

    band, mosaic_west, mosaic_north = T.read_mosaic(
        DATA_DIR, epoch, west, east, south, north)

    x0 = max(0, int((west - mosaic_west) / T.DEG_PER_PX))
    y0 = max(0, int((mosaic_north - north) / T.DEG_PER_PX))
    x1 = min(band.shape[1], int((east - mosaic_west) / T.DEG_PER_PX) + 1)
    y1 = min(band.shape[0], int((mosaic_north - south) / T.DEG_PER_PX) + 1)
    crop = band[y0:y1, x0:x1]

    crop_west = mosaic_west + x0 * T.DEG_PER_PX
    crop_north = mosaic_north - y0 * T.DEG_PER_PX

    kern = K.build_kernel(alpha, D0_KM, RADIUS_KM, T.DEG_PER_PX,
                          float(np.mean(lats)))
    return R.convolve_field(crop, kern), crop_west, crop_north


def raw_at_sites(epoch, site_list, alpha, cache):
    """Blurred radiance at each site, reusing one field per region."""
    values = []
    for site in site_list:
        region = region_of(site['lat'], site['lon'])
        key = (region, alpha)
        if key not in cache:
            members = [s for s in S.CALIBRATION_SITES + S.VALIDATION_SITES
                       if region_of(s['lat'], s['lon']) == region]
            cache[key] = blurred_region(
                epoch, [s['lat'] for s in members],
                [s['lon'] for s in members], alpha)
        field, west, north = cache[key]
        values.append(R.sample_bilinear(field, west, north, T.DEG_PER_PX,
                                        site['lat'], site['lon']))
    return values


def choose_alpha(epoch):
    """Grid-search alpha, keeping whichever minimises calibration residual."""
    measured = [s['mag_arcsec2'] for s in S.CALIBRATION_SITES]
    best = None
    for alpha in ALPHA_GRID:
        raw = raw_at_sites(epoch, S.CALIBRATION_SITES, alpha, {})
        if min(raw) <= 0.0:
            print('  alpha %.2f  skipped (a site sampled zero radiance)'
                  % alpha)
            continue
        a, b, residuals = C.fit_calibration(raw, measured)
        worst = max(abs(r) for r in residuals)
        print('  alpha %.2f  a=%+.3f b=%+.3f  worst residual %.3f'
              % (alpha, a, b, worst))
        if best is None or worst < best[0]:
            best = (worst, alpha, a, b)
    if best is None:
        sys.exit('no alpha produced usable samples at every calibration site')
    return best[1], best[2], best[3]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epoch', type=int, required=True)
    parser.add_argument('--fallback-radiance', action='store_true',
                        help='ship banded radiance instead of sky brightness')
    args = parser.parse_args()

    geometry_sha = geometry_commit()

    print('resampling routes')
    points, covered = load_points()

    print('searching alpha')
    alpha, a, b = choose_alpha(args.epoch)
    print('chose alpha=%.2f  a=%+.4f  b=%+.4f' % (alpha, a, b))

    print('validating against held-out sites')
    held_raw = raw_at_sites(args.epoch, S.VALIDATION_SITES, alpha, {})
    held_measured = [s['mag_arcsec2'] for s in S.VALIDATION_SITES]
    report = C.validate(C.predict(held_raw, a, b), held_measured)
    for site, resid in zip(S.VALIDATION_SITES, report['residuals']):
        print('  %-34s measured %.2f  residual %+.3f'
              % (site['name'][:34], site['mag_arcsec2'], resid))
    print('  monotonic=%s  within_tolerance=%s  max=%.3f'
          % (report['monotonic'], report['within_tolerance'],
             report['max_abs_residual']))

    if not report['passed'] and not args.fallback_radiance:
        sys.exit('held-out validation FAILED. Do not widen the tolerance. '
                 'Re-run with --fallback-radiance to ship banded radiance, '
                 'per section 7 of the spec.')

    unit = E.UNIT_RADIANCE if args.fallback_radiance else E.UNIT_SKY
    print('writing artifacts as %s' % unit)
    os.makedirs(OUT_DIR, exist_ok=True)

    for region, ids in REGIONS.items():
        lats = [p[0] for rid in ids for p in points[rid]]
        lons = [p[1] for rid in ids for p in points[rid]]
        field, west, north = blurred_region(args.epoch, lats, lons, alpha)
        for route_id in ids:
            raw = [R.sample_bilinear(field, west, north, T.DEG_PER_PX, la, lo)
                   for la, lo in points[route_id]]
            values = raw if args.fallback_radiance else C.predict(raw, a, b)
            artifact = E.route_artifact(route_id, args.epoch, int(STEP_KM),
                                        unit, values, covered[route_id])
            path = os.path.join(OUT_DIR, route_id + '.json')
            with open(path, 'w') as handle:
                handle.write(E.dumps(artifact))
            print('  %-18s %5d values -> %s'
                  % (route_id, len(values), os.path.relpath(path, REPO)))

    meta = {
        'epoch': args.epoch,
        'unit': unit,
        'stepKm': int(STEP_KM),
        'source': {
            'product': 'NASA Black Marble VNP46A4 v002',
            'band': 'AllAngle_Composite_Snow_Free',
            'tiles': {t: sha256_file(os.path.join(
                DATA_DIR, 'VNP46A4.A%d001.%s.h5' % (args.epoch, t)))
                for t in TILES},
            'geometryCommit': geometry_sha,
        },
        'kernel': {'form': '(1 + d/d0) ** -alpha',
                   'alpha': alpha, 'd0Km': D0_KM, 'radiusKm': RADIUS_KM},
        'calibration': {'a': a, 'b': b, 'sites': S.CALIBRATION_SITES},
        'validation': {'sites': S.VALIDATION_SITES, 'report': report},
        'citation': CITATION,
    }
    with open(os.path.join(OUT_DIR, 'meta.json'), 'w') as handle:
        handle.write(E.dumps(meta))
    print('wrote assets/darkness/meta.json')


if __name__ == '__main__':
    main()
