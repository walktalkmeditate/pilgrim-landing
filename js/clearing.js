/* The hidden clearing — DOM wiring. Loaded by index.html only.
 *
 * One calm spot below the seek door holds a denser patch of fog,
 * placed fresh each visit. Step through the door (scroll past it)
 * and the door's crescent rides the viewport, leaning toward the
 * spot — the app's own gesture: the crescent rides the walker, and
 * leans toward what waits. Stillness with the fog in view reveals
 * the clearing; hover and tap merely hurry it. Reduced motion gets
 * no rider and a plain crossfade, and keeps every way in.
 */

(function () {
  'use strict';

  var C = window.ClearingCore;
  if (!C) return;

  var door = document.querySelector('.seek-door');
  if (!door) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var zones = C.ZONES.filter(function (z) {
    return document.querySelector(z.selector);
  });
  if (!zones.length) return;
  var zone = zones[C.pickZone(zones.length, Math.random)];
  var host = document.querySelector(zone.selector);
  host.classList.add('clearing-host');

  var fog = document.createElement('button');
  fog.type = 'button';
  fog.className = 'clearing-fog clearing-fog--' + zone.side;
  fog.style.top = zone.topPct + '%';
  fog.setAttribute('aria-label', 'Something waits in the fog');
  fog.innerHTML =
    '<span class="clearing-glyph" aria-hidden="true">' +
    '<svg viewBox="' + C.GLYPH_VIEWBOX + '" fill="none">' +
    '<g transform="' + C.GLYPH_TRANSFORM + '">' +
    '<path d="' + C.GLYPH_PATH + '" fill="currentColor"/>' +
    '</g></svg></span>';
  host.appendChild(fog);

  var status = document.createElement('p');
  status.className = 'clearing-status';
  status.setAttribute('role', 'status');
  host.appendChild(status);

  var rider = null, riderSvg = null, riderCircle = null;
  var prevAngle = 90;
  var revealed = false;
  var raf = 0;

  function buildRider() {
    rider = document.createElement('div');
    rider.className = 'clearing-rider';
    rider.setAttribute('aria-hidden', 'true');
    rider.innerHTML =
      '<svg viewBox="0 0 48 48" width="28" height="28" fill="none">' +
      '<circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2.5" ' +
      'stroke-linecap="round" stroke-dasharray="34 80" stroke-dashoffset="17"/></svg>';
    document.body.appendChild(rider);
    riderSvg = rider.querySelector('svg');
    riderCircle = rider.querySelector('circle');
  }

  function frame() {
    raf = 0;
    if (!rider || revealed) return;

    var riding = door.getBoundingClientRect().bottom < 0;
    rider.classList.toggle('is-riding', riding);
    if (!riding) return;

    var r = rider.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var f = fog.getBoundingClientRect();
    var tx = f.left + f.width / 2;
    var ty = f.top + f.height / 2;

    prevAngle = C.unwrapAngle(prevAngle, C.leanAngleDeg(cx, cy, tx, ty));
    riderSvg.style.transform = 'rotate(' + prevAngle.toFixed(1) + 'deg)';

    var dx = tx - cx, dy = ty - cy;
    var dash = C.dashFor(C.arcSpan(Math.sqrt(dx * dx + dy * dy), window.innerHeight));
    riderCircle.style.strokeDasharray = dash.array;
    riderCircle.style.strokeDashoffset = dash.offset;
  }

  function requestFrame() {
    if (!raf) raf = window.requestAnimationFrame(frame);
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
    status.textContent = 'A clearing, revealed.';

    if (io) io.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', requestFrame);
    if (rider) rider.classList.remove('is-riding');
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
    window.addEventListener('resize', requestFrame, { passive: true });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  if (rider) requestFrame();
})();
