/* Reliquary scroll-reveal visualization.
 *
 * Three jobs:
 *   1. Generate footprint symbols along the hidden route path so the walk
 *      appears to actually walk across the card.
 *   2. Wire up bidirectional coupling between SVG pins and the filmstrip
 *      thumbnails beneath them — mirrors the carousel ↔ map pairing in
 *      the iOS app.
 *   3. Open a lightbox when any pin or thumbnail is tapped.
 */

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function generateFootprints() {
    var path = document.querySelector('.reliquary-route-line');
    var container = document.querySelector('.reliquary-footprints');
    if (!path || !container || typeof path.getTotalLength !== 'function') return;

    var totalLength;
    try {
      totalLength = path.getTotalLength();
    } catch (e) {
      return;
    }
    // A valid reliquary path is ~700 user units. Anything much smaller
    // (eg. 1 from a stale pathLength attribute, or 0 from an unrendered
    // path) means we got bad data — bail out rather than plant stray
    // footprints at phantom coordinates.
    if (!totalLength || totalLength < 50) return;

    var STEPS = 22;
    var PERP_OFFSET = 2.2;

    for (var i = 0; i < STEPS; i++) {
      var t = (i + 0.5) / STEPS;
      var d = t * totalLength;

      var point, ahead;
      try {
        point = path.getPointAtLength(d);
        ahead = path.getPointAtLength(Math.min(d + 1.5, totalLength));
      } catch (e) {
        continue;
      }
      if (!point || !ahead ||
          !isFinite(point.x) || !isFinite(point.y) ||
          !isFinite(ahead.x) || !isFinite(ahead.y)) {
        continue;
      }

      var angleDeg = Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180 / Math.PI;
      var side = i % 2 === 0 ? 1 : -1;
      var perpRad = (angleDeg + 90) * Math.PI / 180;
      var ox = Math.cos(perpRad) * PERP_OFFSET * side;
      var oy = Math.sin(perpRad) * PERP_OFFSET * side;

      var g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'reliquary-footprint');
      g.style.setProperty('--fp-delay', (0.2 + i * 0.07).toFixed(2) + 's');
      g.setAttribute('transform',
        'translate(' + (point.x + ox).toFixed(2) + ' ' + (point.y + oy).toFixed(2) +
        ') rotate(' + (angleDeg + 90).toFixed(1) + ')');

      var heel = document.createElementNS(SVG_NS, 'ellipse');
      heel.setAttribute('cx', '0');
      heel.setAttribute('cy', '-1.7');
      heel.setAttribute('rx', '1.3');
      heel.setAttribute('ry', '1.6');

      var toe = document.createElementNS(SVG_NS, 'ellipse');
      toe.setAttribute('cx', '0');
      toe.setAttribute('cy', '1.4');
      toe.setAttribute('rx', '0.9');
      toe.setAttribute('ry', '1');

      g.appendChild(heel);
      g.appendChild(toe);
      container.appendChild(g);
    }
  }

  function wireCoupling() {
    var pins = Array.prototype.slice.call(document.querySelectorAll('.reliquary-pin-group'));
    var items = Array.prototype.slice.call(document.querySelectorAll('.reliquary-filmstrip-item'));
    if (!pins.length || !items.length) return;

    // Guardrail against silent drift: the pin ↔ filmstrip coupling
    // indexes by position, so a mismatched count means hovering pin N
    // highlights a different photo than the one actually at pin N.
    if (pins.length !== items.length) {
      console.warn(
        '[reliquary] pin count (' + pins.length + ') does not match ' +
        'filmstrip count (' + items.length + '). Coupling will be wrong ' +
        'for any index past the shorter of the two.'
      );
    }

    function setActive(index) {
      pins.forEach(function (pin, i) { pin.classList.toggle('is-active', i === index); });
      items.forEach(function (item, i) { item.classList.toggle('is-active', i === index); });
    }

    function clearActive() {
      pins.forEach(function (pin) { pin.classList.remove('is-active'); });
      items.forEach(function (item) { item.classList.remove('is-active'); });
    }

    // Pins are pointer-only. Keyboard + screen-reader users reach the
    // same photos via the filmstrip buttons below, which sit outside
    // the aria-hidden SVG and are proper <button> elements.
    pins.forEach(function (pin, i) {
      pin.addEventListener('pointerenter', function () { setActive(i); });
      pin.addEventListener('pointerleave', clearActive);
      pin.addEventListener('click', function () { openLightbox(i); });
    });

    items.forEach(function (item, i) {
      item.addEventListener('pointerenter', function () { setActive(i); });
      item.addEventListener('pointerleave', clearActive);
      item.addEventListener('focus', function () { setActive(i); });
      item.addEventListener('blur', clearActive);
      item.addEventListener('click', function () { openLightbox(i); });
    });
  }

  function openLightbox(index) {
    var pin = document.querySelector('.reliquary-pin-group[data-pin-index="' + index + '"]');
    var lightbox = document.getElementById('reliquary-lightbox');
    if (!pin || !lightbox) return;

    var img = lightbox.querySelector('.reliquary-lightbox-image');
    var timeEl = lightbox.querySelector('.reliquary-lightbox-time');
    var distEl = lightbox.querySelector('.reliquary-lightbox-dist');

    var time = pin.getAttribute('data-time') || '';
    var dist = pin.getAttribute('data-distance') || '';

    img.src = 'assets/reliquary/photo-' + (index + 1) + '.jpg';
    img.alt = 'Photo taken at ' + time + ', ' + dist + ' into the walk';
    timeEl.textContent = time;
    distEl.textContent = dist + ' in';

    if (typeof lightbox.showModal === 'function') {
      lightbox.showModal();
    } else {
      lightbox.setAttribute('open', '');
    }
  }

  function wireLightbox() {
    var lightbox = document.getElementById('reliquary-lightbox');
    if (!lightbox) return;
    var closeBtn = lightbox.querySelector('.reliquary-lightbox-close');
    function close() {
      if (typeof lightbox.close === 'function') {
        lightbox.close();
      } else {
        lightbox.removeAttribute('open');
      }
    }
    if (closeBtn) closeBtn.addEventListener('click', close);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) close();
    });
    lightbox.addEventListener('cancel', function () { close(); });
  }

  // In star mode, photo pins drift faintly with cursor — wind through stars.
  // Disabled on touch (no fine pointer) and when reduced-motion is set.
  function wireStarParallax() {
    var svg = document.querySelector('.reliquary-route-svg');
    if (!svg) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var pins = Array.prototype.slice.call(svg.querySelectorAll('.reliquary-pin-group'));
    if (!pins.length) return;

    var rafId = null;
    var targetX = 0, targetY = 0;
    var currentX = 0, currentY = 0;

    function step() {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      pins.forEach(function (pin, i) {
        // Each pin gets its own depth so they drift at different speeds —
        // closer pins move more, distant pins less. Stable per pin.
        var depth = 0.4 + (i % 3) * 0.3;
        pin.style.transform = 'translate(' + (currentX * depth).toFixed(2) + 'px, ' + (currentY * depth).toFixed(2) + 'px)';
      });
      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
      }
    }

    function onMove(e) {
      if (!document.body.classList.contains('constellation')) {
        // Out of star mode: drift pins back to origin instead of freezing.
        if (targetX !== 0 || targetY !== 0) reset();
        return;
      }
      var rect = svg.getBoundingClientRect();
      // Guard against zero-rect (svg hidden / pre-layout) — division would NaN.
      if (rect.width === 0 || rect.height === 0) return;
      var nx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
      var ny = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
      targetX = nx * 8;
      targetY = ny * 6;
      if (rafId === null) rafId = requestAnimationFrame(step);
    }

    function reset() {
      targetX = 0;
      targetY = 0;
      if (rafId === null) rafId = requestAnimationFrame(step);
    }

    // Observe body class so leaving star mode glides pins back to origin
    // even without further mouse movement.
    var observer = new MutationObserver(function () {
      if (!document.body.classList.contains('constellation')) reset();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', reset);
  }

  function init() {
    generateFootprints();
    wireCoupling();
    wireLightbox();
    wireStarParallax();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
