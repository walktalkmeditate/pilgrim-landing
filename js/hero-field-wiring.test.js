/* =============================================
   The field — wiring, driven through a fake browser

   Run via:  node js/hero-field-wiring.test.js

   js/hero-field.js runs here against a hand-rolled browser and a WebGL
   context that records what it is asked to draw. The context also does
   the one check a real driver does that silently cost the field its
   first load in development: a uniform declared in both shaders of a
   program must carry the same precision, or the program fails to link
   and the hero quietly falls back to plain parchment. Every uniform the
   module sets must also be one a shader declares — a misspelt name gets
   a null location, and WebGL ignores writes to null without a word.

   What it proves is order and wiring — a loop that runs only when the
   hero can be seen, one still painting under reduced motion, nothing at
   all without WebGL — not Chrome's frame times or the painting's look.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'hero-field.js'), 'utf8');
const Core = require('./hero-field-core.js');
const Moon = require('./moon.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

/* ---------- a recording WebGL context ---------- */

// A GPU without fragment highp takes the #else branch of the preamble.
function uniformsOf(src, noHighp) {
  src = noHighp
    ? src.replace(/#ifdef GL_FRAGMENT_PRECISION_HIGH[\s\S]*?#else/, '')
    : src.replace(/#else[\s\S]*?#endif/, '');
  const def = (/precision\s+(lowp|mediump|highp)\s+float/.exec(src) || [])[1];
  const out = {};
  const re = /uniform\s+(?:(lowp|mediump|highp)\s+)?\w+\s+(\w+)/g;
  let m;
  while ((m = re.exec(src)) !== null) out[m[2]] = m[1] || def;
  return out;
}

function fakeGl(opts) {
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8, TRIANGLE_STRIP: 9,
    BLEND: 10, ONE: 11, ONE_MINUS_SRC_ALPHA: 12, COLOR_BUFFER_BIT: 13,
    draws: [], nullWrites: [], uploads: [], values: {}, current: null, linkErrors: []
  };
  gl.createShader = function (type) { return { type: type, src: '' }; };
  gl.shaderSource = function (s, src) { s.src = src; };
  gl.compileShader = function () {};
  gl.getShaderParameter = function () { return !opts.failCompile; };
  gl.getShaderInfoLog = function () { return 'fake compile error'; };
  gl.createProgram = function () { return { shaders: [], linked: false }; };
  gl.attachShader = function (p, s) { p.shaders.push(s); };
  gl.linkProgram = function (p) {
    const vs = p.shaders.filter(function (s) { return s.type === 1; })[0];
    const fs2 = p.shaders.filter(function (s) { return s.type === 2; })[0];
    const vu = uniformsOf(vs.src, opts.noHighp);
    const fu = uniformsOf(fs2.src, opts.noHighp);
    if (!/precision/.test(vs.src)) Object.keys(vu).forEach(function (k) { vu[k] = vu[k] || 'highp'; });
    p.uniforms = Object.assign({}, vu, fu);
    p.linked = Object.keys(vu).every(function (k) {
      if (!(k in fu) || vu[k] === fu[k]) return true;
      gl.linkErrors.push(k + ': ' + vu[k] + ' vs ' + fu[k]);
      return false;
    });
  };
  gl.getProgramParameter = function (p) { return p.linked; };
  gl.getProgramInfoLog = function () { return gl.linkErrors.join('; '); };
  gl.getUniformLocation = function (p, name) { return name in p.uniforms ? { name: name } : null; };
  gl.getAttribLocation = function (p, name) {
    return p.shaders[0].src.indexOf('attribute vec') !== -1 && p.shaders[0].src.indexOf(' ' + name + ';') !== -1 ? name.length : -1;
  };
  ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform2fv', 'uniform3fv', 'uniform4fv'].forEach(function (fn) {
    gl[fn] = function (loc) {
      if (!loc) { gl.nullWrites.push(fn); return; }
      gl.values[loc.name] = Array.prototype.slice.call(arguments, 1);
    };
  });
  gl.useProgram = function (p) { gl.current = p; };
  gl.createBuffer = function () { return {}; };
  gl.bindBuffer = function () {};
  gl.bufferData = function (_target, data) { gl.uploads.push(data.length); };
  ['enableVertexAttribArray', 'disableVertexAttribArray', 'vertexAttribPointer', 'vertexAttribDivisor',
    'viewport', 'clearColor', 'clear', 'enable', 'blendFunc'].forEach(function (fn) { gl[fn] = function () {}; });
  gl.drawArrays = function () { gl.draws.push('sky'); };
  gl.drawArraysInstanced = function (_mode, _first, _count, instances) { gl.draws.push('blades:' + instances); };
  gl.getExtension = function () { return null; };
  return gl;
}

/* ---------- a fake browser ---------- */

function boot(opts) {
  opts = opts || {};
  const rafs = [];
  const timers = [];
  const io = [];
  const mos = [];
  const warnings = [];
  const winOn = {};
  const docOn = {};
  let gl = null;

  function classes(initial) {
    const set = new Set(initial || []);
    return {
      contains: function (c) { return set.has(c); },
      add: function (c) { set.add(c); },
      remove: function (c) { set.delete(c); }
    };
  }

  const canvas = {
    width: 0, height: 0, attrs: {}, on: {}, classList: classes(),
    setAttribute: function (k, v) { this.attrs[k] = v; },
    addEventListener: function (t, fn) { this.on[t] = fn; },
    getContext: function (type) {
      if (opts.noGl) return null;
      if (type !== 'webgl2') return null;
      gl = fakeGl(opts);
      return gl;
    }
  };

  const quotes = { offsetTop: 380, offsetHeight: 43 };
  const hero = {
    clientWidth: 1440, clientHeight: 900, firstChild: { name: 'logo' }, children: [], on: {},
    querySelector: function (sel) { return sel === '.hero-quotes' ? quotes : null; },
    getAttribute: function () { return null; },
    insertBefore: function (child) { this.children.push(child); },
    addEventListener: function (t, fn) { this.on[t] = fn; },
    getBoundingClientRect: function () { return { top: -sandbox.scrollY }; }
  };

  const html = { attrs: { 'data-theme': opts.theme || 'light' }, getAttribute: function (k) { return this.attrs[k] || null; } };

  const sandbox = {
    HeroFieldCore: Core,
    Moon: Moon,
    SeasonalEngine: { getCurrentSeason: function () { return 'autumn'; } },
    devicePixelRatio: 2,
    scrollY: 0,
    navigator: { hardwareConcurrency: 8 },
    console: { warn: function (e) { warnings.push(String(e)); }, log: function () {} },
    performance: { now: function () { return sandbox.clock; } },
    clock: 0,
    matchMedia: function (q) {
      return { matches: /reduce/.test(q) ? !!opts.reduced : /fine/.test(q) };
    },
    getComputedStyle: function () {
      return {
        color: 'rgb(199, 161, 79)',
        getPropertyValue: function (k) { return k === '--parchment' ? (opts.theme === 'dark' ? '#1C1914' : '#F5F0E8') : (opts.theme === 'dark' ? '#F0EBE1' : '#2C241E'); }
      };
    },
    requestAnimationFrame: function (fn) { rafs.push(fn); return rafs.length; },
    cancelAnimationFrame: function () {},
    setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; },
    setInterval: function () { return 0; },
    addEventListener: function (t, fn) { (winOn[t] = winOn[t] || []).push(fn); },
    IntersectionObserver: function (cb) { io.push(cb); this.observe = function () {}; },
    MutationObserver: function (cb) { const o = { cb: cb, target: null }; mos.push(o); this.observe = function (t) { o.target = t; }; },
    Date: Date,
    Math: Math,
    Float32Array: Float32Array,
    Error: Error,
    document: {
      hidden: false,
      documentElement: html,
      body: { classList: classes(opts.star ? ['constellation'] : []) },
      querySelector: function (sel) { return sel === '.hero' ? hero : null; },
      createElement: function () { return canvas; },
      addEventListener: function (t, fn) { docOn[t] = fn; }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SRC, sandbox, { filename: 'hero-field.js' });

  return {
    sandbox: sandbox, hero: hero, canvas: canvas, quotes: quotes, html: html,
    gl: function () { return gl; },
    warnings: warnings, timers: timers, mos: mos, winOn: winOn, docOn: docOn,
    pendingFrames: function () { return rafs.length; },
    // Run every queued frame once, at `ms` past the start.
    frame: function (ms) {
      sandbox.clock = ms;
      const queue = rafs.splice(0, rafs.length);
      queue.forEach(function (fn) { fn(ms); });
      return queue.length;
    },
    seen: function (yes) { io.forEach(function (cb) { cb([{ isIntersecting: yes }]); }); }
  };
}

function bladeDraws(gl) { return gl.draws.filter(function (d) { return d.indexOf('blades') === 0; }); }

/* ---------- the page ---------- */

console.log('\n=== index.html loads the field, and only index.html ===\n');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const coreTag = html.match(/<script[^>]*src="js\/hero-field-core\.js"[^>]*>/);
const domTag = html.match(/<script[^>]*src="js\/hero-field\.js"[^>]*>/);
ok(coreTag && /\bdefer\b/.test(coreTag[0]), 'js/hero-field-core.js is loaded, deferred');
ok(domTag && /\bdefer\b/.test(domTag[0]), 'js/hero-field.js is loaded, deferred');
ok(coreTag && domTag && html.indexOf(coreTag[0]) < html.indexOf(domTag[0]), 'the core loads before the module that reads it');
ok(html.indexOf('src="js/moon.js"') < html.indexOf(domTag[0]), 'moon.js (the one moon) loads before the field asks it for the phase');
ok(/<link[^>]*href="css\/hero-field\.css"/.test(html), 'css/hero-field.css is linked');
ok(html.indexOf('class="particles"') === -1, 'the floating dots are gone from the hero');

const elsewhere = fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f) && f !== 'index.html'; })
  .concat(['sunpath/index.html', 'moonpath/index.html', 'daylight/index.html'])
  .filter(function (f) { return /hero-field/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
ok(elsewhere.length === 0, 'no other page carries the field\'s weight' + (elsewhere.length ? ' — ' + elsewhere.join(', ') : ''));

const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8') + fs.readFileSync(path.join(ROOT, 'css', 'animations.css'), 'utf8');
ok(!/initParticles|particle/.test(main), 'js/main.js no longer makes dots for every page that loads it');
ok(!/\.particles?\b/.test(css), 'and the shared stylesheets no longer style them');

Object.keys(Core.SEASON_COLORS).forEach(function (season) {
  const c = Core.SEASON_COLORS[season];
  ok(html.indexOf(c.stem) !== -1 && html.indexOf(c.plume) !== -1,
    season + '\'s stem and plume are colours the Seasons section itself shows');
});

/* ---------- the module ---------- */

console.log('\n=== a visitor who sees motion ===\n');

let w = boot();
let gl = w.gl();
ok(w.hero.children[0] === w.canvas, 'the canvas is laid into the hero');
ok(w.canvas.attrs['aria-hidden'] === 'true', 'and hidden from assistive tech — it is a painting, not content');
ok(gl.linkErrors.length === 0, 'both programs link: shared uniforms agree on precision' + (gl.linkErrors.length ? ' — ' + gl.linkErrors.join(', ') : ''));
ok(w.pendingFrames() === 1, 'one frame is asked for, to fade the canvas in');
w.frame(16);
ok(w.canvas.classList.contains('is-ready'), 'which it does');
ok(bladeDraws(gl).length === 0, 'nothing is drawn before the hero is known to be on screen');

w.seen(true);
w.frame(100);
const expected = Core.bladeBudget(1440, 900, { cores: 8 });
ok(bladeDraws(gl)[0] === 'blades:' + expected, 'on screen, a frame paints the sky and ' + expected + ' blades in one instanced draw');
ok(gl.draws[0] === 'sky', 'the sky first, under the grass');
ok(gl.nullWrites.length === 0, 'every uniform it sets is one a shader declares' + (gl.nullWrites.length ? ' — ' + gl.nullWrites.length + ' writes to nowhere' : ''));
ok(w.pendingFrames() === 1, 'and the loop asks for the next');

w.frame(116);
w.seen(false);
const n = gl.draws.length;
w.frame(132);
ok(w.pendingFrames() === 0 && gl.draws.length === n, 'scrolled out of view, the loop stops and draws nothing more');

w.seen(true);
w.sandbox.document.hidden = true;
w.docOn.visibilitychange();
w.frame(148);
ok(w.pendingFrames() === 0, 'in a hidden tab it stops too');
w.sandbox.document.hidden = false;
w.docOn.visibilitychange();
ok(w.pendingFrames() === 1, 'and comes back with the tab');

const lowp = boot({ noHighp: true });
ok(lowp.gl().linkErrors.length === 0 && lowp.hero.children.length === 1,
  'on a GPU without fragment highp, both programs still link' + (lowp.gl().linkErrors.length ? ' — ' + lowp.gl().linkErrors.join(', ') : ''));

console.log('\n=== the walk, the wind, the whisper ===\n');

w.sandbox.scrollY = 450;
w.winOn.scroll.forEach(function (fn) { fn(); });
for (let t = 200; t < 2200; t += 16) w.frame(t);
const walked = gl.values.uWalk[0];
ok(Math.abs(walked - Core.WALK_METRES / 2) < 0.01, 'half the hero scrolled is half the walk  (' + walked.toFixed(3) + ' m)');
w.sandbox.scrollY = 0;
w.winOn.scroll.forEach(function (fn) { fn(); });
for (let t = 2200; t < 4200; t += 16) w.frame(t);
ok(gl.values.uWalk[0] < 0.01, 'and scrolling back walks you back');

function strongest() {
  const a = gl.values.uPuff[0];
  let m = 0;
  for (let i = 2; i < a.length; i += 4) m = Math.max(m, a[i]);
  return m;
}
function move(type, x, y, ms) {
  w.sandbox.clock = ms;
  w.hero.on.pointermove({ pointerType: type, clientX: x, clientY: y });
}
function settle(from, to) { for (let t = from; t < to; t += 16) w.frame(t); }

move('mouse', 500, 820, 4200); move('mouse', 520, 820, 4250); w.frame(4266);
const breath = strongest();
settle(4300, 8000);
ok(strongest() === 0, 'a still cursor is still air: its gust dies away');
move('mouse', 400, 820, 8000); move('mouse', 700, 820, 8050); w.frame(8066);
const flick = strongest();
ok(flick > 0.8, 'a flick across the grass is a gust  (' + flick.toFixed(2) + ')');
ok(breath > 0 && breath < flick / 3, 'a slow drift only breathes on it  (' + breath.toFixed(2) + ')');
ok(gl.values.uPuffV[0][0] > 0, 'and it blows the way the cursor went');
settle(8100, 12000);
move('mouse', 400, 200, 12000); move('mouse', 800, 200, 12050); w.frame(12066);
ok(strongest() === 0, 'a cursor moving through the sky stirs no grass');
move('touch', 400, 820, 12100); move('touch', 700, 820, 12150); w.frame(12166);
ok(strongest() === 0, 'a finger dragging on a phone does not stroke the grass — its wind comes from the scroll');
w.sandbox.clock = 12300; w.sandbox.scrollY = 0; w.winOn.scroll.forEach(function (fn) { fn(); });
w.sandbox.clock = 12400; w.sandbox.scrollY = 120; w.winOn.scroll.forEach(function (fn) { fn(); });
w.frame(12416);
ok(Array.prototype.some.call(gl.values.uPuffV[0], function (v, i) { return i % 4 === 1 && v > 0; }),
  'scrolling down sends a gust away from you, up the path');
w.sandbox.scrollY = 0; w.winOn.scroll.forEach(function (fn) { fn(); });
settle(12500, 16000);
w.hero.on.pointerdown({ pointerType: 'touch', clientX: 720, clientY: 820 });
w.frame(16016);
ok(Array.prototype.some.call(gl.values.uRing[0], function (v, i) { return i % 4 === 3 && v === 1; }), 'a tap sends a ring of wind out through the grass');

const quoteMo = w.mos.filter(function (o) { return o.target === w.quotes; })[0];
const whisper = { classList: { contains: function (c) { return c === 'active'; } } };
quoteMo.cb([{ target: whisper }]);
for (let t = 16100; t < 17100; t += 16) w.frame(t);
ok(gl.values.uFront[1] > 0.9, 'a new whisper arrives on a gust across the field');
const sheen = gl.values.uSheen[0];
const plain = Core.sheenFor(Core.skyBodies(new Date(), Moon.getMoonPhase(new Date()))).rgb;
ok(Math.abs(sheen[0] - plain[0]) + Math.abs(sheen[2] - plain[2]) > 0.05, 'and the gust carries the whisper\'s own colour');

console.log('\n=== a visitor who asked for less motion ===\n');

w = boot({ reduced: true });
gl = w.gl();
ok(w.hero.children[0] === w.canvas, 'the painting is still there');
ok(bladeDraws(gl).length === 1, 'painted once, at load');
w.frame(16);
w.seen(true);
ok(w.pendingFrames() === 0, 'and no loop starts, on screen or off');
ok(!w.hero.on.pointermove && !w.hero.on.pointerdown, 'the grass does not answer the cursor');
w.html.attrs['data-theme'] = 'dark';
w.mos.filter(function (o) { return o.target === w.html; })[0].cb([]);
ok(bladeDraws(gl).length === 2 && w.pendingFrames() === 0, 'a theme change repaints the still once, without a loop');
ok(w.timers.length === 0, 'and no first gust is scheduled');

console.log('\n=== star mode ===\n');

w = boot({ star: true, theme: 'dark' });
w.seen(true);
w.frame(16); w.frame(32);
gl = w.gl();
ok(gl.values.uSkyAlpha[0] === 0, 'the sky is left clear for the starfield behind it');
ok(gl.values.uBg[0].every(function (v) { return v === 0; }), 'and the field fades out to nothing, not to paper');

console.log('\n=== without WebGL ===\n');

w = boot({ noGl: true });
ok(w.hero.children.length === 0, 'no WebGL: no canvas, the plain hero it always was');
w = boot({ failCompile: true });
ok(w.hero.children.length === 0, 'a shader that will not compile: no canvas either');
ok(w.warnings.length === 1 && /hero-field shader/.test(w.warnings[0]), 'and the reason goes to the console, not nowhere');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
