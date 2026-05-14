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

console.log('\n=== springNeapStateFromDays — D10 verbatim five states ===\n');

var VALID_STATES = [
  'Spring tides this week (new moon)',
  'Spring tides this week (full moon)',
  'Tide range trending toward neap',
  'Neap tides — sun and moon pull at right angles',
  'Tide range trending toward spring',
  'Spring tides approaching'
];

// 0–2 days since last syzygy → "Spring tides this week (<kind> moon)"
equal(MoonPath.springNeapStateFromDays(0,   'new'),  'Spring tides this week (new moon)',  'd=0 new  → spring (new)');
equal(MoonPath.springNeapStateFromDays(2,   'full'), 'Spring tides this week (full moon)', 'd=2 full → spring (full, boundary)');
equal(MoonPath.springNeapStateFromDays(1.5, 'new'),  'Spring tides this week (new moon)',  'd=1.5 → spring');

// 3–4 days → "Tide range trending toward neap"
equal(MoonPath.springNeapStateFromDays(3, 'new'), 'Tide range trending toward neap', 'd=3 → trending toward neap');
equal(MoonPath.springNeapStateFromDays(4, 'full'), 'Tide range trending toward neap', 'd=4 → trending toward neap (boundary)');

// 5–9 days → "Neap tides — sun and moon pull at right angles"
equal(MoonPath.springNeapStateFromDays(5, 'new'), 'Neap tides — sun and moon pull at right angles', 'd=5 → neap');
equal(MoonPath.springNeapStateFromDays(7, 'full'), 'Neap tides — sun and moon pull at right angles', 'd=7 → neap (mid)');
equal(MoonPath.springNeapStateFromDays(9, 'new'), 'Neap tides — sun and moon pull at right angles', 'd=9 → neap (boundary)');

// 10–11 days → "Tide range trending toward spring"
equal(MoonPath.springNeapStateFromDays(10, 'full'), 'Tide range trending toward spring', 'd=10 → trending toward spring');
equal(MoonPath.springNeapStateFromDays(11, 'new'),  'Tide range trending toward spring', 'd=11 → trending toward spring (boundary)');

// 12+ days → "Spring tides approaching"
equal(MoonPath.springNeapStateFromDays(12, 'full'),   'Spring tides approaching', 'd=12 → spring approaching');
equal(MoonPath.springNeapStateFromDays(14.5, 'new'),  'Spring tides approaching', 'd=14.5 → spring approaching (max range)');

// All returned values are in the valid set
var testCases = [
  [0, 'new'], [2, 'full'], [3, 'new'], [4, 'full'],
  [5, 'new'], [7, 'full'], [9, 'new'],
  [10, 'full'], [11, 'new'],
  [12, 'full'], [14, 'new']
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
   Slice 2 — scrubberValueToInstant boundary tests
   ========================================== */

console.log('\n=== scrubberValueToInstant — D24 boundary cases ===\n');

var NOW_MS = new Date('2026-05-14T12:00:00Z').getTime();
var SCRUB  = MoonPath.scrubberValueToInstant;
var UNSCRUB = MoonPath.instantToScrubberValue;

// i=0 returns exactly nowMs
equal(SCRUB(0, NOW_MS), NOW_MS, 'scrubberValueToInstant(0) === nowMs');

// i=1: daysFromNow = 1.0293^1 - 1 = 0.0293 days ≈ 42.192 min ≈ 2531520 ms
var i1 = SCRUB(1, NOW_MS) - NOW_MS;
ok(i1 > 0, 'i=1 produces positive offset');
var minDiff1 = i1 / 60000;
ok(minDiff1 >= 38 && minDiff1 <= 46, 'i=1 offset in [38, 46] min (got: ' + minDiff1.toFixed(2) + ')');

// i=-1: mirror of i=1
var iNeg1 = NOW_MS - SCRUB(-1, NOW_MS);
ok(iNeg1 > 0, 'i=-1 produces negative offset (time before nowMs)');
var minDiffNeg1 = iNeg1 / 60000;
ok(minDiffNeg1 >= 38 && minDiffNeg1 <= 46, 'i=-1 offset magnitude in [38, 46] min (got: ' + minDiffNeg1.toFixed(2) + ')');

// i=500: should reach ~5000-5300 yr forward (spec accepts 1.0293^500 overshoot)
var i500Ms = SCRUB(500, NOW_MS) - NOW_MS;
var i500Yr = i500Ms / (365.25 * 86400000);
ok(i500Yr >= 5000 && i500Yr <= 5300, 'i=500 reaches 5000-5300 yr forward (got: ' + i500Yr.toFixed(0) + ' yr)');

// i=-500: mirror
var iNeg500Ms = NOW_MS - SCRUB(-500, NOW_MS);
var iNeg500Yr = iNeg500Ms / (365.25 * 86400000);
ok(iNeg500Yr >= 5000 && iNeg500Yr <= 5300, 'i=-500 reaches 5000-5300 yr backward (got: ' + iNeg500Yr.toFixed(0) + ' yr)');

/* ==========================================
   Slice 2 — instantToScrubberValue round-trip
   ========================================== */

console.log('\n=== instantToScrubberValue — round-trip ±1 ===\n');

var ROUND_TRIP_CASES = [-500, -100, -10, 0, 10, 100, 500];
ROUND_TRIP_CASES.forEach(function (i) {
  var ms = SCRUB(i, NOW_MS);
  var back = UNSCRUB(ms, NOW_MS);
  ok(Math.abs(back - i) <= 1, 'round-trip i=' + i + ': back=' + back + ' (diff=' + Math.abs(back - i) + ')');
});

/* ==========================================
   Slice 2 — D30 tide window boundary fixture
   ========================================== */

console.log('\n=== recompute — D30 tide window boundary ===\n');

var TIDE_WINDOW = 30 * 86400000;
var baseMs = new Date('2026-05-14T12:00:00Z').getTime();
var baseNow = new Date(baseMs);

// exactly 30 days → curve (tideOutOfWindow: false, tideHeights24h populated)
var stateAt30 = {
  lat: String(honolulu.lat),
  lon: String(honolulu.lon),
  now: new Date(baseMs + TIDE_WINDOW),
  nowOriginal: baseNow,
  ports: PORTS
};
var rAt30 = MoonPath.recompute(stateAt30);
equal(rAt30.ready, true, 'D30: ready true at 30d boundary');
ok(!rAt30.tideOutOfWindow, 'D30: exactly 30 days → tideOutOfWindow: false (curve)');
ok(Array.isArray(rAt30.tideHeights24h), 'D30: exactly 30 days → tideHeights24h populated');

// 30 days + 1 ms → fallback (tideOutOfWindow: true, tideHeights24h null)
var stateAt30Plus1 = {
  lat: String(honolulu.lat),
  lon: String(honolulu.lon),
  now: new Date(baseMs + TIDE_WINDOW + 1),
  nowOriginal: baseNow,
  ports: PORTS
};
var rAt30Plus1 = MoonPath.recompute(stateAt30Plus1);
equal(rAt30Plus1.ready, true, 'D30: ready true at 30d+1ms');
ok(rAt30Plus1.tideOutOfWindow, 'D30: 30d+1ms → tideOutOfWindow: true (fallback)');
ok(rAt30Plus1.tideHeights24h === null, 'D30: 30d+1ms → tideHeights24h null');

// nowOriginal absent → defaults to state.now → always in-window (backward compat)
var stateNoOriginal = {
  lat: String(honolulu.lat),
  lon: String(honolulu.lon),
  now: new Date(baseMs + TIDE_WINDOW * 5),
  ports: PORTS
};
var rNoOriginal = MoonPath.recompute(stateNoOriginal);
ok(!rNoOriginal.tideOutOfWindow, 'D30 back-compat: absent nowOriginal → no out-of-window');
ok(Array.isArray(rNoOriginal.tideHeights24h), 'D30 back-compat: absent nowOriginal → curve populated');

/* ==========================================
   Slice 2 — state.nowOriginal in recompute output
   ========================================== */

console.log('\n=== recompute — nowOriginal contract ===\n');

var rWithOrig = MoonPath.recompute({
  lat: '35.68', lon: '139.65',
  now: new Date('2026-06-01T00:00:00Z'),
  nowOriginal: new Date('2026-05-14T12:00:00Z')
});
equal(rWithOrig.ready, true, 'nowOriginal: ready true');
ok(rWithOrig.nowOriginal instanceof Date, 'nowOriginal in output is a Date');
equal(rWithOrig.nowOriginal.getTime(), new Date('2026-05-14T12:00:00Z').getTime(),
  'nowOriginal preserved through recompute');

// When absent, nowOriginal equals now
var rNoOrig = MoonPath.recompute({
  lat: '35.68', lon: '139.65',
  now: new Date('2026-06-01T00:00:00Z')
});
equal(rNoOrig.ready, true, 'no nowOriginal: ready true');
equal(rNoOrig.nowOriginal.getTime(), rNoOrig.now.getTime(),
  'nowOriginal defaults to state.now when absent');

/* ==========================================
   Slice 2 — standstill reads scrubbed year from state.now
   ========================================== */

console.log('\n=== recompute — standstill reads scrubbed year ===\n');

// Scrub to year 4000: the standstill result for that year should be in the far future
var yearFarFuture = new Date('4000-06-15T00:00:00Z');
var rFarFuture = MoonPath.recompute({
  lat: '35.68', lon: '139.65',
  now: yearFarFuture
});
equal(rFarFuture.ready, true, 'far future scrub: ready true');
// The standstill annotation is rendered by renderStandstillAnnotation in the DOM shell.
// Here we just verify that state.now reflects the scrubbed year correctly.
var scrubYearFar = new Date(rFarFuture.now).getFullYear();
ok(scrubYearFar >= 3999 && scrubYearFar <= 4001, 'scrubbed year reads from state.now (got: ' + scrubYearFar + ')');

/* ==========================================
   Slice 2 — rAF-throttle stub test (AC #19)
   ========================================== */

console.log('\n=== rAF-throttle — stub fires 5x across 100 input events ===\n');

(function () {
  // Save original requestAnimationFrame (absent in Node)
  var origRAF = global.requestAnimationFrame;

  // Queue for captured rAF callbacks
  var rafQueue = [];
  var recomputeCount = 0;
  var lastInputValue = null;

  // Stub requestAnimationFrame: capture callback, don't auto-fire
  global.requestAnimationFrame = function (cb) {
    rafQueue.push(cb);
    return rafQueue.length;
  };

  // Fake scrubber element with event emitter behavior
  var listeners = {};
  var scrubberValue = 0;
  var fakeScrubber = {
    get value() { return String(scrubberValue); },
    set value(v) { scrubberValue = parseInt(v, 10); },
    getAttribute: function () { return null; },
    setAttribute: function () {},
    addEventListener: function (type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    }
  };

  // Fake state and render pipeline
  var fakeState = { nowOriginal: { getTime: function () { return NOW_MS; } } };
  var rafPending = false;

  // Replicate the rAF-throttle logic from moonpath.js setupScrubberListeners
  fakeScrubber.addEventListener('input', function () {
    if (rafPending) return;
    rafPending = true;
    global.requestAnimationFrame(function () {
      rafPending = false;
      var i = parseInt(fakeScrubber.value, 10);
      lastInputValue = i;
      recomputeCount++;
    });
  });

  function fireInput(value) {
    fakeScrubber.value = value;
    var evts = listeners['input'] || [];
    evts.forEach(function (fn) { fn(); });
  }

  function flushRAF() {
    var cb = rafQueue.shift();
    if (cb) cb();
  }

  // Fire 20 input events, then flush 1 rAF (should coalesce all 20 into 1 recompute)
  for (var i = 0; i < 20; i++) fireInput(i);
  flushRAF();
  ok(recomputeCount === 1, 'rAF batch 1: 20 input events → 1 recompute (got: ' + recomputeCount + ')');
  equal(lastInputValue, 19, 'rAF batch 1: last recompute used value 19');

  // Fire 20 more, flush 1 rAF
  for (var j = 20; j < 40; j++) fireInput(j);
  flushRAF();
  ok(recomputeCount === 2, 'rAF batch 2: 20 more input events → 2 total recomputes (got: ' + recomputeCount + ')');
  equal(lastInputValue, 39, 'rAF batch 2: last recompute used value 39');

  // Fire 20 more, flush 1 rAF
  for (var k = 40; k < 60; k++) fireInput(k);
  flushRAF();
  ok(recomputeCount === 3, 'rAF batch 3: cumulative 60 events → 3 recomputes (got: ' + recomputeCount + ')');
  equal(lastInputValue, 59, 'rAF batch 3: last value 59');

  // Fire 20 more, flush 1 rAF
  for (var l = 60; l < 80; l++) fireInput(l);
  flushRAF();
  ok(recomputeCount === 4, 'rAF batch 4: cumulative 80 events → 4 recomputes (got: ' + recomputeCount + ')');
  equal(lastInputValue, 79, 'rAF batch 4: last value 79');

  // Fire last 20, flush 1 rAF (total: 5 flushes, 100 input events)
  for (var m = 80; m < 100; m++) fireInput(m);
  flushRAF();
  ok(recomputeCount === 5, 'rAF: 5 total flushes across 100 input events → recomputeCount === 5 (got: ' + recomputeCount + ')');
  equal(lastInputValue, 99, 'rAF: last recompute used final input value 99');

  // Restore
  if (origRAF !== undefined) {
    global.requestAnimationFrame = origRAF;
  } else {
    delete global.requestAnimationFrame;
  }
})();

/* ==========================================
   Slice 3 — cardinalProseFor 8-bucket boundary tests
   ========================================== */

console.log('\n=== cardinalProseFor — 8-bucket boundary values ===\n');

var CPF = MoonPath.cardinalProseFor;

// Boundary at 22.5 lands in upper bucket (northeast), not due north
equal(CPF(22.5),  'northeast', 'bearing 22.5 → northeast (upper bucket)');
// Boundary at 67.5 lands in upper bucket (due east), not northeast
equal(CPF(67.5),  'due east',  'bearing 67.5 → due east (upper bucket)');
// Boundary at 112.5 lands in upper bucket (southeast), not due east
equal(CPF(112.5), 'southeast', 'bearing 112.5 → southeast (upper bucket)');
// Boundary at 157.5 lands in upper bucket (due south), not southeast
equal(CPF(157.5), 'due south', 'bearing 157.5 → due south (upper bucket)');
// Boundary at 202.5 lands in upper bucket (southwest), not due south
equal(CPF(202.5), 'southwest', 'bearing 202.5 → southwest (upper bucket)');
// Boundary at 247.5 lands in upper bucket (due west), not southwest
equal(CPF(247.5), 'due west',  'bearing 247.5 → due west (upper bucket)');
// Boundary at 292.5 lands in upper bucket (northwest), not due west
equal(CPF(292.5), 'northwest', 'bearing 292.5 → northwest (upper bucket)');
// Boundary at 337.5 lands in upper bucket (due north wrap), not northwest
equal(CPF(337.5), 'due north', 'bearing 337.5 → due north (wraps into upper)');

// Wrap test: 359.999 is in [337.5, 360) → due north
equal(CPF(359.999), 'due north', 'bearing 359.999 → due north (wraps)');

// Exactly 0 → due north
equal(CPF(0), 'due north', 'bearing 0 → due north');

// Mid-bucket samples for each non-wrap bucket
equal(CPF(45),  'northeast', 'bearing 45 (mid NE) → northeast');
equal(CPF(90),  'due east',  'bearing 90 (mid E)  → due east');
equal(CPF(135), 'southeast', 'bearing 135 (mid SE) → southeast');
equal(CPF(180), 'due south', 'bearing 180 (mid S) → due south');
equal(CPF(225), 'southwest', 'bearing 225 (mid SW) → southwest');
equal(CPF(270), 'due west',  'bearing 270 (mid W)  → due west');
equal(CPF(315), 'northwest', 'bearing 315 (mid NW) → northwest');

/* ==========================================
   Slice 3 — recompute outputs moonriseAzimuthDeg
   ========================================== */

console.log('\n=== recompute — moonriseAzimuthDeg field ===\n');

// Valid mid-latitude coord — returns a number in [0, 360) or null
var rAzimuth = MoonPath.recompute({
  lat: '21.307',
  lon: '-157.867',
  now: new Date('2026-05-14T12:00:00Z')
});
equal(rAzimuth.ready, true, 'azimuth recompute: ready true');
ok(
  rAzimuth.moonriseAzimuthDeg === null ||
  (typeof rAzimuth.moonriseAzimuthDeg === 'number' &&
   rAzimuth.moonriseAzimuthDeg >= 0 &&
   rAzimuth.moonriseAzimuthDeg < 360),
  'moonriseAzimuthDeg is null or a number in [0, 360) — got: ' + rAzimuth.moonriseAzimuthDeg
);

// High-latitude winter: Tromsø 69.6°N at winter solstice — circumpolar moon expected
// (moon may not set, or may not rise — circumpolar)
var rTromso = MoonPath.recompute({
  lat: '69.6',
  lon: '18.95',
  now: new Date('2026-12-21T12:00:00Z')
});
equal(rTromso.ready, true, 'Tromsø winter recompute: ready true');
ok(
  rTromso.moonriseAzimuthDeg === null ||
  (typeof rTromso.moonriseAzimuthDeg === 'number' &&
   rTromso.moonriseAzimuthDeg >= 0 &&
   rTromso.moonriseAzimuthDeg < 360),
  'Tromsø winter: moonriseAzimuthDeg is null (circumpolar) or valid number — got: ' + rTromso.moonriseAzimuthDeg
);

/* ==========================================
   Slice 4 — Eclipse pointer widget tests (D26, D27)
   ========================================== */

console.log('\n=== Slice 4 — eclipse pointer: recompute fields ===\n');

var ECLIPSE_RANGE = MoonPath.ECLIPSE_VALID_YR_RANGE; // 3000

// Fixture 1: scrub year 3001 yr ahead of nowOriginal → both eclipse fields null
var nowOrig2026 = new Date('2026-05-14T12:00:00Z');
var yr3001Ahead = new Date(Date.UTC(2026 + 3001, 4, 14, 12, 0, 0));
var rEclipseOutOfRange = MoonPath.recompute({
  lat: '21.307',
  lon: '-157.867',
  now: yr3001Ahead,
  nowOriginal: nowOrig2026
});
equal(rEclipseOutOfRange.ready, true, 'eclipse out-of-range: ready true');
isNull(rEclipseOutOfRange.nextSolarEclipse, 'scrubYear +3001: nextSolarEclipse === null');
isNull(rEclipseOutOfRange.nextLunarEclipse, 'scrubYear +3001: nextLunarEclipse === null');

// Fixture 2: scrub year exactly 3000 yr ahead → eclipse fields computed (not null)
var yr3000Ahead = new Date(Date.UTC(2026 + 3000, 4, 14, 12, 0, 0));
var rEclipseAtBoundary = MoonPath.recompute({
  lat: '21.307',
  lon: '-157.867',
  now: yr3000Ahead,
  nowOriginal: nowOrig2026
});
equal(rEclipseAtBoundary.ready, true, 'eclipse boundary +3000: ready true');
ok(rEclipseAtBoundary.nextSolarEclipse !== null, 'scrubYear +3000: nextSolarEclipse not null (boundary inclusive)');
ok(rEclipseAtBoundary.nextLunarEclipse !== null, 'scrubYear +3000: nextLunarEclipse not null (boundary inclusive)');

// Fixture 3: today coord → both eclipse fields are objects with expected shape
var rEclipseToday = MoonPath.recompute({
  lat: '21.307',
  lon: '-157.867',
  now: new Date('2026-05-14T12:00:00Z'),
  nowOriginal: nowOrig2026
});
equal(rEclipseToday.ready, true, 'eclipse today Honolulu: ready true');
ok(rEclipseToday.nextSolarEclipse !== null, 'today: nextSolarEclipse not null');
ok(rEclipseToday.nextLunarEclipse !== null, 'today: nextLunarEclipse not null');
ok(
  typeof rEclipseToday.nextSolarEclipse.magnitudePct === 'number' &&
  rEclipseToday.nextSolarEclipse.magnitudePct >= 0 &&
  rEclipseToday.nextSolarEclipse.magnitudePct <= 100,
  'today: nextSolarEclipse.magnitudePct is 0–100 number — got: ' + rEclipseToday.nextSolarEclipse.magnitudePct
);
ok(
  ['total', 'partial', 'penumbral'].indexOf(rEclipseToday.nextLunarEclipse.kind) !== -1,
  'today: nextLunarEclipse.kind ∈ {total,partial,penumbral} — got: ' + rEclipseToday.nextLunarEclipse.kind
);

// Boundary negative: scrub year 3001 yr BEFORE nowOriginal → both eclipse fields null
var yr3001Before = new Date(Date.UTC(2026 - 3001, 4, 14, 12, 0, 0));
var rEclipseNegOutOfRange = MoonPath.recompute({
  lat: '21.307',
  lon: '-157.867',
  now: yr3001Before,
  nowOriginal: nowOrig2026
});
isNull(rEclipseNegOutOfRange.nextSolarEclipse, 'scrubYear -3001: nextSolarEclipse === null');
isNull(rEclipseNegOutOfRange.nextLunarEclipse, 'scrubYear -3001: nextLunarEclipse === null');

// ECLIPSE_VALID_YR_RANGE is 3000 (constant gate)
equal(ECLIPSE_RANGE, 3000, 'ECLIPSE_VALID_YR_RANGE === 3000');

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
