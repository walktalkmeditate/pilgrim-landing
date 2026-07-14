/* /seek — the page is a small seeking.
   Everything happens here in the browser. The word never leaves the page. */

(function () {
  'use strict';

  var html = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Seed: word + moment, one-way, local ----------

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
      s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
      s ^= s >>> 16;
      return (s >>> 0) / 4294967296;
    };
  }

  var REVEAL_LINES = [
    'What you seek is also walking toward you.',
    'The fog was never hiding it. It was holding it.',
    'You did not choose this place. That is why it could find you.',
    'Stillness is the oldest way of arriving.',
    'Not every clearing is an answer. Some are doors.',
    'The way onward begins where choosing ends.',
    'You brought the light with you. The hour only colored it.',
    'What is found in fog is kept differently.',
    'Even a small unknown, met fully, is enough.',
    'The path knew before you did.',
    'Some things can only be reached at walking speed.',
    'You were still. The world came the rest of the way.',
    'A clearing is the fog’s way of breathing.',
    'What you whispered has been walking with you.',
    'Nothing was revealed. Something was remembered.',
    'The door was never locked. It was waiting.'
  ];

  // A few words carry their own waiting lines. Undocumented — found only
  // by whispering them.
  var SECRET_LINES = {
    'nothing': 'Nothing was sought. Something was found anyway.',
    'fog': 'You sought the fog inside the fog. It was here all along.',
    'home': 'Every clearing is a doorstep. Welcome back.',
    'the way': 'The way was never lost. Only quiet.',
    'way': 'The way was never lost. Only quiet.',
    'pilgrim': 'A pilgrim is anyone who walks like this.',
    'the unknown': 'It knows you now.'
  };

  // ---------- Elements ----------

  var path = document.getElementById('path');
  var clearing = document.getElementById('clearing');
  var clearingCard = document.getElementById('clearing-card');
  var crescent = document.getElementById('crescent');
  var stillnessFill = document.getElementById('stillness-fill');
  var stillnessFallback = document.getElementById('stillness-fallback');
  var form = document.getElementById('intention-form');
  var wordInput = document.getElementById('intention-word');
  var soundToggle = document.getElementById('sound-toggle');
  var hourCycle = document.getElementById('hour-cycle');
  var hourName = document.getElementById('hour-name');

  var RING_LENGTH = 175.93;
  var ARC_LENGTH = 113.1;
  // Three fog-breaths, three seconds each (see fog-breath in seek.css).
  var STILLNESS_MS = reducedMotion ? 1800 : 9000;

  // ---------- State ----------

  var seeking = {
    word: 'the unknown',
    startedAt: null,
    minuteStamp: '',
    rng: null,
    clearingFraction: 0.72,
    lineText: '',
    revealed: false,
    begun: false
  };

  // ---------- The hour's light ----------

  var HOUR_ORDER = ['day', 'golden', 'night'];
  var naturalLabel = html.dataset.hourLabel || 'day';

  function hourLabel() {
    if (html.dataset.hour === 'golden') {
      return html.dataset.hourOverridden ? 'dusk' : naturalLabel;
    }
    return html.dataset.hour;
  }

  function refreshHourText() {
    var label = hourLabel();
    hourName.textContent = label;
    document.querySelectorAll('.clearing-hour').forEach(function (el) {
      el.textContent = label;
    });
  }

  hourCycle.addEventListener('click', function () {
    var next = HOUR_ORDER[(HOUR_ORDER.indexOf(html.dataset.hour) + 1) % HOUR_ORDER.length];
    html.dataset.hour = next;
    html.dataset.hourOverridden = 'true';
    refreshHourText();
  });

  refreshHourText();

  // ---------- Sound ----------

  var audio = {
    ctx: null,
    ping: null,
    bowl: null,
    enabled: false,
    pingTimer: null
  };

  function fetchBuffer(url) {
    return fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (b) { return audio.ctx.decodeAudioData(b); });
  }

  function enableSound() {
    if (audio.enabled) {
      audio.enabled = false;
      soundToggle.setAttribute('aria-pressed', 'false');
      stopPingLoop();
      return;
    }
    audio.enabled = true;
    soundToggle.setAttribute('aria-pressed', 'true');
    if (!audio.ctx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { audio.enabled = false; return; }
      audio.ctx = new Ctx();
      fetchBuffer('https://cdn.pilgrimapp.org/audio/seek/seek-ping.aac')
        .then(function (buf) { audio.ping = buf; });
      fetchBuffer('https://cdn.pilgrimapp.org/audio/seek/seek-bowl.aac')
        .then(function (buf) { audio.bowl = buf; });
    }
    if (audio.ctx.state === 'suspended') { audio.ctx.resume(); }
    if (seeking.begun && !seeking.revealed) { schedulePing(); }
  }

  function playBuffer(buffer, gainValue) {
    if (!audio.ctx || !buffer) { return; }
    var src = audio.ctx.createBufferSource();
    var gain = audio.ctx.createGain();
    gain.gain.value = gainValue;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(audio.ctx.destination);
    src.start();
  }

  function schedulePing() {
    stopPingLoop();
    if (!audio.enabled || !seeking.begun || seeking.revealed) { return; }
    var distance = distanceToClearing();
    playBuffer(audio.ping, pingGain(distance));
    audio.pingTimer = setTimeout(schedulePing, pingInterval(distance));
  }

  function stopPingLoop() {
    if (audio.pingTimer) {
      clearTimeout(audio.pingTimer);
      audio.pingTimer = null;
    }
  }

  function pingInterval(distance) {
    // distance is 0..1 of the path; near = fast heartbeat, far = slow
    var t = Math.min(Math.max(distance / 0.5, 0), 1);
    return 900 + t * 2100;
  }

  function pingGain(distance) {
    var t = Math.min(Math.max(distance / 0.5, 0), 1);
    return 0.10 + (1 - t) * 0.18;
  }

  soundToggle.addEventListener('click', enableSound);

  // ---------- Geometry ----------

  function pathRect() { return path.getBoundingClientRect(); }

  function clearingAbsY() {
    var rect = pathRect();
    return rect.top + window.scrollY + rect.height * seeking.clearingFraction;
  }

  function viewportCenterAbsY() {
    return window.scrollY + window.innerHeight / 2;
  }

  function distanceToClearing() {
    var rect = pathRect();
    return Math.abs(clearingAbsY() - viewportCenterAbsY()) / rect.height;
  }

  // ---------- Begin ----------

  function begin(word) {
    var cleaned = (word || '').trim().toLowerCase();
    seeking.word = cleaned || 'the unknown';
    seeking.startedAt = new Date();

    seeking.minuteStamp = seeking.startedAt.toISOString().slice(0, 16);
    seeking.rng = makeRng(fnv1a(seeking.word + '|' + seeking.minuteStamp));

    // Never earlier than 0.60: the stillness zone (±0.07) must stay clear
    // of the last waymark at 0.50, or its line bleeds through the card.
    seeking.clearingFraction = 0.60 + seeking.rng() * 0.25;
    var lineIndex = Math.floor(seeking.rng() * REVEAL_LINES.length);
    seeking.lineText = SECRET_LINES[seeking.word] || REVEAL_LINES[lineIndex];
    seeking.begun = true;
    seeking.revealed = false;

    clearing.style.top = (seeking.clearingFraction * 100) + '%';

    html.classList.add('seeking');
    html.classList.remove('revealed');

    document.getElementById('clearing-word').textContent = seeking.word;
    document.getElementById('clearing-line').textContent = seeking.lineText;

    var dateFmt = new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
    document.getElementById('clearing-date').textContent = dateFmt.format(seeking.startedAt);

    if (audio.enabled) { schedulePing(); }

    showCrescentHintOnce();
    path.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  var crescentHintShown = false;

  function showCrescentHintOnce() {
    if (crescentHintShown) { return; }
    crescentHintShown = true;
    var hint = document.getElementById('crescent-hint');
    hint.classList.add('showing');
    setTimeout(function () { hint.classList.remove('showing'); }, 6000);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    begin(wordInput.value);
  });

  // A visitor who simply scrolls past the door begins with the default word.
  var autoBeginObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && !seeking.begun) {
        begin(wordInput.value);
      }
      if (entry.isIntersecting) { autoBeginObserver.disconnect(); }
    });
  }, { rootMargin: '0px 0px -60% 0px' });
  autoBeginObserver.observe(path);

  // ---------- Waymarks ----------

  document.querySelectorAll('.waymark').forEach(function (mark) {
    mark.style.top = (parseFloat(mark.dataset.depth) * 100) + '%';
  });

  var waymarkObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add('seen'); }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.waymark').forEach(function (mark) {
    waymarkObserver.observe(mark);
  });

  // ---------- The crescent ----------

  function updateCrescent() {
    if (!seeking.begun || seeking.revealed) { return; }
    var delta = clearingAbsY() - viewportCenterAbsY();
    var distance = distanceToClearing();

    // Lean down the page toward what waits; up if it has been passed.
    var angle = delta >= 0 ? 90 : -90;
    crescent.style.setProperty('--crescent-angle', angle + 'deg');

    var closeness = 1 - Math.min(distance / 0.5, 1);
    var glow = 0.35 + closeness * 0.65;
    crescent.style.setProperty('--crescent-glow', glow.toFixed(2));

    // The span opens with proximity — a sliver of light far off, a
    // wide-open crescent at the clearing's edge. The dash is centered
    // on the circle's start point; the svg rotation aims it.
    var span = ARC_LENGTH * (0.12 + closeness * 0.55);
    var arc = document.getElementById('crescent-arc');
    arc.setAttribute('stroke-dasharray', span.toFixed(1) + ' ' + (ARC_LENGTH - span).toFixed(1));
    arc.setAttribute('stroke-dashoffset', (span / 2).toFixed(1));

    // The breath follows the pulse: one breath per ping.
    crescent.style.setProperty('--pulse-period', pingInterval(distance) + 'ms');

    // The fog thins and the world arrives as the clearing nears.
    var fogOpacity = 0.9 - closeness * 0.45;
    document.querySelector('.fog').style.setProperty('--fog-opacity', fogOpacity.toFixed(2));
    html.style.setProperty('--world-clarity', closeness.toFixed(2));
  }

  // ---------- Stillness ----------

  var ZONE_FRACTION = 0.07; // of path height, either side of the clearing

  var stillness = {
    inZone: false,
    fillStart: null,
    raf: null,
    idleTimer: null,
    zoneEnteredAt: null
  };

  function enterZone() {
    if (stillness.inZone || seeking.revealed) { return; }
    stillness.inZone = true;
    stillness.zoneEnteredAt = Date.now();
    html.classList.add('in-zone');
    if (reducedMotion) {
      stillness.idleTimer = setTimeout(reveal, STILLNESS_MS);
      return;
    }
    armStillness();
    setTimeout(function () {
      if (stillness.inZone && !seeking.revealed) {
        stillnessFallback.hidden = false;
      }
    }, 25000);
  }

  function leaveZone() {
    if (!stillness.inZone) { return; }
    stillness.inZone = false;
    html.classList.remove('in-zone');
    cancelFill();
    if (stillness.idleTimer) { clearTimeout(stillness.idleTimer); stillness.idleTimer = null; }
    stillnessFallback.hidden = true;
  }

  function armStillness() {
    cancelFill();
    stillness.idleTimer = setTimeout(startFill, 400);
  }

  function startFill() {
    stillness.fillStart = performance.now();
    html.classList.add('filling');
    function tick(now) {
      var t = Math.min((now - stillness.fillStart) / STILLNESS_MS, 1);
      stillnessFill.setAttribute('stroke-dashoffset', (RING_LENGTH * (1 - t)).toFixed(2));
      if (t >= 1) { reveal(); return; }
      stillness.raf = requestAnimationFrame(tick);
    }
    stillness.raf = requestAnimationFrame(tick);
  }

  function cancelFill() {
    if (stillness.raf) { cancelAnimationFrame(stillness.raf); stillness.raf = null; }
    if (stillness.idleTimer) { clearTimeout(stillness.idleTimer); stillness.idleTimer = null; }
    html.classList.remove('filling');
    stillnessFill.setAttribute('stroke-dashoffset', RING_LENGTH);
  }

  stillnessFallback.addEventListener('click', reveal);

  // ---------- Reveal ----------

  function reveal() {
    if (seeking.revealed) { return; }
    seeking.revealed = true;
    stopPingLoop();
    cancelFill();
    html.classList.add('revealed');
    html.classList.remove('in-zone');
    html.style.setProperty('--world-clarity', '1');
    playBuffer(audio.bowl, 0.5);
    clearingCard.focus({ preventScroll: true });
    if (window.umami) { window.umami.track('seek-reveal'); }
  }

  // ---------- Seek again ----------

  document.getElementById('again-btn').addEventListener('click', function () {
    html.classList.remove('revealed');
    seeking.begun = false;
    seeking.revealed = false;
    leaveZone();
    document.getElementById('arrival').scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth'
    });
    // A new moment reseeds on the next begin — same word, different seeking.
  });

  // ---------- Keepsake ----------

  document.getElementById('keepsake-btn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    document.fonts.ready.then(function () {
      drawKeepsake().then(function (blob) {
        var file = new File([blob], 'seek-clearing.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file] }).catch(function () {});
        } else {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'seek-clearing.png';
          a.click();
          URL.revokeObjectURL(a.href);
        }
        btn.disabled = false;
      });
    });
  });

  function paletteForHour() {
    var styles = getComputedStyle(html);
    return {
      paper: styles.getPropertyValue('--paper').trim(),
      paperDeep: styles.getPropertyValue('--paper-deep').trim(),
      ink: styles.getPropertyValue('--ink').trim(),
      inkSoft: styles.getPropertyValue('--ink-soft').trim(),
      inkFog: styles.getPropertyValue('--ink-fog').trim(),
      halo: styles.getPropertyValue('--halo').trim()
    };
  }

  function drawKeepsake() {
    var W = 1080, H = 1350;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var pal = paletteForHour();

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.paper);
    bg.addColorStop(1, pal.paperDeep);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var halo = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.55);
    halo.addColorStop(0, pal.halo + '66');
    halo.addColorStop(0.55, pal.halo + '22');
    halo.addColorStop(1, pal.halo + '00');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // The seeking's own shape: a seeded meander from the card's foot to
    // the halo — no two keepsakes ever share it.
    var pathRng = makeRng(fnv1a(seeking.word + '|' + seeking.minuteStamp + '|path'));
    var x = W * (0.3 + pathRng() * 0.4);
    var y = H * 0.9;
    var haloX = W / 2, haloY = H * 0.36;
    ctx.strokeStyle = pal.inkFog;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    var steps = 6;
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var targetY = y + (haloY - y) * t;
      var wander = (1 - t) * W * 0.16;
      var targetX = x + (haloX - x) * t + (pathRng() * 2 - 1) * wander;
      var controlX = x + (targetX - x) / 2 + (pathRng() * 2 - 1) * wander * 0.8;
      var controlY = (y + targetY) / 2;
      ctx.quadraticCurveTo(controlX, controlY, targetX, targetY);
      x = targetX;
      y = targetY;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';

    ctx.fillStyle = pal.inkFog;
    ctx.font = '300 26px Lato, sans-serif';
    ctx.fillText(('found under the ' + hourLabel() + ' light').toUpperCase(), W / 2, H * 0.22);

    ctx.fillStyle = pal.ink;
    ctx.font = 'italic 96px "Cormorant Garamond", serif';
    fitText(ctx, seeking.word, W * 0.86, 96);
    ctx.fillText(seeking.word, W / 2, H * 0.40);

    ctx.fillStyle = pal.inkSoft;
    ctx.font = 'italic 44px "Cormorant Garamond", serif';
    wrapText(ctx, seeking.lineText, W / 2, H * 0.55, W * 0.72, 60);

    var dateFmt = new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    ctx.fillStyle = pal.inkFog;
    ctx.font = '300 26px Lato, sans-serif';
    ctx.fillText(dateFmt.format(seeking.startedAt || new Date()), W / 2, H * 0.80);

    ctx.fillStyle = pal.inkFog;
    ctx.font = '300 24px Lato, sans-serif';
    ctx.fillText('pilgrimapp.org/seek', W / 2, H * 0.93);

    return new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/png');
    });
  }

  function fitText(ctx, text, maxWidth, startSize) {
    var size = startSize;
    while (ctx.measureText(text).width > maxWidth && size > 40) {
      size -= 4;
      ctx.font = 'italic ' + size + 'px "Cormorant Garamond", serif';
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    words.forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = test;
      }
    });
    ctx.fillText(line, x, y);
  }

  // ---------- Night stars ----------
  // Seeded from a fixed word so the sky is the same for everyone;
  // shown only under the night palette (see .stars in seek.css).

  (function sowStars() {
    var starRng = makeRng(fnv1a('the night sky over the seek'));
    var container = document.getElementById('stars');
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < 48; i++) {
      var star = document.createElement('span');
      star.className = 'star';
      star.style.left = (starRng() * 100).toFixed(1) + '%';
      star.style.top = (starRng() * 72).toFixed(1) + '%';
      var size = 1 + starRng() * 1.8;
      star.style.width = size.toFixed(1) + 'px';
      star.style.height = size.toFixed(1) + 'px';
      star.style.setProperty('--twinkle', (2.5 + starRng() * 5).toFixed(1) + 's');
      star.style.animationDelay = (starRng() * 5).toFixed(1) + 's';
      fragment.appendChild(star);
    }
    container.appendChild(fragment);
  })();

  // ---------- Scroll loop ----------

  var scrollScheduled = false;

  function onScroll() {
    if (!scrollScheduled) {
      scrollScheduled = true;
      requestAnimationFrame(function () {
        scrollScheduled = false;
        if (!seeking.begun || seeking.revealed) { return; }
        updateCrescent();
        var rect = pathRect();
        var inZone = Math.abs(clearingAbsY() - viewportCenterAbsY()) < rect.height * ZONE_FRACTION;
        if (inZone) {
          if (!stillness.inZone) { enterZone(); }
          else if (!reducedMotion) { armStillness(); }
        } else {
          leaveZone();
        }
      });
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
})();
