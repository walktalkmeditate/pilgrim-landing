"""Ground-truth sky brightness readings.

Five sites set the calibration. Three are held out and decide the gate.
The split is fixed before any value is computed; moving a site between
lists after seeing results would turn the gate into a formality.

Every entry carries the source it came from. If you cannot cite it,
it does not belong here.

Two published sources, both in mag/arcsec², both zenith-looking:

**Galicia — Bará, S. (2016), R. Soc. open sci. 3: 160541, table 1.**
Fourteen SQM-LR photometers on MeteoGalicia weather stations, calendar
year 2015. The value taken is the paper's *significant magnitude* m1/3,
which it defines as "the average of the highest third of NSB values
recorded in conditions of astronomical darkness, with the Sun below −18°
altitude … and the Moon below −5° altitude", and which "provides a
reasonable indication of the brightness expected in clear and moonless
nights". That is the quantity a cloud-free VIIRS composite should
predict. Xares and Cabeza de Manzaneda are deliberately excluded: the
paper says their values are "biased towards larger values due to the
measurements made under thick cloud overcast conditions, and even under
snow deposited on the detector".

Table 1 publishes positions as UTM zone 29T on the ED-50 datum. The
lat/lon below are those eastings and northings transformed
EPSG:23029 → EPSG:4326 by PROJ (via rasterio.warp.transform), not
looked up from a map.

**Japan — Ministry of the Environment / 星空公団 星空観察 survey.**
Zenith sky background measured photometrically from a digital camera
frame against standard stars in the same image, reported as 等級
(mag/□"). Each site's value is the *median* of every reading the survey
has published at that exact point, so no single night's weather picks
the number; because every one of these points has an odd number of
published readings, that median is itself a published reading, quoted
here with its own date. `source_url` is the press release carrying the
結果一覧 attachment in which that specific row appears. Coordinates come
from the same survey's 環境GIS layer, which reproduces the value, date
and ばらつき of each row exactly:
https://gis.nies.go.jp/arcgis/rest/services/kankyogis/StarWatching_layer/FeatureServer/0

**Known limitation.** The two sources are not the same instrument. The
Galician readings are SQM-band and conditioned on clear moonless skies;
the Japanese readings are camera-band medians over all conditions the
survey accepted, so they likely run 0.1–0.4 mag brighter than a
clear-moonless statistic at the same place. That offset is not uniform
across the set, so it lands in the residuals rather than in the fitted
intercept. Section 4 of the audit records it.

`measured_date` is ISO 8601, at whatever precision the source supports:
a single observation date for Japan, the calendar year for the Galician
annual statistics.
"""

CALIBRATION_SITES = [
    {
        'name': 'Takamatsu, Tahikami-chō (Kagawa, Shikoku)',
        'lat': 34.2881,
        'lon': 134.0547,
        'mag_arcsec2': 17.55,
        'measured_date': '2026-01-14',
        'source_url': 'https://www.env.go.jp/press/press_03725.html',
    },
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
        'name': 'Shimanto Astronomical Observatory (Kōchi, Shikoku)',
        'lat': 33.1739,
        'lon': 132.7931,
        'mag_arcsec2': 21.07,
        'measured_date': '2026-01-14',
        'source_url': 'https://www.env.go.jp/press/press_03725.html',
    },
    {
        'name': 'O Cebreiro (mountain, Lugo, Galicia)',
        'lat': 42.70715,
        'lon': -7.04712,
        'mag_arcsec2': 21.6,
        'measured_date': '2015',
        'source_url': 'https://doi.org/10.1098/rsos.160541',
    },
]

VALIDATION_SITES = [
    {
        'name': 'Wakayama City, Nakanoshima (Wakayama, Kii)',
        'lat': 34.2453,
        'lon': 135.1833,
        'mag_arcsec2': 18.13,
        'measured_date': '2026-01-09',
        'source_url': 'https://www.env.go.jp/press/press_03725.html',
    },
    {
        'name': 'Misato Observatory, Kimino (Wakayama, Kii)',
        'lat': 34.1442,
        'lon': 135.4064,
        'mag_arcsec2': 20.58,
        'measured_date': '2022-08-31',
        'source_url': 'https://www.env.go.jp/press/press_00796.html',
    },
    {
        'name': 'Labrada (rural, Abadín, Lugo, Galicia)',
        'lat': 43.40550,
        'lon': -7.50210,
        'mag_arcsec2': 21.5,
        'measured_date': '2015',
        'source_url': 'https://doi.org/10.1098/rsos.160541',
    },
]
