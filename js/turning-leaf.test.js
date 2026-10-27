/* =============================================
   The turning leaf — the plate player

   Run via:  node js/turning-leaf.test.js

   Drives js/turning-leaf.js against a fake page built from the plate
   markup the build emits, with the scene, strip, stamp and walk map taken
   from the real js/turning-leaf-core.js, so every hook the player looks
   for is one the core really writes. The clock, the viewport, the
   location and the audio are fakes the test steps by hand.

   Expected values come from the acceptance examples, the calendar, the
   page's own markup and an independent sun (the USNO's approximate solar
   coordinates), never from the player.
   ============================================= */

'use strict';

// The reader's device clock for AE11: a reader at 34°S, in New South
// Wales. Set before any Date exists, so Node reads it.
process.env.TZ = 'Australia/Sydney';

const fs = require('fs');
const path = require('path');
const C = require('./turning-leaf-core.js');
const M = require('./sunpath-math.js');
const temples = require('../assets/sunpath/temples.json').temples;

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function equal(actual, expected, label) {
  const shown = JSON.stringify(actual) + (actual === expected ? '' : ' vs ' + JSON.stringify(expected));
  ok(actual === expected, label + '  (' + shown + ')');
}
function near(actual, expected, tol, label) {
  const shown = typeof actual === 'number' ? actual.toFixed(3) : String(actual);
  ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol,
    label + '  (' + shown + ' vs ' + (+expected).toFixed(3) + ' ± ' + tol + ')');
}
function section(title) { console.log('\n' + title); }

// --- nothing is fetched, stored or sent ---
// Traps set once for the whole file; the last section reads them.

const touched = [];
global.fetch = function () { touched.push('fetch'); return new Promise(function () {}); };
global.XMLHttpRequest = function () { touched.push('XMLHttpRequest'); };
['localStorage', 'sessionStorage', 'indexedDB'].forEach(function (k) {
  Object.defineProperty(globalThis, k, { configurable: true, get: function () { touched.push(k); return undefined; } });
});

// --- a fake page: just enough DOM for the player ---

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': '\'' };
function decode(s) { return s.replace(/&(amp|lt|gt|quot|#39);/g, function (_, k) { return ENTITY[k]; }); }
function escape(s, attr) {
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return attr ? s.replace(/"/g, '&quot;') : s;
}

class Text {
  constructor(data) { this.data = data; this.parentNode = null; }
  get textContent() { return this.data; }
}

// Index access, length and forEach, like the browser's: no map or filter,
// so a player that calls them on a query result fails here too.
class NodeList {
  constructor(items) { items.forEach((n, i) => { this[i] = n; }); this.length = items.length; }
  forEach(fn) { Array.prototype.forEach.call(this, fn); }
}

// One compound selector: tag, classes, [attributes]. Anything more
// throws, so the player cannot lean on a selector this fake fakes.
function matches(el, sel) {
  const m = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[\w-]+\])*)$/i.exec(sel);
  if (!m) throw new Error('the fake DOM cannot match the selector ' + sel);
  if (m[1] && el.tagName !== m[1]) return false;
  const classes = el.className.split(/\s+/);
  if (m[2] && !m[2].slice(1).split('.').every(function (c) { return classes.indexOf(c) >= 0; })) return false;
  if (m[3] && !m[3].slice(1, -1).split('][').every(function (a) { return el.hasAttribute(a); })) return false;
  return true;
}

class El {
  constructor(tag, attrs) {
    this.tagName = tag;
    this.attrs = attrs || {};
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.listeners = {};
    this.animations = [];
    this.rect = null;
  }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get className() { return this.getAttribute('class') || ''; }
  get classList() {
    const el = this;
    const list = function () { return el.className.split(/\s+/).filter(Boolean); };
    return {
      contains: function (c) { return list().indexOf(c) >= 0; },
      add: function () {
        const l = list();
        Array.prototype.forEach.call(arguments, function (c) { if (l.indexOf(c) < 0) l.push(c); });
        el.setAttribute('class', l.join(' '));
      },
      remove: function () {
        const drop = Array.prototype.slice.call(arguments);
        el.setAttribute('class', list().filter(function (c) { return drop.indexOf(c) < 0; }).join(' '));
      }
    };
  }
  get textContent() { return this.children.map(function (c) { return c.textContent; }).join(''); }
  set textContent(v) { this.children = []; if (String(v) !== '') this.appendChild(new Text(String(v))); }
  get innerHTML() { return this.children.map(serialize).join(''); }
  set innerHTML(html) { this.children = []; parse(html).forEach((c) => this.appendChild(c)); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  querySelectorAll(sel) {
    const out = [];
    (function walk(n) {
      n.children.forEach(function (c) { if (c instanceof El) { if (matches(c, sel)) out.push(c); walk(c); } });
    })(this);
    return new NodeList(out);
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  addEventListener(type, fn, opts) {
    const capture = opts === true || !!(opts && opts.capture);
    (this.listeners[type] = this.listeners[type] || []).push({ fn: fn, capture: capture });
  }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 0, height: 0 }; }
  setPointerCapture() {}
  focus() { global.document.activeElement = this; }
  animate(keyframes, options) { this.animations.push({ keyframes: keyframes, options: options }); return {}; }
  click() { if (!this.disabled) dispatch(this, 'click', {}); }
}

function parseAttrs(s) {
  const out = {};
  s.replace(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, function (_, k, a, b, c) {
    out[k] = decode(a !== undefined ? a : b !== undefined ? b : c !== undefined ? c : '');
    return '';
  });
  return out;
}

function parse(html) {
  const frag = new El('#fragment');
  let cur = frag, m;
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) { cur.appendChild(new Text(decode(m[5]))); continue; }
    if (m[1]) {
      if (cur.tagName !== m[2]) throw new Error('fake DOM: </' + m[2] + '> closes <' + cur.tagName + '>');
      cur = cur.parentNode;
      continue;
    }
    const el = cur.appendChild(new El(m[2], parseAttrs(m[3])));
    if (!m[4]) cur = el;
  }
  if (cur !== frag) throw new Error('fake DOM: <' + cur.tagName + '> is never closed');
  return frag.children.slice();
}

function serialize(n) {
  if (n instanceof Text) return escape(n.data);
  return '<' + n.tagName + Object.keys(n.attrs).map(function (k) { return ' ' + k + '="' + escape(n.attrs[k], true) + '"'; }).join('') +
    '>' + n.children.map(serialize).join('') + '</' + n.tagName + '>';
}

// Markup as this fake DOM writes it back, so strings from the core and
// innerHTML from the page compare like for like.
function canon(html) { return parse(html).map(serialize).join(''); }

function makeDocument(html) {
  const doc = new El('#document');
  doc.innerHTML = html;
  doc.readyState = 'complete';
  doc.activeElement = null;
  doc.head = new El('head');
  doc.createElement = function (tag) { return new El(tag); };
  return doc;
}

// Capture from the document down, then bubble from the target up.
function dispatch(target, type, props) {
  const path = [];
  for (let n = target; n; n = n.parentNode) path.push(n);
  const e = Object.assign({
    type: type, target: target, defaultPrevented: false,
    preventDefault: function () { this.defaultPrevented = true; },
    stopPropagation: function () { this.stopped = true; }
  }, props);
  function fire(n, capture) {
    if (e.stopped) return;
    (n.listeners[type] || []).forEach(function (l) { if (l.capture === capture) { e.currentTarget = n; l.fn.call(n, e); } });
  }
  path.slice().reverse().forEach(function (n) { fire(n, true); });
  path.forEach(function (n) { fire(n, false); });
  return e;
}

// --- an independent sun ---

// The USNO's approximate solar coordinates (aa.usno.navy.mil, "Approximate
// Solar Coordinates"): a different series from the NOAA one the core uses,
// good to about a minute of arc. Altitude is geometric, like the plate's.
function usnoSun(ms, lat, lon) {
  const R = Math.PI / 180, D = ms / 864e5 - 10957.5;
  const g = (357.529 + 0.98560028 * D) * R, q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R, e = (23.439 - 0.00000036 * D) * R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const H = (18.697374558 + 24.06570982441908 * D) * 15 * R + lon * R - ra, phi = lat * R;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
  return { alt: alt / R, az: ((az / R) % 360 + 360) % 360 };
}

// The place under the sun from the same series: where its hour angle is
// zero.
function usnoSubsolar(ms) {
  const R = Math.PI / 180, D = ms / 864e5 - 10957.5;
  const g = (357.529 + 0.98560028 * D) * R, q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R, e = (23.439 - 0.00000036 * D) * R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * D) * 15;
  return { lat: dec / R, lon: ((ra / R - gmst) % 360 + 540) % 360 - 180 };
}

// The scene's sky, read back to degrees from the geometry that ships.
function altOf(y) { return (C.SCENE.hy - y) / C.SCENE.ay; }
function azOf(x, facing) { return facing + (x - C.SCENE.cx) / C.SCENE.ax; }

// --- path readers ---

// Absolute points of a path written M…l… (the core) or M…L… (a partial
// trace).
function points(d) {
  const out = [];
  let cmd = null, pending = [];
  ((d || '').match(/[MLl]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || []).forEach(function (tok) {
    if (/[MLl]/.test(tok)) { cmd = tok; return; }
    pending.push(+tok);
    if (pending.length < 2) return;
    const last = out[out.length - 1];
    out.push(cmd === 'l' ? [last[0] + pending[0], last[1] + pending[1]] : [pending[0], pending[1]]);
    pending = [];
    if (cmd === 'M') cmd = 'L';
  });
  return out;
}
function distTo(pts, x, y) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], dx = pts[i][0] - ax, dy = pts[i][1] - ay, l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + u * dx - x, ay + u * dy - y));
  }
  return best;
}

// --- the plates under test ---

const WINTER = {
  key: 'winter-solstice', year: 2026,
  instant: '2026-12-21T20:50:15Z', prev: '2026-09-23T00:05:14Z', next: '2027-03-20T20:24:00Z',
  when: '21 December 2026 · 20:50 UTC · 05:50 on 22 December at Dainichi-ji',
  // 12 Oct photographed at 11:37 (AE4), 13 Oct at 23:00 (AE10), 14 Oct
  // not at all.
  sky: [['2026-10-12', '#788898', '11:37'], ['2026-10-13', '#080808', '23:00'], ['2026-10-15', '#586878', '07:10']]
};
const AUTUMN = {
  key: 'autumn-equinox', year: 2026,
  instant: '2026-09-23T00:05:14Z', prev: '2026-06-21T08:24:00Z', next: WINTER.instant,
  when: '23 September 2026 · 00:05 UTC · 09:05 at Konsen-ji', sky: []
};
// Its whole season came before the photos began, so the page has no strip.
const SPRING = {
  key: 'spring-equinox', year: 2026,
  instant: '2026-03-20T14:46:00Z', prev: '2025-12-21T15:03:00Z', next: '2026-06-21T08:24:00Z',
  when: '20 March 2026 · 14:46 UTC · 23:46 at Ryozen-ji', sky: []
};

const STRIP_LEFT = 100, BAR = 10;

// The plate as the page template writes it (the DOM contract), its parts
// drawn by the core.
function plate(t) {
  const n = C.templeNumber(t.year, t.key);
  const temple = temples.find(function (x) { return x.n === n; });
  const instant = new Date(t.instant);
  const season = C.seasonDays(new Date(t.prev), instant, t.sky);
  const place = C.templePlace(temple);
  const scene = C.sceneSvg({ place: place, date: C.plateDay(instant), instant: instant, season: season.days });
  const strip = C.stripSvg(season.days);
  const data = { key: t.key, year: t.year, instant: t.instant, prev: t.prev,
    temple: { n: n, name: temple.name, ja: temple.ja, lat: temple.lat, lon: temple.lon } };
  const html = '<main><section class="tl-plate" data-tl=\'' + JSON.stringify(data) + '\'>' +
    '<div class="tl-marks">' + C.sealSvg(t.key) + C.stampSvg(n, temple) + '</div>' +
    '<div class="tl-figure">' + scene + '</div>' +
    '<div class="tl-text">' +
      '<h1 class="tl-lead">The lead claim.</h1>' +
      '<p class="tl-when">' + t.when + '</p>' +
      '<p class="tl-caption">The staff at <em>' + temple.name + '</em>, Temple ' + n + ' of the 88; its strokes are its shadow every hour.</p>' +
      '<p class="tl-readout" hidden></p>' +
      '<p class="tl-quiet" role="status"></p>' +
      '<div class="tl-controls">' +
        '<button type="button" class="tl-play" hidden>play the day</button>' +
        '<button type="button" class="tl-sound" aria-pressed="false" hidden>sound off</button>' +
        '<button type="button" class="tl-here" hidden>draw it where I am</button>' +
        '<button type="button" class="tl-back" hidden>back to the turning</button>' +
      '</div>' +
    '</div>' +
    '<div class="tl-walkwrap">' + C.walkMapSvg(temples, n, new Date(t.next)) + '</div>' +
    (strip ? '<div class="tl-stripwrap">' + strip + '<p class="tl-strip-hint" hidden>drag along the days</p></div>' : '') +
    (season.note ? '<p class="tl-note">' + season.note + '</p>' : '') +
    '</section><p class="below">The globe follows.</p></main>';
  return { html: html, temple: temple, place: place, instant: instant, days: season.days };
}

const Player = require('./turning-leaf.js');

// A fresh page, fresh fakes, and the player started on it.
function setup(t, opts) {
  opts = opts || {};
  const fx = t && plate(t);
  const env = { fx: fx, frames: new Map(), nextFrame: 1, observers: [], geo: [], audioMade: 0, tones: 0, reduced: !!opts.reduced, win: {} };
  const doc = makeDocument(opts.html || fx.html);
  env.doc = doc;
  global.document = doc;
  global.TurningLeafCore = opts.noCore ? undefined : C;
  global.matchMedia = function (q) { return { matches: env.reduced && /prefers-reduced-motion:\s*reduce/.test(q) }; };
  global.requestAnimationFrame = function (fn) { const id = env.nextFrame++; env.frames.set(id, fn); return id; };
  global.cancelAnimationFrame = function (id) { env.frames.delete(id); };
  global.IntersectionObserver = class {
    constructor(cb, options) { this.cb = cb; this.options = options; this.targets = []; env.observers.push(this); }
    observe(target) { this.targets.push(target); }
    unobserve(target) { this.targets = this.targets.filter(function (x) { return x !== target; }); }
    disconnect() { this.targets = []; }
  };
  global.addEventListener = function (type, fn) { (env.win[type] = env.win[type] || []).push(fn); };
  global.AudioContext = opts.noAudio ? undefined : class {
    constructor() { env.audioMade++; this.currentTime = 0; this.destination = {}; this.state = 'running'; }
    createGain() {
      const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
      return { gain: param, connect: function (n) { return n; } };
    }
    createOscillator() {
      return { frequency: { value: 0 }, type: 'sine', connect: function (n) { return n; }, start: function () { env.tones++; }, stop() {} };
    }
    resume() { return Promise.resolve(); }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, writable: true,
    value: {
      sendBeacon: function () { touched.push('sendBeacon'); },
      geolocation: opts.noGeo ? undefined : { getCurrentPosition: function (ok, err, o) { env.geo.push({ ok: ok, err: err, options: o }); } }
    }
  });

  if (fx) {
    const fresh = makeDocument(fx.html);
    env.original = {
      day: fresh.querySelector('g.day').innerHTML,
      figure: fresh.querySelector('.tl-figure').innerHTML,
      caption: fresh.querySelector('.tl-caption').innerHTML
    };
    const strip = doc.querySelector('.tl-strip');
    if (strip) strip.rect = { left: STRIP_LEFT, top: 0, width: fx.days.length * BAR, height: 24 };
  }

  env.$ = function (sel) { return doc.querySelector(sel); };
  env.all = function (sel) { return Array.from(doc.querySelectorAll(sel)); };
  env.frame = function (ts) {
    const due = Array.from(env.frames.values());
    env.frames.clear();
    due.forEach(function (fn) { fn(ts); });
  };
  env.run = function (from, to, each) {
    for (let ts = from; ts <= to && env.frames.size; ts += 50) { env.frame(ts); if (each) each(ts); }
  };
  env.enterView = function () {
    env.observers.forEach(function (o) { o.cb(o.targets.map(function (target) { return { target: target, isIntersecting: true }; }), o); });
  };
  env.pageshow = function (persisted) { (env.win.pageshow || []).forEach(function (fn) { fn({ type: 'pageshow', persisted: persisted }); }); };
  env.bar = function (i) { return STRIP_LEFT + (i + 0.5) * BAR; };
  env.point = function (el, type, o) {
    return dispatch(el, type, Object.assign({ pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 }, o));
  };
  env.slide = function (i, type, pointerType) { return env.point(env.$('.tl-strip'), type || 'pointermove', { clientX: env.bar(i), pointerType: pointerType || 'mouse' }); };
  env.key = function (key) { return dispatch(env.$('.tl-stripwrap'), 'keydown', { key: key }); };
  env.is = function (cls) { return env.$('.tl-plate').classList.contains(cls); };
  env.rings = function () { return env.$('.bell').animations.length; };
  env.sun = function () { const s = env.$('.sun-live'); return { x: +s.getAttribute('cx'), y: +s.getAttribute('cy') }; };
  env.shadow = function () {
    const l = env.$('.shadow-live');
    return { x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') };
  };
  env.hours = function () { return env.all('text').filter(function (t) { return t.classList.contains('hour'); }).map(function (t) { return +t.textContent; }); };
  env.readout = function () { return env.$('.tl-readout').textContent; };
  env.locate = function (lat, lon, i) { env.geo[i || 0].ok({ coords: { latitude: lat, longitude: lon } }); };

  // The globe's scripts as the loader adds them, each remembering the
  // instant js/sunpath.js would have found at the moment it was added.
  delete globalThis.__sunpathForce;
  doc.head.appendChild = function (c) {
    c.force = globalThis.__sunpathForce && JSON.parse(JSON.stringify(globalThis.__sunpathForce));
    return El.prototype.appendChild.call(this, c);
  };
  env.scripts = function () { return doc.head.children.map(function (s) { return s.src; }); };
  env.nearGlobe = function () {
    const section = doc.querySelector('[data-lazy-scripts]');
    env.observers.filter(function (o) { return o.targets.indexOf(section) >= 0; }).forEach(function (o) {
      o.cb([{ target: section, isIntersecting: true }], o);
    });
  };

  Player.init();
  Player.globe();
  return env;
}

function dayLayer(o) { return canon(C.dayLayer(C.dayGeometry(o))); }

// --- the tests ---

section('Guarded init: the static plate stands on its own');
{
  let threw = null, env = null;
  try { env = setup(null, { html: '<main><p>no plate here</p></main>' }); } catch (e) { threw = e; }
  ok(!threw, 'a page without .tl-plate: init does nothing and does not throw');
  ok(env && !Object.keys(env.doc.listeners).length && !Object.keys(env.win).length, '...and listens for nothing');
}
{
  const env = setup(WINTER, { noCore: true });
  ok(env.$('.tl-play').hidden && env.$('.tl-sound').hidden && env.$('.tl-here').hidden,
    'without window.TurningLeafCore every control stays hidden');
  ok(!env.$('.tl-stripwrap').hasAttribute('role'), '...and the strip stays plain decoration');
  equal(env.observers.length, 0, '...and nothing waits to replay');
}

section('What the player adds to the plate');
{
  const env = setup(WINTER);
  const w = env.$('.tl-stripwrap');
  ok(!env.$('.tl-play').hidden, '"play the day" is shown');
  ok(!env.$('.tl-sound').hidden, 'the sound toggle is shown');
  ok(!env.$('.tl-here').hidden, '"draw it where I am" is shown');
  ok(env.$('.tl-back').hidden, '"back to the turning" waits until a day is scrubbed');
  equal(w.getAttribute('role'), 'slider', 'the strip becomes a slider');
  equal(w.getAttribute('tabindex'), '0', '...the one keyboard stop');
  ok(!!w.getAttribute('aria-label'), '...with a name');
  equal(w.getAttribute('aria-valuemin'), '0', 'its range starts on the first day, 23 September');
  equal(w.getAttribute('aria-valuemax'), '89', '...and ends on the 90th, 21 December');
  equal(w.getAttribute('aria-valuenow'), '89', 'at rest it stands on the turning\'s day');
  equal(w.getAttribute('aria-valuetext'), WINTER.when, '...and names the turning in the page\'s own words');
  ok(!env.$('.tl-strip-hint').hidden, 'the drag hint is shown');
  equal(w.style.touchAction, 'pan-y', 'a finger can drag along the strip and still scroll the page');
  ok(env.$('g.day').innerHTML === env.original.day, 'starting changes nothing in the drawn plate');
  equal(env.$('.tl-readout').hidden, true, 'the scrub readout stays hidden until a day is scrubbed');
}
{
  const env = setup(WINTER, { noAudio: true, noGeo: true });
  ok(env.$('.tl-sound').hidden, 'a browser with no Web Audio is not offered a sound toggle');
  ok(env.$('.tl-here').hidden, 'a browser with no geolocation is not offered "draw it where I am"');
}

section('AE1: on 21 Dec 2026 the replay starts in the dark, the bell swings, then the sun rises');
{
  const env = setup(WINTER);
  const S = C.SCENE;
  // The day as the page drew it, read before anything moves.
  const arc = points(env.$('.sunpath').getAttribute('d'));
  const trace = points(env.$('.trace').getAttribute('d'));
  const hourX = {};
  env.all('text').forEach(function (t) { if (t.classList.contains('hour')) hourX[t.textContent] = +t.getAttribute('x'); });

  equal(env.frames.size, 0, 'nothing moves before the plate is seen');
  env.enterView();
  ok(env.is('is-replaying'), 'seeing the plate starts the replay');
  env.frame(0);
  equal(env.rings(), 1, 'the bell swings on the first frame: the instant, 05:50 at the temple, comes before sunrise');
  ok(env.sun().x < 0, '...while the sun is still below the horizon, off the plate');
  ok(env.all('.hr').every(function (h) { return h.style.opacity; }), 'the hourly strokes fade to ghosts');

  let firstSun = null, lastReplaying = 0, frames = 0, offArc = 0, wrongInk = 0, offTrace = 0, traceBehind = 0, partial = 0;
  env.run(50, 8000, function (ts) {
    if (!env.is('is-replaying')) return;
    lastReplaying = ts;
    const s = env.sun();
    if (s.x < 0) return;
    if (!firstSun) firstSun = { ts: ts, x: s.x, y: s.y };
    frames++;
    if (distTo(arc, s.x, s.y) > 0.6) offArc++;
    // Facing south, the sun crosses from left to right, so an hour has
    // passed exactly when its dot lies left of the live sun.
    env.all('.hr').forEach(function (h) {
      if (h.classList.contains('inst')) return;
      const passed = hourX[+h.getAttribute('data-m') / 60] <= s.x;
      if (passed !== !h.style.opacity) wrongInk++;
    });
    const sh = env.shadow();
    if (sh.x2 !== sh.x1 || sh.y2 !== sh.y1) {
      if (distTo(trace, sh.x2, sh.y2) > 0.6) offTrace++;
      const drawn = points(env.$('.trace').getAttribute('d'));
      const end = drawn[drawn.length - 1];
      if (drawn.length < trace.length) partial++;
      if (!end || Math.hypot(end[0] - sh.x2, end[1] - sh.y2) > 0.2) traceBehind++;
    }
  });
  ok(firstSun && firstSun.ts > 0, 'then the sun appears, after the bell');
  ok(firstSun && S.hy - firstSun.y >= 0 && S.hy - firstSun.y < 4, '...rising at the horizon');
  ok(firstSun && firstSun.x < S.cx, '...left of the staff, in the east-southeast');
  ok(frames > 50, 'the sun is up for most of the replay  (' + frames + ' frames)');
  equal(offArc, 0, 'the live sun travels the day\'s own arc');
  equal(wrongInk, 0, 'each hour re-inks as the sun passes it, and not before');
  equal(offTrace, 0, 'the one live shadow\'s tip sweeps along the tip path');
  equal(traceBehind, 0, 'the tip path draws up to the live shadow and no further');
  ok(partial > 20, '...growing as the day goes  (' + partial + ' frames partly drawn)');
  ok(lastReplaying >= 6500 && lastReplaying < 7050, 'the replay lasts about 7 s  (last frame at ' + lastReplaying + ' ms)');
  ok(!env.is('is-replaying'), 'and then it ends');
  ok(env.$('g.day').innerHTML === env.original.day, '...on the plate exactly as the page drew it');
  ok(env.sun().x < 0, '...with the live sun gone');
  const sh = env.shadow();
  ok(sh.x2 === sh.x1 && sh.y2 === sh.y1, '...and the live shadow folded away');
  equal(env.rings(), 1, 'the bell swung once');
}

section('The bell swings at the instant, wherever the instant falls');
{
  const env = setup(AUTUMN);
  const temple = env.fx.temple;
  env.$('.tl-play').click();
  let rangAt = null, sunAtRing = null;
  env.run(0, 8000, function (ts) { if (env.rings() && rangAt === null) { rangAt = ts; sunAtRing = env.sun(); } });
  ok(rangAt > 0, 'at Konsen-ji the instant (09:05) comes after sunrise, so the replay opens without the bell');
  // Where the sun stood at the instant: one 50 ms frame moves it about 1°.
  const ref = usnoSun(Date.parse(AUTUMN.instant), temple.lat, temple.lon);
  near(sunAtRing ? altOf(sunAtRing.y) : null, ref.alt, 1.2, '...and it swings as the live sun reaches the instant\'s altitude (USNO)');
}
{
  const env = setup(SPRING);
  let rangSun = null;
  env.enterView();
  env.frame(0);
  equal(env.rings(), 0, 'at Ryozen-ji the instant (23:46) comes after sunset: the replay opens at sunrise');
  env.run(50, 8000, function () { if (env.rings() && !rangSun) rangSun = env.sun(); });
  equal(env.rings(), 1, '...and the bell still swings, once, before it ends');
  ok(rangSun && rangSun.x < 0, '...in the dark, after the sun has set');
}

section('A plate without a strip');
{
  const env = setup(SPRING);
  ok(!env.all('[role]').some(function (e) { return e.getAttribute('role') === 'slider'; }), 'has no slider');
  ok(!env.$('.tl-play').hidden && !env.$('.tl-here').hidden, '...and keeps "play the day" and "draw it where I am"');
  env.$('.tl-here').click();
  env.locate(51.5, -0.13);
  ok(env.is('is-located'), '...and can still be drawn where the reader stands');
}

section('The replay plays once on view, and again on "play the day"');
{
  const env = setup(WINTER);
  env.enterView();
  env.run(0, 8000);
  env.enterView();
  equal(env.frames.size, 0, 'coming back into view does not replay it');
  ok(!env.is('is-replaying'), '...the plate stays still');
  env.$('.tl-play').click();
  ok(env.is('is-replaying'), '"play the day" replays it');
  env.run(0, 8000);
  equal(env.rings(), 2, '...bell and all');
}

section('User input wins: a tap snaps the replay to its end');
{
  const env = setup(WINTER);
  env.enterView();
  env.frame(0);
  env.frame(2000);
  ok(env.all('.hr').some(function (h) { return h.style.opacity; }), 'mid-replay, later hours are still ghosts');
  // A finger that lands to scroll the page sends pointerdown and then
  // pointercancel, never a click; only a tap clicks.
  env.point(env.$('.tl-caption'), 'pointerdown', { pointerType: 'touch' });
  env.point(env.$('.tl-caption'), 'pointercancel', { pointerType: 'touch' });
  ok(env.is('is-replaying'), 'a finger that starts a scroll leaves the replay running');
  env.point(env.$('.tl-caption'), 'pointerdown', { pointerType: 'touch' });
  env.point(env.$('.tl-caption'), 'click', { pointerType: 'touch' });
  ok(!env.is('is-replaying'), 'a tap anywhere ends the replay at once');
  ok(env.$('g.day').innerHTML === env.original.day, '...on the finished plate, exactly as drawn');
  ok(env.sun().x < 0, '...the live sun gone');
  equal(env.frames.size, 0, '...and nothing left running');
}
{
  const env = setup(WINTER);
  env.enterView();
  env.frame(0);
  env.frame(1000);
  env.slide(19, 'pointerdown', 'touch');
  ok(!env.is('is-replaying'), 'strip input during the replay snaps it first');
  ok(env.is('is-scrubbing'), '...then scrubs');
  equal(env.readout(), 'Mon 12 Oct · you looked up at 11:37; at 11:37 at the temple the sun stood here', '...to the day under the finger');
  equal(env.frames.size, 0, '...with no replay frame left to overwrite it');
}
{
  const env = setup(WINTER);
  env.enterView();
  env.frame(0);
  env.frame(1000);
  env.point(env.$('.tl-play'), 'pointerdown');
  env.$('.tl-play').click();
  ok(env.is('is-replaying'), 'tapping "play the day" mid-replay starts it over');
  env.frame(5000);
  ok(env.all('.hr').every(function (h) { return h.style.opacity; }), '...from the dark, every hour a ghost again');
}

section('Reduced motion');
{
  const env = setup(WINTER, { reduced: true });
  env.enterView();
  ok(!env.is('is-replaying') && env.frames.size === 0, 'the plate does not autoplay');
  env.$('.tl-play').click();
  let ran = false;
  env.run(0, 8000, function () { ran = ran || env.is('is-replaying'); });
  ok(ran, '"play the day" still replays when asked');
  equal(env.rings(), 0, '...but the bell does not swing');
  env.slide(19);
  ok(env.$('g.day').innerHTML === dayLayer({ place: env.fx.place, date: '2026-10-12', photo: '11:37' }),
    'scrubbing still redraws the plate for the day');
}

section('The chime: only after sound is switched on, its audio made inside that tap');
{
  const env = setup(AUTUMN);
  const btn = env.$('.tl-sound');
  env.$('.tl-play').click();
  env.run(0, 8000);
  equal(env.rings(), 1, 'a replay swings the bell');
  equal(env.audioMade, 0, '...but makes no audio while sound is off');
  equal(env.tones, 0, '...and plays no chime');
  btn.click();
  equal(env.audioMade, 1, 'switching sound on makes the AudioContext, inside the tap');
  equal(btn.getAttribute('aria-pressed'), 'true', '...the toggle reads pressed');
  equal(btn.textContent, 'sound on', '...and says so');
  equal(env.tones, 0, 'switching it on is silent: the chime waits for the instant');
  env.$('.tl-play').click();
  let before = null, at = null;
  env.run(0, 8000, function () {
    if (env.rings() === 1) before = env.tones;
    else if (at === null) at = env.tones;
  });
  equal(before, 0, 'no chime before the instant');
  ok(at > 0, 'the chime sounds on the frame the bell swings');
  btn.click();
  equal(btn.getAttribute('aria-pressed'), 'false', 'switching sound off');
  equal(btn.textContent, 'sound off', '...says so');
  const t = env.tones;
  env.$('.tl-play').click();
  env.run(0, 8000);
  equal(env.tones, t, '...and the next replay is silent');
  btn.click();
  equal(env.audioMade, 1, 'switching it back on reuses the same audio');
}

section('AE4, AE10: a scrubbed day redraws the plate and says what the photo saw');
{
  const env = setup(WINTER);
  const temple = env.fx.temple, place = env.fx.place, wash = env.$('.sc-wash');

  env.slide(21);
  equal(env.readout(), 'Wed 14 Oct · no photograph this day', 'a day with no photo says there is no photograph');
  ok(env.$('g.day').innerHTML === dayLayer({ place: place, date: '2026-10-14' }), '...the plate is redrawn for 14 October at the temple');
  ok(!env.$('.sc-sun'), '...no sun is marked');
  ok(!wash.style.fill, '...and the sky takes no tint');

  env.slide(19);
  equal(env.readout(), 'Mon 12 Oct · you looked up at 11:37; at 11:37 at the temple the sun stood here',
    'a day photographed at 11:37 says "you looked up"');
  const mark = env.$('.sc-sun');
  ok(!!mark, '...and the sun is marked');
  const ref = usnoSun(Date.parse('2026-10-12T02:37:00Z'), temple.lat, temple.lon);
  near(altOf(+mark.getAttribute('cy')), ref.alt, 0.2, '...at its altitude at 11:37 at the temple (USNO)');
  near(azOf(+mark.getAttribute('cx'), 180), ref.az, 0.2, '...and its bearing, in the south-facing view');
  ok(/^#788898/.test(wash.style.fill || ''), 'the sky takes the photo\'s colour');

  env.slide(20);
  ok(/^Tue 13 Oct · you looked up at 23:00; .*night at the temple/.test(env.readout()),
    'AE10: a photo at 23:00 says it was night at the temple  (' + env.readout() + ')');
  ok(!env.$('.sc-sun'), '...and no sun is marked');
}

section('Keyboard: the strip is one slider');
{
  const env = setup(WINTER);
  const w = env.$('.tl-stripwrap');
  const e = env.key('ArrowLeft');
  equal(w.getAttribute('aria-valuenow'), '88', 'ArrowLeft steps back one day from the turning');
  ok(/^Sun 20 Dec · /.test(w.getAttribute('aria-valuetext')), '...to Sunday 20 December');
  ok(e.defaultPrevented, '...without scrolling the page');
  env.key('ArrowRight');
  equal(w.getAttribute('aria-valuenow'), '89', 'ArrowRight steps forward one');
  env.key('Home');
  equal(w.getAttribute('aria-valuenow'), '0', 'Home jumps to the first day');
  ok(/^Wed 23 Sep · /.test(w.getAttribute('aria-valuetext')), '...Wednesday 23 September');
  env.key('ArrowLeft');
  equal(w.getAttribute('aria-valuenow'), '0', '...and no further');
  env.key('End');
  equal(w.getAttribute('aria-valuenow'), '89', 'End jumps to the last');
  ok(/^Mon 21 Dec · /.test(w.getAttribute('aria-valuetext')), '...Monday 21 December');
  env.key('Home');
  for (let i = 0; i < 19; i++) env.key('ArrowRight');
  const text = w.getAttribute('aria-valuetext');
  ok(/Mon 12 Oct/.test(text) && /11:37/.test(text), 'aria-valuetext names the date and the photo time  (' + text + ')');
  env.key('Escape');
  ok(!env.is('is-scrubbing'), 'Escape returns to the turning');
  equal(w.getAttribute('aria-valuenow'), '89', '...the slider back on the turning\'s day');
  equal(w.getAttribute('aria-valuetext'), WINTER.when, '...named as before');
  ok(env.$('g.day').innerHTML === env.original.day, '...and the plate exactly as drawn');
}

section('The scrub readout');
{
  const env = setup(WINTER);
  const w = env.$('.tl-stripwrap'), r = env.$('.tl-readout');
  const seen = {};
  let matched = 0;
  [19, 20, 21, 22].forEach(function (i) {
    env.slide(i);
    seen[env.readout()] = true;
    if (!r.hidden && env.readout() === w.getAttribute('aria-valuetext')) matched++;
  });
  equal(Object.keys(seen).length, 4, 'its text changes with each scrubbed day');
  equal(matched, 4, '...is shown, and matches aria-valuetext every time');
  env.point(env.$('.tl-strip'), 'pointerleave');
  ok(r.hidden && env.readout() === '', 'it reverts when the plate returns to the turning');
}

section('Touch and mouse');
{
  const env = setup(WINTER);
  const back = env.$('.tl-back');
  env.slide(19, 'pointerdown', 'touch');
  env.slide(21, 'pointermove', 'touch');
  env.slide(21, 'pointerup', 'touch');
  env.slide(21, 'pointerleave', 'touch');
  equal(env.readout(), 'Wed 14 Oct · no photograph this day', 'a drag selects a day that stays shown after the finger lifts');
  ok(env.is('is-scrubbing') && !back.hidden, '...with "back to the turning" offered');
  env.point(env.$('.tl-figure'), 'pointerdown', { pointerType: 'touch' });
  env.point(env.$('.tl-figure'), 'pointercancel', { pointerType: 'touch' });
  ok(env.is('is-scrubbing'), 'scrolling down to read the day keeps it shown');
  env.point(env.$('.tl-figure'), 'pointerdown', { pointerType: 'touch' });
  env.point(env.$('.tl-figure'), 'click', { pointerType: 'touch' });
  ok(!env.is('is-scrubbing'), 'a tap outside the strip returns the plate to the turning');
  ok(env.$('g.day').innerHTML === env.original.day && back.hidden, '...exactly, and "back" leaves');

  env.slide(19, 'pointerdown', 'touch');
  env.slide(19, 'pointerup', 'touch');
  env.slide(30, 'pointermove', 'touch');
  equal(env.readout().slice(0, 10), 'Mon 12 Oct', 'a finger that has lifted no longer drags');
  env.point(back, 'pointerdown', { pointerType: 'touch' });
  back.click();
  ok(!env.is('is-scrubbing') && env.$('g.day').innerHTML === env.original.day, '"back to the turning" returns it');
  ok(env.doc.activeElement === env.$('.tl-stripwrap'), '...and keyboard focus goes back to the strip, not the page top');
}
{
  const env = setup(WINTER);
  env.slide(5);
  ok(env.is('is-scrubbing'), 'a mouse hovering over the strip scrubs it');
  env.point(env.$('.tl-strip'), 'pointerleave');
  ok(!env.is('is-scrubbing') && env.$('g.day').innerHTML === env.original.day, '...and leaving it returns the plate');
}

section('Opt-in: "draw it where I am"');
{
  const env = setup(WINTER);
  const here = env.$('.tl-here'), stamp = env.$('.tl-stamp'), walk = env.$('.tl-walkwrap');
  env.enterView();
  env.run(0, 8000);
  env.slide(19);
  env.key('Escape');
  env.$('.tl-sound').click();
  equal(env.geo.length, 0, 'AE5: replaying, scrubbing and sound never ask for a location');
  here.click();
  equal(env.geo.length, 1, 'the tap asks, once');
  equal(here.textContent, 'looking…', 'while it waits the link reads "looking…"');
  ok(here.disabled, '...and is disabled');
  here.click();
  equal(env.geo.length, 1, '...so it cannot ask twice');
  env.locate(-34, 150);
  ok(env.is('is-located'), 'granted: the plate is drawn where the reader stands');
  ok(env.$('.tl-figure').innerHTML !== env.original.figure, '...a new scene');
  equal(stamp.style.display, 'none', '...the temple stamp steps aside');
  equal(walk.style.display, 'none', '...and so does the walk map');
  ok(env.$('.tl-caption').innerHTML !== env.original.caption, '...the caption speaks of the reader\'s place');
  equal(here.textContent, 'back to the temple', 'the link now reads "back to the temple"');
  ok(!here.disabled, '...and works');
  here.click();
  ok(!env.is('is-located'), 'tapping it returns to the temple');
  ok(env.$('.tl-figure').innerHTML === env.original.figure, '...the temple\'s plate exactly as drawn');
  ok(stamp.style.display === '' && walk.style.display === '', '...stamp and walk map back');
  ok(env.$('.tl-caption').innerHTML === env.original.caption, '...the caption as written');
  equal(here.textContent, 'draw it where I am', '...and the link as it was');
  equal(env.geo.length, 1, 'going back asks nothing');
}
[[1, 'a denial'], [3, 'a timeout'], [2, 'an unavailable position']].forEach(function (c) {
  const env = setup(WINTER);
  const here = env.$('.tl-here');
  here.click();
  env.geo[0].err({ code: c[0] });
  ok(!env.is('is-located') && env.$('.tl-figure').innerHTML === env.original.figure,
    'AE5: ' + c[1] + ' leaves the plate at the temple');
  ok(/temple/.test(env.$('.tl-quiet').textContent), '...and says so quietly  (' + env.$('.tl-quiet').textContent + ')');
  ok(here.textContent === 'draw it where I am' && !here.disabled, '...and the link can be tried again');
});
{
  const env = setup(WINTER);
  const here = env.$('.tl-here');
  here.click();
  env.pageshow(true);
  ok(here.textContent === 'draw it where I am' && !here.disabled, 'back from the back-forward cache, a pending ask is dropped');
  env.locate(-34, 150);
  ok(!env.is('is-located'), '...and its answer, arriving later, redraws nothing');
}
{
  const env = setup(WINTER);
  const here = env.$('.tl-here');
  env.$('.tl-play').click();
  env.frame(0);
  env.frame(1500);
  here.click();
  env.locate(-34, 150);
  ok(env.is('is-located') && !env.is('is-replaying'), 'an answer arriving mid-replay ends the replay and draws the reader\'s plate');
  equal(env.frames.size, 0, '...with no frame of the old scene left running');
}
{
  const env = setup(WINTER);
  const here = env.$('.tl-here');
  here.click();
  env.pageshow(true);
  here.click();
  equal(env.geo.length, 2, 'a second tap asks again');
  env.locate(-34, 150, 0);
  env.geo[0].err({ code: 3 });
  ok(!env.is('is-located') && here.textContent === 'looking…', 'a late answer to the first tap is ignored');
  env.locate(51.5, -0.13, 1);
  ok(env.is('is-located'), '...and the second tap\'s answer is drawn');
}

section('AE11: drawn where the reader stands');
{
  const env = setup(WINTER);
  const S = C.SCENE;
  env.$('.tl-here').click();
  env.locate(-34, 150);
  // At 34°S on 22 Dec the noon sun stands 79° up, due north.
  const arc = points(env.$('.sunpath').getAttribute('d'));
  const top = arc.reduce(function (a, p) { return p[1] < a[1] ? p : a; });
  near(top[0], S.cx, 6 * S.ax, 'a reader at 34°S faces north: the noon sun stands mid-view');
  near(altOf(top[1]), 79.4, 1, '...79° up');
  // Sydney's clock is UTC+11 in December. At 150°E the sun rises about
  // 05:50 and sets about 20:06.
  const hours = env.hours();
  equal(hours[0], 6, 'hours read in the reader\'s own clock: the first is 6');
  equal(hours[hours.length - 1], 20, '...and the last is 20');
  equal(env.$('.tl-quiet').textContent, '', 'a reader with a sunrise gets no polar line');
  ok(env.$('g.day').innerHTML === dayLayer({ place: { lat: -34, lon: 150, tzMin: 660, where: 'reader' }, date: '2026-12-22', instant: new Date(WINTER.instant) }),
    'the reader\'s plate is the turning\'s day where they stand, 22 December by their clock');

  // 25 Sep, before daylight saving begins on 4 Oct: UTC+10. The sun rises
  // about 05:49 and sets about 17:54.
  env.slide(2);
  const sep = env.hours();
  ok(sep[0] === 6 && sep[sep.length - 1] === 17, 'a scrubbed day keeps that day\'s clock: 25 September runs 6 to 17  (' + sep[0] + '–' + sep[sep.length - 1] + ')');
  env.slide(19);
  equal(env.readout(), 'Mon 12 Oct · you looked up at 11:37; at 11:37 where you are the sun stood here',
    'the photo-time line reads "where you are"');
  env.key('Escape');
  ok(env.is('is-located') && !env.is('is-scrubbing'), 'Escape returns to the turning, still where the reader stands');
  env.$('.tl-play').click();
  env.run(0, 8000);
  ok(env.is('is-located') && env.rings() === 1, 'the day replays where the reader stands, bell and all');
}
{
  // Jakarta, 6°S. On 22 Dec the noon sun stands south of it, so the plate
  // faces south; on 1 Oct the noon sun stood north. A scrubbed day keeps the
  // plate's facing, so its arc lies on the same sky as the season's arcs
  // drawn behind it rather than mirrored against them.
  const env = setup(WINTER);
  env.$('.tl-here').click();
  env.locate(-6.2, 106.8);
  env.slide(8);
  const bar = env.$('.tl-strip').querySelectorAll('rect')[8];
  // 1 Oct in the test's Sydney clock, before daylight saving: UTC+10.
  const place = { lat: -6.2, lon: 106.8, tzMin: 600, where: 'reader' };
  ok(C.dayGeometry({ place: place, date: '2026-10-01' }).facing === 0,
    'on its own, 1 October at 6°S would face north');
  ok(env.$('g.day').innerHTML === dayLayer({ place: place, date: '2026-10-01', photo: bar.getAttribute('data-t'), facing: 180 }),
    'a scrubbed 1 October is drawn facing south, as the plate does');
}
{
  const env = setup(WINTER);
  env.$('.tl-here').click();
  env.locate(78.22, 15.63);
  equal(env.all('.sunpath').length, 0, 'a reader in polar night gets no arc');
  ok(env.all('.hr').length === 0 && env.all('.trace').length === 0, '...and no shadow');
  ok(/does not rise where you are on 22 December 2026/.test(env.$('.tl-quiet').textContent),
    '...and one line says the sun does not rise there that day  (' + env.$('.tl-quiet').textContent + ')');
  env.$('.tl-here').click();
  equal(env.$('.tl-quiet').textContent, '', 'back at the temple, the line leaves');
}

section('Back from the back-forward cache, the plate is idle');
{
  const env = setup(WINTER);
  env.$('.tl-here').click();
  env.locate(-34, 150);
  env.$('.tl-play').click();
  env.frame(0);
  env.frame(500);
  env.pageshow(false);
  ok(env.is('is-located') && env.is('is-replaying'), 'an ordinary pageshow changes nothing');
  env.pageshow(true);
  ok(!env.is('is-replaying') && !env.is('is-located'), 'a restored page stops replaying and returns to the temple');
  ok(env.$('.tl-figure').innerHTML === env.original.figure, '...its plate exactly as drawn');
  equal(env.frames.size, 0, '...with nothing left running');
}
{
  const env = setup(WINTER);
  env.slide(19, 'pointerdown', 'touch');
  env.pageshow(true);
  ok(!env.is('is-scrubbing') && env.$('.tl-readout').hidden, 'a scrubbed plate returns to the turning too');
}

// --- the globe below the plate (KTD11) ---

const ROOT = path.join(__dirname, '..');
// The scripts the turning pages loaded with the page before the globe was
// held back (b3a07c3), in that order: js/sunpath.js, what it draws with,
// and the one that writes into its section after it. js/sunpath-turnings.js
// is not among them: it writes the turning's facts, monuments and
// pilgrimages above the globe and needs nothing the globe brings, so that
// content never waits on, or fails with, the globe.
const GLOBE = [
  '/js/sunpath-globe-math.js', '/js/sunpath-capability.js', '/js/vendor/d3-array.min.js',
  '/js/vendor/d3-geo.min.js', '/js/vendor/topojson-client.min.js', '/js/sunpath-globe-svg.js',
  '/js/sunpath.js', '/js/sunpath-temporal.js'
];
const TURNING_PAGES = fs.readdirSync(path.join(ROOT, 'sunpath'))
  .filter(function (d) { return /^\d{4}-[a-z]+-[a-z]+$/.test(d); })
  .map(function (d) { return 'sunpath/' + d + '/index.html'; });
const WINTER_PAGE = fs.readFileSync(path.join(ROOT, 'sunpath/2026-winter-solstice/index.html'), 'utf8');

// The fake plate with the real page's globe section after it.
function globePage(t) {
  const hero = /<section class="sunpath-section sunpath-section--hero"[\s\S]*?<\/section>/.exec(WINTER_PAGE);
  return plate(t).html.replace('</main>', (hero ? hero[0] : '') + '</main>');
}

section('The turning pages hold the globe back');
{
  equal(TURNING_PAGES.length, 12, 'twelve turning pages, 2026 to 2028');
  TURNING_PAGES.forEach(function (rel) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const eager = (html.match(/<script\b[^>]*\ssrc="[^"]+"/g) || []).map(function (tag) { return /\ssrc="([^"]+)"/.exec(tag)[1]; });
    const lazy = /<section class="sunpath-section sunpath-section--hero"[^>]*\sdata-lazy-scripts="([^"]*)"/.exec(html);
    const declared = lazy ? lazy[1].trim().split(/\s+/) : [];
    ok(GLOBE.every(function (s) { return eager.indexOf(s) === -1; }), rel + ': no globe script loads with the page');
    equal(declared.join(' '), GLOBE.join(' '), rel + ': its globe section declares them, in order');
    ok(declared.every(function (s) { return fs.existsSync(path.join(ROOT, s)); }), rel + ': and each one is on disk');
    ok(eager.indexOf('/js/sunpath-turnings.js') > eager.indexOf('/js/turning-leaf.js') &&
      /<script defer src="\/js\/sunpath-turnings\.js">/.test(html),
      rel + ': the turning\'s facts load with the page, deferred, after the player');
  });
}

section('Nearing the globe brings its scripts in order, once');
{
  const env = setup(WINTER, { html: globePage(WINTER) });
  const watchers = env.observers.filter(function (o) { return o.targets.indexOf(env.$('[data-lazy-scripts]')) >= 0; });
  equal(watchers.length, 1, 'one observer watches the globe\'s section');
  equal(env.scripts().length, 0, 'until the reader nears it, no globe script is asked for');
  equal(JSON.stringify(globalThis.__sunpathForce), JSON.stringify({ turning: 'winter-solstice', date: WINTER.instant }),
    'the plate\'s turning and instant are set as the player starts, for the facts that load with the page');
  env.nearGlobe();
  equal(env.scripts().join(' '), GLOBE[0], 'nearing it asks for the first script alone');
  for (let i = 0; i < GLOBE.length; i++) env.doc.head.children[i].onload();
  equal(env.scripts().join(' '), GLOBE.join(' '), '...then each as the one before it arrives, in the declared order');
  env.nearGlobe();
  env.enterView();
  equal(env.scripts().length, GLOBE.length, 'nearing it again asks for nothing more');
  const sunpath = env.doc.head.children[GLOBE.indexOf('/js/sunpath.js')];
  equal(JSON.stringify(sunpath.force), JSON.stringify({ turning: 'winter-solstice', date: WINTER.instant }),
    'js/sunpath.js is added with the plate\'s turning and instant already set for it');
}

section('A globe that fails to load leaves the plate as it was');
{
  const env = setup(WINTER, { html: globePage(WINTER) });
  const before = env.$('.tl-plate').innerHTML;
  env.nearGlobe();
  env.doc.head.children[0].onload();
  env.doc.head.children[1].onload();
  env.doc.head.children[2].onerror();
  const line = env.$('.sunpath-subsolar-caption').textContent;
  ok(/globe/.test(line) && /couldn’t load/.test(line), 'the globe\'s section says the globe couldn’t load  (' + line + ')');
  equal(env.scripts().length, 3, '...and asks for nothing after the script that failed');
  ok(env.$('.tl-plate').innerHTML === before, 'the plate is exactly as it was');
  env.$('.tl-play').click();
  ok(env.is('is-replaying'), '...and still plays the day');
}

// js/sunpath.js is a browser controller with no exports: loaded whole
// against just enough page to reach its first draw, a stub renderer that
// records the view it is turned to, and the document in the state it
// finds when it is injected.
function bootSunpath(readyState, force, then) {
  const names = ['window', 'document', 'd3', 'fetch', 'setInterval', 'requestIdleCallback'];
  const saved = {};
  names.forEach(function (k) { saved[k] = { had: k in global, value: global[k] }; });
  const noop = function () {};
  const caption = { textContent: '' };
  const nodes = { 'sunpath-globe': {}, 'sunpath-subsolar': caption };
  const globe = { views: [], draws: 0, caption: caption, ready: null };
  global.window = {
    SunPathMath: M,
    __sunpathForce: force,
    createSvgGlobe: function () {
      return {
        setRotation: function (r) { globe.views.push(r.slice()); },
        redrawStatic: noop,
        render: function () { globe.draws++; }
      };
    },
    requestIdleCallback: noop,
    addEventListener: noop
  };
  global.document = {
    readyState: readyState,
    addEventListener: function (type, fn) { if (type === 'DOMContentLoaded') globe.ready = fn; },
    getElementById: function (id) { return nodes[id] || null; }
  };
  global.d3 = {};
  global.fetch = function () { return new Promise(noop); };
  global.setInterval = function () { return 0; };
  global.requestIdleCallback = noop;
  try {
    delete require.cache[require.resolve('./sunpath.js')];
    require('./sunpath.js');
    then(globe);
  } finally {
    names.forEach(function (k) {
      if (saved[k].had) global[k] = saved[k].value;
      else delete global[k];
    });
  }
}

section('js/sunpath.js, added after the page has loaded');
{
  const force = { turning: 'winter-solstice', date: WINTER.instant };
  ['interactive', 'complete'].forEach(function (state) {
    bootSunpath(state, force, function (globe) {
      ok(globe.draws > 0 && globe.caption.textContent !== '',
        'with the document already "' + state + '", it draws the globe at once  (' + globe.caption.textContent + ')');
    });
  });
  bootSunpath('loading', undefined, function (globe) {
    equal(globe.draws, 0, 'parsed while the page still loads, as on the hub, it waits');
    globe.ready();
    ok(globe.draws > 0, '...and draws on DOMContentLoaded');
    equal(JSON.stringify(globe.views[0]), JSON.stringify([0, -10]), '...from the hub\'s own opening view');
  });
  bootSunpath('complete', force, function (globe) {
    const sun = usnoSubsolar(Date.parse(WINTER.instant)), view = globe.views[0] || [];
    near(view[0], -sun.lon, 0.05, 'it starts turned to the place under the sun at the instant: longitude');
    near(view[1], -sun.lat, 0.05, '...and latitude');
  });
}

section('It never fetches, stores or sends anything');
{
  equal(touched.length, 0, 'no fetch, XHR, storage or beacon across every scenario above  (' + touched.join(', ') + ')');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
