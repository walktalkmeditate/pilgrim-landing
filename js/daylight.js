/* =============================================
   Daylight Walk Budget — hub page controller

   Two-layer architecture:
     Inner core   — recompute(state): pure function, no DOM, no async
     Outer shell  — DOM glue, only runs in browser

   Export shape:
     Browser → window.Daylight = { recompute, renderSVG }
     Node    → module.exports  = { recompute, renderSVG }

   The outer shell only wires DOM listeners when
   typeof window !== 'undefined' && typeof document !== 'undefined'.

   navigator.geolocation appears 3× in this file — all inside the
   locate-button click handler (per AC #14).
   ============================================= */

(function (root) {
  'use strict';

  var MS_PER_MIN = 60000;

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

  function timeInTz(utcDate, ianaTz, clockFmt) {
    var opts = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: clockFmt === '12h'
    };
    if (ianaTz) opts.timeZone = ianaTz;
    return new Intl.DateTimeFormat('en-US', opts).format(utcDate);
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
          waypoints:           waypoints,
          distanceKm:          distanceKm
        };
      }

      return {
        mode:                'reverse',
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
        waypoints:           waypoints,
        distanceKm:          distanceKm
      };
    }

    if (isPolarDay) {
      return {
        mode:                'forward',
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
  var BAR_Y  = 32;
  var BAR_W  = BAR_X2 - BAR_X1;

  function clearSVG(svgEl) {
    while (svgEl.firstChild) {
      svgEl.removeChild(svgEl.firstChild);
    }
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

  function fmtDistance(km, unitSystem) {
    if (unitSystem === 'mi') {
      return (km * 0.621371).toFixed(1) + ' mi';
    }
    return km.toFixed(1) + ' km';
  }

  function utcToBarX(utcDate, sunriseUTC, sunsetUTC) {
    var span = sunsetUTC.getTime() - sunriseUTC.getTime();
    if (span <= 0) return BAR_X1;
    var t = utcDate.getTime() - sunriseUTC.getTime();
    var frac = Math.max(0, Math.min(1, t / span));
    return BAR_X1 + frac * BAR_W;
  }

  function kmToBarX(kmFromStart, distanceKm, walkStartX, walkEndX) {
    if (distanceKm <= 0) return walkStartX;
    var t = kmFromStart / distanceKm;
    return walkStartX + t * (walkEndX - walkStartX);
  }

  function renderSVG(output, svgEl, stageTz, clockFmt) {
    clearSVG(svgEl);

    if (output.error) return;

    if (output.isPolarNight || output.isPolarDay) return;

    var sunrise = output.sunriseUTC;
    var sunset  = output.sunsetUTC;

    if (!sunrise || !sunset) return;

    var nowUTC = new Date();

    var tzSuffix = stageTz ? '' : ' (local time)';
    var titleText = 'Daylight from ' + timeInTz(sunrise, stageTz, clockFmt || '24h')
      + ' to ' + timeInTz(sunset, stageTz, clockFmt || '24h') + tzSuffix;

    // Mirror the rich title into aria-label so screen readers announce the
    // actual sunrise/sunset times — otherwise the static aria-label on the
    // SVG element ("Daylight bar") shadows the dynamic <title> element.
    svgEl.setAttribute('aria-label', titleText);

    var titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.textContent = titleText;
    svgEl.appendChild(titleEl);

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-track',
      x1: BAR_X1, y1: BAR_Y, x2: BAR_X2, y2: BAR_Y
    }));

    var twilightBands = [
      { dawn: output.astronomicalDawn, dusk: output.astronomicalDusk, cls: 'dl-bar-astronomical' },
      { dawn: output.nauticalDawn,     dusk: output.nauticalDusk,     cls: 'dl-bar-nautical'     },
      { dawn: output.civilDawn,        dusk: output.civilDusk,        cls: 'dl-bar-civil'        }
    ];

    twilightBands.forEach(function (band) {
      if (!band.dawn || !band.dusk) return;
      svgEl.appendChild(makeSVGEl('line', {
        class: band.cls,
        x1: utcToBarX(band.dawn, sunrise, sunset),
        y1: BAR_Y,
        x2: utcToBarX(band.dusk, sunrise, sunset),
        y2: BAR_Y
      }));
    });

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-daylight',
      x1: BAR_X1, y1: BAR_Y, x2: BAR_X2, y2: BAR_Y
    }));

    var walkStartX = null;
    var walkEndX   = null;

    if (output.mode === 'reverse') {
      if (output.latestDepartUTC === null) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-tick-sunrise',
          x1: BAR_X1, y1: BAR_Y - 10,
          x2: BAR_X1, y2: BAR_Y + 10
        }));
        var sunriseLblOnly = makeSVGEl('text', {
          class: 'dl-bar-label',
          x: BAR_X1, y: BAR_Y + 22,
          'text-anchor': 'middle'
        });
        sunriseLblOnly.textContent = timeInTz(sunrise, stageTz, clockFmt || '24h');
        svgEl.appendChild(sunriseLblOnly);
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-tick-sunset',
          x1: BAR_X2, y1: BAR_Y - 10,
          x2: BAR_X2, y2: BAR_Y + 10
        }));
        var sunsetLblOnly = makeSVGEl('text', {
          class: 'dl-bar-label',
          x: BAR_X2, y: BAR_Y + 22,
          'text-anchor': 'middle'
        });
        sunsetLblOnly.textContent = timeInTz(sunset, stageTz, clockFmt || '24h');
        svgEl.appendChild(sunsetLblOnly);
        return;
      }

      var departX = utcToBarX(output.latestDepartUTC, sunrise, sunset);
      walkStartX  = departX;
      walkEndX    = utcToBarX(output.walkEndUTC, sunrise, sunset);
      var walkX1  = Math.min(departX, walkEndX);
      var walkX2  = Math.max(departX, walkEndX);

      if (walkX2 > walkX1 + 0.5) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-walk',
          x1: walkX1, y1: BAR_Y, x2: walkX2, y2: BAR_Y
        }));
      }

      if (walkEndX < BAR_X2 - 0.5) {
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-buffer',
          x1: walkEndX, y1: BAR_Y, x2: BAR_X2, y2: BAR_Y
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
      var startX   = utcToBarX(output.startUTC,   sunrise, sunset);
      var arrivalX = utcToBarX(output.arrivalUTC, sunrise, sunset);
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
      x1: BAR_X1, y1: BAR_Y - 10,
      x2: BAR_X1, y2: BAR_Y + 10
    }));
    var sunriseLbl = makeSVGEl('text', {
      class: 'dl-bar-label',
      x: BAR_X1, y: BAR_Y + 22,
      'text-anchor': 'middle'
    });
    sunriseLbl.textContent = timeInTz(sunrise, stageTz, clockFmt || '24h');
    svgEl.appendChild(sunriseLbl);

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-tick-sunset',
      x1: BAR_X2, y1: BAR_Y - 10,
      x2: BAR_X2, y2: BAR_Y + 10
    }));
    var sunsetLbl = makeSVGEl('text', {
      class: 'dl-bar-label',
      x: BAR_X2, y: BAR_Y + 22,
      'text-anchor': 'middle'
    });
    sunsetLbl.textContent = timeInTz(sunset, stageTz, clockFmt || '24h');
    svgEl.appendChild(sunsetLbl);

    if (output.moonriseUTC) {
      var mrT = output.moonriseUTC.getTime();
      if (mrT >= sunrise.getTime() && mrT <= sunset.getTime()) {
        var mrX = utcToBarX(output.moonriseUTC, sunrise, sunset);
        svgEl.appendChild(makeSVGEl('line', {
          class: 'dl-bar-moon-tick',
          x1: mrX, y1: BAR_Y - 6,
          x2: mrX, y2: BAR_Y + 6
        }));
      }
    }

    if (output.moonsetUTC) {
      var msT = output.moonsetUTC.getTime();
      if (msT >= sunrise.getTime() && msT <= sunset.getTime()) {
        var msX = utcToBarX(output.moonsetUTC, sunrise, sunset);
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
      var nowX = utcToBarX(nowUTC, sunrise, sunset);
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
     Exports
     ========================================== */

  var api = {
    recompute:   recompute,
    renderSVG:   renderSVG,
    fmtDuration: fmtDuration
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
    dom.moonGlyph     = document.getElementById('dl-moon-glyph');
    dom.result        = document.getElementById('dl-result');
    dom.annotations   = document.getElementById('dl-annotations');
    dom.shareBtn      = document.getElementById('dl-share-btn');
    dom.shareHint     = document.getElementById('dl-share-hint');
    dom.validationMsg = document.getElementById('dl-validation-msg');
    dom.prefsToggle   = document.getElementById('dl-prefs-toggle');
    dom.prefsPanel    = document.getElementById('dl-prefs-panel');

    if (!dom.routeSel) return;

    loadPrefs();
    applyParamsFromURL();
    loadRouteMeta();

    dom.routeSel.addEventListener('change', onRouteChange);
    dom.stageSel.addEventListener('change', onFieldChange);
    dom.dateInput.addEventListener('change', onFieldChange);
    dom.paceInput.addEventListener('change', onFieldChange);
    dom.startInput.addEventListener('change', onFieldChange);
    dom.bufferInput.addEventListener('input', onFieldChange);

    dom.modeRadios.forEach(function (radio) {
      radio.addEventListener('change', onModeChange);
    });

    dom.latInput.addEventListener('input', onFieldChange);
    dom.lonInput.addEventListener('input', onFieldChange);
    dom.distInput.addEventListener('input', onFieldChange);
    dom.elevInput.addEventListener('input', onFieldChange);

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

    /* Per-route SEO pages set data-default-route on <body>. Use it as a
       fallback when the URL carries no route param (bare /daylight/<route>/ URL). */
    if (!params.route && document.body && document.body.dataset.defaultRoute) {
      params.route = document.body.dataset.defaultRoute;
    }

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

    if (params.date) {
      var d = new Date(params.date);
      var yr = parseInt(params.date.split('-')[0], 10);
      if (isNaN(d.getTime()) || yr < 1900 || yr > 2100) {
        params.date = todayString();
      }
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
    pushURL();
  }

  function showCustomPanel(show) {
    dom.customPanel.hidden = !show;
  }

  function loadStageData(routeId, requestedStageStr) {
    if (_stageData[routeId]) {
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
      populateStageSelect(stages, requestedStageStr);
    };
    xhr.onerror = function () {
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
    var dateStr  = dom.dateInput.value;
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

  function runAndRender() {
    var state  = buildState();
    var output = recompute(state);

    renderSVG(output, dom.barSvg, output.stageTz || null, _prefs.clockFormat);

    if (dom.moonGlyph) {
      if (output.moonPhase !== null && output.moonPhase !== undefined
          && typeof window.Moon !== 'undefined') {
        dom.moonGlyph.hidden = false;
        window.Moon.renderMoon(dom.moonGlyph, output.moonPhase);
      } else {
        dom.moonGlyph.hidden = true;
      }
    }

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
      return;
    }

    if (output.mode === 'reverse') {
      if (output.latestDepartUTC === null) {
        renderAnnotations(output.annotations || []);
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
  }

  function clearOutput() {
    if (dom.barSvg) {
      while (dom.barSvg.firstChild) dom.barSvg.removeChild(dom.barSvg.firstChild);
    }
    if (dom.result) dom.result.textContent = '';
    renderAnnotations([]);
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

    if (dom.dateInput.value)  params.push('date='  + encodeURIComponent(dom.dateInput.value));
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
