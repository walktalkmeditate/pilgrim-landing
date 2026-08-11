# Darkness pipeline

Samples NASA Black Marble night-lights radiance along pilgrimage route
geometry and writes the per-kilometre artifacts in `assets/darkness/`.

**This is the only Python in the repo, and the only place with third-party
dependencies.** Reading a 90 MB HDF5 grid and FFT-convolving it is not
dependency-free Node work. The property that matters is preserved: the
browser reads only the committed static JSON — no network call, no runtime
dependency, no build step.

Run this rarely: only when NASA publishes a new annual composite.

## Setup

    python3 -m venv .venv
    .venv/bin/pip install -r scripts/darkness/requirements.txt

Needs Python 3.10+ — the pinned numpy 2.1.3 / scipy 1.14.1 don't ship
wheels for anything older.

Register free at <https://urs.earthdata.nasa.gov/>, generate a token, then:

    export EARTHDATA_TOKEN='eyJ0eXAi...'

`bake_darkness.py` also needs a sibling `../open-pilgrimages` checkout —
the same convention `bake-daylight-routes` and `bake-collective-routes`
use at the repo root. It reads route waypoints from there and records
the checkout's commit SHA as `geometryCommit` in `meta.json`, so the
artifact always names the exact geometry it was baked from.

## Run

    .venv/bin/python scripts/darkness/fetch_tiles.py --year 2025
    .venv/bin/python scripts/darkness/bake_darkness.py --epoch 2025

## Tests

    for t in geometry kernel raster calibrate emit sites tiles; do
        .venv/bin/python scripts/darkness/${t}_test.py || exit 1
    done

The tests need numpy and scipy; `tiles_test.py` also needs rasterio,
since `tiles.py` imports it at module level even though the test itself
only checks grid arithmetic. None of the seven touch the network.

## Determinism

Given the same tiles and the same recorded parameters, a re-run produces
byte-identical artifacts. A clean `git diff assets/darkness/` confirms
nothing drifted.

## Data

NASA Black Marble VNP46A4 v002, CC0. Three 10-degree tiles cover all seven
routes: `h17v04` and `h17v05` for Iberia, `h31v05` for Shikoku and Kumano.
Roughly 90 MB each, gitignored.
