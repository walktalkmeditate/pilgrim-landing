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

  function hexToHsl(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var h = 0, s = 0;

    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else                h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }

  // The wisp wearing an energy, legibly.
  //
  // Painting the glyph the literal border colour does not work: on
  // parchment, compassion, wonder, courage and lightness are all
  // near-invisible as a thin line, and presence is nearly black.
  //
  // But hue alone does not work either, and that is the less obvious
  // half. The app's seven border colours cluster into about three
  // families — presence 200deg and wonder 198deg are the same teal,
  // lightness 29deg and stillness 32deg the same tan, gratitude 41deg
  // and courage 46deg the same gold. Pin every energy to one lightness
  // and the cycle reads as three colours slowly flickering, not seven.
  //
  // So each energy keeps its OWN relative lightness and saturation,
  // compressed into a band the page can actually show. Deep, saturated
  // presence and pale, washed wonder stay obviously different despite
  // sharing a hue. The caller passes the band its theme wants.
  var SAT_FLOOR = 28;
  var SAT_CEIL = 62;

  // The observed lightness spread across the seven, which is what gets
  // remapped onto the caller's band.
  var SRC_L_MIN = 20;
  var SRC_L_MAX = 76;

  function glyphColorFor(hex, minL, maxL) {
    var hsl = hexToHsl(hex);
    var s = Math.min(SAT_CEIL, Math.max(SAT_FLOOR, hsl.s));
    var t = (hsl.l - SRC_L_MIN) / (SRC_L_MAX - SRC_L_MIN);
    t = Math.min(1, Math.max(0, t));
    var l = minL + t * (maxL - minL);
    return 'hsl(' + hsl.h.toFixed(1) + ', ' + s.toFixed(1) + '%, ' + l.toFixed(1) + '%)';
  }

  var api = {
    TIERS: TIERS,
    ENERGIES: ENERGIES,
    tierFor: tierFor,
    tierNameFor: tierNameFor,
    soundTierFor: soundTierFor,
    energyAt: energyAt,
    hexToHsl: hexToHsl,
    glyphColorFor: glyphColorFor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TracesGlyphs = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
