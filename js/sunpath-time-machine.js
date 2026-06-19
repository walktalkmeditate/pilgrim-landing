/* Sun Path — deep-time sunrise/sunset drift ("Ancient sunrises have moved").
   One focused horizon: the sun at the selected year, a faint "today" ghost, and
   (for sourced anchors) a fixed alignment marker. Reuses sunpath-math.js.
   Pure local state — no history writes (the /eki iOS-Safari crash lesson). */
(function () {
  'use strict';

  var M = window.SunPathMath;
  var mount = document.getElementById('sunpath-time-machine');
  if (!M || !mount) return;

  // ±degrees of horizon shown each side of due-east/west. Must exceed the
  // largest solstice swing off-cardinal across the scrubber range — Newgrange
  // reaches ~43.4° at high obliquity — or the sun clips off-canvas.
  var MIN_YEAR = -3000, MAX_YEAR = 3000, HALF_WINDOW = 50;
  var TODAY = new Date().getUTCFullYear();
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function yearLabel(y) { return y < 0 ? Math.abs(y) + ' BC' : y + ' AD'; }

  function eventOf(m) {
    if (m.event) return m.event;
    if (/sunset/.test(m.alignment) && !/sunrise/.test(m.alignment)) return 'sunset';
    if (/sunrise/.test(m.alignment)) return 'sunrise';
    return 'other';
  }
  function turningOf(m) {
    if (m.turning) return m.turning;
    var a = m.alignment || '';
    if (a.indexOf('summer') === 0) return 'summer-solstice';
    if (a.indexOf('winter') === 0) return 'winter-solstice';
    if (a.indexOf('spring') === 0) return 'spring-equinox';
    if (a.indexOf('autumn') === 0) return 'autumn-equinox';
    return 'summer-solstice';
  }
  function sunAz(m, year) {
    return eventOf(m) === 'sunset'
      ? M.sunsetAzimuthForYear(m.lat, year, turningOf(m))
      : M.sunriseAzimuthForYear(m.lat, year, turningOf(m));
  }
  function markerAz(m) {
    if (!m.marker) return null;
    if (typeof m.marker.azimuth === 'number') return m.marker.azimuth;
    if (typeof m.lon === 'number' &&
        typeof m.marker.lat === 'number' && typeof m.marker.lon === 'number') {
      return M.initialBearing(m.lat, m.lon, m.marker.lat, m.marker.lon);
    }
    return null;
  }
  function markerName(m) { return m.marker ? (m.marker.label || m.marker.landmark || null) : null; }
  function centreAz(m) { return eventOf(m) === 'sunset' ? 270 : 90; }

  function azToX(az, centre, x0, x1) {
    if (az == null || !isFinite(az)) return null;
    var u = M.azimuthToUnit(az, centre, HALF_WINDOW);
    return u == null ? null : x0 + u * (x1 - x0);
  }

  function fallback(message) {
    clear(mount);
    mount.appendChild(el('p', 'sunpath-tm-readout', message));
  }

  var state = { monuments: [], current: null, year: TODAY, slider: null,
                canvas: null, label: null, readout: null };

  function draw() {
    var m = state.current, year = state.year;
    if (!m || !state.canvas) return;
    if (state.label) state.label.textContent = yearLabel(year);
    clear(state.canvas);

    var x0 = 20, x1 = 340, yH = 120;
    var ev = eventOf(m), centre = centreAz(m);

    state.canvas.appendChild(svg('line',
      { 'class': 'sunpath-tm-horizon', x1: x0, y1: yH, x2: x1, y2: yH }));

    var leftLbl = ev === 'sunset' ? 'SW' : 'NE';
    var midLbl  = ev === 'sunset' ? 'W'  : 'E';
    var rightLbl= ev === 'sunset' ? 'NW' : 'SE';
    [[x0, leftLbl], [(x0 + x1) / 2, midLbl], [x1, rightLbl]].forEach(function (t) {
      state.canvas.appendChild(svg('line',
        { 'class': 'sunpath-tm-tick', x1: t[0], y1: yH - 4, x2: t[0], y2: yH + 4 }));
      var lab = svg('text', { x: t[0], y: yH + 18, 'class': 'sunpath-tm-compass', 'text-anchor': 'middle' });
      lab.textContent = t[1];
      state.canvas.appendChild(lab);
    });

    var mAz = markerAz(m), mName = markerName(m);
    var mx = azToX(mAz, centre, x0, x1);
    if (mx != null) {
      state.canvas.appendChild(svg('line',
        { 'class': 'sunpath-tm-marker', x1: mx, y1: yH - 34, x2: mx, y2: yH }));
      if (mName) {
        var mlab = svg('text', { x: mx, y: yH - 40, 'class': 'sunpath-tm-marker-label', 'text-anchor': 'middle' });
        mlab.textContent = mName;
        state.canvas.appendChild(mlab);
      }
    }

    var todayAz = sunAz(m, TODAY);
    var tx = azToX(todayAz, centre, x0, x1);
    if (tx != null && year !== TODAY) {
      state.canvas.appendChild(svg('circle', { 'class': 'sunpath-tm-ghost', cx: tx, cy: yH - 14, r: 7 }));
    }

    var az = sunAz(m, year);
    var sx = azToX(az, centre, x0, x1);
    if (sx != null) {
      state.canvas.appendChild(svg('circle', { 'class': 'sunpath-tm-sun', cx: sx, cy: yH - 14, r: 8 }));
    }

    var verb = ev === 'sunset' ? 'sets' : 'rises';
    var tilt = M.obliquity(year).toFixed(2);
    var txt;
    if (mAz != null && az != null && todayAz != null && mName) {
      txt = 'Today the ' + turningOf(m).split('-')[0] + ' sun ' + verb + ' ' +
        M.angularDistance(todayAz, mAz).toFixed(1) + '° from ' + mName + '; in ' +
        yearLabel(year) + ', ' + M.angularDistance(az, mAz).toFixed(1) + '°. Earth’s tilt then: ' + tilt + '°.';
    } else if (az != null) {
      txt = 'The ' + turningOf(m).split('-')[0] + ' sun ' + verb + ' at ' + az.toFixed(1) +
        '° in ' + yearLabel(year) + '. Earth’s tilt then: ' + tilt + '°.';
    } else {
      txt = 'At this latitude the sun does not ' + verb + ' on this turning.';
    }
    if (state.readout) state.readout.textContent = txt;
  }

  function selectMonument(m) {
    state.current = m;
    mount.querySelectorAll('.sunpath-tm-pick').forEach(function (b) {
      var on = b.getAttribute('data-id') === m.id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    draw();
  }

  function build(monuments) {
    state.monuments = monuments.filter(function (m) {
      var e = eventOf(m); return e === 'sunrise' || e === 'sunset';
    }).sort(function (a, b) { return (b.marker ? 1 : 0) - (a.marker ? 1 : 0); });
    if (!state.monuments.length) {
      fallback('The deep-time horizon is unavailable right now.');
      return;
    }

    clear(mount);

    var picker = el('div', 'sunpath-tm-picker');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Choose a monument');
    state.monuments.forEach(function (m) {
      var b = el('button', 'sunpath-tm-pick', (m.name || m.id || 'unknown').replace(/ —.*$/, ''));
      b.type = 'button';
      b.setAttribute('data-id', m.id);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { selectMonument(m); });
      picker.appendChild(b);
    });

    state.label = el('p', 'sunpath-tm-label');
    state.slider = document.createElement('input');
    state.slider.type = 'range';
    state.slider.min = String(MIN_YEAR);
    state.slider.max = String(MAX_YEAR);
    state.slider.value = String(TODAY);
    state.slider.id = 'sunpath-tm-slider';
    state.slider.setAttribute('aria-label', 'Walk through time, year by year');

    state.canvas = svg('svg',
      { viewBox: '0 0 360 180', 'class': 'sunpath-tm-canvas', 'aria-hidden': 'true' });

    state.readout = el('p', 'sunpath-tm-readout');
    state.readout.setAttribute('aria-live', 'polite');

    mount.appendChild(picker);
    mount.appendChild(state.label);
    mount.appendChild(state.slider);
    mount.appendChild(state.canvas);
    mount.appendChild(state.readout);

    var raf = 0;
    state.slider.addEventListener('input', function () {
      state.year = parseInt(state.slider.value, 10);
      if (reduceMotion) { draw(); return; }
      if (raf) return;
      raf = window.requestAnimationFrame(function () { raf = 0; draw(); });
    });

    selectMonument(state.monuments[0]);
  }

  fetch('/assets/sunpath/monuments.json')
    .then(function (r) { return r.json(); })
    .then(build)
    .catch(function () { fallback('The deep-time horizon is unavailable right now.'); });
}());
