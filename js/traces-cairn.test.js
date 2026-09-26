/* =============================================
   The traces cairn — the demo stone against a reader's own

   Run via:  node js/traces-cairn.test.js

   js/traces-cairn.js runs here against a fake page and a fake clock,
   one fresh copy per scenario, since its stone count lives in the
   script. The demo stone lands 600ms after it is asked for, and the
   walk story asks for it just as the reader settles on scene 06, the
   moment a tap is likeliest. A tap inside those 600ms counted its own
   stone and then the demo's, one nobody placed.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('./traces-glyphs.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}

const SRC = fs.readFileSync(path.join(__dirname, 'traces-cairn.js'), 'utf8');

function el(name) {
  const classes = new Set();
  return {
    name: name,
    on: {},
    style: { setProperty: function () {} },
    classList: {
      add: function (c) { classes.add(c); },
      remove: function (c) { classes.delete(c); },
      contains: function (c) { return classes.has(c); },
      toggle: function (c, force) { if (force) classes.add(c); else classes.delete(c); }
    },
    offsetWidth: 0,
    appendChild: function (child) { child.parentNode = this; return child; },
    removeChild: function (child) { child.parentNode = null; return child; },
    addEventListener: function (type, fn) { (this.on[type] = this.on[type] || []).push(fn); },
    closest: function () { return null; }
  };
}

// One page, one clock, one copy of the script.
function boot() {
  let now = 0, nextId = 0;
  const timers = new Map();
  function schedule(fn, ms, every) { timers.set(++nextId, { fn: fn, at: now + ms, every: every }); return nextId; }
  function cancel(id) { timers.delete(id); }
  const ids = { 'cairn-stack': el('stack'), 'cairn-under': el('under'), 'cairn-over': el('over'), 'cairn-counter': el('counter') };
  const observers = [];
  function FakeIO(cb) { this.cb = cb; observers.push(this); }
  FakeIO.prototype.observe = function () {};
  FakeIO.prototype.disconnect = function () {};
  function FakeAudio() { this.paused = true; }
  FakeAudio.prototype.play = function () { this.paused = false; return { catch: function () {} }; };
  FakeAudio.prototype.pause = function () { this.paused = true; };
  const win = {
    TracesGlyphs: G,
    matchMedia: function () { return { matches: false }; }
  };
  vm.runInNewContext(SRC, {
    window: win,
    document: {
      readyState: 'complete',
      getElementById: function (id) { return ids[id] || null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function (tag) { return el(tag); },
      addEventListener: function () {}
    },
    setTimeout: function (fn, ms) { return schedule(fn, ms || 0, 0); },
    clearTimeout: cancel,
    setInterval: function (fn, ms) { return schedule(fn, ms, ms); },
    clearInterval: cancel,
    IntersectionObserver: FakeIO,
    Audio: FakeAudio,
    getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; }
  });
  const stack = ids['cairn-stack'];
  return {
    demo: function () { win.TracesCairn.demo(); },
    tap: function () { (stack.on.click || []).forEach(function (fn) { fn(); }); },
    seen: function () { observers[0].cb([{ isIntersecting: true }]); },
    wait: function (ms) {
      const until = now + ms;
      for (;;) {
        let due = null, dueId = 0;
        timers.forEach(function (t, id) { if (t.at <= until && (!due || t.at < due.at)) { due = t; dueId = id; } });
        if (!due) break;
        now = due.at;
        if (due.every) due.at += due.every; else timers.delete(dueId);
        due.fn();
      }
      now = until;
    },
    counter: function () { return ids['cairn-counter'].textContent; }
  };
}

console.log('\n=== the demo stone ===\n');

let page = boot();
page.demo();
page.wait(599);
eq(page.counter(), undefined, 'asked for, the demo stone waits 600ms');
page.wait(1);
eq(page.counter(), '1 stone · faint', 'then settles on its own, as stone 1');
page.tap();
eq(page.counter(), '2 stones · faint', 'and a tap after it lays stone 2');

console.log('\n=== a reader\'s own stone wins over the demo ===\n');

page = boot();
page.demo();
page.wait(200);
page.tap();
eq(page.counter(), '1 stone · faint', 'a tap inside the demo\'s 600ms lays stone 1');
page.wait(1000);
eq(page.counter(), '1 stone · faint', 'and the demo lays no stone after it');

page = boot();
page.seen();
page.wait(300);
page.tap();
page.wait(1000);
eq(page.counter(), '1 stone · faint', 'the same when the cairn\'s own observer asked for the demo');

page = boot();
page.tap();
page.demo();
page.wait(1000);
eq(page.counter(), '1 stone · faint', 'a reader who has already laid a stone is shown no demo');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
