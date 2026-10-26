/* =============================================
   The path's line — wiring, driven through a fake page

   Run via:  node js/path-line-wiring.test.js

   js/path-line.js runs here against a hand-rolled page laid out as
   index.html is on a 1696 × 915 laptop: the hero's "begin walking", the
   two sections of words, and the walk story, whose stage is held at the
   top of the screen once it pins. Every check reads what the module wrote
   (the ink's path data, the scene part's opacity) and maps it back to the
   page, so a line that is built right but drawn nowhere fails here.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'path-line.js'), 'utf8');
const Core = require('./path-line-core.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

const W = 1696, H = 915;
const STORY_TOP = 2213, STORY_HEIGHT = 9 * 1.4 * H;
// The story's line, as its viewBox draws it at this size: scale 1.0167,
// centred 35px in. Scene 01's begins at (140, 830); the portrait one,
// shown at 720px and under, somewhere else entirely.
const SCALE = H / 900, LEFT = (W - 1600 * SCALE) / 2;
const TRAIL = [LEFT + 140 * SCALE, 830 * SCALE];
const TRAIL_PORTRAIT = [LEFT + 40 * SCALE, 440 * SCALE];

function rect(l, t, r, b) { return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; }

function boot(opts) {
  opts = opts || {};
  const pinned = opts.pinned !== false;
  const win = { scrollY: opts.scrollY || 0 };
  const listeners = {};
  const rafs = [];
  const observers = [];

  // The scene's box on screen: pinned, it stands at the story's top until
  // the pin and is held at the screen's top through the story.
  function sceneTopOnScreen() {
    if (!pinned) return STORY_TOP - win.scrollY;
    if (win.scrollY < STORY_TOP) return STORY_TOP - win.scrollY;
    if (win.scrollY > STORY_TOP + STORY_HEIGHT - H) return STORY_TOP + STORY_HEIGHT - H - win.scrollY;
    return 0;
  }
  function onPage(l, t, r, b) { return function () { return rect(l, t - win.scrollY, r, b - win.scrollY); }; }

  function el(tag, extra) {
    const e = {
      tagName: tag, attrs: {}, style: {}, children: [], parent: null,
      setAttribute: function (k, v) { this.attrs[k] = String(v); },
      getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild: function (c) { c.parent = this; this.children.push(c); return c; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      getBoundingClientRect: function () { return rect(0, 0, 0, 0); },
      classList: { list: [], contains: function (c) { return this.list.indexOf(c) !== -1; } }
    };
    return Object.assign(e, extra || {});
  }

  function storyLine(start, tilt) {
    return el('path', {
      getScreenCTM: function () { return { a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: sceneTopOnScreen() }; },
      getTotalLength: function () { return 190; },
      getPointAtLength: function (l) { return { x: (start[0] + l * tilt[0]) / SCALE, y: (start[1] + l * tilt[1]) / SCALE }; },
      strokeWidth: '2.25px'
    });
  }
  const landscape = storyLine(TRAIL, [0.997, -0.07]);
  const portrait = storyLine(TRAIL_PORTRAIT, [0.2, 0.98]);
  const copy = el('div', { getBoundingClientRect: function () { const t = sceneTopOnScreen(); return rect(193, t + 280, 754, t + 635); } });
  const scene = el('section', {
    getBoundingClientRect: function () { const t = sceneTopOnScreen(); return rect(0, t, W, t + H); },
    querySelector: function (sel) {
      if (sel === '.walk-story-line--landscape .ws-line') return landscape;
      if (sel === '.walk-story-line--portrait .ws-line') return portrait;
      if (sel === '.walk-story-copy') return copy;
      return null;
    }
  });
  const story = el('section', {
    getBoundingClientRect: onPage(0, STORY_TOP, W, STORY_TOP + STORY_HEIGHT),
    querySelector: function (sel) { return sel === '.walk-story-scene' ? scene : null; }
  });
  if (pinned) story.classList.list.push('walk-story--pinned');
  const hint = el('div', { getBoundingClientRect: onPage(804, 808, 892, 851) });
  const cols = [el('div', { getBoundingClientRect: onPage(488, 1075, 1208, 1615) }), el('div', { getBoundingClientRect: onPage(488, 1663, 1208, 2048) })];
  const main = el('main', { querySelectorAll: function (sel) { return sel === '.section-inner' ? cols : []; } });
  const walker = el('div', { getBoundingClientRect: function () { return rect(20, 0, 48, H); }, display: opts.walker === false ? 'none' : 'block' });
  const body = el('body');

  const sandbox = {
    console: console, Math: Math, Object: Object, Array: Array, String: String, parseFloat: parseFloat,
    innerHeight: H,
    get scrollY() { return win.scrollY; },
    scrollX: 0,
    matchMedia: function (q) {
      if (/reduce/.test(q)) return { matches: !!opts.reduced };
      if (/max-width: 720px/.test(q)) return { matches: !!opts.portrait };
      return { matches: false };
    },
    getComputedStyle: function (e) { return { strokeWidth: e.strokeWidth, display: e.display }; },
    requestAnimationFrame: function (fn) { rafs.push(fn); return rafs.length; },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    ResizeObserver: function (fn) { observers.push(fn); this.observe = function () {}; },
    document: {
      body: body,
      createElementNS: function (_, tag) { return el(tag); },
      getElementById: function (id) { return id === 'page-walker' ? walker : null; },
      querySelector: function (sel) {
        if (sel === '.hero .scroll-hint') return hint;
        if (sel === '.walk-story') return opts.noStory ? null : story;
        if (sel === 'main') return main;
        return null;
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.PathLineCore = Core;
  vm.runInNewContext(SRC, sandbox, { filename: 'path-line.js' });

  let clock = 0;
  function flush(max) {
    for (let k = 0; k < (max || 400) && rafs.length; k++) { clock += 16.667; rafs.shift()(clock); }
  }
  const pageSvg = body.children[0];
  const leadSvg = scene.children[0];
  return {
    listeners: listeners,
    pageSvg: pageSvg,
    leadSvg: leadSvg,
    page: function () { return pageSvg && pageSvg.children.filter(function (c) { return c.tagName === 'path'; })[0].attrs.d; },
    lead: function () { return leadSvg && leadSvg.children[0].attrs.d; },
    pageTop: function () { return parseFloat(pageSvg.style.top); },
    scroll: function (y, settle) {
      win.scrollY = y;
      (listeners.scroll || []).forEach(function (fn) { fn(); });
      if (settle !== false) flush();
    },
    resize: function () { (listeners.resize || []).forEach(function (fn) { fn(); }); flush(); },
    flush: flush
  };
}

function points(d) {
  if (!d) return [];
  return d.replace(/[MZ]/g, '').split('L').map(function (p) { return p.trim().split(' ').map(Number); });
}
function lowest(d) { return Math.max.apply(null, points(d).map(function (p) { return p[1]; })); }
function nearest(d, q) { return Math.min.apply(null, points(d).map(function (p) { return Math.hypot(p[0] - q[0], p[1] - q[1]); })); }

console.log('\n=== two lines of ink, one walk ===\n');

const page = boot();
ok(page.pageSvg && page.pageSvg.attrs['class'] === 'path-line' && page.pageSvg.attrs['aria-hidden'] === 'true', 'one SVG on the page, hidden from assistive tech');
ok(page.leadSvg && page.leadSvg.attrs['class'] === 'path-line path-line--lead', 'and one in the story\'s first scene, held with it when the story pins');
ok(page.page() === '' && page.lead() === '', 'at the top of the page nothing is drawn yet: the hero\'s foot is below the reading height');

page.scroll(1000);
const tip = 1000 + Core.LEAD * H;
ok(Math.abs(lowest(page.page()) + page.pageTop() - tip) < 2, 'scrolled down, the ink reaches ' + Core.LEAD + ' of the screen (' + (lowest(page.page()) + page.pageTop()).toFixed(1) + ' vs ' + tip.toFixed(1) + ')');
ok(nearest(page.page(), [848 - 0, 857 - page.pageTop()]) < 6, 'and begins at the path\'s mouth, under "begin walking"');
ok(page.lead() === '', 'the scene\'s part waits for the ink to reach the story');

console.log('\n=== it glides, as the story does ===\n');

const glide = boot();
glide.scroll(1000, false);
glide.flush(3);
const first = lowest(glide.page()) + glide.pageTop();
ok(first > 857 && first < tip - 50, 'a few frames after a wheel step the tip has moved only part of the way');
glide.flush();
ok(Math.abs(lowest(glide.page()) + glide.pageTop() - tip) < 2, 'and settles where the scroll is');

console.log('\n=== arriving at the trailhead ===\n');

page.scroll(STORY_TOP);
ok(Math.abs(lowest(page.page()) + page.pageTop() - STORY_TOP) < 0.2, 'as the story pins, the page\'s part runs whole to the story\'s top and ends there');
ok(nearest(page.lead(), TRAIL) < 2.5, 'and the scene\'s part reaches the walker waiting at the trailhead');
ok(page.leadSvg.style.opacity === 1, 'whole, at full ink');
const atPin = page.lead();

page.scroll(STORY_TOP + 0.3 * H);
ok(page.lead() === atPin, 'past the pin it stays arrived: the held scene holds it in place');
ok(page.leadSvg.style.opacity > 0 && page.leadSvg.style.opacity < 1, 'and as the walk sets out, the way down begins to fade');
page.scroll(STORY_TOP + 0.6 * H);
ok(page.leadSvg.style.opacity === 0, 'gone within the first steps of the story');

page.resize();
page.scroll(STORY_TOP);
ok(page.lead() === atPin, 'measured again in the middle of the pin, the route is the same one (the held scene\'s box is not the story\'s top)');

console.log('\n=== still, stacked, and absent ===\n');

const still = boot({ reduced: true, pinned: false });
ok(lowest(still.page()) + still.pageTop() > STORY_TOP - 0.2 && nearest(still.lead(), TRAIL) < 2.5, 'with reduced motion the line is drawn whole at once, into the scene\'s line');
ok(!still.listeners.scroll, 'and nothing listens to the scroll');
ok(still.leadSvg.style.opacity === '', 'nor fades');

const stacked = boot({ pinned: false });
stacked.scroll(STORY_TOP + 600);
ok(nearest(stacked.lead(), TRAIL) < 2.5, 'stacked, the scene\'s part is drawn in the scene\'s own box');
ok(stacked.leadSvg.style.opacity === '', 'and scrolls away with it instead of fading');

const narrow = boot({ portrait: true });
narrow.scroll(STORY_TOP);
ok(nearest(narrow.lead(), TRAIL_PORTRAIT) < 2.5 && nearest(narrow.lead(), TRAIL) > 50, 'at 720px and under it arrives where the portrait line begins');

let threw = null;
try { boot({ noStory: true }); } catch (e) { threw = e; }
ok(!threw, 'a page without the story is left alone');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
