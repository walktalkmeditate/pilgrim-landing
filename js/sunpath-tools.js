/* =============================================
   Sun Path — instruments

   Time machine, festivals, analemma, dawn sweep, walk-to-sun,
   tomorrow-vs-today daylight graph. Each instrument is independently
   set up and degrades gracefully if its DOM target is missing.

   Loads after sunpath.js. Reuses window.SunPathMath.
   ============================================= */

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var M = window.SunPathMath;
  if (!M) return;

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function htmlEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function clearChildren(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // --- Layer 7: Cultural turning calendar ---------------------------------
  // Reads from turning-events-{YEAR}.json so the festivals shown here always
  // exist on their respective permalink pages. Entries without a source are
  // skipped (cultural-sensitivity rule).

  function activeYear() {
    if (window.__sunpathForce && window.__sunpathForce.date) {
      var d = new Date(window.__sunpathForce.date);
      if (!isNaN(d)) return d.getUTCFullYear();
    }
    return new Date().getUTCFullYear();
  }

  function setupFestivals() {
    var container = document.getElementById('sunpath-festivals');
    if (!container) return;

    fetch('/assets/sunpath/turning-events-' + activeYear() + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.events) return;
        clearChildren(container);
        var labels = {
          'spring-equinox':  'Spring · 春分',
          'summer-solstice': 'Summer · 夏至',
          'autumn-equinox':  'Autumn · 秋分',
          'winter-solstice': 'Winter · 冬至'
        };
        ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'].forEach(function (key) {
          var event = data.events[key];
          if (!event || !event.pilgrimages) return;
          // Only sourced entries.
          var sourced = event.pilgrimages.filter(function (p) { return !!p.source; });
          if (!sourced.length) return;

          var group = htmlEl('div', 'sunpath-festival-group');
          var heading = htmlEl('h3', 'sunpath-festival-heading');
          var headingLink = document.createElement('a');
          // Use the active year (permalink: page year; live: current year).
          headingLink.href = '/sunpath/' + activeYear() + '-' + key;
          headingLink.className = 'sunpath-festival-heading-link';
          headingLink.dataset.turning = key;
          headingLink.textContent = labels[key];
          heading.appendChild(headingLink);
          group.appendChild(heading);

          var list = htmlEl('ul', 'sunpath-festival-list');
          // Show the first two — fuller set lives on the permalink page.
          sourced.slice(0, 2).forEach(function (p) {
            var li = htmlEl('li', 'sunpath-festival-item');
            li.dataset.turning = key;
            li.appendChild(htmlEl('span', 'sunpath-festival-name', p.name));
            if (p.tradition) {
              li.appendChild(htmlEl('span', 'sunpath-festival-tradition', p.tradition));
            }
            li.appendChild(htmlEl('span', 'sunpath-festival-culture', p.where));
            li.appendChild(htmlEl('p', 'sunpath-festival-walk', p.what));
            list.appendChild(li);
          });
          group.appendChild(list);
          container.appendChild(group);
        });
      })
      .catch(function () { /* graceful skip */ });
  }

  // --- Layer 8: Analemma at preset cities ---------------------------------

  function setupAnalemma() {
    var container = document.getElementById('sunpath-analemma');
    if (!container) return;

    fetch('/assets/sunpath/cities.json')
      .then(function (r) { return r.json(); })
      .then(function (cities) {
        var picker = htmlEl('div', 'sunpath-city-picker');
        cities.forEach(function (city, idx) {
          var btn = htmlEl('button', 'sunpath-city-button', city.name);
          btn.type = 'button';
          btn.dataset.cityId = city.id;
          if (idx === 0) btn.classList.add('is-active');
          btn.addEventListener('click', function () {
            container.querySelectorAll('.sunpath-city-button').forEach(function (b) {
              b.classList.remove('is-active');
            });
            btn.classList.add('is-active');
            drawAnalemma(city, plot, caption);
          });
          picker.appendChild(btn);
        });
        var plot = svgEl('svg', {
          viewBox: '0 0 320 320',
          'class': 'sunpath-analemma-svg',
          'aria-hidden': 'true'
        });
        var caption = htmlEl('p', 'sunpath-analemma-caption');

        clearChildren(container);
        container.appendChild(picker);
        container.appendChild(plot);
        container.appendChild(caption);

        drawAnalemma(cities[0], plot, caption);
      })
      .catch(function () {});
  }

  function drawAnalemma(city, plot, caption) {
    clearChildren(plot);
    var pts = M.analemma(city.lat, city.lon, new Date().getUTCFullYear());

    var W = 320, H = 320;
    var cx = W / 2;
    var cy = H / 2;
    var r = W / 2 - 30;

    // Polar plot: at zenith (90°), distance from center = 0; at horizon (0°),
    // distance = r.

    // Horizon ring (90° altitude == zenith == center).
    plot.appendChild(svgEl('circle', {
      'class': 'sunpath-analemma-horizon',
      cx: cx, cy: cy, r: r
    }));

    // Build polyline.
    var d = '';
    pts.forEach(function (p, i) {
      // Map altitude: at zenith (90°), distance from center = 0.
      // At horizon (0°), distance = r.
      var dist = (1 - p.altitude / 90) * r;
      // Azimuth: 180° = south = down. North = up. Map directly: angle from north.
      var ang = (p.azimuth - 180) * Math.PI / 180;
      var x = cx + Math.sin(ang) * dist;
      var y = cy + Math.cos(ang) * dist;
      d += (i === 0 ? 'M ' : ' L ') + x.toFixed(1) + ',' + y.toFixed(1);
    });
    plot.appendChild(svgEl('path', {
      'class': 'sunpath-analemma-path',
      d: d
    }));

    // Mark today.
    var today = M.dayOfYear(new Date()) - 1;
    if (today >= 0 && today < pts.length) {
      var p = pts[today];
      var dist = (1 - p.altitude / 90) * r;
      var ang = (p.azimuth - 180) * Math.PI / 180;
      var x = cx + Math.sin(ang) * dist;
      var y = cy + Math.cos(ang) * dist;
      plot.appendChild(svgEl('circle', {
        'class': 'sunpath-analemma-today',
        cx: x, cy: y, r: 4
      }));
    }

    if (caption) {
      caption.textContent = 'the sun’s noon position over ' + city.name +
        ', tracing one full year. Today marked in gold.';
    }
  }

  // --- Layer 9: Dawn-light direction sweep --------------------------------

  var DAWN_LATITUDES = [
    { lat:  0,    label: 'Equator (0°)'       },
    { lat: 23.5,  label: 'Tropic (23.5°N)'    },
    { lat: 45,    label: 'Mid-latitude (45°N)'},
    { lat: 60,    label: 'High-latitude (60°N)'},
    { lat: 70,    label: 'Arctic (70°N)'      }
  ];

  function setupDawnSweep() {
    var container = document.getElementById('sunpath-dawn');
    if (!container) return;
    clearChildren(container);

    var picker = htmlEl('div', 'sunpath-lat-picker');
    DAWN_LATITUDES.forEach(function (entry, idx) {
      var btn = htmlEl('button', 'sunpath-city-button', entry.label);
      btn.type = 'button';
      if (idx === 2) btn.classList.add('is-active'); // default to 45°
      btn.addEventListener('click', function () {
        container.querySelectorAll('.sunpath-city-button').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        drawDawn(entry.lat, plot, caption);
      });
      picker.appendChild(btn);
    });

    var plot = svgEl('svg', {
      viewBox: '0 0 360 200',
      'class': 'sunpath-dawn-svg',
      'aria-hidden': 'true'
    });
    var caption = htmlEl('p', 'sunpath-dawn-caption');

    container.appendChild(picker);
    container.appendChild(plot);
    container.appendChild(caption);

    drawDawn(45, plot, caption);
  }

  function drawDawn(lat, plot, caption) {
    clearChildren(plot);
    var W = 360, H = 200;

    // Compute sunrise azimuth for each day of the year.
    var year = new Date().getUTCFullYear();
    var pts = [];
    for (var n = 0; n < 365; n++) {
      var date = new Date(Date.UTC(year, 0, 1 + n, 6));
      var az = M.sunriseAzimuth(lat, date);
      pts.push({ day: n, az: az });
    }

    // X axis: day of year 0..364.
    // Y axis: azimuth 30..150 (eastern quadrant).
    var minAz = 30, maxAz = 150;
    var marginX = 30, marginY = 20;
    var pw = W - marginX * 2;
    var ph = H - marginY * 2;

    // Frame.
    plot.appendChild(svgEl('line', {
      'class': 'sunpath-dawn-axis',
      x1: marginX, y1: H - marginY, x2: W - marginX, y2: H - marginY
    }));
    plot.appendChild(svgEl('line', {
      'class': 'sunpath-dawn-axis',
      x1: marginX, y1: marginY, x2: marginX, y2: H - marginY
    }));

    // Reference: 90° east line.
    var y90 = H - marginY - ((90 - minAz) / (maxAz - minAz)) * ph;
    plot.appendChild(svgEl('line', {
      'class': 'sunpath-dawn-east',
      x1: marginX, y1: y90, x2: W - marginX, y2: y90,
      'stroke-dasharray': '2 3'
    }));
    var eastLabel = svgEl('text', {
      x: W - marginX + 4, y: y90 + 3,
      'class': 'sunpath-dawn-tick'
    });
    eastLabel.textContent = 'east';
    plot.appendChild(eastLabel);

    // Build path.
    var d = '';
    var anyValid = false;
    pts.forEach(function (p) {
      if (p.az === null) return;
      var x = marginX + (p.day / 364) * pw;
      var y = H - marginY - ((p.az - minAz) / (maxAz - minAz)) * ph;
      d += (anyValid ? ' L ' : 'M ') + x.toFixed(1) + ',' + y.toFixed(1);
      anyValid = true;
    });
    if (anyValid) {
      plot.appendChild(svgEl('path', {
        'class': 'sunpath-dawn-path',
        d: d
      }));
    }

    if (caption) {
      caption.textContent = 'sunrise direction at ' + lat + '°N, tracing one full year. ' +
        'flat at the equator; broad sweep at high latitudes; vanishes in arctic winter.';
    }
  }

  // --- Layer 10: Walk-to-the-sun (Greenwich → subsolar) -------------------

  var walkSunTimer = null;

  function setupWalkToSun() {
    var container = document.getElementById('sunpath-walk-to-sun');
    if (!container) return;
    clearChildren(container);

    var caption = htmlEl('p', 'sunpath-walk-caption');
    caption.id = 'sunpath-walk-caption';

    var dist = htmlEl('p', 'sunpath-walk-distance');
    dist.id = 'sunpath-walk-distance';

    container.appendChild(caption);
    container.appendChild(dist);

    updateWalkToSun();
    walkSunTimer = setInterval(updateWalkToSun, 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (walkSunTimer) { clearInterval(walkSunTimer); walkSunTimer = null; }
      } else if (!walkSunTimer) {
        walkSunTimer = setInterval(updateWalkToSun, 1000);
        updateWalkToSun();
      }
    });
  }

  function updateWalkToSun() {
    var caption = document.getElementById('sunpath-walk-caption');
    var dist = document.getElementById('sunpath-walk-distance');
    if (!caption || !dist) return;
    var sub = M.subsolarPoint(new Date());
    var greenwichLat = 51.4779, greenwichLon = 0;
    var km = M.greatCircleKm(greenwichLat, greenwichLon, sub.lat, sub.lon);
    caption.textContent = 'from the Royal Observatory at Greenwich to the point directly under the sun';
    dist.textContent = km.toFixed(1) + ' km · ticking by ~463 m per second as Earth turns';
  }

  // --- Layer 11: Tomorrow vs today daylight graph -------------------------

  function setupDaylightDelta() {
    var container = document.getElementById('sunpath-daylight');
    if (!container) return;

    fetch('/assets/sunpath/cities.json')
      .then(function (r) { return r.json(); })
      .then(function (cities) {
        clearChildren(container);

        var picker = htmlEl('div', 'sunpath-city-picker');
        cities.forEach(function (city, idx) {
          var btn = htmlEl('button', 'sunpath-city-button', city.name);
          btn.type = 'button';
          if (idx === 5) btn.classList.add('is-active'); // Tokyo as default
          btn.addEventListener('click', function () {
            container.querySelectorAll('.sunpath-city-button').forEach(function (b) {
              b.classList.remove('is-active');
            });
            btn.classList.add('is-active');
            drawDaylightDelta(city, plot, caption);
          });
          picker.appendChild(btn);
        });

        var plot = svgEl('svg', {
          viewBox: '0 0 360 200',
          'class': 'sunpath-daylight-svg',
          'aria-hidden': 'true'
        });
        var caption = htmlEl('p', 'sunpath-daylight-caption');

        container.appendChild(picker);
        container.appendChild(plot);
        container.appendChild(caption);

        drawDaylightDelta(cities[5], plot, caption);
      })
      .catch(function () {});
  }

  function drawDaylightDelta(city, plot, caption) {
    clearChildren(plot);

    var W = 360, H = 200;
    var marginX = 30, marginY = 20;
    var pw = W - marginX * 2;
    var ph = H - marginY * 2;

    var year = new Date().getUTCFullYear();
    var pts = [];
    var prev = null;
    for (var n = 0; n < 365; n++) {
      var date = new Date(Date.UTC(year, 0, 1 + n, 12));
      var hours = M.daylightHours(city.lat, date);
      if (prev !== null) {
        // delta in minutes (positive = day getting longer)
        pts.push({ day: n, deltaMin: (hours - prev) * 60 });
      }
      prev = hours;
    }

    // Find delta range.
    var maxAbs = 0;
    pts.forEach(function (p) {
      if (Math.abs(p.deltaMin) > maxAbs) maxAbs = Math.abs(p.deltaMin);
    });
    if (maxAbs === 0) maxAbs = 1;

    // Axes.
    plot.appendChild(svgEl('line', {
      'class': 'sunpath-dawn-axis',
      x1: marginX, y1: H - marginY, x2: W - marginX, y2: H - marginY
    }));
    var midY = H / 2;
    plot.appendChild(svgEl('line', {
      'class': 'sunpath-dawn-east',
      x1: marginX, y1: midY, x2: W - marginX, y2: midY,
      'stroke-dasharray': '2 3'
    }));
    plot.appendChild(svgEl('line', {
      'class': 'sunpath-dawn-axis',
      x1: marginX, y1: marginY, x2: marginX, y2: H - marginY
    }));

    // Path.
    var d = '';
    pts.forEach(function (p, i) {
      var x = marginX + (p.day / 364) * pw;
      var y = midY - (p.deltaMin / maxAbs) * (ph / 2);
      d += (i === 0 ? 'M ' : ' L ') + x.toFixed(1) + ',' + y.toFixed(1);
    });
    plot.appendChild(svgEl('path', {
      'class': 'sunpath-daylight-path',
      d: d
    }));

    // Label peaks.
    var labelText = svgEl('text', {
      x: marginX, y: marginY - 6, 'class': 'sunpath-dawn-tick'
    });
    labelText.textContent = 'gain ' + maxAbs.toFixed(1) + ' min/day';
    plot.appendChild(labelText);
    var labelText2 = svgEl('text', {
      x: marginX, y: H - marginY + 14, 'class': 'sunpath-dawn-tick'
    });
    labelText2.textContent = 'lose ' + maxAbs.toFixed(1) + ' min/day';
    plot.appendChild(labelText2);

    // Today marker.
    var todayDay = M.dayOfYear(new Date()) - 1;
    if (todayDay >= 1 && todayDay < pts.length) {
      var todayP = pts[todayDay - 1];
      var x = marginX + (todayP.day / 364) * pw;
      var y = midY - (todayP.deltaMin / maxAbs) * (ph / 2);
      plot.appendChild(svgEl('circle', {
        'class': 'sunpath-analemma-today',
        cx: x, cy: y, r: 4
      }));
    }

    if (caption) {
      var todayDelta = (todayDay > 0 && pts[todayDay - 1])
        ? pts[todayDay - 1].deltaMin
        : 0;
      var sign = todayDelta >= 0 ? 'gaining' : 'losing';
      caption.textContent = city.name + ' · today is ' + sign + ' ' +
        Math.abs(todayDelta).toFixed(1) + ' minutes of daylight vs yesterday.';
    }
  }

  // --- Init all Stage B layers --------------------------------------------

  function init() {
    setupFestivals();
    setupAnalemma();
    setupDawnSweep();
    setupWalkToSun();
    setupDaylightDelta();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
