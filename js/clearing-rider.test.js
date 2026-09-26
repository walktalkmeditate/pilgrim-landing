/* =============================================
   Hidden clearing — the rider's frame, driven through a fake browser

   Run via:  node js/clearing-rider.test.js

   The door is scene 05's form, on the walk story's pinned stage, and the
   story writes every frame while it is pinned. Chrome's trace at 4x
   throttle blamed the rider's frame, which read the door's rect every
   frame, for a forced layout on nearly every scroll through the story.
   Now the rider reads nothing above or inside the story; after it, it
   reads the fog (and, once per viewport size, itself) before it writes.

   A hand-rolled browser, as in js/walk-story-wiring.test.js: this proves
   which reads happen and in what order, not Chrome's frame times.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const core = require('./clearing-core.js');

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

const world = { w: 1440, h: 900, scrollY: 0 };
const log = [];
const listeners = {};
const observers = [];
let rafs = [];

function classList(owner) {
  const set = new Set();
  return {
    contains: function (c) { return set.has(c); },
    add: function (c) { if (!set.has(c)) log.push({ kind: 'write', what: owner + '+' + c }); set.add(c); },
    remove: function (c) { if (set.has(c)) log.push({ kind: 'write', what: owner + '-' + c }); set.delete(c); },
    toggle: function (c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on !== set.has(c)) log.push({ kind: 'write', what: owner + ' toggles ' + c });
      if (on) set.add(c); else set.delete(c);
      return on;
    }
  };
}

function el(name, docTop) {
  const children = {};
  return {
    name: name,
    classList: classList(name),
    style: new Proxy({}, { set: function (t, k, v) { log.push({ kind: 'write', what: name + '.' + String(k) }); t[k] = v; return true; } }),
    on: {},
    setAttribute: function () {},
    addEventListener: function (type, fn) { (this.on[type] = this.on[type] || []).push(fn); },
    appendChild: function (c) { return c; },
    querySelector: function (sel) { return children[sel] || (children[sel] = el(name + ' ' + sel)); },
    querySelectorAll: function () { return []; },
    getBoundingClientRect: function () {
      log.push({ kind: 'read', what: name });
      const top = docTop === undefined ? world.h / 2 - 14 : docTop - world.scrollY;
      return { top: top, bottom: top + 28, left: world.w - 48, right: world.w - 20, width: 28, height: 28 };
    }
  };
}

const door = el('door', 6000);
const host = el('reliquary', 14000);
let created = [];
function FakeIO(cb, opts) { this.cb = cb; this.opts = opts || {}; this.targets = []; observers.push(this); }
FakeIO.prototype.observe = function (t) { this.targets.push(t); };
FakeIO.prototype.disconnect = function () { this.targets = []; };

const doc = {
  readyState: 'complete',
  body: Object.assign(el('body'), { classList: classList('body') }),
  querySelector: function (sel) {
    if (sel === '[data-seek-door]') return door;
    if (sel === '.reliquary.section') return host;
    return null;
  },
  createElement: function (tag) {
    const e = el(tag === 'button' ? 'fog' : tag === 'div' ? 'rider' : tag, tag === 'button' ? 14300 : undefined);
    created.push(e);
    return e;
  }
};
const win = {
  ClearingCore: core,
  IntersectionObserver: FakeIO,
  matchMedia: function () { return { matches: false }; },
  get innerWidth() { return world.w; },
  get innerHeight() { log.push({ kind: 'read', what: 'innerHeight' }); return world.h; },
  addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener: function () {},
  requestAnimationFrame: function (fn) { rafs.push(fn); return rafs.length; }
};

function frame() {
  const due = rafs;
  rafs = [];
  const start = log.length;
  due.forEach(function (fn) { fn(); });
  return log.slice(start);
}
function fire(type) { (listeners[type] || []).forEach(function (fn) { fn(); }); }
function doorObserver() { return observers.filter(function (o) { return o.targets.indexOf(door) !== -1; })[0]; }
// The door's model position agrees with what its observer reports.
function doorAt(passed) {
  world.scrollY = passed ? 7000 : 1200;
  const io = doorObserver();
  if (io) io.cb([{ target: door, isIntersecting: !passed, boundingClientRect: { bottom: passed ? -972 : 4828 } }]);
}
function reads(entries, what) { return entries.filter(function (e) { return e.kind === 'read' && (!what || e.what === what); }).length; }

vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'clearing.js'), 'utf8'), {
  window: win, document: doc, IntersectionObserver: FakeIO,
  setTimeout: function () { return 1; }, clearTimeout: function () {}
});
const rider = created.filter(function (e) { return e.name === 'rider'; })[0];

/* ---------- the rider's frame ---------- */

console.log('\n=== above the story and inside it, the rider reads nothing ===\n');

ok(doorObserver() && /^0px 0px \d{6,}px 0px$/.test(doorObserver().opts.rootMargin),
  'an observer whose root runs from the viewport\'s top edge down watches the door');
frame();
doorAt(false);
fire('scroll');
let f = frame();
eq(reads(f), 0, 'in the hero, with the door below the viewport, a scroll reads no layout');
ok(!rider.classList.contains('is-riding'), 'and the crescent waits');

doc.body.classList.add('walk-story-pinned');
world.scrollY = 5500;   // the door on the pinned stage, in view
fire('scroll');
f = frame();
eq(reads(f), 0, 'inside the pinned story, a scroll reads no layout');
doorAt(true);
f = frame();
eq(reads(f), 0, 'nor once the door has passed while the story is still on screen');
ok(!rider.classList.contains('is-riding'), 'and the crescent waits for the story to end');

console.log('\n=== after the story, reads come before writes ===\n');

doc.body.classList.remove('walk-story-pinned');
world.scrollY = 13600;
fire('scroll');
f = frame();
ok(rider.classList.contains('is-riding'), 'below the story the crescent rides');
eq(reads(f, 'fog'), 1, 'it reads the fog once');
eq(reads(f, 'door'), 0, 'and never the door');
const lastRead = f.map(function (e) { return e.kind; }).lastIndexOf('read');
const firstWrite = f.map(function (e) { return e.kind; }).indexOf('write');
ok(firstWrite !== -1 && lastRead < firstWrite, 'every read in the frame comes before its first write');
fire('scroll');
f = frame();
eq(reads(f, 'rider'), 0, 'the rider, fixed to the viewport, is not measured again while the viewport keeps its size');
world.w = 1024; world.h = 768;
fire('resize');
f = frame();
eq(reads(f, 'rider'), 1, 'a resize measures it once more');

console.log('\n=== back above the door, the crescent stops ===\n');

doorAt(false);
f = frame();
ok(!rider.classList.contains('is-riding'), 'the door back in view, the crescent stops riding');
eq(reads(f), 0, 'and reads nothing to know it');

console.log('\n=== revealed, the clearing stops watching the door ===\n');

const doorWatch = observers.filter(function (o) { return /^0px 0px \d{6,}px 0px$/.test(o.opts.rootMargin || ''); })[0];
const fog = created.filter(function (e) { return e.name === 'fog'; })[0];
eq(doorWatch.targets.length, 1, 'until then the door is watched');
(fog.on.click || []).forEach(function (fn) { fn(); });
ok(fog.classList.contains('is-revealed'), 'a tap on the fog reveals the clearing');
eq(doorWatch.targets.length, 0, 'and the door\'s observer is disconnected with it');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (x) { console.log('  ✗ ' + x); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
