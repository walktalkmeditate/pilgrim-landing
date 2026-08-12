/* =============================================
   Daylight Walk Budget — renderSVG test harness

   Run via:  node js/daylight-render.test.js

   renderSVG had no test at all before this file. That's how three
   coordinate-system bugs survived fifteen green suites: a previous
   change widened the bar's time domain from [sunrise, sunset] to
   [earliest twilight − 30 min, latest twilight + 30 min] and updated
   eight utcToBarX call sites — but left BAR_X1/BAR_X2 literals behind
   at three more: the dl-bar-daylight fill, the sunrise/sunset ticks +
   labels (both the forward branch and the reverse-mode
   latestDepartUTC===null branch), and the reverse-mode buffer band.
   Those literals used to equal sunrise/sunset exactly, back when the
   domain WAS [sunrise, sunset] — now they're just the bar's pixel
   edges.

   renderSVG reaches document.createElementNS directly (makeSVGEl,
   clearSVG, the <title> element), and there's no DOM in Node, so this
   file installs a minimal fake document before requiring daylight.js.
   window is left unset, so daylight.js's browser-only DOM-glue block
   (guarded by `typeof window === 'undefined' || ...`) still exits at
   load time — only renderSVG's own document use is exercised here.
   ============================================= */

'use strict';

function makeNode(tag) {
  var node = {
    tag: tag,
    attrs: {},
    textContent: '',
    children: [],
    firstChild: null,
    setAttribute: function (name, value) { node.attrs[name] = value; },
    appendChild: function (child) {
      node.children.push(child);
      node.firstChild = node.children[0];
      return child;
    },
    removeChild: function (child) {
      var idx = node.children.indexOf(child);
      if (idx !== -1) node.children.splice(idx, 1);
      node.firstChild = node.children.length ? node.children[0] : null;
      return child;
    }
  };
  return node;
}

global.document = {
  createElementNS: function (ns, tag) { return makeNode(tag); }
};

var Daylight     = require('./daylight.js');
var DaylightMath = require('./daylight-math.js');

var passed   = 0;
var failed   = 0;
var failures = [];

function fmtVal(v) {
  return (typeof v === 'number') ? v.toFixed(2) : String(v);
}

function equal(actual, expected, label) {
  if (actual === expected) {
    passed++;
    console.log('  ✓ ' + label + '  (' + fmtVal(actual) + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + fmtVal(expected) + ', got ' + fmtVal(actual));
    console.log('  ✗ ' + label + '  (' + fmtVal(actual) + ' vs ' + fmtVal(expected) + ')');
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

// Independent oracle for expected pixel positions. renderSVG's own
// utcToBarX is module-private (exporting it would be more
// restructuring than this fix calls for) — this mirrors its formula
// exactly, against the same BAR_X1/BAR_X2 the bug report names, so a
// leftover bar-edge literal and a correct utcToBarX call disagree here too.
var BAR_X1 = 24;
var BAR_X2 = 576;
var BAR_W  = BAR_X2 - BAR_X1;
var BAR_Y  = 52;

function expectedBarX(utcDate, domain) {
  var span = domain.endUTC.getTime() - domain.startUTC.getTime();
  if (span <= 0) return BAR_X1;
  var t = utcDate.getTime() - domain.startUTC.getTime();
  var frac = Math.max(0, Math.min(1, t / span));
  return BAR_X1 + frac * BAR_W;
}

function byClass(svgEl, cls) {
  return svgEl.children.filter(function (c) { return c.attrs['class'] === cls; });
}

function oneByClass(svgEl, cls) {
  var found = byClass(svgEl, cls);
  return found.length ? found[0] : null;
}

// --- Fixtures: Burgos (42.34, -3.70), 2026-09-15 --------------------
// Same coordinates/date as the barDomainUTC fixture in
// js/daylight-math.test.js — full twilight sequence present.

var burgosForward = {
  route: 'custom', customLat: '42.34', customLon: '-3.70',
  customDistance: '20', customElevGain: '0',
  date: '2026-09-15', paceKey: 'standard', startTimeMin: 9 * 60,
  mode: 'forward'
};

var burgosReverse = {
  route: 'custom', customLat: '42.34', customLon: '-3.70',
  customDistance: '20', customElevGain: '0',
  date: '2026-09-15', paceKey: 'standard', bufferMin: 60,
  mode: 'reverse'
};

var burgosReverseNoBuffer = {
  route: 'custom', customLat: '42.34', customLon: '-3.70',
  customDistance: '20', customElevGain: '0',
  date: '2026-09-15', paceKey: 'standard', bufferMin: 0,
  mode: 'reverse'
};

// 100 km can't fit before sunset even with the buffer — exercises the
// reverse-mode `latestDepartUTC === null` branch, which duplicates the
// sunrise/sunset tick + label block.
var burgosReverseTooLong = {
  route: 'custom', customLat: '42.34', customLon: '-3.70',
  customDistance: '100', customElevGain: '0',
  date: '2026-09-15', paceKey: 'standard', bufferMin: 60,
  mode: 'reverse'
};

console.log('\n=== renderSVG — dl-bar-daylight spans sunrise -> sunset, not the bar edges ===\n');

var fwdOut    = Daylight.recompute(burgosForward);
var fwdDomain = DaylightMath.barDomainUTC(fwdOut);
var sunriseX  = expectedBarX(fwdOut.sunriseUTC, fwdDomain);
var sunsetX   = expectedBarX(fwdOut.sunsetUTC,  fwdDomain);

var svgFwd = makeNode('svg');
Daylight.renderSVG(fwdOut, svgFwd, fwdOut.stageTz || null, '24h');

var daylightBand = oneByClass(svgFwd, 'dl-bar-daylight');
ok(daylightBand !== null, 'dl-bar-daylight element is present');
equal(daylightBand.attrs.x1, sunriseX, 'dl-bar-daylight x1 = sunriseX (not BAR_X1=24)');
equal(daylightBand.attrs.x2, sunsetX,  'dl-bar-daylight x2 = sunsetX (not BAR_X2=576)');

console.log('\n=== renderSVG — sunrise/sunset ticks + labels sit at sunrise/sunset, not the bar edges (forward mode) ===\n');

var tickSunrise = oneByClass(svgFwd, 'dl-bar-tick-sunrise');
var tickSunset  = oneByClass(svgFwd, 'dl-bar-tick-sunset');
var labels      = byClass(svgFwd, 'dl-bar-label');

ok(tickSunrise !== null, 'dl-bar-tick-sunrise element is present');
ok(tickSunset  !== null, 'dl-bar-tick-sunset element is present');
equal(tickSunrise.attrs.x1, sunriseX, 'dl-bar-tick-sunrise x1 = utcToBarX(sunrise, domain)');
equal(tickSunrise.attrs.x2, sunriseX, 'dl-bar-tick-sunrise x2 = utcToBarX(sunrise, domain)');
equal(tickSunset.attrs.x1,  sunsetX,  'dl-bar-tick-sunset x1 = utcToBarX(sunset, domain)');
equal(tickSunset.attrs.x2,  sunsetX,  'dl-bar-tick-sunset x2 = utcToBarX(sunset, domain)');

ok(labels.length === 2, 'exactly two dl-bar-label elements (sunrise, sunset)');
if (labels.length === 2) {
  equal(labels[0].attrs.x, tickSunrise.attrs.x1, 'sunrise label x matches its tick x');
  equal(labels[1].attrs.x, tickSunset.attrs.x1,  'sunset label x matches its tick x');
}

console.log('\n=== renderSVG — sunrise/sunset ticks + labels, reverse-mode latestDepartUTC===null branch ===\n');

var tooLongOut    = Daylight.recompute(burgosReverseTooLong);
var tooLongDomain = DaylightMath.barDomainUTC(tooLongOut);
ok(tooLongOut.latestDepartUTC === null, 'fixture sanity: 100 km reverse walk has latestDepartUTC null');

var sunriseX2 = expectedBarX(tooLongOut.sunriseUTC, tooLongDomain);
var sunsetX2  = expectedBarX(tooLongOut.sunsetUTC,  tooLongDomain);

var svgTooLong = makeNode('svg');
Daylight.renderSVG(tooLongOut, svgTooLong, tooLongOut.stageTz || null, '24h');

var tickSunrise2 = oneByClass(svgTooLong, 'dl-bar-tick-sunrise');
var tickSunset2  = oneByClass(svgTooLong, 'dl-bar-tick-sunset');
var labels2      = byClass(svgTooLong, 'dl-bar-label');

equal(tickSunrise2.attrs.x1, sunriseX2, 'reverse-null branch: dl-bar-tick-sunrise x1 = utcToBarX(sunrise, domain)');
equal(tickSunset2.attrs.x1,  sunsetX2,  'reverse-null branch: dl-bar-tick-sunset x1 = utcToBarX(sunset, domain)');
if (labels2.length === 2) {
  equal(labels2[0].attrs.x, tickSunrise2.attrs.x1, 'reverse-null branch: sunrise label x matches its tick x');
  equal(labels2[1].attrs.x, tickSunset2.attrs.x1,  'reverse-null branch: sunset label x matches its tick x');
}

console.log('\n=== renderSVG — reverse-mode buffer band terminates at sunset, not the bar edge ===\n');

var revOut    = Daylight.recompute(burgosReverse);
var revDomain = DaylightMath.barDomainUTC(revOut);
ok(revOut.latestDepartUTC !== null, 'fixture sanity: 20 km reverse walk fits, latestDepartUTC is set');
var sunsetX3 = expectedBarX(revOut.sunsetUTC, revDomain);

var svgRev = makeNode('svg');
Daylight.renderSVG(revOut, svgRev, revOut.stageTz || null, '24h');

var buffer = oneByClass(svgRev, 'dl-bar-buffer');
ok(buffer !== null, 'dl-bar-buffer element is present for a 60-min buffer');
if (buffer) {
  equal(buffer.attrs.x2, sunsetX3, 'dl-bar-buffer x2 = sunsetX (not BAR_X2=576)');
}

console.log('\n=== renderSVG — bufferMin=0 emits no phantom buffer band ===\n');

var revNoBufOut = Daylight.recompute(burgosReverseNoBuffer);
var svgRevNoBuf = makeNode('svg');
Daylight.renderSVG(revNoBufOut, svgRevNoBuf, revNoBufOut.stageTz || null, '24h');
ok(byClass(svgRevNoBuf, 'dl-bar-buffer').length === 0, 'bufferMin=0: no dl-bar-buffer element emitted');

console.log('\n=== renderSVG — twilight bands nest strictly: daylight ⊂ civil ⊂ nautical ⊂ astronomical ⊂ domain ===\n');

var civil        = oneByClass(svgFwd, 'dl-bar-civil');
var nautical     = oneByClass(svgFwd, 'dl-bar-nautical');
var astronomical = oneByClass(svgFwd, 'dl-bar-astronomical');

ok(civil !== null && nautical !== null && astronomical !== null,
  'civil/nautical/astronomical bands are all present (Burgos has the full twilight sequence)');

if (civil && nautical && astronomical) {
  ok(
    BAR_X1                <  astronomical.attrs.x1 &&
    astronomical.attrs.x1 <  nautical.attrs.x1     &&
    nautical.attrs.x1     <  civil.attrs.x1         &&
    civil.attrs.x1        <  daylightBand.attrs.x1,
    'left side nests: domain start < astronomical < nautical < civil < daylight'
  );
  ok(
    daylightBand.attrs.x2 <  civil.attrs.x2         &&
    civil.attrs.x2        <  nautical.attrs.x2      &&
    nautical.attrs.x2     <  astronomical.attrs.x2  &&
    astronomical.attrs.x2 <  BAR_X2,
    'right side nests: daylight < civil < nautical < astronomical < domain end'
  );
}

console.log('\n=== renderSVG — dark-adaptation mark clears the bar edge, own label row (Finding 8) ===\n');

var adaptTick = oneByClass(svgFwd, 'dl-bar-tick-adapt');
var adaptLbl  = oneByClass(svgFwd, 'dl-bar-label-adapt');
var nowLabelRow  = BAR_Y - 14;
var edgeLabelRow = BAR_Y + 22;

ok(adaptTick !== null, 'Burgos: dl-bar-tick-adapt element is present (astronomical dusk occurs)');
if (adaptTick) {
  ok(BAR_X2 - adaptTick.attrs.x1 >= 20,
    'Burgos: dl-bar-tick-adapt is at least 20px inside the right edge (BAR_X2=576), got x=' + adaptTick.attrs.x1.toFixed(2));
}
ok(adaptLbl !== null, 'Burgos: dl-bar-label-adapt element is present');
if (adaptLbl) {
  ok(adaptLbl.attrs.y !== nowLabelRow,
    'dl-bar-label-adapt y does not share the "now" label row (BAR_Y-14=' + nowLabelRow + '), got y=' + adaptLbl.attrs.y);
  ok(adaptLbl.attrs.y !== edgeLabelRow,
    'dl-bar-label-adapt y does not share the sunrise/sunset label row (BAR_Y+22=' + edgeLabelRow + '), got y=' + adaptLbl.attrs.y);
}

// Same property across a spread of latitudes and hemispheres. The mark's
// offset from astronomicalDusk is fixed in time (BAR_DOMAIN_MARGIN_MS −
// DARK_ADAPT_MIN = 40 min), but the bar's ms-per-pixel varies with each
// place's twilight-sequence length, so clearing 20px isn't proven by the
// Burgos case alone — this is the same location set Finding 8 was measured
// against.
var adaptLocations = [
  { name: 'equator',  lat: '0',       lon: '0' },
  { name: 'Santiago', lat: '-33.45',  lon: '-70.67' },
  { name: 'Tokyo',    lat: '35.6762', lon: '139.6503' },
  { name: 'Ushuaia',  lat: '-54.8',   lon: '-68.3' }
];

adaptLocations.forEach(function (loc) {
  var out = Daylight.recompute({
    route: 'custom', customLat: loc.lat, customLon: loc.lon,
    customDistance: '20', customElevGain: '0',
    date: '2026-09-15', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
  });
  var svg = makeNode('svg');
  Daylight.renderSVG(out, svg, out.stageTz || null, '24h');
  var tick = oneByClass(svg, 'dl-bar-tick-adapt');
  ok(tick !== null, loc.name + ': dl-bar-tick-adapt is present');
  if (tick) {
    ok(BAR_X2 - tick.attrs.x1 >= 20,
      loc.name + ': dl-bar-tick-adapt is at least 20px inside the right edge, got x=' + tick.attrs.x1.toFixed(2));
  }
});

console.log('\n=== renderSVG — moon band never overlaps daylight (Finding 9) ===\n');

// The finding's own reproduction: 2026-09-19 at Burgos used to emit a
// "mid" run ("usable light along an open trail") that ran into
// mid-afternoon, well before sunset (18:19:43Z that day).
var sep19Out    = Daylight.recompute({
  route: 'custom', customLat: '42.34', customLon: '-3.70',
  customDistance: '20', customElevGain: '0',
  date: '2026-09-19', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
});
var sep19Domain = DaylightMath.barDomainUTC(sep19Out);
var sep19SunriseX = expectedBarX(sep19Out.sunriseUTC, sep19Domain);
var sep19SunsetX  = expectedBarX(sep19Out.sunsetUTC,  sep19Domain);

var svgSep19 = makeNode('svg');
Daylight.renderSVG(sep19Out, svgSep19, null, '24h');
var sep19MoonLines = byClass(svgSep19, 'dl-bar-moonlight');

ok(sep19MoonLines.length > 0, '2026-09-19 Burgos: moon band still renders something (fixture is non-vacuous)');
ok(
  sep19MoonLines.every(function (line) {
    return line.attrs.x2 <= sep19SunriseX || line.attrs.x1 >= sep19SunsetX;
  }),
  '2026-09-19 Burgos: no dl-bar-moonlight segment overlaps [sunriseX, sunsetX]'
);

// Broader regression guard: the finding measured 423 segments wider than
// 20px that were more than 50% inside daylight, replicated across all
// 365 days of 2026 at Burgos. Post-fix, none should overlap daylight at
// all (any width, any overlap fraction) — civilDawn/civilDusk gating is
// strictly wider than sunrise/sunset, so full exclusion subsumes both.
var overlapCount = 0;
for (var doy = 0; doy < 365; doy++) {
  var sweepDate = new Date(Date.UTC(2026, 0, 1 + doy)).toISOString().slice(0, 10);
  var sweepOut = Daylight.recompute({
    route: 'custom', customLat: '42.34', customLon: '-3.70',
    customDistance: '20', customElevGain: '0',
    date: sweepDate, paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
  });
  if (sweepOut.error || sweepOut.isPolarDay || sweepOut.isPolarNight) continue;
  var sweepDomain = DaylightMath.barDomainUTC(sweepOut);
  if (!sweepDomain) continue;

  var sweepSunriseX = expectedBarX(sweepOut.sunriseUTC, sweepDomain);
  var sweepSunsetX  = expectedBarX(sweepOut.sunsetUTC,  sweepDomain);

  var sweepSvg = makeNode('svg');
  Daylight.renderSVG(sweepOut, sweepSvg, null, '24h');
  byClass(sweepSvg, 'dl-bar-moonlight').forEach(function (line) {
    if (line.attrs.x2 > sweepSunriseX && line.attrs.x1 < sweepSunsetX) overlapCount++;
  });
}

equal(overlapCount, 0,
  '365 days at Burgos (2026): 0 dl-bar-moonlight segments overlap [sunrise, sunset] (was 423 segments >20px wide before the fix)');

console.log('\n=== renderSVG — titleText/aria-label describes what is actually drawn (Finding 4) ===\n');

// Burgos 2026-09-15 (burgosForward, above): astronomicalDawn and
// astronomicalDusk both occur, and the moon-band sampling finds a
// visible run (the moon is briefly up and bright enough before it sets,
// ahead of true dark) — so all three new clauses should appear.
var titleFwd = svgFwd.attrs['aria-label'];
ok(titleFwd.indexOf('true dark from') !== -1,
  'Burgos: titleText states the true-dark range (both astronomicalDawn/Dusk present)');
ok(titleFwd.indexOf('partly moonlit') !== -1,
  'Burgos: titleText notes partly moonlit (moon band paints a visible run)');
ok(titleFwd.indexOf('eyes adjust by') !== -1,
  'Burgos: titleText states the dark-adaptation time (astronomicalDusk present)');

// Burgos 2026-09-11 — new moon (k≈0.0014). astronomicalDawn/Dusk both
// still occur, but the moon's k is so low that lux never clears the
// 'dim' bracket even at maximum altitude, so the moon band paints
// nothing. titleText must not claim moonlight that isn't drawn.
var newMoonOut = Daylight.recompute({
  route: 'custom', customLat: '42.34', customLon: '-3.70',
  customDistance: '20', customElevGain: '0',
  date: '2026-09-11', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
});
var svgNewMoon = makeNode('svg');
Daylight.renderSVG(newMoonOut, svgNewMoon, null, '24h');
var titleNewMoon = svgNewMoon.attrs['aria-label'];

ok(byClass(svgNewMoon, 'dl-bar-moonlight').length === 0,
  'fixture sanity: 2026-09-11 Burgos draws no dl-bar-moonlight segment (new moon)');
ok(titleNewMoon.indexOf('true dark from') !== -1,
  'new moon: titleText still states the true-dark range');
ok(titleNewMoon.indexOf('partly moonlit') === -1,
  'new moon: titleText omits "partly moonlit" — nothing was drawn to describe');
ok(titleNewMoon.indexOf('eyes adjust by') !== -1,
  'new moon: titleText still states the dark-adaptation time (independent of moon band visibility)');

console.log('\n=== renderSVG — margin is coherent where astronomical twilight never occurs (Finding 10) ===\n');

// Stockholm (59.33N) at summer solstice: astronomical AND nautical dusk
// both fail to occur — only civil twilight persists. Before the fix, the
// domain still widened by BAR_DOMAIN_MARGIN_MS past civilDusk (the
// fallback rung actually used), and nothing rendered in that sliver —
// no truedark segment (gated on astronomicalDusk, which is null here),
// no band (civil ends exactly at civilDusk). The margin was dead space.
var stockholmOut = Daylight.recompute({
  route: 'custom', customLat: '59.33', customLon: '18.06',
  customDistance: '20', customElevGain: '0',
  date: '2026-06-21', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
});
ok(stockholmOut.astronomicalDusk === null && stockholmOut.nauticalDusk === null,
  'fixture sanity: Stockholm 2026-06-21 has neither astronomical nor nautical dusk');
ok(stockholmOut.civilDusk !== null, 'fixture sanity: Stockholm 2026-06-21 still has civil dusk');

var stockholmDomain = DaylightMath.barDomainUTC(stockholmOut);
equal(stockholmDomain.startUTC.getTime(), stockholmOut.civilDawn.getTime(),
  'Stockholm: domain start = civilDawn exactly — no margin past the outermost band we could compute');
equal(stockholmDomain.endUTC.getTime(), stockholmOut.civilDusk.getTime(),
  'Stockholm: domain end = civilDusk exactly — no margin');

var svgStockholm     = makeNode('svg');
Daylight.renderSVG(stockholmOut, svgStockholm, null, '24h');
var stockholmCivil   = oneByClass(svgStockholm, 'dl-bar-civil');

ok(stockholmCivil !== null, 'Stockholm: dl-bar-civil band is present');
if (stockholmCivil) {
  equal(stockholmCivil.attrs.x1, BAR_X1,
    'Stockholm: dl-bar-civil reaches BAR_X1 exactly — the bar\'s left edge is meaningful, not dead margin');
  equal(stockholmCivil.attrs.x2, BAR_X2,
    'Stockholm: dl-bar-civil reaches BAR_X2 exactly — the bar\'s right edge is meaningful, not dead margin');
}
ok(byClass(svgStockholm, 'dl-bar-truedark').length === 0,
  'Stockholm: no dl-bar-truedark element (astronomical twilight never occurs here)');

// Finding 4, same fixture: astronomicalDawn/Dusk are both null here, so
// neither the true-dark segment nor the dark-adaptation mark is drawn —
// titleText must not claim either.
var titleStockholm = svgStockholm.attrs['aria-label'];
ok(titleStockholm.indexOf('true dark') === -1,
  'Stockholm: titleText omits "true dark" — astronomicalDawn/Dusk are both null, nothing was drawn');
ok(titleStockholm.indexOf('eyes adjust') === -1,
  'Stockholm: titleText omits "eyes adjust" — astronomicalDusk is null, no adaptation mark was drawn');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
