"""Ground-truth sky brightness readings.

REFERENCE_SITES is every site the calibration fit sees, and all five come
from one instrument: Bará, S. (2016), R. Soc. open sci. 3: 160541, table 1,
fourteen SQM-LR photometers on MeteoGalicia weather stations, calendar year
2015. The value taken is the paper's *significant magnitude* m1/3, defined
as "the average of the highest third of NSB values recorded in conditions
of astronomical darkness, with the Sun below −18° altitude … and the Moon
below −5° altitude" — a reasonable indication of the brightness expected in
clear and moonless nights, which is what a cloud-free VIIRS composite
should predict. Table 1 publishes positions as UTM zone 29T on the ED-50
datum; the lat/lon below are those eastings and northings transformed
EPSG:23029 → EPSG:4326 by PROJ (via rasterio.warp.transform), not looked up
from a map.

Single instrument, not two, is the point of this module's shape. An
earlier version of this calibration mixed these Galician SQM readings with
four Japanese Ministry of the Environment 星空観察 survey readings —
camera-band medians over whatever conditions the survey accepted, not
SQM readings conditioned on clear moonless skies. Fitting on Galicia alone
and applying that relation to the Japanese sites gave a mean offset of
+1.164 mag with a 1.559 spread: not a constant, so not a correction, but a
different scale entirely. (The smoking gun: Santiago has roughly twice
Takamatsu's radiance yet is published 1.5 mag darker than it — backwards,
if the two readings shared a scale.) The Japanese sites are kept below in
EXCLUDED_SITES as a record of what was tried and rejected. Nothing reads
them for fitting; only REFERENCE_SITES does.

Vigo was previously excluded only to keep a bright anchor ≤18.5 in the set,
a requirement that existed to balance against the Japanese sites' range.
With Japan out of the fit, that reason is gone, and Vigo now serves as
REFERENCE_SITES' own bright anchor instead.

Every entry carries the source it came from. If you cannot cite it, it
does not belong here.

`measured_date` is ISO 8601, at whatever precision the source supports:
the calendar year for the Galician annual statistic, a single observation
date for the excluded Japanese readings.

Why leave-one-out, not a held-out split: five same-instrument sites is too
few to spend a fixed slice of them on a single validation set the way the
previous eight-site design did — with that few points, whichever split is
picked before seeing results is still mostly luck. Leave-one-out instead
fits on four sites and predicts the fifth, five times over with each site
taking a turn as the one left out, so every site produces a genuine
out-of-sample residual and none of them ever validates a fit that was
allowed to see it first. bake_darkness.py implements the folds; this
module only supplies the five points and their single shared source.
"""

REFERENCE_SITES = [
    {
        'name': 'Santiago de Compostela (urban centre, Galicia)',
        'lat': 42.88663,
        'lon': -8.52122,
        'mag_arcsec2': 19.1,
        'measured_date': '2015',
        'source_url': 'https://doi.org/10.1098/rsos.160541',
    },
    {
        'name': 'Guísamo (periurban, A Coruña, Galicia)',
        'lat': 43.30945,
        'lon': -8.28001,
        'mag_arcsec2': 19.8,
        'measured_date': '2015',
        'source_url': 'https://doi.org/10.1098/rsos.160541',
    },
    {
        'name': 'O Cebreiro (mountain, Lugo, Galicia)',
        'lat': 42.70715,
        'lon': -7.04712,
        'mag_arcsec2': 21.6,
        'measured_date': '2015',
        'source_url': 'https://doi.org/10.1098/rsos.160541',
    },
    {
        'name': 'Labrada (rural, Abadín, Lugo, Galicia)',
        'lat': 43.40550,
        'lon': -7.50210,
        'mag_arcsec2': 21.5,
        'measured_date': '2015',
        'source_url': 'https://doi.org/10.1098/rsos.160541',
    },
    {
        'name': 'Vigo (Harbour, Pontevedra, Galicia)',
        'lat': 42.2417,
        'lon': -8.7277,
        'mag_arcsec2': 18.6,
        'measured_date': '2015',
        'source_url': 'https://doi.org/10.1098/rsos.160541',
    },
]

# Xares and Cabeza de Manzaneda (m1/3 = 22.3) remain excluded too, on the
# source paper's own warning: Bará (2016) table 1 says their values are
# "biased towards larger values due to the measurements made under thick
# cloud overcast conditions, and even under snow deposited on the
# detector". They were never part of this module's data — recorded here
# only so the omission reads as a decision, not an oversight.
EXCLUDED_SITES = [
    {
        'name': 'Takamatsu, Tahikami-chō (Kagawa, Shikoku)',
        'lat': 34.2881,
        'lon': 134.0547,
        'mag_arcsec2': 17.55,
        'measured_date': '2026-01-14',
        'source_url': 'https://www.env.go.jp/press/press_03725.html',
        'excluded_because': (
            'Japan MoE camera-band all-conditions medians are not on the same scale as '
            'Bara 2016 SQM m1/3 readings: applying the Galicia-fitted relation here gives '
            'a +1.164 mag mean offset with a 1.559 spread, so the difference is not a '
            'constant that could be subtracted. Kept as a record, not used for fitting.'
        ),
    },
    {
        'name': 'Shimanto Astronomical Observatory (Kōchi, Shikoku)',
        'lat': 33.1739,
        'lon': 132.7931,
        'mag_arcsec2': 21.07,
        'measured_date': '2026-01-14',
        'source_url': 'https://www.env.go.jp/press/press_03725.html',
        'excluded_because': (
            'Japan MoE camera-band all-conditions medians are not on the same scale as '
            'Bara 2016 SQM m1/3 readings: applying the Galicia-fitted relation here gives '
            'a +1.164 mag mean offset with a 1.559 spread, so the difference is not a '
            'constant that could be subtracted. Kept as a record, not used for fitting.'
        ),
    },
    {
        'name': 'Wakayama City, Nakanoshima (Wakayama, Kii)',
        'lat': 34.2453,
        'lon': 135.1833,
        'mag_arcsec2': 18.13,
        'measured_date': '2026-01-09',
        'source_url': 'https://www.env.go.jp/press/press_03725.html',
        'excluded_because': (
            'Japan MoE camera-band all-conditions medians are not on the same scale as '
            'Bara 2016 SQM m1/3 readings: applying the Galicia-fitted relation here gives '
            'a +1.164 mag mean offset with a 1.559 spread, so the difference is not a '
            'constant that could be subtracted. Kept as a record, not used for fitting.'
        ),
    },
    {
        'name': 'Misato Observatory, Kimino (Wakayama, Kii)',
        'lat': 34.1442,
        'lon': 135.4064,
        'mag_arcsec2': 20.58,
        'measured_date': '2022-08-31',
        'source_url': 'https://www.env.go.jp/press/press_00796.html',
        'excluded_because': (
            'Japan MoE camera-band all-conditions medians are not on the same scale as '
            'Bara 2016 SQM m1/3 readings: applying the Galicia-fitted relation here gives '
            'a +1.164 mag mean offset with a 1.559 spread, so the difference is not a '
            'constant that could be subtracted. Kept as a record, not used for fitting.'
        ),
    },
]
