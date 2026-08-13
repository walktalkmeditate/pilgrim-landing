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
var N = require('./night-math.js');
var MoonLuxRef = require('./moon-lux.js');

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
// Pinned so a silent change here is caught: js/daylight.js's RIBBON_W is
// *defined from* this constant (RIBBON_X1 + DARKNESS_RIBBON_WIDTH), and
// mergeDarknessRuns's minimum-drawable-run-width guard divides coveredKm
// by it — a drift here would silently change both the ribbon's drawn
// width and its absorption threshold at once, with nothing else to catch it.
equal(D.DARKNESS_RIBBON_WIDTH, 504,
  'DARKNESS_RIBBON_WIDTH is 504 — the ribbon\'s drawable width in viewBox units (RIBBON_X2 552 - RIBBON_X1 48 in js/daylight.js)');

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

console.log('\n=== mergeDarknessRuns — unaggregated path, hand-computed (D3) ===\n');

// stepKm=1, coveredKm=5.5 (deliberately NOT an exact multiple of stepKm, so
// the last sample's natural position (5) sits short of coveredKm and every
// run below gets real, positive width — the "ordinary" case, distinct from
// the exact-multiple edge case exercised further down).
// values -> bands: 20,20 -> 2,2 | 19,19,19 -> 1,1,1 | 22 -> 4
arrEqual(
  D.mergeDarknessRuns([20, 20, 19, 19, 19, 22], 1, 5.5, null),
  [
    { startKm: 0, endKm: 2,   band: 2 },
    { startKm: 2, endKm: 5,   band: 1 },
    { startKm: 5, endKm: 5.5, band: 4 }
  ],
  'unaggregated: three bands merge into three runs, tiling [0, 5.5] exactly'
);

console.log('\n=== mergeDarknessRuns — Kumano-shaped: one band, one run (D6) ===\n');

var oneband = new Array(10).fill(21.7); // all band 4, stepKm=1, coveredKm=9
arrEqual(
  D.mergeDarknessRuns(oneband, 1, 9, null),
  [{ startKm: 0, endKm: 9, band: 4 }],
  'ten identical-band samples collapse to a single run spanning the whole route — no per-route special-casing needed'
);

console.log('\n=== mergeDarknessRuns — aggregated path, hand-computed (D3) ===\n');

// windowKm=3, coveredKm=8 -> windows [0,3) [3,6) [6,8), grid-aligned (not
// sample-position-aligned). Window medians: [22,22,21]->22->band4;
// [19,19,20]->19->band1; [17,17,17]->17->band0.
arrEqual(
  D.mergeDarknessRuns([22, 22, 21, 19, 19, 20, 17, 17, 17], 1, 8, 3),
  [
    { startKm: 0, endKm: 3, band: 4 },
    { startKm: 3, endKm: 6, band: 1 },
    { startKm: 6, endKm: 8, band: 0 }
  ],
  'aggregated: each window classified by its median, windows merge the same way raw samples do'
);

console.log('\n=== darknessMedian — even-length branch (untested gap, closed) ===\n');

// darknessMedian is what darknessMedian's even branch feeds every time
// Shikoku's 40 km windows land on an even raw-sample count — 27 of its
// 28 windows do (checked directly below, not assumed). No fixture in
// this suite exercised the even path at all before this section: every
// hand-built aggregated-path fixture above uses odd-length buckets.
equal(D.darknessMedian([1, 3]), 2, 'even-length [1,3]: averages the two middle values (1+3)/2=2');
equal(D.darknessMedian([4, 1, 3, 2]), 2.5, 'even-length unsorted [4,1,3,2]: sorts to [1,2,3,4], averages the middle two (2+3)/2=2.5');
equal(D.darknessMedian([1, 2, 3]), 2, 'odd-length [1,2,3]: still returns the middle value (regression guard — the even branch must not break the odd one)');
equal(D.darknessMedian([5]), 5, 'single value: trivially its own median (odd-length, n=1)');

// A synthetic pair straddling a band boundary far enough that an
// implementation which ignored parity (e.g. always sorted[Math.floor(n/2)])
// would land in a DIFFERENT band than the correct even-length average —
// so this discriminates the branch, not just its arithmetic in isolation.
// Correct: (19.0+19.9)/2 = 19.45 -> band 1 (edge of town, < 19.5).
// Wrong (sorted[1] = 19.9 alone) -> band 2 (countryside, >= 19.5).
equal(D.darknessBandForValue(D.darknessMedian([19.0, 19.9])), 1,
  'even-length median [19.0, 19.9] -> 19.45 -> band 1, not band 2 (proves the average is used, not just the upper of the two middle values)');

// Real Shikoku data: confirms the even branch isn't a synthetic curiosity
// — it's what 27 of the route's 28 real 40 km windows actually run
// through (the 28th window covers only km 1080, a single sample, odd).
var shikokuMedianArtifact = loadDarknessArtifact('shikoku-88');
var shikokuMedianWindowKm = D.darknessAggregateWindowKm(shikokuMedianArtifact.positionalConfidence);
var shikokuBucketSizes = [];
shikokuMedianArtifact.values.forEach(function (v, i) {
  var km = i * shikokuMedianArtifact.stepKm;
  var bucketIdx = Math.floor(km / shikokuMedianWindowKm);
  shikokuBucketSizes[bucketIdx] = (shikokuBucketSizes[bucketIdx] || 0) + 1;
});
var shikokuEvenBuckets = shikokuBucketSizes.filter(function (n) { return n % 2 === 0; }).length;
equal(shikokuBucketSizes.length, 28, 'shikoku-88: 40 km aggregation produces 28 windows');
equal(shikokuEvenBuckets, 27, 'shikoku-88: 27 of its 28 windows have an even raw-sample count — the even branch is what real Shikoku data mostly exercises, not a synthetic curiosity');

console.log('\n=== mergeDarknessRuns — empty-bucket fallback (Finding 4) ===\n');

// A later window can be empty while an earlier one wasn't (values[] that
// doesn't extend all the way to coveredKm) — forward-fill from the last
// real band keeps the tiling unbroken. Proven with a distinctive band
// (0, "town glow" — the rarest in real data) so the result can only be
// explained by the empty windows correctly inheriting it, not by
// coincidence: a buggy version that emitted `band: null` instead would
// split this into three runs, two of them null, not one run of band 0.
arrEqual(
  D.mergeDarknessRuns([17, 17, 17, 17, 17], 1, 30, 10),
  [{ startKm: 0, endKm: 30, band: 0 }],
  'windows 1 and 2 have no raw samples (values[] only reaches km 4 of a 30 km route) — both forward-fill window 0\'s band (0), merging into one run, not a null-banded gap'
);

// The one case forward-fill cannot cover honestly: the FIRST window is
// itself empty, so there is no earlier band to carry. Before this fix
// the fallback still ran (lastBand's initial value, null) and would have
// reached the page as class "dl-ribbon-band-null" — a run with a real
// position and no matching CSS rule, invisible with no error anywhere.
// This must throw instead, naming the window, not draw nothing silently.
var emptyFirstWindowThrew = false;
var emptyFirstWindowMessage = '';
try {
  D.mergeDarknessRuns([], 1, 30, 10);
} catch (e) {
  emptyFirstWindowThrew = true;
  emptyFirstWindowMessage = e.message;
}
ok(emptyFirstWindowThrew, 'values: [] with an aggregation window: mergeDarknessRuns throws rather than emitting band: null');
ok(emptyFirstWindowMessage.indexOf('window 0') !== -1,
  'the thrown error names the offending window (window 0): ' + JSON.stringify(emptyFirstWindowMessage));

console.log('\n=== mergeDarknessRuns — an unbounded window count throws rather than allocating (defence in depth) ===\n');

// js/daylight.js's artifact shape guard is the real gate: an artifact whose
// p90GapKm is 0 or null hides the ribbon section long before this function
// is reached. This is the second line — the one that matters if any other
// caller ever computes an aggregation window itself. numWindows comes out
// Infinity for a zero window, and the bucket-allocation loop below it runs
// until the process dies: an adversarial reviewer took node to 4 GB this
// way, which in a browser is a frozen tab, the one failure mode strictly
// worse than a thrown error nobody can read.
[
  { windowKm: 0,        label: 'aggregateWindowKm 0 (p90GapKm 0 -> ceil(0/10)*10)' },
  { windowKm: -10,      label: 'aggregateWindowKm negative' },
  { windowKm: NaN,      label: 'aggregateWindowKm NaN (p90GapKm missing -> ceil(NaN/10)*10)' }
].forEach(function (spec) {
  var threw = false;
  var message = '';
  try {
    D.mergeDarknessRuns([20, 20, 20], 1, 30, spec.windowKm);
  } catch (e) {
    threw = true;
    message = e.message;
  }
  ok(threw, spec.label + ': mergeDarknessRuns throws rather than allocating an unbounded bucket array');
  ok(message.indexOf('refusing to allocate') !== -1,
    spec.label + ': the thrown error says why: ' + JSON.stringify(message));
});

console.log('\n=== mergeDarknessRuns — trailing zero-width run is absorbed, not emitted (adversarial) ===\n');

// coveredKm=3 is an EXACT multiple of stepKm=1, so the last raw sample's
// own position (index 3, km 3) coincides with coveredKm exactly. Its band
// (4) disagrees with its predecessor (2) — without the safety net this
// pushes a {startKm: 3, endKm: 3, band: 4} run: real classification, zero
// pixels to draw it with. It must be absorbed into the run before it
// instead of appearing as an invisible sliver that still tiles "correctly"
// on paper.
arrEqual(
  D.mergeDarknessRuns([20, 20, 20, 22], 1, 3, null),
  [{ startKm: 0, endKm: 3, band: 2 }],
  'a same-position, disagreeing final sample is absorbed into the previous run rather than emitted at zero width'
);

console.log('\n=== absorbNarrowDarknessRuns — general minimum-drawable-width absorption, any run, not only the final one ===\n');

// The zero-width case above is the narrowest possible instance of this
// general guard, not a special case of its own (mergeDarknessRuns no
// longer special-cases it). Tested directly against hand-built runs and
// an explicit threshold, isolated from coveredKm/DARKNESS_RIBBON_WIDTH,
// the same way darknessMedian and darknessBandKmShares are tested
// directly elsewhere in this file.

arrEqual(
  D.absorbNarrowDarknessRuns(
    [{ startKm: 0, endKm: 10, band: 1 }, { startKm: 10, endKm: 11, band: 3 }, { startKm: 11, endKm: 20, band: 2 }],
    2
  ),
  [{ startKm: 0, endKm: 11, band: 1 }, { startKm: 11, endKm: 20, band: 2 }],
  'an INTERIOR run (width 1, threshold 2) is absorbed into its predecessor, which keeps its own band — not only a trailing run'
);

arrEqual(
  D.absorbNarrowDarknessRuns(
    [{ startKm: 0, endKm: 1, band: 4 }, { startKm: 1, endKm: 20, band: 2 }],
    2
  ),
  [{ startKm: 0, endKm: 20, band: 2 }],
  'a LEADING run (width 1, threshold 2) has no predecessor to absorb into — folds forward into its successor instead, which keeps its own band'
);

arrEqual(
  D.absorbNarrowDarknessRuns(
    [
      { startKm: 0,  endKm: 10, band: 0 },
      { startKm: 10, endKm: 11, band: 1 },
      { startKm: 11, endKm: 12, band: 2 },
      { startKm: 12, endKm: 13, band: 3 },
      { startKm: 13, endKm: 20, band: 4 }
    ],
    2
  ),
  [{ startKm: 0, endKm: 13, band: 0 }, { startKm: 13, endKm: 20, band: 4 }],
  'three consecutive sub-threshold runs in a row (width 1 each, threshold 2) all cascade into the same predecessor in one pass'
);

arrEqual(
  D.absorbNarrowDarknessRuns(
    [{ startKm: 0, endKm: 1, band: 0 }, { startKm: 1, endKm: 2, band: 3 }],
    5
  ),
  [{ startKm: 0, endKm: 2, band: 0 }],
  'every run narrower than the threshold: collapses to one run spanning the whole span, under the first band encountered — terminates, never throws, never returns empty'
);

arrEqual(D.absorbNarrowDarknessRuns([{ startKm: 0, endKm: 1, band: 2 }], 5),
  [{ startKm: 0, endKm: 1, band: 2 }],
  'a single run: returned unchanged regardless of width vs threshold — nothing to absorb into');
arrEqual(D.absorbNarrowDarknessRuns([], 5), [],
  'an empty array: returned unchanged');

console.log('\n=== mergeDarknessRuns — tiles [0, coveredKm] with no gaps, overlaps, or zero-width runs, all 7 real artifacts ===\n');

Object.keys(EXPECTED_WINDOW).forEach(function (routeId) {
  var artifact = loadDarknessArtifact(routeId);
  var windowKm = D.darknessAggregateWindowKm(artifact.positionalConfidence);
  var runs = D.mergeDarknessRuns(artifact.values, artifact.stepKm, artifact.coveredKm, windowKm);

  ok(runs.length > 0, routeId + ': mergeDarknessRuns returns at least one run');

  var startsAtZero = runs[0] && runs[0].startKm === 0;
  ok(startsAtZero, routeId + ': first run starts at km 0');

  var endsAtCovered = runs.length && runs[runs.length - 1].endKm === artifact.coveredKm;
  ok(endsAtCovered, routeId + ': last run ends at coveredKm (' + artifact.coveredKm + ')');

  var tilesCleanly = runs.every(function (r, i) {
    if (r.endKm <= r.startKm) return false;
    if (i > 0 && r.startKm !== runs[i - 1].endKm) return false;
    return true;
  });
  ok(tilesCleanly, routeId + ': every run has positive width, and each run\'s start meets the previous run\'s end exactly (' + runs.length + ' runs)');

  // mergeDarknessRuns emits consecutive runs that differ in band by
  // construction; sub-pixel absorption used to break that afterwards, by
  // deleting the run that separated two same-band neighbours and leaving
  // them abutting. Two adjacent <line>s of the SAME band still composite
  // their antialiased edges in sequence, so the shared fractional pixel
  // draws a hairline boundary the data does not contain (and, on a dashed
  // route, a dash-phase restart mid-band). Asserted on the real artifacts,
  // not a hand-built fixture: camino-frances shipped 14 of these and
  // camino-norte 6, and nothing in the suite noticed.
  var sameBandNeighbours = runs.filter(function (r, i) {
    return i > 0 && runs[i - 1].band === r.band;
  }).length;
  equal(sameBandNeighbours, 0, routeId + ': no two adjacent runs share a band — absorption coalesces rather than leaving a false hairline boundary');
});

console.log('\n=== mergeDarknessRuns — pinned shapes, real data (D3, D6) ===\n');

var kumanoArtifact = loadDarknessArtifact('kumano-kodo');
var kumanoRuns = D.mergeDarknessRuns(kumanoArtifact.values, kumanoArtifact.stepKm, kumanoArtifact.coveredKm,
  D.darknessAggregateWindowKm(kumanoArtifact.positionalConfidence));
arrEqual(kumanoRuns, [{ startKm: 0, endKm: 38, band: 4 }],
  'kumano-kodo: real data collapses to exactly one run, the whole 38 km, band 4 (D6 — emergent, not special-cased)');

var shikokuArtifact = loadDarknessArtifact('shikoku-88');
var shikokuRuns = D.mergeDarknessRuns(shikokuArtifact.values, shikokuArtifact.stepKm, shikokuArtifact.coveredKm,
  D.darknessAggregateWindowKm(shikokuArtifact.positionalConfidence));
equal(shikokuRuns.length, 8, 'shikoku-88: real data (40 km windows) merges to 9 windows, coarse but not one flat bar (D3) — then 8 runs once the trailing 0.5 km window (below one drawn pixel, coveredKm/504 = 2.14 km) absorbs into its predecessor');
arrEqual(shikokuRuns[0], { startKm: 0, endKm: 120, band: 3 }, 'shikoku-88: first run (unaffected — well above the absorption threshold)');
// Before absorption: {startKm: 1080, endKm: 1080.5, band: 4}, 0.5 km — 0.245 CSS px at a
// 576px-wide desktop ribbon, 0.146 px at a 343px-wide 375px-viewport ribbon (verified via
// a real headless-Chrome render of #dl-ribbon-svg's getBoundingClientRect().width at both
// widths). Narrower than one drawn pixel either way, so it absorbs into its predecessor
// (band 3, {1040, 1080}), which is what actually reaches the reader's eye: one wider,
// visible run instead of a sliver whose colour a single sample decided.
arrEqual(shikokuRuns[shikokuRuns.length - 1], { startKm: 1040, endKm: 1080.5, band: 3 }, 'shikoku-88: last run absorbs the former 0.5 km sub-pixel window, reaching coveredKm exactly (1080.5) under its predecessor\'s band (3)');

var francesArtifact = loadDarknessArtifact('camino-frances');
var francesRuns = D.mergeDarknessRuns(francesArtifact.values, francesArtifact.stepKm, francesArtifact.coveredKm,
  D.darknessAggregateWindowKm(francesArtifact.positionalConfidence));
equal(francesRuns.length, 94, 'camino-frances: real data (unaggregated, 1 km resolution) merges to 128 band-change points, then 94 runs — 20 narrower than one drawn pixel (coveredKm/504 = 1.52 km) at desktop width absorb into their predecessors, and the 14 same-band adjacencies that absorption leaves behind coalesce into their neighbours');
var francesBandsPresent = [0, 1, 2, 3, 4].every(function (b) { return francesRuns.some(function (r) { return r.band === b; }); });
ok(francesBandsPresent, 'camino-frances: all five bands appear somewhere in the merged runs');

console.log('\n=== darknessCompositionSentence / selectNamedDarknessBands — direct template tests (Finding 4) ===\n');

// None of the seven shipped routes produce exactly two qualifying bands
// (D1's table always yields one, three, or four), so the two-band
// template ("Mostly A (a%) and B (b%).") was reachable only by mutating
// it and watching both suites stay green. Tested directly here against
// hand-built band lists, bypassing selectNamedDarknessBands entirely —
// this is the template in isolation, not whichever real distribution
// happens to select two bands.
equal(
  D.darknessCompositionSentence([{ name: 'open dark', pct: 50 }, { name: 'countryside', pct: 45 }]),
  'Mostly open dark (50%) and countryside (45%).',
  'exactly two bands: the two-band template, not the three-or-four-band one'
);

// selectNamedDarknessBands' own selection rule, hitting exactly two
// qualifying bands from raw counts (not hand-built band objects) — the
// two pass together prove the whole path, selection through template.
equal(
  D.darknessSummarySentence(
    { values: [2, 3, 45, 50, 0].reduce(function (vals, n, band) {
        for (var i = 0; i < n; i++) vals.push([18.0, 19.0, 20.0, 21.0, 21.5][band]);
        return vals;
      }, []),
      coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: true },
    null, 'km'
  ),
  '100.0\u00A0km sampled. Mostly open dark (50%) and countryside (45%). Darkest near the end.',
  // The fixture's values are grouped band-by-band (all band 0, then all
  // band 1, ...), so it is also a monotonic gradient along the route —
  // the positional clause (Finding 3) correctly picks that up too. Left
  // in rather than flattened to a uniform fixture, since it shows the
  // two-band template and the positional clause composing correctly,
  // not just the template in isolation (already covered above).
  'end-to-end: 100 samples at [2,3,45,50,0] counts select exactly two qualifying bands (2% and 3% both drop) and render the two-band template'
);

console.log('\n=== darknessCompositionSentence — a fifth qualifying band is never silently dropped (Finding 5) ===\n');

// Five real shares summing to 100, each individually >=5%, is a real
// (if unshipped) shape: the old fixed "three-or-four" template stopped
// naming after the fourth band, so a fifth qualifying band vanished from
// the sentence with no error and no sign anything was missing.
equal(
  D.darknessCompositionSentence([
    { name: 'as it was',    pct: 40 },
    { name: 'open dark',    pct: 30 },
    { name: 'countryside',  pct: 15 },
    { name: 'edge of town', pct: 10 },
    { name: 'town glow',    pct: 5 }
  ]),
  'Mostly as it was (40%) and open dark (30%), with some countryside (15%), edge of town (10%) and town glow (5%).',
  'exactly five bands, hand-built: the "with some" list extends to all three trailing bands — none dropped'
);

// selectNamedDarknessBands' own selection/sort feeding straight into the
// template, from raw counts rather than hand-built band objects — proves
// the whole path (selection through five-band rendering), not just the
// template in isolation above.
equal(
  D.darknessCompositionSentence(D.selectNamedDarknessBands([5, 10, 15, 30, 40])),
  'Mostly as it was (40%) and open dark (30%), with some countryside (15%), edge of town (10%) and town glow (5%).',
  'selectNamedDarknessBands([5,10,15,30,40]) selects and sorts all five (all clear 5%), darknessCompositionSentence names all five'
);

console.log('\n=== darknessPositionalClause — pinned fixtures, both gates (Finding 3) ===\n');

// Hand-built runs, not real routes — isolates each gate precisely rather
// than relying on whichever real route happens to exercise it.

equal(D.darknessPositionalClause([{ startKm: 0, endKm: 10, band: 3 }], 10), '',
  'a single run (Kumano-shaped, D6): no positional clause — nothing varies to point at');

equal(D.darknessPositionalClause([], 10), '',
  'zero runs: no positional clause (defensive — mergeDarknessRuns never actually returns this)');

// Gate 1: the three thirds' km-weighted means come out identical, even
// though there is real texture within each third (band 2 and band 0
// alternating) — so runs.length > 1 alone must not be enough to fire.
var uniformThirdsRuns = [
  { startKm: 0, endKm: 1, band: 2 }, { startKm: 1, endKm: 2, band: 0 }, { startKm: 2, endKm: 3, band: 2 },
  { startKm: 3, endKm: 4, band: 2 }, { startKm: 4, endKm: 5, band: 0 }, { startKm: 5, endKm: 6, band: 2 },
  { startKm: 6, endKm: 7, band: 2 }, { startKm: 7, endKm: 8, band: 0 }, { startKm: 8, endKm: 9, band: 2 }
];
equal(D.darknessPositionalClause(uniformThirdsRuns, 9), '',
  'Gate 1: every third averages out identically (1.333 each) despite 9 runs — no clause');

// Gate 2: the darkest-mean third (2.667) and brightest-mean third (1.333)
// are a real, non-trivial gap apart — but both are still dominated by
// band 2 (2 of their 3 km each), the Camino Portugués shape (mostly one
// band, start to finish, even where the mean drifts a little). Gate 1
// alone would fire here; Gate 2 is what stops it.
var sameDominantRuns = [
  { startKm: 0, endKm: 2, band: 2 }, { startKm: 2, endKm: 3, band: 4 }, // third 1: mean 2.667, dominant band 2
  { startKm: 3, endKm: 5, band: 2 }, { startKm: 5, endKm: 6, band: 0 }, // third 2: mean 1.333, dominant band 2
  { startKm: 6, endKm: 9, band: 2 }                                     // third 3: mean 2.000, dominant band 2
];
equal(D.darknessPositionalClause(sameDominantRuns, 9), '',
  'Gate 2: darkest third (mean 2.667) and brightest third (mean 1.333) disagree on average, but both are dominated by the same band 2 — no clause');

// One clear, isolated fixture per position, so each of the three phrases
// is pinned independently of which real route happens to produce it.
equal(
  D.darknessPositionalClause([{ startKm: 0, endKm: 3, band: 4 }, { startKm: 3, endKm: 9, band: 1 }], 9),
  ' Darkest near the start.',
  'darkest third is the first: " Darkest near the start."'
);
equal(
  D.darknessPositionalClause([{ startKm: 0, endKm: 3, band: 1 }, { startKm: 3, endKm: 6, band: 4 }, { startKm: 6, endKm: 9, band: 1 }], 9),
  ' Darkest through the middle stretch.',
  'darkest third is the middle: " Darkest through the middle stretch."'
);
equal(
  D.darknessPositionalClause([{ startKm: 0, endKm: 6, band: 1 }, { startKm: 6, endKm: 9, band: 4 }], 9),
  ' Darkest near the end.',
  'darkest third is the last: " Darkest near the end."'
);

console.log('\n=== darknessSummarySentence — worked examples from spec D10, real data ===\n');

// Stated distanceKm per route, from assets/daylight/route-meta.json —
// verified directly, not re-derived, since this is a fixture value, not
// something under test here.
var STATED_DISTANCE_KM = {
  'camino-frances':   764,
  'camino-ingles':    112,
  'camino-norte':     784,
  'camino-portugues': 243,
  'camino-primitivo': 263,
  'shikoku-88':       1200,
  'kumano-kodo':      39
};

// Finding 6: the ribbon draws coveredKm as an SVG <text> inside
// role="img", which flattens the subtree — this sentence is the only
// textual path to it, so it now leads with coveredKm for every route,
// not only the one (Shikoku) whose gap against route-meta's stated
// distanceKm is wide enough to also earn the "N of its M" discrepancy
// framing. The four worked examples below all lack that gap (≤1 km),
// so each gets the plain "<coveredKm> sampled." lead-in instead.

var primitivoArtifactForSentence = loadDarknessArtifact('camino-primitivo');
equal(
  D.darknessSummarySentence(primitivoArtifactForSentence, STATED_DISTANCE_KM['camino-primitivo'], 'km'),
  '262.9\u00A0km sampled. Mostly as it was (52%) and open dark (34%), with some countryside (8%) and edge of town (6%). Darkest through the middle stretch.',
  'camino-primitivo (validated, no gap): plain distance lead-in + four-band sentence + Finding 3 positional clause, no trailing clause'
);

var francesArtifactForSentence = loadDarknessArtifact('camino-frances');
equal(
  D.darknessSummarySentence(francesArtifactForSentence, STATED_DISTANCE_KM['camino-frances'], 'km'),
  '763.7\u00A0km sampled. Mostly open dark (39%) and as it was (30%), with some countryside (21%) and edge of town (8%). Darkest near the end.',
  // This route's positional clause was silenced for a while by an exact
  // tie, not by a thin margin. Sub-pixel absorption moved exactly 1 km
  // out of band 2 and into band 3 within the final third, landing
  // kmByBand[3] and kmByBand[4] on 100.000000000000000 each.
  // darknessBandStatsInRange's ascending scan then awarded that tie to
  // the BRIGHTER band 3 purely because it reached it first; band 3 also
  // dominates the first third, so Gate 2 (the darkest and brightest
  // thirds must have DIFFERENT dominant bands) fell silent. The evidence
  // the clause rests on is not thin at all — the final third's mean band
  // index is 3.136 against the first third's 2.664, and the tied 100 km
  // of "as it was" at the end stands against 51.6 km of it at the start.
  // With ties resolved toward the darker band (the same rule
  // darknessBandForValue applies to a value sitting exactly on a band
  // boundary), the clause returns.
  'camino-frances (validated, no gap): plain distance lead-in + four-band sentence — town glow\'s 3% is real but too small to name — plus the positional clause its final third earns (verified below, not merely present)'
);
equal(
  D.darknessPositionalClause(francesRuns, francesArtifactForSentence.coveredKm), ' Darkest near the end.',
  'camino-frances: darknessPositionalClause itself returns the clause on the real, absorbed runs — the sentence above isn\'t carrying it by accident'
);
// The tie itself, pinned directly against the real runs: if a re-bake or a
// change to the absorption threshold moves that kilometre back, this goes
// red and names the cause, rather than the clause quietly vanishing again
// while the two assertions above blame a margin that was never the issue.
var francesFinalThirdKm = D.darknessBandKmShares(francesRuns.map(function (r) {
  var lo = Math.max(r.startKm, 2 * francesArtifactForSentence.coveredKm / 3);
  return { startKm: lo, endKm: Math.max(lo, r.endKm), band: r.band };
}));
ok(francesFinalThirdKm[3] === francesFinalThirdKm[4],
  'camino-frances: bands 3 and 4 hold an EXACT tie across the final third (' + francesFinalThirdKm[3]
    + ' km each) — the tie-break, not a margin, is what decides this clause');

var portuguesArtifactForSentence = loadDarknessArtifact('camino-portugues');
equal(
  D.darknessSummarySentence(portuguesArtifactForSentence, STATED_DISTANCE_KM['camino-portugues'], 'km'),
  '243.0\u00A0km sampled. Mostly countryside (66%) and edge of town (19%), with some open dark (10%) and town glow (5%).',
  'camino-portugues (validated, no gap): plain distance lead-in + 66% concentrated in one middle band \u2014 19%, not the raw per-km tally\'s 20%, since this is now km-weighted off the merged runs (Finding 1)'
);

// Kumano: D6's single-band flatness collapses the composition sentence
// to the one-band template — but D4 still attaches the trailing clause,
// since heldOutValidation is false here regardless of how many bands
// qualify. D10's own worked example for Kumano shows the bare
// composition sentence alone; D4 is explicit that Kumano gets the same
// textual marking Shikoku does, and AC #3 requires it. Finding 6 adds
// the plain distance lead-in on top (Kumano's own gap — stated 39 vs
// covered 38.0 — is only 1.0 km, nowhere near the discrepancy gate) —
// the sentence below is the union of all three decisions, not D10 read
// in isolation.
var kumanoArtifactForSentence = loadDarknessArtifact('kumano-kodo');
equal(
  D.darknessSummarySentence(kumanoArtifactForSentence, STATED_DISTANCE_KM['kumano-kodo'], 'km'),
  '38.0\u00A0km sampled. As it was, the whole way. Not checked against a ground reading here, the way the five Camino routes are.',
  'kumano-kodo (unvalidated, no gap — stated 39 vs covered 38.0, diff 1.0): plain distance lead-in + single-band sentence + D4 clause'
);

// Shikoku: both the lead-in (D3/D13 — stated 1200 vs covered 1080.5,
// diff 119.5, comfortably over the 5 km gate) and the trailing clause
// (D4) fire together — the only route where all three clauses compose
// in one sentence.
var shikokuArtifactForSentence = loadDarknessArtifact('shikoku-88');
equal(
  D.darknessSummarySentence(shikokuArtifactForSentence, STATED_DISTANCE_KM['shikoku-88'], 'km'),
  '1,080.5\u00A0km of its 1,200\u00A0km sampled. Mostly as it was (52%) and open dark (37%), with some countryside (11%). Darkest through the middle stretch. Not checked against a ground reading here, the way the five Camino routes are.',
  // Finding 1: these three percentages are km-weighted off the same 40 km
  // merged runs the strip draws (52/37/11), not a raw per-kilometre tally
  // of values[] (which would read 51/32/17 \u2014 the mismatch Finding 1
  // named). D3's aggregation is real: 40 km windows genuinely redistribute
  // where "open dark" and "countryside" fall along the route once
  // classified by window median instead of by lone kilometre.
  'shikoku-88 (unvalidated, gap fires): lead-in + three-band sentence (km-weighted, matches the strip) + D4 clause'
);

console.log('\n=== darknessSummarySentence — stated shares match drawn shares, all 7 routes (Finding 1) ===\n');

// AC #5 only ever compared the aria-label to the sibling paragraph — text
// against text, both produced by the same function call. Neither was ever
// checked against the geometry mergeDarknessRuns actually hands
// renderRibbon to draw. This is that missing comparison: for every band
// named in the sentence, its stated percentage must match the percentage
// of the strip's own pixels (km, in this pure layer) that band occupies —
// derived independently here via darknessBandKmShares, not by re-calling
// darknessSummarySentence's own internals.
var SHARE_TOLERANCE_PCT = 0; // exact match: both now read the same merged runs.

function drawnPctByBand(artifact) {
  var windowKm = D.darknessAggregateWindowKm(artifact.positionalConfidence);
  var runs     = D.mergeDarknessRuns(artifact.values, artifact.stepKm, artifact.coveredKm, windowKm);
  var kmShares = D.darknessBandKmShares(runs);
  return kmShares.map(function (km) { return Math.round(100 * km / artifact.coveredKm); });
}

// Parses every "{band name} (N%)" pair out of a rendered sentence — the
// same shape darknessCompositionSentence's two/three/four/five-band
// templates all produce for named bands (the one-band template, "X, the
// whole way.", carries no percentage to parse, and is skipped below by
// virtue of matching zero pairs).
function statedPctByBand(sentence) {
  var stated = [null, null, null, null, null];
  D.DARKNESS_BAND_NAMES.forEach(function (name, i) {
    var re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\((\\d+)%\\)');
    var m = re.exec(sentence);
    if (m) stated[i] = parseInt(m[1], 10);
  });
  return stated;
}

Object.keys(EXPECTED_WINDOW).forEach(function (routeId) {
  var artifact = loadDarknessArtifact(routeId);
  var stated   = STATED_DISTANCE_KM[routeId];
  var sentence = D.darknessSummarySentence(artifact, stated, 'km');
  var drawn    = drawnPctByBand(artifact);
  var found    = statedPctByBand(sentence);

  // The one-band template ("X, the whole way.") states no percentage at
  // all (D10) — so a route with exactly one qualifying band is expected
  // to parse zero pairs, not one.
  var qualifyingCount   = drawn.filter(function (pct) { return pct >= 5; }).length;
  var expectedNamedCount = qualifyingCount === 1 ? 0 : qualifyingCount;
  var foundCount = found.filter(function (pct) { return pct !== null; }).length;
  equal(foundCount, expectedNamedCount,
    routeId + ': the sentence names exactly as many bands as clear the 5% share threshold (fixture sanity — proves the regex parse itself is complete, not vacuously matching nothing)');

  var allMatch = found.every(function (pct, i) {
    return pct === null || Math.abs(pct - drawn[i]) <= SHARE_TOLERANCE_PCT;
  });
  ok(allMatch,
    routeId + ': every share stated in the sentence matches the share the strip draws, within ' + SHARE_TOLERANCE_PCT + ' point(s) — stated ' + JSON.stringify(found) + ' vs drawn ' + JSON.stringify(drawn));
});

console.log('\n=== darknessSummarySentence — gate and edge-case behaviour ===\n');

// The discrepancy framing's own >5 km gate, checked directly rather than
// only via real fixtures (which only exercise one side of the boundary
// each). Finding 6: coveredKm is stated either way now — the gate only
// decides which of the two phrasings carries it.
var gateFixtureValues = new Array(10).fill(21.7); // all band 4, matches kumano's shape

equal(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: true }, 105, 'km'),
  '100.0\u00A0km sampled. As it was, the whole way.',
  'gap exactly 5 km: plain distance lead-in, no "of its" discrepancy framing (boundary is ">5", not ">=5")'
);
equal(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: true }, 105.1, 'km'),
  '100.0\u00A0km of its 105\u00A0km sampled. As it was, the whole way.',
  'gap 5.1 km: "of its" discrepancy framing fires'
);
equal(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: true }, null, 'km'),
  '100.0\u00A0km sampled. As it was, the whole way.',
  'statedDistanceKm null (no route-meta entry found): still states coveredKm plainly, not thrown, nothing to compare it against'
);

// unitSystem: mi conversion applies to both the sentence's own distance
// lead-in numbers and nothing else (band shares are unitless percentages).
equal(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: true }, 120, 'mi'),
  '62.1\u00A0mi of its 75\u00A0mi sampled. As it was, the whole way.',
  'unitSystem "mi", gap fires: lead-in numbers convert (100 km -> 62.1 mi, 120 km -> 75 mi rounded)'
);
equal(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: true }, null, 'mi'),
  '62.1\u00A0mi sampled. As it was, the whole way.',
  'unitSystem "mi", no statedDistanceKm: plain lead-in still converts (100 km -> 62.1 mi)'
);

console.log('\n=== darknessSummarySentence — heldOutValidation fails toward unvalidated, not trustworthy (Finding 5) ===\n');

// A missing field, or a non-boolean value that merely LOOKS like it means
// "false", must not be read as the literal boolean true — anything other
// than true marks the route unvalidated (dashed stroke + trailing clause),
// mirroring the identical !== true guard on js/daylight.js's renderRibbon.
ok(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: undefined }, null, 'km')
    .indexOf('Not checked against a ground reading') !== -1,
  'heldOutValidation undefined (field missing entirely): treated as unvalidated, trailing clause present'
);
ok(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: 'false' }, null, 'km')
    .indexOf('Not checked against a ground reading') !== -1,
  'heldOutValidation "false" (string, not the boolean false): treated as unvalidated, trailing clause present'
);
ok(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: 0 }, null, 'km')
    .indexOf('Not checked against a ground reading') !== -1,
  'heldOutValidation 0 (falsy, not the boolean false): treated as unvalidated, trailing clause present'
);
ok(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: false }, null, 'km')
    .indexOf('Not checked against a ground reading') !== -1,
  'heldOutValidation false (the real boolean): still unvalidated, trailing clause present — unchanged from before Finding 5'
);
ok(
  D.darknessSummarySentence({ values: gateFixtureValues, coveredKm: 100, stepKm: 1, positionalConfidence: { withinInterpolationLimit: true }, heldOutValidation: true }, null, 'km')
    .indexOf('Not checked against a ground reading') === -1,
  'heldOutValidation true (the real boolean): validated, no trailing clause'
);

// Purity: three identical calls must return byte-equal strings.
var s1 = D.darknessSummarySentence(shikokuArtifactForSentence, STATED_DISTANCE_KM['shikoku-88'], 'km');
var s2 = D.darknessSummarySentence(shikokuArtifactForSentence, STATED_DISTANCE_KM['shikoku-88'], 'km');
var s3 = D.darknessSummarySentence(shikokuArtifactForSentence, STATED_DISTANCE_KM['shikoku-88'], 'km');
ok(s1 === s2 && s2 === s3, 'darknessSummarySentence is pure (3x identical args -> identical result)');

/* =============================================
   Slice 3, Task 1 — stagePlacements (spec D3, D4; AC #3, #4, #5)

   Places each stage on the darkness artifact's kilometre axis, and says
   how many nights it is. Two placement methods, chosen per route by
   measurement rather than by a hardcoded route list:

     cumulative  — when the stage distances sum to coveredKm within 1 km
     span        — from the first and last waypoint's kmFromStart

   Shikoku needs the second: its distanceKm sum (907.3) under-counts the
   darkness axis (1080.5) by 173.2 km. Its stages are also 19-200 km, far
   too coarse to be nights, so they become blocks of round(spanKm / 25).
   ============================================= */

console.log('\n=== stagePlacements — placement method, extents and nights (D3, D4) ===\n');

var DAYLIGHT_DIR = path.join(__dirname, '..', 'assets', 'daylight');

function loadStages(routeId) {
  var raw = JSON.parse(fs.readFileSync(path.join(DAYLIGHT_DIR, routeId + '.json'), 'utf8'));
  return Object.keys(raw).map(function (k) { return raw[k]; });
}

// Six routes tile the darkness axis; shikoku does not. Audited in spec D4
// directly from the committed artifacts, and re-derived here so the
// assertion cannot drift from what ships.
var CUMULATIVE_ROUTES = ['camino-frances', 'camino-ingles', 'camino-norte',
                         'camino-portugues', 'camino-primitivo', 'kumano-kodo'];

CUMULATIVE_ROUTES.forEach(function (routeId) {
  var stages = loadStages(routeId);
  var covered = loadDarknessArtifact(routeId).coveredKm;
  var placed = D.stagePlacements(stages, covered);

  equal(placed.length, stages.length, routeId + ': one placement per stage');
  equal(placed[0].loKm, 0, routeId + ': first stage starts at km 0');

  var tiles = true, nightsAllOne = true;
  for (var i = 0; i < placed.length; i++) {
    if (placed[i].nights !== 1) nightsAllOne = false;
    if (i > 0 && Math.abs(placed[i].loKm - placed[i - 1].hiKm) > 1e-6) tiles = false;
  }
  ok(tiles, routeId + ': stages tile contiguously — no gap between one stage and the next');
  ok(nightsAllOne, routeId + ': every stage is exactly one night (D3, day-sized stages)');
  approx(placed[placed.length - 1].hiKm, covered, 1.0, routeId + ': last stage ends at coveredKm');
});

// No placement may run past the end of the darkness data on ANY route.
// "Tiles" is a tolerance, not an identity: kumano's stages sum to 38.5 km
// against a 38.0 km axis, so an unclamped last stage would end 0.5 km
// beyond the data and draw past the strip's right edge — the same shape
// as every other bug this page has shipped where correct arithmetic
// rendered somewhere a reader could not see it.
CUMULATIVE_ROUTES.concat(['shikoku-88']).forEach(function (routeId) {
  var covered = loadDarknessArtifact(routeId).coveredKm;
  var placed  = D.stagePlacements(loadStages(routeId), covered);
  var overrun = 0;
  placed.forEach(function (p) {
    if (p.hiKm > covered + 1e-9) overrun++;
    if (p.loKm < -1e-9) overrun++;
  });
  equal(overrun, 0, routeId + ': no placement runs outside [0, coveredKm]');
});

// Shikoku: waypoint-span placement, multi-night blocks, and real gaps.
var shikokuStages = loadStages('shikoku-88');
var shikokuCovered = loadDarknessArtifact('shikoku-88').coveredKm;
var shikokuPlaced = D.stagePlacements(shikokuStages, shikokuCovered);

equal(shikokuPlaced.length, 10, 'shikoku-88: ten placements');
approx(shikokuPlaced[0].loKm, 0, 0.05, 'shikoku-88: first stage starts at the first temple, km 0');
approx(shikokuPlaced[9].hiKm, 1080.5, 0.05, 'shikoku-88: last stage ends at the darkness axis end, 1080.5');

var shikokuGapKm = 0;
for (var sp = 1; sp < shikokuPlaced.length; sp++) {
  shikokuGapKm += Math.max(0, shikokuPlaced[sp].loKm - shikokuPlaced[sp - 1].hiKm);
}
approx(shikokuGapKm, 288.1, 0.2,
  'shikoku-88: 288.1 km between temple clusters is NOT placed (27% of the route, spec D4)');

var shikokuNights = shikokuPlaced.reduce(function (a, p) { return a + p.nights; }, 0);
equal(shikokuNights, 32, 'shikoku-88: 32 nights in total at 25 km/day');

var blockMin = Infinity, blockMax = 0;
shikokuPlaced.forEach(function (p) {
  if (p.nights < blockMin) blockMin = p.nights;
  if (p.nights > blockMax) blockMax = p.nights;
});
equal(blockMin, 1, 'shikoku-88: smallest block is 1 night');
equal(blockMax, 7, 'shikoku-88: largest block is 7 nights');

// Every placement must lie inside the axis it is placed on — a stage
// running past coveredKm would draw outside the strip.
var allInBounds = true;
shikokuPlaced.forEach(function (p) {
  if (p.loKm < 0 || p.hiKm > shikokuCovered + 1e-6 || p.hiKm <= p.loKm) allInBounds = false;
});
ok(allInBounds, 'shikoku-88: every placement is within [0, coveredKm] and has positive width');

// Neither method fits -> refuse, rather than silently drawing a wrong axis.
var unplaceable = [
  { index: 0, nameEn: 'A', distanceKm: 10 },
  { index: 1, nameEn: 'B', distanceKm: 10 }
];
var threw = false;
try { D.stagePlacements(unplaceable, 500); } catch (e) { threw = true; }
ok(threw, 'stagePlacements throws when distances do not tile and there are no waypoints');

// A route whose stages tile exactly must not be diverted to waypoint spans
// just because waypoints happen to exist (camino-frances has 9 of 33).
var francesPlaced = D.stagePlacements(loadStages('camino-frances'),
                                      loadDarknessArtifact('camino-frances').coveredKm);
approx(francesPlaced[0].hiKm, 24.2, 0.05,
  'camino-frances: cumulative placement wins even though some stages carry waypoints');

/* =============================================
   Slice 3, Task 2 — nightSchedule and nightMoonLux (spec D2, D3, D6)

   nightSchedule turns placements plus a start date into the cells the
   strip draws: one per placement, carrying the dates of the nights it
   spans. Six routes give one date per cell; shikoku's blocks give
   several, which is what lets D5 state a phase range instead of a phase.

   nightMoonLux is the honest quantity (D2): mean moon illuminance across
   astronomical night, not phase. A full moon that never rises gives no
   light, and encoding phase would say otherwise.
   ============================================= */

console.log('\n=== nightSchedule — cells, dates and night counts (D3, D6) ===\n');

var WALK_START = new Date('2026-10-12T12:00:00Z');

var francesStages   = loadStages('camino-frances');
var francesCovered  = loadDarknessArtifact('camino-frances').coveredKm;
var francesSchedule = D.nightSchedule(D.stagePlacements(francesStages, francesCovered), WALK_START);

equal(francesSchedule.length, 33, 'camino-frances: 33 cells, one per stage');
equal(francesSchedule.reduce(function (a, c) { return a + c.nights; }, 0), 33,
  'camino-frances: 33 nights in total');
equal(francesSchedule[0].firstNight, 1, 'camino-frances: first cell is night 1 (1-based)');
equal(francesSchedule[32].firstNight, 33, 'camino-frances: last cell is night 33');
equal(francesSchedule[0].dates.length, 1, 'camino-frances: a day-sized stage carries exactly one date');
ok(francesSchedule.every(function (c) { return c.isBlock === false; }),
  'camino-frances: no cell is a block');

// Dates advance one calendar day per night, from the start date.
var dayApart = true;
for (var ns = 1; ns < francesSchedule.length; ns++) {
  var delta = francesSchedule[ns].dates[0] - francesSchedule[ns - 1].dates[0];
  if (Math.abs(delta - 86400000) > 1000) dayApart = false;
}
ok(dayApart, 'camino-frances: each cell is one day after the last');
equal(francesSchedule[0].dates[0].toISOString().slice(0, 10), '2026-10-12',
  'camino-frances: night 1 is the start date');
equal(francesSchedule[14].dates[0].toISOString().slice(0, 10), '2026-10-26',
  'camino-frances: night 15 is 14 days after the start');

// Shikoku: blocks, and the night index accumulates across them.
var shikokuSchedule = D.nightSchedule(
  D.stagePlacements(loadStages('shikoku-88'), loadDarknessArtifact('shikoku-88').coveredKm),
  WALK_START);

equal(shikokuSchedule.length, 10, 'shikoku-88: ten cells');
equal(shikokuSchedule.reduce(function (a, c) { return a + c.nights; }, 0), 32,
  'shikoku-88: 32 nights across ten cells');
equal(shikokuSchedule[3].nights, 6, 'shikoku-88: the Temples 36-38 block is 6 nights');
equal(shikokuSchedule[3].dates.length, 6, 'shikoku-88: a 6-night block carries 6 dates');
ok(shikokuSchedule[3].isBlock, 'shikoku-88: a multi-night cell is flagged as a block');
ok(shikokuSchedule[5].isBlock === false, 'shikoku-88: a 1-night cell is not a block');

// Night numbering runs continuously through the blocks: 2,3,5,6,7,1,2,1,1,4
// nights per cell means the cells start at nights 1,3,6,11,17,24,25,27,28,29.
var EXPECTED_FIRST_NIGHT = [1, 3, 6, 11, 17, 24, 25, 27, 28, 29];
var firstNightsOk = shikokuSchedule.every(function (c, i) {
  return c.firstNight === EXPECTED_FIRST_NIGHT[i];
});
ok(firstNightsOk, 'shikoku-88: night numbering accumulates continuously across blocks');

console.log('\n=== nightMoonLux — moonlight across astronomical night, not phase (D2) ===\n');

// Night 15 of camino-frances: the meseta under a bright moon. Measured
// from the committed artifacts when this slice was specced.
var night15 = francesSchedule[14];
var stage15 = francesStages[14];
var moon15  = N.nightMoonLux(night15.dates[0], stage15.startLat, stage15.startLon);

approx(moon15.mean, 0.2333, 0.002, 'frances night 15: mean lux across the dark window');
approx(moon15.usableFrac, 1.0, 0.001, 'frances night 15: usable moonlight for the whole night');
ok(moon15.peak >= moon15.mean, 'frances night 15: peak lux is at least the mean');
approx(moon15.hours, 10.3, 0.5, 'frances night 15: the dark window is about ten hours');

// Night 27, O Cebreiro: the darkest sky of the route, and no moon at all.
var night27 = francesSchedule[26];
var stage27 = francesStages[26];
var moon27  = N.nightMoonLux(night27.dates[0], stage27.startLat, stage27.startLon);
ok(moon27.mean < 0.0005, 'frances night 27: effectively no moonlight (the best sky of the walk)');
equal(moon27.usableFrac, 0, 'frances night 27: no part of the night has usable moonlight');

// The whole walk spans a full lunation, which is what makes sliding the
// start date (D6) worth doing.
var means = francesSchedule.map(function (c, i) {
  return N.nightMoonLux(c.dates[0], francesStages[i].startLat, francesStages[i].startLon).mean;
});
var meanMin = Math.min.apply(null, means);
var meanMax = Math.max.apply(null, means);
ok(meanMin < 0.0005, 'camino-frances: the walk contains a night with no moon');
approx(meanMax, 0.2333, 0.002, 'camino-frances: the walk contains a night at full lantern');
ok(meanMax - meanMin > 0.2, 'camino-frances: 33 nights span a full lunation of moonlight');

// No astronomical night -> null, not NaN. Real routes never reach this
// (Camino Norte's northernmost point still gets 3.8h at midsummer), but
// the function is general and a NaN would render as a blank cell
// indistinguishable from shikoku's real unplaced gaps.
var noNight = N.nightMoonLux(new Date('2026-06-21T12:00:00Z'), 65.0, 25.7);
equal(noNight, null, 'nightMoonLux returns null where astronomical night never closes (65°N, midsummer)');

var shortNight = N.nightMoonLux(new Date('2026-06-21T12:00:00Z'), 43.5, -5.0);
ok(shortNight !== null && shortNight.hours > 3 && shortNight.hours < 5,
  'nightMoonLux still reports a short window (Camino Norte northernmost, midsummer, 3.8h)');

var m1 = N.nightMoonLux(night15.dates[0], stage15.startLat, stage15.startLon);
var m2 = N.nightMoonLux(night15.dates[0], stage15.startLat, stage15.startLon);
ok(m1.mean === m2.mean && m1.peak === m2.peak && m1.usableFrac === m2.usableFrac,
  'nightMoonLux is pure (identical args -> identical result)');

/* =============================================
   Slice 3, Task 3 — moonBandForLux, buildNightCells, selectNotableNights
   (spec D5, D7, D8)

   The strip's five steps sit on MoonLux.luxBracketFor's own boundaries
   rather than new ones, and a value exactly on a boundary takes the
   HIGHER band index — the same tie rule darknessBandForValue applies.

   selectNotableNights names at most two nights and suppresses either
   when the walk has not earned it. Both suppressions are load-bearing on
   real routes: camino-ingles has no lantern night, kumano has no darkest
   night. A clause invented for them would be a lie the reader cannot
   check.
   ============================================= */

console.log('\n=== moonBandForLux — five steps on luxBracketFor boundaries (D8) ===\n');

equal(N.moonBandForLux(0),       0, 'lux 0 -> band 0 (no moon at all)');
equal(N.moonBandForLux(0.001),   1, 'lux 0.001 -> band 1 (a trace)');
equal(N.moonBandForLux(0.005),   2, 'lux exactly 0.005 -> band 2 (boundary takes the higher band)');
equal(N.moonBandForLux(0.02),    2, 'lux 0.02 -> band 2');
equal(N.moonBandForLux(0.05),    3, 'lux exactly 0.05 -> band 3 (boundary takes the higher band)');
equal(N.moonBandForLux(0.1),     3, 'lux 0.1 -> band 3');
equal(N.moonBandForLux(0.2),     4, 'lux exactly 0.2 -> band 4 (boundary takes the higher band)');
equal(N.moonBandForLux(0.5),     4, 'lux 0.5 -> band 4 (enough to walk a known path)');

// The bands must agree with the prose brackets they are built from,
// or the strip and the sentence would describe different nights.
equal(MoonLuxRef.luxBracketFor(0.3).label, 'bright', 'band 4 territory is luxBracketFor bright');
equal(MoonLuxRef.luxBracketFor(0.1).label, 'mid',    'band 3 territory is luxBracketFor mid');
equal(MoonLuxRef.luxBracketFor(0.01).label, 'dim',   'band 2 territory is luxBracketFor dim');

console.log('\n=== buildNightCells / selectNotableNights — the two named nights (D5, D7) ===\n');

function cellsFor(routeId, startDate) {
  var stages   = loadStages(routeId);
  var artifact = loadDarknessArtifact(routeId);
  var runs     = D.mergeDarknessRuns(artifact.values, artifact.stepKm, artifact.coveredKm,
                                     D.darknessAggregateWindowKm(artifact.positionalConfidence));
  var schedule = D.nightSchedule(D.stagePlacements(stages, artifact.coveredKm), startDate);
  return N.buildNightCells(schedule, stages, runs);
}

var francesCells = cellsFor('camino-frances', WALK_START);
equal(francesCells.length, 33, 'camino-frances: 33 enriched cells');
ok(francesCells.every(function (c) { return typeof c.darkMean === 'number' && !isNaN(c.darkMean); }),
  'camino-frances: every cell carries a numeric darkness mean');
ok(francesCells.every(function (c) { return c.moon !== null; }),
  'camino-frances: every cell has a resolvable dark window');

var francesNotable = N.selectNotableNights(francesCells);
equal(francesNotable.sky.firstNight, 27,
  'camino-frances: the sky night is night 27, O Cebreiro — darkest, and no moon');
equal(francesNotable.lantern.firstNight, 15,
  'camino-frances: the lantern night is night 15, the meseta at full moon');
ok(francesNotable.sky.moon.usableFrac === 0,
  'camino-frances: the sky night has no usable moonlight by construction');
ok(francesNotable.lantern.moon.usableFrac > 0,
  'camino-frances: the lantern night does have usable moonlight');

// The sky night must be the darkest AMONG MOONLESS nights, not the
// darkest outright — a dark site under a full moon is not a good sky.
//
// Asserting this on the 12 October walk proves nothing: night 27 is both
// the darkest overall AND moonless, so restricting to moonless nights
// cannot change the answer and the assertion passes even when the filter
// is deleted (verified by mutation). Starting thirteen days later the
// moon has caught up with O Cebreiro — night 27 is still the darkest at
// 3.97, but now carries usable moonlight for 72% of the night, and the
// sky night must move to the darkest night that is genuinely moonless.
var lateStart  = new Date('2026-10-25T12:00:00Z');
var lateCells  = cellsFor('camino-frances', lateStart);
var lateSky    = N.selectNotableNights(lateCells).sky;
var lateDarkest = lateCells.reduce(function (a, c) { return c.darkMean > a.darkMean ? c : a; });

equal(lateDarkest.firstNight, 27, 'frances from 25 Oct: night 27 is still the darkest place on the route');
approx(lateDarkest.moon.usableFrac, 0.72, 0.02, 'frances from 25 Oct: but night 27 is now moonlit for most of the night');
equal(lateSky.firstNight, 11, 'frances from 25 Oct: the sky night moves to night 11, the darkest MOONLESS night');
equal(lateSky.moon.usableFrac, 0, 'frances from 25 Oct: the chosen sky night has no usable moonlight');
ok(lateSky.darkMean < lateDarkest.darkMean,
  'frances from 25 Oct: the sky night is deliberately NOT the darkest place — the moon disqualified it');

// camino-ingles: six nights is a fifth of a lunation and it peaks at
// 0.0067 lux. There is no lantern night, so there is no lantern clause.
var inglesCells    = cellsFor('camino-ingles', WALK_START);
var inglesNotable  = N.selectNotableNights(inglesCells);
var inglesPeak     = Math.max.apply(null, inglesCells.map(function (c) { return c.moon.peak; }));
ok(inglesPeak < 0.05, 'camino-ingles: no night anywhere reaches usable moonlight (peak ' + inglesPeak.toFixed(4) + ')');
equal(inglesNotable.lantern, null, 'camino-ingles: the lantern clause is suppressed, not fabricated');
ok(inglesNotable.sky !== null, 'camino-ingles: the sky clause still stands (1.93 bands of spread)');

// kumano-kodo: one flat band on all four nights. There is no darkest
// night to name.
var kumanoCells   = cellsFor('kumano-kodo', WALK_START);
var kumanoNotable = N.selectNotableNights(kumanoCells);
var kumanoSpread  = Math.max.apply(null, kumanoCells.map(function (c) { return c.darkMean; }))
                  - Math.min.apply(null, kumanoCells.map(function (c) { return c.darkMean; }));
ok(kumanoSpread < 1.0, 'kumano-kodo: darkness spread is under one band (' + kumanoSpread.toFixed(2) + ')');
equal(kumanoNotable.sky, null, 'kumano-kodo: the sky clause is suppressed — no night is darker than another');

// A one-night walk can make no comparison at all.
//
// Deliberately night 15, not night 1: night 1's moon.peak is exactly 0,
// so the lantern gate (peak >= 0.05) would suppress the clause on its
// own and the one-night rule underneath it was never tested. Verified by
// mutation — with `usable.length < 2` loosened to `< 1`, night 1 stayed
// green and night 15 goes red.
var oneNightCell = francesCells[14];
ok(oneNightCell.moon.peak >= N.USABLE_LUX,
  'fixture sanity: the one-night fixture has real moonlight (peak ' + oneNightCell.moon.peak.toFixed(4)
    + ' lux), so only the one-night rule can suppress its lantern clause');
var oneNight = N.selectNotableNights([oneNightCell]);
equal(oneNight.sky, null, 'a one-night walk names no sky night');
equal(oneNight.lantern, null, 'a one-night walk names no lantern night');

// Shikoku's blocks carry the phase at their first and last night, which
// is what D5 states instead of a single phase. Asserted through the
// PROSE below rather than here: two `typeof === 'number'` checks used to
// stand in for AC #6, and they were the reason phaseFirst/phaseLast were
// computed on every cell for three commits and read by nothing a reader
// could see.
var shikokuCells = cellsFor('shikoku-88', WALK_START);
var block = shikokuCells[3];
ok(block.isBlock, 'shikoku-88: cell 3 is a block');
ok(Math.abs(block.phaseLast - block.phaseFirst) > 0.1,
  'shikoku-88: the 6-night block spans a real stretch of the lunation');

/* =============================================
   Slice 3, Task 4 — nightSummarySentence (spec D5, D7, D10; AC #11, #13)

   The sentence is the strip's text equivalent, so its hardest
   requirement is the one the ribbon learned the expensive way: every
   night it names must be a night the strip actually draws. The parse-back
   check below reads the night numbers back out of the finished prose and
   demands a cell for each.
   ============================================= */

console.log('\n=== nightSummarySentence — and the nights it names are the nights drawn ===\n');

function sentenceFor(routeId, startDate) {
  var cells    = cellsFor(routeId, startDate);
  var artifact = loadDarknessArtifact(routeId);
  var notable  = N.selectNotableNights(cells);
  return {
    cells:   cells,
    notable: notable,
    text:    N.nightSummarySentence(cells, notable, startDate,
                                    artifact.coveredKm, artifact.heldOutValidation)
  };
}

var francesSent = sentenceFor('camino-frances', WALK_START);

ok(francesSent.text.indexOf('33 nights from 12 October') === 0,
  'camino-frances: opens with the walk length and start date');
ok(francesSent.text.indexOf('night 27') !== -1, 'camino-frances: names night 27 as the sky night');
ok(francesSent.text.indexOf('O Cebreiro') !== -1, 'camino-frances: names where night 27 is');
ok(francesSent.text.indexOf('Night 15 holds') !== -1,
  'camino-frances: names night 15 as the lantern night, with singular agreement');

// A block is plural, and the prose has to agree with itself.
var shikokuLanternSent = sentenceFor('shikoku-88', WALK_START).text;
ok(shikokuLanternSent.indexOf('hold usable moonlight') !== -1,
  'shikoku-88: a multi-night block reads "Nights 11 to 16 hold", not "holds"');
ok(shikokuLanternSent.indexOf('holds usable') === -1,
  'shikoku-88: no singular verb on a plural block');

// AC #11 — the stated-vs-drawn check. Read every night number back out
// of the prose and demand a cell that starts on it. The ribbon shipped a
// sentence whose percentages disagreed with its own strip; this is the
// same class of defect one layer up.
// Case-INSENSITIVE deliberately. The lantern clause starts a sentence, so
// it reads "Night 15 holds..." — a case-sensitive regex silently skipped
// it and this whole check passed while only ever examining the sky night.
function namedNights(text) {
  var out = [], m, re = /nights? (\d+)(?: to (\d+))?/gi;
  while ((m = re.exec(text)) !== null) {
    out.push(parseInt(m[1], 10));
    if (m[2]) out.push(parseInt(m[2], 10));
  }
  return out;
}

var ALL_ROUTES = CUMULATIVE_ROUTES.concat(['shikoku-88']);
ALL_ROUTES.forEach(function (routeId) {
  var s = sentenceFor(routeId, WALK_START);
  ok(s.text.length > 0, routeId + ': produces a sentence');

  var totalNights = s.cells.reduce(function (a, c) { return a + c.nights; }, 0);
  ok(s.text.indexOf(totalNights + ' nights') !== -1 || totalNights === 1,
    routeId + ': states its own night count (' + totalNights + ')');

  // Every night named must start a real cell, and must be inside the walk.
  // No filter: one used to drop `n === totalNights`, meant to skip the
  // lead-in count — but the regex needs the word BEFORE the digits, so
  // "11 nights from" never matched it in the first place. All it removed
  // were legitimately named nights, and on camino-portugues and
  // camino-primitivo the lantern night IS night 11 of 11, so this check
  // had never once run on those two routes.
  var named = namedNights(s.text);
  var starts = {}, spans = {};
  s.cells.forEach(function (c) {
    starts[c.firstNight] = true;
    for (var k = 0; k < c.nights; k++) spans[c.firstNight + k] = true;
  });
  var allDrawn = named.every(function (n) { return spans[n] === true; });
  ok(allDrawn, routeId + ': every night named in the prose is a night the strip draws');
  ok(named.every(function (n) { return n >= 1 && n <= totalNights; }),
    routeId + ': every night named is inside the walk');
  // The check has to have something to check. A filter that emptied
  // `named` would leave every assertion above vacuously true.
  // kumano-kodo is the one route that legitimately names nothing: its
  // sky clause is suppressed by AC #10 and its lantern by AC #9.
  if (routeId === 'kumano-kodo') {
    equal(named.length, 0, routeId + ': names no night at all — both clauses are suppressed');
  } else {
    ok(named.length > 0, routeId + ': the parse-back examined at least one named night');
  }
  if (routeId === 'camino-portugues' || routeId === 'camino-primitivo') {
    ok(named.indexOf(totalNights) !== -1,
      routeId + ': night ' + totalNights + ' of ' + totalNights + ' is among the nights checked — '
        + 'this route\'s lantern night is the last one, and the old filter dropped exactly it');
  }
});

// kumano-kodo: flat band, so no sky clause may appear in the prose —
// not merely a null in the selection.
var kumanoSent = sentenceFor('kumano-kodo', WALK_START);
ok(kumanoSent.text.indexOf('Darkest sky') === -1,
  'kumano-kodo: the prose contains no darkest-sky claim');
ok(kumanoSent.text.indexOf('4 nights') !== -1, 'kumano-kodo: still states its length');

// camino-ingles: no lantern clause in the prose.
var inglesSent = sentenceFor('camino-ingles', WALK_START);
ok(inglesSent.text.indexOf('moonlight') === -1,
  'camino-ingles: the prose promises no moonlight it cannot deliver');
ok(inglesSent.text.indexOf('Darkest sky') !== -1,
  'camino-ingles: but it does still name a darkest sky');

// shikoku-88: blocks read as ranges, and the unplaced quarter is stated
// rather than left for the reader to notice as a gap-riddled strip.
var shikokuSent = sentenceFor('shikoku-88', WALK_START);
ok(/nights \d+ to \d+/.test(shikokuSent.text),
  'shikoku-88: a multi-night block is named as a range, not a single night');
ok(shikokuSent.text.indexOf('between temple clusters') !== -1,
  'shikoku-88: the prose says why a quarter of the strip is empty');
ok(shikokuSent.text.indexOf('32 nights') !== -1, 'shikoku-88: states 32 nights');

var t1 = sentenceFor('camino-frances', WALK_START).text;
var t2 = sentenceFor('camino-frances', WALK_START).text;
ok(t1 === t2, 'nightSummarySentence is pure (identical args -> identical result)');

/* =============================================
   AC #6 — a named block STATES the phase range its nights span.

   D5 and AC #6 both require this and only the shorter stroke shipped;
   phaseFirst/phaseLast were computed on every cell and read by nothing
   but two `typeof === 'number'` assertions. Correct arithmetic, nothing
   a reader or a screen reader could reach.
   ============================================= */

console.log('\n=== a named block states the phase its nights span (D5, AC #6) ===\n');

var PHASE_WORDS = /(new moon|waxing crescent|first quarter|waxing gibbous|full moon|waning gibbous|last quarter|waning crescent)/;

ok(PHASE_WORDS.test(shikokuSent.text),
  'shikoku-88: the sentence names a moon phase for its blocks: ' + JSON.stringify(shikokuSent.text));
ok(/Nights 11 to 16, waxing gibbous to full moon, hold/.test(shikokuSent.text),
  'shikoku-88: the lantern block states the stretch of lunation it spans, inside its own clause');
ok(/Darkest sky on nights 3 to 5, [^,]+, waxing crescent, with/.test(shikokuSent.text),
  'shikoku-88: the sky block states its phase too — a block whose first and last night share an eighth states that one name');

// The invariant, not one pinned date: a named night states a phase when
// and only when it is a block. A single night is one phase, and saying
// so would be noise D7 does not spend.
var PHASE_START_DATES = ['2026-01-16', '2026-03-02', '2026-04-19', '2026-06-21',
                         '2026-08-08', '2026-10-12', '2026-11-30'];
var blocksNamed = 0, singlesNamed = 0, blocksSilent = 0;
ALL_ROUTES.forEach(function (routeId) {
  PHASE_START_DATES.forEach(function (iso) {
    var s = sentenceFor(routeId, new Date(iso + 'T12:00:00Z'));
    [s.notable.sky, s.notable.lantern].forEach(function (cell) {
      if (!cell) return;
      // The clause for THIS night, sliced out of the sentence by the
      // night label it opens with, so a phase in the other clause cannot
      // stand in for a missing one here.
      var label  = cell.nights > 1
        ? 'ights ' + cell.firstNight + ' to ' + (cell.firstNight + cell.nights - 1)
        : 'ight ' + cell.firstNight;
      var at     = s.text.toLowerCase().indexOf(label.toLowerCase());
      var clause = at === -1 ? '' : s.text.slice(at, s.text.indexOf('.', at));
      ok(at !== -1, routeId + ' ' + iso + ': the named night appears in the prose');
      if (cell.isBlock) {
        if (PHASE_WORDS.test(clause.toLowerCase())) blocksNamed++; else blocksSilent++;
        ok(PHASE_WORDS.test(clause.toLowerCase()),
          routeId + ' ' + iso + ': the named block states its phase — ' + JSON.stringify(clause));
      } else {
        if (PHASE_WORDS.test(clause.toLowerCase())) singlesNamed++;
        ok(!PHASE_WORDS.test(clause.toLowerCase()),
          routeId + ' ' + iso + ': a single night states no phase range — ' + JSON.stringify(clause));
      }
    });
  });
});
ok(blocksNamed > 0, 'the block branch was actually exercised (' + blocksNamed + ' named blocks across the sweep)');
equal(blocksSilent, 0, 'no named block went out without stating a phase');
equal(singlesNamed, 0, 'no single night was given a phase range it does not span');

/* =============================================
   F3 — the sky clause's words and the band the strip paints are the
   same reading.

   Selection gates on usableFrac === 0; the strip draws
   moonBandForLux(mean). Those are different questions, and the prose
   asked the first while the strip answered the second: over 475 real
   sky clauses swept below, only 27.6% of the old unconditional "with no
   moon" landed on a band-0 cell. Half landed on band 1 and 22.5% on
   band 2 — which luxBracketFor itself calls "barely usable; carry a
   headlamp".
   ============================================= */

console.log('\n=== the sky clause says what the strip paints (F3) ===\n');

var SKY_PHRASE_BY_BAND = ['with no moon', 'with barely a trace of moon', 'with only a dim moon'];

var sweptClauses = 0, sweptMismatch = 0, sweptWrongPhrase = 0;
var bandTally = [0, 0, 0, 0, 0];
ALL_ROUTES.forEach(function (routeId) {
  for (var day = 0; day < 366; day += 4) {
    var start = new Date(Date.UTC(2026, 0, 1, 12) + day * 86400000);
    var s = sentenceFor(routeId, start);
    if (!s.notable.sky) continue;
    sweptClauses++;
    bandTally[s.notable.sky.moonBand]++;
    var expected = SKY_PHRASE_BY_BAND[s.notable.sky.moonBand];
    if (!expected || s.text.indexOf(expected) === -1) sweptMismatch++;
    SKY_PHRASE_BY_BAND.forEach(function (phrase, band) {
      if (band !== s.notable.sky.moonBand && s.text.indexOf(phrase) !== -1) sweptWrongPhrase++;
    });
  }
});

ok(sweptClauses > 400, 'the sweep produced a real population of sky clauses (' + sweptClauses + ')');
equal(sweptMismatch, 0,
  'every sky clause across 7 routes x 92 start dates states the phrase for its own moon band');
equal(sweptWrongPhrase, 0, 'no sky clause states a phrase belonging to a band it is not on');
ok(bandTally[0] > 0 && bandTally[1] > 0 && bandTally[2] > 0,
  'all three reachable bands occur in the sweep (0: ' + bandTally[0] + ', 1: ' + bandTally[1]
    + ', 2: ' + bandTally[2] + ') — the wording is discriminating, not one branch');
equal(bandTally[3] + bandTally[4], 0,
  'bands 3 and 4 never occur for a sky night, so no wording is written for them '
    + '(usableFrac === 0 caps every sample under 0.05 lux, so the mean is too)');

/* =============================================
   F9 — the sky clause carries the ribbon's own validation caveat.

   "Darkest sky on nights 3 to 5" ranks one stretch of shikoku against
   another from data that is 49.8% interpolated and has never been
   checked against a ground reading. The ribbon one section above says
   exactly that about the same numbers; this comparative claim went out
   bare. The lantern clause is pure astronomy and needs no caveat.
   ============================================= */

console.log('\n=== the sky superlative carries a validation caveat where the ribbon does (F9) ===\n');

var CAVEAT = 'on darkness no ground reading has checked';

ok(shikokuSent.text.indexOf(CAVEAT) !== -1,
  'shikoku-88: the sky clause is qualified — its darkness has no held-out validation');
ok(shikokuSent.text.indexOf('Not checked against a ground reading here') === -1,
  'shikoku-88: one clause, not a second copy of the ribbon\'s whole sentence');

CUMULATIVE_ROUTES.filter(function (r) { return r !== 'kumano-kodo'; }).forEach(function (routeId) {
  var s = sentenceFor(routeId, WALK_START);
  ok(s.notable.sky !== null, routeId + ': fixture sanity — this route does name a sky night');
  ok(s.text.indexOf(CAVEAT) === -1,
    routeId + ': a validated route carries no caveat — the five Caminos have ground readings');
});

// kumano-kodo is the other unvalidated artifact, and it can never carry
// the caveat: its darkness spread is under one band on every date, so
// AC #10 suppresses the sky clause outright and there is nothing to
// qualify. Asserted rather than left as a silent gap in the sweep above.
var kumanoArtifact = loadDarknessArtifact('kumano-kodo');
equal(kumanoArtifact.heldOutValidation, false, 'kumano-kodo: fixture sanity — unvalidated artifact');
ok(kumanoSent.notable.sky === null && kumanoSent.text.indexOf(CAVEAT) === -1,
  'kumano-kodo: no sky clause on an unvalidated route means no caveat either — there is no claim to qualify');

// The distinction the ribbon once failed open on: `!== true`, not
// `=== false`. A missing or malformed field must read as unvalidated.
var francesCellsForCaveat = cellsFor('camino-frances', WALK_START);
var francesNotableForCaveat = N.selectNotableNights(francesCellsForCaveat);
[undefined, null, false, 'true', 1].forEach(function (value) {
  var text = N.nightSummarySentence(francesCellsForCaveat, francesNotableForCaveat,
                                    WALK_START, 763.7, value);
  ok(text.indexOf(CAVEAT) !== -1,
    'heldOutValidation ' + JSON.stringify(value) + ' reads as unvalidated and carries the caveat');
});
ok(N.nightSummarySentence(francesCellsForCaveat, francesNotableForCaveat, WALK_START, 763.7, true)
   .indexOf(CAVEAT) === -1,
  'only the literal boolean true drops the caveat');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
