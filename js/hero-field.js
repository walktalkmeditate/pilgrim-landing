/* The field — the hero's living ink painting: a field of susuki grass
 * under the real moon, crossed by wind.
 *
 * Wiring and WebGL only; every decision with a right answer lives in
 * js/hero-field-core.js, where it is tested. No library: two small
 * programs, one instanced blade, a full-screen sky.
 *
 * It costs nothing it does not show. The loop runs only while the hero is
 * on screen and the tab is visible; with reduced motion the field is
 * painted once, still, and repainted only when the page changes under it;
 * without WebGL the hero is the plain hero it always was.
 */

(function () {
  'use strict';

  var C = window.HeroFieldCore;
  var hero = document.querySelector('.hero');
  if (!C || !hero || !window.Moon) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'hero-field';
  canvas.setAttribute('aria-hidden', 'true');

  var glOpts = { antialias: true, alpha: true, premultipliedAlpha: true, depth: false, stencil: false };
  var gl = canvas.getContext('webgl2', glOpts);
  var isGl2 = !!gl;
  var inst = null;
  if (!gl) {
    gl = canvas.getContext('webgl', glOpts);
    inst = gl && gl.getExtension('ANGLE_instanced_arrays');
    if (!inst) return;
  }

  // ---------- shaders ----------

  var NOISE =
    'float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }' +
    'float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);' +
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }';

  var BLADE_VS = [
    'precision highp float;',
    'attribute vec2 aV;',
    'attribute vec4 aA;',
    'attribute vec4 aB;',
    'uniform mediump vec2 uRes;',
    'uniform vec3 uProj;',
    'uniform float uEye;',
    'uniform float uWalk;',
    'uniform float uTime;',
    'uniform float uGrow;',
    'uniform float uDpr;',
    'uniform vec2 uWind;',
    'uniform vec4 uBrush;',
    'uniform vec2 uBrushVel;',
    'uniform vec4 uRing[4];',
    'uniform vec3 uFront;',
    'varying float vT;',
    'varying float vKind;',
    'varying float vGust;',
    'varying float vFog;',
    'varying float vTone;',
    NOISE,
    'vec2 spine(float t, float b, float h, float stiff){',
    '  float s = pow(t, stiff);',
    '  if (b < 0.002) return vec2(0.5 * b * s * s * h, t * h);',
    '  return vec2(h * (1.0 - cos(b * s)) / b, h * mix(t, sin(b * s) / b, 0.85));',
    '}',
    'vec4 toClip(vec3 w){',
    '  float vz = w.z - uWalk;',
    '  return vec4(w.x / uProj.x, (w.y - uEye) / uProj.y + uProj.z * vz, (2.0 * (vz - 0.15) / 140.0 - 1.0) * vz, vz);',
    '}',
    'void main(){',
    '  float t = aV.x;',
    '  float side = aV.y;',
    '  vec2 p = aA.xy;',
    '  float kind = aB.y;',
    '  float dn = clamp(p.y / 45.0, 0.0, 1.0);',
    '  float g = clamp(uGrow * 1.55 - (1.0 - dn) * 0.55, 0.0, 1.0);',
    '  g = g * g * (3.0 - 2.0 * g);',
    '  vec2 perp = vec2(-uWind.y, uWind.x);',
    '  float along = dot(p, uWind);',
    '  float across = dot(p, perp);',
    '  float gc = along - uTime * 3.4;',
    '  float n = noise(vec2(gc * 0.065, across * 0.03)) * 0.72 + noise(vec2(gc * 0.17 + 13.0, across * 0.09)) * 0.38;',
    '  float gust = smoothstep(0.46, 0.98, n);',
    '  float fd = (along - uFront.x) / uFront.z;',
    '  gust = max(gust, uFront.y * exp(-fd * fd));',
    '  float sway = sin(uTime * (1.1 + aB.x * 0.9) + aB.x * 6.2831 + gc * 0.45) * 0.06;',
    '  vec2 bend = uWind * (0.05 + gust * 0.8 + sway) + vec2(cos(aB.z), sin(aB.z)) * aB.w;',
    '  vec2 toB = p - uBrush.xy;',
    '  float bf = uBrush.z * exp(-dot(toB, toB) / (uBrush.w * uBrush.w));',
    '  bend += toB / sqrt(dot(toB, toB) + 0.02) * bf * 0.9 + uBrushVel * bf * 0.1;',
    '  gust = max(gust, bf * 0.7);',
    '  for (int i = 0; i < 4; i++) {',
    '    vec4 r = uRing[i];',
    '    vec2 tr = p - r.xy;',
    '    float rd = length(tr);',
    '    float w = (rd - r.z * 6.5) / 1.3;',
    '    float a = r.w * exp(-w * w) * (1.0 - smoothstep(0.0, 3.4, r.z));',
    '    bend += tr / (rd + 0.05) * a * 0.95;',
    '    gust = max(gust, a);',
    '  }',
    '  float bl = length(bend);',
    '  vec2 dir = bl > 0.0001 ? bend / bl : vec2(1.0, 0.0);',
    '  float b = min(bl, 1.5) * mix(0.25, 1.0, g);',
    '  float h = aA.z * (0.08 + 0.92 * g);',
    '  float stiff = kind > 0.5 ? 1.6 : 1.15;',
    '  float t2 = t < 0.97 ? t + 0.03 : t - 0.03;',
    '  vec2 s1 = spine(t, b, h, stiff);',
    '  vec2 s2 = spine(t2, b, h, stiff);',
    '  vec3 w1 = vec3(p.x + dir.x * s1.x, s1.y, p.y + dir.y * s1.x);',
    '  vec3 w2 = vec3(p.x + dir.x * s2.x, s2.y, p.y + dir.y * s2.x);',
    '  vec4 c1 = toClip(w1);',
    '  vec4 c2 = toClip(w2);',
    '  vec2 q1 = c1.xy / c1.w * uRes;',
    '  vec2 q2 = c2.xy / c2.w * uRes;',
    '  vec2 tan2 = (t < 0.97 ? q2 - q1 : q1 - q2);',
    '  float tl = length(tan2);',
    '  vec2 nrm = tl > 0.0001 ? vec2(-tan2.y, tan2.x) / tl : vec2(1.0, 0.0);',
    '  float prof;',
    '  if (kind > 0.5) {',
    '    float pt = clamp((t - 0.46) / 0.54, 0.0, 1.0);',
    '    prof = (1.0 - smoothstep(0.7, 1.0, t)) * 0.9 + 2.0 * sin(3.14159 * pow(pt, 0.8)) * (1.0 - 0.3 * pt);',
    '  } else {',
    '    prof = pow(max(1.0 - t, 0.0), 0.85) * (1.0 + 0.7 * sin(3.14159 * t));',
    '  }',
    '  float vz = c1.w;',
    '  float scale = uRes.y * 0.5 / uProj.y;',
    '  float hw = max(aA.w * scale / max(vz, 0.05), 0.45 * uDpr) * prof * smoothstep(0.2, 0.75, vz);',
    '  c1.xy += nrm * side * hw * 2.0 / uRes * c1.w;',
    '  gl_Position = c1;',
    '  vT = t;',
    '  vKind = kind;',
    '  vGust = gust;',
    '  vTone = aB.x;',
    '  vFog = 1.0 - exp(-max(vz, 0.0) * 0.03);',
    '}'
  ].join('\n');

  // A phone's mediump is 16-bit, too coarse to hash pixel coordinates in
  // the thousands; take highp where the GPU has it. uRes is pinned to
  // mediump in both blade shaders — a uniform the two share must agree on
  // precision, or the program will not link.
  var FS_PRECISION = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif';

  var BLADE_FS = [
    FS_PRECISION,
    'uniform vec3 uStem;',
    'uniform vec3 uPlume;',
    'uniform vec3 uMist;',
    'uniform vec3 uSheen;',
    'uniform float uSheenK;',
    'uniform vec4 uBg;',
    'uniform mediump vec2 uRes;',
    'uniform float uFadeFrom;',
    'varying float vT;',
    'varying float vKind;',
    'varying float vGust;',
    'varying float vFog;',
    'varying float vTone;',
    'void main(){',
    '  float plume = vKind * smoothstep(0.3, 0.62, vT);',
    '  vec3 c = uStem * (0.86 + 0.28 * vTone);',
    '  c = mix(c, uPlume, plume);',
    '  c = mix(c, uPlume, (1.0 - vKind) * vT * vT * 0.3);',
    '  float top = smoothstep(0.3, 1.0, vT);',
    '  c = mix(c, uSheen, clamp(vGust * top * uSheenK * 1.25, 0.0, 0.85));',
    '  c = mix(c, uMist, vFog);',
    '  float a = mix(1.0, 0.82, plume);',
    '  vec4 col = vec4(c * a, a);',
    '  float y01 = 1.0 - gl_FragCoord.y / uRes.y;',
    '  col = mix(col, uBg * a, smoothstep(uFadeFrom, 1.0, y01));',
    '  gl_FragColor = col;',
    '}'
  ].join('\n');

  var SKY_VS = [
    'attribute vec2 aP;',
    'void main(){ gl_Position = vec4(aP, 0.0, 1.0); }'
  ].join('\n');

  var SKY_FS = [
    FS_PRECISION,
    'uniform vec2 uRes;',
    'uniform float uHorizon;',
    'uniform vec3 uPaper;',
    'uniform vec3 uMist;',
    'uniform vec3 uGround;',
    'uniform vec3 uMoonLit;',
    'uniform vec3 uSunGlow;',
    'uniform vec4 uMoon;',
    'uniform float uMoonShow;',
    'uniform vec4 uSun;',
    'uniform float uSkyAlpha;',
    'uniform vec4 uBg;',
    'uniform float uFadeFrom;',
    'uniform vec3 uProj;',
    'uniform float uEye;',
    'uniform float uWalk;',
    'uniform vec3 uPathC;',
    NOISE,
    C.pathGlsl(),
    'void main(){',
    '  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  float y01 = fc.y / uRes.y;',
    '  vec4 col;',
    '  if (y01 < uHorizon) {',
    '    float k = y01 / uHorizon;',
    '    float haze = smoothstep(0.5, 1.0, k);',
    '    vec3 sky = mix(uPaper, uMist, haze * 0.9);',
    '    vec2 ds = (fc - uSun.xy) / uSun.z;',
    '    sky += uSunGlow * uSun.w * exp(-dot(ds, ds));',
    '    col = vec4(sky, 1.0) * max(uSkyAlpha, haze * haze * 0.55);',
    '    vec2 m = (fc - uMoon.xy) / uMoon.z;',
    '    float r = length(m);',
    '    if (uMoonShow > 0.0 && r < 3.0) {',
    '      float px = 1.2 / uMoon.z;',
    '      float disc = (1.0 - smoothstep(1.0 - px, 1.0 + px, r)) * uMoonShow;',
    '      float edge = cos(6.28318 * uMoon.w) * sqrt(max(0.0, 1.0 - m.y * m.y));',
    '      float lit = uMoon.w < 0.5 ? smoothstep(edge - 0.06, edge + 0.06, m.x) : 1.0 - smoothstep(-edge - 0.06, -edge + 0.06, m.x);',
    '      float mottle = noise(m * 2.2 + 7.0);',
    '      vec3 earthshine = mix(col.rgb, uMoonLit, 0.07);',
    '      col = mix(col, vec4(mix(earthshine, uMoonLit * (0.97 + 0.04 * mottle), lit), 1.0), disc);',
    '      float halo = exp(-max(r - 1.0, 0.0) * 3.2) * (1.0 - disc) * uMoonShow * (0.25 + 0.75 * uMoon.w * (1.0 - uMoon.w) * 4.0);',
    '      col.rgb += uMoonLit * halo * 0.07;',
    '    }',
    '    float mistLine = exp(-pow((uHorizon - y01) * uRes.y / 26.0, 2.0));',
    '    col = mix(col, vec4(uMist, 1.0), mistLine * 0.75);',
    '  } else {',
    '    float k = (y01 - uHorizon) / (1.0 - uHorizon);',
    '    float ny = 1.0 - 2.0 * y01 - uProj.z;',
    '    float vz = uEye / max(-ny * uProj.y, 0.0001);',
    '    float d = vz + uWalk;',
    '    float x = (2.0 * fc.x / uRes.x - 1.0) * uProj.x * vz;',
    '    float hw = pathHalf(d);',
    '    float off = abs(x - pathX(d)) + (noise(vec2(d * 1.7, x * 2.3)) - 0.5) * 0.3;',
    '    float onPath = (1.0 - smoothstep(hw * 0.55, hw * 1.15, off)) * (1.0 - smoothstep(22.0, 40.0, d));',
    '    vec3 g = mix(uMist, uGround, smoothstep(0.0, 0.3, k));',
    '    g = mix(g, mix(uMist, uPathC, smoothstep(0.0, 0.5, k)), onPath);',
    '    col = vec4(g, 1.0);',
    '  }',
    '  col = mix(col, uBg, smoothstep(uFadeFrom, 1.0, y01));',
    '  col.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * col.a;',
    '  gl_FragColor = col;',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('hero-field shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function program(vs, fs, names) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('hero-field link: ' + gl.getProgramInfoLog(p));
    }
    var u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u };
  }

  // The blade template: a ribbon from root (t 0) to tip (t 1), its levels
  // crowded toward the top where a plume feathers out.
  var LEVELS = [0, 0.16, 0.32, 0.45, 0.54, 0.62, 0.7, 0.77, 0.84, 0.9, 0.95, 0.985, 1];

  function setDivisor(loc, n) {
    if (isGl2) gl.vertexAttribDivisor(loc, n);
    else inst.vertexAttribDivisorANGLE(loc, n);
  }

  var blade, sky, buffers = {}, attribs = {};

  function build() {
    blade = program(BLADE_VS, BLADE_FS, ['uRes', 'uProj', 'uEye', 'uWalk', 'uTime', 'uGrow', 'uDpr',
      'uWind', 'uBrush', 'uBrushVel', 'uRing', 'uFront', 'uStem', 'uPlume', 'uMist', 'uSheen',
      'uSheenK', 'uBg', 'uFadeFrom']);
    sky = program(SKY_VS, SKY_FS, ['uRes', 'uHorizon', 'uPaper', 'uMist', 'uGround', 'uMoonLit',
      'uSunGlow', 'uMoon', 'uMoonShow', 'uSun', 'uSkyAlpha', 'uBg', 'uFadeFrom',
      'uProj', 'uEye', 'uWalk', 'uPathC']);

    var tmpl = [];
    LEVELS.forEach(function (t) { tmpl.push(t, -1, t, 1); });
    buffers.template = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.template);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tmpl), gl.STATIC_DRAW);

    buffers.tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    buffers.blades = gl.createBuffer();
    attribs.v = gl.getAttribLocation(blade.p, 'aV');
    attribs.a = gl.getAttribLocation(blade.p, 'aA');
    attribs.b = gl.getAttribLocation(blade.p, 'aB');
    attribs.sky = gl.getAttribLocation(sky.p, 'aP');
    bladeCount = 0;
    layoutKey = '';
  }

  // ---------- state ----------

  var W = 0, H = 0, dpr = 1, proj = null, horizonFrac = 0.62, horizonPx = 0, contentBottom = 0;
  var heroTop = 0;
  var bladeCount = 0, layoutKey = '';
  var colors = null, sheen = null, bodies = null, skyAlpha = 1, bg = [0, 0, 0, 1];
  var moonPx = [0, 0, 20, 0], moonShow = 0, sunPx = [0, 0, 100, 0];
  var walk = 0, walkTarget = 0;
  var brush = { x: 0, d: 0, str: 0, target: 0, vx: 0, vd: 0, r: 1 };
  var rings = [];
  var front = { pos: -999, strength: 0, width: 3.5, speed: 9, until: 0 };
  var running = false, raf = 0, visible = false, t0 = 0, lastNow = 0;
  var WIND = C.WIND;
  var FADE_FROM = 0.9;
  var STILL_TIME = 7.3;
  var GROW_SECONDS = 2.8;

  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var star = document.body.classList.contains('constellation');
    var season = window.SeasonalEngine ? window.SeasonalEngine.getCurrentSeason() : 'autumn';
    colors = C.palette({ parchment: cs.getPropertyValue('--parchment'), ink: cs.getPropertyValue('--ink') }, season, dark || star);
    skyAlpha = star ? 0 : 1;
    bg = star ? [0, 0, 0, 0] : [colors.paper[0], colors.paper[1], colors.paper[2], 1];
  }

  function readSky() {
    var now = new Date();
    bodies = C.skyBodies(now, window.Moon.getMoonPhase(now));
    sheen = C.sheenFor(bodies);
    placeBodies();
  }

  function placeBodies() {
    if (!bodies || !W) return;
    var r = Math.max(16, Math.min(40, Math.min(W, H) * 0.036));
    var arc = Math.max(r * 1.5, horizonPx - contentBottom - r - 14);
    var m = bodies.moon;
    moonPx = [m.x01 * W, horizonPx - m.alt * arc, r, m.phase];
    moonShow = m.visible && m.illumination > 0.02 ? 1 : 0;
    var s = bodies.sun;
    sunPx = [s.x01 * W, horizonPx - Math.max(s.alt, -0.3) * arc, Math.max(W, H) * 0.32, s.alt > -0.15 ? 0.55 * (1 - 0.5 * Math.max(s.alt, 0)) : 0];
  }

  function measure() {
    var w = hero.clientWidth;
    var h = hero.clientHeight;
    if (!w || !h) return false;
    var quotes = hero.querySelector('.hero-quotes');
    contentBottom = quotes ? quotes.offsetTop + quotes.offsetHeight : h * 0.45;
    heroTop = hero.getBoundingClientRect().top + window.scrollY;
    W = w; H = h;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    horizonFrac = C.horizonFraction(contentBottom, H);
    horizonPx = horizonFrac * H;
    proj = C.projection(W, H, horizonFrac);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    var count = C.bladeBudget(W, H, {
      coarse: !finePointer,
      cores: navigator.hardwareConcurrency,
      saveData: navigator.connection && navigator.connection.saveData
    });
    var key = count + ':' + proj.tanHalfX.toFixed(3);
    if (key !== layoutKey) {
      var data = C.layoutBlades(count, proj.tanHalfX, 108);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.blades);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      bladeCount = count;
      layoutKey = key;
    }
    placeBodies();
    return true;
  }

  // ---------- drawing ----------

  var ringData = new Float32Array(16);

  function draw(time, grow) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var rw = canvas.width, rh = canvas.height;

    gl.useProgram(sky.p);
    var su = sky.u;
    gl.uniform2f(su.uRes, rw, rh);
    gl.uniform1f(su.uHorizon, horizonFrac);
    gl.uniform3fv(su.uPaper, colors.paper);
    gl.uniform3fv(su.uMist, colors.mist);
    gl.uniform3fv(su.uGround, colors.ground);
    gl.uniform3fv(su.uMoonLit, colors.moonLit);
    var warm = sheen.warm;
    gl.uniform3f(su.uSunGlow, 0.04 + 0.12 * warm, 0.025 + 0.05 * warm, 0.0);
    gl.uniform4f(su.uMoon, moonPx[0] * dpr, moonPx[1] * dpr, moonPx[2] * dpr, moonPx[3]);
    gl.uniform1f(su.uMoonShow, moonShow * Math.min(1, grow * 1.6));
    gl.uniform4f(su.uSun, sunPx[0] * dpr, sunPx[1] * dpr, sunPx[2] * dpr, sunPx[3] * grow);
    gl.uniform1f(su.uSkyAlpha, skyAlpha);
    gl.uniform4fv(su.uBg, bg);
    gl.uniform1f(su.uFadeFrom, FADE_FROM);
    gl.uniform3f(su.uProj, proj.tanHalfX, proj.tanHalfY, proj.shift);
    gl.uniform1f(su.uEye, C.EYE);
    gl.uniform1f(su.uWalk, walk);
    gl.uniform3fv(su.uPathC, colors.path);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.tri);
    gl.enableVertexAttribArray(attribs.sky);
    gl.vertexAttribPointer(attribs.sky, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(attribs.sky);

    gl.useProgram(blade.p);
    var bu = blade.u;
    gl.uniform2f(bu.uRes, rw, rh);
    gl.uniform3f(bu.uProj, proj.tanHalfX, proj.tanHalfY, proj.shift);
    gl.uniform1f(bu.uEye, C.EYE);
    gl.uniform1f(bu.uWalk, walk);
    gl.uniform1f(bu.uTime, time);
    gl.uniform1f(bu.uGrow, grow);
    gl.uniform1f(bu.uDpr, dpr);
    gl.uniform2fv(bu.uWind, WIND);
    gl.uniform4f(bu.uBrush, brush.x, brush.d, brush.str, brush.r);
    gl.uniform2f(bu.uBrushVel, brush.vx, brush.vd);
    ringData.fill(0);
    rings.forEach(function (r, i) {
      ringData[i * 4] = r.x; ringData[i * 4 + 1] = r.d;
      ringData[i * 4 + 2] = r.age; ringData[i * 4 + 3] = r.amp;
    });
    gl.uniform4fv(bu.uRing, ringData);
    gl.uniform3f(bu.uFront, front.pos, front.strength, front.width);
    gl.uniform3fv(bu.uStem, colors.stem);
    gl.uniform3fv(bu.uPlume, colors.plume);
    gl.uniform3fv(bu.uMist, colors.mist);
    gl.uniform3fv(bu.uSheen, front.strength > 0.01 && front.rgb ? mixRgb(sheen.rgb, front.rgb, 0.45 * front.strength) : sheen.rgb);
    gl.uniform1f(bu.uSheenK, sheen.strength);
    gl.uniform4fv(bu.uBg, bg);
    gl.uniform1f(bu.uFadeFrom, FADE_FROM);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.template);
    gl.enableVertexAttribArray(attribs.v);
    gl.vertexAttribPointer(attribs.v, 2, gl.FLOAT, false, 0, 0);
    setDivisor(attribs.v, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.blades);
    var stride = C.FLOATS_PER_BLADE * 4;
    gl.enableVertexAttribArray(attribs.a);
    gl.vertexAttribPointer(attribs.a, 4, gl.FLOAT, false, stride, 0);
    setDivisor(attribs.a, 1);
    gl.enableVertexAttribArray(attribs.b);
    gl.vertexAttribPointer(attribs.b, 4, gl.FLOAT, false, stride, 16);
    setDivisor(attribs.b, 1);

    var verts = LEVELS.length * 2;
    if (isGl2) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, bladeCount);
    else inst.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, verts, bladeCount);

    setDivisor(attribs.a, 0);
    setDivisor(attribs.b, 0);
    gl.disableVertexAttribArray(attribs.a);
    gl.disableVertexAttribArray(attribs.b);
    gl.disableVertexAttribArray(attribs.v);
  }

  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  function frame(now) {
    raf = 0;
    if (!running) return;
    var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.1) : 0.016;
    lastNow = now;
    var time = (now - t0) / 1000;

    walk += (walkTarget - walk) * 0.12;
    brush.str += (brush.target - brush.str) * 0.1;
    brush.vx *= 0.9; brush.vd *= 0.9;

    for (var i = rings.length - 1; i >= 0; i--) {
      rings[i].age += dt;
      if (rings[i].age > 3.6) rings.splice(i, 1);
    }

    if (front.until > time) {
      front.pos += front.speed * dt;
      var left = front.until - time;
      front.strength = Math.min(1, (time - front.began) * 1.5, left * 0.8);
    } else {
      front.strength = 0;
    }

    draw(time, easeOut(Math.min(1, time / GROW_SECONDS)));
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced || !visible || document.hidden) return;
    running = true;
    lastNow = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function paintStill() {
    if (reduced && colors && proj) draw(STILL_TIME, 1);
  }

  function gustFront(rgb) {
    if (reduced) return;
    var time = (performance.now() - t0) / 1000;
    front.pos = -26;
    front.began = time;
    front.until = time + 7.5;
    front.rgb = rgb;
  }

  // ---------- the visitor ----------

  function localPoint(e) {
    return { x: e.clientX, y: e.clientY + window.scrollY - heroTop };
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch' || !proj) return;
    var pt = localPoint(e);
    var hit = C.pointerOnField(pt.x, pt.y, W, H, proj, walk);
    if (!hit) { brush.target = 0; return; }
    if (brush.target > 0.05) {
      brush.vx = brush.vx * 0.6 + (hit.x - brush.x) * 4;
      brush.vd = brush.vd * 0.6 + (hit.d - brush.d) * 4;
    }
    brush.x = hit.x;
    brush.d = hit.d;
    brush.r = 0.8 + hit.d * 0.05;
    brush.target = 1;
    start();
  }

  function onPointerDown(e) {
    if (!proj || reduced) return;
    var pt = localPoint(e);
    var hit = C.pointerOnField(pt.x, pt.y, W, H, proj, walk);
    if (!hit) return;
    rings.push({ x: hit.x, d: hit.d, age: 0, amp: 1 });
    if (rings.length > 4) rings.shift();
  }

  function onScroll() {
    if (reduced) return;
    var y = window.scrollY - heroTop;
    walkTarget = Math.max(0, Math.min(1, y / (H || 1))) * C.WALK_METRES;
  }

  function parseRgb(css) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css || '');
    return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : null;
  }

  // ---------- start ----------

  try {
    build();
  } catch (err) {
    if (window.console && console.warn) console.warn(err);
    return;
  }

  hero.insertBefore(canvas, hero.firstChild);
  readPalette();
  readSky();
  if (!measure()) return;
  t0 = performance.now();
  requestAnimationFrame(function () { canvas.classList.add('is-ready'); });
  paintStill();

  new IntersectionObserver(function (entries) {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) start(); else stop();
  }).observe(hero);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  var lastWidth = W;
  window.addEventListener('resize', function () {
    if (hero.clientWidth === lastWidth && Math.abs(hero.clientHeight - H) < 2) return;
    lastWidth = hero.clientWidth;
    measure();
    paintStill();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  if (!reduced) {
    hero.addEventListener('pointermove', onPointerMove);
    hero.addEventListener('pointerleave', function () { brush.target = 0; });
    hero.addEventListener('pointerdown', onPointerDown);
  }

  // Theme and season both arrive as changes on <html> (data-theme, and
  // the seasonal engine's inline custom properties) or on <body> (star).
  var repaint = function () { readPalette(); paintStill(); };
  new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  new MutationObserver(repaint).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Each new whisper arrives on a gust, in the whisper's own colour.
  var quotes = hero.querySelector('.hero-quotes');
  if (quotes) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var el = records[i].target;
        if (el.classList && el.classList.contains('active')) {
          gustFront(parseRgb(getComputedStyle(el).color));
          return;
        }
      }
    }).observe(quotes, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  setInterval(function () { readSky(); paintStill(); }, 60000);

  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); });
  canvas.addEventListener('webglcontextrestored', function () {
    build();
    measure();
    paintStill();
    start();
  });

  if (!reduced) {
    // The first wind, once the field has risen.
    setTimeout(function () { gustFront(null); }, GROW_SECONDS * 600);
  }
})();
