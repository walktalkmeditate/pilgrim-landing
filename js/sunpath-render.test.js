/* =============================================
   Sun Path — dark-hours render harness

   Run via:  node js/sunpath-render.test.js

   Asserts on the elements drawDarkHours actually EMITS, not on the
   series it was given. Why that distinction earns a whole harness is
   written out once, in SunPathMath.zeroDarkRuns' doc comment; the spec
   makes it decision D5.

   The fake document is hand-rolled in the same spirit as
   js/daylight-render.test.js's — enough surface to record attributes,
   nothing more.
   ============================================= */

'use strict';

function makeNode(tag) {
  var node = {
    tag: tag,
    attrs: {},
    className: '',
    textContent: '',
    children: [],
    firstChild: null,
    dataset: {},
    style: {},
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    setAttribute: function (k, v) { node.attrs[k] = v; },
    getAttribute: function (k) { return node.attrs[k]; },
    addEventListener: function () {},
    querySelectorAll: function () { return []; },
    appendChild: function (c) { node.children.push(c); node.firstChild = node.children[0]; return c; },
    removeChild: function (c) {
      var i = node.children.indexOf(c);
      if (i !== -1) node.children.splice(i, 1);
      node.firstChild = node.children.length ? node.children[0] : null;
      return c;
    }
  };
  return node;
}

global.document = {
  createElementNS: function (ns, tag) { return makeNode(tag); },
  createElement: function (tag) { return makeNode(tag); }
};

var M = require('./sunpath-math.js');
var Tools = require('./sunpath-tools.js');

var passed = 0, failed = 0, failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function equal(a, b, label) {
  if (a === b) { passed++; console.log('  ✓ ' + label + '  (' + a + ')'); }
  else { failed++; failures.push(label + ': expected ' + b + ', got ' + a);
         console.log('  ✗ ' + label + '  (' + a + ' vs ' + b + ')'); }
}

/* Every count in this file used to be checked with indexOf, and
   '1230'.indexOf('123') is 0 — so multiplying both sentence builders'
   counts by ten left all 47 assertions green. A figure is only stated if
   nothing numeric abuts it on either side. */
function statesNumber(text, value) {
  var token = String(value).replace(/\./g, '\\.');
  return new RegExp('(^|[^\\d.])' + token + '(?![\\d.])').test(text);
}

function statesIt(text, value, label) {
  if (statesNumber(text, value)) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label + ': "' + value + '" is not stated as its own figure');
         console.log('  ✗ ' + label + '  (looked for ' + value + ')'); }
}

var YEAR = 2026;

// The geometry that ships, read from the module rather than restated. A
// literal 200 − 22 here goes stale the moment the viewBox is retuned, and
// the baseline check below would then pass vacuously — D5's own failure
// shape, applied to the test's arithmetic.
// Read from the stylesheet, not assumed: the whole point of the check
// below is that the rect's bottom edge is only forbidden when it is
// stroked, and whether it is stroked lives in css/sunpath.css.
var BAND_CSS = require('fs')
  .readFileSync(require('path').join(__dirname, '..', 'css', 'sunpath.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
var BAND_RULE = /\.sunpath-dark-none\s*\{([^}]*)\}/.exec(BAND_CSS);
var BAND_IS_STROKED = !!BAND_RULE && !/stroke:\s*none/.test(BAND_RULE[1])
  && /stroke:/.test(BAND_RULE[1]);

var VIEW = Tools.DARK_VIEW;
var PLOT_H = VIEW.h - VIEW.padT - VIEW.padB;
var BASELINE_Y = VIEW.h - VIEW.padB;

function expectedX(dayIndex, days) {
  return VIEW.padL + (dayIndex / (days - 1)) * (VIEW.w - VIEW.padL - VIEW.padR);
}

function draw(lat) {
  var plot = makeNode('svg');
  var caption = makeNode('p');
  Tools.drawDarkHours(lat, plot, caption, YEAR);
  return {
    plot: plot,
    caption: caption,
    curves: plot.children.filter(function (c) { return c.tag === 'polyline'; }),
    bands:  plot.children.filter(function (c) { return c.tag === 'rect'; }),
    // Split by class, not by tag: the band's two ends are <line> too, and
    // a filter that lumps them in with the turnings would report six marks
    // at 60° and call it four.
    marks:  plot.children.filter(function (c) {
      return c.tag === 'line' && c.attrs['class'] === 'sunpath-dark-turning';
    }),
    edges:  plot.children.filter(function (c) {
      return c.tag === 'line' && c.attrs['class'] === 'sunpath-dark-edge';
    })
  };
}

console.log('\n=== The curve is drawn, one point per night ===\n');

var d45 = draw(45);
equal(d45.curves.length, 1, '45°: one unbroken curve — it has a night every night');
var pts45 = d45.curves[0].attrs.points.split(' ');
equal(pts45.length, 365, '45°: 365 points, one per night of 2026');
equal(d45.bands.length, 0, '45°: no zero-dark band, because there is no such stretch');

console.log('\n=== A stretch with no night is a BAND, never a flat piece of curve (D5) ===\n');

var d60 = draw(60);
var d70 = draw(70);

equal(d60.bands.length, 1, '60°: the 123-night stretch emits exactly one band element');
equal(d70.bands.length, 1, '70°: the 177-night stretch emits exactly one band element');

// The band must have real height. A zero-height rect is the same defect
// as a zero-height curve point — present in the DOM, absent on screen.
ok(Number(d60.bands[0].attrs.height) > 100,
  '60°: the band spans the plot vertically, not a hairline at the baseline');
ok(Number(d60.bands[0].attrs.width) > 1,
  '60°: the band has real width');

// And the curve must BREAK around it, rather than running through at zero.
equal(d60.curves.length, 2, '60°: the curve is two segments, broken by the stretch');
equal(d70.curves.length, 2, '70°: the curve is two segments');

var all60 = d60.curves.reduce(function (a, c) { return a + c.attrs.points.split(' ').length; }, 0);
equal(all60, 365 - 123, '60°: the curve draws only the 242 nights that exist');
var all70 = d70.curves.reduce(function (a, c) { return a + c.attrs.points.split(' ').length; }, 0);
equal(all70, 365 - 177, '70°: the curve draws only the 188 nights that exist');

// No emitted point may sit at the baseline: that is what a zero would
// look like, and there are no zeros in a curve that skips them.
var atBaseline = 0;
d60.curves.forEach(function (c) {
  c.attrs.points.split(' ').forEach(function (p) {
    if (Math.abs(Number(p.split(',')[1]) - BASELINE_Y) < 0.01) atBaseline++;
  });
});
equal(atBaseline, 0, '60°: not one curve point sits on the baseline');

// The same rule, applied to EVERY element rather than to the curve's
// points. The band shipped as a stroked <rect>, whose bottom edge is a
// horizontal stone line along the baseline — 1.251:1 from the curve's own
// ink in dark mode, near enough to read as a flat piece of curve at zero.
// The guard above looked only at polyline points and never saw it. This is
// the shape of the mistake, not just the instance: a property asserted
// against one element while another draws the thing it forbids.
var horizontalOnBaseline = [];
d60.plot.children.forEach(function (el) {
  if (el.tag === 'rect') {
    var bottom = Number(el.attrs.y) + Number(el.attrs.height);
    var stroked = (el.attrs['class'] || '').indexOf('sunpath-dark-none') !== -1;
    if (stroked && Math.abs(bottom - BASELINE_Y) < 0.01) {
      // A fill-only rect may end at the baseline; a stroked one draws on it.
      if (BAND_IS_STROKED) horizontalOnBaseline.push('rect bottom edge');
    }
  }
  if (el.tag === 'line'
      && Math.abs(Number(el.attrs.y1) - Number(el.attrs.y2)) < 0.01
      && Math.abs(Number(el.attrs.y1) - BASELINE_Y) < 0.01) {
    horizontalOnBaseline.push(el.attrs['class'] + ' (horizontal line)');
  }
});
equal(horizontalOnBaseline.length, 0,
  '60°: nothing at all draws a horizontal rule along the baseline'
    + (horizontalOnBaseline.length ? ' — found ' + horizontalOnBaseline.join(', ') : ''));

// The band's two ends carry its 3:1, so they have to exist, be vertical,
// and land where the stretch does. Vertical is the load-bearing word: a
// horizontal rule in this colour is the defect above.
equal(d60.edges.length, 2, '60°: the stretch is bounded by exactly two edge rules');
equal(d70.edges.length, 2, '70°: likewise');
ok(d60.edges.every(function (e) { return Number(e.attrs.x1) === Number(e.attrs.x2); }),
  '60°: both edges are vertical — a horizontal one would read as curve');
ok(d60.edges.every(function (e) {
  return Math.abs(Number(e.attrs.y1) - VIEW.padT) < 0.01
      && Math.abs(Number(e.attrs.y2) - BASELINE_Y) < 0.01;
}), '60°: and both span the plot, matching the wash they bound');
equal(Number(d60.edges[0].attrs.x1), Number(d60.bands[0].attrs.x),
  '60°: the first edge stands at the wash\'s left side');
equal(Number(d60.edges[1].attrs.x1),
  Number(d60.bands[0].attrs.x) + Number(d60.bands[0].attrs.width),
  '60°: and the second at its right — not a pixel adrift from what it marks');
equal(d45.edges.length, 0, '45°: no stretch, so no edges to bound it');

// The axis is 14 h because 70°, the highest latitude the picker offers,
// peaks at 13.6. Nothing stops a caller handing this a latitude the picker
// does not offer — yourSky does exactly that — and at the modelled edge a
// night runs 23.0 h. On a fixed 14-hour axis that curve is drawn above the
// top of the viewBox: present in the DOM, off the plot.
//
// Asserted at the edge itself, not past it: draw(85) now emits nothing, and
// `Math.max.apply(null, [])` is −Infinity, so this test passed on an empty
// set for as long as it named a latitude the instrument had stopped drawing.
var EDGE_LAT = require('./sunpath-math.js').MAX_MODELLED_LAT_DEG;
var dEdge = draw(-EDGE_LAT);
var yEdge = dEdge.curves.reduce(function (a, c) {
  return a.concat(c.attrs.points.split(' ').map(function (p) { return Number(p.split(',')[1]); }));
}, []);
// Non-vacuity is the whole point of this line: the assertion below reads
// Math.max/Math.min over this array, and both are silently satisfiable by
// an empty one. Near the pole most of the year has no astronomical night,
// so the count is a minority of 365 and that is correct.
ok(yEdge.length > 100,
  'the modelled edge draws a real curve to measure — ' + yEdge.length + ' of 365 nights');
ok(Math.max.apply(null, yEdge) <= BASELINE_Y + 0.01 && Math.min.apply(null, yEdge) >= VIEW.padT - 0.01,
  '−' + EDGE_LAT + '°, where a night runs 23.0 h, still draws inside the box  (y '
  + Math.min.apply(null, yEdge).toFixed(1) + '…' + Math.max.apply(null, yEdge).toFixed(1)
  + ' within ' + VIEW.padT + '…' + BASELINE_Y + ')');

console.log('\n=== The equator is flat, which is the section\'s whole point ===\n');

var d0 = draw(0);
var ys = d0.curves[0].attrs.points.split(' ').map(function (p) { return Number(p.split(',')[1]); });
var spread = Math.max.apply(null, ys) - Math.min.apply(null, ys);
ok(spread < 5, 'the equator\'s drawn curve varies by under 5 units of 164 — visibly flat  ('
  + spread.toFixed(2) + ')');

var y70 = d70.curves.reduce(function (a, c) {
  return a.concat(c.attrs.points.split(' ').map(function (p) { return Number(p.split(',')[1]); }));
}, []);
var spread70 = Math.max.apply(null, y70) - Math.min.apply(null, y70);
ok(spread70 > spread * 10,
  '70° swings more than ten times as far as the equator  (' + spread70.toFixed(2)
  + ' vs ' + spread.toFixed(2) + ')');

console.log('\n=== The turnings are marked ===\n');

// Turnings comes from window.Turnings in the browser; absent here, the
// marks are skipped rather than drawn wrong. Assert the graceful path,
// then the real one with a stub.
equal(d45.marks.length, 0, 'with no Turnings module present, no turning marks are invented');

var STUB_TURNINGS = {
  springEquinox:  [2, 20, 14, 46],
  summerSolstice: [5, 21,  8, 24],
  autumnEquinox:  [8, 23,  0,  5],
  winterSolstice: [11, 21, 20, 50]
};

global.Turnings = {
  getTurningsForYear: function (y) {
    var out = {};
    Object.keys(STUB_TURNINGS).forEach(function (k) {
      var t = STUB_TURNINGS[k];
      out[k] = new Date(Date.UTC(y, t[0], t[1], t[2], t[3]));
    });
    return out;
  }
};
var withTurnings = draw(45);
equal(withTurnings.marks.length, 4, 'all four turnings are marked when the module is there');

// A magnitude, not a sign. `y2 > y1` is satisfied by 0.0001 units — a mark
// present in the DOM and absent on screen, which is the family of defect
// this whole harness exists for. The band twelve lines up is held to > 100
// for the same reason; a turning mark spans the plot exactly.
ok(withTurnings.marks.every(function (m) {
  return Number(m.attrs.y2) - Number(m.attrs.y1) >= PLOT_H - 0.01;
}), 'each turning mark spans the full ' + PLOT_H + ' units of plot height, not a hairline');

// And nothing yet has tied a mark to its DATE: four marks at the right
// heights, five days off down the year, would satisfy every assertion
// above. Each stub turning's own index says where its mark belongs.
var marked45 = withTurnings.marks.map(function (m) { return Number(m.attrs.x1); });
Object.keys(STUB_TURNINGS).forEach(function (key) {
  var t = STUB_TURNINGS[key];
  var idx = Math.floor((Date.UTC(YEAR, t[0], t[1], t[2], t[3]) - Date.UTC(YEAR, 0, 1)) / 86400000);
  var want = expectedX(idx, 365);
  ok(marked45.some(function (x) { return Math.abs(x - want) < 0.01; }),
    key + ' is marked at day ' + idx + ', x = ' + want.toFixed(2) + ' — the date it falls on');
});

console.log('\n=== The caption carries what the picture carries (D10) ===\n');

ok(d0.caption.textContent.indexOf('0°') !== -1, 'the caption names the latitude');
ok(/within half an hour/.test(d0.caption.textContent),
  'the equator\'s caption states the flatness, which is the finding');
ok(/no astronomical night at all/.test(d60.caption.textContent),
  '60°: the caption states the stretch with no night — the fact a curve conveys most cheaply and prose drops most easily');
statesIt(d60.caption.textContent, 123,
  '60°: the caption gives the number of nights, not just their existence');
statesIt(d70.caption.textContent, 177, '70°: likewise, 177');
ok(!/no astronomical night at all/.test(d45.caption.textContent),
  '45° has no such stretch, so its caption does not claim one');

// 0 is darkHoursOn's sentinel for "this night has no night", so a minimum
// taken across the whole series states a 0.0-hour night as a measurement
// — and the clause after it says those nights do not exist. The SVG is
// aria-hidden, so this paragraph is the entire reading a screen reader, a
// crawler or an LLM gets: a contradiction here is not a cosmetic one.
ok(!/between 0\.0 /.test(d60.caption.textContent),
  '60°: the caption does not offer a 0.0-hour night and then deny those nights exist');
statesIt(d60.caption.textContent, 0.9,
  '60°: the shortest night that exists is 0.9 h, and that is what the caption says');
statesIt(d60.caption.textContent, 11.7,
  '60°: the swing is over the nights that exist — 11.7 h, not 12.6');
statesIt(d70.caption.textContent, 1.2, '70°: likewise its shortest real night, 1.2 h');
statesIt(d70.caption.textContent, 12.4, '70°: and its real swing, 12.4 h');

// The qualifier that makes the range honest. At 60° the caption reports a
// 0.9-hour shortest night, and 123 nights of that year have no night at
// all — so the range is over the nights that HAVE one, and the sentence
// has to say so. Without "on the nights it comes at all" it reads "true
// dark lasts between 0.9 and 12.6 hours a night", which claims a 0.9-hour
// night happens nightly at a latitude where a third of the year has none.
//
// This is the eighth instance's twin, and the fix for the eighth — assert
// that "between 0.0 " is absent — does not touch it: every number in the
// unqualified sentence is correct. It is the missing clause that lies. The
// branch shipped with no assertion on either side of it, and 94 assertions
// stayed green with it forced permanently on or permanently off.
var QUALIFIER = /on the nights it comes at all/;

ok(QUALIFIER.test(d60.caption.textContent),
  '60°: the range is qualified — it is over the nights that have a night');
ok(QUALIFIER.test(d70.caption.textContent), '70°: likewise');
ok(!/hours a night/.test(d60.caption.textContent),
  '60°: and does not also say "a night", which would put the claim back');

ok(!QUALIFIER.test(d45.caption.textContent),
  '45° has a night every night, so its range needs no qualifying — and an '
    + 'unearned qualifier is the same defect pointing the other way');
ok(/hours a night/.test(d45.caption.textContent),
  '45°: it says "a night" plainly, because there every night is one');
ok(!QUALIFIER.test(d0.caption.textContent), '0°: likewise unqualified');

// Tied to the data rather than to the two latitudes above, so the pairing
// cannot drift: wherever a stretch of no-night exists, the qualifier is
// there, and wherever none exists, it is not.
var QUALIFIER_LATS = [0, 23.5, 45, 60, 70, -60, -70, 84];
var qualifierChecked = 0;
QUALIFIER_LATS.forEach(function (lat) {
  var series = M.darkHoursYear(lat, YEAR);
  var runs = M.zeroDarkRuns(series);
  var text = Tools.darkHoursSentence(lat, series, runs, []);
  // A latitude with no night at all takes a different sentence, which has
  // no range to qualify. No latitude in the list is one — and the count
  // below is why that skip cannot quietly become all of them.
  if (!series.some(function (h) { return h > 0; })) return;
  qualifierChecked++;
  equal(QUALIFIER.test(text), runs.length > 0,
    lat + '°: the qualifier is present exactly when there are nights without a night ('
      + runs.length + ' stretch' + (runs.length === 1 ? '' : 'es') + ')');
});
equal(qualifierChecked, QUALIFIER_LATS.length,
  'and every latitude in the list was actually checked — a loop that skips its way to zero '
    + 'assertions is the inert coverage this suite exists to catch');

// An all-zero series has no shortest night at all. No latitude on Earth
// produces one, so it is constructed — the guard has to hold before the
// case is reachable, not after.
var allZero = Tools.darkHoursSentence(85, [0, 0, 0], [{ startIndex: 0, endIndex: 2, days: 3 }], []);
ok(!/0\.0/.test(allZero),
  'a series with no nights in it reports no hours at all, rather than 0.0 of them');
ok(/never comes at all/.test(allZero),
  'and says the true thing instead: at that latitude the dark never comes');

var s1 = Tools.darkHoursSentence(60, M.darkHoursYear(60, YEAR), M.zeroDarkRuns(M.darkHoursYear(60, YEAR)));
var s2 = Tools.darkHoursSentence(60, M.darkHoursYear(60, YEAR), M.zeroDarkRuns(M.darkHoursYear(60, YEAR)));
ok(s1 === s2, 'darkHoursSentence is pure');

console.log('\n=== The turnings are drawn AND named (D10, AC #10) ===\n');

// Four marks ship at every latitude and nothing spoken names them. The
// standing prose does not: the page carries 19 "solstice"s and 16
// "equinox"es in other sections, so a page-wide regex for those words is
// green with §A deleted entirely. The caption is the only text a reader of
// this section is given, so the naming has to be in it.
ok(/solstice/i.test(withTurnings.caption.textContent),
  'the caption names the solstices its curve marks');
ok(/equinox/i.test(withTurnings.caption.textContent),
  'the caption names the equinoxes its curve marks');
ok(/March/.test(withTurnings.caption.textContent)
   && /June/.test(withTurnings.caption.textContent)
   && /September/.test(withTurnings.caption.textContent)
   && /December/.test(withTurnings.caption.textContent),
  'all four are named, and by month — the sentence is read at southern latitudes too');

// The other half of the same contract: prose must not name a mark that was
// never drawn. d45 was rendered before the Turnings stub existed.
ok(!/solstice|equinox/i.test(d45.caption.textContent),
  'with no marks on the plot, the caption claims none — the contradiction has two directions');

console.log('\n=== Your sky — the curve becomes personal (Task 4, D3) ===\n');

// D3: this EXTENDS the geolocation that already exists; it does not add a
// control, and it never blocks. The clause is pure so it can be asserted
// without a browser, and so the refusal path is a plain absence.

var clause45 = Tools.yourSkyDarkClause(45, YEAR);
ok(/8\.\d|9\.\d|1[01]\.\d/.test(clause45), '45°: the clause names a longest night in hours');
statesIt(clause45, 11.7, '45°: that longest night is 11.7 h, matching the series');
ok(!/never/.test(clause45), '45° always gets a night, so nothing is claimed about losing it');

var clause60 = Tools.yourSkyDarkClause(60, YEAR);
statesIt(clause60, 123, '60°: the clause counts the nights with no true dark');
ok(!/\b0\.0 hours\b/.test(clause60),
  '60°: and never offers 0.0 hours as its shortest — that is the sentinel, not a night');
ok(/never/.test(clause60), '60°: and says plainly that the dark never fully arrives');

var clause0 = Tools.yourSkyDarkClause(0, YEAR);
ok(/every night/.test(clause0) || /same/.test(clause0),
  'the equator gets its own reading — every night alike, not a swing of zero');

// The refusal path is an absence, not an empty string or a fabricated
// latitude. A caller that got no location must be able to tell.
equal(Tools.yourSkyDarkClause(null, YEAR), '', 'no latitude yields no clause at all');
equal(Tools.yourSkyDarkClause(undefined, YEAR), '', 'undefined likewise');
equal(Tools.yourSkyDarkClause(NaN, YEAR), '', 'NaN likewise — never a sentence about NaN°');

// Southern latitudes are a real reader, and they are NOT a mirror. −60°
// loses 116 nights to the midnight sun where +60° loses 123, because
// southern summer is the shorter one — Earth moves fastest near
// perihelion in January. Asserting the real number rather than a mirrored
// one is the difference between a clause that is true and one that looks
// true.
var clauseS = Tools.yourSkyDarkClause(-60, YEAR);
statesIt(clauseS, 116,
  '−60° reports its own 116 nights, not +60°\'s 123 — the hemispheres are not mirrors');
ok(/never/.test(clauseS), '−60° still says the dark never fully arrives');

// Amundsen–Scott station is permanently staffed at −89.9975°, and for 82
// nights of the year the dark there does not end. Told that "for 365
// nights it never fully arrives at all" — which is what a null collapsed
// to 0 produces — the reader is given the precise opposite of their sky.
// The instrument no longer tries to describe that sky. It says so.
var clausePole = Tools.yourSkyDarkClause(-89.9975, YEAR);
ok(/this instrument stops/.test(clausePole),
  'the south pole is told the instrument stops, not given a number for it');
ok(!statesNumber(clausePole, 365),
  'and is NOT told that all 365 of its nights lose the dark');
ok(!/never comes at all/.test(clausePole),
  'nor the opposite of its own sky');
ok(clausePole !== '',
  'and is not met with silence either — a blank clause is a bug a reader cannot see');

// The refusal is a latitude property, so it has to hold on the picker side
// too: nothing drawn, and a caption that says why rather than an empty plot
// under a stale sentence.
var refused = draw(85);
equal(refused.curves.length, 0, '85°: no curve is drawn');
equal(refused.bands.length, 0, '85°: and no band either');
equal(refused.marks.length, 0, '85°: and no turning marks over an empty plot');
ok(/this instrument stops/.test(refused.caption.textContent),
  '85°: the caption says the instrument stops');
statesIt(refused.caption.textContent, 85, '85°: and names the latitude asked for');
ok(!/hours of true dark/.test(refused.caption.textContent),
  '85°: and makes no claim about how long the dark lasts');

// A redraw from a modelled latitude to a declined one must clear what the
// first one left behind — otherwise the plot shows 70°'s curve under 85°'s
// refusal, which is the same class of defect as any other stale render.
var reused = makeNode('svg');
var reusedCap = makeNode('p');
Tools.drawDarkHours(70, reused, reusedCap, YEAR);
ok(reused.children.length > 0, 'a modelled latitude fills the plot');
Tools.drawDarkHours(85, reused, reusedCap, YEAR);
equal(reused.children.length, 0,
  'and redrawing at a declined one empties it — no curve left under the refusal');

ok(Tools.yourSkyDarkClause(45, YEAR) === Tools.yourSkyDarkClause(45, YEAR),
  'yourSkyDarkClause is pure');

console.log('\n=== Text equivalence (Task 6, D10) ===\n');

// The SVG is aria-hidden, matching the idiom setupDawnSweep and
// setupAnalemma already use on this page. That is a stronger position
// than role="img": there is no subtree for assistive tech to flatten, and
// no per-element <title> can be mistaken for one. The caption paragraph
// is real DOM text and carries the whole reading.
//
// The sibling page's mistake is the one being avoided here: /daylight's
// moon strip shipped positional marks with no textual analogue, so a
// sighted reader gained a capability a screen-reader user did not. Every
// mark this section draws is named in the sentence.

var fs = require('fs');
var page = fs.readFileSync(__dirname + '/../sunpath/index.html', 'utf8');

ok(page.indexOf('id="sunpath-dark-hours"') !== -1,
  'the page carries the section container');
ok(/aria-label="Hours of true dark across the year"/.test(page),
  'the section names itself for assistive tech');

// Everything the picture shows must be in the sentence, because the
// picture is hidden from anyone reading the text. Latitudes match as
// text; every figure matches as a whole number, so a count ten times too
// large cannot satisfy it.
[[0, ['0°'], [9.4, 9.6]],
 [45, ['45°'], [3.3, 11.7, 8.4]],
 [60, ['60°'], [0.9, 12.6, 11.7, 123]],
 [70, ['70°'], [1.2, 13.6, 12.4, 177]]]
  .forEach(function (t) {
    var text = draw(t[0]).caption.textContent;
    t[1].forEach(function (needle) {
      ok(text.indexOf(needle) !== -1,
        t[0] + '°: the caption states "' + needle + '", which the curve shows for free');
    });
    t[2].forEach(function (figure) {
      statesIt(text, figure,
        t[0] + '°: the caption states ' + figure + ', which the curve shows for free');
    });
  });

// No per-element title may creep into an aria-hidden subtree: it would be
// silently inert, which is worse than absent because it looks like coverage.
var titles = d60.plot.children.filter(function (c) { return c.tag === 'title'; });
equal(titles.length, 0, 'no <title> is emitted inside the hidden SVG — inert coverage is not coverage');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
