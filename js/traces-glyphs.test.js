/* =============================================
   Traces glyphs — parity with the iOS tables

   Run via:  node js/traces-glyphs.test.js

   Two tables are ported here from Swift, and both have a history of
   forking silently when copied by hand:

     CairnTier.from(stoneCount:)   — the seven thresholds
     CairnTier.soundTier           — which chime a stone count plays
     WhisperDefinition.borderColor — the energy colours

   iOS guards the first two by routing every consumer through one
   derivation. The comment on CairnTier.soundTier says so explicitly:
   "so the threshold table cannot silently fork again." This is the web
   side of that guard.

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

// Every boundary, and one on each side of it. Off-by-one at a threshold
// is the whole failure mode this guards.
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

console.log('\n=== artTop, where each pile begins ===\n');

// Web-only, not from Swift: a dropped stone lands on the pile as it is
// now. These are measured off the rendered SVGs, so they drift the day
// the artwork is replaced — js/traces-svg.test.js measures the same
// files and is where a mismatch shows up as a moved base.
G.TIERS.forEach(function (t) {
  ok(typeof t.artTop === 'number' && t.artTop > 0 && t.artTop < 1,
    t.name + ' has an artTop inside the box (' + t.artTop + ')');
});

// faint is two pebbles on the ground; every other tier is a stack that
// reaches most of the way up. If faint ever stops being the lowest
// starting point, a stone dropped on it vanishes in mid-air.
const faintTop = G.TIERS[0].artTop;
ok(G.TIERS.slice(1).every(function (t) { return t.artTop < faintTop; }),
  'faint starts lowest in the box — every other tier reaches higher');

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

console.log('\n=== the wisp takes hue, not colour ===\n');

// Painting the glyph the literal border colour fails on parchment: four
// of the seven vanish as a thin line and presence is nearly black. Hue
// and saturation carry the identity; lightness is the caller's, so the
// same energy reads at the same weight in either theme.
const BAND = [30, 54];
const parse = c => c.match(/hsl\(([\d.]+), ([\d.]+)%, ([\d.]+)%\)/).slice(1).map(Number);

G.ENERGIES.forEach(function (e) {
  const [h, s, l] = parse(G.glyphColorFor(e.hex, BAND[0], BAND[1]));
  ok(l >= BAND[0] - 0.05 && l <= BAND[1] + 0.05,
    e.name + ' lands inside the legible band at L' + l.toFixed(1) + ' (h' + h.toFixed(0) + ' s' + s.toFixed(0) + ')');
});

// wonder is 15%-saturated and would read as grey — an absence of colour
// rather than a colour. The floor is the only reason it reads at all.
const wonder = G.ENERGIES.filter(function (e) { return e.name === 'wonder'; })[0];
ok(G.hexToHsl(wonder.hex).s < 28,
  'wonder is below the saturation floor in its raw form (' + G.hexToHsl(wonder.hex).s.toFixed(1) + '%)');
ok(parse(G.glyphColorFor(wonder.hex, BAND[0], BAND[1]))[1] === 28,
  'wonder is lifted to the floor so it reads as a colour, not as grey');

// This is the finding that shaped the design, recorded so nobody has to
// rediscover it: the app's seven border colours are NOT seven distinct
// colours. They cluster into about three hue families.
//
// Pinning every energy to one lightness — the obvious implementation —
// makes the cycle read as three colours slowly flickering. Keeping each
// energy's own lightness and saturation rescues two of the three pairs.
// It cannot rescue lightness vs stillness, which are 3deg of hue and
// 3.6% of lightness apart in the source and will look the same at 40px
// whatever transform is applied.
//
// So colour is atmosphere here and the NAME carries the identity. That
// is a design decision forced by this data, not a preference, and this
// test exists to hold the data still underneath it.
const sep = (x, y) => {
  const a = parse(G.glyphColorFor(
    G.ENERGIES.filter(e => e.name === x)[0].hex, BAND[0], BAND[1]));
  const b = parse(G.glyphColorFor(
    G.ENERGIES.filter(e => e.name === y)[0].hex, BAND[0], BAND[1]));
  return { hue: Math.abs(a[0] - b[0]), tone: Math.abs(a[2] - b[2]) + Math.abs(a[1] - b[1]) * 0.5 };
};

const pw = sep('presence', 'wonder');
ok(pw.tone > 6, 'presence vs wonder share a hue (' + pw.hue.toFixed(0)
  + 'deg) but separate on tone by ' + pw.tone.toFixed(1));

const gc = sep('gratitude', 'courage');
ok(gc.tone > 6, 'gratitude vs courage share a hue (' + gc.hue.toFixed(0)
  + 'deg) but separate on tone by ' + gc.tone.toFixed(1));

const ls = sep('lightness', 'stillness');
ok(ls.tone < 6, 'lightness vs stillness CANNOT be separated by colour ('
  + ls.hue.toFixed(0) + 'deg, tone ' + ls.tone.toFixed(1)
  + ') — this is why the energy name is rendered, and if this ever starts '
  + 'passing the palette changed and the name may no longer be load-bearing');

// The name element has to actually exist, or the identity is carried by
// nothing at all.
const INDEX = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'index.html'), 'utf8');
ok(/id="wisp-energy"/.test(INDEX),
  'index.html renders the energy name — the only thing that tells the seven apart');

console.log('\n=== the breath cycle wraps ===\n');

eq(G.energyAt(0).name, 'presence', 'breath 0 is presence');
eq(G.energyAt(6).name, 'stillness', 'breath 6 is stillness');
eq(G.energyAt(7).name, 'presence', 'breath 7 wraps back to presence');
eq(G.energyAt(16).name, 'gratitude', 'breath 16 wraps twice round to gratitude');
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
