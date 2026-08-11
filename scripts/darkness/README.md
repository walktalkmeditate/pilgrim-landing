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

Register free at <https://urs.earthdata.nasa.gov/>, generate a token, then:

    export EARTHDATA_TOKEN='eyJ0eXAi...'

## Run

    .venv/bin/python scripts/darkness/fetch_tiles.py --year 2025
    .venv/bin/python scripts/darkness/bake_darkness.py --epoch 2025

## Tests

    for t in geometry kernel raster calibrate emit sites; do
        .venv/bin/python scripts/darkness/${t}_test.py || exit 1
    done

The tests need numpy and scipy but not rasterio, and never touch the
network.

## Determinism

Given the same tiles and the same recorded parameters, a re-run produces
byte-identical artifacts. A clean `git diff assets/darkness/` confirms
nothing drifted.

## Data

NASA Black Marble VNP46A4 v002, CC0. Three 10-degree tiles cover all seven
routes: `h17v04` and `h17v05` for Iberia, `h31v05` for Shikoku and Kumano.
Roughly 90 MB each, gitignored.
