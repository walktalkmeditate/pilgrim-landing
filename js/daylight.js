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

   navigator.geolocation is accessed ONLY in the "use my location"
   button handler below (grep-assertable, per slice-5 requirement).
   ============================================= */

(function (root) {
  'use strict';

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
      return { error: 'math modules not loaded' };
    }

    var route   = state.route;
    var stage   = state.stage;
    var dateStr = state.date;
    var paceKey = state.paceKey   || 'standard';
    var startMin= state.startTimeMin;

    if (startMin === undefined || startMin === null || isNaN(startMin)) {
      return { error: 'missing or invalid startTimeMin' };
    }

    var lat, lon, distanceKm, elevGainM;

    if (route === 'custom') {
      lat        = parseFloat(state.customLat);
      lon        = parseFloat(state.customLon);
      distanceKm = parseFloat(state.customDistance);
      elevGainM  = parseFloat(state.customElevGain) || 0;
      if (isNaN(lat) || isNaN(lon) || isNaN(distanceKm) || distanceKm <= 0) {
        return { error: 'incomplete custom route' };
      }
    } else {
      var s = stage;
      if (!s || typeof s.startLat === 'undefined') {
        return { error: 'no stage data' };
      }
      lat        = s.startLat;
      lon        = s.startLon;
      distanceKm = s.distanceKm;
      elevGainM  = s.elevGainM || 0;
    }

    if (!dateStr) return { error: 'missing date' };

    var parts = dateStr.split('-');
    var walkDate = new Date(Date.UTC(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
      12, 0, 0
    ));

    var sunriseDate = SunPathMath.sunriseUTC(lat, lon, walkDate);
    var sunsetDate  = SunPathMath.sunsetUTC(lat, lon, walkDate);

    if (!sunriseDate || !sunsetDate) {
      return { error: 'polar day or polar night for this date and location' };
    }

    var walkMin = DaylightMath.walkingMinutes({
      distanceKm: distanceKm,
      elevGainM:  elevGainM,
      pacePresetOrMinPerKm: paceKey
    });

    var dayMidnightUTC = Date.UTC(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
      0, 0, 0
    );

    var startUTC   = new Date(dayMidnightUTC + startMin * 60000);
    var arrivalUTC = new Date(startUTC.getTime() + walkMin * 60000);
    var cushionMin = (sunsetDate.getTime() - arrivalUTC.getTime()) / 60000;

    return {
      sunriseUTC: sunriseDate,
      sunsetUTC:  sunsetDate,
      startUTC:   startUTC,
      arrivalUTC: arrivalUTC,
      walkMin:    walkMin,
      cushionMin: cushionMin
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

  function fmtUTC(date) {
    var h = date.getUTCHours();
    var m = date.getUTCMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function fmtDuration(totalMin) {
    var h = Math.floor(Math.abs(totalMin) / 60);
    var m = Math.round(Math.abs(totalMin) % 60);
    if (h === 0) return m + 'm';
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  }

  function utcToBarX(utcDate, sunriseUTC, sunsetUTC) {
    var span = sunsetUTC.getTime() - sunriseUTC.getTime();
    if (span <= 0) return BAR_X1;
    var t = utcDate.getTime() - sunriseUTC.getTime();
    var frac = Math.max(0, Math.min(1, t / span));
    return BAR_X1 + frac * BAR_W;
  }

  function renderSVG(output, svgEl) {
    clearSVG(svgEl);

    if (output.error) return;

    var sunrise  = output.sunriseUTC;
    var sunset   = output.sunsetUTC;
    var start    = output.startUTC;
    var arrival  = output.arrivalUTC;

    var nowUTC = new Date();

    var startX   = utcToBarX(start,   sunrise, sunset);
    var arrivalX = utcToBarX(arrival, sunrise, sunset);

    var titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.textContent = 'Daylight from ' + fmtUTC(sunrise) + ' to ' + fmtUTC(sunset) + ' UTC';
    svgEl.appendChild(titleEl);

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-track',
      x1: BAR_X1, y1: BAR_Y, x2: BAR_X2, y2: BAR_Y
    }));

    svgEl.appendChild(makeSVGEl('line', {
      class: 'dl-bar-daylight',
      x1: BAR_X1, y1: BAR_Y, x2: BAR_X2, y2: BAR_Y
    }));

    var walkX1 = Math.min(startX, arrivalX);
    var walkX2 = Math.max(startX, arrivalX);
    if (walkX2 > walkX1 + 0.5) {
      svgEl.appendChild(makeSVGEl('line', {
        class: 'dl-bar-walk',
        x1: walkX1, y1: BAR_Y, x2: walkX2, y2: BAR_Y
      }));
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
    sunriseLbl.textContent = fmtUTC(sunrise);
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
    sunsetLbl.textContent = fmtUTC(sunset);
    svgEl.appendChild(sunsetLbl);

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

  /* ==========================================
     Exports
     ========================================== */

  var api = {
    recompute:   recompute,
    renderSVG:   renderSVG,
    fmtUTC:      fmtUTC,
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

  var _stageData  = {};
  var _currentRoute = null;

  var dom = {};

  document.addEventListener('DOMContentLoaded', function () {
    dom.routeSel    = document.getElementById('dl-route');
    dom.stageSel    = document.getElementById('dl-stage');
    dom.stageWrap   = document.getElementById('dl-stage-wrap');
    dom.customPanel = document.getElementById('dl-custom-panel');
    dom.latInput    = document.getElementById('dl-lat');
    dom.lonInput    = document.getElementById('dl-lon');
    dom.distInput   = document.getElementById('dl-dist');
    dom.elevInput   = document.getElementById('dl-elev');
    dom.locateBtn   = document.getElementById('dl-locate');
    dom.dateInput   = document.getElementById('dl-date');
    dom.paceInput   = document.getElementById('dl-pace');
    dom.startInput  = document.getElementById('dl-start');
    dom.barSvg      = document.getElementById('dl-bar-svg');
    dom.result      = document.getElementById('dl-result');

    if (!dom.routeSel) return;

    applyParamsFromURL();
    loadRouteMeta();

    dom.routeSel.addEventListener('change', onRouteChange);
    dom.stageSel.addEventListener('change', onFieldChange);
    dom.dateInput.addEventListener('change', onFieldChange);
    dom.paceInput.addEventListener('change', onFieldChange);
    dom.startInput.addEventListener('change', onFieldChange);

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
  });

  function applyParamsFromURL() {
    var params = parseParams(location.search);

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
  }

  // Returns YYYY-MM-DD in the user's *local* tz (not UTC). Default-date picker uses
  // the user's calendar date — full stage-tz-aware "now" semantics arrives in slice 5.
  function todayString() {
    var n = new Date();
    var y = n.getFullYear();
    var m = n.getMonth() + 1;
    var d = n.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function loadRouteMeta() {
    var xhr = new XMLHttpRequest();
    // Asset paths are hub-relative ('../assets/daylight/...') and assume the page is
    // served from /daylight/. Per-route SEO pages in slice 6 will need a different
    // path strategy when they live at /daylight/<route>/.
    xhr.open('GET', '../assets/daylight/route-meta.json');
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
        loadStageData(_currentRoute);
      }
    }
  }

  function onRouteChange() {
    var routeId = dom.routeSel.value;
    _currentRoute = routeId;

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
      loadStageData(routeId);
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

  function loadStageData(routeId) {
    if (_stageData[routeId]) {
      populateStageSelect(_stageData[routeId]);
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '../assets/daylight/' + routeId + '.json');
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var stages;
      try { stages = JSON.parse(xhr.responseText); } catch (e) { return; }
      _stageData[routeId] = stages;
      populateStageSelect(stages);
    };
    xhr.onerror = function () {
      dom.result.textContent = "Couldn’t load stage data for " + routeId + ". Try refreshing.";
    };
    xhr.send();
  }

  function populateStageSelect(stages) {
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

    var params = parseParams(location.search);
    if (params.stage !== null && params.stage !== undefined) {
      dom.stageSel.value = String(params.stage);
    }
    if (!dom.stageSel.value && stages.length > 0) {
      dom.stageSel.value = '0';
    }

    onFieldChange();
  }

  function onFieldChange() {
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
      mode:           'forward'
    };
  }

  function runAndRender() {
    var state  = buildState();
    var output = recompute(state);

    renderSVG(output, dom.barSvg);

    if (output.error) {
      var silent = (output.error === 'missing or invalid startTimeMin'
        || output.error === 'no stage data'
        || output.error === 'missing date'
        || output.error === 'incomplete custom route');
      dom.result.textContent = silent ? '' : output.error;
      return;
    }

    var arriveStr  = fmtUTC(output.arrivalUTC) + ' UTC';
    var walkStr    = fmtDuration(output.walkMin);
    var cushionStr = fmtDuration(Math.abs(output.cushionMin));
    var cushionSign = output.cushionMin >= 0 ? '' : '−';

    dom.result.textContent = '';

    var main = document.createTextNode(
      'Arrive ∼' + arriveStr
      + '  ·  '
      + walkStr + ' walking'
      + '  ·  '
      + cushionSign + cushionStr + ' cushion before sunset'
    );
    dom.result.appendChild(main);
  }

  function clearOutput() {
    if (dom.barSvg) {
      while (dom.barSvg.firstChild) dom.barSvg.removeChild(dom.barSvg.firstChild);
    }
    if (dom.result) dom.result.textContent = '';
  }

  function pushURL() {
    // Slice 3 is forward-only; `mode` is implicitly forward and not written to the URL.
    // Slice 4 (reverse mode) will add the mode write path.
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
    if (dom.startInput.value && dom.startInput.value !== '07:00') {
      params.push('start=' + encodeURIComponent(dom.startInput.value));
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
      mode: 'forward', elevGain: null, customLat: null, customLon: null, customDist: null
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
        case 'elevGain':   result.elevGain   = v; break;
        case 'customLat':  result.customLat  = v; break;
        case 'customLon':  result.customLon  = v; break;
        case 'customDist': result.customDist = v; break;
      }
    });
    return result;
  }

})(typeof window !== 'undefined' ? window : globalThis);
