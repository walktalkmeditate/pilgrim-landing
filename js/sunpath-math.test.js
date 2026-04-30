/* =============================================
   Sun Path math — test harness

   Run via:  node js/sunpath-math.test.js

   Assertions cross-check our formulas against authoritative
   values: NOAA solar position calculator, US Naval Observatory,
   Time and Date almanac data, archaeoastronomy literature.

   Tolerances chosen to match the "approximate but visualization-
   correct" accuracy claim in the spec (~0.5° latitude/longitude).
   ============================================= */

'use strict';

var M = require('./sunpath-math.js');

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

console.log('\n=== Subsolar point ===\n');

// Spring equinox 2026: sun should be near the equator.
// Per turnings.js validation: 2026-03-20 14:46 UTC.
var springEq = new Date(Date.UTC(2026, 2, 20, 14, 46));
var sub = M.subsolarPoint(springEq);
approx(sub.lat, 0, 0.5, 'spring equinox 2026 subsolar latitude near 0°');
// At 14:46 UTC + EoT(-7.4 min) ≈ solarTime 14.64. Subsolar lon = -15 * (14.64 - 12) = -39.6°.
approx(sub.lon, -39.6, 1.0, 'spring equinox 2026 subsolar longitude near -39.6°');

// Summer solstice 2026: 2026-06-21 08:24 UTC. Sun overhead near Tropic of Cancer (~23.4°N).
var summerSol = new Date(Date.UTC(2026, 5, 21, 8, 24));
var sub2 = M.subsolarPoint(summerSol);
approx(sub2.lat, 23.4, 0.5, 'summer solstice 2026 subsolar latitude near 23.4°N');
// At 08:24 UTC, overhead at 12 + (12-8.4)*15 = ... no: lon = -15 * (solarTime - 12).
// solarTime = 08.4 + EoT/60. EoT in late June ≈ -1.5 min ≈ -0.025h. solarTime ≈ 8.375.
// lon = -15 * (8.375 - 12) = -15 * -3.625 = +54.4° (east, near Caspian).
approx(sub2.lon, 54.4, 1.5, 'summer solstice 2026 subsolar longitude near 54°E');

console.log('\n=== Declination ===\n');

// Spring equinox: declination ~ 0. Spencer formula has phase drift relative
// to the leap-cycle, so ±0.5° is the realistic bound at exact equinox instants.
approx(M.declination(springEq), 0, 0.5, 'spring equinox declination ~ 0°');
// Summer solstice: declination ~ +23.45°
approx(M.declination(summerSol), 23.45, 0.5, 'summer solstice declination ~ +23.45°');
// Winter solstice 2026: 2026-12-21 20:51 UTC, declination ~ -23.45°
var winterSol = new Date(Date.UTC(2026, 11, 21, 20, 51));
approx(M.declination(winterSol), -23.45, 0.5, 'winter solstice declination ~ -23.45°');

console.log('\n=== Sunrise azimuth at known monuments ===\n');

// Stonehenge midsummer sunrise — published archaeoastronomy ~50° east of north today.
var stonehenge = { lat: 51.1789, lon: -1.8262 };
var az_st = M.sunriseAzimuth(stonehenge.lat, summerSol);
approx(az_st, 50, 1.5, 'Stonehenge midsummer sunrise azimuth today ~50°');

// Karnak winter solstice sunrise — temple's main axis aligns to the southeast.
// Published value ~118° (east of north).
var karnak = { lat: 25.7, lon: 32.6 };
var az_ka = M.sunriseAzimuth(karnak.lat, winterSol);
approx(az_ka, 118, 2, 'Karnak winter solstice sunrise azimuth ~118°');

console.log('\n=== Daylight hours ===\n');

// Reykjavík (64.13°N) summer solstice — between 21h and 22h.
var rey_summer = M.daylightHours(64.13, summerSol);
if (rey_summer >= 21 && rey_summer <= 22) {
  passed++;
  console.log('  ✓ Reykjavík summer solstice daylight  (' + rey_summer.toFixed(2) + 'h, expected 21-22h)');
} else {
  failed++;
  failures.push('Reykjavík summer solstice daylight: expected 21-22h, got ' + rey_summer.toFixed(2));
  console.log('  ✗ Reykjavík summer solstice daylight  (' + rey_summer.toFixed(2) + 'h)');
}

// Equator at any equinox: ~12h.
approx(M.daylightHours(0, springEq), 12, 0.2, 'equator spring equinox daylight ~12h');

// Tromsø (69.65°N) winter solstice — polar night, ~0h.
approx(M.daylightHours(69.65, winterSol), 0, 0.5, 'Tromsø winter solstice daylight ~0h');

console.log('\n=== Obliquity drift ===\n');

approx(M.obliquity(2000), 23.4393, 0.001, 'obliquity in 2000 ~ 23.4393°');
approx(M.obliquity(-2500), 23.93, 0.05, 'obliquity in 2500 BC ~ 23.93°');
approx(M.obliquity(0), 23.694, 0.05, 'obliquity in 0 AD ~ 23.694°');

console.log('\n=== Stonehenge midsummer through time ===\n');

var az_st_today = M.sunriseAzimuthForYear(51.18, 2026, 'summer-solstice');
var az_st_2500bc = M.sunriseAzimuthForYear(51.18, -2500, 'summer-solstice');
// Today ~50.0°, 2500 BC ~49.3° per archaeoastronomy literature.
approx(az_st_today, 50.0, 1.0, 'Stonehenge midsummer sunrise today ~50°');
approx(az_st_2500bc, 49.3, 1.0, 'Stonehenge midsummer sunrise 2500 BC ~49.3°');
// Shift should be ~0.7° over 4500 years.
var shift = az_st_today - az_st_2500bc;
approx(shift, 0.7, 0.5, 'Stonehenge midsummer azimuth shift over 4500 years ~0.7°');

console.log('\n=== Great circle ===\n');

// Greenwich Royal Observatory (51.48°N) to North Pole (90°N).
// Distance = (90 - 51.48)° × 111.32 km/° ≈ 4288 km.
var gc1 = M.greatCircleKm(51.4779, 0, 90, 0);
approx(gc1, 4288, 30, 'Greenwich → North Pole distance ~4288 km');
// Equator → North Pole: full quarter circumference = 10,007 km.
var gc1b = M.greatCircleKm(0, 0, 90, 0);
approx(gc1b, 10007, 30, 'Equator → North Pole distance ~10,007 km');

// London to New York: ~5570 km.
var gc2 = M.greatCircleKm(51.5074, -0.1278, 40.7128, -74.0060);
approx(gc2, 5570, 30, 'London → New York distance ~5570 km');

console.log('\n=== Analemma ===\n');

// At equator, analemma should be a near-vertical figure-8 (low altitude swing).
// At Tokyo (35.7°N), figure-8 is more pronounced.
var ana_tokyo = M.analemma(35.6762, 139.6503, 2026);
if (ana_tokyo.length === 365) {
  passed++;
  console.log('  ✓ analemma returns 365 points for Tokyo');
} else {
  failed++;
  failures.push('analemma length: expected 365, got ' + ana_tokyo.length);
  console.log('  ✗ analemma length wrong: ' + ana_tokyo.length);
}
// Max altitude on summer solstice (day ~172): should be 90° - 35.68° + 23.45° = 77.77°.
var summerDay = ana_tokyo[171]; // June 21 is day 172, index 171
approx(summerDay.altitude, 77.77, 1.5, 'Tokyo summer solstice noon altitude ~77.77°');
// Min altitude on winter solstice (day ~355): 90° - 35.68° - 23.45° = 30.87°.
var winterDay = ana_tokyo[354];
approx(winterDay.altitude, 30.87, 1.5, 'Tokyo winter solstice noon altitude ~30.87°');

console.log('\n=== Day of year ===\n');

approx(M.dayOfYear(new Date(Date.UTC(2026, 0, 1))), 1, 0, 'Jan 1 = day 1');
approx(M.dayOfYear(new Date(Date.UTC(2026, 11, 31))), 365, 0, 'Dec 31 = day 365 (non-leap)');
approx(M.dayOfYear(new Date(Date.UTC(2024, 11, 31))), 366, 0, 'Dec 31 leap year = day 366');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
