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

console.log('\n=== the labels stand clear of the line ===\n');

// A label's box in stage units, from its anchor and an average glyph
// width measured in Chrome (Lato 13px ≈ 6.3 per character, the Japanese
// line 12 per character). The page counter-scales labels about their
// marker so they never read below 11px; k covers that range.
function labelBoxes(name, i, k) {
  const at = a.placements[name].moments[i];
  const l = B.LABELS[name][i];
  const m = a.moments[i];
  function box(text, perChar, y, up, down) {
    const w = text.length * perChar;
    const x0 = l.anchor === 'end' ? l.x - w : l.x;
    return [at[0] + k * x0, at[1] + k * (y - up), at[0] + k * (x0 + w), at[1] + k * (y + down)];
  }
  return [box(m.label, 6.3, l.y, 10, 3), box(m.ja, 12, l.y + 15, 11, 2)];
}
function segmentHitsBox(p, q, b) {
  for (let t = 0; t <= 1; t += 0.02) {
    const x = p[0] + (q[0] - p[0]) * t;
    const y = p[1] + (q[1] - p[1]) * t;
    if (x > b[0] && x < b[2] && y > b[1] && y < b[3]) return true;
  }
  return false;
}
function overlaps(b, c) {
  return b[0] < c[2] && c[0] < b[2] && b[1] < c[3] && c[1] < b[3];
}
Object.keys(B.GEOMETRIES).forEach(function (name) {
  const p = a.placements[name];
  const tx = +p.transform.match(/translate\(([-\d.]+)/)[1];
  const ty = +p.transform.match(/translate\([-\d.]+ ([-\d.]+)/)[1];
  const route = fixture.route.length && a.d.slice(1).split(' L').map(function (xy) {
    const v = xy.split(' ').map(Number);
    return [tx + p.scale * v[0], ty + p.scale * v[1]];
  });
  [1, 1.4].forEach(function (k) {
    const boxes = [];
    a.moments.forEach(function (m, i) {
      labelBoxes(name, i, k).forEach(function (b, j) {
        const pad = [b[0] - 1.5, b[1] - 1.5, b[2] + 1.5, b[3] + 1.5];
        let crossed = false;
        for (let s = 1; s < route.length; s++) if (segmentHitsBox(route[s - 1], route[s], pad)) crossed = true;
        ok(!crossed, name + ' ×' + k + ': the line never runs through ' + (j ? m.ja : m.label));
        p.moments.forEach(function (dot, d) {
          const r = 5 * 1.5;
          ok(!overlaps(b, [dot[0] - r, dot[1] - r, dot[0] + r, dot[1] + r]),
            name + ' ×' + k + ': ' + (j ? m.ja : m.label) + ' clears the marker at ' + a.moments[d].label);
        });
        boxes.push([j ? m.ja : m.label, b]);
      });
    });
    for (let x = 0; x < boxes.length; x++) {
      for (let y = x + 1; y < boxes.length; y++) {
        ok(!overlaps(boxes[x][1], boxes[y][1]), name + ' ×' + k + ': ' + boxes[x][0] + ' and ' + boxes[y][0] + ' do not overlap');
      }
    }
  });
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
