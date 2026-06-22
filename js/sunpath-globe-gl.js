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
    var glRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    glRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    glRenderer.setSize(size, size, false);
    glRenderer.domElement.className = 'sunpath-globe-canvas';
    container.appendChild(glRenderer.domElement);

    var earth = new THREE.Group();
    scene.add(earth);

    // Day/night terminator shader (model space).
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
        '  vec3 twi   = vec3(0.62, 0.34, 0.16);' +
        '  vec3 col = mix(night, dayc, day);' +
        '  float band = 1.0 - smoothstep(0.0, 0.16, abs(d));' +
        '  col = mix(col, twi, band * 0.55);' +
        '  gl_FragColor = vec4(col, 1.0);' +
        '}'
    });
    var sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), dayNight);
    earth.add(sphere);

    // Sun-bloom sprite — additive, in earth group (rotates with surface).
    function radialSprite(color, inner) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 128;
      var ctx = cv.getContext('2d');
      var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,244,220,' + inner + ')');
      g.addColorStop(0.25, 'rgba(255,208,137,0.55)');
      g.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      var tex = new THREE.CanvasTexture(cv);
      return new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: color, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    }
    var sunBloom = radialSprite(0xffffff, 1.0);
    sunBloom.scale.set(1.1, 1.1, 1);
    earth.add(sunBloom);

    // Atmosphere rim — back-side Fresnel sphere in world space, additive gold.
    var atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { uSunDir: { value: sunDir } },
        transparent: true, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader:
          'varying vec3 vN; varying vec3 vView;' +
          'void main(){' +
          '  vN = normalize(normalMatrix * normal);' +
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
          '  vView = normalize(-mv.xyz);' +
          '  gl_Position = projectionMatrix * mv;' +
          '}',
        fragmentShader:
          'varying vec3 vN; varying vec3 vView;' +
          'void main(){' +
          '  float f = pow(1.0 - max(dot(vN, vView), 0.0), 2.2);' +
          '  gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * f, f);' +
          '}'
      })
    );
    scene.add(atmo);

    // Graticule (every 30°) as line segments slightly above the surface.
    earth.add(buildGraticule(THREE, 1.001));

    var monuments = [];
    var monumentPins = null;

    // Coastlines from topojson — async, same asset the SVG uses.
    fetch('/assets/sunpath/land-110m.json').then(function (r) { return r.json(); }).then(function (topo) {
      var geo = root.topojson.feature(topo, topo.objects.land);
      earth.add(buildCoastlines(THREE, geo, 1.002));
      requestRender();
    }).catch(function (err) { console.warn('GL coastlines failed', err); });

    var rotLon = 0, rotLat = -10;
    applyRotation();

    function applyRotation() {
      var DEG = Math.PI / 180;
      var qLon = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rotLon - 90) * DEG);
      var qLat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (-rotLat) * DEG);
      earth.quaternion.copy(qLat.multiply(qLon));
    }

    var needsRender = true, raf = null;
    function requestRender() { needsRender = true; ensureLoop(); }
    function ensureLoop() { if (!raf) raf = requestAnimationFrame(tick); }
    function tick() {
      raf = null;
      if (needsRender) { needsRender = false; glRenderer.render(scene, camera); }
    }

    function render(state) {
      monuments = state.monuments || [];
      ensureMonumentPins(monuments);

      if (state.subsolar) {
        // uSunDir in model (earth-local) space — no quaternion multiplication.
        // The shader runs in model space so the terminator stays fixed to the
        // surface while the user drags and only moves when the date changes.
        var s = G.subsolarToSunDir(state.subsolar);
        sunDir.set(s.x, s.y, s.z);
        dayNight.uniforms.uSunDir.value = sunDir;

        // Sun-bloom at the subsolar surface point, model space.
        var bv = G.lonLatToVec3(state.subsolar.lon, state.subsolar.lat, 1.02);
        sunBloom.position.set(bv.x, bv.y, bv.z);
      }

      requestRender();
    }

    function setRotation(rot) {
      rotLon = rot[0];
      rotLat = rot[1];
      applyRotation();
      requestRender();
    }

    function redrawStatic() {
      // No-op for GL: render() already redraws the full scene each frame.
    }

    function getSvg() {
      // Return the canvas for pointer capture (matches SVG renderer contract).
      return glRenderer.domElement;
    }

    function projectPoint(lonLat) {
      var v = G.lonLatToVec3(lonLat[0], lonLat[1], 1.0);
      var world = new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(earth.quaternion);
      var camSpace = world.clone().applyMatrix4(camera.matrixWorldInverse);
      var visible = camSpace.z < 0;
      var ndc = world.clone().project(camera);
      return {
        x: (ndc.x * 0.5 + 0.5) * size,
        y: (-ndc.y * 0.5 + 0.5) * size,
        visible: visible
      };
    }

    function resize() {
      // Re-fit to container (detailed sizing deferred to Task 8).
    }

    function destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (pinMat) { pinMat.dispose(); pinMat = null; }
      glRenderer.dispose();
      if (glRenderer.domElement.parentNode) {
        glRenderer.domElement.parentNode.removeChild(glRenderer.domElement);
      }
    }

    var pinMat = null;

    function ensureMonumentPins(mons) {
      // Remove old pin group if present.
      if (monumentPins) {
        earth.remove(monumentPins);
        monumentPins.children.forEach(function (c) {
          if (c.geometry) c.geometry.dispose();
        });
        monumentPins = null;
      }
      if (!mons || !mons.length) return;
      if (!pinMat) pinMat = new THREE.MeshBasicMaterial({ color: 0xd4a87a });
      monumentPins = new THREE.Group();
      mons.forEach(function (m) {
        var v = G.lonLatToVec3(m.lon, m.lat, 1.018);
        var pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), pinMat);
        pin.position.set(v.x, v.y, v.z);
        pin._monument = m;
        monumentPins.add(pin);
      });
      earth.add(monumentPins);
    }

    // Wire pointer events exactly as SVG renderer does, so controller drag/click logic works.
    var canvas = glRenderer.domElement;
    if (opts && opts.onDragStart)  canvas.addEventListener('pointerdown',   opts.onDragStart);
    if (opts && opts.onDragMove)   canvas.addEventListener('pointermove',   opts.onDragMove);
    if (opts && opts.onDragEnd)    canvas.addEventListener('pointerup',     opts.onDragEnd);
    if (opts && opts.onDragEnd)    canvas.addEventListener('pointercancel', opts.onDragEnd);
    if (opts && opts.onDragEnd)    canvas.addEventListener('pointerleave',  opts.onDragEnd);

    // Monument click via raycaster.
    if (opts && opts.onMonumentClick) {
      canvas.addEventListener('click', function (e) {
        if (!monumentPins || !monumentPins.children.length) return;
        var rect = canvas.getBoundingClientRect();
        var ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        var hits = raycaster.intersectObjects(monumentPins.children);
        if (hits.length > 0 && hits[0].object._monument) {
          opts.onMonumentClick(hits[0].object._monument);
        }
      });
    }

    requestRender();

    return {
      render: render,
      setRotation: setRotation,
      redrawStatic: redrawStatic,
      getSvg: getSvg,
      projectPoint: projectPoint,
      resize: resize,
      destroy: destroy
    };
  }

  function buildGraticule(THREE, r) {
    var pts = [], lat, lon;
    for (lon = -180; lon < 180; lon += 30) {
      for (lat = -80; lat < 80; lat += 4) {
        pushSeg(pts, lon, lat, lon, lat + 4, r);
      }
    }
    for (lat = -60; lat <= 60; lat += 30) {
      for (lon = -180; lon < 180; lon += 4) {
        pushSeg(pts, lon, lat, lon + 4, lat, r);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xb4beeb,
      transparent: true,
      opacity: 0.22
    }));
  }

  function buildCoastlines(THREE, geo, r) {
    var pts = [];
    geo.features.forEach(function (f) {
      eachRing(f.geometry, function (ring) {
        for (var i = 0; i < ring.length - 1; i++) {
          pushSeg(pts, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], r);
        }
      });
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0xd4a87a,
      transparent: true,
      opacity: 0.7
    }));
  }

  function pushSeg(arr, lo1, la1, lo2, la2, r) {
    var a = G.lonLatToVec3(lo1, la1, r), b = G.lonLatToVec3(lo2, la2, r);
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  function eachRing(geom, cb) {
    if (geom.type === 'Polygon') geom.coordinates.forEach(cb);
    else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(function (poly) { poly.forEach(cb); });
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createGlGlobe: createGlGlobe };
  else root.createGlGlobe = createGlGlobe;
})(typeof window !== 'undefined' ? window : globalThis);
