/* =============================================
   Moon Path — test harness

   Run via:  node js/moonpath.test.js

   Covers:
     - parseParams()               — valid input, malformed input → defaults
     - nearestPortFor()            — round-trip + D23 boundary
     - recompute()                 — early return when coords absent; slice 4 fields
     - luxBracketFor()             — boundary / property tests (D19 half-open)
     - apparentSizePercentString() — one-decimal rounding (D14 / D16)
     - earthshineVisibleFor()      — [0.03, 0.15] threshold (D7)
     - springNeapStateFromDays()   — D10 five-state table
     - recompute tide fields        — slice 6
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
   nearestPortFor — slice 6 real impl
   ========================================== */

console.log('\n=== nearestPortFor — round-trip + D23 boundary ===\n');

var PORTS = require('../assets/moonpath/tide-ports.json').ports;

// Round-trip: Honolulu's own coord returns Honolulu + distance ≈ 0
var honolulu = PORTS.find(function (p) { return p.id === 'honolulu'; });
var rtHonolulu = MoonPath.nearestPortFor(honolulu.lat, honolulu.lon, PORTS);
equal(rtHonolulu.port.id, 'honolulu', 'Honolulu own coord returns Honolulu');
ok(rtHonolulu.distanceKm < 1, 'Honolulu own coord distance < 1 km (got: ' + rtHonolulu.distanceKm.toFixed(4) + ')');

// Round-trip: Boston's own coord returns Boston
var boston = PORTS.find(function (p) { return p.id === 'boston'; });
var rtBoston = MoonPath.nearestPortFor(boston.lat, boston.lon, PORTS);
equal(rtBoston.port.id, 'boston', 'Boston own coord returns Boston');
ok(rtBoston.distanceKm < 1, 'Boston own coord distance < 1 km');

// null when no ports provided
isNull(MoonPath.nearestPortFor(35.68, 139.65, []),   'empty ports array → null');
isNull(MoonPath.nearestPortFor(35.68, 139.65, null), 'null ports → null');

// D23 boundary test — build a coord exactly 200 km from Honolulu
// Bearing north: 200 km north = 200/6371 rad ≈ 1.7957° north
var DEG_PER_KM_LAT = 1 / (Math.PI / 180 * 6371);  // ≈ 0.008993 deg/km
var lat200 = honolulu.lat + 200 * DEG_PER_KM_LAT;
var result200 = MoonPath.nearestPortFor(lat200, honolulu.lon, PORTS);
ok(result200 !== null, 'D23: 200 km coord returns a result');
ok(result200.port.id === 'honolulu', 'D23: 200 km from Honolulu nearest is Honolulu');
var d200 = result200.distanceKm;
// Haversine at near-exact 200 km should be ≤ 200 (visible) with a tiny tolerance
ok(d200 <= 200.1, 'D23: 200 km coord distance ≤ 200 (visible boundary): ' + d200.toFixed(4));

// Coord at 200.001 km (slightly beyond) → distance > 200 (hidden)
var lat200plus = honolulu.lat + 200.001 * DEG_PER_KM_LAT;
var result200plus = MoonPath.nearestPortFor(lat200plus, honolulu.lon, PORTS);
ok(result200plus !== null, 'D23: 200.001 km coord returns a result');
ok(result200plus.port.id === 'honolulu', 'D23: 200.001 km from Honolulu nearest is Honolulu');
var d200plus = result200plus.distanceKm;
ok(d200plus > 200, 'D23: 200.001 km coord distance > 200 (hidden): ' + d200plus.toFixed(4));

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
   recompute — slice 4 output fields
   ========================================== */

console.log('\n=== recompute — slice 4 fields ===\n');

var r6 = MoonPath.recompute({
  lat: '35.6762',
  lon: '139.6503',
  now: new Date('2026-05-14T06:00:00Z')
});
equal(r6.ready, true, 'slice 4: ready true with valid coords');
ok(typeof r6.moonK === 'number',             'moonK is a number');
ok(r6.moonK >= 0 && r6.moonK <= 1,          'moonK in [0, 1]');
ok(typeof r6.moonAltAz === 'object',         'moonAltAz is an object');
ok(typeof r6.moonAltAz.altitude === 'number','moonAltAz.altitude is a number');
ok(typeof r6.moonAltAz.azimuth === 'number', 'moonAltAz.azimuth is a number');
ok(typeof r6.isMoonBelowHorizon === 'boolean', 'isMoonBelowHorizon is boolean');
ok(typeof r6.moonDistanceKm === 'number',    'moonDistanceKm is a number');
ok(r6.moonDistanceKm > 300000 && r6.moonDistanceKm < 450000, 'moonDistanceKm in plausible range');
ok(typeof r6.moonApparentDiameterDeg === 'number', 'moonApparentDiameterDeg is a number');
ok(r6.moonApparentDiameterDeg > 0.4 && r6.moonApparentDiameterDeg < 0.6, 'moonApparentDiameterDeg ~0.5°');
ok(typeof r6.moonLuxAtCoord === 'number',    'moonLuxAtCoord is a number');
ok(r6.moonLuxAtCoord >= 0,                   'moonLuxAtCoord is non-negative');

// isMoonBelowHorizon consistent with altitude
ok(r6.isMoonBelowHorizon === (r6.moonAltAz.altitude <= 0), 'isMoonBelowHorizon matches altitude sign');

// moonK derivation sanity: at full moon (phase~0.5) k should be ~1.0.
// 2000-01-21 04:40 UTC is the known full moon (USNO J2000 reference).
var fullMoonDate = new Date('2000-01-21T04:40:00Z');
var r7 = MoonPath.recompute({ lat: '0', lon: '0', now: fullMoonDate });
ok(r7.moonK >= 0.9, 'moonK near 1.0 at full moon (2000-01-21): ' + r7.moonK.toFixed(3));

// moonK at new moon should be ~0.
// 2000-01-06 18:14 UTC is the known new moon (USNO J2000 reference).
var newMoonDate = new Date('2000-01-06T18:14:00Z');
var r8 = MoonPath.recompute({ lat: '0', lon: '0', now: newMoonDate });
ok(r8.moonK <= 0.1, 'moonK near 0 at new moon (2000-01-06): ' + r8.moonK.toFixed(3));

/* ==========================================
   luxBracketFor — D19 boundary / property tests
   ========================================== */

console.log('\n=== luxBracketFor — D19 half-open bracket boundaries ===\n');

// Bright bracket [0.2, ∞)
var bBright = MoonPath.luxBracketFor(0.2);
equal(bBright.label, 'bright', 'lux=0.2 → bright (boundary into upper bracket)');

var bBright2 = MoonPath.luxBracketFor(1.0);
equal(bBright2.label, 'bright', 'lux=1.0 → bright');

var bBright3 = MoonPath.luxBracketFor(0.25);
equal(bBright3.label, 'bright', 'lux=0.25 → bright');

// Mid bracket [0.05, 0.2)
var bMid = MoonPath.luxBracketFor(0.05);
equal(bMid.label, 'mid', 'lux=0.05 → mid (boundary into upper bracket)');

var bMid2 = MoonPath.luxBracketFor(0.1);
equal(bMid2.label, 'mid', 'lux=0.1 → mid');

var bJustBelow02 = MoonPath.luxBracketFor(0.1999);
equal(bJustBelow02.label, 'mid', 'lux=0.1999 → mid (just below 0.2)');

// Dim bracket [0.005, 0.05)
var bDim = MoonPath.luxBracketFor(0.005);
equal(bDim.label, 'dim', 'lux=0.005 → dim (boundary into upper bracket)');

var bDim2 = MoonPath.luxBracketFor(0.01);
equal(bDim2.label, 'dim', 'lux=0.01 → dim');

var bJustBelow005 = MoonPath.luxBracketFor(0.0049);
equal(bJustBelow005.label, 'faint', 'lux=0.0049 → faint (just below 0.005)');

// Faint bracket [0, 0.005)
var bFaint = MoonPath.luxBracketFor(0.001);
equal(bFaint.label, 'faint', 'lux=0.001 → faint');

var bFaint2 = MoonPath.luxBracketFor(0);
equal(bFaint2.label, 'faint', 'lux=0 → faint');

// Prose strings are non-empty for all brackets
ok(bBright.prose.length > 0, 'bright prose non-empty');
ok(bMid.prose.length > 0,    'mid prose non-empty');
ok(bDim.prose.length > 0,    'dim prose non-empty');
ok(bFaint.prose.length > 0,  'faint prose non-empty');

/* ==========================================
   apparentSizePercentString — D14 one decimal
   ========================================== */

console.log('\n=== apparentSizePercentString — D14 rounding ===\n');

// Mean distance → exactly 0.0% larger (but rounding may give 0.0)
var atMean = MoonPath.apparentSizePercentString(384400);
ok(atMean.indexOf('0.0%') !== -1, 'mean distance → "0.0%" (got: ' + atMean + ')');

// Perigee ≈ 356500 km → ~7.8% larger
var atPerigee = MoonPath.apparentSizePercentString(356500);
ok(atPerigee.indexOf('larger') !== -1, 'perigee → larger (got: ' + atPerigee + ')');
var pctPerigee = parseFloat(atPerigee);
ok(pctPerigee >= 7.0 && pctPerigee <= 9.0, 'perigee pct in [7, 9]: ' + pctPerigee);

// Apogee ≈ 406700 km → ~5.6% smaller
var atApogee = MoonPath.apparentSizePercentString(406700);
ok(atApogee.indexOf('smaller') !== -1, 'apogee → smaller (got: ' + atApogee + ')');
var pctApogee = parseFloat(atApogee);
ok(pctApogee >= 4.0 && pctApogee <= 7.0, 'apogee pct in [4, 7]: ' + pctApogee);

// One-decimal format: must match X.X pattern
ok(/\d+\.\d%/.test(atPerigee),   'perigee result has one-decimal format');
ok(/\d+\.\d%/.test(atApogee),    'apogee result has one-decimal format');

// Specific fixture: 370000 km → (384400/370000 - 1)*100 ≈ 3.891% → rounds to 3.9%
var at370 = MoonPath.apparentSizePercentString(370000);
ok(at370.indexOf('3.9%') !== -1, '370000 km → "3.9% larger" (got: ' + at370 + ')');

/* ==========================================
   earthshineVisibleFor — D7 [0.03, 0.15]
   ========================================== */

console.log('\n=== earthshineVisibleFor — D7 threshold [0.03, 0.15] ===\n');

// Inside the range — visible
ok(MoonPath.earthshineVisibleFor(0.03),  'k=0.03 → visible (lower boundary)');
ok(MoonPath.earthshineVisibleFor(0.09),  'k=0.09 → visible (midpoint)');
ok(MoonPath.earthshineVisibleFor(0.15),  'k=0.15 → visible (upper boundary)');
ok(MoonPath.earthshineVisibleFor(0.10),  'k=0.10 → visible');

// Outside the range — not visible
ok(!MoonPath.earthshineVisibleFor(0.02),  'k=0.02 → not visible (below lower)');
ok(!MoonPath.earthshineVisibleFor(0.00),  'k=0.00 → not visible (new moon)');
ok(!MoonPath.earthshineVisibleFor(0.16),  'k=0.16 → not visible (above upper)');
ok(!MoonPath.earthshineVisibleFor(0.50),  'k=0.50 → not visible (quarter)');
ok(!MoonPath.earthshineVisibleFor(1.00),  'k=1.00 → not visible (full moon)');

// Just inside the boundary on both sides
ok(MoonPath.earthshineVisibleFor(0.031),  'k=0.031 → visible (just above lower)');
ok(MoonPath.earthshineVisibleFor(0.149),  'k=0.149 → visible (just below upper)');
ok(!MoonPath.earthshineVisibleFor(0.0299),'k=0.0299 → not visible (just below lower)');
ok(!MoonPath.earthshineVisibleFor(0.1501),'k=0.1501 → not visible (just above upper)');

/* ==========================================
   Slice 5 — activeCalloutsFor + ARCHAEO_CALLOUTS
   ========================================== */

console.log('\n=== activeCalloutsFor — ±50 yr filter ===\n');

// Slider at exactly Callanish pinned year: -1800
var cCallouts = MoonPath.activeCalloutsFor(-1800);
ok(cCallouts.length === 1, 'at -1800 exactly one callout fires (Callanish)');
equal(cCallouts[0].site, 'Callanish', 'callout is Callanish');

// Slider within ±50 of Callanish: -1820
var cNear = MoonPath.activeCalloutsFor(-1820);
ok(cNear.length === 1, 'at -1820 (within 50 of -1800) Callanish fires');
equal(cNear[0].site, 'Callanish', 'callout is Callanish at -1820');

// Slider just outside ±50 of Callanish: -1851
var cFar = MoonPath.activeCalloutsFor(-1851);
ok(cFar.length === 0, 'at -1851 (>50 from -1800) no callout fires');

// Slider at Newgrange pinned year: -3200
var nCallouts = MoonPath.activeCalloutsFor(-3200);
ok(nCallouts.length === 1, 'at -3200 exactly one callout fires (Newgrange)');
equal(nCallouts[0].site, 'Newgrange', 'callout is Newgrange');

// Slider at +50 of Newgrange: -3150
var nNear = MoonPath.activeCalloutsFor(-3150);
ok(nNear.length === 1, 'at -3150 (at edge, ±50 of -3200) Newgrange fires');

// Slider just outside ±50 of Newgrange: -3251
var nFar = MoonPath.activeCalloutsFor(-3251);
ok(nFar.length === 0, 'at -3251 (>50 from -3200) no callout fires');

// Slider at Chimney Rock pinned year: +1100
var crCallouts = MoonPath.activeCalloutsFor(1100);
ok(crCallouts.length === 1, 'at 1100 exactly one callout fires (Chimney Rock)');
equal(crCallouts[0].site, 'Chimney Rock', 'callout is Chimney Rock');

// Slider at present year (0 CE approximately) — no callout fires
var zeroCallouts = MoonPath.activeCalloutsFor(0);
ok(zeroCallouts.length === 0, 'at year 0 no callouts fire');

// Slider at current year 2026 — no callout fires
var modernCallouts = MoonPath.activeCalloutsFor(2026);
ok(modernCallouts.length === 0, 'at year 2026 no callouts fire');

// Prose text for each callout is non-empty
ok(MoonPath.ARCHAEO_CALLOUTS[0].prose.length > 0, 'Callanish prose non-empty');
ok(MoonPath.ARCHAEO_CALLOUTS[1].prose.length > 0, 'Newgrange prose non-empty');
ok(MoonPath.ARCHAEO_CALLOUTS[2].prose.length > 0, 'Chimney Rock prose non-empty');

// Slider range covers all archaeo callout years
ok(MoonPath.STANDSTILL_SLIDER_MIN <= -3200, 'slider min reaches Newgrange (-3200)');
ok(MoonPath.STANDSTILL_SLIDER_MAX >= 1100,  'slider max reaches Chimney Rock (1100)');
ok(MoonPath.STANDSTILL_SLIDER_MIN <= -1800, 'slider min reaches Callanish (-1800)');

/* ==========================================
   Slice 6 — springNeapStateFromDays D10 five-state table
   ========================================== */

console.log('\n=== springNeapStateFromDays — D10 five states ===\n');

var VALID_STATES = ['spring', 'approaching spring', 'neap', 'approaching neap', 'mid'];

// spring: within ±2 days of syzygy → daysFromSyzygy ≤ 2
equal(MoonPath.springNeapStateFromDays(0, 7),   'spring', 'daysFromSyzygy=0 → spring');
equal(MoonPath.springNeapStateFromDays(2, 7),   'spring', 'daysFromSyzygy=2 → spring (boundary)');
equal(MoonPath.springNeapStateFromDays(1.5, 7), 'spring', 'daysFromSyzygy=1.5 → spring');

// approaching spring: 3–4 days before next syzygy
equal(MoonPath.springNeapStateFromDays(3, 7),   'approaching spring', 'daysFromSyzygy=3 → approaching spring');
equal(MoonPath.springNeapStateFromDays(4, 7),   'approaching spring', 'daysFromSyzygy=4 → approaching spring (boundary)');

// neap: within ±2 days of quarter
equal(MoonPath.springNeapStateFromDays(5, 0),   'neap', 'daysFromQuarter=0 → neap');
equal(MoonPath.springNeapStateFromDays(5, 2),   'neap', 'daysFromQuarter=2 → neap (boundary)');

// approaching neap: 3–4 days before next quarter
equal(MoonPath.springNeapStateFromDays(5, 3),   'approaching neap', 'daysFromQuarter=3 → approaching neap');
equal(MoonPath.springNeapStateFromDays(5, 4),   'approaching neap', 'daysFromQuarter=4 → approaching neap (boundary)');

// mid: everything else
equal(MoonPath.springNeapStateFromDays(5, 5),   'mid', 'daysFromSyzygy=5 daysFromQuarter=5 → mid');
equal(MoonPath.springNeapStateFromDays(6, 6),   'mid', 'daysFromSyzygy=6 daysFromQuarter=6 → mid');

// All returned values are in the valid set
var testCases = [
  [0, 7], [2, 7], [3, 7], [4, 7],
  [5, 0], [5, 2], [5, 3], [5, 4], [5, 5]
];
testCases.forEach(function (tc) {
  var result = MoonPath.springNeapStateFromDays(tc[0], tc[1]);
  ok(VALID_STATES.indexOf(result) !== -1, 'springNeapStateFromDays(' + tc[0] + ',' + tc[1] + ') is a valid state: ' + result);
});

/* ==========================================
   Slice 6 — recompute tide fields
   ========================================== */

console.log('\n=== recompute — tide fields (slice 6) ===\n');

var tideState = {
  lat: String(honolulu.lat),
  lon: String(honolulu.lon),
  now: new Date('2026-05-14T12:00:00Z'),
  ports: PORTS
};

var rTide = MoonPath.recompute(tideState);
equal(rTide.ready, true, 'tide recompute: ready true');
ok(rTide.nearestPort !== null, 'nearestPort is not null');
equal(rTide.nearestPort.id, 'honolulu', 'nearestPort is Honolulu (own coord)');
ok(rTide.nearestPortDistanceKm < 1, 'nearestPortDistanceKm < 1 at own coord');
ok(Array.isArray(rTide.tideHeights24h), 'tideHeights24h is an array');
ok(rTide.tideHeights24h.length === 97, 'tideHeights24h has 97 samples (-48 to +48 at 30 min)');
ok(typeof rTide.tideHeights24h[0].heightM === 'number', 'first sample heightM is a number');
ok(VALID_STATES.indexOf(rTide.springNeapState) !== -1, 'springNeapState is valid: ' + rTide.springNeapState);
ok(typeof rTide.kingTideUpcoming === 'boolean', 'kingTideUpcoming is boolean');

// Hidden case: coord >200 km from all ports (mid-Pacific, no port nearby)
// 0°N, 160°W is far from all 4 baked ports
var midPacificState = {
  lat: '0',
  lon: '-160',
  now: new Date('2026-05-14T12:00:00Z'),
  ports: PORTS
};
var rMidPacific = MoonPath.recompute(midPacificState);
equal(rMidPacific.ready, true, 'mid-Pacific: ready true');
ok(rMidPacific.nearestPortDistanceKm > 200, 'mid-Pacific: nearestPortDistanceKm > 200');
ok(rMidPacific.tideHeights24h === null, 'mid-Pacific: tideHeights24h is null (hidden)');
ok(rMidPacific.springNeapState === null, 'mid-Pacific: springNeapState is null (hidden)');

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
