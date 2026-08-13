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

  // The strip's five steps. These are MoonLux.luxBracketFor's own
  // boundaries, not new ones, so the strip and the prose can never
  // describe a night differently (D8). Band 0 is a real, populated
  // category: on camino-frances nine of thirty-three nights have the
  // moon below the horizon for the whole dark window.
  var MOON_BAND_BOUNDS = [0, 0.005, 0.05, 0.2];

  // moonBandForLux(lux) — 0 (no moon) to 4 (enough to walk a known
  // path). A value sitting exactly on a boundary takes the HIGHER band,
  // the same tie rule darknessBandForValue applies to its own bounds.
  function moonBandForLux(lux) {
    if (!(lux > 0)) return 0;
    if (lux >= MOON_BAND_BOUNDS[3]) return 4;
    if (lux >= MOON_BAND_BOUNDS[2]) return 3;
    if (lux >= MOON_BAND_BOUNDS[1]) return 2;
    return 1;
  }

  // buildNightCells(schedule, stages, runs) — attach to each cell the
  // moonlight of the nights it spans and the darkness of the kilometres
  // it covers, so the strip, the sentence and the selection all read one
  // enriched structure rather than each recomputing it.
  //
  // A block's moon is the mean across its nights; it also keeps the
  // phase at its first and last night, which is what D5 states in place
  // of a single phase.
  function buildNightCells(schedule, stages, runs) {
    return schedule.map(function (cell) {
      var stage = stages[cell.index];
      var lat = stage.startLat, lon = stage.startLon;

      var perNight = cell.dates.map(function (d) { return nightMoonLux(d, lat, lon); });
      var usable   = perNight.filter(function (m) { return m !== null; });

      var moon = null;
      if (usable.length) {
        var sum = 0, peak = 0, usableFracSum = 0, hours = 0;
        usable.forEach(function (m) {
          sum += m.mean;
          usableFracSum += m.usableFrac;
          hours += m.hours;
          if (m.peak > peak) peak = m.peak;
        });
        moon = {
          mean:       sum / usable.length,
          peak:       peak,
          usableFrac: usableFracSum / usable.length,
          hours:      hours / usable.length
        };
      }

      var stats = darknessStatsInRange(runs, cell.loKm, cell.hiKm);

      return {
        index:      cell.index,
        loKm:       cell.loKm,
        hiKm:       cell.hiKm,
        nights:     cell.nights,
        isBlock:    cell.isBlock,
        firstNight: cell.firstNight,
        dates:      cell.dates,
        stageName:  stage.nameEn,
        moon:       moon,
        moonBand:   moon ? moonBandForLux(moon.mean) : null,
        darkMean:   stats.mean,
        darkBand:   stats.dominantBand,
        phaseFirst: Moon ? Moon.getMoonPhase(cell.dates[0]) : null,
        phaseLast:  Moon ? Moon.getMoonPhase(cell.dates[cell.dates.length - 1]) : null
      };
    });
  }

  // Local copy of daylight-math's darknessBandStatsInRange so this module
  // does not depend on it at load time in the browser (script order puts
  // daylight-math.js after this file would need it). Kept deliberately
  // identical, including the >= tie rule that sends an exact tie to the
  // darker band — the rule that once silently deleted camino-frances's
  // "Darkest near the end."
  function darknessStatsInRange(runs, lo, hi) {
    var span = hi - lo;
    var kmByBand = [0, 0, 0, 0, 0];
    for (var i = 0; i < runs.length; i++) {
      var overlap = Math.min(runs[i].endKm, hi) - Math.max(runs[i].startKm, lo);
      if (overlap > 0) kmByBand[runs[i].band] += overlap;
    }
    var dominantBand = 0, weightedSum = 0;
    for (var b = 0; b < 5; b++) {
      weightedSum += kmByBand[b] * b;
      if (kmByBand[b] >= kmByBand[dominantBand]) dominantBand = b;
    }
    return { mean: span > 0 ? weightedSum / span : 0, dominantBand: dominantBand };
  }

  // How much darkness spread a walk needs before naming one night the
  // darkest is a claim rather than a coin toss. One full band.
  var MIN_DARK_SPREAD_BANDS = 1.0;

  /*
   * selectNotableNights(cells) — at most two nights, and nothing that
   * has not been earned (D7).
   *
   * The sky night is the darkest night ON WHICH THE MOON GIVES NO USABLE
   * LIGHT, not the darkest night outright: a dark site under a full moon
   * is not a good sky, and naming it one would send a reader to the
   * wrong place. The lantern night is simply the most moonlit.
   *
   * Suppression, each verified against a real route:
   *   - no lantern unless some night reaches 0.05 lux — camino-ingles
   *     peaks at 0.0067 over its six nights, a fifth of a lunation
   *   - no sky night unless the darkness spread reaches one full band —
   *     kumano-kodo is a flat band 4.00 on all four of its nights
   *   - a one-night walk compares nothing, so it names nothing
   *
   * Suppression returns null. An empty string would read as a rendering
   * bug at the call site; an absence is a decision.
   */
  function selectNotableNights(cells) {
    var usable = cells.filter(function (c) { return c.moon !== null; });
    if (usable.length < 2) return { sky: null, lantern: null };

    var darks = usable.map(function (c) { return c.darkMean; });
    var spread = Math.max.apply(null, darks) - Math.min.apply(null, darks);

    var sky = null;
    if (spread >= MIN_DARK_SPREAD_BANDS) {
      var moonless = usable.filter(function (c) { return c.moon.usableFrac === 0; });
      if (moonless.length) {
        sky = moonless.reduce(function (best, c) {
          return c.darkMean > best.darkMean ? c : best;
        });
      }
    }

    var lantern = null;
    var brightest = usable.reduce(function (best, c) {
      return c.moon.mean > best.moon.mean ? c : best;
    });
    if (brightest.moon.peak >= USABLE_LUX) lantern = brightest;

    return { sky: sky, lantern: lantern };
  }

  var api = {
    NIGHT_SAMPLES:         NIGHT_SAMPLES,
    USABLE_LUX:            USABLE_LUX,
    MOON_BAND_BOUNDS:      MOON_BAND_BOUNDS,
    MIN_DARK_SPREAD_BANDS: MIN_DARK_SPREAD_BANDS,
    nightMoonLux:          nightMoonLux,
    moonBandForLux:        moonBandForLux,
    buildNightCells:       buildNightCells,
    selectNotableNights:   selectNotableNights
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NightMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
