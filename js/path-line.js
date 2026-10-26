/* The path's line — DOM wiring. index.html only, after js/walk-story.js
 * and js/path-line-core.js, all deferred.
 *
 * Two SVGs carry it: one on the page, from the hero's foot to the story's
 * top, and one in the story's first scene, from its top to the trailhead,
 * so that once the story pins, the scene's part stays with the scene.
 * Boxes are read in measure(), on resize and whenever the page's height
 * changes under it; a frame reads only the scroll position. With reduced
 * motion the line is drawn whole, and still.
 */

(function () {
  'use strict';

  var C = window.PathLineCore;
  var hint = document.querySelector('.hero .scroll-hint');
  var story = document.querySelector('.walk-story');
  var scene = story && story.querySelector('.walk-story-scene');
  var main = document.querySelector('main');
  if (!C || !hint || !scene || !main) return;

  var NS = 'http://www.w3.org/2000/svg';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var portrait = window.matchMedia('(max-width: 720px)');
  var walker = document.getElementById('page-walker');

  function make(tag, parent, attrs) {
    var el = parent.appendChild(document.createElementNS(NS, tag));
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  var page = make('svg', document.body, { 'class': 'path-line', 'aria-hidden': 'true', focusable: 'false' });
  // Quieter than the words beside them, the ink comes to full strength as
  // it reaches the story, whose line it becomes.
  var ink = make('linearGradient', page, { id: 'path-line-ink', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0 });
  make('stop', ink, { offset: 0, 'stop-color': 'currentColor', 'stop-opacity': 0.55 });
  make('stop', ink, { offset: 1, 'stop-color': 'currentColor', 'stop-opacity': 1 });
  var pageInk = make('path', page, { fill: 'url(#path-line-ink)' });
  var lead = make('svg', scene, { 'class': 'path-line path-line--lead', 'aria-hidden': 'true', focusable: 'false' });
  var leadInk = make('path', lead, { fill: 'currentColor' });

  var route = null, rib = null, at = null;
  var H = 0, top = 0, sceneTop = 0, sceneLeft = 0;
  var shown = window.scrollY, target = shown, raf = 0, lastT = 0, drawn = NaN, faded = -1, pending = 0;

  function pageBox(el) {
    var b = el.getBoundingClientRect();
    return { left: b.left + window.scrollX, top: b.top + window.scrollY, right: b.right + window.scrollX, bottom: b.bottom + window.scrollY };
  }

  function screenPoint(m, p) {
    return [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f];
  }

  function measure() {
    route = null;
    var line = scene.querySelector('.walk-story-line--' + (portrait.matches ? 'portrait' : 'landscape') + ' .ws-line');
    var copy = scene.querySelector('.walk-story-copy');
    var m = line && line.getScreenCTM && line.getScreenCTM();
    if (!m || !copy) return;
    var pinned = story.classList.contains('walk-story--pinned');
    var sb = scene.getBoundingClientRect();
    // Pinned, the scene stands at the story's top until the pin; past it,
    // its box is wherever the stage is held.
    sceneTop = pinned ? pageBox(story).top : sb.top + window.scrollY;
    sceneLeft = sb.left + window.scrollX;
    var length = line.getTotalLength();
    var a = screenPoint(m, line.getPointAtLength(0));
    var b = screenPoint(m, line.getPointAtLength(Math.min(4, length)));
    var cb = copy.getBoundingClientRect();

    var cols = Array.prototype.filter.call(main.querySelectorAll('.section-inner'), function (el) {
      return pageBox(el).top < sceneTop;
    }).map(pageBox);
    if (!cols.length) return;
    var hb = pageBox(hint);
    var rail = walker && getComputedStyle(walker).display !== 'none' ? walker.getBoundingClientRect().right + 4 : 0;

    H = window.innerHeight;
    route = C.route({
      mouth: [(hb.left + hb.right) / 2, hb.bottom + 6],
      colLeft: Math.min.apply(null, cols.map(function (c) { return c.left; })),
      clearY: cols[0].top,
      textBottom: Math.max.apply(null, cols.map(function (c) { return c.bottom; })),
      laneMin: rail,
      sceneLaneMin: pinned ? 0 : rail,
      sceneTop: sceneTop,
      copyLeft: cb.left + window.scrollX,
      copyBottom: cb.bottom - sb.top + sceneTop,
      trail: [a[0] + window.scrollX, a[1] - sb.top + sceneTop],
      heading: [b[0] - a[0], b[1] - a[1]]
    });
    var width = parseFloat(getComputedStyle(line).strokeWidth) * Math.hypot(m.a, m.b);
    rib = C.ribbon(route, width);
    at = { sceneTop: sceneTop, trailY: route.y[route.y.length - 1], pinned: pinned };

    top = Math.floor(route.y[0] - 12);
    page.style.top = top + 'px';
    page.style.height = Math.ceil(sceneTop - top) + 'px';
    ink.setAttribute('y1', sceneTop - 0.45 * H - top);
    ink.setAttribute('y2', sceneTop - top);
    drawn = NaN;
    faded = -1;
  }

  function draw(scrollY) {
    if (!route) return;
    var first = route.y[0], last = route.y[route.y.length - 1];
    var tip = reduced ? last : Math.max(first, Math.min(last, C.tipAt(scrollY, H, at)));
    if (Math.abs(tip - drawn) >= 0.25 || drawn !== drawn) {
      drawn = tip;
      pageInk.setAttribute('d', C.ribbonPath(route, rib, first, Math.min(tip, sceneTop), 0, top, true, tip < sceneTop));
      leadInk.setAttribute('d', tip > sceneTop ? C.ribbonPath(route, rib, sceneTop, tip, sceneLeft, sceneTop, false, true) : '');
    }
    if (at.pinned && !reduced) {
      var f = Math.round(C.leadFade(scrollY, sceneTop, H) * 1000) / 1000;
      if (f !== faded) { lead.style.opacity = f; faded = f; }
    } else if (faded !== 1) {
      lead.style.opacity = '';
      faded = 1;
    }
  }

  // Eased toward the scroll position as js/walk-story.js eases its own,
  // so a mouse wheel's steps glide and the two lines meet in step.
  function frame(t) {
    raf = 0;
    var dt = lastT ? Math.min(64, t - lastT) : 16.667;
    lastT = t;
    shown += (target - shown) * (1 - Math.pow(0.86, dt / 16.667));
    if (Math.abs(target - shown) < 0.5) shown = target;
    draw(shown);
    if (shown !== target) raf = window.requestAnimationFrame(frame);
    else lastT = 0;
  }

  function onScroll() {
    target = window.scrollY;
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  function relayout() {
    if (pending) return;
    pending = window.requestAnimationFrame(function () {
      pending = 0;
      measure();
      shown = target = window.scrollY;
      draw(shown);
    });
  }

  measure();
  draw(shown);
  window.addEventListener('resize', relayout);
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(main);
  if (!reduced) window.addEventListener('scroll', onScroll, { passive: true });
})();
