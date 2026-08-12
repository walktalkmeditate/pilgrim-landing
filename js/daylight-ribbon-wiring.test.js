/* =============================================
   The Light Budget — route-picker wiring test harness

   Run via:  node js/daylight-ribbon-wiring.test.js

   Every other daylight.js test (daylight-render.test.js,
   daylight-math.test.js) exercises the pure, exported half of the
   module — recompute/renderSVG/renderRibbon/ribbonSectionHidden — by
   requiring it with `document` stubbed just enough for
   document.createElementNS, and `window` left unset so the outer
   shell's DOM glue (route picker, XHR wiring, _currentRoute) never
   loads at all.

   This file requires it the other way: both `window` and `document`
   defined, so the DOM-glue block (js/daylight.js, "Outer shell" section)
   actually runs. That's the only way to reach loadDarknessData,
   updateRibbonForRoute, and loadStageData — none of them are exported,
   because none of them are pure; they're what Finding 1 and Finding 4
   are about. The fake document/XMLHttpRequest below are hand-rolled in
   the same spirit as daylight-render.test.js's makeNode: enough surface
   to drive real onRouteChange calls and resolve real XHRs in a
   controlled order, nothing more.
   ============================================= */

'use strict';

var fs   = require('fs');
var path = require('path');

var passed   = 0;
var failed   = 0;
var failures = [];

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

/* ==========================================
   Minimal fake browser: generic node factory, getElementById registry,
   FakeXHR keyed by URL, and the handful of bare globals daylight.js's
   outer shell touches at load/setup time.
   ========================================== */

function makeNode(tag) {
  var node = {
    tag: tag,
    attrs: {},
    value: '',
    hidden: false,
    textContent: '',
    children: [],
    firstChild: null,
    _listeners: {},
    setAttribute: function (name, val) { node.attrs[name] = val; },
    getAttribute: function (name) { return node.attrs[name]; },
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
    },
    addEventListener: function (type, fn) {
      (node._listeners[type] = node._listeners[type] || []).push(fn);
    },
    classList: {
      add: function () {}, remove: function () {}, contains: function () { return false; }
    },
    querySelectorAll: function () { return []; }
  };
  return node;
}

function fireEvent(node, type) {
  (node._listeners[type] || []).forEach(function (fn) { fn.call(node); });
}

var elementsById = {};
// Ids the app queries but this harness deliberately leaves absent, to skip
// the optional preferences-panel wiring block (dl-prefs radios) — nothing
// in Finding 1/Finding 4's path touches it.
var ABSENT_IDS = { 'dl-prefs-toggle': true, 'dl-prefs-panel': true };

global.document = {
  addEventListener: function (type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  },
  _listeners: {},
  getElementById: function (id) {
    if (ABSENT_IDS[id]) return null;
    if (!elementsById[id]) elementsById[id] = makeNode('div');
    return elementsById[id];
  },
  createElement: function (tag) { return makeNode(tag); },
  createElementNS: function (ns, tag) { return makeNode(tag); },
  createTextNode: function (text) { return { tag: '#text', textContent: text }; },
  querySelectorAll: function () { return []; }
};

global.window = global;
global.location = { search: '', pathname: '/daylight/', href: 'https://pilgrimapp.org/daylight/' };
global.history = { replaceState: function () {} };
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
// navigator is left untouched: recent Node versions define it as a
// built-in, read-only global. Nothing in the code paths this harness
// drives touches it — navigator.geolocation/clipboard are only read
// inside click handlers this harness never fires.

var xhrByUrl = {};
function FakeXHR() {
  this.status = 0;
  this.responseText = '';
  this.onload = null;
  this.onerror = null;
}
FakeXHR.prototype.open = function (method, url) { this._url = url; };
FakeXHR.prototype.send = function () {
  (xhrByUrl[this._url] = xhrByUrl[this._url] || []).push(this);
};
global.XMLHttpRequest = FakeXHR;

function pendingXHR(url) {
  var q = xhrByUrl[url];
  return q && q.length ? q[q.length - 1] : null;
}

function resolveDarkness(routeId, bodyText) {
  var xhr = pendingXHR('/assets/darkness/' + routeId + '.json');
  ok(xhr !== null, 'fixture sanity: a pending XHR exists for ' + routeId + '.json');
  xhr.status = 200;
  xhr.responseText = bodyText;
  xhr.onload();
}

function failDarkness(routeId) {
  var xhr = pendingXHR('/assets/darkness/' + routeId + '.json');
  ok(xhr !== null, 'fixture sanity: a pending XHR exists for ' + routeId + '.json (to fail)');
  xhr.onerror();
}

var warnings = [];
var realWarn = console.warn;
console.warn = function () {
  warnings.push(Array.prototype.join.call(arguments, ' '));
  realWarn.apply(console, arguments);
};

/* ==========================================
   Load the module (activates the DOM-glue block) and fire DOMContentLoaded.
   ========================================== */

var Daylight = require('./daylight.js');
ok(typeof Daylight.renderRibbon === 'function', 'fixture sanity: daylight.js still exports renderRibbon (pure API unaffected by the DOM-glue harness)');

var domReady = document._listeners['DOMContentLoaded'];
ok(domReady && domReady.length === 1, 'fixture sanity: exactly one DOMContentLoaded listener was registered');
domReady[0]();

// loadRouteMeta() fired its own XHR during setup above — resolve it with
// the real route-meta.json now, before any route is selected, so
// statedDistanceForRoute (and therefore the "N of its M km sampled"
// discrepancy framing in the summary sentence) works the way it does on
// the real page. Left unresolved, every statedDistanceKm lookup would
// silently return null and the discrepancy framing could never be
// observed here — a gap in the harness, not a real page condition.
var routeMetaXhr = pendingXHR('/assets/daylight/route-meta.json');
ok(routeMetaXhr !== null, 'fixture sanity: loadRouteMeta issued its own XHR during DOMContentLoaded setup');
routeMetaXhr.status = 200;
routeMetaXhr.responseText = fs.readFileSync(path.join(__dirname, '..', 'assets', 'daylight', 'route-meta.json'), 'utf8');
routeMetaXhr.onload();

var routeSel = elementsById['dl-route'];
ok(routeSel !== undefined, 'fixture sanity: dl-route element was looked up during setup');

function selectRoute(routeId) {
  routeSel.value = routeId;
  fireEvent(routeSel, 'change');
}

var DARKNESS_DIR = path.join(__dirname, '..', 'assets', 'darkness');
function darknessFixtureText(routeId) {
  return fs.readFileSync(path.join(DARKNESS_DIR, routeId + '.json'), 'utf8');
}

/* ==========================================
   Finding 1 — a stale response must not repaint the ribbon for a route
   the reader has left. Exact sequence from the finding: select
   shikoku-88 (XHR in flight), re-select a cached kumano-kodo (renders
   instantly), and only then let Shikoku's response land.
   ========================================== */

console.log('\n=== Finding 1 — stale darkness response does not repaint a route the reader has left ===\n');

// Step 1: select kumano-kodo and resolve it immediately, so it's cached
// exactly like a route the reader visited earlier in the session.
selectRoute('kumano-kodo');
resolveDarkness('kumano-kodo', darknessFixtureText('kumano-kodo'));

var ribbonSvg     = elementsById['dl-ribbon-svg'];
var ribbonWrap    = elementsById['dl-ribbon-wrap'];
var ribbonSummary = elementsById['dl-ribbon-summary'];

function bandCount() {
  return ribbonSvg.children.filter(function (c) {
    return (c.attrs['class'] || '').indexOf('dl-ribbon-band-') === 0;
  }).length;
}

equal(bandCount(), 1, 'step 1: kumano-kodo cached and rendered — one flat run (D6)');
equal(ribbonWrap.hidden, false, 'step 1: ribbon section is visible after kumano-kodo renders');
var kumanoSentence = ribbonSummary.textContent;
ok(kumanoSentence.indexOf('As it was') !== -1, 'step 1: summary sentence is kumano-kodo’s own');

// Step 2: select shikoku-88. Not cached — updateRibbonForRoute hides the
// section immediately (Finding 4) and a real XHR is left in flight,
// deliberately unresolved.
selectRoute('shikoku-88');
equal(ribbonWrap.hidden, true, 'step 2: ribbon hidden immediately on route change, before shikoku-88’s fetch resolves (Finding 4)');
equal(bandCount(), 0, 'step 2: ribbon geometry cleared immediately on route change (Finding 4)');
ok(pendingXHR('/assets/darkness/shikoku-88.json') !== null, 'step 2: shikoku-88’s darkness fetch is in flight');

// Step 3: re-select kumano-kodo. Cached — renders instantly, synchronously,
// while shikoku-88’s request from step 2 is still outstanding.
selectRoute('kumano-kodo');
equal(bandCount(), 1, 'step 3: kumano-kodo re-selected — renders instantly from cache');
equal(ribbonWrap.hidden, false, 'step 3: ribbon visible again, showing kumano-kodo');
equal(ribbonSummary.textContent, kumanoSentence, 'step 3: summary sentence matches kumano-kodo exactly, byte for byte');

// Step 4: shikoku-88’s stale response lands. Before the Finding 1 fix this
// called renderDarknessRibbon('shikoku-88', data) unconditionally and
// repainted the ribbon Shikoku is not selected on screen for.
resolveDarkness('shikoku-88', darknessFixtureText('shikoku-88'));

ok(pendingXHR('/assets/darkness/shikoku-88.json').status === 200, 'fixture sanity: shikoku-88’s stale response really did resolve (not still pending)');
equal(bandCount(), 1, 'step 4: after the stale shikoku-88 response lands, the ribbon STILL shows one run — not repainted');
equal(ribbonWrap.hidden, false, 'step 4: ribbon still visible (unchanged by the stale response)');
equal(ribbonSummary.textContent, kumanoSentence, 'step 4: summary sentence is still kumano-kodo’s — the stale shikoku-88 sentence never landed');
// 'sampled' alone isn't distinctive any more — Finding 6 means every
// route's sentence states its covered distance, kumano-kodo included.
// The discrepancy phrasing ("N of its M ... sampled") is what's unique
// to Shikoku (D3/D13's >5 km gap), so that's what must not leak in.
ok(ribbonSummary.textContent.indexOf('of its') === -1, 'step 4: no Shikoku-shaped "N of its M km sampled" text leaked into the visible ribbon');

// The stale response must still be cached, though — the fix drops the
// stale PAINT, not the write. A third visit to shikoku-88 should now be
// instant (cache hit), and render shikoku-88’s own data correctly.
selectRoute('shikoku-88');
ok(bandCount() > 1, 'step 5: re-selecting shikoku-88 now renders from cache (multiple coarse runs), proving the stale response was still cached');
equal(ribbonWrap.hidden, false, 'step 5: ribbon visible, now genuinely showing shikoku-88');
ok(ribbonSummary.textContent.indexOf('sampled') !== -1, 'step 5: shikoku-88’s own "N of its M km sampled" text is present now that it is actually selected');

/* ==========================================
   Finding 4 — every fetch failure must leave the ribbon hidden, not the
   previous route’s content on screen.
   ========================================== */

console.log('\n=== Finding 4 — a failed fetch leaves the ribbon hidden, not showing a stale route ===\n');

// camino-frances is already reachable from the fixtures directory; use it
// as "the route that was showing before" — distinct shape from
// kumano-kodo/shikoku-88 above (128 unaggregated runs, solid).
selectRoute('camino-frances');
resolveDarkness('camino-frances', darknessFixtureText('camino-frances'));
ok(bandCount() > 1, 'fixture sanity: camino-frances rendered many runs');
equal(ribbonWrap.hidden, false, 'fixture sanity: camino-frances ribbon is visible before the failure scenario');

// kumano-kodo is already cached from the Finding 1 section above, so
// selecting it would render instantly rather than exercising a real
// failure — camino-norte is fresh, never fetched before this point.
var warningsBefore = warnings.length;
selectRoute('camino-norte');
equal(ribbonWrap.hidden, true, 'camino-norte selected: ribbon hidden immediately — camino-frances no longer on screen');
equal(bandCount(), 0, 'camino-norte selected: no leftover camino-frances geometry');

failDarkness('camino-norte');
equal(ribbonWrap.hidden, true, 'after a failed fetch: ribbon stays hidden');
equal(bandCount(), 0, 'after a failed fetch: no band geometry — camino-frances never reappears');
equal(ribbonSummary.textContent, '', 'after a failed fetch: summary paragraph stays empty');
ok(warnings.length > warningsBefore, 'a console.warn was logged naming the failed route');
ok(warnings[warnings.length - 1].indexOf('camino-norte') !== -1, 'the warning names the route that failed (camino-norte)');

console.warn = realWarn;

/* ==========================================
   Finding 1 (loadStageData extension) — the same currency guard applies
   to the bar’s own stage-data fetch, so a stale stage response can’t
   repopulate the stage picker for a route the reader has left either.
   ========================================== */

console.log('\n=== Finding 1 (extension) — stale stage-data response does not repopulate the stage picker ===\n');

function arrEqualStageTexts(expected, actual, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log('  ✓ ' + label + '  (' + JSON.stringify(actual) + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    console.log('  ✗ ' + label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
  }
}

var stageSel = elementsById['dl-stage'];

function stageOptionTexts() {
  return stageSel.children.filter(function (c) { return c.tag === 'option'; }).map(function (c) { return c.text; });
}

// route-alpha and route-beta are synthetic ids (never real fixture files) —
// loadStageData fetches /assets/daylight/<id>.json regardless of whether the
// id is real, so this only needs the XHR layer, not real stage data.
selectRoute('route-alpha');
ok(pendingXHR('/assets/daylight/route-alpha.json') !== null, 'route-alpha stage fetch is in flight');

selectRoute('route-beta');
ok(pendingXHR('/assets/daylight/route-beta.json') !== null, 'route-beta stage fetch is in flight');

var betaXhr = pendingXHR('/assets/daylight/route-beta.json');
betaXhr.status = 200;
betaXhr.responseText = JSON.stringify([{ index: 0, nameEn: 'Beta stage 0' }, { index: 1, nameEn: 'Beta stage 1' }]);
betaXhr.onload();

arrEqualStageTexts(['Choose a stage…', 'Beta stage 0', 'Beta stage 1'], stageOptionTexts(),
  'route-beta’s stage options populated (route-beta is current)');

var alphaXhr = pendingXHR('/assets/daylight/route-alpha.json');
alphaXhr.status = 200;
alphaXhr.responseText = JSON.stringify([{ index: 0, nameEn: 'Alpha stage 0' }]);
alphaXhr.onload();

arrEqualStageTexts(['Choose a stage…', 'Beta stage 0', 'Beta stage 1'], stageOptionTexts(),
  'route-alpha’s stale stage response does NOT repopulate the picker — route-beta’s options are untouched');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
