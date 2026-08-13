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

   Tested from js/daylight-math.test.js (the pure math), js/daylight-render.test.js
   and js/daylight-ribbon-wiring.test.js (rendering and wiring), and
   js/muted-contrast.test.js (the silver ramp).
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

  // daylight/index.html loads daylight-math.js at line 284 and this file
  // at 285, so DaylightMath is already on `root` by the time this runs —
  // the same resolution the three modules above use. A local copy of
  // darknessBandStatsInRange used to live at the bottom of this file,
  // justified by a load-order claim that was the wrong way round; the
  // copy that drew every cell was the untested one, while the public
  // export this slice added had no consumer at all.
  var DaylightMath = (typeof root !== 'undefined' && root.DaylightMath)
    ? root.DaylightMath
    : (typeof require === 'function' ? require('./daylight-math.js') : null);

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

      var stats = DaylightMath.darknessBandStatsInRange(runs, cell.loKm, cell.hiKm);

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

  /*
   * isDrawableCell(cell) — the one answer to "does the strip put ink on
   * the axis for this cell?", read by the renderer, by the axis label and
   * by every clause that counts nights or kilometres.
   *
   * It exists because those used to disagree. nightsLeadIn summed
   * `nights` over every cell while the draw loop skipped cells with no
   * moon, so a schedule whose dark window never closes drew a captioned,
   * empty strip reading "3 nights from 21 June" — correct arithmetic,
   * nothing a reader could see, the defect class this page has now
   * shipped six times.
   *
   * A cell with no moon has no band to paint (nightMoonLux returns null
   * above roughly 48.5°N near midsummer); a cell with no width has
   * nowhere to paint it.
   */
  function isDrawableCell(cell) {
    return Boolean(cell) && cell.moon !== null && cell.moonBand !== null
      && cell.hiKm > cell.loKm;
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
   *   - no lantern unless some night reaches 0.05 lux — camino-ingles's
   *     brightest instant across its six nights is 0.0380 lux (its highest
   *     nightly mean is 0.0067), a fifth of a lunation and never usable
   *   - no sky night unless the darkness spread reaches one full band —
   *     kumano-kodo is a flat band 4.00 on all four of its nights
   *   - a one-night walk compares nothing, so it names nothing
   *
   * Suppression returns null. An empty string would read as a rendering
   * bug at the call site; an absence is a decision.
   */
  function selectNotableNights(cells) {
    var usable = cells.filter(isDrawableCell);
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

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  // "night 27", or "nights 11 to 16" for one of shikoku's blocks. The
  // strip draws one cell either way; the prose has to say which nights
  // that cell stands for, or a reader counting forward from their start
  // date lands on the wrong day.
  function nightLabel(cell) {
    if (cell.nights <= 1) return 'night ' + cell.firstNight;
    return 'nights ' + cell.firstNight + ' to ' + (cell.firstNight + cell.nights - 1);
  }

  function usableFracPhrase(frac) {
    if (frac >= 0.95) return 'the whole night through';
    if (frac >= 0.5)  return 'for most of the night';
    return 'for part of the night';
  }

  // Nights the strip actually draws, never nights the schedule merely
  // holds — a total that counted undrawable cells would caption an
  // emptier strip than it describes (isDrawableCell above).
  function nightsLeadIn(cells, startDate) {
    var total = cells.filter(isDrawableCell)
      .reduce(function (a, c) { return a + c.nights; }, 0);
    return total + (total === 1 ? ' night from ' : ' nights from ')
      + startDate.getUTCDate() + ' ' + MONTH_NAMES[startDate.getUTCMonth()] + '.';
  }

  /*
   * The sky clause's moon is READ OFF THE BAND THE STRIP PAINTS, never
   * asked of the moon a second time.
   *
   * Selection gates on usableFrac === 0; the strip draws
   * moonBandForLux(mean). Those are two different questions, and they
   * disagreed: swept over 475 real route/date cases in
   * js/daylight-math.test.js, only 27.6% of the old unconditional "with
   * no moon" sat on a band-0 cell. 49.9% sat on band 1 and 22.5% on
   * band 2 — luxBracketFor's own "barely usable; carry a headlamp"
   * territory. css/daylight.css promises that "the strip and the prose
   * can never describe a night differently"; deriving the words from the
   * band is what makes that true by construction instead of by luck.
   *
   * Bands 3 and 4 have no wording here, deliberately. A sky night is
   * chosen among nights where every one of the 25 samples came in under
   * 0.05 lux, so its mean is under 0.05 lux, so its band is at most 2 —
   * copy for a band that cannot arrive is copy nothing can ever check.
   * If the selection above ever widens, this says so out loud rather
   * than writing `undefined` into the sentence.
   */
  var SKY_MOON_PHRASES = ['with no moon',
                          'with barely a trace of moon',
                          'with only a dim moon'];

  function skyMoonPhrase(band) {
    var phrase = SKY_MOON_PHRASES[band];
    if (!phrase) {
      throw new Error('night-math: sky night on moon band ' + band
        + ', which selectNotableNights cannot produce (usableFrac === 0 caps it at band 2)');
    }
    return phrase;
  }

  /*
   * phaseRangePhrase(cell) — D5 and AC #6: a block stands for several
   * nights, so it states the stretch of the lunation those nights span
   * rather than one phase. Until now phaseFirst/phaseLast were computed
   * on every cell and read by nothing, so the only thing a reader ever
   * got from a block was the shorter stroke.
   *
   * Only a NAMED night says its range. D7 caps the sentence at two
   * nights; a range on every block would name all ten of shikoku's and
   * turn a quiet close into a table.
   *
   * Moon.getMoonPhaseName supplies the wording, lowercased into the
   * sentence's voice. A block whose first and last night fall in the
   * same eighth of the lunation states that one name rather than
   * "waxing crescent to waxing crescent".
   */
  function phaseRangePhrase(cell) {
    if (!Moon || !cell.isBlock) return '';
    var first = Moon.getMoonPhaseName(cell.phaseFirst).toLowerCase();
    var last  = Moon.getMoonPhaseName(cell.phaseLast).toLowerCase();
    return first === last ? first : first + ' to ' + last;
  }

  /*
   * The sky clause carries the validation caveat; the lantern clause
   * does not. "Darkest sky" ranks one stretch of a route against another
   * from the interpolated darkness artifact, and on shikoku and kumano
   * that artifact has never been checked against a ground reading — the
   * ribbon one section above says so about the very same numbers, while
   * this comparative claim went out bare. Moonlight is pure astronomy
   * and needs no such caveat.
   *
   * `!== true`, not `=== false`: a missing or malformed field must read
   * as unvalidated, the distinction the ribbon failed open on once.
   */
  function skyClause(sky, heldOutValidation) {
    if (!sky) return '';
    var phases = phaseRangePhrase(sky);
    return ' Darkest sky on ' + nightLabel(sky) + ', ' + sky.stageName + ','
      + (phases ? ' ' + phases + ',' : '')
      + ' ' + skyMoonPhrase(sky.moonBand)
      + (heldOutValidation === true ? '' : ', on darkness no ground reading has checked')
      + '.';
  }

  function lanternClause(lantern) {
    if (!lantern) return '';
    var label  = nightLabel(lantern);
    // "Night 15 holds", but "Nights 11 to 16 hold" — a block is plural.
    var verb   = lantern.nights > 1 ? ' hold ' : ' holds ';
    var phases = phaseRangePhrase(lantern);
    return ' ' + label.charAt(0).toUpperCase() + label.slice(1)
      + (phases ? ', ' + phases + ',' : '')
      + verb + 'usable moonlight ' + usableFracPhrase(lantern.moon.usableFrac) + '.';
  }

  // Shikoku's stages are temple clusters with long unwalked stretches
  // between them, so more than a quarter of its strip is deliberately
  // empty. Saying so is cheaper than letting a reader read the gaps as a
  // rendering fault — and this is the only route it fires on.
  function unplacedClause(cells, coveredKm) {
    var drawn = cells.filter(isDrawableCell);
    if (!drawn.length || !(coveredKm > 0)) return '';
    var placed = drawn.reduce(function (a, c) { return a + (c.hiKm - c.loKm); }, 0);
    var unplacedFrac = 1 - (placed / coveredKm);
    if (unplacedFrac < 0.05) return '';
    return ' The stretches between temple clusters, '
      + Math.round(unplacedFrac * 100) + '% of the route, are not placed.';
  }

  /*
   * nightSummarySentence(cells, notable, startDate, coveredKm,
   * heldOutValidation) — the strip's text equivalent (D10) and its quiet
   * close (D7).
   *
   * Assembled from clauses that each return '' when they have nothing
   * true to say, the same shape darknessSummarySentence uses. The
   * suppressed clauses simply do not appear; nothing hedges.
   *
   * heldOutValidation is the darkness artifact's own field, passed
   * through untouched so the caveat's `!== true` test happens in one
   * place. Omitting it reads as unvalidated — the safe direction.
   */
  function nightSummarySentence(cells, notable, startDate, coveredKm, heldOutValidation) {
    if (!cells || !cells.filter(isDrawableCell).length) return '';
    var span = coveredKm;
    if (!(span > 0)) {
      span = cells.filter(isDrawableCell)
        .reduce(function (a, c) { return Math.max(a, c.hiKm); }, 0);
    }
    return nightsLeadIn(cells, startDate)
      + skyClause(notable.sky, heldOutValidation)
      + lanternClause(notable.lantern)
      + unplacedClause(cells, span);
  }

  var api = {
    NIGHT_SAMPLES:         NIGHT_SAMPLES,
    USABLE_LUX:            USABLE_LUX,
    MOON_BAND_BOUNDS:      MOON_BAND_BOUNDS,
    MIN_DARK_SPREAD_BANDS: MIN_DARK_SPREAD_BANDS,
    nightMoonLux:          nightMoonLux,
    moonBandForLux:        moonBandForLux,
    buildNightCells:       buildNightCells,
    isDrawableCell:        isDrawableCell,
    selectNotableNights:   selectNotableNights,
    nightSummarySentence:  nightSummarySentence
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NightMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
