/* =============================================
   Sun Path — controller + globe renderer

   Renders an orthographic globe with day/night terminator and
   subsolar point at the current UTC instant. Year-scrub slider
   lets visitor walk through the year. Monument pins reveal
   their alignments. Time machine slider moves through obliquity
   over millennia.

   Stage A: globe + terminator + subsolar + year-scrub +
            axial-tilt inset + monument pins.

   Depends on: js/sunpath-math.js, js/vendor/d3-geo.min.js,
               js/vendor/topojson-client.min.js
   ============================================= */

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var M = window.SunPathMath;
  if (!M) {
    console.error('SunPathMath not loaded');
    return;
  }

  // --- Globe state ---

  var GLOBE_SIZE = 480;
  var globeSvg = null;
  var projection = null;
  var pathGen = null;
  var landFeatures = null;
  var monuments = [];
  var rotation = [0, -10];
  var scrubDate = null;
  var idleTimerId = null;
  var dragState = null;

  var dom = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    dom.globeContainer = document.getElementById('sunpath-globe');
    dom.subsolarCaption = document.getElementById('sunpath-subsolar');
    dom.yearScrub = document.getElementById('sunpath-year-scrub');
    dom.scrubLabel = document.getElementById('sunpath-scrub-label');
    dom.tiltInset = document.getElementById('sunpath-tilt');
    dom.monumentList = document.getElementById('sunpath-monuments');
    dom.monumentDetail = document.getElementById('sunpath-monument-detail');

    if (!dom.globeContainer) return;

    setupGlobe();
    setupYearScrub();
    renderTilt(activeDate());

    idleTimerId = setInterval(idleTick, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(idleTimerId);
        idleTimerId = null;
      } else if (!idleTimerId) {
        idleTimerId = setInterval(idleTick, 60000);
        idleTick();
      }
    });
  }

  // --- DOM helpers ---

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) el.setAttribute(k, attrs[k]);
    }
    return el;
  }

  function htmlEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function clearChildren(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // --- Globe setup ---

  function setupGlobe() {
    if (typeof d3 === 'undefined') {
      console.error('d3-geo not loaded');
      return;
    }

    projection = d3.geoOrthographic()
      .scale(GLOBE_SIZE / 2 - 4)
      .translate([GLOBE_SIZE / 2, GLOBE_SIZE / 2])
      .rotate(rotation)
      .clipAngle(90);
    pathGen = d3.geoPath(projection);

    globeSvg = svgEl('svg', {
      'class': 'sunpath-globe-svg',
      'viewBox': '0 0 ' + GLOBE_SIZE + ' ' + GLOBE_SIZE,
      'width': GLOBE_SIZE,
      'height': GLOBE_SIZE,
      'role': 'img',
      'aria-label': 'Globe showing day and night with the sun directly overhead at one point.'
    });
    dom.globeContainer.appendChild(globeSvg);

    // Defs: clip path matching the sphere so halos / pins never bleed past
    // the globe edge.
    var defs = svgEl('defs');
    var clip = svgEl('clipPath', { id: 'sunpath-globe-clip' });
    clip.appendChild(svgEl('circle', {
      cx: GLOBE_SIZE / 2,
      cy: GLOBE_SIZE / 2,
      r: GLOBE_SIZE / 2 - 4
    }));
    defs.appendChild(clip);
    globeSvg.appendChild(defs);

    // Sphere fill (one solid background circle).
    var sphereLayer = svgEl('g', { id: 'sunpath-sphere-layer' });
    sphereLayer.appendChild(svgEl('circle', {
      'class': 'sunpath-sphere',
      cx: GLOBE_SIZE / 2,
      cy: GLOBE_SIZE / 2,
      r: GLOBE_SIZE / 2 - 4
    }));
    globeSvg.appendChild(sphereLayer);

    globeSvg.appendChild(svgEl('g', { id: 'sunpath-graticule' }));
    globeSvg.appendChild(svgEl('g', { id: 'sunpath-land' }));
    globeSvg.appendChild(svgEl('g', { id: 'sunpath-night' }));
    // Subsolar layer clipped so halo never bleeds past sphere edge.
    globeSvg.appendChild(svgEl('g', {
      id: 'sunpath-subsolar-layer',
      'clip-path': 'url(#sunpath-globe-clip)'
    }));
    globeSvg.appendChild(svgEl('g', { id: 'sunpath-monuments-layer' }));

    drawGraticule();

    globeSvg.addEventListener('pointerdown', onDragStart);
    globeSvg.addEventListener('pointermove', onDragMove);
    globeSvg.addEventListener('pointerup', onDragEnd);
    globeSvg.addEventListener('pointercancel', onDragEnd);
    globeSvg.addEventListener('pointerleave', onDragEnd);

    // Land geometry — async.
    fetch('assets/sunpath/land-110m.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (topology) {
        if (!topology || !topology.objects || !topology.objects.land) return;
        if (typeof topojson === 'undefined') return;
        landFeatures = topojson.feature(topology, topology.objects.land);
        renderLand();
      })
      .catch(function (err) { console.warn('land geojson failed', err); });

    // Monuments — async.
    fetch('assets/sunpath/monuments.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        monuments = data;
        renderMonuments();
        renderMonumentList();
      })
      .catch(function (err) { console.warn('monuments json failed', err); });

    renderTerminatorAndSubsolar();
  }

  function drawGraticule() {
    var layer = document.getElementById('sunpath-graticule');
    if (!layer) return;
    clearChildren(layer);
    var graticule = d3.geoGraticule().step([30, 30])();
    var p = svgEl('path', {
      'class': 'sunpath-graticule-path',
      d: pathGen(graticule) || ''
    });
    layer.appendChild(p);
  }

  function renderLand() {
    if (!landFeatures) return;
    var layer = document.getElementById('sunpath-land');
    if (!layer) return;
    clearChildren(layer);
    var p = svgEl('path', {
      'class': 'sunpath-land-path',
      d: pathGen(landFeatures) || ''
    });
    layer.appendChild(p);
  }

  function activeDate() {
    return scrubDate || new Date();
  }

  function renderTerminatorAndSubsolar() {
    // Guard: if globe failed to initialize (d3 missing), only update caption.
    var date = activeDate();
    var sub = M.subsolarPoint(date);
    updateSubsolarCaption(sub, date);
    if (!projection || typeof d3 === 'undefined') return;

    var nightCenter = [sub.lon + 180, -sub.lat];
    var nightCircle = d3.geoCircle().center(nightCenter).radius(90)();

    var nightLayer = document.getElementById('sunpath-night');
    if (nightLayer) {
      clearChildren(nightLayer);
      var p = svgEl('path', {
        'class': 'sunpath-night-path',
        d: pathGen(nightCircle) || ''
      });
      nightLayer.appendChild(p);
    }

    var subLayer = document.getElementById('sunpath-subsolar-layer');
    if (subLayer) {
      clearChildren(subLayer);
      var coords = projection([sub.lon, sub.lat]);
      if (coords && isPointVisible([sub.lon, sub.lat])) {
        subLayer.appendChild(svgEl('circle', {
          'class': 'sunpath-subsolar-halo',
          cx: coords[0], cy: coords[1], r: 18
        }));
        subLayer.appendChild(svgEl('circle', {
          'class': 'sunpath-subsolar-dot',
          cx: coords[0], cy: coords[1], r: 4
        }));
      }
    }

    renderMonuments();
  }

  function isPointVisible(lonLat) {
    var rot = projection.rotate();
    var center = [-rot[0], -rot[1]];
    var DEG = Math.PI / 180;
    var c1 = center[0] * DEG, c2 = center[1] * DEG;
    var p1 = lonLat[0] * DEG, p2 = lonLat[1] * DEG;
    return Math.sin(c2) * Math.sin(p2) + Math.cos(c2) * Math.cos(p2) * Math.cos(p1 - c1) > 0;
  }

  function updateSubsolarCaption(sub, date) {
    if (!dom.subsolarCaption) return;
    var latStr = Math.abs(sub.lat).toFixed(1) + '°' + (sub.lat >= 0 ? 'N' : 'S');
    var lonStr = Math.abs(sub.lon).toFixed(1) + '°' + (sub.lon >= 0 ? 'E' : 'W');
    var dateStr = scrubDate ? date.toUTCString().slice(0, 16) : 'right now';
    dom.subsolarCaption.textContent = 'the sun is overhead at ' + latStr + ' · ' + lonStr + ' (' + dateStr + ')';
  }

  function renderMonuments() {
    var layer = document.getElementById('sunpath-monuments-layer');
    if (!layer || !monuments.length) return;
    clearChildren(layer);

    monuments.forEach(function (m) {
      if (!isPointVisible([m.lon, m.lat])) return;
      var coords = projection([m.lon, m.lat]);
      if (!coords) return;

      var g = svgEl('g', {
        'class': 'sunpath-monument-pin',
        'data-monument-id': m.id,
        tabindex: '0',
        role: 'button',
        'aria-label': m.name + ', ' + m.country + '. ' + (m.alignment || '')
      });
      g.appendChild(svgEl('circle', { 'class': 'sunpath-monument-ring', cx: coords[0], cy: coords[1], r: 7 }));
      g.appendChild(svgEl('circle', { 'class': 'sunpath-monument-dot', cx: coords[0], cy: coords[1], r: 2.5 }));
      g.addEventListener('click', function () { showMonumentDetail(m); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showMonumentDetail(m);
        }
      });
      layer.appendChild(g);
    });
  }

  function renderMonumentList() {
    if (!dom.monumentList || !monuments.length) return;
    clearChildren(dom.monumentList);
    monuments.forEach(function (m) {
      var li = htmlEl('li', 'sunpath-monument-item');
      var btn = htmlEl('button', 'sunpath-monument-button');
      btn.type = 'button';
      btn.appendChild(htmlEl('span', 'sunpath-monument-name', m.name));
      btn.appendChild(htmlEl('span', 'sunpath-monument-meta', m.country + ' · ' + yearLabel(m.constructed)));
      btn.addEventListener('click', function () {
        showMonumentDetail(m);
        rotateToMonument(m);
      });
      li.appendChild(btn);
      dom.monumentList.appendChild(li);
    });
  }

  function showMonumentDetail(m) {
    if (!dom.monumentDetail) return;
    clearChildren(dom.monumentDetail);
    dom.monumentDetail.appendChild(htmlEl('h3', 'sunpath-detail-name', m.name));
    dom.monumentDetail.appendChild(htmlEl('p', 'sunpath-detail-meta', m.country + ' · ' + yearLabel(m.constructed)));
    dom.monumentDetail.appendChild(htmlEl('p', 'sunpath-detail-alignment', m.alignmentDescription));

    var az = M.sunriseAzimuth(m.lat, activeDate());
    var azStr = (az !== null) ? az.toFixed(1) + '° east of north' : 'sun does not rise today';
    var sunriseP = htmlEl('p', 'sunpath-detail-sunrise');
    sunriseP.appendChild(document.createTextNode('Sunrise today at this monument: '));
    sunriseP.appendChild(htmlEl('strong', null, azStr));
    dom.monumentDetail.appendChild(sunriseP);

    if (m.sourceNote) {
      dom.monumentDetail.appendChild(htmlEl('p', 'sunpath-detail-source', '— ' + m.sourceNote));
    }
    dom.monumentDetail.hidden = false;
    // Scroll into view so click feedback is unmissable, but only if not
    // already visible (avoids jarring scroll when clicking from the list
    // which is already adjacent to the detail card).
    var rect = dom.monumentDetail.getBoundingClientRect();
    var viewH = window.innerHeight;
    if (rect.top < 0 || rect.bottom > viewH) {
      dom.monumentDetail.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function rotateToMonument(m) {
    rotation = [-m.lon, -m.lat];
    projection.rotate(rotation);
    redrawAll();
  }

  function yearLabel(year) {
    if (year < 0) return Math.abs(year) + ' BC';
    return year + ' AD';
  }

  // --- Drag to rotate ---

  // Drag threshold so a click on a monument pin doesn't get swallowed by
  // pointer capture. Capture only after the user has actually moved.
  var DRAG_THRESHOLD_PX = 4;

  function onDragStart(e) {
    dragState = {
      x: e.clientX,
      y: e.clientY,
      rotation: rotation.slice(),
      captured: false,
      pointerId: e.pointerId
    };
  }

  function onDragMove(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.x;
    var dy = e.clientY - dragState.y;
    if (!dragState.captured) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (globeSvg.setPointerCapture) {
        try { globeSvg.setPointerCapture(dragState.pointerId); } catch (err) {}
      }
      dragState.captured = true;
    }
    var sensitivity = 0.5;
    rotation = [
      dragState.rotation[0] + dx * sensitivity,
      Math.max(-89, Math.min(89, dragState.rotation[1] - dy * sensitivity))
    ];
    projection.rotate(rotation);
    redrawAll();
  }

  function onDragEnd() {
    dragState = null;
  }

  function redrawAll() {
    drawGraticule();
    renderLand();
    renderTerminatorAndSubsolar();
  }

  // --- Year scrub slider ---

  function setupYearScrub() {
    if (!dom.yearScrub) return;
    var year = new Date().getUTCFullYear();
    dom.yearScrub.min = 1;
    dom.yearScrub.max = 365;
    dom.yearScrub.value = M.dayOfYear(new Date());
    dom.yearScrub.addEventListener('input', function () {
      var dayN = parseInt(dom.yearScrub.value, 10);
      var now = new Date();
      var d = new Date(Date.UTC(year, 0, 1, now.getUTCHours(), now.getUTCMinutes()));
      d.setUTCDate(dayN);
      scrubDate = d;
      updateScrubLabel(d);
      renderTerminatorAndSubsolar();
      renderTilt(d);
    });
    if (dom.scrubLabel) {
      dom.scrubLabel.addEventListener('click', function () {
        scrubDate = null;
        dom.yearScrub.value = M.dayOfYear(new Date());
        updateScrubLabel(null);
        renderTerminatorAndSubsolar();
        renderTilt(activeDate());
      });
    }
    updateScrubLabel(null);
  }

  function updateScrubLabel(d) {
    if (!dom.scrubLabel) return;
    if (!d) {
      dom.scrubLabel.textContent = 'right now';
      dom.scrubLabel.classList.add('is-live');
    } else {
      var months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
      dom.scrubLabel.textContent = months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' · tap to return to now';
      dom.scrubLabel.classList.remove('is-live');
    }
  }

  // --- Axial tilt inset ---

  function renderTilt(date) {
    if (!dom.tiltInset) return;
    var decl = M.declination(date);
    var W = 120, H = 100;
    var cx = W / 2, cy = H / 2;
    var r = 30;
    var axisAngle = -decl;
    var rad = axisAngle * Math.PI / 180;
    var ax = cx + Math.sin(rad) * (r + 8);
    var ay = cy - Math.cos(rad) * (r + 8);
    var bx = cx - Math.sin(rad) * (r + 8);
    var by = cy + Math.cos(rad) * (r + 8);

    clearChildren(dom.tiltInset);

    var s = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      'class': 'sunpath-tilt-svg',
      'aria-hidden': 'true'
    });
    s.appendChild(svgEl('line', {
      'class': 'sunpath-tilt-axis',
      x1: bx.toFixed(1), y1: by.toFixed(1), x2: ax.toFixed(1), y2: ay.toFixed(1)
    }));
    s.appendChild(svgEl('circle', { 'class': 'sunpath-tilt-earth', cx: cx, cy: cy, r: r }));
    s.appendChild(svgEl('line', {
      'class': 'sunpath-tilt-equator',
      x1: cx - r, y1: cy, x2: cx + r, y2: cy
    }));
    dom.tiltInset.appendChild(s);
    dom.tiltInset.appendChild(htmlEl('p', 'sunpath-tilt-caption', 'declination: ' + decl.toFixed(1) + '°'));
  }

  function idleTick() {
    if (scrubDate) return;
    renderTerminatorAndSubsolar();
    renderTilt(new Date());
  }
})();
