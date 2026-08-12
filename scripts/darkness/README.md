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

Needs Python 3.10–3.12 — tested working on 3.12.9. The pinned numpy 2.1.3
/ scipy 1.14.1 don't ship wheels for anything older than 3.10, and
**3.14 is known to fail**: scipy 1.14.1 has no prebuilt wheel for cp314,
so pip falls back to building it from source, which needs a Fortran
compiler (gfortran) most machines don't have and fails partway through
`pip install -r requirements.txt` with a wall of Meson/ninja build
errors. If `python3 -m venv .venv` picks up a 3.14 interpreter, point it
at a 3.10–3.12 one explicitly instead, e.g. `python3.12 -m venv .venv`.

Register free at <https://urs.earthdata.nasa.gov/>, generate a token, then:

    export EARTHDATA_TOKEN='eyJ0eXAi...'

`bake_darkness.py` and `fetch_tiles.py` both need a sibling
`../open-pilgrimages` checkout — the same convention `bake-daylight-routes`
and `bake-collective-routes` use at the repo root. `bake_darkness.py`
reads route waypoints from there and records the checkout's commit SHA
as `geometryCommit` in `meta.json`, so the artifact always names the
exact geometry it was baked from. `fetch_tiles.py` needs it too: it
derives its tile list from the same route and reference-site geometry
(`bake_darkness.tiles_needed()`) rather than a hand-maintained list, so
it cannot resolve what to fetch without the checkout either.

## Run

    .venv/bin/python scripts/darkness/fetch_tiles.py --year 2025
    .venv/bin/python scripts/darkness/bake_darkness.py --epoch 2025

## Tests

    for t in geometry kernel raster calibrate emit sites tiles bake_darkness; do
        .venv/bin/python scripts/darkness/${t}_test.py || exit 1
    done

The tests need numpy and scipy; `tiles_test.py` also needs rasterio,
since `tiles.py` imports it at module level even though the test itself
only checks grid arithmetic. None of the eight touch the network or
`../open-pilgrimages` — `bake_darkness_test.py` exercises the pure
functions extracted out of the orchestrator (alpha selection, the gate's
pass/fail and unit choice, bbox-to-pixel crop arithmetic) with synthetic
fixtures rather than running `main()`.

## Determinism

Given the same tiles and the same recorded parameters, a re-run produces
byte-identical artifacts. A clean `git diff assets/darkness/` confirms
nothing drifted.

## Data

NASA Black Marble VNP46A4 v002, CC0. Three 10-degree tiles cover all seven
routes: `h17v04` and `h17v05` for Iberia, `h31v05` for Shikoku and Kumano.
Roughly 90 MB each, gitignored.
