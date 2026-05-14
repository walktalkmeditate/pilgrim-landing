/* =============================================
   Moon Path — page controller

   Two-layer architecture:
     Inner core   — recompute(state): pure function, no DOM, no async
     Outer shell  — DOM glue, only runs in browser

   Export shape:
     Browser → window.MoonPath = { recompute, parseParams, nearestPortFor }
     Node    → module.exports  = { recompute, parseParams, nearestPortFor }

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

    return {
      ready:     true,
      lat:       lat,
      lon:       lon,
      now:       now,
      moonPhase: SunPathMath.moonPhaseAtUTC(now)
    };
  }

  /* ==========================================
     Exports (inner core only — DOM glue below)
     ========================================== */

  var api = {
    recompute:      recompute,
    parseParams:    parseParams,
    nearestPortFor: nearestPortFor
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
    tideSection: document.getElementById('mp-tide')
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
