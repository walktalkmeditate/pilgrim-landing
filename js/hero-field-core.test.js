/* =============================================
   The field — the pure core

   Run via:  node js/hero-field-core.test.js

   The hero's painting is WebGL, which node cannot run, so everything in it
   with a right answer lives in js/hero-field-core.js and is held here:

   - The sky. The moon is the page's real moon, so it must stand where
     its phase puts it — a full moon high at midnight and gone at noon, a
     young crescent low in the west after sunset. Daylight saving moves
     noon to 13:00; a zone without it keeps noon at 12:00.
   - The path. The shader draws it from pathGlsl() and the layout clears
     grass from pathX(); if the two curves drift apart the visitor sees a
     bare lane beside a path through grass. The test translates the GLSL
     back to JS and holds the two equal.
   - The palette. "begin walking" stands on the path, so the path is the
     ground its text must read against, in both themes.
   ============================================= */

'use strict';

process.env.TZ = 'America/Chicago';

const C = require('./hero-field-core.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function near(actual, expected, tol, label) {
  ok(Math.abs(actual - expected) <= tol, label + '  (' + actual.toFixed(3) + ' vs ' + expected + ')');
}

console.log('\n=== the moon stands where its phase puts it ===\n');

// January: Chicago keeps standard time, so solar noon is 12:00.
const full = 0.5, newMoon = 0, firstQuarter = 0.25;
let sky = C.skyBodies(new Date(2027, 0, 20, 0, 0), full);
near(sky.moon.alt, 1, 0.01, 'a full moon is at the top of its arc at midnight');
near(sky.moon.x01, 0.5, 0.01, 'and due south, mid-sky');
sky = C.skyBodies(new Date(2027, 0, 20, 12, 0), full);
ok(!sky.moon.visible && sky.moon.alt < 0, 'a full moon is below the horizon at noon');
sky = C.skyBodies(new Date(2027, 0, 20, 12, 0), newMoon);
near(sky.moon.alt, 1, 0.01, 'a new moon crosses with the sun at noon');
sky = C.skyBodies(new Date(2027, 0, 20, 18, 0), firstQuarter);
near(sky.moon.alt, 1, 0.01, 'a first quarter is highest at 18:00');
sky = C.skyBodies(new Date(2027, 0, 20, 18, 30), 0.1);
ok(sky.moon.visible && sky.moon.x01 > 0.5, 'a young crescent after sunset hangs in the west (right)');
sky = C.skyBodies(new Date(2027, 0, 20, 20, 30), full);
ok(sky.moon.visible && sky.moon.x01 < 0.5, 'a full moon in the evening is rising in the east (left)');
near(C.skyBodies(new Date(2027, 0, 20), full).moon.illumination, 1, 1e-9, 'a full moon is wholly lit');
near(C.skyBodies(new Date(2027, 0, 20), newMoon).moon.illumination, 0, 1e-9, 'a new moon not at all');

console.log('\n=== the sun keeps the clock, daylight saving included ===\n');

near(C.skyBodies(new Date(2027, 0, 20, 12, 0), 0).sun.alt, 1, 0.01, 'January in Chicago: highest at 12:00');
near(C.skyBodies(new Date(2027, 6, 20, 13, 0), 0).sun.alt, 1, 0.01, 'July in Chicago, under daylight saving: highest at 13:00');
ok(C.skyBodies(new Date(2027, 0, 20, 8, 0), 0).sun.x01 < 0.5, 'the morning sun is east (left)');
ok(C.skyBodies(new Date(2027, 0, 20, 16, 0), 0).sun.x01 > 0.5, 'the afternoon sun is west (right)');
ok(!C.skyBodies(new Date(2027, 0, 20, 23, 0), 0).sun.visible, 'at 23:00 the sun is down');
ok(C.skyBodies(new Date(2027, 5, 21, 20, 0), 0).sun.visible, 'at 20:00 on midsummer it is still up');
ok(!C.skyBodies(new Date(2027, 11, 21, 18, 30), 0).sun.visible, 'at 18:30 on midwinter it has set');

process.env.TZ = 'Asia/Tokyo';
near(C.daylightSavingHours(new Date(2027, 6, 20, 13, 0)), 0, 1e-9, 'Tokyo keeps no daylight saving, so noon stays at 12:00');
process.env.TZ = 'America/Chicago';
near(C.daylightSavingHours(new Date(2027, 6, 20, 13, 0)), 1, 1e-9, 'Chicago in July runs an hour ahead');

console.log('\n=== the light the plumes catch ===\n');

const low = C.sheenFor(C.skyBodies(new Date(2027, 0, 20, 16, 50), full));
const high = C.sheenFor(C.skyBodies(new Date(2027, 0, 20, 12, 0), full));
ok(low.warm > high.warm && low.strength > high.strength, 'a low sun lights them warmer and brighter than a high one');
ok(low.rgb[2] < high.rgb[2], 'and gold — less blue');
const fullNight = C.sheenFor(C.skyBodies(new Date(2027, 0, 20, 0, 0), full));
const darkNight = C.sheenFor(C.skyBodies(new Date(2027, 0, 20, 0, 0), newMoon));
ok(fullNight.strength > darkNight.strength, 'a full moon overhead lights them more than no moon');
ok(fullNight.warm === 0, 'moonlight carries no warmth');

console.log('\n=== one path, drawn and cleared ===\n');

ok([0.5, 3, 7, 11].every(function (d) { return C.pathX(d) === 0; }),
  'the path runs straight out from under "begin walking" for eleven metres');
const offsets = [];
for (let d = 11; d <= 90; d += 0.5) offsets.push(C.pathX(d));
ok(Math.max.apply(null, offsets) > 1 && Math.min.apply(null, offsets) < -1, 'then meanders right and left');

function clampf(v, a, b) { return Math.min(Math.max(v, a), b); }
const glsl = C.pathGlsl()
  .replace(/float (pathX|pathHalf)\(float d\)\{/g, 'function $1(d){')
  .replace(/float settle/g, 'var settle')
  .replace(/(\d)\.0\b/g, '$1')
  .replace(/\bsin\(/g, 'Math.sin(')
  .replace(/\blog\(/g, 'Math.log(')
  .replace(/\bclamp\(/g, 'clampf(');
const shader = new Function('clampf', glsl + '; return { pathX: pathX, pathHalf: pathHalf };')(clampf);
let worst = 0;
for (let d = 0.2; d < 95; d += 0.37) {
  worst = Math.max(worst, Math.abs(shader.pathX(d) - C.pathX(d)), Math.abs(shader.pathHalf(d) - C.pathHalfWidth(d)));
}
ok(worst < 1e-9, 'the shader\'s path is the layout\'s path, to the millimetre and beyond  (worst ' + worst.toExponential(1) + ' m)');

console.log('\n=== the blades ===\n');

const N = 6000;
const proj = C.projection(1440, 900, 0.66);
const a = C.layoutBlades(N, proj.tanHalfX, 7);
const b = C.layoutBlades(N, proj.tanHalfX, 7);
ok(a.length === N * C.FLOATS_PER_BLADE, 'eight floats a blade');
ok(a.every(function (v, i) { return v === b[i]; }), 'the same seed grows the same field');

let inPath = 0, nearBand = 0, farToNear = true, downwind = true;
const windAngle = Math.atan2(C.WIND[1], C.WIND[0]);
const verge = [], open = [];
for (let i = 0; i < N; i++) {
  const k = i * C.FLOATS_PER_BLADE;
  const x = a[k], d = a[k + 1], h = a[k + 2];
  if (C.inPath(x, d)) inPath++;
  if (d < 7) nearBand++;
  if (i > 0 && d > a[k - C.FLOATS_PER_BLADE + 1]) farToNear = false;
  if (Math.abs(a[k + 6] - windAngle) > 1.61) downwind = false;
  const edge = C.fromPath(x, d);
  if (d < 30 && a[k + 5] === 1) {
    if (edge < 0.4) verge.push(h);
    else if (edge > 3) open.push(h);
  }
}
function mean(xs) { return xs.reduce(function (s, v) { return s + v; }, 0) / xs.length; }
ok(inPath === 0, 'no blade grows in the path  (' + inPath + ')');
ok(farToNear, 'blades are written far to near, the order they paint');
ok(nearBand / N > 0.08, 'about a tenth stand close enough to read as single strokes  (' + (100 * nearBand / N).toFixed(1) + '%)');
ok(downwind, 'every blade leans within a right angle of downwind');
ok(verge.length > 10 && mean(verge) < 0.75 * mean(open),
  'plumes on the verge are trodden low  (' + mean(verge).toFixed(2) + ' m vs ' + mean(open).toFixed(2) + ' m in the open)');

console.log('\n=== the camera ===\n');

[[1440, 900, 0.66], [390, 844, 0.62], [1366, 650, 0.78]].forEach(function (v) {
  const p = C.projection(v[0], v[1], v[2]);
  const farY01 = (1 - p.shift) / 2;
  near(farY01, v[2], 1e-12, v[0] + 'x' + v[1] + ': eye level at infinity lands on the horizon');
  ok(p.tanHalfX >= Math.tan(19 * Math.PI / 180) - 1e-12, v[0] + 'x' + v[1] + ': never narrower than 38° across');
});

const P = C.projection(1440, 900, 0.66);
ok(C.pointerOnField(700, 0.66 * 900 - 20, 1440, 900, P, 0) === null, 'a pointer in the sky touches no grass');
const hit = C.pointerOnField(900, 820, 1440, 900, P, 0);
const backX = (hit.x / (P.tanHalfX * hit.d) + 1) / 2 * 1440;
const backY = (1 - ((1.0 - C.EYE) / (P.tanHalfY * hit.d) + P.shift)) / 2 * 900;
ok(Math.abs(backX - 900) < 1e-6 && Math.abs(backY - 820) < 1e-6, 'a pointer meets the grass tops right under itself');
ok(C.pointerOnField(900, 820, 1440, 900, P, 3).d - hit.d === 3, 'and the walk carries the point forward with you');

ok(C.horizonFraction(400, 900) * 900 >= 400 + 0.13 * 900, 'the horizon leaves room under the words for the moon');
ok(C.horizonFraction(600, 650) === 0.8, 'and on a short screen never leaves less than a fifth for the field');
ok(C.horizonFraction(100, 900) === 0.58, 'nor more than its share on a tall one');

console.log('\n=== your movement is wind ===\n');

ok(C.windStrength(0, 1440) === 0, 'a still cursor is still air');
ok(C.windStrength(144, 1440) < 0.15, 'a slow drift, a tenth of the screen a second, is a breath  (' + C.windStrength(144, 1440).toFixed(2) + ')');
ok(C.windStrength(2880, 1440) > 0.8, 'a flick, two screens a second, is a gust  (' + C.windStrength(2880, 1440).toFixed(2) + ')');
ok(C.windStrength(1e6, 1440) <= C.PUFF_MAX, 'a frantic scribble is capped, and never flattens the field');
ok(C.windStrength(720, 1440) > C.windStrength(360, 1440), 'faster is stronger');
ok(Math.abs(C.windStrength(500, 1000) - C.windStrength(1000, 2000)) < 1e-12, 'strength is measured in screens, so a phone and a monitor agree');

const from = { x: -2, d: 12 }, to = { x: -1, d: 12 };
const puff = C.puffFromMove(from, to, 0.05, 2000, 1440);
ok(puff.vx > 0 && Math.abs(puff.vd) < 1e-9, 'a gust blows the way the cursor travelled, not away from it');
ok(puff.x === to.x && puff.d === to.d, 'and starts where the cursor is now');
ok(Math.abs(puff.s - C.windStrength(2000, 1440)) < 1e-12, 'with the strength of the cursor\'s speed on screen');
const wild = C.puffFromMove({ x: 0, d: 10 }, { x: 0, d: 59 }, 0.016, 3000, 1440);
ok(Math.hypot(wild.vx, wild.vd) <= C.PUFF_TOP_SPEED + 1e-9, 'a jump toward the horizon cannot fling a gust off at a hundred metres a second');

const carried = Object.assign({}, puff);
let alive = true, steps = 0;
const startX = carried.x, startS = carried.s;
while (alive && steps < 600) { alive = C.stepPuff(carried, 1 / 60); steps++; }
ok(carried.x > startX + 0.5, 'a flick\'s gust carries on past the cursor  (' + (carried.x - startX).toFixed(2) + ' m)');
ok(!alive && steps < 240, 'and fades within a few seconds  (' + (steps / 60).toFixed(1) + ' s)');
const half = Object.assign({}, puff);
for (let i = 0; i < 30; i++) C.stepPuff(half, 1 / 60);
ok(half.s < startS && half.s > startS * 0.2, 'half a second on it is weaker, not gone');

const ahead = C.scrollPuff(120, 0.016, 900, 0);
const back = C.scrollPuff(-120, 0.016, 900, 2);
ok(ahead.vd > 0 && Math.abs(ahead.vx) < 1e-9, 'scrolling down sends wind away from you, up the path');
ok(back.vd < 0, 'scrolling up sends it back toward you');
ok(Math.abs(ahead.x - C.pathX(ahead.d)) < 1e-9 && ahead.d > 0, 'it rises on the path, just ahead of where you stand');
ok(back.d > ahead.d, 'and moves with you as you walk');
ok(C.scrollPuff(4, 0.016, 900, 0).s < C.scrollPuff(200, 0.016, 900, 0).s, 'a flung scroll blows harder than a nudge');

console.log('\n=== the budget ===\n');

ok(C.bladeBudget(1440, 900, {}) === 22000, 'a laptop hero grows 22,000 blades');
ok(C.bladeBudget(3840, 2160, {}) === 28000, 'a 4K hero is capped at 28,000');
ok(C.bladeBudget(390, 844, { coarse: true }) === 7000, 'a phone grows the floor, 7,000');
ok(C.bladeBudget(1440, 900, { saveData: true }) < C.bladeBudget(1440, 900, {}), 'Save-Data halves it');
ok(C.bladeBudget(1440, 900, { cores: 4 }) < C.bladeBudget(1440, 900, { cores: 8 }), 'a four-core machine grows fewer');

console.log('\n=== the palette ===\n');

function lum(rgb) {
  const l = rgb.map(function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contrast(p, q) {
  const a1 = lum(p), b1 = lum(q);
  return (Math.max(a1, b1) + 0.05) / (Math.min(a1, b1) + 0.05);
}

// The page's own tokens (css/styles.css). "begin walking" is --ink-fog.
const LIGHT = { parchment: '#F5F0E8', ink: '#2C241E', inkFog: '#5E5953' };
const DARK = { parchment: '#1C1914', ink: '#F0EBE1', inkFog: '#908A83' };
['spring', 'summer', 'autumn', 'winter'].forEach(function (season) {
  const l = C.palette(LIGHT, season, false);
  const d = C.palette(DARK, season, true);
  const cl = contrast(C.hexToRgb(LIGHT.inkFog), l.path);
  const cd = contrast(C.hexToRgb(DARK.inkFog), d.path);
  ok(cl >= 4.5, season + ', light: "begin walking" reads on the path  (' + cl.toFixed(2) + ':1)');
  ok(cd >= 4.5, season + ', dark: and in the dark  (' + cd.toFixed(2) + ':1)');
  ok(lum(l.plume) < lum(l.paper), season + ', light: plumes are darker than the paper, or they vanish into it');
  ok(lum(d.plume) > lum(d.paper), season + ', dark: and lighter than night paper');
});
ok(C.palette({ parchment: 'nonsense', ink: '' }, 'autumn', false).paper.length === 3,
  'an unreadable token falls back to the paper it should have been');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
