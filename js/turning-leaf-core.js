/* =============================================
   The turning leaf — the pure core

   Each solstice and equinox page opens on a plate: a pilgrim's staff at
   one Shikoku temple, the turning day's sun arc across the sky, the
   staff's hourly shadows, and the season's skies behind. This file
   computes and draws all of it, and nothing else:

   - the walk (which temple a turning stands at),
   - the plate's day and season (KTD7),
   - the scene, strip, seal, number stamp and walk map, each a separate
     deterministic SVG string (KTD3).

   The build requires it to write the pages; js/turning-leaf.js reads it
   from window to redraw the plate for a scrubbed day or the reader's own
   place. The place under the sun and the claim menu are build-only and
   live in scripts/sunpath/turning-claims.js, so the page never downloads
   them. It never computes a turning instant (js/turnings.js and
   scripts/sunpath/meeus.mjs do); instants come in as input.

   Tested in js/turning-leaf-core.test.js.
   ============================================= */

(function (root) {
  'use strict';

  var M = (typeof root !== 'undefined' && root.SunPathMath)
    ? root.SunPathMath
    : (typeof require === 'function' ? require('./sunpath-math.js') : null);
  if (!M) throw new Error('TurningLeafCore: load js/sunpath-math.js first');

  var DEG = Math.PI / 180;
  var DAY_MS = 86400000;
  var MIN_MS = 60000;

  var TURNINGS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];
  var SEAL_KANJI = {
    'spring-equinox': '春分', 'summer-solstice': '夏至',
    'autumn-equinox': '秋分', 'winter-solstice': '冬至'
  };
  // The first turning page is the 2026 spring equinox, so the walk starts there.
  var WALK_START_YEAR = 2026;
  var TEMPLES = 88;
  var TEMPLE_TZ_MIN = 540;
  var PHOTOS_BEGIN = '2026-05-04';

  // Scene units are card pixels: the scene fills the card's 606 px above the
  // strip, so a test at "card scale" reads coordinates as they are.
  //
  // The sky is one panorama, x by azimuth and y by altitude, shared by card
  // and phone. The user chose its azimuth scale at visual review, over a
  // narrower one that fitted the whole horizon: every turning's sun path,
  // sunrise to sunset at its temple, fits PHONE_CROP. A turning near
  // midnight (2026 spring, 2027 summer) leaves the sun almost due north,
  // behind the viewer and past the crop; its glow is pinned to the crop's
  // nearer edge and says so, so it stays on a phone's first screen. The
  // altitude scale keeps the zenith in frame for a reader in the tropics.
  var SCENE = {
    w: 800, h: 606,
    cx: 400, hy: 356, by: 456,
    staffH: 230, k: 0.3,
    ax: 1.9, ay: 3.8,
    sunR: 9, wBase: 11
  };
  var VIEWBOX = '0 0 ' + SCENE.w + ' ' + SCENE.h;
  var PHONE_CROP = { x: 160, y: 0, w: 480, h: 606 };

  // Below this the hourly shadows run several staff-lengths off the plate,
  // as in the prototype.
  var SHADOW_MIN_ALT = 7;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // --- numbers and dates ---

  function f1(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function wrap180(d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d === -180 ? 180 : d; }

  function isoDate(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function dateMs(date) {
    var p = date.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function localDate(instant, tzMin) { return isoDate(+instant + tzMin * MIN_MS); }
  function localMidnight(date, tzMin) { return dateMs(date) - tzMin * MIN_MS; }
  function whereOf(place) { return place.where === 'reader' ? 'where you are' : 'at the temple'; }
  function longDate(date) {
    var d = new Date(dateMs(date));
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function dayLabel(date) {
    var d = new Date(dateMs(date));
    return WEEKDAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()].slice(0, 3);
  }

  // --- the walk ---

  function walkIndex(year, key) {
    var i = TURNINGS.indexOf(key);
    if (i < 0) throw new Error('unknown turning key: ' + key);
    return (year - WALK_START_YEAR) * 4 + i;
  }
  function templeNumber(year, key) {
    return ((walkIndex(year, key) % TEMPLES) + TEMPLES) % TEMPLES + 1;
  }
  var DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function numberKanji(n) {
    var tens = Math.floor(n / 10), ones = n % 10;
    return (tens > 1 ? DIGITS[tens] : '') + (tens ? '十' : '') + DIGITS[ones] + '番';
  }
  function templePlace(t) {
    return { lat: t.lat, lon: t.lon, tzMin: TEMPLE_TZ_MIN, where: 'temple', name: t.name };
  }

  // --- the plate's day and season (KTD7) ---

  function plateDay(instant) { return localDate(instant, TEMPLE_TZ_MIN); }

  function seasonDates(prevInstant, instant) {
    var out = [];
    for (var ms = dateMs(isoDate(+prevInstant)); ms <= dateMs(isoDate(+instant)); ms += DAY_MS) out.push(isoDate(ms));
    return out;
  }

  // skyDays: the [date, colour, photo-local time] rows of
  // assets/sunpath/sky-days.json.
  function seasonDays(prevInstant, instant, skyDays) {
    var byDate = {};
    skyDays.forEach(function (d) { byDate[d[0]] = d; });
    var days = seasonDates(prevInstant, instant).map(function (date) {
      var s = byDate[date];
      if (date < PHOTOS_BEGIN) return { date: date, color: null, time: null, state: 'before' };
      return s ? { date: date, color: s[1], time: s[2], state: 'photo' } : { date: date, color: null, time: null, state: 'none' };
    });
    var before = days.filter(function (d) { return d.state === 'before'; }).length;
    var began = longDate(PHOTOS_BEGIN);
    return {
      days: days,
      strip: before < days.length,
      note: before === days.length ? 'The daily sky photos began on ' + began + ', after this season ended.'
        : before ? 'The daily sky photos began on ' + began + '.' : null
    };
  }

  // --- the sun ---

  function sunAltAz(date, lat, lon) {
    var decl = M.declination(date) * DEG;
    var utcMin = (((+date) % DAY_MS) + DAY_MS) % DAY_MS / MIN_MS;
    var H = ((utcMin + M.equationOfTime(date) + 4 * lon) / 4 - 180) * DEG;
    var phi = lat * DEG;
    var alt = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
    var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi));
    return { alt: alt / DEG, az: M.normalizeDeg(az / DEG + 180) };
  }

  // KTD10: face the noon sun, south from north of the day's subsolar
  // latitude, north otherwise.
  function facingFor(lat, date, tzMin) {
    var noon = new Date(localMidnight(date, tzMin) + DAY_MS / 2);
    return lat > M.declination(noon) ? 180 : 0;
  }

  // --- projection ---

  function skyX(az, facing) { return SCENE.cx + wrap180(az - facing) * SCENE.ax; }
  // A sun that passes the azimuth at the viewer's back leaves one edge of
  // the panorama and enters at the other; no real step between samples is
  // half the plate wide, so a wider one is that seam and breaks the path.
  function splitAtSeam(pts) {
    var runs = [[]];
    pts.forEach(function (p, i) {
      if (i && Math.abs(p.x - pts[i - 1].x) > SCENE.w / 2) runs.push([]);
      runs[runs.length - 1].push(p);
    });
    return runs;
  }
  function skyY(alt) { return SCENE.hy - alt * SCENE.ay; }
  // The ground is oblique, with the viewer's side down: a shadow points away
  // from the sun, so its across-component is -sin(az - facing) and its
  // toward-the-viewer component cos(az - facing), both times cot(alt).
  function groundXY(alt, az, facing) {
    var L = 1 / Math.tan(alt * DEG), d = (az - facing) * DEG;
    return [SCENE.cx - Math.sin(d) * L * SCENE.staffH, SCENE.by + Math.cos(d) * L * SCENE.staffH * SCENE.k];
  }

  // --- a day at a place ---

  function sample(t, place) {
    var p = sunAltAz(new Date(t), place.lat, place.lon);
    p.t = t;
    return p;
  }

  // The sun every `step` minutes of the day from local midnight t0.
  function daySamples(place, t0, step) {
    var out = [];
    for (var m = 0; m <= 1440; m += step) { var s = sample(t0 + m * MIN_MS, place); s.m = m; out.push(s); }
    return out;
  }

  // Runs of the day's samples where the sun is above `minAlt`, each closed
  // by the exact horizon crossing so arcs meet it.
  function aboveRuns(samples, place, t0, minAlt) {
    var runs = [], run = null, prev = null;
    samples.forEach(function (s) {
      var up = s.alt > minAlt;
      if (up && !run) {
        run = [];
        if (prev) run.push(crossing(prev, s, place, minAlt, t0));
        runs.push(run);
      }
      if (up) run.push(s);
      if (!up && run) { run.push(crossing(prev, s, place, minAlt, t0)); run = null; }
      prev = s;
    });
    return runs;
  }
  function crossing(a, b, place, minAlt, t0) {
    var u = (a.alt - minAlt) / (a.alt - b.alt);
    var t = a.t + u * (b.t - a.t);
    var s = sample(t, place);
    s.alt = minAlt;
    s.m = (t - t0) / MIN_MS;
    return s;
  }

  // o: { place: {lat, lon, tzMin, where}, date: 'YYYY-MM-DD' (local to the
  // place), instant?: Date, photo?: 'HH:MM', facing?: 0 | 180 }.
  function dayGeometry(o) {
    var place = o.place;
    var t0 = localMidnight(o.date, place.tzMin);
    var facing = o.facing === undefined ? facingFor(place.lat, o.date, place.tzMin) : o.facing;
    var geo = { place: place, date: o.date, facing: facing, polar: null, note: null, arc: [], hours: [], tips: [], instant: null, photo: null };

    var samples = daySamples(place, t0, 5);
    var anyUp = samples.some(function (p) { return p.alt > 0; });
    var allUp = samples.every(function (p) { return p.alt > 0; });
    if (!anyUp || allUp) {
      geo.polar = anyUp ? 'day' : 'night';
      geo.note = 'The sun does not ' + (anyUp ? 'set ' : 'rise ') + whereOf(place) + ' on ' + longDate(o.date) + '.';
    } else {
      aboveRuns(samples, place, t0, 0).forEach(function (run) {
        geo.arc = geo.arc.concat(splitAtSeam(run.map(function (p) {
          return { m: p.m, alt: p.alt, az: p.az, x: skyX(p.az, facing), y: skyY(p.alt) };
        })));
      });
      samples.forEach(function (p) {
        if (p.m % 60 || p.m === 1440 || p.alt <= 0) return;
        var h = { m: p.m, hour: p.m / 60, alt: p.alt, az: p.az, x: skyX(p.az, facing), y: skyY(p.alt) };
        if (p.alt >= SHADOW_MIN_ALT) { var g = groundXY(p.alt, p.az, facing); h.gx = g[0]; h.gy = g[1]; }
        geo.hours.push(h);
      });
      geo.tips = aboveRuns(samples, place, t0, SHADOW_MIN_ALT).map(function (run) {
        return run.map(function (p) { var g = groundXY(p.alt, p.az, facing); return { m: p.m, x: g[0], y: g[1] }; });
      });
    }

    if (o.instant) {
      var i = sunAltAz(o.instant, place.lat, place.lon);
      geo.instant = { m: (+o.instant - t0) / MIN_MS, alt: i.alt, az: i.az, up: i.alt >= 0, x: skyX(i.az, facing), y: skyY(i.alt) };
      if (i.alt > 0 && !geo.polar) {
        // Off the plate a shadow's length changes nothing visible; the cap
        // keeps a sunrise shadow's coordinates finite.
        var g2 = groundXY(Math.max(i.alt, SHADOW_MIN_ALT), i.az, facing);
        geo.instant.gx = g2[0]; geo.instant.gy = g2[1];
      }
    }
    if (o.photo) geo.photo = photoAt(place, o.date, o.photo, facing);
    return geo;
  }

  // A photo's clock time read at the place, never as "the same sun" (R14).
  function photoAt(place, date, time, facing) {
    var hm = time.split(':');
    var p = sunAltAz(new Date(localMidnight(date, place.tzMin) + (+hm[0] * 60 + +hm[1]) * MIN_MS), place.lat, place.lon);
    return { time: time, alt: p.alt, az: p.az, night: p.alt < 0, x: skyX(p.az, facing), y: skyY(p.alt) };
  }

  // The scrub readout for one strip day (KTD9).
  function photoLine(day, place) {
    var where = whereOf(place);
    var head = dayLabel(day.date) + ' · ';
    if (day.state === 'before') return { text: head + 'before the daily sky photos began on ' + longDate(PHOTOS_BEGIN), mark: false };
    if (!day.time) return { text: head + 'no photograph this day', mark: false };
    var p = photoAt(place, day.date, day.time, 180);
    var said = 'you looked up at ' + day.time + '; at ' + day.time + ' ';
    return p.night
      ? { text: head + said + 'it was night ' + where, mark: false, alt: p.alt, az: p.az }
      : { text: head + said + where + ' the sun stood here', mark: true, alt: p.alt, az: p.az };
  }

  // --- drawing helpers ---

  function prng(seed) {
    return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  }

  // A path through points as one move and relative steps, in tenths, so a
  // run of nearly equal steps (and a season of nearly equal arcs) packs well.
  function relPath(pts) {
    var d = '', px = 0, py = 0;
    pts.forEach(function (p, i) {
      var x = Math.round(p.x * 10), y = Math.round(p.y * 10);
      if (i === 0) d = 'M' + x / 10 + ' ' + y / 10;
      else d = joinNum(joinNum(i === 1 ? d + 'l' : d, (x - px) / 10), (y - py) / 10);
      px = x; py = y;
    });
    return d;
  }
  // A minus sign or a command letter already separates two numbers.
  function joinNum(d, n) { return d + (n < 0 || /[a-z]$/i.test(d) ? '' : ' ') + n; }

  // Dry-brush hairs from the prototype: seven bowed strands with broken
  // dashes, so a stroke reads as ink dragged across paper without an SVG
  // filter. Seeded, so the same plate is the same bytes.
  function dry(rnd, x0, y0, x1, y1, w0, w1, op, cls) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    var n = 7, g = '';
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1) - 0.5;
      var a0 = u * w0, a1 = u * w1, bow = (rnd() - 0.5) * 3;
      var mx = (x0 + x1) / 2 + nx * ((a0 + a1) / 2 + bow), my = (y0 + y1) / 2 + ny * ((a0 + a1) / 2 + bow);
      var d1 = len * (0.55 + rnd() * 0.4), g1 = 2 + rnd() * 8, d2 = 4 + rnd() * 18, g2 = 3 + rnd() * 10;
      var sw = Math.max(0.6, (w0 / n) * (0.9 + rnd() * 0.8));
      var o = op * (0.45 + rnd() * 0.55) * (Math.abs(u) > 0.4 ? 0.6 : 1);
      g += '<path class="' + cls + '" d="M' + f1(x0 + nx * a0) + ' ' + f1(y0 + ny * a0) + 'Q' + f1(mx) + ' ' + f1(my) + ' ' +
        f1(x1 + nx * a1) + ' ' + f1(y1 + ny * a1) + '" stroke-width="' + f2(sw) + '" stroke-dasharray="' +
        f1(d1) + ' ' + f1(g1) + ' ' + f1(d2) + ' ' + f1(g2) + ' 1000" opacity="' + f2(o) + '"/>';
    }
    return g;
  }

  // Two short lines beside a mark, on the side away from the staff and
  // pulled inside the phone crop, so a label never runs behind the staff or
  // off a phone's first screen. Pulled back over a risen sun's disc, it
  // moves to the staff's side instead; over a glow it may stay.
  function label(x, y, lines, gap, mayCover) {
    var width = Math.max.apply(null, lines.map(function (l) { return l.length; })) * 6.6;
    var lo = PHONE_CROP.x + 4, hi = PHONE_CROP.x + PHONE_CROP.w - 4;
    var side = x > SCENE.cx ? 1 : -1;
    var at = side > 0 ? Math.min(x + gap, hi - width) : Math.max(x - gap, lo + width);
    if (!mayCover && Math.abs(at - (x + side * gap)) > 0.05) { side = -side; at = x + side * gap; }
    var anchor = side > 0 ? 'start' : 'end';
    return lines.map(function (l, i) {
      return '<text class="tiny" x="' + f1(at) + '" y="' + f1(y + i * 18) + '" text-anchor="' + anchor + '">' + l + '</text>';
    }).join('');
  }

  // --- the scene ---

  function seasonArcs(place, days, facing) {
    var g = '';
    days.forEach(function (day) {
      var t0 = localMidnight(day.date, place.tzMin);
      var runs = aboveRuns(daySamples(place, t0, 15), place, t0, 0);
      var d = runs.map(function (run) {
        return splitAtSeam(run.map(function (p) { return { x: skyX(p.az, facing), y: skyY(p.alt) }; })).map(relPath).join('');
      }).join('');
      if (!d) return;
      g += day.color
        ? '<path class="season-arc" style="stroke:' + day.color + '" d="' + d + '"/>'
        : '<path class="season-arc unseen" d="' + d + '"/>';
    });
    return g;
  }

  function sunMark(i) {
    var r = SCENE.sunR, x = f1(i.x);
    if (i.up) {
      var y = f1(i.y), n = Math.round(i.alt);
      return '<circle class="sun-halo" cx="' + x + '" cy="' + y + '" r="' + f1(r * 2.4) + '"/>' +
        '<circle class="sun" cx="' + x + '" cy="' + y + '" r="' + r + '"/>' +
        label(i.x, i.y - 4, ['the sun at the instant', n ? n + '° up' : 'on the horizon'], r + 8);
    }
    var below = Math.round(-i.alt);
    var lo = PHONE_CROP.x, hi = PHONE_CROP.x + PHONE_CROP.w;
    var behind = i.x < lo || i.x > hi;
    var gx = behind ? (i.x < lo ? lo + r : hi - r) : i.x;
    var depth = (below ? below + '°' : 'just') + ' below the horizon';
    return '<ellipse class="glow" cx="' + f1(gx) + '" cy="' + SCENE.hy + '" rx="' + r * 7 + '" ry="' + f1(r * 2.2) + '" fill="url(#tl-glow)"/>' +
      '<circle class="sun-below" cx="' + f1(gx) + '" cy="' + f1(SCENE.hy + 4 + r) + '" r="' + r + '"/>' +
      label(gx, SCENE.hy + 2 * r + 22, ['the sun at the instant', (behind ? 'behind you, ' : '') + depth], 10, true);
  }

  // The day's own layer: what changes when the player scrubs a day or draws
  // the reader's place. The scene wraps it in <g class="day">.
  function dayLayer(geo) {
    var g = '', c = SCENE;
    geo.arc.forEach(function (run) { g += '<path class="sunpath" d="' + relPath(run) + '"/>'; });
    geo.hours.forEach(function (h) {
      g += '<circle class="sundot" cx="' + f1(h.x) + '" cy="' + f1(h.y) + '" r="2.4"/>' +
        '<text class="hour" x="' + f1(h.x) + '" y="' + f1(h.y - 8) + '" text-anchor="middle">' + h.hour + '</text>';
    });
    if (geo.instant) g += sunMark(geo.instant);

    var rnd = prng(7), ground = '';
    geo.hours.forEach(function (h) {
      if (h.gx === undefined) return;
      ground += '<g class="hr" data-m="' + h.m + '">' +
        dry(rnd, c.cx, c.by, h.gx, h.gy, c.wBase, 1.4, 0.45 + 0.5 * Math.min(1, h.alt / 40), 'hair') +
        '<circle class="tip" cx="' + f1(h.gx) + '" cy="' + f1(h.gy) + '" r="2.4"/></g>';
    });
    if (geo.instant && geo.instant.gx !== undefined) {
      ground += '<g class="hr inst" data-m="' + Math.round(geo.instant.m) + '">' +
        dry(rnd, c.cx, c.by, geo.instant.gx, geo.instant.gy, c.wBase + 2, 2, 1, 'hair-seal') + '</g>';
    }
    geo.tips.forEach(function (run) { ground += '<path class="trace" d="' + relPath(run) + '"/>'; });
    if (ground) g += '<g class="ground" clip-path="url(#tl-ground)">' + ground + '</g>';

    if (geo.photo && !geo.photo.night) {
      g += '<circle class="sc-sun" cx="' + f1(geo.photo.x) + '" cy="' + f1(geo.photo.y) + '" r="' + c.sunR + '"/>';
    }
    return g;
  }

  // The item-grade 金剛杖 from the prototype: grained wooden shaft, the
  // five-ring gorinto top, a brocade cover tied with a cord, a brass bell.
  var STAFF_DEFS = (function () {
    var w = Math.max(3.6, SCENE.staffH * 0.036), p = f1(w * 0.9);
    return '<linearGradient id="tl-w" x1="0" x2="1"><stop offset="0" stop-color="#3b2717"/><stop offset=".38" stop-color="#a07a4e"/><stop offset=".55" stop-color="#c9a678"/><stop offset="1" stop-color="#4a3120"/></linearGradient>' +
      '<linearGradient id="tl-c" x1="0" x2="1"><stop offset="0" stop-color="#5b4430"/><stop offset=".45" stop-color="#d8bd8e"/><stop offset="1" stop-color="#4d3826"/></linearGradient>' +
      '<pattern id="tl-b" width="' + p + '" height="' + p + '" patternUnits="userSpaceOnUse"><rect width="' + p + '" height="' + p + '" fill="#4b2a4f"/>' +
      '<path d="M' + f1(w * 0.45) + ' ' + f1(w * 0.08) + 'L' + f1(w * 0.82) + ' ' + f1(w * 0.45) + 'L' + f1(w * 0.45) + ' ' + f1(w * 0.82) + 'L' + f1(w * 0.08) + ' ' + f1(w * 0.45) + 'Z" fill="#c9a24a" opacity=".85"/></pattern>' +
      '<linearGradient id="tl-s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".45" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>' +
      '<radialGradient id="tl-g" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#d4a640"/><stop offset="1" stop-color="#6b4a12"/></radialGradient>';
  })();

  function staffItem(cx, cy, H) {
    var w = Math.max(3.6, H * 0.036), top = cy - H;
    var capH = H * 0.15, capBot = top + capH, clothTop = capBot, clothBot = capBot + H * 0.16;
    var L = cx - w / 2, R = cx + w / 2;
    var g = '<ellipse class="ink" cx="' + cx + '" cy="' + f1(cy + 1.5) + '" rx="' + f1(w * 2.6) + '" ry="' + f1(w * 0.7) + '" opacity=".35"/>';
    g += '<path d="M' + f1(L + w * 0.08) + ' ' + f1(cy) + 'L' + f1(L) + ' ' + f1(clothBot) + 'L' + f1(R) + ' ' + f1(clothBot) + 'L' + f1(R - w * 0.08) + ' ' + f1(cy) + 'Z" fill="url(#tl-w)"/>';
    for (var i = 0; i < 3; i++) {
      g += '<line x1="' + f1(L + w * (0.25 + i * 0.22)) + '" y1="' + f1(clothBot + 4) + '" x2="' + f1(L + w * (0.3 + i * 0.2)) + '" y2="' + f1(cy - 3) + '" stroke="#2b1b10" stroke-width=".5" opacity=".35"/>';
    }
    var cw = w * 1.45;
    var cloth = 'M' + f1(cx - cw / 2) + ' ' + f1(clothTop) + 'L' + f1(cx + cw / 2) + ' ' + f1(clothTop) + 'L' + f1(cx + cw / 2 + w * 0.1) + ' ' + f1(clothBot) +
      'Q' + f1(cx) + ' ' + f1(clothBot + w * 0.5) + ' ' + f1(cx - cw / 2 - w * 0.1) + ' ' + f1(clothBot) + 'Z';
    g += '<path d="' + cloth + '" fill="url(#tl-b)"/><path d="' + cloth + '" fill="url(#tl-s)"/>';
    var tie = clothTop + (clothBot - clothTop) * 0.62;
    g += '<path d="M' + f1(cx - cw / 2 - 0.5) + ' ' + f1(tie) + 'Q' + f1(cx) + ' ' + f1(tie + w * 0.35) + ' ' + f1(cx + cw / 2 + 0.5) + ' ' + f1(tie) + '" stroke="#d6b45c" stroke-width="' + f2(Math.max(0.9, w * 0.22)) + '" fill="none"/>';
    var bx = cx + cw / 2 + w * 0.15, by = tie + H * 0.055;
    g += '<g class="bell" style="transform-origin:' + f1(cx + cw / 2) + 'px ' + f1(tie) + 'px">' +
      '<path d="M' + f1(cx + cw / 2) + ' ' + f1(tie) + 'Q' + f1(bx + w * 0.4) + ' ' + f1(tie + H * 0.02) + ' ' + f1(bx) + ' ' + f1(by - w * 0.55) + '" stroke="#d6b45c" stroke-width="' + f2(Math.max(0.7, w * 0.15)) + '" fill="none"/>' +
      '<circle cx="' + f1(bx) + '" cy="' + f1(by) + '" r="' + f1(w * 0.62) + '" fill="url(#tl-g)"/>' +
      '<line x1="' + f1(bx - w * 0.45) + '" y1="' + f1(by + w * 0.1) + '" x2="' + f1(bx + w * 0.45) + '" y2="' + f1(by + w * 0.1) + '" stroke="#4a3208" stroke-width="' + f2(Math.max(0.5, w * 0.08)) + '"/></g>';
    // Gorinto, bottom to top: square, sphere, triangle, crescent, jewel.
    var seg = capH / 5.2, y = capBot;
    g += '<rect x="' + f1(L - w * 0.05) + '" y="' + f1(y - seg) + '" width="' + f1(w * 1.1) + '" height="' + f1(seg) + '" fill="url(#tl-c)"/>'; y -= seg;
    g += '<ellipse cx="' + cx + '" cy="' + f1(y - seg * 0.55) + '" rx="' + f1(w * 0.62) + '" ry="' + f1(seg * 0.6) + '" fill="url(#tl-c)"/>'; y -= seg * 1.1;
    g += '<path d="M' + f1(L - w * 0.08) + ' ' + f1(y) + 'L' + f1(cx) + ' ' + f1(y - seg * 1.05) + 'L' + f1(R + w * 0.08) + ' ' + f1(y) + 'Z" fill="url(#tl-c)"/>'; y -= seg * 1.05;
    g += '<path d="M' + f1(L) + ' ' + f1(y - seg * 0.55) + 'Q' + f1(cx) + ' ' + f1(y + seg * 0.25) + ' ' + f1(R) + ' ' + f1(y - seg * 0.55) + 'L' + f1(R - w * 0.12) + ' ' + f1(y) + 'L' + f1(L + w * 0.12) + ' ' + f1(y) + 'Z" fill="url(#tl-c)"/>'; y -= seg * 0.55;
    g += '<path d="M' + f1(L + w * 0.1) + ' ' + f1(y) + 'Q' + f1(L - w * 0.05) + ' ' + f1(y - seg * 0.6) + ' ' + f1(cx) + ' ' + f1(y - seg * 1.5) + 'Q' + f1(R + w * 0.05) + ' ' + f1(y - seg * 0.6) + ' ' + f1(R - w * 0.1) + ' ' + f1(y) + 'Z" fill="url(#tl-c)"/>';
    for (var j = 0; j < 4; j++) {
      var ny = capBot - seg * (1 + j * 0.95);
      g += '<line x1="' + f1(L - w * 0.08) + '" x2="' + f1(R + w * 0.08) + '" y1="' + f1(ny) + '" y2="' + f1(ny) + '" stroke="#2b1b10" stroke-width=".7" opacity=".7"/>';
    }
    g += '<rect x="' + f1(cx - w * 0.18) + '" y="' + f1(capBot - seg * 0.78) + '" width="' + f1(w * 0.36) + '" height="' + f1(seg * 0.5) + '" fill="#2b1b10" opacity=".55"/>';
    return '<g class="staff-item">' + g + '</g>';
  }

  // o: { place, date (the plate's day, local to the place), instant?, season:
  // seasonDays().days, facing?, label? }.
  function sceneSvg(o) {
    var c = SCENE;
    var geo = dayGeometry({ place: o.place, date: o.date, instant: o.instant, facing: o.facing });
    var aria = o.label || ('The sun\'s path on ' + longDate(o.date) + (o.place.name ? ' at ' + o.place.name : '') +
      ', and a pilgrim\'s staff with its shadow every hour');
    return '<svg class="tl-scene" xmlns="http://www.w3.org/2000/svg" viewBox="' + VIEWBOX + '" role="img" aria-label="' + aria + '">' +
      '<defs>' + STAFF_DEFS +
      '<radialGradient id="tl-glow"><stop offset="0" style="stop-color:var(--sun,#C98B2E)" stop-opacity=".5"/><stop offset="1" style="stop-color:var(--sun,#C98B2E)" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="tl-ground"><rect y="' + c.hy + '" width="' + c.w + '" height="' + (c.h - c.hy) + '"/></clipPath></defs>' +
      '<rect class="sc-wash" width="' + c.w + '" height="' + c.hy + '" fill="none"/>' +
      '<g class="season-arcs">' + seasonArcs(o.place, o.season || [], geo.facing) + '</g>' +
      '<line class="horizon" x1="0" y1="' + c.hy + '" x2="' + c.w + '" y2="' + c.hy + '"/>' +
      '<g class="day">' + dayLayer(geo) + '</g>' +
      '<line class="shadow-live" x1="' + c.cx + '" y1="' + c.by + '" x2="' + c.cx + '" y2="' + c.by + '" stroke-width="' + f1(c.wBase * 0.55) + '"/>' +
      '<circle class="sun-live" r="' + c.sunR + '" cx="-99" cy="-99"/>' +
      staffItem(c.cx, c.by, c.staffH) +
      '</svg>';
  }

  // --- the strip, seal, stamp and walk map ---

  // One bar per day of the season, stretched to whatever width the page
  // gives it. Photo bars carry their colour and photo time so the player
  // can rebuild the scrubbed day from the markup alone.
  function stripSvg(days) {
    if (!days.length || days.every(function (d) { return d.state === 'before'; })) return '';
    var W = 1200, H = 24, bw = W / days.length, g = '';
    days.forEach(function (d, i) {
      var x0 = f1(i * bw), x1 = f1((i + 1) * bw);
      if (d.color) {
        g += '<rect x="' + x0 + '" width="' + f1(x1 - x0 + 0.4) + '" height="' + H + '" fill="' + d.color + '" data-t="' + d.time + '"/>';
      } else {
        g += '<rect class="future' + (d.state === 'before' ? ' before' : '') + '" x="' + f1(x0 + 0.4) + '" width="' + f1(Math.max(x1 - x0 - 0.8, 0.4)) + '" height="' + H + '"/>';
      }
    });
    return '<svg class="tl-strip" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" data-start="' + days[0].date + '" aria-hidden="true">' + g + '</svg>';
  }

  function sealSvg(key) {
    var k = SEAL_KANJI[key];
    if (!k) throw new Error('unknown turning key: ' + key);
    return '<svg class="tl-seal" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 109" aria-hidden="true">' +
      '<rect class="seal-fill" width="70" height="108.5" rx="3"/>' +
      '<text class="seal-text" x="35" y="43.4" font-size="31.5" text-anchor="middle">' + k[0] + '</text>' +
      '<text class="seal-text" x="35" y="91" font-size="31.5" text-anchor="middle">' + k[1] + '</text></svg>';
  }

  function stampSvg(n, temple) {
    var c = 36, r = 34, kan = numberKanji(n);
    var size = f1(r * Math.min(0.62, 1.44 / kan.length));
    return '<svg class="tl-stamp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" aria-hidden="true">' +
      '<circle class="stamp-ring" cx="' + c + '" cy="' + c + '" r="' + r + '"/>' +
      '<circle class="stamp-ring thin" cx="' + c + '" cy="' + c + '" r="' + f1(r * 0.8) + '"/>' +
      '<text class="stamp-text" x="' + c + '" y="' + f1(c - r * 0.08) + '" font-size="' + size + '" text-anchor="middle">' + kan + '</text>' +
      '<text class="stamp-text" x="' + c + '" y="' + f1(c + r * 0.5) + '" font-size="' + f1(r * 0.3) + '" text-anchor="middle">' + temple.ja + '</text></svg>';
  }

  // temples: assets/sunpath/temples.json's list, in order; nextInstant: the
  // next turning, named by its UTC date like the pages are.
  function walkMapSvg(temples, n, nextInstant) {
    var W = 160, top = 4, mapH = 100;
    var lons = temples.map(function (t) { return t.lon; }), lats = temples.map(function (t) { return t.lat; });
    var lo0 = Math.min.apply(null, lons), lo1 = Math.max.apply(null, lons);
    var la0 = Math.min.apply(null, lats), la1 = Math.max.apply(null, lats);
    var kx = Math.cos((la0 + la1) / 2 * DEG), sc = Math.min((W - 8) / ((lo1 - lo0) * kx), mapH / (la1 - la0));
    var ox = (W - (lo1 - lo0) * kx * sc) / 2;
    var xy = function (t) { return [f1(ox + (t.lon - lo0) * kx * sc), f1(top + (la1 - t.lat) * sc)]; };
    var points = function (list) { return list.map(function (t) { return xy(t).join(','); }).join(' '); };
    var dot = function (t, cls, r) { var p = xy(t); return '<circle class="' + cls + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '"/>'; };
    var next = temples[n % TEMPLES];
    var g = '<polyline class="walk-all" points="' + points(temples.concat([temples[0]])) + '"/>';
    temples.forEach(function (t) { g += dot(t, 'walk-dot', 1.5); });
    g += '<polyline class="walk-done" points="' + points(temples.slice(0, n)) + '"/>';
    g += dot(temples[n - 1], 'walk-now', 4.2) + dot(next, 'walk-next', 4);
    [('Temple ' + n + ' of ' + TEMPLES), 'next, ' + next.name, 'on ' + longDate(isoDate(+nextInstant))].forEach(function (l, i) {
      g += '<text class="walk-label" x="' + W / 2 + '" y="' + (124 + i * 18) + '" text-anchor="middle">' + l + '</text>';
    });
    return '<svg class="tl-walk" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' 168" role="img" aria-label="The walk around the 88 temples: Temple ' +
      n + ' of 88, next ' + next.name + '">' + g + '</svg>';
  }

  var api = {
    TURNINGS: TURNINGS,
    SEAL_KANJI: SEAL_KANJI,
    WALK_START_YEAR: WALK_START_YEAR,
    TEMPLE_TZ_MIN: TEMPLE_TZ_MIN,
    PHOTOS_BEGIN: PHOTOS_BEGIN,
    SCENE: SCENE,
    VIEWBOX: VIEWBOX,
    PHONE_CROP: PHONE_CROP,
    // walk
    walkIndex: walkIndex,
    templeNumber: templeNumber,
    numberKanji: numberKanji,
    templePlace: templePlace,
    // days
    localDate: localDate,
    localMidnight: localMidnight,
    plateDay: plateDay,
    seasonDates: seasonDates,
    seasonDays: seasonDays,
    dayLabel: dayLabel,
    longDate: longDate,
    // sun and scene geometry
    sunAltAz: sunAltAz,
    facingFor: facingFor,
    skyX: skyX,
    skyY: skyY,
    groundXY: groundXY,
    dayGeometry: dayGeometry,
    photoLine: photoLine,
    // markup
    sceneSvg: sceneSvg,
    dayLayer: dayLayer,
    seasonArcs: seasonArcs,
    stripSvg: stripSvg,
    sealSvg: sealSvg,
    stampSvg: stampSvg,
    walkMapSvg: walkMapSvg
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TurningLeafCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
