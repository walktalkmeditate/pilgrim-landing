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
        '  vec3 dayc  = vec3(0.10, 0.105, 0.15);' +
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
      new THREE.SphereGeometry(1.04, 64, 48),
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
          '  float f = pow(1.0 - max(dot(vN, vView), 0.0), 3.0);' +
          '  gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * f * 0.85, f * 0.85);' +
          '}'
      })
    );
    scene.add(atmo);

    // Graticule (every 30°) as line segments slightly above the surface.
    earth.add(buildGraticule(THREE, 1.001));

    // ---- Monument beacons (Task 6) ----
    // Built once; updated per frame for pulse + flare. Never torn down per render().
    var beaconGroup = null;
    var beaconMat = null;
    var beaconTexture = null;
    var beaconEntries = []; // [{sprite, baseBrightness, monument}]
    var lastMonumentsRef = null;  // identity check — only rebuild when array changes

    function makeBeaconTexture() {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var ctx = cv.getContext('2d');
      var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0,    'rgba(255,220,120,1)');
      g.addColorStop(0.35, 'rgba(255,190,80,0.65)');
      g.addColorStop(1,    'rgba(255,160,60,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    }

    function ensureBeaconGroup(mons) {
      if (mons === lastMonumentsRef) return; // same array — no rebuild
      lastMonumentsRef = mons;

      if (beaconGroup) {
        earth.remove(beaconGroup);
        beaconEntries = [];
        beaconGroup = null;
      }
      if (!mons || !mons.length) return;

      if (!beaconTexture) beaconTexture = makeBeaconTexture();

      beaconGroup = new THREE.Group();
      mons.forEach(function (m) {
        var mat = new THREE.SpriteMaterial({
          map: beaconTexture,
          color: 0xffdc78,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.9
        });
        var sprite = new THREE.Sprite(mat);
        var v = G.lonLatToVec3(m.lon, m.lat, 1.02);
        sprite.position.set(v.x, v.y, v.z);
        sprite.scale.set(0.055, 0.055, 1);
        beaconGroup.add(sprite);
        beaconEntries.push({ sprite: sprite, mat: mat, monument: m });
      });
      earth.add(beaconGroup);
    }

    function updateBeacons(state, t) {
      if (!beaconGroup || !beaconEntries.length) return;
      var pulse = 1 + 0.15 * Math.sin(t * 2);
      var baseScale = 0.055;
      beaconEntries.forEach(function (entry) {
        var flare = 0;
        var m = entry.monument;
        if (m.marker && typeof m.marker.azimuth === 'number' && state.date) {
          var todayAz = root.SunPathMath.sunriseAzimuth(m.lat, state.date);
          if (todayAz !== null) {
            flare = G.alignmentFlareStrength(todayAz, m.marker.azimuth, 1.5);
          }
        }
        var brightness = G.clamp01(0.75 + 0.25 * flare);
        entry.mat.opacity = brightness * pulse;
        var s = baseScale * pulse;
        entry.sprite.scale.set(s, s, 1);
      });
    }

    // ---- City-lights (Task 6) ----
    // Sampled from coastline land rings; built once after geojson loads.
    var cityLightsPoints = null;   // THREE.Points
    var cityLightsMat = null;
    var cityLightLonLats = [];     // raw [[lon,lat], ...] for per-frame lit test

    function buildCityLights(geo) {
      var cap = root.SunPathCapability && root.SunPathCapability.isLowEnd();
      var target = cap ? 250 : 600;
      var allPts = [];
      geo.features.forEach(function (f) {
        eachRing(f.geometry, function (ring) {
          // Sample roughly every N-th vertex to spread coverage.
          var step = Math.max(1, Math.floor(ring.length / 8));
          for (var i = 0; i < ring.length - 1; i += step) {
            allPts.push([ring[i][0], ring[i][1]]);
          }
        });
      });
      // Shuffle and trim to target count.
      for (var i = allPts.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = allPts[i]; allPts[i] = allPts[j]; allPts[j] = tmp;
      }
      var pts = allPts.slice(0, target);
      cityLightLonLats = pts;

      var positions = new Float32Array(pts.length * 3);
      for (var k = 0; k < pts.length; k++) {
        var v = G.lonLatToVec3(pts[k][0], pts[k][1], 1.004);
        positions[k * 3]     = v.x;
        positions[k * 3 + 1] = v.y;
        positions[k * 3 + 2] = v.z;
      }
      var geo3 = new THREE.BufferGeometry();
      geo3.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

      cityLightsMat = new THREE.PointsMaterial({
        color: 0xffce8c,
        size: 0.012,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
      });
      cityLightsPoints = new THREE.Points(geo3, cityLightsMat);
      earth.add(cityLightsPoints);
    }

    function updateCityLights(state) {
      if (!cityLightsMat || !state.subsolar) return;
      // Average night-side fraction to drive overall opacity — cheap, tasteful.
      // Sample the stored lon/lat list; use every 4th to keep it light.
      var nightSum = 0, count = 0;
      for (var i = 0; i < cityLightLonLats.length; i += 4) {
        var lf = G.litFactor(cityLightLonLats[i], state.subsolar);
        nightSum += G.clamp01(-lf);
        count++;
      }
      var nightFrac = count > 0 ? nightSum / count : 0;
      // Show lights only on night side; overall opacity cap 0.55 keeps it restrained.
      cityLightsMat.opacity = G.clamp01(nightFrac * 2.5) * 0.55;
    }

    // ---- Polar aurora ribbons (Task 6) ----
    var auroraGroup = null;
    var auroraNorthMat = null;
    var auroraSouthMat = null;

    function buildAurora() {
      auroraGroup = new THREE.Group();

      function makeRibbon(latDeg) {
        var pts = [];
        var r = 1.006;
        for (var lon = -180; lon <= 180; lon += 4) {
          var v = G.lonLatToVec3(lon, latDeg, r);
          pts.push(v.x, v.y, v.z);
        }
        // Close the ring by repeating the first point.
        var v0 = G.lonLatToVec3(-180, latDeg, r);
        pts.push(v0.x, v0.y, v0.z);

        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        var mat = new THREE.LineBasicMaterial({
          color: 0x74b495,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        return { line: new THREE.Line(geo, mat), mat: mat, geo: geo };
      }

      var north = makeRibbon(66.5);
      var south = makeRibbon(-66.5);
      auroraNorthMat = north.mat;
      auroraSouthMat = south.mat;
      auroraGroup.add(north.line);
      auroraGroup.add(south.line);
      earth.add(auroraGroup);

      return { northGeo: north.geo, southGeo: south.geo };
    }

    var auroraGeos = null;

    function updateAurora(state) {
      if (!auroraNorthMat || !auroraSouthMat) return;
      var decl = state.declination || 0;
      // North aurora visible at summer solstice (positive declination),
      // south at winter solstice (negative declination). Cap to 0.45 — restrained.
      auroraNorthMat.opacity = G.clamp01(decl / 23.45) * 0.45;
      auroraSouthMat.opacity = G.clamp01(-decl / 23.45) * 0.45;
    }

    // Coastlines + city-lights share the same geojson fetch.
    fetch('/assets/sunpath/land-110m.json').then(function (r) { return r.json(); }).then(function (topo) {
      var geo = root.topojson.feature(topo, topo.objects.land);
      earth.add(buildCoastlines(THREE, geo, 1.002));
      buildCityLights(geo);
      requestRender();
    }).catch(function (err) { console.warn('GL coastlines failed', err); });

    // Aurora is built immediately (no data dependency).
    auroraGeos = buildAurora();

    var rotLon = 0, rotLat = -10;
    applyRotation();

    function applyRotation() {
      var DEG = Math.PI / 180;
      var qLon = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rotLon - 90) * DEG);
      var qLat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (-rotLat) * DEG);
      earth.quaternion.copy(qLat.multiply(qLon));
    }

    // ---- Continuous animation loop with battery-safe pausing (Task 6) ----
    // `running` = tab visible AND globe intersecting viewport.
    // `dragging` = user is actively dragging (pauses idle spin, not the loop).
    var running = true;
    var dragging = false;
    var needsRender = true;
    var raf = null;
    var animClock = 0;      // elapsed seconds for pulse/effects
    var lastTimestamp = 0;

    function requestRender() { needsRender = true; if (running) ensureLoop(); }

    function ensureLoop() {
      if (!raf && running) raf = requestAnimationFrame(tick);
    }

    function cancelLoop() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    function toggleLoop() {
      if (running) ensureLoop();
      else cancelLoop();
    }

    function tick(timestamp) {
      raf = null;
      var dt = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.1) : 0;
      lastTimestamp = timestamp;
      animClock += dt;

      // Idle auto-rotation — only when not dragging.
      if (!dragging) {
        rotLon += 0.12;   // ~0.12°/frame @60fps ≈ 7°/s — slow contemplative spin
        if (rotLon > 180) rotLon -= 360;
        applyRotation();
        needsRender = true;
      }

      if (needsRender) {
        needsRender = false;
        updateBeacons(currentState, animClock);
        updateCityLights(currentState);
        updateAurora(currentState);
        glRenderer.render(scene, camera);
      }

      if (running) raf = requestAnimationFrame(tick);
    }

    // Pause/resume based on visibility and intersection.
    var io = new IntersectionObserver(function (entries) {
      running = entries[0].isIntersecting;
      lastTimestamp = 0;
      toggleLoop();
    });
    io.observe(container);

    document.addEventListener('visibilitychange', onVisibilityChange);
    function onVisibilityChange() {
      running = !document.hidden;
      lastTimestamp = 0;
      toggleLoop();
    }

    // Keep the last rendered state for per-frame updates.
    var currentState = {};

    function render(state) {
      currentState = state;
      var mons = state.monuments || [];
      ensureBeaconGroup(mons);

      if (state.subsolar) {
        var s = G.subsolarToSunDir(state.subsolar);
        sunDir.set(s.x, s.y, s.z);
        dayNight.uniforms.uSunDir.value = sunDir;

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
      cancelLoop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);

      sphere.geometry.dispose();
      dayNight.dispose();
      if (sunBloom.material.map) sunBloom.material.map.dispose();
      sunBloom.material.dispose();
      atmo.geometry.dispose();
      atmo.material.dispose();

      if (beaconTexture) { beaconTexture.dispose(); beaconTexture = null; }
      if (beaconGroup) {
        beaconEntries.forEach(function (e) { e.mat.dispose(); });
        beaconEntries = [];
        beaconGroup = null;
      }

      if (cityLightsMat) {
        if (cityLightsPoints && cityLightsPoints.geometry) cityLightsPoints.geometry.dispose();
        cityLightsMat.dispose();
        cityLightsMat = null;
        cityLightsPoints = null;
      }

      if (auroraGeos) {
        auroraGeos.northGeo.dispose();
        auroraGeos.southGeo.dispose();
      }
      if (auroraNorthMat) { auroraNorthMat.dispose(); auroraNorthMat = null; }
      if (auroraSouthMat) { auroraSouthMat.dispose(); auroraSouthMat = null; }

      glRenderer.dispose();
      if (glRenderer.domElement.parentNode) {
        glRenderer.domElement.parentNode.removeChild(glRenderer.domElement);
      }
    }

    // Wire pointer events exactly as SVG renderer does, so controller drag/click logic works.
    var canvas = glRenderer.domElement;

    function onDragStart(e) {
      dragging = true;
      if (opts && opts.onDragStart) opts.onDragStart(e);
    }
    function onDragEnd(e) {
      dragging = false;
      lastTimestamp = 0;  // reset dt so the first idle frame doesn't jump
      if (opts && opts.onDragEnd) opts.onDragEnd(e);
    }

    canvas.addEventListener('pointerdown',   onDragStart);
    if (opts && opts.onDragMove) canvas.addEventListener('pointermove', opts.onDragMove);
    canvas.addEventListener('pointerup',     onDragEnd);
    canvas.addEventListener('pointercancel', onDragEnd);
    canvas.addEventListener('pointerleave',  onDragEnd);

    // Monument click via raycaster (unchanged from Task 4/5).
    if (opts && opts.onMonumentClick) {
      canvas.addEventListener('click', function (e) {
        if (!beaconGroup || !beaconGroup.children.length) return;
        var rect = canvas.getBoundingClientRect();
        var ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        var raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        // Beacon sprites are not directly raycasted; use small invisible meshes for hit-test.
        // Build ephemeral hit proxies from beaconEntries positions.
        var proxies = beaconEntries.map(function (entry) {
          var m = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 6, 4),
            new THREE.MeshBasicMaterial()
          );
          m.position.copy(entry.sprite.position);
          m._monument = entry.monument;
          return m;
        });
        var hits = raycaster.intersectObjects(proxies);
        proxies.forEach(function (p) { p.geometry.dispose(); p.material.dispose(); });
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
