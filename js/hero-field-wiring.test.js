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
  gl.DYNAMIC_DRAW = 14;
  ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform2fv', 'uniform3fv', 'uniform4fv'].forEach(function (fn) {
    gl[fn] = function (loc) {
      if (!loc) { gl.nullWrites.push(fn); return; }
      gl.values[loc.name] = Array.prototype.slice.call(arguments, 1);
    };
  });
  gl.useProgram = function (p) { gl.current = p; };
  gl.createBuffer = function () { return {}; };
  gl.bindBuffer = function () {};
  gl.bufferData = function (_target, data) { gl.uploads.push(typeof data === 'number' ? data : data.length); };
  gl.bufferSubData = function (_target, _offset, data) { gl.lastSubData = Array.prototype.slice.call(data); };
  ['enableVertexAttribArray', 'disableVertexAttribArray', 'vertexAttribPointer', 'vertexAttribDivisor',
    'viewport', 'clearColor', 'clear', 'enable', 'blendFunc'].forEach(function (fn) { gl[fn] = function () {}; });
  gl.drawArrays = function () { gl.draws.push('sky'); };
  gl.drawArraysInstanced = function (_mode, _first, _count, instances) {
    const isDrift = gl.current.shaders[0].src.indexOf('attribute vec4 aP;') !== -1;
    const kindNow = isDrift && gl.values.uKind ? gl.values.uKind[0] : -1;
    gl.draws.push((kindNow === 3 ? 'lantern:' : kindNow === 4 ? 'geese:' : isDrift ? 'drift:' : 'blades:') + instances);
  };
  gl.getExtension = function () { return null; };
  return gl;
}

/* ---------- a fake browser ---------- */

// The sky is read from new Date(); a held clock fixes the hour.
function heldDate(at) {
  const ms = new Date(at).getTime();
  function Held(a, b, c, d, e, f, g) {
    if (arguments.length === 0) return new Date(ms);
    if (arguments.length === 1) return new Date(a);
    return new Date(a, b, c === undefined ? 1 : c, d || 0, e || 0, f || 0, g || 0);
  }
  Held.now = function () { return ms; };
  Held.prototype = Date.prototype;
  return Held;
}

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

  const quotes = { getBoundingClientRect: function () { return { bottom: 423 - sandbox.scrollY }; }, querySelectorAll: function () { return []; } };
  const hero = {
    clientWidth: 1440, clientHeight: 900, firstChild: { name: 'logo' }, children: [], on: {},
    querySelector: function (sel) { return sel === '.hero-quotes' ? quotes : null; },
    getAttribute: function () { return null; },
    insertBefore: function (child) { this.children.push(child); },
    addEventListener: function (t, fn) { this.on[t] = fn; },
    getBoundingClientRect: function () { return { top: -sandbox.scrollY }; }
  };

  const echo = { hidden: true, attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; } };
  const echoKanji = { textContent: '' };
  const echoText = { textContent: '' };
  const byId = { 'turning-echo': echo, 'turning-echo-kanji': echoKanji, 'turning-echo-text': echoText };

  const html = { attrs: { 'data-theme': opts.theme || 'light' }, getAttribute: function (k) { return this.attrs[k] || null; } };

  const sandbox = {
    HeroFieldCore: Core,
    PilgrimWalkers: opts.walkers,
    localStorage: opts.storage,
    Moon: Moon,
    SeasonalEngine: { getCurrentSeason: function () { return opts.season || 'autumn'; } },
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
        color: 'rgb(44, 36, 30)',
        getPropertyValue: function (k) {
          if (k === '--energy') return ' #C7A14F';
          return k === '--parchment' ? (opts.theme === 'dark' ? '#1C1914' : '#F5F0E8') : (opts.theme === 'dark' ? '#F0EBE1' : '#2C241E');
        }
      };
    },
    requestAnimationFrame: function (fn) { rafs.push(fn); return rafs.length; },
    cancelAnimationFrame: function () {},
    setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; },
    setInterval: function () { return 0; },
    addEventListener: function (t, fn) { (winOn[t] = winOn[t] || []).push(fn); },
    IntersectionObserver: function (cb) { io.push(cb); this.observe = function () {}; },
    MutationObserver: function (cb) { const o = { cb: cb, target: null }; mos.push(o); this.observe = function (t) { o.target = t; }; },
    Date: opts.at ? heldDate(opts.at) : Date,
    Math: opts.random ? Object.assign(Object.create(Math), { random: opts.random }) : Math,
    Float32Array: Float32Array,
    Error: Error,
    document: {
      hidden: false,
      documentElement: html,
      body: { classList: classes(opts.star ? ['constellation'] : []) },
      querySelector: function (sel) { return sel === '.hero' ? hero : null; },
      getElementById: function (id) { return byId[id] || null; },
      createElement: function () { return canvas; },
      addEventListener: function (t, fn) { docOn[t] = fn; }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SRC, sandbox, { filename: 'hero-field.js' });

  return {
    sandbox: sandbox, hero: hero, canvas: canvas, quotes: quotes, html: html, echo: echo, echoText: echoText,
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

console.log('\n=== the inscription and its seal ===\n');

const heroHtml = html.slice(html.indexOf('<header class="hero'), html.indexOf('</header>'));
const fieldCss = fs.readFileSync(path.join(ROOT, 'css', 'hero-field.css'), 'utf8');
function rule(sel) {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = fieldCss.match(new RegExp('(^|\\n)' + escaped + '\\s*\\{([^}]*)\\}'));
  return m ? m[2] : null;
}
ok(/<h1 class="hero-title">Pilgrim<\/h1>/.test(heroHtml), 'the heading still says Pilgrim, and nothing else');
ok(heroHtml.indexOf('pilgrim-logo.png') === -1 && heroHtml.indexOf('hero-logo') === -1, 'the app-icon tile is gone from the hero');
const seal = heroHtml.match(/<svg class="hero-seal"[^>]*>/);
ok(seal && /aria-hidden="true"/.test(seal[0]) && /focusable="false"/.test(seal[0]), 'the seal is decoration: hidden from assistive tech and from focus');
ok(/mask="url\(#hero-seal-cut\)"/.test(heroHtml) && /id="hero-seal-cut"/.test(heroHtml), 'the mark is cut out of the seal, not drawn on it');
const tagline = rule('.hero .hero-tagline');
ok(tagline && /color:\s*var\(--ink-fog\)/.test(tagline) && !/opacity/.test(tagline),
  '.hero .hero-tagline is --ink-fog at full opacity, the colour the sky\'s wash is proved readable for');
const whisperRule = rule('.hero .hero-quotes .hero-quote[data-category]');
ok(whisperRule && /color:\s*var\(--ink\)/.test(whisperRule) && !/opacity/.test(whisperRule),
  'the whisper is in ink at full opacity, which leaves room for its energy behind it');
const aura = rule('.hero .hero-quotes .hero-quote[data-category]::before');
const auraLight = /--aura:\s*([\d.]+)/.exec(rule('.hero .hero-quotes') || '');
const auraDark = /--aura:\s*([\d.]+)/.exec(rule('[data-theme="dark"] .hero .hero-quotes, body.constellation .hero .hero-quotes') || '');
ok(aura && [1, 2, 3].every(function (n) { return new RegExp('radial-gradient\\(ellipse var\\(--bloom-' + n + '[^)]*\\), var\\(--energy\\), transparent\\)').test(aura); }) &&
  /opacity:\s*var\(--aura\)/.test(aura) && auraLight && auraDark,
  'each whisper wears its energy as a wash of three blooms behind the words, with its own peak by day and by night  (' +
  (auraLight && auraLight[1]) + ', ' + (auraDark && auraDark[1]) + ')');
const lantern = rule('[data-theme="dark"] .hero .hero-quotes .hero-quote[data-category]::before,\nbody.constellation .hero .hero-quotes .hero-quote[data-category]::before');
const lanternMix = lantern && /color-mix\(in srgb, var\(--energy\), #fff (\d+)%\)/.exec(lantern);
ok(!!lanternMix, 'at night the wash has a lighter heart, a lantern behind paper  (' + (lanternMix && lanternMix[1]) + '% white)');
ok(/\.hero \.hero-quotes \.hero-quote\.active\[data-category\]::before\s*\{\s*animation:\s*whisper-bloom/.test(fieldCss) &&
  /@keyframes whisper-bloom/.test(fieldCss) &&
  /prefers-reduced-motion: reduce\)\s*\{[^@]*\.hero-quote\.active\[data-category\]::before\s*\{\s*animation:\s*none/.test(fieldCss),
  'the wash blooms in after the words and breathes, and with reduced motion simply rests');

// Every energy's aura, at its peak behind the words, still leaves ink at
// 4.6:1 on the sky's wash wherever the whisper can sit: the same bar the
// quieter lines are held to (js/hero-field-core.test.js).
function lumOf(rgb) {
  const l = rgb.map(function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contrastOf(p, q) { const a = lumOf(p), b = lumOf(q); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
const energies = {};
fieldCss.replace(/\.hero-quote\[data-category="(\w+)"\]\s*\{\s*--energy:\s*(#[0-9A-Fa-f]{6});/g, function (_, name, hex) { energies[name] = hex; });
const darkPresence = /body\.constellation \.hero-quote\[data-category="presence"\]\s*\{\s*--energy:\s*(#[0-9A-Fa-f]{6})/.exec(fieldCss);
ok(Object.keys(energies).length === 7 && !!darkPresence, 'the seven energies carry their hues as --energy, presence with a lighter twin at night');
[['light', '#F5F0E8', '#2C241E', false, auraLight], ['dark', '#1C1914', '#F0EBE1', true, auraDark]].forEach(function (t) {
  let worst = 99, at = '';
  Object.keys(energies).forEach(function (name) {
    const base = Core.hexToRgb(t[3] && name === 'presence' ? darkPresence[1] : energies[name]);
    // At night the wash's heart is the hue lightened toward white: the
    // brightest it gets behind the pale words, so the hardest case for them.
    const lift = t[3] && lanternMix ? Number(lanternMix[1]) / 100 : 0;
    const hue = base.map(function (v) { return v + (1 - v) * lift; });
    for (let y = 0.18; y <= 0.6; y += 0.01) {
      const paper = Core.hexToRgb(t[1]), toward = t[3] ? [0, 0, 0] : Core.hexToRgb(t[2]), wash = Core.bokashiAt(y, t[3]);
      const sky = paper.map(function (v, i) { return v + (toward[i] - v) * wash; });
      const under = sky.map(function (v, i) { return v + (hue[i] - v) * Number(t[4] ? t[4][1] : 1); });
      const c = contrastOf(Core.hexToRgb(t[2]), under);
      if (c < worst) { worst = c; at = name; }
    }
  });
  ok(worst >= 4.6, t[0] + ': ink holds 4.6:1 over every energy\'s aura  (worst ' + worst.toFixed(2) + ':1, ' + at + ')');
});
const hint = rule('.scroll-hint');
ok(hint && /left:\s*50%/.test(hint) && /translateX\(-50%\)/.test(hint), '"begin walking" is centred on the path, whatever the inscription\'s alignment');

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
const painted = {};
const whisper = {
  textContent: 'This moment is a gift',
  classList: { contains: function (c) { return c === 'active'; } },
  style: { setProperty: function (k, v) { painted[k] = v; } }
};
quoteMo.cb([{ target: whisper }]);
ok(['--bloom-1', '--bloom-2', '--bloom-3'].every(function (k, i) { return painted[k] === Core.bloomFor('This moment is a gift')[i]; }),
  'a whisper that arrives is given the wash its own words make  (' + painted['--bloom-1'] + ')');
for (let t = 16100; t < 17100; t += 16) w.frame(t);
ok(gl.values.uFront[1] > 0.9, 'a new whisper arrives on a gust across the field');
const sheen = gl.values.uSheen[0];
const plain = Core.sheenFor(Core.skyBodies(new Date(), Moon.getMoonPhase(new Date()))).rgb;
// The words are ink; the energy (gratitude here, #C7A14F) is what the gust
// carries, so the sheen moves from the sky's own toward that hue alone.
const gratitude = Core.hexToRgb('#C7A14F');
const toward = (sheen[0] - plain[0]) / (gratitude[0] - plain[0]);
ok(toward > 0.05 && [1, 2].every(function (i) { return Math.abs(plain[i] + (gratitude[i] - plain[i]) * toward - sheen[i]) < 0.01; }),
  'and the gust carries the whisper\'s energy, not the ink of its words  (' + toward.toFixed(2) + ' of the way)');

console.log('\n=== the season\'s own field ===\n');

function driftDraws(world) { return world.gl().draws.filter(function (d) { return d.indexOf('drift') === 0; }); }
function seasonFrame(season, at) {
  const v = boot({ season: season, at: at });
  v.seen(true);
  v.frame(16); v.frame(32);
  return v;
}
ok(driftDraws(seasonFrame('autumn', '2027-10-20T13:00:00')).length === 0, 'autumn draws only its grass and plumes');
const winter = seasonFrame('winter', '2027-01-20T13:00:00');
ok(driftDraws(winter)[0] === 'drift:' + Core.seasonField('winter').count, 'winter snows, ' + Core.seasonField('winter').count + ' flakes in one instanced draw');
ok(winter.gl().draws.indexOf('drift:' + Core.seasonField('winter').count) > winter.gl().draws.indexOf('blades:' + Core.bladeBudget(1440, 900, { cores: 8 })),
  'and the snow falls in front of the grass, drawn after it');
ok(winter.gl().nullWrites.length === 0, 'every uniform the snow sets is one its shaders declare');
ok(driftDraws(seasonFrame('summer', '2027-07-15T13:00:00')).length === 0, 'a summer noon has no fireflies');
ok(driftDraws(seasonFrame('summer', '2027-07-15T23:30:00'))[0] === 'drift:' + Core.seasonField('summer').count, 'a summer night does');
ok(driftDraws(seasonFrame('spring', '2027-04-15T13:00:00'))[0] === 'drift:' + Core.seasonField('spring').count, 'spring petals drift through the day');
function snowAfter(flicked) {
  const v = boot({ season: 'winter', at: '2027-01-20T13:00:00' });
  v.seen(true);
  for (let t = 16; t < 3000; t += 16) v.frame(t);
  if (flicked) {
    for (let i = 0; i <= 6; i++) {
      v.sandbox.clock = 3000 + i * 45;
      v.hero.on.pointermove({ pointerType: 'mouse', clientX: 300 + i * 150, clientY: 700 });
    }
  }
  for (let t = 3016; t < 6400; t += 16) v.frame(t);
  return v.gl().lastSubData;
}
const blownSnow = snowAfter(true), calmSnow = snowAfter(false);
// Snow blown off one side of the view drifts back in from the other, so
// compare positions around the view's width at each flake's depth.
const viewTan = Core.projection(1440, 900, Core.horizonFraction(423, 900)).tanHalfX;
let moved = 0, sprang = 0;
for (let i = 0; i < blownSnow.length; i += 5) {
  const width = 2 * (blownSnow[i + 2] * viewTan * 1.1 + 1);
  let dx = blownSnow[i] - calmSnow[i];
  dx -= Math.round(dx / width) * width;
  if (dx > 0.3) moved++;
  if (dx < -0.3) sprang++;
}
ok(moved >= 5, 'a flick through falling snow blows flakes downwind, and three seconds on they are still there  (' + moved + ' flakes)');
ok(sprang <= moved / 10, 'it blows them, it does not bounce them back  (' + sprang + ' the other way)');

const still = boot({ season: 'winter', at: '2027-01-20T13:00:00', reduced: true });
still.frame(16);
still.seen(true);
ok(driftDraws(still).length === 1 && still.pendingFrames() === 0, 'with less motion the snow hangs in the still painting, and nothing moves');

console.log('\n=== a lantern for someone walking ===\n');

function lastFrameDraws(world) {
  const draws = world.gl().draws;
  const start = draws.lastIndexOf('sky');
  return draws.slice(start + 1);
}
const lonely = boot();
lonely.seen(true); lonely.frame(16); lonely.frame(32);
ok(lastFrameDraws(lonely).filter(function (d) { return d.indexOf('lantern') === 0; }).length === 0,
  'no word from the trail: no lanterns, and the grass in one draw');

const lit = boot();
lit.seen(true); lit.frame(16);
lit.winOn['pilgrim:walkers'].forEach(function (fn) { fn({ detail: { active: 2, recent: true } }); });
lit.frame(32);
const lf = lastFrameDraws(lit);
const lanternDraws = lf.filter(function (d) { return d.indexOf('lantern') === 0; });
const segments = lf.filter(function (d) { return d.indexOf('blades') === 0; }).map(function (d) { return +d.split(':')[1]; });
ok(lanternDraws.length === 2, 'two walking now, the trail says: two lanterns in the field');
ok(segments.reduce(function (a, b) { return a + b; }, 0) === Core.bladeBudget(1440, 900, { cores: 8 }),
  'the grass is drawn around them, every blade once  (' + segments.join(' + ') + ')');
ok(lf[0].indexOf('blades') === 0 && lf.indexOf(lanternDraws[0]) > 0 && lf.lastIndexOf('lantern:1') < lf.length - 1,
  'each lantern sits between the grass beyond it and the grass before it');

const early = boot({ walkers: { active: 0, recent: true } });
early.seen(true); early.frame(16); early.frame(32);
ok(lastFrameDraws(early).filter(function (d) { return d.indexOf('lantern') === 0; }).length === 1,
  'if the trail spoke first, the field lights its lantern from the start');

console.log('\n=== your path wears in ===\n');

function memoryStorage() {
  const m = {};
  return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, m: m };
}
function pathFadeOn(storage, at) {
  const v = boot({ storage: storage, at: at });
  v.seen(true); v.frame(16); v.frame(32);
  return v.gl().values.uPathFade;
}
const store = memoryStorage();
const day1 = pathFadeOn(store, '2027-03-01T10:00:00');
ok(store.m.pilgrimFieldDays === '1' && day1[0] === Core.pathReach(1).fadeFrom, 'a first visit counts one day, and the path is as first laid');
pathFadeOn(store, '2027-03-01T21:00:00');
ok(store.m.pilgrimFieldDays === '1', 'coming back that evening counts nothing more');
const day2 = pathFadeOn(store, '2027-03-02T08:00:00');
ok(store.m.pilgrimFieldDays === '2' && day2[0] > day1[0], 'the next morning, the path reaches a little farther  (' + day2[0].toFixed(1) + ' m)');
for (let d = 3; d <= 30; d++) pathFadeOn(store, '2027-03-' + (d < 10 ? '0' : '') + d + 'T08:00:00');
ok(+store.m.pilgrimFieldDays === 30 && pathFadeOn(store, '2027-03-30T09:00:00')[0] >= 50, 'a month of mornings and it runs out toward the horizon');
const locked = { getItem: function () { throw new Error('SecurityError'); }, setItem: function () { throw new Error('SecurityError'); } };
const lockedWorld = boot({ storage: locked });
lockedWorld.seen(true); lockedWorld.frame(16); lockedWorld.frame(32);
ok(lockedWorld.hero.children.length === 1 && lockedWorld.gl().values.uPathFade[0] === Core.pathReach(1).fadeFrom,
  'with storage refused, the field still paints, the path as first laid');

console.log('\n=== your own lantern ===\n');

function lanternsIn(world) { return lastFrameDraws(world).filter(function (d) { return d.indexOf('lantern') === 0; }).length; }
const stillOne = boot();
stillOne.seen(true);
for (let t = 16; t < 11000; t += 16) stillOne.frame(t);
ok(lanternsIn(stillOne) === 0, 'eleven seconds of stillness: not yet');
for (let t = 11000; t < 14000; t += 16) stillOne.frame(t);
ok(lanternsIn(stillOne) === 1, 'twelve, and a lantern is lit where the path begins');
stillOne.sandbox.clock = 14000;
stillOne.hero.on.pointermove({ pointerType: 'mouse', clientX: 700, clientY: 820 });
for (let t = 14016; t < 16000; t += 16) stillOne.frame(t);
ok(lanternsIn(stillOne) === 1, 'once lit it is yours: moving again does not put it out');

const restless = boot();
restless.seen(true);
for (let t = 16; t < 40000; t += 16) {
  if (t % 5000 < 16) { restless.sandbox.clock = t; restless.hero.on.pointermove({ pointerType: 'mouse', clientX: 400 + (t % 300), clientY: 820 }); }
  restless.frame(t);
}
ok(lanternsIn(restless) === 0, 'a restless visit, stirring every five seconds, never lights one');

const stillReduced = boot({ reduced: true });
stillReduced.seen(true);
ok(stillReduced.pendingFrames() <= 1 && lanternsIn(stillReduced) === 0, 'with less motion, no lantern sets off');

console.log('\n=== geese across the moon ===\n');

function geeseSeen(season, at, reduced) {
  const v = boot({ season: season, at: at, random: function () { return 0.5; }, reduced: reduced });
  v.seen(true);
  let most = 0;
  for (let t = 16; t < 60000; t += 32) {
    v.frame(t);
    lastFrameDraws(v).forEach(function (d) { if (d.indexOf('geese') === 0) most = Math.max(most, +d.split(':')[1]); });
  }
  return most;
}
ok(geeseSeen('autumn', '2027-10-20T18:40:00') === 9, 'an autumn evening: a skein of nine crosses the sky');
ok(geeseSeen('summer', '2027-07-15T21:00:00') === 0, 'a summer evening: none');
ok(geeseSeen('autumn', '2027-10-20T12:00:00') === 0, 'an autumn noon: none');
ok(geeseSeen('autumn', '2027-10-20T18:40:00', true) === 0, 'with less motion, nothing crosses');

console.log('\n=== meteors on shower nights ===\n');

function meteorsSeen(world, from, to) {
  let seen = 0, wasOn = false;
  for (let t = from; t < to; t += 16) {
    world.frame(t);
    const on = world.gl().values.uMeteorB[2] > 0;
    if (on && !wasOn) seen++;
    wasOn = on;
  }
  return seen;
}
const leonidsNight = boot({ at: '2027-11-17T23:00:00' });
leonidsNight.seen(true);
ok(!leonidsNight.echo.hidden && leonidsNight.echoText.textContent === 'Tonight, the Leonids', 'on the night of the Leonids, the hero names them');
const fell = meteorsSeen(leonidsNight, 16, 90000);
ok(fell >= 2 && fell <= 8, 'and in a minute and a half a few meteors fall — rare, not a fireworks show  (' + fell + ')');

const ordinary = boot({ at: '2027-03-15T23:00:00' });
ordinary.seen(true);
ok(ordinary.echo.hidden, 'an ordinary night names nothing');
ok(meteorsSeen(ordinary, 16, 90000) === 0, 'and nothing falls');

const leonidsDay = boot({ at: '2027-11-17T13:00:00' });
leonidsDay.seen(true);
ok(!leonidsDay.echo.hidden, 'the afternoon before, the hero already says tonight');
ok(meteorsSeen(leonidsDay, 16, 90000) === 0, 'but no meteor crosses a daylight sky');

const stillLeonids = boot({ at: '2027-11-17T23:00:00', reduced: true });
ok(!stillLeonids.echo.hidden && stillLeonids.gl().values.uMeteorB[2] === 0, 'with less motion, the line still says it, and no meteor moves');

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
