'use strict';
var G = require('./sunpath-globe-math.js');
var passed = 0, failed = 0, fails = [];
function approx(a, e, tol, label) {
  if (Math.abs(a - e) <= tol) { passed++; }
  else { failed++; fails.push(label + ': got ' + a + ' want ' + e); }
}
function ok(cond, label) { if (cond) passed++; else { failed++; fails.push(label); } }

// lonLatToVec3 convention
var p0 = G.lonLatToVec3(0, 0, 1);
approx(p0.x, 1, 1e-9, 'lon0lat0 → +X.x'); approx(p0.y, 0, 1e-9, 'lon0lat0 → +X.y'); approx(p0.z, 0, 1e-9, 'lon0lat0 → +X.z');
var pN = G.lonLatToVec3(0, 90, 1);
approx(pN.y, 1, 1e-9, 'north pole → +Y');
var pE = G.lonLatToVec3(90, 0, 1);
approx(pE.z, -1, 1e-9, 'lon90 → −Z');

// litFactor: subsolar point lit (=1), antipode dark (=-1), 90° away ~0
var sub = { lat: 0, lon: 0 };
approx(G.litFactor([0, 0], sub), 1, 1e-9, 'subsolar lit=1');
approx(G.litFactor([180, 0], sub), -1, 1e-9, 'antipode=-1');
approx(G.litFactor([90, 0], sub), 0, 1e-9, '90deg=0');
ok(G.isLit([10, 0], sub) === true, 'near subsolar isLit');
ok(G.isLit([170, 0], sub) === false, 'near antipode !isLit');

// alignmentFlareStrength: exact=1, off-by-window=0, half=0.5
approx(G.alignmentFlareStrength(49.6, 49.6, 1.5), 1, 1e-9, 'exact flare=1');
approx(G.alignmentFlareStrength(51.1, 49.6, 1.5), 0, 1e-9, 'edge flare=0');
approx(G.alignmentFlareStrength(48.85, 49.6, 1.5), 0.5, 1e-9, 'half flare=0.5');
approx(G.alignmentFlareStrength(40, 49.6, 1.5), 0, 1e-9, 'far flare=0');

console.log('globe-math: ' + passed + ' passed, ' + failed + ' failed');
if (failed) { fails.forEach(function (f) { console.log('  ✗ ' + f); }); }
process.exit(failed ? 1 : 0);
