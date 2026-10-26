/* =============================================
   The path's line — the pure core

   Run via:  node js/path-line-core.test.js

   The field's footpath goes on down the page as one line of ink and
   becomes the walk story's. What must hold, on a laptop and on a phone,
   measured from the real page:

   - It never crosses the words: not the first section's, not the story
     scene's, and never the page walker's rail.
   - Every point descends, so how far it is drawn is one height on the
     page; and it ends exactly where the story's line begins, arriving
     along it.
   - Its tip stands a little below the middle of the screen while it walks
     beside the words, and, pinned, reaches the trailhead as the story
     pins, never stepping back while the reader scrolls on.
   ============================================= */

'use strict';

const C = require('./path-line-core.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// Measured on index.html: a 1696 × 915 laptop, the page walker's rail at
// 20–48px; and a 390 × 844 phone, where the rail is hidden.
const LAPTOP = {
  H: 915,
  g: {
    mouth: [848, 857], colLeft: 488, clearY: 1075, textBottom: 2048, laneMin: 52,
    sceneTop: 2213, copyLeft: 193, copyBottom: 2848, trail: [177, 3057], heading: [60, -4]
  }
};
// A 1024 × 700 laptop, where the rail and the story's words leave the
// scene no room for both: pinned, the walker is put away while the story
// is on screen, so the scene's part may pass where the rail stood.
const SMALL = {
  H: 700,
  g: {
    mouth: [512, 686], colLeft: 152, clearY: 860, textBottom: 1834, laneMin: 52, sceneLaneMin: 0,
    sceneTop: 1998, copyLeft: 61.4, copyBottom: 2460, trail: [89.6, 2653], heading: [2.55, -0.17]
  }
};
const PHONE = {
  H: 844,
  g: {
    mouth: [195, 786], colLeft: 36, clearY: 892, textBottom: 2010, laneMin: 0,
    sceneTop: 2173, copyLeft: 23, copyBottom: 2496, trail: [38, 2696], heading: [4, 20]
  }
};

function each(r, fn) {
  for (let i = 0; i < r.x.length; i++) if (!fn(r.x[i], r.y[i], i)) return false;
  return true;
}

// Within this far above the story, the story is on screen whenever the
// line is (its tip stands at most 0.7 down a screen of 560px or more), and
// a pinned story has put the page walker away.
const HIDDEN = 0.3 * 560;

[['laptop', LAPTOP], ['small laptop', SMALL], ['phone', PHONE]].forEach(function (pair) {
  const name = pair[0], g = pair[1].g;
  const r = C.route(g);
  const n = r.x.length;

  console.log('\n=== ' + name + ': the route ===\n');

  ok(Math.hypot(r.x[0] - g.mouth[0], r.y[0] - g.mouth[1]) < 0.01, name + ': it leaves the hero at the path\'s mouth, under "begin walking"');
  ok(Math.hypot(r.x[n - 1] - g.trail[0], r.y[n - 1] - g.trail[1]) < 0.01, name + ': it ends exactly where the story\'s line begins');
  ok(each(r, function (_, y, i) { return i === 0 || y >= r.y[i - 1]; }), name + ': every point descends, so one height on the page says how far it is drawn');
  ok(each(r, function (x, y, i) { return i === 0 || Math.hypot(x - r.x[i - 1], y - r.y[i - 1]) < 12; }), name + ': its points stand close, so the ink is a curve and not a polygon');

  ok(each(r, function (x, y) { return y < g.clearY || y > g.textBottom || x <= g.colLeft - C.CLEAR; }),
    name + ': beside the words it keeps to the margin, never crossing them');
  ok(each(r, function (x, y) { return y < g.clearY - 4 || y > g.textBottom || x <= g.colLeft - 4; }),
    name + ': it has swung clear of the column before the first heading begins');
  ok(each(r, function (x, y) { return y < g.sceneTop || y > g.copyBottom || x <= g.copyLeft - Math.min(16, g.copyLeft / 3); }),
    name + ': in the story\'s first scene it passes beside its words, a clear gutter from them');
  ok(each(r, function (x) { return x >= C.CLEAR; }), name + ': it never runs off the page\'s edge');
  ok(each(r, function (x, y) { return x >= g.laneMin || ('sceneLaneMin' in g && y >= g.sceneTop - HIDDEN); }),
    name + ': it keeps off the page walker\'s rail while the walker can be seen');

  const lane = r.x.filter(function (x, i) { return r.y[i] > g.clearY && r.y[i] < g.textBottom - 400; });
  ok(lane.length > 20 && Math.max.apply(null, lane) - Math.min.apply(null, lane) > 2,
    name + ': down the margin it wanders a little, as a path does');
});

console.log('\n=== arriving along the story\'s line ===\n');

(function () {
  const r = C.route(PHONE.g);
  const n = r.x.length;
  const dx = r.x[n - 1] - r.x[n - 2], dy = r.y[n - 1] - r.y[n - 2];
  const a = Math.atan2(dy, dx), b = Math.atan2(PHONE.g.heading[1], PHONE.g.heading[0]);
  ok(Math.abs(a - b) < 0.1, 'phone: it meets the story\'s line heading the way it sets out, down the screen');
})();

(function () {
  const r = C.route(LAPTOP.g);
  const n = r.x.length;
  const dx = r.x[n - 1] - r.x[n - 2], dy = r.y[n - 1] - r.y[n - 2];
  const a = Math.atan2(dy, dx), b = Math.atan2(LAPTOP.g.heading[1], LAPTOP.g.heading[0]);
  ok(dx > 0 && Math.abs(a - b) < 0.14, 'laptop: a line that sets out climbing a little is met all but level, from its left (' + (Math.abs(a - b) * 180 / Math.PI).toFixed(1) + '°)');
})();

console.log('\n=== the swing out of the column ===\n');

(function () {
  const tight = C.route(LAPTOP.g).swingEnd - LAPTOP.g.mouth[1];
  const roomier = C.route(Object.assign({}, LAPTOP.g, { clearY: LAPTOP.g.clearY + 160 })).swingEnd - (LAPTOP.g.mouth[1]);
  ok(roomier > tight + 100, 'with more room below the field, the swing is longer and gentler (' + tight.toFixed(0) + ' → ' + roomier.toFixed(0) + 'px)');
})();

ok(C.marginLane(488, 52) === 432, 'on a wide page the margin line keeps 56px from the words');
ok(C.marginLane(36, 0) === 18, 'on a phone it walks the middle of the gutter');
ok(C.marginLane(24, 52) > 12 && C.marginLane(24, 52) <= 24 - 2 * C.CLEAR, 'where the rail stands over the words (an iPad on its side), the words win');

console.log('\n=== how far it is drawn ===\n');

(function () {
  const H = LAPTOP.H, sceneTop = LAPTOP.g.sceneTop, trailY = LAPTOP.g.trail[1];
  const free = { sceneTop: sceneTop, trailY: trailY, pinned: false };
  const pin = { sceneTop: sceneTop, trailY: trailY, pinned: true };
  ok(Math.abs(C.tipAt(1000, H, free) - (1000 + C.LEAD * H)) < 1e-9, 'beside the words its tip stands at ' + C.LEAD + ' of the screen');
  ok(Math.abs(C.tipAt(1000, H, pin) - (1000 + C.LEAD * H)) < 1e-9, 'pinned too, until the story is near');
  ok(Math.abs(C.tipAt(sceneTop, H, pin) - trailY) < 1e-9, 'as the story pins, the tip is at the trailhead, where the walker waits');
  ok(C.tipAt(sceneTop + 400, H, pin) >= trailY, 'past the pin, it stays arrived');

  [LAPTOP, PHONE].forEach(function (s, k) {
    const t = { sceneTop: s.g.sceneTop, trailY: s.g.trail[1], pinned: true };
    let steady = true, prev = -Infinity;
    for (let y = 0; y < s.g.sceneTop + s.H; y += 3) {
      const tip = C.tipAt(y, s.H, t);
      if (tip < prev) steady = false;
      prev = tip;
    }
    ok(steady, (k ? 'phone' : 'laptop') + ': scrolling on never draws the line back');
  });

  ok(C.leadFade(sceneTop - 10, sceneTop, H) === 1 && C.leadFade(sceneTop, sceneTop, H) === 1, 'the way down stands whole until the walk sets out');
  ok(C.leadFade(sceneTop + 0.6 * H, sceneTop, H) === 0, 'and has faded behind the walker within the first steps of the story');
})();

console.log('\n=== the brush ===\n');

ok(C.brushWidth(0, 2) < C.brushWidth(14, 2), 'the brush sets down lightly');
ok(Math.abs(C.brushWidth(14, 2) - 5.6) < 1e-9, 'presses to nearly three times the line at the path\'s mouth');
ok(C.brushWidth(184, 2) === 2 && C.brushWidth(1500, 2) === 2, 'and lifts to the story\'s own width, which it keeps');

(function () {
  // A straight drop, for outlines whose shape is plain to see.
  const r = { x: [], y: [], s: [] };
  for (let i = 0; i <= 100; i++) { r.x.push(50); r.y.push(i * 5); r.s.push(1000 + i * 5); }
  const rib = C.ribbon(r, 2);
  const pts = function (d) { return d.replace(/[MZ]/g, '').split('L').map(function (p) { return p.trim().split(' ').map(Number); }); };

  ok(C.ribbonPath(r, rib, 100, 100, 0, 0, true, true) === '', 'nothing drawn is no path at all');

  const round = pts(C.ribbonPath(r, rib, 100, 300, 0, 0, false, true));
  const flat = pts(C.ribbonPath(r, rib, 100, 300, 0, 0, false, false));
  const lowest = function (p) { return Math.max.apply(null, p.map(function (q) { return q[1]; })); };
  ok(Math.abs(lowest(round) - 301) < 0.05, 'the tip is the brush\'s own: round, half the line beyond the drawn height');
  ok(Math.abs(lowest(flat) - 300) < 0.05, 'where the line passes into the story\'s scene its end is cut flat, to meet the scene\'s part');
  ok(round.every(function (q) { return Math.abs(q[0] - 50) <= 1.0001; }), 'its edges lie half the line\'s width either side');

  const framed = pts(C.ribbonPath(r, rib, 100, 300, 10, 100, false, false));
  ok(Math.abs(Math.min.apply(null, framed.map(function (q) { return q[1]; }))) < 0.05 && Math.abs(framed[0][0] - 39) < 0.05,
    'drawn in a frame, its points are the page\'s less the frame\'s origin');

  const start = pts(C.ribbonPath(r, rib, 0, 300, 0, 0, true, false));
  ok(Math.abs(Math.min.apply(null, start.map(function (q) { return q[1]; })) + 1) < 0.05, 'where the brush sets down, its start is round too');
})();

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
