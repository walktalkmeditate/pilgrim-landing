/* =============================================
   Sun Path — dark-hours render harness

   Run via:  node js/sunpath-render.test.js

   Asserts on the elements drawDarkHours actually EMITS, not on the
   series it was given. That distinction is the mechanism behind seven
   shipped bugs on /daylight: a test asserting against an upstream proxy
   for the drawn output stays green while the drawn thing changes
   underneath it. The spec makes it decision D5.

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

var YEAR = 2026;

function draw(lat) {
  var plot = makeNode('svg');
  var caption = makeNode('p');
  Tools.drawDarkHours(lat, plot, caption, YEAR);
  return {
    plot: plot,
    caption: caption,
    curves: plot.children.filter(function (c) { return c.tag === 'polyline'; }),
    bands:  plot.children.filter(function (c) { return c.tag === 'rect'; }),
    marks:  plot.children.filter(function (c) { return c.tag === 'line'; })
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
var baselineY = 200 - 22;   // DARK_VIEW.h - padB
var atBaseline = 0;
d60.curves.forEach(function (c) {
  c.attrs.points.split(' ').forEach(function (p) {
    if (Math.abs(Number(p.split(',')[1]) - baselineY) < 0.01) atBaseline++;
  });
});
equal(atBaseline, 0, '60°: not one curve point sits on the baseline');

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

global.Turnings = {
  getTurningsForYear: function (y) {
    return {
      springEquinox: new Date(Date.UTC(y, 2, 20, 14, 46)),
      summerSolstice: new Date(Date.UTC(y, 5, 21, 8, 24)),
      autumnEquinox: new Date(Date.UTC(y, 8, 23, 0, 5)),
      winterSolstice: new Date(Date.UTC(y, 11, 21, 20, 50))
    };
  }
};
var withTurnings = draw(45);
equal(withTurnings.marks.length, 4, 'all four turnings are marked when the module is there');
ok(withTurnings.marks.every(function (m) { return Number(m.attrs.y2) > Number(m.attrs.y1); }),
  'each turning mark has real height');
delete global.Turnings;

console.log('\n=== The caption carries what the picture carries (D10) ===\n');

ok(d0.caption.textContent.indexOf('0°') !== -1, 'the caption names the latitude');
ok(/within half an hour/.test(d0.caption.textContent),
  'the equator\'s caption states the flatness, which is the finding');
ok(/no astronomical night at all/.test(d60.caption.textContent),
  '60°: the caption states the stretch with no night — the fact a curve conveys most cheaply and prose drops most easily');
ok(d60.caption.textContent.indexOf('123') !== -1,
  '60°: the caption gives the number of nights, not just their existence');
ok(d70.caption.textContent.indexOf('177') !== -1, '70°: likewise, 177');
ok(!/no astronomical night at all/.test(d45.caption.textContent),
  '45° has no such stretch, so its caption does not claim one');

var s1 = Tools.darkHoursSentence(60, M.darkHoursYear(60, YEAR), M.zeroDarkRuns(M.darkHoursYear(60, YEAR)));
var s2 = Tools.darkHoursSentence(60, M.darkHoursYear(60, YEAR), M.zeroDarkRuns(M.darkHoursYear(60, YEAR)));
ok(s1 === s2, 'darkHoursSentence is pure');

console.log('\n=== Your sky — the curve becomes personal (Task 4, D3) ===\n');

// D3: this EXTENDS the geolocation that already exists; it does not add a
// control, and it never blocks. The clause is pure so it can be asserted
// without a browser, and so the refusal path is a plain absence.

var clause45 = Tools.yourSkyDarkClause(45, YEAR);
ok(/8\.\d|9\.\d|1[01]\.\d/.test(clause45), '45°: the clause names a longest night in hours');
ok(clause45.indexOf('11.7') !== -1, '45°: that longest night is 11.7 h, matching the series');
ok(!/never/.test(clause45), '45° always gets a night, so nothing is claimed about losing it');

var clause60 = Tools.yourSkyDarkClause(60, YEAR);
ok(clause60.indexOf('123') !== -1, '60°: the clause counts the nights with no true dark');
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
ok(clauseS.indexOf('116') !== -1,
  '−60° reports its own 116 nights, not +60°\'s 123 — the hemispheres are not mirrors');
ok(/never/.test(clauseS), '−60° still says the dark never fully arrives');

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
// picture is hidden from anyone reading the text.
[[0, ['0°']], [45, ['45°', '11.7']], [60, ['60°', '123']], [70, ['70°', '177']]]
  .forEach(function (t) {
    var text = draw(t[0]).caption.textContent;
    t[1].forEach(function (needle) {
      ok(text.indexOf(needle) !== -1,
        t[0] + '°: the caption states "' + needle + '", which the curve shows for free');
    });
  });

// A turning mark is a visual affordance. If it is drawn it must be
// speakable, or it is the moon strip's gap all over again. §A marks the
// four turnings, and the section's own prose names them — assert the
// standing copy does, since the caption deliberately stays short.
ok(/solstice/i.test(page) && /equinox/i.test(page),
  'the page names the turnings its curve marks, in standing prose');

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
