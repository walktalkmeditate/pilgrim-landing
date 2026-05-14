/* =============================================
   Moon Path — page controller

   Two-layer architecture:
     Inner core   — recompute(state): pure function, no DOM, no async
     Outer shell  — DOM glue, only runs in browser

   Export shape:
     Browser → window.MoonPath = { recompute, parseParams, nearestPortFor,
                                   luxBracketFor, apparentSizePercentString,
                                   earthshineVisibleFor }
     Node    → module.exports  = { recompute, parseParams, nearestPortFor,
                                   luxBracketFor, apparentSizePercentString,
                                   earthshineVisibleFor }

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

  /*
   * computeSpringNeapState(now) — determine the D10 5-state annotation.
   * Finds the most recent prior syzygy (new or full) and its kind,
   * then classifies by days-since-then.  Returns null when math
   * helpers aren't available.
   */
  function computeSpringNeapState(now) {
    if (!SunPathMath) return null;

    var SYNODIC_MS = 29.53059 * 86400000;
    var nowMs = now.getTime();

    var nextNew  = SunPathMath.syzygyMomentAfter(now, 'new');
    var nextFull = SunPathMath.syzygyMomentAfter(now, 'full');

    if (!nextNew || !nextFull) return null;

    var lastNewMs  = nextNew.utcMs  - SYNODIC_MS;
    var lastFullMs = nextFull.utcMs - SYNODIC_MS;

    var lastSyzygyMs, lastKind;
    if (lastNewMs > lastFullMs) { lastSyzygyMs = lastNewMs;  lastKind = 'new';  }
    else                        { lastSyzygyMs = lastFullMs; lastKind = 'full'; }

    var daysSince = (nowMs - lastSyzygyMs) / 86400000;
    return springNeapStateFromDays(daysSince, lastKind);
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
     Inner core — pure computation
     ========================================== */

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

    // --- Tide fields (D9: gated by 200 km threshold) ---
    var ports = state.ports || null;
    var portResult = ports ? nearestPortFor(lat, lon, ports) : null;
    var nearestPort = portResult ? portResult.port : null;
    var nearestPortDistanceKm = portResult ? portResult.distanceKm : Infinity;
    var tideVisible = nearestPortDistanceKm <= 200;

    var tideHeights24h = null;
    var springNeapState = null;
    var kingTideUpcoming = false;

    if (tideVisible && nearestPort && TideMath) {
      // Sample tide heights at 30-min intervals across -24h to +24h
      var nowMs = now.getTime();
      var samples = [];
      for (var s = -48; s <= 48; s++) {
        var sMs = nowMs + s * 30 * 60 * 1000;
        var h = TideMath.harmonicTideHeightM(sMs / 1000, nearestPort.constituents);
        samples.push({ offsetMin: s * 30, heightM: h, timeMs: sMs });
      }
      tideHeights24h = samples;
    }

    if (tideVisible) {
      springNeapState = computeSpringNeapState(now);
      kingTideUpcoming = computeKingTideUpcoming(now);
    }

    return {
      ready:                    true,
      lat:                      lat,
      lon:                      lon,
      now:                      now,
      moonPhase:                phase,
      moonK:                    k,
      moonAltAz:                moonAltAz,
      isMoonBelowHorizon:       isMoonBelowHorizon,
      moonDistanceKm:           moonDistanceKm,
      moonApparentDiameterDeg:  moonApparentDiameterDeg,
      moonLuxAtCoord:           moonLuxAtCoord,
      moonrise:                 moonrise,
      moonset:                  moonset,
      nearestPort:              nearestPort,
      nearestPortDistanceKm:    nearestPortDistanceKm,
      tideHeights24h:           tideHeights24h,
      springNeapState:          springNeapState,
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
    STANDSTILL_SLIDER_MAX:     STANDSTILL_SLIDER_MAX
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
    titleEl.textContent = 'Moon altitude tonight';
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
     Widget 3 — Earthshine annotation
     ========================================== */

  function renderEarthshineAnnotation(output, pEl) {
    if (!pEl) return;
    if (earthshineVisibleFor(output.moonK)) {
      pEl.removeAttribute('hidden');
    } else {
      pEl.setAttribute('hidden', '');
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
     Widget 7 — Standstill time-machine
     ========================================== */

  /*
   * renderStandstillSlider(sliderEl, resultEl, calloutsEl)
   * Reads the current slider value, calls lunarStandstillNear,
   * updates the result label, and renders active archaeo callouts.
   */
  function renderStandstillSlider(sliderEl, resultEl, calloutsEl) {
    if (!sliderEl || !resultEl) return;

    var sliderYear = parseInt(sliderEl.value, 10);
    if (isNaN(sliderYear)) return;

    var standstill = SunPathMath.lunarStandstillNear(new Date(), sliderYear);
    var standstillYear = Math.round(standstill.year);
    var decl = standstill.peakDeclination.toFixed(1);

    resultEl.textContent =
      'Year: ' + sliderYear + ', nearest standstill: ' + standstillYear +
      ' (' + standstill.type + ', declination ' + decl + '°)';

    if (calloutsEl) {
      var active = activeCalloutsFor(sliderYear);
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
     State
     ========================================== */

  var state = {
    lat:   null,
    lon:   null,
    date:  null,
    now:   new Date(),
    ports: null
  };

  /* ==========================================
     DOM references
     ========================================== */

  var els = {
    coordEntry:  document.getElementById('mp-coord-entry'),
    locateBtn:   document.getElementById('mp-locate'),
    latInput:    document.getElementById('mp-lat'),
    lonInput:    document.getElementById('mp-lon'),
    skySection:  document.getElementById('mp-sky'),
    phaseSection: document.getElementById('mp-phase'),
    sizeSection: document.getElementById('mp-size'),
    luxSection:  document.getElementById('mp-lux'),
    standstillSection: document.getElementById('mp-standstill'),
    tideSection: document.getElementById('mp-tide'),
    // Widget slots
    skySvg:       document.getElementById('mp-sky-svg'),
    phaseSvg:     document.getElementById('mp-phase-svg'),
    earthshineP:  document.getElementById('mp-earthshine'),
    sizeSvg:      document.getElementById('mp-size-svg'),
    sizeLabel:    document.getElementById('mp-size-label'),
    luxSvg:       document.getElementById('mp-lux-svg'),
    luxLabel:     document.getElementById('mp-lux-label'),
    // Slice 5 — standstill
    standstillSlider:   document.getElementById('mp-standstill-slider'),
    standstillResult:   document.getElementById('mp-standstill-result'),
    standstillCallouts: document.getElementById('mp-standstill-callouts'),
    // Slice 6 — tide
    tideSvg:            document.getElementById('mp-tide-svg'),
    tideLabel:          document.getElementById('mp-tide-label'),
    tideSpringNeap:     document.getElementById('mp-tide-spring-neap'),
    tideKingFlag:       document.getElementById('mp-tide-king-flag')
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
      els.phaseSection,
      els.sizeSection,
      els.luxSection,
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
    renderPhaseClock(output, els.phaseSvg);
    renderEarthshineAnnotation(output, els.earthshineP);
    renderApparentSizeDial(output, els.sizeSvg, els.sizeLabel);
    renderLuxRing(output, els.luxSvg, els.luxLabel);
    renderStandstillSlider(els.standstillSlider, els.standstillResult, els.standstillCallouts);
    renderTideSection(output);
  }

  /* ==========================================
     Coord commit — shared by locate + manual entry
     ========================================== */

  function commitCoords(lat, lon) {
    state.lat = String(lat);
    state.lon = String(lon);

    if (els.latInput) els.latInput.value = lat;
    if (els.lonInput) els.lonInput.value = lon;

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
     Standstill slider — live update on change
     ========================================== */

  if (els.standstillSlider) {
    els.standstillSlider.addEventListener('input', function () {
      renderStandstillSlider(els.standstillSlider, els.standstillResult, els.standstillCallouts);
    });
  }

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
