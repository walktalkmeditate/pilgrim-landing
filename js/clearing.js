/* The hidden clearing — DOM wiring. Loaded by index.html only.
 *
 * One calm spot below the walk story holds a denser patch of fog,
 * placed fresh each visit. The door is scene 05's form, inside the
 * story's sticky stage, so it leaves the viewport only when the story
 * ends: then the crescent rides the viewport, leaning toward the
 * spot — the app's own gesture: the crescent rides the walker, and
 * leans toward what waits. Stillness with the fog in view reveals
 * the clearing; hover and tap merely hurry it. Reduced motion gets
 * no rider and a plain crossfade, and keeps every way in.
 */

(function () {
  'use strict';

  var C = window.ClearingCore;
  if (!C) return;

  var door = document.querySelector('[data-seek-door]');
  if (!door) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var PATCH = 148;
  var PATCH_SMALL = 112;

  // Anything that carries text (leaf elements with content) or pixels
  // (replaced elements) is an obstacle. A tag list here already missed
  // the season cards once; measure what IS, not what is expected.
  var REPLACED = { IMG: 1, SVG: 1, CANVAS: 1, INPUT: 1, BUTTON: 1, FIGURE: 1, VIDEO: 1 };

  function contentRects(host) {
    var rects = [];
    var els = host.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('.clearing-fog') || el.closest('.clearing-status')) continue;
      var solid = REPLACED[el.tagName && el.tagName.toUpperCase()] ||
        (el.children.length === 0 && el.textContent.replace(/\s/g, '') !== '');
      if (!solid) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      rects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return rects;
  }

  function columnFor(side, size) {
    var inset = Math.min(Math.max(4, 0.03 * window.innerWidth), 56);
    var left = side === 'left' ? inset : window.innerWidth - inset - size;
    return { left: left, right: left + size };
  }

  // The zone's topPct is a preference; the section as laid out right
  // now has the final say. No room in any section at full size: try
  // small. No room anywhere: the fog settles where it was asked to
  // and grazes — it is fog.
  function placeFog() {
    var zones = [];
    for (var i = 0; i < C.ZONES.length; i++) {
      if (document.querySelector(C.ZONES[i].selector)) zones.push(C.ZONES[i]);
    }
    if (!zones.length) return null;
    var start = C.pickZone(zones.length, Math.random);
    var sizes = [PATCH, PATCH_SMALL];
    for (var s = 0; s < sizes.length; s++) {
      for (var k = 0; k < zones.length; k++) {
        var zone = zones[(start + k) % zones.length];
        var host = document.querySelector(zone.selector);
        var hr = host.getBoundingClientRect();
        var col = columnFor(zone.side, sizes[s]);
        var pct = C.placementPct(
          { top: hr.top, height: hr.height },
          contentRects(host), zone.topPct, sizes[s], col.left, col.right
        );
        if (pct !== null) return { zone: zone, host: host, pct: pct, size: sizes[s] };
      }
    }
    var z0 = zones[start];
    return { zone: z0, host: document.querySelector(z0.selector), pct: z0.topPct, size: PATCH };
  }

  // Placement measures the laid-out page, so nothing happens before
  // the load event: fonts and images have their final rects by then,
  // and fog arriving a beat after the page suits fog.
  function init() {
    var spot = placeFog();
    if (!spot) return;
    var host = spot.host;
    host.classList.add('clearing-host');

    var seasonColor = window.SeasonalEngine && window.SeasonalEngine.getCurrentSeason &&
      C.SEASON_COLORS[window.SeasonalEngine.getCurrentSeason()];

    var fog = document.createElement('button');
    fog.type = 'button';
    fog.className = 'clearing-fog clearing-fog--' + spot.zone.side +
      (spot.size === PATCH_SMALL ? ' clearing-fog--small' : '');
    fog.style.top = spot.pct + '%';
    fog.setAttribute('aria-label', 'Something waits in the fog');
    fog.innerHTML =
      '<span class="clearing-glyph" aria-hidden="true">' +
      '<svg viewBox="' + C.GLYPH_VIEWBOX + '" fill="none">' +
      '<g transform="' + C.GLYPH_TRANSFORM + '">' +
      '<path d="' + C.GLYPH_PATH + '" fill="currentColor"/>' +
      '</g></svg></span>';
    if (seasonColor) fog.querySelector('.clearing-glyph').style.color = seasonColor;
    host.appendChild(fog);

    var status = document.createElement('p');
    status.className = 'clearing-status';
    status.setAttribute('role', 'status');
    host.appendChild(status);

    var rider = null, riderSvg = null, riderCircle = null, riderAt = null;
    var riding = false, doorPassed = false, doorWatch = null;
    var prevAngle = 90;
    var revealed = false;
    var raf = 0;

    function buildRider() {
      rider = document.createElement('div');
      rider.className = 'clearing-rider';
      rider.setAttribute('aria-hidden', 'true');
      rider.innerHTML =
        '<span class="clearing-breath">' +
        '<svg viewBox="0 0 48 48" width="28" height="28" fill="none">' +
        '<circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2.5" ' +
        'stroke-linecap="round" stroke-dasharray="34 80" stroke-dashoffset="17"/></svg></span>';
      if (seasonColor) rider.style.color = seasonColor;
      document.body.appendChild(rider);
      riderSvg = rider.querySelector('svg');
      riderCircle = rider.querySelector('circle');
    }

    // Has the door left the viewport upward? This root runs from the
    // viewport's top edge past the page's foot, so no jump skips it.
    function watchDoor() {
      if (!('IntersectionObserver' in window)) return;
      doorWatch = new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        doorPassed = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        requestFrame();
      }, { rootMargin: '0px 0px 100000px 0px' });
      doorWatch.observe(door);
    }

    // Reads, then writes. The pinned walk story writes every frame, so
    // while it is pinned the rider reads nothing: a class check.
    function frame() {
      raf = 0;
      if (!rider || revealed) return;

      var ride = !document.body.classList.contains('walk-story-pinned') && doorPassed;
      var f = null;
      if (ride) {
        f = fog.getBoundingClientRect();
        if (!riderAt) {
          // Fixed to the viewport, it moves only on resize.
          var r = rider.getBoundingClientRect();
          riderAt = { x: r.left + r.width / 2, y: r.top + r.height / 2, viewH: window.innerHeight };
        }
      }

      if (ride !== riding) {
        riding = ride;
        rider.classList.toggle('is-riding', ride);
      }
      if (!ride) return;

      var tx = f.left + f.width / 2;
      var ty = f.top + f.height / 2;
      prevAngle = C.unwrapAngle(prevAngle, C.leanAngleDeg(riderAt.x, riderAt.y, tx, ty));
      riderSvg.style.transform = 'rotate(' + prevAngle.toFixed(1) + 'deg)';

      var dx = tx - riderAt.x, dy = ty - riderAt.y;
      var dash = C.dashFor(C.arcSpan(Math.sqrt(dx * dx + dy * dy), riderAt.viewH));
      riderCircle.style.strokeDasharray = dash.array;
      riderCircle.style.strokeDashoffset = dash.offset;
    }

    function requestFrame() {
      if (!raf) raf = window.requestAnimationFrame(frame);
    }

    function onResize() {
      riderAt = null;
      requestFrame();
    }

    var stillTimer = 0, hoverTimer = 0;
    var watching = false;

    function clearStill() {
      if (stillTimer) { clearTimeout(stillTimer); stillTimer = 0; }
    }

    function armStillness() {
      clearStill();
      if (revealed || !watching) return;
      stillTimer = setTimeout(reveal, C.STILLNESS_MS);
    }

    function onScroll() {
      if (rider) requestFrame();
      armStillness();
    }

    function reveal() {
      if (revealed) return;
      revealed = true;
      clearStill();
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }

      fog.classList.add('is-revealed');
      fog.setAttribute('aria-label', 'A clearing, revealed');
      fog.setAttribute('tabindex', '-1');
      status.textContent = 'A clearing, revealed.';

      if (io) io.disconnect();
      if (doorWatch) doorWatch.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rider) rider.classList.remove('is-riding');
      riding = false;
    }

    var io = ('IntersectionObserver' in window) ?
      new IntersectionObserver(function (entries) {
        watching = entries[0].isIntersecting;
        if (watching) armStillness();
        else clearStill();
      }, { threshold: 0.5 }) : null;
    if (io) io.observe(fog);

    fog.addEventListener('mouseenter', function () {
      if (revealed) return;
      hoverTimer = setTimeout(reveal, C.HOVER_MS);
    });
    fog.addEventListener('mouseleave', function () {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }
    });
    fog.addEventListener('click', reveal);

    if (!reduceMotion) {
      buildRider();
      watchDoor();
      window.addEventListener('resize', onResize, { passive: true });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    if (rider) requestFrame();
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init, { once: true });
  }
})();
