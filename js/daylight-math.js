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

  // Format a Date as a UTC instant in RFC 5545 basic format: YYYYMMDDTHHMMSSZ.
  function fmtUTCInstant(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + ''
      + p(d.getUTCMonth() + 1)
      + p(d.getUTCDate())
      + 'T'
      + p(d.getUTCHours())
      + p(d.getUTCMinutes())
      + p(d.getUTCSeconds())
      + 'Z';
  }

  // Escape a string per RFC 5545 TEXT escaping rules.
  function escapeICSText(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/,/g,  '\\,')
      .replace(/;/g,  '\\;')
      .replace(/\n/g, '\\n');
  }

  // Fold an ICS content line to max 75 octets per RFC 5545 §3.1.
  // Continuation lines start with a single space.
  function foldICSLine(line) {
    var bytes = [];
    for (var i = 0; i < line.length; i++) {
      var cp = line.charCodeAt(i);
      if (cp < 0x80) {
        bytes.push(line[i]);
      } else if (cp < 0x800) {
        bytes.push(line[i], line[i]);
      } else {
        bytes.push(line[i], line[i], line[i]);
      }
    }
    // Simple byte-count-by-char approximation: fold on byte count.
    // We use char length as a conservative proxy (ASCII-dominant content).
    var result = '';
    var pos = 0;
    var limit = 75;
    while (pos < line.length) {
      var chunk = line.slice(pos, pos + limit);
      if (pos > 0) result += '\r\n ';
      result += chunk;
      pos += limit;
      limit = 74; // continuation lines: 1 byte for the leading space, so 74 payload chars
    }
    return result;
  }

  // Build a VCALENDAR/VEVENT ICS string for a daylight walk.
  //
  // opts:
  //   routeName      — display name of the route (string)
  //   stageLabel     — display name of the stage (string)
  //   startUTC       — walk start as a Date (forward: output.startUTC; reverse: output.latestDepartUTC)
  //   endUTC         — walk end   as a Date (forward: output.arrivalUTC; reverse: output.walkEndUTC)
  //   urlHref        — canonical URL for the event (string)
  //   mode           — 'forward' | 'reverse' (passed through to DESCRIPTION context, not used in ICS logic)
  //   stageTz        — IANA timezone string — present in signature per spec D9 but UNUSED in v1
  //                    body. Two-call negative test in daylight-math.test.js guards against silent
  //                    regression if this ever gets used accidentally.
  //   descriptionLine — one-line plain-text summary (will be RFC-5545-escaped and folded)
  //
  // Returns a VCALENDAR string. Pure: no globals, no Date.now() calls.
  // DTSTAMP uses startUTC as a deterministic value (matches turnings-2026.ics pattern of a
  // fixed literal rather than "now").
  function buildICS(opts) {
    var routeName     = opts.routeName      || '';
    var stageLabel    = opts.stageLabel     || '';
    var startUTC      = opts.startUTC;
    var endUTC        = opts.endUTC;
    var urlHref       = opts.urlHref        || '';
    var descLine      = opts.descriptionLine || '';
    // stageTz is intentionally unused — see comment above.

    var summary     = 'Walk: ' + routeName + ' — ' + stageLabel;
    var uid         = 'daylight-' + fmtUTCInstant(startUTC) + '@pilgrimapp.org';
    var dtstamp     = fmtUTCInstant(startUTC);
    var dtstart     = fmtUTCInstant(startUTC);
    var dtend       = fmtUTCInstant(endUTC);
    var description = escapeICSText(descLine);

    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pilgrim//The Light Budget//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      '',
      'BEGIN:VEVENT',
      foldICSLine('UID:' + uid),
      'DTSTAMP:' + dtstamp,
      'DTSTART:' + dtstart,
      'DTEND:'   + dtend,
      foldICSLine('SUMMARY:' + summary),
      foldICSLine('DESCRIPTION:' + description),
      foldICSLine('URL:' + urlHref),
      'CATEGORIES:Pilgrimage,Walking',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Walk tomorrow',
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
      '',
      'END:VCALENDAR'
    ];

    return lines.join('\r\n');
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

  // Margin added beyond the earliest/latest twilight bound so the
  // true-dark segments at each end of the bar have visible extent.
  // 60 min (not 20, DARK_ADAPT_MIN in daylight.js) so the dark-adaptation
  // mark — anchored at astronomicalDusk + DARK_ADAPT_MIN — lands a
  // legible 40 min inside the edge rather than crushed against it.
  var BAR_DOMAIN_MARGIN_MS = 60 * 60000;

  function firstDate(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i]) return candidates[i];
    }
    return null;
  }

  // barDomainUTC(output) — pure. Widens the daylight bar's time axis
  // beyond [sunrise, sunset] to cover the full twilight sequence, so the
  // three twilight bands (civil/nautical/astronomical) render at distinct
  // widths instead of clamping to the sunrise/sunset span.
  //
  // output is a Daylight.recompute() result (or anything exposing the
  // same field names). Fallback chain per side — "earliest/latest
  // available" — because above ~48° latitude in summer, astronomical
  // (and sometimes nautical) twilight never occurs and those fields
  // are null:
  //   start: astronomicalDawn → nauticalDawn → civilDawn → sunriseUTC
  //   end:   astronomicalDusk → nauticalDusk → civilDusk → sunsetUTC
  //
  // The margin is only added on a side where astronomicalDawn/Dusk is
  // itself present. daylight.js gates both the true-dark segment and the
  // dark-adaptation mark on that same field, so where astronomical
  // twilight never occurs, neither one draws anything — widening the
  // domain there would only pad the bar with dead space past whichever
  // rung we fell back to, not "true dark" (see Finding 10: at latitudes
  // like Stockholm/Paris/Reykjavik in June, that's exactly what the
  // unconditional margin used to do).
  //
  // Returns null when there is no sunrise/sunset at all (polar day/night
  // — handled upstream via output.isPolarDay / output.isPolarNight).
  function barDomainUTC(output) {
    if (!output || !output.sunriseUTC || !output.sunsetUTC) return null;

    var start = firstDate([output.astronomicalDawn, output.nauticalDawn, output.civilDawn, output.sunriseUTC]);
    var end   = firstDate([output.astronomicalDusk, output.nauticalDusk, output.civilDusk, output.sunsetUTC]);

    var startMargin = output.astronomicalDawn ? BAR_DOMAIN_MARGIN_MS : 0;
    var endMargin   = output.astronomicalDusk ? BAR_DOMAIN_MARGIN_MS : 0;

    return {
      startUTC: new Date(start.getTime() - startMargin),
      endUTC:   new Date(end.getTime()   + endMargin)
    };
  }

  /* ==========================================
     Darkness ribbon — band classification (D1, D3)
     ========================================== */

  // Five coarse steps, brightest to darkest, at 18.5 / 19.5 / 20.5 / 21.3
  // mag/arcsec² (D1). Comfortably wider than the ±0.32 mag swing Gate 0's
  // α-sensitivity finding puts on any single value (D7), so no sample can
  // cross more than one boundary across the full range of α that cleared
  // Gate 0's own gate.
  var DARKNESS_BAND_BOUNDS = [18.5, 19.5, 20.5, 21.3];

  // D9 band names, index-aligned with the bands DARKNESS_BAND_BOUNDS cuts:
  // brightest (town glow) to darkest (as it was). "Open dark" replaces the
  // working brief's "properly dark" so it doesn't echo the bar's own
  // "true dark" directly above this ribbon.
  var DARKNESS_BAND_NAMES = ['town glow', 'edge of town', 'countryside', 'open dark', 'as it was'];

  // darknessBandForValue(mag) — a direct index into DARKNESS_BAND_BOUNDS.
  // Half-open, left-inclusive (mirrors js/moon-lux.js's luxBracketFor
  // discipline): a value exactly on a boundary belongs to the darker band
  // above it, not the brighter one below.
  function darknessBandForValue(mag) {
    if (mag >= DARKNESS_BAND_BOUNDS[3]) return 4;
    if (mag >= DARKNESS_BAND_BOUNDS[2]) return 3;
    if (mag >= DARKNESS_BAND_BOUNDS[1]) return 2;
    if (mag >= DARKNESS_BAND_BOUNDS[0]) return 1;
    return 0;
  }

  // darknessBandCounts(values) — one pass over a route's per-kilometre
  // values[], tallying each sample into its band. No per-route
  // special-casing: Kumano's all-one-band result (D6) and Shikoku's spread
  // both fall out of running this same function against their own values[],
  // not a branch that checks the route id.
  function darknessBandCounts(values) {
    var counts = [0, 0, 0, 0, 0];
    for (var i = 0; i < values.length; i++) {
      counts[darknessBandForValue(values[i])]++;
    }
    return counts;
  }

  // darknessAggregateWindowKm(positionalConfidence) — D3. null when the
  // route's positions are trustworthy at 1 km resolution
  // (withinInterpolationLimit true — every shipped route except
  // shikoku-88 today), so the caller draws per-kilometre as normal.
  // Otherwise, the smallest round-ten-kilometre window at or above the
  // distance within which 90% of the route's real waypoint gaps fall — a
  // reader is never shown a boundary finer than the data can locate.
  function darknessAggregateWindowKm(positionalConfidence) {
    if (positionalConfidence.withinInterpolationLimit) return null;
    return Math.ceil(positionalConfidence.p90GapKm / 10) * 10;
  }

  // Standard median: the middle value, or the average of the two middle
  // values when the count is even. Used by mergeDarknessRuns's aggregated
  // path (D3) — median rather than mean, so one long interpolated run
  // inside a window can't pull its displayed band further than a mean
  // would.
  function darknessMedian(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return (sorted.length % 2) ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // mergeDarknessRuns(values, stepKm, coveredKm, aggregateWindowKm) — D3.
  // Slice 2's prose named this helper but nothing demanded it yet, so it
  // shipped without it; the ribbon needs it to turn per-kilometre values
  // into drawable spans.
  //
  // Two paths, selected by aggregateWindowKm (darknessAggregateWindowKm's
  // return value):
  //   - null: classify every raw sample directly (darknessBandForValue) —
  //     one point per kilometre.
  //   - a number: bucket samples into fixed-width, grid-aligned windows —
  //     [0, w), [w, 2w), … clamped to coveredKm at the end — and classify
  //     each window by the *median* of the raw values that fall inside it.
  //     Windows sit on the grid, not on wherever a sample happened to
  //     land, so a window's width matches "the smallest round-ten-
  //     kilometre window" D3 describes even when the last one is shorter.
  //
  // Either way, the classified points are then merged: consecutive points
  // sharing a band collapse into one run — Kumano's uniform values[]
  // collapses to the single flat run D6 describes, with no route-id
  // special-casing. A run boundary sits at the km of whichever point
  // started the new run — the same convention computeMoonBandRuns already
  // uses on the bar's time axis (js/daylight.js), reused as a pattern
  // here, not shared code, since one walks time and the other distance.
  //
  // The very last point can land exactly on coveredKm itself — an
  // exact-multiple route length (unaggregated path), or a window whose
  // grid boundary lands there (aggregated path). If that point's band
  // disagrees with the run before it, the naive result is a
  // {startKm: coveredKm, endKm: coveredKm, band: ...} run: a real
  // classification with zero pixels to draw it. It's absorbed into the
  // run before it instead of emitted as an invisible sliver — verified to
  // never trigger on any of the seven shipped routes, only on adversarial
  // input (js/daylight-math.test.js).
  function mergeDarknessRuns(values, stepKm, coveredKm, aggregateWindowKm) {
    var n = values.length;
    var points;

    if (aggregateWindowKm === null) {
      points = values.map(function (v, i) {
        return { km: i * stepKm, band: darknessBandForValue(v) };
      });
    } else {
      var numWindows = Math.ceil(coveredKm / aggregateWindowKm);
      var buckets = [];
      for (var w = 0; w < numWindows; w++) buckets.push([]);
      for (var i = 0; i < n; i++) {
        var km = i * stepKm;
        var bucketIdx = Math.min(Math.floor(km / aggregateWindowKm), numWindows - 1);
        buckets[bucketIdx].push(values[i]);
      }
      var lastBand = null;
      points = buckets.map(function (bucketValues, w2) {
        // An empty window doesn't occur in any shipped route (verified
        // directly against shikoku-88, the only route this path runs for
        // today) — carrying the previous window's band forward keeps the
        // tiling unbroken if it ever did, rather than crashing on an
        // empty median.
        var band = bucketValues.length
          ? darknessBandForValue(darknessMedian(bucketValues))
          : lastBand;
        lastBand = band;
        return { km: w2 * aggregateWindowKm, band: band };
      });
    }

    if (!points.length) return [];

    var runs = [];
    var runStartKm = points[0].km;
    var runBand   = points[0].band;
    for (var j = 1; j < points.length; j++) {
      if (points[j].band !== runBand) {
        runs.push({ startKm: runStartKm, endKm: points[j].km, band: runBand });
        runStartKm = points[j].km;
        runBand    = points[j].band;
      }
    }
    runs.push({ startKm: runStartKm, endKm: coveredKm, band: runBand });

    var lastRun = runs[runs.length - 1];
    if (runs.length > 1 && lastRun.endKm <= lastRun.startKm) {
      runs.pop();
      runs[runs.length - 1].endKm = coveredKm;
    }

    return runs;
  }

  /* ==========================================
     Darkness ribbon — the summary sentence (D10, D11)
     ========================================== */

  // darknessFmtDistance(km, decimals, unitSystem) — grouped-number
  // formatting for this sentence's own "N of its M {unit} sampled"
  // lead-in. Deliberately not js/daylight.js's fmtDistance: this module
  // has no dependency on daylight.js (the require graph runs the other
  // way — daylight.js requires this file, never the reverse), so this is
  // a small local mirror of the same shape: thousands separator,
  // unitSystem-aware conversion, and the same U+00A0 (non-breaking
  // space) fmtDistance already uses before its unit suffix, so a number
  // like "1,080.5" can never wrap onto its own line away from "km". The
  // unit sits immediately after the number for a second reason too: AC
  // #4's bare-decimal sweep treats an unattached "1,080.5" as
  // suspicious — a raw magnitude-shaped number — and it should.
  function darknessFmtDistance(km, decimals, unitSystem) {
    var val   = unitSystem === 'mi' ? km * 0.621371 : km;
    var fixed = val.toFixed(decimals);
    var dot   = fixed.indexOf('.');
    var intPart  = dot === -1 ? fixed : fixed.slice(0, dot);
    var fracPart = dot === -1 ? '' : fixed.slice(dot);
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return intPart + fracPart + '\u00A0' + (unitSystem === 'mi' ? 'mi' : 'km');
  }

  // darknessDistanceLeadIn — D10's "N of its M {unit} sampled" clause,
  // gated on a >5 km gap between the darkness artifact's own coveredKm
  // and route-meta.json's stated distanceKm (D13's own verified table:
  // six of seven routes agree to sub-1 km rounding; Shikoku alone
  // disagrees, by 173.2 km between the two bakes, comfortably clearing
  // the 5 km gate). statedDistanceKm renders as a whole number, not
  // forced to one decimal like coveredKm — it is itself a round,
  // published trail-length figure in route-meta.json (1200, not
  // 1200.4), and a fabricated ".0" on it would claim precision
  // route-meta.json doesn't carry, the same discipline D7 applies to the
  // darkness values themselves.
  function darknessDistanceLeadIn(coveredKm, statedDistanceKm, unitSystem) {
    if (statedDistanceKm == null) return '';
    if (Math.abs(coveredKm - statedDistanceKm) <= 5) return '';
    return darknessFmtDistance(coveredKm, 1, unitSystem) + ' of its '
      + darknessFmtDistance(Math.round(statedDistanceKm), 0, unitSystem) + ' sampled. ';
  }

  // selectNamedDarknessBands(counts) — D10's selection rule: rounded
  // whole-percent share, using the identical Math.round(100 × count /
  // total) already used to verify the D1 table itself (so this can
  // never silently disagree with it), bands at or above 5% only, sorted
  // descending by share. At least one band always qualifies whenever
  // total > 0 — five shares summing to 100 can't all sit under 5%.
  function selectNamedDarknessBands(counts) {
    var total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
    var bands = [];
    for (var i = 0; i < counts.length; i++) {
      var pct = total > 0 ? Math.round(100 * counts[i] / total) : 0;
      if (pct >= 5) bands.push({ name: DARKNESS_BAND_NAMES[i], pct: pct });
    }
    bands.sort(function (a, b) { return b.pct - a.pct; });
    return bands;
  }

  function capitalizeFirst(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // darknessCompositionSentence(bands) — D10's one/two/three-or-four
  // templates, over bands already selected and sorted by
  // selectNamedDarknessBands. Every branch ends the sentence with a
  // period — the "Rendered as" list in the spec omits it from the
  // three-or-four template's own line, but every one of D10's worked
  // examples carries it, so it is terminal punctuation, not a documented
  // omission.
  function darknessCompositionSentence(bands) {
    if (bands.length === 0) return '';
    if (bands.length === 1) {
      return capitalizeFirst(bands[0].name) + ', the whole way.';
    }
    if (bands.length === 2) {
      return 'Mostly ' + bands[0].name + ' (' + bands[0].pct + '%) and '
        + bands[1].name + ' (' + bands[1].pct + '%).';
    }
    var sentence = 'Mostly ' + bands[0].name + ' (' + bands[0].pct + '%) and '
      + bands[1].name + ' (' + bands[1].pct + '%), with some '
      + bands[2].name + ' (' + bands[2].pct + '%)';
    if (bands.length >= 4) {
      sentence += ' and ' + bands[3].name + ' (' + bands[3].pct + '%)';
    }
    return sentence + '.';
  }

  // darknessSummarySentence(darknessData, statedDistanceKm, unitSystem) —
  // D10. Pure: the ribbon's text equivalent (D11) — the same string
  // renderRibbon uses for both the svg's aria-label/<title> and the real
  // sibling <p> outside it (AC #5), so this function, not the DOM
  // wiring, is where "what does the sentence say" is actually decided.
  //
  // No route display name anywhere in the returned text. The route is
  // already established by whatever selected it — the picker above this
  // ribbon, the section it sits in — so restating it here would be pure
  // repetition, and it would break the aria-label/summary-paragraph
  // equivalence AC #5 checks at both ends of the band-count range (a
  // one-band route's sentence is short enough that a repeated route name
  // would dominate it, out of proportion with the four/five-band case).
  //
  // Two independent, orthogonal clauses bracket the composition
  // sentence: the distance lead-in (gated on the coveredKm/statedKm
  // gap, D3/D13) and the heldOutValidation trailing clause (D4). Both
  // Shikoku and Kumano get the trailing clause — D4 names both
  // explicitly ("Shikoku carries both this marking and D3's
  // coarsening... Kumano carries only this marking") — even though only
  // Shikoku's gap is wide enough to also trigger the lead-in.
  //
  // statedDistanceKm is route-meta.json's stated distanceKm for this
  // route, or null/undefined when unavailable — the lead-in simply
  // doesn't fire rather than throwing.
  function darknessSummarySentence(darknessData, statedDistanceKm, unitSystem) {
    var counts = darknessBandCounts(darknessData.values);
    var bands  = selectNamedDarknessBands(counts);

    var leadIn   = darknessDistanceLeadIn(darknessData.coveredKm, statedDistanceKm, unitSystem);
    var sentence = darknessCompositionSentence(bands);
    var trailing = darknessData.heldOutValidation === false
      ? ' Not checked against a ground reading here, the way the five Camino routes are.'
      : '';

    return leadIn + sentence + trailing;
  }

  var api = {
    PACE_PRESETS:    PACE_PRESETS,
    walkingMinutes:  walkingMinutes,
    buildICS:        buildICS,
    barDomainUTC:    barDomainUTC,

    DARKNESS_BAND_BOUNDS:      DARKNESS_BAND_BOUNDS,
    DARKNESS_BAND_NAMES:       DARKNESS_BAND_NAMES,
    darknessBandForValue:      darknessBandForValue,
    darknessBandCounts:        darknessBandCounts,
    darknessAggregateWindowKm: darknessAggregateWindowKm,
    mergeDarknessRuns:         mergeDarknessRuns,
    darknessSummarySentence:   darknessSummarySentence
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DaylightMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
