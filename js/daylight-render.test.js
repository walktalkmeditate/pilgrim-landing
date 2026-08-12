/* =============================================
   The Light Budget — renderSVG test harness

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

var fs   = require('fs');
var path = require('path');

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

console.log('\n=== recompute — night facts exist as text, not just SVG geometry (Finding 5) ===\n');

// Burgos 2026-09-15 (fixture above): moon has set (19:12Z) before
// astronomicalDusk + DARK_ADAPT_MIN (20:22Z), so the bracket at that
// instant is 'faint' — an exact, hand-verified string, not just a
// non-empty check, so a maths regression in the wiring (wrong instant,
// wrong lat/lon) would show up here even though moon-lux.js's own
// thresholds are out of scope.
var burgosNightAnn = fwdOut.annotations.filter(function (a) {
  return a.text.indexOf('True dark') !== -1;
});
ok(burgosNightAnn.length === 1, 'Burgos: exactly one true-dark/eyes-adjust annotation');
if (burgosNightAnn.length === 1) {
  equal(burgosNightAnn[0].text,
    'True dark holds from 15:02 to 23:17; your eyes will have adjusted by 15:22.',
    'Burgos: true-dark annotation text (24h, no stage tz — matches the burgosForward fixture)');
}
ok(fwdOut.moonBrightnessAtAdapt !== null, 'Burgos: moonBrightnessAtAdapt is populated (astronomicalDusk exists)');
if (fwdOut.moonBrightnessAtAdapt) {
  equal(fwdOut.moonBrightnessAtAdapt.label, 'faint',
    'Burgos 2026-09-15: moon has already set by adapt time — bracket is faint');
  equal(fwdOut.moonBrightnessAtAdapt.prose, 'effectively dark; headlamp required',
    'Burgos 2026-09-15: prose is MoonLux.luxBracketFor\'s own string, not restated');
}

// A second date at the same coordinates, closer to full moon, to prove
// the field tracks the actual moon geometry rather than always reading
// the same bracket back.
var brightNightOut = Daylight.recompute({
  route: 'custom', customLat: '42.34', customLon: '-3.70',
  customDistance: '20', customElevGain: '0',
  date: '2026-09-26', paceKey: 'standard', startTimeMin: 9 * 60, mode: 'forward'
});
ok(brightNightOut.moonBrightnessAtAdapt && brightNightOut.moonBrightnessAtAdapt.label === 'mid',
  'Burgos 2026-09-26 (closer to full moon): bracket differs from the 09-15 fixture (mid, not faint)');

// Stockholm (fixture above): astronomicalDusk is null, so there is no
// adaptation instant to sample brightness at, and no true-dark
// annotation to push — both stay absent, matching the SVG's own gate.
ok(stockholmOut.moonBrightnessAtAdapt === null,
  'Stockholm: moonBrightnessAtAdapt is null — astronomicalDusk never occurs here');
ok(stockholmOut.annotations.every(function (a) { return a.text.indexOf('True dark') === -1; }),
  'Stockholm: no true-dark/eyes-adjust annotation — nothing to report');

/* =============================================
   The darkness ribbon — Slices 3-5 (spec: docs/specs/2026-08-12-darkness-ribbon.md)

   Started red on purpose (see this slice's own launch note): every
   assertion below was originally written against Daylight.renderRibbon
   and a dl-ribbon-svg element before either existed, so the first thing
   this section did was fail with "Daylight.renderRibbon is not a
   function" — a clean, named absence, not a silently-passing no-op.
   Slice 4 landed the geometry (AC #2, #3's stroke half, #4's
   numeric-sweep half, #8, #9's label half). Slice 5 landed
   DaylightMath.darknessSummarySentence (D10) and wired it through
   renderRibbon's now-five-argument signature (darknessData, svgEl,
   unitSystem, statedDistanceKm, summaryEl), turning AC #3's text half,
   AC #5, and AC #9's sentence half green too.
   ============================================= */

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

function classTokens(el) {
  return (el.attrs['class'] || '').split(/\s+/).filter(Boolean);
}

function hasClassToken(el, token) {
  return classTokens(el).indexOf(token) !== -1;
}

function elementsWithClassPrefix(svgEl, prefix) {
  return svgEl.children.filter(function (c) {
    return classTokens(c).some(function (t) { return t.indexOf(prefix) === 0; });
  });
}

function ribbonBandIndex(el) {
  var token = classTokens(el).filter(function (t) { return /^dl-ribbon-band-\d$/.test(t); })[0];
  return token ? parseInt(token.slice('dl-ribbon-band-'.length), 10) : null;
}

// Independent oracle for the ribbon's own distance axis — deliberately not
// derived from utcToBarX/expectedBarX above (a time-domain function) or
// from kmToBarX (the bar's own waypoint-tick helper, scoped to a walk
// sub-range). Same shape as expectedBarX, same X1/X2 pixel values as the
// bar purely for column alignment (D8) — restated here, not imported,
// since the spec is explicit that sharing the numbers is a layout
// coincidence, not a shared coordinate system.
var RIBBON_X1 = 24;
var RIBBON_X2 = 576;
var RIBBON_W  = RIBBON_X2 - RIBBON_X1;
// The ribbon's single y row for band-run lines, and the row its two
// end-distance labels sit on — every geometry assertion below this point
// in the file (and, before this section, above it) only ever checked
// x1/x2. A y-coordinate regression — a run drawn on the wrong row, a
// label sharing the runs' own y — would have been invisible to any of
// them.
var RIBBON_Y       = 16;
var RIBBON_LABEL_Y = 36;

function expectedRibbonX(kmFromStart, coveredKm) {
  if (coveredKm <= 0) return RIBBON_X1;
  var frac = Math.max(0, Math.min(1, kmFromStart / coveredKm));
  return RIBBON_X1 + frac * RIBBON_W;
}

function onRibbonRow(el) {
  return el.attrs.y1 === RIBBON_Y && el.attrs.y2 === RIBBON_Y;
}

var DARKNESS_DIR = path.join(__dirname, '..', 'assets', 'darkness');
function loadDarknessArtifact(routeId) {
  return JSON.parse(fs.readFileSync(path.join(DARKNESS_DIR, routeId + '.json'), 'utf8'));
}

// AC #2/#3(b) — a fixture route under a name that is NOT "shikoku-88" or
// "kumano-kodo", with withinInterpolationLimit and heldOutValidation both
// forced false by hand. This is the assertion that actually proves the
// renderer reads the fields rather than the route id — testing only
// against the real Shikoku/Kumano data would pass even a hardcoded
// `if (routeId === 'shikoku-88')` check. Shaped so every one of the five
// bands appears in a distinct, hand-verifiable 20 km window (D3:
// ceil(15/10)*10 = 20).
function buildTestCoarseRoute() {
  var values = [];
  var i;
  for (i = 0; i < 30; i++) values.push(22.0); // band 4, km 0-29
  for (i = 0; i < 40; i++) values.push(20.0); // band 2, km 30-69
  for (i = 0; i < 31; i++) values.push(17.0); // band 0, km 70-100
  return {
    route: 'test-coarse-route',
    epoch: 2025,
    bakeId: 'test-fixture',
    stepKm: 1,
    coveredKm: 100,
    unit: 'mag/arcsec2',
    values: values,
    heldOutValidation: false,
    positionalConfidence: {
      interpolatedFraction: 0.5,
      maxGapKm: 20,
      p90GapKm: 15,
      meanGapKm: 10,
      withinInterpolationLimit: false
    }
  };
}

// AC #10 — a shape no real shipped route has today (all seven carry
// mag/arcsec2, independently re-checked while writing the spec).
function buildWrongUnitRoute() {
  return {
    route: 'test-wrong-unit',
    epoch: 2025,
    bakeId: 'test-fixture',
    stepKm: 1,
    coveredKm: 10,
    unit: 'nW/cm2/sr',
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    heldOutValidation: true,
    positionalConfidence: {
      interpolatedFraction: 0, maxGapKm: 1, p90GapKm: 1, meanGapKm: 1,
      withinInterpolationLimit: true
    }
  };
}

var francesArtifact  = loadDarknessArtifact('camino-frances');
var kumanoArtifact   = loadDarknessArtifact('kumano-kodo');
var shikokuArtifact  = loadDarknessArtifact('shikoku-88');
var primitivoArtifact = loadDarknessArtifact('camino-primitivo');
var coarseFixture    = buildTestCoarseRoute();
var wrongUnitFixture = buildWrongUnitRoute();

// Stated distanceKm per route, from assets/daylight/route-meta.json —
// what a real caller (Slice 6's loadDarknessData wiring) would look up
// there and pass through renderRibbon's statedDistanceKm parameter.
// Fixture values, not something under test here.
var STATED_DISTANCE_KM = {
  'camino-frances':   764,
  'camino-primitivo': 263,
  'kumano-kodo':      39,
  'shikoku-88':       1200
};

console.log('\n=== renderRibbon — smoke: draws something for a real route (this is where Slice 3 goes red) ===\n');

var svgSmoke = makeNode('svg');
Daylight.renderRibbon(francesArtifact, svgSmoke, 'km');
ok(elementsWithClassPrefix(svgSmoke, 'dl-ribbon-band-').length > 0,
  'camino-frances: renderRibbon draws at least one dl-ribbon-band-* element');

console.log('\n=== renderRibbon — AC #2: Shikoku-shaped coarsening is keyed off positionalConfidence, not a route id ===\n');

// Each of these three real-route renders is reused below for AC #3's
// text-clause check, AC #5's equivalence check (kumano), and AC #9's
// sentence check (shikoku) — rendered once, with a real summary <p>
// alongside it, rather than re-rendered per assertion.
var svgFrancesRibbon = makeNode('svg');
var summaryFrances   = makeNode('p');
Daylight.renderRibbon(francesArtifact, svgFrancesRibbon, 'km', STATED_DISTANCE_KM['camino-frances'], summaryFrances);
var francesRuns = elementsWithClassPrefix(svgFrancesRibbon, 'dl-ribbon-band-');
equal(francesRuns.length, 128, 'real camino-frances (withinInterpolationLimit true): 128 runs, unaggregated — matches js/daylight-math.test.js exactly');
ok(francesRuns.every(onRibbonRow), 'camino-frances: every run sits on the ribbon\'s own y row (y1=y2=' + RIBBON_Y + '), not just correct on x');

var svgKumanoRibbon = makeNode('svg');
var summaryKumano   = makeNode('p');
Daylight.renderRibbon(kumanoArtifact, svgKumanoRibbon, 'km', STATED_DISTANCE_KM['kumano-kodo'], summaryKumano);
var kumanoRuns = elementsWithClassPrefix(svgKumanoRibbon, 'dl-ribbon-band-');
equal(kumanoRuns.length, 1, 'real kumano-kodo (withinInterpolationLimit true): exactly one run (D6)');
if (kumanoRuns.length === 1) {
  equal(kumanoRuns[0].attrs.x1, RIBBON_X1, 'kumano-kodo: the one run starts at the ribbon\'s own left edge');
  equal(kumanoRuns[0].attrs.x2, RIBBON_X2, 'kumano-kodo: the one run ends at the ribbon\'s own right edge — one flat band, full width');
  equal(kumanoRuns[0].attrs.y1, RIBBON_Y, 'kumano-kodo: the one run\'s y1 is the ribbon\'s own row');
  equal(kumanoRuns[0].attrs.y2, RIBBON_Y, 'kumano-kodo: the one run\'s y2 is the ribbon\'s own row');
}

var svgShikokuRibbon = makeNode('svg');
var summaryShikoku   = makeNode('p');
Daylight.renderRibbon(shikokuArtifact, svgShikokuRibbon, 'km', STATED_DISTANCE_KM['shikoku-88'], summaryShikoku);
var shikokuRuns = elementsWithClassPrefix(svgShikokuRibbon, 'dl-ribbon-band-');
equal(shikokuRuns.length, 9, 'real shikoku-88 (withinInterpolationLimit FALSE): coarsens to 9 runs — matches js/daylight-math.test.js exactly');
ok(shikokuRuns.every(onRibbonRow), 'shikoku-88: every run sits on the ribbon\'s own y row, not just correct on x');

var svgCoarseRibbon = makeNode('svg');
Daylight.renderRibbon(coarseFixture, svgCoarseRibbon, 'km');
var coarseRuns = elementsWithClassPrefix(svgCoarseRibbon, 'dl-ribbon-band-');
equal(coarseRuns.length, 5, 'synthetic "test-coarse-route" (NOT named shikoku-88, withinInterpolationLimit forced false): also coarsens — proves the field drives it, not the id');
if (coarseRuns.length === 5) {
  var expectedCoarseBounds = [0, 20, 40, 60, 80, 100];
  var expectedCoarseBands  = [4, 3, 2, 1, 0];
  coarseRuns.forEach(function (run, i) {
    equal(run.attrs.x1, expectedRibbonX(expectedCoarseBounds[i], 100), 'test-coarse-route run ' + i + ': x1 matches expectedRibbonX(' + expectedCoarseBounds[i] + ', 100)');
    equal(run.attrs.x2, expectedRibbonX(expectedCoarseBounds[i + 1], 100), 'test-coarse-route run ' + i + ': x2 matches expectedRibbonX(' + expectedCoarseBounds[i + 1] + ', 100)');
    equal(run.attrs.y1, RIBBON_Y, 'test-coarse-route run ' + i + ': y1 is the ribbon\'s own row');
    equal(run.attrs.y2, RIBBON_Y, 'test-coarse-route run ' + i + ': y2 is the ribbon\'s own row');
    equal(ribbonBandIndex(run), expectedCoarseBands[i], 'test-coarse-route run ' + i + ': band index');
  });
}

console.log('\n=== renderRibbon — AC #3: heldOutValidation gates a dashed stroke, independent of route id ===\n');

ok(kumanoRuns.every(function (r) { return hasClassToken(r, 'dl-ribbon-unvalidated'); }),
  'real kumano-kodo (heldOutValidation false): every run carries the dashed/unvalidated class');
ok(shikokuRuns.every(function (r) { return hasClassToken(r, 'dl-ribbon-unvalidated'); }),
  'real shikoku-88 (heldOutValidation false): every run carries the dashed/unvalidated class');
ok(francesRuns.every(function (r) { return !hasClassToken(r, 'dl-ribbon-unvalidated'); }),
  'real camino-frances (heldOutValidation true): no run carries the dashed/unvalidated class');
ok(coarseRuns.every(function (r) { return hasClassToken(r, 'dl-ribbon-unvalidated'); }),
  'synthetic "test-coarse-route" (heldOutValidation forced false, NOT named shikoku/kumano): dashed anyway — field-driven, not id-driven');

// D4's text clause is a trailing appendage to the D10 summary sentence
// (DaylightMath.darknessSummarySentence, Slice 5) — the stroke half
// above was real from Slice 4; this is the textual half D4 also
// requires, checked against both real unvalidated routes (D4 names
// Shikoku and Kumano explicitly) and against the one validated route
// already in scope here, to prove the clause is genuinely gated on
// heldOutValidation rather than always present.
ok(summaryKumano.textContent.indexOf('Not checked against a ground reading here') !== -1,
  'real kumano-kodo (heldOutValidation false): summary paragraph carries the D4 clause');
ok(summaryShikoku.textContent.indexOf('Not checked against a ground reading here') !== -1,
  'real shikoku-88 (heldOutValidation false): summary paragraph carries the D4 clause');
ok(summaryFrances.textContent.indexOf('Not checked against a ground reading here') === -1,
  'real camino-frances (heldOutValidation true): summary paragraph carries no D4 clause');

console.log('\n=== renderRibbon — Finding 5: heldOutValidation fails toward unvalidated (dashed), not trustworthy ===\n');

// A missing field, or a non-boolean value that merely LOOKS like it means
// "false", must not be read as the literal boolean true — anything other
// than true dashes every run. Built from camino-frances (real,
// heldOutValidation true, 128 runs) so the fixture proves the SAME
// artifact flips from solid to fully dashed on this field alone, nothing
// else about it changed.
function cloneArtifact(artifact) {
  return JSON.parse(JSON.stringify(artifact));
}

var missingValidationArtifact = cloneArtifact(francesArtifact);
delete missingValidationArtifact.heldOutValidation;
var svgMissingValidation = makeNode('svg');
Daylight.renderRibbon(missingValidationArtifact, svgMissingValidation, 'km');
var missingValidationRuns = elementsWithClassPrefix(svgMissingValidation, 'dl-ribbon-band-');
ok(missingValidationRuns.length > 0, 'fixture sanity: heldOutValidation-missing fixture still draws runs');
ok(missingValidationRuns.every(function (r) { return hasClassToken(r, 'dl-ribbon-unvalidated'); }),
  'heldOutValidation missing entirely (field absent from the artifact): every run is dashed');

var stringFalseArtifact = cloneArtifact(francesArtifact);
stringFalseArtifact.heldOutValidation = 'false';
var svgStringFalse = makeNode('svg');
Daylight.renderRibbon(stringFalseArtifact, svgStringFalse, 'km');
var stringFalseRuns = elementsWithClassPrefix(svgStringFalse, 'dl-ribbon-band-');
ok(stringFalseRuns.length > 0 && stringFalseRuns.every(function (r) { return hasClassToken(r, 'dl-ribbon-unvalidated'); }),
  'heldOutValidation "false" (the string, not the boolean false): every run is dashed');

console.log('\n=== renderRibbon — AC #4: no bare magnitude value, no star-count vocabulary, in any text the ribbon produces (numeric-sweep half) ===\n');

var BARE_DECIMAL_RE = /\d+\.\d+(?!\s*(km|mi|%))/;
var STAR_WORD_RE = /\bstars?\b/i;

function collectRibbonTexts(svgEl) {
  var texts = [];
  if (svgEl.attrs['aria-label']) texts.push(svgEl.attrs['aria-label']);
  svgEl.children.forEach(function (c) {
    if (c.tag === 'text' || c.tag === 'title') texts.push(c.textContent);
  });
  return texts;
}

[svgFrancesRibbon, svgKumanoRibbon, svgShikokuRibbon, svgCoarseRibbon].forEach(function (svgEl, idx) {
  var label = ['camino-frances', 'kumano-kodo', 'shikoku-88', 'test-coarse-route'][idx];
  var texts = collectRibbonTexts(svgEl);
  ok(texts.length > 0, label + ': the sweep has real text to check (fixture is non-vacuous)');
  var offenders = [];
  texts.forEach(function (t) {
    if (BARE_DECIMAL_RE.test(t)) offenders.push('bare-decimal in "' + t + '"');
    if (STAR_WORD_RE.test(t))   offenders.push('star-vocab in "' + t + '"');
  });
  ok(offenders.length === 0, label + ': no bare magnitude value or star-count word in aria-label/title/text' + (offenders.length ? ' -- ' + offenders.join('; ') : ''));
});

console.log('\n=== renderRibbon — AC #5: text-readable equivalence (aria-label and outside-SVG summary say the same thing) ===\n');

// Exact worked sentences from spec D10 — the multi-band and single-band
// ends of the "how many bands qualify" range. Kumano's also carries D4's
// trailing clause: D10's own worked example for Kumano shows the bare
// composition sentence alone, but D4 is explicit that both Shikoku and
// Kumano get the textual marking ("Kumano carries only this marking"),
// and AC #3 above requires it the same way — the sentence below is the
// union of both decisions, not D10 read in isolation. Both also now open
// with their own plain "<coveredKm> sampled." lead-in (Finding 6) —
// neither route's gap against route-meta's stated distanceKm is wide
// enough to earn Shikoku's "of its M" discrepancy framing instead.
var D10_SENTENCE_PRIMITIVO = '262.9\u00A0km sampled. Mostly as it was (52%) and open dark (34%), with some countryside (8%) and edge of town (6%). Darkest through the middle stretch.';
var D10_SENTENCE_KUMANO    = '38.0\u00A0km sampled. As it was, the whole way. Not checked against a ground reading here, the way the five Camino routes are.';

var svgPrimitivo     = makeNode('svg');
var summaryPrimitivo = makeNode('p');
Daylight.renderRibbon(primitivoArtifact, svgPrimitivo, 'km', STATED_DISTANCE_KM['camino-primitivo'], summaryPrimitivo);
equal(svgPrimitivo.attrs['aria-label'], D10_SENTENCE_PRIMITIVO,
  'camino-primitivo: aria-label carries the full D10 sentence');
equal(summaryPrimitivo.textContent, D10_SENTENCE_PRIMITIVO,
  'camino-primitivo: sibling summary paragraph carries the full D10 sentence');

equal(svgKumanoRibbon.attrs['aria-label'], D10_SENTENCE_KUMANO,
  'kumano-kodo: aria-label carries the full D10 sentence (single-band end of the range)');
equal(summaryKumano.textContent, D10_SENTENCE_KUMANO,
  'kumano-kodo: sibling summary paragraph carries the full D10 sentence (single-band end of the range)');

// The equivalence AC #5 actually cares about is the two outputs matching
// EACH OTHER, not just both happening to match a literal written here —
// checked directly for both routes.
ok(svgPrimitivo.attrs['aria-label'] === summaryPrimitivo.textContent,
  'camino-primitivo: aria-label and summary paragraph are byte-identical');
ok(svgKumanoRibbon.attrs['aria-label'] === summaryKumano.textContent,
  'kumano-kodo: aria-label and summary paragraph are byte-identical');

// Finding 6, one more route: camino-frances (rendered earlier under AC #2)
// used to get no distance clause at all — its gap against route-meta's
// stated distanceKm (764 vs 763.7) is nowhere near Shikoku's discrepancy
// gate. It must still state its own covered distance now.
ok(summaryFrances.textContent.indexOf('763.7') !== -1,
  'camino-frances: summary sentence states its covered distance (763.7 km) even with no stated-length discrepancy');
ok(summaryFrances.textContent.indexOf('of its') === -1,
  'camino-frances: no "of its M" discrepancy framing — the gap is not wide enough to earn it (that is Shikoku\'s alone)');

console.log('\n=== renderRibbon — AC #6: custom routes and the unselected state show no ribbon section at all (D12) ===\n');

equal(Daylight.ribbonSectionHidden('custom', null), true, 'custom route (no darkness data): section stays hidden');
equal(Daylight.ribbonSectionHidden(null, null), true, 'no route selected: section stays hidden');
equal(Daylight.ribbonSectionHidden('', null), true, 'empty route id: section stays hidden');
equal(Daylight.ribbonSectionHidden('camino-frances', francesArtifact), false, 'a real baked route id with loaded darkness data: section is shown');

console.log('\n=== renderRibbon — AC #7: output depends only on which route is loaded, never stage/date/pace/start/buffer (D13) ===\n');

// renderRibbon's own signature (darknessData, svgEl, unitSystem) has no
// stage/date/pace/start/buffer parameter to vary in the first place —
// checked directly, not simulated: two calls with the same darkness data
// (the only thing it can possibly react to) must be byte-identical.
function svgSnapshot(svgEl) {
  return svgEl.children.map(function (c) {
    return { tag: c.tag, attrs: c.attrs, textContent: c.textContent };
  });
}

var svgRouteCallA = makeNode('svg');
var svgRouteCallB = makeNode('svg');
Daylight.renderRibbon(primitivoArtifact, svgRouteCallA, 'km');
Daylight.renderRibbon(primitivoArtifact, svgRouteCallB, 'km');
arrEqual(svgSnapshot(svgRouteCallA), svgSnapshot(svgRouteCallB),
  'two renderRibbon calls with the same route data produce byte-identical geometry');

console.log('\n=== renderRibbon — AC #8: the bar and the ribbon are structurally two instruments, never one (D8) ===\n');

var indexHtmlPath = path.join(__dirname, '..', 'daylight', 'index.html');
var indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

ok(indexHtml.indexOf('id="dl-ribbon-svg"') !== -1, 'daylight/index.html: a dl-ribbon-svg element exists');
ok(indexHtml.indexOf('id="dl-ribbon-svg"') !== indexHtml.indexOf('id="dl-bar-svg"'),
  'dl-ribbon-svg is a distinct element id from dl-bar-svg');

var outputOpenIdx = indexHtml.indexOf('id="dl-output"');
ok(outputOpenIdx !== -1, 'daylight/index.html: #dl-output exists');
var outputCloseIdx = indexHtml.indexOf('</section>', outputOpenIdx);
var noscriptIdx = indexHtml.indexOf('<noscript>', outputCloseIdx);
ok(outputCloseIdx !== -1 && noscriptIdx !== -1 && outputCloseIdx < noscriptIdx,
  'daylight/index.html: #dl-output closes, then <noscript> follows (sane fixture)');
var betweenOutputAndNoscript = indexHtml.slice(outputCloseIdx, noscriptIdx);
ok(betweenOutputAndNoscript.indexOf('id="dl-ribbon-svg"') !== -1,
  'the ribbon lives between #dl-output\'s closing tag and <noscript> — a sibling of #dl-output, not a descendant, so it sits outside the aria-live="polite" region');

console.log('\n=== renderRibbon — AC #9: right-edge label reflects coveredKm, not route-meta\'s stated distanceKm (D3, D10) ===\n');

// fmtDistance's unit suffix (js/daylight.js) carries a non-breaking space
// (U+00A0) before "km"/"mi" — pre-existing typography (commit ec07f682),
// not something this slice introduces, so the expected literals below
// match it exactly rather than a plain space.
var NBSP = ' ';

var francesLabels = byClass(svgFrancesRibbon, 'dl-ribbon-label');
equal(francesLabels.length, 2, 'camino-frances: exactly two end-distance labels');
if (francesLabels.length === 2) {
  equal(francesLabels[0].textContent, '0.0' + NBSP + 'km', 'camino-frances: left label is the route start');
  equal(francesLabels[1].textContent, '763.7' + NBSP + 'km', 'camino-frances: right label is coveredKm (763.7), not route-meta\'s stated distanceKm');
  equal(francesLabels[0].attrs.y, RIBBON_LABEL_Y, 'camino-frances: left label sits on the ribbon\'s label row, not the band row');
  equal(francesLabels[1].attrs.y, RIBBON_LABEL_Y, 'camino-frances: right label sits on the ribbon\'s label row, not the band row');
}

var shikokuLabels = byClass(svgShikokuRibbon, 'dl-ribbon-label');
equal(shikokuLabels.length, 2, 'shikoku-88: exactly two end-distance labels');
if (shikokuLabels.length === 2) {
  // Thousands separator (D10's fmtDistance side-finding, Slice 5):
  // 1080.5 is the first value this page has ever handed fmtDistance
  // that crosses four digits, so this literal gained a comma this slice
  // — see js/daylight.js's fmtDistanceNumber.
  equal(shikokuLabels[1].textContent, '1,080.5' + NBSP + 'km', 'shikoku-88: right label is coveredKm (1080.5), never the stated 1,200 km (D3)');
  equal(shikokuLabels[1].attrs.y, RIBBON_LABEL_Y, 'shikoku-88: right label sits on the ribbon\'s label row, not the band row');
}

// The "N of M km sampled" lead-in needs route-meta.json's stated
// distanceKm — summaryShikoku (rendered above, alongside svgShikokuRibbon)
// was given it via STATED_DISTANCE_KM['shikoku-88'].
ok(summaryShikoku.textContent.indexOf('of its') !== -1 && summaryShikoku.textContent.indexOf('km sampled') !== -1,
  'shikoku-88: summary sentence leads with "N of its M km sampled" (>5 km gap from route-meta\'s stated distanceKm)');

console.log('\n=== renderRibbon — AC #10: a route without unit "mag/arcsec2" renders no ribbon (Gate 0 §7 alignment) ===\n');

equal(Daylight.ribbonSectionHidden('test-wrong-unit', wrongUnitFixture), true,
  'wrong-unit fixture (nW/cm2/sr): section stays hidden even though a route id and darkness data are both present');

var svgWrongUnit = makeNode('svg');
Daylight.renderRibbon(wrongUnitFixture, svgWrongUnit, 'km');
ok(elementsWithClassPrefix(svgWrongUnit, 'dl-ribbon-band-').length === 0,
  'wrong-unit fixture: renderRibbon draws no band runs, rather than mislabeling a radiance figure as a magnitude');

console.log('\n=== renderRibbon — a malformed artifact fails to hidden, not to a throw (Finding 2) ===\n');

// Before this guard: missing positionalConfidence threw
// "Cannot read properties of undefined (reading 'withinInterpolationLimit')"
// out of darknessAggregateWindowKm; missing coveredKm threw out of
// darknessSummarySentence's own fmtDistance call; missing stepKm drew
// `<line x1="NaN" x2="NaN">` band elements with no error and no console
// output at all — silent wrongness, not even a crash to notice; and
// values: [] rendered the section with "0.0 km" labels and a summary
// that was just a leading space plus the unvalidated clause. All four
// are checked here the same way AC #10's wrong-unit fixture already is:
// clone a real, valid artifact and break exactly one field.
var warnLog = [];
var realConsoleWarn = console.warn;
console.warn = function () {
  warnLog.push(Array.prototype.join.call(arguments, ' '));
};

function malformedArtifactFixture(mutate) {
  var fixture = cloneArtifact(francesArtifact);
  mutate(fixture);
  return fixture;
}

var malformedFixtures = [
  { field: 'positionalConfidence', build: function () { return malformedArtifactFixture(function (f) { delete f.positionalConfidence; }); } },
  { field: 'coveredKm',            build: function () { return malformedArtifactFixture(function (f) { delete f.coveredKm; }); } },
  { field: 'stepKm',               build: function () { return malformedArtifactFixture(function (f) { delete f.stepKm; }); } },
  { field: 'values',               build: function () { return malformedArtifactFixture(function (f) { f.values = []; }); } }
];

malformedFixtures.forEach(function (spec) {
  var fixture = spec.build();

  equal(Daylight.ribbonSectionHidden('camino-frances', fixture), true,
    'missing/malformed "' + spec.field + '": ribbonSectionHidden reports hidden, consistent with renderRibbon\'s own refusal to draw');

  warnLog.length = 0;
  var svgMalformed = makeNode('svg');
  var summaryMalformed = makeNode('p');
  var threw = false;
  try {
    Daylight.renderRibbon(fixture, svgMalformed, 'km', 764, summaryMalformed);
  } catch (e) {
    threw = true;
  }

  ok(!threw, 'missing/malformed "' + spec.field + '": renderRibbon does not throw');
  ok(elementsWithClassPrefix(svgMalformed, 'dl-ribbon-band-').length === 0,
    'missing/malformed "' + spec.field + '": no band elements are drawn (no NaN geometry, no partial render)');
  equal(svgMalformed.attrs['aria-label'], '',
    'missing/malformed "' + spec.field + '": aria-label is cleared, not left describing a route that failed to render');
  equal(summaryMalformed.textContent, '',
    'missing/malformed "' + spec.field + '": summary paragraph is cleared, not a bare leading space or a partial sentence');
  ok(warnLog.length === 1, 'missing/malformed "' + spec.field + '": exactly one console.warn was logged');
  if (warnLog.length) {
    ok(warnLog[0].indexOf('camino-frances') !== -1,
      'missing/malformed "' + spec.field + '": the warning names the route (camino-frances)');
    ok(warnLog[0].indexOf(spec.field) !== -1,
      'missing/malformed "' + spec.field + '": the warning names the offending field');
  }
});

console.warn = realConsoleWarn;

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
