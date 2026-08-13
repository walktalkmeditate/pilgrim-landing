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

  // The ribbon's own drawable width, in the SVG viewBox's coordinate
  // units — RIBBON_X2 - RIBBON_X1 in js/daylight.js. That module defines
  // its RIBBON_W *from* this constant (not the reverse), so there is
  // exactly one number, not two that happen to agree today. Needed here,
  // in the pure math module, because mergeDarknessRuns's minimum-
  // drawable-run-width guard (below) has to agree with what the ribbon
  // will actually draw — the same discipline darknessBandKmShares already
  // applies so the summary sentence and the drawn strip read one shared
  // computation rather than two that happen to match most of the time.
  var DARKNESS_RIBBON_WIDTH = 504;

  /*
   * ribbonFracForKm(kmFromStart, coveredKm) — where a kilometre lands on
   * the ribbon's axis, as a clamped 0..1 fraction of its drawable width.
   *
   * js/daylight.js's kmToRibbonX is this plus the inset, and
   * js/night-math.js's isDrawableCell asks the same question of a cell's
   * two ends. They used to answer it separately: isDrawableCell tested
   * `hiKm > loKm` in KILOMETRES while the renderer additionally dropped
   * any span whose CLAMPED ends collapsed onto one edge. A cell placed
   * past the end of the darkness axis therefore counted as drawable — it
   * was named in the prose, labelled on the axis, and drew nothing.
   * One function, so "drawable" means the same thing in both places.
   */
  function ribbonFracForKm(kmFromStart, coveredKm) {
    if (!(coveredKm > 0)) return 0;
    return Math.max(0, Math.min(1, kmFromStart / coveredKm));
  }

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

  // absorbNarrowDarknessRuns(runs, minRunKm) — DECIDED (previously an open
  // question this file's own comment used to flag rather than answer):
  // any run narrower than one drawn pixel is absorbed into its
  // predecessor, not emitted. A band nobody can see is worse than a band
  // merged into its neighbour — it still costs a <line> element, an
  // unstable colour antialiasing will blend toward whatever sits next to
  // it (reading as neither neighbour, a tone that maps to no band), and a
  // share of the summary sentence's own accounting, since
  // darknessBandKmShares reads this same output.
  //
  // "One pixel" is coveredKm / DARKNESS_RIBBON_WIDTH — the identical
  // km-per-unit conversion kmToRibbonX (js/daylight.js) uses to place
  // every run, evaluated at the ribbon's own drawable width, so the
  // threshold means the same thing the drawing does. Applied to every
  // run, not only the final one: at 1 km sampling resolution drawn into
  // only DARKNESS_RIBBON_WIDTH units, a route far longer than
  // DARKNESS_RIBBON_WIDTH km necessarily produces runs narrower than a
  // pixel wherever the band flips within a short stretch — camino-
  // frances alone shipped 20 such runs across its 764 km, at desktop
  // width, before this guard existed (js/daylight-math.test.js).
  //
  // The threshold is one fixed, viewport-independent number rather than
  // something recomputed per breakpoint. Two reasons: first, it is
  // calibrated to the widest real rendering (near enough to desktop that
  // DARKNESS_RIBBON_WIDTH units render close to 1:1 with CSS px), the
  // most generous case, so nothing is absorbed here that could actually
  // be seen on any screen this page renders on. Second, and just as
  // load-bearing: mergeDarknessRuns's output is the one shared input the
  // strip and the summary sentence both read (darknessBandKmShares, and
  // the comment on DARKNESS_RIBBON_WIDTH above) — a threshold that varied
  // by viewport would mean the sentence and the strip could each be
  // looking at a different set of runs depending on which width last
  // recomputed them, reopening the exact class of drift Finding 1 closed.
  // The cost of one fixed threshold: a run just above it can still be
  // sub-pixel on a narrower viewport, since the same units compress into
  // fewer CSS px there. Closing that gap fully would mean either a
  // second, phone-calibrated threshold (discarding real, desktop-visible
  // detail to fix a mobile-only symptom) or a resize-reactive
  // recomputation (the drift risk just above) — both a bigger change than
  // this guard's job. What this guard does instead: removes every run
  // invisible on any screen the page renders on, and narrows, without
  // eliminating, the harder narrow-viewport case (camino-frances: 36 of
  // 128 runs under 1 CSS px at a 375px-wide ribbon before this guard, 12
  // of 108 after — js/daylight-math.test.js).
  function absorbNarrowDarknessRuns(runs, minRunKm) {
    if (runs.length <= 1) return runs;

    var out = [];
    for (var i = 0; i < runs.length; i++) {
      var r = { startKm: runs[i].startKm, endKm: runs[i].endKm, band: runs[i].band };
      var previous = out.length ? out[out.length - 1] : null;
      if (previous && (r.endKm - r.startKm) < minRunKm) {
        // Too narrow to draw: folds into whatever precedes it, so the
        // predecessor's band — not this run's — covers the span. This is
        // "into its predecessor" for every run except one with nothing
        // emitted before it yet, handled below.
        previous.endKm = r.endKm;
      } else if (previous && previous.band === r.band) {
        // Absorbing a narrow run leaves its predecessor and its successor
        // adjacent, and those two can share a band — mergeDarknessRuns
        // guarantees consecutive runs differ, and absorption used to break
        // that guarantee (camino-frances shipped 14 such adjacencies,
        // camino-norte 6). Two abutting semi-transparent <line>s composite
        // their antialiased edges in sequence, so the shared fractional
        // pixel lands up to ~0.10 alpha lighter than either run: a visible
        // hairline boundary drawn where the data has none, wider than the
        // 0.02 alpha step that separates bands 3 and 4. On a dashed route
        // the per-element dash-phase restart shows the same seam. Merging
        // them back into one run restores the invariant the rest of this
        // module (and darknessBandKmShares' own accounting) assumes.
        previous.endKm = r.endKm;
      } else {
        out.push(r);
      }
    }

    // A narrow leading run has no predecessor to absorb into when the
    // loop above reaches it — out is still empty, so it's pushed as-is.
    // Fold it forward into whatever comes after instead. A loop, not one
    // check, because absorbing it can leave a new first run that is
    // itself still narrower than minRunKm (several short runs in a row
    // at the very start of a route) — verified not to trigger on any of
    // the seven shipped routes, exercised only by adversarial fixtures
    // (js/daylight-math.test.js).
    while (out.length > 1 && (out[0].endKm - out[0].startKm) < minRunKm) {
      out[1].startKm = out[0].startKm;
      out.shift();
    }

    return out;
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
  // classification with EXACTLY zero width, zero pixels to draw it — the
  // narrowest possible case of the general absorbNarrowDarknessRuns pass
  // below, which now handles it (and every other sub-pixel run) the same
  // way, rather than a special case of its own.
  function mergeDarknessRuns(values, stepKm, coveredKm, aggregateWindowKm) {
    var n = values.length;
    var points;

    if (aggregateWindowKm === null) {
      points = values.map(function (v, i) {
        return { km: i * stepKm, band: darknessBandForValue(v) };
      });
    } else {
      var numWindows = Math.ceil(coveredKm / aggregateWindowKm);
      // Defence in depth behind js/daylight.js's own artifact shape guard:
      // a p90GapKm of 0 (or null) makes aggregateWindowKm 0, numWindows
      // Infinity, and the allocation loop below runs until the tab dies —
      // a frozen browser is a worse failure than a thrown error, and the
      // caller that reaches this without a shape check deserves the error
      // rather than the hang.
      if (!isFinite(numWindows) || numWindows < 1) {
        throw new Error('mergeDarknessRuns: coveredKm ' + coveredKm + ' over aggregateWindowKm '
          + aggregateWindowKm + ' yields ' + numWindows + ' windows — refusing to allocate.');
      }
      var buckets = [];
      for (var w = 0; w < numWindows; w++) buckets.push([]);
      for (var i = 0; i < n; i++) {
        var km = i * stepKm;
        var bucketIdx = Math.min(Math.floor(km / aggregateWindowKm), numWindows - 1);
        buckets[bucketIdx].push(values[i]);
      }
      var lastBand = null;
      points = buckets.map(function (bucketValues, w2) {
        // An empty window doesn't occur in any shipped route today
        // (verified directly against shikoku-88, the only route this path
        // runs for) — but a later window can still be empty in principle
        // (a real gap wider than aggregateWindowKm) while an earlier one
        // wasn't. Carrying the previous window's band forward there keeps
        // the tiling unbroken rather than crashing on an empty median.
        //
        // The one case that forward-fill can't cover honestly is the
        // FIRST empty window with no earlier band to carry — lastBand is
        // still its initial null then, and silently emitting
        // `band: null` used to reach the page as an invisible run (CSS
        // class `dl-ribbon-band-null` matches no rule). That shape means
        // values[] doesn't reach even the start of its own coveredKm, a
        // genuinely malformed artifact — this throws instead, so it
        // fails loud at the one point that actually knows what's wrong,
        // rather than quietly drawing nothing where something was meant
        // to be.
        var band;
        if (bucketValues.length) {
          band = darknessBandForValue(darknessMedian(bucketValues));
        } else if (lastBand !== null) {
          band = lastBand;
        } else {
          throw new Error('mergeDarknessRuns: window ' + w2 + ' (starting at km '
            + (w2 * aggregateWindowKm) + ') has no raw samples and no earlier window '
            + 'to carry a band forward from — values[] does not reach this window\'s span.');
        }
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

    return absorbNarrowDarknessRuns(runs, coveredKm / DARKNESS_RIBBON_WIDTH);
  }

  // darknessBandKmShares(runs) — like darknessBandCounts, but weighted by
  // each merged run's km span rather than raw sample count. Exists so the
  // summary sentence (darknessSummarySentence, below) and the ribbon's
  // drawn strip (renderRibbon, js/daylight.js) can share one aggregation:
  // both read the same mergeDarknessRuns output, so a route whose
  // positions are coarsened (D3 — shikoku-88's 40 km windows) reports the
  // composition of the WINDOWS actually drawn, not the raw 1 km samples
  // underneath them. Before this, the sentence tallied raw samples
  // (darknessBandCounts) while the strip drew merged runs — the same
  // route could get a different composition in words than on screen.
  // selectNamedDarknessBands's own total/pct math only ever computes a
  // ratio, so it needs no change to consume km totals instead of counts.
  function darknessBandKmShares(runs) {
    var kmByBand = [0, 0, 0, 0, 0];
    for (var i = 0; i < runs.length; i++) {
      kmByBand[runs[i].band] += (runs[i].endKm - runs[i].startKm);
    }
    return kmByBand;
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

  // darknessDistanceLeadIn — states the distance the ribbon covers, for
  // every route (Finding 6): the ribbon draws it as an SVG <text> inside
  // role="img", which flattens the subtree, so this sentence is the only
  // textual path a screen reader (or anyone reading the sibling summary
  // paragraph) has to it at all — renderSVG's own titleText comment
  // states the standard this sentence has to clear: "can describe
  // exactly what the bar draws below — never more, never less."
  //
  // Two branches, both always stating coveredKm:
  //   - a >5 km gap between the darkness artifact's own coveredKm and
  //     route-meta.json's stated distanceKm (D13's own verified table:
  //     six of seven routes agree to sub-1 km rounding; Shikoku alone
  //     disagrees, by 173.2 km between the two bakes) keeps D10's
  //     original "N of its M {unit} sampled" discrepancy framing —
  //     statedDistanceKm renders as a whole number, not forced to one
  //     decimal like coveredKm, since it is itself a round, published
  //     trail-length figure in route-meta.json (1200, not 1200.4), and a
  //     fabricated ".0" on it would claim precision route-meta.json
  //     doesn't carry, the same discipline D7 applies to the darkness
  //     values themselves.
  //   - anything else (no gap worth naming, or no statedDistanceKm to
  //     compare against at all) states coveredKm plainly, with no
  //     comparison to overstate.
  function darknessDistanceLeadIn(coveredKm, statedDistanceKm, unitSystem) {
    var covered = darknessFmtDistance(coveredKm, 1, unitSystem);
    if (statedDistanceKm != null && Math.abs(coveredKm - statedDistanceKm) > 5) {
      return covered + ' of its '
        + darknessFmtDistance(Math.round(statedDistanceKm), 0, unitSystem) + ' sampled. ';
    }
    return covered + ' sampled. ';
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

  // fmtBandShare(band) — the "{name} ({pct}%)" fragment every template
  // below builds from, so the two/three/four/five-band forms all read as
  // one shared shape rather than each spelling it out separately.
  function fmtBandShare(band) {
    return band.name + ' (' + band.pct + '%)';
  }

  // joinWithAnd(parts) — "A", "A and B", or "A, B and C" (no serial comma
  // before the final "and" — matches the two-item shape D10's own
  // three-or-four-band template already used: "C (c%) and D (d%)", no
  // comma). Used for whatever trails the fixed "Mostly A and B" opener
  // below, so a fifth qualifying band extends the same list rather than
  // needing a new sentence shape.
  function joinWithAnd(parts) {
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }

  // darknessCompositionSentence(bands) — D10's templates, over bands
  // already selected and sorted by selectNamedDarknessBands. Every branch
  // ends the sentence with a period — the "Rendered as" list in the spec
  // omits it from the three-or-more template's own line, but every one of
  // D10's worked examples carries it, so it is terminal punctuation, not
  // a documented omission.
  //
  // Bands beyond the fixed "Mostly A and B" opener form an n-ary
  // "with some X, Y and Z" list, not a fixed three-or-four-band template
  // with a cap at four: five bands can all qualify (five real shares
  // summing to 100, each individually >=5%), and the fixed template used
  // to just stop naming after the fourth, silently dropping a fifth real,
  // qualifying band from the sentence. joinWithAnd generalizes the exact
  // same "C (c%) and D (d%)" shape the old template used for its own
  // two-item tail, so every one/two/three/four-band sentence this
  // function already produced is byte-identical to before — only a fifth
  // band (never produced by any of the seven shipped routes today) is
  // new behaviour.
  function darknessCompositionSentence(bands) {
    if (bands.length === 0) return '';
    if (bands.length === 1) {
      return capitalizeFirst(bands[0].name) + ', the whole way.';
    }
    if (bands.length === 2) {
      return 'Mostly ' + fmtBandShare(bands[0]) + ' and ' + fmtBandShare(bands[1]) + '.';
    }
    var rest = bands.slice(2).map(fmtBandShare);
    return 'Mostly ' + fmtBandShare(bands[0]) + ' and ' + fmtBandShare(bands[1])
      + ', with some ' + joinWithAnd(rest) + '.';
  }

  // darknessBandStatsInRange(runs, lo, hi) — the km-weighted mean band
  // index and the single dominant (plurality-share) band, both restricted
  // to the [lo, hi) slice of the route. One pass over runs computes the
  // per-band km totals; both figures are derived from that one array
  // rather than walking runs twice. Used only by darknessPositionalClause
  // below — it needs two different questions answered about the same
  // slice ("how dark on average" to pick which third is darkest, "which
  // single band actually dominates" to decide whether that's worth
  // saying), not one.
  function darknessBandStatsInRange(runs, lo, hi) {
    var span = hi - lo;
    var kmByBand = [0, 0, 0, 0, 0];
    for (var i = 0; i < runs.length; i++) {
      var overlapLo = Math.max(runs[i].startKm, lo);
      var overlapHi = Math.min(runs[i].endKm, hi);
      var overlap   = overlapHi - overlapLo;
      if (overlap > 0) kmByBand[runs[i].band] += overlap;
    }
    var dominantBand = 0;
    var weightedSum  = 0;
    for (var b = 0; b < 5; b++) {
      weightedSum += kmByBand[b] * b;
      // >=, not >: an exact tie between two bands' km totals goes to the
      // DARKER of them, the same rule darknessBandForValue already applies
      // to a value sitting exactly on a band boundary. A strict > would
      // hand every tie to the brighter band purely because this loop
      // ascends, which is not a decision anyone made — and it silently
      // deleted a real clause: camino-frances's last third comes out at
      // kmByBand[3] === kmByBand[4] === 100 exactly (sub-pixel absorption
      // moved one kilometre from band 2 into band 3), so the brighter
      // band 3 won the tie, matched the first third's dominant band, and
      // Gate 2 below silenced "Darkest near the end." — against a
      // last-third mean of 3.136 vs 2.664 and 100 km of "as it was".
      if (kmByBand[b] >= kmByBand[dominantBand]) dominantBand = b;
    }
    return { mean: span > 0 ? weightedSum / span : 0, dominantBand: dominantBand };
  }

  // POSITION_THIRD_NAMES — index-aligned with the three equal-length
  // slices darknessPositionalClause divides a route into, start to end.
  var POSITION_THIRD_NAMES = ['near the start', 'through the middle stretch', 'near the end'];

  // darknessPositionalClause(runs, coveredKm) — Finding 3. The composition
  // sentence says how much of each band; this says coarsely where, using
  // the same merged runs already computed for it (one aggregation, D3,
  // shared by both — the same discipline Finding 1 applies to the
  // percentages themselves). Thirds, not kilometre markers: D7 caps what
  // any single sample can defend to about ±0.32 mag, comfortably inside
  // one band's width (D1), so a boundary finer than "start / middle /
  // end" would claim more precision than the data carries.
  //
  // Two gates, not one numeric threshold invented for this function
  // alone:
  //   1. The darkest third (by km-weighted mean band index) must differ
  //      from the brightest third — trivially false for a single-run
  //      route (Kumano, D6) or any route whose thirds happen to average
  //      out identically.
  //   2. Those two thirds' own DOMINANT bands (the one band that actually
  //      occupies the most km within each third) must also differ. A
  //      route can have unequal means yet still be dominated by the same
  //      band everywhere — Camino Portugués is ~66% countryside start to
  //      finish, and its thirds' means do drift a little, but every third
  //      is still countryside-dominated. Gate 2 is what keeps that route
  //      silent here rather than naming a "darkest third" that isn't
  //      actually a different kind of place.
  //
  // Always phrased from the darkest side ("Darkest {position}.") rather
  // than switching between "darkest"/"brightest" — one branch, one voice,
  // and the composition sentence already established that "how dark" is
  // this instrument's whole subject.
  function darknessPositionalClause(runs, coveredKm) {
    if (!runs || runs.length <= 1 || !(coveredKm > 0)) return '';

    var thirdKm = coveredKm / 3;
    var bounds = [
      [0, thirdKm],
      [thirdKm, 2 * thirdKm],
      [2 * thirdKm, coveredKm]
    ];
    var stats = bounds.map(function (b) { return darknessBandStatsInRange(runs, b[0], b[1]); });

    var darkestIdx   = 0;
    var brightestIdx = 0;
    for (var i = 1; i < 3; i++) {
      if (stats[i].mean > stats[darkestIdx].mean)   darkestIdx   = i;
      if (stats[i].mean < stats[brightestIdx].mean) brightestIdx = i;
    }
    if (darkestIdx === brightestIdx) return '';
    if (stats[darkestIdx].dominantBand === stats[brightestIdx].dominantBand) return '';

    return ' Darkest ' + POSITION_THIRD_NAMES[darkestIdx] + '.';
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
  // sentence: the distance lead-in (Finding 6 — always states coveredKm;
  // the "N of its M" discrepancy framing within it is what's gated on
  // the coveredKm/statedKm gap, D3/D13) and the heldOutValidation
  // trailing clause (D4). Both Shikoku and Kumano get the trailing
  // clause — D4 names both explicitly ("Shikoku carries both this
  // marking and D3's coarsening... Kumano carries only this marking") —
  // even though only Shikoku's gap is wide enough to also trigger the
  // discrepancy framing.
  //
  // statedDistanceKm is route-meta.json's stated distanceKm for this
  // route, or null/undefined when unavailable — the lead-in still states
  // coveredKm plainly rather than throwing, it just has nothing to
  // compare it against.
  //
  // Shares come from the same mergeDarknessRuns output renderRibbon draws
  // (via darknessBandKmShares), not a raw tally of darknessData.values
  // (that was darknessBandCounts, still used standalone for D1's own
  // per-kilometre distribution table). For six of the seven shipped
  // routes the two agree to within a point of rounding — one sample
  // already is one kilometre. Shikoku is the exception: D3's 40 km
  // windows mean the picture and a raw per-kilometre tally describe two
  // different aggregations of the same route, and used to say so
  // differently (a raw "17% countryside" against a drawn 11%). Reusing
  // mergeDarknessRuns's own output here is what makes that impossible —
  // the sentence and the strip now share one computation, not two that
  // happen to agree most of the time.
  function darknessSummarySentence(darknessData, statedDistanceKm, unitSystem) {
    var windowKm = darknessAggregateWindowKm(darknessData.positionalConfidence);
    var runs     = mergeDarknessRuns(darknessData.values, darknessData.stepKm, darknessData.coveredKm, windowKm);
    var shares   = darknessBandKmShares(runs);
    var bands    = selectNamedDarknessBands(shares);

    var leadIn     = darknessDistanceLeadIn(darknessData.coveredKm, statedDistanceKm, unitSystem);
    var sentence   = darknessCompositionSentence(bands);
    var positional = darknessPositionalClause(runs, darknessData.coveredKm);
    // !== true, not === false (Finding 5): a missing field or a malformed
    // non-boolean value must read as unvalidated, not as trustworthy —
    // mirrors the identical guard on the dashed stroke in
    // js/daylight.js's renderRibbon, so the shape and the words never
    // disagree about which routes are validated.
    var trailing = darknessData.heldOutValidation !== true
      ? ' Not checked against a ground reading here, the way the five Camino routes are.'
      : '';

    return leadIn + sentence + positional + trailing;
  }

  // Nights per stage on a route whose stages are too coarse to be days.
  // 25 km is a stated assumption, not a measurement — spec D3 records it
  // here rather than leaving it as an unexplained constant, because it is
  // the one place this slice asserts something the data does not give.
  var BLOCK_KM_PER_NIGHT = 25;

  // How close the stage distances must sum to the darkness axis before
  // cumulative placement is trusted. Kumano is the tightest real case at
  // 0.5 km of slack; shikoku misses by 173.2 km.
  var TILING_TOLERANCE_KM = 1.0;

  // stagePlacements(stages, coveredKm) — put each stage on the darkness
  // artifact's kilometre axis and say how many nights it is.
  //
  // Two methods, chosen by measuring rather than by a hardcoded route
  // list: if the stage distances sum to coveredKm they are consecutive
  // spans of the same line, so placement is cumulative and each stage is
  // one night (their stages are 11-40 km, which is how those routes are
  // published and how the rest of this page already treats a stage).
  //
  // Shikoku's do not sum — distanceKm is an editorial per-stage estimate
  // that under-counts the axis by 173.2 km — but its waypoints carry true
  // route-cumulative positions spanning 0 to 1080.5. It places by those,
  // and because its stages run 19-200 km they become blocks of several
  // nights. Its clusters do not tile: 288.1 km, 27% of the route, falls
  // between them and is deliberately left unplaced rather than
  // interpolated over.
  //
  // Throws when neither method fits. A wrong axis would draw a strip that
  // looks right and means nothing, which is the failure this whole
  // instrument has spent three slices learning to refuse.
  function stagePlacements(stages, coveredKm) {
    var sum = 0, i;
    for (i = 0; i < stages.length; i++) sum += stages[i].distanceKm;

    if (Math.abs(sum - coveredKm) <= TILING_TOLERANCE_KM) {
      var cursor = 0;
      var last = stages.length - 1;
      return stages.map(function (s, idx) {
        var lo = Math.min(cursor, coveredKm);
        cursor += s.distanceKm;
        // The last stage ends exactly at coveredKm, and the rest are
        // clamped to it. "Tiles" is a 1 km tolerance, not an identity,
        // and it misses in both directions: kumano's stages sum to 38.5
        // against a 38.0 km axis (so an unclamped last stage would draw
        // past the strip's right edge), while camino-frances sums to
        // 763.6999999999998 against 763.7 (so it would stop a hair short
        // of the ribbon's own final pixel, and two strips that share an
        // axis would visibly disagree about where the route ends).
        var hi = (idx === last) ? coveredKm : Math.min(cursor, coveredKm);
        return { index: idx, loKm: lo, hiKm: hi, nights: 1, isBlock: false };
      });
    }

    var placements = [];
    for (i = 0; i < stages.length; i++) {
      var wp = stages[i].waypoints;
      if (!wp || wp.length < 2) continue;
      var lo = wp[0].kmFromStart;
      var hi = wp[wp.length - 1].kmFromStart;
      if (!(hi > lo)) continue;
      var nights = Math.max(1, Math.round((hi - lo) / BLOCK_KM_PER_NIGHT));
      placements.push({ index: i, loKm: lo, hiKm: hi, nights: nights, isBlock: nights > 1 });
    }

    if (!placements.length) {
      throw new Error('stagePlacements: stage distances sum to ' + sum.toFixed(1)
        + ' km against a ' + coveredKm.toFixed(1) + ' km darkness axis, and no stage '
        + 'carries two waypoints to place it by — refusing to guess an axis.');
    }
    return placements;
  }

  var MS_PER_DAY = 86400000;

  // nightSchedule(placements, startDate) — the cells the moon strip
  // draws. One per placement, carrying the dates of the nights it spans:
  // a day-sized stage carries one, a shikoku block carries several, which
  // is what lets a block state a phase range (D5) instead of a phase.
  //
  // Night numbering is 1-based and runs continuously across blocks, so
  // "night 27" means the twenty-seventh night of the walk on every route.
  function nightSchedule(placements, startDate) {
    var night = 0;
    return placements.map(function (p) {
      var dates = [];
      for (var i = 0; i < p.nights; i++) {
        dates.push(new Date(startDate.getTime() + (night + i) * MS_PER_DAY));
      }
      var firstNight = night + 1;
      night += p.nights;
      return {
        index:      p.index,
        loKm:       p.loKm,
        hiKm:       p.hiKm,
        nights:     p.nights,
        isBlock:    p.isBlock,
        firstNight: firstNight,
        dates:      dates
      };
    });
  }

  var api = {
    PACE_PRESETS:    PACE_PRESETS,
    walkingMinutes:  walkingMinutes,
    buildICS:        buildICS,
    barDomainUTC:    barDomainUTC,

    DARKNESS_BAND_BOUNDS:        DARKNESS_BAND_BOUNDS,
    DARKNESS_BAND_NAMES:         DARKNESS_BAND_NAMES,
    DARKNESS_RIBBON_WIDTH:       DARKNESS_RIBBON_WIDTH,
    ribbonFracForKm:             ribbonFracForKm,
    darknessBandForValue:        darknessBandForValue,
    darknessBandCounts:          darknessBandCounts,
    darknessBandKmShares:        darknessBandKmShares,
    darknessMedian:              darknessMedian,
    darknessAggregateWindowKm:   darknessAggregateWindowKm,
    absorbNarrowDarknessRuns:    absorbNarrowDarknessRuns,
    mergeDarknessRuns:           mergeDarknessRuns,
    selectNamedDarknessBands:    selectNamedDarknessBands,
    darknessCompositionSentence: darknessCompositionSentence,
    darknessPositionalClause:    darknessPositionalClause,
    darknessSummarySentence:     darknessSummarySentence,
    darknessBandStatsInRange:    darknessBandStatsInRange,

    BLOCK_KM_PER_NIGHT: BLOCK_KM_PER_NIGHT,
    stagePlacements:    stagePlacements,
    nightSchedule:      nightSchedule
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DaylightMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
