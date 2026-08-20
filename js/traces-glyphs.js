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
  //
  // `artTop` is where this tier's artwork begins, as a fraction of the
  // glyph box, measured off the rendered SVGs. A dropped stone has to
  // land on the pile rather than at a fixed height: every tier shares a
  // ground line but they are wildly different heights, so a fixed
  // landing point either buries the stone inside a tall cairn or leaves
  // it vanishing in mid-air above the two pebbles of `faint` — which is
  // the state every visitor sees first.
  var TIERS = [
    { name: 'faint',   min: 0,   sound: 1, artTop: 0.795 },
    { name: 'small',   min: 3,   sound: 2, artTop: 0.170 },
    { name: 'medium',  min: 7,   sound: 3, artTop: 0.040 },
    { name: 'large',   min: 12,  sound: 4, artTop: 0.040 },
    { name: 'great',   min: 42,  sound: 5, artTop: 0.040 },
    { name: 'sacred',  min: 77,  sound: 6, artTop: 0.055 },
    { name: 'eternal', min: 108, sound: 7, artTop: 0.040 }
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
