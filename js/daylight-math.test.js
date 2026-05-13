/* =============================================
   Daylight walk-budget math — test harness

   Run via:  node js/daylight-math.test.js

   Assertions cross-check walkingMinutes against hand-computed
   values derived from the Tobler-inspired velocity formula.
   Also covers the forward→reverse round-trip (AC #6).
   ============================================= */

'use strict';

var D = require('./daylight-math.js');
var Daylight = require('./daylight.js');

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

console.log('\n=== forward → reverse round-trip (AC #6) ===\n');

var caminoStage0 = {
  index:      0,
  nameEn:     'Saint-Jean-Pied-de-Port to Roncesvalles',
  startLat:   43.163,
  startLon:   -1.236,
  distanceKm: 24.2,
  elevGainM:  1419,
  ianaTz:     'Europe/Madrid'
};

// Use 09:00 Madrid wall-clock (= 07:00 UTC in CEST, after sunrise ~06:17 UTC).
// 07:00 Madrid would be 05:00 UTC — before sunrise, which gives a cushion > daylightSpan
// - walkMin and breaks the round-trip algebraic identity.
var fwdResult = Daylight.recompute({
  route:        'camino-frances',
  stage:        caminoStage0,
  date:         '2026-10-15',
  paceKey:      'standard',
  startTimeMin: 9 * 60,
  mode:         'forward'
});

if (fwdResult.error) {
  failed++;
  failures.push('round-trip forward leg error: ' + fwdResult.error);
  console.log('  ✗ forward leg failed: ' + fwdResult.error);
} else {
  var cushionAsBuffer = (fwdResult.sunsetUTC.getTime() - fwdResult.arrivalUTC.getTime()) / 60000;

  var revResult = Daylight.recompute({
    route:    'camino-frances',
    stage:    caminoStage0,
    date:     '2026-10-15',
    paceKey:  'standard',
    mode:     'reverse',
    bufferMin: cushionAsBuffer
  });

  if (revResult.error) {
    failed++;
    failures.push('round-trip reverse leg error: ' + revResult.error);
    console.log('  ✗ reverse leg failed: ' + revResult.error);
  } else {
    var diffMs = Math.abs(fwdResult.startUTC.getTime() - revResult.latestDepartUTC.getTime());
    // AC #6: round-trip must recover start within ±1 minute (60_000 ms).
    var tolerance = 60000;
    if (diffMs <= tolerance) {
      passed++;
      console.log('  ✓ round-trip within ±1 min  (diff ' + diffMs + ' ms)');
    } else {
      failed++;
      failures.push('round-trip diff ' + diffMs + ' ms exceeds 60 000 ms tolerance');
      console.log('  ✗ round-trip diff ' + diffMs + ' ms exceeds ' + tolerance + ' ms tolerance');
    }
  }
}

console.log('\n=== buildICS — forward mode fixture ===\n');

var fwdStart = new Date('2026-10-15T07:00:00Z');
var fwdEnd   = new Date('2026-10-15T12:58:00Z');
var fwdICS   = D.buildICS({
  routeName:       'Camino Francés',
  stageLabel:      'Saint-Jean-Pied-de-Port to Roncesvalles',
  startUTC:        fwdStart,
  endUTC:          fwdEnd,
  urlHref:         'https://pilgrimapp.org/daylight/camino-frances/?stage=0&date=2026-10-15',
  mode:            'forward',
  stageTz:         'Europe/Madrid',
  descriptionLine: 'Walk 24.2 km · Arrive ~12:58 · 5h 58m walking · 3h 10m cushion before sunset'
});

function contains(str, substr, label) {
  if (str.indexOf(substr) !== -1) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    failures.push(label + ': expected output to contain: ' + substr);
    console.log('  ✗ ' + label + '  (not found: ' + substr + ')');
  }
}

contains(fwdICS, 'BEGIN:VCALENDAR',   'forward: BEGIN:VCALENDAR present');
contains(fwdICS, 'END:VCALENDAR',     'forward: END:VCALENDAR present');
contains(fwdICS, 'BEGIN:VEVENT',      'forward: BEGIN:VEVENT present');
contains(fwdICS, 'END:VEVENT',        'forward: END:VEVENT present');
contains(fwdICS, 'DTSTART:20261015T070000Z', 'forward: DTSTART matches startUTC');
contains(fwdICS, 'DTEND:20261015T125800Z',   'forward: DTEND matches endUTC');
contains(fwdICS, 'SUMMARY:Walk: Camino Franc',  'forward: SUMMARY contains route name');
contains(fwdICS, 'DESCRIPTION:',      'forward: DESCRIPTION present');
contains(fwdICS, 'URL:https://pilgrimapp.org/daylight/camino-frances/', 'forward: URL present');
contains(fwdICS, 'CATEGORIES:Pilgrimage,Walking', 'forward: CATEGORIES present');
contains(fwdICS, 'BEGIN:VALARM',      'forward: BEGIN:VALARM present');
contains(fwdICS, 'END:VALARM',        'forward: END:VALARM present');
contains(fwdICS, 'TRIGGER:-P1D',      'forward: VALARM TRIGGER present');
contains(fwdICS, 'ACTION:DISPLAY',    'forward: VALARM ACTION present');
contains(fwdICS, 'PRODID:-//Pilgrim//Daylight Walk Budget//EN', 'forward: PRODID present');

console.log('\n=== buildICS — reverse mode fixture ===\n');

var revStart = new Date('2026-10-15T06:02:00Z');
var revEnd   = new Date('2026-10-15T12:00:00Z');
var revICS   = D.buildICS({
  routeName:       'Camino Francés',
  stageLabel:      'Saint-Jean-Pied-de-Port to Roncesvalles',
  startUTC:        revStart,
  endUTC:          revEnd,
  urlHref:         'https://pilgrimapp.org/daylight/camino-frances/?stage=0&date=2026-10-15&mode=reverse',
  mode:            'reverse',
  stageTz:         'Europe/Madrid',
  descriptionLine: 'Walk 24.2 km · Leave by 08:02 · 5h 58m walking · arrive 14:00 with 1h cushion'
});

contains(revICS, 'DTSTART:20261015T060200Z', 'reverse: DTSTART matches latestDepartUTC');
contains(revICS, 'DTEND:20261015T120000Z',   'reverse: DTEND matches walkEndUTC');

// Forward and reverse produce different DTSTART/DTEND
if (fwdICS !== revICS) {
  passed++;
  console.log('  ✓ forward and reverse ICS output are distinct');
} else {
  failed++;
  failures.push('forward and reverse ICS output are identical — should differ');
  console.log('  ✗ forward and reverse ICS output are identical');
}

console.log('\n=== buildICS — stageTz negative test (D9 guard) ===\n');

var baseOpts = {
  routeName:       'Test Route',
  stageLabel:      'Stage 1',
  startUTC:        new Date('2026-06-21T05:00:00Z'),
  endUTC:          new Date('2026-06-21T10:00:00Z'),
  urlHref:         'https://pilgrimapp.org/daylight/',
  mode:            'forward',
  descriptionLine: 'Test walk'
};

var icsTokyoTz  = D.buildICS(Object.assign({}, baseOpts, { stageTz: 'Asia/Tokyo'    }));
var icsMadridTz = D.buildICS(Object.assign({}, baseOpts, { stageTz: 'Europe/Madrid' }));

if (icsTokyoTz === icsMadridTz) {
  passed++;
  console.log('  ✓ stageTz unused: Asia/Tokyo and Europe/Madrid produce byte-identical output');
} else {
  failed++;
  failures.push('D9 regression: stageTz is affecting ICS output — it must be unused in buildICS');
  console.log('  ✗ stageTz is affecting output (D9 regression)');
}

console.log('\n=== buildICS — description escaping ===\n');

var escapedICS = D.buildICS({
  routeName:       'Route, One',
  stageLabel:      'Stage; Two',
  startUTC:        new Date('2026-03-20T08:00:00Z'),
  endUTC:          new Date('2026-03-20T14:00:00Z'),
  urlHref:         'https://pilgrimapp.org/daylight/',
  mode:            'forward',
  stageTz:         null,
  descriptionLine: 'Arrive at 14:00, rest; enjoy the view\nSecond line'
});

contains(escapedICS, '\\,',  'escaping: comma in descriptionLine → \\,');
contains(escapedICS, '\\;',  'escaping: semicolon in descriptionLine → \\;');
contains(escapedICS, '\\n',  'escaping: newline in descriptionLine → \\n (literal)');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
