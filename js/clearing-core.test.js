/* =============================================
   Hidden clearing — the leaning math and the glyph

   Run via:  node js/clearing-core.test.js

   The crescent on the seek door reads "34 80" with offset 17 — an arc
   centred on 3 o'clock. Everything the rider does is a variation on
   that arc: rotate it toward the clearing, open its span as the
   clearing nears, and keep it CENTRED while it opens. The centring is
   the invariant that is easy to break silently: grow the dasharray
   without moving the dashoffset and the arc grows off one end, so the
   crescent appears to slew even when the target hasn't moved.

   The glyph is the app's real seek-clearing.svg. Its source file fills
   with #0a1624 — night ink, invisible on this page's dark section. The
   core must carry the path bare and let the page colour it.
   ============================================= */

'use strict';

const C = require('./clearing-core.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}
function near(actual, expected, label) {
  ok(Math.abs(actual - expected) < 1e-9, label + '  (' + actual + ' vs ' + expected + ')');
}

console.log('\n=== leanAngleDeg — screen coords, 0° = due right, y grows down ===\n');

near(C.leanAngleDeg(0, 0, 10, 0), 0, 'target due right leans 0°');
near(C.leanAngleDeg(0, 0, 0, 10), 90, 'target below leans 90°');
near(C.leanAngleDeg(0, 0, 0, -10), -90, 'target above leans -90°');
near(C.leanAngleDeg(0, 0, -10, 0), 180, 'target due left leans 180°');
near(C.leanAngleDeg(100, 100, 110, 110), 45, 'target below-right leans 45°');

console.log('\n=== unwrapAngle — no long way round at the ±180 seam ===\n');

near(C.unwrapAngle(170, -170), 190, '170 → raw -170 continues to 190, not back through 0');
near(C.unwrapAngle(-170, 170), -190, '-170 → raw 170 continues to -190');
near(C.unwrapAngle(10, 30), 30, 'small moves pass through untouched');
near(C.unwrapAngle(370, 20), 380, 'accumulated turns are preserved');

console.log('\n=== arcSpan — 34 at rest, 64 at arrival, linear between ===\n');

near(C.arcSpan(1.5 * 800, 800), 34, 'a viewport-and-a-half away: the door\'s own 34');
near(C.arcSpan(5000, 800), 34, 'farther than that clamps at 34');
near(C.arcSpan(0, 800), 64, 'at the clearing: fully open, 64');
near(C.arcSpan(-5, 800), 64, 'negative distance clamps as arrived');
near(C.arcSpan(0.75 * 800, 800), 49, 'halfway there: halfway open');

console.log('\n=== dashFor — the arc opens from its centre ===\n');

eq(C.dashFor(34).array, '34 80', 'span 34 is the door\'s own dasharray');
near(C.dashFor(34).offset, 17, 'span 34 keeps the door\'s own offset');
eq(C.dashFor(64).array, '64 50', 'span 64 fills against the same 114 total');
near(C.dashFor(64).offset, 32, 'offset tracks span/2, so the arc stays centred');

console.log('\n=== pickZone — every zone reachable, none out of range ===\n');

eq(C.pickZone(8, function () { return 0; }), 0, 'rand 0 picks the first zone');
eq(C.pickZone(8, function () { return 0.9999; }), 7, 'rand just under 1 picks the last zone');
eq(C.pickZone(1, function () { return 0.5; }), 0, 'a single zone is always picked');
eq(C.pickZone(8, function () { return 0.999999999; }), 7, 'floating point cannot reach an eighth index');

console.log('\n=== ZONES — curated calm spots, all below the seek door ===\n');

ok(Array.isArray(C.ZONES) && C.ZONES.length >= 6, 'at least six zones so return visits differ');
ok(C.ZONES.every(function (z) { return z.side === 'left' || z.side === 'right'; }),
  'every zone hugs a margin, left or right');
ok(C.ZONES.every(function (z) { return z.topPct >= 0 && z.topPct <= 100; }),
  'every topPct is a percentage');
ok(C.ZONES.every(function (z) { return typeof z.selector === 'string' && z.selector.length > 0; }),
  'every zone names its host section');
eq(new Set(C.ZONES.map(function (z) { return z.selector; })).size, C.ZONES.length,
  'no section hosts two zones');

console.log('\n=== glyph — the app\'s seek-clearing mark, carried bare ===\n');

eq(C.GLYPH_VIEWBOX, '0 0 150 150', 'viewBox matches the normalised iOS asset');
eq(C.GLYPH_TRANSFORM, 'translate(-18.8298 63.9750) scale(0.670213)',
  'the centring transform from the iOS asset is preserved');
ok(C.GLYPH_PATH.indexOf('m223 18') === 0, 'path data starts where the iOS path starts');
ok(C.GLYPH_PATH.indexOf('fill') === -1, 'no fill rides along inside the path data');
ok(C.GLYPH_PATH.length > 3000, 'the whole path came across, not a truncation');

console.log('\n=== constants ===\n');

eq(C.STILLNESS_MS, 4000, 'stillness is four seconds');
eq(C.HOVER_MS, 350, 'hover hurries after 350ms');
eq(C.DASH_TOTAL, 114, 'dash total matches the door markup (34 + 80)');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
