# Sun Path WebGL Globe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat SVG Sun Path globe with a warm, luminous Three.js hero globe (living terminator, sun-bloom, atmosphere, monument beacons, drift beam) across `/sunpath` and its 8 turning subpages, behind progressive enhancement with an SVG fallback — a scroll-stopping HN hero.

**Architecture:** Split today's `js/sunpath.js` into a pixel-agnostic **controller** (state + interaction) and two **renderers** behind one interface (`createSvgGlobe`, `createGlGlobe`). A capability check renders SVG instantly, then lazy-loads Three.js and swaps to GL on capable devices. All astronomy stays in the untouched `js/sunpath-math.js`; new pure helpers live in require-able modules so they can be unit-tested with the repo's hand-rolled node harness.

**Tech Stack:** Vanilla ES5-style browser JS (IIFE + CommonJS dual-export shim), D3-geo (existing, fallback), Three.js (new, vendored + pinned), Node's plain `node file.test.js` harness (no framework), headless-Chrome OG pipeline.

## Global Constraints

- **No build system / no npm.** No `package.json`. Browser files are plain scripts; testable modules use the dual-export shim `(function (root) { … if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.X = api; })(typeof window !== 'undefined' ? window : globalThis);`.
- **Tests** are hand-rolled: `require()` the module, count pass/fail, `process.exit(failed ? 1 : 0)`. Run with `node js/<name>.test.js`. No describe/it, no assert library.
- **Never `--no-verify`.** A pre-commit hook validates permalinks + page metadata; commits must pass it.
- **Subpages are generated.** Edit `scripts/sunpath/permalink-template.mjs`, then run `node scripts/sunpath/build-permalinks.mjs`. `node scripts/sunpath/build-permalinks.mjs --check` must pass (zero drift). **Never hand-edit `sunpath/<year>-<key>/index.html`.**
- **Three.js** is vendored + pinned in `js/vendor/three.min.js` (MIT, compatible with the site's GPLv3), lazy-loaded after first paint. No CDN.
- **Warm palette only:** space `#0a0a12`; light/accent `--sun #c8893a`, `--dawn #D4A87A`, gold `#C9A646`; stars/lines `rgba(220,215,255,…)`; turning colors jade `#74B495`, gold `#C9A646`, claret `#8B4455`, indigo `#2378A4`. **No cyan.**
- **Progressive enhancement:** SVG paints first and is the fallback for no-WebGL, `prefers-reduced-motion`, low-end, or `?flat`. GL is the enhancement.
- **Render-on-demand:** draw only while animating; pause on `visibilitychange` (hidden) and when the globe is offscreen (`IntersectionObserver`).
- **Feature parity (both renderers):** drag-rotate (with click-vs-drag threshold), year-scrub, 24h time-lapse, axial-tilt inset, polar circles, subsolar caption, monument pins → popover, frozen-instant mode (`window.__sunpathForce`), `noscript` fallback, minute idle re-render when live.
- **Coordinate convention (fixed for the whole project):** `lonLatToVec3(lon, lat, r)` → `x = r·cos(lat)·cos(lon)`, `y = r·sin(lat)`, `z = −r·cos(lat)·sin(lon)`. So (lon 0, lat 0) → +X, north pole → +Y, (lon 90, lat 0) → −Z. The day/night shader and all point math use **model space** (earthGroup-local), so dragging rotates the lit hemisphere with the surface; only a time change moves the terminator across the surface.

---

## File Structure

**New (require-able, tested):**
- `js/sunpath-globe-math.js` — pure 3D helpers: `lonLatToVec3`, `subsolarToSunDir`, `litFactor`, `isLit`, `alignmentFlareStrength`, `clamp01`.
- `js/sunpath-globe-math.test.js` — harness for the above.
- `js/sunpath-capability.js` — `selectRenderer(env)` (pure) + thin browser probes `hasWebGL`, `prefersReducedMotion`, `isLowEnd`, `detectEnv`.
- `js/sunpath-capability.test.js` — harness for `selectRenderer`.

**New (browser-only):**
- `js/sunpath-globe-svg.js` — today's SVG drawing, extracted behind the renderer interface.
- `js/sunpath-globe-gl.js` — the Three.js renderer.
- `js/vendor/three.min.js` — pinned Three.js (+ `js/vendor/THREE-LICENSE.txt`).

**Modified:**
- `js/sunpath.js` — becomes the controller + renderer loader.
- `sunpath/index.html` — sky-panel hero + script tags.
- `scripts/sunpath/permalink-template.mjs` — sky-panel hero + script tags.
- `css/sunpath.css` — `.sunpath-globe-stage` sky-panel.
- `scripts/render-og-sunpath.html`, `scripts/render-og-turning.html` — new glowing-globe SVG art.

**Regenerated (never hand-edited):**
- `sunpath/{2026,2027}-{spring-equinox,summer-solstice,autumn-equinox,winter-solstice}/index.html`
- `assets/og-sunpath.png`, `assets/og-{year}-{key}.png` ×8

**Renderer interface (the contract every renderer implements):**
```
createXxxGlobe(container, opts) → {
  render(state),                 // draw for a state snapshot
  setRotation([lonDeg, latDeg]), // apply rotation
  projectPoint([lon, lat]),      // → { x, y, visible } in container px
  resize(),                      // re-fit to container
  destroy()                      // tear down DOM/GL
}
```
`state = { date, subsolar:{lat,lon}, declination, monuments:[…], drift:{year|null, turning} }`. `opts = { size, forced:boolean }`. The controller owns all interaction and computes `state` from `SunPathMath`.

---

## Task 1: Extract the SVG renderer behind the interface (no visual change)

**Files:**
- Create: `js/sunpath-globe-svg.js`
- Modify: `js/sunpath.js` (controller keeps state/interaction; drawing delegates to the renderer)
- Modify: `sunpath/index.html:300-305` (add `<script src="/js/sunpath-globe-svg.js"></script>` before `sunpath.js`)

**Interfaces:**
- Produces: `window.createSvgGlobe(container, opts)` returning the renderer interface above.
- Consumes: `window.SunPathMath`, `d3`, `topojson` (all already loaded).

**Note:** This is a pure refactor — behavior must stay identical. There is **no automated UI harness**, so verification is manual against the parity checklist. Keep the diff mechanical: move drawing functions verbatim, re-wire calls.

- [ ] **Step 1: Create the SVG renderer module skeleton**

Create `js/sunpath-globe-svg.js`:
```js
/* Sun Path — SVG globe renderer (D3-geo). Fallback + instant first paint.
   Implements the GlobeRenderer contract; owns no app state. */
(function (root) {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvgGlobe(container, opts) {
    var M = root.SunPathMath;
    var GLOBE_SIZE = (opts && opts.size) || 480;
    var projection = d3.geoOrthographic()
      .scale(GLOBE_SIZE / 2 - 4)
      .translate([GLOBE_SIZE / 2, GLOBE_SIZE / 2])
      .rotate([0, -10])
      .clipAngle(90);
    var pathGen = d3.geoPath(projection);
    var landFeatures = null;
    var svg = buildSvg();          // moved verbatim from setupGlobe()
    container.appendChild(svg);
    loadLand();                    // moved verbatim (fetch land-110m.json)

    function render(state) { /* draw terminator/subsolar/polar/monuments from state */ }
    function setRotation(rot) { projection.rotate(rot); }
    function projectPoint(lonLat) {
      var c = projection(lonLat);
      return { x: c ? c[0] : 0, y: c ? c[1] : 0, visible: !!c && isVisible(lonLat) };
    }
    function resize() {}
    function destroy() { if (svg.parentNode) svg.parentNode.removeChild(svg); }

    // … buildSvg / loadLand / drawGraticule / renderLand / isVisible …
    // (moved verbatim from the current sunpath.js)

    return { render: render, setRotation: setRotation, projectPoint: projectPoint, resize: resize, destroy: destroy };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createSvgGlobe: createSvgGlobe };
  else root.createSvgGlobe = createSvgGlobe;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Move drawing code from `sunpath.js` into the renderer**

Cut these functions from `js/sunpath.js` into the renderer, unchanged except for using `state` instead of module-level globals: `setupGlobe` (→ `buildSvg`+`loadLand`), `drawGraticule`, `renderLand`, `renderTerminatorAndSubsolar`, `renderPolarCircles`, `isPointVisible` (→ `isVisible`), `renderMonuments`. `renderTerminatorAndSubsolar(state)` reads `state.subsolar`, `state.declination`, `state.monuments` rather than recomputing.

- [ ] **Step 3: Reduce `sunpath.js` to the controller**

`js/sunpath.js` keeps: `init`, `activeDate`, `setupYearScrub`, `setupTimelapse`, `renderTilt`, `idleTick`, monument popover (`showMonumentPopover`, `hideMonumentPopover`, `positionPopover`, `renderMonumentList`), drag handlers. Replace direct SVG calls with the renderer:
```js
var renderer = window.createSvgGlobe(dom.globeContainer, { size: 480 });
function buildState() {
  var date = activeDate();
  return {
    date: date,
    subsolar: M.subsolarPoint(date),
    declination: M.declination(date),
    monuments: monuments,
    drift: { year: null, turning: null }
  };
}
function redrawAll() { renderer.render(buildState()); }
```
Drag handlers call `renderer.setRotation(rotation); renderer.render(buildState());`. `positionPopover` uses `renderer.projectPoint([m.lon, m.lat])` instead of `projection(...)`.

- [ ] **Step 4: Add the script tag**

In `sunpath/index.html`, add before `<script src="/js/sunpath.js"></script>`:
```html
  <script src="/js/sunpath-globe-svg.js"></script>
```

- [ ] **Step 5: Manual verification (no UI harness exists)**

Run a local static server and open the page:
```bash
python3 -m http.server 8000 >/dev/null 2>&1 &
echo "open http://localhost:8000/sunpath/"
```
Expected, against the parity checklist: globe draws; drag rotates; year-scrub moves the terminator; "play 24 hours" sweeps; tilt inset + declination update; monument pin → popover with sunrise azimuth; subsolar caption updates. Kill the server when done: `kill %1`.

- [ ] **Step 6: Commit**
```bash
git add js/sunpath-globe-svg.js js/sunpath.js sunpath/index.html
git commit -m "refactor(sunpath): extract SVG globe behind a renderer interface"
```

---

## Task 2: Pure 3D globe-math helpers (TDD)

**Files:**
- Create: `js/sunpath-globe-math.js`
- Test: `js/sunpath-globe-math.test.js`

**Interfaces:**
- Produces: `lonLatToVec3(lon, lat, r=1) → {x,y,z}`, `subsolarToSunDir({lat,lon}) → {x,y,z}` (unit), `litFactor(pointLonLat, subsolar) → -1..1`, `isLit(pointLonLat, subsolar) → bool`, `alignmentFlareStrength(todayAz, targetAz, windowDeg) → 0..1`, `clamp01(x)`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `js/sunpath-globe-math.test.js`:
```js
'use strict';
var G = require('./sunpath-globe-math.js');
var passed = 0, failed = 0, fails = [];
function approx(a, e, tol, label) {
  if (Math.abs(a - e) <= tol) { passed++; }
  else { failed++; fails.push(label + ': got ' + a + ' want ' + e); }
}
function ok(cond, label) { if (cond) passed++; else { failed++; fails.push(label); } }

// lonLatToVec3 convention
var p0 = G.lonLatToVec3(0, 0, 1);
approx(p0.x, 1, 1e-9, 'lon0lat0 → +X.x'); approx(p0.y, 0, 1e-9, 'lon0lat0 → +X.y'); approx(p0.z, 0, 1e-9, 'lon0lat0 → +X.z');
var pN = G.lonLatToVec3(0, 90, 1);
approx(pN.y, 1, 1e-9, 'north pole → +Y');
var pE = G.lonLatToVec3(90, 0, 1);
approx(pE.z, -1, 1e-9, 'lon90 → −Z');

// litFactor: subsolar point lit (=1), antipode dark (=-1), 90° away ~0
var sub = { lat: 0, lon: 0 };
approx(G.litFactor([0, 0], sub), 1, 1e-9, 'subsolar lit=1');
approx(G.litFactor([180, 0], sub), -1, 1e-9, 'antipode=-1');
approx(G.litFactor([90, 0], sub), 0, 1e-9, '90deg=0');
ok(G.isLit([10, 0], sub) === true, 'near subsolar isLit');
ok(G.isLit([170, 0], sub) === false, 'near antipode !isLit');

// alignmentFlareStrength: exact=1, off-by-window=0, half=0.5
approx(G.alignmentFlareStrength(49.6, 49.6, 1.5), 1, 1e-9, 'exact flare=1');
approx(G.alignmentFlareStrength(51.1, 49.6, 1.5), 0, 1e-9, 'edge flare=0');
approx(G.alignmentFlareStrength(48.85, 49.6, 1.5), 0.5, 1e-9, 'half flare=0.5');
approx(G.alignmentFlareStrength(40, 49.6, 1.5), 0, 1e-9, 'far flare=0');

console.log('globe-math: ' + passed + ' passed, ' + failed + ' failed');
if (failed) { fails.forEach(function (f) { console.log('  ✗ ' + f); }); }
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node js/sunpath-globe-math.test.js`
Expected: error `Cannot find module './sunpath-globe-math.js'`.

- [ ] **Step 3: Implement the module**

Create `js/sunpath-globe-math.js`:
```js
/* Sun Path — pure 3D helpers for the globe renderers. Browser + node. */
(function (root) {
  'use strict';
  var DEG = Math.PI / 180;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function lonLatToVec3(lon, lat, r) {
    if (r == null) r = 1;
    var la = lat * DEG, lo = lon * DEG, cl = Math.cos(la);
    return { x: r * cl * Math.cos(lo), y: r * Math.sin(la), z: -r * cl * Math.sin(lo) };
  }

  function subsolarToSunDir(sub) { return lonLatToVec3(sub.lon, sub.lat, 1); }

  function litFactor(pointLonLat, sub) {
    var p = lonLatToVec3(pointLonLat[0], pointLonLat[1], 1);
    var s = subsolarToSunDir(sub);
    return p.x * s.x + p.y * s.y + p.z * s.z;
  }

  function isLit(pointLonLat, sub) { return litFactor(pointLonLat, sub) > 0; }

  function alignmentFlareStrength(todayAz, targetAz, windowDeg) {
    var d = Math.abs(todayAz - targetAz);
    return clamp01(1 - d / windowDeg);
  }

  var api = {
    clamp01: clamp01, lonLatToVec3: lonLatToVec3, subsolarToSunDir: subsolarToSunDir,
    litFactor: litFactor, isLit: isLit, alignmentFlareStrength: alignmentFlareStrength
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunPathGlobeMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node js/sunpath-globe-math.test.js`
Expected: `globe-math: 14 passed, 0 failed`

- [ ] **Step 5: Commit**
```bash
git add js/sunpath-globe-math.js js/sunpath-globe-math.test.js
git commit -m "feat(sunpath): pure 3D globe-math helpers with tests"
```

---

## Task 3: Capability detection + renderer selection (TDD)

**Files:**
- Create: `js/sunpath-capability.js`
- Test: `js/sunpath-capability.test.js`

**Interfaces:**
- Produces: `selectRenderer(env) → 'gl' | 'svg'` where `env = { webgl, reducedMotion, lowEnd, forceFlat }`; plus browser probes `hasWebGL()`, `prefersReducedMotion()`, `isLowEnd()`, `detectEnv() → env`.
- Consumes: nothing (probes read `window`/`navigator`/`document` at call time).

- [ ] **Step 1: Write the failing test**

Create `js/sunpath-capability.test.js`:
```js
'use strict';
var C = require('./sunpath-capability.js');
var passed = 0, failed = 0, fails = [];
function eq(a, e, label) { if (a === e) passed++; else { failed++; fails.push(label + ': got ' + a + ' want ' + e); } }

eq(C.selectRenderer({ webgl: true,  reducedMotion: false, lowEnd: false, forceFlat: false }), 'gl',  'capable → gl');
eq(C.selectRenderer({ webgl: false, reducedMotion: false, lowEnd: false, forceFlat: false }), 'svg', 'no webgl → svg');
eq(C.selectRenderer({ webgl: true,  reducedMotion: true,  lowEnd: false, forceFlat: false }), 'svg', 'reduced motion → svg');
eq(C.selectRenderer({ webgl: true,  reducedMotion: false, lowEnd: true,  forceFlat: false }), 'svg', 'low-end → svg');
eq(C.selectRenderer({ webgl: true,  reducedMotion: false, lowEnd: false, forceFlat: true  }), 'svg', 'force flat → svg');

console.log('capability: ' + passed + ' passed, ' + failed + ' failed');
if (failed) { fails.forEach(function (f) { console.log('  ✗ ' + f); }); }
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node js/sunpath-capability.test.js`
Expected: `Cannot find module './sunpath-capability.js'`.

- [ ] **Step 3: Implement the module**

Create `js/sunpath-capability.js`:
```js
/* Sun Path — renderer capability detection. selectRenderer() is pure. */
(function (root) {
  'use strict';
  function selectRenderer(env) {
    if (env.forceFlat || !env.webgl || env.reducedMotion || env.lowEnd) return 'svg';
    return 'gl';
  }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function isLowEnd() {
    var mem = navigator.deviceMemory;            // GiB, where supported
    var cores = navigator.hardwareConcurrency;   // logical cores
    if (typeof mem === 'number' && mem <= 2) return true;
    if (typeof cores === 'number' && cores <= 2) return true;
    return false;
  }
  function detectEnv() {
    var forceFlat = /[?&]flat\b/.test(location.search);
    return { webgl: hasWebGL(), reducedMotion: prefersReducedMotion(), lowEnd: isLowEnd(), forceFlat: forceFlat };
  }
  var api = { selectRenderer: selectRenderer, hasWebGL: hasWebGL, prefersReducedMotion: prefersReducedMotion, isLowEnd: isLowEnd, detectEnv: detectEnv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunPathCapability = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node js/sunpath-capability.test.js`
Expected: `capability: 5 passed, 0 failed`

- [ ] **Step 5: Commit**
```bash
git add js/sunpath-capability.js js/sunpath-capability.test.js
git commit -m "feat(sunpath): renderer capability detection with tests"
```

---

## Task 4: Vendor Three.js + minimal GL globe + PE swap

**Files:**
- Create: `js/vendor/three.min.js` (pinned r160 UMD build), `js/vendor/THREE-LICENSE.txt`
- Create: `js/sunpath-globe-gl.js`
- Modify: `js/sunpath.js` (loader: render SVG, then lazy-load GL on `selectRenderer === 'gl'`)
- Modify: `sunpath/index.html` (add `sunpath-globe-math.js`, `sunpath-capability.js` script tags)

**Interfaces:**
- Produces: `window.createGlGlobe(container, opts)` returning the renderer interface; `window.__loadThree() → Promise<THREE>`.
- Consumes: `SunPathGlobeMath`, `SunPathCapability`, `SunPathMath`, `topojson`.

- [ ] **Step 1: Vendor Three.js (pinned)**
```bash
curl -fsSL https://unpkg.com/three@0.160.0/build/three.min.js -o js/vendor/three.min.js
curl -fsSL https://unpkg.com/three@0.160.0/LICENSE -o js/vendor/THREE-LICENSE.txt
head -c 120 js/vendor/three.min.js   # sanity: minified JS, not an error page
```
Expected: minified JS preamble. Add a top comment line noting `three.js r160 (0.160.0), MIT`.

- [ ] **Step 2: GL renderer — dark sphere + coastlines + graticule + drag + projectPoint**

Create `js/sunpath-globe-gl.js`. Build a unit-sphere Earth group; convert `land-110m.json` (TopoJSON) to line segments via the already-loaded `topojson`; draw a 30° graticule; raycast for monument hit-testing; `projectPoint` via `camera`.
```js
/* Sun Path — Three.js globe renderer. Lazy-loaded enhancement. */
(function (root) {
  'use strict';
  var G = root.SunPathGlobeMath;

  function createGlGlobe(container, opts) {
    var THREE = root.THREE;
    var size = (opts && opts.size) || 480;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.2);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size, false);
    renderer.domElement.className = 'sunpath-globe-canvas';
    container.appendChild(renderer.domElement);

    var earth = new THREE.Group();
    scene.add(earth);

    // Base dark sphere (shader added in Task 5; flat dark fill for now).
    var sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x0a0d18 })
    );
    earth.add(sphere);

    // Graticule (every 30°) as line segments slightly above the surface.
    earth.add(buildGraticule(THREE, 1.001));

    var monuments = [];
    var monumentSprites = null;

    // Coastlines from topojson — async, same asset the SVG uses.
    fetch('/assets/sunpath/land-110m.json').then(function (r) { return r.json(); }).then(function (topo) {
      var geo = topojson.feature(topo, topo.objects.land);
      earth.add(buildCoastlines(THREE, geo, 1.002));
      requestRender();
    });

    var rotLon = 0, rotLat = -10;
    applyRotation();

    function applyRotation() {
      earth.quaternion.setFromEuler(new THREE.Euler(
        -rotLat * Math.PI / 180, -rotLon * Math.PI / 180, 0, 'YXZ'));
    }

    var needsRender = true, raf = null;
    function requestRender() { needsRender = true; ensureLoop(); }
    function ensureLoop() { if (!raf) raf = requestAnimationFrame(tick); }
    function tick() {
      raf = null;
      if (needsRender) { needsRender = false; renderer.render(scene, camera); }
    }

    function render(state) {
      monuments = state.monuments || [];
      ensureMonumentSprites(state);
      requestRender();
    }
    function setRotation(rot) { rotLon = rot[0]; rotLat = rot[1]; applyRotation(); requestRender(); }
    function projectPoint(lonLat) {
      var v = G.lonLatToVec3(lonLat[0], lonLat[1], 1.0);
      var world = new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(earth.quaternion);
      var camDir = new THREE.Vector3().subVectors(camera.position, world).normalize();
      var visible = world.clone().normalize().dot(camDir) > 0; // facing camera
      var ndc = world.clone().project(camera);
      return { x: (ndc.x * 0.5 + 0.5) * size, y: (-ndc.y * 0.5 + 0.5) * size, visible: visible };
    }
    function resize() { /* re-fit to container in Task 8 */ }
    function destroy() {
      if (raf) cancelAnimationFrame(raf);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }

    // helpers: buildGraticule, buildCoastlines, ensureMonumentSprites …
    return { render: render, setRotation: setRotation, projectPoint: projectPoint, resize: resize, destroy: destroy };
  }

  function buildGraticule(THREE, r) {
    var pts = [], i, lat, lon;
    for (lon = -180; lon < 180; lon += 30) for (lat = -80; lat < 80; lat += 4) { pushSeg(pts, lon, lat, lon, lat + 4, r); }
    for (lat = -60; lat <= 60; lat += 30) for (lon = -180; lon < 180; lon += 4) { pushSeg(pts, lon, lat, lon + 4, lat, r); }
    var geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb4bee b, transparent: true, opacity: 0.22 }));
  }
  function buildCoastlines(THREE, geo, r) {
    var pts = [];
    geo.features.forEach(function (f) { eachRing(f.geometry, function (ring) {
      for (var i = 0; i < ring.length - 1; i++) pushSeg(pts, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], r);
    }); });
    var g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd4a87a, transparent: true, opacity: 0.7 }));
  }
  function pushSeg(arr, lo1, la1, lo2, la2, r) {
    var a = G.lonLatToVec3(lo1, la1, r), b = G.lonLatToVec3(lo2, la2, r);
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  function eachRing(geom, cb) {
    if (geom.type === 'Polygon') geom.coordinates.forEach(cb);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(function (poly) { poly.forEach(cb); });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createGlGlobe: createGlGlobe };
  else root.createGlGlobe = createGlGlobe;
})(typeof window !== 'undefined' ? window : globalThis);
```
> **Fix on entry:** the literal `0xb4beeb` above must be written without spaces — it is shown spaced only to survive code-fencing. Use `0xb4beeb`.

- [ ] **Step 3: Loader in the controller**

In `js/sunpath.js`, after creating the SVG renderer, add the lazy GL swap:
```js
window.__loadThree = function () {
  if (window.THREE) return Promise.resolve(window.THREE);
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = '/js/vendor/three.min.js';
    s.onload = function () { resolve(window.THREE); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
};
function maybeUpgradeToGl() {
  var env = window.SunPathCapability.detectEnv();
  if (window.SunPathCapability.selectRenderer(env) !== 'gl') return;
  window.__loadThree()
    .then(function () { return loadScript('/js/sunpath-globe-gl.js'); })
    .then(function () {
      var gl = window.createGlGlobe(dom.globeContainer, { size: 480 });
      gl.setRotation(rotation);
      gl.render(buildState());
      renderer.destroy();   // remove SVG
      renderer = gl;
    })
    .catch(function (e) { console.warn('GL globe unavailable, staying on SVG', e); });
}
// call after first paint:
if ('requestIdleCallback' in window) requestIdleCallback(maybeUpgradeToGl);
else setTimeout(maybeUpgradeToGl, 200);
```
Add a tiny `loadScript(src)` helper returning a Promise (same shape as `__loadThree`).

- [ ] **Step 4: Add script tags**

In `sunpath/index.html`, add after `sunpath-math.js`:
```html
  <script src="/js/sunpath-globe-math.js"></script>
  <script src="/js/sunpath-capability.js"></script>
```
(`sunpath-globe-gl.js` is loaded dynamically, not via a tag.)

- [ ] **Step 5: Manual verification**

Serve and open `http://localhost:8000/sunpath/` (capable desktop browser): after ~200ms the flat SVG swaps to a dark 3D sphere with glowing coastlines + graticule; drag rotates; monument popovers still position correctly. Then open `http://localhost:8000/sunpath/?flat`: stays SVG. DevTools → Rendering → emulate `prefers-reduced-motion`: stays SVG.

- [ ] **Step 6: Commit**
```bash
git add js/vendor/three.min.js js/vendor/THREE-LICENSE.txt js/sunpath-globe-gl.js js/sunpath.js sunpath/index.html
git commit -m "feat(sunpath): vendored three.js + minimal GL globe behind progressive enhancement"
```

---

## Task 5: Soul layers — day/night terminator shader, sun-bloom, atmosphere

**Files:**
- Modify: `js/sunpath-globe-gl.js` (replace `MeshBasicMaterial` sphere with a ShaderMaterial; add bloom sprite + atmosphere mesh; update `uSunDir` in `render`)

**Interfaces:**
- Consumes: `state.subsolar`, `state.declination`; `SunPathGlobeMath.subsolarToSunDir`.
- Produces: no new public API (internal layers).

- [ ] **Step 1: Day/night sphere shader (model space)**

Replace the base sphere material with:
```js
var sunDir = new THREE.Vector3(1, 0, 0);
var dayNight = new THREE.ShaderMaterial({
  uniforms: { uSunDir: { value: sunDir } },
  vertexShader:
    'varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader:
    'uniform vec3 uSunDir; varying vec3 vN;' +
    'void main(){' +
    '  float d = dot(normalize(vN), normalize(uSunDir));' +
    '  float day = smoothstep(-0.08, 0.10, d);' +
    '  vec3 night = vec3(0.020, 0.022, 0.050);' +
    '  vec3 dayc  = vec3(0.085, 0.110, 0.190);' +
    '  vec3 twi   = vec3(0.62, 0.34, 0.16);' +     // warm twilight
    '  vec3 col = mix(night, dayc, day);' +
    '  float band = 1.0 - smoothstep(0.0, 0.16, abs(d));' +
    '  col = mix(col, twi, band * 0.55);' +
    '  gl_FragColor = vec4(col, 1.0);' +
    '}'
});
var sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), dayNight);
```
In `render(state)`: `var s = G.subsolarToSunDir(state.subsolar); sunDir.set(s.x, s.y, s.z);` (model space — do **not** apply earth.quaternion; the shader runs in model space so the terminator stays fixed to the surface while dragging, and moves only with time).

- [ ] **Step 2: Sun-bloom sprite (additive)**

```js
function radialSprite(THREE, color, inner) {
  var cv = document.createElement('canvas'); cv.width = cv.height = 128;
  var ctx = cv.getContext('2d');
  var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,220,' + inner + ')');
  g.addColorStop(0.25, 'rgba(255,208,137,0.55)');
  g.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  var tex = new THREE.CanvasTexture(cv);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
}
var sunBloom = radialSprite(THREE, 0xffffff, 1.0); sunBloom.scale.set(1.1, 1.1, 1); earth.add(sunBloom);
```
In `render`: place at the subsolar surface point, model space: `var v = G.lonLatToVec3(state.subsolar.lon, state.subsolar.lat, 1.02); sunBloom.position.set(v.x, v.y, v.z);`

- [ ] **Step 3: Atmosphere rim (fresnel back-sphere)**

```js
var atmo = new THREE.Mesh(
  new THREE.SphereGeometry(1.14, 64, 48),
  new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: sunDir } },
    transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 vN; varying vec3 vView; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader:
      'varying vec3 vN; varying vec3 vView;' +
      'void main(){ float f = pow(1.0 - max(dot(vN, vView), 0.0), 2.2);' +
      ' gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * f, f); }'
  })
);
scene.add(atmo);   // world space, not the earth group
```

- [ ] **Step 4: Manual verification**

Open `/sunpath/`: the globe now has a lit day side, dark night side, a warm twilight band at the terminator, a bright sun glow at the subsolar point, and a gold atmospheric halo. Scrub the year — the terminator sweeps; drag — the terminator stays fixed on the surface (turns with it). Tune the smoothstep ranges / colors against the live render if the band reads too wide or too cool.

- [ ] **Step 5: Commit**
```bash
git add js/sunpath-globe-gl.js
git commit -m "feat(sunpath): day/night terminator, sun-bloom, atmosphere rim"
```

---

## Task 6: Richness — monument beacons, city-lights, polar aurora, idle rotation

**Files:**
- Modify: `js/sunpath-globe-gl.js`

**Interfaces:**
- Consumes: `state.monuments`, `state.subsolar`, `state.declination`, `SunPathGlobeMath.isLit`/`litFactor`/`alignmentFlareStrength`, `SunPathMath.sunriseAzimuth`.

- [ ] **Step 1: Monument beacons (gold sprites, pulse + alignment flare)**

In `ensureMonumentSprites(state)`, create one additive gold sprite per monument at `lonLatToVec3(lon, lat, 1.02)`. Each frame while animating, scale = base·(1 + 0.15·sin(t·2)) and brightness boosted by `alignmentFlareStrength(SunPathMath.sunriseAzimuth(m.lat, state.date), m.marker.azimuth, 1.5)`. Keep the existing raycast → `controller.showPopover(m)` path (the controller still owns the popover; expose a hit-test that returns the monument id and let the controller open the popover, preserving Task 1's behavior).

- [ ] **Step 2: City-lights (restrained, night-side gated)**

Sample ~600 land points once from the coastline rings; build a `THREE.Points` cloud at r=1.004, warm color `0xffce8c`, `size` small, additive. Per frame, fade each point by `clamp01(-litFactor(point, subsolar))` so only the night side glows. Cap to ~250 points on `isLowEnd()`.

- [ ] **Step 3: Polar aurora ribbon**

Two thin ring meshes (`TorusGeometry` flattened, or a band of `LineSegments`) at ±66.5° latitude. Opacity = `clamp01(declination / 23.45)` for the north ring, `clamp01(-declination / 23.45)` for the south; color jade `0x74b495`, additive.

- [ ] **Step 4: Idle auto-rotation + render-on-demand pause**

Add a slow idle spin (≈ 0.3°/frame on `rotLon`) that runs only when not dragging and not reduced-motion. Drive the animation loop continuously **only while** something animates (idle spin, time-lapse, pulse); otherwise fall back to on-demand. Pause entirely when hidden or offscreen:
```js
var io = new IntersectionObserver(function (e) { running = e[0].isIntersecting; toggleLoop(); });
io.observe(container);
document.addEventListener('visibilitychange', function () { running = !document.hidden; toggleLoop(); });
```

- [ ] **Step 5: Manual verification**

Monuments glow gold and Stonehenge flares near the summer solstice (scrub to ~21 June); the night side sparkles faintly; an aurora ribbon brightens at the winter/summer poles as you scrub; the globe spins slowly and stops when you scroll it offscreen or hide the tab. Confirm `?flat` and reduced-motion still fall back to a static SVG.

- [ ] **Step 6: Commit**
```bash
git add js/sunpath-globe-gl.js
git commit -m "feat(sunpath): monument beacons, city-lights, aurora, idle rotation"
```

---

## Task 7: Deep-time drift beam (live hub only)

**Files:**
- Modify: `js/sunpath-globe-gl.js` (beam + ghost beam)
- Modify: `js/sunpath.js` (feed `state.drift` from the time-machine scrub)
- Modify: `js/sunpath-time-machine.js` (emit the scrubbed `{ year, turning, monumentId }`)

**Interfaces:**
- Consumes: `SunPathMath.sunriseAzimuthForYear(lat, year, turning)`, `SunPathMath.sunsetAzimuthForYear(lat, year, turning)`, monument `marker.azimuth`.
- Produces: `state.drift = { monumentId, year, turning }` (or `{ year: null }` when inactive).

- [ ] **Step 1: Emit drift state from the time-machine**

In `js/sunpath-time-machine.js`, when the millennia scrubber moves, call a controller hook `window.__sunpathSetDrift({ monumentId: id, year: y, turning: t })`. When the section is inactive, the controller leaves `state.drift.year = null`.

- [ ] **Step 2: Beam geometry in the GL renderer**

When `state.drift.year != null`, for that monument compute `az = sunriseAzimuthForYear(m.lat, year, turning)` (or sunset per `m.event`) and draw a gold beam from the monument outward along the local horizon bearing; draw a faint dashed **ghost beam** at the present-day azimuth `m.marker.azimuth`. Hide both when `year == null`. Build the bearing direction in model space from the monument's local east/north basis (east = ∂/∂lon, north = ∂/∂lat of `lonLatToVec3`).

- [ ] **Step 3: Manual verification**

On the hub, scrub "Walk through time": a gold beam swings off Stonehenge as the millennia change, with a ghost beam pinned at the builders' azimuth. On a subpage (frozen), confirm no beam/scrubber appears (subpages don't load the time-machine).

- [ ] **Step 4: Commit**
```bash
git add js/sunpath-globe-gl.js js/sunpath.js js/sunpath-time-machine.js
git commit -m "feat(sunpath): deep-time drift beam wired to the time-machine"
```

---

## Task 8: Dark sky-panel stage + hub layout

**Files:**
- Modify: `css/sunpath.css` (add `.sunpath-globe-stage`)
- Modify: `sunpath/index.html` (wrap the globe in the stage; verify responsive sizing)
- Modify: `js/sunpath-globe-gl.js` + `js/sunpath-globe-svg.js` (`resize()` fits the square stage)

**Interfaces:** none new.

- [ ] **Step 1: Sky-panel CSS**

Add to `css/sunpath.css`:
```css
.sunpath-globe-stage {
  position: relative;
  margin: 1.5rem auto;
  max-width: 520px;
  aspect-ratio: 1 / 1;
  border-radius: 18px;
  background: radial-gradient(circle at 42% 40%, #0d0d18 0%, #08080f 60%, #040407 100%);
  overflow: hidden;
}
.sunpath-globe-stage .sunpath-globe-canvas,
.sunpath-globe-stage .sunpath-globe-svg { width: 100%; height: 100%; display: block; }
```
(The page stays parchment; only this panel is dark. In `body.constellation` the page is already dark and the panel blends in.)

- [ ] **Step 2: Wrap the globe**

In `sunpath/index.html`, change the hero so `#sunpath-globe` sits inside `<div class="sunpath-globe-stage">…</div>`. Keep the popover inside `#sunpath-globe`.

- [ ] **Step 3: `resize()` fits the stage**

Implement `resize()` in both renderers to read `container.clientWidth` and re-fit (GL: `renderer.setSize(w, w, false)`, `camera.aspect = 1`; SVG: viewBox already scales). Call on `window.resize` (debounced) and after the GL swap.

- [ ] **Step 4: Manual verification**

The hero is a dark rounded panel on the parchment page; the globe fills it on desktop and mobile widths (resize the window). Toggle star mode (moon icon) — the panel blends into the dark page.

- [ ] **Step 5: Commit**
```bash
git add css/sunpath.css sunpath/index.html js/sunpath-globe-gl.js js/sunpath-globe-svg.js
git commit -m "feat(sunpath): dark sky-panel stage for the hero globe"
```

---

## Task 9: Propagate to the 8 subpages (template + rebuild)

**Files:**
- Modify: `scripts/sunpath/permalink-template.mjs` (sky-panel hero + script tags)
- Regenerate: the 8 `sunpath/<year>-<key>/index.html`

**Interfaces:** none.

- [ ] **Step 1: Edit the template**

In `scripts/sunpath/permalink-template.mjs`: wrap `#sunpath-globe` in `<div class="sunpath-globe-stage">…</div>` (mirror Task 8), and in the `<script>` block add, after `/js/sunpath-math.js`:
```html
  <script src="/js/sunpath-globe-math.js"></script>
  <script src="/js/sunpath-capability.js"></script>
  <script src="/js/sunpath-globe-svg.js"></script>
```
(Order: keep `/js/sunpath.js` after these; `sunpath-globe-gl.js` loads dynamically.)

- [ ] **Step 2: Rebuild and check for drift**
```bash
node scripts/sunpath/build-permalinks.mjs
node scripts/sunpath/build-permalinks.mjs --check
```
Expected: 8 files written; `--check` reports all match (exit 0).

- [ ] **Step 3: Manual verification**

Open `http://localhost:8000/sunpath/2026-summer-solstice/` — the dark sky-panel hero shows the GL globe frozen at the solstice instant (terminator fixed, sun at the Tropic of Cancer), no time-machine scrubber, "see live" link intact. Confirm `?flat` falls back to SVG.

- [ ] **Step 4: Commit**
```bash
git add scripts/sunpath/permalink-template.mjs sunpath/2026-*/index.html sunpath/2027-*/index.html
git commit -m "feat(sunpath): propagate the WebGL globe to the 8 turning subpages"
```

---

## Task 10: Regenerate OG thumbnails (SVG art, GPU-disabled pipeline)

**Files:**
- Modify: `scripts/render-og-sunpath.html`, `scripts/render-og-turning.html`
- Regenerate: `assets/og-sunpath.png`, `assets/og-{year}-{key}.png` ×8

**Note (ground-truth correction to the spec):** `scripts/build-og-sunpath.sh` runs headless Chrome with `--disable-gpu` and screenshots these bespoke SVG templates. WebGL will not render there, so we **redraw the new glowing-globe aesthetic as static SVG art** in the templates (deep-space gradient, warm atmosphere rim, sun-bloom, gold monument dots) rather than screenshotting the live WebGL globe. Real-WebGL OG capture (enabling SwiftShader) is an explicit future option, out of scope here.

- [ ] **Step 1: Restyle the OG SVG art**

In both render-og templates, replace the current flat globe/motif with the synthesis look in the warm palette: a dark sphere (`radial-gradient`/SVG `radialGradient` from `#0d0d18`), a soft gold rim, a warm sun-bloom near the lit limb, faint lavender graticule, and gold monument dots. Keep all content at `y ≤ 560` (Chrome headless clips the bottom; see the template's existing comment) and the `1200×630` frame.

- [ ] **Step 2: Regenerate both years**
```bash
bash scripts/build-og-sunpath.sh 2026
bash scripts/build-og-sunpath.sh 2027
```
Expected: `assets/og-sunpath.png` + 8 turning PNGs rewritten, each exactly `1200×630` (the script crops via ImageMagick).

- [ ] **Step 3: Manual verification**
```bash
python3 -c "from struct import unpack; f=open('assets/og-sunpath.png','rb').read(); print('size', unpack('>II', f[16:24]))"
```
Expected: `size (1200, 630)`. Open the PNGs and confirm the new dark/glowing globe shows; this is what HN/Twitter/Slack will render as the link card.

- [ ] **Step 4: Commit**
```bash
git add scripts/render-og-sunpath.html scripts/render-og-turning.html assets/og-sunpath.png assets/og-2026-*.png assets/og-2027-*.png
git commit -m "feat(sunpath): regenerate OG thumbnails with the new globe"
```

---

## Self-Review

**Spec coverage:**
- Goal / honest framing → reflected in Task ordering (hero + drift beam + thumbnails). ✓
- All 8 layers → Tasks 5 (terminator, sun-bloom, atmosphere), 6 (beacons, city-lights, aurora, idle), 7 (drift beam). ✓
- Controller/two-renderer architecture + PE loader → Tasks 1, 3, 4. ✓
- Warm palette / dark sky-panel → Tasks 5, 8 (and Global Constraints). ✓
- Mobile/perf (lazy-load, render-on-demand, DPR cap, pause hidden/offscreen, fewer points low-end) → Tasks 4, 6. ✓
- Subpage propagation via template + `--check` → Task 9. ✓
- OG thumbnails → Task 10 (with pipeline correction). ✓
- Feature parity + frozen-instant mode → Task 1 (carried), Task 9 (verified frozen). ✓
- Testing (pure-function harnesses + manual visual + `--check`) → Tasks 2, 3 automated; 1, 4–10 manual/visual + build checks. ✓

**Placeholder scan:** Visual tasks (1, 4–10) use explicit manual-verification steps because **no automated UI/WebGL test harness exists** in this repo — this is a deliberate, stated choice, not a TODO. The two open questions from the spec are resolved here: drift-beam reuses the existing time-machine scrub (Task 7); Three.js pinned at r160 (Task 4). The one code-fence artifact (`0xb4beeb`) is called out inline with a fix-on-entry note.

**Type consistency:** The renderer contract (`render`, `setRotation`, `projectPoint`, `resize`, `destroy`) is identical across `createSvgGlobe` (Task 1) and `createGlGlobe` (Task 4). `selectRenderer(env)` env keys (`webgl`, `reducedMotion`, `lowEnd`, `forceFlat`) match between Task 3's tests, implementation, and `detectEnv`. `lonLatToVec3`/`subsolarToSunDir`/`litFactor`/`alignmentFlareStrength` (Task 2) are used with matching signatures in Tasks 4–7. `state` shape is consistent across controller and both renderers.

**Risk to watch during execution:** Task 1 (the refactor) is the highest-risk, lowest-testability step — verify parity carefully before building on it. If GL ever underperforms on mobile, `?flat` and the capability gate keep the SVG fallback one flag away.
