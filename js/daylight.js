/* =============================================
   The Light Budget — hub page controller

   Two-layer architecture:
     Inner core   — recompute(state): pure function, no DOM, no async
     Outer shell  — DOM glue, only runs in browser

   Export shape (both browser and Node — see the `api` object below):
     { recompute, renderSVG, fmtDuration, renderRibbon, ribbonSectionHidden }

   The outer shell only wires DOM listeners when
   typeof window !== 'undefined' && typeof document !== 'undefined'.

   navigator.geolocation appears 3× in this file — all inside the
   locate-button click handler (per AC #14).
   ============================================= */

(function (root) {
  'use strict';

  var MS_PER_MIN = 60000;

  // Rod-cell dark adaptation — a walker's number, not the sky's (D5).
  // Shared by recompute (surfaces it as an annotation) and renderSVG
  // (draws the tick + label) — both need the same instant.
  var DARK_ADAPT_MIN = 20;

  /* ==========================================
     Timezone helpers (D4 + D5)
     ========================================== */

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function dateInTz(utcDate, ianaTz) {
    var opts = { year: 'numeric', month: '2-digit', day: '2-digit' };
    if (ianaTz) opts.timeZone = ianaTz;
    var parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(utcDate);
    var y = parts.find(function (p) { return p.type === 'year'; }).value;
    var m = parts.find(function (p) { return p.type === 'month'; }).value;
    var d = parts.find(function (p) { return p.type === 'day'; }).value;
    return y + '-' + m + '-' + d;
  }

  // Constructing an Intl.DateTimeFormat is the expensive part of
  // formatting a time (millisecond-scale — ICU locale data, not a plain
  // object literal); .format() on an existing one is not. recompute()
  // calls timeInTz several times per invocation with the same
  // (ianaTz, clockFmt) pair (once per annotation clause), and renderSVG
  // calls it repeatedly across a single render, so a formatter is built
  // once per pair and reused for the life of the page rather than once
  // per call.
  var _timeFormatterCache = {};
  function timeFormatterFor(ianaTz, clockFmt) {
    var key = (ianaTz || '') + '|' + clockFmt;
    var fmt = _timeFormatterCache[key];
    if (!fmt) {
      var opts = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: clockFmt === '12h'
      };
      if (ianaTz) opts.timeZone = ianaTz;
      fmt = new Intl.DateTimeFormat('en-US', opts);
      _timeFormatterCache[key] = fmt;
    }
    return fmt;
  }

  function timeInTz(utcDate, ianaTz, clockFmt) {
    return timeFormatterFor(ianaTz, clockFmt).format(utcDate);
  }

  function tzOffsetMinutes(utcDate, ianaTz) {
    var formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaTz,
      timeZoneName: 'shortOffset',
      hour: 'numeric'
    });
    var parts = formatter.formatToParts(utcDate);
    var off = parts.find(function (p) { return p.type === 'timeZoneName'; }).value;
    var gmt = /GMT([+-]\d+)(?::(\d+))?/.exec(off);
    if (!gmt) return 0;
    var hours = parseInt(gmt[1], 10);
    var mins = gmt[2] ? (hours < 0 ? -1 : 1) * parseInt(gmt[2], 10) : 0;
    return hours * 60 + mins;
  }

  function wallTimeToUTC(yyyyMmDd, hh, mm, ianaTz) {
    if (!ianaTz) {
      return new Date(yyyyMmDd + 'T' + pad2(hh) + ':' + pad2(mm) + ':00');
    }
    var tentative = new Date(yyyyMmDd + 'T' + pad2(hh) + ':' + pad2(mm) + ':00Z');
    var offsetMin = tzOffsetMinutes(tentative, ianaTz);
    return new Date(tentative.getTime() - offsetMin * 60000);
  }

  /* ==========================================
     Inner core — pure math
     ========================================== */

  var SunPathMath = (typeof root !== 'undefined' && root.SunPathMath)
    ? root.SunPathMath
    : (typeof require === 'function' ? require('./sunpath-math.js') : null);

  var DaylightMath = (typeof root !== 'undefined' && root.DaylightMath)
    ? root.DaylightMath
    : (typeof require === 'function' ? require('./daylight-math.js') : null);

  var NightMathRef = (typeof root !== 'undefined' && root.NightMath)
    ? root.NightMath
    : (typeof require === 'function' ? require('./night-math.js') : null);

  var MoonLux = (typeof root !== 'undefined' && root.MoonLux)
    ? root.MoonLux
    : (typeof require === 'function' ? require('./moon-lux.js') : null);

  function recompute(state) {
    if (!SunPathMath || !DaylightMath) {
      return { error: 'math modules not loaded', waypoints: [] };
    }

    var route   = state.route;
    var stage   = state.stage;
    var dateStr = state.date;
    var paceKey = state.paceKey   || 'standard';
    var mode    = state.mode      || 'forward';

    var lat, lon, distanceKm, elevGainM;

    var stageTz = null;

    if (route === 'custom') {
      lat        = parseFloat(state.customLat);
      lon        = parseFloat(state.customLon);
      distanceKm = parseFloat(state.customDistance);
      elevGainM  = parseFloat(state.customElevGain) || 0;
      if (isNaN(lat) || isNaN(lon) || isNaN(distanceKm) || distanceKm <= 0) {
        return { error: 'incomplete custom route', waypoints: [] };
      }
    } else {
      var s = stage;
      if (!s || typeof s.startLat === 'undefined') {
        return { error: 'no stage data', waypoints: [] };
      }
      lat        = s.startLat;
      lon        = s.startLon;
      distanceKm = s.distanceKm;
      elevGainM  = s.elevGainM || 0;
      stageTz    = s.ianaTz || null;
    }

    if (!dateStr) return { error: 'missing date', waypoints: [] };

    var parts = dateStr.split('-');
    var walkDate = new Date(Date.UTC(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
      12, 0, 0
    ));

    var daylightHrs = SunPathMath.daylightHours(lat, walkDate);
    var isPolarDay   = daylightHrs >= 23.95;
    var isPolarNight = daylightHrs <= 0.05;

    var sunriseDate = SunPathMath.sunriseUTC(lat, lon, walkDate);
    var sunsetDate  = SunPathMath.sunsetUTC(lat, lon, walkDate);

    var civilDawn        = null;
    var civilDusk        = null;
    var nauticalDawn     = null;
    var nauticalDusk     = null;
    var astronomicalDawn = null;
    var astronomicalDusk = null;

    if (!isPolarDay && !isPolarNight) {
      civilDawn        = SunPathMath.civilDawnUTC(lat, lon, walkDate);
      civilDusk        = SunPathMath.civilDuskUTC(lat, lon, walkDate);
      nauticalDawn     = SunPathMath.nauticalDawnUTC(lat, lon, walkDate);
      nauticalDusk     = SunPathMath.nauticalDuskUTC(lat, lon, walkDate);
      astronomicalDawn = SunPathMath.astronomicalDawnUTC(lat, lon, walkDate);
      astronomicalDusk = SunPathMath.astronomicalDuskUTC(lat, lon, walkDate);
    }

    var moonriseUTC = SunPathMath.moonriseUTC(lat, lon, walkDate);
    var moonsetUTC  = SunPathMath.moonsetUTC(lat, lon, walkDate);
    var moonPhase   = SunPathMath.moonPhaseAtUTC(walkDate);

    var annotations = [];

    if (isPolarDay) {
      annotations.push({ kind: 'edge', text: 'Polar day — sun does not set on this date.' });
    } else if (isPolarNight) {
      annotations.push({ kind: 'edge', text: 'Polar night — sun does not rise on this date.' });
    }

    // Night facts: the bar draws a true-dark segment and a dark-adaptation
    // mark whenever astronomical twilight exists, regardless of the walk
    // plan (see renderSVG) — surfaced here as real annotation text too,
    // since a role="img" SVG flattens its subtree and exposes only the
    // accessible name, not any text drawn inside it. moonBrightnessAtAdapt
    // rides along on the output so the moon legend (DOM layer) can report
    // it without re-deriving the same lux sample.
    var moonBrightnessAtAdapt = null;
    if (astronomicalDusk) {
      var adaptAtUTC    = new Date(astronomicalDusk.getTime() + DARK_ADAPT_MIN * MS_PER_MIN);
      var adaptAltitude = SunPathMath.moonAltAzAt(adaptAtUTC, lat, lon).altitude;
      var adaptLux      = MoonLux.moonLuxAt(MoonLux.kFromPhase(moonPhase), adaptAltitude);
      moonBrightnessAtAdapt = MoonLux.luxBracketFor(adaptLux);
    }

    if (astronomicalDusk && astronomicalDawn) {
      annotations.push({
        kind: 'edge',
        text: 'True dark holds from ' + timeInTz(astronomicalDusk, stageTz, '24h')
          + ' to ' + timeInTz(astronomicalDawn, stageTz, '24h')
          + '; your eyes will have adjusted by ' + timeInTz(adaptAtUTC, stageTz, '24h') + '.'
      });
    } else if (astronomicalDusk) {
      annotations.push({
        kind: 'edge',
        text: 'True dark begins at ' + timeInTz(astronomicalDusk, stageTz, '24h')
          + '; your eyes will have adjusted by ' + timeInTz(adaptAtUTC, stageTz, '24h') + '.'
      });
    } else if (astronomicalDawn) {
      annotations.push({
        kind: 'edge',
        text: 'True dark lingers until ' + timeInTz(astronomicalDawn, stageTz, '24h') + '.'
      });
    }

    var walkMin = DaylightMath.walkingMinutes({
      distanceKm: distanceKm,
      elevGainM:  elevGainM,
      pacePresetOrMinPerKm: paceKey
    });

    var waypoints = (stage && stage.waypoints) ? stage.waypoints : [];

    if (mode === 'reverse') {
      var bufferMin = (state.bufferMin !== undefined && state.bufferMin !== null && !isNaN(state.bufferMin) && state.bufferMin >= 0)
        ? state.bufferMin
        : 60;

      if (isPolarNight) {
        return {
          mode:                'reverse',
          lat:                 lat,
          lon:                 lon,
          sunriseUTC:          null,
          sunsetUTC:           null,
          walkMin:             walkMin,
          bufferMin:           bufferMin,
          stageTz:             stageTz,
          annotations:         annotations,
          isPolarNight:        true,
          isPolarDay:          false,
          civilDawn:           null,
          civilDusk:           null,
          nauticalDawn:        null,
          nauticalDusk:        null,
          astronomicalDawn:    null,
          astronomicalDusk:    null,
          moonriseUTC:         moonriseUTC,
          moonsetUTC:          moonsetUTC,
          moonPhase:           moonPhase,
          moonBrightnessAtAdapt: moonBrightnessAtAdapt,
          waypoints:           waypoints,
          distanceKm:          distanceKm
        };
      }

      if (isPolarDay) {
        // No sunset means no "latest safe departure" — the reverse-mode
        // question doesn't apply. Mirror polar-night: return null for
        // the time fields, let the polar-day annotation tell the user.
        return {
          mode:                'reverse',
          lat:                 lat,
          lon:                 lon,
          sunriseUTC:          null,
          sunsetUTC:           null,
          latestDepartUTC:     null,
          walkEndUTC:          null,
          walkMin:             walkMin,
          bufferMin:           bufferMin,
          stageTz:             stageTz,
          annotations:         annotations,
          isPolarDay:          true,
          isPolarNight:        false,
          civilDawn:           null,
          civilDusk:           null,
          nauticalDawn:        null,
          nauticalDusk:        null,
          astronomicalDawn:    null,
          astronomicalDusk:    null,
          moonriseUTC:         moonriseUTC,
          moonsetUTC:          moonsetUTC,
          moonPhase:           moonPhase,
          moonBrightnessAtAdapt: moonBrightnessAtAdapt,
          waypoints:           waypoints,
          distanceKm:          distanceKm
        };
      }

      var daylightSpanMin = (sunsetDate.getTime() - sunriseDate.getTime()) / MS_PER_MIN;
      var walkEndUTC      = new Date(sunsetDate.getTime() - bufferMin * MS_PER_MIN);
      var latestDepartUTC = new Date(walkEndUTC.getTime()  - walkMin   * MS_PER_MIN);

      // Note: this guard also catches the "departs before sunrise" case —
      // walkMin + buffer > daylightSpan ⇔ latestDepart < sunrise (algebraically equivalent).
      if (walkMin > daylightSpanMin - bufferMin) {
        annotations.push({
          kind: 'walk-state',
          text: 'This stage is longer than today\'s daylight minus your buffer. Consider splitting it, or starting from a different stage.'
        });
        return {
          mode:                'reverse',
          lat:                 lat,
          lon:                 lon,
          sunriseUTC:          sunriseDate,
          sunsetUTC:           sunsetDate,
          latestDepartUTC:     null,
          walkEndUTC:          walkEndUTC,
          walkMin:             walkMin,
          bufferMin:           bufferMin,
          stageTz:             stageTz,
          annotations:         annotations,
          isPolarDay:          false,
          isPolarNight:        false,
          civilDawn:           civilDawn,
          civilDusk:           civilDusk,
          nauticalDawn:        nauticalDawn,
          nauticalDusk:        nauticalDusk,
          astronomicalDawn:    astronomicalDawn,
          astronomicalDusk:    astronomicalDusk,
          moonriseUTC:         moonriseUTC,
          moonsetUTC:          moonsetUTC,
          moonPhase:           moonPhase,
          moonBrightnessAtAdapt: moonBrightnessAtAdapt,
          waypoints:           waypoints,
          distanceKm:          distanceKm
        };
      }

      return {
        mode:                'reverse',
        lat:                 lat,
        lon:                 lon,
        sunriseUTC:          sunriseDate,
        sunsetUTC:           sunsetDate,
        latestDepartUTC:     latestDepartUTC,
        walkEndUTC:          walkEndUTC,
        walkMin:             walkMin,
        bufferMin:           bufferMin,
        stageTz:             stageTz,
        annotations:         annotations,
        isPolarDay:          false,
        isPolarNight:        false,
        civilDawn:           civilDawn,
        civilDusk:           civilDusk,
        nauticalDawn:        nauticalDawn,
        nauticalDusk:        nauticalDusk,
        astronomicalDawn:    astronomicalDawn,
        astronomicalDusk:    astronomicalDusk,
        moonriseUTC:         moonriseUTC,
        moonsetUTC:          moonsetUTC,
        moonPhase:           moonPhase,
        moonBrightnessAtAdapt: moonBrightnessAtAdapt,
        waypoints:           waypoints,
        distanceKm:          distanceKm
      };
    }

    var startMin = state.startTimeMin;
    if (startMin === undefined || startMin === null || isNaN(startMin)) {
      return { error: 'missing or invalid startTimeMin', waypoints: [] };
    }

    var startHH  = Math.floor(startMin / 60);
    var startMM  = startMin % 60;
    var startUTC = wallTimeToUTC(dateStr, startHH, startMM, stageTz);

    var arrivalUTC = new Date(startUTC.getTime() + walkMin * MS_PER_MIN);

    if (isPolarNight) {
      return {
        mode:                'forward',
        lat:                 lat,
        lon:                 lon,
        sunriseUTC:          null,
        sunsetUTC:           null,
        startUTC:            startUTC,
        arrivalUTC:          arrivalUTC,
        walkMin:             walkMin,
        cushionMin:          null,
        stageTz:             stageTz,
        annotations:         annotations,
        isPolarNight:        true,
        isPolarDay:          false,
        civilDawn:           null,
        civilDusk:           null,
        nauticalDawn:        null,
        nauticalDusk:        null,
        astronomicalDawn:    null,
        astronomicalDusk:    null,
        moonriseUTC:         moonriseUTC,
        moonsetUTC:          moonsetUTC,
        moonPhase:           moonPhase,
        moonBrightnessAtAdapt: moonBrightnessAtAdapt,
        waypoints:           waypoints,
        distanceKm:          distanceKm
      };
    }

    if (isPolarDay) {
      return {
        mode:                'forward',
        lat:                 lat,
        lon:                 lon,
        sunriseUTC:          null,
        sunsetUTC:           null,
        startUTC:            startUTC,
        arrivalUTC:          arrivalUTC,
        walkMin:             walkMin,
        cushionMin:          null,
        stageTz:             stageTz,
        annotations:         annotations,
        isPolarDay:          true,
        isPolarNight:        false,
        civilDawn:           null,
        civilDusk:           null,
        nauticalDawn:        null,
        nauticalDusk:        null,
        astronomicalDawn:    null,
        astronomicalDusk:    null,
        moonriseUTC:         moonriseUTC,
        moonsetUTC:          moonsetUTC,
        moonPhase:           moonPhase,
        moonBrightnessAtAdapt: moonBrightnessAtAdapt,
        waypoints:           waypoints,
        distanceKm:          distanceKm
      };
    }

    var cushionMin = (sunsetDate.getTime() - arrivalUTC.getTime()) / MS_PER_MIN;

    if (startUTC.getTime() < sunriseDate.getTime()) {
      var sunriseLabel = timeInTz(sunriseDate, stageTz, '24h');
      annotations.push({
        kind: 'edge',
        text: 'You\'re starting before sunrise (' + sunriseLabel + '). The first stretch will be torchlit.'
      });
    }

    if (arrivalUTC.getTime() > sunsetDate.getTime()) {
      var overMin = Math.round((arrivalUTC.getTime() - sunsetDate.getTime()) / MS_PER_MIN);
      annotations.push({
        kind: 'walk-state',
        text: 'You\'ll arrive after sunset by ' + overMin + ' min. Consider a slower stage or earlier start.'
      });
    }

    return {
      mode:                'forward',
      lat:                 lat,
      lon:                 lon,
      sunriseUTC:          sunriseDate,
      sunsetUTC:           sunsetDate,
      startUTC:            startUTC,
      arrivalUTC:          arrivalUTC,
      walkMin:             walkMin,
      cushionMin:          cushionMin,
      stageTz:             stageTz,
      annotations:         annotations,
      isPolarDay:          false,
      isPolarNight:        false,
      civilDawn:           civilDawn,
      civilDusk:           civilDusk,
      nauticalDawn:        nauticalDawn,
      nauticalDusk:        nauticalDusk,
      astronomicalDawn:    astronomicalDawn,
      astronomicalDusk:    astronomicalDusk,
      moonriseUTC:         moonriseUTC,
      moonsetUTC:          moonsetUTC,
      moonPhase:           moonPhase,
      moonBrightnessAtAdapt: moonBrightnessAtAdapt,
      waypoints:           waypoints,
      distanceKm:          distanceKm
    };
  }

  /* ==========================================
     SVG rendering (uses SVG DOM — only called
     from browser context, never from tests)
     ========================================== */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BAR_X1 = 24;
  var BAR_X2 = 576;
  var BAR_Y  = 52;
  var BAR_W  = BAR_X2 - BAR_X1;

  // Moon-lantern band — a quiet companion row above the main bar (D4).
  var MOON_BAND_Y      = 14;
  var MOON_SAMPLE_MS    = 10 * 60000;
  var MOON_BAND_OPACITY = { bright: 0.16, mid: 0.10, dim: 0.05, faint: 0 };

  function clearSVG(svgEl) {
    while (svgEl.firstChild) {
      svgEl.removeChild(svgEl.firstChild);
    }
  }

  // clearRibbonDisplay(svgEl, summaryEl) — empties both halves of the
  // ribbon's text equivalence (D11), not only its geometry: clearSVG
  // alone leaves a stale aria-label attribute behind (it only removes
  // child nodes), which would otherwise keep describing whatever route
  // was drawn last even after that route's runs are gone. Used by
  // renderRibbon's own early-return guards and by the route-picker
  // wiring's hide paths (updateRibbonForRoute, renderDarknessRibbon)
  // alike, so "hidden" and "describes nothing" always change together.
  function clearRibbonDisplay(svgEl, summaryEl) {
    clearSVG(svgEl);
    svgEl.setAttribute('aria-label', '');
    if (summaryEl) summaryEl.textContent = '';
  }

  function makeSVGEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) {
      el.setAttribute(k, attrs[k]);
    });
    return el;
  }

  function fmtDuration(totalMin) {
    var h = Math.floor(Math.abs(totalMin) / 60);
    var m = Math.round(Math.abs(totalMin) % 60);
    if (h === 0) return m + 'm';
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  }

  // fmtDistanceNumber(km) — the shared grouped-number core fmtDistance
  // builds its unit-suffixed strings from. Adds a thousands separator at
  // >=1,000 (D10's own side-finding): Shikoku's coveredKm (1,080.5) and
  // stated length (1,200) are the first inputs this page has ever handed
  // fmtDistance that cross four digits — every pre-existing call site
  // (stage distances, route totals) tops out under 1,000, so this is
  // invisible everywhere except the one new place that needs it (the
  // ribbon's own Shikoku edge label).
  function fmtDistanceNumber(km) {
    var fixed = km.toFixed(1);
    var dot      = fixed.indexOf('.');
    var intPart  = fixed.slice(0, dot);
    var fracPart = fixed.slice(dot);
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return intPart + fracPart;
  }

  function fmtDistance(km, unitSystem) {
    if (unitSystem === 'mi') {
      return fmtDistanceNumber(km * 0.621371) + '\u00A0mi';
    }
    return fmtDistanceNumber(km) + '\u00A0km';
  }

  function utcToBarX(utcDate, domain) {
    var span = domain.endUTC.getTime() - domain.startUTC.getTime();
    if (span <= 0) return BAR_X1;
    var t = utcDate.getTime() - domain.startUTC.getTime();
    var frac = Math.max(0, Math.min(1, t / span));
    return BAR_X1 + frac * BAR_W;
  }

  function kmToBarX(kmFromStart, distanceKm, walkStartX, walkEndX) {
    if (distanceKm <= 0) return walkStartX;
    var t = kmFromStart / distanceKm;
    return walkStartX + t * (walkEndX - walkStartX);
  }

  // Sample moon altitude across the bar domain at MOON_SAMPLE_MS
  // intervals, convert to lux, and merge samples sharing a lux bracket
  // into runs — pure, no DOM, so a still night doesn't cost ~100 DOM
  // nodes and so renderSVG can ask "does the moon band draw anything
  // visible" before it commits to a titleText sentence, without
  // re-sampling the whole domain a second time.
  //
  // Samples between civilDawn and civilDusk (falling back to
  // sunriseUTC/sunsetUTC when those are null, per barDomainUTC's own
  // fallback chain) are skipped outright: moonlight can't plausibly be
  // "the light" a walker is using once the sky itself is doing that job.
  // The current run is flushed at the boundary so a run never spans the
  // gap — otherwise a bracket that happened to match on both sides of
  // daylight would merge into one line straight through midday.
  function computeMoonBandRuns(output, domain) {
    var runs = [];
    if (!SunPathMath || !MoonLux) return runs;
    if (output.lat == null || output.lon == null) return runs;

    var k = MoonLux.kFromPhase(output.moonPhase);
    var startMs = domain.startUTC.getTime();
    var endMs   = domain.endUTC.getTime();

    var dayStart = output.civilDawn || output.sunriseUTC;
    var dayEnd   = output.civilDusk || output.sunsetUTC;
    var dayStartMs = dayStart ? dayStart.getTime() : null;
    var dayEndMs   = dayEnd   ? dayEnd.getTime()   : null;

    var runStartMs = null;
    var runLabel   = null;

    function flushRun(runEndMs) {
      if (runStartMs === null) return;
      runs.push({
        startMs: runStartMs,
        endMs:   runEndMs,
        label:   runLabel,
        opacity: MOON_BAND_OPACITY[runLabel]
      });
      runStartMs = null;
      runLabel   = null;
    }

    for (var t = startMs; t <= endMs; t += MOON_SAMPLE_MS) {
      var inDaylight = dayStartMs !== null && dayEndMs !== null &&
        t >= dayStartMs && t < dayEndMs;

      if (inDaylight) {
        flushRun(t);
        continue;
      }

      var altitude = SunPathMath.moonAltAzAt(new Date(t), output.lat, output.lon).altitude;
      var lux      = MoonLux.moonLuxAt(k, altitude);
      var label    = MoonLux.luxBracketFor(lux).label;

      if (label !== runLabel) {
        flushRun(t);
        runStartMs = t;
        runLabel   = label;
      }
    }
    flushRun(endMs);

    return runs;
  }

  // Paints the runs computeMoonBandRuns produced. Zero-opacity (faint /
  // moon down or new) runs are skipped entirely — that skip *is*
  // "visibly absent".
  function paintMoonBand(runs, domain, svgEl) {
    runs.forEach(function (run) {
      if (!(run.opacity > 0)) return;
      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-bar-moonlight',
        x1: utcToBarX(new Date(run.startMs), domain), y1: MOON_BAND_Y,
        x2: utcToBarX(new Date(run.endMs),   domain), y2: MOON_BAND_Y,
        opacity: run.opacity
      }));
    });
  }

  function renderSVG(output, svgEl, stageTz, clockFmt) {
    clearSVG(svgEl);

    if (output.error) return;

    if (output.isPolarNight || output.isPolarDay) return;

    var sunrise = output.sunriseUTC;
    var sunset  = output.sunsetUTC;

    if (!sunrise || !sunset) return;

    var domain = DaylightMath.barDomainUTC(output);
    if (!domain) return;

    var sunriseX = utcToBarX(sunrise, domain);
    var sunsetX  = utcToBarX(sunset,  domain);

    var nowUTC = new Date();

    // Computed before titleText so the sentence can describe exactly what
    // the bar draws below — never more, never less. Each clause is gated
    // on the same field renderSVG itself checks to decide whether to draw
    // the corresponding element (astronomicalDawn/Dusk for true dark and
    // the moon-band daylight cutoff, astronomicalDusk for the adaptation
    // mark), so a fallback-rung day (Finding 10) states only what it has.
    var moonBandRuns = computeMoonBandRuns(output, domain);
    var moonBandVisible = moonBandRuns.some(function (run) { return run.opacity > 0; });
    var adaptUTC = output.astronomicalDusk
      ? new Date(output.astronomicalDusk.getTime() + DARK_ADAPT_MIN * 60000)
      : null;

    var tzSuffix = stageTz ? '' : ' (local time)';
    var titleText = 'Daylight from ' + timeInTz(sunrise, stageTz, clockFmt || '24h')
      + ' to ' + timeInTz(sunset, stageTz, clockFmt || '24h') + tzSuffix;

    if (output.astronomicalDusk && output.astronomicalDawn) {
      titleText += '; true dark from ' + timeInTz(output.astronomicalDusk, stageTz, clockFmt || '24h')
        + ' to ' + timeInTz(output.astronomicalDawn, stageTz, clockFmt || '24h')
        + (moonBandVisible ? ', partly moonlit' : '');
    } else if (output.astronomicalDusk) {
      titleText += '; true dark begins at ' + timeInTz(output.astronomicalDusk, stageTz, clockFmt || '24h');
    } else if (output.astronomicalDawn) {
      titleText += '; true dark until ' + timeInTz(output.astronomicalDawn, stageTz, clockFmt || '24h');
    }

    if (adaptUTC) {
      titleText += '; eyes adjust by ' + timeInTz(adaptUTC, stageTz, clockFmt || '24h');
    }

    // Mirror the rich title into aria-label so screen readers announce the
    // actual sunrise/sunset times — otherwise the static aria-label on the
    // SVG element ("Daylight bar") shadows the dynamic <title> element.
    svgEl.setAttribute('aria-label', titleText);

    var titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.textContent = titleText;
    svgEl.appendChild(titleEl);

    paintMoonBand(moonBandRuns, domain, svgEl);

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-track',
      x1: BAR_X1, y1: BAR_Y, x2: BAR_X2, y2: BAR_Y
    }));

    // True dark: domain start → astronomical dawn, and astronomical dusk →
    // domain end. Drawn first (bottom layer) — the absence beneath the
    // twilight bands. Skipped on whichever side lacks astronomical
    // twilight (custom coords above ~48° in summer) rather than
    // substituting a fallback rung's edge.
    if (output.astronomicalDawn) {
      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-bar-truedark',
        x1: utcToBarX(domain.startUTC, domain), y1: BAR_Y,
        x2: utcToBarX(output.astronomicalDawn, domain), y2: BAR_Y
      }));
    }
    if (output.astronomicalDusk) {
      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-bar-truedark',
        x1: utcToBarX(output.astronomicalDusk, domain), y1: BAR_Y,
        x2: utcToBarX(domain.endUTC, domain), y2: BAR_Y
      }));
    }

    var twilightBands = [
      { dawn: output.astronomicalDawn, dusk: output.astronomicalDusk, cls: 'dl-bar-astronomical' },
      { dawn: output.nauticalDawn,     dusk: output.nauticalDusk,     cls: 'dl-bar-nautical'     },
      { dawn: output.civilDawn,        dusk: output.civilDusk,        cls: 'dl-bar-civil'        }
    ];

    twilightBands.forEach(function (band) {
      if (!band.dawn || !band.dusk) return;
      svgEl.appendChild(makeSVGEl('line', {
        class: band.cls,
        x1: utcToBarX(band.dawn, domain),
        y1: BAR_Y,
        x2: utcToBarX(band.dusk, domain),
        y2: BAR_Y
      }));
    });

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-daylight',
      x1: sunriseX, y1: BAR_Y, x2: sunsetX, y2: BAR_Y
    }));

    var walkStartX = null;
    var walkEndX   = null;

    if (output.mode === 'reverse') {
      if (output.latestDepartUTC === null) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-tick-sunrise',
          x1: sunriseX, y1: BAR_Y - 10,
          x2: sunriseX, y2: BAR_Y + 10
        }));
        var sunriseLblOnly = makeSVGEl('text', {
          class: 'dl-bar-label',
          x: sunriseX, y: BAR_Y + 22,
          'text-anchor': 'middle'
        });
        sunriseLblOnly.textContent = timeInTz(sunrise, stageTz, clockFmt || '24h');
        svgEl.appendChild(sunriseLblOnly);
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-tick-sunset',
          x1: sunsetX, y1: BAR_Y - 10,
          x2: sunsetX, y2: BAR_Y + 10
        }));
        var sunsetLblOnly = makeSVGEl('text', {
          class: 'dl-bar-label',
          x: sunsetX, y: BAR_Y + 22,
          'text-anchor': 'middle'
        });
        sunsetLblOnly.textContent = timeInTz(sunset, stageTz, clockFmt || '24h');
        svgEl.appendChild(sunsetLblOnly);
        return;
      }

      var departX = utcToBarX(output.latestDepartUTC, domain);
      walkStartX  = departX;
      walkEndX    = utcToBarX(output.walkEndUTC, domain);
      var walkX1  = Math.min(departX, walkEndX);
      var walkX2  = Math.max(departX, walkEndX);

      if (walkX2 > walkX1 + 0.5) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-walk',
          x1: walkX1, y1: BAR_Y, x2: walkX2, y2: BAR_Y
        }));
      }

      if (walkEndX < sunsetX - 0.5) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-buffer',
          x1: walkEndX, y1: BAR_Y, x2: sunsetX, y2: BAR_Y
        }));
      }

      svgEl.appendChild(makeSVGEl('circle', {
        class: 'dl-bar-dot',
        cx: departX, cy: BAR_Y, r: 3.5,
        'stroke-width': 1.5
      }));
      svgEl.appendChild(makeSVGEl('circle', {
        class: 'dl-bar-dot',
        cx: walkEndX, cy: BAR_Y, r: 3.5,
        'stroke-width': 1.5
      }));
    } else {
      var startX   = utcToBarX(output.startUTC,   domain);
      var arrivalX = utcToBarX(output.arrivalUTC, domain);
      walkStartX   = startX;
      walkEndX     = arrivalX;
      var walkX1   = Math.min(startX, arrivalX);
      var walkX2   = Math.max(startX, arrivalX);

      if (walkX2 > walkX1 + 0.5) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-walk',
          x1: walkX1, y1: BAR_Y, x2: walkX2, y2: BAR_Y
        }));
      }

      svgEl.appendChild(makeSVGEl('circle', {
        class: 'dl-bar-dot',
        cx: startX, cy: BAR_Y, r: 3.5,
        'stroke-width': 1.5
      }));
      svgEl.appendChild(makeSVGEl('circle', {
        class: 'dl-bar-dot',
        cx: arrivalX, cy: BAR_Y, r: 3.5,
        'stroke-width': 1.5
      }));
    }

    if (output.waypoints && output.waypoints.length && walkStartX !== null && walkEndX !== null) {
      output.waypoints.forEach(function (wp) {
        if (wp.kmFromStart < 0 || wp.kmFromStart > output.distanceKm) return;
        var x = kmToBarX(wp.kmFromStart, output.distanceKm, walkStartX, walkEndX);
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-waypoint',
          x1: x, y1: BAR_Y + 6,
          x2: x, y2: BAR_Y + 10
        }));
      });
    }

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-tick-sunrise',
      x1: sunriseX, y1: BAR_Y - 10,
      x2: sunriseX, y2: BAR_Y + 10
    }));
    var sunriseLbl = makeSVGEl('text', {
      class: 'dl-bar-label',
      x: sunriseX, y: BAR_Y + 22,
      'text-anchor': 'middle'
    });
    sunriseLbl.textContent = timeInTz(sunrise, stageTz, clockFmt || '24h');
    svgEl.appendChild(sunriseLbl);

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-tick-sunset',
      x1: sunsetX, y1: BAR_Y - 10,
      x2: sunsetX, y2: BAR_Y + 10
    }));
    var sunsetLbl = makeSVGEl('text', {
      class: 'dl-bar-label',
      x: sunsetX, y: BAR_Y + 22,
      'text-anchor': 'middle'
    });
    sunsetLbl.textContent = timeInTz(sunset, stageTz, clockFmt || '24h');
    svgEl.appendChild(sunsetLbl);

    // Dark adaptation: rod cells take ~20 min to adjust. Only meaningful
    // once there's true dark to adapt into — skip when astronomical dusk
    // itself doesn't occur (fallback rung in effect).
    //
    // The mark sits at astronomicalDusk + DARK_ADAPT_MIN, and the domain
    // ends at astronomicalDusk + BAR_DOMAIN_MARGIN_MS (daylight-math.js) —
    // so it lands a fixed (BAR_DOMAIN_MARGIN_MS − DARK_ADAPT_MIN) short of
    // the right edge at every latitude and season, by construction. That's
    // correct, not a bug: both ends of the gap are anchored to the same
    // instant, so widening the margin is what gives it room to read.
    if (adaptUTC) {
      var adaptX = utcToBarX(adaptUTC, domain);
      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-bar-tick-adapt',
        x1: adaptX, y1: BAR_Y - 10,
        x2: adaptX, y2: BAR_Y + 10
      }));
      var adaptLbl = makeSVGEl('text', {
        class: 'dl-bar-label-adapt',
        // Own row, above the "now" row (BAR_Y-14, which "now" occupies
        // for a ~1h49m window most evenings) and clear of the
        // sunrise/sunset row (BAR_Y+22) below the bar.
        x: adaptX - 4, y: BAR_Y - 24,
        'text-anchor': 'end'
      });
      adaptLbl.textContent = 'eyes adjust';
      svgEl.appendChild(adaptLbl);
    }

    if (output.moonriseUTC) {
      var mrT = output.moonriseUTC.getTime();
      if (mrT >= domain.startUTC.getTime() && mrT <= domain.endUTC.getTime()) {
        var mrX = utcToBarX(output.moonriseUTC, domain);
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-moon-tick',
          x1: mrX, y1: BAR_Y - 6,
          x2: mrX, y2: BAR_Y + 6
        }));
      }
    }

    if (output.moonsetUTC) {
      var msT = output.moonsetUTC.getTime();
      if (msT >= domain.startUTC.getTime() && msT <= domain.endUTC.getTime()) {
        var msX = utcToBarX(output.moonsetUTC, domain);
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-moon-tick',
          x1: msX, y1: BAR_Y - 6,
          x2: msX, y2: BAR_Y + 6
        }));
      }
    }

    var sameDay = (nowUTC.getUTCFullYear() === sunrise.getUTCFullYear()
      && nowUTC.getUTCMonth()    === sunrise.getUTCMonth()
      && nowUTC.getUTCDate()     === sunrise.getUTCDate());

    if (sameDay) {
      var nowX = utcToBarX(nowUTC, domain);
      if (nowX > BAR_X1 && nowX < BAR_X2) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-tick-now',
          x1: nowX, y1: BAR_Y - 8,
          x2: nowX, y2: BAR_Y + 8
        }));
        var nowLbl = makeSVGEl('text', {
          class: 'dl-bar-label-now',
          x: nowX, y: BAR_Y - 14,
          'text-anchor': 'middle'
        });
        nowLbl.textContent = 'now';
        svgEl.appendChild(nowLbl);
      }
    }
  }

  /* ==========================================
     Darkness ribbon (D1-D13) — a second, independent instrument
     beneath the bar above. Own <svg>, own coordinate function: never
     utcToBarX (time) or kmToBarX (the bar's walk-subrange helper).
     ========================================== */

  // RIBBON_X1/X2 used to equal BAR_X1/BAR_X2 exactly (24/576) — the same
  // numbers, "purely so the two rows keep the same page margins." Measured
  // what that actually does to a reader (real browser, 2026-08-12,
  // reproducible against the live bar geometry — full method and two more
  // routes in docs/specs/2026-08-12-darkness-ribbon.md, D8): camino-
  // primitivo stage 1 (Oviedo -> Grado, 25.2 km) sits, by km-weighted
  // share of its merged runs, at 44% countryside / 40% open dark — the
  // stage itself dominated by "countryside." The bar's own walk-segment
  // x-range for that same stage, reused as a ribbon x-coordinate, lands
  // on ribbon km 32.6-120.4, which reads 40% open dark / 60% as it was —
  // dominated by "as it was," the single darkest band this instrument
  // draws, on the strength of nothing but matching pixel bounds.
  // Camino-ingles and camino-portugues stage 1 misread the same
  // direction, one to two bands darker. D8's three defences (separate
  // <svg>, a plain-language caption, no shared ticks) are all textual or
  // positional; sharing exact pixel bounds left the one geometric cue a
  // reader's eye actually uses — column alignment — pointing the wrong
  // way. This is the geometric fourth defence: inset 24 units past
  // BAR_X1/BAR_X2 on each side (double the bar's own 24-unit margin from
  // the SVG edge — an existing, meaningful number, not a new arbitrary
  // one), so the ribbon's drawn extent visibly does not reach either of
  // the bar's edges. The two strips no longer share a single x-coordinate
  // by construction, so column-alignment between them reads as what it
  // is — two unrelated axes — rather than as a plausible but wrong
  // correspondence.
  var RIBBON_X1 = 48;
  // DARKNESS_RIBBON_WIDTH lives in js/daylight-math.js, not here, because
  // mergeDarknessRuns's minimum-drawable-run-width guard needs the exact
  // same number: one shared constant, so the strip's own geometry and
  // its minimum-visible-run policy can never quietly disagree about what
  // this ribbon's width actually is.
  var RIBBON_W  = DaylightMath.DARKNESS_RIBBON_WIDTH;
  var RIBBON_X2 = RIBBON_X1 + RIBBON_W;
  var RIBBON_Y  = 16;
  var RIBBON_LABEL_Y = 36;

  // kmToRibbonX(kmFromStart, coveredKm) — the ribbon's own distance axis.
  // Never touches a Date or a bar domain object. The clamped fraction
  // comes from js/daylight-math.js so that night-math's isDrawableCell
  // asks the axis the same question this does (see ribbonFracForKm).
  function kmToRibbonX(kmFromStart, coveredKm) {
    return RIBBON_X1 + DaylightMath.ribbonFracForKm(kmFromStart, coveredKm) * RIBBON_W;
  }

  // darknessArtifactShapeIssue(darknessData) — the fields renderRibbon's
  // own math (mergeDarknessRuns, darknessAggregateWindowKm,
  // darknessSummarySentence) all assume are present and correctly typed.
  // Checked up front, alongside the existing `unit` check, so a malformed
  // artifact fails to hidden with a named reason instead of throwing
  // partway through a render or a computed sentence — or, worse, silently
  // drawing something wrong (a missing stepKm used to produce
  // `<line x1="NaN">` band elements with no error at all). Returns the
  // offending field name, or null when the shape is sound. `unit` itself
  // is deliberately not re-checked here — both call sites below already
  // gate on it themselves, the same duplication the unit check already
  // had before this.
  //
  // Every check below validates a value the math actually dereferences,
  // not merely the container it arrives in. The first cut of this guard
  // checked `positionalConfidence` was an object and stopped there, which
  // let three separate malformed shapes straight through to the render:
  //
  //   - p90GapKm missing while withinInterpolationLimit is false —
  //     darknessAggregateWindowKm returns NaN, `buckets[NaN].push` throws
  //     a TypeError out of xhr.onload, no ribbon and no explanation.
  //   - p90GapKm 0 or null — numWindows is Infinity, and the bucket
  //     allocation loop runs until the tab (or node, at 4 GB) dies.
  //   - a non-finite coveredKm — isNaN() alone accepts Infinity, and
  //     kmToRibbonX then emits the exact `<line x2="NaN">` this guard
  //     exists to have closed.
  //
  // A non-numeric entry in values[] is rejected for a different reason:
  // darknessBandForValue's comparison chain falls through to `return 0`
  // for anything that isn't a number, silently classifying it as band 0,
  // the BRIGHTEST band. A darkness instrument must not fail toward "less
  // dark", so a values[] this function cannot vouch for hides the section
  // instead.
  //
  // The final check is the producer's own documented invariant
  // (scripts/darkness/emit.py: "floor(coveredKm / stepKm) + 1 must equal
  // len(values)"). Every shipped artifact satisfies it; asserting it here
  // means a consumer holding only the file checks the same relationship
  // its producer promised, rather than drawing a strip whose axis and
  // whose samples disagree about how long the route is.
  function darknessArtifactShapeIssue(darknessData) {
    if (typeof darknessData.coveredKm !== 'number' || !isFinite(darknessData.coveredKm) || darknessData.coveredKm <= 0) return 'coveredKm';
    if (typeof darknessData.stepKm !== 'number' || !isFinite(darknessData.stepKm) || darknessData.stepKm <= 0) return 'stepKm';

    var confidence = darknessData.positionalConfidence;
    if (!confidence || typeof confidence !== 'object') return 'positionalConfidence';
    if (typeof confidence.withinInterpolationLimit !== 'boolean') return 'positionalConfidence.withinInterpolationLimit';
    if (confidence.withinInterpolationLimit !== true
      && (typeof confidence.p90GapKm !== 'number' || !isFinite(confidence.p90GapKm) || confidence.p90GapKm <= 0)) {
      return 'positionalConfidence.p90GapKm';
    }

    if (!Array.isArray(darknessData.values) || darknessData.values.length === 0) return 'values';
    for (var i = 0; i < darknessData.values.length; i++) {
      var sample = darknessData.values[i];
      if (typeof sample !== 'number' || !isFinite(sample)) return 'values[' + i + ']';
    }
    if (Math.floor(darknessData.coveredKm / darknessData.stepKm) + 1 !== darknessData.values.length) return 'values.length';

    return null;
  }

  // darknessArtifactRouteLabel(darknessData) — every real artifact carries
  // its own route id (`"route": "shikoku-88"`, etc.), so a shape-issue
  // warning can name the route without renderRibbon needing a routeId
  // parameter it doesn't otherwise have a use for. Falls back to a plain
  // label when even that field is part of what's malformed.
  function darknessArtifactRouteLabel(darknessData) {
    return (darknessData && typeof darknessData.route === 'string' && darknessData.route) || '(unknown route)';
  }

  // warnMalformedDarknessArtifact(darknessData, shapeIssue) — one wording,
  // two callers. renderRibbon warns when it is asked to draw something it
  // can't; renderDarknessRibbon (the DOM half, below) warns on the path
  // that actually happens on the page, where ribbonSectionHidden
  // short-circuits before renderRibbon is ever called. Kept as one
  // function so the two can't drift into saying different things about
  // the same artifact.
  function warnMalformedDarknessArtifact(darknessData, shapeIssue) {
    console.warn('Darkness ribbon: "' + darknessArtifactRouteLabel(darknessData)
      + '" artifact is missing or malformed at "' + shapeIssue
      + '" — rendering nothing rather than drawing from data that isn\'t there.');
  }

  // ribbonSectionHidden(routeId, darknessData) — D12 (custom routes and
  // the unselected state show no ribbon) plus the Gate 0 §7 defensive
  // guard (a route whose artifact doesn't carry the sky-brightness unit
  // renders nothing, rather than mislabeling a different quantity), plus
  // the same shape check renderRibbon runs on its own input — so the
  // wrap's own visibility and renderRibbon's decision to draw never
  // disagree (a shape failure used to leave the caption and an empty svg
  // visible, because ribbonSectionHidden didn't know renderRibbon was
  // about to bail).
  // Pure and DOM-free on purpose: the browser-only route-change wiring
  // that calls this with real state is a later slice's concern; this
  // slice's job is the decision itself, directly testable without it.
  function ribbonSectionHidden(routeId, darknessData) {
    if (!routeId || routeId === 'custom') return true;
    if (!darknessData || darknessData.unit !== 'mag/arcsec2') return true;
    if (darknessArtifactShapeIssue(darknessData)) return true;
    return false;
  }

  // renderRibbon(darknessData, svgEl, unitSystem, statedDistanceKm, summaryEl)
  // — one stroke segment per run from DaylightMath.mergeDarknessRuns,
  // coloured/named by DARKNESS_BAND_NAMES[band] (D1, D9) via the
  // dl-ribbon-band-N classes in css/daylight.css, dashed unless
  // heldOutValidation is the literal boolean true (D4, Finding 5 — a
  // missing or malformed field reads as unvalidated, not trustworthy),
  // plus the two end-distance labels drawn from coveredKm — never
  // route-meta's stated distanceKm (AC #9). Draws nothing else: no
  // baseline track, no ticks, so nothing is ever painted over the runs
  // after they're placed.
  //
  // statedDistanceKm and summaryEl are both optional (undefined is
  // fine): statedDistanceKm feeds DaylightMath.darknessSummarySentence's
  // own ">5 km gap" discrepancy framing (D3/D13) — omitting it just
  // means that framing never fires, not a thrown error; the sentence
  // still states coveredKm plainly (Finding 6). summaryEl, when given,
  // is the real sibling <p> outside this <svg> (D8, D11) — the same
  // sentence used for aria-label/<title> is also written there, so a
  // screen-reader user and a sighted reader relying on plain DOM text
  // land on identical words (AC #5).
  function renderRibbon(darknessData, svgEl, unitSystem, statedDistanceKm, summaryEl) {
    clearRibbonDisplay(svgEl, summaryEl);

    if (!darknessData || darknessData.unit !== 'mag/arcsec2') return;

    var shapeIssue = darknessArtifactShapeIssue(darknessData);
    if (shapeIssue) {
      warnMalformedDarknessArtifact(darknessData, shapeIssue);
      return;
    }

    var coveredKm = darknessData.coveredKm;
    var windowKm  = DaylightMath.darknessAggregateWindowKm(darknessData.positionalConfidence);
    var runs      = DaylightMath.mergeDarknessRuns(darknessData.values, darknessData.stepKm, coveredKm, windowKm);
    // !== true, not === false (Finding 5): a missing field or a malformed
    // non-boolean value must read as unvalidated, not as trustworthy —
    // the same fail-toward-the-safer-claim discipline the unit guard
    // above already applies.
    var dashed    = darknessData.heldOutValidation !== true;

    runs.forEach(function (run) {
      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-ribbon-band-' + run.band + (dashed ? ' dl-ribbon-unvalidated' : ''),
        x1: kmToRibbonX(run.startKm, coveredKm), y1: RIBBON_Y,
        x2: kmToRibbonX(run.endKm,   coveredKm), y2: RIBBON_Y
      }));
    });

    var sentence = DaylightMath.darknessSummarySentence(darknessData, statedDistanceKm, unitSystem);
    svgEl.setAttribute('aria-label', sentence);
    var titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.textContent = sentence;
    svgEl.appendChild(titleEl);
    if (summaryEl) summaryEl.textContent = sentence;

    var leftLbl = makeSVGEl('text', {
      class: 'dl-ribbon-label',
      x: RIBBON_X1, y: RIBBON_LABEL_Y,
      'text-anchor': 'start'
    });
    leftLbl.textContent = fmtDistance(0, unitSystem);
    svgEl.appendChild(leftLbl);

    var rightLbl = makeSVGEl('text', {
      class: 'dl-ribbon-label',
      x: RIBBON_X2, y: RIBBON_LABEL_Y,
      'text-anchor': 'end'
    });
    rightLbl.textContent = fmtDistance(coveredKm, unitSystem);
    svgEl.appendChild(rightLbl);
  }

  // The moon strip sits on the ribbon's own x-axis (D1) so the two can be
  // read against each other — same inset, same km-to-x mapping. Only y
  // differs, and it is the strip's own SVG anyway.
  var MOON_Y = 16;

  // Half the band's drawn height, from .dl-moon-band-N's stroke-width: 16
  // in css/daylight.css. Named here because the mark below has to clear
  // it; js/daylight-render.test.js reads the stylesheet's real
  // stroke-width against the emitted y attributes, so the two cannot
  // quietly disagree.
  var MOON_BAND_HALF = 8;

  // A named night's mark hangs BELOW the strip, in the axis-label row,
  // with only the page behind it.
  //
  // It used to cross the band, and there it could not be read. The mark
  // is 2.5 units of stroke over a 504-unit fill, and against the ramp's
  // bright steps — the ones a lantern night is by definition on — it
  // measured 1.550:1, where WCAG 1.4.11 asks 3:1 of a graphical object
  // carrying essential information, and locating the named night is the
  // mark's whole purpose. No colour fixes that: against the dark ramp's
  // composited extremes the best worst-case any grey reaches is 2.681:1.
  // Asking for separation from every step of a full-range ramp is asking
  // for something that does not exist.
  //
  // Off the band there is one colour behind the mark per theme, so the
  // floor is arithmetic rather than a compromise. It also ends the seam
  // question outright: the mark was 8 units tall against a block's
  // stroke-width of 10, leaving one unit of band each side — 0.467 device
  // px on the narrowest column this page renders at — and 89% of
  // shikoku's marks land on a block. A mark that touches no band cannot
  // read as a boundary.
  var MOON_MARK_Y1 = MOON_Y + MOON_BAND_HALF + 3;
  var MOON_MARK_Y2 = MOON_MARK_Y1 + 5;

  // The axis labels drop below the mark rather than sharing its row: a
  // named night can be night 1 of a 33-night walk, and its mark would
  // then land inside the left label's own glyphs. The strip's viewBox
  // grew to 46 to hold the extra row (daylight/index.html), keeping the
  // same four units of descender tail the labels had at 36 in a 40-unit
  // box.
  var MOON_LABEL_Y = 42;

  // Two cells abut when the end of one is the start of the next. The
  // tolerance is there because both numbers arrive from stagePlacements'
  // own cumulative sums, so exact float equality is not something the
  // drawing layer should depend on; 1e-6 km is a millimetre.
  var MOON_ABUT_TOLERANCE_KM = 1e-6;

  /*
   * coalesceMoonCells(cells) — merge abutting cells the strip would paint
   * identically, so no <line> boundary is drawn where the data has none.
   * The direct precedent is absorbNarrowDarknessRuns (js/daylight-math.js),
   * which exists for this same reason one strip above: two abutting
   * semi-transparent <line>s composite their antialiased edges in
   * sequence, and the shared fractional pixel lands lighter than either —
   * measured here at up to 0.235 alpha, against the 0.10 that was already
   * treated as a defect on the ribbon. 72% of camino-frances's abutting
   * cell pairs share a band (23 of 32; norte 24 of 33, portugues and
   * primitivo 7 of 10 each, kumano 2 of 3), and the false seams they drew
   * read STRONGER — 1.687:1 seam-against-fill on band 4 — than the
   * tightest step between two real bands (1.355:1, css/daylight.css).
   *
   * Three conditions, all necessary:
   *   - they abut. Shikoku's 288 km of gaps between temple clusters are
   *     real absences and must survive as gaps.
   *   - they share moonBand. Different bands are a boundary the data has.
   *   - they share isBlock. A block strokes at width 10 against a single
   *     night's 16, so merging the two would paint one of them wrong.
   *
   * Drawing only. The cells keep their own identity, their own night
   * numbering and their own place in the prose; this is the geometry the
   * reader can actually distinguish, and it carries no other field so it
   * cannot be mistaken for one.
   */
  function coalesceMoonCells(cells) {
    var out = [];
    cells.forEach(function (cell) {
      var previous = out.length ? out[out.length - 1] : null;
      if (previous
        && previous.moonBand === cell.moonBand
        && previous.isBlock === cell.isBlock
        && Math.abs(cell.loKm - previous.hiKm) < MOON_ABUT_TOLERANCE_KM) {
        previous.hiKm = cell.hiKm;
        return;
      }
      out.push({
        loKm: cell.loKm, hiKm: cell.hiKm,
        moonBand: cell.moonBand, isBlock: cell.isBlock
      });
    });
    return out;
  }

  /*
   * renderMoonStrip(cells, notable, startDate, coveredKm, svgEl,
   * summaryEl, heldOutValidation)
   *
   * One line per drawable span, placed by the kilometres it covers — NOT
   * by night index. A night is drawn where it is walked, which is the
   * whole point of sharing the ribbon's axis.
   *
   * Cells the schedule did not place (shikoku's 288 km between temple
   * clusters) are simply absent. Emitting a zero-width line instead would
   * still paint an antialiased hairline and draw a boundary exactly where
   * the instrument is deliberately saying nothing — the same defect class
   * as the ribbon's same-band adjacencies.
   *
   * NightMathRef is required, not optional: without it there is no
   * sentence, and a strip with bands but no text equivalent is a strip a
   * screen-reader user cannot read at all (D10). That guard is reachable
   * only on a page that loaded this file without js/night-math.js, which
   * node's own require can never produce — js/daylight-render.test.js
   * therefore builds it, by loading a second instance of this module
   * against a stubbed-null night-math, rather than leaving a guard
   * standing that deleting would cost nothing.
   *
   * heldOutValidation is the darkness artifact's own field, carried
   * through to the sentence's sky clause — that clause ranks one stretch
   * of the route against another from the same unvalidated data the
   * ribbon disclaims one section above. Omitted, it reads as unvalidated.
   */
  function renderMoonStrip(cells, notable, startDate, coveredKm, svgEl, summaryEl, heldOutValidation) {
    clearRibbonDisplay(svgEl, summaryEl);
    if (!cells || !cells.length || !(coveredKm > 0) || !NightMathRef) return;

    // One shared verdict on what gets ink, so the lines, the axis label
    // and every clause in the sentence below are counting the same cells
    // (js/night-math.js's isDrawableCell). A strip with nothing drawable
    // renders nothing at all rather than a caption over empty space.
    var drawable = NightMathRef.drawableCells(cells, coveredKm);
    if (!drawable.length) return;

    coalesceMoonCells(drawable).forEach(function (span) {
      var x1 = kmToRibbonX(span.loKm, coveredKm);
      var x2 = kmToRibbonX(span.hiKm, coveredKm);
      // A span with km width can still have no DRAWN width: kmToRibbonX
      // clamps to [RIBBON_X1, RIBBON_X2], so a placement lying entirely
      // past the end of the darkness axis collapses onto one edge. A
      // zero-width <line> still paints an antialiased hairline, which is
      // a boundary drawn where nothing was placed. `x2 > x1` also covers
      // a NaN coordinate, since every comparison against NaN is false —
      // an explicit isFinite() pair here was pure decoration, unreachable
      // for any input this guard could still see.
      if (!(x2 > x1)) return;

      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-moon-band-' + span.moonBand + (span.isBlock ? ' dl-moon-block' : ''),
        x1: x1, y1: MOON_Y,
        x2: x2, y2: MOON_Y
      }));
    });

    /* The two nights the sentence names get a mark where they are walked
     * (D10). Coalescing was right — it stopped the strip asserting
     * boundaries the data does not have — but it also erased every true
     * per-night boundary along with the false ones, and 77% of named
     * nights ended up inside a wider merged span. On camino-frances from
     * a 2026-08-13 start the prose named "night 17" while 33 nights drew
     * as 7 lines and night 17 sat somewhere inside a bar covering a third
     * of the axis; the axis is kilometres, so 17 of 33 could not be
     * interpolated either. The span count moves with the start date — the
     * 12 October start this repo's tests pin gives 10 — so the date is
     * stated rather than left to be read as a constant.
     *
     * Showing the lunation's shape and locating a night are separable
     * jobs. The spans do the first; these two marks do the second.
     *
     * Placed at the centre of that night's OWN cell extent, not the merged
     * span's — the span is a drawing convenience, the cell is the night.
     * A suppressed clause draws no tick, so the marks and the sentence
     * always name the same nights: both read `notable`, nothing else.
     *
     * The x is the whole claim and it is unchanged. What moved is the y:
     * the mark hangs under the strip rather than crossing it, because on
     * the band it cleared no honest contrast floor and could not be made
     * to (MOON_MARK_Y1 above).
     */
    [notable && notable.sky, notable && notable.lantern].forEach(function (cell) {
      if (!cell) return;
      var tickX = kmToRibbonX((cell.loKm + cell.hiKm) / 2, coveredKm);
      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-moon-tick',
        x1: tickX, y1: MOON_MARK_Y1,
        x2: tickX, y2: MOON_MARK_Y2
      }));
    });

    var sentence = NightMathRef.nightSummarySentence(cells, notable, startDate,
                                                     coveredKm, heldOutValidation);
    svgEl.setAttribute('aria-label', sentence);
    var titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.textContent = sentence;
    svgEl.appendChild(titleEl);
    if (summaryEl) summaryEl.textContent = sentence;

    // The two edge labels name the nights actually AT those edges, taken
    // from the drawn cells rather than from a count of the schedule. On
    // every shipped route the two are the same number; they part company
    // exactly when a cell cannot be drawn, and then a count would put the
    // right-hand label on a lower night than the prose names inside the
    // strip — the axis and the sentence contradicting each other about
    // the same walk.
    var firstDrawn = drawable[0];
    var lastDrawn  = drawable[drawable.length - 1];

    var leftLbl = makeSVGEl('text', {
      class: 'dl-moon-label',
      x: RIBBON_X1, y: MOON_LABEL_Y,
      'text-anchor': 'start'
    });
    leftLbl.textContent = 'night ' + firstDrawn.firstNight;
    svgEl.appendChild(leftLbl);

    var rightLbl = makeSVGEl('text', {
      class: 'dl-moon-label',
      x: RIBBON_X2, y: MOON_LABEL_Y,
      'text-anchor': 'end'
    });
    rightLbl.textContent = 'night ' + (lastDrawn.firstNight + lastDrawn.nights - 1);
    svgEl.appendChild(rightLbl);
  }

  /* ==========================================
     Exports
     ========================================== */

  var api = {
    recompute:           recompute,
    renderSVG:           renderSVG,
    fmtDuration:         fmtDuration,
    renderRibbon:        renderRibbon,
    ribbonSectionHidden: ribbonSectionHidden,
    renderMoonStrip:     renderMoonStrip
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Daylight = api;
  }

  /* ==========================================
     Outer shell — DOM glue (browser only)
     ========================================== */

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var _stageData    = {};
  var _darknessData = {};
  var _routeMeta    = null;
  var _currentRoute = null;
  var _currentMode  = 'forward';

  var _prefs = {
    unitSystem:  'km',
    clockFormat: '24h'
  };

  var dom = {};

  document.addEventListener('DOMContentLoaded', function () {
    dom.routeSel      = document.getElementById('dl-route');
    dom.stageSel      = document.getElementById('dl-stage');
    dom.stageWrap     = document.getElementById('dl-stage-wrap');
    dom.customPanel   = document.getElementById('dl-custom-panel');
    dom.latInput      = document.getElementById('dl-lat');
    dom.lonInput      = document.getElementById('dl-lon');
    dom.distInput     = document.getElementById('dl-dist');
    dom.elevInput     = document.getElementById('dl-elev');
    dom.locateBtn     = document.getElementById('dl-locate');
    dom.dateInput     = document.getElementById('dl-date');
    dom.dateLabel     = document.getElementById('dl-date-label');
    dom.paceInput     = document.getElementById('dl-pace');
    dom.startInput    = document.getElementById('dl-start');
    dom.startWrap     = document.getElementById('dl-start-wrap');
    dom.modeRadios    = document.querySelectorAll('input[name="dl-mode"]');
    dom.bufferWrap    = document.getElementById('dl-buffer-wrap');
    dom.bufferInput   = document.getElementById('dl-buffer');
    dom.barSvg        = document.getElementById('dl-bar-svg');
    dom.result        = document.getElementById('dl-result');
    dom.annotations   = document.getElementById('dl-annotations');
    dom.moonLegend      = document.getElementById('dl-tick-legend-moon');
    dom.waypointsLegend = document.getElementById('dl-tick-legend-waypoints');
    dom.shareBtn        = document.getElementById('dl-share-btn');
    dom.shareHint       = document.getElementById('dl-share-hint');
    dom.icsBtn          = document.getElementById('dl-ics-btn');
    dom.validationMsg = document.getElementById('dl-validation-msg');
    dom.prefsToggle      = document.getElementById('dl-prefs-toggle');
    dom.prefsPanel       = document.getElementById('dl-prefs-panel');
    dom.routesIndex      = document.getElementById('dl-routes-index');
    dom.routesIndexLinks = document.getElementById('dl-routes-index-links');
    dom.ribbonWrap        = document.getElementById('dl-ribbon-wrap');
    dom.ribbonSvg         = document.getElementById('dl-ribbon-svg');
    dom.ribbonSummary     = document.getElementById('dl-ribbon-summary');
    dom.moonWrap          = document.getElementById('dl-moon-wrap');
    dom.moonSvg           = document.getElementById('dl-moon-svg');
    dom.moonSummary       = document.getElementById('dl-moon-summary');

    if (!dom.routeSel) return;

    loadPrefs();
    applyParamsFromURL();
    loadRouteMeta();

    dom.routeSel.addEventListener('change', onRouteChange);
    dom.stageSel.addEventListener('change', onFieldChange);
    // Registered FIRST, before either of the two handlers below, so the
    // bar, the strip and the share link all read one date that is inside
    // the years this page accepts (clampWalkDate). Out of order, the bar
    // would compute a walk for a year the strip refuses to draw.
    dom.dateInput.addEventListener('change', pullWalkDateIntoRange);
    dom.dateInput.addEventListener('change', onFieldChange);
    // The moon strip listens to the DATE specifically, not to
    // onFieldChange (D9, AC #8). Stage and pace run through that same
    // handler, and neither changes which nights the walk contains — a
    // listener on onFieldChange would slide the strip when a reader
    // merely inspected a different stage's timings.
    dom.dateInput.addEventListener('change', function () {
      renderMoonStripForRoute(_currentRoute);
    });
    dom.paceInput.addEventListener('change', onFieldChange);
    dom.startInput.addEventListener('change', onFieldChange);
    dom.bufferInput.addEventListener('input', onFieldChange);

    dom.modeRadios.forEach(function (radio) {
      radio.addEventListener('change', onModeChange);
    });

    // Coalesce lat/lon/distance/elevation keystrokes into one recompute per
    // animation frame — same rAF pattern as js/moonpath.js's date-scrubber
    // listener (setupScrubberListeners), carried over here since these four
    // fire a full recompute+render on every keystroke via 'input'.
    (function setupCustomFieldListeners() {
      var rafPending = false;
      function onCoordInput() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(function () {
          rafPending = false;
          onFieldChange();
        });
      }
      dom.latInput.addEventListener('input', onCoordInput);
      dom.lonInput.addEventListener('input', onCoordInput);
      dom.distInput.addEventListener('input', onCoordInput);
      dom.elevInput.addEventListener('input', onCoordInput);
    })();

    dom.locateBtn.addEventListener('click', function () {
      if (!navigator.geolocation) {
        dom.result.textContent = 'Geolocation not available in this browser.';
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          dom.latInput.value = pos.coords.latitude.toFixed(5);
          dom.lonInput.value = pos.coords.longitude.toFixed(5);
          onFieldChange();
        },
        function () {
          dom.result.textContent = 'Location access was denied or unavailable.';
        }
      );
    });

    if (dom.shareBtn) {
      var ORIGINAL_LABEL = dom.shareBtn.textContent;
      dom.shareBtn.addEventListener('click', function () {
        if (!navigator.clipboard) {
          dom.shareBtn.textContent = "Couldn't copy";
          setTimeout(function () { dom.shareBtn.textContent = ORIGINAL_LABEL; }, 2000);
          return;
        }
        navigator.clipboard.writeText(window.location.href).then(function () {
          dom.shareBtn.textContent = 'Link copied';
          setTimeout(function () { dom.shareBtn.textContent = ORIGINAL_LABEL; }, 2000);
        }).catch(function () {
          dom.shareBtn.textContent = "Couldn't copy";
          setTimeout(function () { dom.shareBtn.textContent = ORIGINAL_LABEL; }, 2000);
        });
      });
    }

    if (dom.prefsToggle && dom.prefsPanel) {
      dom.prefsToggle.addEventListener('click', function () {
        var expanded = dom.prefsPanel.hidden === false;
        dom.prefsPanel.hidden = expanded;
        dom.prefsToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      });

      dom.prefsPanel.querySelectorAll('input[name="dl-unit"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
          _prefs.unitSystem = radio.value;
          localStorage.setItem('pilgrim.prefs.unitSystem', _prefs.unitSystem);
          runAndRender();
          // The ribbon isn't part of runAndRender's own output (D13 — it
          // reacts to the route picker only), but its edge labels and
          // summary sentence both carry unitSystem, so a km/mi switch
          // still needs to repaint it — from cache, never a re-fetch.
          if (_currentRoute && _darknessData[_currentRoute]) {
            renderDarknessRibbon(_currentRoute, _darknessData[_currentRoute]);
          }
        });
      });

      dom.prefsPanel.querySelectorAll('input[name="dl-clock"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
          _prefs.clockFormat = radio.value;
          localStorage.setItem('pilgrim.prefs.clockFormat', _prefs.clockFormat);
          runAndRender();
        });
      });
    }
  });

  function loadPrefs() {
    var unit  = localStorage.getItem('pilgrim.prefs.unitSystem');
    var clock = localStorage.getItem('pilgrim.prefs.clockFormat');
    if (unit  === 'km' || unit  === 'mi')  _prefs.unitSystem  = unit;
    if (clock === '24h' || clock === '12h') _prefs.clockFormat = clock;
  }

  function applyPrefsToUI() {
    if (!dom.prefsPanel) return;
    dom.prefsPanel.querySelectorAll('input[name="dl-unit"]').forEach(function (r) {
      r.checked = (r.value === _prefs.unitSystem);
    });
    dom.prefsPanel.querySelectorAll('input[name="dl-clock"]').forEach(function (r) {
      r.checked = (r.value === _prefs.clockFormat);
    });
  }

  /* ==========================================
     AC #13 — Structural param validation
     ========================================== */

  function validateParams(params, knownRouteIds) {
    var routeValid   = params.route && knownRouteIds.indexOf(params.route) !== -1;
    var routePresent = Boolean(params.route);
    var hasCoParams  = Boolean(params.date || params.pace || params.start
      || params.stage || params.buffer !== null || params.elevGain
      || params.customLat || params.customLon || params.customDist);

    if (!routePresent) {
      if (hasCoParams) {
        return {
          valid: false,
          resetFields: new Set(['route', 'stage']),
          messageKey: 'missing-route'
        };
      }
      return { valid: true, resetFields: new Set(), messageKey: null };
    }

    if (!routeValid) {
      return {
        valid: false,
        resetFields: new Set(['route', 'stage']),
        messageKey: 'couldnt-find'
      };
    }

    return { valid: true, resetFields: new Set(), messageKey: null };
  }

  function validationMessage(key) {
    if (key === 'missing-route') {
      return 'This link is missing the route. Pick one below.';
    }
    if (key === 'couldnt-find') {
      return 'We couldn’t find that route or stage. Pick one below.';
    }
    return '';
  }

  function showValidationMsg(msg) {
    if (!dom.validationMsg) return;
    dom.validationMsg.textContent = msg;
    dom.validationMsg.hidden = !msg;
  }

  function applyParamsFromURL() {
    var params = coerceParams(parseParams(location.search));

    if (params.date)  dom.dateInput.value  = params.date;
    if (params.pace)  dom.paceInput.value  = params.pace;
    if (params.start) dom.startInput.value = params.start;

    if (params.route) _currentRoute = params.route;

    if (params.customLat)  dom.latInput.value  = params.customLat;
    if (params.customLon)  dom.lonInput.value  = params.customLon;
    if (params.customDist) dom.distInput.value = params.customDist;
    if (params.elevGain)   dom.elevInput.value = params.elevGain;

    if (!params.date) {
      dom.dateInput.value = todayString();
    }
    if (!params.start) {
      dom.startInput.value = '07:00';
    }

    _currentMode = params.mode;
    dom.modeRadios.forEach(function (radio) {
      radio.checked = (radio.value === _currentMode);
    });
    if (params.buffer !== null) {
      dom.bufferInput.value = String(params.buffer);
    }
    applyModeUI(_currentMode);
    applyPrefsToUI();
  }

  function currentStageTz() {
    if (!_currentRoute || _currentRoute === 'custom') return null;
    var stageIdx = parseInt(dom.stageSel && dom.stageSel.value, 10);
    if (isNaN(stageIdx) || !_stageData[_currentRoute]) return null;
    var s = _stageData[_currentRoute][stageIdx];
    return (s && s.ianaTz) ? s.ianaTz : null;
  }

  function todayString() {
    return dateInTz(new Date(), currentStageTz());
  }

  function nowTimeString() {
    return timeInTz(new Date(), currentStageTz(), '24h');
  }

  /* ==========================================
     AC #19 — Scalar param coercion (silent)
     ========================================== */

  /* Buffer-minute coercion: parseInt, fall back to 60 on NaN or negative.
     Single source of truth for both URL params and DOM input parsing. */
  function coerceBuffer(raw) {
    var n = parseInt(raw, 10);
    return (!isNaN(n) && n >= 0) ? n : 60;
  }

  // The years this page will accept a walk in, stated once.
  //
  // coerceParams (the URL half) and moonStartDate (the DOM half) each
  // used to answer this separately, and they disagreed: a stray
  // keystroke making the year 20261 drew a full moon strip for a walk
  // 18,000 years out and wrote that date into the share link, while the
  // recipient's coerceParams silently reset it to today — one URL, two
  // different strips. daylight/index.html's own min/max on #dl-date
  // carry these same two numbers, asserted in js/daylight-render.test.js
  // so the input and the code cannot drift apart.
  //
  // The lower bound also closes a quieter trap: Date.UTC maps years
  // 0-99 onto 1900-1999, so "0050-06-15" would silently compute 1950.
  var MIN_WALK_YEAR = 1900;
  var MAX_WALK_YEAR = 2100;

  /*
   * clampWalkDate(raw) — the accepted-range answer for a yyyy-mm-dd
   * string: the string itself when it is in range, the nearest bound when
   * it is not, and null when there is nothing to clamp (empty or
   * unparseable).
   *
   * Range-checking alone was not enough. A date outside these years made
   * moonStartDate return null, so the moon strip vanished with no
   * explanation while the walk-budget bar above it carried on rendering —
   * and pushURL still wrote that date into the share link, where the
   * recipient's coerceParams reset it to today. One URL, two different
   * pages, which is the exact failure the bounds were added to prevent.
   *
   * Clamping instead of rejecting, because this page has no validation
   * UI to reject into: daylight/index.html carries no <form> and the CSS
   * no :invalid rule, so #dl-date's min/max produce no visible message
   * and an out-of-range value would just sit there silently doing
   * nothing. The input's min/max carry these same two years, so a native
   * date picker cannot reach this at all; it closes the typed and
   * programmatic paths.
   */
  function clampWalkDate(raw) {
    if (!raw) return null;
    var parts = String(raw).split('-');
    if (parts.length !== 3) return null;
    var year = parseInt(parts[0], 10);
    if (isNaN(year)) return null;
    if (year < MIN_WALK_YEAR) return MIN_WALK_YEAR + '-01-01';
    if (year > MAX_WALK_YEAR) return MAX_WALK_YEAR + '-12-31';
    return raw;
  }

  function coerceParams(params) {
    params = Object.assign({}, params);
    var validPaces = ['slow', 'standard', 'brisk'];
    if (params.pace) {
      var isNamedPace   = validPaces.indexOf(params.pace) !== -1;
      var isNumericPace = !isNaN(parseFloat(params.pace)) && parseFloat(params.pace) > 0;
      if (!isNamedPace && !isNumericPace) {
        params.pace = 'standard';
      }
    } else {
      params.pace = 'standard';
    }

    /* One policy, one function (H3). This used to answer the
       out-of-range question with todayString() while a typed edit
       answered it with the nearest bound and the moon strip answered it
       by hiding — so a hand-edited link like ?date=2101-06-15 showed the
       recipient TODAY's walk while the address bar still read 2101. That
       is the one-URL-two-pages failure the bounds exist to prevent,
       surviving in the entry point the fix did not reach.

       Clamp first, then check the clamped value parses: a five-digit
       year is out of range AND unparseable by `new Date`, and asking
       about the raw string first would send it to today instead of to
       the bound. todayString() is kept for what it is really for —
       nothing to clamp (junk like "2026-13-45" or an unparseable
       string), where there is no nearest bound to move to. */
    if (params.date) {
      var clampedDate = clampWalkDate(params.date);
      var parsedDate  = clampedDate === null ? null : new Date(clampedDate);
      params.date = (parsedDate === null || isNaN(parsedDate.getTime()))
        ? todayString()
        : clampedDate;
    }

    if (params.start) {
      var startOk = /^[0-2]\d:\d{2}$/.test(params.start);
      if (startOk) {
        var hh = parseInt(params.start.split(':')[0], 10);
        var mm = parseInt(params.start.split(':')[1], 10);
        if (hh > 23 || mm > 59) startOk = false;
      }
      if (!startOk) {
        params.start = nowTimeString();
      }
    }

    if (params.buffer !== null) {
      params.buffer = coerceBuffer(params.buffer);
    }

    if (params.mode !== 'forward' && params.mode !== 'reverse') {
      params.mode = 'forward';
    }

    if (params.elevGain !== null) {
      var eg = parseInt(params.elevGain, 10);
      params.elevGain = (!isNaN(eg) && eg >= 0) ? String(eg) : '0';
    }

    return params;
  }

  function loadRouteMeta() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/assets/daylight/route-meta.json');
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var meta;
      try { meta = JSON.parse(xhr.responseText); } catch (e) { return; }
      _routeMeta = meta;
      populateRouteSelect(meta);
    };
    xhr.onerror = function () {
      if (dom.routeSel.options[0]) dom.routeSel.options[0].text = 'could not load routes';
    };
    xhr.send();
  }

  function populateRouteSelect(meta) {
    var knownIds = meta.map(function (r) { return r.id; });
    knownIds.push('custom');

    var rawParams = parseParams(location.search);
    var params    = coerceParams(rawParams);
    var validation = validateParams(rawParams, knownIds);

    if (validation.messageKey) {
      showValidationMsg(validationMessage(validation.messageKey));

      if (validation.resetFields.has('route')) {
        _currentRoute = null;
      }
    } else {
      showValidationMsg('');
    }

    while (dom.routeSel.firstChild) dom.routeSel.removeChild(dom.routeSel.firstChild);

    var placeholder = document.createElement('option');
    placeholder.value    = '';
    placeholder.text     = 'Choose a route…';
    placeholder.disabled = true;
    placeholder.selected = true;
    dom.routeSel.appendChild(placeholder);

    meta.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.id;
      opt.text  = r.nameEn;
      dom.routeSel.appendChild(opt);
    });

    var custom = document.createElement('option');
    custom.value = 'custom';
    custom.text  = 'Custom route…';
    dom.routeSel.appendChild(custom);

    if (dom.routesIndexLinks) {
      while (dom.routesIndexLinks.firstChild) {
        dom.routesIndexLinks.removeChild(dom.routesIndexLinks.firstChild);
      }
      meta.forEach(function (r, i) {
        var a = document.createElement('a');
        a.href        = '/daylight/?route=' + r.id;
        a.textContent = r.nameEn;
        a.className   = 'dl-routes-index-link';
        dom.routesIndexLinks.appendChild(a);
        if (i < meta.length - 1) {
          dom.routesIndexLinks.appendChild(document.createTextNode(', '));
        }
      });
      if (dom.routesIndex) dom.routesIndex.hidden = false;
    }

    if (_currentRoute) {
      dom.routeSel.value = _currentRoute;
      if (dom.routeSel.value !== _currentRoute) dom.routeSel.value = '';
      if (_currentRoute === 'custom') {
        showCustomPanel(true);
        dom.stageWrap.hidden = true;
        onFieldChange();
      } else if (_currentRoute) {
        loadStageData(_currentRoute, params.stage);
      }
      updateRibbonForRoute(_currentRoute);
    }
  }

  function onModeChange(e) {
    _currentMode = e.target.value;
    applyModeUI(_currentMode);
    pushURL();
    runAndRender();
  }

  function applyModeUI(mode) {
    if (dom.bufferWrap) dom.bufferWrap.hidden = (mode !== 'reverse');
    if (dom.startWrap)  dom.startWrap.hidden  = (mode === 'reverse');
  }

  function onRouteChange() {
    var routeId = dom.routeSel.value;
    _currentRoute = routeId;
    showValidationMsg('');

    if (routeId === 'custom') {
      showCustomPanel(true);
      dom.stageWrap.hidden = true;
      while (dom.stageSel.firstChild) dom.stageSel.removeChild(dom.stageSel.firstChild);
      var opt = document.createElement('option');
      opt.value = '';
      opt.text  = '—';
      dom.stageSel.appendChild(opt);
      onFieldChange();
    } else if (routeId) {
      showCustomPanel(false);
      loadStageData(routeId, null);
    } else {
      showCustomPanel(false);
      dom.stageWrap.hidden = true;
      clearOutput();
    }
    // pushURL before updateRibbonForRoute, not after: the two are
    // independent side effects of a route change (URL/share-link state
    // vs. the ribbon's own display) and neither reads state the other
    // writes, so nothing about the URL should depend on the ribbon
    // succeeding. renderRibbon now validates the artifact's shape before
    // it draws anything (Finding 2), so it fails to hidden rather than
    // throwing — but that guard is deliberately scoped to specific known
    // fields, not a blanket try/catch, so this ordering stays the
    // defense-in-depth it always should have been rather than the only
    // thing standing between a bad artifact and a URL that never updates.
    pushURL();
    updateRibbonForRoute(routeId);
  }

  function showCustomPanel(show) {
    dom.customPanel.hidden = !show;
  }

  /* ==========================================
     Darkness ribbon — route-picker wiring (D12, D13)

     Reacts to the route picker only: called from onRouteChange and from
     populateRouteSelect's own URL-restored-route path, never from
     onFieldChange (stage, date, pace, start time, buffer all route
     through that instead, and none of them touch the ribbon). This
     isn't a convention this code has to remember to honour —
     renderRibbon's own signature has no stage/date parameter for a
     caller to pass even by mistake (AC #7).
     ========================================== */

  // statedDistanceForRoute(routeId) — route-meta.json's stated
  // distanceKm for this route, feeding darknessSummarySentence's own
  // "N of its M km sampled" discrepancy framing (D3/D13). null when
  // _routeMeta hasn't loaded yet or carries no matching entry — the
  // sentence still states its own coveredKm plainly rather than
  // throwing, it just has nothing to compare it against (see
  // darknessDistanceLeadIn, Finding 6).
  function statedDistanceForRoute(routeId) {
    if (!_routeMeta) return null;
    var match = _routeMeta.filter(function (r) { return r.id === routeId; });
    return match.length ? match[0].distanceKm : null;
  }

  // renderDarknessRibbon(routeId, data) — the DOM half of D12: shows or
  // hides dl-ribbon-wrap based on ribbonSectionHidden's own verdict
  // (custom/unselected routes, and Gate 0 §7's unit guard, both already
  // decided there — this function doesn't re-decide either), and when
  // shown, calls the same renderRibbon the render-test harness exercises
  // directly.
  //
  // The malformed-artifact warning has to be issued here, not only inside
  // renderRibbon: ribbonSectionHidden runs the same shape check and
  // short-circuits first, so on the real page renderRibbon is never
  // reached for a malformed artifact and its warning was unreachable —
  // a shipped route re-baked without stepKm would have gone silently
  // missing, with an empty console. Only a shape failure warns; a custom
  // route, no selection, or a wrong-unit artifact are all expected,
  // already-explained states (loadDarknessData warns about the unit
  // itself), not malformed data.
  function renderDarknessRibbon(routeId, data) {
    if (!dom.ribbonWrap || !dom.ribbonSvg) return;

    if (ribbonSectionHidden(routeId, data)) {
      if (data && data.unit === 'mag/arcsec2') {
        var hiddenShapeIssue = darknessArtifactShapeIssue(data);
        if (hiddenShapeIssue) warnMalformedDarknessArtifact(data, hiddenShapeIssue);
      }
      dom.ribbonWrap.hidden = true;
      clearRibbonDisplay(dom.ribbonSvg, dom.ribbonSummary);
      return;
    }

    renderRibbon(data, dom.ribbonSvg, _prefs.unitSystem, statedDistanceForRoute(routeId), dom.ribbonSummary);
    dom.ribbonWrap.hidden = false;
    // The moon strip is deliberately NOT cascaded from here. This
    // function is the ribbon's repaint, and the ribbon repaints for
    // reasons the strip does not share — the km/mi toggle among them,
    // which cost 5.2 ms (norte) and 14.5 ms (shikoku) of astronomy per
    // click for a strip whose only labels are "night 1" and "night N"
    // and which reads unitSystem nowhere (D9). The strip is driven from
    // loadDarknessData and loadStageData instead, where its two sources
    // actually arrive.
  }

  // loadDarknessData(routeId) — mirrors loadStageData's XHR-and-cache
  // shape against _stageData, line for line, against a parallel
  // _darknessData cache.
  //
  // Gate 0 §7 alignment: every shipped route carries unit: "mag/arcsec2"
  // today, but a future re-bake could ship the radiance-only fallback
  // unit instead. renderDarknessRibbon already fails safe either way —
  // ribbonSectionHidden's own unit check (shared with renderRibbon's
  // own guard) keeps the section hidden rather than mislabeling a
  // radiance figure as a magnitude. The check here is this slice's own,
  // additional contribution on top of that: failing loudly, not just
  // quietly rendering nothing, so a future re-bake under the wrong unit
  // is diagnosable from the console rather than a silent, unexplained
  // absence a reader (or a future engineer) has no way to account for.
  function loadDarknessData(routeId) {
    if (_darknessData[routeId]) {
      // No strip render here. A cache hit is synchronous, so the caller
      // is still on the stack and updateRibbonForRoute draws the strip
      // once when it returns — see the comment there. Rendering here as
      // well is what made a warm re-selection draw the whole strip twice
      // and warn twice about an unplaceable route.
      renderDarknessRibbon(routeId, _darknessData[routeId]);
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/assets/darkness/' + routeId + '.json');
    xhr.onload = function () {
      if (xhr.status !== 200) {
        console.warn('Darkness ribbon: "' + routeId + '.json" fetch returned status ' + xhr.status + '.');
        return;
      }
      var data;
      try { data = JSON.parse(xhr.responseText); } catch (e) {
        console.warn('Darkness ribbon: "' + routeId + '.json" is not valid JSON.');
        return;
      }
      if (data.unit !== 'mag/arcsec2') {
        console.warn('Darkness ribbon: "' + routeId + '" artifact unit is "' + data.unit
          + '", expected "mag/arcsec2" — rendering nothing rather than mislabeling radiance as brightness (Gate 0 §7).');
      }
      _darknessData[routeId] = data;
      // The reader may have already picked a different route while this
      // request was in flight (Finding 1) — cache the response either way,
      // so coming back to this route later is instant, but only repaint
      // the ribbon if it's still the route on screen.
      if (routeId !== _currentRoute) return;
      renderDarknessRibbon(routeId, data);
      // Darkness is one of the strip's two sources; this is where it
      // arrives, so this is where the strip is asked to redraw. The other
      // source calls it from loadStageData, and whichever lands second
      // is the one that draws.
      renderMoonStripForRoute(routeId);
    };
    xhr.onerror = function () {
      // Secondary, route-scoped content (D12's own framing): warn to the
      // console, matching the wrong-unit branch above. updateRibbonForRoute
      // already hid and cleared the section when this route was selected,
      // so a failure just leaves it that way — guarded on _currentRoute,
      // same as xhr.onload above, so a request for a route the reader has
      // since left can't clear a different, valid ribbon that loaded after it.
      console.warn('Darkness ribbon: network error fetching "' + routeId + '.json".');
      if (routeId !== _currentRoute) return;
      dom.ribbonWrap.hidden = true;
      clearRibbonDisplay(dom.ribbonSvg, dom.ribbonSummary);
    };
    xhr.send();
  }

  /*
   * updateRibbonForRoute(routeId) — the single call site onRouteChange
   * and the URL-restored-route path both use. Hides and clears
   * unconditionally, before deciding anything else, so a route switch
   * never leaves the previous route's ribbon on screen while the next
   * one loads (or fails to). Custom routes and no selection stop there,
   * no fetch (D12); anything else then loads (or, once cached,
   * re-renders) that route's darkness data.
   *
   * Guards both nodes, not just the wrap: it goes on to call
   * clearRibbonDisplay(dom.ribbonSvg, …), which dereferences the svg
   * immediately (clearSVG reads .firstChild). renderDarknessRibbon above
   * already guards both — a page that ever shipped the wrap without the
   * svg would have thrown here and survived there, which is two different
   * answers to one question.
   *
   * It is also the ONE synchronous entry point for the moon strip on a
   * route change, and the last line is why. Both of the strip's sources
   * can be cached, and both load functions used to draw it on their cache
   * hit; a warm re-selection then ran the whole night's astronomy twice
   * (23.6 ms on norte, 33.6 ms on shikoku) with a hideMoonStrip between,
   * so half of it was thrown away before a frame, and an unplaceable
   * route warned twice about the same failure. Now the cache-hit paths
   * only fill their caches and the strip is drawn once, here, after both
   * of them have had their chance. The XHR paths keep their own calls:
   * those arrive after this function has returned, and whichever lands
   * second is the one that draws.
   *
   * The invariant this rests on, stated rather than assumed: every caller
   * of loadStageData calls this function in the same tick, immediately
   * afterwards.
   */
  function updateRibbonForRoute(routeId) {
    if (!dom.ribbonWrap || !dom.ribbonSvg) return;
    dom.ribbonWrap.hidden = true;
    clearRibbonDisplay(dom.ribbonSvg, dom.ribbonSummary);
    hideMoonStrip();
    if (!routeId || routeId === 'custom') return;
    loadDarknessData(routeId);
    renderMoonStripForRoute(routeId);
  }

  function hideMoonStrip() {
    if (!dom.moonWrap || !dom.moonSvg) return;
    dom.moonWrap.hidden = true;
    clearRibbonDisplay(dom.moonSvg, dom.moonSummary);
  }

  // pullWalkDateIntoRange() — the DOM half of clampWalkDate, run before
  // anything else reads #dl-date on a change. An empty or unparseable
  // value is left alone: there is nothing to clamp it to, and the strip's
  // own guard already treats it as "no date chosen".
  function pullWalkDateIntoRange() {
    if (!dom.dateInput) return;
    var clamped = clampWalkDate(dom.dateInput.value);
    if (clamped !== null && clamped !== dom.dateInput.value) {
      dom.dateInput.value = clamped;
    }
  }

  // The walk's start date, as night 1 (D6). Parsed as UTC noon so a
  // timezone offset can never roll it onto the previous or next day —
  // the same trap wallTimeToUTC exists to avoid elsewhere on this page.
  function moonStartDate() {
    // Through clampWalkDate, not a range check of its own (H3). This was
    // the third of three answers to one question: the typed edit moved to
    // the nearest bound, the URL restore jumped to today, and this hid
    // the strip — so which walk a reader saw depended on which door they
    // came in by. It now draws the same clamped date the bar computes and
    // the share link carries. null survives only for a value there is
    // nothing to clamp: empty, or not a yyyy-mm-dd shape at all.
    var clamped = clampWalkDate(dom.dateInput && dom.dateInput.value);
    if (clamped === null) return null;
    var parts = clamped.split('-');
    var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }

  /*
   * renderMoonStripForRoute(routeId) — draw the strip if, and only if,
   * everything it needs is present and current.
   *
   * It needs BOTH async sources: the stage list places a night on a
   * kilometre, the darkness artifact says how dark that kilometre is.
   * Either one alone draws nothing rather than half a strip, so this is
   * called from both load paths and simply returns until the second
   * arrives.
   *
   * stagePlacements throws when it can place neither way (D4). That is
   * deliberate there — a wrong axis is worse than no axis — so it is
   * caught here and rendered as an absent section, which is what every
   * other unusable-data path on this page already does.
   */
  function renderMoonStripForRoute(routeId) {
    if (!dom.moonWrap || !dom.moonSvg) return;
    if (routeId !== _currentRoute) return;

    if (!routeId || routeId === 'custom' || !NightMathRef) { hideMoonStrip(); return; }

    var stages = _stageData[routeId];
    var data   = _darknessData[routeId];
    if (!stages || !data) { hideMoonStrip(); return; }

    if (ribbonSectionHidden(routeId, data)) { hideMoonStrip(); return; }

    var startDate = moonStartDate();
    if (!startDate) { hideMoonStrip(); return; }

    var stageList = Object.keys(stages).map(function (k) { return stages[k]; });

    var cells;
    try {
      var windowKm = DaylightMath.darknessAggregateWindowKm(data.positionalConfidence);
      var runs     = DaylightMath.mergeDarknessRuns(data.values, data.stepKm, data.coveredKm, windowKm);
      var schedule = DaylightMath.nightSchedule(
        DaylightMath.stagePlacements(stageList, data.coveredKm), startDate);
      cells = NightMathRef.buildNightCells(schedule, stageList, runs);
    } catch (e) {
      console.warn('Moon strip: cannot place "' + routeId + '" on its darkness axis — ' + e.message);
      hideMoonStrip();
      return;
    }

    // The reveal is gated on there being something to reveal. A schedule
    // whose every cell is undrawable (no astronomical night, or no width)
    // used to leave the caption and an empty svg on screen under a
    // sentence counting nights nothing drew — AC #11's own violation,
    // dormant on the shipped routes but reachable by design.
    if (!NightMathRef.drawableCells(cells, data.coveredKm).length) { hideMoonStrip(); return; }

    renderMoonStrip(cells, NightMathRef.selectNotableNights(cells, data.coveredKm), startDate,
                    data.coveredKm, dom.moonSvg, dom.moonSummary, data.heldOutValidation);
    dom.moonWrap.hidden = false;
  }

  function loadStageData(routeId, requestedStageStr) {
    if (_stageData[routeId]) {
      // Cache hit: fill the picker and stop. The strip is drawn by
      // updateRibbonForRoute, which every caller of this function runs in
      // the same tick — an invariant that function now states in its own
      // comment instead of leaving it two frames up for a reader to
      // reconstruct. Drawing here as well only produced a strip that
      // updateRibbonForRoute's hideMoonStrip erased a moment later.
      populateStageSelect(_stageData[routeId], requestedStageStr);
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/assets/daylight/' + routeId + '.json');
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var stages;
      try { stages = JSON.parse(xhr.responseText); } catch (e) { return; }
      _stageData[routeId] = stages;
      // Same currency guard as loadDarknessData (Finding 1): now two
      // async sources are keyed to the route picker, not one, so caching
      // a stale route's response without also guarding its render would
      // let the bar and the ribbon settle on two different stale routes.
      if (routeId !== _currentRoute) return;
      populateStageSelect(stages, requestedStageStr);
      // The moon strip needs this source as well as the darkness one, and
      // the two race. Whichever lands second is the one that draws.
      renderMoonStripForRoute(routeId);
    };
    xhr.onerror = function () {
      if (routeId !== _currentRoute) return;
      dom.result.textContent = "Couldn't load stage data for " + routeId + ". Try refreshing.";
    };
    xhr.send();
  }

  function populateStageSelect(stages, requestedStageStr) {
    while (dom.stageSel.firstChild) dom.stageSel.removeChild(dom.stageSel.firstChild);

    var placeholder = document.createElement('option');
    placeholder.value    = '';
    placeholder.text     = 'Choose a stage…';
    placeholder.disabled = true;
    placeholder.selected = true;
    dom.stageSel.appendChild(placeholder);

    stages.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.index;
      opt.text  = s.nameEn;
      dom.stageSel.appendChild(opt);
    });

    dom.stageWrap.hidden = false;

    if (requestedStageStr !== null && requestedStageStr !== undefined) {
      var stageIdx = parseInt(requestedStageStr, 10);
      var stageExists = !isNaN(stageIdx) && stageIdx >= 0 && stageIdx < stages.length;
      if (stageExists) {
        dom.stageSel.value = String(stageIdx);
      } else {
        showValidationMsg(validationMessage('couldnt-find'));
        dom.stageSel.value = '';
      }
    }

    if (!dom.stageSel.value && stages.length > 0) {
      dom.stageSel.value = '0';
    }

    onFieldChange();
  }

  function updateDateLabel() {
    if (!dom.dateLabel) return;
    var tz = currentStageTz();
    dom.dateLabel.textContent = 'Date' + (tz ? ' (' + tz + ')' : '');
  }

  function onFieldChange() {
    updateDateLabel();
    pushURL();
    runAndRender();
  }

  function buildState() {
    var routeId  = dom.routeSel.value;
    var paceKey  = dom.paceInput.value || 'standard';
    // Clamped, like every other reader of this input (H3). The bar used
    // to take the raw value, so any runAndRender() triggered by a
    // NON-date field — pace, stage, start time, the km/mi toggle —
    // painted a walk for a year pushURL was simultaneously refusing to
    // write. Worse, a five-digit year makes wallTimeToUTC build an
    // Invalid Date, on which Intl.DateTimeFormat.formatToParts throws
    // RangeError: fired during a warm route reselection that aborts
    // onRouteChange after _currentRoute is reassigned but before pushURL
    // and updateRibbonForRoute run, leaving the variable and the visible
    // strip permanently out of sync. The fallback keeps an empty or
    // unparseable value exactly as it was — recompute's own guards
    // already answer for that, and there is no bound to clamp it to.
    var dateStr  = clampWalkDate(dom.dateInput.value) || dom.dateInput.value;
    var startStr = dom.startInput.value;

    var startMin = null;
    if (startStr) {
      var timeParts = startStr.split(':');
      startMin = parseInt(timeParts[0], 10) * 60 + parseInt(timeParts[1], 10);
    }

    var bufferMin = 60;
    if (dom.bufferInput && dom.bufferInput.value !== '') {
      bufferMin = coerceBuffer(dom.bufferInput.value);
    }

    var stage = null;
    if (routeId !== 'custom') {
      var stageIdx = parseInt(dom.stageSel.value, 10);
      if (!isNaN(stageIdx) && _stageData[routeId]) {
        stage = _stageData[routeId][stageIdx] || null;
      }
    }

    return {
      route:          routeId,
      stage:          stage,
      customLat:      dom.latInput.value,
      customLon:      dom.lonInput.value,
      customDistance: dom.distInput.value,
      customElevGain: dom.elevInput.value,
      date:           dateStr,
      paceKey:        paceKey,
      startTimeMin:   startMin,
      bufferMin:      bufferMin,
      mode:           _currentMode
    };
  }

  function renderAnnotations(annotations) {
    if (!dom.annotations) return;
    while (dom.annotations.firstChild) {
      dom.annotations.removeChild(dom.annotations.firstChild);
    }
    if (!annotations || annotations.length === 0) return;

    annotations.forEach(function (ann) {
      var p = document.createElement('p');
      p.className = 'dl-annotation';
      if (ann.kind === 'walk-state') p.classList.add('dl-annotation--warn');
      p.textContent = ann.text;
      dom.annotations.appendChild(p);
    });
  }

  function hideLegends() {
    if (dom.moonLegend)      { dom.moonLegend.hidden = true;      dom.moonLegend.textContent = ''; }
    if (dom.waypointsLegend) { dom.waypointsLegend.hidden = true; dom.waypointsLegend.textContent = ''; }
  }

  function renderLegends(output, route, fmtFn) {
    hideLegends();

    if (!dom.moonLegend || !dom.waypointsLegend) return;

    var Moon = (typeof window !== 'undefined' && window.Moon) ? window.Moon : null;

    // renderSVG returns before drawing any moon ticks once a reverse walk
    // has no feasible departure (mode 'reverse' with latestDepartUTC null —
    // the stage is longer than today's daylight minus buffer). The legend
    // should stay silent about the moon then too, rather than describing
    // ticks the bar never drew.
    var barDrawsMoonTicks = !(output.mode === 'reverse' && output.latestDepartUTC === null);

    // Same [domain.startUTC, domain.endUTC] window the bar itself now
    // draws moon ticks against (D4) — otherwise a moonset tick can render
    // on the bar while this legend stays silent about it, or vice versa.
    var legendDomain = DaylightMath.barDomainUTC(output);
    if (legendDomain && barDrawsMoonTicks) {
      var srT = legendDomain.startUTC.getTime();
      var ssT = legendDomain.endUTC.getTime();
      var mrIn = output.moonriseUTC && output.moonriseUTC.getTime() >= srT && output.moonriseUTC.getTime() <= ssT;
      var msIn = output.moonsetUTC  && output.moonsetUTC.getTime()  >= srT && output.moonsetUTC.getTime()  <= ssT;

      // moonBrightnessAtAdapt broadens this beyond "moonrise/moonset fell
      // in frame" — a night can be worth reporting on brightness alone
      // even when neither event does (moon already up, or still down,
      // for the whole domain).
      if (mrIn || msIn || output.moonBrightnessAtAdapt) {
        var parts = [];
        if (mrIn) parts.push('moonrise ' + fmtFn(output.moonriseUTC));
        if (msIn) parts.push('moonset '  + fmtFn(output.moonsetUTC));
        var phaseName = Moon ? Moon.getMoonPhaseName(output.moonPhase).toLowerCase() : '';
        var riseSetPart = parts.length
          ? parts.join(' · ') + (phaseName ? ' — ' + phaseName : '')
          : '';
        // Follows js/moonpath.js's lux-ring precedent (label — prose.) for
        // the brightness clause, minus the raw lux figure: this page
        // speaks in walking terms, not photometric ones.
        var brightnessPart = output.moonBrightnessAtAdapt
          ? 'Once your eyes adjust — ' + output.moonBrightnessAtAdapt.prose + '.'
          : '';

        var moonText;
        if (riseSetPart && brightnessPart) {
          moonText = riseSetPart + '. ' + brightnessPart;
        } else {
          moonText = riseSetPart || brightnessPart;
        }

        dom.moonLegend.textContent = moonText;
        dom.moonLegend.hidden = false;
      }
    }

    if (output.waypoints && output.waypoints.length > 0 && route !== 'custom') {
      var names = output.waypoints.map(function (wp) { return wp.name; });
      var nameList;
      if (names.length <= 8) {
        nameList = names.join(', ');
      } else {
        nameList = names.slice(0, 3).join(', ') + '… and ' + (names.length - 3) + ' more';
      }
      var count = output.waypoints.length;
      var siteWord = count === 1 ? 'sacred site' : 'sacred sites';
      dom.waypointsLegend.textContent = 'passes ' + count + ' ' + siteWord + ': ' + nameList + '.';
      dom.waypointsLegend.hidden = false;
    }
  }

  function runAndRender() {
    var state  = buildState();
    var output = recompute(state);

    renderSVG(output, dom.barSvg, output.stageTz || null, _prefs.clockFormat);

    var isCustom = (state.route === 'custom');
    if (dom.shareBtn) {
      dom.shareBtn.hidden = !isCustom;
    }
    if (dom.shareHint) {
      dom.shareHint.hidden = !isCustom;
    }

    if (output.error) {
      var silent = (output.error === 'missing or invalid startTimeMin'
        || output.error === 'no stage data'
        || output.error === 'missing date'
        || output.error === 'incomplete custom route');
      dom.result.textContent = silent ? '' : output.error;
      renderAnnotations([]);
      hideLegends();
      if (dom.icsBtn) dom.icsBtn.hidden = true;
      return;
    }

    dom.result.textContent = '';

    var clockFmt  = _prefs.clockFormat;
    var stageTz   = output.stageTz || null;
    var isCustom2 = (state.route === 'custom');
    var timeSuffix = isCustom2 ? ' (local time)' : '';

    function fmt(utcDate) {
      return timeInTz(utcDate, stageTz, clockFmt) + timeSuffix;
    }

    var distKm = isCustom2
      ? parseFloat(state.customDistance)
      : (state.stage ? state.stage.distanceKm : NaN);
    var distStr = (!isNaN(distKm) && distKm > 0)
      ? 'Walk ' + fmtDistance(distKm, _prefs.unitSystem) + '  ·  '
      : '';

    var line;
    if (output.isPolarNight) {
      if (output.mode === 'forward') {
        var walkStrPN = fmtDuration(output.walkMin);
        line = distStr + 'Arrive ∼' + fmt(output.arrivalUTC) + '  ·  ' + walkStrPN + ' walking';
      } else {
        line = distStr + fmtDuration(output.walkMin) + ' walking';
      }
      dom.result.appendChild(document.createTextNode(line));
      renderAnnotations(output.annotations || []);
      hideLegends();
      if (dom.icsBtn) dom.icsBtn.hidden = true;
      return;
    }

    if (output.isPolarDay) {
      if (output.mode === 'forward') {
        var walkStrPD = fmtDuration(output.walkMin);
        line = distStr + 'Arrive ∼' + fmt(output.arrivalUTC) + '  ·  ' + walkStrPD + ' walking';
        dom.result.appendChild(document.createTextNode(line));
      } else {
        var walkStrPDR = fmtDuration(output.walkMin);
        if (output.latestDepartUTC) {
          line = distStr + 'Leave by ' + fmt(output.latestDepartUTC) + '  ·  ' + walkStrPDR + ' walking';
          dom.result.appendChild(document.createTextNode(line));
        }
      }
      renderAnnotations(output.annotations || []);
      hideLegends();
      if (dom.icsBtn) dom.icsBtn.hidden = true;
      return;
    }

    if (output.mode === 'reverse') {
      if (output.latestDepartUTC === null) {
        renderAnnotations(output.annotations || []);
        hideLegends();
        if (dom.icsBtn) dom.icsBtn.hidden = true;
        return;
      }
      var departStr = fmt(output.latestDepartUTC);
      var arrStr    = fmt(output.walkEndUTC);
      var walkStr   = fmtDuration(output.walkMin);
      var bufStr    = fmtDuration(output.bufferMin);
      line = distStr + 'Leave by ' + departStr
        + '  ·  '
        + walkStr + ' walking'
        + '  ·  arrive ' + arrStr + ' with ' + bufStr + ' cushion before sunset';
    } else {
      var hasWarnAnnotation = output.annotations && output.annotations.some(function (a) {
        return a.kind === 'walk-state';
      });
      var resultEl = dom.result;
      if (hasWarnAnnotation) {
        resultEl.classList.add('daylight-result--warn');
      } else {
        resultEl.classList.remove('daylight-result--warn');
      }

      var arriveStr  = fmt(output.arrivalUTC);
      var walkStrFwd = fmtDuration(output.walkMin);
      var cushionAbs = fmtDuration(Math.abs(output.cushionMin));
      var cushionSign = output.cushionMin >= 0 ? '' : '−';
      line = distStr + 'Arrive ∼' + arriveStr
        + '  ·  '
        + walkStrFwd + ' walking'
        + '  ·  '
        + cushionSign + cushionAbs + ' cushion before sunset';
    }

    dom.result.appendChild(document.createTextNode(line));
    renderAnnotations(output.annotations || []);
    renderLegends(output, state.route, fmt);

    // ICS export — valid result reached; show the button and wire click handler.
    if (dom.icsBtn && DaylightMath && DaylightMath.buildICS) {
      dom.icsBtn.hidden = false;

      var icsStartUTC = (output.mode === 'reverse') ? output.latestDepartUTC : output.startUTC;
      var icsEndUTC   = (output.mode === 'reverse') ? output.walkEndUTC      : output.arrivalUTC;

      var routeSlug = isCustom2 ? 'custom' : (state.route || 'custom');
      var dateStr2  = state.date || '';
      var icsFilename = 'daylight-' + routeSlug + '-' + dateStr2 + '.ics';

      var routeLabel = isCustom2 ? 'Custom route' : (state.route || '');
      var stageLabel = (state.stage && state.stage.nameEn) ? state.stage.nameEn : '';

      dom.icsBtn.onclick = function () {
        var icsStr = DaylightMath.buildICS({
          routeName:       routeLabel,
          stageLabel:      stageLabel,
          startUTC:        icsStartUTC,
          endUTC:          icsEndUTC,
          urlHref:         window.location.href,
          mode:            output.mode,
          stageTz:         output.stageTz || null,
          descriptionLine: line
        });
        triggerICSDownload(icsStr, icsFilename);
      };
    }
  }

  function clearOutput() {
    if (dom.barSvg) {
      while (dom.barSvg.firstChild) dom.barSvg.removeChild(dom.barSvg.firstChild);
    }
    if (dom.result) dom.result.textContent = '';
    renderAnnotations([]);
    hideLegends();
  }

  function triggerICSDownload(icsStr, filename) {
    var blob = new Blob([icsStr], { type: 'text/calendar;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  function pushURL() {
    var params = [];

    var routeId = dom.routeSel.value;
    if (routeId) params.push('route=' + encodeURIComponent(routeId));

    if (routeId !== 'custom') {
      var stageVal = dom.stageSel.value;
      if (stageVal !== '' && stageVal !== null) {
        params.push('stage=' + encodeURIComponent(stageVal));
      }
    } else {
      if (dom.latInput.value)  params.push('customLat='  + encodeURIComponent(dom.latInput.value));
      if (dom.lonInput.value)  params.push('customLon='  + encodeURIComponent(dom.lonInput.value));
      if (dom.distInput.value) params.push('customDist=' + encodeURIComponent(dom.distInput.value));
      if (dom.elevInput.value) params.push('elevGain='   + encodeURIComponent(dom.elevInput.value));
    }

    // The clamped date, never the raw one. pullWalkDateIntoRange has
    // normally already written it back into the input; this is the second
    // edge of the same rule, so a value set programmatically without a
    // change event still cannot put a year into the share link that the
    // recipient's coerceParams would silently replace with today.
    var dateParam = clampWalkDate(dom.dateInput.value);
    if (dateParam) params.push('date=' + encodeURIComponent(dateParam));
    if (dom.paceInput.value && dom.paceInput.value !== 'standard') {
      params.push('pace=' + encodeURIComponent(dom.paceInput.value));
    }

    if (_currentMode === 'reverse') {
      params.push('mode=reverse');
      var bufVal = parseInt(dom.bufferInput.value, 10);
      if (!isNaN(bufVal) && bufVal >= 0 && bufVal !== 60) {
        params.push('buffer=' + bufVal);
      }
    } else {
      if (dom.startInput.value && dom.startInput.value !== '07:00') {
        params.push('start=' + encodeURIComponent(dom.startInput.value));
      }
    }

    var qs = params.length ? '?' + params.join('&') : '';
    var newURL = location.pathname + qs;
    if (newURL !== location.pathname + location.search) {
      history.replaceState(null, '', newURL);
    }
  }

  /* ==========================================
     URL parsing
     ========================================== */

  function parseParams(search) {
    var result = {
      route: null, stage: null, date: null, pace: null, start: null,
      mode: 'forward', buffer: null,
      elevGain: null, customLat: null, customLon: null, customDist: null
    };
    if (!search || search.length < 2) return result;
    var pairs = search.slice(1).split('&');
    pairs.forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length < 2) return;
      var k = decodeURIComponent(kv[0]);
      var v = decodeURIComponent(kv.slice(1).join('='));
      switch (k) {
        case 'route':      result.route      = v; break;
        case 'stage':      result.stage      = v; break;
        case 'date':       result.date       = v; break;
        case 'pace':       result.pace       = v; break;
        case 'start':      result.start      = v; break;
        case 'mode':       result.mode       = v; break;
        case 'buffer':     result.buffer     = v; break;
        case 'elevGain':   result.elevGain   = v; break;
        case 'customLat':  result.customLat  = v; break;
        case 'customLon':  result.customLon  = v; break;
        case 'customDist': result.customDist = v; break;
      }
    });
    return result;
  }

})(typeof window !== 'undefined' ? window : globalThis);
