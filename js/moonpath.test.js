/* =============================================
   Moon Path — test harness

   Run via:  node js/moonpath.test.js

   Covers:
     - parseParams()      — valid input, malformed input → defaults
     - nearestPortFor()   — stub returns null (real impl in slice 6)
     - recompute()        — early return when coords absent
   ============================================= */

'use strict';

var MoonPath = require('./moonpath.js');

var passed   = 0;
var failed   = 0;
var failures = [];

function equal(actual, expected, label) {
  if (actual === expected) {
    passed++;
    console.log('  ✓ ' + label + '  (' + actual + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    console.log('  ✗ ' + label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
  }
}

function isNull(actual, label) {
  equal(actual, null, label);
}

function ok(condition, label) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    failures.push(label + ': condition was false');
    console.log('  ✗ ' + label);
  }
}

/* ==========================================
   parseParams — valid inputs
   ========================================== */

console.log('\n=== parseParams — valid inputs ===\n');

var p1 = MoonPath.parseParams('?lat=35.6762&lon=139.6503&date=2026-05-14');
equal(p1.lat,  '35.6762',    'Tokyo lat parsed');
equal(p1.lon,  '139.6503',   'Tokyo lon parsed');
equal(p1.date, '2026-05-14', 'date parsed');

var p2 = MoonPath.parseParams('?lat=-33.8688&lon=151.2093');
equal(p2.lat,  '-33.8688', 'Sydney lat parsed (negative)');
equal(p2.lon,  '151.2093', 'Sydney lon parsed');
isNull(p2.date, 'date absent → null');

var p3 = MoonPath.parseParams('?lat=0&lon=0&date=2027-01-01');
equal(p3.lat,  '0',          'equator lat=0 parsed');
equal(p3.lon,  '0',          'meridian lon=0 parsed');
equal(p3.date, '2027-01-01', 'future date parsed');

/* ==========================================
   parseParams — boundary / edge values
   ========================================== */

console.log('\n=== parseParams — boundary values ===\n');

var p4 = MoonPath.parseParams('?lat=90&lon=180');
equal(p4.lat, '90',  'north pole lat=90 accepted');
equal(p4.lon, '180', 'lon=180 accepted');

var p5 = MoonPath.parseParams('?lat=-90&lon=-180');
equal(p5.lat, '-90',  'south pole lat=-90 accepted');
equal(p5.lon, '-180', 'lon=-180 accepted');

/* ==========================================
   parseParams — malformed / out-of-range → null
   ========================================== */

console.log('\n=== parseParams — malformed input → defaults ===\n');

var bad1 = MoonPath.parseParams('');
isNull(bad1.lat,  'empty string → lat null');
isNull(bad1.lon,  'empty string → lon null');
isNull(bad1.date, 'empty string → date null');

var bad2 = MoonPath.parseParams('?lat=abc&lon=xyz');
isNull(bad2.lat, 'non-numeric lat → null');
isNull(bad2.lon, 'non-numeric lon → null');

var bad3 = MoonPath.parseParams('?lat=91&lon=0');
isNull(bad3.lat, 'lat >90 → null');

var bad4 = MoonPath.parseParams('?lat=-91&lon=0');
isNull(bad4.lat, 'lat <-90 → null');

var bad5 = MoonPath.parseParams('?lat=0&lon=181');
isNull(bad5.lon, 'lon >180 → null');

var bad6 = MoonPath.parseParams('?lat=0&lon=-181');
isNull(bad6.lon, 'lon <-180 → null');

var bad7 = MoonPath.parseParams('?lat=35&lon=135&date=not-a-date');
isNull(bad7.date, 'malformed date string → null');

var bad8 = MoonPath.parseParams('?lat=35&lon=135&date=2026/05/14');
isNull(bad8.date, 'slash-separated date → null');

var bad9 = MoonPath.parseParams(null);
isNull(bad9.lat,  'null search string → lat null');
isNull(bad9.lon,  'null search string → lon null');
isNull(bad9.date, 'null search string → date null');

/* ==========================================
   parseParams — params present without values
   ========================================== */

console.log('\n=== parseParams — incomplete params ===\n');

var p6 = MoonPath.parseParams('?lat=35.68');
equal(p6.lat, '35.68', 'lat-only: lat set');
isNull(p6.lon, 'lat-only: lon still null');

/* ==========================================
   nearestPortFor — stub
   ========================================== */

console.log('\n=== nearestPortFor — stub until slice 6 ===\n');

isNull(MoonPath.nearestPortFor(35.68, 139.65),  'Tokyo coord → null (stub)');
isNull(MoonPath.nearestPortFor(-33.87, 151.21), 'Sydney coord → null (stub)');
isNull(MoonPath.nearestPortFor(0, 0),           'equator/meridian → null (stub)');

/* ==========================================
   recompute — no coords → not ready
   ========================================== */

console.log('\n=== recompute — empty state ===\n');

var r1 = MoonPath.recompute({ lat: null, lon: null });
equal(r1.ready, false, 'null coords → ready: false');

var r2 = MoonPath.recompute({ lat: null, lon: '139.65' });
equal(r2.ready, false, 'missing lat → ready: false');

var r3 = MoonPath.recompute({ lat: '35.68', lon: null });
equal(r3.ready, false, 'missing lon → ready: false');

var r4 = MoonPath.recompute(null);
equal(r4.ready, false, 'null state → ready: false');

/* ==========================================
   recompute — valid coords → ready
   ========================================== */

console.log('\n=== recompute — valid coords ===\n');

var r5 = MoonPath.recompute({
  lat: '35.6762',
  lon: '139.6503',
  now: new Date('2026-05-14T00:00:00Z')
});
equal(r5.ready, true, 'valid coords → ready: true');
ok(typeof r5.moonPhase === 'number', 'moonPhase is a number');
ok(r5.moonPhase >= 0 && r5.moonPhase < 1, 'moonPhase in [0, 1)');

/* ==========================================
   Summary
   ========================================== */

console.log('');
if (failures.length > 0) {
  console.log('failures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  console.log('');
}
console.log('passed: ' + passed);
console.log('failed: ' + failed);
console.log('');
console.log(failed === 0 ? 'all green' : 'SOME TESTS FAILED');

if (failed > 0) process.exit(1);
