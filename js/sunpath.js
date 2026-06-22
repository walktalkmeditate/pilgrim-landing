/* =============================================
   Sun Path — controller

   Manages app state and user interaction. Drawing is delegated to
   window.createSvgGlobe (js/sunpath-globe-svg.js) behind the
   GlobeRenderer interface.

   Stage A: globe + terminator + subsolar + year-scrub +
            axial-tilt inset + monument pins.

   Depends on: js/sunpath-math.js, js/sunpath-globe-svg.js,
               js/vendor/d3-geo.min.js,
               js/vendor/topojson-client.min.js
   ============================================= */

(function () {
  'use strict';

  var M = window.SunPathMath;
  if (!M) {
    console.error('SunPathMath not loaded');
    return;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // --- App state ---

  var GLOBE_SIZE = 480;

  var monuments = [];
  var rotation = [0, -10];
  var scrubDate = null;
  var idleTimerId = null;
  var dragState = null;
  var renderer = null;
  var driftState = { year: null };

  var dom = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    dom.globeContainer = document.getElementById('sunpath-globe');
    dom.subsolarCaption = document.getElementById('sunpath-subsolar');
    dom.yearScrub = document.getElementById('sunpath-year-scrub');
    dom.scrubLabel = document.getElementById('sunpath-scrub-label');
    dom.tiltInset = document.getElementById('sunpath-tilt');
    dom.monumentList = document.getElementById('sunpath-monuments');
    dom.popover = document.getElementById('sunpath-monument-popover');

    if (!dom.globeContainer) return;

    // Permalink pages can freeze the globe to a specific UTC instant by
    // setting window.__sunpathForce.date before this script runs.
    if (window.__sunpathForce && window.__sunpathForce.date) {
      scrubDate = new Date(window.__sunpathForce.date);
    }

    if (typeof d3 === 'undefined') {
      console.error('d3-geo not loaded');
    } else if (typeof window.createSvgGlobe === 'function') {
      renderer = window.createSvgGlobe(dom.globeContainer, {
        size: GLOBE_SIZE,
        onDragStart: onDragStart,
        onDragMove: onDragMove,
        onDragEnd: onDragEnd,
        onMonumentClick: showMonumentPopover
      });
      renderer.setRotation(rotation);
      loadMonuments();
      redrawAll();
    }

    setupYearScrub();
    setupTimelapse();
    renderTilt(activeDate());

    // Esc dismisses popover.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideMonumentPopover();
    });

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

    if ('requestIdleCallback' in window) requestIdleCallback(maybeUpgradeToGl);
    else setTimeout(maybeUpgradeToGl, 200);
  }

  function loadMonuments() {
    fetch('/assets/sunpath/monuments.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        monuments = data;
        redrawAll();
        renderMonumentList();
      })
      .catch(function (err) { console.warn('monuments json failed', err); });
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

  // --- State helpers ---

  function activeDate() {
    return scrubDate || new Date();
  }

  function buildState() {
    var date = activeDate();
    return {
      date: date,
      subsolar: M.subsolarPoint(date),
      declination: M.declination(date),
      monuments: monuments,
      drift: driftState
    };
  }

  window.__sunpathSetDrift = function (d) {
    driftState = d || { year: null };
    if (renderer) renderer.render(buildState());
  };

  function redrawAll() {
    if (!renderer) return;
    renderer.setRotation(rotation);
    renderer.redrawStatic();
    renderer.render(buildState());
    updateSubsolarCaption(M.subsolarPoint(activeDate()), activeDate());
  }

  // --- Subsolar caption ---

  function updateSubsolarCaption(sub, date) {
    if (!dom.subsolarCaption) return;
    var latStr = Math.abs(sub.lat).toFixed(1) + '°' + (sub.lat >= 0 ? 'N' : 'S');
    var lonStr = Math.abs(sub.lon).toFixed(1) + '°' + (sub.lon >= 0 ? 'E' : 'W');
    var dateStr = scrubDate ? date.toUTCString().slice(0, 16) : 'right now';
    dom.subsolarCaption.textContent = 'the sun is overhead at ' + latStr + ' · ' + lonStr + ' (' + dateStr + ')';
  }

  // --- Monument popover ---

  function showMonumentPopover(m) {
    if (!dom.popover) return;
    clearChildren(dom.popover);

    var closeBtn = htmlEl('button', 'sunpath-popover-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', hideMonumentPopover);
    dom.popover.appendChild(closeBtn);

    dom.popover.appendChild(htmlEl('h3', 'sunpath-detail-name', m.name));
    dom.popover.appendChild(htmlEl('p', 'sunpath-detail-meta', m.country + ' · ' + yearLabel(m.constructed)));
    dom.popover.appendChild(htmlEl('p', 'sunpath-detail-alignment', m.alignmentDescription));

    var az = M.sunriseAzimuth(m.lat, activeDate());
    var azStr = (az !== null) ? az.toFixed(1) + '° east of north' : 'sun does not rise today';
    var sunriseP = htmlEl('p', 'sunpath-detail-sunrise');
    sunriseP.appendChild(document.createTextNode('Sunrise today: '));
    sunriseP.appendChild(htmlEl('strong', null, azStr));
    dom.popover.appendChild(sunriseP);

    if (m.sourceNote) {
      dom.popover.appendChild(htmlEl('p', 'sunpath-detail-source', '— ' + m.sourceNote));
    }

    positionPopover(m);
    dom.popover.hidden = false;
  }

  function hideMonumentPopover() {
    if (!dom.popover) return;
    dom.popover.hidden = true;
  }

  function positionPopover(m) {
    if (!dom.popover || !renderer) return;
    var pt = renderer.projectPoint([m.lon, m.lat]);
    if (!pt.visible) return;
    var coords = [pt.x, pt.y];
    // Coords are in SVG user-space (0..GLOBE_SIZE). Globe wrap renders the
    // SVG at width:100% so we scale to wrap pixel coords.
    var wrap = dom.globeContainer;
    var wrapRect = wrap.getBoundingClientRect();
    var scale = wrapRect.width / GLOBE_SIZE;
    var pinX = coords[0] * scale;
    var pinY = coords[1] * scale;

    // Default: popover sits to the right of the pin, vertically centered.
    var popW = 260;
    var popH = dom.popover.offsetHeight || 180;
    var margin = 12;
    var left = pinX + margin;
    var top = pinY - popH / 2;

    // If overflows right edge, place left of pin.
    if (left + popW > wrapRect.width) {
      left = pinX - popW - margin;
    }
    // Clamp to wrap bounds.
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    if (top + popH > wrapRect.height) top = wrapRect.height - popH;

    dom.popover.style.left = left + 'px';
    dom.popover.style.top = top + 'px';
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
        rotateToMonument(m);
        if (dom.globeContainer) {
          dom.globeContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        showMonumentPopover(m);
      });
      li.appendChild(btn);
      dom.monumentList.appendChild(li);
    });
  }

  function rotateToMonument(m) {
    rotation = [-m.lon, -m.lat];
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
      var svgEl2 = renderer && renderer.getSvg && renderer.getSvg();
      if (svgEl2 && svgEl2.setPointerCapture) {
        try { svgEl2.setPointerCapture(dragState.pointerId); } catch (err) {}
      }
      dragState.captured = true;
      hideMonumentPopover();
    }
    var sensitivity = 0.5;
    rotation = [
      dragState.rotation[0] + dx * sensitivity,
      Math.max(-89, Math.min(89, dragState.rotation[1] - dy * sensitivity))
    ];
    renderer.setRotation(rotation);
    renderer.redrawStatic();
    renderer.render(buildState());
    updateSubsolarCaption(M.subsolarPoint(activeDate()), activeDate());
  }

  function onDragEnd() {
    dragState = null;
  }

  // --- Year scrub slider ---

  function setupYearScrub() {
    if (!dom.yearScrub) return;
    var year = new Date().getUTCFullYear();
    dom.yearScrub.min = 1;
    dom.yearScrub.max = 365;
    dom.yearScrub.value = M.dayOfYear(new Date());
    dom.yearScrub.addEventListener('input', function () {
      // User wants to scrub manually — silently end any active time-lapse so
      // the two don't fight over scrubDate.
      if (timelapseRaf) stopTimelapse();
      var dayN = parseInt(dom.yearScrub.value, 10);
      var now = new Date();
      var d = new Date(Date.UTC(year, 0, 1, now.getUTCHours(), now.getUTCMinutes()));
      d.setUTCDate(dayN);
      scrubDate = d;
      updateScrubLabel(d);
      renderer.render(buildState());
      updateSubsolarCaption(M.subsolarPoint(d), d);
      renderTilt(d);
    });
    if (dom.scrubLabel) {
      dom.scrubLabel.addEventListener('click', function () {
        scrubDate = null;
        dom.yearScrub.value = M.dayOfYear(new Date());
        updateScrubLabel(null);
        redrawAll();
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

  // --- 24-hour time-lapse ---
  // Click to sweep the terminator through 24 UTC hours over ~12 seconds.
  // Click again to stop. Honors prefers-reduced-motion: skips animation,
  // jumps to +24h scrubDate as a static change.

  var timelapseRaf = null;
  var timelapseBtn = null;
  var timelapsePrevScrub = null; // remember scrub state to restore on stop

  function setupTimelapse() {
    timelapseBtn = document.getElementById('sunpath-timelapse');
    if (!timelapseBtn) return;
    timelapseBtn.addEventListener('click', function () {
      if (timelapseRaf) {
        stopTimelapse();
      } else {
        startTimelapse();
      }
    });
  }

  function startTimelapse() {
    if (!renderer) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timelapseBtn.classList.add('is-playing');
    var label = timelapseBtn.querySelector('.sunpath-timelapse-label');
    var icon = timelapseBtn.querySelector('.sunpath-timelapse-icon');
    if (label) label.textContent = 'stop';
    if (icon) icon.textContent = '■';
    // Snapshot scrub state so stop can restore (live or scrubbed-day).
    timelapsePrevScrub = scrubDate;
    var startReal = performance.now();
    var startDate = activeDate().getTime();
    var DURATION_MS = 12000;
    var SPAN_MS = 24 * 3600 * 1000;
    function frame(now) {
      var elapsed = now - startReal;
      if (elapsed >= DURATION_MS) {
        // Loop back to start of sweep — keeps the meditative quality.
        scrubDate = new Date(startDate);
        renderer.render(buildState());
        renderTilt(activeDate());
        startReal = now;
        timelapseRaf = requestAnimationFrame(frame);
        return;
      }
      var t = elapsed / DURATION_MS;
      scrubDate = new Date(startDate + t * SPAN_MS);
      renderer.render(buildState());
      timelapseRaf = requestAnimationFrame(frame);
    }
    timelapseRaf = requestAnimationFrame(frame);
  }

  function stopTimelapse() {
    if (timelapseRaf) cancelAnimationFrame(timelapseRaf);
    timelapseRaf = null;
    if (timelapseBtn) {
      timelapseBtn.classList.remove('is-playing');
      var label = timelapseBtn.querySelector('.sunpath-timelapse-label');
      var icon = timelapseBtn.querySelector('.sunpath-timelapse-icon');
      if (label) label.textContent = 'play 24 hours';
      if (icon) icon.textContent = '▶';
    }
    // Restore the pre-play scrub state so the globe doesn't strand mid-sweep.
    scrubDate = timelapsePrevScrub;
    timelapsePrevScrub = null;
    redrawAll();
    renderTilt(activeDate());
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

  // --- Progressive enhancement: lazy GL upgrade ---

  window.__loadThree = function () {
    if (window.THREE) return Promise.resolve(window.THREE);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/js/vendor/three.min.js';
      s.onload = function () { resolve(window.THREE); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function maybeUpgradeToGl() {
    if (!window.SunPathCapability) return;
    var env = window.SunPathCapability.detectEnv();
    if (window.SunPathCapability.selectRenderer(env) !== 'gl') return;
    window.__loadThree()
      .then(function () { return loadScript('/js/sunpath-globe-gl.js'); })
      .then(function () {
        var gl = window.createGlGlobe(dom.globeContainer, {
          size: GLOBE_SIZE,
          onDragStart: onDragStart,
          onDragMove: onDragMove,
          onDragEnd: onDragEnd,
          onMonumentClick: showMonumentPopover
        });
        gl.setRotation(rotation);
        gl.render(buildState());
        renderer.destroy();
        renderer = gl;
      })
      .catch(function (e) { console.warn('GL globe unavailable, staying on SVG', e); });
  }

  function idleTick() {
    if (scrubDate) return;
    redrawAll();
    renderTilt(new Date());
  }
})();
