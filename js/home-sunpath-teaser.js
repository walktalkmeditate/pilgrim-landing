/* =============================================
   Home → Sun Path teaser

   A single tiny mini-globe (orthographic, centered on Greenwich) where
   the sun is rendered as the next turning's kanji at the subsolar
   point. No outer text, no pill — just the glyph that links to /sunpath.

   Subsolar lon = 15° × (12h − UTC hour). Declination from a Spencer-
   style approximation (good enough for a 40px sphere). When the sun is
   on the back hemisphere, the kanji is hidden and a faint dot is pinned
   to the limb in the direction the sun lies.

   Updates every minute (gentle drift); kanji refreshes hourly so the
   four-turnings cycle stays current.
   ============================================= */

(function () {
  'use strict';

  var globeMount = document.getElementById('home-sunpath-globe');
  if (!globeMount) return;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var R = 44;

  function ns(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  var svg = ns('svg', {
    viewBox: '-50 -50 100 100',
    'class': 'home-sunpath-svg',
    'aria-hidden': 'true'
  });

  // Soft 3D shading on the sphere.
  var defs = ns('defs');
  var grad = ns('radialGradient', { id: 'home-sunpath-shade', cx: '32%', cy: '32%', r: '78%' });
  grad.appendChild(ns('stop', { offset: '0%',   'stop-color': '#000', 'stop-opacity': '0' }));
  grad.appendChild(ns('stop', { offset: '70%',  'stop-color': '#000', 'stop-opacity': '0.08' }));
  grad.appendChild(ns('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': '0.28' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(ns('circle', { 'class': 'home-sunpath-sphere', r: R }));
  svg.appendChild(ns('circle', { 'class': 'home-sunpath-shade',  r: R, fill: 'url(#home-sunpath-shade)' }));

  // Graticule — equator, prime meridian, two tropics (±23.44° lat). The
  // tropics bracket where the sun ever stands directly overhead.
  var TROPIC = R * Math.sin(23.44 * Math.PI / 180);
  var TROPIC_X = R * Math.cos(23.44 * Math.PI / 180);

  svg.appendChild(ns('line', { 'class': 'home-sunpath-graticule', x1: -R, y1: 0, x2: R, y2: 0 }));
  svg.appendChild(ns('line', { 'class': 'home-sunpath-graticule', x1: 0, y1: -R, x2: 0, y2: R }));
  svg.appendChild(ns('line', {
    'class': 'home-sunpath-graticule home-sunpath-graticule--tropic',
    x1: -TROPIC_X, y1: -TROPIC, x2: TROPIC_X, y2: -TROPIC
  }));
  svg.appendChild(ns('line', {
    'class': 'home-sunpath-graticule home-sunpath-graticule--tropic',
    x1: -TROPIC_X, y1: TROPIC, x2: TROPIC_X, y2: TROPIC
  }));

  // Warm halo behind the kanji-as-sun.
  var halo = ns('circle', { 'class': 'home-sunpath-halo', r: 13, cx: 0, cy: 0 });
  svg.appendChild(halo);

  // The sun itself — a kanji glyph that rides the subsolar point. When
  // the sun is on the back hemisphere, the glyph parks just inside the
  // limb in the direction the sun lies — never empty.
  var kanjiSun = ns('text', {
    'class': 'home-sunpath-kanji-sun',
    x: 0, y: 0,
    'text-anchor': 'middle',
    'dominant-baseline': 'central'
  });
  kanjiSun.textContent = '夏'; // sensible default until pickTurning runs
  svg.appendChild(kanjiSun);

  globeMount.appendChild(svg);

  function dayOfYear(d) {
    var jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((d.getTime() - jan1) / 86400000) + 1;
  }

  function subsolar(now) {
    var hours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    var lon = 15 * (12 - hours);
    while (lon > 180)  lon -= 360;
    while (lon < -180) lon += 360;
    // Day 80 ≈ March 21 (vernal equinox); declination zero there.
    var lat = 23.44 * Math.sin(2 * Math.PI * (dayOfYear(now) - 80) / 365);
    return { lat: lat, lon: lon };
  }

  function project(latDeg, lonDeg) {
    var phi = latDeg * Math.PI / 180;
    var lam = lonDeg * Math.PI / 180;
    return {
      x: R * Math.cos(phi) * Math.sin(lam),
      y: -R * Math.sin(phi),
      z: Math.cos(phi) * Math.cos(lam)
    };
  }

  // Inset distance from the rim when the sun is on the back hemisphere —
  // keeps the kanji fully on the disc rather than half-clipped at the edge.
  var BACK_INSET = R - 8;

  function updateGlobe() {
    var s = subsolar(new Date());
    var p = project(s.lat, s.lon);
    if (p.z > 0) {
      // Front hemisphere — kanji rides the subsolar point, full warm halo.
      var x = p.x.toFixed(2);
      var y = p.y.toFixed(2);
      kanjiSun.setAttribute('x', x);
      kanjiSun.setAttribute('y', y);
      kanjiSun.classList.remove('home-sunpath-kanji-sun--rim');
      halo.setAttribute('cx', x);
      halo.setAttribute('cy', y);
      halo.style.display = '';
      return;
    }
    // Back hemisphere — park kanji just inside the limb, halo off, glyph
    // dimmed via the --rim modifier.
    var len = Math.sqrt(p.x * p.x + p.y * p.y);
    halo.style.display = 'none';
    if (len < 0.01) {
      // Subsolar at exact antipode; pin glyph to disc center as a quiet
      // fallback (vanishingly rare in practice).
      kanjiSun.setAttribute('x', '0');
      kanjiSun.setAttribute('y', '0');
    } else {
      kanjiSun.setAttribute('x', (BACK_INSET * p.x / len).toFixed(2));
      kanjiSun.setAttribute('y', (BACK_INSET * p.y / len).toFixed(2));
    }
    kanjiSun.classList.add('home-sunpath-kanji-sun--rim');
  }

  var KANJI = {
    springEquinox:  { kanji: '春', slug: 'spring-equinox'  },
    summerSolstice: { kanji: '夏', slug: 'summer-solstice' },
    autumnEquinox:  { kanji: '秋', slug: 'autumn-equinox'  },
    winterSolstice: { kanji: '冬', slug: 'winter-solstice' }
  };
  var ORDER = ['springEquinox', 'summerSolstice', 'autumnEquinox', 'winterSolstice'];

  function pickTurning(now) {
    if (!window.Turnings) return null;
    var today = window.Turnings.getTurningOnDate(now);
    if (today && KANJI[today]) return today;
    var year = now.getUTCFullYear();
    var ts = window.Turnings.getTurningsForYear(year);
    for (var i = 0; i < ORDER.length; i++) {
      if (ts[ORDER[i]].getTime() > now.getTime()) return ORDER[i];
    }
    return 'springEquinox'; // next year's
  }

  function updateKanji() {
    var t = pickTurning(new Date());
    if (!t) return;
    kanjiSun.textContent = KANJI[t].kanji;
    var link = globeMount.closest('a');
    if (link) link.dataset.turning = KANJI[t].slug;
  }

  function init() {
    updateKanji();
    updateGlobe();
    setInterval(updateGlobe, 60 * 1000);
    setInterval(updateKanji, 60 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
