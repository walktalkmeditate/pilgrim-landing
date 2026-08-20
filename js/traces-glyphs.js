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

  // Ascending. tierFor() walks this and keeps the last match, so the
  // order here is load-bearing.
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
