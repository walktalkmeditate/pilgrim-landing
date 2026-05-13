/* =============================================
   Daylight walk-budget math

   Walking velocity model and pace presets for estimating
   how long a route will take given distance and elevation gain.

   No external dependencies.

   Cross-checked in js/daylight-math.test.js against hand-computed
   values from the Tobler-inspired velocity formula.
   ============================================= */

(function (root) {
  'use strict';

  // km/h at each named pace on flat ground (s = 0).
  var PACE_PRESETS = {
    slow:     3,
    standard: 4,
    brisk:    5
  };

  // Walking velocity in km/h given slope s (elevGainM / horizontal distance m).
  // Tobler-inspired: v(s) = v_flat × exp(-3.5 × s), s ≥ 0.
  // Departs from canonical Tobler (6 km/h base, +0.05 offset) by substituting
  // v_flat from the caller's pace preset and dropping the offset term.
  function walkingVelocity(vFlat, slope) {
    return vFlat * Math.exp(-3.5 * slope);
  }

  // Minutes to walk a route at a given pace preset (or explicit min/km pace).
  // distanceKm:          horizontal route length in km.
  // elevGainM:           total ascent in metres (descents not modelled in v1, pass 0).
  // pacePresetOrMinPerKm: a key from PACE_PRESETS ('slow'|'standard'|'brisk')
  //                       or a numeric minutes-per-km pace (e.g. 15 → 4 km/h).
  function walkingMinutes(opts) {
    var distanceKm = opts.distanceKm;
    var elevGainM  = opts.elevGainM  || 0;
    var preset     = opts.pacePresetOrMinPerKm;

    var vFlat;
    if (typeof preset === 'number') {
      vFlat = 60 / preset;
    } else {
      vFlat = PACE_PRESETS[preset];
    }

    var slope    = distanceKm > 0 ? elevGainM / (distanceKm * 1000) : 0;
    var velocity = walkingVelocity(vFlat, slope);
    return 60 * distanceKm / velocity;
  }

  var api = {
    PACE_PRESETS:    PACE_PRESETS,
    walkingMinutes:  walkingMinutes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DaylightMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
