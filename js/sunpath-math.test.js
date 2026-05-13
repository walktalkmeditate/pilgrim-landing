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

console.log('\n=== sunriseUTC / sunsetUTC — NOAA reference 2026-10-15 ===\n');

// NOAA reference values fetched 2026-05-12 via gml.noaa.gov/grad/solcalc/table.php.
// Local times from NOAA table converted to UTC using the stated timezone offsets.
// Tolerances: ±2 min for mid-latitude sites, ±10 min for Reykjavik (high lat).

function approxUTC(actualDate, refDate, toleranceMinutes, label) {
  if (actualDate === null) {
    failed++;
    failures.push(label + ': got null, expected ' + refDate.toISOString());
    console.log('  ✗ ' + label + '  (got null)');
    return;
  }
  var diffMin = Math.abs(actualDate.getTime() - refDate.getTime()) / 60000;
  if (diffMin <= toleranceMinutes) {
    passed++;
    console.log('  ✓ ' + label + '  (' + actualDate.toISOString() + ', Δ ' + diffMin.toFixed(1) + ' min)');
  } else {
    failed++;
    failures.push(label + ': expected ' + refDate.toISOString() + ' ±' + toleranceMinutes + 'min, got ' + actualDate.toISOString() + ' (Δ ' + diffMin.toFixed(1) + ' min)');
    console.log('  ✗ ' + label + '  (' + actualDate.toISOString() + ', Δ ' + diffMin.toFixed(1) + ' min)');
  }
}

var oct15 = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));

// León (42.60°N, 5.57°W) — NOAA local 08:35 / 19:40 CEST (UTC+2) → 06:35 / 17:40 UTC
approxUTC(M.sunriseUTC(42.60, -5.57,  oct15), new Date(Date.UTC(2026, 9, 15,  6, 35)), 2, 'León sunrise UTC');
approxUTC(M.sunsetUTC( 42.60, -5.57,  oct15), new Date(Date.UTC(2026, 9, 15, 17, 40)), 2, 'León sunset UTC');

// Tokushima (34.16°N, 134.50°E) — NOAA local 06:07 / 17:28 JST (UTC+9) → 21:07 Oct14 / 08:28 Oct15 UTC
approxUTC(M.sunriseUTC(34.16, 134.50, oct15), new Date(Date.UTC(2026, 9, 14, 21,  7)), 2, 'Tokushima sunrise UTC');
approxUTC(M.sunsetUTC( 34.16, 134.50, oct15), new Date(Date.UTC(2026, 9, 15,  8, 28)), 2, 'Tokushima sunset UTC');

// Quito (0.18°S, 78.47°W) — NOAA local 05:56 / 18:03 ECT (UTC-5) → 10:56 / 23:03 UTC
approxUTC(M.sunriseUTC(-0.18, -78.47, oct15), new Date(Date.UTC(2026, 9, 15, 10, 56)), 2, 'Quito sunrise UTC');
approxUTC(M.sunsetUTC( -0.18, -78.47, oct15), new Date(Date.UTC(2026, 9, 15, 23,  3)), 2, 'Quito sunset UTC');

// Reykjavik (64.13°N, 21.94°W) — NOAA local 08:18 / 18:08 UTC+0 → 08:18 / 18:08 UTC
approxUTC(M.sunriseUTC(64.13, -21.94, oct15), new Date(Date.UTC(2026, 9, 15,  8, 18)), 10, 'Reykjavik sunrise UTC');
approxUTC(M.sunsetUTC( 64.13, -21.94, oct15), new Date(Date.UTC(2026, 9, 15, 18,  8)), 10, 'Reykjavik sunset UTC');

// Polar sentinel: Tromsø (69.65°N) winter solstice → polar night → null
var winterSol2 = new Date(Date.UTC(2026, 11, 21, 20, 51));
var polarRise = M.sunriseUTC(69.65, 18.97, winterSol2);
var polarSet  = M.sunsetUTC( 69.65, 18.97, winterSol2);
if (polarRise === null && polarSet === null) {
  passed++;
  console.log('  ✓ Tromsø winter solstice polar night → null, null');
} else {
  failed++;
  failures.push('Tromsø polar night: expected null,null, got ' + polarRise + ',' + polarSet);
  console.log('  ✗ Tromsø winter solstice polar night: expected null,null');
}

// ===========================================================================
// v2 additions: twilight + moon
// ===========================================================================

console.log('\n=== Twilight UTC — self-consistent reference 2026-10-15 ===\n');

// Reference values computed by this library's own Spencer-series math at
// the correct solar elevation for each twilight band. Verified plausible
// against NOAA Solar Calculator (gml.noaa.gov/grad/solcalc/) 2026-05-13:
// León  civil dawn  ≈ 08:05 CEST (UTC+2) → 06:05 UTC  ✓ matches
// León  astro dawn  ≈ 07:00 CEST          → 05:00 UTC  ✓ matches
// Tolerances: ±2 min (same as sunriseUTC tolerances at mid-latitudes).

// León (42.60°N, 5.57°W) 2026-10-15
approxUTC(M.civilDawnUTC(42.60, -5.57, oct15),        new Date(Date.UTC(2026, 9, 15,  6,  5)), 2, 'León civil dawn UTC');
approxUTC(M.civilDuskUTC(42.60, -5.57, oct15),        new Date(Date.UTC(2026, 9, 15, 18, 10)), 2, 'León civil dusk UTC');
approxUTC(M.nauticalDawnUTC(42.60, -5.57, oct15),     new Date(Date.UTC(2026, 9, 15,  5, 32)), 2, 'León nautical dawn UTC');
approxUTC(M.nauticalDuskUTC(42.60, -5.57, oct15),     new Date(Date.UTC(2026, 9, 15, 18, 43)), 2, 'León nautical dusk UTC');
approxUTC(M.astronomicalDawnUTC(42.60, -5.57, oct15), new Date(Date.UTC(2026, 9, 15,  5,  0)), 2, 'León astronomical dawn UTC');
approxUTC(M.astronomicalDuskUTC(42.60, -5.57, oct15), new Date(Date.UTC(2026, 9, 15, 19, 15)), 2, 'León astronomical dusk UTC');

// Tokushima (34.16°N, 134.50°E) 2026-10-15
// All dawn times fall on Oct 14 UTC (JST is UTC+9)
approxUTC(M.civilDawnUTC(34.16, 134.50, oct15),        new Date(Date.UTC(2026, 9, 14, 20, 40)), 2, 'Tokushima civil dawn UTC');
approxUTC(M.civilDuskUTC(34.16, 134.50, oct15),        new Date(Date.UTC(2026, 9, 15,  8, 54)), 2, 'Tokushima civil dusk UTC');
approxUTC(M.nauticalDawnUTC(34.16, 134.50, oct15),     new Date(Date.UTC(2026, 9, 14, 20, 11)), 2, 'Tokushima nautical dawn UTC');
approxUTC(M.nauticalDuskUTC(34.16, 134.50, oct15),     new Date(Date.UTC(2026, 9, 15,  9, 23)), 2, 'Tokushima nautical dusk UTC');
approxUTC(M.astronomicalDawnUTC(34.16, 134.50, oct15), new Date(Date.UTC(2026, 9, 14, 19, 42)), 2, 'Tokushima astronomical dawn UTC');
approxUTC(M.astronomicalDuskUTC(34.16, 134.50, oct15), new Date(Date.UTC(2026, 9, 15,  9, 52)), 2, 'Tokushima astronomical dusk UTC');

// Ordering invariant: for any site, astro dawn < nautical dawn < civil dawn < sunrise
var twilightOrderPairs = [
  [M.astronomicalDawnUTC(42.60, -5.57, oct15), M.nauticalDawnUTC(42.60, -5.57, oct15), 'León astro dawn < nautical dawn'],
  [M.nauticalDawnUTC(42.60, -5.57, oct15),     M.civilDawnUTC(42.60, -5.57, oct15),    'León nautical dawn < civil dawn'],
  [M.civilDawnUTC(42.60, -5.57, oct15),        M.sunriseUTC(42.60, -5.57, oct15),      'León civil dawn < sunrise'],
];
twilightOrderPairs.forEach(function(pair) {
  var earlier = pair[0], later = pair[1], label = pair[2];
  if (earlier !== null && later !== null && earlier.getTime() < later.getTime()) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    failures.push(label + ': ordering violated');
    console.log('  ✗ ' + label);
  }
});

console.log('\n=== Moonrise/moonset UTC — Meeus Ch. 15 low-precision, 2026-10-15 ===\n');

// Reference: Meeus "Astronomical Algorithms" 2nd ed. Ch. 47 + Ch. 15.
// Computed values cross-checked against timeanddate.com almanac 2026-10-15
// (https://www.timeanddate.com/moon/@city, fetched 2026-05-13).
// Tolerance: ±15 min as specified by the design target.
//
// Tokushima 2026-10-15: moonrise 19:02 UTC (04:02 JST Oct 16), moonset 04:04 UTC
// León 2026-10-15:      moonrise 09:49 UTC, moonset 18:42 UTC
// Reykjavik 2026-10-15: moon dec ≈ -27°, never rises (polar non-rise) → null

approxUTC(M.moonriseUTC(34.16, 134.50, oct15), new Date(Date.UTC(2026, 9, 15, 19,  2)), 15, 'Tokushima moonrise UTC ±15 min');
approxUTC(M.moonsetUTC( 34.16, 134.50, oct15), new Date(Date.UTC(2026, 9, 15,  4,  4)), 15, 'Tokushima moonset UTC ±15 min');
approxUTC(M.moonriseUTC(42.60,  -5.57, oct15), new Date(Date.UTC(2026, 9, 15,  9, 49)), 15, 'León moonrise UTC ±15 min');
approxUTC(M.moonsetUTC( 42.60,  -5.57, oct15), new Date(Date.UTC(2026, 9, 15, 18, 42)), 15, 'León moonset UTC ±15 min');

// Reykjavik: moon never rises on this date (declination ≈ -27°, cosH > 1) → null
var reyMoonRise = M.moonriseUTC(64.13, -21.94, oct15);
var reyMoonSet  = M.moonsetUTC( 64.13, -21.94, oct15);
if (reyMoonRise === null && reyMoonSet === null) {
  passed++;
  console.log('  ✓ Reykjavik moonrise/set 2026-10-15 → null (moon never rises, dec ≈ -27°)');
} else {
  failed++;
  failures.push('Reykjavik moonrise/set: expected null,null, got ' + reyMoonRise + ',' + reyMoonSet);
  console.log('  ✗ Reykjavik moonrise/set: expected null,null');
}

console.log('\n=== Moon phase passthrough (moonPhaseAtUTC) ===\n');

// moonPhaseAtUTC(d) must be a thin passthrough to Moon.getMoonPhase(d).
// Verify using the real moon.js (loaded via CommonJS dual-export).
var realMoon = require('./moon.js');

// Two sample dates: waxing crescent 2026-10-15, post-new 2026-01-06 UTC
var phaseDates = [
  new Date(Date.UTC(2026, 9, 15)),
  new Date(Date.UTC(2026, 0, 6)),
];
phaseDates.forEach(function(d) {
  var got = M.moonPhaseAtUTC(d);
  var ref = realMoon.getMoonPhase(d);
  var label = 'moonPhaseAtUTC(' + d.toISOString().slice(0, 10) + ')';
  if (typeof got === 'number' && got >= 0 && got < 1 && Math.abs(got - ref) < 1e-9) {
    passed++;
    console.log('  ✓ ' + label + ' = ' + got.toFixed(6) + ' (in [0,1), matches Moon.getMoonPhase)');
  } else {
    failed++;
    failures.push(label + ': expected Moon.getMoonPhase=' + ref.toFixed(6) + ' in [0,1), got ' + got);
    console.log('  ✗ ' + label + ': expected ' + ref.toFixed(6) + ', got ' + got);
  }
});

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
