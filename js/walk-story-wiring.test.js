/* =============================================
   The walk story — wiring, driven through a fake browser

   Run via:  node js/walk-story-wiring.test.js

   js/walk-story-markup.test.js reads js/walk-story.js as text. This file
   runs it, against a hand-rolled browser in the spirit of
   js/daylight-ribbon-wiring.test.js: enough surface to scroll, turn the
   phone, click and focus the story's links, and fire observers in a
   controlled order, nothing more. Each element keeps its listeners, as
   js/clearing-rider.test.js's do, so the rail, the pill, the skip link
   and the focus rule run here rather than only in a browser. Layout
   is a model (the story's top, pinned heights in svh, stacked scenes of
   a fixed height), so this proves the order of reads and writes and the
   scene kept across a turn, not Chrome's frame times.

   Two defects Task 8's browser pass found:
   - Reading the scroll position in the scroll handler forced a layout
     on nearly every scroll. The handler now only asks for a frame, and
     each frame reads before it writes.
   - Turning a phone sideways and back landed on another scene: the raw
     scroll position means a different scene stacked and pinned. A width
     change that stays pinned (a tablet turned, a window narrowed) drifted
     the same way, as the page above the story reflowed.
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

const STORY_TOP = 1480;   // on an upright phone
// The page above the story reflows with the width: narrower is taller.
function storyTop() { return world.w <= 720 ? STORY_TOP : world.w < 1200 ? 1600 : 1210; }
const STACKED_SCENE = 700;
// h is innerHeight, which follows Safari's toolbar; svh is 100svh, the
// small viewport's height, which does not.
const world = { w: 390, h: 844, svh: 844, scrollY: 0 };
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
    on: {},
    focused: [],
    classList: classList(name, opts.classes),
    style: style(name),
    appendChild: function (child) { return child; },
    getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute: function (k, v) { note('write', name + '@' + k); this.attrs[k] = String(v); },
    removeAttribute: function (k) { if (k in this.attrs) note('write', name + '@-' + k); delete this.attrs[k]; },
    addEventListener: function (type, fn) { (this.on[type] = this.on[type] || []).push(fn); },
    focus: function (o) { this.focused.push(o); },
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
    onIntoView: function () { world.scrollY = storyTop() + k * STACKED_SCENE; }
  });
});
const stage = el('stage', { docTop: storyTop, offsetHeight: function () { return isPinned() ? world.h : 9 * STACKED_SCENE; } });
const lineGeometry = { viewBox: { baseVal: { width: 1600, height: 900 } } };
const pillLabel = el('pill-label');
const pill = el('pill', { one: { '.ws-pill-label': pillLabel } });
const skip = el('skip');
const after = el('after');
const railLinks = scenes.map(function (s, k) { return el('rail-' + (k + 1)); });
root = el('story', {
  docTop: storyTop,
  offsetHeight: function () { return isPinned() ? 9 * 1.4 * world.h : 9 * STACKED_SCENE; },
  one: {
    '.walk-story-stage': stage,
    '.walk-story-rail': el('rail'),
    '.walk-story-pill': pill,
    '.walk-story-skip': skip,
    '.walk-story-line--portrait': lineGeometry,
    '.walk-story-line--landscape': lineGeometry
  },
  all: {
    '.walk-story-scene': scenes,
    '.ws-sky': C.SKIES.map(function (s) { return el('sky-' + s); }),
    '.walk-story-rail a': railLinks
  }
});

function FakeIO(cb, opts) { this.cb = cb; this.opts = opts || {}; this.targets = []; observers.push(this); }
FakeIO.prototype.observe = function (t) { this.targets.push(t); };
FakeIO.prototype.unobserve = function (t) { this.targets = this.targets.filter(function (x) { return x !== t; }); };
FakeIO.prototype.disconnect = function () { this.targets = []; };

const win = {
  WalkStoryCore: C,
  location: { hash: '' },
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
  cancelAnimationFrame: function (id) { rafs.delete(id); },
  // What js/main.js would see: the story's class and the body's.
  dispatchEvent: function (e) {
    dispatched.push({ type: e.type, story: isPinned(), body: doc.body.classList.contains('walk-story-pinned') });
    fire(e.type);
    return true;
  }
};
const dispatched = [];
function FakeEvent(type) { this.type = type; }
const doc = {
  querySelector: function (sel) { return sel === '.walk-story' ? root : null; },
  // The one element the story creates and measures here is its 100svh
  // probe (the star clearings are made only when .ws-clearings exists).
  createElement: function (tag) { return el('created-' + tag, { offsetHeight: function () { return world.svh; } }); },
  getElementById: function (id) { return id === 'after-walk-story' ? after : null; },
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
// An element's own listeners, as js/clearing-rider.test.js fires them.
function dispatch(target, type, e) {
  (target.on[type] || []).slice().forEach(function (fn) { fn(e); });
  return e;
}
function click(target, mods) {
  const e = Object.assign({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }, mods);
  e.preventDefault = function () { e.defaultPrevented = true; };
  return dispatch(target, 'click', e);
}
function jumps() { return log.filter(function (e) { return e.kind === 'scrollTo'; }).length + intoView.length; }
function turn(w, h) { world.w = w; world.h = h; world.svh = h; fire('resize'); }
function toolbar(h) { world.h = h; fire('resize'); }
function run() { return 9 * 1.4 * world.h - world.h; }
function lastJump() {
  const jumps = log.filter(function (e) { return e.kind === 'scrollTo'; });
  return jumps.length ? jumps[jumps.length - 1].what.split(' ')[0] : null;
}
const UPRIGHT_RUN = 9 * 1.4 * 844 - 844;

// The page loads from a link to scene 05. Wherever the browser left the
// reader before the story pinned (here, what pinned is scene 06's hold),
// the story lands on the linked scene.
win.location.hash = '#scene-5';
world.scrollY = STORY_TOP + 5.5 / 9 * UPRIGHT_RUN;

vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'walk-story.js'), 'utf8'), {
  window: win, document: doc, CSS: win.CSS, IntersectionObserver: FakeIO, Event: FakeEvent
});

/* ---------- a link to a scene ---------- */

console.log('\n=== loaded from a link to a scene, the story lands on it ===\n');

eq(onStage(), 4, 'loaded at #scene-5, the pinned story puts scene 05 on stage');
eq(world.scrollY, C.sceneScrollTop(4, 9, STORY_TOP, 9 * 1.4 * 844, 844), 'at its hold start');
eq(lastJump(), 'instant', 'at once');
eq(demos + tracked.length, 0, 'where the reader was before, scene 06, no cairn demo plays and nothing is counted');

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

console.log('\n=== a pinned window narrowed keeps its scene ===\n');

turn(1440, 900);
world.scrollY = C.sceneScrollTop(3, 9, storyTop(), 9 * 1.4 * 900, 900);
fire('scroll');
frames();
eq(onStage(), 3, 'at 1440x900 the reader rests at the start of scene 04');
turn(1024, 900);
eq(onStage(), 3, 'narrowed to 1024 and still pinned, the story stays on scene 04');
eq(world.scrollY, C.sceneScrollTop(3, 9, storyTop(), 9 * 1.4 * 900, 900),
  'at the start of its hold, with the page above it reflowed taller');
eq(lastJump(), 'instant', 'by an instant jump');

console.log('\n=== flung out of the story, it stops easing off screen ===\n');

// Easing on after the story has left would write every frame, ahead of
// the clearing rider's read of the fog in the same frame.
world.scrollY = storyTop() + 9 * 1.4 * 900 + 2000;
fire('scroll');
frames(1);
ok(rafs.size === 1, 'one frame into the fling, the story is still easing');
rootObserver().cb([{ target: root, isIntersecting: false }]);
eq(rafs.size, 0, 'leaving the viewport stops the loop');
eq(onStage(), 8, 'landed where the scroll left the story, on scene 09');
eq(tracked.length, 0, 'and a fling past the story counts no end');

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

console.log('\n=== Safari\'s toolbar never pins or unpins the story ===\n');

// An SE: its small viewport is 548px tall, and with the toolbar folded
// away the window is 620. The story's height is in svh, so pinning by
// innerHeight would flip it, and the page's height with it, as the
// toolbar moves.
turn(375, 548);
ok(!isPinned(), 'a 548px small viewport stacks the story');
const jumpsBefore = log.filter(function (e) { return e.kind === 'scrollTo'; }).length + intoView.length;
toolbar(620);
ok(!isPinned(), 'the toolbar folding away (innerHeight 620, 100svh still 548) leaves it stacked');
toolbar(548);
ok(!isPinned(), 'and its return leaves it stacked');
eq(log.filter(function (e) { return e.kind === 'scrollTo'; }).length + intoView.length, jumpsBefore, 'the toolbar moves the reader nowhere');
eq(world.scrollY, 200, 'the reader is still in the hero');
turn(390, 844);
ok(isPinned(), 'a tall phone pins it again');
toolbar(760);
ok(isPinned(), 'and its toolbar showing (innerHeight 760, 100svh 844 is the layout) keeps it pinned');
toolbar(844);

console.log('\n=== resting on scene 09 counts the end, once ===\n');

rootObserver().cb([{ target: root, isIntersecting: true }]);
world.scrollY = C.sceneScrollTop(8, 9, STORY_TOP, 9 * 1.4 * 844, 844) + 200;
fire('scroll');
frames();
eq(onStage(), 8, 'the reader rests on scene 09');
eq(tracked.join(','), 'story-reach-end', 'and the end is counted there, once');

/* ---------- the rail, the pill, the skip link and focus ---------- */

// Pinned, every scene's box is the stage's, so the browser's own jump
// to #scene-N lands on scene 01: these links are the story's to move.
function holdStart(i) { return C.sceneScrollTop(i, 9, storyTop(), 9 * 1.4 * world.h, world.h); }
function inScene(k) { return { closest: function (sel) { return sel === '.walk-story-scene' ? scenes[k] : null; } }; }
const inStageChrome = { closest: function () { return null; } };   // the rail, the pill, the skip link

console.log('\n=== pinned, the rail and the pill ride the story to a scene ===\n');

let e = click(railLinks[2]);
ok(e.defaultPrevented, 'a rail dot\'s click is the story\'s, not the browser\'s jump to scene 01');
eq(world.scrollY, holdStart(2), 'it rides to scene 03\'s hold start');
eq(lastJump(), 'smooth', 'smoothly: the reader sees the walk pass');
fire('scroll');
frames();
eq(onStage(), 2, 'and comes to rest on scene 03');

e = click(pill);
ok(e.defaultPrevented, 'the pill\'s click is the story\'s too');
eq(world.scrollY, holdStart(3), 'it rides on to the next scene, 04');
eq(lastJump(), 'smooth', 'smoothly');
fire('scroll');
frames();
eq(onStage(), 3, 'and comes to rest there');

console.log('\n=== a focused element never sits in a faded scene ===\n');

dispatch(root, 'focusin', { target: inScene(6) });
eq(onStage(), 6, 'tabbing into scene 07 brings it on stage');
eq(world.scrollY, holdStart(6), 'at its hold start');
eq(lastJump(), 'instant', 'at once: the focus ring never waits in a fading scene');
let before = jumps();
dispatch(root, 'focusin', { target: inScene(6) });
eq(jumps(), before, 'focus moving within the scene on stage moves nothing');
dispatch(root, 'focusin', { target: inStageChrome });
eq(jumps(), before, 'focus on the rail, the pill or the skip link moves nothing');

console.log('\n=== the skip link skips the story ===\n');

e = click(skip);
ok(e.defaultPrevented, 'the skip link\'s click is the story\'s');
ok(world.scrollY >= storyTop() + 9 * 1.4 * world.h, 'it lands at the story\'s end, past every scene  (' + world.scrollY + ')');
eq(lastJump(), 'instant', 'at once: no smooth ride through 12.6 screens');
eq(after.attrs.tabindex, '-1', 'what follows the story can take focus');
eq(JSON.stringify(after.focused), '[{"preventScroll":true}]', 'and takes it without a second scroll');
// An observer counts a box whose edge only touches the window as in
// view, and offsetHeight rounds: landing on the end, the story might
// never leave, and the page's walker would stay hidden.
ok(world.scrollY >= storyTop() + 9 * 1.4 * world.h + 1,
  'it lands a pixel or more past the end, so the story\'s observer sees it leave  (' + world.scrollY + ')');
dispatched.length = 0;
rootObserver().cb([{ target: root, isIntersecting: false }]);
eq(JSON.stringify(dispatched), '[{"type":"scroll","story":true,"body":false}]',
  'leaving, the story gives the page one scroll, after it has let the walker and the distance go');

console.log('\n=== unpinned, the links are the browser\'s ===\n');

world.scrollY = holdStart(3);
rootObserver().cb([{ target: root, isIntersecting: true }]);
fire('scroll');
frames();
turn(844, 390);
ok(!isPinned(), 'sideways, the story is stacked');
before = jumps();
ok(!click(railLinks[4]).defaultPrevented && !click(pill).defaultPrevented,
  'a rail dot or the pill jumps the browser\'s way to its stacked scene');
ok(!click(skip).defaultPrevented, 'so does the skip link');
dispatch(root, 'focusin', { target: inScene(2) });
eq(jumps(), before, 'and nothing the story does moves the reader, focus included');
eq(after.focused.length, 1, 'the skip link\'s focus is the browser\'s too');
turn(390, 844);
ok(isPinned(), 'upright again, the story pins');

console.log('\n=== an unpin lets the page catch up on the stacked page ===\n');

// No scene to keep and no distance past the end, so no scroll of the
// story's own follows: the one it gives the page is all there is.
world.scrollY = STORY_TOP - 400;   // the story's top in the window's lower half
rootObserver().cb([{ target: root, isIntersecting: true }]);
fire('scroll');
frames();
dispatched.length = 0;
turn(844, 390);
eq(JSON.stringify(dispatched), '[{"type":"scroll","story":false,"body":false}]',
  'sideways, the page\'s one scroll comes once the story is stacked');
turn(390, 844);

/* ---------- below the story ---------- */

console.log('\n=== past the story, a resize keeps the reader where they were ===\n');

// Pinned, the story is 12.6 screens of 100svh, so a window 80px shorter
// moves everything under it up by 1008px.
function storyEnd() { return storyTop() + (isPinned() ? 9 * 1.4 * world.h : 9 * STACKED_SCENE); }
turn(1440, 900);
world.scrollY = storyEnd() + 400;
fire('scroll');
frames();
rootObserver().cb([{ target: root, isIntersecting: false }]);
world.scrollY = storyEnd() + 600;   // reading on, in the Reliquary
fire('scroll');
const eventsBelow = tracked.length + demos;
turn(1440, 820);
ok(isPinned(), 'a window 80px shorter stays pinned');
eq(world.scrollY - storyEnd(), 600, 'and the reader is still 600px past the story\'s end');
eq(lastJump(), 'instant', 'by an instant jump');
turn(1440, 500);
ok(!isPinned(), 'a window 500px tall unpins');
eq(world.scrollY - storyEnd(), 600, 'stacked, the reader is still 600px past its end');
turn(1440, 900);
ok(isPinned(), '900px tall again, it pins');
eq(world.scrollY - storyEnd(), 600, 'and the reader is still 600px past its end');
eq(tracked.length + demos, eventsBelow, 'no end is counted and no demo plays on the way');

console.log('\n=== a browser that kept the reader in place is not second-guessed ===\n');

// Chrome on Android keeps a turned page's content in place before the
// resize event fires, so the scroll position then is already the new
// layout's: the story works from where the reader was before it.
let endWas = storyEnd();
world.w = 1180; world.h = 820; world.svh = 820;
world.scrollY += storyEnd() - endWas;
fire('resize');
eq(world.scrollY - storyEnd(), 600, 'a tablet turned keeps the reader 600px past the end, not moved again');

console.log('\n=== on the story\'s last screen, a resize keeps the reader there ===\n');

turn(1440, 900);
world.scrollY = storyEnd() - 300;   // the last scene above, the Reliquary below
rootObserver().cb([{ target: root, isIntersecting: true }]);
fire('scroll');
frames();
turn(1440, 820);
eq(world.scrollY - storyEnd(), -300, 'the story\'s end stays 300px above the window\'s top');
eq(tracked.length + demos, eventsBelow, 'and nothing is counted there');

/* ---------- links to a scene, followed on the page ---------- */

console.log('\n=== a link to a scene followed on the page lands on it ===\n');

win.location.hash = '#scene-3';
fire('hashchange');
eq(onStage(), 2, 'pinned, a change of address to #scene-3 puts scene 03 on stage');
eq(world.scrollY, holdStart(2), 'at its hold start');
eq(lastJump(), 'instant', 'at once');
before = jumps();
win.location.hash = '#after-walk-story';
fire('hashchange');
win.location.hash = '#scene-10';
fire('hashchange');
eq(jumps(), before, 'a link anywhere else, or to a scene that is not there, is the browser\'s');
turn(1440, 500);
before = jumps();
win.location.hash = '#scene-4';
fire('hashchange');
eq(jumps(), before, 'stacked, the browser\'s own jump finds the scene');
turn(1440, 820);

console.log('\n=== a modified click keeps its browser meaning ===\n');

before = jumps();
['metaKey', 'ctrlKey', 'shiftKey', 'altKey'].forEach(function (k) {
  const mods = {};
  mods[k] = true;
  ok(!click(railLinks[5], mods).defaultPrevented && !click(pill, mods).defaultPrevented,
    'with ' + k.replace('Key', '') + ' held, the rail and the pill open their scene the browser\'s way');
});
ok(!click(railLinks[5], { button: 1 }).defaultPrevented, 'as does a click that is not the main button');
eq(jumps(), before, 'and the story stays where it is');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
