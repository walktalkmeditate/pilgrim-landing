/* =============================================
   Daylight Walk Budget — performance test

   Verifies AC #3 thresholds on the core math path.
   Uses process.hrtime.bigint() for nanosecond precision.

   Run via:  node js/daylight-perf.test.js

   Thresholds:
     median ≤ 0.5 ms
     p99    ≤ 5.0 ms
   ============================================= */

'use strict';

var D = require('./daylight.js');

if (!D || typeof D.recompute !== 'function') {
  console.error('FAIL: daylight.js did not export a recompute function');
  process.exit(1);
}

var shikokuStage0 = {
  index:      0,
  nameEn:     'Ryōzen-ji to Shōzan-ji (Temples 1-12)',
  startLat:   34.16,
  startLon:   134.503,
  distanceKm: 53,
  elevGainM:  1200,
  ianaTz:     'Asia/Tokyo'
};

var fixedState = {
  route:       'shikoku-88',
  stage:       shikokuStage0,
  date:        '2026-10-15',
  paceKey:     'standard',
  startTimeMin: 7 * 60,
  mode:        'forward'
};

var ITERATIONS = 1000;
var times = [];

for (var i = 0; i < ITERATIONS; i++) {
  var t0 = process.hrtime.bigint();
  D.recompute(fixedState);
  var t1 = process.hrtime.bigint();
  times.push(Number(t1 - t0) / 1e6);
}

times.sort(function (a, b) { return a - b; });

var medianMs = times[Math.floor(ITERATIONS / 2)];
var p99Ms    = times[Math.floor(ITERATIONS * 0.99)];

console.log('\n=== Daylight recompute() performance ===\n');
console.log('  iterations : ' + ITERATIONS);
console.log('  median     : ' + medianMs.toFixed(3) + ' ms  (threshold ≤ 0.5 ms)');
console.log('  p99        : ' + p99Ms.toFixed(3)    + ' ms  (threshold ≤ 5.0 ms)');

var ok = true;

if (medianMs <= 0.5) {
  console.log('\n  ✓ median within threshold');
} else {
  console.log('\n  ✗ median EXCEEDS threshold (' + medianMs.toFixed(3) + ' > 0.5 ms)');
  ok = false;
}

if (p99Ms <= 5.0) {
  console.log('  ✓ p99 within threshold');
} else {
  console.log('  ✗ p99 EXCEEDS threshold (' + p99Ms.toFixed(3) + ' > 5.0 ms)');
  ok = false;
}

var sample = D.recompute(fixedState);
console.log('\n=== Sample output (shikoku-88 stage 0, 2026-10-15, 07:00) ===\n');
if (sample.error) {
  console.log('  ERROR: ' + sample.error);
  ok = false;
} else {
  console.log('  sunriseUTC : ' + sample.sunriseUTC.toISOString());
  console.log('  sunsetUTC  : ' + sample.sunsetUTC.toISOString());
  console.log('  startUTC   : ' + sample.startUTC.toISOString());
  console.log('  arrivalUTC : ' + sample.arrivalUTC.toISOString());
  console.log('  walkMin    : ' + sample.walkMin.toFixed(1) + ' min');
  console.log('  cushionMin : ' + sample.cushionMin.toFixed(1) + ' min');
}

console.log('');
if (ok) {
  console.log('all green\n');
} else {
  console.log('FAILED\n');
  process.exit(1);
}
