"""Read and mosaic NASA Black Marble VNP46A4 tiles.

GDAL reports no geotransform for these HDF5 grids, so georeferencing is
constructed from the tile id: hHHvVV starts at longitude -180 + 10*HH and
latitude 90 - 10*VV, and covers ten degrees each way in 2400 pixels.
Getting this wrong would shift every sample without any test noticing.
"""
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
                path = os.path.join(
                    data_dir, 'VNP46A4.A%d001.%s.h5' % (epoch, tile))
                if not os.path.exists(path):
                    raise SystemExit(
                        'missing tile %s — run fetch_tiles.py --year %d'
                        % (os.path.basename(path), epoch))
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
