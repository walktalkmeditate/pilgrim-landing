/* =============================================
   The walk story — scroll, scenes, skies, and the Honor stage's timings

   Run via:  node js/walk-story-core.test.js

   Three invariants are easy to break silently:

   - Every act reads HOLD-local progress. The first and last 12% of a
     scene are its fades; a payoff timed in scene-local progress lands
     while the scene is leaving.
   - The sky never snaps. Skies are per scene and blend only across the
     crossfade between scenes, one small step per frame.
   - Honor's marker and ink arrive together: a moment surfaces exactly
     when the ink stands at its own fraction of the stage.
   ============================================= */

'use strict';

const C = require('./walk-story-core.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}
function near(actual, expected, label, tol) {
  ok(Math.abs(actual - expected) < (tol || 1e-9), label + '  (' + actual + ' vs ' + expected + ')');
}

console.log('\n=== the scene table ===\n');

eq(C.SCENES.length, 9, 'nine scenes');
eq(C.SCENES.map(function (s) { return s.id; }).join(','),
  'set-out,wander,stillness,honor,seek,traces,home,give,yours-alone', 'scenes in story order');
ok(C.SCENES.every(function (s) { return C.SKIES.indexOf(s.sky) !== -1; }), 'every scene wears a known sky');
eq(C.SCENES[0].sky, 'dawn', 'the story opens at dawn');
eq(C.SCENES[8].sky, 'night', 'and ends at night');
ok(C.SCENES.every(function (s, i) {
  return i === 0 || C.SKIES.indexOf(s.sky) >= C.SKIES.indexOf(C.SCENES[i - 1].sky);
}), 'the sky never runs backward');

console.log('\n=== storyProgress ===\n');

eq(C.storyProgress(0, 1000, 5000, 800), 0, 'above the story is 0');
eq(C.storyProgress(1000, 1000, 5000, 800), 0, 'the story\'s top is 0');
near(C.storyProgress(3100, 1000, 5000, 800), 0.5, 'halfway through the pinned run is 0.5');
eq(C.storyProgress(9999, 1000, 5000, 800), 1, 'below the story is 1');
eq(C.storyProgress(1200, 1000, 800, 800), 0, 'a story no taller than its stage never divides by zero');

console.log('\n=== sceneAt ===\n');

for (let k = 0; k < 9; k++) {
  eq(C.sceneAt(k / 9 + 1e-9, 9).index, k, 'p = ' + k + '/9 starts scene ' + (k + 1));
}
eq(C.sceneAt(1, 9).index, 8, 'p = 1 is still the last scene');
near(C.sceneAt(1, 9).local, 1, 'at its very end');
near(C.sceneAt(0.5, 9).local, 0.5, 'p = 0.5 is halfway through scene 5');

console.log('\n=== holdLocal ===\n');

eq(C.holdLocal(0), 0, 'a scene\'s first pixel is hold 0');
eq(C.holdLocal(0.12), 0, 'the entry fade holds at 0');
near(C.holdLocal(0.5), 0.5, 'the middle of the scene is the middle of the hold');
near(C.holdLocal(0.31), (0.31 - 0.12) / 0.76, 'linear between');
eq(C.holdLocal(0.88), 1, 'the hold ends where the exit fade begins');
eq(C.holdLocal(1), 1, 'and stays there through it');

console.log('\n=== frontOpacity ===\n');

eq(C.frontOpacity(-0.01, 3, 9), 0, 'before its scene, a front is gone');
eq(C.frontOpacity(1.01, 3, 9), 0, 'after it, too');
eq(C.frontOpacity(0, 3, 9), 0, 'a middle scene enters from nothing');
eq(C.frontOpacity(0.5, 3, 9), 1, 'is fully there through its hold');
eq(C.frontOpacity(1, 3, 9), 0, 'and leaves to nothing');
const mid = C.frontOpacity(0.06, 3, 9);
ok(mid > 0 && mid < 1, 'the entry fade is a fade  (' + mid + ')');
eq(C.frontOpacity(0, 0, 9), 1, 'the first scene is already standing when the story opens');
eq(C.frontOpacity(1, 8, 9), 1, 'the last scene never leaves');

console.log('\n=== lineOpacity ===\n');

eq(C.lineOpacity(2, 5), C.PAST_LINE_OPACITY, 'walked lines stay, quieter');
eq(C.lineOpacity(5, 5), 1, 'the line being walked is full');
eq(C.lineOpacity(6, 5), 0, 'lines not yet walked are not drawn');
ok(C.PAST_LINE_OPACITY_COMPACT < C.PAST_LINE_OPACITY, 'on a phone, walked lines step further back');
ok(C.PAST_LINE_OPACITY_FAR_COMPACT < C.PAST_LINE_OPACITY_COMPACT && C.PAST_LINE_OPACITY_FAR_COMPACT <= 0.08,
  'and older ones further still, to a trace  (' + C.PAST_LINE_OPACITY_FAR_COMPACT + ')');
eq(C.lineOpacity(4, 5, true), C.PAST_LINE_OPACITY_COMPACT, 'on a phone the scene just walked keeps the quieter opacity');
eq(C.lineOpacity(2, 5, true), C.PAST_LINE_OPACITY_FAR_COMPACT,
  'on a phone an older line fades to a trace: a narrow screen folds the whole walk into one knot');
eq(C.lineOpacity(0, 7, true), C.PAST_LINE_OPACITY_FAR_COMPACT, 'even the first line, by scene 08');
eq(C.lineOpacity(5, 5, true), 1, 'on a phone the line being walked is still full');
eq(C.lineOpacity(7, 8, true), C.PAST_LINE_OPACITY_COMPACT, 'on a phone the finale keeps the line home, which runs below its copy');
eq(C.lineOpacity(6, 8, true), 0, 'but the older lines run under the finale\'s copy, so they are put away');
eq(C.lineOpacity(8, 8, true), 1, 'on a phone the finale keeps its own last metres and the walker');
eq(C.lineOpacity(7, 8), C.PAST_LINE_OPACITY, 'on a desktop the finale keeps the whole walk');

console.log('\n=== lineOpacityAt: the lines hand over with the scroll ===\n');

// x = p * 9 is the story in scenes. Through a scene's hold every line
// wears lineOpacity; across the crossfade into the next it eases from
// one to the other, driven by the scroll like the fronts, both ways.
[false, true].forEach(function (compact) {
  const tag = compact ? 'phone' : 'desktop';
  let holdsOk = true;
  for (let i = 0; i < 9; i++) {
    [C.FADE, 0.5, 1 - C.FADE].forEach(function (l) {
      for (let j = 0; j < 9; j++) {
        if (Math.abs(C.lineOpacityAt(j, (i + l) / 9, 9, compact) - C.lineOpacity(j, i, compact)) > 1e-12) holdsOk = false;
      }
    });
  }
  ok(holdsOk, tag + ': through every hold each line wears lineOpacity exactly');
  let worst = 0;
  const lastAt = [];
  for (let k = 0; k <= 9000; k++) {
    for (let j = 0; j < 9; j++) {
      const o = C.lineOpacityAt(j, k / 9000, 9, compact);
      if (k) worst = Math.max(worst, Math.abs(o - lastAt[j]));
      lastAt[j] = o;
    }
  }
  ok(worst < 0.01, tag + ': no line jumps: a 1/9000 scroll step moves none by 0.01 or more  (' + worst.toFixed(4) + ')');
});
near(C.lineOpacityAt(5, (6 - C.FADE) / 9, 9, false), 1, 'the line just walked is still whole as the crossfade begins');
near(C.lineOpacityAt(5, (6 + C.FADE) / 9, 9, false), C.PAST_LINE_OPACITY, 'and has stepped back by the time the next hold begins');
near(C.lineOpacityAt(6, (6 - C.FADE) / 9, 9, false), 0, 'the next scene\'s line arrives with its scene, from nothing');
const midway = C.lineOpacityAt(5, 6 / 9, 9, false);
ok(midway > C.PAST_LINE_OPACITY && midway < 1, 'at the boundary itself the hand-over is under way  (' + midway.toFixed(3) + ')');

console.log('\n=== inkTurns and inkVeil: the ink changes out of sight ===\n');

// In light the ink is dark on dawn, day and golden and light on dusk and
// night, and the stage's ink, which the walked lines and the rail wear,
// switches in one frame. They are veiled around that boundary so the
// switch happens while they are hidden. Dark mode's ink never turns.
ok(C.DARK_SKIES.indexOf('dusk') !== -1 && C.DARK_SKIES.indexOf('night') !== -1 && C.DARK_SKIES.length === 2,
  'dusk and night are the skies that take the light ink in the light theme');
eq(C.inkTurns(false).join(','), '6', 'in light the ink turns once, into scene 07\'s dusk');
eq(C.inkTurns(true).length, 0, 'in dark it never turns');
const turns = C.inkTurns(false);
eq(C.inkVeil(6 - 1e-9, turns), 0, 'the last frame before the stage\'s ink switches is veiled');
eq(C.inkVeil(6, turns), 0, 'and the first frame after it');
near(C.inkVeil(6 - C.INK_HIDE, turns), 0, 'the veil is whole for INK_HIDE before the switch', 1e-12);
near(C.inkVeil(6 + C.INK_HIDE, turns), 0, 'and for INK_HIDE after it, so a fast scroll steps over no visible frame', 1e-12);
ok(C.INK_HIDE > 0 && C.INK_HIDE < C.FADE / 2, 'the veiled stretch is a small part of the crossfade  (' + C.INK_HIDE + ')');
let veilHoldsOk = true, veilWorst = 0, lastVeil = 1;
for (let k = 0; k <= 9000; k++) {
  const x = k / 1000;
  const v = C.inkVeil(x, turns);
  if (x - Math.floor(x) >= C.FADE && x - Math.floor(x) <= 1 - C.FADE && v !== 1) veilHoldsOk = false;
  veilWorst = Math.max(veilWorst, Math.abs(v - lastVeil));
  lastVeil = v;
  if (C.inkVeil(x, []) !== 1) veilHoldsOk = false;
}
ok(veilHoldsOk, 'no scene\'s hold is ever veiled, and nothing is veiled where the ink does not turn');
ok(veilWorst < 0.05, 'the veil falls and lifts smoothly: a 1/9000 step moves it by less than 0.05  (' + veilWorst.toFixed(4) + ')');
near(C.inkVeil(6 - 0.07, turns), C.inkVeil(6 + 0.07, turns), 'it lifts as it fell, so scrolling back up is the same veil in reverse', 1e-12);

console.log('\n=== skyWeights and layerOpacities ===\n');

function sum(w) { return Object.keys(w).reduce(function (a, k) { return a + w[k]; }, 0); }
let sumsOk = true, maxStep = 0, prev = null;
for (let i = 0; i <= 900; i++) {
  const w = C.skyWeights(i / 900, 9);
  if (Math.abs(sum(w) - 1) > 1e-9) sumsOk = false;
  if (prev) C.SKIES.forEach(function (s) { maxStep = Math.max(maxStep, Math.abs(w[s] - prev[s])); });
  prev = w;
}
ok(sumsOk, 'sky weights sum to 1 everywhere');
// An eased blend is steepest halfway, at 1.5 times the linear rate
// (0.042 per 1/900 step), so the bound is set just above that.
ok(maxStep < 0.07, 'the sky never snaps: a 1/900 scroll step moves no weight by 0.07 or more  (' + maxStep.toFixed(4) + ')');
// A linear blend of golden into dusk spends a long stretch as flat mud;
// an eased one holds each sky longer and crosses the middle quickly.
const quarter = C.skyWeights((6 - C.FADE / 2) / 9, 9);
ok(quarter.dusk > 0 && quarter.dusk < 0.25, 'the crossfade eases: a quarter of the way in, the next sky has less than a quarter  (' + quarter.dusk.toFixed(3) + ')');
near(C.skyWeights(6 / 9, 9).dusk, 0.5, 'and is even at the boundary', 1e-9);
C.SCENES.forEach(function (s, i) {
  const w = C.skyWeights(C.holdStartProgress(i, 9) + 0.3 / 9, 9);
  eq(w[s.sky], 1, 'through scene ' + (i + 1) + '\'s hold the sky is its own: ' + s.sky);
});
eq(C.layerOpacities({ dawn: 0, day: 0, golden: 0.7, dusk: 0.3, night: 0 }).join(','), '0,0,1,0.3,0',
  'a blend is the lower sky at 1 with the upper sky at its weight over it');
eq(C.layerOpacities({ dawn: 1, day: 0, golden: 0, dusk: 0, night: 0 }).join(','), '1,0,0,0,0',
  'one sky is one layer');

console.log('\n=== honorReveal ===\n');

eq(C.honorReveal(0).ink, 0, 'the stage starts un-inked');
eq(C.honorReveal(C.HONOR.inkEnd).ink, 1, 'the ink reaches Takahara at the end of its run');
C.HONOR.momentFracs.forEach(function (frac, i) {
  const at = frac * C.HONOR.inkEnd;
  if (at > 0) eq(C.honorReveal(at - 0.001).moments[i].t, 0, 'moment ' + (i + 1) + ' is not showing before the ink reaches it');
  near(C.honorReveal(at + C.HONOR.momentFade).moments[i].t, 1, 'moment ' + (i + 1) + ' is fully showing one fade later', 1e-9);
  near(C.honorReveal(at).ink, frac, 'moment ' + (i + 1) + ' surfaces when the ink stands at its own fraction', 1e-12);
});
eq(C.honorReveal(0.919).closing, false, 'the closing line waits');
eq(C.honorReveal(0.92).closing, true, 'the closing line arrives at hold 0.92');
ok(C.HONOR.closingAt > C.HONOR.inkEnd, 'the closing line waits until the ink has arrived');

console.log('\n=== lineInk ===\n');

eq(C.lineInk('wander', 0), 0, 'a scene\'s line starts un-inked');
eq(C.lineInk('wander', C.LINE_INK_END), 1, 'and finishes at LINE_INK_END of the hold');
eq(C.lineInk('honor', 0.44), C.honorReveal(0.44).ink, 'Honor inks on the stage\'s own timing');

console.log('\n=== pillLabel and holdStartProgress ===\n');

eq(C.pillLabel(0), 'Begin walking', 'scene 1 invites');
for (let i = 1; i <= 7; i++) eq(C.pillLabel(i), 'Keep walking', 'scene ' + (i + 1) + ' keeps walking');
eq(C.pillLabel(8), null, 'scene 9 has no pill: its store badges end the story');
near(C.holdStartProgress(3, 9), (3 + 0.12) / 9, 'a jump aims at the start of the scene\'s hold');
const landed = C.sceneAt(C.holdStartProgress(3, 9), 9);
eq(landed.index, 3, 'and lands inside the scene it names');
near(C.holdLocal(landed.local), 0, 'at the very start of its hold', 1e-9);

console.log('\n=== labelScale ===\n');

eq(C.labelScale(1), 1, 'at full size the labels are drawn as set');
eq(C.labelScale(2), 1, 'a larger viewBox scale never shrinks them');
eq(C.labelScale(C.LABEL_MIN_PX / C.LABEL_PX), 1, 'exactly at the floor, nothing changes');
near(C.labelScale(0.64), C.LABEL_MIN_PX / (C.LABEL_PX * 0.64), 'at 1024px (scale 0.64) they are counter-scaled', 1e-12);
[0.3, 0.5, 0.64, 0.8, 0.846, 1, 1.5].forEach(function (s) {
  ok(C.labelScale(s) * C.LABEL_PX * s >= C.LABEL_MIN_PX - 1e-9,
    'at viewBox scale ' + s + ' a label reads at ' + C.LABEL_MIN_PX + 'px or more on screen  (' + (C.labelScale(s) * C.LABEL_PX * s).toFixed(2) + ')');
});
eq(C.LABEL_MIN_PX, 11, 'labels never read below 11px on screen');

console.log('\n=== moonPath ===\n');

eq(C.moonPath(0.5, 50, 50, 10), 'M50 40 A10 10 0 0 0 50 60 A10.00 10 0 0 0 50 40Z',
  'full moon: the left limb and a right-bulging terminator close a whole disc');
eq(C.moonPath(0.25, 50, 50, 10), 'M50 40 A10 10 0 0 1 50 60 A0.00 10 0 0 0 50 40Z',
  'first quarter: the right half, a straight terminator');
ok(C.moonPath(0.1, 50, 50, 10).indexOf('A10 10 0 0 1 ') !== -1, 'a waxing moon is lit on the right');
ok(C.moonPath(0.9, 50, 50, 10).indexOf('A10 10 0 0 0 ') !== -1, 'a waning moon is lit on the left');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
