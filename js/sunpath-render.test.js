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
    // Real enough to drive the picker. These three were no-ops, which is
    // why setupDarkHours had no test: a click that goes nowhere and a
    // query that returns nothing cannot show that the wiring works.
    classes: {},
    listeners: {},
    classList: {
      add: function (c) { node.classes[c] = true; },
      remove: function (c) { delete node.classes[c]; },
      contains: function (c) { return !!node.classes[c]; }
    },
    setAttribute: function (k, v) { node.attrs[k] = v; },
    getAttribute: function (k) { return node.attrs[k]; },
    addEventListener: function (ev, fn) {
      (node.listeners[ev] = node.listeners[ev] || []).push(fn);
    },
    click: function () {
      (node.listeners.click || []).forEach(function (fn) { fn(); });
    },
    // Only the one selector setupDarkHours uses, matched against the class
    // the element was created with plus anything classList added.
    querySelectorAll: function (sel) {
      var want = sel.replace(/^\./, '');
      var out = [];
      (function walk(n) {
        n.children.forEach(function (c) {
          if (c.className === want || c.classes[want]) out.push(c);
          walk(c);
        });
      })(node);
      return out;
    },
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

function approxEq(a, b, tol, label) {
  if (Math.abs(a - b) <= tol) {
    passed++; console.log('  ✓ ' + label + '  (' + a.toFixed(2) + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + b.toFixed(2) + ' ±' + tol + ', got ' + a.toFixed(2));
    console.log('  ✗ ' + label + '  (' + a.toFixed(2) + ' vs ' + b.toFixed(2) + ')');
  }
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
// EVERY rule that can name the band, not just the bare selector: a
// `html[data-theme="dark"] .sunpath-dark-none` or `.sunpath-dark-svg rect`
// override re-strokes it in one mode only, and a single-selector lookup
// cannot see that. The mutation passed the whole suite until this changed.
var BAND_RULES = [];
var BAND_RE = /([^{}]+)\{([^}]*)\}/g;
var BAND_M;
while ((BAND_M = BAND_RE.exec(BAND_CSS)) !== null) {
  var sel = BAND_M[1].trim();
  if (/\.sunpath-dark-none\b/.test(sel) || /\.sunpath-dark-svg\s+rect\b/.test(sel)) {
    BAND_RULES.push({ sel: sel, decls: BAND_M[2] });
  }
}
var BAND_IS_STROKED = BAND_RULES.some(function (r) {
  return /stroke:/.test(r.decls) && !/stroke:\s*none/.test(r.decls);
});

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

// The band is pinned to the RUN it represents, not merely to itself. The
// edges were checked against the rect and the rect against nothing — so a
// band covering a hundred nights that do have true dark passed every
// assertion here. Geometry that agrees with itself is not geometry that
// agrees with the data.
//
// Definition, stated once because two are possible: a run covers the point
// indices startIndex..endIndex, and the plot draws one point per day AT
// darkX(i). So the band spans darkX(start)..darkX(end) — point to point,
// not day-cell to day-cell. It is one day-step narrower than a bar chart
// would draw, and that is correct for a point plot.
[[60, d60], [70, d70]].forEach(function (pair) {
  var lat = pair[0], drawn = pair[1];
  var runs = M.zeroDarkRuns(M.darkHoursYear(lat, YEAR));
  equal(drawn.bands.length, runs.length, lat + '°: one band per zero-dark run');
  runs.forEach(function (run, i) {
    var band = drawn.bands[i];
    approxEq(Number(band.attrs.x), expectedX(run.startIndex, 365), 0.01,
      lat + '°: band ' + i + ' starts at the run\'s first no-night day (index ' + run.startIndex + ')');
    approxEq(Number(band.attrs.x) + Number(band.attrs.width),
      expectedX(run.endIndex, 365), 0.01,
      lat + '°: and ends at its last (index ' + run.endIndex + ')');
  });
  // The complement of the same claim: no night that HAS dark may be drawn
  // under a band. This is what would have caught a band pinned to the
  // wrong indices while still matching its own edges.
  var series = M.darkHoursYear(lat, YEAR);
  var covered = 0;
  series.forEach(function (h, i) {
    if (h <= 0) return;
    var x = expectedX(i, 365);
    drawn.bands.forEach(function (b) {
      var x1 = Number(b.attrs.x), x2 = x1 + Number(b.attrs.width);
      if (x > x1 + 0.01 && x < x2 - 0.01) covered++;
    });
  });
  equal(covered, 0,
    lat + '°: not one night with true dark is drawn inside a no-night band');
});

// Every geometric assertion above runs against a latitude with exactly ONE
// zero-dark run. The multi-run shape — two stretches, one at each end of the
// calendar year — is rendered but was never asserted on, even though the
// fixture already existed in this file for an unrelated bounds check. The
// project named this debt after the moon strip ("no generalised guard that a
// strip's selection predicate and paint predicate agree") and it went unpaid
// through three fix waves on a branch built to close exactly this family.
//
// Not reachable from the picker, which is northern-only, and not from
// yourSky, which draws nothing. Latent, therefore — but the geometry is
// emitted, and a guard that only holds for the shape its author happened to
// draw is the shape of the problem, not a defence against it.
var MULTI_LAT = -M.MAX_MODELLED_LAT_DEG;
var dMulti = draw(MULTI_LAT);
var multiRuns = M.zeroDarkRuns(M.darkHoursYear(MULTI_LAT, YEAR));
ok(multiRuns.length > 1,
  MULTI_LAT + '°: has more than one zero-dark run (' + multiRuns.length + ') — the untested shape');
equal(dMulti.bands.length, multiRuns.length, MULTI_LAT + '°: one band per run');
equal(dMulti.edges.length, multiRuns.length * 2, MULTI_LAT + '°: two edges per run');
multiRuns.forEach(function (run, i) {
  approxEq(Number(dMulti.bands[i].attrs.x), expectedX(run.startIndex, 365), 0.01,
    MULTI_LAT + '°: band ' + i + ' starts at its own run (index ' + run.startIndex + ')');
});
ok(dMulti.edges.every(function (e) { return Number(e.attrs.x1) === Number(e.attrs.x2); }),
  MULTI_LAT + '°: every edge is vertical, across both runs');
var multiHoriz = 0;
dMulti.plot.children.forEach(function (el) {
  if (el.tag === 'line'
      && Math.abs(Number(el.attrs.y1) - Number(el.attrs.y2)) < 0.01
      && Math.abs(Number(el.attrs.y1) - BASELINE_Y) < 0.01) multiHoriz++;
});
equal(multiHoriz, 0, MULTI_LAT + '°: and nothing draws a horizontal rule on the baseline');

// The width floor. Math.max(w, 1) exists so a stretch of one or two nights
// still paints something a reader can see — and nothing exercised it: every
// latitude drawn above yields either no run or a run of 100+ days, so
// deleting the clamp left all four suites green. At 48.546° the run is two
// days and the unclamped width is 0.879 units, under the floor.
var SHORT_RUN_LAT = 48.546;
var dShort = draw(SHORT_RUN_LAT);
var shortRuns = M.zeroDarkRuns(M.darkHoursYear(SHORT_RUN_LAT, YEAR));
ok(shortRuns.length > 0 && shortRuns[0].days <= 3,
  SHORT_RUN_LAT + '°: has a short zero-dark run to test the floor with ('
    + (shortRuns[0] ? shortRuns[0].days : 0) + ' days)');
var unclamped = (shortRuns[0].endIndex - shortRuns[0].startIndex) / 364
  * (VIEW.w - VIEW.padL - VIEW.padR);
ok(unclamped < 1,
  'and its unclamped width (' + unclamped.toFixed(3) + ' units) is under the floor, so the clamp is live');
ok(Number(dShort.bands[0].attrs.width) >= 1,
  SHORT_RUN_LAT + '°: the band is still at least one unit wide — a two-night absence a reader can see');

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

// A latitude is a figure, and indexOf treats it as a substring: '70°'
// contains '0°', so mislabelling the equator's caption "70°" left all 109
// assertions green. The same boundary-aware helper the numeric figures
// have used since the counts-by-ten bug applies here.
statesIt(d0.caption.textContent, '0°', 'the caption names the latitude');
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
//
// Narrowed deliberately, and the reasoning belongs here because loosening a
// guard to admit one's own change is exactly how these get lost. The bug
// this defends against is turningClause announcing "the year's turnings are
// marked down the plot" with nothing marked. It is NOT any mention of a
// solstice: the where-clause added for D10 says "shortest near the June
// solstice", which places a date on the curve and claims nothing about
// marks. So the assertion checks the claim, not the vocabulary — and the
// vocabulary is still checked, below, against a caption that has no marks.
ok(!/marked down the plot/.test(d45.caption.textContent),
  'with no marks on the plot, the caption claims none — the contradiction has two directions');
ok(Tools.darkHoursSentence(45, M.darkHoursYear(45, YEAR),
     M.zeroDarkRuns(M.darkHoursYear(45, YEAR)), []).indexOf('turnings are marked') === -1,
  'and turningClause emits nothing at all for an empty mark list');
ok(/turnings are marked/.test(withTurnings.caption.textContent),
  'while a caption with four marks does announce them — so the check above can fail');

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

// The refusal sentence is prose making a physical claim, and the first
// version of it was false across the first tenth of a degree it refused:
// "within 5.5° of the pole the midwinter sun NEVER climbs to within 18° of
// the horizon" — arithmetic right (90 − 84.5), physics wrong. At 84.5° the
// lowest solar-noon altitude in 2026 is −17.926°, above −18°, so the sun
// does climb and a real night does end there.
//
// The margin is deliberate: MAX_MODELLED_LAT_DEG sits INSIDE the geometric
// boundary so the instrument never has to adjudicate a borderline reading.
// That means any absolute claim about the refused band is false across the
// margin by construction. This asserts the sentence stays hedged, and that
// the edge it cites is the edge the code uses.
var refusalText = Tools.yourSkyDarkClause(90, YEAR);
var EDGE_DEG = M.MAX_MODELLED_LAT_DEG;
var edgeNoonAlt = 90;
for (var rd = 0; rd < 365; rd++) {
  var ra = 90 - Math.abs(EDGE_DEG - M.declination(new Date(Date.UTC(YEAR, 0, 1 + rd, 12))));
  if (ra < edgeNoonAlt) edgeNoonAlt = ra;
}
ok(edgeNoonAlt > -18,
  'at the modelled edge the sun still climbs above −18° (' + edgeNoonAlt.toFixed(3)
    + '°) — which is why an absolute claim about the refused band would be false');
ok(!/never climbs|never rises|never reaches/.test(refusalText),
  'the refusal makes no absolute claim that its own margin falsifies');
ok(refusalText.indexOf(String(EDGE_DEG)) !== -1,
  'and it cites the edge the code actually uses (' + EDGE_DEG + '°), not a derived figure');
ok(/about|approximately|nearer/.test(refusalText),
  'and hedges the boundary, because the line is drawn deliberately early');

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

console.log('\n=== The caption says WHERE the extremes fall, and only when true (D10) ===\n');

/* The caption stated a range and, separately, a list of turning marks —
   with nothing joining them. A sighted reader sees the curve dip at one
   mark and peak at another; the text reader got two disconnected facts.
   The clause is only emitted where it is true: naming a hinge three weeks
   away is the nearly-true prose this section keeps having to unlearn. */
var HINGES = { 'the March equinox': 79, 'the June solstice': 172,
               'the September equinox': 265, 'the December solstice': 355 };
var wrongClaims = [];
[0, 23.5, 45, 60, 70, -45, -60, -70, 84].forEach(function (lat) {
  var series = M.darkHoursYear(lat, YEAR);
  var text = Tools.darkHoursSentence(lat, series, M.zeroDarkRuns(series), []);
  var minAt = -1, maxAt = -1;
  series.forEach(function (h, i) {
    if (h <= 0) return;
    if (minAt === -1 || h < series[minAt]) minAt = i;
    if (maxAt === -1 || h > series[maxAt]) maxAt = i;
  });
  ['shortest', 'longest'].forEach(function (which) {
    var m = new RegExp(which + ' near ([a-zA-Z ]+?)(?:,|\\.)').exec(text);
    if (!m) return;
    var name = m[1].trim();
    var day = HINGES[name];
    var at = which === 'shortest' ? minAt : maxAt;
    var gap = Math.abs(at - day);
    gap = Math.min(gap, series.length - gap);
    if (gap > 21) wrongClaims.push(lat + '° claims ' + which + ' near ' + name + ', ' + gap + ' days off');
  });
});
equal(wrongClaims.length, 0,
  'no caption names a turning the extreme is not actually near'
    + (wrongClaims.length ? ' — ' + wrongClaims.join('; ') : ''));

var c45 = draw(45).caption.textContent;
ok(/shortest near the June solstice/.test(c45),
  '45°: the caption says which turning the shortest night falls at');
ok(/longest near the December solstice/.test(c45), '45°: and which the longest');
var c60 = draw(60).caption.textContent;
ok(/longest near the December solstice/.test(c60), '60°: names its longest');
ok(!/shortest near/.test(c60),
  '60°: and drops the shortest half — that night is 32 days from any hinge');
ok(!/shortest near|longest near/.test(draw(0).caption.textContent),
  '0°: a flat year has no extremes worth placing, and claims none');

console.log('\n=== Three things a reader could not see, or could not reconcile ===\n');

/* A lone night between two zero-runs is one point, and a one-point polyline
   paints nothing: in the DOM, absent on screen, and counted by the caption
   among the nights that exist. Constructed, because no real latitude in the
   modelled band produces one — the guard has to hold before the case is
   reachable, not after. */
var loneSeries = [0, 0, 5.5, 0, 0];
var lonePlot = makeNode('svg'), loneCap = makeNode('p');
(function () {
  var realYear = M.darkHoursYear;
  M.darkHoursYear = function () { return loneSeries; };
  try { Tools.drawDarkHours(60, lonePlot, loneCap, YEAR); }
  finally { M.darkHoursYear = realYear; }
})();
var lonePolys = lonePlot.children.filter(function (c) { return c.tag === 'polyline'; });
var loneDots  = lonePlot.children.filter(function (c) { return c.tag === 'circle'; });
equal(lonePolys.length, 0, 'a lone night emits no one-point polyline');
equal(loneDots.length, 1, 'it emits a mark with area instead');
ok(Number(loneDots[0].attrs.r) > 0, 'and that mark has a radius a reader can see');

/* The caption states a minimum, a maximum and a swing. Rounded separately
   they disagree: 109 of 401 latitudes printed things like "between 1.4 and
   19.1 hours ... swings by 17.6". The five picker latitudes agreed by luck,
   which is why nothing caught it. The swing is derived from the rounded
   pair now, and this checks the arithmetic a reader can do. */
var disagreed = [];
[0, 23.5, 45, 60, 70, -60, -70, -83.23, 80, 84].forEach(function (lat) {
  var series = M.darkHoursYear(lat, YEAR);
  var text = Tools.darkHoursSentence(lat, series, M.zeroDarkRuns(series), []);
  var span = /between ([\d.]+) and ([\d.]+) hours/.exec(text);
  var sw = /swings by ([\d.]+) hours/.exec(text);
  if (!span || !sw) return;
  var lhs = Number((Number(span[2]) - Number(span[1])).toFixed(1));
  if (Math.abs(lhs - Number(sw[1])) > 0.001) {
    disagreed.push(lat + '° says ' + span[1] + '…' + span[2] + ' swinging ' + sw[1]);
  }
});
equal(disagreed.length, 0,
  'every caption\'s three figures add up' + (disagreed.length ? ' — ' + disagreed.join('; ') : ''));

/* Nothing may be drawn outside the plot. The width floor that keeps a
   one-night band visible put its second edge at x = 351 against a 350
   margin when the run fell on the last day of the year. */
var edgeSeries = [];
for (var es = 0; es < 365; es++) edgeSeries.push(es === 364 ? 0 : 5);
var edgePlot = makeNode('svg'), edgeCap = makeNode('p');
(function () {
  var realYear = M.darkHoursYear;
  M.darkHoursYear = function () { return edgeSeries; };
  try { Tools.drawDarkHours(60, edgePlot, edgeCap, YEAR); }
  finally { M.darkHoursYear = realYear; }
})();
var RIGHT = VIEW.w - VIEW.padR;
var outside = [];
edgePlot.children.forEach(function (el) {
  ['x1', 'x2', 'cx'].forEach(function (k) {
    if (el.attrs[k] !== undefined && Number(el.attrs[k]) > RIGHT + 0.01) {
      outside.push(el.attrs['class'] + '.' + k + '=' + el.attrs[k]);
    }
  });
  if (el.tag === 'rect' && Number(el.attrs.x) + Number(el.attrs.width) > RIGHT + 0.01) {
    outside.push('rect right=' + (Number(el.attrs.x) + Number(el.attrs.width)));
  }
});
equal(outside.length, 0,
  'a run on the last day of the year draws nothing past the plot\'s right margin ('
    + RIGHT + ')' + (outside.length ? ' — ' + outside.join(', ') : ''));

console.log('\n=== The section is actually wired to the page ===\n');

/* Nothing drove setupDarkHours. Its five click handlers, its 45° default,
   the container structure and the plot's aria-hidden were all untested,
   and deleting the setupDarkHours() call from init() left every suite
   green — the whole section could leave /sunpath unnoticed. */
var wiredContainer = makeNode('div');
var realGetById = global.document.getElementById;
global.document.getElementById = function (id) {
  return id === 'sunpath-dark-hours' ? wiredContainer : null;
};
Tools.setupDarkHours();
global.document.getElementById = realGetById;

var wiredPicker = wiredContainer.children.filter(function (c) {
  return c.className === 'sunpath-lat-picker';
})[0];
var wiredPlot = wiredContainer.children.filter(function (c) { return c.tag === 'svg'; })[0];
var wiredCaption = wiredContainer.children.filter(function (c) {
  return c.className === 'sunpath-dark-caption';
})[0];

ok(!!wiredPicker, 'setupDarkHours emits a latitude picker');
ok(!!wiredPlot, 'and a plot');
ok(!!wiredCaption, 'and a caption');
equal(wiredPicker.children.length, 5, 'the picker offers five latitudes');
equal(wiredPlot.attrs['aria-hidden'], 'true',
  'the plot is aria-hidden — D10 turns on this, and nothing asserted it before');
ok(wiredPlot.children.length > 0, 'and it is drawn on setup, not left empty until first click');
statesIt(wiredCaption.textContent, '45°', 'the default reading is 45°, matching the dawn sweep');
equal(wiredPicker.children.filter(function (b) { return b.classes['is-active']; }).length, 1,
  'exactly one button starts active');
ok(wiredPicker.children[2].classes['is-active'], 'and it is the third — the 45° default');

// A click has to redraw, and move the active state with it. The picker
// showing one latitude while the plot draws another is the shape of defect
// this section is meant to be free of.
wiredPicker.children[4].click();
statesIt(wiredCaption.textContent, '70°', 'clicking the fifth button redraws at 70°');
equal(wiredPicker.children.filter(function (b) { return b.classes['is-active']; }).length, 1,
  'still exactly one button active after the click');
ok(wiredPicker.children[4].classes['is-active'] && !wiredPicker.children[2].classes['is-active'],
  'and the active state moved to the button that was clicked');

console.log('\n=== The turnings, against the module that actually ships ===\n');

/* Every turning assertion above ran against a stub. Renaming a key in
   js/turnings.js would take the marks AND the caption's turnings clause
   off the page with the whole suite green. This is the one place the real
   module is loaded. */
/* js/turnings.js assigns straight to `window.Turnings` with no CommonJS
   guard, and js/sunpath-tools.js captured `root` as globalThis when it was
   required (no window existed then). So the shim is: give turnings.js a
   `window` to write to, then hand what it wrote to the global the tools
   module actually reads. */
var prevTurnings = global.Turnings;
global.window = global.window || {};
require('./turnings.js');
global.Turnings = global.window.Turnings;
ok(!!global.Turnings && typeof global.Turnings.getTurningsForYear === 'function',
  'the shipped js/turnings.js loaded and exposes getTurningsForYear');

var withReal = draw(45);
equal(withReal.marks.length, 4,
  'the shipped js/turnings.js yields four marks, the same as the stub');
ok(/solstice/.test(withReal.caption.textContent) && /equinox/.test(withReal.caption.textContent),
  'and the caption names them from the real dates');

/* A module that throws must degrade to the no-marks path, not take the
   caption with it. Before this, an exception here left the plot redrawn
   for the new latitude under the previous latitude's caption — and killed
   the three instruments init() sets up after this one. */
global.Turnings = {
  getTurningsForYear: function () { throw new Error('turnings exploded'); }
};
var withThrow = draw(60);
equal(withThrow.marks.length, 0, 'a throwing Turnings module draws no marks');
ok(withThrow.caption.textContent.indexOf('60°') !== -1,
  'but the caption is still written, for the latitude actually drawn');
ok(!/turnings are marked/.test(withThrow.caption.textContent),
  'and claims no marks, because none were drawn');
ok(withThrow.curves.length > 0, 'and the curve is still there');

global.Turnings = prevTurnings;

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
// picture is hidden from anyone reading the text. Latitudes and figures
// alike match on token boundaries, so neither a count ten times too large
// nor a latitude that merely ends in the right digits can satisfy it.
[[0, ['0°'], [9.4, 9.6]],
 [45, ['45°'], [3.3, 11.7, 8.4]],
 [60, ['60°'], [0.9, 12.6, 11.7, 123]],
 [70, ['70°'], [1.2, 13.6, 12.4, 177]]]
  .forEach(function (t) {
    var text = draw(t[0]).caption.textContent;
    t[1].forEach(function (needle) {
      statesIt(text, needle,
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
