/* =============================================
   The turning leaf — the plate player

   Each solstice and equinox page opens on a plate the build drew with
   js/turning-leaf-core.js, whole without this file. This brings it alive
   and never blocks it:

   - the day replays once when the plate comes into view, and on "play the
     day": the strokes fade to ghosts, the sun travels its arc, one live
     shadow sweeps, each hour re-inks as the sun passes and the tip path
     draws, and the staff's bell swings at the turning instant (R11, R12);
   - the strip scrubs the season a day at a time (R14);
   - "draw it where I am" redraws the plate where the reader stands, asked
     only on that tap, never stored or sent (R15).

   One render function draws a day at the plate's place through the core;
   a small state machine (KTD9) picks the day. User input always wins over
   the replay. Nothing here fetches anything but the globe's own scripts.

   Tested in js/turning-leaf.test.js.
   ============================================= */

(function (root) {
  'use strict';

  var REPLAY_MS = 7000;
  var GHOST = '.12';
  var OFF = -99;
  var DAY_MS = 86400000;
  var SWING = [0, 22, -16, 10, -6, 3, 0].map(function (d) { return { transform: 'rotate(' + d + 'deg)' }; });
  var LOCATED = 'The staff stands where you are. Its strokes are its shadow at each hour of your day, by your own clock.';
  var UNLOCATED = 'Couldn’t read your location, so the staff stays at the temple.';
  var GLOBE_FAILED = 'The globe couldn’t load. The turning is drawn above.';

  function f1(n) { return Math.round(n * 10) / 10; }

  // A point along runs of {m, x, y} at minute m of the day, or null where
  // no run reaches (the sun down, or too low to cast a shadow).
  function at(runs, m) {
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r], i = 1;
      if (m < run[0].m || m > run[run.length - 1].m) continue;
      while (i < run.length - 1 && run[i].m < m) i++;
      var p = run[i - 1], q = run[i] || p, u = q.m > p.m ? (m - p.m) / (q.m - p.m) : 0;
      return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u };
    }
    return null;
  }

  // A tip path drawn as far as minute m.
  function upTo(run, m) {
    var pts = run.filter(function (p) { return p.m <= m; }), end = at([run], m);
    if (end) pts.push(end);
    return pts.length > 1 ? 'M' + pts.map(function (p) { return f1(p.x) + ' ' + f1(p.y); }).join('L') : '';
  }

  // A synthesised rin: a struck bowl's fundamental and inharmonic
  // partials, the high ones dying first.
  function chime(ctx) {
    var t = ctx.currentTime, out = ctx.createGain();
    out.gain.value = 0.18;
    out.connect(ctx.destination);
    [[880, 1], [2428, 0.45], [4752, 0.2], [1320, 0.25]].forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = p[0];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p[1], t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (p[0] < 1000 ? 3.2 : 1.9));
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 3.4);
    });
  }

  // The season's days, rebuilt from the strip's bars (one per day, in date
  // order). With no strip, every day came before the photos began.
  function seasonOf(C, tl, strip) {
    if (!strip) return C.seasonDays(new Date(tl.prev), new Date(tl.instant), []).days;
    var start = Date.parse(strip.getAttribute('data-start'));
    return Array.prototype.map.call(strip.querySelectorAll('rect'), function (bar, i) {
      var time = bar.getAttribute('data-t');
      return {
        date: new Date(start + i * DAY_MS).toISOString().slice(0, 10),
        color: time && bar.getAttribute('fill'),
        time: time,
        state: time ? 'photo' : /\bbefore\b/.test(bar.getAttribute('class')) ? 'before' : 'none'
      };
    });
  }

  function init() {
    var C = root.TurningLeafCore, doc = root.document;
    var plate = C && doc.querySelector('.tl-plate');
    if (!plate) return;

    function $(sel) { return plate.querySelector(sel); }
    var tl = JSON.parse(plate.getAttribute('data-tl'));
    var instant = new Date(tl.instant), temple = C.templePlace(tl.temple);
    var figure = $('.tl-figure'), caption = $('.tl-caption'), readout = $('.tl-readout'), quiet = $('.tl-quiet');
    var playBtn = $('.tl-play'), soundBtn = $('.tl-sound'), hereBtn = $('.tl-here'), backBtn = $('.tl-back');
    var stamp = $('.tl-stamp'), walk = $('.tl-walkwrap'), wrap = $('.tl-stripwrap');
    var strip = wrap && wrap.querySelector('.tl-strip');
    var days = seasonOf(C, tl, strip), last = days.length - 1;
    var turningText = $('.tl-when').textContent.replace(/\s+/g, ' ').trim();
    var kept = { figure: figure.innerHTML, caption: caption.innerHTML, here: hereBtn.textContent };

    // idle, replaying or scrubbing; `here` is set once located. `asked`
    // numbers location requests so only the latest one's answer counts.
    var mode = 'idle', shown = -1, frame = 0, here = null, asked = 0, audio = null, soundOn = false;

    function scene(sel) { return figure.querySelector(sel); }
    function reduced() { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; }

    // The reader's place on a day, in the device's own clock that day, so
    // hours stay right across a change to daylight saving.
    function placeFor(day) {
      if (!here) return temple;
      var ms = day ? Date.parse(day.date) + DAY_MS / 2 : +instant;
      return { lat: here.lat, lon: here.lon, tzMin: -new Date(ms).getTimezoneOffset(), where: 'reader' };
    }
    function dayOptions(day) {
      var place = placeFor(day);
      return day
        ? { place: place, date: day.date, photo: day.time }
        : { place: place, date: C.localDate(instant, place.tzMin), instant: instant };
    }

    // The one render: a scrubbed day, or the turning itself when no day is
    // given, at the plate's current place.
    function draw(day) {
      var geo = C.dayGeometry(dayOptions(day));
      scene('g.day').innerHTML = C.dayLayer(geo);
      scene('.sc-wash').style.fill = day && day.color ? day.color + '40' : '';
      return geo;
    }

    function value(i, text) {
      if (!wrap) return;
      wrap.setAttribute('aria-valuenow', i);
      wrap.setAttribute('aria-valuetext', text);
    }

    // Back to the turning with nothing moving: a replay snaps to its end
    // and a scrubbed day lets go.
    function still() {
      root.cancelAnimationFrame(frame);
      mode = 'idle';
      shown = -1;
      plate.classList.remove('is-replaying', 'is-scrubbing');
      var geo = draw(null), shadow = scene('.shadow-live'), sun = scene('.sun-live');
      shadow.setAttribute('x2', shadow.getAttribute('x1'));
      shadow.setAttribute('y2', shadow.getAttribute('y1'));
      sun.setAttribute('cx', OFF);
      sun.setAttribute('cy', OFF);
      readout.hidden = true;
      readout.textContent = '';
      backBtn.hidden = true;
      value(last, turningText);
      return geo;
    }
    function release() { if (mode !== 'idle') still(); }

    function ring() {
      if (!reduced()) scene('.bell').animate(SWING, { duration: 2600, easing: 'ease-out' });
      if (soundOn) chime(audio);
    }

    function play() {
      var geo = still(), arc = geo.arc, end = arc[arc.length - 1], inst = geo.instant.m;
      var hours = figure.querySelectorAll('.hr'), traces = figure.querySelectorAll('.trace');
      var sun = scene('.sun-live'), shadow = scene('.shadow-live');
      var x0 = shadow.getAttribute('x1'), y0 = shadow.getAttribute('y1');
      // From the earlier of the instant and sunrise to the later of the
      // instant and sunset, so the bell always swings inside the replay.
      var m0 = Math.min(inst, arc.length ? arc[0][0].m : inst);
      var m1 = Math.max(inst, end ? end[end.length - 1].m : inst);
      var t0 = null, rang = false;
      mode = 'replaying';
      plate.classList.add('is-replaying');
      hours.forEach(function (h) { h.style.opacity = GHOST; });

      function step(ts) {
        if (t0 === null) t0 = ts;
        var u = Math.min(1, (ts - t0) / REPLAY_MS), m = m0 + (m1 - m0) * u;
        if (!rang && m >= inst) { rang = true; ring(); }
        var s = at(arc, m) || { x: OFF, y: OFF }, tip = at(geo.tips, m);
        sun.setAttribute('cx', f1(s.x));
        sun.setAttribute('cy', f1(s.y));
        shadow.setAttribute('x2', tip ? f1(tip.x) : x0);
        shadow.setAttribute('y2', tip ? f1(tip.y) : y0);
        hours.forEach(function (h) { if (+h.getAttribute('data-m') <= m) h.style.opacity = ''; });
        traces.forEach(function (t, i) { t.setAttribute('d', upTo(geo.tips[i], m)); });
        if (u < 1) frame = root.requestAnimationFrame(step);
        else still();
      }
      frame = root.requestAnimationFrame(step);
    }

    function scrub(i) {
      i = Math.max(0, Math.min(last, i));
      if (mode === 'scrubbing' && i === shown) return;
      if (mode === 'replaying') still();
      mode = 'scrubbing';
      shown = i;
      plate.classList.add('is-scrubbing');
      var day = days[i], line = C.photoLine(day, draw(day).place).text;
      readout.textContent = line;
      readout.hidden = false;
      backBtn.hidden = false;
      value(i, line);
    }

    function located(coords) {
      release();
      here = coords;
      var o = dayOptions(null);
      o.season = days;
      figure.innerHTML = C.sceneSvg(o);
      quiet.textContent = C.dayGeometry(o).note || '';
      stamp.style.display = walk.style.display = 'none';
      caption.textContent = LOCATED;
      hereBtn.textContent = 'back to the temple';
      hereBtn.disabled = false;
      plate.classList.add('is-located');
    }

    function atTemple() {
      release();
      here = null;
      figure.innerHTML = kept.figure;
      stamp.style.display = walk.style.display = '';
      caption.innerHTML = kept.caption;
      hereBtn.textContent = kept.here;
      hereBtn.disabled = false;
      quiet.textContent = '';
      plate.classList.remove('is-located');
    }

    // The "your sky" pattern in js/sunpath.js: the last request issued
    // wins, failure is quiet, nothing is kept.
    function ask(locator) {
      var token = ++asked;
      hereBtn.textContent = 'looking…';
      hereBtn.disabled = true;
      quiet.textContent = '';
      locator.getCurrentPosition(function (pos) {
        if (token === asked) located({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }, function () {
        if (token !== asked) return;
        hereBtn.textContent = kept.here;
        hereBtn.disabled = false;
        quiet.textContent = UNLOCATED;
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    }

    playBtn.hidden = false;
    playBtn.addEventListener('click', play);
    backBtn.addEventListener('click', function () { release(); wrap.focus(); });

    var Ctx = root.AudioContext || root.webkitAudioContext;
    if (Ctx) {
      soundBtn.hidden = false;
      soundBtn.addEventListener('click', function () {
        soundOn = !soundOn;
        // Made inside the tap, the one moment iOS lets audio start.
        if (soundOn) { audio = audio || new Ctx(); audio.resume(); }
        soundBtn.setAttribute('aria-pressed', soundOn);
        soundBtn.textContent = soundOn ? 'sound on' : 'sound off';
      });
    }

    var locator = root.navigator && root.navigator.geolocation;
    if (locator) {
      hereBtn.hidden = false;
      hereBtn.addEventListener('click', function () { if (here) atTemple(); else ask(locator); });
    }

    if (wrap) {
      var dragging = false;
      var pick = function (e) {
        var r = strip.getBoundingClientRect();
        scrub(Math.floor((e.clientX - r.left) / r.width * days.length));
      };
      wrap.setAttribute('role', 'slider');
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('aria-label', 'The season’s days');
      wrap.setAttribute('aria-valuemin', '0');
      wrap.setAttribute('aria-valuemax', last);
      value(last, turningText);
      wrap.style.touchAction = 'pan-y';
      wrap.querySelector('.tl-strip-hint').hidden = false;
      wrap.addEventListener('pointerdown', function (e) { dragging = true; wrap.setPointerCapture(e.pointerId); pick(e); });
      wrap.addEventListener('pointermove', function (e) { if (dragging || e.pointerType === 'mouse') pick(e); });
      wrap.addEventListener('pointerup', function () { dragging = false; });
      wrap.addEventListener('pointercancel', function () { dragging = false; });
      // A finger's day stays after it lifts; only a mouse hands it back by leaving.
      wrap.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !dragging) release(); });
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') return release();
        var from = mode === 'scrubbing' ? shown : last;
        var to = { ArrowLeft: from - 1, ArrowDown: from - 1, ArrowRight: from + 1, ArrowUp: from + 1, Home: 0, End: last }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        scrub(to);
      });
    }

    // Any tap ends a replay, and a tap off the strip lets a scrubbed day go.
    doc.addEventListener('pointerdown', function (e) {
      if (mode === 'replaying' || (mode === 'scrubbing' && !wrap.contains(e.target))) still();
    });

    root.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      asked++;
      atTemple();
    });

    var view = new root.IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      view.disconnect();
      if (mode === 'idle' && !reduced()) play();
    }, { threshold: 0.5 });
    view.observe(figure);
  }

  // KTD11: the globe's scripts, named on its section, arrive in order once
  // the reader nears it. They need nothing from the core.
  function globe() {
    var doc = root.document, section = doc.querySelector('[data-lazy-scripts]');
    var plate = doc.querySelector('.tl-plate');
    if (!section || !plate) return;
    var tl = JSON.parse(plate.getAttribute('data-tl'));
    var srcs = section.getAttribute('data-lazy-scripts').trim().split(/\s+/);

    function add(i) {
      if (i === srcs.length) return;
      var s = doc.createElement('script');
      s.src = srcs[i];
      s.onload = function () { add(i + 1); };
      s.onerror = function () { section.querySelector('.sunpath-subsolar-caption').textContent = GLOBE_FAILED; };
      doc.head.appendChild(s);
    }

    var near = new root.IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      near.disconnect();
      // The instant js/sunpath.js freezes the globe at and turns it to face.
      root.__sunpathForce = { turning: tl.key, date: tl.instant };
      add(0);
    }, { rootMargin: '100% 0px' });
    near.observe(section);
  }

  var api = { init: init, globe: globe };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TurningLeaf = api;
  }

  // DOM glue, browser only: required into node for the tests, this file
  // must not look for a document that is not there.
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function start() { globe(); init(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
