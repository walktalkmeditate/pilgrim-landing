/* =============================================
   Night math — the moon over a walk's nights

   Slice 3 of the night instrument. Spec:
   docs/specs/2026-08-13-night-worth-walking.md

   This is the one module in the slice that needs astronomy, so it is the
   one module that composes it. js/daylight-math.js states "No external
   dependencies" and keeps the pure walking and placement math; putting
   sun and moon position in there would dilute it, and putting it in
   js/daylight.js would bury testable math in the render module. The same
   reasoning produced js/moon-lux.js in slice 1.

   Depends on: js/sunpath-math.js (twilight, moon altitude),
   js/moon-lux.js (illuminance, brackets), js/moon.js (phase).

   See js/night-math.test.js.
   ============================================= */

(function (root) {
  'use strict';

  var SunPathMath = (typeof root !== 'undefined' && root.SunPathMath)
    ? root.SunPathMath
    : (typeof require === 'function' ? require('./sunpath-math.js') : null);

  var MoonLux = (typeof root !== 'undefined' && root.MoonLux)
    ? root.MoonLux
    : (typeof require === 'function' ? require('./moon-lux.js') : null);

  var Moon = (typeof root !== 'undefined' && root.Moon)
    ? root.Moon
    : (typeof require === 'function' ? require('./moon.js') : null);

  var MS_PER_DAY = 86400000;

  // How many points across the dark window are sampled. The moon moves
  // slowly enough that 25 points over a 4-14 hour window resolves the
  // rise and set within a few minutes, and the whole strip needs at most
  // 34 of these per render.
  var NIGHT_SAMPLES = 25;

  // Above this the moon gives "usable light along an open trail" —
  // MoonLux.luxBracketFor's own `mid` threshold, not a new number.
  var USABLE_LUX = 0.05;

  /*
   * nightMoonLux(date, lat, lon) — how much moonlight the night that
   * FOLLOWS `date` actually delivers, at that place.
   *
   * Spec D2: the honest quantity is illuminance across the dark window,
   * not phase. A full moon that never rises gives no light, and a phase
   * reading would claim otherwise.
   *
   * The window runs from astronomical dusk on `date` to astronomical
   * dawn the next morning. Returns null when that window never closes —
   * above roughly 48.5°N there is no astronomical night near midsummer.
   * No route currently shipped reaches that (Camino Norte's northernmost
   * point still gets 3.8 hours at the solstice), but a NaN here would
   * render as a blank cell indistinguishable from shikoku's real
   * unplaced gaps, so it fails loudly to null instead.
   *
   * Returns { mean, peak, usableFrac, hours }.
   */
  function nightMoonLux(date, lat, lon) {
    if (!SunPathMath || !MoonLux || !Moon) return null;

    var dusk = SunPathMath.astronomicalDuskUTC(lat, lon, date);
    var dawn = SunPathMath.astronomicalDawnUTC(lat, lon,
                 new Date(date.getTime() + MS_PER_DAY));
    if (!dusk || !dawn || !(dawn.getTime() > dusk.getTime())) return null;

    var span = dawn.getTime() - dusk.getTime();
    var sum = 0, peak = 0, usable = 0;

    for (var i = 0; i < NIGHT_SAMPLES; i++) {
      var t   = new Date(dusk.getTime() + span * (i / (NIGHT_SAMPLES - 1)));
      var k   = MoonLux.kFromPhase(Moon.getMoonPhase(t));
      var alt = SunPathMath.moonAltAzAt(t, lat, lon).altitude;
      var lux = MoonLux.moonLuxAt(k, alt);
      sum += lux;
      if (lux > peak) peak = lux;
      if (lux >= USABLE_LUX) usable++;
    }

    return {
      mean:       sum / NIGHT_SAMPLES,
      peak:       peak,
      usableFrac: usable / NIGHT_SAMPLES,
      hours:      span / 3600000
    };
  }

  var api = {
    NIGHT_SAMPLES: NIGHT_SAMPLES,
    USABLE_LUX:    USABLE_LUX,
    nightMoonLux:  nightMoonLux
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NightMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
