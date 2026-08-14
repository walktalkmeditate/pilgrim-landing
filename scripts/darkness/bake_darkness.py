"""Bake per-kilometre darkness artifacts for every route.

    .venv/bin/python scripts/darkness/bake_darkness.py --epoch 2025

Mosaics the tiles each region needs, convolves once per region, samples
along the route polyline, calibrates against the five Galician reference
sites, and writes assets/darkness/. Amplitude and ordering are judged by
different models — see choose_alpha() for why.

Exits non-zero if validation fails, unless --fallback-radiance is passed
to ship the weaker claim deliberately. --fallback-radiance is only valid
on a failing gate: passing it when validation actually passes is an
error, not a way to ship the weaker claim instead of one that was earned.

Every route artifact and meta.json are computed in full, in memory,
before any of them touches disk, and then written together in one final
pass — a mid-run failure (a missing tile, say) must never leave
assets/darkness/ holding some routes from this bake and some from the
last one, read against a meta.json that describes neither.
"""
import argparse
import hashlib
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

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PILGRIMAGES = os.path.join(REPO, '..', 'open-pilgrimages')
OUT_DIR = os.path.join(REPO, 'assets', 'darkness')

REGIONS = {
    'iberia': ['camino-frances', 'camino-ingles', 'camino-norte',
               'camino-portugues', 'camino-primitivo'],
    'japan': ['shikoku-88', 'kumano-kodo'],
}

# REGIONS here and geometry.WAYPOINT_TYPES are two independent route
# lists that happen to agree today. A route added to one and not the
# other would be silently dropped from either the bake or the waypoint
# filter, so this fails loudly the moment they drift instead.
_regions_route_ids = sorted(rid for ids in REGIONS.values() for rid in ids)
_waypoint_route_ids = sorted(G.WAYPOINT_TYPES)
assert _regions_route_ids == _waypoint_route_ids, (
    'REGIONS (bake_darkness.py) and WAYPOINT_TYPES (geometry.py) have '
    'drifted apart: REGIONS names %r, WAYPOINT_TYPES names %r'
    % (_regions_route_ids, _waypoint_route_ids))

STEP_KM = 1.0
D0_KM = 1.0
RADIUS_KM = 100.0
MARGIN_DEG = 1.2          # Clears the 100 km kernel radius in latitude,
                          # but not always in longitude: at Iberia's
                          # ~43N mean latitude, 1.2 degrees of longitude
                          # is only ~97.8 km. That shortfall is immaterial
                          # -- the truncated 97.8-100 km annulus carries
                          # ~0.04% of the kernel's mass -- so no sample is
                          # measurably affected, but the margin is not the
                          # comfortable one a flat-degrees reading implies.
ALPHA_GRID = [2.0, 2.25, 2.5, 2.75, 3.0, 3.5, 4.0, 4.5, 5.0]

CITATION = [
    'Night lights: NASA Black Marble VNP46A4 v002 (VIIRS/NPP Lunar '
    'BRDF-Adjusted Nighttime Lights Yearly L3 Global 15 arc second), '
    'NASA LAADS DAAC. Public domain (CC0).',
    'Route geometry: open-pilgrimages, derived from OpenStreetMap '
    'contributors. ODbL v1.0.',
]


def geometry_commit():
    """The open-pilgrimages revision the route geometry came from.

    Only routes/ is checked. A stray scratch file elsewhere in that repo
    cannot change what we read, and blocking on it would be a false alarm —
    the kind that teaches people to bypass the guard.
    """
    if not os.path.isdir(PILGRIMAGES):
        sys.exit(
            'missing sibling checkout %s — clone open-pilgrimages next to '
            'this repo before baking; both bake_darkness.py and '
            'fetch_tiles.py read route geometry from it' % PILGRIMAGES)
    sha = subprocess.check_output(
        ['git', '-C', PILGRIMAGES, 'rev-parse', 'HEAD']).decode().strip()
    dirty = subprocess.check_output(
        ['git', '-C', PILGRIMAGES, 'status', '--porcelain',
         '--', 'routes/']).decode().strip()
    if dirty:
        sys.exit('../open-pilgrimages has uncommitted changes; commit or '
                 'stash them so the artifact records a real revision')
    return sha


def load_points():
    """Resample every route. Returns (points, covered_km, geometry_stats) keyed by route.

    geometry_stats is geometry.interpolated_fraction()'s output per route
    plus withinInterpolationLimit -- whether the route cleared
    G.MAX_INTERPOLATED_FRACTION. That comparison happens here, not inside
    geometry.py: the module only measures, so a route that fails it still
    bakes. It ships loudly instead -- printed below, and carried into both
    meta.json and the route's own artifact -- and the ship/drop/resample
    call belongs to whoever reads that disclosure.
    """
    points = {}
    covered = {}
    geometry_stats = {}
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

            stats = G.interpolated_fraction(polyline, STEP_KM)
            within = stats['interpolatedFraction'] <= G.MAX_INTERPOLATED_FRACTION
            geometry_stats[route_id] = dict(stats, withinInterpolationLimit=within)

            flag = ('' if within else
                   '  *** exceeds MAX_INTERPOLATED_FRACTION=%.2f ***'
                   % G.MAX_INTERPOLATED_FRACTION)
            print('  %-18s %5d samples  covers %4.0f km  ratio %.2f  '
                  'interpolated %4.1f%%  maxGap %5.1f km  p90Gap %5.1f km  '
                  'meanGap %4.1f km%s'
                  % (route_id, len(points[route_id]), covered[route_id], ratio,
                     stats['interpolatedFraction'] * 100.0, stats['maxGapKm'],
                     stats['p90GapKm'], stats['meanGapKm'], flag))
    return points, covered, geometry_stats


def region_bbox(lats, lons):
    """Bounding box for a set of points, padded to clear the kernel radius."""
    return (min(lons) - MARGIN_DEG, max(lons) + MARGIN_DEG,
            min(lats) - MARGIN_DEG, max(lats) + MARGIN_DEG)


def tiles_needed(points):
    """Every Black Marble tile a real bake over these route points will open.

    Covers both the seven routes' regions and the five calibration sites
    (sites.REFERENCE_SITES) -- the latter's tiles fall inside the
    former's for every region that currently has reference sites, but
    this asks tiles_for() directly rather than assuming that stays true.
    Shares region_bbox() and tiles_for() with blurred_region(), so
    fetch_tiles.py's download list and this bake's actual tile usage
    share one computation and cannot quietly drift into two different
    answers.
    """
    needed = set()

    for region, ids in REGIONS.items():
        lats = [pt[0] for rid in ids for pt in points[rid]]
        lons = [pt[1] for rid in ids for pt in points[rid]]
        west, east, south, north = region_bbox(lats, lons)
        for row in T.tiles_for(west, east, south, north):
            needed.update(row)

    ref_lats = [s['lat'] for s in S.REFERENCE_SITES]
    ref_lons = [s['lon'] for s in S.REFERENCE_SITES]
    west, east, south, north = region_bbox(ref_lats, ref_lons)
    for row in T.tiles_for(west, east, south, north):
        needed.update(row)

    return needed


def region_of(lat, lon):
    return 'japan' if lon > 60.0 else 'iberia'


def region_has_held_out_site(region):
    """Whether any REFERENCE_SITES member falls in this region.

    True for iberia (five Galician sites), false for japan. Derived from
    the sites themselves rather than a hardcoded route list, so adding or
    removing a reference site updates every affected route's
    heldOutValidation automatically instead of needing a second edit here.
    """
    return any(region_of(s['lat'], s['lon']) == region for s in S.REFERENCE_SITES)


def compute_bake_id(epoch, geometry_sha, tile_records, alpha):
    """Short fingerprint over everything that can vary between bakes.

    A partially-invalidated CDN could otherwise serve a route file from
    one bake next to a meta.json from another with no way to tell —
    same epoch, same route id, different underlying data. Any consumer
    holding two files can compare this instead of trusting the filename.
    """
    payload = json.dumps({
        'epoch': epoch,
        'geometryCommit': geometry_sha,
        'tiles': {t: tile_records[t]['sha256'] for t in sorted(tile_records)},
        'alpha': alpha,
    }, sort_keys=True)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]


def crop_window(west, east, south, north, mosaic_west, mosaic_north,
                mosaic_height, mosaic_width, deg_per_px):
    """Pixel indices of the bbox window inside a mosaic, clamped to it.

    Returns (x0, y0, x1, y1, crop_west, crop_north): mosaic[y0:y1, x0:x1]
    is the smallest pixel window covering (west, east, south, north), and
    (crop_west, crop_north) is that window's own north-west corner --
    the origin sample_bilinear() needs to read positions out of the crop
    rather than the full mosaic.
    """
    x0 = max(0, int((west - mosaic_west) / deg_per_px))
    y0 = max(0, int((mosaic_north - north) / deg_per_px))
    x1 = min(mosaic_width, int((east - mosaic_west) / deg_per_px) + 1)
    y1 = min(mosaic_height, int((mosaic_north - south) / deg_per_px) + 1)
    crop_west = mosaic_west + x0 * deg_per_px
    crop_north = mosaic_north - y0 * deg_per_px
    return x0, y0, x1, y1, crop_west, crop_north


def blurred_region(epoch, lats, lons, alpha):
    """Mosaic, window to the bbox plus margin, convolve.

    Returns (blurred_field, crop_west, crop_north, kernel_sum). kernel_sum
    is the propagation kernel's total weight (Sum of w*A_px over its
    footprint) -- the denominator that turns a sampled value, which is a
    kernel-weighted area integral of radiance, into a true kernel-weighted
    mean radiance. Only the fallback-radiance path needs it; the
    calibrated sky-brightness path absorbs this scale into the fitted A
    and never touches it directly.
    """
    west, east, south, north = region_bbox(lats, lons)

    band, mosaic_west, mosaic_north = T.read_mosaic(
        T.DATA_DIR, epoch, west, east, south, north)

    x0, y0, x1, y1, crop_west, crop_north = crop_window(
        west, east, south, north, mosaic_west, mosaic_north,
        band.shape[0], band.shape[1], T.DEG_PER_PX)
    crop = band[y0:y1, x0:x1]

    kern = K.build_kernel(alpha, D0_KM, RADIUS_KM, T.DEG_PER_PX,
                          float(np.mean(lats)))
    field = R.convolve_field(crop, kern)
    return field, crop_west, crop_north, float(kern.sum())


def raw_at_sites(epoch, site_list, alpha, cache):
    """Blurred radiance at each site, reusing one field per region."""
    values = []
    for site in site_list:
        region = region_of(site['lat'], site['lon'])
        # The epoch belongs in the key. Without it a caller holding one
        # cache across two epochs gets the FIRST epoch's field back for
        # both, silently — epoch is only read on a miss. A single-epoch
        # bake never notices; the 2012 drift audit did, after this
        # reported 0.0% change at all five reference sites and the
        # radiance columns came back identical to four significant
        # figures. Two epochs of satellite data are never byte-identical.
        key = (epoch, region, alpha)
        if key not in cache:
            members = [s for s in S.REFERENCE_SITES
                       if region_of(s['lat'], s['lon']) == region]
            cache[key] = blurred_region(
                epoch, [s['lat'] for s in members],
                [s['lon'] for s in members], alpha)
        field, west, north, _ = cache[key]
        values.append(R.sample_bilinear(field, west, north, T.DEG_PER_PX,
                                        site['lat'], site['lon']))
    return values


def leave_one_out(epoch, alpha, cache):
    """Fit on four reference sites, predict the fifth; repeat for all five.

    This measures amplitude only — how far off a site's prediction lands
    when the fit never saw it. It must not also be read for ordering: each
    of the five predictions comes from a *different* four-site fit, so
    comparing those predictions to each other conflates real model error
    with whatever that fold's missing site changed about the fit. See
    choose_alpha() for the pairing with full_set_fit() that ordering
    actually needs.
    """
    predicted = []
    measured = []
    for i, held_out in enumerate(S.REFERENCE_SITES):
        train_sites = S.REFERENCE_SITES[:i] + S.REFERENCE_SITES[i + 1:]
        raw_train = raw_at_sites(epoch, train_sites, alpha, cache)
        params, _ = C.fit_calibration(
            raw_train, [s['mag_arcsec2'] for s in train_sites])
        raw_held = raw_at_sites(epoch, [held_out], alpha, cache)
        predicted.append(C.predict(raw_held, params)[0])
        measured.append(held_out['mag_arcsec2'])
    return C.validate(predicted, measured)


def full_set_fit(epoch, alpha, cache):
    """Fit once on all five reference sites; predict all five from it.

    Ordering asks "do darker measured sites come out darker predicted",
    which only means something if every prediction being compared shares
    one model. leave_one_out() cannot answer this — its five predictions
    each come from a different fit. This is the one place monotonicity
    should be judged from, and also produces the (A, p) that ship.
    """
    raw_all = raw_at_sites(epoch, S.REFERENCE_SITES, alpha, cache)
    measured = [s['mag_arcsec2'] for s in S.REFERENCE_SITES]
    params, _ = C.fit_calibration(raw_all, measured)
    report = C.validate(C.predict(raw_all, params), measured)
    return params, report


def choose_alpha(epoch, cache):
    """Grid-search alpha, printing every candidate for audit.

    Amplitude and ordering are graded by different models on purpose.
    Leave-one-out predicts each site from a fit that never saw it, which
    is the right test of how far off a genuinely new point could land —
    but every leave-one-out prediction comes from a *different* four-site
    fit, so comparing those predictions to each other conflates real
    model error with whatever that fold's missing site changed. That is
    exactly how a first attempt at this failed: Santiago (measured 19.10)
    and Guisamo (measured 19.80) — 0.70 mag apart — landed only 0.0022
    mag apart under leave-one-out, a coin-flip margin that moved with the
    crop, the FFT, and the numpy build, not a real signal about whether
    darker sites predict darker. Ordering instead comes from one
    full-set fit applied to all five sites, so every prediction being
    compared shares the same model and the comparison means something.

    Selection: among alphas that are monotonic under the full-set fit AND
    whose leave-one-out worst residual is within C.TOLERANCE_MAG, keep
    the smallest leave-one-out worst residual. If none qualify, fall back
    to the smallest leave-one-out worst residual overall and let main()
    fail the gate — a real failure should surface, not get hidden by
    grid choice.

    Also returns the list of qualifying alphas, so the artifact can
    record the grid a headline number was chosen from, not just the
    winner — a smaller residual from a denser grid means something
    different than one from a coarser search of the same range.
    """
    graded = []
    for alpha in ALPHA_GRID:
        loo_report = leave_one_out(epoch, alpha, cache)
        params, full_report = full_set_fit(epoch, alpha, cache)
        print('  alpha %.2f  LOO worst %.4f  monotonic %s  full worst %.4f'
              % (alpha, loo_report['max_abs_residual'],
                 full_report['monotonic'], full_report['max_abs_residual']))
        graded.append((alpha, loo_report, params, full_report))

    chosen, qualifying_alphas = select_alpha(graded)
    return chosen + (qualifying_alphas,)


def select_alpha(graded):
    """Pick the winning (alpha, loo_report, params, full_report) tuple.

    graded is a list of (alpha, loo_report, params, full_report), one per
    ALPHA_GRID entry -- loo_report and full_report are C.validate()'s
    dicts, so g[1]['max_abs_residual'] is the leave-one-out worst
    residual and g[3]['monotonic'] is the full-set-fit ordering verdict.

    Among alphas that are monotonic under the full-set fit AND whose
    leave-one-out worst residual is within C.TOLERANCE_MAG, keep the
    smallest leave-one-out worst residual. If none qualify, fall back to
    the smallest leave-one-out worst residual overall, so the gate can
    fail loudly on a real miss rather than have grid choice hide it.

    Returns (chosen, qualifying_alphas).
    """
    qualifying = [g for g in graded if g[3]['monotonic']
                  and g[1]['max_abs_residual'] <= C.TOLERANCE_MAG]
    pool = qualifying if qualifying else graded
    chosen = min(pool, key=lambda g: g[1]['max_abs_residual'])
    qualifying_alphas = [g[0] for g in qualifying]
    return chosen, qualifying_alphas


def gate_decision(passed, fallback_radiance):
    """Whether the bake may proceed, and which unit it ships under.

    passed is full_report['monotonic'] and loo_report['max_abs_residual']
    <= C.TOLERANCE_MAG -- the gate's verdict. Exits with an actionable
    message for the two combinations that contradict the flag (a passing
    gate asked to ship the weaker claim, or a failing one asked to ship
    the stronger one); otherwise returns the unit the artifact ships
    under.
    """
    if passed and fallback_radiance:
        sys.exit('validation PASSED; --fallback-radiance ships a weaker '
                 'claim than the data supports and exists only for a '
                 'failing gate. Drop the flag to write the sky-brightness '
                 'artifact the data actually earned.')
    if not passed and not fallback_radiance:
        sys.exit('validation FAILED (leave-one-out amplitude / full-set-fit '
                 'ordering). Do not widen the tolerance. Re-run with '
                 '--fallback-radiance to ship banded radiance, per section '
                 '7 of the spec.')
    return E.UNIT_RADIANCE if fallback_radiance else E.UNIT_SKY


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--epoch', type=int, required=True,
                        help='Black Marble annual composite year to bake, e.g. 2025')
    parser.add_argument('--fallback-radiance', action='store_true',
                        help='ship banded radiance instead of sky brightness')
    args = parser.parse_args()

    geometry_sha = geometry_commit()

    print('resampling routes')
    points, covered, geometry_stats = load_points()

    print('searching alpha (LOO amplitude, full-set-fit ordering)')
    cache = {}
    alpha, loo_report, params, full_report, qualifying_alphas = choose_alpha(
        args.epoch, cache)
    A, p = params
    print('chose alpha=%.2f  LOO worst=%.4f  monotonic=%s  full worst=%.4f'
          % (alpha, loo_report['max_abs_residual'], full_report['monotonic'],
             full_report['max_abs_residual']))
    for site, resid in zip(S.REFERENCE_SITES, loo_report['residuals'],
                           strict=True):
        print('  %-34s measured %.2f  LOO residual %+.3f'
              % (site['name'][:34], site['mag_arcsec2'], resid))

    passed = (full_report['monotonic']
             and loo_report['max_abs_residual'] <= C.TOLERANCE_MAG)
    unit = gate_decision(passed, args.fallback_radiance)

    print('final calibration  A=%.4e  p=%.4f  mNatMag=%.1f  (full fit, '
          'all five reference sites)' % (A, p, C.M_NAT_MAG))

    # Belt and suspenders against gate_decision() ever drifting from this
    # invariant: the gate's verdict and the unit it ships under must
    # always agree, in both directions.
    assert (unit == E.UNIT_SKY) == passed, (
        'unit/gate contradiction: unit=%r but validation.passed=%r'
        % (unit, passed))
    print('writing artifacts as %s' % unit)

    tile_ids = sorted(tiles_needed(points))
    manifest = T.read_manifest(T.DATA_DIR)
    tile_records = {}
    for tile_id in tile_ids:
        path = T.require_tile(T.DATA_DIR, args.epoch, tile_id)
        filename = os.path.basename(path)
        tile_records[tile_id] = {
            'sha256': T.sha256_file(path),
            'producerGranuleId': manifest.get(filename),
        }

    bake_id = compute_bake_id(args.epoch, geometry_sha, tile_records, alpha)
    held_out_by_region = {region: region_has_held_out_site(region)
                          for region in REGIONS}

    # Every route artifact and meta.json, computed in full before any of
    # them touches disk — see the module docstring for why.
    outputs = []
    values_by_route = {}

    for region, ids in REGIONS.items():
        lats = [pt[0] for rid in ids for pt in points[rid]]
        lons = [pt[1] for rid in ids for pt in points[rid]]
        field, west, north, kernel_sum = blurred_region(
            args.epoch, lats, lons, alpha)
        for route_id in ids:
            raw = [R.sample_bilinear(field, west, north, T.DEG_PER_PX, la, lo)
                   for la, lo in points[route_id]]
            if args.fallback_radiance:
                # raw is a kernel-weighted AREA INTEGRAL of radiance
                # (Sum w*L*A_px), not a radiance -- dividing by the
                # kernel's own total weight turns it into a genuine
                # kernel-weighted MEAN radiance, nW/cm2/sr as labelled.
                values = [v / kernel_sum for v in raw]
                for v in values:
                    assert 0.0 <= v <= 2000.0, (
                        'fallback radiance %.4f nW/cm2/sr for route %s is '
                        'outside the physically plausible range [0, 2000] '
                        '-- the kernel-mean computation is probably wrong'
                        % (v, route_id))
            else:
                values = C.predict(raw, params)
            values_by_route[route_id] = values
            artifact = E.route_artifact(route_id, args.epoch, int(STEP_KM),
                                        unit, values, covered[route_id],
                                        geometry_stats[route_id],
                                        held_out_by_region[region], bake_id)
            path = os.path.join(OUT_DIR, route_id + '.json')
            outputs.append((path, E.dumps(artifact)))
            print('  %-18s %5d values -> %s'
                  % (route_id, len(values), os.path.relpath(path, REPO)))

    if unit == E.UNIT_SKY:
        # The reference sites bound the calibration only between them --
        # M_NAT_MAG floors the dark end, but nothing floors the bright
        # end the way it does. A sample brighter than every reference
        # site is extrapolating past the brightest anchor with no
        # analogous physical ceiling holding it back. See "Bright-end
        # extrapolation" in docs/specs/2026-08-11-darkness-data-audit.md.
        iberia_values = [v for route_id in REGIONS['iberia']
                         for v in values_by_route[route_id]]
        brightest = min(S.REFERENCE_SITES, key=lambda s: s['mag_arcsec2'])
        exceeding = sum(1 for v in iberia_values if v < brightest['mag_arcsec2'])
        print('  bright-end extrapolation: %d/%d Iberia samples (%.1f%%) '
              'read brighter than the brightest calibration anchor '
              '(%.2f mag/arcsec2, %s) -- unlike the dark end, nothing '
              'bounds this'
              % (exceeding, len(iberia_values),
                 100.0 * exceeding / len(iberia_values),
                 brightest['mag_arcsec2'], brightest['name']))

    # Which pair the monotonicity verdict actually rests on, so a future
    # edit that removes it -- deliberately or not -- shows up in the
    # artifact instead of just changing the alpha the gate happens to
    # pick. full_report['residuals'] is predicted - measured in
    # S.REFERENCE_SITES order, so adding measured back in recovers the
    # full-set predictions without re-fitting.
    measured_all = [site['mag_arcsec2'] for site in S.REFERENCE_SITES]
    predicted_all = [resid + measured for resid, measured in
                     zip(full_report['residuals'], measured_all)]
    decided = C.deciding_pair(predicted_all, measured_all)
    deciding_pair_meta = None
    if decided is not None:
        site_a, site_b, margin = decided
        deciding_pair_meta = {
            'siteA': S.REFERENCE_SITES[site_a]['name'],
            'siteB': S.REFERENCE_SITES[site_b]['name'],
            'marginMag': margin,
        }

    meta = {
        'epoch': args.epoch,
        'bakeId': bake_id,
        'unit': unit,
        'stepKm': int(STEP_KM),
        'source': {
            'product': 'NASA Black Marble VNP46A4 v002',
            'band': 'AllAngle_Composite_Snow_Free',
            'tiles': tile_records,
            'geometryCommit': geometry_sha,
        },
        # Per-route positional trust, keyed by route id -- see
        # geometry.interpolated_fraction() and geometry.MAX_INTERPOLATED_FRACTION.
        # A route with withinInterpolationLimit false still ships; this is
        # where that fact must be visible to anyone reading the artifact,
        # not just in the console log load_points() printed it to.
        'geometry': geometry_stats,
        # Per-route: does this route's region contain any leave-one-out
        # reference site? True for the five Caminos, false for Shikoku
        # and Kumano -- see region_has_held_out_site(). Japan's
        # conversion rests on the same physics but was never scored
        # against a held-out Japanese reading.
        'heldOutValidation': {route_id: held_out_by_region[region]
                              for region, ids in REGIONS.items()
                              for route_id in ids},
        'kernel': {'form': '(1 + d/d0) ** -alpha',
                   'alpha': alpha, 'd0Km': D0_KM, 'radiusKm': RADIUS_KM},
        'calibration': {'mNatMag': C.M_NAT_MAG, 'A': A, 'p': p,
                        'alpha': alpha, 'sites': S.REFERENCE_SITES},
        'validation': {
            'method': 'leave-one-out for amplitude, full-set fit for ordering',
            'residuals': [{'name': site['name'], 'residual': resid}
                          for site, resid in zip(S.REFERENCE_SITES,
                                                  loo_report['residuals'],
                                                  strict=True)],
            'alpha': alpha,
            'fullSetWorstResidual': full_report['max_abs_residual'],
            # The verdict travels with the data. A reader holding only this
            # artifact should not have to find the spec to learn whether the
            # number in front of them cleared its gate.
            'toleranceMag': C.TOLERANCE_MAG,
            'looWorstResidual': loo_report['max_abs_residual'],
            'monotonic': full_report['monotonic'],
            # Pairs the monotonicity check could actually rule on, and
            # the one presently deciding its verdict — see
            # MIN_MEASURED_SEPARATION_MAG in calibrate.py for why a pair
            # can be ungradeable.
            'gradedPairs': full_report['gradedPairs'],
            'ungradedPairs': full_report['ungradedPairs'],
            'decidingPair': deciding_pair_meta,
            # The grid alpha was actually searched from, and the subset that
            # cleared both criteria — a headline residual only means what it
            # claims to mean next to the search that produced it.
            'alphaGrid': ALPHA_GRID,
            'qualifyingAlphas': qualifying_alphas,
            'passed': passed,
        },
        'excludedSites': S.EXCLUDED_SITES,
        'citation': CITATION,
    }
    outputs.append((os.path.join(OUT_DIR, 'meta.json'), E.dumps(meta)))

    os.makedirs(OUT_DIR, exist_ok=True)
    for path, text in outputs:
        with open(path, 'w') as handle:
            handle.write(text)
    print('wrote %d files to %s' % (len(outputs), os.path.relpath(OUT_DIR, REPO)))


if __name__ == '__main__':
    main()
