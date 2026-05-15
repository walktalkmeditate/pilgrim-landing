/* =============================================
   Tide Math — test harness

   Run via:  node js/tide-math.test.js

   Tests harmonicTideHeightM against NOAA-published predictions
   for Honolulu, HI (station 1612340).

   Harmonic constants source:
     NOAA Tides and Currents harmonic constituents API
     https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/1612340/harcon.json
     Fetched 2026-05-14. Public domain (NOAA/NOS).
     Amplitudes in metres (metric units parameter).
     Phase: Phase_GMT column (Greenwich phase, degrees, referenced to
     1900-01-01T00:00:00Z per NOAA CO-OPS standard).

   Prediction reference values:
     NOAA Tides and Currents predictions API, station 1612340,
     datum=MSL, units=metric, time_zone=GMT.
     https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?
       station=1612340&begin_date=20260419&end_date=20260420&
       product=predictions&datum=MSL&time_zone=GMT&interval=hilo&
       units=metric&format=json
     Fetched 2026-05-14. Public domain (NOAA/NOS).

   Tolerance: ±0.3 m (harmonic synthesis approximates NOAA predictions;
   residuals reflect nodal factors and long-period constituents not
   included in the 10-constituent model).
   ============================================= */

'use strict';

var T = require('./tide-math.js');

var passed = 0;
var failed = 0;
var failures = [];

function approx(actual, expected, tolerance, label) {
  var diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log('  ✓ ' + label + '  (' + actual.toFixed(3) + ' vs ' + expected + ', Δ ' + diff.toFixed(3) + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + expected + ' ± ' + tolerance + ', got ' + actual.toFixed(3) + ' (Δ ' + diff.toFixed(3) + ')');
    console.log('  ✗ ' + label + '  (' + actual.toFixed(3) + ' vs ' + expected + ', Δ ' + diff.toFixed(3) + ')');
  }
}

// ---------------------------------------------------------------------------
// Honolulu harmonic constituents — NOAA station 1612340 (public domain)
// Source: https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/1612340/harcon.json
// Fetched: 2026-05-14. Values from 5-year vector averaging (2014–2018);
// SA from 17-year record (1998–2018). Amplitudes in metres, Phase in degrees GMT.
// ---------------------------------------------------------------------------
var HONOLULU = {
  M2:  { amp: 0.171, phase:  59.4, speed: T.SPEEDS.M2  },
  S2:  { amp: 0.056, phase:  54.7, speed: T.SPEEDS.S2  },
  N2:  { amp: 0.033, phase:  48.8, speed: T.SPEEDS.N2  },
  K1:  { amp: 0.149, phase: 226.8, speed: T.SPEEDS.K1  },
  O1:  { amp: 0.081, phase: 215.9, speed: T.SPEEDS.O1  },
  P1:  { amp: 0.045, phase: 224.9, speed: T.SPEEDS.P1  },
  Q1:  { amp: 0.014, phase: 209.6, speed: T.SPEEDS.Q1  },
  K2:  { amp: 0.016, phase:  45.7, speed: T.SPEEDS.K2  },
  M4:  { amp: 0.001, phase: 195.3, speed: T.SPEEDS.M4  },
  MS4: { amp: 0.001, phase: 104.0, speed: T.SPEEDS.MS4 }
};

// ---------------------------------------------------------------------------
// Exports: harmonicTideHeightM + SPEEDS constants
// ---------------------------------------------------------------------------

console.log('\n=== Module exports ===\n');

if (typeof T.harmonicTideHeightM === 'function') {
  passed++;
  console.log('  ✓ harmonicTideHeightM exported');
} else {
  failed++;
  failures.push('harmonicTideHeightM not exported');
  console.log('  ✗ harmonicTideHeightM not exported');
}

if (T.SPEEDS && typeof T.SPEEDS.M2 === 'number') {
  passed++;
  console.log('  ✓ SPEEDS object exported');
} else {
  failed++;
  failures.push('SPEEDS not exported');
  console.log('  ✗ SPEEDS not exported');
}

// Spot-check speed constants (Schureman 1958)
approx(T.SPEEDS.M2,  28.9841042, 1e-6, 'SPEEDS.M2 = 28.9841042 °/h');
approx(T.SPEEDS.K1,  15.0410686, 1e-6, 'SPEEDS.K1 = 15.0410686 °/h');
approx(T.SPEEDS.MS4, 58.9841042, 1e-6, 'SPEEDS.MS4 = 58.9841042 °/h');

// ---------------------------------------------------------------------------
// Honolulu prediction fixtures — NOAA station 1612340, April 2026
// Reference: NOAA Tides and Currents predictions API (datum=MSL, GMT, metric)
//   https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=1612340&
//   begin_date=20260419&end_date=20260420&product=predictions&datum=MSL&
//   time_zone=GMT&interval=hilo&units=metric&format=json
// Fetched 2026-05-14. Public domain.
//
// The 10-constituent harmonic model approximates (but does not exactly
// reproduce) NOAA's full predictions. Differences arise from:
//   - Nodal modulation factors (f, u) not applied here
//   - Constituents omitted from this 10-term model (SA, SSA, J1, etc.)
// Tolerance ±0.3 m is appropriate for this approximation level.
// ---------------------------------------------------------------------------

console.log('\n=== harmonicTideHeightM — Honolulu 2026-04-19/20, ±0.3 m ===\n');

// Fixture 1: 2026-04-19 03:18 UTC — high tide (NOAA 0.418 m)
approx(
  T.harmonicTideHeightM(Date.UTC(2026, 3, 19, 3, 18) / 1000, HONOLULU),
  0.418, 0.3,
  'Honolulu 2026-04-19 03:18 UTC high tide ≈ 0.418 m'
);

// Fixture 2: 2026-04-19 10:22 UTC — low tide (NOAA -0.222 m)
approx(
  T.harmonicTideHeightM(Date.UTC(2026, 3, 19, 10, 22) / 1000, HONOLULU),
  -0.222, 0.3,
  'Honolulu 2026-04-19 10:22 UTC low tide ≈ -0.222 m'
);

// Fixture 3: 2026-04-19 20:33 UTC — low tide (NOAA -0.358 m)
approx(
  T.harmonicTideHeightM(Date.UTC(2026, 3, 19, 20, 33) / 1000, HONOLULU),
  -0.358, 0.3,
  'Honolulu 2026-04-19 20:33 UTC low tide ≈ -0.358 m'
);

// Fixture 4: 2026-04-20 04:08 UTC — high tide (NOAA 0.420 m)
approx(
  T.harmonicTideHeightM(Date.UTC(2026, 3, 20, 4, 8) / 1000, HONOLULU),
  0.420, 0.3,
  'Honolulu 2026-04-20 04:08 UTC high tide ≈ 0.420 m'
);

// Fixture 5: 2026-04-20 21:10 UTC — low tide (NOAA -0.334 m)
approx(
  T.harmonicTideHeightM(Date.UTC(2026, 3, 20, 21, 10) / 1000, HONOLULU),
  -0.334, 0.3,
  'Honolulu 2026-04-20 21:10 UTC low tide ≈ -0.334 m'
);

// ---------------------------------------------------------------------------
// Sanity checks: high tides should exceed low tides
// ---------------------------------------------------------------------------

console.log('\n=== Ordering invariants ===\n');

var h_high1 = T.harmonicTideHeightM(Date.UTC(2026, 3, 19, 3, 18) / 1000, HONOLULU);
var h_low1  = T.harmonicTideHeightM(Date.UTC(2026, 3, 19, 10, 22) / 1000, HONOLULU);
var h_high2 = T.harmonicTideHeightM(Date.UTC(2026, 3, 20, 4, 8) / 1000, HONOLULU);
var h_low2  = T.harmonicTideHeightM(Date.UTC(2026, 3, 20, 21, 10) / 1000, HONOLULU);

if (h_high1 > h_low1) {
  passed++;
  console.log('  ✓ Apr 19 high tide > low tide');
} else {
  failed++;
  failures.push('Apr 19 ordering: high=' + h_high1.toFixed(3) + ' low=' + h_low1.toFixed(3));
  console.log('  ✗ Apr 19 high tide > low tide');
}

if (h_high2 > h_low2) {
  passed++;
  console.log('  ✓ Apr 20 high tide > low tide');
} else {
  failed++;
  failures.push('Apr 20 ordering: high=' + h_high2.toFixed(3) + ' low=' + h_low2.toFixed(3));
  console.log('  ✗ Apr 20 high tide > low tide');
}

// ===========================================================================
// Summary
// ===========================================================================

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
