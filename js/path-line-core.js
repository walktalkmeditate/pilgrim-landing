/* The path's line — pure core. index.html only; DOM-free, so
 * js/path-line-core.test.js runs it under node.
 *
 * The field's footpath leaves the hero under "begin walking" and goes on
 * down the page as one line of ink. It swings out of the words' column,
 * walks the margin beside them, and arrives where the walk story's own
 * line begins, at the walker waiting at the trailhead. It is drawn as the
 * reader scrolls, its tip a little below the middle of the screen, and it
 * reaches the trailhead as the story pins.
 *
 * The route is measured in page coordinates, with the story's first scene
 * where it stands before the story pins. Every point descends, so how far
 * the line is drawn is one height on the page.
 */

(function (root) {
  'use strict';

  // The tip's height on screen while it walks beside the words.
  var LEAD = 0.7;
  // Pinned, the trailhead stands near the screen's foot as the story pins,
  // so over the last RAMP screens before it the tip runs on ahead to it.
  var RAMP = 0.6;
  // Past the pin, the way down fades over this many screens as the walk
  // sets out.
  var FADE = 0.6;
  var STEP = 5;
  // The margin line keeps at most GAP from the words and never comes
  // closer than CLEAR; it wanders at most WANDER either side of its lane.
  // The swing out of the column passes the words' first corner by ROOM.
  var GAP = 56;
  var CLEAR = 4;
  var WANDER = 9;
  var ROOM = 24;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function bez(a, b, c, d, t) { var u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }

  // Where the margin line runs: GAP short of the words, or half the margin
  // if that is less, and clear of the page walker's rail.
  function marginLane(colLeft, laneMin) {
    var lane = colLeft - Math.min(GAP, colLeft / 2);
    return Math.max(lane, Math.min(laneMin + CLEAR, colLeft - 2 * CLEAR));
  }

  // The swing out of the column: an S from the mouth, heading down, to the
  // lane, heading down. As long as the words allow: it must be left of
  // them before it reaches the height they start at.
  function swing(mouth, lane, colLeft, clearY) {
    var dx = mouth[0] - lane;
    var lowest = mouth[1] + Math.max(30, 1.4 * dx);
    for (var y1 = lowest; y1 > mouth[1] + 30; y1 -= 4) {
      if (swingClears(mouth, lane, y1, colLeft, clearY)) return y1;
    }
    return mouth[1] + 30;
  }

  function swingCurve(mouth, lane, y1) {
    var d = y1 - mouth[1];
    return [mouth[0], mouth[0], lane, lane, mouth[1], mouth[1] + 0.5 * d, y1 - 0.5 * d, y1];
  }

  function swingClears(mouth, lane, y1, colLeft, clearY) {
    var c = swingCurve(mouth, lane, y1);
    var room = Math.min(ROOM, (colLeft - lane) / 2);
    var at = clearY - room;
    if (at <= mouth[1]) return false;
    if (at >= y1) return true;
    var lo = 0, hi = 1;
    for (var k = 0; k < 30; k++) {
      var mid = (lo + hi) / 2;
      if (bez(c[4], c[5], c[6], c[7], mid) < at) lo = mid; else hi = mid;
    }
    return bez(c[0], c[1], c[2], c[3], lo) <= colLeft - room;
  }

  /* g, all in page px:
   *   mouth     [x, y] where the line leaves the hero
   *   colLeft   the words' left edge; clearY, the height they start at;
   *             textBottom, where the last of them ends
   *   laneMin   the leftmost the line may run (the page walker's rail),
   *             and sceneLaneMin, the leftmost in the story's scene
   *   sceneTop  the story's first scene's top, before the pin
   *   copyLeft, copyBottom  that scene's words
   *   trail     [x, y] where the story's line begins, and heading [dx, dy]
   */
  function route(g) {
    var xs = [], ys = [];
    function add(x, y) {
      if (ys.length && y < ys[ys.length - 1]) y = ys[ys.length - 1];
      xs.push(x); ys.push(y);
    }

    var laneP = marginLane(g.colLeft, g.laneMin);
    // In the scene, a little short of the trailhead, at least halfway into
    // the gutter its words leave and clear of them by up to 16px. A pinned
    // story puts the page walker away while it is on screen, so the scene
    // need keep clear of the rail only when the story is stacked.
    var sceneMin = 'sceneLaneMin' in g ? g.sceneLaneMin : g.laneMin;
    var laneS = Math.min(g.copyLeft - Math.min(16, g.copyLeft / 3), Math.max(g.trail[0] - 90, sceneMin + CLEAR, g.copyLeft / 2));
    var y1 = swing(g.mouth, laneP, g.colLeft, g.clearY);

    var c = swingCurve(g.mouth, laneP, y1);
    var n = Math.max(8, Math.ceil((Math.abs(g.mouth[0] - laneP) + (y1 - g.mouth[1])) / STEP));
    for (var i = 0; i < n; i++) add(bez(c[0], c[1], c[2], c[3], i / n), bez(c[4], c[5], c[6], c[7], i / n));

    // Down the margin, wandering a little, then over to where the story's
    // words leave room: out as soon as the words allow, in only past them.
    var out = laneS <= laneP;
    var driftTo = g.sceneTop;
    var driftFrom = out ? Math.max(y1 + 100, driftTo - Math.max(300, 1.6 * Math.abs(laneP - laneS))) : Math.min(g.textBottom, driftTo - 60);
    var driftSpan = Math.max(1, driftTo - driftFrom);
    var amp = Math.max(0, Math.min(WANDER, (g.colLeft - CLEAR - laneP) / 2, (laneP - g.laneMin) / 2));
    for (var y = y1; y < driftTo; y += STEP) {
      var lane = laneP + (laneS - laneP) * smooth((y - driftFrom) / driftSpan);
      var env = smooth((y - y1) / 160) * (1 - smooth((y - driftFrom) / 240));
      var u = (y - y1) * 2 * Math.PI;
      add(lane + amp * env * (0.75 * Math.sin(u / 520) + 0.25 * Math.sin(u / 210 + 1.7)), y);
    }

    // Into the scene, down beside its words and round to the trailhead,
    // arriving along the story's own line.
    var T = g.trail;
    var yb = clamp(Math.max(g.copyBottom + 12, T[1] - 2.2 * Math.abs(T[0] - laneS)), g.sceneTop, T[1] - 24);
    for (y = g.sceneTop; y < yb; y += STEP) add(laneS, y);
    var hx = g.heading[0], hy = g.heading[1];
    var hl = Math.hypot(hx, hy) || 1;
    hx /= hl; hy /= hl;
    // Every point descends, so a line that sets out climbing is met level.
    if (hy < 0.05) { hy = 0.05; hl = Math.hypot(hx, hy); hx /= hl; hy /= hl; }
    var k = 0.5 * Math.hypot(T[0] - laneS, T[1] - yb);
    k = Math.min(k, 0.45 * (T[1] - yb) / hy);
    if (hx > 0) k = Math.max(0, Math.min(k, (T[0] - laneS) / hx));
    var q = [laneS, laneS, T[0] - hx * k, T[0], yb, yb + 0.55 * (T[1] - yb), T[1] - hy * k, T[1]];
    n = Math.max(8, Math.ceil((Math.abs(T[0] - laneS) + (T[1] - yb)) / STEP));
    for (i = 0; i <= n; i++) add(bez(q[0], q[1], q[2], q[3], i / n), bez(q[4], q[5], q[6], q[7], i / n));

    var s = [0];
    for (i = 1; i < xs.length; i++) s.push(s[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    return { x: xs, y: ys, s: s, swingEnd: y1 };
  }

  // The brush sets down at the mouth, heavy where the trodden path was,
  // and lifts to the story's own line.
  function brushWidth(s, w) {
    var press = smooth(s / 14);
    var lift = 1 - smooth((s - 14) / 170);
    return w * (0.7 + 0.3 * press + 1.8 * press * lift);
  }

  // Each point's normal and half-width, once per layout.
  function ribbon(r, w) {
    var n = r.x.length, nx = [], ny = [], hw = [];
    for (var i = 0; i < n; i++) {
      var a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      var tx = r.x[b] - r.x[a], ty = r.y[b] - r.y[a];
      var l = Math.hypot(tx, ty) || 1;
      nx.push(-ty / l); ny.push(tx / l);
      hw.push(brushWidth(r.s[i], w) / 2);
    }
    return { nx: nx, ny: ny, hw: hw };
  }

  // The route at a height on the page, between its points.
  function pointAt(r, y) {
    var n = r.y.length;
    if (y <= r.y[0]) return { i: 0, f: 0 };
    if (y >= r.y[n - 1]) return { i: n - 1, f: 0 };
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (r.y[mid] <= y) lo = mid; else hi = mid;
    }
    var span = r.y[hi] - r.y[lo];
    return { i: lo, f: span > 0 ? (y - r.y[lo]) / span : 0 };
  }

  function sample(r, rib, at) {
    var i = at.i, j = Math.min(r.x.length - 1, i + 1), f = at.f;
    var nx = rib.nx[i] + (rib.nx[j] - rib.nx[i]) * f, ny = rib.ny[i] + (rib.ny[j] - rib.ny[i]) * f;
    var l = Math.hypot(nx, ny) || 1;
    return {
      x: r.x[i] + (r.x[j] - r.x[i]) * f,
      y: r.y[i] + (r.y[j] - r.y[i]) * f,
      nx: nx / l, ny: ny / l,
      hw: rib.hw[i] + (rib.hw[j] - rib.hw[i]) * f
    };
  }

  function fmt(x, y, ox, oy) { return (x - ox).toFixed(1) + ' ' + (y - oy).toFixed(1); }

  // Half a circle about p from p + normal to p - normal, bulging the way
  // the normal's quarter turn back, (ny, -nx), points: forward along the
  // route, or back along it for a flipped normal.
  function cap(p, ox, oy) {
    var out = [];
    for (var k = 1; k < 6; k++) {
      var a = k / 6 * Math.PI, c = Math.cos(a), sn = Math.sin(a);
      out.push(fmt(p.x + p.hw * (c * p.nx + sn * p.ny), p.y + p.hw * (c * p.ny - sn * p.nx), ox, oy));
    }
    return out;
  }

  /* The ribbon between two heights on the page as an SVG path, in a frame
   * whose origin is page (ox, oy). A round end is the brush's own; a flat
   * one is where the line passes from the page into the story's scene. */
  function ribbonPath(r, rib, fromY, toY, ox, oy, roundStart, roundEnd) {
    if (toY <= fromY) return '';
    var a = pointAt(r, fromY), b = pointAt(r, toY);
    var p0 = sample(r, rib, a), p1 = sample(r, rib, b);
    var left = [fmt(p0.x + p0.nx * p0.hw, p0.y + p0.ny * p0.hw, ox, oy)];
    var right = [fmt(p0.x - p0.nx * p0.hw, p0.y - p0.ny * p0.hw, ox, oy)];
    for (var i = a.i + 1; i <= b.i; i++) {
      left.push(fmt(r.x[i] + rib.nx[i] * rib.hw[i], r.y[i] + rib.ny[i] * rib.hw[i], ox, oy));
      right.push(fmt(r.x[i] - rib.nx[i] * rib.hw[i], r.y[i] - rib.ny[i] * rib.hw[i], ox, oy));
    }
    left.push(fmt(p1.x + p1.nx * p1.hw, p1.y + p1.ny * p1.hw, ox, oy));
    right.push(fmt(p1.x - p1.nx * p1.hw, p1.y - p1.ny * p1.hw, ox, oy));
    var tip = roundEnd ? cap(p1, ox, oy) : [];
    var tail = roundStart ? cap({ x: p0.x, y: p0.y, nx: -p0.nx, ny: -p0.ny, hw: p0.hw }, ox, oy) : [];
    return 'M' + left.concat(tip, right.reverse(), tail).join('L') + 'Z';
  }

  /* How far down the page the line is drawn at a scroll position. t:
   * sceneTop and trailY in page px, and whether the story pins. */
  function tipAt(scrollY, H, t) {
    var k = LEAD;
    if (t.pinned) {
      var kT = (t.trailY - t.sceneTop) / H;
      k += (kT - LEAD) * smooth((scrollY - (t.sceneTop - RAMP * H)) / (RAMP * H));
    }
    return scrollY + k * H;
  }

  function leadFade(scrollY, sceneTop, H) {
    return 1 - smooth((scrollY - sceneTop) / (FADE * H));
  }

  var api = {
    LEAD: LEAD,
    CLEAR: CLEAR,
    marginLane: marginLane,
    route: route,
    brushWidth: brushWidth,
    ribbon: ribbon,
    ribbonPath: ribbonPath,
    tipAt: tipAt,
    leadFade: leadFade
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PathLineCore = api;
})(typeof window !== 'undefined' ? window : this);
