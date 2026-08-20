# Traces Real Glyphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hand-coded icons in the "The path remembers" section with the app's real artwork, and make the cairn a clickable instrument that climbs seven tiers with seven rising chimes.

**Architecture:** Pure logic (tier thresholds, energy table) lives in a Node-testable UMD module, `js/traces-glyphs.js`. All DOM, animation and audio wiring lives in `js/traces-cairn.js`, an IIFE deferred from `index.html` only. Styles live in `css/traces-glyphs.css`, also `index.html` only. The seven cairn paintings are normalised to a shared ground line so an upward wipe between them reads as one pile growing.

**Tech Stack:** Vanilla ES5-style JS (no build step, no framework, no dependencies), plain CSS, SVG, HTML Audio. Tests are standalone Node scripts.

## Global Constraints

- **No new dependencies, no build step.** This repo has no `package.json`. Everything is hand-authored and served static.
- **New CSS and JS must NOT go in `css/styles.css` or `js/main.js`.** `styles.css` is loaded by 10 pages and `main.js` by 8, including `/daylight` (112.48 KB) and `/sunpath` (governed by the stricter fixed-budget `js/sunpath-budget.test.js`). Adding to either grows every one of those pages. Use `css/traces-glyphs.css` and `js/traces-cairn.js`, referenced only from `index.html`.
- **Code style:** ES5 syntax (`var`, `function`), `'use strict'`, IIFE-wrapped, matching `js/reliquary.js` and `js/collective-routes.js`. No arrow functions, no `const`/`let`, no template literals in shipped JS. Test files may use `const`.
- **Test style:** standalone Node scripts run as `node js/<name>.test.js`, with the repo's `ok(cond, label)` helper, a header comment explaining *why* the test exists, and `process.exit(failed ? 1 : 0)`. Model on `js/collective-routes.test.js`.
- **Tier thresholds** (from `CairnTier.from(stoneCount:)`): faint 0, small 3, medium 7, large 12, great 42, sacred 77, eternal 108.
- **Sound tiers** (from `CairnTier.soundTier`): 1:1 with tier index — faint=1 … eternal=7.
- **The seven energies, in the copy's order** (`index.html:1139`), not the `WhisperCategory` enum order: presence `#1C3B4A`, wonder `#A8B8BF`, gratitude `#C7A14F`, compassion `#A8D9D1`, courage `#C7B887`, lightness `#C2A68C`, stillness `#B8946B`. The eighth energy `play` is deliberately excluded.
- **Do not touch the footer cairn** — `.page-cairn`, `js/main.js:404-780`. Its art, mechanism and copy stay exactly as they are.
- **Section cairn state is in-memory only.** No `localStorage`. Reload resets to faint.
- **Every animation ships with its `prefers-reduced-motion: reduce` counterpart in the same task.**
- **Spec:** `docs/superpowers/specs/2026-08-20-traces-real-glyphs-design.md`

## File Structure

| File | Responsibility |
|---|---|
| `assets/traces/whisper.svg` | The wisp glyph, `fill="currentColor"` |
| `assets/traces/cairn-{faint,small,medium,large,great,sacred,eternal}.svg` | Seven tier paintings, normalised to one viewBox and ground line |
| `js/traces-glyphs.js` | Pure logic: tier table, sound tier, energy table. UMD, Node-testable. No DOM. |
| `js/traces-cairn.js` | DOM/animation/audio wiring. IIFE. Deferred from `index.html`. |
| `css/traces-glyphs.css` | All styles for both glyphs, including reduced-motion. |
| `scripts/normalize-cairns.html` | Visual harness that overlays all seven cairns for tuning the ground line |
| `js/traces-glyphs.test.js` | Parity with the Swift tables |
| `js/traces-svg.test.js` | All seven SVGs share one viewBox; assets resolve |
| `js/traces-motion.test.js` | Every animated selector has a reduced-motion counterpart |

**Prerequisite outside this plan:** the seven chimes must be uploaded to `https://cdn.pilgrimapp.org/audio/stone/stone-tier-N.m4a`. Task 7 is blocked until they are reachable.

---

### Task 1: Normalise the seven cairn paintings to one ground line

The seven source viewBoxes disagree — `cairn-faint` is `0 -40.65 144 144`, `cairn-sacred` is `-45.05 0 246 246`. If the bases don't coincide, the pile jumps between tiers and the upward wipe in Task 6 reads as a glitch. Nothing downstream works until this is right.

**Files:**
- Create: `assets/traces/cairn-faint.svg` … `assets/traces/cairn-eternal.svg` (7 files)
- Create: `assets/traces/whisper.svg`
- Create: `scripts/normalize-cairns.html`
- Test: `js/traces-svg.test.js`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: eight SVG files under `assets/traces/`. Every cairn file has `viewBox="0 0 150 150"` and wraps its content in a single `<g class="cairn-art" transform="...">`. `whisper.svg` has `viewBox="0 0 150 150"` and every `fill` attribute set to `currentColor`.

- [ ] **Step 1: Copy the sources in**

```bash
mkdir -p assets/traces
IOS="/Users/rubberduck/GitHub/momentmaker/pilgrim-ios/Pilgrim/Support Files/Assets.xcassets/glyphs"
for t in faint small medium large great sacred eternal; do
  cp "$IOS/cairn-$t.imageset/cairn-$t.svg" "assets/traces/cairn-$t.svg"
done
cp "$IOS/whisperWisp.imageset/whisper.svg" assets/traces/whisper.svg
ls -l assets/traces/
```

Expected: 8 files.

- [ ] **Step 2: Make the wisp inherit page ink**

In `assets/traces/whisper.svg`, replace every `fill="#06090E"` with `fill="currentColor"`. There are 4 occurrences.

```bash
sed -i '' 's/fill="#06090E"/fill="currentColor"/g' assets/traces/whisper.svg
grep -c 'currentColor' assets/traces/whisper.svg
```

Expected: `4`

- [ ] **Step 3: Write the failing test**

Create `js/traces-svg.test.js`:

```js
/* =============================================
   Traces glyph SVGs — one viewBox, one ground line

   Run via:  node js/traces-svg.test.js

   The seven cairn paintings ship from iOS with viewBoxes that disagree —
   cairn-faint is "0 -40.65 144 144", cairn-sacred is "-45.05 0 246 246".
   Rendered as-is into the same box they are different sizes sitting at
   different heights, so the upward wipe that reveals one tier beneath the
   next (see the design doc) reads as a glitch rather than as a pile that
   grew.

   Node cannot rasterise SVG, so this cannot prove the bases visually
   coincide. It proves the two things that are checkable as text: every
   file declares the same viewBox, and every file routes its artwork
   through a single transform group that a human tuned in
   scripts/normalize-cairns.html. The visual half is that harness.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'traces');
const TIERS = ['faint', 'small', 'medium', 'large', 'great', 'sacred', 'eternal'];
const VIEWBOX = '0 0 150 150';

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

console.log('\n=== every cairn shares one viewBox ===\n');

TIERS.forEach(function (t) {
  const file = path.join(DIR, 'cairn-' + t + '.svg');
  ok(fs.existsSync(file), 'cairn-' + t + '.svg exists');
  if (!fs.existsSync(file)) return;
  const svg = fs.readFileSync(file, 'utf8');
  const m = svg.match(/viewBox="([^"]+)"/);
  ok(!!m && m[1] === VIEWBOX,
    'cairn-' + t + ' declares viewBox="' + VIEWBOX + '"'
      + (m ? ' (found "' + m[1] + '")' : ' (no viewBox at all)'));
  ok(/<g class="cairn-art" transform="[^"]+"/.test(svg),
    'cairn-' + t + ' routes its artwork through one tuned <g class="cairn-art" transform>');
});

console.log('\n=== the wisp inherits page ink ===\n');

const wisp = path.join(DIR, 'whisper.svg');
ok(fs.existsSync(wisp), 'whisper.svg exists');
if (fs.existsSync(wisp)) {
  const svg = fs.readFileSync(wisp, 'utf8');
  ok(!/fill="#[0-9A-Fa-f]{6}"/.test(svg),
    'whisper.svg has no hardcoded fill — it must inherit currentColor in both themes');
  ok(/fill="currentColor"/.test(svg), 'whisper.svg fills with currentColor');
}

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `node js/traces-svg.test.js`
Expected: FAIL — the viewBox and `<g class="cairn-art">` assertions fail for all seven (the wisp assertions already pass from Step 2).

- [ ] **Step 5: Build the tuning harness**

Create `scripts/normalize-cairns.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cairn ground-line tuning</title>
<style>
  body { background: #F5F0E8; font: 14px/1.5 -apple-system, sans-serif; padding: 2rem; }
  .stack { position: relative; width: 300px; height: 300px; border: 1px solid #B8AFA2; }
  .stack img { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.5; }
  .ground { position: absolute; left: 0; right: 0; top: 84%; border-top: 1px dashed #A0634B; }
  .row { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 2rem; }
  .row figure { margin: 0; text-align: center; }
  .row img { width: 96px; height: 96px; display: block; }
  .row figcaption { font-size: 12px; color: #8B7355; }
</style>
</head>
<body>
<h1>All seven overlaid — the bases must coincide on the dashed line</h1>
<div class="stack" id="stack"><div class="ground"></div></div>

<h2>Each at the shipping size (96px)</h2>
<div class="row" id="row"></div>

<script>
  var TIERS = ['faint','small','medium','large','great','sacred','eternal'];
  var stack = document.getElementById('stack');
  var row = document.getElementById('row');
  TIERS.forEach(function (t) {
    var img = document.createElement('img');
    img.src = '../assets/traces/cairn-' + t + '.svg';
    stack.appendChild(img);

    var fig = document.createElement('figure');
    var i2 = document.createElement('img');
    i2.src = img.src;
    var cap = document.createElement('figcaption');
    cap.textContent = t;
    fig.appendChild(i2); fig.appendChild(cap);
    row.appendChild(fig);
  });
</script>
</body>
</html>
```

- [ ] **Step 6: Normalise each of the seven**

For each `assets/traces/cairn-<tier>.svg`:

1. Change the root element's `viewBox` to `0 0 150 150`. Leave `xmlns` alone.
2. Wrap **all** drawing content (every `<path>`, `<ellipse>`, `<radialGradient>` **user**, but not `<defs>`/`<radialGradient>` definitions themselves) in a single group immediately inside the root:

```xml
<g class="cairn-art" transform="translate(0 0) scale(1)">
  <!-- existing paths unchanged -->
</g>
```

3. Open `scripts/normalize-cairns.html` in a browser and tune each group's `translate(x y) scale(s)` until every pile's base sits on the dashed ground line and the pile widths look like one object growing.

Starting values, derived from the source viewBoxes (these are a starting point to tune from, not final):

| Tier | Source viewBox | Starting transform |
|---|---|---|
| faint | `0 -40.65 144 144` | `translate(3 43) scale(1.02)` |
| small | `-2.55 0 150 150` | `translate(2.55 0) scale(1)` |
| medium | `0 0 150 150` | `translate(0 0) scale(1)` |
| large | `0 0 150 150` | `translate(0 0) scale(1)` |
| great | `0 0 150 150` | `translate(0 0) scale(1)` |
| sacred | `-45.05 0 246 246` | `translate(45.05 0) scale(0.61)` |
| eternal | `0 0 150 150` | `translate(0 0) scale(1)` |

The `sacred` and `eternal` glows extend past the pile — that is expected and correct; align the **stone bases**, not the glow bounds.

- [ ] **Step 7: Run the test to verify it passes**

Run: `node js/traces-svg.test.js`
Expected: PASS — `all green`, 23 assertions.

- [ ] **Step 8: Verify the visual half by eye**

Open `scripts/normalize-cairns.html`. In the overlay, all seven bases sit on the dashed line. In the row below, the seven read as one pile at increasing sizes, not seven unrelated drawings.

This step has no automated gate. It is the actual deliverable of the task; the test only guards the text.

- [ ] **Step 9: Minify**

```bash
npx --yes svgo --multipass -f assets/traces
ls -l assets/traces/
node js/traces-svg.test.js
```

Expected: files shrink (`cairn-great.svg` should drop well below its 20 KB source), test still green. If SVGO strips `class="cairn-art"`, re-run with `--disable=cleanupIds --disable=removeUselessDefs` and re-check.

- [ ] **Step 10: Commit**

```bash
git add assets/traces scripts/normalize-cairns.html js/traces-svg.test.js
git commit -m "feat(traces): the seven cairns, normalised to one ground line

The tier paintings ship from iOS with viewBoxes that disagree — faint is
0 -40.65 144 144, sacred is -45.05 0 246 246. Dropped into one box they
are different sizes at different heights, so revealing one beneath the
next reads as a glitch instead of a pile that grew.

Each is now re-anchored through a single tuned transform group inside a
shared 0 0 150 150 viewBox. scripts/normalize-cairns.html overlays all
seven against a ground line, which is how the numbers were found and how
they should be re-checked if the art is ever replaced."
```

---

### Task 2: The pure logic module

**Files:**
- Create: `js/traces-glyphs.js`
- Test: `js/traces-glyphs.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `window.TracesGlyphs` / `module.exports` with:
  - `TIERS` — array of `{ name: string, min: number, sound: number }`, ascending
  - `ENERGIES` — array of `{ name: string, hex: string }`, seven long, in copy order
  - `tierFor(stones: number) -> {name, min, sound}`
  - `tierNameFor(stones: number) -> string`
  - `soundTierFor(stones: number) -> number` (1–7)
  - `energyAt(breathIndex: number) -> {name, hex}` (wraps, handles negatives)

- [ ] **Step 1: Write the failing test**

Create `js/traces-glyphs.test.js`:

```js
/* =============================================
   Traces glyphs — parity with the iOS tables

   Run via:  node js/traces-glyphs.test.js

   Two tables are ported here from Swift, and both have a history of
   forking silently when copied by hand:

     CairnTier.from(stoneCount:)  — the seven thresholds
     CairnTier.soundTier          — which chime a stone count plays
     WhisperDefinition.borderColor — the energy colours

   iOS guards the first two by routing every consumer through one
   derivation (the comment on CairnTier.soundTier says so explicitly:
   "so the threshold table cannot silently fork again"). This is the
   web side of that guard.

   The energy ORDER here is deliberately NOT the WhisperCategory enum
   order. The glyph cycles in the order the copy beside it lists them
   (index.html: "presence, wonder, gratitude, compassion, courage,
   lightness, stillness") so the icon reads in step with the sentence.
   The enum's eighth case, `play`, is excluded on purpose — it is an
   eighth energy and the copy promises seven.
   ============================================= */

'use strict';

const G = require('./traces-glyphs.js');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}

console.log('\n=== tier thresholds (CairnTier.from(stoneCount:)) ===\n');

// Every boundary, and one on each side of it.
const BOUNDARIES = [
  [0, 'faint'], [1, 'faint'], [2, 'faint'],
  [3, 'small'], [6, 'small'],
  [7, 'medium'], [11, 'medium'],
  [12, 'large'], [41, 'large'],
  [42, 'great'], [76, 'great'],
  [77, 'sacred'], [107, 'sacred'],
  [108, 'eternal'], [500, 'eternal']
];
BOUNDARIES.forEach(function (pair) {
  eq(G.tierNameFor(pair[0]), pair[1], pair[0] + ' stones is ' + pair[1]);
});

console.log('\n=== sound tiers (CairnTier.soundTier) ===\n');

eq(G.soundTierFor(0), 1, 'faint plays stone-tier-1');
eq(G.soundTierFor(3), 2, 'small plays stone-tier-2');
eq(G.soundTierFor(7), 3, 'medium plays stone-tier-3');
eq(G.soundTierFor(12), 4, 'large plays stone-tier-4');
eq(G.soundTierFor(42), 5, 'great plays stone-tier-5');
eq(G.soundTierFor(77), 6, 'sacred plays stone-tier-6');
eq(G.soundTierFor(108), 7, 'eternal plays stone-tier-7');

// The chime must RISE with the tier. If this ever inverts, the climb
// stops being an instrument and becomes a button that makes noise.
let rising = true;
for (let i = 1; i < G.TIERS.length; i++) {
  if (G.TIERS[i].sound <= G.TIERS[i - 1].sound) rising = false;
}
ok(rising, 'sound tier rises strictly with cairn tier');

console.log('\n=== the seven energies ===\n');

eq(G.ENERGIES.length, 7, 'there are exactly seven energies');
ok(G.ENERGIES.every(function (e) { return e.name !== 'play'; }),
  'the eighth category `play` is excluded — the copy promises seven');

const EXPECTED = [
  ['presence',   '#1C3B4A'],
  ['wonder',     '#A8B8BF'],
  ['gratitude',  '#C7A14F'],
  ['compassion', '#A8D9D1'],
  ['courage',    '#C7B887'],
  ['lightness',  '#C2A68C'],
  ['stillness',  '#B8946B']
];
EXPECTED.forEach(function (pair, i) {
  eq(G.ENERGIES[i].name, pair[0], 'energy ' + i + ' is ' + pair[0] + ' (copy order, not enum order)');
  eq(G.ENERGIES[i].hex, pair[1], pair[0] + ' is ' + pair[1]);
});

console.log('\n=== the breath cycle wraps ===\n');

eq(G.energyAt(0).name, 'presence', 'breath 0 is presence');
eq(G.energyAt(6).name, 'stillness', 'breath 6 is stillness');
eq(G.energyAt(7).name, 'presence', 'breath 7 wraps back to presence');
eq(G.energyAt(15).name, 'gratitude', 'breath 15 wraps twice to gratitude');
eq(G.energyAt(-1).name, 'stillness', 'a negative index wraps backward, not to undefined');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node js/traces-glyphs.test.js`
Expected: FAIL — `Cannot find module './traces-glyphs.js'`

- [ ] **Step 3: Write the module**

Create `js/traces-glyphs.js`:

```js
/* Traces glyph tables — the seven cairn tiers and the seven energies.
 *
 * Pure data and lookups, no DOM. Lives apart from js/traces-cairn.js so
 * the tables can be tested in Node against their Swift originals.
 *
 * Ports:
 *   CairnTier.from(stoneCount:)   — pilgrim-ios
 *   CairnTier.soundTier           — pilgrim-ios
 *   WhisperDefinition.borderColor — pilgrim-ios
 */

(function (root) {
  'use strict';

  // Ascending. tierFor() walks this and keeps the last match, so order
  // here is load-bearing.
  var TIERS = [
    { name: 'faint',   min: 0,   sound: 1 },
    { name: 'small',   min: 3,   sound: 2 },
    { name: 'medium',  min: 7,   sound: 3 },
    { name: 'large',   min: 12,  sound: 4 },
    { name: 'great',   min: 42,  sound: 5 },
    { name: 'sacred',  min: 77,  sound: 6 },
    { name: 'eternal', min: 108, sound: 7 }
  ];

  // The order the copy in index.html lists them in, NOT the
  // WhisperCategory enum order — the glyph cycles in step with the
  // sentence beside it. `play` is excluded: it is an eighth energy and
  // the copy promises seven.
  var ENERGIES = [
    { name: 'presence',   hex: '#1C3B4A' },
    { name: 'wonder',     hex: '#A8B8BF' },
    { name: 'gratitude',  hex: '#C7A14F' },
    { name: 'compassion', hex: '#A8D9D1' },
    { name: 'courage',    hex: '#C7B887' },
    { name: 'lightness',  hex: '#C2A68C' },
    { name: 'stillness',  hex: '#B8946B' }
  ];

  function tierFor(stones) {
    var found = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) {
      if (stones >= TIERS[i].min) found = TIERS[i];
    }
    return found;
  }

  function tierNameFor(stones) { return tierFor(stones).name; }
  function soundTierFor(stones) { return tierFor(stones).sound; }

  function energyAt(breathIndex) {
    var n = ENERGIES.length;
    return ENERGIES[((breathIndex % n) + n) % n];
  }

  var api = {
    TIERS: TIERS,
    ENERGIES: ENERGIES,
    tierFor: tierFor,
    tierNameFor: tierNameFor,
    soundTierFor: soundTierFor,
    energyAt: energyAt
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TracesGlyphs = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node js/traces-glyphs.test.js`
Expected: PASS — `all green`, 45 assertions.

- [ ] **Step 5: Commit**

```bash
git add js/traces-glyphs.js js/traces-glyphs.test.js
git commit -m "feat(traces): port the tier and energy tables, with parity tests

Two tables copied by hand from Swift, both of which iOS explicitly
guards against forking (see the comment on CairnTier.soundTier). This
is the web side of that guard: every threshold boundary is asserted
with a value on each side of it, and the chime is asserted to rise
strictly with the tier — if that ever inverts, the climb stops being
an instrument.

The energy order is the copy's order, not the enum's, so the glyph
cycles in step with the sentence beside it. The eighth category, play,
is excluded and the test says why."
```

---

### Task 3: The wisp and its energy aura

**Files:**
- Modify: `index.html:1128-1137` (the whispers card icon), and the `<head>`/script tags
- Create: `css/traces-glyphs.css`
- Create: `js/traces-cairn.js`
- Test: manual, in a browser

**Interfaces:**
- Consumes: `assets/traces/whisper.svg` (Task 1), `window.TracesGlyphs.ENERGIES` and `energyAt()` (Task 2)
- Produces: `js/traces-cairn.js` exposing nothing globally; internally it owns `breathIndex` and a `currentEnergy()` accessor that Task 4 reads for stone tinting. The wisp markup is `.traces-card-icon--whispers > .wisp-aura + svg.wisp`.

- [ ] **Step 1: Replace the whispers icon markup**

In `index.html`, replace lines 1128–1137 (the `<div class="traces-card-icon traces-card-icon--whispers">` block) with:

```html
            <div class="traces-card-icon traces-card-icon--whispers" aria-hidden="true">
              <!-- The app's own wisp glyph. The energy colour breathes
                   BEHIND it as an aura rather than tinting the line —
                   the Swift property is literally named borderColor, and
                   four of the seven are near-invisible as a thin line on
                   parchment. -->
              <span class="wisp-aura" id="wisp-aura"></span>
              <img class="wisp" src="assets/traces/whisper.svg" width="40" height="40" alt="">
            </div>
```

- [ ] **Step 2: Add the stylesheet reference**

In `index.html`, immediately after the existing `css/styles.css` link, add:

```html
  <link rel="stylesheet" href="css/traces-glyphs.css">
```

- [ ] **Step 3: Add the script references**

In `index.html`, after `<script src="js/collective-routes.js"></script>` (line 1910), add:

```html
  <script src="js/traces-glyphs.js" defer></script>
  <script src="js/traces-cairn.js" defer></script>
```

- [ ] **Step 4: Write the stylesheet**

Create `css/traces-glyphs.css`:

```css
/* =============================================
   Traces glyphs — the wisp and the cairn

   Loaded by index.html ONLY. css/styles.css is loaded by ten pages
   including /daylight and /sunpath, both of which are under page-weight
   gates; this section's styles have no business growing them.
   ============================================= */

/* --- The wisp --- */

.traces-card-icon--whispers {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40px;
  height: 40px;
  margin-inline: auto;
}

/* The energy colour, as a soft halo behind the line work. Never the
   line itself — compassion, wonder, courage and lightness are all
   near-invisible as a thin stroke on parchment. */
.wisp-aura {
  position: absolute;
  inset: -14px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--wisp-energy, transparent) 0%, transparent 68%);
  opacity: 0.55;
  transition: background 5.5s linear, opacity 5.5s ease-in-out;
  pointer-events: none;
}

.wisp {
  position: relative;
  display: block;
  width: 40px;
  height: 40px;
  color: var(--rust);
  animation: wisp-breathe 5.5s ease-in-out infinite;
}

@keyframes wisp-breathe {
  0%, 100% { transform: scale(1);    opacity: 0.92; }
  50%      { transform: scale(1.04); opacity: 1;    }
}

@media (prefers-reduced-motion: reduce) {
  .wisp { animation: none; }
  .wisp-aura { transition: none; }
}
```

- [ ] **Step 5: Write the breath cycle**

Create `js/traces-cairn.js`:

```js
/* The traces section's two glyphs — the wisp and the cairn.
 *
 * Loaded by index.html only. js/main.js is loaded by eight pages
 * including two under page-weight budgets, so this lives apart.
 *
 * The two glyphs share one clock: a stone placed on the cairn takes the
 * colour of whichever energy the wisp is breathing at that moment.
 */

(function () {
  'use strict';

  var G = window.TracesGlyphs;
  if (!G) return;

  var BREATH_MS = 5500;

  var breathIndex = 0;
  var breathTimer = null;

  function currentEnergy() {
    return G.energyAt(breathIndex);
  }

  function paintAura(aura) {
    aura.style.setProperty('--wisp-energy', currentEnergy().hex);
  }

  function startBreathing(aura) {
    paintAura(aura);
    breathTimer = setInterval(function () {
      breathIndex++;
      paintAura(aura);
    }, BREATH_MS);
  }

  function stopBreathing() {
    if (breathTimer) { clearInterval(breathTimer); breathTimer = null; }
  }

  function init() {
    var aura = document.getElementById('wisp-aura');
    if (aura) startBreathing(aura);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 6: Verify in a browser**

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/#` and scroll to "The path remembers". Expected:
- The wisp renders as the app's line drawing, in rust, and inherits ink correctly when you toggle the moon theme switch.
- A soft coloured halo sits behind it and changes colour roughly every 5.5s, drifting rather than snapping.
- With "Reduce motion" enabled in macOS System Settings → Accessibility → Display, the wisp stops scaling and the halo stops transitioning.

- [ ] **Step 7: Commit**

```bash
git add index.html css/traces-glyphs.css js/traces-cairn.js
git commit -m "feat(traces): the whispers card gets the app's own wisp

Replaces a hand-coded sound-ripple glyph with the wisp the app actually
draws, and cycles the seven energies behind it once per breath on the
5.5s cadence the rest of the site already uses.

The colour is a halo, not a tint. The Swift property is named
borderColor — in the app the energy surrounds the glyph — and it is
also the only version that stays legible: four of the seven are
near-invisible as a thin line on parchment.

CSS and JS land in new index-only files. styles.css is loaded by ten
pages and main.js by eight, including /daylight and /sunpath which are
both under weight gates."
```

---

### Task 4: The cairn — art, click to place, counter

**Files:**
- Modify: `index.html:1143-1151` (the cairns card icon)
- Modify: `css/traces-glyphs.css`
- Modify: `js/traces-cairn.js`

**Interfaces:**
- Consumes: the seven `assets/traces/cairn-*.svg` (Task 1), `G.tierNameFor` / `G.tierFor` (Task 2), `currentEnergy()` (Task 3)
- Produces: internal `placeStone()` which increments `stones`, updates art and counter, and returns `{ stones, tier, energy, tierChanged }` — Tasks 5, 6, 7 and 8 all hook this return value.

- [ ] **Step 1: Replace the cairns icon markup**

In `index.html`, replace the `<div class="traces-card-icon traces-card-icon--cairns">` block (lines 1143–1151) with:

```html
            <div class="traces-card-icon traces-card-icon--cairns">
              <!-- The app's seven tier paintings. Click to place a stone;
                   thresholds are the app's own (3/7/12/42/77/108), so the
                   page does not contradict its "108 stones" copy. State is
                   in-memory: this is the demo, the footer cairn is the
                   record. -->
              <button type="button" class="cairn-stack" id="cairn-stack"
                      aria-label="Place a stone on the cairn">
                <img class="cairn-layer cairn-layer--under" id="cairn-under" src="" alt="" aria-hidden="true">
                <img class="cairn-layer cairn-layer--over"  id="cairn-over"
                     src="assets/traces/cairn-faint.svg" alt="" aria-hidden="true">
              </button>
              <p class="cairn-counter" id="cairn-counter" aria-live="polite"></p>
            </div>
```

- [ ] **Step 2: Style the cairn**

Append to `css/traces-glyphs.css`:

```css
/* --- The cairn --- */

.traces-card-icon--cairns {
  flex-direction: column;
  gap: var(--padding-xs);
}

.cairn-stack {
  position: relative;
  display: block;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.2s ease;
}

.cairn-stack:hover   { transform: translateY(-2px); }
.cairn-stack:focus-visible {
  outline: 2px solid var(--moss);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

.cairn-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.cairn-layer--under { opacity: 1; }

.cairn-counter {
  margin: 0;
  min-height: 1.2em;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--ink-fog);
  opacity: 0;
  transition: opacity 0.6s ease;
}

.cairn-counter.is-visible { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .cairn-stack, .cairn-counter { transition: none; }
}
```

- [ ] **Step 3: Wire placement**

In `js/traces-cairn.js`, add above `init()`:

```js
  // --- The cairn ---
  //
  // In-memory only. This is the demo; the footer cairn in js/main.js is
  // the record, and it is deliberately untouched.

  var stones = 0;
  var tierName = 'faint';

  var els = {};

  function artFor(name) {
    return 'assets/traces/cairn-' + name + '.svg';
  }

  function renderCounter() {
    els.counter.textContent = stones + (stones === 1 ? ' stone · ' : ' stones · ') + tierName;
    els.counter.classList.add('is-visible');
  }

  // Swaps the two layers so the outgoing art stays beneath the incoming
  // one. Task 6 animates the reveal; here it is an instant swap.
  function showTier(name) {
    els.under.src = els.over.src;
    els.over.src = artFor(name);
  }

  function placeStone() {
    stones++;
    var next = G.tierNameFor(stones);
    var tierChanged = next !== tierName;
    tierName = next;

    if (tierChanged) showTier(tierName);
    renderCounter();

    return {
      stones: stones,
      tier: tierName,
      energy: currentEnergy(),
      tierChanged: tierChanged
    };
  }

  function initCairn() {
    els.stack = document.getElementById('cairn-stack');
    els.under = document.getElementById('cairn-under');
    els.over = document.getElementById('cairn-over');
    els.counter = document.getElementById('cairn-counter');
    if (!els.stack || !els.under || !els.over || !els.counter) return;

    els.stack.addEventListener('click', function () { placeStone(); });
  }
```

Then change `init()` to:

```js
  function init() {
    var aura = document.getElementById('wisp-aura');
    if (aura) startBreathing(aura);
    initCairn();
  }
```

- [ ] **Step 4: Verify in a browser**

Reload `http://localhost:8080/`. Expected:
- The cairn renders at 96px as `cairn-faint`, no counter visible.
- Clicking once shows `1 stone · faint`.
- Clicking to 3, 7, 12 swaps the artwork and the tier name changes at each.
- The pile's base does **not** jump between tiers. If it does, Task 1 Step 6 was not tuned properly — go back.
- Keyboard: Tab to the cairn, press Enter and Space — both place a stone, and a focus ring shows.

- [ ] **Step 5: Commit**

```bash
git add index.html css/traces-glyphs.css js/traces-cairn.js
git commit -m "feat(traces): a cairn you can stack

The cairns card becomes the app's seven tier paintings on a button. One
click places one stone, at the app's own thresholds — 3, 7, 12, 42, 77,
108 — so the page does not contradict its own 'glows at 108 stones'
copy. Three tier changes land inside the first twelve clicks, then the
gaps widen, which is the point: how far 108 is becomes something felt.

The counter appears with the first stone and is load-bearing, not
decorative. Between large (12) and great (42) there are thirty clicks
with no change to the artwork, and without a readout that looks broken.

State is in-memory and resets on reload. The footer cairn stays the
record; this one is the demo."
```

---

### Task 5: The stone that lands — drop, settle, dust

Most clicks don't change the artwork, so the per-click feedback cannot be an art swap. Mass is communicated by what the *receiving* object does.

**Files:**
- Modify: `css/traces-glyphs.css`
- Modify: `js/traces-cairn.js`

**Interfaces:**
- Consumes: `placeStone()` return `{ energy, tierChanged }` (Task 4)
- Produces: `animatePlacement(result)`, called from the click handler. Adds `.is-settling` to `.cairn-stack` and appends transient `.falling-stone` / `.dust` nodes that self-remove.

- [ ] **Step 1: Add the motion**

Append to `css/traces-glyphs.css`:

```css
/* --- Placement motion --- */

/* The stone falls on a heavy-in ease and does NOT decelerate at the
   bottom. Real things arrive; they do not ease into the ground. */
.falling-stone {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 7px;
  margin-left: -6px;
  border-radius: 50%;
  background: var(--stone-energy, var(--stone));
  opacity: 0.9;
  pointer-events: none;
  animation: stone-drop 260ms cubic-bezier(.55, .06, .68, .19) forwards;
}

@keyframes stone-drop {
  0%   { transform: translateY(-24px) scale(0.9); opacity: 0; }
  25%  { opacity: 0.9; }
  100% { transform: translateY(0) scale(1); opacity: 0; }
}

/* The settle. This is the detail that carries the whole feature: the
   pile compresses on impact and springs back. */
.cairn-stack.is-settling .cairn-layer {
  animation: cairn-settle 180ms ease-out;
}

@keyframes cairn-settle {
  0%   { transform: scaleY(1);     }
  35%  { transform: scaleY(0.985); }
  100% { transform: scaleY(1);     }
}

.cairn-layer { transform-origin: 50% 88%; }

.dust {
  position: absolute;
  bottom: 12%;
  left: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--fog);
  opacity: 0;
  pointer-events: none;
  animation: dust-kick 400ms ease-out forwards;
}

@keyframes dust-kick {
  0%   { opacity: 0.55; transform: translate(0, 0) scale(1); }
  100% { opacity: 0;    transform: translate(var(--dx), 4px) scale(0.4); }
}

@media (prefers-reduced-motion: reduce) {
  .falling-stone, .dust { display: none; }
  .cairn-stack.is-settling .cairn-layer { animation: none; }
}
```

- [ ] **Step 2: Fire it on click**

In `js/traces-cairn.js`, add above `initCairn()`:

```js
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function spawn(className, styles, lifeMs) {
    var el = document.createElement('span');
    el.className = className;
    for (var k in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, k)) el.style.setProperty(k, styles[k]);
    }
    els.stack.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, lifeMs);
  }

  function animatePlacement(result) {
    if (reduceMotion) return;

    spawn('falling-stone', { '--stone-energy': result.energy.hex }, 300);

    // The settle has to restart on every click, and a class that is
    // already present will not replay the animation. Strip it, force a
    // reflow, put it back.
    els.stack.classList.remove('is-settling');
    void els.stack.offsetWidth;
    els.stack.classList.add('is-settling');

    var count = result.tierChanged ? 5 : 3;
    for (var i = 0; i < count; i++) {
      var spread = (i - (count - 1) / 2) * 7;
      spawn('dust', { '--dx': spread.toFixed(1) + 'px' }, 420);
    }
  }
```

Then change the click handler in `initCairn()` to:

```js
    els.stack.addEventListener('click', function () {
      animatePlacement(placeStone());
    });
```

- [ ] **Step 3: Verify in a browser**

Reload and click the cairn repeatedly. Expected:
- A stone visibly drops in from above and arrives hard — no float, no ease-out.
- The pile visibly compresses and springs back on each click.
- Two or three specks kick out at the base and fade.
- The falling stone's colour changes over time, following the wisp's aura.
- Rapid clicking replays the settle every time (this is what the reflow is for).
- Under reduced motion: no stone, no dust, no settle — but the counter still updates.

- [ ] **Step 4: Commit**

```bash
git add css/traces-glyphs.css js/traces-cairn.js
git commit -m "feat(traces): give the placed stone mass

Most clicks do not cross a tier, so the artwork does not change and the
feedback has to come from around it. A stone drops on a heavy-in ease
with no deceleration at the bottom — real things arrive rather than
easing into the ground — the pile compresses ~1.5% and springs back,
and a few specks of dust kick out at the base.

The settle is the load-bearing part. Mass is communicated by what the
receiving object does, never by the falling one.

The stone carries whichever energy the wisp is breathing, which is the
coupling between the two glyphs."
```

---

### Task 6: Tier change — the upward wipe

A cross-fade between two paintings reads as a slideshow. An upward reveal reads as accretion, because cairns grow upward.

**Files:**
- Modify: `css/traces-glyphs.css`
- Modify: `js/traces-cairn.js`

**Interfaces:**
- Consumes: `showTier(name)` (Task 4), `animatePlacement` (Task 5)
- Produces: `showTier` gains a wipe; `.cairn-layer--over` carries `.is-wiping` for the duration.

- [ ] **Step 1: Add the wipe**

Append to `css/traces-glyphs.css`:

```css
/* --- Tier change --- */

/* Bottom-to-top reveal, never a cross-fade. Cairns grow upward, so an
   upward wipe reads as the new pile assembling out of the ground rather
   than one image dissolving into another. That single choice is what
   makes seven unrelated paintings feel like one object that grew. */
.cairn-layer--over.is-wiping {
  animation: cairn-wipe 500ms ease-out forwards;
}

@keyframes cairn-wipe {
  0%   { clip-path: inset(100% 0 0 0); }
  100% { clip-path: inset(0 0 0 0);    }
}

/* sacred and eternal carry radial glows. They arrive LATE — the pile
   assembles first, and then it begins to shine. */
.cairn-stack.is-glowing::after {
  content: '';
  position: absolute;
  inset: -18%;
  border-radius: 50%;
  background: radial-gradient(circle, var(--dawn) 0%, transparent 62%);
  opacity: 0;
  pointer-events: none;
  animation: cairn-glow-arrive 900ms ease-in 500ms forwards;
}

@keyframes cairn-glow-arrive {
  0%   { opacity: 0;    }
  100% { opacity: 0.28; }
}

@media (prefers-reduced-motion: reduce) {
  .cairn-layer--over.is-wiping { animation: none; clip-path: none; }
  .cairn-stack.is-glowing::after { animation: none; opacity: 0.28; }
}
```

- [ ] **Step 2: Drive it**

In `js/traces-cairn.js`, replace `showTier` with:

```js
  var GLOWING_TIERS = ['sacred', 'eternal'];

  // Swaps the layers so the outgoing art holds beneath the incoming one,
  // then wipes the new tier up from the base.
  function showTier(name) {
    els.under.src = els.over.src;
    els.over.src = artFor(name);

    els.stack.classList.toggle('is-glowing', GLOWING_TIERS.indexOf(name) !== -1);

    if (reduceMotion) return;

    els.over.classList.remove('is-wiping');
    void els.over.offsetWidth;
    els.over.classList.add('is-wiping');
  }
```

`reduceMotion` is declared in Task 5 above `initCairn()`; `showTier` must be defined after it. If `showTier` currently sits above that declaration, move the `reduceMotion` line to the top of the IIFE, just under `var BREATH_MS = 5500;`.

- [ ] **Step 3: Verify in a browser**

Reload and click to 3, then 7, then 12, then hold to 42 and 77. Expected:
- Each tier change reveals the new painting from the base upward over about half a second. The old one is visible underneath the whole time — no ghosting, no dissolve.
- The base does not shift.
- At 77 (`sacred`) and 108 (`eternal`) a warm glow fades up *after* the wipe finishes, not during.
- Under reduced motion: the art swaps instantly and the glow is simply present.

- [ ] **Step 4: Commit**

```bash
git add css/traces-glyphs.css js/traces-cairn.js
git commit -m "feat(traces): tiers arrive by wiping upward, not by fading

Seven separate paintings cross-faded into each other read as a
slideshow. Revealed bottom-to-top with the previous tier holding
underneath, they read as accretion — the new pile assembling out of the
ground. Cairns grow upward, so the direction is the whole trick.

The sacred and eternal glows arrive late, fading up after the wipe
lands, so the pile assembles and then begins to shine."
```

---

### Task 7: The seven chimes

**Blocked until** `https://cdn.pilgrimapp.org/audio/stone/stone-tier-1.m4a` … `-7.m4a` are uploaded and reachable. Verify with `curl -sI` before starting.

**Files:**
- Modify: `js/traces-cairn.js`

**Interfaces:**
- Consumes: `G.soundTierFor(stones)` (Task 2), `placeStone()` result (Task 4)
- Produces: `playChime(stones)`, called ~120ms after a click so the sound lands on impact.

- [ ] **Step 1: Confirm the assets are live**

```bash
for n in 1 2 3 4 5 6 7; do
  curl -sI "https://cdn.pilgrimapp.org/audio/stone/stone-tier-$n.m4a" | head -1
done
```

Expected: seven `HTTP/2 200` lines. If any 404, stop — the upload is a prerequisite and this task cannot proceed.

- [ ] **Step 2: Add the player**

In `js/traces-cairn.js`, add above `animatePlacement()`:

```js
  // --- Chimes ---
  //
  // Seven sounds, one per tier, rising as the cairn grows. This is what
  // makes the climb an instrument rather than a button that makes noise.
  //
  // Lazy per tier: most visitors only ever pull stone-tier-1 (9 KB); a
  // climb to eternal pulls all seven.

  var STONE_CDN_BASE = 'https://cdn.pilgrimapp.org/audio/stone/';
  var STONE_VOLUME = 0.4;   // the app has a bellVolume preference; the web has none
  var IMPACT_MS = 120;      // the chime lands on impact, not on the press

  var chimeCache = {};
  var chimePlaying = null;

  function chimeFor(soundTier) {
    if (!chimeCache[soundTier]) {
      var a = new Audio(STONE_CDN_BASE + 'stone-tier-' + soundTier + '.m4a');
      a.preload = 'none';
      a.volume = STONE_VOLUME;
      chimeCache[soundTier] = a;
    }
    return chimeCache[soundTier];
  }

  // One sound at a time. The walker in js/main.js plays whispers from
  // the same CDN, and two sources at once is mush — iOS solves this with
  // AudioSessionCoordinator and a consumer string, so a chime yields to
  // a whisper rather than talking over it.
  function whisperIsPlaying() {
    var audios = document.querySelectorAll('audio');
    for (var i = 0; i < audios.length; i++) {
      if (!audios[i].paused && !audios[i].ended) return true;
    }
    return false;
  }

  function playChime(stones) {
    if (whisperIsPlaying()) return;

    if (chimePlaying) {
      chimePlaying.pause();
      chimePlaying.currentTime = 0;
    }

    var a = chimeFor(G.soundTierFor(stones));
    chimePlaying = a;
    var p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { /* autoplay refused or the file is missing — stay silent */ });
    }
  }
```

- [ ] **Step 3: Fire it on impact**

In `initCairn()`, change the click handler to:

```js
    els.stack.addEventListener('click', function () {
      var result = placeStone();
      animatePlacement(result);
      setTimeout(function () { playChime(result.stones); }, reduceMotion ? 0 : IMPACT_MS);
    });
```

- [ ] **Step 4: Verify in a browser**

Reload and click. Expected:
- A chime plays on each click, arriving fractionally after the press — it should feel like the stone landing, not like the button being pushed.
- Climbing through 3, 7, 12, 42, 77, 108 plays a **rising** sequence of seven distinct sounds.
- Network tab: only `stone-tier-1.m4a` is fetched until you cross into `small`.
- Click the walker in the left margin to start a whisper, then click the cairn — no chime plays over it.
- Under reduced motion the chime still plays. Sound is not motion.

- [ ] **Step 5: Commit**

```bash
git add js/traces-cairn.js
git commit -m "feat(traces): seven chimes that rise with the cairn

The app ships stone-tier-1 through -7 and picks between them with
CairnTier.soundTier, so the chime rises as the pile grows. That is what
turns the climb into an instrument instead of a button that makes a
noise, and it is the strongest argument for the whole feature.

Lazy per tier — most visitors only ever pull stone-tier-1 at 9 KB. The
chime yields to a playing whisper rather than overlapping it, mirroring
how iOS arbitrates with AudioSessionCoordinator. It fires ~120ms after
the press so it lands on impact rather than on the click."
```

---

### Task 8: Press-and-hold, and the 108th stone

**Files:**
- Modify: `js/traces-cairn.js`
- Modify: `css/traces-glyphs.css`

**Interfaces:**
- Consumes: everything from Tasks 4–7
- Produces: pointer/keyboard hold repeat, and a terminal `is-eternal` state that stops the breath cycle

- [ ] **Step 1: Add the hold**

In `js/traces-cairn.js`, replace the whole click handler in `initCairn()` with:

```js
    var HOLD_DELAY_MS = 400;   // long enough that an ordinary click never repeats
    var HOLD_STEP_MS = 250;
    var holdDelay = null, holdRepeat = null;

    function place() {
      var result = placeStone();
      animatePlacement(result);
      setTimeout(function () { playChime(result.stones); }, reduceMotion ? 0 : IMPACT_MS);
      if (result.stones === 108) reachEternal();
    }

    function startHold() {
      holdDelay = setTimeout(function () {
        holdRepeat = setInterval(place, HOLD_STEP_MS);
      }, HOLD_DELAY_MS);
    }

    function endHold() {
      if (holdDelay) { clearTimeout(holdDelay); holdDelay = null; }
      if (holdRepeat) { clearInterval(holdRepeat); holdRepeat = null; }
    }

    els.stack.addEventListener('click', place);
    els.stack.addEventListener('pointerdown', startHold);
    els.stack.addEventListener('pointerup', endHold);
    els.stack.addEventListener('pointerleave', endHold);
    els.stack.addEventListener('pointercancel', endHold);

    // Space and Enter both activate a <button>, and holding either
    // auto-repeats keydown. Placing on keydown would double up with the
    // synthetic click, so the repeat is driven and the click suppressed
    // only while a key is held.
    var keyHeld = false;
    els.stack.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (keyHeld) { e.preventDefault(); place(); }
      keyHeld = true;
    });
    els.stack.addEventListener('keyup', function () { keyHeld = false; });
```

- [ ] **Step 2: Add the eternal moment**

In `js/traces-cairn.js`, add above `initCairn()`:

```js
  // At 108 everything holds for a beat: the wisp stops cycling and
  // settles on whichever energy was breathing when the last stone
  // landed, the eternal glow comes up, and stone-tier-7 plays alone.
  // Reload resets it, like everything else here.
  function reachEternal() {
    stopBreathing();
    els.stack.classList.add('is-eternal');
  }
```

- [ ] **Step 3: Style it**

Append to `css/traces-glyphs.css`:

```css
.cairn-stack.is-eternal::after {
  animation: cairn-glow-arrive 2400ms ease-in forwards;
}

@media (prefers-reduced-motion: reduce) {
  .cairn-stack.is-eternal::after { animation: none; opacity: 0.28; }
}
```

- [ ] **Step 4: Verify in a browser**

Reload. Expected:
- A single click places one stone and does not repeat.
- Press and hold: nothing for ~0.4s, then a steady stream at ~4 stones/second, with the chimes ticking under it. Release stops it immediately.
- Dragging off the cairn while held stops it.
- Holding Space or Enter repeats the same way.
- Hold to 108: the aura stops changing colour and settles, the glow comes up slowly over ~2.4s, and `stone-tier-7` plays.
- Reload returns everything to `faint` with no counter.

- [ ] **Step 5: Commit**

```bash
git add js/traces-cairn.js css/traces-glyphs.css
git commit -m "feat(traces): hold to stack, and a moment at 108

Clicking 108 times is a chore; holding puts the eternal cairn about
thirty seconds away, with the chimes ticking underneath at four a
second. Repeat starts after 400ms so an ordinary click never triggers
it, and Space and Enter hold the same way.

At 108 everything stops for a beat — the wisp settles on whichever
energy was breathing when the last stone landed, the glow comes up
slowly, and the seventh chime plays alone. It is a quiet reward, which
is the only kind this section can give."
```

---

### Task 9: Reduced-motion coverage, and the weight ratchet

**Files:**
- Create: `js/traces-motion.test.js`
- Modify: `js/page-weight.test.js:53`

**Interfaces:**
- Consumes: `css/traces-glyphs.css` (Tasks 3–8)
- Produces: nothing consumed downstream

- [ ] **Step 1: Write the failing test**

Create `js/traces-motion.test.js`:

```js
/* =============================================
   Traces glyphs — every animation has an off switch

   Run via:  node js/traces-motion.test.js

   css/traces-glyphs.css introduces eight keyframe animations across two
   glyphs, added across six commits. The failure mode this guards is not
   "someone forgot accessibility" in the abstract — it is that the ninth
   animation gets added in a later commit and its reduced-motion
   counterpart does not, because the counterpart lives in a different
   block sixty lines away.

   So this DISCOVERS the animations rather than listing them: every
   selector that declares `animation:` outside a reduced-motion block
   must be named inside one. A ninth animation added tomorrow is covered
   the day it is written.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'traces-glyphs.css'), 'utf8');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// Split the file into the reduced-motion blocks and everything else.
const REDUCED_RE = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g;
let reducedText = '';
let outsideText = CSS;
let m;
while ((m = REDUCED_RE.exec(CSS)) !== null) {
  reducedText += m[1];
  outsideText = outsideText.replace(m[0], '');
}

ok(reducedText.length > 0, 'the stylesheet has at least one prefers-reduced-motion block');

// Every rule outside a reduced-motion block that animates.
const animated = [];
const RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
let r;
while ((r = RULE_RE.exec(outsideText)) !== null) {
  const selector = r[1].trim();
  const body = r[2];
  if (selector.charAt(0) === '@') continue;              // @keyframes, @media wrappers
  if (!/(^|[\s;])animation(-name)?\s*:/.test(body)) continue;
  if (/animation(-name)?\s*:\s*none/.test(body)) continue;
  animated.push(selector);
}

ok(animated.length > 0, 'found animated selectors to check (' + animated.length + ')');

console.log('\n=== every animated selector is switched off under reduce ===\n');

animated.forEach(function (selector) {
  // The reduced block may name the selector directly or via a shorter
  // ancestor of it, so match on the last simple selector token.
  const key = selector.split(/[\s>]+/).pop().replace(/::?[a-z-]+$/, '');
  ok(reducedText.indexOf(key) !== -1,
    selector + ' is disabled under prefers-reduced-motion (looked for "' + key + '")');
});

console.log('\n=== the chime is NOT disabled — sound is not motion ===\n');

ok(CSS.indexOf('stone-tier') === -1,
  'the stylesheet has no say over audio; chimes stay on under reduced motion');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it**

Run: `node js/traces-motion.test.js`
Expected: PASS if Tasks 3–8 each shipped their reduced-motion counterpart as instructed. **If it fails, that is a real gap — fix the CSS, not the test.**

- [ ] **Step 3: Measure the new page weight**

Run: `node js/page-weight.test.js`
Expected: FAIL on `index.html` — it grew past the 0.50 KB drift allowance. Read the reported figure.

- [ ] **Step 4: Raise the baseline deliberately**

In `js/page-weight.test.js:53`, replace the `index.html` line with the measured figure and a note in the existing style:

```js
  'index.html':                                 <MEASURED>,  // +<DELTA>: traces real glyphs (wisp + stackable cairn)
```

- [ ] **Step 5: Confirm every gate is green**

```bash
node js/traces-svg.test.js
node js/traces-glyphs.test.js
node js/traces-motion.test.js
node js/page-weight.test.js
node js/muted-contrast.test.js
```

Expected: all five print `all green`.

If `muted-contrast.test.js` fails on `.cairn-counter`, the counter is using a colour that is not the vetted `--ink-fog`. Fix the CSS.

- [ ] **Step 6: Commit**

```bash
git add js/traces-motion.test.js js/page-weight.test.js
git commit -m "test(traces): discover animations rather than listing them

Eight keyframe animations went in across six commits, and their
reduced-motion counterparts live sixty lines from the rules they
disable. The failure this guards is the ninth animation whose
counterpart nobody writes.

So the test discovers every animated selector in the stylesheet and
requires each to be named inside a reduce block, rather than checking a
list that goes stale the day it is written. It also asserts the
stylesheet has no say over audio — the chime stays on under reduced
motion, because sound is not motion.

Raises the index.html weight baseline for the new CSS and JS. The
artwork and chimes are fetched assets and the ratchet cannot see them;
the real on-demand cost is ~1.9 KB gzipped at rest, up to ~23 KB of
artwork and 188 KB of audio for a visitor who climbs to eternal."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Asset copy + SVGO | 1 |
| Baseline normalisation | 1 |
| Wisp `currentColor` | 1 |
| Code location (`traces-cairn.js`, `traces-glyphs.css`) | 3 |
| Seven energies, copy order, `play` excluded | 2 |
| Aura not tint | 3 |
| Breath cadence 5.5s | 3 |
| Tier thresholds | 2, 4 |
| One click = one stone | 4 |
| Press-and-hold, 400ms/250ms | 8 |
| Counter, with the first stone | 4 |
| Scroll-in demonstration stone | **gap — see below** |
| 96px sizing | 4 |
| Coupling (stone takes energy colour) | 5 |
| Drop / settle / dust | 5 |
| Upward wipe, late glow | 6 |
| The 108 moment | 8 |
| Lazy per-tier chimes, mutex, impact timing, volume | 7 |
| Reduced motion | 3–8, verified in 9 |
| Accessibility (button, aria-live, aria-hidden) | 4 |
| Page-weight ratchet | 9 |
| Threshold/energy parity tests | 2 |

**Gap found and closed:** the spec's scroll-in demonstration stone — one stone settling by itself, silently, to teach the verb — had no task. Adding it to Task 4 as an extra step below.

**Type consistency:** `placeStone()` returns `{stones, tier, energy, tierChanged}` in Task 4 and is destructured as `result.stones` / `result.energy` / `result.tierChanged` in Tasks 5, 7, 8 — consistent. `showTier(name)` takes a tier *name* string in Tasks 4 and 6 — consistent. `G.soundTierFor(stones)` takes a stone *count*, not a tier name, in Tasks 2 and 7 — consistent.

**Placeholder scan:** one intentional placeholder remains — `<MEASURED>` and `<DELTA>` in Task 9 Step 4, which cannot be known until the code exists. Step 3 produces the number.

---

### Task 4a: The demonstration stone (append to Task 4)

- [ ] **Step 1: Place one stone on scroll-in, silently**

In `js/traces-cairn.js`, add to `initCairn()` after the listeners:

```js
    // Demonstrate the verb: one stone settles on its own the first time
    // the section comes into view. Silent — there is no user gesture, so
    // there is no sound. It counts as stone 1, which is why the counter's
    // rule is "with the first stone" and not "after the first click".
    if (typeof IntersectionObserver === 'function') {
      var shown = false;
      var io = new IntersectionObserver(function (entries) {
        if (shown || !entries[0].isIntersecting) return;
        shown = true;
        io.disconnect();
        setTimeout(function () { animatePlacement(placeStone()); }, 600);
      }, { threshold: 0.6 });
      io.observe(els.stack);
    }
```

- [ ] **Step 2: Verify in a browser**

Reload at the top of the page and scroll down to the traces section. Expected: about 0.6s after the cairn is well into view, one stone drops on its own **in silence**, and the counter fades in reading `1 stone · faint`. It happens once per page load, not on every scroll past.

- [ ] **Step 3: Commit**

```bash
git add js/traces-cairn.js
git commit -m "feat(traces): the cairn places its own first stone

No label and no call to action — the section shows you the verb once
and lets the cursor do the rest. Silent, because there is no user
gesture behind it, and it counts as stone one so there is no separate
demonstration state to reason about."
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-20-traces-real-glyphs.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
