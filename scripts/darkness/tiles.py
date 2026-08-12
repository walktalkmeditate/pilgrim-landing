"""Read and mosaic NASA Black Marble VNP46A4 tiles.

GDAL reports no geotransform for these HDF5 grids, so georeferencing is
constructed from the tile id: hHHvVV starts at longitude -180 + 10*HH and
latitude 90 - 10*VV, and covers ten degrees each way in 2400 pixels.
Getting this wrong would shift every sample without any test noticing.

This module also owns where tile files live on disk (DATA_DIR), how they
are named (tile_filename/tile_path), their checksums (sha256_file), and
the manifest recording which CMR granule produced each one
(read_manifest/write_manifest) — the one place bake_darkness.py and
fetch_tiles.py both depend on, so their idea of a tile's identity cannot
drift apart.
"""
import hashlib
import json
import os
import warnings

import numpy as np
import rasterio
from rasterio.errors import NotGeoreferencedWarning

TILE_PX = 2400
TILE_DEG = 10.0
DEG_PER_PX = TILE_DEG / TILE_PX

SDS = ('HDF5:%s://HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data_Fields/'
       'AllAngle_Composite_Snow_Free')

# VNP46A4's documented fill. Anything at or below it is no-data, not dark.
FILL_VALUE = -999.9

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

# fetch_tiles.py's record of which CMR granule produced each downloaded
# file, filename -> producer_granule_id. Lives beside the tiles themselves
# (gitignored, like the tiles), since it describes what is actually on
# this disk rather than something the repo should track.
MANIFEST_NAME = 'manifest.json'


def tile_id(lon, lat):
    return 'h%02dv%02d' % (int((lon + 180.0) // TILE_DEG),
                           int((90.0 - lat) // TILE_DEG))


def tile_origin(tile):
    """North-west corner of a tile, as (west, north)."""
    h = int(tile[1:3])
    v = int(tile[4:6])
    return -180.0 + TILE_DEG * h, 90.0 - TILE_DEG * v


def tiles_for(west, east, south, north):
    """Tile ids covering a bbox, as rows of columns — north row first."""
    hs = list(range(int((west + 180.0) // TILE_DEG),
                    int((east + 180.0) // TILE_DEG) + 1))
    vs = list(range(int((90.0 - north) // TILE_DEG),
                    int((90.0 - south) // TILE_DEG) + 1))
    return [['h%02dv%02d' % (h, v) for h in hs] for v in vs]


def tile_filename(epoch, tile):
    return 'VNP46A4.A%d001.%s.h5' % (epoch, tile)


def tile_path(data_dir, epoch, tile):
    """Where a tile lives on disk, whether or not it is actually there yet."""
    return os.path.join(data_dir, tile_filename(epoch, tile))


def require_tile(data_dir, epoch, tile):
    """tile_path(), or a loud, actionable error if nothing is there yet."""
    path = tile_path(data_dir, epoch, tile)
    if not os.path.exists(path):
        raise SystemExit(
            'missing tile %s — run .venv/bin/python '
            'scripts/darkness/fetch_tiles.py --year %d'
            % (os.path.basename(path), epoch))
    return path


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_manifest(data_dir):
    """filename -> producer_granule_id, for every tile fetch_tiles.py has recorded.

    A missing manifest, or a filename missing from it, both mean
    "unknown" — tiles fetched before this manifest existed still bake,
    just without a producer id recorded in meta.json.
    """
    path = os.path.join(data_dir, MANIFEST_NAME)
    if not os.path.exists(path):
        return {}
    with open(path) as handle:
        return json.load(handle)


def write_manifest(data_dir, manifest):
    path = os.path.join(data_dir, MANIFEST_NAME)
    with open(path, 'w') as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write('\n')


def read_mosaic(data_dir, epoch, west, east, south, north):
    """Mosaic the tiles a bbox needs. Returns (band, west, north).

    The returned origin is the mosaic's north-west corner, not the bbox's —
    the caller windows into it afterwards.
    """
    grid = tiles_for(west, east, south, north)
    rows = []
    # These HDF5 subdatasets carry no geotransform — GDAL warns on every
    # open. The tile id supplies the georeferencing instead (tile_origin),
    # so the warning describes a gap this function already fills.
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', NotGeoreferencedWarning)
        for row in grid:
            columns = []
            for tile in row:
                path = require_tile(data_dir, epoch, tile)
                with rasterio.open(SDS % path) as src:
                    columns.append(src.read(1))
            rows.append(np.hstack(columns))

    band = np.vstack(rows).astype(float)
    # Fill and any negative radiance become zero: absence of light, not
    # negative light. Done before convolution so no-data cannot smear.
    band[band <= FILL_VALUE] = 0.0
    band[band < 0.0] = 0.0

    origin_west, origin_north = tile_origin(grid[0][0])
    return band, origin_west, origin_north
