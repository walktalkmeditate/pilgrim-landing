/* =============================================
   Moon-lux helper

   moonLuxAt(k, altitudeDeg) and luxBracketFor(lux): a simplified lux
   approximation, extracted from js/moonpath.js so pages that only need
   these two functions (e.g. /daylight) don't have to load that whole
   69 KB module. moonpath.js consumes this file rather than keeping its
   own copies — see js/moonpath.test.js for the behaviour-preserving proof.

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

  var api = {
    moonLuxAt:     moonLuxAt,
    luxBracketFor: luxBracketFor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MoonLux = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
