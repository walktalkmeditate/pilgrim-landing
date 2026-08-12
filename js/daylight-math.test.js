/* =============================================
   Daylight walk-budget math — test harness

   Run via:  node js/daylight-math.test.js

   Assertions cross-check walkingMinutes against hand-computed
   values derived from the Tobler-inspired velocity formula.
   Also covers the forward→reverse round-trip (AC #6).
   ============================================= */

'use strict';

var fs   = require('fs');
var path = require('path');
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

// Shallow value comparison for arrays of primitives (band-count / boundary
// fixtures) — === only checks reference identity, so equal() can't do this.
function arrEqual(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log('  ✓ ' + label + '  (' + JSON.stringify(actual) + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    console.log('  ✗ ' + label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
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
contains(fwdICS, 'PRODID:-//Pilgrim//The Light Budget//EN', 'forward: PRODID present');

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

console.log('\n=== barDomainUTC — normal case (Burgos, 2026-09-15) ===\n');

var burgosState = {
  route:          'custom',
  customLat:      '42.34',
  customLon:      '-3.70',
  customDistance: '20',
  customElevGain: '0',
  date:           '2026-09-15',
  paceKey:        'standard',
  startTimeMin:   9 * 60,
  mode:           'forward'
};
var burgosOut    = Daylight.recompute(burgosState);
var burgosDomain = D.barDomainUTC(burgosOut);

ok(burgosDomain !== null, 'Burgos: barDomainUTC is not null');
equal(burgosDomain.startUTC.getTime(), burgosOut.astronomicalDawn.getTime() - 60 * 60000,
  'Burgos: domain start = astronomicalDawn − 60 min');
equal(burgosDomain.endUTC.getTime(), burgosOut.astronomicalDusk.getTime() + 60 * 60000,
  'Burgos: domain end = astronomicalDusk + 60 min');
ok(
  burgosDomain.startUTC.getTime()          <  burgosOut.astronomicalDawn.getTime() &&
  burgosOut.astronomicalDawn.getTime()     <  burgosOut.nauticalDawn.getTime()     &&
  burgosOut.nauticalDawn.getTime()         <  burgosOut.civilDawn.getTime()        &&
  burgosOut.civilDawn.getTime()            <  burgosOut.sunriseUTC.getTime()       &&
  burgosOut.sunriseUTC.getTime()           <  burgosOut.sunsetUTC.getTime()        &&
  burgosOut.sunsetUTC.getTime()            <  burgosOut.civilDusk.getTime()        &&
  burgosOut.civilDusk.getTime()            <  burgosOut.nauticalDusk.getTime()     &&
  burgosOut.nauticalDusk.getTime()         <  burgosOut.astronomicalDusk.getTime() &&
  burgosOut.astronomicalDusk.getTime()     <  burgosDomain.endUTC.getTime(),
  'Burgos: domain start < astro < nautical < civil < sunrise < sunset < civil < nautical < astro < domain end (strictly nested, not identical)'
);

console.log('\n=== barDomainUTC — fallback rungs ===\n');

function twilightFixture(overrides) {
  var base = {
    astronomicalDawn: new Date('2026-06-21T02:00:00Z'),
    nauticalDawn:     new Date('2026-06-21T02:40:00Z'),
    civilDawn:        new Date('2026-06-21T03:20:00Z'),
    sunriseUTC:       new Date('2026-06-21T04:00:00Z'),
    sunsetUTC:        new Date('2026-06-21T20:00:00Z'),
    civilDusk:        new Date('2026-06-21T20:40:00Z'),
    nauticalDusk:     new Date('2026-06-21T21:20:00Z'),
    astronomicalDusk: new Date('2026-06-21T22:00:00Z')
  };
  var k;
  for (k in overrides) { base[k] = overrides[k]; }
  return base;
}

// The margin only applies when astronomicalDawn/Dusk is itself present
// (Finding 10) — once that field is null, the domain edge sits exactly
// on whichever rung it fell back to, no padding, because there's
// nothing (no true-dark segment, no adapt mark) to make room for there.
equal(
  D.barDomainUTC(twilightFixture({})).startUTC.getTime(),
  new Date('2026-06-21T01:00:00Z').getTime(),
  'dawn rung 0 — astronomicalDawn present: start = astronomicalDawn − 60 min'
);
equal(
  D.barDomainUTC(twilightFixture({ astronomicalDawn: null })).startUTC.getTime(),
  new Date('2026-06-21T02:40:00Z').getTime(),
  'dawn rung 1 — astronomicalDawn null: start = nauticalDawn exactly, no margin'
);
equal(
  D.barDomainUTC(twilightFixture({ astronomicalDawn: null, nauticalDawn: null })).startUTC.getTime(),
  new Date('2026-06-21T03:20:00Z').getTime(),
  'dawn rung 2 — astronomical + nautical null: start = civilDawn exactly, no margin'
);
equal(
  D.barDomainUTC(twilightFixture({ astronomicalDawn: null, nauticalDawn: null, civilDawn: null })).startUTC.getTime(),
  new Date('2026-06-21T04:00:00Z').getTime(),
  'dawn rung 3 — astronomical + nautical + civil null: start = sunriseUTC exactly, no margin'
);

equal(
  D.barDomainUTC(twilightFixture({})).endUTC.getTime(),
  new Date('2026-06-21T23:00:00Z').getTime(),
  'dusk rung 0 — astronomicalDusk present: end = astronomicalDusk + 60 min'
);
equal(
  D.barDomainUTC(twilightFixture({ astronomicalDusk: null })).endUTC.getTime(),
  new Date('2026-06-21T21:20:00Z').getTime(),
  'dusk rung 1 — astronomicalDusk null: end = nauticalDusk exactly, no margin'
);
equal(
  D.barDomainUTC(twilightFixture({ astronomicalDusk: null, nauticalDusk: null })).endUTC.getTime(),
  new Date('2026-06-21T20:40:00Z').getTime(),
  'dusk rung 2 — astronomical + nautical null: end = civilDusk exactly, no margin'
);
equal(
  D.barDomainUTC(twilightFixture({ astronomicalDusk: null, nauticalDusk: null, civilDusk: null })).endUTC.getTime(),
  new Date('2026-06-21T20:00:00Z').getTime(),
  'dusk rung 3 — astronomical + nautical + civil null: end = sunsetUTC exactly, no margin'
);

console.log('\n=== barDomainUTC — fallback rungs, real astronomy pipeline (Finding 14) ===\n');

// The fixtures above hand-null individual fields on a synthetic object —
// they prove barDomainUTC's own fallback arithmetic, but never that a real
// Daylight.recompute() output actually reaches a fallback rung. These two
// go through the real pipeline, at latitudes/dates where the corresponding
// twilight genuinely doesn't occur (found by sampling recompute() output
// across latitudes near the June solstice, not assumed).

var rung2State = {
  route: 'custom', customLat: '55', customLon: '10',
  customDistance: '10', customElevGain: '0',
  date: '2026-06-21', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
};
var rung2Out    = Daylight.recompute(rung2State);
var rung2Domain = D.barDomainUTC(rung2Out);

ok(rung2Out.astronomicalDawn === null, 'lat 55/lon 10, 2026-06-21 fixture sanity: astronomicalDawn null');
ok(rung2Out.nauticalDawn     === null, 'lat 55/lon 10, 2026-06-21 fixture sanity: nauticalDawn null');
ok(rung2Out.civilDawn        !== null, 'lat 55/lon 10, 2026-06-21 fixture sanity: civilDawn present');
ok(rung2Out.isPolarDay === false && rung2Out.isPolarNight === false,
  'lat 55/lon 10, 2026-06-21 fixture sanity: neither polar flag set');

ok(rung2Domain !== null, 'real rung-2 fixture: barDomainUTC is not null');
equal(rung2Domain.startUTC.getTime(), rung2Out.civilDawn.getTime(),
  'real rung-2 fixture: domain start = civilDawn exactly (astro + nautical both absent, no margin)');
equal(rung2Domain.endUTC.getTime(), rung2Out.civilDusk.getTime(),
  'real rung-2 fixture: domain end = civilDusk exactly (astro + nautical both absent, no margin)');

var rung1State = {
  route: 'custom', customLat: '50', customLon: '10',
  customDistance: '10', customElevGain: '0',
  date: '2026-06-21', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
};
var rung1Out    = Daylight.recompute(rung1State);
var rung1Domain = D.barDomainUTC(rung1Out);

ok(rung1Out.astronomicalDawn === null, 'lat 50/lon 10, 2026-06-21 fixture sanity: astronomicalDawn null');
ok(rung1Out.nauticalDawn     !== null, 'lat 50/lon 10, 2026-06-21 fixture sanity: nauticalDawn present');

ok(rung1Domain !== null, 'real rung-1 fixture: barDomainUTC is not null');
equal(rung1Domain.startUTC.getTime(), rung1Out.nauticalDawn.getTime(),
  'real rung-1 fixture: domain start = nauticalDawn exactly (astro absent, nautical present, no margin)');
equal(rung1Domain.endUTC.getTime(), rung1Out.nauticalDusk.getTime(),
  'real rung-1 fixture: domain end = nauticalDusk exactly (astro absent, nautical present, no margin)');

console.log('\n=== barDomainUTC — no sunrise/sunset at all ===\n');

function isNull(actual, label) {
  equal(actual, null, label);
}

isNull(D.barDomainUTC({ sunriseUTC: null, sunsetUTC: null }), 'sunrise + sunset both null → null');
isNull(D.barDomainUTC({ sunriseUTC: new Date('2026-06-21T04:00:00Z'), sunsetUTC: null }), 'sunset null → null');
isNull(D.barDomainUTC({}), 'empty output → null');
isNull(D.barDomainUTC(null), 'null output → null');

console.log('\n=== barDomainUTC — polar day / polar night (Tromsø, 69.65°N) ===\n');

var tromsoWinterOut = Daylight.recompute({
  route: 'custom', customLat: '69.65', customLon: '18.97',
  customDistance: '10', customElevGain: '0',
  date: '2026-12-21', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
});
ok(tromsoWinterOut.isPolarNight === true, 'Tromsø 2026-12-21 fixture sanity: isPolarNight true');
isNull(D.barDomainUTC(tromsoWinterOut), 'polar night output → barDomainUTC null');

var tromsoSummerOut = Daylight.recompute({
  route: 'custom', customLat: '69.65', customLon: '18.97',
  customDistance: '10', customElevGain: '0',
  date: '2026-06-21', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
});
ok(tromsoSummerOut.isPolarDay === true, 'Tromsø 2026-06-21 fixture sanity: isPolarDay true');
isNull(D.barDomainUTC(tromsoSummerOut), 'polar day output → barDomainUTC null');

console.log('\n=== darknessBandForValue — boundary-edge fixtures (D1) ===\n');

// Half-open, left-inclusive: a value exactly on a boundary belongs to the
// darker band above it, not the brighter one below (mirrors js/moon-lux.js's
// luxBracketFor discipline). Proven independently against the real
// distribution below, not just at these hand-picked edges.
equal(D.darknessBandForValue(17.0),  0, '17.0 (well below lowest boundary) → band 0 (town glow)');
equal(D.darknessBandForValue(18.4),  0, '18.4 (just below 18.5) → band 0 (town glow)');
equal(D.darknessBandForValue(18.5),  1, '18.5 (on the boundary) → band 1 (edge of town)');
equal(D.darknessBandForValue(19.4),  1, '19.4 (just below 19.5) → band 1 (edge of town)');
equal(D.darknessBandForValue(19.5),  2, '19.5 (on the boundary) → band 2 (countryside)');
equal(D.darknessBandForValue(20.4),  2, '20.4 (just below 20.5) → band 2 (countryside)');
equal(D.darknessBandForValue(20.5),  3, '20.5 (on the boundary) → band 3 (open dark)');
equal(D.darknessBandForValue(21.2),  3, '21.2 (just below 21.3) → band 3 (open dark)');
equal(D.darknessBandForValue(21.3),  4, '21.3 (on the boundary) → band 4 (as it was)');
equal(D.darknessBandForValue(22.0),  4, '22.0 (well above highest boundary) → band 4 (as it was)');

console.log('\n=== DARKNESS_BAND_BOUNDS / DARKNESS_BAND_NAMES — shape (D1, D9) ===\n');

arrEqual(D.DARKNESS_BAND_BOUNDS, [18.5, 19.5, 20.5, 21.3],
  'DARKNESS_BAND_BOUNDS is the four D1 boundaries, in order');
arrEqual(D.DARKNESS_BAND_NAMES, ['town glow', 'edge of town', 'countryside', 'open dark', 'as it was'],
  'DARKNESS_BAND_NAMES is the five D9 names, brightest to darkest');

console.log('\n=== darknessBandCounts — measured distribution across all 7 real artifacts (D1, AC #1) ===\n');

var DARKNESS_DIR = path.join(__dirname, '..', 'assets', 'darkness');

function loadDarknessArtifact(routeId) {
  return JSON.parse(fs.readFileSync(path.join(DARKNESS_DIR, routeId + '.json'), 'utf8'));
}

// The exact percentage table from spec D1 (docs/specs/2026-08-12-darkness-ribbon.md),
// which the spec itself derived directly from these same seven committed
// artifacts — not a hand-built fixture standing in for them. AC #1 requires
// this test read assets/darkness/*.json directly so the assertion can never
// silently drift from what's actually shipped.
var EXPECTED_DISTRIBUTION = {
  'camino-frances':   [3,  8,  21, 39, 30],
  'camino-ingles':    [2,  18, 46, 34, 0],
  'camino-norte':     [3,  14, 34, 43, 7],
  'camino-portugues': [5,  20, 66, 10, 0],
  'camino-primitivo': [0,  6,  8,  34, 52],
  'shikoku-88':       [0,  1,  17, 32, 51],
  'kumano-kodo':      [0,  0,  0,  0,  100]
};

Object.keys(EXPECTED_DISTRIBUTION).forEach(function (routeId) {
  var artifact = loadDarknessArtifact(routeId);
  var counts   = D.darknessBandCounts(artifact.values);
  var total    = artifact.values.length;
  var pct      = counts.map(function (c) { return Math.round(100 * c / total); });
  arrEqual(pct, EXPECTED_DISTRIBUTION[routeId],
    routeId + ' — band % distribution matches D1 table (n=' + total + ')');
});

console.log('\n=== darknessAggregateWindowKm — D3 aggregation-window formula ===\n');

equal(D.darknessAggregateWindowKm({ withinInterpolationLimit: false, p90GapKm: 34.4 }), 40,
  'p90GapKm 34.4 (Shikoku-shaped), not within limit → 40 km window');
equal(D.darknessAggregateWindowKm({ withinInterpolationLimit: false, p90GapKm: 6.0 }), 10,
  'p90GapKm 6.0, not within limit → 10 km window');
equal(D.darknessAggregateWindowKm({ withinInterpolationLimit: false, p90GapKm: 30.0 }), 30,
  'p90GapKm 30.0 (exact multiple of 10) → 30 km window, ceil does not round past itself');
equal(D.darknessAggregateWindowKm({ withinInterpolationLimit: true, p90GapKm: 34.4 }), null,
  'withinInterpolationLimit true → null regardless of p90GapKm (no aggregation)');

console.log('\n=== darknessAggregateWindowKm — real positionalConfidence, all 7 artifacts (D3) ===\n');

// Only shikoku-88 fails withinInterpolationLimit today (meta.json geometry
// summary, cross-checked per-route below) — the other six take the
// unaggregated per-kilometre path.
var EXPECTED_WINDOW = {
  'camino-frances':   null,
  'camino-ingles':    null,
  'camino-norte':     null,
  'camino-portugues': null,
  'camino-primitivo': null,
  'shikoku-88':       40,
  'kumano-kodo':      null
};

Object.keys(EXPECTED_WINDOW).forEach(function (routeId) {
  var artifact = loadDarknessArtifact(routeId);
  var windowKm = D.darknessAggregateWindowKm(artifact.positionalConfidence);
  equal(windowKm, EXPECTED_WINDOW[routeId],
    routeId + ' — darknessAggregateWindowKm from real positionalConfidence');
});

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
