/* =============================================
   Four Turnings — solstice + equinox UTC instants

   Implements Jean Meeus, Astronomical Algorithms (2nd ed.),
   Chapter 27. Returns UTC Date for the spring equinox, summer
   solstice, autumn equinox, and winter solstice of any given
   year (Northern Hemisphere convention).

   Accuracy: better than ~1 minute for years 1000–3000, a few
   minutes for years 826–1000. Range supported: ~year 826
   through ~year 3225 — twelve centuries on either side of 2026.
   ============================================= */

(function () {
  'use strict';

  // Mean times of solstices and equinoxes (Meeus, Tables 27.A, 27.B)
  // [JDE0, c1, c2, c3, c4] for years -1000 to 1000 with Y = year/1000,
  // and for years 1000 to 3000 with Y = (year - 2000) / 1000.
  var TABLE = {
    pre1000: [
      [1721139.29189, 365242.13740,  0.06134,  0.00111, -0.00071], // March equinox
      [1721233.25401, 365241.72562, -0.05323,  0.00907,  0.00025], // June solstice
      [1721325.70455, 365242.49558, -0.11677, -0.00297,  0.00074], // September equinox
      [1721414.39987, 365242.88257, -0.00769, -0.00933, -0.00006]  // December solstice
    ],
    post1000: [
      [2451623.80984, 365242.37404,  0.05169, -0.00411, -0.00057],
      [2451716.56767, 365241.62603,  0.00325,  0.00888, -0.00030],
      [2451810.21715, 365242.01767, -0.11575,  0.00337,  0.00078],
      [2451900.05952, 365242.74049, -0.06223, -0.00823,  0.00032]
    ]
  };

  // Periodic terms (Meeus, Table 27.C) — 24 corrections.
  // Each row: [A, B (degrees), C (degrees per Julian century)]
  var PERIODIC = [
    [485, 324.96,   1934.136],
    [203, 337.23,  32964.467],
    [199, 342.08,     20.186],
    [182,  27.85, 445267.112],
    [156,  73.14,  45036.886],
    [136, 171.52,  22518.443],
    [ 77, 222.54,  65928.934],
    [ 74, 296.72,   3034.906],
    [ 70, 243.58,   9037.513],
    [ 58, 119.81,  33718.147],
    [ 52, 297.17,    150.678],
    [ 50,  21.02,   2281.226],
    [ 45, 247.54,  29929.562],
    [ 44, 325.15,  31555.956],
    [ 29,  60.93,   4443.417],
    [ 18, 155.12,  67555.328],
    [ 17, 288.79,   4562.452],
    [ 16, 198.04,  62894.029],
    [ 14, 199.76,  31436.921],
    [ 12,  95.39,  14577.848],
    [ 12, 287.11,  31931.756],
    [ 12, 320.81,  34777.259],
    [  9, 227.73,   1222.114],
    [  8,  15.45,  16859.074]
  ];

  function deg2rad(d) { return d * Math.PI / 180; }

  function meanJDE(year, turning) {
    var coeffs, Y;
    if (year < 1000) {
      Y = year / 1000;
      coeffs = TABLE.pre1000[turning];
    } else {
      Y = (year - 2000) / 1000;
      coeffs = TABLE.post1000[turning];
    }
    var Y2 = Y * Y;
    return coeffs[0] + coeffs[1] * Y + coeffs[2] * Y2 + coeffs[3] * Y2 * Y + coeffs[4] * Y2 * Y2;
  }

  function periodicCorrection(JDE0) {
    var T = (JDE0 - 2451545.0) / 36525;
    var W = deg2rad(35999.373 * T - 2.47);
    var dLambda = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
    var S = 0;
    for (var i = 0; i < PERIODIC.length; i++) {
      var p = PERIODIC[i];
      S += p[0] * Math.cos(deg2rad(p[1] + p[2] * T));
    }
    return 0.00001 * S / dLambda;
  }

  // Convert Julian Ephemeris Day to UTC Date.
  // JDE is in Terrestrial Time. For 1900–2100, TT − UT ≈ 60–70 s,
  // which is irrelevant for day-level resolution. We treat JDE ≈ JD(UT).
  function jdeToDate(JDE) {
    return new Date((JDE - 2440587.5) * 86400000);
  }

  function getTurning(year, turning) {
    var JDE0 = meanJDE(year, turning);
    return jdeToDate(JDE0 + periodicCorrection(JDE0));
  }

  function getTurningsForYear(year) {
    return {
      springEquinox:   getTurning(year, 0),
      summerSolstice:  getTurning(year, 1),
      autumnEquinox:   getTurning(year, 2),
      winterSolstice:  getTurning(year, 3)
    };
  }

  // Returns the name of the turning that falls on `date` (in the visitor's
  // local timezone), or null if none. Compares calendar days, not exact
  // instants — a turning at 23:50 UTC counts as "today" for both UTC and
  // any timezone whose local day overlaps the UTC instant.
  function getTurningOnDate(date) {
    var year = date.getFullYear();
    // Check current year and adjacent — December solstice can fall on
    // Dec 21 of the same year or Dec 22 depending on year, and a January 1
    // visitor is closer to the previous year's December solstice.
    var candidates = [
      getTurningsForYear(year - 1),
      getTurningsForYear(year),
      getTurningsForYear(year + 1)
    ];
    var localDay = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
    var names = ['springEquinox', 'summerSolstice', 'autumnEquinox', 'winterSolstice'];
    for (var c = 0; c < candidates.length; c++) {
      for (var n = 0; n < names.length; n++) {
        var t = candidates[c][names[n]];
        var tLocal = t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
        if (tLocal === localDay) return names[n];
      }
    }
    return null;
  }

  window.Turnings = {
    getTurningsForYear: getTurningsForYear,
    getTurningOnDate: getTurningOnDate
  };
})();
