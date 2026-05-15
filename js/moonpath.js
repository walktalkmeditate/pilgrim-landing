/* =============================================
   Moon Path — page controller

   Two-layer architecture:
     Inner core   — recompute(state): pure function, no DOM, no async
     Outer shell  — DOM glue, only runs in browser

   Export shape:
     Browser → window.MoonPath = { recompute, parseParams, nearestPortFor,
                                   luxBracketFor, apparentSizePercentString,
                                   earthshineVisibleFor,
                                   scrubberValueToInstant,
                                   instantToScrubberValue }
     Node    → module.exports  = { recompute, parseParams, nearestPortFor,
                                   luxBracketFor, apparentSizePercentString,
                                   earthshineVisibleFor,
                                   scrubberValueToInstant,
                                   instantToScrubberValue }

   The outer shell only wires DOM listeners when
   typeof window !== 'undefined' && typeof document !== 'undefined'.

   navigator.geolocation appears once in this file — inside the
   locate-button click handler only (AC #19 / D4 geolocation discipline).
   ============================================= */

(function (root) {
  'use strict';

  /* ==========================================
     Deps — loaded in browser via <script> tags,
     required in Node for tests.
     ========================================== */

  var SunPathMath = (typeof root !== 'undefined' && root.SunPathMath)
    ? root.SunPathMath
    : (typeof require === 'function' ? require('./sunpath-math.js') : null);

  /* ==========================================
     URL parsing
     ========================================== */

  function parseParams(searchString) {
    var result = {
      lat:  null,
      lon:  null,
      date: null
    };

    if (!searchString || searchString.length < 2) return result;

    var pairs = searchString.slice(1).split('&');
    pairs.forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx === -1) return;
      var k = decodeURIComponent(pair.slice(0, idx));
      var v = decodeURIComponent(pair.slice(idx + 1));

      switch (k) {
        case 'lat':  result.lat  = v; break;
        case 'lon':  result.lon  = v; break;
        case 'date': result.date = v; break;
      }
    });

    var lat = parseFloat(result.lat);
    var lon = parseFloat(result.lon);

    if (isNaN(lat) || lat < -90  || lat > 90)  result.lat  = null;
    if (isNaN(lon) || lon < -180 || lon > 180) result.lon  = null;

    if (result.date && !/^\d{4}-\d{2}-\d{2}$/.test(result.date)) {
      result.date = null;
    }

    return result;
  }

  /* ==========================================
     Tide Math — loaded in browser via <script>,
     required in Node for tests.
     ========================================== */

  var TideMath = (typeof root !== 'undefined' && root.TideMath)
    ? root.TideMath
    : (typeof require === 'function' ? require('./tide-math.js') : null);

  /* ==========================================
     Port proximity — haversine distance to each baked port.
     D23: 200 km closed-left (≤200 visible), open-right (>200 hidden).
     Returns { port, distanceKm } — always returns nearest port.
     Caller checks distanceKm > 200 for visibility.
     ========================================== */

  var EARTH_R_KM = 6371;

  function haversineKm(lat1, lon1, lat2, lon2) {
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return EARTH_R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearestPortFor(lat, lon, ports) {
    if (!ports || ports.length === 0) return null;
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < ports.length; i++) {
      var p = ports[i];
      var d = haversineKm(lat, lon, p.lat, p.lon);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return { port: best, distanceKm: bestDist };
  }

  /* ==========================================
     Spring/neap state — D10 5-state table.
     Keyed on days-since-previous-syzygy (0 to ~14.77 days, since new/full
     alternate every half-synodic-period).  Returns verbatim D10 prose.
     ========================================== */

  function springNeapStateFromDays(daysSinceLastSyzygy, lastSyzygyKind) {
    var d = daysSinceLastSyzygy;
    if (d <= 2)  return 'Spring tides this week (' + lastSyzygyKind + ' moon)';
    if (d <= 4)  return 'Tide range trending toward neap';
    if (d <= 9)  return 'Neap tides — sun and moon pull at right angles';
    if (d <= 11) return 'Tide range trending toward spring';
    return 'Spring tides approaching';
  }

  // Stable classifier key matching springNeapStateFromDays brackets — used by
  // interstitialFor lookups so adjacent "Tide range..." or "Spring tides..."
  // prose strings don't collide under first-word matching.
  function springNeapKeyFromDays(daysSinceLastSyzygy) {
    var d = daysSinceLastSyzygy;
    if (d <= 2)  return 'spring_now';
    if (d <= 4)  return 'tide_to_neap';
    if (d <= 9)  return 'neap_now';
    if (d <= 11) return 'tide_to_spring';
    return 'spring_approaching';
  }

  /*
   * computeSpringNeapState(now) — determine the D10 5-state annotation.
   * Finds the most recent prior syzygy (new or full) and its kind,
   * then classifies by days-since-then.  Returns null when math
   * helpers aren't available.
   */
  function computeSpringNeapState(now) {
    if (!SunPathMath) return { prose: null, key: null };

    var nowMs = now.getTime();
    // Look back ~32 days to make sure the next-syzygy search lands BEFORE now
    // (each cycle is ~29.53 days; 32 days guarantees we walk at least one
    // syzygy of each kind without including or skipping the current one).
    var lookback = new Date(nowMs - 32 * 86400000);

    var prevNew  = SunPathMath.syzygyMomentAfter(lookback, 'new');
    var prevFull = SunPathMath.syzygyMomentAfter(lookback, 'full');
    if (!prevNew || !prevFull) return { prose: null, key: null };

    // Of the candidate previous syzygies, pick the most recent one that is
    // still strictly before `now`. (syzygyMomentAfter returns the next-after-
    // lookback instant — usually before now, but can land slightly after if
    // lookback is close to a syzygy.)
    var candidates = [
      { ms: prevNew.utcMs,  kind: 'new'  },
      { ms: prevFull.utcMs, kind: 'full' }
    ].filter(function (c) { return c.ms < nowMs; });

    if (candidates.length === 0) return { prose: null, key: null };

    var last = candidates.reduce(function (acc, c) {
      return c.ms > acc.ms ? c : acc;
    });

    var daysSince = (nowMs - last.ms) / 86400000;
    return {
      prose: springNeapStateFromDays(daysSince, last.kind),
      key:   springNeapKeyFromDays(daysSince)
    };
  }

  /* ==========================================
     King-tide detection — D17 + D21.
     Walks forward 30 days from now, finds next perigee,
     checks if any syzygy (new or full) falls within ±3 days.
     Returns boolean.
     ========================================== */

  function computeKingTideUpcoming(now) {
    if (!SunPathMath) return false;

    var perigee = SunPathMath.perigeeMomentAfter(now);
    if (!perigee) return false;

    var perigeeMs = perigee.utcMs;
    var nowMs = now.getTime();

    if (perigeeMs - nowMs > 30 * 86400000) return false;

    var perigeeDate = new Date(perigeeMs);
    var WINDOW_MS = 3 * 86400000;

    var nextNew  = SunPathMath.syzygyMomentAfter(perigeeDate, 'new');
    var nextFull = SunPathMath.syzygyMomentAfter(perigeeDate, 'full');

    var SYNODIC_MS = 29.53059 * 86400000;

    var checkNew  = nextNew  ? Math.min(Math.abs(nextNew.utcMs  - perigeeMs), SYNODIC_MS - Math.abs(nextNew.utcMs  - perigeeMs)) : Infinity;
    var checkFull = nextFull ? Math.min(Math.abs(nextFull.utcMs - perigeeMs), SYNODIC_MS - Math.abs(nextFull.utcMs - perigeeMs)) : Infinity;

    return checkNew <= WINDOW_MS || checkFull <= WINDOW_MS;
  }

  /* ==========================================
     Slice 4 pure helpers
     ========================================== */

  /*
   * earthshineVisibleFor(k) — D7 threshold [0.03, 0.15].
   * k is the illuminated-disk fraction, 0..1.
   * Returns true only inside the closed interval [0.03, 0.15].
   */
  function earthshineVisibleFor(k) {
    return k >= 0.03 && k <= 0.15;
  }

  /*
   * apparentSizePercentString(distanceKm) — D14 + D16.
   * Computes percentage offset of tonight's apparent angular diameter vs mean.
   * Formula: (meanDistance / todayDistance − 1) × 100 (D16).
   * Formatted to one decimal place (D14).
   * Returns e.g. "4.3% larger than average" or "2.1% smaller than average".
   */
  var MEAN_DISTANCE_KM = 384400;

  function apparentSizePercentString(distanceKm) {
    var pct = (MEAN_DISTANCE_KM / distanceKm - 1) * 100;
    var absPct = Math.abs(pct);
    var rounded = Math.round(absPct * 10) / 10;
    var word = pct >= 0 ? 'larger' : 'smaller';
    return rounded.toFixed(1) + '% ' + word + ' than average';
  }

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

  /* ==========================================
     Date scrubber math — D24 log scale, base 1.0293
     ========================================== */

  var SCRUBBER_BASE = 1.0293;
  var SCRUBBER_LOG_BASE = Math.log(SCRUBBER_BASE);

  /*
   * scrubberValueToInstant(i, nowMs) — convert integer tick i to ms timestamp.
   * Formula: daysFromNow(i) = sign(i) * (1.0293^|i| - 1)
   * i=0 returns exactly nowMs (no rounding at center).
   * D24: tick range ±500 maps to approx ±5150 yr.
   */
  function scrubberValueToInstant(i, nowMs) {
    if (i === 0) return nowMs;
    var sign = i > 0 ? 1 : -1;
    var absI = Math.abs(i);
    var daysFromNow = sign * (Math.pow(SCRUBBER_BASE, absI) - 1);
    return nowMs + Math.round(daysFromNow * 86400000);
  }

  /*
   * instantToScrubberValue(ms, nowMs) — algebraic inverse of scrubberValueToInstant.
   * daysDiff = (ms - nowMs) / 86_400_000
   * i = sign(daysDiff) * round( ln(|daysDiff| + 1) / ln(1.0293) )
   * Clamped to [-500, 500].
   * Round-trip property: instantToScrubberValue(scrubberValueToInstant(i, n), n) ≈ i ±1.
   */
  function instantToScrubberValue(ms, nowMs) {
    var daysDiff = (ms - nowMs) / 86400000;
    if (daysDiff === 0) return 0;
    var sign = daysDiff > 0 ? 1 : -1;
    var absDays = Math.abs(daysDiff);
    var i = sign * Math.round(Math.log(absDays + 1) / SCRUBBER_LOG_BASE);
    if (i < -500) i = -500;
    if (i >  500) i =  500;
    return i;
  }

  /* ==========================================
     Inner core — pure computation
     ========================================== */

  /*
   * recompute(state) — pure inner core, no DOM side-effects.
   *
   * state fields:
   *   lat         — string or number, decimal degrees
   *   lon         — string or number, decimal degrees
   *   now         — Date (or absent → current wall clock). The scrubber-controlled instant.
   *   nowOriginal — optional Date or ms number. The true wall-clock "now" captured at page load.
   *                 When absent, defaults to state.now (backward-compat: v1 tests pass unchanged).
   *                 Used for D30 tide window: |now - nowOriginal| ≤ 30 × 86_400_000 ms shows curve;
   *                 outside that window shows a fallback line.
   *   ports       — array of tide-port objects (optional)
   */
  function recompute(state) {
    if (!state || state.lat === null || state.lon === null) {
      return { ready: false };
    }

    var lat = parseFloat(state.lat);
    var lon = parseFloat(state.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return { ready: false };
    }

    var now = state.now instanceof Date ? state.now : new Date();

    // nowOriginal: when absent defaults to `now` for back-compat (v1 callers).
    var nowOriginal;
    if (state.nowOriginal instanceof Date) {
      nowOriginal = state.nowOriginal;
    } else if (typeof state.nowOriginal === 'number') {
      nowOriginal = new Date(state.nowOriginal);
    } else {
      nowOriginal = now;
    }

    if (!SunPathMath) {
      return { ready: false, error: 'SunPathMath not loaded' };
    }

    // --- Phase and illuminated-disk fraction (D13) ---
    var phase = SunPathMath.moonPhaseAtUTC(now);
    // D13: k = (1 − cos(2π · phase)) / 2.  Inline per plan — not a slice-1 helper.
    var k = (1 - Math.cos(2 * Math.PI * phase)) / 2;

    // --- Altitude / azimuth ---
    var moonAltAz = SunPathMath.moonAltAzAt(now, lat, lon);
    var isMoonBelowHorizon = moonAltAz.altitude <= 0;

    // --- Distance and apparent size ---
    var distResult = SunPathMath.moonDistanceAt(now);
    var moonDistanceKm = distResult.distanceKm;
    var diamResult = SunPathMath.apparentDiameterAt(now);
    var moonApparentDiameterDeg = diamResult.diameterDeg;

    // --- Lux ---
    var moonLuxAtCoord = moonLuxAt(k, moonAltAz.altitude);

    // --- Moonrise / moonset for the arc diagram ---
    var moonrise = SunPathMath.moonriseUTC(lat, lon, now);
    var moonset  = SunPathMath.moonsetUTC(lat, lon, now);

    // --- Tide fields (D9: gated by 200 km threshold + D30: ±30 day window) ---
    var ports = state.ports || null;
    var portResult = ports ? nearestPortFor(lat, lon, ports) : null;
    var nearestPort = portResult ? portResult.port : null;
    var nearestPortDistanceKm = portResult ? portResult.distanceKm : Infinity;
    var tideVisible = nearestPortDistanceKm <= 200;

    // D30: tide curve only within ±30 days of nowOriginal (inclusive boundary)
    var TIDE_WINDOW_MS = 30 * 86400000;
    var tideInWindow = Math.abs(now.getTime() - nowOriginal.getTime()) <= TIDE_WINDOW_MS;

    var tideHeights24h = null;
    var tideOutOfWindow = false;
    var springNeapState = null;
    var springNeapKey   = null;
    var kingTideUpcoming = false;

    if (tideVisible && nearestPort && TideMath) {
      if (tideInWindow) {
        // Sample tide heights at 30-min intervals across -24h to +24h
        var nowMs = now.getTime();
        var samples = [];
        for (var s = -48; s <= 48; s++) {
          var sMs = nowMs + s * 30 * 60 * 1000;
          var h = TideMath.harmonicTideHeightM(sMs / 1000, nearestPort.constituents);
          samples.push({ offsetMin: s * 30, heightM: h, timeMs: sMs });
        }
        tideHeights24h = samples;
      } else {
        tideOutOfWindow = true;
      }
    }

    if (tideVisible) {
      var snResult = computeSpringNeapState(now);
      springNeapState = snResult.prose;
      springNeapKey   = snResult.key;
      kingTideUpcoming = computeKingTideUpcoming(now);
    }

    // --- Moonrise azimuth (D28) ---
    var moonriseAzimuthDeg = SunPathMath.moonriseAzimuthAt(now, lat, lon);

    // --- Eclipse pointer (D26, D27) ---
    // Gate: |scrubYear - originalYear| > ECLIPSE_VALID_YR_RANGE → null.
    // Boundary at exactly ±3000 yr is inclusive (not null).
    var scrubYear    = now.getFullYear();
    var originalYear = nowOriginal.getFullYear();
    var nextSolarEclipse = null;
    var nextLunarEclipse = null;
    if (Math.abs(scrubYear - originalYear) <= ECLIPSE_VALID_YR_RANGE) {
      nextSolarEclipse = SunPathMath.nextSolarEclipseAfter(now, lat, lon);
      nextLunarEclipse = SunPathMath.nextLunarEclipseAfter(now, lat, lon);
    }

    return {
      ready:                    true,
      lat:                      lat,
      lon:                      lon,
      now:                      now,
      nowOriginal:              nowOriginal,
      moonPhase:                phase,
      moonK:                    k,
      moonAltAz:                moonAltAz,
      isMoonBelowHorizon:       isMoonBelowHorizon,
      moonDistanceKm:           moonDistanceKm,
      moonApparentDiameterDeg:  moonApparentDiameterDeg,
      moonLuxAtCoord:           moonLuxAtCoord,
      moonrise:                 moonrise,
      moonset:                  moonset,
      moonriseAzimuthDeg:       moonriseAzimuthDeg,
      isCircumpolar:            moonriseAzimuthDeg === null,
      nextSolarEclipse:         nextSolarEclipse,
      nextLunarEclipse:         nextLunarEclipse,
      nearestPort:              nearestPort,
      nearestPortDistanceKm:    nearestPortDistanceKm,
      tideHeights24h:           tideHeights24h,
      tideOutOfWindow:          tideOutOfWindow,
      springNeapState:          springNeapState,
      springNeapKey:            springNeapKey,
      kingTideUpcoming:         kingTideUpcoming
    };
  }

  /* ==========================================
     Phase name from synodic phase fraction
     ========================================== */

  function phaseName(phase) {
    if (phase < 0.0625)  return 'new moon';
    if (phase < 0.1875)  return 'waxing crescent';
    if (phase < 0.3125)  return 'first quarter';
    if (phase < 0.4375)  return 'waxing gibbous';
    if (phase < 0.5625)  return 'full moon';
    if (phase < 0.6875)  return 'waning gibbous';
    if (phase < 0.8125)  return 'last quarter';
    if (phase < 0.9375)  return 'waning crescent';
    return 'new moon';
  }

  /* ==========================================
     Slice 5 pure helpers — standstill
     ========================================== */

  var CURRENT_YEAR = new Date().getFullYear();
  // Range is ±5,000 yr per D20, floor-extended to reach all three archaeo sites.
  // Newgrange at -3200 requires min ≤ -3200; for any CURRENT_YEAR < 8200,
  // CURRENT_YEAR-5000 won't reach it, so we floor-extend to -3250.
  var STANDSTILL_SLIDER_MIN = Math.min(CURRENT_YEAR - 5000, -3250);
  var STANDSTILL_SLIDER_MAX = CURRENT_YEAR + 5000;

  /*
   * ARCHAEO_CALLOUTS — fixed table of archaeological sites with known
   * lunar standstill alignments.  Fires when |sliderYear - site.year| <= 50.
   * Callouts fire by year-match, not by computed standstill math —
   * so the accuracy envelope at -3200 does not gate the Newgrange callout.
   */
  var ARCHAEO_CALLOUTS = [
    {
      site:  'Callanish',
      year:  -1800,
      prose: 'Outer Hebrides — major standstill alignment observed at the Callanish stones.'
    },
    {
      site:  'Newgrange',
      year:  -3200,
      prose: 'Boyne Valley — winter-moonrise alignment at the megalithic passage tomb.'
    },
    {
      site:  'Chimney Rock',
      year:  1100,
      prose: 'Chacoan outlier — major standstill moonrise framed between the rock spires.'
    }
  ];

  /*
   * activeCalloutsFor(sliderYear) — returns the subset of ARCHAEO_CALLOUTS
   * whose |site.year - sliderYear| <= 50.
   */
  function activeCalloutsFor(sliderYear) {
    return ARCHAEO_CALLOUTS.filter(function (c) {
      return Math.abs(c.year - sliderYear) <= 50;
    });
  }

  /* ==========================================
     Slice 3 — Cardinal prose helper (D28)
     ========================================== */

  /*
   * cardinalProseFor(bearingDeg) — 8-bucket compass-direction lookup.
   * Domain: [0, 360) — callers must ensure input is in this range.
   * Half-open buckets: closed-left, open-right. Boundary values land in
   * the upper bucket (e.g. 22.5 → "northeast", not "due north").
   * Due-north wraps: [337.5, 360) ∪ [0, 22.5) → "due north".
   */
  function cardinalProseFor(bearingDeg) {
    if (bearingDeg >= 337.5 || bearingDeg < 22.5)  return 'due north';
    if (bearingDeg < 67.5)                          return 'northeast';
    if (bearingDeg < 112.5)                         return 'due east';
    if (bearingDeg < 157.5)                         return 'southeast';
    if (bearingDeg < 202.5)                         return 'due south';
    if (bearingDeg < 247.5)                         return 'southwest';
    if (bearingDeg < 292.5)                         return 'due west';
    return 'northwest';
  }

  /* ==========================================
     Slice 5 — Interstitial prose system
     ========================================== */

  /*
   * INTERSTITIAL_TABLE — static lookup for the 8 prose slots between widget sections.
   * Shape: { sectionId → { stateKey → prose } }
   * State keys:
   *   'isCircumpolar:true'           — moon does not rise that day
   *   'isMoonBelowHorizon:true'      — moon below horizon at query time
   *   'springNeapState:<value>'      — first word(s) of the D10 state string
   *   'k_bucket:<label>'             — from luxBracketFor(lux).label
   *   'default'                      — always present, always '' (hides element)
   *
   * Priority order in interstitialFor (most specific first):
   *   isCircumpolar > isMoonBelowHorizon > springNeapState > k_bucket > default
   *
   * Curated count: 28 non-default strings across 8 slots (≥3 per slot, within [24,32]).
   * Voice: contemplative, present tense, 8–16 words, no exclamation marks, no HTML.
   */
  var INTERSTITIAL_TABLE = {
    'between-dome-and-azimuth': {
      'isCircumpolar:true':       'Tonight the moon arcs without touching the horizon — circumpolar.',
      'isMoonBelowHorizon:true':  'The moon is below the horizon at this hour; patience.',
      'k_bucket:bright':          'A bright moon draws a long shadow across open ground tonight.',
      'k_bucket:faint':           'A thin sliver casts almost no light; the stars will dominate.',
      'default': ''
    },
    'between-azimuth-and-phase': {
      'isCircumpolar:true':       'No moonrise today — the moon circles the pole without setting.',
      'k_bucket:bright':          'The phase is near full; moonrise will be visible from miles away.',
      'k_bucket:mid':             'A gibbous moon rises with enough light to soften the dark.',
      'k_bucket:faint':           'A crescent rises quietly; easy to miss against the dusk sky.',
      'default': ''
    },
    'between-phase-and-earthshine': {
      'k_bucket:bright':          'Near full, the lit face leaves little room for earthshine.',
      'k_bucket:faint':           'A narrow crescent holds just enough shadow for earthshine to show.',
      'k_bucket:dim':             'A quarter moon — the line between light and dark runs clean.',
      'isMoonBelowHorizon:true':  'The moon is set; no earthshine visible from the ground tonight.',
      'default': ''
    },
    'between-earthshine-and-size': {
      'k_bucket:bright':          'Close to full, the disk appears large and steady in the sky.',
      'k_bucket:faint':           'Crescent phase softens the sense of size; distance matters more.',
      'isCircumpolar:true':       'Circumpolar tonight — the moon traces a full arc overhead.',
      'default': ''
    },
    'between-size-and-lux': {
      'k_bucket:bright':          'Distance and phase align; the moon will cast defined shadows.',
      'k_bucket:mid':             'Moderate brightness — enough to walk an open trail without a lamp.',
      'k_bucket:dim':             'Dim by distance or phase; a headlamp will extend the range.',
      'k_bucket:faint':           'Near new moon or far away; very little usable light reaches ground.',
      'default': ''
    },
    'between-lux-and-eclipse': {
      'k_bucket:bright':          'Full or near-full — the geometry that also produces eclipses.',
      'k_bucket:faint':           'New or near-new moon — the geometry that can bring solar eclipses.',
      'isMoonBelowHorizon:true':  'Moon below the horizon — no local eclipse visible at this hour.',
      'isCircumpolar:true':       'Circumpolar moon; eclipse visibility depends on the hour of contact.',
      'default': ''
    },
    'between-eclipse-and-standstill': {
      'k_bucket:bright':          'The full moon that brings tides also marks the standstill cycle.',
      'k_bucket:faint':           'Near new moon — the standstill arc is wide but the moon is faint.',
      'isCircumpolar:true':       'Circumpolar tonight; the standstill declination is near its extreme.',
      'default': ''
    },
    'between-standstill-and-tide': {
      'springNeapKey:spring_now':         'Spring tides this week — the lunar and solar pulls run together.',
      'springNeapKey:neap_now':           'Neap tides now — the sun and moon pull at right angles, range narrows.',
      'springNeapKey:tide_to_neap':       'Range narrowing — heading toward neap over the next several days.',
      'springNeapKey:tide_to_spring':     'Range widening again — spring tides build over the coming week.',
      'springNeapKey:spring_approaching': 'Spring tides approaching — moon and sun nearly align again.',
      'isMoonBelowHorizon:true':          'Moon set; tidal pull continues regardless of visibility.',
      'default': ''
    }
  };

  /*
   * interstitialFor(output, sectionId) — pure function.
   * Looks up the relevant prose string for a given interstitial slot.
   * Priority order (most specific first):
   *   isCircumpolar:true > isMoonBelowHorizon:true > springNeapState:<v> > k_bucket:<v> > default
   * Returns '' when no match (element should be hidden).
   */
  function interstitialFor(output, sectionId) {
    var sub = INTERSTITIAL_TABLE[sectionId];
    if (!sub) return '';

    // isCircumpolar: moon does not rise that day
    if (output.isCircumpolar === true && sub['isCircumpolar:true'] !== undefined) {
      return sub['isCircumpolar:true'];
    }

    // isMoonBelowHorizon: moon below horizon at query time
    if (output.isMoonBelowHorizon === true && sub['isMoonBelowHorizon:true'] !== undefined) {
      return sub['isMoonBelowHorizon:true'];
    }

    // springNeapKey: stable 5-state classifier from D10 brackets
    // (replaces first-word match on springNeapState which collided when
    // two states both started with "Tide").
    if (output.springNeapKey) {
      var snKey = 'springNeapKey:' + output.springNeapKey;
      if (sub[snKey] !== undefined) return sub[snKey];
    }

    // k_bucket: from luxBracketFor(output.moonLuxAtCoord).label
    if (typeof output.moonLuxAtCoord === 'number') {
      var bucket = luxBracketFor(output.moonLuxAtCoord);
      var kKey = 'k_bucket:' + bucket.label;
      if (sub[kKey] !== undefined) return sub[kKey];
    }

    return sub['default'] !== undefined ? sub['default'] : '';
  }

  /* ==========================================
     Slice 4 — Eclipse pointer constants
     ========================================== */

  var ECLIPSE_VALID_YR_RANGE = 3000;

  /* ==========================================
     Exports (inner core only — DOM glue below)
     ========================================== */

  var api = {
    recompute:                 recompute,
    parseParams:               parseParams,
    nearestPortFor:            nearestPortFor,
    haversineKm:               haversineKm,
    springNeapStateFromDays:   springNeapStateFromDays,
    computeSpringNeapState:    computeSpringNeapState,
    computeKingTideUpcoming:   computeKingTideUpcoming,
    luxBracketFor:             luxBracketFor,
    apparentSizePercentString: apparentSizePercentString,
    earthshineVisibleFor:      earthshineVisibleFor,
    activeCalloutsFor:         activeCalloutsFor,
    ARCHAEO_CALLOUTS:          ARCHAEO_CALLOUTS,
    STANDSTILL_SLIDER_MIN:     STANDSTILL_SLIDER_MIN,
    STANDSTILL_SLIDER_MAX:     STANDSTILL_SLIDER_MAX,
    scrubberValueToInstant:    scrubberValueToInstant,
    instantToScrubberValue:    instantToScrubberValue,
    cardinalProseFor:          cardinalProseFor,
    ECLIPSE_VALID_YR_RANGE:    ECLIPSE_VALID_YR_RANGE,
    INTERSTITIAL_TABLE:        INTERSTITIAL_TABLE,
    interstitialFor:           interstitialFor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MoonPath = api;
  }

  /* ==========================================
     Outer shell — DOM glue (browser only)
     ========================================== */

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function makeSVGEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) {
      el.setAttribute(k, attrs[k]);
    });
    return el;
  }

  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /* ==========================================
     Widget 1 — Moon-in-sky SVG dome diagram
     ========================================== */

  /*
   * Renders an SVG arc showing tonight's moon altitude curve across the night.
   * Rise / transit / set markers + a now-tick if the date is today.
   *
   * SVG coordinate system:
   *   Width=600, Height=180.
   *   Horizon is at y=140. Zenith (90°) maps to y=10.
   *   Altitude 0° → y=140; altitude 90° → y=10.
   */
  function renderMoonInSky(output, svgEl) {
    clearEl(svgEl);
    if (!svgEl) return;

    var W = 600;
    var HORIZON_Y = 140;
    var ZENITH_Y  = 10;

    var titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.textContent = 'Moon altitude tonight (browser local time)';
    svgEl.appendChild(titleEl);

    // Horizon line
    svgEl.appendChild(makeSVGEl('line', {
      class: 'mp-dome-horizon',
      x1: 0, y1: HORIZON_Y, x2: W, y2: HORIZON_Y
    }));

    // Browser-local midnight (D5/D18 fallback — no coord-IANA-tz library shipped).
    var lat = output.lat, lon = output.lon;
    var now = output.now;
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    var points = [];
    for (var h = 0; h <= 24; h++) {
      var t = new Date(midnight + h * 3600000);
      var aa = SunPathMath.moonAltAzAt(t, lat, lon);
      var x = (h / 24) * W;
      var altClamped = Math.max(-10, Math.min(90, aa.altitude));
      var y = HORIZON_Y - ((altClamped + 10) / 100) * (HORIZON_Y - ZENITH_Y);
      points.push({ x: x, y: y, alt: aa.altitude, hour: h });
    }

    // Moon arc — above-horizon segments are solid, below are dashed
    var pathAbove = '', pathBelow = '';

    for (var i = 0; i < points.length; i++) {
      var pt = points[i];
      if (pt.alt > 0) {
        if (pathAbove === '') {
          pathAbove = 'M ' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1);
        } else {
          pathAbove += ' L ' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1);
        }
      } else {
        if (pathAbove !== '') {
          // emit a segment, start a new one
          svgEl.appendChild(makeSVGEl('path', {
            class: 'mp-dome-arc',
            d: pathAbove,
            fill: 'none'
          }));
          pathAbove = '';
        }
        pathBelow += (pathBelow === '' ? 'M' : ' L') + ' ' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1);
      }
    }
    if (pathAbove !== '') {
      svgEl.appendChild(makeSVGEl('path', {
        class: 'mp-dome-arc',
        d: pathAbove,
        fill: 'none'
      }));
    }
    if (pathBelow !== '') {
      svgEl.appendChild(makeSVGEl('path', {
        class: 'mp-dome-arc mp-dome-arc--below',
        d: pathBelow,
        fill: 'none'
      }));
    }

    // Moonrise marker
    if (output.moonrise) {
      var riseH = (output.moonrise.getTime() - midnight) / 3600000;
      if (riseH >= 0 && riseH <= 24) {
        var riseX = (riseH / 24) * W;
        svgEl.appendChild(makeSVGEl('line', {
          class: 'mp-dome-marker',
          x1: riseX, y1: HORIZON_Y - 8, x2: riseX, y2: HORIZON_Y + 4
        }));
        var riseLbl = makeSVGEl('text', {
          class: 'mp-dome-label',
          x: riseX,
          y: HORIZON_Y + 16
        });
        riseLbl.textContent = 'rise';
        svgEl.appendChild(riseLbl);
      }
    }

    // Moonset marker
    if (output.moonset) {
      var setH = (output.moonset.getTime() - midnight) / 3600000;
      if (setH >= 0 && setH <= 24) {
        var setX = (setH / 24) * W;
        svgEl.appendChild(makeSVGEl('line', {
          class: 'mp-dome-marker',
          x1: setX, y1: HORIZON_Y - 8, x2: setX, y2: HORIZON_Y + 4
        }));
        var setLbl = makeSVGEl('text', {
          class: 'mp-dome-label',
          x: setX,
          y: HORIZON_Y + 16
        });
        setLbl.textContent = 'set';
        svgEl.appendChild(setLbl);
      }
    }

    // Transit: find highest altitude point
    var maxAlt = -Infinity, transitX = W / 2;
    for (var j = 0; j < points.length; j++) {
      if (points[j].alt > maxAlt) {
        maxAlt = points[j].alt;
        transitX = points[j].x;
      }
    }
    if (maxAlt > 0) {
      var transitY = HORIZON_Y - ((Math.min(90, maxAlt) + 10) / 100) * (HORIZON_Y - ZENITH_Y);
      svgEl.appendChild(makeSVGEl('circle', {
        class: 'mp-dome-transit',
        cx: transitX,
        cy: transitY,
        r: 3
      }));
      var transitLbl = makeSVGEl('text', {
        class: 'mp-dome-label',
        x: transitX,
        y: transitY - 6
      });
      transitLbl.textContent = Math.round(maxAlt) + '°';
      svgEl.appendChild(transitLbl);
    }

    // Now-tick (only if today)
    var nowH = (now.getTime() - midnight) / 3600000;
    if (nowH >= 0 && nowH <= 24) {
      var nowX = (nowH / 24) * W;
      var nowAlt = output.moonAltAz.altitude;
      var nowAltClamped = Math.max(-10, Math.min(90, nowAlt));
      var nowY = HORIZON_Y - ((nowAltClamped + 10) / 100) * (HORIZON_Y - ZENITH_Y);
      svgEl.appendChild(makeSVGEl('circle', {
        class: 'mp-dome-now',
        cx: nowX,
        cy: nowY,
        r: 5
      }));
    }
  }

  /* ==========================================
     Widget 2 — Phase clock ring
     ========================================== */

  /*
   * Circular ring + filled wedge for illuminated fraction k.
   * Phase name label in Cormorant italic below.
   * SVG: cx=120, cy=100, r=70.
   */
  function renderPhaseClock(output, svgEl) {
    clearEl(svgEl);
    if (!svgEl) return;

    var cx = 120, cy = 100, r = 70;
    var k  = output.moonK;

    // Background ring
    svgEl.appendChild(makeSVGEl('circle', {
      class: 'mp-phase-ring',
      cx: cx, cy: cy, r: r
    }));

    // Lit wedge: k fraction of the circle.
    // We draw the arc from -90° (top) sweeping clockwise by k * 360°.
    // Arc path: start at top, sweep clockwise.
    if (k > 0.005) {
      var sweep = k * 2 * Math.PI;
      var startAngle = -Math.PI / 2;
      var endAngle   = startAngle + sweep;
      var sx = cx + r * Math.cos(startAngle);
      var sy = cy + r * Math.sin(startAngle);
      var ex = cx + r * Math.cos(endAngle);
      var ey = cy + r * Math.sin(endAngle);
      var largeArc = sweep > Math.PI ? 1 : 0;
      var wedgePath =
        'M ' + cx + ' ' + cy +
        ' L ' + sx.toFixed(2) + ' ' + sy.toFixed(2) +
        ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' +
        ex.toFixed(2) + ' ' + ey.toFixed(2) +
        ' Z';
      svgEl.appendChild(makeSVGEl('path', {
        class: 'mp-phase-wedge',
        d: wedgePath
      }));
    }

    // Phase name
    var name = phaseName(output.moonPhase);
    var lbl = makeSVGEl('text', {
      class: 'mp-phase-label',
      x: cx,
      y: cy + r + 22
    });
    lbl.textContent = name;
    svgEl.appendChild(lbl);

    // Lit % annotation
    var pctLbl = makeSVGEl('text', {
      class: 'mp-phase-pct',
      x: cx,
      y: cy + 6
    });
    pctLbl.textContent = Math.round(k * 100) + '%';
    svgEl.appendChild(pctLbl);
  }

  /* ==========================================
     Widget 4 — Earthshine annotation
     ========================================== */

  function renderEarthshineAnnotation(output, pEl) {
    if (!pEl) return;
    var visible = earthshineVisibleFor(output.moonK);
    if (visible) {
      pEl.removeAttribute('hidden');
    } else {
      pEl.setAttribute('hidden', '');
    }
    // Also show/hide the parent section so no empty gap appears
    var sectionEl = els && els.earthshineSection;
    if (sectionEl) {
      if (visible) {
        sectionEl.removeAttribute('hidden');
      } else {
        sectionEl.setAttribute('hidden', '');
      }
    }
  }

  /* ==========================================
     Widget 4 — Apparent-size dial
     ========================================== */

  /*
   * Small dial showing today's apparent size vs mean.
   * Mean distance = 384,400 km.
   * Reference needle at mean; current arc showing today's position.
   */
  function renderApparentSizeDial(output, svgEl, labelEl) {
    if (!svgEl) return;
    clearEl(svgEl);

    var cx = 80, cy = 80, rOuter = 55, rInner = 40;
    var distKm = output.moonDistanceKm;

    // Background arc — full semicircle (perigee to apogee range)
    // We map: apogee (406700 km) → leftmost, perigee (356500 km) → rightmost
    var APOGEE_KM  = 406700;
    var PERIGEE_KM = 356500;

    svgEl.appendChild(makeSVGEl('circle', {
      class: 'mp-size-dial-ring',
      cx: cx, cy: cy, r: rOuter
    }));

    // Mean marker line at 12 o'clock (top)
    svgEl.appendChild(makeSVGEl('line', {
      class: 'mp-size-dial-mean',
      x1: cx, y1: cy - rInner,
      x2: cx, y2: cy - rOuter
    }));

    // Current distance mapped to arc angle.
    // Range: apogee (far) → angle 0 (top), perigee (near) → full circle.
    // We use a -π to +π sweep so mean is at 0 (top).
    // frac = 0 → apogee (far, small), frac = 1 → perigee (near, large)
    var frac = (APOGEE_KM - distKm) / (APOGEE_KM - PERIGEE_KM);
    frac = Math.max(0, Math.min(1, frac));
    // Map frac 0..1 → angle -π..+π (sweeping from left to right through top)
    var angle = -Math.PI + frac * 2 * Math.PI;
    var nx = cx + rOuter * Math.sin(angle);
    var ny = cy - rOuter * Math.cos(angle);

    svgEl.appendChild(makeSVGEl('line', {
      class: 'mp-size-dial-needle',
      x1: cx, y1: cy,
      x2: nx.toFixed(2), y2: ny.toFixed(2)
    }));

    // Dot at needle tip
    svgEl.appendChild(makeSVGEl('circle', {
      class: 'mp-size-dial-dot',
      cx: nx.toFixed(2),
      cy: ny.toFixed(2),
      r: 4
    }));

    if (labelEl) {
      var sizeStr = apparentSizePercentString(distKm);
      labelEl.textContent = 'Tonight: ' + sizeStr;
    }
  }

  /* ==========================================
     Widget 5 — Lux brightness ring
     ========================================== */

  /*
   * Brightness ring: a single arc whose extent/opacity scales with lux.
   * Below-horizon: ring hidden, fallback line shown instead.
   */
  function renderLuxRing(output, svgEl, labelEl) {
    if (!svgEl) return;
    clearEl(svgEl);

    var cx = 80, cy = 80, r = 55;

    if (output.isMoonBelowHorizon) {
      if (labelEl) {
        labelEl.textContent = 'Moon below horizon — no moonlight at this time.';
        labelEl.removeAttribute('hidden');
      }
      // Faint empty ring to show the widget is present
      svgEl.appendChild(makeSVGEl('circle', {
        class: 'mp-lux-ring mp-lux-ring--below',
        cx: cx, cy: cy, r: r
      }));
      return;
    }

    var lux    = output.moonLuxAtCoord;
    var bucket = luxBracketFor(lux);

    // Ring arc: full circle whose opacity scales with lux bucket
    svgEl.appendChild(makeSVGEl('circle', {
      class: 'mp-lux-ring mp-lux-ring--' + bucket.label,
      cx: cx, cy: cy, r: r
    }));

    if (labelEl) {
      var luxRounded = lux < 0.01
        ? lux.toFixed(4)
        : lux.toFixed(3);
      // Trim trailing zeros, keep at least 1 decimal
      luxRounded = parseFloat(luxRounded).toString();
      labelEl.textContent = '~' + luxRounded + ' lux — ' + bucket.prose + '.';
      labelEl.removeAttribute('hidden');
    }
  }

  /* ==========================================
     Widget 3 — Moonrise azimuth dial (slot 2)
     ========================================== */

  /*
   * renderMoonriseAzimuthDial(output, svgEl, labelEl)
   * Compass rose 120×120 viewBox. When moonriseAzimuthDeg is not null,
   * draws a needle from center to perimeter at the bearing (0=N, clockwise).
   * When null (circumpolar), dims the dial and shows a fallback annotation.
   */
  function renderMoonriseAzimuthDial(output, svgEl, labelEl) {
    if (!svgEl) return;
    clearEl(svgEl);

    var cx = 60, cy = 60, r = 46;

    // Outer ring
    svgEl.appendChild(makeSVGEl('circle', {
      class: 'mp-azimuth-ring',
      cx: cx, cy: cy, r: r
    }));

    // Cardinal ticks (N/E/S/W) — longer
    var cardinalAngles = [0, 90, 180, 270];
    cardinalAngles.forEach(function (deg) {
      var rad = (deg - 90) * Math.PI / 180;
      var x1 = cx + (r - 8) * Math.cos(rad);
      var y1 = cy + (r - 8) * Math.sin(rad);
      var x2 = cx + r * Math.cos(rad);
      var y2 = cy + r * Math.sin(rad);
      svgEl.appendChild(makeSVGEl('line', {
        class: 'mp-azimuth-tick--cardinal',
        x1: x1.toFixed(2), y1: y1.toFixed(2),
        x2: x2.toFixed(2), y2: y2.toFixed(2)
      }));
    });

    // Intercardinal ticks (NE/SE/SW/NW) — shorter, fainter
    var intercardinalAngles = [45, 135, 225, 315];
    intercardinalAngles.forEach(function (deg) {
      var rad = (deg - 90) * Math.PI / 180;
      var x1 = cx + (r - 5) * Math.cos(rad);
      var y1 = cy + (r - 5) * Math.sin(rad);
      var x2 = cx + r * Math.cos(rad);
      var y2 = cy + r * Math.sin(rad);
      svgEl.appendChild(makeSVGEl('line', {
        class: 'mp-azimuth-tick--intercardinal',
        x1: x1.toFixed(2), y1: y1.toFixed(2),
        x2: x2.toFixed(2), y2: y2.toFixed(2)
      }));
    });

    // Cardinal text labels N/E/S/W just outside the ring
    var cardinalLabels = [
      { text: 'N', deg: 0   },
      { text: 'E', deg: 90  },
      { text: 'S', deg: 180 },
      { text: 'W', deg: 270 }
    ];
    cardinalLabels.forEach(function (item) {
      var rad = (item.deg - 90) * Math.PI / 180;
      var lx = cx + (r + 8) * Math.cos(rad);
      var ly = cy + (r + 8) * Math.sin(rad) + 3;
      var lbl = makeSVGEl('text', {
        class: 'mp-azimuth-label',
        x: lx.toFixed(2),
        y: ly.toFixed(2)
      });
      lbl.textContent = item.text;
      svgEl.appendChild(lbl);
    });

    var bearingDeg = output.moonriseAzimuthDeg;

    if (bearingDeg === null) {
      // Circumpolar — dim the dial, no needle
      svgEl.classList.add('mp-azimuth-dial--circumpolar');
      if (labelEl) {
        labelEl.textContent = 'Moon does not rise tonight — circumpolar.';
      }
      return;
    }

    // Remove circumpolar class if previously set
    svgEl.classList.remove('mp-azimuth-dial--circumpolar');

    // Needle: bearing 0=N, clockwise. Map to SVG angle: SVG 0=right, so subtract 90°.
    var needleRad = (bearingDeg - 90) * Math.PI / 180;
    var nx = cx + r * Math.cos(needleRad);
    var ny = cy + r * Math.sin(needleRad);

    svgEl.appendChild(makeSVGEl('line', {
      class: 'mp-azimuth-needle',
      x1: cx, y1: cy,
      x2: nx.toFixed(2), y2: ny.toFixed(2)
    }));

    // Center dot
    svgEl.appendChild(makeSVGEl('circle', {
      class: 'mp-azimuth-center-dot',
      cx: cx, cy: cy, r: 2.5
    }));

    if (labelEl) {
      labelEl.textContent =
        'Moon rises at ' + Math.round(bearingDeg) + '° tonight — look toward ' +
        cardinalProseFor(bearingDeg) + '.';
    }
  }

  /* ==========================================
     Widget 7 — Eclipse pointer (slot 7)
     ========================================== */

  /*
   * renderEclipsePointer(output, contentEl)
   * When both eclipse fields are null (out-of-range scrub year per D27),
   * renders a single fallback line.
   * Otherwise renders two <p> lines: next solar + next lunar eclipse.
   * Date format: ISO YYYY-MM-DD (UTC). Solar: magnitude N%. Lunar: lowercase kind.
   */
  function renderEclipsePointer(output, contentEl) {
    if (!contentEl) return;
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);

    if (output.nextSolarEclipse === null && output.nextLunarEclipse === null) {
      var fallback = document.createElement('p');
      fallback.className = 'mp-eclipse-fallback';
      fallback.textContent = 'Eclipse predictions unavailable beyond ±3,000 yr — Meeus low-precision envelope.';
      contentEl.appendChild(fallback);
      return;
    }

    if (output.nextSolarEclipse) {
      var solarDate = new Date(output.nextSolarEclipse.utcMs);
      var sy = solarDate.getUTCFullYear();
      var sm = solarDate.getUTCMonth() + 1;
      var sd = solarDate.getUTCDate();
      var sISO = sy + '-' +
        (sm < 10 ? '0' + sm : sm) + '-' +
        (sd < 10 ? '0' + sd : sd);
      var sMag = Math.round(output.nextSolarEclipse.magnitudePct);
      var solarLine = document.createElement('p');
      solarLine.className = 'mp-eclipse-line';
      solarLine.textContent = 'Next solar eclipse from this coord: ' + sISO + ', magnitude ' + sMag + '%.';
      contentEl.appendChild(solarLine);
    }

    if (output.nextLunarEclipse) {
      var lunarDate = new Date(output.nextLunarEclipse.utcMs);
      var ly = lunarDate.getUTCFullYear();
      var lm = lunarDate.getUTCMonth() + 1;
      var ld = lunarDate.getUTCDate();
      var lISO = ly + '-' +
        (lm < 10 ? '0' + lm : lm) + '-' +
        (ld < 10 ? '0' + ld : ld);
      var lunarLine = document.createElement('p');
      lunarLine.className = 'mp-eclipse-line';
      lunarLine.textContent = 'Next lunar eclipse from this coord: ' + lISO + ', ' + output.nextLunarEclipse.kind + '.';
      contentEl.appendChild(lunarLine);
    }
  }

  /* ==========================================
     Interstitial prose renderer
     ========================================== */

  /*
   * renderInterstitial(output, sectionId, pEl)
   * Reads interstitialFor(output, sectionId). Sets textContent + removes hidden when
   * non-empty; sets hidden + clears textContent when empty.
   */
  function renderInterstitial(output, sectionId, pEl) {
    if (!pEl) return;
    var prose = interstitialFor(output, sectionId);
    if (prose === '') {
      pEl.textContent = '';
      pEl.setAttribute('hidden', '');
    } else {
      pEl.textContent = prose;
      pEl.removeAttribute('hidden');
    }
  }

  /* ==========================================
     Widget 6 — Tide curve
     ========================================== */

  /*
   * renderTideCurve(output, svgEl) — SVG polyline of tide heights
   * from -24h to +24h, with high/low markers annotated.
   * SVG: W=600, H=160. Baseline at mid-height.
   */
  function renderTideCurve(output, svgEl) {
    if (!svgEl) return;
    clearEl(svgEl);

    var W = 600;
    var H = 160;
    var PAD_T = 16;
    var PAD_B = 24;
    var PLOT_H = H - PAD_T - PAD_B;

    var title = document.createElementNS(SVG_NS, 'title');
    title.textContent = 'Tide height at ' + output.nearestPort.name + ' — 48 h window';
    svgEl.appendChild(title);

    var samples = output.tideHeights24h;
    if (!samples || samples.length === 0) return;

    // Find min/max for scaling
    var minH = Infinity, maxH = -Infinity;
    for (var i = 0; i < samples.length; i++) {
      if (samples[i].heightM < minH) minH = samples[i].heightM;
      if (samples[i].heightM > maxH) maxH = samples[i].heightM;
    }
    var range = maxH - minH;
    if (range < 0.01) range = 0.01;

    function toX(idx) {
      return (idx / (samples.length - 1)) * W;
    }
    function toY(hm) {
      return PAD_T + PLOT_H - ((hm - minH) / range) * PLOT_H;
    }

    // Baseline (zero = MSL) if it's within visible range
    var zeroY = toY(0);
    if (zeroY >= PAD_T && zeroY <= H - PAD_B) {
      svgEl.appendChild(makeSVGEl('line', {
        class: 'mp-tide-zero',
        x1: 0, y1: zeroY.toFixed(1), x2: W, y2: zeroY.toFixed(1)
      }));
    }

    // Now-line (center of 48h window = index 48)
    var nowX = (48 / (samples.length - 1)) * W;
    svgEl.appendChild(makeSVGEl('line', {
      class: 'mp-tide-now',
      x1: nowX.toFixed(1), y1: PAD_T, x2: nowX.toFixed(1), y2: H - PAD_B
    }));

    // Polyline
    var pts = [];
    for (var j = 0; j < samples.length; j++) {
      pts.push(toX(j).toFixed(1) + ',' + toY(samples[j].heightM).toFixed(1));
    }
    svgEl.appendChild(makeSVGEl('polyline', {
      class: 'mp-tide-curve',
      points: pts.join(' '),
      fill: 'none'
    }));

    // High/low marker detection — local extrema
    for (var k = 1; k < samples.length - 1; k++) {
      var prev = samples[k - 1].heightM;
      var curr = samples[k].heightM;
      var next = samples[k + 1].heightM;
      var isHigh = curr > prev && curr > next;
      var isLow  = curr < prev && curr < next;
      if (!isHigh && !isLow) continue;

      var mx = toX(k);
      var my = toY(curr);
      svgEl.appendChild(makeSVGEl('circle', {
        class: isHigh ? 'mp-tide-marker mp-tide-marker--high' : 'mp-tide-marker mp-tide-marker--low',
        cx: mx.toFixed(1),
        cy: my.toFixed(1),
        r: 2.5
      }));

      var lblY = isHigh ? my - 5 : my + 12;
      var lbl = makeSVGEl('text', {
        class: 'mp-tide-label',
        x: mx.toFixed(1),
        y: lblY.toFixed(1)
      });
      lbl.textContent = curr.toFixed(1) + ' m';
      svgEl.appendChild(lbl);
    }
  }

  /*
   * renderSpringNeapAnnotation(output, pEl) — sets italic prose text
   * from D10 five-state table.
   */
  function renderSpringNeapAnnotation(output, pEl) {
    if (!pEl) return;
    var snState = output.springNeapState;
    if (!snState) { pEl.setAttribute('hidden', ''); return; }
    pEl.removeAttribute('hidden');
    var emEl = pEl.querySelector('em') || pEl;
    emEl.textContent = snState;
  }

  /*
   * renderKingTideFlag(output, pEl) — shows king-tide notice when
   * section is visible + perigee/syzygy alignment within 30 days (D17).
   */
  function renderKingTideFlag(output, pEl) {
    if (!pEl) return;
    if (output.kingTideUpcoming) {
      pEl.removeAttribute('hidden');
    } else {
      pEl.setAttribute('hidden', '');
    }
  }

  /*
   * renderTideSection(output) — top-level coordinator.
   * Hides section when nearest port >200 km; shows curve + annotations otherwise.
   * D30: when scrubbed date is outside ±30 day window of nowOriginal, shows fallback.
   */
  function renderTideSection(output) {
    var section = els.tideSection;
    if (!section) return;

    var distKm = output.nearestPortDistanceKm;
    var tideLabel = els.tideLabel;

    if (distKm > 200) {
      // Section remains visible (shown by showWidgets), but show fallback text.
      if (tideLabel) {
        var kmRounded = isFinite(distKm) ? Math.round(distKm) : '—';
        tideLabel.textContent =
          'Tides not applicable at this coord — nearest baked port is ' + kmRounded + ' km away.';
        tideLabel.removeAttribute('hidden');
      }
      if (els.tideSvg) els.tideSvg.setAttribute('hidden', '');
      if (els.tideSpringNeap) els.tideSpringNeap.setAttribute('hidden', '');
      if (els.tideKingFlag)   els.tideKingFlag.setAttribute('hidden', '');
      return;
    }

    // D30 out-of-window fallback
    if (output.tideOutOfWindow) {
      if (tideLabel) {
        tideLabel.textContent = 'Tide curve unavailable beyond the bake window — try a date within ±30 days.';
        tideLabel.removeAttribute('hidden');
      }
      if (els.tideSvg) els.tideSvg.setAttribute('hidden', '');
      if (els.tideSpringNeap) els.tideSpringNeap.setAttribute('hidden', '');
      if (els.tideKingFlag)   els.tideKingFlag.setAttribute('hidden', '');
      return;
    }

    // Tide section visible — render curve
    if (els.tideSvg) {
      els.tideSvg.removeAttribute('hidden');
      renderTideCurve(output, els.tideSvg);
    }
    if (tideLabel) tideLabel.setAttribute('hidden', '');
    renderSpringNeapAnnotation(output, els.tideSpringNeap);
    renderKingTideFlag(output, els.tideKingFlag);
  }

  /* ==========================================
     Widget 8 — Standstill annotation (reads scrubbed year from state.now)
     ========================================== */

  /*
   * renderStandstillAnnotation(output, resultEl, calloutsEl)
   * Reads the scrubbed year from output.now (state.now), calls lunarStandstillNear,
   * updates the result label, and renders active archaeo callouts.
   * (v1's renderStandstillSlider used a dedicated year slider — removed in slice 2.)
   */
  function renderStandstillAnnotation(output, resultEl, calloutsEl) {
    if (!resultEl) return;

    var scrubYear = new Date(output.now).getFullYear();

    var standstill = SunPathMath.lunarStandstillNear(new Date(), scrubYear);
    var standstillYear = Math.round(standstill.year);
    var decl = standstill.peakDeclination.toFixed(1);

    resultEl.textContent =
      'Year: ' + scrubYear + ', nearest standstill: ' + standstillYear +
      ' (' + standstill.type + ', declination ' + decl + '°)';

    if (calloutsEl) {
      var active = activeCalloutsFor(scrubYear);
      while (calloutsEl.firstChild) calloutsEl.removeChild(calloutsEl.firstChild);
      active.forEach(function (c) {
        var p = document.createElement('p');
        p.className = 'moonpath-standstill-callout';
        var em = document.createElement('em');
        em.textContent = c.site + ' — ' + c.prose;
        p.appendChild(em);
        calloutsEl.appendChild(p);
      });
    }
  }

  /* ==========================================
     Date scrubber label formatter
     ========================================== */

  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  /*
   * formatScrubberLabel(ms) — returns e.g. "Sat 14 May 2026, 14:32 UTC"
   */
  function formatScrubberLabel(ms) {
    var d = new Date(ms);
    var dow  = DAY_NAMES[d.getUTCDay()];
    var day  = d.getUTCDate();
    var mon  = MONTH_NAMES[d.getUTCMonth()];
    var yr   = d.getUTCFullYear();
    var h    = d.getUTCHours();
    var m    = d.getUTCMinutes();
    var hh   = h < 10 ? '0' + h : '' + h;
    var mm   = m < 10 ? '0' + m : '' + m;
    return dow + ' ' + day + ' ' + mon + ' ' + yr + ', ' + hh + ':' + mm + ' UTC';
  }

  /* ==========================================
     State
     ========================================== */

  var nowAtLoad = new Date();

  var state = {
    lat:         null,
    lon:         null,
    date:        null,
    now:         nowAtLoad,
    nowOriginal: nowAtLoad,
    ports:       null
  };

  /* ==========================================
     DOM references
     ========================================== */

  var els = {
    coordEntry:  document.getElementById('mp-coord-entry'),
    locateBtn:   document.getElementById('mp-locate'),
    latInput:    document.getElementById('mp-lat'),
    lonInput:    document.getElementById('mp-lon'),
    presets:     document.getElementById('mp-presets'),
    // Sections
    skySection:            document.getElementById('mp-sky'),
    azimuthSection:        document.getElementById('mp-azimuth'),
    phaseSection:          document.getElementById('mp-phase'),
    earthshineSection:     document.getElementById('mp-earthshine-section'),
    sizeSection:           document.getElementById('mp-size'),
    luxSection:            document.getElementById('mp-lux'),
    eclipseSection:        document.getElementById('mp-eclipse'),
    standstillSection:     document.getElementById('mp-standstill'),
    tideSection:           document.getElementById('mp-tide'),
    // Scrubber
    dateScrubber:     document.getElementById('mp-date-scrubber'),
    scrubberLabel:    document.getElementById('mp-scrubber-label'),
    playBtn:          document.getElementById('mp-play-btn'),
    // Widget slots
    skySvg:       document.getElementById('mp-sky-svg'),
    phaseSvg:     document.getElementById('mp-phase-svg'),
    earthshineP:  document.getElementById('mp-earthshine'),
    sizeSvg:      document.getElementById('mp-size-svg'),
    sizeLabel:    document.getElementById('mp-size-label'),
    luxSvg:       document.getElementById('mp-lux-svg'),
    luxLabel:     document.getElementById('mp-lux-label'),
    // Widget 3 — azimuth dial (slot 2)
    azimuthSvg:   document.getElementById('mp-azimuth-svg'),
    azimuthLabel: document.getElementById('mp-azimuth-label'),
    // Widget 7 — eclipse pointer (slot 7)
    eclipseContent: document.getElementById('mp-eclipse-content'),
    // Widget 8 — standstill (no slider; scrubbed year from state.now)
    standstillResult:   document.getElementById('mp-standstill-result'),
    standstillCallouts: document.getElementById('mp-standstill-callouts'),
    // Tide
    tideSvg:            document.getElementById('mp-tide-svg'),
    tideLabel:          document.getElementById('mp-tide-label'),
    tideSpringNeap:     document.getElementById('mp-tide-spring-neap'),
    tideKingFlag:       document.getElementById('mp-tide-king-flag'),
    // Interstitial prose elements (cached NodeList)
    interstitials:      document.querySelectorAll('p.mp-interstitial')
  };

  /* ==========================================
     URL sync
     ========================================== */

  function buildURL(params) {
    var parts = [];
    if (params.lat  !== null) parts.push('lat='  + encodeURIComponent(params.lat));
    if (params.lon  !== null) parts.push('lon='  + encodeURIComponent(params.lon));
    if (params.date !== null) parts.push('date=' + encodeURIComponent(params.date));
    var newURL = location.pathname + (parts.length ? '?' + parts.join('&') : '');
    if (newURL !== location.pathname + location.search) {
      history.replaceState(null, '', newURL);
    }
  }

  /* ==========================================
     Render pipeline
     ========================================== */

  function showWidgets(show) {
    var sections = [
      els.skySection,
      els.azimuthSection,
      els.phaseSection,
      els.earthshineSection,
      els.sizeSection,
      els.luxSection,
      els.eclipseSection,
      els.standstillSection,
      els.tideSection
    ];
    sections.forEach(function (el) {
      if (!el) return;
      if (show) {
        el.removeAttribute('hidden');
      } else {
        el.setAttribute('hidden', '');
      }
    });
  }

  function runAndRender() {
    var output = recompute(state);

    if (!output.ready) {
      showWidgets(false);
      return;
    }

    showWidgets(true);

    renderMoonInSky(output, els.skySvg);
    renderMoonriseAzimuthDial(output, els.azimuthSvg, els.azimuthLabel);
    renderPhaseClock(output, els.phaseSvg);
    renderEarthshineAnnotation(output, els.earthshineP);
    renderApparentSizeDial(output, els.sizeSvg, els.sizeLabel);
    renderLuxRing(output, els.luxSvg, els.luxLabel);
    renderEclipsePointer(output, els.eclipseContent);
    renderStandstillAnnotation(output, els.standstillResult, els.standstillCallouts);
    renderTideSection(output);

    // Render all 8 interstitial prose slots
    if (els.interstitials) {
      for (var ii = 0; ii < els.interstitials.length; ii++) {
        var ipEl = els.interstitials[ii];
        renderInterstitial(output, ipEl.dataset.sectionId, ipEl);
      }
    }

    // Update scrubber label
    if (els.scrubberLabel) {
      els.scrubberLabel.textContent = formatScrubberLabel(output.now.getTime());
    }
    // Update scrubber aria-valuetext
    if (els.dateScrubber) {
      els.dateScrubber.setAttribute('aria-valuetext', formatScrubberLabel(output.now.getTime()));
    }
  }

  /* ==========================================
     Coord commit — shared by locate + manual entry
     ========================================== */

  function enableScrubberControls() {
    if (els.dateScrubber) els.dateScrubber.removeAttribute('disabled');
    if (els.playBtn)      els.playBtn.removeAttribute('disabled');
  }

  function commitCoords(lat, lon) {
    state.lat = String(lat);
    state.lon = String(lon);

    if (els.latInput) els.latInput.value = lat;
    if (els.lonInput) els.lonInput.value = lon;

    enableScrubberControls();
    buildURL({ lat: state.lat, lon: state.lon, date: state.date });
    runAndRender();
  }

  /* ==========================================
     Locate button — geolocation only here (AC #19)
     ========================================== */

  if (els.locateBtn) {
    els.locateBtn.addEventListener('click', function () {
      if (!navigator.geolocation) {
        els.locateBtn.textContent = 'Geolocation not available';
        return;
      }
      els.locateBtn.textContent = 'Locating…';
      els.locateBtn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        function (position) {
          els.locateBtn.textContent = 'Use my location';
          els.locateBtn.disabled = false;
          commitCoords(
            parseFloat(position.coords.latitude.toFixed(4)),
            parseFloat(position.coords.longitude.toFixed(4))
          );
        },
        function () {
          els.locateBtn.textContent = 'Location unavailable';
          els.locateBtn.disabled = false;
        }
      );
    });
  }

  /* ==========================================
     Manual entry — submit on blur
     ========================================== */

  function tryManualEntry() {
    var lat = parseFloat(els.latInput && els.latInput.value);
    var lon = parseFloat(els.lonInput && els.lonInput.value);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      commitCoords(lat, lon);
    }
  }

  if (els.latInput) {
    els.latInput.addEventListener('blur', tryManualEntry);
    els.latInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryManualEntry();
    });
  }
  if (els.lonInput) {
    els.lonInput.addEventListener('blur', tryManualEntry);
    els.lonInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryManualEntry();
    });
  }

  /* ==========================================
     Preset places — one-tap coordinates
     ========================================== */

  if (els.presets) {
    els.presets.addEventListener('click', function (e) {
      var btn = e.target.closest('.moonpath-preset');
      if (!btn) return;
      var lat = parseFloat(btn.getAttribute('data-lat'));
      var lon = parseFloat(btn.getAttribute('data-lon'));
      if (isNaN(lat) || isNaN(lon)) return;
      commitCoords(lat, lon);
    });
  }

  /* ==========================================
     Date scrubber — rAF-throttled input pipeline (AC #19)
     ========================================== */

  (function setupScrubberListeners() {
    if (!els.dateScrubber) return;

    var rafPending = false;

    els.dateScrubber.addEventListener('input', function () {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        var i = parseInt(els.dateScrubber.value, 10);
        state.now = new Date(scrubberValueToInstant(i, state.nowOriginal.getTime()));
        runAndRender();
      });
    });

    // Keyboard: Shift+Left/Right = ±10 ticks; Home = reset to i=0
    els.dateScrubber.addEventListener('keydown', function (e) {
      var current = parseInt(els.dateScrubber.value, 10);
      var handled = false;

      if (e.key === 'ArrowLeft' && e.shiftKey) {
        els.dateScrubber.value = Math.max(-500, current - 10);
        handled = true;
      } else if (e.key === 'ArrowRight' && e.shiftKey) {
        els.dateScrubber.value = Math.min(500, current + 10);
        handled = true;
      } else if (e.key === 'Home') {
        els.dateScrubber.value = 0;
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        els.dateScrubber.dispatchEvent(new Event('input'));
      }
    });
  })();

  /* ==========================================
     Auto-play — cycles paused → 1× → 2× → 4× → paused.
     1× advances +1 tick / 160 ms; 2× = +1 / 80 ms; 4× = +1 / 40 ms.
     Stops at scrubber max; resets on user-drag.
     Each tick dispatches a synthetic input event, which goes through
     the rAF-throttled recompute pipeline above (so high-speed timers
     still coalesce to one recompute per animation frame).
     ========================================== */

  (function setupPlayButton() {
    if (!els.playBtn || !els.dateScrubber) return;

    // Speed cycle: 0 = paused, 1 = 1×, 2 = 2×, 3 = 4×.
    var SPEEDS = [
      { label: '▶',   step: 0 },     // paused (glyph only)
      { label: '1×',  step: 160 },   // ~80 s sweep across 1001 ticks
      { label: '2×',  step: 80 },    // ~40 s sweep
      { label: '4×',  step: 40 }     // ~20 s sweep
    ];

    var stage = 0;
    var playTimer = null;

    function setStage(newStage) {
      stage = newStage;
      if (playTimer !== null) {
        clearInterval(playTimer);
        playTimer = null;
      }
      var s = SPEEDS[stage];
      els.playBtn.setAttribute('data-speed', String(stage));
      els.playBtn.setAttribute('aria-pressed', stage > 0 ? 'true' : 'false');
      els.playBtn.setAttribute('aria-label', stage > 0 ? 'Cycle playback speed (currently ' + s.label + ')' : 'Play time');
      var glyph = els.playBtn.querySelector('.mp-play-glyph');
      if (glyph) glyph.textContent = s.label;

      if (stage === 0) return;

      var maxTick = parseInt(els.dateScrubber.max, 10);
      playTimer = setInterval(function () {
        var current = parseInt(els.dateScrubber.value, 10);
        if (current >= maxTick) { setStage(0); return; }
        els.dateScrubber.value = current + 1;
        els.dateScrubber.dispatchEvent(new Event('input'));
      }, s.step);
    }

    els.playBtn.addEventListener('click', function () {
      setStage((stage + 1) % SPEEDS.length);
    });

    // User drag pauses immediately so the timer doesn't fight the cursor.
    els.dateScrubber.addEventListener('pointerdown', function () {
      if (stage !== 0) setStage(0);
    });
  })();

  /* ==========================================
     Bootstrap from URL params
     Fetches tide-ports.json then renders.
     ========================================== */

  (function init() {
    var params = parseParams(location.search);
    if (params.lat !== null && params.lon !== null) {
      state.lat  = params.lat;
      state.lon  = params.lon;
      state.date = params.date;
      if (els.latInput) els.latInput.value = params.lat;
      if (els.lonInput) els.lonInput.value = params.lon;
      enableScrubberControls();
    }

    // AC #3: if ?date= present, initialize scrubber to that instant
    if (params.date) {
      var parsedMs = Date.parse(params.date + 'T00:00:00Z');
      if (!isNaN(parsedMs)) {
        var initTick = instantToScrubberValue(parsedMs, nowAtLoad.getTime());
        state.now = new Date(scrubberValueToInstant(initTick, nowAtLoad.getTime()));
        if (els.dateScrubber) {
          els.dateScrubber.value = initTick;
          els.dateScrubber.setAttribute('aria-valuetext', formatScrubberLabel(state.now.getTime()));
        }
      }
    }

    fetch('/assets/moonpath/tide-ports.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.ports = data.ports || [];
        runAndRender();
      })
      .catch(function () {
        state.ports = [];
        runAndRender();
      });
  })();

})(typeof window !== 'undefined' ? window : globalThis);
