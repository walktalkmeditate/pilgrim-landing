# One Walk, Told by Scroll: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the middle of pilgrimapp.org's home page with one pinned, scroll-told walk: nine scenes from dawn to night, carried by an ink line. Wander, Honor and Seek all live inside it.

**Architecture:**
- **Pure core:** the scene table, scroll math, sky blending and Honor timings live in `js/walk-story-core.js`, with Node tests.
- **Honor stage:** `scripts/bake-honor-stage.js` bakes the real Kumano Kodō stage from a committed fixture into SVG pasted into `index.html`.
- **Markup:** nine scenes, stacked, each carrying its own copy, phone mock and line in two geometries (landscape and portrait).
- **Acts are CSS:** every act is a `calc()` over one custom property, `--hold`, and defaults to its finished state when `--hold` is unset.
- **Wiring:** `js/walk-story.js` pins the stage and, per frame, writes only `--hold`, opacities and dot transforms.

**Tech Stack:** plain HTML, CSS and ES5-style JS, with no build step and no dependencies. Tests are plain `node <file>.test.js` scripts.

**Spec:** `docs/superpowers/specs/2026-09-24-one-walk-story-design.md` (commit `0f0abb0`). Read it before Task 1.

## Global Constraints

- Plain HTML/CSS/JS, no build step, no runtime dependencies: no libraries and no npm packages.
- Tests are plain `node <file>.test.js` scripts in the repo's own `ok()`/`✓` style (see `js/clearing-core.test.js`), and each ends with a summary line and `process.exit(1)` on failure.
- Every class, id, file and function for this feature is prefixed `walk-story` / `ws-`. Never a bare `.story`: "Why Pilgrim exists" is `class="story section"`, styled at `css/styles.css:1111–1123`.
- Only `transform` and `opacity` animate. SVG `stroke-dashoffset` on the short scene paths (under 200 points) is the one exception. No per-frame layout reads.
- No JavaScript, `prefers-reduced-motion: reduce`, and viewports under 560 px tall all get the stacked, finished-state story.
- WCAG AA: body text ≥ 4.5:1 over every scene's sky, in light and dark. In star mode the sky is transparent and the starfield shows.
- Phone mocks quote only strings found in cited pilgrim-ios files. Nothing the app doesn't show appears on a phone.
- The Honor stage's data comes from the committed fixture `scripts/fixtures/nakahechi-stage-00.json`, never from `../open-pilgrimages` at test time.
- `js/page-weight.test.js` is a ratchet. Every baseline raise is a deliberate line with a reason comment.
- The pre-commit hook checks permalinks and JSON-LD metadata; it must pass, never `--no-verify`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Never bare `git stash`. Ship as a PR, never a commit to `main`. The PR merges only after pilgrim-landing PR #25, which waits on pilgrim-worker #45 being deployed.

## Decisions this plan makes beyond the spec (flag in the PR)

1. **Skies are per scene, not per hour.** The spec interpolated an hour continuously. But text colour can't crossfade mid-read, so a sky darkening under a scene's fixed ink would drop it below AA partway through. So each scene has its own sky (dawn, dawn, day, day, day, golden, dusk, night, night), and skies blend only inside the crossfade between scenes, where the text is fading too. The arc from dawn to night is unchanged.
2. **Inactive scenes use `opacity: 0` and `pointer-events: none`, not `visibility: hidden`.** Hidden would take eight of nine scenes away from screen readers and keyboard users. The focus rule (focusing anything in a scene brings that scene on stage) keeps focus out of faded scenes.
3. **Scenes live inside the sticky stage.** Pinned, all nine fill the stage and only the active scene's front shows. Stacked, they flow normally. Each scene carries its own phone and line, so no separate "slots" are needed.
4. **Scene 02's transcript is a caption on the page, not text on the phone.** The app transcribes after the walk (WhisperKit), so the active-walk screen shows the recording ("Stop", the Talk timer), and the same words appear in scene 07's summary, where the app really shows them.
5. **Reveals scrub both ways,** including scene 08's share route. The spec's `.revealed` class became a `--hold` scrub, per the reversal decision recorded in the spec.
6. **The contrast check is its own test,** `js/walk-story-contrast.test.js`. It follows `js/breathe-contrast.test.js`'s approach (tokens parsed from the shipped stylesheet). The two existing sweeps cover the seasonal parchment and the hour-wash, which the story's skies replace, so they stay untouched.
7. **The two line geometries switch by CSS media query** (`max-width: 720px`), not JavaScript. `walk-story.js` only re-measures the visible geometry's paths.

## File map

| File | Responsibility |
|---|---|
| `js/walk-story-core.js` | New. Pure: the scene table, scroll → scene → hold, fronts and lines, sky weights → layer opacities, Honor timings, line ink, pill labels, the moon path. |
| `js/walk-story-core.test.js` | New. The core's tests. |
| `scripts/fixtures/nakahechi-stage-00.json` | New. The Kumano Kodō Nakahechi stage 1 route, moments and facts, copied from open-pilgrimages v1.12.0 (ODbL). |
| `scripts/bake-honor-stage.js` | New. Projects the fixture into the Honor scene's SVG, in both geometries. |
| `scripts/bake-honor-stage.test.js` | New. The bake's tests. |
| `css/walk-story.css` | New. Sky tokens and fills, scene ink, stacked layout, copy, phone mocks, pinned layout, acts. |
| `js/walk-story-contrast.test.js` | New. AA for every scene over its own sky; the night is really night. |
| `index.html` | The story replaces six sections, the Reliquary follows it, dead inline CSS goes, the stylesheet and scripts are linked, and the copy and metadata are made honest. |
| `js/walk-story-markup.test.js` | New. The markup held to the core, the bake, the app's strings, and the spec. |
| `js/walk-story.js` | New. Pinning, measuring, the easing loop, per-frame writes, rail, pill, focus, video, the cairn demo, and the reach event. |
| `js/traces-cairn.js` | Exposes `TracesCairn.demo()`, and skips its own observer inside the pinned story. |
| `js/clearing.js`, `js/clearing-core.js`, `js/clearing-core.test.js`, `js/clearing-wiring.test.js` | The door is keyed by `[data-seek-door]`, the zones follow the new page, and each zone matches exactly one element. |
| `js/main.js`, `css/styles.css` | The page walker and scroll tracker rest under `body.walk-story-pinned`; dead practice, walkwithme and traces-cards CSS is removed. |
| `llms.txt` | Features, privacy posture and the dataset's licence, made accurate. |
| `js/page-weight.test.js` | The index baseline, raised deliberately. |

## Running the tests

Run this from the repo root:

```bash
for t in js/*.test.js scripts/*.test.js; do node "$t" > /tmp/ws-test.log 2>&1 || { echo "FAIL $t"; tail -5 /tmp/ws-test.log; }; done; echo done
```

`scripts/bake-collective-routes.test.js` fails on any checkout without a sibling `../open-pilgrimages`, and it fails the same way on `main`. Every other file must pass after every task.

---

### Task 1: The pure core

**Files:**
- Create: `js/walk-story-core.js`
- Test: `js/walk-story-core.test.js`

**Interfaces:**
- Produces, as `window.WalkStoryCore` in the browser and `require('./walk-story-core.js')` in Node:
  - `SCENE_VH` (140), `FADE` (0.12), `LINE_INK_END` (0.85), `PAST_LINE_OPACITY` (0.35)
  - `SKIES: string[]`, in the order `['dawn','day','golden','dusk','night']`
  - `SCENES: {id, name, sky}[9]`
  - `HONOR = {inkEnd: 0.88, momentFade: 0.06, closingAt: 0.92, momentFracs: [0, 0.0934, 0.9959]}`
  - `clamp(v, lo, hi)`
  - `storyProgress(scrollY, top, height, stageHeight) → 0..1`
  - `sceneAt(p, n) → {index, local}`
  - `holdLocal(local) → 0..1`
  - `frontOpacity(l, j, n) → 0..1`
  - `lineOpacity(j, current) → 0 | 0.35 | 1`
  - `skyWeights(p, n) → {dawn..night}`
  - `layerOpacities(weights) → number[5]`
  - `honorReveal(hold) → {ink, moments: [{frac, at, t}], closing}`
  - `lineInk(sceneId, hold)`
  - `pillLabel(index) → string | null`
  - `holdStartProgress(index, n)`
  - `moonPath(phase, cx, cy, r) → SVG path d`

- [ ] **Step 1: Write the failing test**

Create `js/walk-story-core.test.js`:

```js
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
ok(maxStep < 0.06, 'the sky never snaps: a 1/900 scroll step moves no weight by 0.06 or more  (' + maxStep.toFixed(4) + ')');
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
  eq(C.honorReveal(at + C.HONOR.momentFade).moments[i].t, 1, 'moment ' + (i + 1) + ' is fully showing one fade later');
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node js/walk-story-core.test.js`
Expected: FAIL with `Cannot find module './walk-story-core.js'`

- [ ] **Step 3: Write the core**

Create `js/walk-story-core.js`:

```js
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

  // Skies are per scene, not per hour: text colour cannot crossfade
  // mid-read, so a sky that darkened under a scene's fixed ink would
  // take it below AA partway through. Skies blend only inside the
  // crossfade between scenes, where the text is fading too.
  var SKIES = ['dawn', 'day', 'golden', 'dusk', 'night'];

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

  // The front (text, phone, acts) of scene j, given its own local
  // progress l = p*n - j. The first scene never fades in and the last
  // never fades out: the story opens already standing and ends at rest.
  function frontOpacity(l, j, n) {
    if (l < 0 || l > 1) return 0;
    if (l < FADE) return j === 0 ? 1 : easeOut(l / FADE);
    if (l > 1 - FADE) return j === n - 1 ? 1 : easeOut((1 - l) / FADE);
    return 1;
  }

  function lineOpacity(j, current) {
    if (j < current) return PAST_LINE_OPACITY;
    return j === current ? 1 : 0;
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
    SKIES: SKIES,
    SCENES: SCENES,
    HONOR: HONOR,
    clamp: clamp,
    storyProgress: storyProgress,
    sceneAt: sceneAt,
    holdLocal: holdLocal,
    frontOpacity: frontOpacity,
    lineOpacity: lineOpacity,
    skyWeights: skyWeights,
    layerOpacities: layerOpacities,
    honorReveal: honorReveal,
    lineInk: lineInk,
    pillLabel: pillLabel,
    holdStartProgress: holdStartProgress,
    moonPath: moonPath
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.WalkStoryCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node js/walk-story-core.test.js`
Expected: `ALL PASS: N`, with no `✗` lines.

- [ ] **Step 5: Run the whole suite, then commit**

Run the suite from *Running the tests*. Expected: only `scripts/bake-collective-routes.test.js` fails.

```bash
git add js/walk-story-core.js js/walk-story-core.test.js
git commit -F - <<'EOF'
feat(walk-story): the pure core — scenes, scroll, skies, Honor timings

The story's arithmetic, with no DOM: scroll to scene to hold-local
progress, fronts that fade and lines that stay, skies that blend only
across scene crossfades, and the Honor stage's ink and moment timings.
Tested in Node like the clearing's core.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: The Honor stage, baked from a committed fixture

**Files:**
- Create: `scripts/fixtures/nakahechi-stage-00.json`
- Create: `scripts/bake-honor-stage.js`
- Test: `scripts/bake-honor-stage.test.js`

**Interfaces:**
- Consumes: `WalkStoryCore.honorReveal`, `WalkStoryCore.HONOR`.
- Produces: `require('./bake-honor-stage.js')` → `{ bake(fixture), svgFor(baked, 'landscape'|'portrait'), GEOMETRIES, LABELS, LOCAL_WIDTH }`.
  - `bake()` returns `{d, height, localStart, localEnd, moments[], placements: {landscape, portrait}}`.
  - Each placement is `{transform, dotRadius, start, end, moments}`.
- Task 4 pastes `node scripts/bake-honor-stage.js`'s output into scene 04. The markup test asserts that the pasted path equals `bake().d`.

- [ ] **Step 1: Write the fixture**

Create `scripts/fixtures/nakahechi-stage-00.json` with exactly this content (it is copied from the dataset, not generated at test time):

```json
{"source":"open-pilgrimages v1.12.0, routes/kumano-kodo-nakahechi/ways/stage-00.json (ODbL)","stage":{"name":"Takijiri-oji to Takahara","theme":"Entry","distanceKm":3.6,"gainMeters":430,"hours":{"min":2,"max":3},"difficulty":"moderate","firstSentence":"Takijiri-oji stands at the confluence of two rivers, where pilgrims traditionally waded into the water to purify themselves before entering the divine realm.","closing":"What did you leave behind at the gate?"},"route":[[33.775981,135.50398],[33.775758,135.503992],[33.776114,135.504523],[33.776503,135.504258],[33.776479,135.504535],[33.776868,135.504958],[33.776755,135.50499],[33.776862,135.50521],[33.776928,135.506335],[33.777498,135.506972],[33.777678,135.507361],[33.777523,135.508196],[33.777563,135.508756],[33.777894,135.509805],[33.778092,135.510055],[33.77832,135.511153],[33.778546,135.511668],[33.778774,135.511891],[33.7788,135.5123],[33.781278,135.512509],[33.78182,135.513178],[33.782235,135.514025],[33.7828,135.514297],[33.783224,135.516365],[33.784114,135.517891],[33.78495,135.51883],[33.786105,135.519882],[33.786016,135.519968],[33.786335,135.520099],[33.786408,135.519993],[33.786542,135.520209],[33.787214,135.520603],[33.788121,135.521389],[33.788464,135.521845],[33.789784,135.523052],[33.789899,135.52346],[33.790508,135.523931],[33.791225,135.524202],[33.791566,135.524894],[33.792057,135.525389],[33.792758,135.525578],[33.793684,135.526314],[33.793878,135.526726],[33.793894,135.527165],[33.794446,135.529428]],"moments":[{"label":"Takijiri-oji","ja":"滝尻王子","frac":0,"words":"One of the Five Great Oji. Gate to the sacred mountains."},{"label":"Nezu-oji (remains)","ja":"不寝王子跡","frac":0.0934,"words":"Ruins of an Oji shrine."},{"label":"Takahara","ja":"高原","frac":0.9959,"words":""}]}
```

- [ ] **Step 2: Write the failing test**

Create `scripts/bake-honor-stage.test.js`:

```js
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
```

- [ ] **Step 3: Run it and watch it fail**

Run: `node scripts/bake-honor-stage.test.js`
Expected: FAIL with `Cannot find module './bake-honor-stage.js'`

- [ ] **Step 4: Write the bake**

Create `scripts/bake-honor-stage.js`:

```js
#!/usr/bin/env node
/* Bakes the Kumano Kodō Nakahechi stage 1 line for the walk story's
 * Honor scene. Reads the committed fixture, never ../open-pilgrimages:
 * scripts/bake-collective-routes.test.js fails on any checkout without
 * the sibling repo, and this bake must not.
 *
 *   node scripts/bake-honor-stage.js           prints the SVG to paste
 *   node scripts/bake-honor-stage.js --json    prints the numbers
 *
 * The line is projected equirectangularly (x scaled by cos latitude,
 * north up) into a local box 100 wide, then placed once per geometry:
 * translated and scaled, never distorted, so its first point sits on
 * the previous scene's end point. The ink reveals by path length, so
 * each moment is placed at its fraction of the polyline's length — the
 * ink and the marker arrive together.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Core = require('../js/walk-story-core.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'nakahechi-stage-00.json');
const LOCAL_WIDTH = 100;
const DOT_PX = 6;

const GEOMETRIES = {
  landscape: { start: [1250, 830], width: 270 },
  portrait: { start: [84, 744], width: 90 }
};

// Takijiri-oji and Nezu-oji sit 12 units apart at the stage's foot, so
// one label hangs below and the other rides above. Both read rightward:
// left of the stage is the phone on a desktop and the screen's edge on
// a phone. Takahara, at the top, reads back toward the line.
const LABELS = {
  landscape: [{ x: 10, y: 24, anchor: 'start' }, { x: 10, y: -26, anchor: 'start' }, { x: -10, y: -14, anchor: 'end' }],
  portrait: [{ x: 8, y: 22, anchor: 'start' }, { x: 8, y: -24, anchor: 'start' }, { x: -10, y: -14, anchor: 'end' }]
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

function project(route) {
  const latMid = route.reduce(function (a, p) { return a + p[0]; }, 0) / route.length;
  const k = Math.cos(latMid * Math.PI / 180);
  return route.map(function (p) { return [p[1] * k, -p[0]]; });
}

function toLocal(xy) {
  const xs = xy.map(function (p) { return p[0]; });
  const ys = xy.map(function (p) { return p[1]; });
  const xmin = Math.min.apply(null, xs);
  const ymin = Math.min.apply(null, ys);
  const scale = LOCAL_WIDTH / (Math.max.apply(null, xs) - xmin);
  return xy.map(function (p) { return [(p[0] - xmin) * scale, (p[1] - ymin) * scale]; });
}

function pointAtFrac(pts, frac) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let want = frac * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const t = seg[i] === 0 ? 0 : Math.min(1, want / seg[i]);
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
      ];
    }
    want -= seg[i];
  }
  return pts[pts.length - 1];
}

function bake(fixture) {
  const local = toLocal(project(fixture.route));
  const d = 'M' + local.map(function (p) { return round1(p[0]) + ' ' + round1(p[1]); }).join(' L');
  const height = round1(Math.max.apply(null, local.map(function (p) { return p[1]; })));
  const reveal = Core.honorReveal(0);
  const moments = fixture.moments.map(function (m, i) {
    return {
      label: m.label,
      ja: m.ja,
      words: m.words,
      frac: m.frac,
      at: Math.round(reveal.moments[i].at * 10000) / 10000,
      local: pointAtFrac(local, m.frac).map(round1)
    };
  });
  const placements = {};
  Object.keys(GEOMETRIES).forEach(function (name) {
    const g = GEOMETRIES[name];
    const s = g.width / LOCAL_WIDTH;
    const tx = round1(g.start[0] - s * local[0][0]);
    const ty = round1(g.start[1] - s * local[0][1]);
    placements[name] = {
      transform: 'translate(' + tx + ' ' + ty + ') scale(' + s + ')',
      dotRadius: round1(DOT_PX / s),
      start: g.start,
      end: [round1(tx + s * local[local.length - 1][0]), round1(ty + s * local[local.length - 1][1])],
      moments: moments.map(function (m) {
        return [round1(tx + s * m.local[0]), round1(ty + s * m.local[1])];
      })
    };
  });
  return {
    d: d,
    height: height,
    localStart: local[0].map(round1),
    localEnd: local[local.length - 1].map(round1),
    moments: moments,
    placements: placements
  };
}

function svgFor(baked, name) {
  const p = baked.placements[name];
  const end = baked.localEnd;
  const lines = [
    '<g class="ws-honor-route" transform="' + p.transform + '">',
    '  <path class="ws-honor-theirs" d="' + baked.d + '" pathLength="1" vector-effect="non-scaling-stroke"/>',
    '  <path class="ws-line ws-honor-yours" d="' + baked.d + '" pathLength="1" vector-effect="non-scaling-stroke"/>',
    '  <g class="ws-dot" transform="translate(' + end[0] + ' ' + end[1] + ')"><circle r="' + p.dotRadius + '"/></g>',
    '</g>'
  ];
  baked.moments.forEach(function (m, i) {
    const xy = p.moments[i];
    const l = LABELS[name][i];
    lines.push('<g class="ws-moment" style="--at:' + m.at + '" transform="translate(' + xy[0] + ' ' + xy[1] + ')">');
    lines.push('  <g class="ws-moment-mark">');
    lines.push('    <circle r="5"/>');
    lines.push('    <text class="ws-moment-label" x="' + l.x + '" y="' + l.y + '" text-anchor="' + l.anchor + '">' + m.label + '</text>');
    lines.push('    <text class="ws-moment-ja" x="' + l.x + '" y="' + (l.y + 15) + '" text-anchor="' + l.anchor + '" lang="ja">' + m.ja + '</text>');
    lines.push('  </g>');
    lines.push('</g>');
  });
  return lines.join('\n');
}

if (require.main === module) {
  const baked = bake(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
  if (process.argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(baked, null, 1) + '\n');
  } else {
    Object.keys(GEOMETRIES).forEach(function (name) {
      process.stdout.write('<!-- ' + name + ' -->\n' + svgFor(baked, name) + '\n');
    });
  }
}

module.exports = { bake: bake, svgFor: svgFor, GEOMETRIES: GEOMETRIES, LABELS: LABELS, LOCAL_WIDTH: LOCAL_WIDTH };
```

- [ ] **Step 5: Run it and watch it pass**

Run: `node scripts/bake-honor-stage.test.js`
Expected: `ALL PASS: N`

Run: `node scripts/bake-honor-stage.js | grep -v '<path'`
Expected: the landscape group opens with `translate(1250 594.3) scale(2.7)` and the portrait group with `translate(84 665.4) scale(0.9)`, with markers at `--at:0`, `--at:0.0822` and `--at:0.8764`.

- [ ] **Step 6: Commit**

```bash
git add scripts/fixtures/nakahechi-stage-00.json scripts/bake-honor-stage.js scripts/bake-honor-stage.test.js
git commit -F - <<'EOF'
feat(walk-story): bake the Kumano Kodō stage 1 line for the Honor scene

The stage's 45 real points, projected north-up and placed without
distortion so Takijiri-oji sits on the previous scene's end point, with
each moment at its fraction of the line so the ink and the marker
arrive together. Reads a committed fixture: the bake must never need a
sibling checkout.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: The skies and their contrast

**Files:**
- Create: `css/walk-story.css` (the tokens, skies and ink sections; Tasks 4 and 5 append to it)
- Test: `js/walk-story-contrast.test.js`

**Interfaces:**
- Consumes: `WalkStoryCore.SCENES`, `WalkStoryCore.SKIES`.
- Produces:
  - CSS tokens `--ws-{sky}-base` and `--ws-{sky}-glow` for the five skies, `--ws-ink-lightsky`, `--ws-muted-lightsky`, `--ws-ink-darksky` and `--ws-muted-darksky`, all overridden under `[data-theme="dark"]`.
  - Classes `.ws-sky-{sky}`, and `.walk-story-scene[data-sky]` backgrounds.
  - Scene ink via `--ws-ink` and `--ws-muted`.

- [ ] **Step 1: Write the failing test**

Create `js/walk-story-contrast.test.js`:

```js
/* =============================================
   The walk story — every scene's text over its own sky

   Run via:  node js/walk-story-contrast.test.js

   The story paints its own skies (css/walk-story.css), so neither
   js/muted-contrast.test.js's seasonal sweep nor
   js/breathe-contrast.test.js's hour-wash sweep sees them. This one
   does, the same way those do: tokens parsed from the shipped
   stylesheet, so a palette edit cannot drift past it.

   A scene's ink is fixed for the whole scene and its sky changes only
   in the crossfade between scenes, so each scene is checked against
   its own sky, flat and under its glow at full strength.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./walk-story-core.js');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'walk-story.css'), 'utf8');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

function block(selector) {
  const i = css.indexOf(selector + ' {');
  return i === -1 ? '' : css.slice(i, css.indexOf('}', i));
}
function tokens(text) {
  const t = {};
  text.replace(/--(ws-[a-z-]+):\s*([^;]+);/g, function (_, k, v) { t[k] = v.trim(); return _; });
  return t;
}
const light = tokens(block(':root'));
const dark = Object.assign({}, light, tokens(block('[data-theme="dark"]')));

function parse(v) {
  let m = /^#([0-9a-f]{6})$/i.exec(v || '');
  if (m) return { rgb: [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16) / 255; }), a: 1 };
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v || '');
  if (m) return { rgb: [m[1], m[2], m[3]].map(function (x) { return +x / 255; }), a: +m[4] };
  throw new Error('unparseable colour: ' + v);
}
function over(top, base) {
  return top.rgb.map(function (c, i) { return c * top.a + base.rgb[i] * (1 - top.a); });
}
function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(rgb) {
  const l = rgb.map(lin);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hslLightness(rgb) {
  return (Math.max.apply(null, rgb) + Math.min.apply(null, rgb)) / 2 * 100;
}

console.log('\n=== tokens parse ===\n');

C.SKIES.forEach(function (s) {
  ['light', 'dark'].forEach(function (scheme) {
    const t = scheme === 'light' ? light : dark;
    ok(!!t['ws-' + s + '-base'] && !!t['ws-' + s + '-glow'], scheme + ' · ' + s + ' has a base and a glow');
  });
});

console.log('\n=== AA for every scene, both schemes ===\n');

C.SCENES.forEach(function (s, i) {
  ['light', 'dark'].forEach(function (scheme) {
    const t = scheme === 'light' ? light : dark;
    const base = parse(t['ws-' + s.sky + '-base']);
    const glow = over(parse(t['ws-' + s.sky + '-glow']), base);
    const suffix = (scheme === 'dark' || s.sky === 'dusk' || s.sky === 'night') ? 'darksky' : 'lightsky';
    [['ink', parse(t['ws-ink-' + suffix]).rgb], ['muted', parse(t['ws-muted-' + suffix]).rgb]].forEach(function (pair) {
      [['its sky', base.rgb], ['its glow', glow]].forEach(function (bg) {
        const r = contrast(pair[1], bg[1]);
        ok(r >= 4.5, scheme + ' · ' + (i + 1) + ' ' + s.id + ' · ' + pair[0] + ' on ' + bg[0] + ' ≥ 4.5:1  (' + r.toFixed(2) + ')');
      });
    });
  });
});

console.log('\n=== the stylesheet switches ink where this test assumes ===\n');

ok(/\.walk-story-scene\[data-sky="dusk"\],\s*\.walk-story-scene\[data-sky="night"\][\s\S]*?--ws-ink:\s*var\(--ws-ink-darksky\)/.test(css),
  'dusk and night scenes take the dark-sky ink');
ok(/\[data-theme="dark"\] \.walk-story-scene[\s\S]*?--ws-ink:\s*var\(--ws-ink-darksky\)/.test(css),
  'dark mode takes the dark-sky ink everywhere');
ok(/\.walk-story-scene\s*\{\s*color:\s*var\(--ws-ink\);/.test(css), 'scene text is the scene\'s ink');
ok(/body\.constellation \.walk-story-atmosphere\s*\{\s*display:\s*none;/.test(css), 'star mode: the starfield is the sky');

console.log('\n=== the night is really night ===\n');

const dawnL = hslLightness(parse(light['ws-dawn-base']).rgb);
const nightL = hslLightness(parse(light['ws-night-base']).rgb);
ok(dawnL - nightL >= 25,
  'light mode: scene 9\'s sky is at least 25 lightness points darker than scene 1\'s  (' + dawnL.toFixed(1) + ' → ' + nightL.toFixed(1) + ')');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node js/walk-story-contrast.test.js`
Expected: FAIL with `ENOENT` for `css/walk-story.css`

- [ ] **Step 3: Write the tokens, skies and ink**

Create `css/walk-story.css`:

```css
/* One walk, told by scroll. Loaded by index.html only.

   Everything here is prefixed walk-story / ws-. The "Why Pilgrim exists"
   section is already .story, styled at css/styles.css:1111–1123, so a
   bare .story would collide both ways.

   The skies are the story's own, not js/seasonal.js's: its time-of-day
   modifiers shift parchment by barely a shade (js/breathe-tint.js makes
   the same call). js/walk-story-contrast.test.js parses the tokens below
   and holds every scene's text to AA over its own sky. */

:root {
  --ws-dawn-base: #F2E4D3;
  --ws-dawn-glow: rgba(244, 195, 161, 0.5);
  --ws-day-base: #F5F0E8;
  --ws-day-glow: rgba(251, 243, 220, 0.6);
  --ws-golden-base: #EEDAB8;
  --ws-golden-glow: rgba(230, 178, 106, 0.45);
  --ws-dusk-base: #3B2F40;
  --ws-dusk-glow: rgba(169, 96, 79, 0.35);
  --ws-night-base: #121521;
  --ws-night-glow: rgba(40, 48, 82, 0.6);
  --ws-ink-lightsky: #2C241E;
  --ws-muted-lightsky: #4F4943;
  --ws-ink-darksky: #F0EBE1;
  --ws-muted-darksky: #C9C1B6;
  --ws-ease: cubic-bezier(0.22, 0.61, 0.36, 1);
}

[data-theme="dark"] {
  --ws-dawn-base: #2A2119;
  --ws-dawn-glow: rgba(90, 58, 42, 0.5);
  --ws-day-base: #1C1914;
  --ws-day-glow: rgba(46, 42, 34, 0.6);
  --ws-golden-base: #2A1F12;
  --ws-golden-glow: rgba(92, 64, 32, 0.45);
  --ws-dusk-base: #1D1725;
  --ws-dusk-glow: rgba(74, 42, 48, 0.4);
  --ws-night-base: #0C0E16;
  --ws-night-glow: rgba(28, 34, 56, 0.6);
}

/* --- Skies: the atmosphere's five layers when pinned, each scene's own
   background when stacked. The glow sits low, where the line walks. --- */

.ws-sky-dawn,
.walk-story-scene[data-sky="dawn"] {
  background: radial-gradient(120% 85% at 18% 105%, var(--ws-dawn-glow), transparent 62%), var(--ws-dawn-base);
}
.ws-sky-day,
.walk-story-scene[data-sky="day"] {
  background: radial-gradient(120% 85% at 50% 108%, var(--ws-day-glow), transparent 62%), var(--ws-day-base);
}
.ws-sky-golden,
.walk-story-scene[data-sky="golden"] {
  background: radial-gradient(120% 85% at 82% 108%, var(--ws-golden-glow), transparent 64%), var(--ws-golden-base);
}
.ws-sky-dusk,
.walk-story-scene[data-sky="dusk"] {
  background: radial-gradient(120% 80% at 70% 110%, var(--ws-dusk-glow), transparent 66%), var(--ws-dusk-base);
}
.ws-sky-night,
.walk-story-scene[data-sky="night"] {
  background: radial-gradient(90% 70% at 80% 12%, var(--ws-night-glow), transparent 60%), var(--ws-night-base);
}

/* --- Ink: dark on the light skies, light on dusk and night, and light
   everywhere in dark mode. Fixed per scene: text never changes colour
   mid-read, which is why the skies blend only between scenes. --- */

.walk-story-scene,
.walk-story-stage {
  --ws-ink: var(--ws-ink-lightsky);
  --ws-muted: var(--ws-muted-lightsky);
}
.walk-story-scene[data-sky="dusk"],
.walk-story-scene[data-sky="night"],
.walk-story-stage[data-sky="dusk"],
.walk-story-stage[data-sky="night"],
[data-theme="dark"] .walk-story-scene,
[data-theme="dark"] .walk-story-stage {
  --ws-ink: var(--ws-ink-darksky);
  --ws-muted: var(--ws-muted-darksky);
}
.walk-story-scene {
  color: var(--ws-ink);
}

/* Star mode: the starfield is the story's sky. */
body.constellation .walk-story-atmosphere { display: none; }
body.constellation .walk-story-scene { background: transparent; }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node js/walk-story-contrast.test.js`
Expected: `ALL PASS: N`. The weakest pair is light-mode scene 07's muted text on its glow, at 5.04:1.

- [ ] **Step 5: Run the whole suite, then commit**

The stylesheet isn't linked yet, so no page weight changes.

```bash
git add css/walk-story.css js/walk-story-contrast.test.js
git commit -F - <<'EOF'
feat(walk-story): five skies, dawn to night, each scene held to AA

The story's own palettes, light and dark, painted as soft gradients:
js/seasonal.js's hour modifiers shift parchment by barely a shade. Ink
is fixed per scene — dark on the light skies, light on dusk and night —
and a test parses the shipped tokens and holds every scene's text and
muted text to 4.5:1 over its sky and its glow, and scene 9 to a real
night.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: The story replaces six sections, stacked and finished

At the end of this task the page is complete without any story JavaScript. The nine scenes stack in their finished states, since every act reads `var(--hold, 1)` and nothing sets `--hold`.

**Files:**
- Modify: `index.html`. Six sections are cut and the story is inserted; the stylesheet is linked; dead inline CSS is removed.
- Modify: `css/walk-story.css` (append the stacked layout, copy, lines and phones)
- Modify: `css/styles.css` (remove the dead `.practice*`, `.traces-cards` and `.walkwithme*` rules)
- Modify: `js/page-weight.test.js` (the index baseline)
- Test: `js/walk-story-markup.test.js`

**Interfaces:**
- Consumes: `WalkStoryCore.SCENES`, `WalkStoryCore.honorReveal`, `bake-honor-stage.js`'s `bake`, `GEOMETRIES` and `svgFor`.
- Produces (DOM that Task 5 relies on):
  - `.walk-story#walk-story > .walk-story-stage[data-sky]`, holding:
    - `.walk-story-atmosphere > .ws-sky.ws-sky-{sky}` ×5, in `SKIES` order;
    - nine `section.walk-story-scene#scene-N[data-scene][data-sky]`;
    - `nav.walk-story-rail`, with 9 `a[href="#scene-N"][aria-label]`;
    - `a.walk-story-pill > span.ws-pill-label`.
  - Each scene contains two `svg.walk-story-line.walk-story-line--{landscape|portrait}`, each with one `.ws-line` path and one `g.ws-dot`, plus `div.walk-story-front`.
  - Scene 03 holds the `video.ws-video`, and scene 05's form carries `[data-seek-door]`.
  - The story is followed by `div#after-walk-story`.

- [ ] **Step 1: Write the failing markup test**

Create `js/walk-story-markup.test.js`:

```js
/* =============================================
   The walk story — index.html's markup, held to the core and the spec

   Run via:  node js/walk-story-markup.test.js

   Static checks on the shipped page, not on proxies:
   - the nine scenes are the core's nine, in its order, wearing its skies;
   - every phone string is one the app really shows (cited per string);
   - the Honor stage is the bake's, byte for byte, in both geometries;
   - nothing in the story is a bare .story or waits on the page's
     one-shot .reveal observer, which would fire while it is invisible.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./walk-story-core.js');
const B = require('../scripts/bake-honor-stage.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'nakahechi-stage-00.json'), 'utf8'));

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

const start = html.indexOf('<section class="walk-story"');
const end = html.indexOf('<div id="after-walk-story">');
const story = start !== -1 && end > start ? html.slice(start, end) : '';

console.log('\n=== one story, nine scenes, the core\'s order ===\n');

ok(story.length > 0, 'index.html carries the story, closed by #after-walk-story');
eq(count(html, '<section class="walk-story"'), 1, 'exactly one story');
const scenes = Array.from(story.matchAll(
  /<section class="walk-story-scene[^"]*" id="scene-(\d)" data-scene="([a-z-]+)" data-sky="([a-z]+)" aria-labelledby="scene-\d-title">/g));
eq(scenes.length, 9, 'nine scenes');
scenes.forEach(function (m, i) {
  eq(+m[1], i + 1, 'scene ' + (i + 1) + ' is #scene-' + (i + 1));
  eq(m[2], C.SCENES[i].id, 'scene ' + (i + 1) + ' is ' + C.SCENES[i].id);
  eq(m[3], C.SCENES[i].sky, 'scene ' + (i + 1) + ' wears the core\'s sky: ' + C.SCENES[i].sky);
});
story.split(/(?=<section class="walk-story-scene)/).slice(1).forEach(function (b, i) {
  const h2 = b.match(/<h2 id="scene-(\d)-title">([\s\S]*?)<\/h2>/);
  ok(!!h2 && +h2[1] === i + 1, 'scene ' + (i + 1) + ' is labelled by its own headline');
  eq(h2 ? count(h2[2], '<em>') : 0, 1, 'scene ' + (i + 1) + '\'s headline has exactly one italic word');
  ok(b.indexOf('walk-story-line--landscape') !== -1 && b.indexOf('walk-story-line--portrait') !== -1,
    'scene ' + (i + 1) + ' carries its own line in both geometries');
  eq(count(b, 'class="ws-dot"'), 2, 'scene ' + (i + 1) + ' has a walker dot in each geometry');
});

console.log('\n=== the rail ===\n');

const rail = Array.from(story.matchAll(/<a href="#scene-(\d)" aria-label="Scene (\d) of 9: ([^"]+)"><\/a>/g));
eq(rail.length, 9, 'nine rail links');
rail.forEach(function (m, i) {
  ok(+m[1] === i + 1 && +m[2] === i + 1, 'rail ' + (i + 1) + ' points at its own scene');
  eq(m[3], C.SCENES[i].name, 'rail ' + (i + 1) + ' names ' + C.SCENES[i].name);
});

console.log('\n=== naming ===\n');

eq(count(html, 'class="story section"'), 1, '"Why Pilgrim exists" is still the only .story');
ok(!/class="story"/.test(html), 'nothing is a bare .story');
ok(!/\sclass="[^"]*\breveal\b/.test(story), 'nothing in the story waits on the page\'s one-shot .reveal observer');

console.log('\n=== what left the page ===\n');

['class="practice section"', 'class="traces section"', 'class="walkwithme section"',
  'class="seek-door section"', 'class="journey section"', 'class="privacy-section section"'
].forEach(function (s) { ok(html.indexOf(s) === -1, s + ' is gone'); });
ok(html.indexOf('class="traces reliquary section"') > end, 'the Reliquary follows the story');
const dividers = [];
let at = -1;
while ((at = html.indexOf('<!-- Footprint divider -->', at + 1)) !== -1) dividers.push(at);
ok(dividers.every(function (d, i) { return i === 0 || html.slice(dividers[i - 1], d).indexOf('<section') !== -1; }),
  'no two footprint dividers stand back to back');
ok(!/\.(journey|privacy-feature)[\w-]*\s*\{/.test(html), 'the journey and privacy-card styles left with their sections');
ok(!/\.seek-door(\s|::|\s*\{)/.test(html), 'the retired seek door\'s section styles are gone (its form classes stay)');

console.log('\n=== the phones quote the app ===\n');

[
  ['Set Your Intention', 'Scenes/ActiveWalk/IntentionSettingView.swift:85'],
  ['What purpose guides this walk?', 'Scenes/ActiveWalk/IntentionSettingView.swift:94'],
  ['>Recurring<', 'Scenes/ActiveWalk/IntentionSettingView.swift:137'],
  ['<span>WANDER</span><span>HONOR</span><span>SEEK</span>', 'Scenes/Home/WalkStartView.swift:326'],
  ['walk · talk · meditate', 'Models/Walk/WalkMode.swift:8'],
  ['<span class="ws-app-button">Wander</span>', 'Models/Walk/WalkMode.swift buttonLabel'],
  ['Solvitur ambulando — it is solved by walking', 'the Path tab quote (docs/screenshots/01_walk_start.png)'],
  ['<b>21:04</b>Walk', 'Scenes/ActiveWalk/WalkStatsSheet.swift:497'],
  ['<b>0:12</b>Talk', 'Scenes/ActiveWalk/WalkStatsSheet.swift:499'],
  ['<b>3:15</b>Meditate', 'Scenes/ActiveWalk/WalkStatsSheet.swift:501'],
  ['<span>Meditate</span>', 'Scenes/ActiveWalk/WalkStatsSheet.swift:527'],
  ['>Record<', 'Scenes/ActiveWalk/WalkStatsSheet.swift:560'],
  ['>Stop<', 'Scenes/ActiveWalk/WalkStatsSheet.swift:560'],
  ['<span>End</span>', 'Scenes/ActiveWalk/WalkStatsSheet.swift:531'],
  ['>' + fixture.stage.theme + '<', 'Scenes/Honor/StageMorningCard.swift:46 (stage.theme)'],
  ['3.6 km · 430 m up · 2 to 3 hours · moderate', 'Scenes/Honor/StageMorningCard.swift:5 (factsLine)'],
  ['maps saved for today', 'Scenes/Honor/StageMorningCard.swift:25'],
  ['>walk<', 'Scenes/Honor/StageMorningCard.swift:79 (buttonTitle)']
].forEach(function (pair) {
  ok(story.indexOf(pair[0]) !== -1, 'a phone says ' + JSON.stringify(pair[0]) + '  — ' + pair[1]);
});
ok(story.indexOf('What are you walking with') === -1, 'no invented intention prompt');
ok(story.indexOf(fixture.stage.firstSentence) !== -1, 'the morning card quotes the stage\'s own first sentence');

console.log('\n=== Honor, drawn from the bake ===\n');

const baked = B.bake(fixture);
eq(count(story, 'd="' + baked.d + '"'), 4, 'both geometries draw the baked stage, faint and inked');
Object.keys(B.GEOMETRIES).forEach(function (g) {
  ok(story.indexOf('transform="' + baked.placements[g].transform + '"') !== -1, g + ': placed by the bake\'s transform');
});
C.honorReveal(0).moments.forEach(function (m) {
  const at = Math.round(m.at * 1e4) / 1e4;
  eq(count(story, '--at:' + at + '"'), 2, 'the marker at frac ' + m.frac + ' carries --at:' + at + ' in both geometries');
});
ok(story.indexOf(fixture.stage.closing) !== -1, 'the closing line is the dataset\'s own');
ok(story.indexOf('On iPhone. Coming to Android.') !== -1, 'Honor says where it runs');
ok(story.indexOf('https://github.com/walktalkmeditate/open-pilgrimages') !== -1, 'the stage credits its dataset');

console.log('\n=== acts and ways out ===\n');

eq(count(story, 'data-seek-door'), 1, 'one seek door, keyed by data-seek-door');
ok(/<svg class="wisp"/.test(story) && story.indexOf('id="cairn-stack"') !== -1, 'the wisp and the cairn live in the story');
ok(story.indexOf('data-umami-event="click-app-store"') !== -1 && story.indexOf('data-umami-event="click-google-play"') !== -1,
  'scene 9 carries both store badges, events unchanged');
ok(story.indexOf('href="/privacy"') !== -1, 'scene 9 links the privacy policy');
ok(story.indexOf('data-umami-event="walk-with-me-demo"') !== -1, 'scene 8 carries the demo walk');
ok(story.indexOf('data-umami-event="enter-seek"') !== -1, 'scene 5 carries the way into /seek');
ok(/<video class="ws-video"[^>]*poster="assets\/screenshots\/03_meditation\.png"/.test(story),
  'the meditation video has a poster for Low Power Mode and reduced motion');
ok(/<link rel="stylesheet" href="css\/walk-story\.css">/.test(html), 'the story\'s stylesheet is linked');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node js/walk-story-markup.test.js`
Expected: FAIL. The first line is `✗ index.html carries the story, closed by #after-walk-story`.

- [ ] **Step 3: Write the story's markup to a temporary partial**

Create `walk-story.partial.html` at the repo root. The script in Step 4 fills the three `<!-- MOVE:… -->` markers with the old page's own wisp, cairn and store-badge blocks, verbatim, then deletes this file. The `d` attribute on the four Honor paths is the bake's output (Task 2, Step 5).

```html
    <!-- ==========================================
         4. One walk, told by scroll — nine scenes, first light to night.
            Stacked and finished without JS, with reduced motion, and on
            short viewports; js/walk-story.js pins it. Spec:
            docs/superpowers/specs/2026-09-24-one-walk-story-design.md
         ========================================== -->
    <section class="walk-story" id="walk-story" aria-label="A walk, from first light to dark">
      <a class="walk-story-skip" href="#after-walk-story">Skip the walk</a>
      <div class="walk-story-stage" data-sky="dawn">
        <div class="walk-story-atmosphere" aria-hidden="true">
          <div class="ws-sky ws-sky-dawn"></div>
          <div class="ws-sky ws-sky-day"></div>
          <div class="ws-sky ws-sky-golden"></div>
          <div class="ws-sky ws-sky-dusk"></div>
          <div class="ws-sky ws-sky-night"></div>
        </div>

        <!-- 01 · Set out · dawn -->
        <section class="walk-story-scene" id="scene-1" data-scene="set-out" data-sky="dawn" aria-labelledby="scene-1-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M140 830 C200 826 270 818 330 820" pathLength="1"/>
            <g class="ws-dot" transform="translate(330 820)"><circle r="6"/></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M40 440 C44 460 52 480 60 500" pathLength="1"/>
            <g class="ws-dot" transform="translate(60 500)"><circle r="6"/></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">01 · Set out</p>
              <h2 id="scene-1-title">You set out with an <em>intention</em>.</h2>
              <p class="ws-body">Before the first step, one line: what you are walking with. Then a way to walk. Wander, with no aim at all. Honor, in someone else's steps. Seek, toward what you don't know.</p>
            </div>
            <div class="walk-story-phone" aria-hidden="true">
              <div class="ws-screen ws-screen--path">
                <img class="ws-app-logo" src="assets/pilgrim-logo.png" alt="" width="60" height="60">
                <p class="ws-app-quote">Solvitur ambulando — it is solved by walking</p>
                <div class="ws-app-spacer"></div>
                <div class="ws-modes"><span>WANDER</span><span>HONOR</span><span>SEEK</span><i class="ws-modes-underline"></i></div>
                <p class="ws-app-sub">walk · talk · meditate</p>
                <span class="ws-app-button">Wander</span>
                <div class="ws-app-tabs"><span class="is-on">Path</span><span>Journal</span><span>Settings</span></div>
                <div class="ws-sheet">
                  <p class="ws-sheet-title">Set Your Intention</p>
                  <p class="ws-field"><span class="ws-placeholder">What purpose guides this walk?</span><span class="ws-typed"><span style="--i:0">w</span><span style="--i:1">a</span><span style="--i:2">t</span><span style="--i:3">e</span><span style="--i:4">r</span></span></p>
                  <p class="ws-sheet-label">Recurring</p>
                  <div class="ws-chips"><span class="ws-chip ws-chip--tapped">water</span><span class="ws-chip">light</span><span class="ws-chip">home</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 02 · Wander -->
        <section class="walk-story-scene" id="scene-2" data-scene="wander" data-sky="dawn" aria-labelledby="scene-2-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M330 820 C480 780 560 870 720 832 S1000 800 1180 834" pathLength="1"/>
            <g class="ws-pin" transform="translate(594 839)"><circle r="4"/></g>
            <g class="ws-dot" transform="translate(1180 834)"><circle r="6"/></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M60 500 C120 540 20 580 80 620 S150 680 110 720" pathLength="1"/>
            <g class="ws-pin" transform="translate(70 560)"><circle r="4"/></g>
            <g class="ws-dot" transform="translate(110 720)"><circle r="6"/></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">02 · Wander</p>
              <h2 id="scene-2-title">You walk, and say it <em>out loud</em>.</h2>
              <p class="ws-body">A thought arrives mid-stride. Tap once. It's recorded, pinned where you stood, and written down on your phone.</p>
              <p class="ws-aside">No audio is sent anywhere to be transcribed.</p>
            </div>
            <p class="ws-said"><span style="--i:0">the</span> <span style="--i:1">light</span> <span style="--i:2">on</span> <span style="--i:3">the</span> <span style="--i:4">water</span> <span style="--i:5">keeps</span> <span style="--i:6">changing,</span> <span style="--i:7">and</span> <span style="--i:8">I</span> <span style="--i:9">keep</span> <span style="--i:10">trying</span> <span style="--i:11">to</span> <span style="--i:12">hold</span> <span style="--i:13">it</span> <span style="--i:14">still</span></p>
            <div class="walk-story-phone" aria-hidden="true">
              <div class="ws-screen ws-screen--walk">
                <div class="ws-map"><svg viewBox="0 0 210 200"><path class="ws-map-route" d="M20 170 C60 140 80 180 120 150 S170 110 190 120"/><circle class="ws-map-you" cx="190" cy="120" r="6"/></svg></div>
                <div class="ws-stats-sheet">
                  <p class="ws-timer">24:31</p>
                  <div class="ws-metrics"><span><b>21:04</b>Walk</span><span><b>0:12</b>Talk</span><span><b>3:15</b>Meditate</span></div>
                  <div class="ws-actions"><span>Meditate</span><span class="ws-rec"><i class="ws-rec-dot"></i><span class="ws-rec-labels"><em class="ws-rec-idle">Record</em><em class="ws-rec-live">Stop</em></span></span><span>End</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 03 · Stillness -->
        <section class="walk-story-scene" id="scene-3" data-scene="stillness" data-sky="day" aria-labelledby="scene-3-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M1180 834 C1200 836 1225 832 1250 830" pathLength="1"/>
            <circle class="ws-ring" cx="1250" cy="830" r="14"/>
            <g class="ws-dot" transform="translate(1250 830)"><circle r="6"/></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M110 720 C104 728 94 738 84 744" pathLength="1"/>
            <circle class="ws-ring" cx="84" cy="744" r="10"/>
            <g class="ws-dot" transform="translate(84 744)"><circle r="6"/></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">03 · Stillness</p>
              <h2 id="scene-3-title">You stop, and <em>breathe</em>.</h2>
              <p class="ws-body">A breathing circle in your own rhythm, a voice guide if you want one. Your stillness is counted apart from your walking.</p>
            </div>
            <div class="walk-story-phone" aria-hidden="true">
              <div class="ws-screen ws-screen--video">
                <video class="ws-video" src="assets/previews/02_meditation_preview.mp4" poster="assets/screenshots/03_meditation.png" muted loop playsinline preload="none"></video>
              </div>
            </div>
          </div>
        </section>

        <!-- 04 · Honor -->
        <section class="walk-story-scene" id="scene-4" data-scene="honor" data-sky="day" aria-labelledby="scene-4-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <g class="ws-honor-route" transform="translate(1250 594.3) scale(2.7)">
              <path class="ws-honor-theirs" d="M0 87.3 L0 88.4 L2.1 86.7 L1.1 84.8 L2.2 84.9 L3.8 83.1 L4 83.6 L4.8 83.1 L9.3 82.8 L11.8 80.1 L13.3 79.3 L16.6 80 L18.8 79.8 L22.9 78.3 L23.9 77.3 L28.2 76.2 L30.2 75.2 L31.1 74.1 L32.7 74 L33.5 62.3 L36.1 59.7 L39.5 57.7 L40.5 55.1 L48.7 53.1 L54.7 48.8 L58.4 44.9 L62.5 39.4 L62.8 39.9 L63.3 38.3 L62.9 38 L63.8 37.4 L65.3 34.2 L68.4 29.9 L70.2 28.3 L74.9 22 L76.5 21.5 L78.4 18.6 L79.5 15.2 L82.2 13.6 L84.1 11.3 L84.9 8 L87.8 3.6 L89.4 2.7 L91.1 2.6 L100 0" pathLength="1" vector-effect="non-scaling-stroke"/>
              <path class="ws-line ws-honor-yours" d="M0 87.3 L0 88.4 L2.1 86.7 L1.1 84.8 L2.2 84.9 L3.8 83.1 L4 83.6 L4.8 83.1 L9.3 82.8 L11.8 80.1 L13.3 79.3 L16.6 80 L18.8 79.8 L22.9 78.3 L23.9 77.3 L28.2 76.2 L30.2 75.2 L31.1 74.1 L32.7 74 L33.5 62.3 L36.1 59.7 L39.5 57.7 L40.5 55.1 L48.7 53.1 L54.7 48.8 L58.4 44.9 L62.5 39.4 L62.8 39.9 L63.3 38.3 L62.9 38 L63.8 37.4 L65.3 34.2 L68.4 29.9 L70.2 28.3 L74.9 22 L76.5 21.5 L78.4 18.6 L79.5 15.2 L82.2 13.6 L84.1 11.3 L84.9 8 L87.8 3.6 L89.4 2.7 L91.1 2.6 L100 0" pathLength="1" vector-effect="non-scaling-stroke"/>
              <g class="ws-dot" transform="translate(100 0)"><circle r="2.2"/></g>
            </g>
            <g class="ws-moment" style="--at:0" transform="translate(1250 830)">
              <g class="ws-moment-mark">
                <circle r="5"/>
                <text class="ws-moment-label" x="10" y="24" text-anchor="start">Takijiri-oji</text>
                <text class="ws-moment-ja" x="10" y="39" text-anchor="start" lang="ja">滝尻王子</text>
              </g>
            </g>
            <g class="ws-moment" style="--at:0.0822" transform="translate(1271.6 818.1)">
              <g class="ws-moment-mark">
                <circle r="5"/>
                <text class="ws-moment-label" x="10" y="-26" text-anchor="start">Nezu-oji (remains)</text>
                <text class="ws-moment-ja" x="10" y="-11" text-anchor="start" lang="ja">不寝王子跡</text>
              </g>
            </g>
            <g class="ws-moment" style="--at:0.8764" transform="translate(1518.4 594.8)">
              <g class="ws-moment-mark">
                <circle r="5"/>
                <text class="ws-moment-label" x="-10" y="-14" text-anchor="end">Takahara</text>
                <text class="ws-moment-ja" x="-10" y="1" text-anchor="end" lang="ja">高原</text>
              </g>
            </g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <g class="ws-honor-route" transform="translate(84 665.4) scale(0.9)">
              <path class="ws-honor-theirs" d="M0 87.3 L0 88.4 L2.1 86.7 L1.1 84.8 L2.2 84.9 L3.8 83.1 L4 83.6 L4.8 83.1 L9.3 82.8 L11.8 80.1 L13.3 79.3 L16.6 80 L18.8 79.8 L22.9 78.3 L23.9 77.3 L28.2 76.2 L30.2 75.2 L31.1 74.1 L32.7 74 L33.5 62.3 L36.1 59.7 L39.5 57.7 L40.5 55.1 L48.7 53.1 L54.7 48.8 L58.4 44.9 L62.5 39.4 L62.8 39.9 L63.3 38.3 L62.9 38 L63.8 37.4 L65.3 34.2 L68.4 29.9 L70.2 28.3 L74.9 22 L76.5 21.5 L78.4 18.6 L79.5 15.2 L82.2 13.6 L84.1 11.3 L84.9 8 L87.8 3.6 L89.4 2.7 L91.1 2.6 L100 0" pathLength="1" vector-effect="non-scaling-stroke"/>
              <path class="ws-line ws-honor-yours" d="M0 87.3 L0 88.4 L2.1 86.7 L1.1 84.8 L2.2 84.9 L3.8 83.1 L4 83.6 L4.8 83.1 L9.3 82.8 L11.8 80.1 L13.3 79.3 L16.6 80 L18.8 79.8 L22.9 78.3 L23.9 77.3 L28.2 76.2 L30.2 75.2 L31.1 74.1 L32.7 74 L33.5 62.3 L36.1 59.7 L39.5 57.7 L40.5 55.1 L48.7 53.1 L54.7 48.8 L58.4 44.9 L62.5 39.4 L62.8 39.9 L63.3 38.3 L62.9 38 L63.8 37.4 L65.3 34.2 L68.4 29.9 L70.2 28.3 L74.9 22 L76.5 21.5 L78.4 18.6 L79.5 15.2 L82.2 13.6 L84.1 11.3 L84.9 8 L87.8 3.6 L89.4 2.7 L91.1 2.6 L100 0" pathLength="1" vector-effect="non-scaling-stroke"/>
              <g class="ws-dot" transform="translate(100 0)"><circle r="6.7"/></g>
            </g>
            <g class="ws-moment" style="--at:0" transform="translate(84 744)">
              <g class="ws-moment-mark">
                <circle r="5"/>
                <text class="ws-moment-label" x="8" y="22" text-anchor="start">Takijiri-oji</text>
                <text class="ws-moment-ja" x="8" y="37" text-anchor="start" lang="ja">滝尻王子</text>
              </g>
            </g>
            <g class="ws-moment" style="--at:0.0822" transform="translate(91.2 740)">
              <g class="ws-moment-mark">
                <circle r="5"/>
                <text class="ws-moment-label" x="8" y="-24" text-anchor="start">Nezu-oji (remains)</text>
                <text class="ws-moment-ja" x="8" y="-9" text-anchor="start" lang="ja">不寝王子跡</text>
              </g>
            </g>
            <g class="ws-moment" style="--at:0.8764" transform="translate(173.5 665.6)">
              <g class="ws-moment-mark">
                <circle r="5"/>
                <text class="ws-moment-label" x="-10" y="-14" text-anchor="end">Takahara</text>
                <text class="ws-moment-ja" x="-10" y="1" text-anchor="end" lang="ja">高原</text>
              </g>
            </g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">04 · Honor</p>
              <h2 id="scene-4-title">You walk in someone else's <em>steps</em>.</h2>
              <p class="ws-body">A walk a friend shared, one of your own walked again, or a stage of the Camino, the Kumano Kodō, or Shikoku's eighty-eight temples. Their line waits, faint, before you. It does not hurry you.</p>
              <p class="ws-caption">Kumano Kodō · Nakahechi · stage 1 of 4</p>
              <ol class="ws-sr">
                <li>Takijiri-oji (滝尻王子): One of the Five Great Oji. Gate to the sacred mountains.</li>
                <li>Nezu-oji (remains) (不寝王子跡): Ruins of an Oji shrine.</li>
                <li>Takahara (高原), where the stage ends.</li>
              </ol>
              <p class="ws-closing">What did you leave behind at the gate?</p>
              <p class="ws-caption">Save the maps before you go, and the way holds with no signal at all.</p>
              <p class="ws-caption">On iPhone. Coming to Android.</p>
              <p class="ws-caption">Stage from <a href="https://github.com/walktalkmeditate/open-pilgrimages">open-pilgrimages</a>, ODbL.</p>
            </div>
            <div class="walk-story-phone" aria-hidden="true">
              <div class="ws-screen ws-screen--card">
                <div class="ws-card">
                  <p class="ws-card-theme">Entry</p>
                  <p class="ws-card-narrative">Takijiri-oji stands at the confluence of two rivers, where pilgrims traditionally waded into the water to purify themselves before entering the divine realm.</p>
                  <p class="ws-card-facts">3.6 km · 430 m up · 2 to 3 hours · moderate</p>
                  <p class="ws-card-maps">maps saved for today</p>
                  <span class="ws-app-button">walk</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 05 · Seek -->
        <section class="walk-story-scene walk-story-scene--no-phone" id="scene-5" data-scene="seek" data-sky="day" aria-labelledby="scene-5-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="ws-fog-l"><stop offset="0" stop-color="currentColor" stop-opacity=".24"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
              <radialGradient id="ws-fog-dense-l"><stop offset="0" stop-color="currentColor" stop-opacity=".42"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
            </defs>
            <g class="ws-fog-bank">
              <ellipse cx="520" cy="560" rx="420" ry="150" fill="url(#ws-fog-l)"/>
              <ellipse cx="1000" cy="470" rx="360" ry="130" fill="url(#ws-fog-l)"/>
            </g>
            <ellipse cx="760" cy="520" rx="130" ry="80" fill="url(#ws-fog-dense-l)"/>
            <path class="ws-line" d="M1520 594.3 C1420 660 1260 700 1100 690" pathLength="1"/>
            <g class="ws-dot" transform="translate(1100 690)"><circle r="6"/><g class="ws-crescent-lean" style="--lean:-153deg"><circle class="ws-crescent" r="18" stroke-dasharray="34 80" stroke-dashoffset="17"/></g></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="ws-fog-p"><stop offset="0" stop-color="currentColor" stop-opacity=".24"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
              <radialGradient id="ws-fog-dense-p"><stop offset="0" stop-color="currentColor" stop-opacity=".42"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
            </defs>
            <g class="ws-fog-bank">
              <ellipse cx="200" cy="470" rx="220" ry="80" fill="url(#ws-fog-p)"/>
              <ellipse cx="120" cy="610" rx="180" ry="70" fill="url(#ws-fog-p)"/>
            </g>
            <ellipse cx="300" cy="440" rx="60" ry="40" fill="url(#ws-fog-dense-p)"/>
            <path class="ws-line" d="M174 665.4 C160 610 110 570 60 560" pathLength="1"/>
            <g class="ws-dot" transform="translate(60 560)"><circle r="6"/><g class="ws-crescent-lean" style="--lean:-27deg"><circle class="ws-crescent" r="16" stroke-dasharray="30 71" stroke-dashoffset="15"/></g></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">05 · Seek</p>
              <h2 id="scene-5-title">You walk toward what you <em>don't know</em>.</h2>
              <p class="ws-body">Whisper what you're looking for. Places wait, hidden in fog, and only stillness reveals them.</p>
              <form class="seek-door-form ws-seek-form" method="get" action="/seek" autocomplete="off" data-seek-door>
                <label class="seek-door-label" for="seek-door-word">What are you seeking?</label>
                <div class="seek-door-field">
                  <input type="text" id="seek-door-word" name="word" maxlength="32" placeholder="one word is enough" spellcheck="false">
                  <button type="submit" class="seek-door-submit" data-umami-event="enter-seek">Seek</button>
                </div>
              </form>
            </div>
          </div>
        </section>

        <!-- 06 · Traces · golden hour -->
        <section class="walk-story-scene walk-story-scene--no-phone" id="scene-6" data-scene="traces" data-sky="golden" aria-labelledby="scene-6-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M1100 690 C980 700 900 760 780 780" pathLength="1"/>
            <g class="ws-dot" transform="translate(780 780)"><circle r="6"/></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M60 560 C40 620 70 700 130 760" pathLength="1"/>
            <g class="ws-dot" transform="translate(130 760)"><circle r="6"/></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">06 · Traces</p>
              <h2 id="scene-6-title">You pass what someone <em>left</em>.</h2>
              <p class="ws-body">A whisper, left for whoever walks by. A cairn, one stone at a time. No names on either.</p>
            </div>
            <div class="ws-act--right ws-act--traces">
              <div class="traces-card">
                <!-- MOVE:wisp -->
                <h3 class="traces-card-title traces-card-title--whispers">Whispers</h3>
              </div>
              <div class="traces-card">
                <!-- MOVE:cairn -->
                <h3 class="traces-card-title traces-card-title--cairns">Cairns</h3>
              </div>
            </div>
          </div>
        </section>

        <!-- 07 · Home · dusk -->
        <section class="walk-story-scene" id="scene-7" data-scene="home" data-sky="dusk" aria-labelledby="scene-7-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M780 780 C700 800 620 800 560 770 A40 40 0 1 1 480 770 A40 40 0 1 1 560 770" pathLength="1"/>
            <g class="ws-dot" transform="translate(560 770)"><circle r="6"/></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-line" d="M130 760 C150 790 170 800 180 810 A20 20 0 1 1 140 810 A20 20 0 1 1 180 810" pathLength="1"/>
            <g class="ws-dot" transform="translate(180 810)"><circle r="6"/></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">07 · Home</p>
              <h2 id="scene-7-title">You come home, and the walk <em>remembers</em>.</h2>
              <p class="ws-body">Your route, what you said, the photos you took where you took them. A seal pressed from this walk alone. And over many walks, the words that keep returning.</p>
            </div>
            <div class="walk-story-phone" aria-hidden="true">
              <div class="ws-screen ws-screen--summary">
                <svg class="ws-summary-route" viewBox="0 0 200 120"><path class="ws-summary-path" d="M20 96 C60 60 90 104 130 70 S170 30 184 40"/><circle class="ws-relic" cx="58" cy="82" r="6"/><circle class="ws-relic" cx="118" cy="76" r="6"/><circle class="ws-relic" cx="170" cy="38" r="6"/></svg>
                <p class="ws-recording">the light on the water keeps changing, and I keep trying to hold it still</p>
                <div class="ws-seal">
                  <svg viewBox="0 0 100 100"><circle class="ws-seal-ink" cx="50" cy="50" r="44" stroke-width="3"/><circle class="ws-seal-ink" cx="50" cy="50" r="40" stroke-width="4" stroke-dasharray="1.6 19.34"/><circle class="ws-seal-ink" cx="50" cy="50" r="34" stroke-width="1.2"/><path class="ws-seal-ink" d="M32 54 C40 44 48 60 56 50 S66 45 70 48" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 08 · Give -->
        <section class="walk-story-scene" id="scene-8" data-scene="give" data-sky="night" aria-labelledby="scene-8-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-follower" d="M560 770 C460 740 380 800 280 790" pathLength="1"/>
            <path class="ws-line" d="M560 770 C460 740 380 800 280 790" pathLength="1"/>
            <g class="ws-dot" transform="translate(280 790)"><circle r="6"/></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path class="ws-follower" d="M180 810 C120 830 80 840 40 836" pathLength="1"/>
            <path class="ws-line" d="M180 810 C120 830 80 840 40 836" pathLength="1"/>
            <g class="ws-dot" transform="translate(40 836)"><circle r="6"/></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">08 · Give</p>
              <h2 id="scene-8-title">You give the walk <em>away</em>.</h2>
              <p class="ws-body">Share it as a living page. Your voice plays where you spoke, your photographs wait where you stood, and whoever walks it after you walks in your steps.</p>
              <p><a href="https://walk.pilgrimapp.org/9mYhRL7GWx" data-umami-event="walk-with-me-demo">Walk one yourself&nbsp;&rarr;</a></p>
            </div>
            <div class="walk-story-phone" aria-hidden="true">
              <div class="ws-screen ws-screen--share">
                <svg class="ws-share-route" viewBox="0 0 320 72"><path class="ws-share-path" d="M8 52 C 48 18, 84 64, 124 42 C 156 24, 176 14, 210 26 C 244 38, 268 54, 296 34" pathLength="1"/><circle class="ws-share-walker" cx="296" cy="34" r="3.5"/></svg>
              </div>
            </div>
          </div>
        </section>

        <!-- 09 · Yours alone · night -->
        <section class="walk-story-scene walk-story-scene--no-phone" id="scene-9" data-scene="yours-alone" data-sky="night" aria-labelledby="scene-9-title">
          <svg class="walk-story-line walk-story-line--landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <circle class="ws-moon-disc" cx="1300" cy="190" r="36"/>
            <path class="ws-moon-lit" data-cx="1300" data-cy="190" data-r="36" d="M1300 154 A36 36 0 0 1 1300 226 A0.00 36 0 0 0 1300 154Z"/>
            <path class="ws-line" d="M280 790 C250 788 220 786 200 785" pathLength="1"/>
            <g class="ws-dot" transform="translate(200 785)"><circle r="6"/></g>
          </svg>
          <svg class="walk-story-line walk-story-line--portrait" viewBox="0 0 400 860" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <circle class="ws-moon-disc" cx="352" cy="40" r="16"/>
            <path class="ws-moon-lit" data-cx="352" data-cy="40" data-r="16" d="M352 24 A16 16 0 0 1 352 56 A0.00 16 0 0 0 352 24Z"/>
            <path class="ws-line" d="M40 836 C34 838 28 840 24 840" pathLength="1"/>
            <g class="ws-dot" transform="translate(24 840)"><circle r="6"/></g>
          </svg>
          <div class="walk-story-front">
            <div class="walk-story-copy">
              <p class="ws-kicker">09 · Yours alone</p>
              <h2 id="scene-9-title">Your walk is yours <em>alone</em>.</h2>
              <p class="ws-body">No account, and nothing that says who you are. What you make on a walk stays on your phone. The little that travels is written down, plainly.</p>
              <ul class="ws-list">
                <li>Transcribed on your phone.</li>
                <li>No login, no profile.</li>
                <li>No analytics, advertising or crash-reporting SDKs.</li>
                <li>Your walks export whole, any time.</li>
              </ul>
              <p><a href="/privacy">Everything the app sends&nbsp;&rarr;</a></p>
              <p class="ws-begin">Begin your own walk</p>
              <!-- MOVE:badges -->
            </div>
          </div>
        </section>

        <nav class="walk-story-rail" aria-label="Scenes">
          <a href="#scene-1" aria-label="Scene 1 of 9: Set out"></a>
          <a href="#scene-2" aria-label="Scene 2 of 9: Wander"></a>
          <a href="#scene-3" aria-label="Scene 3 of 9: Stillness"></a>
          <a href="#scene-4" aria-label="Scene 4 of 9: Honor"></a>
          <a href="#scene-5" aria-label="Scene 5 of 9: Seek"></a>
          <a href="#scene-6" aria-label="Scene 6 of 9: Traces"></a>
          <a href="#scene-7" aria-label="Scene 7 of 9: Home"></a>
          <a href="#scene-8" aria-label="Scene 8 of 9: Give"></a>
          <a href="#scene-9" aria-label="Scene 9 of 9: Yours alone"></a>
        </nav>
        <a class="walk-story-pill" href="#scene-2"><span class="ws-pill-label">Begin walking</span> <span aria-hidden="true">↓</span></a>
      </div>
    </section>
    <div id="after-walk-story"></div>
```

- [ ] **Step 4: Cut the six sections and splice the story in**

Run this from the repo root. It moves the wisp, the cairn and the store badges verbatim, deletes bottom-up so the earlier line numbers stay valid, and removes the partial:

```bash
node - <<'EOF'
const fs = require('fs');
const html0 = fs.readFileSync('index.html', 'utf8');
let story = fs.readFileSync('walk-story.partial.html', 'utf8');
function grab(re, name) {
  const m = html0.match(re);
  if (!m) throw new Error('could not find the ' + name + ' block to move');
  return m[0];
}
story = story
  .replace('<!-- MOVE:wisp -->', grab(/<div class="traces-card-icon traces-card-icon--whispers">[\s\S]*?<p class="wisp-energy" id="wisp-energy"><\/p>\s*<\/div>/, 'wisp'))
  .replace('<!-- MOVE:cairn -->', grab(/<div class="traces-card-icon traces-card-icon--cairns">[\s\S]*?<p class="cairn-counter" id="cairn-counter" aria-live="polite"><\/p>\s*<\/div>/, 'cairn'))
  .replace('<!-- MOVE:badges -->', grab(/<div class="store-badges">[\s\S]*?<\/a>\s*<\/div>/, 'store badges'));
const lines = html0.split('\n');
function at(text, from) {
  for (let i = from || 0; i < lines.length; i++) if (lines[i].indexOf(text) !== -1) return i;
  throw new Error('not found: ' + text);
}
// Privacy, and the divider in front of it, so two dividers never meet.
const privacyDivider = at('<!-- Footprint divider -->', at('8. Soundscape'));
const afterPrivacy = at('<!-- Footprint divider -->', at('9. Privacy'));
lines.splice(privacyDivider, afterPrivacy - privacyDivider);
// Walk with me, the seek door and the screenshot journey.
const walkwithme = at('4.65. Walk with me') - 1;
const seasonsDivider = at('<!-- Footprint divider -->', at('5. Screenshot Journey'));
lines.splice(walkwithme, seasonsDivider - walkwithme);
// The practice cards and traces become the story.
const practice = at('4. The Practice') - 1;
const reliquary = at('4.6. Reliquary') - 1;
lines.splice(practice, reliquary - practice, story.replace(/\n$/, ''), '');
fs.writeFileSync('index.html', lines.join('\n'));
fs.unlinkSync('walk-story.partial.html');
console.log('story in; six sections out');
EOF
```

Expected output: `story in; six sections out`.

- [ ] **Step 5: Link the stylesheet and remove the dead inline CSS**

In `index.html`'s `<head>`, add this line directly after `<link rel="stylesheet" href="css/traces-glyphs.css">`:

```html
  <link rel="stylesheet" href="css/walk-story.css">
```

Then, in `index.html`'s inline `<style>` block, delete these rules. Their sections are gone.
- `.journey`, `.journey h2`, `.journey-inner`, `.journey-caption`, `.journey-pair`, `.journey-single` and `.journey-screenshot`, including their occurrences inside `@media` blocks. Delete any `@media` block left empty.
- `.journey-cta`.
- `.privacy-features`, `.privacy-feature`, `.privacy-feature-icon`, `.privacy-feature h3` and `.privacy-feature p`, including the `@media` occurrence.
- `.seek-door` itself, `.seek-door::before, .seek-door::after`, `.seek-door::before`, `.seek-door::after`, `.seek-door h2` and `.seek-door p`.

**Keep** `.seek-door-crescent`, `@keyframes seek-door-breath` (the clearing's rider breathes with it; `js/clearing-wiring.test.js` asserts this), `.seek-door-label`, `.seek-door-field` and its descendants, `.seek-door-submit`, and every `.store-badges`, `.app-store-badge` and `.google-play-badge` rule.

In `css/styles.css`, delete these rules. Only the removed sections used them.
- `.practice`, `.practice-grid`, `.practice-card`, `.practice-card-icon`, `.practice-card h3`, `.practice-card p` and the four `.practice-card--*` rules, plus the `.practice-grid` entry inside the `@media (max-width: 768px)` block.
- `.traces-cards`.
- Every `.walkwithme*` rule, including its `@media (prefers-reduced-motion: reduce)` block.

**Keep** `.traces`, `.traces-inner`, `.traces-heading`, `.traces-lede` and every `.traces-card*` rule, because the Reliquary and scene 06 still use them.

Verify:

```bash
grep -nE '\.(journey|privacy-feature|practice|walkwithme|traces-cards)\b|\.seek-door(\s|::|\s*\{)' index.html css/styles.css; echo "exit $?"
```

Expected: no matches, `exit 1`.

- [ ] **Step 6: Append the stacked layout, copy, lines and phones to `css/walk-story.css`**

```css
/* --- Stacked: no JS, reduced motion, short viewports. Nine sections in
   their finished states: every act below reads var(--hold, 1). --- */

.walk-story { position: relative; }
.walk-story-stage { position: relative; }
.walk-story-atmosphere,
.walk-story-rail,
.walk-story-pill { display: none; }

.walk-story-scene {
  position: relative;
  overflow: hidden;
  min-height: 92svh;
  padding: 14vh 8% 24vh;
}

.walk-story-line {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.walk-story-line--portrait { display: none; }
@media (max-width: 720px) {
  .walk-story-line--landscape { display: none; }
  .walk-story-line--portrait { display: block; }
}

.walk-story-front {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3rem 6%;
}
.walk-story-copy { flex: 1 1 22rem; max-width: 36rem; }
.walk-story-phone { flex: 0 0 auto; width: min(260px, 70vw); aspect-ratio: 9 / 19.5; }
.ws-act--right { flex: 1 1 18rem; }
.ws-said { flex: 1 1 100%; }

/* --- Copy --- */

.ws-kicker {
  font-family: var(--font-ui);
  font-size: 0.74rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--ws-muted);
  margin: 0 0 1.25rem;
}
.walk-story-copy h2 {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: clamp(2.3rem, 4.4vw, 4.25rem);
  line-height: 1.03;
  letter-spacing: -0.012em;
  margin: 0 0 1.2rem;
}
.walk-story-copy h2 em { font-style: italic; font-weight: 400; }
.ws-body { font-size: clamp(1.05rem, 1.3vw, 1.22rem); line-height: 1.62; max-width: 34ch; margin: 0 0 1rem; }
.ws-aside,
.ws-caption,
.ws-said { font-style: italic; color: var(--ws-muted); }
.ws-caption { font-size: 0.98rem; margin: 0.3rem 0; }
.ws-closing { font-family: var(--font-display); font-size: clamp(1.25rem, 1.8vw, 1.6rem); font-style: italic; margin: 1.1rem 0; }
.ws-said { font-family: var(--font-display); font-size: clamp(1.1rem, 1.5vw, 1.35rem); max-width: 30ch; margin: 0; }
.walk-story-copy a { color: inherit; text-decoration: underline; text-underline-offset: 0.2em; }
.ws-list { list-style: none; padding: 0; margin: 1rem 0; }
.ws-list li { margin: 0.3rem 0; }
.ws-begin { font-family: var(--font-display); font-size: 1.3rem; font-style: italic; margin: 1.4rem 0 0.8rem; }
.ws-seek-form { margin-top: 1.4rem; }
.ws-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.walk-story-skip {
  position: absolute;
  left: 1rem;
  top: 1rem;
  z-index: 5;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  background: var(--parchment);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 0.85rem;
  transform: translateY(-300%);
}
.walk-story-skip:focus { transform: none; }

/* On a night sky the page's own badge colours sink; lift them. */
.walk-story-scene[data-sky="night"] .app-store-badge,
.walk-story-scene[data-sky="night"] .google-play-badge {
  background: var(--ws-ink-darksky);
  color: var(--ws-night-base);
  border-color: var(--ws-ink-darksky);
}

/* --- The line --- */

.ws-line { fill: none; stroke: currentColor; stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.ws-dot > circle,
.ws-pin circle,
.ws-moment circle { fill: currentColor; }
.ws-ring { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: 0.6; vector-effect: non-scaling-stroke; transform-box: fill-box; transform-origin: center; }
.ws-honor-theirs { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 0.004 0.012; opacity: 0.45; }
.ws-moment-label { font-family: var(--font-ui); font-size: 13px; letter-spacing: 0.04em; fill: currentColor; }
.ws-moment-ja { font-size: 12px; fill: currentColor; opacity: 0.8; }
.ws-crescent { fill: none; stroke: var(--dawn); stroke-width: 2.5; stroke-linecap: round; }
.ws-follower { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; opacity: 0.45; vector-effect: non-scaling-stroke; }
.ws-moon-disc { fill: currentColor; opacity: 0.08; }
.ws-moon-lit { fill: currentColor; opacity: 0.85; }

/* --- The phone. Every string on it is the app's own (the markup test
   cites each); its colours are the page's, so it follows the theme. --- */

.walk-story-phone {
  position: relative;
  border-radius: 36px;
  padding: 9px;
  background: #16120F;
  box-shadow: 0 60px 100px -40px rgba(24, 16, 8, 0.55), 0 24px 44px -26px rgba(24, 16, 8, 0.45);
}
[data-theme="dark"] .walk-story-phone {
  background: #050505;
  box-shadow: 0 60px 100px -40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.ws-screen {
  position: relative;
  height: 100%;
  border-radius: 28px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12% 7% 7%;
  background: var(--parchment);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: clamp(9px, 1.35vh, 13px);
}
.ws-app-logo { width: 24%; height: auto; border-radius: 22%; }
.ws-app-quote { font-family: var(--font-display); font-size: 1.5em; line-height: 1.2; text-align: center; color: var(--ink-fog); margin: 8% 0 0; }
.ws-app-spacer { flex: 1 1 auto; }
.ws-modes { position: relative; width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; font-size: 0.82em; font-weight: 700; letter-spacing: 0.06em; color: var(--ink-fog); padding-bottom: 0.5em; }
.ws-modes span:first-child { color: var(--stone); }
.ws-modes-underline { position: absolute; left: 0; bottom: 0; width: 33.333%; height: 2px; background: var(--stone); }
.ws-app-sub { font-size: 0.8em; color: var(--ink-fog); margin: 5% 0; }
.ws-app-button { display: block; width: 100%; padding: 0.85em 0; border-radius: 0.75em; background: var(--stone); color: var(--parchment); text-align: center; font-weight: 700; }
.ws-app-tabs { display: flex; justify-content: space-around; width: 100%; margin-top: 7%; font-size: 0.72em; color: var(--ink-fog); }
.ws-app-tabs .is-on { color: var(--stone); font-weight: 700; }
.ws-sheet { position: absolute; left: 0; right: 0; bottom: 0; padding: 9% 8% 12%; border-radius: 1.3em 1.3em 0 0; background: var(--parchment-secondary); box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.14); }
.ws-sheet-title { font-family: var(--font-display); font-size: 1.6em; text-align: center; margin: 0 0 7%; }
.ws-field { position: relative; min-height: 1.7em; padding: 0.4em 0; border-bottom: 1px solid var(--stone); font-family: var(--font-display); font-size: 1.2em; margin: 0; }
.ws-placeholder { position: absolute; left: 0; top: 0.4em; color: var(--ink-fog); }
.ws-sheet-label { font-size: 0.72em; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-fog); margin: 9% 0 3%; }
.ws-chips { display: flex; flex-wrap: wrap; gap: 0.45em; }
.ws-chip { position: relative; padding: 0.35em 0.85em; border: 1px solid var(--stone); border-radius: 999px; font-family: var(--font-display); font-size: 1.05em; }
.ws-chip--tapped::after { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: var(--stone); opacity: 0.22; }

.ws-screen--walk { padding: 0; }
.ws-map { position: relative; flex: 1 1 auto; width: 100%; background: linear-gradient(160deg, var(--parchment-tertiary), var(--parchment-secondary)); }
.ws-map svg { position: absolute; left: 8%; top: 12%; width: 84%; height: 82%; }
.ws-map-route { fill: none; stroke: var(--stone); stroke-width: 3; stroke-linecap: round; }
.ws-map-you { fill: var(--stone); }
.ws-stats-sheet { width: 100%; padding: 7% 7% 10%; border-radius: 1.3em 1.3em 0 0; background: var(--parchment); box-shadow: 0 -10px 26px rgba(0, 0, 0, 0.1); text-align: center; }
.ws-timer { font-size: 2.4em; font-weight: 300; letter-spacing: 0.02em; margin: 0; }
.ws-metrics { display: grid; grid-template-columns: repeat(3, 1fr); margin: 7% 0; font-size: 0.72em; color: var(--ink-fog); }
.ws-metrics b { display: block; font-size: 1.4em; font-weight: 400; color: var(--ink); }
.ws-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45em; font-size: 0.78em; }
.ws-actions > span { padding: 0.75em 0; border-radius: 0.65em; background: var(--parchment-secondary); }
.ws-rec { display: flex; align-items: center; justify-content: center; gap: 0.4em; }
.ws-rec-dot { width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--rust); }
.ws-rec-labels { display: grid; }
.ws-rec-labels em { grid-area: 1 / 1; font-style: normal; }

.ws-screen--video { padding: 0; background: #000; }
.ws-video { width: 100%; height: 100%; object-fit: cover; }

.ws-screen--card { justify-content: center; background: var(--parchment-secondary); }
.ws-card { width: 100%; padding: 10% 8%; border-radius: 1.1em; background: var(--parchment); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.1); }
.ws-card-theme { font-family: var(--font-display); font-size: 1.8em; margin: 0 0 4%; }
.ws-card-narrative { font-family: var(--font-display); font-size: 1.08em; line-height: 1.4; margin: 0 0 7%; }
.ws-card-facts { font-size: 0.8em; color: var(--ink-fog); margin: 0 0 3%; }
.ws-card-maps { font-size: 0.76em; color: var(--moss); margin: 0 0 8%; }

.ws-screen--summary { justify-content: flex-start; gap: 6%; padding: 10% 6%; }
.ws-summary-route { width: 100%; height: auto; border-radius: 0.9em; background: var(--parchment-secondary); }
.ws-summary-path { fill: none; stroke: var(--stone); stroke-width: 3; stroke-linecap: round; }
.ws-relic { fill: var(--rust); stroke: var(--parchment); stroke-width: 2; }
.ws-recording { display: flex; gap: 0.6em; width: 100%; font-family: var(--font-display); font-size: 1.05em; line-height: 1.35; margin: 0; }
.ws-recording::before { content: ''; flex: 0 0 0.35em; border-radius: 0.2em; background: var(--dawn); }
.ws-seal { position: relative; width: 48%; margin-top: auto; }
.ws-seal svg { display: block; width: 100%; height: auto; }
.ws-seal-ink { fill: none; stroke: #B5452F; }

.ws-screen--share { justify-content: center; }
.ws-share-route { width: 90%; height: auto; }
.ws-share-path { fill: none; stroke: var(--ink); stroke-width: 2; stroke-linecap: round; }
.ws-share-walker { fill: var(--ink); }

/* Scene 06's traces keep the look css/traces-glyphs.css gives them. */
.ws-act--traces { display: flex; gap: 2.5rem; justify-content: center; }
```

- [ ] **Step 7: Run the markup test and watch it pass**

Run: `node js/walk-story-markup.test.js`
Expected: `ALL PASS: N`

- [ ] **Step 8: Raise the index baseline deliberately**

Run: `node js/page-weight.test.js`. It fails with `index.html grew X KB to Y KB` (or shrank).

In `js/page-weight.test.js`, set `'index.html':` to the measured `Y`, and add this comment directly above that line:

```js
  // The walk story (docs/superpowers/specs/2026-09-24-one-walk-story-design.md):
  // nine scenes, each with its copy, an HTML phone and its line in two
  // geometries, replace six sections; the removed sections' inline and
  // shared CSS went with them. Raised again as each task lands.
```

Run: `node js/page-weight.test.js`. Expected: it passes.

- [ ] **Step 9: Run the whole suite, open the page stacked, then commit**

Run the suite from *Running the tests*. Expected: only `scripts/bake-collective-routes.test.js` fails. Serve the page with `python3 -m http.server 8765` and open `http://localhost:8765/`. With no story JS yet, all nine scenes should stack, each on its own sky, with phones and lines in their finished state.

```bash
git add index.html css/walk-story.css css/styles.css js/walk-story-markup.test.js js/page-weight.test.js
git commit -F - <<'EOF'
feat(walk-story): the story replaces six sections, stacked and finished

Practice, traces, walk with me, the seek door, the screenshot journey
and the privacy cards become nine scenes of one walk. Without any story
script the page is complete: every act reads var(--hold, 1), so each
scene stands in its finished state on its own sky. The wisp, the cairn
and the store badges moved verbatim; the Reliquary now follows the
story; the removed sections' CSS went with them. The phones quote only
the app's own strings, each cited in the markup test, and the Honor
stage is the bake's output byte for byte.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: The pinned stage and the acts

**Files:**
- Create: `js/walk-story.js`
- Modify: `css/walk-story.css` (append the pinned layout, the acts and the reduced-motion rules)
- Modify: `index.html` (the two script tags)
- Modify: `js/walk-story-markup.test.js` (append the timing and script sections)
- Modify: `js/page-weight.test.js`

**Interfaces:**
- Consumes: `window.WalkStoryCore` (all of Task 1), the DOM contract from Task 4, `window.getMoonPhase` (a global from `js/moon.js`), `window.TracesCairn.demo` (Task 6; the call is guarded), and `window.umami`.
- Produces:
  - `.walk-story--pinned` on the root;
  - `body.walk-story-pinned` while the story is in view;
  - `.is-active` on the current scene, `aria-current="step"` on its rail dot, and `data-sky` on the stage;
  - the umami event `story-reach-end`.

- [ ] **Step 1: Append the failing checks to `js/walk-story-markup.test.js`**

Insert these sections before the final `console.log('\n---');`:

```js
console.log('\n=== CSS timings are the core\'s ===\n');

const css = fs.readFileSync(path.join(ROOT, 'css', 'walk-story.css'), 'utf8');
ok(css.indexOf('var(--hold, 1) / ' + C.LINE_INK_END + ',') !== -1, 'lines ink over ' + C.LINE_INK_END + ' of the hold, as lineInk does');
ok(css.indexOf('var(--hold, 1) / ' + C.HONOR.inkEnd + ',') !== -1, 'Honor inks over ' + C.HONOR.inkEnd + ', as honorReveal does');
ok(css.indexOf('(var(--hold, 1) - ' + C.HONOR.closingAt + ') / ') !== -1, 'the closing line waits for ' + C.HONOR.closingAt);
ok(css.indexOf('(var(--hold, 1) - var(--at)) / ' + C.HONOR.momentFade) !== -1, 'moments surface over ' + C.HONOR.momentFade);
ok(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.ws-ring[^}]*animation:\s*none/.test(css), 'reduced motion stills the breathing ring');

console.log('\n=== scripts ===\n');

const coreTag = html.match(/<script[^>]*src="js\/walk-story-core\.js"[^>]*>/);
const domTag = html.match(/<script[^>]*src="js\/walk-story\.js"[^>]*>/);
ok(coreTag && /\bdefer\b/.test(coreTag[0]), 'index.html loads js/walk-story-core.js, deferred');
ok(domTag && /\bdefer\b/.test(domTag[0]), 'index.html loads js/walk-story.js, deferred');
ok(coreTag && domTag && html.indexOf(coreTag[0]) < html.indexOf(domTag[0]), 'the core loads before the wiring that reads it');
ok(domTag && html.indexOf('src="js/traces-cairn.js"') < html.indexOf(domTag[0]), 'the cairn loads before the story that calls its demo');
ok(domTag && html.indexOf('src="js/moon.js"') < html.indexOf(domTag[0]), 'moon.js (getMoonPhase) loads before the story paints tonight\'s moon');
const wiring = fs.existsSync(path.join(ROOT, 'js', 'walk-story.js')) ? fs.readFileSync(path.join(ROOT, 'js', 'walk-story.js'), 'utf8') : '';
ok(wiring.length > 0, 'js/walk-story.js exists (a script tag pointing at a 404 is silent)');
ok(wiring.indexOf('getBoundingClientRect') === wiring.lastIndexOf('getBoundingClientRect') && /function measure\(\)[\s\S]*getBoundingClientRect/.test(wiring),
  'the only layout read is in measure(), never in the frame loop');
ok(/window\.innerWidth !== width/.test(wiring), 'height-only resizes (iOS toolbar) are ignored');
```

Run: `node js/walk-story-markup.test.js`
Expected: FAIL on the new timing and script checks.

- [ ] **Step 2: Append the pinned layout, acts and reduced motion to `css/walk-story.css`**

```css
/* --- Pinned: js/walk-story.js adds .walk-story--pinned. Nine scenes
   fill one sticky stage; each scene's front is shown by opacity, its
   line stays once walked, and the five skies crossfade behind. The
   stage's frame is 100svh and its sky 100lvh: dvh follows Safari's
   toolbar and would reflow the stage as it collapses. --- */

.walk-story--pinned { height: calc(9 * 1.4 * 100svh); }
.walk-story--pinned .walk-story-stage { position: sticky; top: 0; height: 100svh; overflow: hidden; }
.walk-story--pinned .walk-story-atmosphere { display: block; position: absolute; top: 0; left: 0; right: 0; height: 100lvh; }
.walk-story--pinned .ws-sky { position: absolute; inset: 0; opacity: 0; will-change: opacity; }
.walk-story--pinned .walk-story-scene { position: absolute; inset: 0; min-height: 0; padding: 0; background: none; }
.walk-story--pinned .walk-story-line { opacity: 0; }
.walk-story--pinned .walk-story-front { position: absolute; inset: 0; display: block; opacity: 0; pointer-events: none; }
.walk-story--pinned .walk-story-scene.is-active .walk-story-front { pointer-events: auto; }

.walk-story--pinned .walk-story-copy { position: absolute; left: 8%; width: 36%; top: 50%; transform: translateY(-50%); max-width: none; }
.walk-story--pinned .walk-story-phone {
  position: absolute;
  left: 68%;
  top: 50%;
  width: auto;
  height: 72%;
  max-height: 720px;
  transform: translate(-50%, calc(-50% + (0.5 - var(--hold, 1)) * 18px));
  will-change: transform;
}
.walk-story--pinned .walk-story-scene[data-scene="honor"] .walk-story-phone { left: 62%; }
.walk-story--pinned .ws-act--right { position: absolute; left: 52%; width: 32%; top: 50%; transform: translateY(-50%); }
.walk-story--pinned .ws-said { position: absolute; left: 8%; width: 40%; bottom: 17%; }

.walk-story--pinned .walk-story-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  position: absolute;
  right: 3%;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  color: var(--ws-ink);
}
.walk-story-rail a { position: relative; display: block; width: 6px; height: 6px; border-radius: 3px; background: currentColor; opacity: 0.35; transition: height 0.35s var(--ws-ease), opacity 0.35s var(--ws-ease); }
.walk-story-rail a::before { content: ''; position: absolute; inset: -9px -14px; }
.walk-story-rail a[aria-current="step"] { height: 24px; opacity: 0.9; }
.walk-story-rail a:focus-visible { outline: 2px solid currentColor; outline-offset: 5px; }
.walk-story--pinned .walk-story-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  position: absolute;
  left: 50%;
  bottom: calc(4% + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 3;
  padding: 0.8em 1.4em;
  border-radius: 999px;
  background: var(--parchment);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 0.95rem;
  text-decoration: none;
  box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.35);
  transition: opacity 0.4s var(--ws-ease);
}
.walk-story-pill.is-hidden { opacity: 0; pointer-events: none; }

@media (max-width: 1024px) and (min-width: 721px) {
  .walk-story--pinned .walk-story-copy { left: 6%; width: 42%; }
  .walk-story--pinned .walk-story-phone { height: 60%; }
}

@media (max-width: 720px) {
  .walk-story--pinned .walk-story-copy { left: 6%; right: 6%; width: auto; top: 5%; transform: none; max-height: 46%; }
  .walk-story--pinned .walk-story-scene[data-scene="honor"] .walk-story-copy { max-height: 58%; }
  .walk-story--pinned .walk-story-scene--no-phone .walk-story-copy { max-height: 88%; }
  .walk-story--pinned .walk-story-phone,
  .walk-story--pinned .walk-story-scene[data-scene="honor"] .walk-story-phone {
    left: auto;
    right: 4%;
    top: auto;
    bottom: 3%;
    height: 38%;
    transform: translateY(calc((0.5 - var(--hold, 1)) * 10px));
  }
  .walk-story--pinned .ws-act--right { left: auto; right: 4%; width: 56%; top: auto; bottom: 7%; transform: none; }
  .walk-story--pinned .ws-said { left: 6%; width: 52%; top: 49%; bottom: auto; }
  .walk-story--pinned .walk-story-rail { right: 2%; gap: 10px; }
  .walk-story-copy h2 { font-size: clamp(1.9rem, 8.6vw, 2.6rem); }
}

/* --- Acts. Each reads its scene's hold (0..1), written per frame by
   js/walk-story.js; unset, var(--hold, 1) is the finished state the
   stacked story shows. Every reveal scrubs both ways. The ink and
   Honor numbers are WalkStoryCore's; the markup test holds them. --- */

.ws-line { stroke-dasharray: 1 1; stroke-dashoffset: calc(1 - clamp(0, var(--hold, 1) / 0.85, 1)); }
.ws-honor-yours { stroke-dashoffset: calc(1 - clamp(0, var(--hold, 1) / 0.88, 1)); }
.ws-moment { opacity: clamp(0, calc((var(--hold, 1) - var(--at)) / 0.06), 1); }
.ws-moment-mark { transform: scale(calc(0.85 + 0.15 * clamp(0, (var(--hold, 1) - var(--at)) / 0.06, 1))); }
.ws-closing { opacity: clamp(0, calc((var(--hold, 1) - 0.92) / 0.05), 1); }

/* 01 — the mode row's underline runs WANDER → HONOR → SEEK and home,
   then the intention sheet rises and a Recurring chip fills the field. */
.ws-modes-underline { transform: translateX(calc((clamp(0, (var(--hold, 1) - 0.1) / 0.15, 2) - clamp(0, (var(--hold, 1) - 0.4) / 0.075, 2)) * 100%)); }
.ws-sheet { transform: translateY(calc((1 - clamp(0, (var(--hold, 1) - 0.58) / 0.08, 1)) * 105%)); }
.ws-chip--tapped::after { opacity: calc(0.22 * clamp(0, (var(--hold, 1) - 0.62) / 0.04, 1)); }
.ws-placeholder { opacity: calc(1 - clamp(0, (var(--hold, 1) - 0.66) / 0.02, 1)); }
.ws-typed span { opacity: clamp(0, calc((var(--hold, 1) - 0.66) / 0.24 * 5 - var(--i)), 1); }

/* 02 — recording starts at 0.25; what was said writes itself in after. */
.ws-pin { opacity: clamp(0, calc((var(--hold, 1) - 0.25) / 0.04), 1); }
.ws-rec-live { opacity: clamp(0, calc((var(--hold, 1) - 0.25) / 0.03), 1); }
.ws-rec-idle { opacity: calc(1 - clamp(0, (var(--hold, 1) - 0.25) / 0.03, 1)); }
.ws-said span { opacity: clamp(0, calc((var(--hold, 1) - 0.35) / 0.5 * 15 - var(--i)), 1); }

/* 04 — the morning card settles in first. */
.ws-card { opacity: clamp(0, calc((var(--hold, 1) - 0.04) / 0.1), 1); transform: translateY(calc((1 - clamp(0, (var(--hold, 1) - 0.04) / 0.1, 1)) * 16px)); }

/* 05 — the fog drifts, the crescent leans. Nothing is revealed: the
   page's only reveal is the hidden clearing, and only stillness opens it. */
.ws-fog-bank { transform: translateX(calc((1 - var(--hold, 1)) * 60px)); }
.ws-crescent-lean { transform: rotate(calc(var(--lean) * clamp(0, (var(--hold, 1) - 0.2) / 0.6, 1))); }

/* 06 — the wisp brightens as the line passes it. */
.ws-act--traces .wisp-well { opacity: calc(0.55 + 0.45 * clamp(0, (var(--hold, 1) - 0.2) / 0.3, 1)); }

/* 07 — the seal presses. */
.ws-seal { opacity: clamp(0, calc((var(--hold, 1) - 0.7) / 0.08), 1); transform: scale(calc(1.15 - 0.15 * clamp(0, (var(--hold, 1) - 0.7) / 0.08, 1))); }

/* 08 — someone, later, follows your line; the share page draws its route. */
.ws-follower { stroke-dasharray: 1 1; stroke-dashoffset: calc(1 - clamp(0, (var(--hold, 1) - 0.3) / 0.6, 1)); }
.ws-share-path { stroke-dasharray: 1 1; stroke-dashoffset: calc(1 - clamp(0, (var(--hold, 1) - 0.05) / 0.7, 1)); }
.ws-share-walker { opacity: clamp(0, calc((var(--hold, 1) - 0.75) / 0.08), 1); }

/* Loops run only on the scene on stage, and never under reduced motion. */
.walk-story--pinned .walk-story-scene.is-active .ws-ring { animation: ws-breath 5.5s ease-in-out infinite; }
.walk-story--pinned .walk-story-scene.is-active .ws-rec-dot { animation: ws-rec 1.6s ease-in-out infinite; }
@keyframes ws-breath { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
@keyframes ws-rec { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

@media (prefers-reduced-motion: reduce) {
  .walk-story .ws-ring, .walk-story .ws-rec-dot { animation: none; }
}
```

- [ ] **Step 3: Write `js/walk-story.js`**

```js
/* One walk, told by scroll — DOM wiring. Loaded by index.html only,
 * after js/walk-story-core.js; both defer, so order in the document is
 * order of execution.
 *
 * Without this file, with reduced motion, or on a viewport under 560px
 * tall, the story stays nine stacked sections in their finished states:
 * every act in css/walk-story.css reads var(--hold, 1) and nothing sets
 * --hold. Pinned, the only per-frame writes are --hold on scenes whose
 * hold changed, opacity on fronts, lines and the five sky layers, and a
 * transform on each moving dot. The only layout read is measure().
 */

(function () {
  'use strict';

  var C = window.WalkStoryCore;
  if (!C) return;

  var root = document.querySelector('.walk-story');
  if (!root) return;

  var scenes = Array.prototype.slice.call(root.querySelectorAll('.walk-story-scene'));
  var n = scenes.length;
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  paintMoon();

  var canPin = !reduceMotion && n === C.SCENES.length && window.innerHeight >= 560 &&
    'IntersectionObserver' in window && window.CSS && CSS.supports('position', 'sticky');
  if (!canPin) {
    wireTapToPlay();
    return;
  }

  root.classList.add('walk-story--pinned');

  var stage = root.querySelector('.walk-story-stage');
  var skies = Array.prototype.slice.call(root.querySelectorAll('.ws-sky'));
  var rail = Array.prototype.slice.call(root.querySelectorAll('.walk-story-rail a'));
  var pill = root.querySelector('.walk-story-pill');
  var pillText = pill && pill.querySelector('.ws-pill-label');
  var video = root.querySelector('.ws-video');
  var videoScene = video ? scenes.indexOf(video.closest('.walk-story-scene')) : -1;
  var tracesScene = sceneIndex('traces');
  var portraitQuery = window.matchMedia('(max-width: 720px)');

  var state = scenes.map(function (scene) {
    var svgs = Array.prototype.slice.call(scene.querySelectorAll('.walk-story-line'));
    return {
      frontEl: scene.querySelector('.walk-story-front'),
      lines: svgs,
      tracks: svgs.map(function (svg) {
        var path = svg.querySelector('.ws-line');
        var dot = svg.querySelector('.ws-dot');
        return path && dot ? {
          path: path,
          dot: dot,
          length: 0,
          portrait: svg.classList.contains('walk-story-line--portrait')
        } : null;
      }).filter(Boolean),
      hold: -1,
      frontOpacity: -1,
      lineOpacity: -1
    };
  });

  var top = 0, height = 0, stageHeight = 0, width = 0;
  var target = 0, shown = 0, raf = 0, lastT = 0;
  var current = -1, inView = false, demoed = false, reachedEnd = false;
  var skyOpacity = skies.map(function () { return -1; });

  function sceneIndex(id) {
    for (var i = 0; i < C.SCENES.length; i++) if (C.SCENES[i].id === id) return i;
    return -1;
  }

  function measure() {
    var portrait = portraitQuery.matches;
    width = window.innerWidth;
    top = root.getBoundingClientRect().top + window.scrollY;
    height = root.offsetHeight;
    stageHeight = stage.offsetHeight;
    state.forEach(function (s) {
      s.tracks.forEach(function (t) {
        t.length = 0;
        if (t.portrait !== portrait) return;
        try { t.length = t.path.getTotalLength(); } catch (e) { t.length = 0; }
      });
      s.hold = -1;   // re-place every dot in the geometry now on screen
    });
    target = C.storyProgress(window.scrollY, top, height, stageHeight);
  }

  function moveDots(j, hold) {
    var ink = C.lineInk(C.SCENES[j].id, hold);
    state[j].tracks.forEach(function (t) {
      if (!t.length) return;
      var pt = t.path.getPointAtLength(ink * t.length);
      t.dot.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    });
  }

  function syncVideo() {
    if (!video) return;
    if (inView && current === videoScene) {
      var played = video.play();
      if (played && played.catch) played.catch(function () {});
    } else if (!video.paused) {
      video.pause();
    }
  }

  function setCurrent(i) {
    current = i;
    scenes.forEach(function (scene, j) { scene.classList.toggle('is-active', j === i); });
    rail.forEach(function (a, j) {
      if (j === i) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
    });
    stage.setAttribute('data-sky', C.SCENES[i].sky);
    if (pill) {
      var label = C.pillLabel(i);
      pill.classList.toggle('is-hidden', !label);
      if (label) {
        pillText.textContent = label;
        pill.setAttribute('href', '#scene-' + (i + 2));
        pill.removeAttribute('tabindex');
        pill.removeAttribute('aria-hidden');
      } else {
        pill.setAttribute('tabindex', '-1');
        pill.setAttribute('aria-hidden', 'true');
      }
    }
    syncVideo();
  }

  function render(p) {
    var at = C.sceneAt(p, n);
    for (var j = 0; j < n; j++) {
      var s = state[j];
      var l = p * n - j;
      var hold = Math.round(C.holdLocal(C.clamp(l, 0, 1)) * 10000) / 10000;
      if (hold !== s.hold) {
        scenes[j].style.setProperty('--hold', hold);
        moveDots(j, hold);
        s.hold = hold;
      }
      var front = Math.round(C.frontOpacity(l, j, n) * 1000) / 1000;
      if (front !== s.frontOpacity) {
        s.frontEl.style.opacity = front;
        s.frontOpacity = front;
      }
      var line = C.lineOpacity(j, at.index);
      if (line !== s.lineOpacity) {
        for (var k = 0; k < s.lines.length; k++) s.lines[k].style.opacity = line;
        s.lineOpacity = line;
      }
    }
    var layers = C.layerOpacities(C.skyWeights(p, n));
    for (var i = 0; i < skies.length; i++) {
      var o = Math.round(layers[i] * 1000) / 1000;
      if (o !== skyOpacity[i]) {
        skies[i].style.opacity = o;
        skyOpacity[i] = o;
      }
    }
    if (at.index !== current) setCurrent(at.index);
    var activeHold = state[at.index].hold;
    if (at.index === tracesScene && activeHold > 0 && !demoed && window.TracesCairn) {
      demoed = true;
      window.TracesCairn.demo();
    }
    if (at.index === n - 1 && activeHold > 0 && !reachedEnd) {
      reachedEnd = true;
      if (window.umami) window.umami.track('story-reach-end');
    }
  }

  // Scroll sets a target; this eases the shown progress toward it, so a
  // mouse wheel's 100px steps glide like a trackpad. The factor is 0.14
  // per 60Hz frame, scaled by the real frame time, so a 120Hz display
  // settles at the same speed as the phone in a walker's pocket.
  function frame(t) {
    raf = 0;
    var dt = lastT ? Math.min(64, t - lastT) : 16.667;
    lastT = t;
    shown += (target - shown) * (1 - Math.pow(0.86, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) shown = target;
    render(shown);
    if (shown !== target) raf = window.requestAnimationFrame(frame);
    else lastT = 0;
  }

  function request() {
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  function onScroll() {
    target = C.storyProgress(window.scrollY, top, height, stageHeight);
    request();
  }

  function snap() {
    measure();
    shown = target;
    render(shown);
  }

  // iOS fires resize as its toolbar collapses; only a width change can
  // move the layout, so height-only resizes are ignored.
  function onResize() {
    if (window.innerWidth !== width) snap();
  }

  function scrollToScene(i, smooth) {
    var y = top + C.holdStartProgress(i, n) * (height - stageHeight) + 1;
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
    if (!smooth) {
      onScroll();
      shown = target;
      render(shown);
    }
  }

  rail.forEach(function (a, i) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      scrollToScene(i, true);
    });
  });

  if (pill) {
    pill.addEventListener('click', function (e) {
      e.preventDefault();
      scrollToScene(Math.min(n - 1, current + 1), true);
    });
  }

  // A focused element must never sit in a faded scene: tabbing into a
  // scene brings that scene on stage first.
  root.addEventListener('focusin', function (e) {
    var scene = e.target.closest ? e.target.closest('.walk-story-scene') : null;
    var i = scene ? scenes.indexOf(scene) : -1;
    if (i !== -1 && i !== current) scrollToScene(i, false);
  });

  new IntersectionObserver(function (entries) {
    var was = inView;
    inView = entries[0].isIntersecting;
    document.body.classList.toggle('walk-story-pinned', inView);
    if (inView && !was) {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      shown = target;
      render(shown);
    } else if (!inView && was) {
      window.removeEventListener('scroll', onScroll);
    }
    syncVideo();
  }).observe(root);

  snap();
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('load', snap, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(snap);

  function paintMoon() {
    if (typeof window.getMoonPhase !== 'function') return;
    var phase = window.getMoonPhase(new Date());
    Array.prototype.forEach.call(root.querySelectorAll('.ws-moon-lit'), function (el) {
      el.setAttribute('d', C.moonPath(phase,
        +el.getAttribute('data-cx'), +el.getAttribute('data-cy'), +el.getAttribute('data-r')));
    });
  }

  // Unpinned, the meditation video shows its poster and plays on a tap.
  function wireTapToPlay() {
    var v = root.querySelector('.ws-video');
    if (!v) return;
    v.addEventListener('click', function () {
      if (v.paused) {
        var played = v.play();
        if (played && played.catch) played.catch(function () {});
      } else {
        v.pause();
      }
    });
  }
})();
```

- [ ] **Step 4: Add the script tags**

In `index.html`, directly after `<script src="js/clearing.js" defer></script>`, add:

```html
  <script src="js/walk-story-core.js" defer></script>
  <script src="js/walk-story.js" defer></script>
```

- [ ] **Step 5: Run the markup test and watch it pass**

Run: `node js/walk-story-markup.test.js`
Expected: `ALL PASS: N`

- [ ] **Step 6: Raise the index baseline, run the suite, check it in a browser, commit**

Run `node js/page-weight.test.js`, set `'index.html':` to the measured value (the comment from Task 4 already covers it), and run it again until it passes. Run the suite from *Running the tests*.

Serve on port 8765 and open the page. Scroll through the story:
- the stage pins;
- each scene fades in and out;
- the line inks and its dot rides the tip;
- the sky moves from dawn to night only between scenes;
- the rail marks the current scene and the pill's label changes;
- scrolling back scrubs every act backward.

```bash
git add js/walk-story.js css/walk-story.css index.html js/walk-story-markup.test.js js/page-weight.test.js
git commit -F - <<'EOF'
feat(walk-story): pin the stage — one walk, eased, dawn to night

The stage pins for 12.6 screens and the nine scenes play in it. Scroll
sets a target and one rAF loop eases toward it, frame-time scaled so a
120Hz Mac and a 60Hz phone glide alike. Per frame it writes only --hold
on scenes whose hold changed, opacities, and dot transforms; the only
layout read is measure(), and height-only resizes (Safari's toolbar)
are ignored. Every act is CSS over --hold, so every reveal scrubs both
ways. Rail dots carry aria-current, the pill leaves at scene 9, and
focus inside any scene brings it on stage.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: The cairn demo, the clearing and the page walker

**Files:**
- Modify: `js/traces-cairn.js` (lines 270–285, and the module end)
- Modify: `js/clearing.js` (the header comment and line 18)
- Modify: `js/clearing-core.js` (`ZONES`, lines 89–97)
- Modify: `js/clearing-core.test.js`, `js/clearing-wiring.test.js`
- Modify: `js/main.js` (`initScrollTracker`, and `onScrollOrResize` in `initPageWalker`)
- Modify: `css/styles.css` (the rest rule)
- Modify: `js/walk-story-markup.test.js` (the integration checks)

**Interfaces:**
- Produces `window.TracesCairn = { demo }`, which `js/walk-story.js` calls when scene 06's hold begins.
- The clearing's door is `[data-seek-door]`.
- `body.walk-story-pinned` rests the walker and the tracker.

- [ ] **Step 1: Write the failing checks**

In `js/clearing-core.test.js`, after the existing ZONES checks, add:

```js
ok(C.ZONES.every(function (z) { return ['.journey.section', '.privacy-section'].indexOf(z.selector) === -1; }),
  'no zone points at a section the walk story absorbed');
ok(C.ZONES.some(function (z) { return z.selector === '.reliquary.section'; }),
  'the Reliquary, now first below the story, is a zone');
```

In `js/clearing-wiring.test.js`, before the final `console.log('\n---');`, add:

```js
console.log('\n=== zones and the door ===\n');

const bodyHtml = html.slice(html.indexOf('<body'));
const classLists = Array.from(bodyHtml.matchAll(/\sclass="([^"]*)"/g)).map(function (m) { return m[1].split(/\s+/); });
core.ZONES.forEach(function (z) {
  const want = z.selector.split('.').filter(Boolean);
  const n = classLists.filter(function (cl) { return want.every(function (c) { return cl.indexOf(c) !== -1; }); }).length;
  ok(n === 1, z.selector + ' matches exactly one element  (' + n + ')');
});
ok((bodyHtml.match(/\sdata-seek-door[\s>]/g) || []).length === 1, 'exactly one element is the seek door');
const clearingSrc = fs.readFileSync(path.join(ROOT, 'js', 'clearing.js'), 'utf8');
ok(clearingSrc.indexOf("querySelector('[data-seek-door]')") !== -1,
  'clearing.js finds the door by data-seek-door, not the retired .seek-door section');
```

In `js/walk-story-markup.test.js`, before the final summary, add:

```js
console.log('\n=== the story\'s neighbours ===\n');

const cairnSrc = fs.readFileSync(path.join(ROOT, 'js', 'traces-cairn.js'), 'utf8');
ok(/window\.TracesCairn\s*=\s*\{\s*demo:\s*demo\s*\}/.test(cairnSrc), 'traces-cairn.js exposes TracesCairn.demo()');
ok(cairnSrc.indexOf("closest('.walk-story--pinned')") !== -1,
  'the cairn\'s own observer stands down inside the pinned story, where it would fire unseen');
const mainSrc = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
eq((mainSrc.match(/classList\.contains\('walk-story-pinned'\)/g) || []).length, 2,
  'the scroll tracker and the page walker both rest while the story is pinned');
const stylesCss = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
ok(/body\.walk-story-pinned \.page-walker,\s*body\.walk-story-pinned \.scroll-tracker\s*\{[^}]*opacity:\s*0/.test(stylesCss),
  'the walker and the tracker fade while the ink line is the companion');
```

Run `node js/clearing-core.test.js`, `node js/clearing-wiring.test.js` and `node js/walk-story-markup.test.js`.
Expected: each FAILs on the new checks.

- [ ] **Step 2: The cairn's demo**

In `js/traces-cairn.js`, replace the block that starts at the comment `// Demonstrate the verb: one stone settles on its own the first time` and ends with `io.observe(els.stack);\n    }` with:

```js
    // Demonstrate the verb: one stone settles on its own the first time
    // the section comes into view. Silent — there is no user gesture, so
    // there is no sound, and an unprompted noise would be the wrong kind
    // of surprise anyway. It counts as stone 1, which is why the
    // counter's rule is "with the first stone" and not "after the first
    // click": there is no separate demonstration state to reason about.
    // Inside the pinned walk story the cairn sits in a sticky stage and
    // is "in view" from the story's first scene while invisible, so
    // there the story calls TracesCairn.demo() when scene 06 is on stage.
    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (entries) {
        if (demoShown || !entries[0].isIntersecting) return;
        if (els.stack.closest('.walk-story--pinned')) return;
        io.disconnect();
        demo();
      }, { threshold: 0.6 });
      io.observe(els.stack);
    }
```

Directly above `function initCairn() {`, add:

```js
  var demoShown = false;

  function demo() {
    if (demoShown || !els.stack) return;
    demoShown = true;
    setTimeout(function () { animatePlacement(placeStone()); }, 600);
  }
```

Directly above the final `if (document.readyState === 'loading') {`, add:

```js
  window.TracesCairn = { demo: demo };
```

- [ ] **Step 3: The clearing's door and zones**

In `js/clearing.js`, replace lines 3–5 of the header comment:

```js
 * One calm spot below the seek door holds a denser patch of fog,
 * placed fresh each visit. Step through the door (scroll past it)
 * and the door's crescent rides the viewport, leaning toward the
```

with:

```js
 * One calm spot below the walk story holds a denser patch of fog,
 * placed fresh each visit. The door is scene 05's form, inside the
 * story's sticky stage, so it leaves the viewport only when the story
 * ends: then the crescent rides the viewport, leaning toward the
```

and replace `var door = document.querySelector('.seek-door');` with:

```js
  var door = document.querySelector('[data-seek-door]');
```

In `js/clearing-core.js`, replace the `ZONES` array with:

```js
  var ZONES = [
    { selector: '.reliquary.section', side: 'left', topPct: 30 },
    { selector: '.seasons.section', side: 'left', topPct: 80 },
    { selector: '.haiku.section', side: 'right', topPct: 40 },
    { selector: '.goshuin-section', side: 'left', topPct: 60 },
    { selector: '.soundscape-section', side: 'right', topPct: 60 },
    { selector: '.story.section', side: 'right', topPct: 50 }
  ];
```

- [ ] **Step 4: The walker and the tracker rest**

In `js/main.js`'s `initScrollTracker`, make this the first statement inside the scroll listener:

```js
      if (document.body.classList.contains('walk-story-pinned')) return;
```

In `initPageWalker`'s `onScrollOrResize`, make this its first statement:

```js
      // The walk story's ink line is the companion while it is pinned.
      if (document.body.classList.contains('walk-story-pinned')) return;
```

Append to `css/styles.css`:

```css
/* The walk story's ink line is the page's companion while it is pinned;
   the walker and the distance counter rest until it ends. js/walk-story.js
   sets the class, and js/main.js skips their updates under it. */
body.walk-story-pinned .page-walker,
body.walk-story-pinned .scroll-tracker {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s ease;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node js/clearing-core.test.js && node js/clearing-wiring.test.js && node js/walk-story-markup.test.js`
Expected: all three print `ALL PASS`.

- [ ] **Step 6: Run the suite, check it in a browser, commit**

Run the suite from *Running the tests* and `node js/page-weight.test.js`; raise baselines only if a page's weight moved, and only for those pages.

In the browser:
- **the cairn:** one stone settles when scene 06 takes the stage, not earlier;
- **walker and tracker:** the page walker and "~N m walked" fade out through the story and return after it;
- **the clearing:** below the story, one fog patch appears; the crescent rides only after the story ends, and stillness reveals it.

```bash
git add js/traces-cairn.js js/clearing.js js/clearing-core.js js/clearing-core.test.js js/clearing-wiring.test.js js/main.js css/styles.css js/walk-story-markup.test.js js/page-weight.test.js
git commit -F - <<'EOF'
feat(walk-story): the cairn, the clearing and the walker make room

The cairn's demo stone waits for scene 06 instead of firing unseen from
the sticky stage; the story calls TracesCairn.demo(). The hidden
clearing's door is scene 05's form, keyed by data-seek-door, so its
crescent rides only after the story ends, and its zones follow the new
page — each now asserted to match exactly one element. The page walker
and the distance counter rest while the ink line is the companion.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Honest copy and metadata

**Files:**
- Modify: `index.html` (JSON-LD `description` at line 60, the `featureList` at lines 79–99, the FAQ answers at lines 153 and 185, and the Reliquary's copy)
- Modify: `llms.txt` (lines 3–6, the Core features section, the Privacy posture section at lines 45–54, the open-pilgrimages line, and line 96)
- Modify: `js/walk-story-markup.test.js`

- [ ] **Step 1: Write the failing checks**

In `js/walk-story-markup.test.js`, before the final summary, add:

```js
console.log('\n=== the page claims only what the policy says ===\n');

const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
[/no cloud/i, /no telemetry/i, /no user id/i, /never uploaded/i, /Nothing is uploaded to any server/, /All data stays on your phone/].forEach(function (re) {
  ok(!re.test(html), 'index.html no longer says ' + re);
  ok(!re.test(llms), 'llms.txt no longer says ' + re);
});
ok(/Honor/.test(html.slice(html.indexOf('"featureList"'), html.indexOf('"screenshot"'))), 'the feature list names Honor');
ok(/data ODbL/.test(llms), 'llms.txt gives the dataset\'s real data licence');
```

Run: `node js/walk-story-markup.test.js`. Expected: FAIL on the new checks.

- [ ] **Step 2: `index.html`'s JSON-LD**

Replace the `description` value (line 60) with:

```
Privacy-first walking and meditation companion for iPhone, iPad, and Android. Record voice notes transcribed on-device, meditate with guided prompts and ambient soundscapes, seek places hidden in fog and revealed by stillness, earn digital goshuin seals, and on iPhone walk in someone else's steps along the Camino, the Kumano Kodō and Shikoku's 88 temples. Anonymous, no accounts, walks stored on your device. Open source and free forever.
```

In `featureList`:
- Replace the Walk Reliquary entry with `"Walk Reliquary — pin photos from your walk to the route map with a ritual long-press gesture, fully opt-in; photos stay in your library and upload only when you share a walk interactively"`.
- Directly after it, insert:

```
      "Three ways to walk — Wander with no aim, Seek places hidden in fog and revealed by stillness, and Honor a path someone else laid down (iPhone)",
      "Honor pilgrimage stages from the open open-pilgrimages dataset — the Camino de Santiago, the Kumano Kodō and Shikoku's 88 temples (iPhone)",
      "Offline maps for saved pilgrimage stages (iPhone)",
      "Walk with me — share a walk as a living page, with voices at the places they were spoken",
      "Themes across walks — the words you return to, offered back as intentions",
```

- Replace `"No cloud storage — all data on-device",` with `"No accounts; walks stored on the device",`, and `"No analytics or telemetry",` with `"No analytics or advertising SDKs",`.

Replace the FAQ answer at line 153 with:

```
Pilgrim is a privacy-first walking and meditation companion for iPhone, iPad, and Android. It is anonymous: there are no accounts and no analytics or advertising SDKs, and your walks are stored on your device. Voice transcription runs entirely on-device (WhisperKit on iOS, whisper.cpp on Android). What you choose to share travels, and the privacy policy lists exactly what. It is open source (GPLv3) and free forever.
```

Replace the FAQ answer at line 185 with:

```
Pilgrim lets you record voice notes during walks and transcribes them entirely on-device using OpenAI's Whisper model (WhisperKit on iOS, whisper.cpp on Android). No audio is sent anywhere to be transcribed. Your recordings and transcriptions stay on your phone unless you choose to share a walk.
```

In the Reliquary section's paragraph, replace `gathered passively from your photo library, never copied, never uploaded.` with `gathered passively from your photo library, never copied; a photo leaves your phone only if you share the walk interactively.`

- [ ] **Step 3: `llms.txt`**

Replace the summary blockquote (lines 3–6) with:

```
> Pilgrim is a privacy-first iPhone, iPad, and Android app for intentional
> walking as creative practice. Anonymous: no accounts, no analytics, walks
> stored on the device. Voice notes transcribed on-device. Walking
> meditation, ambient soundscapes, goshuin seals. Open source under GPLv3,
> no paywall.
```

In `## Core features`, after the Walk Reliquary bullet, add:

```
- **Three ways to walk** — Wander with no aim; Seek places hidden in fog,
  revealed by stillness; Honor a path someone else laid down (iPhone): a
  walk a friend shared, one of your own again, or a stage of the Camino,
  the Kumano Kodō or Shikoku's 88 temples from the open-pilgrimages
  dataset, with offline maps.
- **Walk with me** — share a walk as a living page: your voice at the
  places you spoke, photos where you took them.
- **Themes across walks** — the words you return to, offered back as
  intentions.
```

Replace the four lines under `## Privacy posture` that begin `- No accounts.`, `- No analytics.`, `- No cloud.` and `- Voice transcription:` with:

```
- Anonymous. No accounts, no login, nothing that says who you are.
- No analytics or advertising SDKs.
- Walks, recordings and transcriptions are stored on the phone.
- Voice transcription: 100% on-device (WhisperKit on iOS, whisper.cpp on Android). No audio is sent anywhere to be transcribed.
- A few features use the network (nearby whispers and cairns, weather, maps, sharing); the privacy policy lists each one: <https://pilgrimapp.org/privacy>
```

Replace `MIT data license.` on the open-pilgrimages line with `Code MIT, data ODbL.`, and replace `- Privacy (no accounts, no cloud, no telemetry)` with `- Privacy (anonymous, no accounts, walks on your device)`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node js/walk-story-markup.test.js`. Expected: `ALL PASS`. The pre-commit hook validates the JSON-LD when you commit.

- [ ] **Step 5: Raise the index baseline if it moved, run the suite, commit**

```bash
git add index.html llms.txt js/walk-story-markup.test.js js/page-weight.test.js
git commit -F - <<'EOF'
fix(copy): the page and llms.txt claim only what the policy says

"No cloud", "no telemetry", "no user ID", "never uploaded", "nothing is
uploaded to any server" and "all data stays on your phone" were each
contradicted by the rewritten privacy policy (PR #25). They now say
what is true — anonymous, no accounts, walks on the device, what you
choose to share travels — and the feature list and llms.txt name Seek,
Honor, the pilgrimage stages, offline maps, Walk with me and themes
across walks. The dataset's data licence is ODbL, not MIT.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Browser verification, the frame budget, and the PR

No code changes unless verification finds a defect. If it does, fix it test-first in the task that owns the file, commit, and re-run this task from the top.

**Tools:** Chrome DevTools MCP (`new_page`, `navigate_page`, `resize_page`, `emulate`, `evaluate_script`, `take_screenshot`, `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`).

- [ ] **Step 1: Serve the worktree**

Run: `python3 -m http.server 8765` from the repo root, in the background. Then open `http://localhost:8765/` with `new_page`.

- [ ] **Step 2: The frame budget, in light, dark and star modes**

For each theme:
1. Set the theme in the page with `evaluate_script`. For light: `document.documentElement.removeAttribute('data-theme'); document.body.classList.remove('constellation')`. For dark: `document.documentElement.setAttribute('data-theme','dark')`. For star: dark, plus `document.body.classList.add('constellation')`.
2. At 1440×900 (`resize_page`), throttle the CPU 4× with `emulate`.
3. Run `performance_start_trace`, then scroll the whole story in `evaluate_script`:

   ```js
   async () => {
     const s = document.querySelector('.walk-story');
     const top = s.getBoundingClientRect().top + scrollY;
     const end = top + s.offsetHeight;
     for (let y = top - 200; y <= end; y += 40) {
       scrollTo(0, y);
       await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
     }
   }
   ```

4. Run `performance_stop_trace` and `performance_analyze_insight`.

**Pass:** no long task over 50 ms and no frame over 32 ms after the first paint. Record the numbers for each theme.

- [ ] **Step 3: The screenshot matrix**

For every scene, at 1440×900 and 390×844, in light, dark and star modes:
1. Scroll to the middle of its hold: `scrollTo(0, top + ((i + 0.5) / 9) * (s.offsetHeight - innerHeight))`.
2. Wait about 1 s for the easing to settle.
3. Take a screenshot.

Open underdog.ai at the same sizes and set the two side by side. Fix anything that reads unfinished beside it:
- overlaps (the phone over a Honor label, the pill over text);
- cramped copy;
- a line under text;
- a moon over the kicker.

- [ ] **Step 4: Phones against the app**

Set each phone frame beside the same screen from the app's demo mode. Use `docs/screenshots/` in pilgrim-ios, or the ScreenshotTests capture. Every string must match. The markup test already asserts they are the app's; this step checks they look like it too.

- [ ] **Step 5: Stacked, reduced motion and keyboard**

1. **No JS:** `navigate_page` with an `initScript` of `Object.defineProperty(window, 'WalkStoryCore', { value: undefined, writable: false });`.
   **Expected:** nine stacked, finished scenes, each on its own sky.
2. **Reduced motion:** use `initScript` `const m = matchMedia; window.matchMedia = q => q.includes('prefers-reduced-motion') ? { matches: true, addListener(){}, removeListener(){} } : m(q);`.
   **Expected:** the same stacked story, and the video plays only on a tap.
3. **Keyboard:** reload normally and Tab through the story.
   **Expected:** the skip link appears on focus; the rail dots announce "Scene N of 9: Name"; focusing the seek input or the cairn brings its scene on stage; the pill leaves the tab order at scene 9.
4. **The clearing:** scroll below the story.
   **Expected:** one fog patch; the crescent rides only after the story ends; stillness reveals it.

- [ ] **Step 6: Run the whole suite one last time**

Run the suite from *Running the tests*. Expected: only `scripts/bake-collective-routes.test.js` fails, as it does on `main`.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feat/one-walk-story
gh pr create --repo walktalkmeditate/pilgrim-landing --base main --head feat/one-walk-story \
  --title "feat: one walk, told by scroll" --body-file - <<'EOF'
The middle of the home page becomes one walk, told by scrolling: nine scenes from dawn to night on a pinned stage, carried by an ink line. Wander, Honor and Seek all live inside it. Reference: underdog.ai.

Spec: docs/superpowers/specs/2026-09-24-one-walk-story-design.md · Plan: docs/superpowers/plans/2026-09-25-one-walk-story.md

## Merge order
**Merge after pilgrim-landing #25** (the privacy policy), which itself waits on pilgrim-worker #45 being deployed. Scene 09 links to /privacy.

## Decisions beyond the spec
1. **Skies are per scene.** They blend only in the crossfades between scenes, because text colour can't change mid-read without dropping below AA.
2. **Inactive scenes are hidden with `opacity: 0` and `pointer-events: none`,** not `visibility: hidden`, so screen readers still reach them. The focus rule keeps focus out of faded scenes.
3. **Scene 02's transcript is a caption on the page.** The app transcribes after the walk, and the same words appear on scene 07's summary.
4. **Every reveal scrubs both ways,** including scene 08's share route.

## Frame budget (Chrome, 4× CPU throttle, 1440×900)
<light / dark / star: longest task, worst frame — from Task 8 Step 2>

## Verified
- Screenshot matrix: 9 scenes × 2 sizes × light/dark/star, against underdog.ai
- Phone frames against the app's demo-mode screens
- No-JS, reduced-motion and keyboard walkthroughs
- The hidden clearing still appears
- All tests pass except `scripts/bake-collective-routes.test.js`, which needs a sibling `../open-pilgrimages` and fails the same way on main

## Still to do by hand
On a real iPhone: confirm the pinned stage doesn't jolt when Safari's toolbar collapses.

## After launch
The spec measures the story on installs. In umami, compare `click-app-store` and `click-google-play` per visit over the four weeks before and after launch, alongside the new `story-reach-end` event. A drop sends the story's length and the skip link back for review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Fill in the frame-budget placeholder in the PR body with the numbers you measured in Step 2 before you submit it.

- [ ] **Step 8: Hand-off**

Report to the user:
- the PR link;
- the frame-budget numbers;
- any visual fixes made in Step 3;
- the one check left to them, the real-iPhone toolbar test;
- the merge order: after #25.
