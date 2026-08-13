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
// sub-range). Same shape as expectedBarX. X1/X2 are deliberately NOT the
// bar's BAR_X1/BAR_X2 (D8 correction): the ribbon insets 24 units further
// in on each side so the two strips never share an edge — restated here,
// not imported from js/daylight.js, so a leftover bug in the real
// RIBBON_X1/X2 and a correct oracle disagree rather than silently
// matching (the same reasoning expectedBarX's own header already gives).
var RIBBON_X1 = 48;
var RIBBON_X2 = 552;
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
equal(francesRuns.length, 94, 'real camino-frances (withinInterpolationLimit true): 94 runs after sub-pixel absorption and the same-band coalescing it makes necessary (128 raw band-change points, 20 narrower than one drawn pixel at desktop, then 14 same-band adjacencies merged) — matches js/daylight-math.test.js exactly');
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
equal(shikokuRuns.length, 8, 'real shikoku-88 (withinInterpolationLimit FALSE): coarsens to 9 windows, then 8 runs after its 0.5 km trailing window is absorbed into its predecessor — matches js/daylight-math.test.js exactly');
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

/* The date input's own bounds, and the fact that they are the SAME two
   numbers js/daylight.js enforces. Without min/max a stray keystroke
   makes the year 20261, the moon strip renders a walk 18,000 years out,
   and that date goes into the share URL — where the recipient's
   coerceParams silently resets it to today, so one link produces two
   different strips. The cross-file assertion is the point: an input that
   allowed a year the code rejects would fail to hidden with no
   explanation. */
var dateInputTag = indexHtml.slice(indexHtml.indexOf('id="dl-date"') - 200,
                                   indexHtml.indexOf('id="dl-date"') + 200);
var daylightJsSrc = fs.readFileSync(path.join(__dirname, 'daylight.js'), 'utf8');
var minYearInJs = daylightJsSrc.match(/var MIN_WALK_YEAR = (\d+)/);
var maxYearInJs = daylightJsSrc.match(/var MAX_WALK_YEAR = (\d+)/);
ok(minYearInJs && maxYearInJs, 'js/daylight.js states MIN_WALK_YEAR and MAX_WALK_YEAR');
ok(dateInputTag.indexOf('min="' + minYearInJs[1] + '-01-01"') !== -1,
  'daylight/index.html: #dl-date carries min="' + minYearInJs[1] + '-01-01", the same lower bound the code enforces');
ok(dateInputTag.indexOf('max="' + maxYearInJs[1] + '-12-31"') !== -1,
  'daylight/index.html: #dl-date carries max="' + maxYearInJs[1] + '-12-31", the same upper bound the code enforces');

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
// (U+00A0) before "km"/"mi". Correction: this is NOT pre-existing
// typography — commit ec07f682 predates this branch entirely and never
// touched the separator (its own fmtDistance used a plain U+0020 space,
// same as this branch's own base, bfa59f5). The non-breaking space was
// introduced on this branch, in bd84ce4, alongside fmtDistanceNumber's
// thousands-separator fix — and because fmtDistance is shared, not
// ribbon-only, it silently changed two pieces of pre-existing rendered
// text this slice never meant to touch: the walk-budget result line
// ("Walk 24.2 km …") and the ICS DESCRIPTION built from it. Kept here
// rather than reverted — it stops a number like "1,080.5" wrapping onto
// its own line away from "km", a real improvement, and the shipped
// behaviour every other test in this suite already assumes — but the
// expected literals below match it because it's real, not because it
// was already there.
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

// The first cut of this guard only checked that the CONTAINER each field
// arrives in exists — positionalConfidence being an object, values being a
// non-empty array — not the values the math then dereferences out of them.
// Everything from "positionalConfidence: {}" down was reachable through the
// real page wiring with the guard already in place: a missing p90GapKm made
// darknessAggregateWindowKm return NaN and `buckets[NaN].push` throw a
// TypeError straight out of xhr.onload; a p90GapKm of 0 made numWindows
// Infinity and the bucket loop ran node out of 4 GB (a frozen tab, in a
// browser); a non-finite coveredKm slipped past isNaN() and produced the
// `<line x2="NaN">` geometry this guard was added to stop; and a
// non-numeric values[] entry classified as band 0 — the BRIGHTEST band, a
// darkness instrument failing toward "less dark", the one direction it
// must never fail in. `field` below is the exact substring the warning has
// to name, so a fixture that starts hiding for a DIFFERENT reason than the
// one it was written for goes red instead of passing quietly.
var malformedFixtures = [
  { field: 'positionalConfidence', build: function () { return malformedArtifactFixture(function (f) { delete f.positionalConfidence; }); } },
  { field: 'coveredKm',            build: function () { return malformedArtifactFixture(function (f) { delete f.coveredKm; }); } },
  { field: 'stepKm',               build: function () { return malformedArtifactFixture(function (f) { delete f.stepKm; }); } },
  { field: 'values',               build: function () { return malformedArtifactFixture(function (f) { f.values = []; }); } },

  { label: 'positionalConfidence: {} (present, but empty)',
    field: 'positionalConfidence.withinInterpolationLimit',
    build: function () { return malformedArtifactFixture(function (f) { f.positionalConfidence = {}; }); } },
  { label: 'withinInterpolationLimit non-boolean (the string "true")',
    field: 'positionalConfidence.withinInterpolationLimit',
    build: function () { return malformedArtifactFixture(function (f) { f.positionalConfidence.withinInterpolationLimit = 'true'; }); } },
  { label: 'withinInterpolationLimit false with no p90GapKm (NaN window -> buckets[NaN].push)',
    field: 'positionalConfidence.p90GapKm',
    build: function () { return malformedArtifactFixture(function (f) { f.positionalConfidence = { interpolatedFraction: 0.006, maxGapKm: 13, withinInterpolationLimit: false }; }); } },
  { label: 'p90GapKm 0 (Infinity windows -> unbounded allocation)',
    field: 'positionalConfidence.p90GapKm',
    build: function () { return malformedArtifactFixture(function (f) { f.positionalConfidence.withinInterpolationLimit = false; f.positionalConfidence.p90GapKm = 0; }); } },
  { label: 'p90GapKm null (same unbounded allocation, different shape)',
    field: 'positionalConfidence.p90GapKm',
    build: function () { return malformedArtifactFixture(function (f) { f.positionalConfidence.withinInterpolationLimit = false; f.positionalConfidence.p90GapKm = null; }); } },
  { label: 'coveredKm 0 (a zero-length axis, every run at x1 === x2)',
    field: 'coveredKm',
    build: function () { return malformedArtifactFixture(function (f) { f.coveredKm = 0; }); } },
  { label: 'coveredKm non-finite (isNaN alone lets Infinity through)',
    field: 'coveredKm',
    build: function () { return malformedArtifactFixture(function (f) { f.coveredKm = Infinity; }); } },
  { label: 'stepKm 0 (every sample lands at km 0)',
    field: 'stepKm',
    build: function () { return malformedArtifactFixture(function (f) { f.stepKm = 0; }); } },
  { label: 'a non-numeric values[] entry (would classify as band 0, the brightest)',
    field: 'values[400]',
    build: function () { return malformedArtifactFixture(function (f) { f.values[400] = null; }); } },
  { label: 'a NaN values[] entry (same brightest-band misclassification)',
    field: 'values[12]',
    build: function () { return malformedArtifactFixture(function (f) { f.values[12] = NaN; }); } },
  { label: 'values.length vs coveredKm mismatch (the producer\'s own invariant, emit.py)',
    field: 'values.length',
    build: function () { return malformedArtifactFixture(function (f) { f.values = f.values.slice(0, f.values.length - 1); }); } }
];

malformedFixtures.forEach(function (spec) {
  var fixture = spec.build();
  var label = spec.label || ('missing/malformed "' + spec.field + '"');

  equal(Daylight.ribbonSectionHidden('camino-frances', fixture), true,
    label + ': ribbonSectionHidden reports hidden, consistent with renderRibbon\'s own refusal to draw');

  warnLog.length = 0;
  var svgMalformed = makeNode('svg');
  var summaryMalformed = makeNode('p');
  var threw = false;
  try {
    Daylight.renderRibbon(fixture, svgMalformed, 'km', 764, summaryMalformed);
  } catch (e) {
    threw = true;
  }

  ok(!threw, label + ': renderRibbon does not throw');
  ok(elementsWithClassPrefix(svgMalformed, 'dl-ribbon-band-').length === 0,
    label + ': no band elements are drawn (no NaN geometry, no partial render)');
  equal(svgMalformed.attrs['aria-label'], '',
    label + ': aria-label is cleared, not left describing a route that failed to render');
  equal(summaryMalformed.textContent, '',
    label + ': summary paragraph is cleared, not a bare leading space or a partial sentence');
  ok(warnLog.length === 1, label + ': exactly one console.warn was logged');
  if (warnLog.length) {
    ok(warnLog[0].indexOf('camino-frances') !== -1,
      label + ': the warning names the route (camino-frances)');
    ok(warnLog[0].indexOf(spec.field) !== -1,
      label + ': the warning names the offending field ("' + spec.field + '")');
  }
});

// The real artifacts must all still pass the tightened guard — otherwise
// this whole section would be proving a strictness that also hides the
// seven routes the page actually ships.
['camino-frances', 'camino-ingles', 'camino-norte', 'camino-portugues',
 'camino-primitivo', 'shikoku-88', 'kumano-kodo'].forEach(function (routeId) {
  warnLog.length = 0;
  equal(Daylight.ribbonSectionHidden(routeId, loadDarknessArtifact(routeId)), false,
    routeId + ': the real shipped artifact still clears the tightened shape guard (including emit.py\'s floor(coveredKm / stepKm) + 1 === values.length invariant)');
  equal(warnLog.length, 0, routeId + ': no shape warning for a real artifact');
});

console.warn = realConsoleWarn;

/* =============================================
   Slice 3, Task 5 — renderMoonStrip geometry (spec D1, D5; AC #1, #5, #6)

   The strip shares the ribbon's axis exactly, so the two can be read
   against each other. Shikoku's unplaced quarter must be ABSENT
   elements, not zero-width ones — a zero-width line still paints an
   antialiased hairline, which would draw a boundary where the
   instrument is deliberately saying nothing.
   ============================================= */

console.log('\n=== renderMoonStrip — geometry on the ribbon\'s axis (D1, AC #1) ===\n');

var NightMath = require('./night-math.js');

var MOON_START = new Date('2026-10-12T12:00:00Z');
var DAYLIGHT_STAGE_DIR = path.join(__dirname, '..', 'assets', 'daylight');

function stagesFor(routeId) {
  var raw = JSON.parse(fs.readFileSync(path.join(DAYLIGHT_STAGE_DIR, routeId + '.json'), 'utf8'));
  return Object.keys(raw).map(function (k) { return raw[k]; });
}

function moonCellsFor(routeId, startDate) {
  var artifact = loadDarknessArtifact(routeId);
  var stages   = stagesFor(routeId);
  var runs     = DaylightMath.mergeDarknessRuns(
    artifact.values, artifact.stepKm, artifact.coveredKm,
    DaylightMath.darknessAggregateWindowKm(artifact.positionalConfidence));
  var schedule = DaylightMath.nightSchedule(
    DaylightMath.stagePlacements(stages, artifact.coveredKm), startDate || MOON_START);
  return {
    cells:     NightMath.buildNightCells(schedule, stages, runs),
    coveredKm: artifact.coveredKm,
    // Carried through exactly as the page carries it, so the render path
    // exercises the same `!== true` reading the prose tests pin (F9).
    heldOutValidation: artifact.heldOutValidation
  };
}

function renderMoonInto(routeId, startDate) {
  var when = startDate || MOON_START;
  var built = moonCellsFor(routeId, when);
  var svg = makeNode('svg');
  var summary = makeNode('p');
  var notable = NightMath.selectNotableNights(built.cells, built.coveredKm);
  Daylight.renderMoonStrip(built.cells, notable,
                           when, built.coveredKm, svg, summary,
                           built.heldOutValidation);
  return { svg: svg, summary: summary, cells: built.cells,
           coveredKm: built.coveredKm, notable: notable };
}

// Band spans only. The two named nights are marked with <line>s of their
// own (G1), so "every line" and "every band" stopped being the same set.
function moonLinesOf(svg) {
  return svg.children.filter(function (c) {
    return c.tag === 'line' && /dl-moon-band-/.test(c.attrs.class || '');
  });
}

function moonTicksOf(svg) {
  return svg.children.filter(function (c) {
    return c.tag === 'line' && /(^|\s)dl-moon-tick(\s|$)/.test(c.attrs.class || '');
  });
}

var moonFrances = renderMoonInto('camino-frances');
var francesLines = moonLinesOf(moonFrances.svg);

// Ten spans, not 33 cells: 23 of camino-frances's 32 abutting cell pairs
// share a moon band, and each one used to emit two abutting
// semi-transparent <line>s whose antialiased edges composited to a seam
// brighter than the real band steps around it (F1). The cells are
// unchanged — this is what gets DRAWN.
equal(francesLines.length, 10, 'camino-frances: 33 cells coalesce into 10 drawn spans');

/* Both halves of the claim the finding was written from (H4). "33 nights
   drew as 7 lines" was true of the day it was measured and not of the day
   this file pins, and it carried no date — so it read as a constant while
   the count actually moves with the start date (6 to 11 across 2026). The
   two dates are pinned together here so the prose quoting either of them
   cannot drift from what ships. */
var francesOnFindingDate = renderMoonInto('camino-frances', new Date('2026-08-13T12:00:00Z'));
equal(francesOnFindingDate.cells.length, 33,
  'camino-frances: the same 33 cells on the date the finding was measured');
equal(moonLinesOf(francesOnFindingDate.svg).length, 7,
  'camino-frances: they coalesce into 7 spans from a 2026-08-13 start — the count the '
    + 'finding quoted, which is not the count this file\'s own 12 October start gives');
equal(Number(francesLines[0].attrs.x1), 48, 'camino-frances: first span starts at the ribbon inset x=48');
equal(Number(francesLines[francesLines.length - 1].attrs.x2), 552,
  'camino-frances: last span ends at the ribbon inset x=552');

var moonTiles = true;
for (var mi = 1; mi < francesLines.length; mi++) {
  if (Math.abs(Number(francesLines[mi].attrs.x1) - Number(francesLines[mi - 1].attrs.x2)) > 1e-6) moonTiles = false;
}
ok(moonTiles, 'camino-frances: spans tile with no gaps');

var allBanded = francesLines.every(function (l) { return /dl-moon-band-[0-4]/.test(l.attrs.class); });
ok(allBanded, 'camino-frances: every cell carries a moon band class 0-4');

// The strip must not reuse the ribbon's class names, or a CSS change to
// one would silently restyle the other.
ok(francesLines.every(function (l) { return l.attrs.class.indexOf('dl-ribbon-band') === -1; }),
  'camino-frances: no cell carries a darkness-ribbon class');

// Shikoku: the unplaced quarter is absent, not zero-width. Its cells
// never abut (the 288 km of gaps between temple clusters sit between
// every pair), so coalescing has nothing to merge and all ten survive —
// which is the point: the merge closes false seams without closing a
// single real gap.
var moonShikoku = renderMoonInto('shikoku-88');
var shikokuLines = moonLinesOf(moonShikoku.svg);
equal(shikokuLines.length, 10, 'shikoku-88: ten spans, one per placed stage — no real gap was merged away');

var zeroWidth = shikokuLines.filter(function (l) {
  return Math.abs(Number(l.attrs.x2) - Number(l.attrs.x1)) < 1e-9;
}).length;
equal(zeroWidth, 0, 'shikoku-88: no zero-width cell — a gap is an absent element, not a hairline');

// The gaps are not merely present, they are the whole 288.1 km spec D4
// audited — measured back off the drawn geometry, so a coalescer that
// quietly swallowed one would show up as a shortfall here rather than as
// a strip nobody re-counted.
function xToKm(x, coveredKm) { return (Number(x) - 48) / (552 - 48) * coveredKm; }

var shikokuGapDrawnKm = 0;
for (var si = 1; si < shikokuLines.length; si++) {
  shikokuGapDrawnKm += Math.max(0,
    xToKm(shikokuLines[si].attrs.x1, moonShikoku.coveredKm)
    - xToKm(shikokuLines[si - 1].attrs.x2, moonShikoku.coveredKm));
}
ok(Math.abs(shikokuGapDrawnKm - 288.1) < 0.5,
  'shikoku-88: 288.1 km of real gaps between temple clusters survive the merge (drawn: '
    + shikokuGapDrawnKm.toFixed(1) + ' km)');

// Blocks are visually distinct from single nights (D5, AC #6).
var blockLines = shikokuLines.filter(function (l) { return /dl-moon-block/.test(l.attrs.class); });
ok(blockLines.length > 0, 'shikoku-88: multi-night blocks carry a distinguishing class');
equal(blockLines.length,
  moonShikoku.cells.filter(function (c) { return c.isBlock; }).length,
  'shikoku-88: exactly the block cells are marked as blocks');
ok(francesLines.every(function (l) { return /dl-moon-block/.test(l.attrs.class) === false; }),
  'camino-frances: no cell is marked a block — every stage is one night');

// Text equivalence (D10, AC #13): the label must be the same prose the
// summary carries, so a screen reader and a sighted reader get the same
// nights named.
var moonLabel = moonFrances.svg.attrs['aria-label'];
ok(moonLabel && moonLabel.indexOf('33 nights') !== -1,
  'camino-frances: the aria-label states the walk length');
equal(moonLabel, moonFrances.summary.textContent,
  'camino-frances: aria-label and visible summary are the same sentence');
ok(moonLabel.indexOf('night 27') !== -1 && moonLabel.indexOf('Night 15') !== -1,
  'camino-frances: the label names the same two nights as the prose');

// The axis labels name the nights at the strip's two ends. On a route
// where every cell is drawable that is night 1 and the last night, which
// is what the reader sees on all seven shipped routes.
var francesMoonLabels = byClass(moonFrances.svg, 'dl-moon-label');
equal(francesMoonLabels.length, 2, 'camino-frances: exactly two moon-axis labels');
equal(francesMoonLabels[0].textContent, 'night 1', 'camino-frances: left label is night 1');
equal(francesMoonLabels[1].textContent, 'night 33', 'camino-frances: right label is night 33, the last night of the walk');

var shikokuMoonLabels = byClass(moonShikoku.svg, 'dl-moon-label');
equal(shikokuMoonLabels[1].textContent, 'night 32',
  'shikoku-88: the right label is night 32 — the last night of its last block, not its cell count');

// The validation caveat reaches the aria-label too, not just the pure
// sentence — a screen-reader user hears the same qualification a sighted
// reader sees (F9, D10).
var shikokuLabel = moonShikoku.svg.attrs['aria-label'];
ok(shikokuLabel.indexOf('on darkness no ground reading has checked') !== -1,
  'shikoku-88: the aria-label carries the sky clause\'s validation caveat');
ok(moonLabel.indexOf('on darkness no ground reading has checked') === -1,
  'camino-frances: a validated route\'s label carries no caveat');
equal(shikokuLabel, moonShikoku.summary.textContent,
  'shikoku-88: aria-label and visible summary are still the same sentence, caveat included');

/* =============================================
   F1 — no seam is drawn where the data has no boundary.

   Two abutting semi-transparent <line>s composite their antialiased
   edges in sequence, so a shared band drawn as two elements paints a
   hairline up to 0.235 alpha lighter than either — measured stronger
   (1.687:1 seam-vs-fill) than the real band-1-to-2 step (1.313:1). The
   ribbon closed exactly this defect in absorbNarrowDarknessRuns; the
   strip shipped without the equivalent pass.

   Asserted on the EMITTED elements, not on a model of them: the seam is
   a property of what the browser paints.
   ============================================= */

console.log('\n=== renderMoonStrip — abutting spans never share a band (F1) ===\n');

var ALL_MOON_ROUTES = ['camino-frances', 'camino-ingles', 'camino-norte',
                       'camino-portugues', 'camino-primitivo', 'kumano-kodo',
                       'shikoku-88'];

ALL_MOON_ROUTES.forEach(function (routeId) {
  var drawn  = renderMoonInto(routeId);
  var lines  = moonLinesOf(drawn.svg);
  ok(lines.length > 0, routeId + ': the strip draws something (fixture is non-vacuous)');

  var sameBandAbutting = 0;
  for (var i = 1; i < lines.length; i++) {
    var abuts = Math.abs(Number(lines[i].attrs.x1) - Number(lines[i - 1].attrs.x2)) < 1e-6;
    if (abuts && lines[i].attrs.class === lines[i - 1].attrs.class) sameBandAbutting++;
  }
  equal(sameBandAbutting, 0,
    routeId + ': no two abutting drawn spans share a band — no false boundary is painted');

  // Merging may not change which kilometres are covered. Measured back
  // off the drawn x-coordinates against the cells' own extents, so a
  // merge that swallowed or invented a kilometre fails here.
  var cellKm = NightMath.drawableCells(drawn.cells, drawn.coveredKm)
    .reduce(function (a, c) { return a + (c.hiKm - c.loKm); }, 0);
  var drawnKm = lines.reduce(function (a, l) {
    return a + xToKm(l.attrs.x2, drawn.coveredKm) - xToKm(l.attrs.x1, drawn.coveredKm);
  }, 0);
  ok(Math.abs(drawnKm - cellKm) < 0.01,
    routeId + ': the merge covers exactly the kilometres its cells do ('
      + drawnKm.toFixed(2) + ' vs ' + cellKm.toFixed(2) + ' km)');
});

/* =============================================
   G1 — the strip can point at the night it names again.

   Coalescing was right about the false seams and wrong about everything
   else it erased: with 33 cells drawn as 7 lines from a 2026-08-13 start,
   77% of named nights ended up inside a wider merged span, and the prose
   named "night 17" over a bar covering a third of a kilometre axis on
   which 17 of 33 cannot be interpolated. The count moves with the start
   date, so it is pinned below alongside this file's own.

   So the two named nights carry a mark of their own, at the centre of
   their OWN cell's extent — not the merged span's — and nothing else
   does. Asserted off the emitted elements, because a tick computed
   correctly and drawn nowhere is this page's oldest defect.

   H1 moved that mark off the band and into the axis-label row beneath
   it. The x — the whole of the claim — is unchanged and still checked
   here. The y is now checked against the band's real drawn extent.
   ============================================= */

console.log('\n=== renderMoonStrip — the two named nights are marked where they are walked (G1, D10, H1) ===\n');

/* The stylesheet's own numbers, read rather than restated (H1).

   "The mark clears the band" is a relationship between what
   renderMoonStrip emits and what css/daylight.css strokes, so neither
   side of it can be pinned from one file alone. The assertion this
   replaces tried and failed at exactly that: it compared a test-local
   copy of MOON_TICK_HALF against a literal 8, so it read neither the
   implementation nor the stylesheet, and setting the real constant to 20
   left it green. */
var daylightCssSrc = fs.readFileSync(path.join(__dirname, '..', 'css/daylight.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function cssNumberFor(selector, prop) {
  var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp(escaped + '[^{}]*\\{([^}]*)\\}', 'g');
  var m, value = null;
  while ((m = re.exec(daylightCssSrc)) !== null) {
    var v = m[1].match(new RegExp(prop + ':\\s*([\\d.]+)'));
    if (v) value = parseFloat(v[1]);
  }
  return value;
}

var MOON_BAND_STROKE  = cssNumberFor('.dl-moon-band-0', 'stroke-width');
var MOON_BLOCK_STROKE = cssNumberFor('.dl-moon-block', 'stroke-width');
var MOON_LABEL_FONT   = cssNumberFor('.dl-moon-label', 'font-size');
ok(MOON_BAND_STROKE > 0,
  'css/daylight.css declares a stroke-width for the moon bands (read ' + MOON_BAND_STROKE + ')');
ok(MOON_BLOCK_STROKE > 0,
  'css/daylight.css declares a stroke-width for a multi-night block (read ' + MOON_BLOCK_STROKE + ')');
ok(MOON_LABEL_FONT > 0,
  'css/daylight.css declares a font-size for the moon axis labels (read ' + MOON_LABEL_FONT + ')');

// 600 is the strip's viewBox width; 280 the narrowest content column this
// page renders at (a 320px phone less the layout's own padding). The pair
// js/muted-contrast.test.js applies to the mark's stroke-width, applied
// here to its HEIGHT — which is an emitted attribute, so the stylesheet
// cannot answer for it.
var VIEWBOX_UNITS = 600;
var NARROWEST_CONTENT_PX = 280;

// The y-range a band really covers: its emitted row, plus half whichever
// stroke-width the stylesheet gives it. A block strokes narrower than a
// single night, so the widest of them is what the mark has to clear.
function bandYRangeOf(bandLines) {
  var top = Infinity, bottom = -Infinity;
  bandLines.forEach(function (l) {
    var half = (/(^|\s)dl-moon-block(\s|$)/.test(l.attrs.class || '')
      ? MOON_BLOCK_STROKE : MOON_BAND_STROKE) / 2;
    top    = Math.min(top,    Number(l.attrs.y1) - half);
    bottom = Math.max(bottom, Number(l.attrs.y2) + half);
  });
  return { top: top, bottom: bottom };
}

function tickXFor(cell, coveredKm) {
  return expectedRibbonX((cell.loKm + cell.hiKm) / 2, coveredKm);
}

var totalTicksAcrossRoutes = 0;
ALL_MOON_ROUTES.forEach(function (routeId) {
  var drawn = renderMoonInto(routeId);
  var ticks = moonTicksOf(drawn.svg);
  var named = [drawn.notable.sky, drawn.notable.lantern].filter(Boolean);
  totalTicksAcrossRoutes += ticks.length;

  equal(ticks.length, named.length,
    routeId + ': one tick per night the sentence names, and not one more');

  // The x each tick must sit at, from the CELL, so a tick placed at the
  // merged span's centre (the defect this fixes) lands somewhere else.
  var expectedXs = named.map(function (c) { return tickXFor(c, drawn.coveredKm); });
  var actualXs   = ticks.map(function (t) { return Number(t.attrs.x1); });
  arrEqual(actualXs, expectedXs,
    routeId + ': each tick sits at the centre of its own night\'s kilometres');

  // The band's own drawn extent on this route, from the emitted rows and
  // the stylesheet's real stroke-widths.
  var bandY = bandYRangeOf(moonLinesOf(drawn.svg));

  ticks.forEach(function (t, i) {
    equal(Number(t.attrs.x2), Number(t.attrs.x1), routeId + ' tick ' + i + ': is vertical');

    var top = Number(t.attrs.y1), bottom = Number(t.attrs.y2);
    ok(bottom > top, routeId + ' tick ' + i + ': runs downward, top ' + top + ' to bottom ' + bottom);

    // No overlap with the band at all (H1) — not "shorter than it", which
    // is what the old assertion claimed to check and did not. On the band
    // the mark cleared 1.550:1 against band 4 where WCAG 1.4.11 asks 3:1,
    // and no colour existed that would have cleared it at both ends of
    // the ramp. It is measured against 3:1 on the page background in
    // js/muted-contrast.test.js, and that measurement is only the right
    // one while this holds.
    ok(top > bandY.bottom,
      routeId + ' tick ' + i + ': starts at y=' + top + ', below the band\'s own lower edge ('
        + bandY.bottom + ') — a mark that touches the band is measured against the wrong thing');

    // A mark that cleared the band by shrinking to nothing would satisfy
    // the line above and be this page's oldest defect again.
    var heightPx = (bottom - top) * (NARROWEST_CONTENT_PX / VIEWBOX_UNITS);
    ok(heightPx >= 1,
      routeId + ' tick ' + i + ': is ' + heightPx.toFixed(3) + ' device px tall on the narrowest '
        + 'column this page renders at — under one pixel it is painted at partial coverage, and '
        + 'every contrast figure measured for it is a fiction');
  });

  // A tick names a kilometre, so the kilometre it names must have ink on
  // it: every mark must land inside some drawn band's x-range, or it
  // points at bare page.
  ticks.forEach(function (t, i) {
    var x = Number(t.attrs.x1);
    var covering = moonLinesOf(drawn.svg).filter(function (l) {
      return Number(l.attrs.x1) <= x && x <= Number(l.attrs.x2);
    });
    ok(covering.length > 0, routeId + ' tick ' + i + ': falls on a span that was actually drawn');
  });
});
ok(totalTicksAcrossRoutes > 0, 'the tick sweep was non-vacuous (' + totalTicksAcrossRoutes + ' marks across seven routes)');

// A tick belongs to a clause, so a suppressed clause draws none.
// kumano-kodo on the pinned date suppresses both (AC #9 and AC #10): a
// flat darkness band leaves no darkest night, and no night reaches usable
// moonlight.
var moonKumano = renderMoonInto('kumano-kodo');
equal(moonKumano.notable.sky, null, 'kumano-kodo: fixture sanity — the sky clause is suppressed');
equal(moonKumano.notable.lantern, null, 'kumano-kodo: fixture sanity — the lantern clause is suppressed');
equal(moonTicksOf(moonKumano.svg).length, 0,
  'kumano-kodo: a walk naming no night is marked nowhere');
ok(moonLinesOf(moonKumano.svg).length > 0,
  'kumano-kodo: but the strip itself still draws — only the superlative is withheld');

// One clause suppressed, one not: camino-ingles never reaches usable
// moonlight (AC #9), so it names a sky night and no lantern night.
var moonIngles = renderMoonInto('camino-ingles');
equal(moonIngles.notable.lantern, null, 'camino-ingles: fixture sanity — no lantern night exists');
ok(moonIngles.notable.sky !== null, 'camino-ingles: fixture sanity — but a sky night does');
equal(moonTicksOf(moonIngles.svg).length, 1,
  'camino-ingles: one clause, one mark — the marks and the sentence name the same nights');

// The mark shares its row with the axis labels, so the third thing it
// has to clear is the labels themselves: a named night can be night 1 of
// a 33-night walk, and its mark then lands a few units from the left
// label's own anchor. Measured against the emitted baseline and the
// stylesheet's real font-size, at 0.75em above the baseline — a bound on
// any Lato glyph's height (its cap height is 0.7165em, and the ascenders
// in "night" reach no higher).
var LABEL_ASCENDER_EM = 0.75;
var francesMark = moonTicksOf(moonFrances.svg)[0];
var francesLabelBaseline = Number(byClass(moonFrances.svg, 'dl-moon-label')[0].attrs.y);
ok(Number(francesMark.attrs.y2) <= francesLabelBaseline - MOON_LABEL_FONT * LABEL_ASCENDER_EM,
  'camino-frances: the mark ends at y=' + francesMark.attrs.y2 + ', clear of the axis labels\' own '
    + 'glyphs (baseline ' + francesLabelBaseline + ', font-size ' + MOON_LABEL_FONT + ')');

// The ticks are emitted after the bands. They no longer overlap one, so
// this is no longer about paint order covering a mark — it is the DOM
// order the AC #11 read-back below walks, and the one thing that would
// still put a mark under a band if the band ever grew into its row.
var francesTickIdx = moonFrances.svg.children.indexOf(moonTicksOf(moonFrances.svg)[0]);
var francesLastBandIdx = moonFrances.svg.children.indexOf(
  moonLinesOf(moonFrances.svg)[moonLinesOf(moonFrances.svg).length - 1]);
ok(francesTickIdx > francesLastBandIdx,
  'camino-frances: the marks are emitted after every band, so nothing paints over them');

// The tick must not reintroduce a seam. The band count is unchanged by
// the marks: a tick that split a span would raise it.
equal(moonLinesOf(moonFrances.svg).length, 10,
  'camino-frances: still ten spans — marking a night does not split the span it sits on');

/* =============================================
   AC #11, measured on the DRAWN strip.

   The version in js/daylight-math.test.js builds its night set from
   CELLS. Cells and emitted <line>s became different populations the
   moment coalescing landed, so that check stopped measuring what its
   label claims — it is kept there as the prose-vs-schedule invariant it
   really is, and the acceptance criterion is checked here, against what
   the browser would paint.

   Every night the sentence names must have ink at its own place on the
   axis, and a mark saying which place that is.
   ============================================= */

console.log('\n=== AC #11 — every night the sentence names has ink, and a mark, at its own place ===\n');

function namedNightNumbers(text) {
  var out = [], m, re = /nights? (\d+)(?: to (\d+))?/gi;
  while ((m = re.exec(text)) !== null) {
    out.push(parseInt(m[1], 10));
    if (m[2]) out.push(parseInt(m[2], 10));
  }
  return out;
}

var acElevenNightsChecked = 0;
ALL_MOON_ROUTES.forEach(function (routeId) {
  var drawn = renderMoonInto(routeId);
  // The sentence as the strip actually carries it, not as the pure math
  // returns it: aria-label, <title> and the visible summary are the
  // three surfaces a reader can reach, and all three must agree.
  var label = drawn.svg.attrs['aria-label'];
  var titleEl = drawn.svg.children.filter(function (c) { return c.tag === 'title'; })[0];
  equal(label, drawn.summary.textContent, routeId + ': aria-label and the visible summary are one sentence');
  equal(titleEl.textContent, label, routeId + ': the <title> carries it too');

  var labels = byClass(drawn.svg, 'dl-moon-label');
  var edgeNights = labels.map(function (l) { return parseInt(l.textContent.replace('night ', ''), 10); });
  equal(labels.length, 2, routeId + ': two axis labels');

  var spans = moonLinesOf(drawn.svg);
  var ticks = moonTicksOf(drawn.svg);

  namedNightNumbers(label).forEach(function (n) {
    acElevenNightsChecked++;
    ok(n >= edgeNights[0] && n <= edgeNights[1],
      routeId + ': night ' + n + ' named in the prose lies between the axis labels ('
        + edgeNights[0] + '..' + edgeNights[1] + ')');
  });

  // One mark per clause that names a night, read out of the prose rather
  // than out of the model that produced it.
  var clausesNamingANight = (/Darkest sky on night/.test(label) ? 1 : 0)
                          + (/holds? usable moonlight/.test(label) ? 1 : 0);
  equal(ticks.length, clausesNamingANight,
    routeId + ': the strip carries exactly as many marks as the sentence has clauses naming a night');

  ticks.forEach(function (t) {
    var x = Number(t.attrs.x1);
    var inked = spans.some(function (s) {
      return Number(s.attrs.x1) <= x && x <= Number(s.attrs.x2);
    });
    ok(inked, routeId + ': the place the sentence points at has ink on it');
  });

  if (routeId === 'kumano-kodo') {
    equal(namedNightNumbers(label).length, 0,
      routeId + ': names no night at all — both clauses are suppressed, so nothing above is vacuously true elsewhere');
  } else {
    ok(namedNightNumbers(label).length > 0, routeId + ': the parse-back examined at least one named night');
  }
});
ok(acElevenNightsChecked > 0, 'AC #11 examined a real population of named nights (' + acElevenNightsChecked + ')');

/* =============================================
   The two guards inside renderMoonStrip, exercised so that deleting
   either one goes red. Both used to be covered only by a
   "never emits a NaN coordinate" assertion that could not fail —
   kmToRibbonX clamps and returns finite for every finite kilometre, so
   the assertion held with the guards deleted (verified by mutation).
   ============================================= */

console.log('\n=== renderMoonStrip — undrawable cells are skipped, and the skip is observable ===\n');

function moonCellFixture(overrides) {
  var cell = {
    index: 0, loKm: 0, hiKm: 10, nights: 1, isBlock: false, firstNight: 1,
    dates: [MOON_START], stageName: 'Fixture stage',
    moon: { mean: 0.10, peak: 0.30, usableFrac: 1, hours: 9 },
    moonBand: 3, darkMean: 3, darkBand: 3, phaseFirst: 0.5, phaseLast: 0.5
  };
  Object.keys(overrides).forEach(function (k) { cell[k] = overrides[k]; });
  return cell;
}

function renderFixtureCells(cells, coveredKm) {
  var svg = makeNode('svg');
  Daylight.renderMoonStrip(cells, { sky: null, lantern: null }, MOON_START,
                           coveredKm, svg, makeNode('p'));
  return svg;
}

// A cell whose dark window never closes (nightMoonLux -> null) has no
// band to paint. It sits BETWEEN two drawable cells that do not abut
// each other, so if it were drawn the count would rise to three.
var nullMoonSvg = renderFixtureCells([
  moonCellFixture({ loKm: 0,  hiKm: 10 }),
  moonCellFixture({ loKm: 10, hiKm: 20, moon: null, moonBand: null }),
  moonCellFixture({ loKm: 20, hiKm: 30 })
], 30);
var nullMoonLines = moonLinesOf(nullMoonSvg);
equal(nullMoonLines.length, 2, 'a cell with no resolvable dark window draws no line of its own');
ok(nullMoonLines.every(function (l) { return l.attrs.class.indexOf('band-null') === -1; }),
  'no line is emitted with a null band in its class name');
ok(Number(nullMoonLines[1].attrs.x1) - Number(nullMoonLines[0].attrs.x2) > 1,
  'the unresolvable night leaves a real blank between the two spans around it');

// A cell placed entirely past the end of the darkness axis has km width
// but no DRAWN width: kmToRibbonX clamps both ends onto x=552. A
// zero-width <line> still paints a hairline, so it must not be emitted.
var pastAxisSvg = renderFixtureCells([
  moonCellFixture({ loKm: 0,  hiKm: 10 }),
  moonCellFixture({ loKm: 40, hiKm: 50, moonBand: 1 })
], 30);
var pastAxisLines = moonLinesOf(pastAxisSvg);
equal(pastAxisLines.length, 1, 'a cell lying entirely past coveredKm draws nothing');
equal(Number(pastAxisLines[0].attrs.x2), 216,
  'the in-axis span is still drawn at its own extent (10 of 30 km), not stretched to the edge');

// Every cell undrawable: no bands, and no caption over empty space
// either — the strip renders nothing at all rather than a sentence
// counting nights it did not draw (F5).
var allNullSvg = makeNode('svg');
var allNullSummary = makeNode('p');
Daylight.renderMoonStrip([
  moonCellFixture({ loKm: 0,  hiKm: 10, moon: null, moonBand: null }),
  moonCellFixture({ loKm: 10, hiKm: 20, moon: null, moonBand: null })
], { sky: null, lantern: null }, MOON_START, 30, allNullSvg, allNullSummary);
equal(moonLinesOf(allNullSvg).length, 0, 'an all-undrawable schedule draws no bands');
equal(allNullSummary.textContent, '', 'an all-undrawable schedule writes no summary sentence');
equal(allNullSvg.children.length, 0, 'an all-undrawable schedule emits no axis labels or <title> either');

/* =============================================
   G5 — the drawable predicate answers the RENDERER's question.

   isDrawableCell used to test km width; the renderer additionally
   dropped any span whose clamped x-coordinates collapsed onto one edge.
   A cell placed past the end of the darkness axis therefore counted as
   drawable — named in the prose, counted on the axis, drawing nothing.
   Unreachable on the seven shipped routes today, and one re-bake with a
   shorter coveredKm than its own waypoints away.
   ============================================= */

console.log('\n=== a cell with kilometres but no axis is not drawable, in both layers (G5) ===\n');

var pastAxisCell = moonCellFixture({ loKm: 40, hiKm: 50, moonBand: 1 });
ok(pastAxisCell.hiKm > pastAxisCell.loKm, 'fixture sanity: the cell has real kilometres');
equal(NightMath.isDrawableCell(pastAxisCell, 30), false,
  'a cell lying wholly past coveredKm is not drawable — the axis, not the kilometre, decides');
equal(NightMath.isDrawableCell(pastAxisCell, 100), true,
  'and the same cell IS drawable on an axis long enough to hold it');

// The predicate and the renderer now agree by construction, which is the
// point: what the sentence counts is what the strip draws.
var pastAxisSentence = NightMath.nightSummarySentence(
  [moonCellFixture({ loKm: 0, hiKm: 10 }), pastAxisCell],
  { sky: null, lantern: null }, MOON_START, 30);
equal(pastAxisSentence.indexOf('2 nights from') === 0, true,
  'the sentence still states the walk\'s own length (2 nights)');
ok(pastAxisSentence.indexOf('The strip draws 1 of them.') !== -1,
  'and says how many it drew, rather than counting a night with no ink: '
    + JSON.stringify(pastAxisSentence));

/* And the blank it reports is the blank the reader sees (H2). This
   fixture places 10 of 30 axis kilometres, so two thirds of the strip
   carries no ink. unplacedClause used to sum hiKm - loKm unclamped, so
   the 40-50 km cell contributed ten kilometres the axis does not have
   and the sentence said 33% — the same number this file used to print
   in the message above and never assert, which is how it survived. */
ok(pastAxisSentence.indexOf('No stage is placed on 67% of the route') !== -1,
  'and the blank it reports is the blank the axis really has (67%, not the 33% an '
    + 'unclamped sum gives): ' + JSON.stringify(pastAxisSentence));

/* =============================================
   G9 — the NightMathRef guard, built rather than assumed.

   `!NightMathRef` in renderMoonStrip is unreachable through node's own
   require (it always succeeds), so deleting it cost nothing and the
   guard was decoration. It is real on a page that loads daylight.js
   without js/night-math.js — a script tag away — and that is what this
   constructs: a second instance of the module resolved against a
   null night-math.

   Runs last in this file, and restores the cache, so nothing above it
   ever sees the stubbed instance.
   ============================================= */

console.log('\n=== a page loaded without night-math.js draws nothing rather than throwing (G9) ===\n');

var nightMathPath = require.resolve('./night-math.js');
var daylightPath  = require.resolve('./daylight.js');
var savedNightMathModule = require.cache[nightMathPath];

require.cache[nightMathPath] = {
  id: nightMathPath, filename: nightMathPath, loaded: true, exports: null
};
delete require.cache[daylightPath];
var DaylightWithoutNightMath = require('./daylight.js');

var nightlessSvg = makeNode('svg');
var nightlessSummary = makeNode('p');
var nightlessThrew = false;
try {
  DaylightWithoutNightMath.renderMoonStrip(
    moonCellsFor('camino-frances').cells, { sky: null, lantern: null },
    MOON_START, 763.7, nightlessSvg, nightlessSummary, true);
} catch (e) {
  nightlessThrew = true;
}

require.cache[nightMathPath] = savedNightMathModule;
delete require.cache[daylightPath];
require('./daylight.js');

ok(!nightlessThrew, 'renderMoonStrip on a page without night-math.js does not throw');
equal(nightlessSvg.children.length, 0, 'and draws no bands, no marks and no labels');
equal(nightlessSummary.textContent, '',
  'and writes no sentence — a strip with bands but no text equivalent is unreadable to a screen reader (D10)');
ok(NightMath.isDrawableCell(moonCellFixture({}), 30) === true,
  'fixture sanity: the real night-math is back in place for anything after this');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
