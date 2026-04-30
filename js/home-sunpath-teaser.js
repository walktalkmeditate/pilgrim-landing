/* =============================================
   Home → Sun Path teaser

   A small, real-time mini-globe (orthographic, centered on Greenwich)
   that tracks where the sun stands right now, paired with the kanji
   of the next turning. Whole thing links to /sunpath.

   No external deps. Subsolar lon = 15° × (12h − UTC hour); declination
   from a Spencer-style approximation good enough for an 88px sphere.
   When the sun is on the back hemisphere, a faint marker is pinned to
   the sphere's limb in the direction the sun lies — never empty.

   Updates every minute (gentle, imperceptible drift); kanji refreshes
   hourly so the four-turnings cycle stays current.
   ============================================= */

(function () {
  'use strict';

  var globeMount = document.getElementById('home-sunpath-globe');
  var kanjiEl = document.getElementById('home-sunpath-kanji');
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

  // Sphere — flat fill; theming via CSS class hooks.
  svg.appendChild(ns('circle', { 'class': 'home-sunpath-sphere', r: R }));

  // Equator + prime-meridian — a quiet cross-hair on the visible disc.
  svg.appendChild(ns('line', {
    'class': 'home-sunpath-graticule',
    x1: -R, y1: 0, x2: R, y2: 0
  }));
  svg.appendChild(ns('line', {
    'class': 'home-sunpath-graticule',
    x1: 0, y1: -R, x2: 0, y2: R
  }));

  // Subsolar halo + dot — repositioned each minute.
  var halo = ns('circle', { 'class': 'home-sunpath-halo', r: 11, cx: 0, cy: 0 });
  var sun  = ns('circle', { 'class': 'home-sunpath-sun',  r: 3,  cx: 0, cy: 0 });
  svg.appendChild(halo);
  svg.appendChild(sun);

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

  function updateGlobe() {
    var s = subsolar(new Date());
    var p = project(s.lat, s.lon);
    if (p.z > 0) {
      // Front hemisphere — full warm halo + bright dot at the projected position.
      sun.setAttribute('cx', p.x.toFixed(2));
      sun.setAttribute('cy', p.y.toFixed(2));
      halo.setAttribute('cx', p.x.toFixed(2));
      halo.setAttribute('cy', p.y.toFixed(2));
      sun.classList.remove('home-sunpath-sun--rim');
      sun.style.display = '';
      halo.style.display = '';
      return;
    }
    // Back hemisphere — pin a faint marker on the limb in the direction of
    // the sun, so the user sees "the sun is just past this edge."
    var len = Math.sqrt(p.x * p.x + p.y * p.y);
    if (len < 0.01) {
      // Subsolar at the antipode of Greenwich + equator; nothing meaningful
      // to show — just hide.
      sun.style.display = 'none';
      halo.style.display = 'none';
      return;
    }
    var rx = (R * p.x / len).toFixed(2);
    var ry = (R * p.y / len).toFixed(2);
    sun.setAttribute('cx', rx);
    sun.setAttribute('cy', ry);
    sun.classList.add('home-sunpath-sun--rim');
    sun.style.display = '';
    halo.style.display = 'none';
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
    if (!kanjiEl) return;
    var t = pickTurning(new Date());
    if (!t) return;
    kanjiEl.textContent = KANJI[t].kanji;
    var link = kanjiEl.closest('a');
    if (link) link.dataset.turning = KANJI[t].slug;
  }

  function init() {
    updateGlobe();
    updateKanji();
    setInterval(updateGlobe, 60 * 1000);
    setInterval(updateKanji, 60 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
