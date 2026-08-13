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
// Ids this harness answers null for. Empty at load; the Finding 9 section
// at the very bottom adds one deliberately.
var ABSENT_IDS = {};

// The preferences panel is wired for real, unlike the rest of this
// harness's optional furniture. It used to be skipped as "nothing in
// Finding 1/Finding 4's path touches it" — but the km/mi radio lives
// there, and D9 says the moon strip must not react to it. A radio whose
// listener was never registered cannot demonstrate what it does or does
// not repaint, so the finding was untestable while these were absent.
function makeRadio(name, value) {
  var radio = makeNode('input');
  radio.attrs.name = name;
  radio.value = value;
  return radio;
}
var unitRadios  = [makeRadio('dl-unit', 'km'), makeRadio('dl-unit', 'mi')];
var clockRadios = [makeRadio('dl-clock', '24h'), makeRadio('dl-clock', '12h')];
elementsById['dl-prefs-toggle'] = makeNode('button');
elementsById['dl-prefs-panel']  = makeNode('div');
elementsById['dl-prefs-panel'].querySelectorAll = function (selector) {
  if (selector.indexOf('dl-unit')  !== -1) return unitRadios;
  if (selector.indexOf('dl-clock') !== -1) return clockRadios;
  return [];
};

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
// The share link, captured. pushURL is the one place this page decides
// what a reader can send someone else, and G7 is about that URL and the
// page it produces disagreeing — so the harness has to be able to read it.
var lastPushedURL = '';
global.history = {
  replaceState: function (state, title, url) { lastPushedURL = url; }
};
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

function failStage(routeId) {
  var xhr = pendingXHR('/assets/daylight/' + routeId + '.json');
  ok(xhr !== null, 'fixture sanity: a pending stage XHR exists for ' + routeId + '.json (to fail)');
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

/* ==========================================
   The malformed-artifact warning has to be reachable FROM THE PAGE.
   js/daylight-render.test.js already proves renderRibbon warns — but it
   calls renderRibbon directly, and on the real page ribbonSectionHidden
   runs the same shape check first and short-circuits, so renderRibbon was
   never reached for a malformed artifact and its warning could not fire.
   Verified through this harness with stepKm deleted before the fix: wrap
   hidden, zero bands, no throw, and console.warn captured exactly [].
   ========================================== */

console.log('\n=== A shape-malformed artifact warns through the real wiring, not only through renderRibbon ===\n');

var malformedBody = JSON.parse(darknessFixtureText('camino-portugues'));
delete malformedBody.stepKm;

var warningsBeforeMalformed = warnings.length;
selectRoute('camino-portugues');
resolveDarkness('camino-portugues', JSON.stringify(malformedBody));

equal(ribbonWrap.hidden, true, 'a shape-malformed artifact leaves the ribbon section hidden');
equal(bandCount(), 0, 'a shape-malformed artifact draws no band geometry');
equal(ribbonSummary.textContent, '', 'a shape-malformed artifact leaves the summary paragraph empty');
equal(warnings.length - warningsBeforeMalformed, 1,
  'exactly one console.warn reaches the console from the page for a shape-malformed artifact (it used to be zero — the warning was unreachable)');
var malformedWarning = warnings[warnings.length - 1];
ok(malformedWarning.indexOf('camino-portugues') !== -1,
  'the malformed-artifact warning names the route (camino-portugues)');
ok(malformedWarning.indexOf('stepKm') !== -1,
  'the malformed-artifact warning names the offending field (stepKm): ' + JSON.stringify(malformedWarning));

/* ==========================================
   Finding 1, the other half of the darkness guard — xhr.onerror's own
   currency check. The scenario above only ever fails the route that is
   still current, where `if (routeId !== _currentRoute) return;` is a
   no-op: deleting that line left this suite at 38 passed / 0 failed.
   This is the sequence that actually needs it — a route the reader has
   LEFT failing while a different, valid ribbon is on screen. Without the
   guard, the stale failure hides and clears the ribbon belonging to the
   route the reader is actually looking at.
   ========================================== */

console.log('\n=== Finding 1 (darkness onerror) — a stale fetch failure does not clear the ribbon of the route now on screen ===\n');

// camino-ingles is fresh (never fetched in this file before now), so
// selecting it issues a real XHR and leaves it in flight.
selectRoute('camino-ingles');
ok(pendingXHR('/assets/darkness/camino-ingles.json') !== null, 'camino-ingles’ darkness fetch is in flight');

// camino-frances was cached back in the Finding 4 section, so this renders
// synchronously while camino-ingles’ request is still outstanding.
selectRoute('camino-frances');
var francesBandsOnScreen = bandCount();
var francesSentenceOnScreen = ribbonSummary.textContent;
ok(francesBandsOnScreen > 1, 'camino-frances renders instantly from cache while camino-ingles is still in flight');
equal(ribbonWrap.hidden, false, 'camino-frances’ ribbon is visible before the stale failure lands');
ok(francesSentenceOnScreen.indexOf('763.7') !== -1, 'the visible summary is camino-frances’ own');

failDarkness('camino-ingles');

equal(bandCount(), francesBandsOnScreen, 'after camino-ingles’ stale failure: camino-frances’ bands are all still drawn');
equal(ribbonWrap.hidden, false, 'after camino-ingles’ stale failure: the ribbon is still visible — the failure did not hide a route it has nothing to do with');
equal(ribbonSummary.textContent, francesSentenceOnScreen, 'after camino-ingles’ stale failure: camino-frances’ summary sentence is untouched, byte for byte');

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

/* ==========================================
   Finding 1 (loadStageData onerror) — the same currency guard on the
   stage fetch's FAILURE path, which had exactly the same hole as the
   darkness one: every existing scenario failed the route that was still
   current, so `if (routeId !== _currentRoute) return;` was a no-op and
   deleting it changed nothing this suite could see. dom.result had zero
   references anywhere in the repo's tests.

   Both halves are asserted, so the guard and the behaviour it guards each
   get real coverage: a STALE failure must not write over the bar, and a
   CURRENT failure must still tell the reader what went wrong.
   ========================================== */

console.log('\n=== Finding 1 (stage onerror) — a stale stage failure does not overwrite the bar, a current one still reports ===\n');

var resultEl = elementsById['dl-result'];
ok(resultEl !== undefined, 'fixture sanity: dl-result element was looked up during setup');

selectRoute('route-gamma');
ok(pendingXHR('/assets/daylight/route-gamma.json') !== null, 'route-gamma’s stage fetch is in flight');

selectRoute('route-delta');
ok(pendingXHR('/assets/daylight/route-delta.json') !== null, 'route-delta’s stage fetch is in flight');

// Written after the last route change, because a route change clears the
// result paragraph itself — this stands in for whatever the bar had
// computed for the route the reader is actually on.
var barOutputOnScreen = 'Set out 06:12 — the bar’s own output for route-delta.';
resultEl.textContent = barOutputOnScreen;

failStage('route-gamma');
equal(resultEl.textContent, barOutputOnScreen,
  'route-gamma’s stale stage failure leaves the bar’s own output untouched — no "Couldn’t load stage data for route-gamma" over the top of a different route’s reading');

failStage('route-delta');
ok(resultEl.textContent.indexOf("Couldn't load stage data") !== -1,
  'route-delta’s own stage failure DOES report — the guard suppresses stale failures, not the message itself');
ok(resultEl.textContent.indexOf('route-delta') !== -1,
  'the reported stage failure names the route that actually failed (route-delta): ' + JSON.stringify(resultEl.textContent));

/* =============================================
   Slice 3, Task 6 — moon strip wiring (spec D6, D9, D11; AC #7, #8, #14)

   The strip needs BOTH async sources — a route's stages place a night on
   a kilometre, its darkness artifact says how dark that kilometre is —
   so it may only draw once both have landed, and must not flash a
   half-built strip in between.

   It slides with the date and with nothing else. Stage and pace both run
   through onFieldChange alongside the date, so "reacts to the date" is
   not the same as "reacts to onFieldChange", and a listener on the wrong
   one would satisfy AC #7 while violating AC #8.
   ============================================= */

console.log('\n=== moon strip wiring — both sources, the date, and nothing else ===\n');

var moonWrap    = elementsById['dl-moon-wrap'];
var moonSvg     = elementsById['dl-moon-svg'];
var moonSummary = elementsById['dl-moon-summary'];
var dateInput   = elementsById['dl-date'];
var paceInput   = elementsById['dl-pace'];
var stageSel    = elementsById['dl-stage'];

// Band spans only. The two nights the sentence names carry <line> marks
// of their own (G1), so "every line" and "every band" are two counts now.
function moonLines() {
  return moonSvg.children.filter(function (c) {
    return c.tag === 'line' && /dl-moon-band-/.test(c.attrs.class || '');
  });
}

function moonTicks() {
  return moonSvg.children.filter(function (c) {
    return c.tag === 'line' && /(^|\s)dl-moon-tick(\s|$)/.test(c.attrs.class || '');
  });
}

function assetText(dir, routeId) {
  return fs.readFileSync(path.join(__dirname, '..', 'assets', dir, routeId + '.json'), 'utf8');
}

function resolveStages(routeId, bodyText) {
  var xhr = pendingXHR('/assets/daylight/' + routeId + '.json');
  ok(xhr !== null, 'fixture sanity: a pending stage XHR exists for ' + routeId + '.json');
  xhr.status = 200;
  xhr.responseText = bodyText;
  xhr.onload();
}

// Use a route no earlier test has touched, so neither cache is warm and
// the both-sources race is genuinely exercised rather than short-circuited.
var MOON_ROUTE = 'camino-primitivo';

dateInput.value = '2026-10-12';
routeSel.value = MOON_ROUTE;
fireEvent(routeSel, 'change');

resolveDarkness(MOON_ROUTE, assetText('darkness', MOON_ROUTE));
ok(moonWrap.hidden === true,
  'darkness alone does not draw the strip — it cannot place a night without stages');
equal(moonLines().length, 0, 'no cells drawn while only one source has landed');

resolveStages(MOON_ROUTE, assetText('daylight', MOON_ROUTE));
ok(moonWrap.hidden === false, 'once both sources land, the strip appears');
// Four spans, not eleven cells: seven of the ten abutting pairs share a
// moon band and are drawn as one <line> so no seam is painted where the
// data has no boundary (F1).
equal(moonLines().length, 4, MOON_ROUTE + ' draws its 11 cells as 4 coalesced spans');
ok(moonSummary.textContent.indexOf('11 nights from 12 October') === 0,
  'the summary states the walk length and start date');

// --- AC #7: the date slides the moon strip, and only the moon strip ---
var ribbonSvgEl  = elementsById['dl-ribbon-svg'];
var ribbonBefore = ribbonSvgEl.children.map(function (c) { return c.tag + ':' + JSON.stringify(c.attrs); }).join('|');
var moonBefore   = moonSummary.textContent;
var bandsBeforeDate = moonLines().map(function (l) { return l.attrs.class; }).join(',');

dateInput.value = '2026-11-20';
fireEvent(dateInput, 'change');

var ribbonAfter = ribbonSvgEl.children.map(function (c) { return c.tag + ':' + JSON.stringify(c.attrs); }).join('|');
ok(moonSummary.textContent !== moonBefore, 'changing the date re-renders the moon strip');
ok(moonSummary.textContent.indexOf('20 November') !== -1, 'the strip reports the new start date');
equal(ribbonAfter, ribbonBefore, 'changing the date leaves the darkness ribbon byte-identical');

// A different start date must move the moon BANDS, not merely the lead-in
// text — otherwise the strip is relabelling, not recomputing, and every
// assertion above would still pass. This capture existed but was never
// asserted against anything: the review caught it sitting unused, which
// is its own small lesson about how a test can look like it covers
// something it never reads.
var bandsAfterDate = moonLines().map(function (l) { return l.attrs.class; }).join(',');
ok(bandsAfterDate !== bandsBeforeDate,
  'sliding the date moves the moon bands themselves, not just the sentence');

/* --- AC #8 and D9: pace, stage and the km/mi toggle must not touch it.

   Counting REPAINTS, not comparing output. These assertions used to
   compare the rendered bands before and after — but the strip's output
   is invariant to pace and stage anyway, so the comparison passed even
   with the listener wrongly bound to onFieldChange, which is the exact
   mistake AC #8 exists to prevent. What discriminates is whether the
   strip was redrawn at all. The counter watches the one element every
   redraw writes: clearRibbonDisplay blanks the summary, renderMoonStrip
   fills it, hideMoonStrip blanks it. */
var moonRepaints = 0;
// Writes that put a SENTENCE there, not the blanking ones. Every full
// render is exactly one of these (clearRibbonDisplay blanks, then
// renderMoonStrip writes), so this counts renders where moonRepaints
// counts touches — which is what G2 is about: the strip was rendered
// twice per warm route change and the first one thrown away unseen.
var moonSentenceRepaints = 0;
(function spyOnMoonSummary() {
  var text = moonSummary.textContent;
  Object.defineProperty(moonSummary, 'textContent', {
    get: function () { return text; },
    set: function (value) {
      text = value;
      moonRepaints++;
      if (value) moonSentenceRepaints++;
    },
    configurable: true
  });
})();

function repaintsDuring(fn) {
  var before = moonRepaints;
  fn();
  return moonRepaints - before;
}

function rendersDuring(fn) {
  var before = moonSentenceRepaints;
  fn();
  return moonSentenceRepaints - before;
}

// The positive control. Without it, every "0 repaints" below could be
// measuring a counter that never counts anything.
var dateRepaints = repaintsDuring(function () {
  dateInput.value = '2026-12-04';
  fireEvent(dateInput, 'change');
});
ok(dateRepaints > 0, 'the repaint counter is not blind — the date does repaint the strip ('
  + dateRepaints + ' writes)');
ok(moonSummary.textContent.indexOf('4 December') !== -1, 'the strip followed the date again');

var beforePace = moonSummary.textContent;
var beforeBands = moonLines().map(function (l) { return l.attrs.class; }).join(',');

equal(repaintsDuring(function () {
  paceInput.value = 'brisk';
  fireEvent(paceInput, 'change');
}), 0, 'changing pace does not repaint the moon strip at all');
equal(moonSummary.textContent, beforePace, 'changing pace does not change the moon strip');
equal(moonLines().map(function (l) { return l.attrs.class; }).join(','), beforeBands,
  'changing pace does not change a single moon band');

equal(repaintsDuring(function () {
  stageSel.value = '5';
  fireEvent(stageSel, 'change');
}), 0, 'changing stage does not repaint the moon strip at all');
equal(moonSummary.textContent, beforePace, 'changing stage does not change the moon strip');
equal(moonLines().map(function (l) { return l.attrs.class; }).join(','), beforeBands,
  'changing stage does not change a single moon band');

/* --- D9: the km/mi toggle repaints the ribbon and nothing else.

   The unit radio has to repaint the ribbon — its edge labels and its
   summary sentence both carry the unit — and the moon strip used to
   cascade off that same repaint, costing 5.2 ms (norte) and 14.5 ms
   (shikoku) of astronomy per click for a strip whose labels are
   "night 1"/"night N" and which reads unitSystem nowhere.

   Byte-identical output alone would not catch it: the recomputed strip
   is identical, which is precisely why the waste was invisible. The
   repaint count is what discriminates. */
var moonSvgBeforeUnits = moonSvg.children.map(function (c) {
  return c.tag + ':' + JSON.stringify(c.attrs) + ':' + c.textContent;
}).join('|');
var ribbonBeforeUnits = ribbonSvgEl.children.map(function (c) { return c.textContent; }).join('|');

equal(repaintsDuring(function () {
  fireEvent(unitRadios[1], 'change');
}), 0, 'switching km -> mi does not repaint the moon strip at all (D9)');
equal(moonSvg.children.map(function (c) {
  return c.tag + ':' + JSON.stringify(c.attrs) + ':' + c.textContent;
}).join('|'), moonSvgBeforeUnits, 'the moon strip\'s svg children are byte-identical across a km/mi toggle');
equal(moonSummary.textContent, beforePace, 'the moon strip\'s summary is byte-identical across a km/mi toggle');

// Fixture sanity: the toggle really did fire, and really did repaint the
// thing it is supposed to repaint.
var ribbonAfterUnits = ribbonSvgEl.children.map(function (c) { return c.textContent; }).join('|');
ok(ribbonAfterUnits !== ribbonBeforeUnits, 'the darkness ribbon DID repaint for the unit toggle');
ok(ribbonAfterUnits.indexOf('mi') !== -1, 'the ribbon\'s edge labels are now in miles');

fireEvent(unitRadios[0], 'change');
ok(ribbonSvgEl.children.map(function (c) { return c.textContent; }).join('|').indexOf('km') !== -1,
  'switched back to km for the assertions that follow');

/* --- A date outside the years this page accepts is pulled back into
   them, on every edge at once.

   Hiding the strip was half a fix. The section vanished with no
   explanation while the walk-budget bar above it carried on rendering,
   and pushURL still wrote `date=2101-06-15` into the share link, where
   the recipient's coerceParams reset it to today: one URL, two different
   pages, which is the exact failure the bounds were added to prevent.
   This page has no validation UI to reject into — no <form>, no :invalid
   rule — so the value is clamped instead, before anything reads it. */
var beforeBadDate = moonSummary.textContent;

dateInput.value = '2101-06-15';
fireEvent(dateInput, 'change');
equal(dateInput.value, '2100-12-31', 'a year past 2100 is pulled back to the last date this page accepts');
ok(moonWrap.hidden === false, 'and the strip draws that date rather than vanishing unexplained');
ok(moonLines().length > 0, 'a clamped date draws spans');
ok(moonSummary.textContent.indexOf('31 December') !== -1,
  'the sentence reports the date actually in the input: ' + JSON.stringify(moonSummary.textContent));

dateInput.value = '0050-06-15';
fireEvent(dateInput, 'change');
equal(dateInput.value, '1900-01-01',
  'a year under 1900 is pulled up to the first — Date.UTC would silently have mapped 0050 to 1950');
ok(moonWrap.hidden === false, 'and the strip draws it');
ok(moonSummary.textContent.indexOf('1 January') !== -1, 'the sentence reports 1 January');

/* The five-digit year from the finding, fired the way a browser fires it.

   A real browser invokes each change listener independently and reports
   a throw from one to window.onerror without skipping the rest; this
   harness's fireEvent propagates instead. That mattered for exactly one
   input: "20261-06-15" makes `new Date('20261-06-15T06:00:00Z')` an
   Invalid Date — ISO 8601 wants a sign on years past four digits — and
   the BAR's own wallTimeToUTC -> Intl.formatToParts threw RangeError on
   it. The clamp listener is registered before the bar's, so the bar now
   never sees the five-digit value at all; this fires through the same
   isolation helper anyway, so the assertion holds whichever order a
   future refactor leaves the listeners in. */
function fireDateChangePastTheBar(value) {
  dateInput.value = value;
  (dateInput._listeners['change'] || []).forEach(function (fn) {
    try { fn.call(dateInput); } catch (e) { /* see above */ }
  });
}

fireDateChangePastTheBar('20261-06-15');
equal(dateInput.value, '2100-12-31', 'a five-digit year is clamped, not drawn as a walk 18,000 years out');
ok(moonWrap.hidden === false, 'and the strip draws the clamped date');

// The share link carries what the page shows.
ok(lastPushedURL.indexOf('date=2100-12-31') !== -1,
  'the share link carries the clamped date: ' + lastPushedURL);
ok(lastPushedURL.indexOf('20261') === -1 && lastPushedURL.indexOf('2101') === -1,
  'and no trace of the year the recipient\'s coerceParams would have thrown away');

/* pushURL's own clamp, exercised with the input handler out of the way:
   a value set programmatically — restored from storage, set by another
   script, written by a future refactor that forgets to fire `change` —
   must still not reach the URL. Fired through a route change (which
   calls pushURL without touching the date listeners) on the empty route,
   so nothing else on the page moves. */
dateInput.value = '2101-06-15';
routeSel.value = '';
fireEvent(routeSel, 'change');
ok(lastPushedURL.indexOf('date=2100-12-31') !== -1,
  'pushURL clamps for itself, so an unclamped input cannot leak into a share link: ' + lastPushedURL);
ok(lastPushedURL.indexOf('2101') === -1, 'and the rejected year appears nowhere in it');

dateInput.value = '2026-12-04';
selectRoute(MOON_ROUTE);
ok(moonWrap.hidden === false, 'a date back inside the bounds draws the strip again');
equal(moonSummary.textContent, beforeBadDate,
  'and draws exactly what it drew before the out-of-range excursion');

// --- AC #14: a custom route hides it ---
routeSel.value = 'custom';
fireEvent(routeSel, 'change');
ok(moonWrap.hidden === true, 'a custom route hides the moon strip');
equal(moonLines().length, 0, 'a custom route leaves no cells behind');

// --- AC #14: a shape-invalid artifact hides it, without throwing ---
var brokenArtifact = JSON.parse(assetText('darkness', 'camino-portugues'));
delete brokenArtifact.stepKm;
routeSel.value = 'camino-portugues';
fireEvent(routeSel, 'change');
resolveDarkness('camino-portugues', JSON.stringify(brokenArtifact));
resolveStages('camino-portugues', assetText('daylight', 'camino-portugues'));
ok(moonWrap.hidden === true, 'a shape-invalid artifact hides the moon strip');
equal(moonLines().length, 0, 'a shape-invalid artifact draws no cells');

/* ==========================================
   The both-sources race, the OTHER way round.

   Every scenario above lands darkness first, so loadDarknessData's own
   call to renderMoonStripForRoute was dead code to this suite — deleting
   it left every assertion green. camino-norte is the one route whose
   darkness fetch failed earlier in this file and whose stage fetch was
   never resolved, so neither cache is warm and both orders are real.
   ========================================== */

console.log('\n=== the both-sources race — stages first, darkness second ===\n');

var RACE_ROUTE = 'camino-norte';
dateInput.value = '2026-10-12';
selectRoute(RACE_ROUTE);

resolveStages(RACE_ROUTE, assetText('daylight', RACE_ROUTE));
ok(moonWrap.hidden === true,
  'stages alone do not draw the strip — nothing yet says how dark those kilometres are');
equal(moonLines().length, 0, 'no spans drawn while only the stage list has landed');

resolveDarkness(RACE_ROUTE, darknessFixtureText(RACE_ROUTE));
ok(moonWrap.hidden === false, 'darkness landing second draws the strip');
ok(moonLines().length > 0, RACE_ROUTE + ' draws its spans once the second source lands ('
  + moonLines().length + ')');
ok(moonSummary.textContent.indexOf('34 nights from 12 October') === 0,
  'the strip states camino-norte\'s own 34 nights: ' + JSON.stringify(moonSummary.textContent));

/* ==========================================
   AC #14, the branch the nominal case cannot reach: a route whose stages
   neither tile the darkness axis nor carry waypoints to place them by.
   stagePlacements throws there by design (D4 — a wrong axis is worse
   than no axis), and renderMoonStripForRoute's try/catch turns that into
   an absent section plus one warning. The shape-invalid artifact above
   trips ribbonSectionHidden first and never reaches it, so this catch
   was never once exercised.
   ========================================== */

console.log('\n=== an unplaceable route hides the strip and says why, exactly once ===\n');

var UNPLACEABLE = 'route-unplaceable';
var unplaceableWarnings = [];
var warnBeforeUnplaceable = console.warn;
console.warn = function () {
  unplaceableWarnings.push(Array.prototype.join.call(arguments, ' '));
};

var unplaceableThrew = false;
try {
  selectRoute(UNPLACEABLE);
  // Two stages summing to 10 km against a 100 km darkness axis, and not
  // a waypoint between them: neither placement method fits.
  resolveStages(UNPLACEABLE, JSON.stringify([
    { index: 0, nameEn: 'Nowhere', distanceKm: 5, startLat: 42.34, startLon: -3.70 },
    { index: 1, nameEn: 'Nowhere else', distanceKm: 5, startLat: 42.34, startLon: -3.70 }
  ]));
  resolveDarkness(UNPLACEABLE, JSON.stringify({
    route: UNPLACEABLE,
    unit: 'mag/arcsec2',
    coveredKm: 100,
    stepKm: 10,
    heldOutValidation: true,
    positionalConfidence: { withinInterpolationLimit: true },
    values: [21.1, 21.2, 21.3, 21.4, 21.5, 21.4, 21.3, 21.2, 21.1, 21.0, 20.9]
  }));
} catch (e) {
  unplaceableThrew = true;
  unplaceableWarnings.push('THREW: ' + (e && e.message));
}
console.warn = warnBeforeUnplaceable;

ok(!unplaceableThrew, 'an unplaceable route does not throw out of the route-change handler');
ok(ribbonWrap.hidden === false, 'fixture sanity: the artifact itself is sound, so the ribbon still draws');
ok(moonWrap.hidden === true, 'an unplaceable route hides the moon strip');
equal(moonLines().length, 0, 'an unplaceable route draws no spans');
equal(unplaceableWarnings.length, 1,
  'exactly one warning reaches the console: ' + JSON.stringify(unplaceableWarnings));
ok(unplaceableWarnings[0].indexOf(UNPLACEABLE) !== -1,
  'the warning names the route it could not place');
ok(unplaceableWarnings[0].indexOf('darkness axis') !== -1,
  'the warning says what it could not do: ' + JSON.stringify(unplaceableWarnings[0]));

/* ==========================================
   G2 — one render and one warning per route change, WARM or cold.

   Every scenario above resolves both XHRs cold, which is the only reason
   "exactly one warning" passed. On a warm re-selection the strip was
   drawn twice: loadStageData's cache hit drew it, updateRibbonForRoute's
   hideMoonStrip erased it, and loadDarknessData's cache hit drew it
   again — 23.6 ms (norte) / 33.6 ms (shikoku) of synchronous astronomy
   per revisit, half of it discarded before a frame, and two identical
   "cannot place" warnings for an unplaceable route.

   Measured through this harness on ab0fa94: warm re-selection of
   camino-primitivo = 5 writes / 2 renders; warm route-unplaceable = 2
   warnings. The counters below are what stop either coming back.
   ========================================== */

console.log('\n=== a warm route re-selection renders once and warns once (G2) ===\n');

// How many times a URL has actually been requested. A warm path must add
// none — otherwise "warm" is a claim about the fixture, not a fact.
function fetchCountFor(url) {
  return (xhrByUrl[url] || []).length;
}
var unplaceableStageFetches  = fetchCountFor('/assets/daylight/' + UNPLACEABLE + '.json');
var primitivoDarknessFetches = fetchCountFor('/assets/darkness/' + MOON_ROUTE + '.json');
ok(unplaceableStageFetches > 0 && primitivoDarknessFetches > 0,
  'fixture sanity: both routes were fetched at least once earlier in this file');

// Leave the route, come back to it. Both caches are warm from the
// unplaceable section above, so nothing is fetched.
selectRoute('');
var warmUnplaceableWarnings = [];
var warnBeforeWarmRevisit = console.warn;
console.warn = function () {
  warmUnplaceableWarnings.push(Array.prototype.join.call(arguments, ' '));
};
var warmUnplaceableRenders = rendersDuring(function () {
  selectRoute(UNPLACEABLE);
});
console.warn = warnBeforeWarmRevisit;

equal(fetchCountFor('/assets/daylight/' + UNPLACEABLE + '.json'), unplaceableStageFetches,
  'fixture sanity: the warm revisit issued no new stage fetch — both caches really are warm');
equal(warmUnplaceableRenders, 0, 'an unplaceable route draws nothing on the warm path either');
equal(warmUnplaceableWarnings.length, 1,
  'and warns exactly once, not once per cache hit: ' + JSON.stringify(warmUnplaceableWarnings));

// A route that CAN be placed, revisited warm: one render, not two.
selectRoute('');
var warmRenders = 0;
var warmWrites = repaintsDuring(function () {
  warmRenders = rendersDuring(function () { selectRoute(MOON_ROUTE); });
});
equal(fetchCountFor('/assets/darkness/' + MOON_ROUTE + '.json'), primitivoDarknessFetches,
  'fixture sanity: the warm revisit issued no new darkness fetch either');
equal(warmRenders, 1, 'a warm route re-selection runs the night astronomy exactly once ('
  + warmWrites + ' writes in total)');
ok(moonWrap.hidden === false, 'and the strip is on screen after it');
equal(moonLines().length, 4, 'showing ' + MOON_ROUTE + '\'s four coalesced spans');
equal(moonTicks().length, 2, 'and both of its named nights are marked');

/* The two MIXED orderings — one source warm, one still in flight. Moving
   the cache-hit renders into updateRibbonForRoute is only safe if these
   still draw, and neither was exercised anywhere in this file: every
   scenario above has both sources cold or both warm. */

console.log('\n=== one source cached, one still in flight — both orders (G2) ===\n');

function mixedRouteStages(routeId) {
  return JSON.stringify([0, 1, 2, 3].map(function (i) {
    return { index: i, nameEn: 'Mixed stage ' + i, distanceKm: 25,
             startLat: 42.34, startLon: -3.70 };
  }));
}
function mixedDarknessArtifact(routeId) {
  return JSON.stringify({
    route: routeId, unit: 'mag/arcsec2', coveredKm: 100, stepKm: 10,
    heldOutValidation: true,
    positionalConfidence: { withinInterpolationLimit: true },
    values: [21.1, 21.2, 21.3, 21.4, 21.5, 20.4, 19.3, 21.2, 21.1, 21.0, 20.9]
  });
}

dateInput.value = '2026-10-12';

// (a) stages cached, darkness cold.
var WARM_STAGES = 'route-warm-stages';
selectRoute(WARM_STAGES);
resolveStages(WARM_STAGES, mixedRouteStages(WARM_STAGES));
selectRoute('');
selectRoute(WARM_STAGES);
ok(moonWrap.hidden === true, 'cached stages alone still draw nothing — the axis is not loaded yet');
var warmStagesRenders = rendersDuring(function () {
  resolveDarkness(WARM_STAGES, mixedDarknessArtifact(WARM_STAGES));
});
ok(moonWrap.hidden === false, 'cached stages plus a darkness fetch that lands second draws the strip');
equal(warmStagesRenders, 1, 'and draws it once');
ok(moonLines().length > 0, 'with spans on screen (' + moonLines().length + ')');

// (b) darkness cached, stages cold.
var WARM_DARK = 'route-warm-darkness';
selectRoute(WARM_DARK);
resolveDarkness(WARM_DARK, mixedDarknessArtifact(WARM_DARK));
selectRoute('');
selectRoute(WARM_DARK);
ok(moonWrap.hidden === true, 'cached darkness alone still draws nothing — no stage places a night yet');
var warmDarkRenders = rendersDuring(function () {
  resolveStages(WARM_DARK, mixedRouteStages(WARM_DARK));
});
ok(moonWrap.hidden === false, 'cached darkness plus a stage fetch that lands second draws the strip');
equal(warmDarkRenders, 1, 'and draws it once');
ok(moonSummary.textContent.indexOf('4 nights from 12 October') === 0,
  'stating its own four nights: ' + JSON.stringify(moonSummary.textContent));

selectRoute(MOON_ROUTE);

/* ==========================================
   AC #11 through the wiring, not through renderMoonStrip alone: a
   schedule whose nights have no astronomical night at all.

   nightMoonLux returns null above roughly 48.5°N near midsummer. The
   sentence used to count every cell while the draw loop skipped the ones
   with no moon, and renderMoonStripForRoute revealed the section
   unconditionally — a captioned, empty strip reading "4 nights from
   21 June". Dormant on the shipped routes; reachable by design.
   ========================================== */

console.log('\n=== a schedule with no drawable night stays hidden; a partial one states only what it drew ===\n');

function polarDarknessArtifact(routeId) {
  return JSON.stringify({
    route: routeId,
    unit: 'mag/arcsec2',
    coveredKm: 100,
    stepKm: 10,
    heldOutValidation: true,
    positionalConfidence: { withinInterpolationLimit: true },
    values: [21.1, 21.2, 21.3, 21.4, 21.5, 21.4, 21.3, 21.2, 21.1, 21.0, 20.9]
  });
}

var TROMSO = { lat: 69.65, lon: 18.96 };   // no astronomical night at midsummer
var BURGOS = { lat: 42.34, lon: -3.70 };   // -24.2 deg at local midnight, so it has one

dateInput.value = '2026-06-21';

var ALL_NULL = 'route-polar';
selectRoute(ALL_NULL);
resolveStages(ALL_NULL, JSON.stringify([0, 1, 2, 3].map(function (i) {
  return { index: i, nameEn: 'Polar stage ' + i, distanceKm: 25,
           startLat: TROMSO.lat, startLon: TROMSO.lon };
})));
resolveDarkness(ALL_NULL, polarDarknessArtifact(ALL_NULL));

ok(moonWrap.hidden === true,
  'four nights with no astronomical night at all leave the section hidden, not captioned and empty');
equal(moonLines().length, 0, 'nothing is drawn for a schedule with no drawable night');
equal(moonSummary.textContent, '', 'and no sentence counts nights the strip never drew');

var PART_NULL = 'route-part-polar';
selectRoute(PART_NULL);
/* The reviewer's own G4 case, at the size that crosses the boundary
   rather than stepping around it: 40 km Burgos / 20 km Tromsø / 40 km
   Burgos, tiling a 100 km axis exactly. The middle stage is PLACED and
   undrawable — no astronomical night on 21 June at 69.65°N — and it is
   20% of the route, four times the unplaced clause's 5% threshold. The
   old clause counted exactly those kilometres as unplaced and then
   explained them with shikoku's geography: "The stretches between temple
   clusters, 20% of the route, are not placed." There are no temple
   clusters here, and that 20 km is placed.

   It also sits in the MIDDLE, so the two drawable stages cannot abut and
   coalesce — the span count stays a fact about drawability rather than
   about banding. */
resolveStages(PART_NULL, JSON.stringify([
  { index: 0, nameEn: 'Walkable one', distanceKm: 40, startLat: BURGOS.lat, startLon: BURGOS.lon },
  { index: 1, nameEn: 'Midnight sun',  distanceKm: 20, startLat: TROMSO.lat, startLon: TROMSO.lon },
  { index: 2, nameEn: 'Walkable two', distanceKm: 40, startLat: BURGOS.lat, startLon: BURGOS.lon }
]));
resolveDarkness(PART_NULL, polarDarknessArtifact(PART_NULL));

ok(moonWrap.hidden === false, 'a partly drawable schedule still shows the section');
equal(moonLines().length, 2, 'only the two drawable cells are drawn');
// One numbering scheme (G3): the lead-in states the walk's own length,
// then says how much of it the strip drew. It used to state the DRAWN
// count while every clause and both axis labels used absolute night
// numbers — "2 nights from 21 June. Night 3 holds…" over an axis reading
// night 1 to night 3, three true statements contradicting each other.
ok(moonSummary.textContent.indexOf('3 nights from 21 June.') === 0,
  'the sentence states the walk\'s own three nights: ' + JSON.stringify(moonSummary.textContent));
ok(moonSummary.textContent.indexOf('The strip draws 2 of them.') !== -1,
  'and states separately how many of them it drew');
// G4: those 20 km are placed. The clause that exists for unplaced
// kilometres must not claim them, and must not offer shikoku's reason.
ok(moonSummary.textContent.indexOf('% of the route') === -1,
  'a placed-but-undrawable fifth of the route is not reported as unplaced: '
    + JSON.stringify(moonSummary.textContent));
ok(moonSummary.textContent.indexOf('temple clusters') === -1,
  'and no route\'s geography is offered as the reason for it');
function moonAxisLabel(anchor) {
  var label = moonSvg.children.filter(function (c) {
    return c.tag === 'text' && c.attrs['text-anchor'] === anchor;
  })[0];
  return label && label.textContent;
}
// Both axis labels name the nights at the strip's two ends, on the same
// absolute numbering the clauses use.
equal(moonAxisLabel('start'), 'night 1', 'the left axis label names the first night drawn');
equal(moonAxisLabel('end'), 'night 3', 'the right axis label names the last night drawn, not a count of drawn nights');
ok(moonSummary.textContent.indexOf('Night 3') !== -1,
  'and the prose names that same night 3, so the axis and the sentence agree');
// And the mark for that night sits on the span that draws it.
equal(moonTicks().length, 1, 'the one named night carries one mark');
var partNullTickX = Number(moonTicks()[0].attrs.x1);
ok(moonLines().some(function (l) {
  return Number(l.attrs.x1) <= partNullTickX && partNullTickX <= Number(l.attrs.x2);
}), 'the mark falls on a span that was actually drawn, not on the blank middle stage');

/* ==========================================
   Finding 9 — the two hide paths disagreed about which nodes have to
   exist. renderDarknessRibbon guards both dl-ribbon-wrap and
   dl-ribbon-svg; updateRibbonForRoute guarded only the wrap, then handed
   the missing svg straight to clearRibbonDisplay -> clearSVG, which
   dereferences .firstChild. A page shipping the wrap without the svg
   would have thrown on every route change and been fine on every
   re-render — two answers to one question.

   Loaded as a SECOND instance of the module, against a document that now
   answers null for dl-ribbon-svg alone. The instance driving everything
   above cached its own (present) nodes back at DOMContentLoaded, so it
   keeps working; both instances' change handlers fire on the shared
   dl-route element, which is exactly what makes this a real test — the
   throw would come out of the second one and propagate through the
   event. This runs last for that reason.
   ========================================== */

console.log('\n=== Finding 9 — a page with the ribbon wrap but no ribbon svg hides quietly instead of throwing ===\n');

ABSENT_IDS['dl-ribbon-svg'] = true;
delete require.cache[require.resolve('./daylight.js')];
require('./daylight.js');

var readyListeners = document._listeners['DOMContentLoaded'];
equal(readyListeners.length, 2, 'fixture sanity: the second module instance registered its own DOMContentLoaded listener');
ok(document.getElementById('dl-ribbon-svg') === null, 'fixture sanity: dl-ribbon-svg is now absent from the document');

var svgLessThrew = false;
var svgLessError = '';
try {
  readyListeners[1]();
  var secondMetaXhr = pendingXHR('/assets/daylight/route-meta.json');
  secondMetaXhr.status = 200;
  secondMetaXhr.responseText = fs.readFileSync(path.join(__dirname, '..', 'assets', 'daylight', 'route-meta.json'), 'utf8');
  secondMetaXhr.onload();
  selectRoute('camino-primitivo');
} catch (e) {
  svgLessThrew = true;
  svgLessError = e && e.message;
}
ok(!svgLessThrew, 'selecting a route on a page whose ribbon svg is missing does not throw' + (svgLessThrew ? ' — threw: ' + svgLessError : ''));

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
