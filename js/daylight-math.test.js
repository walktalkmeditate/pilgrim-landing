/* =============================================
   Daylight walk-budget math — test harness

   Run via:  node js/daylight-math.test.js

   Assertions cross-check walkingMinutes against hand-computed
   values derived from the Tobler-inspired velocity formula.
   ============================================= */

'use strict';

var D = require('./daylight-math.js');

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

console.log('\n=== PACE_PRESETS ===\n');

// Verify the preset table has the three named speeds.
function equal(actual, expected, label) {
  if (actual === expected) {
    passed++;
    console.log('  ✓ ' + label + '  (' + actual + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + expected + ', got ' + actual);
    console.log('  ✗ ' + label + '  (' + actual + ' vs ' + expected + ')');
  }
}

equal(D.PACE_PRESETS.slow,     3, 'slow preset = 3 km/h');
equal(D.PACE_PRESETS.standard, 4, 'standard preset = 4 km/h');
equal(D.PACE_PRESETS.brisk,    5, 'brisk preset = 5 km/h');

console.log('\n=== walkingMinutes — flat routes ===\n');

// 10 km flat at standard (4 km/h): 60 × 10 / 4 = 150 min exactly.
approx(D.walkingMinutes({ distanceKm: 10, elevGainM: 0, pacePresetOrMinPerKm: 'standard' }), 150.0, 0.5, '10 km flat standard ≈ 150.0 min');

// 10 km flat at slow (3 km/h): 60 × 10 / 3 = 200 min.
approx(D.walkingMinutes({ distanceKm: 10, elevGainM: 0, pacePresetOrMinPerKm: 'slow' }),     200.0, 0.5, '10 km flat slow ≈ 200.0 min');

// 10 km flat at brisk (5 km/h): 60 × 10 / 5 = 120 min.
approx(D.walkingMinutes({ distanceKm: 10, elevGainM: 0, pacePresetOrMinPerKm: 'brisk' }),    120.0, 0.5, '10 km flat brisk ≈ 120.0 min');

// Numeric pace: 15 min/km = 4 km/h → same as standard.
approx(D.walkingMinutes({ distanceKm: 10, elevGainM: 0, pacePresetOrMinPerKm: 15 }),         150.0, 0.5, '10 km flat 15 min/km ≈ 150.0 min');

console.log('\n=== walkingMinutes — sloped route ===\n');

// 10 km, 500 m gain, standard pace.
// s = 500 / (10 × 1000) = 0.05
// v = 4 × exp(-3.5 × 0.05) = 4 × 0.83946 ≈ 3.3578 km/h
// t = 60 × 10 / 3.3578 ≈ 178.69 min
approx(D.walkingMinutes({ distanceKm: 10, elevGainM: 500, pacePresetOrMinPerKm: 'standard' }), 178.7, 0.5, '10 km +500 m standard ≈ 178.7 min');

// Zero elevation gain is same as flat.
approx(D.walkingMinutes({ distanceKm: 5, elevGainM: 0, pacePresetOrMinPerKm: 'standard' }), 75.0, 0.5, '5 km flat standard ≈ 75.0 min');

console.log('\n=== walkingMinutes — purity (three identical calls) ===\n');

// Pure function: three calls with identical arguments must return byte-equal results.
var a1 = D.walkingMinutes({ distanceKm: 10, elevGainM: 500, pacePresetOrMinPerKm: 'standard' });
var a2 = D.walkingMinutes({ distanceKm: 10, elevGainM: 500, pacePresetOrMinPerKm: 'standard' });
var a3 = D.walkingMinutes({ distanceKm: 10, elevGainM: 500, pacePresetOrMinPerKm: 'standard' });

if (a1 === a2 && a2 === a3) {
  passed++;
  console.log('  ✓ walkingMinutes is pure (3× identical args → identical result: ' + a1 + ')');
} else {
  failed++;
  failures.push('purity: results differ across calls: ' + a1 + ', ' + a2 + ', ' + a3);
  console.log('  ✗ walkingMinutes is not pure: ' + a1 + ', ' + a2 + ', ' + a3);
}

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
