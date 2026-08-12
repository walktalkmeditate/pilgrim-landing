/* =============================================
   Moon-lux helper

   moonLuxAt(k, altitudeDeg) and luxBracketFor(lux): a simplified lux
   approximation, extracted from js/moonpath.js so pages that only need
   these two functions (e.g. /daylight) don't have to load that whole
   69 KB module. moonpath.js consumes this file rather than keeping its
   own copies. Behaviour-preserving proof:
     - luxBracketFor — js/moonpath.test.js's own boundary tests carry over
       unchanged, so that file still proves this one.
     - moonLuxAt — js/moonpath.test.js only ever asserted the derived
       moonLuxAtCoord is `typeof === 'number'` and `>= 0`, which a stub
       returning 0.0 would also satisfy. The real proof is this file's
       own js/moon-lux.test.js, which pins actual values.

   kFromPhase(phase): the illuminated-disk-fraction formula, promoted
   here from duplicate inline copies in js/daylight.js and js/moonpath.js
   so the two pages share one definition instead of two that can drift.
   See js/moon-lux.test.js.

   No external dependencies.
   ============================================= */

(function (root) {
  'use strict';

  /*
   * luxBracketFor(lux) — D19 lux bracket lookup.
   * Brackets are half-open (left-inclusive, right-exclusive).
   * Returns one of:
   *   { label: 'bright', prose: '…' }
   *   { label: 'mid',    prose: '…' }
   *   { label: 'dim',    prose: '…' }
   *   { label: 'faint',  prose: '…' }
   *
   * Boundary values at 0.005, 0.05, 0.2 fall into the UPPER bracket
   * per the half-open discipline: [0.2, ∞), [0.05, 0.2), [0.005, 0.05), [0, 0.005).
   *
   * Lux approximation reference: simplified from Krisciunas & Schaefer (1991)
   * "A model of the brightness of moonlight", PASP 103. Formula used here:
   *   lux ≈ 0.32 × k × sin(altitude_rad)
   * where k is the illuminated-disk fraction and altitude is moon altitude in radians.
   * This is a simplified approximation; the full Krisciunas-Schaefer model
   * also accounts for atmospheric extinction, zodiacal light, and airglow.
   */
  function luxBracketFor(lux) {
    if (lux >= 0.2)    return { label: 'bright', prose: 'enough to walk a known path' };
    if (lux >= 0.05)   return { label: 'mid',    prose: 'usable light along an open trail' };
    if (lux >= 0.005)  return { label: 'dim',    prose: 'barely usable; carry a headlamp' };
    return               { label: 'faint',  prose: 'effectively dark; headlamp required' };
  }

  /*
   * moonLuxAt(k, altitudeDeg) — simplified lux approximation.
   * Returns 0 when the moon is at or below the horizon.
   * See luxBracketFor for attribution.
   */
  function moonLuxAt(k, altitudeDeg) {
    if (altitudeDeg <= 0) return 0;
    return 0.32 * k * Math.sin(altitudeDeg * Math.PI / 180);
  }

  /*
   * kFromPhase(phase) — illuminated-disk fraction from the synodic phase
   * fraction (0 = new moon, 0.5 = full moon, wrapping back toward 0 at 1).
   *   k = (1 − cos(2π × phase)) / 2
   */
  function kFromPhase(phase) {
    return (1 - Math.cos(2 * Math.PI * phase)) / 2;
  }

  var api = {
    moonLuxAt:     moonLuxAt,
    luxBracketFor: luxBracketFor,
    kFromPhase:    kFromPhase
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MoonLux = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
