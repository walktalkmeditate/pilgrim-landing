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
