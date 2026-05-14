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
     Port proximity — stub until slice 6
     ========================================== */

  function nearestPortFor(lat, lon) {
    void lat;
    void lon;
    return null;
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

    return {
      ready:                  true,
      lat:                    lat,
      lon:                    lon,
      now:                    now,
      moonPhase:              phase,
      moonK:                  k,
      moonAltAz:              moonAltAz,
      isMoonBelowHorizon:     isMoonBelowHorizon,
      moonDistanceKm:         moonDistanceKm,
      moonApparentDiameterDeg: moonApparentDiameterDeg,
      moonLuxAtCoord:         moonLuxAtCoord,
      moonrise:               moonrise,
      moonset:                moonset
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

  var CURRENT_YEAR = 2026;
  // Range is ±5,000 yr per D20, floor-extended to reach all three archaeo sites.
  // Newgrange at -3200 requires min ≤ -3200; CURRENT_YEAR-5000 = -2974, so we
  // take the lower of the two to guarantee coverage.
  var STANDSTILL_SLIDER_MIN = Math.min(CURRENT_YEAR - 5000, -3250);  // -3250
  var STANDSTILL_SLIDER_MAX = CURRENT_YEAR + 5000;                    // 7026

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

    // Compute altitude at each hour of the 24-hour UTC window centred on now-midnight
    var lat = output.lat, lon = output.lon;
    var now = output.now;
    var midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

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
     Widget 6 — Standstill time-machine
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
    lat:  null,
    lon:  null,
    date: null,
    now:  new Date()
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
    standstillCallouts: document.getElementById('mp-standstill-callouts')
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
     ========================================== */

  (function init() {
    var params = parseParams(location.search);
    if (params.lat !== null && params.lon !== null) {
      state.lat  = params.lat;
      state.lon  = params.lon;
      state.date = params.date;
    }
    runAndRender();
  })();

})(typeof window !== 'undefined' ? window : globalThis);
