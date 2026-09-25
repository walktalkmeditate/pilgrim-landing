/* =============================================
   The Honor stage bake

   Run via:  node scripts/bake-honor-stage.test.js

   The line must be the stage's real shape, placed without distortion,
   starting exactly where the previous scene's line ended, and every
   marker must carry the hold at which the ink reaches it.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const B = require('./bake-honor-stage.js');
const C = require('../js/walk-story-core.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nakahechi-stage-00.json'), 'utf8'));
const a = B.bake(fixture);

console.log('\n=== the fixture and the path ===\n');

eq(JSON.stringify(B.bake(fixture)), JSON.stringify(a), 'the bake is deterministic');
eq(fixture.route.length, 45, 'the fixture carries the stage\'s 45 points');
eq((a.d.match(/[ML]/g) || []).length, 45, 'every one of them reaches the path');
eq(fixture.moments.map(function (m) { return m.frac; }).join(','), C.HONOR.momentFracs.join(','),
  'the core\'s moment fractions are the fixture\'s');
eq(a.localEnd.join(' '), '100 0', 'Takahara is the stage\'s north-east corner in the local box');

console.log('\n=== placement ===\n');

Object.keys(B.GEOMETRIES).forEach(function (name) {
  const g = B.GEOMETRIES[name];
  const p = a.placements[name];
  const m = p.transform.match(/^translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)$/);
  ok(!!m, name + ': placed by one translate and one uniform scale, never distorted');
  if (m) {
    const x = +m[1] + (+m[3]) * a.localStart[0];
    const y = +m[2] + (+m[3]) * a.localStart[1];
    ok(Math.abs(x - g.start[0]) < 0.2 && Math.abs(y - g.start[1]) < 0.2,
      name + ': Takijiri-oji sits on the previous scene\'s end point');
  }
  eq(p.moments.length, 3, name + ': three moments placed');
  ok(Math.abs(p.moments[0][0] - g.start[0]) < 0.2 && Math.abs(p.moments[0][1] - g.start[1]) < 0.2,
    name + ': Takijiri-oji\'s marker is the line\'s first point');
});

console.log('\n=== the SVG ===\n');

['landscape', 'portrait'].forEach(function (name) {
  const svg = B.svgFor(a, name);
  C.honorReveal(0).moments.forEach(function (m) {
    const at = Math.round(m.at * 1e4) / 1e4;
    ok(svg.indexOf('--at:' + at + '"') !== -1, name + ': the marker at frac ' + m.frac + ' carries --at:' + at);
  });
  eq((svg.match(/pathLength="1"/g) || []).length, 2, name + ': the faint line and yours both reveal by path length');
  eq((svg.match(/class="ws-moment-mark"/g) || []).length, 3,
    name + ': each marker scales on an inner group, so its scale cannot replace its position');
  ok(svg.indexOf('class="ws-dot"') !== -1, name + ': the walker dot rides inside the stage\'s own group');
  ok(svg.indexOf('vector-effect') === -1, name + ': no non-scaling stroke, which would part the ink from the dot');
  ok(svg.indexOf('style="--ws-route-scale:' + a.placements[name].scale + '"') !== -1,
    name + ': the group carries its scale, so the stroke can be divided by it');
});

const src = fs.readFileSync(path.join(__dirname, 'bake-honor-stage.js'), 'utf8');
ok(!/(require|readFileSync)\([^)]*open-pilgrimages/.test(src), 'the bake never reads the sibling repo');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
