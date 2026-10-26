/* =============================================
   The moon toggle — which side is lit

   Run via:  node js/moon-render.test.js

   renderMoon paints a disc, then one phase-shaped region over it: the
   half-disc on the lit side, closed by a terminator curve. That region
   is the LIT part of the moon. For years it was filled with the shadow
   colour instead, so the toggle showed the inverse of the real sky — a
   full moon drawn as a thin crescent, a new moon nearly full — and the
   first quarter lit on the wrong side. The homepage hero now paints the
   real moon beside it, which made the lie visible.

   The terminator was also a rough curve that never reached the limb: a
   full moon filled 86% of the disc and a 2%-lit crescent 22%. The lit
   area should be the moon's illuminated fraction, (1 - cos 2πp) / 2.

   No canvas in node, so a recording context stands in: it notes each
   arc, curve and fill and what colour filled it, and the lit area is
   measured from the recorded outline with the shoelace formula.
   ============================================= */

'use strict';

const Moon = require('./moon.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

const LIT_DARK = '#F0EBE1';
const SHADOW_DARK = '#1C1914';

function render(phase) {
  const fills = [];
  let arcs = [];
  let outline = [];
  const ctx = {
    fillStyle: null,
    scale() {},
    beginPath() { arcs = []; outline = []; },
    arc(cx, cy, r, a0, a1, anticlockwise) {
      arcs.push({ a0: a0, a1: a1 });
      // Canvas sweeps clockwise unless told otherwise: π/2 → -π/2 runs
      // through π, the left side, not back through 0.
      if (!anticlockwise && a1 < a0) a1 += Math.PI * 2;
      for (let i = 0; i <= 64; i++) {
        const a = a0 + (a1 - a0) * i / 64;
        outline.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    },
    bezierCurveTo(x1, y1, x2, y2, x3, y3) {
      const p0 = outline[outline.length - 1];
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        outline.push([
          u * u * u * p0[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * p0[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
        ]);
      }
    },
    fill() { fills.push({ color: this.fillStyle, arcs: arcs.slice(), outline: outline.slice() }); }
  };
  const canvas = { width: 0, height: 0, style: {}, getContext() { return ctx; } };
  global.document = { createElement() { return canvas; }, documentElement: { getAttribute() { return 'dark'; } } };
  const container = { firstChild: null, setAttribute() {}, removeChild() {}, appendChild() {} };
  Moon.renderMoon(container, phase, { isDark: true });
  return fills;
}

function litSide(phase) {
  const shaped = render(phase)[1];
  const a = shaped.arcs[0];
  return { color: shaped.color, side: a.a0 < 0 ? 'right' : 'left' };
}

console.log('\n=== the disc is the shadow; the phase-shaped region is the light ===\n');

const fills = render(0.3);
ok(fills.length === 2, 'two fills: the disc, then the phase-shaped region');
ok(fills[0].color === SHADOW_DARK, 'the whole disc is painted in shadow first');
ok(fills[1].color === LIT_DARK, 'the phase-shaped region is painted lit');

console.log('\n=== waxing is lit on the right, waning on the left ===\n');

[0.05, 0.25, 0.45].forEach(function (p) {
  const s = litSide(p);
  ok(s.color === LIT_DARK && s.side === 'right', 'phase ' + p + ' (waxing) is lit on the right');
});
[0.55, 0.75, 0.95].forEach(function (p) {
  const s = litSide(p);
  ok(s.color === LIT_DARK && s.side === 'left', 'phase ' + p + ' (waning) is lit on the left');
});

console.log('\n=== the lit area is the illuminated fraction ===\n');

function area(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

const DISC = Math.PI * 16 * 16;
[0.03, 0.1, 0.25, 0.4, 0.497, 0.6, 0.75, 0.9, 0.97].forEach(function (p) {
  const lit = area(render(p)[1].outline) / DISC;
  const want = (1 - Math.cos(2 * Math.PI * p)) / 2;
  ok(Math.abs(lit - want) < 0.02,
    'phase ' + p + ' lights ' + (lit * 100).toFixed(1) + '% of the disc (the sky: ' + (want * 100).toFixed(1) + '%)');
});

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
