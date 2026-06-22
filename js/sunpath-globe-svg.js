/* Sun Path — SVG globe renderer (D3-geo). Fallback + instant first paint.
   Implements the GlobeRenderer contract; owns no app state. */
(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvgGlobe(container, opts) {
    var GLOBE_SIZE = (opts && opts.size) || 480;
    var projection = d3.geoOrthographic()
      .scale(GLOBE_SIZE / 2 - 4)
      .translate([GLOBE_SIZE / 2, GLOBE_SIZE / 2])
      .rotate([0, -10])
      .clipAngle(90);
    var pathGen = d3.geoPath(projection);
    var landFeatures = null;
    var svg = buildSvg();
    container.appendChild(svg);
    loadLand();

    function render(state) {
      drawTerminatorAndSubsolar(state);
    }

    function setRotation(rot) {
      projection.rotate(rot);
    }

    function projectPoint(lonLat) {
      var c = projection(lonLat);
      return { x: c ? c[0] : 0, y: c ? c[1] : 0, visible: !!c && isVisible(lonLat) };
    }

    function resize() {}

    function destroy() {
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    }

    function redrawStatic() {
      drawGraticule();
      renderLand();
    }

    function svgEl(tag, attrs) {
      var el = document.createElementNS(SVG_NS, tag);
      if (attrs) {
        for (var k in attrs) el.setAttribute(k, attrs[k]);
      }
      return el;
    }

    function clearChildren(node) {
      while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function buildSvg() {
      var s = svgEl('svg', {
        'class': 'sunpath-globe-svg',
        'viewBox': '0 0 ' + GLOBE_SIZE + ' ' + GLOBE_SIZE,
        'width': GLOBE_SIZE,
        'height': GLOBE_SIZE,
        'role': 'img',
        'aria-label': 'Globe showing day and night with the sun directly overhead at one point.'
      });

      var defs = svgEl('defs');
      var clip = svgEl('clipPath', { id: 'sunpath-globe-clip' });
      clip.appendChild(svgEl('circle', {
        cx: GLOBE_SIZE / 2,
        cy: GLOBE_SIZE / 2,
        r: GLOBE_SIZE / 2 - 4
      }));
      defs.appendChild(clip);
      s.appendChild(defs);

      var sphereLayer = svgEl('g', { id: 'sunpath-sphere-layer' });
      sphereLayer.appendChild(svgEl('circle', {
        'class': 'sunpath-sphere',
        cx: GLOBE_SIZE / 2,
        cy: GLOBE_SIZE / 2,
        r: GLOBE_SIZE / 2 - 4
      }));
      s.appendChild(sphereLayer);

      s.appendChild(svgEl('g', { id: 'sunpath-graticule' }));
      s.appendChild(svgEl('g', { id: 'sunpath-land' }));
      s.appendChild(svgEl('g', { id: 'sunpath-night' }));
      s.appendChild(svgEl('g', { id: 'sunpath-polar', 'clip-path': 'url(#sunpath-globe-clip)' }));
      s.appendChild(svgEl('g', {
        id: 'sunpath-subsolar-layer',
        'clip-path': 'url(#sunpath-globe-clip)'
      }));
      s.appendChild(svgEl('g', { id: 'sunpath-monuments-layer' }));

      return s;
    }

    function loadLand() {
      fetch('/assets/sunpath/land-110m.json')
        .then(function (r) { return r.json(); })
        .then(function (topology) {
          if (!topology || !topology.objects || !topology.objects.land) return;
          if (typeof topojson === 'undefined') return;
          landFeatures = topojson.feature(topology, topology.objects.land);
          renderLand();
        })
        .catch(function (err) { console.warn('land geojson failed', err); });
    }

    function drawGraticule() {
      var layer = svg.querySelector('#sunpath-graticule');
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
      var layer = svg.querySelector('#sunpath-land');
      if (!layer) return;
      clearChildren(layer);
      var p = svgEl('path', {
        'class': 'sunpath-land-path',
        d: pathGen(landFeatures) || ''
      });
      layer.appendChild(p);
    }

    function isVisible(lonLat) {
      var rot = projection.rotate();
      var center = [-rot[0], -rot[1]];
      var DEG = Math.PI / 180;
      var c1 = center[0] * DEG, c2 = center[1] * DEG;
      var p1 = lonLat[0] * DEG, p2 = lonLat[1] * DEG;
      return Math.sin(c2) * Math.sin(p2) + Math.cos(c2) * Math.cos(p2) * Math.cos(p1 - c1) > 0;
    }

    function drawTerminatorAndSubsolar(state) {
      var sub = state.subsolar;
      var nightCenter = [sub.lon + 180, -sub.lat];

      var nightLayer = svg.querySelector('#sunpath-night');
      if (nightLayer) {
        clearChildren(nightLayer);
        [
          { radius: 90, cls: 'sunpath-twilight-civil' },
          { radius: 84, cls: 'sunpath-twilight-nautical' },
          { radius: 78, cls: 'sunpath-twilight-astronomical' },
          { radius: 72, cls: 'sunpath-twilight-night' }
        ].forEach(function (band) {
          var circle = d3.geoCircle().center(nightCenter).radius(band.radius)();
          var d = pathGen(circle);
          if (!d) return;
          nightLayer.appendChild(svgEl('path', {
            'class': 'sunpath-night-path ' + band.cls,
            d: d
          }));
        });
      }

      var subLayer = svg.querySelector('#sunpath-subsolar-layer');
      if (subLayer) {
        clearChildren(subLayer);
        var coords = projection([sub.lon, sub.lat]);
        if (coords && isVisible([sub.lon, sub.lat])) {
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

      renderPolarCircles(state.declination);
      renderMonuments(state.monuments);
    }

    function renderPolarCircles(declination) {
      var layer = svg.querySelector('#sunpath-polar');
      if (!layer) return;
      clearChildren(layer);
      var arctic    = d3.geoCircle().center([0,  90]).radius(23.5)();
      var antarctic = d3.geoCircle().center([0, -90]).radius(23.5)();
      var dec = declination || 0;
      var arcticGlow    = Math.max(0,  dec / 23.45);
      var antarcticGlow = Math.max(0, -dec / 23.45);

      var aPath = pathGen(arctic);
      if (aPath) {
        layer.appendChild(svgEl('path', {
          'class': 'sunpath-polar-circle',
          d: aPath,
          style: 'stroke-opacity:' + (0.18 + arcticGlow * 0.55).toFixed(2)
        }));
      }
      var bPath = pathGen(antarctic);
      if (bPath) {
        layer.appendChild(svgEl('path', {
          'class': 'sunpath-polar-circle',
          d: bPath,
          style: 'stroke-opacity:' + (0.18 + antarcticGlow * 0.55).toFixed(2)
        }));
      }
    }

    function renderMonuments(monuments) {
      var layer = svg.querySelector('#sunpath-monuments-layer');
      if (!layer || !monuments || !monuments.length) return;
      clearChildren(layer);

      monuments.forEach(function (m) {
        if (!isVisible([m.lon, m.lat])) return;
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
        if (opts && opts.onMonumentClick) {
          g.addEventListener('click', function () { opts.onMonumentClick(m); });
          g.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              opts.onMonumentClick(m);
            }
          });
        }
        layer.appendChild(g);
      });
    }

    drawGraticule();

    if (opts && opts.onDragStart)  svg.addEventListener('pointerdown',   opts.onDragStart);
    if (opts && opts.onDragMove)   svg.addEventListener('pointermove',   opts.onDragMove);
    if (opts && opts.onDragEnd)    svg.addEventListener('pointerup',     opts.onDragEnd);
    if (opts && opts.onDragEnd)    svg.addEventListener('pointercancel', opts.onDragEnd);
    if (opts && opts.onDragEnd)    svg.addEventListener('pointerleave',  opts.onDragEnd);

    return {
      render: render,
      setRotation: setRotation,
      projectPoint: projectPoint,
      resize: resize,
      destroy: destroy,
      redrawStatic: redrawStatic,
      getSvg: function () { return svg; }
    };
  }

  root.createSvgGlobe = createSvgGlobe;
})(typeof window !== 'undefined' ? window : globalThis);
