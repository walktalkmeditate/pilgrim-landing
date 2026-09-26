/* One walk, told by scroll — pure core: the scene table, the scroll
 * math, the sky, and the Honor stage's timings. No DOM.
 *
 * Loaded by index.html only, before js/walk-story.js, and by
 * scripts/bake-honor-stage.js in Node. js/main.js is loaded by eight
 * pages, two of them under page-weight budgets, so this lives apart.
 *
 * Every act reads hold-local progress, never scene-local: the first
 * and last 12% of a scene are its fades, and a payoff that lands in a
 * fade plays while the scene is leaving.
 */

(function (root) {
  'use strict';

  var SCENE_VH = 140;
  var FADE = 0.12;
  var LINE_INK_END = 0.85;
  var PAST_LINE_OPACITY = 0.35;
  var PAST_LINE_OPACITY_COMPACT = 0.2;
  // Older lines on a phone fold back over the newer ones in a narrow
  // column; at 0.07 they read as a trace of the walk, not a knot.
  var PAST_LINE_OPACITY_FAR_COMPACT = 0.07;
  // Scenes either side of an ink turn where the lines are wholly veiled.
  var INK_HIDE = 0.03;
  // The moments' labels are SVG text set at LABEL_PX in the viewBox, so
  // they shrink with it; on screen they never read below LABEL_MIN_PX.
  var LABEL_PX = 13;
  var LABEL_MIN_PX = 11;
  // About a pixel of scroll: only a crawl or an easing's tail waits.
  var WRITE_EPS = 0.001;

  // Skies are per scene, not per hour: text colour cannot crossfade
  // mid-read, so a sky that darkened under a scene's fixed ink would
  // take it below AA partway through. Skies blend only inside the
  // crossfade between scenes, where the text is fading too.
  var SKIES = ['dawn', 'day', 'golden', 'dusk', 'night'];
  // The skies that take the light ink in the light theme; dark mode's ink
  // is light everywhere (css/walk-story.css).
  var DARK_SKIES = ['dusk', 'night'];

  var SCENES = [
    { id: 'set-out', name: 'Set out', sky: 'dawn' },
    { id: 'wander', name: 'Wander', sky: 'dawn' },
    { id: 'stillness', name: 'Stillness', sky: 'day' },
    { id: 'honor', name: 'Honor', sky: 'day' },
    { id: 'seek', name: 'Seek', sky: 'day' },
    { id: 'traces', name: 'Traces', sky: 'golden' },
    { id: 'home', name: 'Home', sky: 'dusk' },
    { id: 'give', name: 'Give', sky: 'night' },
    { id: 'yours-alone', name: 'Yours alone', sky: 'night' }
  ];

  var HONOR = {
    inkEnd: 0.88,
    momentFade: 0.06,
    closingAt: 0.92,
    momentFracs: [0, 0.0934, 0.9959]
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function storyProgress(scrollY, top, height, stageHeight) {
    var run = height - stageHeight;
    if (run <= 0) return 0;
    return clamp((scrollY - top) / run, 0, 1);
  }

  function sceneAt(p, n) {
    var x = clamp(p, 0, 1) * n;
    var index = Math.min(n - 1, Math.floor(x));
    return { index: index, local: x - index };
  }

  function holdLocal(local) {
    return clamp((local - FADE) / (1 - 2 * FADE), 0, 1);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  // The front (text, phone, acts) of scene j, given its own local
  // progress l = p*n - j. The first scene never fades in and the last
  // never fades out: the story opens already standing and ends at rest.
  function frontOpacity(l, j, n) {
    if (l < 0 || l > 1) return 0;
    if (l < FADE) return j === 0 ? 1 : easeOut(l / FADE);
    if (l > 1 - FADE) return j === n - 1 ? 1 : easeOut((1 - l) / FADE);
    return 1;
  }

  // On a phone the walked line shares a narrow screen with the copy and
  // folds back over itself, so only the scene just walked stays at the
  // quieter opacity and older lines fade to a trace. In the finale, whose
  // copy fills the screen, the older lines are put away; the line home
  // runs below the copy and leads to the walker.
  function lineOpacity(j, current, compact) {
    if (j > current) return 0;
    if (j === current) return 1;
    if (!compact) return PAST_LINE_OPACITY;
    if (j === current - 1) return PAST_LINE_OPACITY_COMPACT;
    return current === SCENES.length - 1 ? 0 : PAST_LINE_OPACITY_FAR_COMPACT;
  }

  // Line j's opacity at progress p: lineOpacity through a hold, eased from
  // scene b-1's to scene b's across the crossfade into b, like the fronts.
  function lineOpacityAt(j, p, n, compact) {
    var x = clamp(p, 0, 1) * n;
    var b = Math.round(x);
    if (b < 1 || b > n - 1 || Math.abs(x - b) >= FADE) return lineOpacity(j, sceneAt(p, n).index, compact);
    var from = lineOpacity(j, b - 1, compact);
    var to = lineOpacity(j, b, compact);
    return from + (to - from) * smooth((x - b + FADE) / (2 * FADE));
  }

  // The boundaries where the stage's ink turns, light theme only.
  function inkTurns(darkTheme) {
    var turns = [];
    if (darkTheme) return turns;
    for (var b = 1; b < SCENES.length; b++) {
      var was = DARK_SKIES.indexOf(SCENES[b - 1].sky) !== -1;
      var now = DARK_SKIES.indexOf(SCENES[b].sky) !== -1;
      if (was !== now) turns.push(b);
    }
    return turns;
  }

  // The walked lines and the rail wear the stage's ink, which changes in
  // one frame, so across a turn's crossfade (x = p*n) they are veiled, and
  // wholly within INK_HIDE of it, where the colour changes.
  function inkVeil(x, turns) {
    var v = 1;
    for (var i = 0; i < turns.length; i++) {
      var t = clamp((Math.abs(x - turns[i]) - INK_HIDE) / (FADE - INK_HIDE), 0, 1);
      v = Math.min(v, smooth(t));
    }
    return v;
  }

  function skyWeights(p, n) {
    var w = {};
    SKIES.forEach(function (s) { w[s] = 0; });
    var at = sceneAt(p, n);
    var i = at.index;
    var l = at.local;
    var from = SCENES[i].sky;
    var to = from;
    var t = 0;
    if (l > 1 - FADE && i < n - 1) {
      to = SCENES[i + 1].sky;
      t = (l - (1 - FADE)) / (2 * FADE);
    } else if (l < FADE && i > 0) {
      from = SCENES[i - 1].sky;
      t = 0.5 + l / (2 * FADE);
    }
    // Eased: a light sky and a dark one mix to mud halfway, so pass it fast.
    t = smooth(t);
    w[from] += 1 - t;
    w[to] += t;
    return w;
  }

  // Five opaque layers stacked in SKIES order. A linear blend of two
  // of them is the lower one at 1 with the upper one at the upper
  // one's weight over it; every other layer is off.
  function layerOpacities(weights) {
    var lit = SKIES.filter(function (s) { return weights[s] > 0; });
    return SKIES.map(function (s) {
      if (!lit.length) return 0;
      if (s === lit[0]) return 1;
      return lit.indexOf(s) !== -1 ? weights[s] : 0;
    });
  }

  function honorReveal(hold) {
    var ink = clamp(hold / HONOR.inkEnd, 0, 1);
    return {
      ink: ink,
      moments: HONOR.momentFracs.map(function (frac) {
        var at = frac * HONOR.inkEnd;
        return { frac: frac, at: at, t: clamp((hold - at) / HONOR.momentFade, 0, 1) };
      }),
      closing: hold >= HONOR.closingAt
    };
  }

  // How far a scene's own line has inked. Every scene's line finishes
  // at LINE_INK_END of its hold; Honor's follows the stage's timings.
  function lineInk(sceneId, hold) {
    if (sceneId === 'honor') return honorReveal(hold).ink;
    return clamp(hold / LINE_INK_END, 0, 1);
  }

  function pillLabel(index) {
    if (index === 0) return 'Begin walking';
    return index < SCENES.length - 1 ? 'Keep walking' : null;
  }

  // Scrolling to a scene lands at the start of its hold, not its first
  // pixel, so the rail and pill arrive on a scene already standing.
  function holdStartProgress(index, n) {
    return (index + FADE) / n;
  }

  // A --hold write restyles the scene's whole subtree, so a value that has
  // barely moved waits; either end, and every value at rest, is exact.
  function shouldWrite(written, value, eps, atRest) {
    if (value === written) return false;
    return atRest || value === 0 || value === 1 || Math.abs(value - written) >= eps;
  }

  // The counter-scale for the labels at a viewBox drawn at vbScale screen
  // pixels per unit: 1 while they read at LABEL_MIN_PX or more, and just
  // enough to hold them there below it. It never shrinks them.
  function labelScale(vbScale) {
    return Math.max(1, LABEL_MIN_PX / (LABEL_PX * vbScale));
  }

  // Lit part of the moon at phase 0..1 (0 new, 0.5 full), as an SVG
  // path in a circle of radius r centred on (cx, cy). Waxing is lit
  // on the right; the terminator is an ellipse whose x-radius is
  // r·|cos 2πφ|, bulging toward the dark side before the quarter.
  function moonPath(phase, cx, cy, r) {
    var p = ((phase % 1) + 1) % 1;
    var waxing = p < 0.5;
    var k = Math.cos(2 * Math.PI * p);
    var rx = Math.abs(k) * r;
    var top = cx + ' ' + (cy - r);
    var bottom = cx + ' ' + (cy + r);
    var limbSweep = waxing ? 1 : 0;
    var termSweep = (k > 0) === waxing ? 0 : 1;
    return 'M' + top +
      ' A' + r + ' ' + r + ' 0 0 ' + limbSweep + ' ' + bottom +
      ' A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + termSweep + ' ' + top + 'Z';
  }

  var api = {
    SCENE_VH: SCENE_VH,
    FADE: FADE,
    LINE_INK_END: LINE_INK_END,
    PAST_LINE_OPACITY: PAST_LINE_OPACITY,
    PAST_LINE_OPACITY_COMPACT: PAST_LINE_OPACITY_COMPACT,
    PAST_LINE_OPACITY_FAR_COMPACT: PAST_LINE_OPACITY_FAR_COMPACT,
    INK_HIDE: INK_HIDE,
    DARK_SKIES: DARK_SKIES,
    LABEL_PX: LABEL_PX,
    LABEL_MIN_PX: LABEL_MIN_PX,
    WRITE_EPS: WRITE_EPS,
    SKIES: SKIES,
    SCENES: SCENES,
    HONOR: HONOR,
    clamp: clamp,
    storyProgress: storyProgress,
    sceneAt: sceneAt,
    holdLocal: holdLocal,
    frontOpacity: frontOpacity,
    lineOpacity: lineOpacity,
    lineOpacityAt: lineOpacityAt,
    inkTurns: inkTurns,
    inkVeil: inkVeil,
    skyWeights: skyWeights,
    layerOpacities: layerOpacities,
    honorReveal: honorReveal,
    lineInk: lineInk,
    pillLabel: pillLabel,
    holdStartProgress: holdStartProgress,
    shouldWrite: shouldWrite,
    labelScale: labelScale,
    moonPath: moonPath
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.WalkStoryCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
