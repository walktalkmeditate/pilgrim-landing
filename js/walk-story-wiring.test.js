/* =============================================
   The walk story — wiring, driven through a fake browser

   Run via:  node js/walk-story-wiring.test.js

   js/walk-story-markup.test.js reads js/walk-story.js as text. This file
   runs it, against a hand-rolled browser in the spirit of
   js/daylight-ribbon-wiring.test.js: enough surface to scroll, turn the
   phone and fire observers in a controlled order, nothing more. Layout
   is a model (the story's top, pinned heights in svh, stacked scenes of
   a fixed height), so this proves the order of reads and writes and the
   scene kept across a turn, not Chrome's frame times.

   Two defects Task 8's browser pass found:
   - Reading the scroll position in the scroll handler forced a layout
     on nearly every scroll. The handler now only asks for a frame, and
     each frame reads before it writes.
   - Turning a phone sideways and back landed on another scene: the raw
     scroll position means a different scene stacked and pinned.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('./walk-story-core.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}

/* ---------- the fake browser ---------- */

const STORY_TOP = 1480;
const STACKED_SCENE = 700;
const world = { w: 390, h: 844, scrollY: 0 };
const log = [];
const windowListeners = {};
const intoView = [];
const observers = [];
const tracked = [];
let demos = 0;
let rafs = new Map(), rafId = 0, clock = 0;

function note(kind, what) { log.push({ kind: kind, what: what }); }

function classList(owner, initial) {
  const set = new Set(initial || []);
  return {
    contains: function (c) { return set.has(c); },
    add: function (c) { if (!set.has(c)) note('write', owner + '+' + c); set.add(c); },
    remove: function (c) { if (set.has(c)) note('write', owner + '-' + c); set.delete(c); },
    toggle: function (c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on !== set.has(c)) note('write', owner + ' toggles ' + c);
      if (on) set.add(c); else set.delete(c);
      return on;
    }
  };
}

function style(owner) {
  const props = {};
  return new Proxy(props, {
    get: function (t, k) {
      if (k === 'setProperty') return function (p, v) { note('write', owner + ' ' + p); t[p] = String(v); };
      if (k === 'removeProperty') return function (p) { note('write', owner + ' -' + p); delete t[p]; };
      if (k === 'getPropertyValue') return function (p) { return t[p] || ''; };
      return t[k];
    },
    set: function (t, k, v) { note('write', owner + '.' + String(k)); t[k] = v; return true; }
  });
}

function el(name, opts) {
  opts = opts || {};
  return {
    name: name,
    attrs: {},
    classList: classList(name, opts.classes),
    style: style(name),
    getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute: function (k, v) { note('write', name + '@' + k); this.attrs[k] = String(v); },
    removeAttribute: function (k) { if (k in this.attrs) note('write', name + '@-' + k); delete this.attrs[k]; },
    addEventListener: function () {},
    querySelector: function (sel) { return (opts.one && opts.one[sel]) || null; },
    querySelectorAll: function (sel) { return (opts.all && opts.all[sel]) || []; },
    closest: function () { return null; },
    getBoundingClientRect: function () {
      note('read', name + ' rect');
      const top = opts.docTop ? opts.docTop() - world.scrollY : 0;
      return { top: top, left: 0, right: world.w, bottom: top + 100, width: world.w, height: 100 };
    },
    get offsetHeight() { note('read', name + ' offsetHeight'); return opts.offsetHeight ? opts.offsetHeight() : 0; },
    get offsetWidth() { note('read', name + ' offsetWidth'); return world.w; },
    scrollIntoView: function (o) { intoView.push({ name: name, opts: o }); if (opts.onIntoView) opts.onIntoView(); }
  };
}

let root;
function isPinned() { return root.classList.contains('walk-story--pinned'); }

const scenes = C.SCENES.map(function (s, k) {
  return el('scene-' + (k + 1), {
    one: { '.walk-story-front': el('front-' + (k + 1)) },
    onIntoView: function () { world.scrollY = STORY_TOP + k * STACKED_SCENE; }
  });
});
const stage = el('stage', { docTop: function () { return STORY_TOP; }, offsetHeight: function () { return isPinned() ? world.h : 9 * STACKED_SCENE; } });
const lineGeometry = { viewBox: { baseVal: { width: 1600, height: 900 } } };
const pillLabel = el('pill-label');
const pill = el('pill', { one: { '.ws-pill-label': pillLabel } });
root = el('story', {
  docTop: function () { return STORY_TOP; },
  offsetHeight: function () { return isPinned() ? 9 * 1.4 * world.h : 9 * STACKED_SCENE; },
  one: {
    '.walk-story-stage': stage,
    '.walk-story-rail': el('rail'),
    '.walk-story-pill': pill,
    '.walk-story-skip': el('skip'),
    '.walk-story-line--portrait': lineGeometry,
    '.walk-story-line--landscape': lineGeometry
  },
  all: {
    '.walk-story-scene': scenes,
    '.ws-sky': C.SKIES.map(function (s) { return el('sky-' + s); }),
    '.walk-story-rail a': scenes.map(function (s, k) { return el('rail-' + (k + 1)); })
  }
});

function FakeIO(cb, opts) { this.cb = cb; this.opts = opts || {}; this.targets = []; observers.push(this); }
FakeIO.prototype.observe = function (t) { this.targets.push(t); };
FakeIO.prototype.unobserve = function (t) { this.targets = this.targets.filter(function (x) { return x !== t; }); };
FakeIO.prototype.disconnect = function () { this.targets = []; };

const win = {
  WalkStoryCore: C,
  umami: { track: function (e) { tracked.push(e); } },
  TracesCairn: { demo: function () { demos++; } },
  CSS: { supports: function () { return true; } },
  IntersectionObserver: FakeIO,
  matchMedia: function (q) {
    return { matches: q.indexOf('max-width: 720px') !== -1 ? world.w <= 720 : false };
  },
  get innerWidth() { return world.w; },
  get innerHeight() { return world.h; },
  get scrollY() { note('read', 'scrollY'); return world.scrollY; },
  scrollTo: function (o) { world.scrollY = o.top; note('scrollTo', o.behavior + ' ' + o.top); },
  addEventListener: function (type, fn) { (windowListeners[type] = windowListeners[type] || []).push(fn); },
  removeEventListener: function (type, fn) {
    windowListeners[type] = (windowListeners[type] || []).filter(function (f) { return f !== fn; });
  },
  requestAnimationFrame: function (fn) { rafs.set(++rafId, fn); return rafId; },
  cancelAnimationFrame: function (id) { rafs.delete(id); }
};
const doc = {
  querySelector: function (sel) { return sel === '.walk-story' ? root : null; },
  getElementById: function () { return el('after'); },
  body: { classList: classList('body') },
  documentElement: { getAttribute: function () { return null; } }
};

function fire(type) { (windowListeners[type] || []).slice().forEach(function (fn) { fn(); }); }
function frames(max) {
  for (let k = 0; k < (max || 400) && rafs.size; k++) {
    clock += 16.667;
    const due = Array.from(rafs.values());
    rafs = new Map();
    due.forEach(function (fn) { note('frame', ''); fn(clock); });
  }
}
function rootObserver() { return observers.filter(function (o) { return o.targets.indexOf(root) !== -1; })[0]; }
function lineObserver() {
  return observers.filter(function (o) { return o.opts.rootMargin === '-50% 0px -50% 0px'; })[0] ||
    { targets: [], cb: function () {} };
}
function reportLine(k) {
  const io = lineObserver();
  io.cb(io.targets.map(function (t) { return { target: t, isIntersecting: scenes.indexOf(t) === k }; }));
}
function onStage() {
  return scenes.map(function (s) { return s.classList.contains('is-active'); }).indexOf(true);
}
function turn(w, h) { world.w = w; world.h = h; fire('resize'); }
function run() { return 9 * 1.4 * world.h - world.h; }
function lastJump() {
  const jumps = log.filter(function (e) { return e.kind === 'scrollTo'; });
  return jumps.length ? jumps[jumps.length - 1].what.split(' ')[0] : null;
}
const UPRIGHT_RUN = 9 * 1.4 * 844 - 844;

vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'walk-story.js'), 'utf8'), {
  window: win, document: doc, CSS: win.CSS, IntersectionObserver: FakeIO
});

/* ---------- the scroll path ---------- */

console.log('\n=== the scroll handler asks for a frame; the frame reads before it writes ===\n');

ok(isPinned(), 'a tall phone pins the story at load');
world.scrollY = STORY_TOP;
rootObserver().cb([{ target: root, isIntersecting: true }]);
ok((windowListeners.scroll || []).length === 1, 'entering the story listens to the scroll');
fire('scroll');
fire('scroll');
eq(rafs.size, 1, 'two scrolls before a frame ask for one frame, not two easing loops');

log.length = 0;
let handlerReads = 0;
const goal = STORY_TOP + (3 + 0.5) / 9 * run();
for (let y = STORY_TOP; y < goal; y += 40) {
  world.scrollY = y;
  const before = log.length;
  fire('scroll');
  handlerReads += log.slice(before).filter(function (e) { return e.kind === 'read'; }).length;
  frames(1);
}
world.scrollY = goal;
fire('scroll');
frames();
eq(handlerReads, 0, 'the scroll handler reads nothing: no scroll position, no layout');

const perFrame = [];
log.forEach(function (e) {
  if (e.kind === 'frame') perFrame.push([]);
  else if (perFrame.length) perFrame[perFrame.length - 1].push(e);
});
// Every read in a frame, not just the first, comes before its first
// write: settle() re-reading the scroll position at rest would force a
// layout after render's writes.
const readsFirst = perFrame.every(function (f) {
  const kinds = f.map(function (e) { return e.kind; });
  const lastRead = kinds.lastIndexOf('read');
  const firstWrite = kinds.indexOf('write');
  return kinds.indexOf('read') !== -1 && (firstWrite === -1 || lastRead < firstWrite);
});
ok(perFrame.length > 20 && readsFirst,
  'every frame does all its reading, the scroll position first, before its first write  (' + perFrame.length + ' frames)');
ok(perFrame.every(function (f) { return f.every(function (e) { return e.kind !== 'read' || e.what === 'scrollY'; }); }),
  'and reads no element\'s layout');
eq(onStage(), 3, 'the reader rests on scene 04');
function holdAt(y) {
  return Math.round(C.holdLocal(C.sceneAt(C.storyProgress(y, STORY_TOP, 9 * 1.4 * world.h, world.h), 9).local) * 10000) / 10000;
}
eq(scenes[3].style['--hold'], String(holdAt(goal)), 'at rest scene 04\'s --hold is exact');
// A sub-pixel step snaps straight to rest, so the rest frame alone has to
// write the new value.
world.scrollY = goal + 0.3;
fire('scroll');
frames();
ok(holdAt(goal + 0.3) !== holdAt(goal), 'a 0.3px nudge moves the hold  (' + holdAt(goal) + ' to ' + holdAt(goal + 0.3) + ')');
eq(scenes[3].style['--hold'], String(holdAt(goal + 0.3)), 'and --hold lands on it exactly: at rest every value is written');
eq(demos + tracked.length, 0, 'resting on scene 04 plays no cairn demo and counts no end');

/* ---------- turning the phone ---------- */

console.log('\n=== a phone turned sideways and back keeps its scene ===\n');

turn(844, 390);
ok(!isPinned(), 'sideways, the story unpins to the stacked layout');
eq(intoView.length && intoView[intoView.length - 1].name, 'scene-4', 'the scene that was on stage is scrolled into view, stacked');
eq(intoView.length && JSON.stringify(intoView[intoView.length - 1].opts), '{"block":"start","behavior":"instant"}',
  'at once, from its top: the page\'s smooth scrolling would animate it');
eq(lineObserver().targets.length, 9, 'stacked, the scene on the viewport\'s middle line is watched');
reportLine(3);
// The browser moves the scroll position under a layout change (Task 8's
// walkthrough saw 8958). Here it lands in scene 09's pinned range, where
// settling before the jump would count the story's end.
world.scrollY = STORY_TOP + 8.5 / 9 * UPRIGHT_RUN;
turn(390, 844);
ok(isPinned(), 'upright again, the story pins again');
eq(onStage(), 3, 'on scene 04, where the reader was');
eq(world.scrollY, C.sceneScrollTop(3, 9, STORY_TOP, 9 * 1.4 * 844, 844), 'at the start of its hold');
eq(lastJump(), 'instant', 'by an instant jump: the page\'s smooth scrolling would animate it');
eq(tracked.length, 0, 'the end is not counted at the position the jump leaves, in scene 09');
eq(lineObserver().targets.length, 0, 'pinned, the middle line is no longer watched');

turn(844, 390);
reportLine(3);
world.scrollY = STORY_TOP + 5.5 / 9 * UPRIGHT_RUN;   // inside scene 06's hold
turn(390, 844);
eq(onStage(), 3, 'moved into scene 06 this time, it still lands on scene 04');
eq(demos, 0, 'and the cairn demo does not play at the position the jump leaves');

console.log('\n=== turned back before the stacked page reports, the kept scene holds ===\n');

turn(844, 390);
turn(390, 844);   // the middle-line observer has not delivered yet
eq(onStage(), 3, 'unpinning seeds the watch with the scene it kept, scene 04');

console.log('\n=== read on while stacked, and the story resumes there ===\n');

rootObserver().cb([{ target: root, isIntersecting: true }]);
turn(844, 390);
reportLine(5);   // the reader scrolled on to scene 06, stacked
turn(390, 844);
eq(onStage(), 5, 'the story pins on the stacked scene being read, scene 06');
eq(world.scrollY, C.sceneScrollTop(5, 9, STORY_TOP, 9 * 1.4 * 844, 844), 'at the start of its hold');
eq(demos, 1, 'where the reader now rests, the cairn demo plays, once');

console.log('\n=== above the story, a turn leaves the reader where they are ===\n');

world.scrollY = 200;
fire('scroll');
frames();
rootObserver().cb([{ target: root, isIntersecting: false }]);
const seen = intoView.length;
turn(844, 390);
eq(intoView.length, seen, 'sideways in the hero, nothing is scrolled into view');
lineObserver().cb(lineObserver().targets.map(function (t) { return { target: t, isIntersecting: false }; }));
turn(390, 844);
eq(world.scrollY, 200, 'and upright again the reader is still in the hero');

console.log('\n=== resting on scene 09 counts the end, once ===\n');

rootObserver().cb([{ target: root, isIntersecting: true }]);
world.scrollY = C.sceneScrollTop(8, 9, STORY_TOP, 9 * 1.4 * 844, 844) + 200;
fire('scroll');
frames();
eq(onStage(), 8, 'the reader rests on scene 09');
eq(tracked.join(','), 'story-reach-end', 'and the end is counted there, once');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
