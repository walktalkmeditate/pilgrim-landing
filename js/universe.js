(function () {
  'use strict';

  var canvas = null;
  var ctx = null;
  var rafId = null;
  var listeners = [];
  var lastFrameTime = 0;
  var isActive = false;

  var mouseRatioX = 0;
  var mouseRatioY = 0;
  var scrollY = 0;

  var stars = [];
  var sprites = {};
  var spritesBuilt = false;

  var shootingStar = null;
  var nextShootingStarAt = 0;

  var trailParticles = [];
  var lastMouseX = -1;
  var lastMouseY = -1;
  var TRAIL_MAX = 60;
  var TRAIL_SPAWN_DIST = 10;

  var hoverX = -9999;
  var hoverY = -9999;
  var HOVER_RADIUS = 80;

  var ripples = [];

  var reducedMotion = false;
  var hasMouse = false;
  var hasTouch = false;

  var pendingClickAttach = null;

  var LAYERS = [
    { name: 'far',  count: 150, rMax: 1.0, depth: 0.2 },
    { name: 'mid',  count: 80,  rMax: 1.5, depth: 0.5 },
    { name: 'near', count: 30,  rMax: 2.5, depth: 1.0 }
  ];

  var TINT_COOL = [232, 224, 255];
  var TINT_WARM = [255, 232, 220];

  function makeStarSprite(maxRadius, rgb) {
    var size = Math.ceil(maxRadius * 4);
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var sctx = c.getContext('2d');
    var center = size / 2;
    var grad = sctx.createRadialGradient(center, center, 0, center, center, maxRadius * 2);
    var rgbStr = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    grad.addColorStop(0, 'rgba(' + rgbStr + ',1)');
    grad.addColorStop(0.3, 'rgba(' + rgbStr + ',0.6)');
    grad.addColorStop(1, 'rgba(' + rgbStr + ',0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, size, size);
    return c;
  }

  function buildSprites() {
    sprites = {};
    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i];
      sprites[L.name + '_cool'] = makeStarSprite(L.rMax, TINT_COOL);
      sprites[L.name + '_warm'] = makeStarSprite(L.rMax, TINT_WARM);
    }
    spritesBuilt = true;
  }

  function detectEnv() {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  function buildStars() {
    stars = [];
    var densityMul = hasTouch ? 0.5 : 1;
    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i];
      var n = Math.round(L.count * densityMul);
      for (var j = 0; j < n; j++) {
        stars.push({
          layer: L.name,
          depth: L.depth,
          xNorm: Math.random(),
          yNorm: Math.random(),
          baseAlpha: 0.4 + Math.random() * 0.5,
          warm: Math.random() < 0.1,
          phase: Math.random() * Math.PI * 2,
          period: 3000 + Math.random() * 4000
        });
      }
    }
  }

  function onMouseMoveParallax(e) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    mouseRatioX = (e.clientX - w / 2) / (w / 2);
    mouseRatioY = (e.clientY - h / 2) / (h / 2);
  }

  function onScrollParallax() {
    scrollY = window.scrollY || window.pageYOffset || 0;
  }

  function onMouseMoveHover(e) {
    hoverX = e.clientX;
    hoverY = e.clientY;
  }

  function onClickRipple(e) {
    var x = e.clientX;
    var y = e.clientY;
    var now = performance.now();
    ripples.push({
      x: x,
      y: y,
      tStart: now,
      duration: 700
    });
    var w = window.innerWidth;
    var h = window.innerHeight;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var sx = s.xNorm * w + mouseRatioX * s.depth * 12;
      var sy = s.yNorm * h + mouseRatioY * s.depth * 12 + scrollY * s.depth * 0.05;
      var dx = sx - x;
      var dy = sy - y;
      if (dx * dx + dy * dy < 400) {
        s.burstUntil = now + 1000;
      }
    }
  }

  function drawRipples() {
    if (!ripples.length) return;
    for (var i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i];
      var t = lastFrameTime - r.tStart;
      if (t >= r.duration) {
        ripples.splice(i, 1);
        continue;
      }
      var progress = t / r.duration;
      var alpha = (1 - progress) * 0.4;
      if (reducedMotion) {
        ctx.fillStyle = 'rgba(232,224,255,' + alpha + ')';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 12, 0, Math.PI * 2);
        ctx.fill();
      } else {
        var radius = 80 * progress;
        ctx.strokeStyle = 'rgba(232,224,255,' + alpha + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawStars() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var t = lastFrameTime;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var sprite = sprites[s.layer + (s.warm ? '_warm' : '_cool')];
      var breath = reducedMotion ? 1 : (0.8 + 0.2 * Math.sin((t / s.period) * Math.PI * 2 + s.phase));
      var offsetX = mouseRatioX * s.depth * 12;
      var offsetY = mouseRatioY * s.depth * 12 + scrollY * s.depth * 0.05;
      var x = s.xNorm * w + offsetX;
      var y = s.yNorm * h + offsetY;
      var hoverBoost = 1;
      if (hoverX !== -9999) {
        var dx = x - hoverX;
        var dy = y - hoverY;
        var hoverDist = Math.sqrt(dx * dx + dy * dy);
        if (hoverDist < HOVER_RADIUS) {
          hoverBoost = 1 + (1 - hoverDist / HOVER_RADIUS) * 1.5;
        }
      }
      var burstBoost = 1;
      if (s.burstUntil && s.burstUntil > t) {
        var burstK = (s.burstUntil - t) / 1000;
        burstBoost = 1 + burstK * 1.5;
      }
      ctx.globalAlpha = Math.min(s.baseAlpha * breath * hoverBoost * burstBoost, 1);
      ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function scheduleShootingStar(now) {
    nextShootingStarAt = now + 18000 + Math.random() * 17000;
  }

  function spawnShootingStar(now) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var fromLeft = Math.random() < 0.5;
    var startX = fromLeft ? -50 : w + 50;
    var startY = Math.random() * h * 0.5;
    var dx = (fromLeft ? 1 : -1) * (w * 0.6);
    var dy = h * 0.4;
    shootingStar = {
      x0: startX,
      y0: startY,
      dx: dx,
      dy: dy,
      tStart: now,
      duration: 700
    };
  }

  function drawShootingStar() {
    if (!shootingStar) return;
    var t = lastFrameTime - shootingStar.tStart;
    if (t < 0) return;
    var progress = t / shootingStar.duration;
    if (progress >= 1) {
      shootingStar = null;
      return;
    }
    var eased = 1 - Math.pow(1 - progress, 3);
    var hx = shootingStar.x0 + shootingStar.dx * eased;
    var hy = shootingStar.y0 + shootingStar.dy * eased;
    var len = 120;
    var ang = Math.atan2(shootingStar.dy, shootingStar.dx);
    var tx = hx - Math.cos(ang) * len;
    var ty = hy - Math.sin(ang) * len;
    var fade = 1 - progress;
    var grad = ctx.createLinearGradient(hx, hy, tx, ty);
    grad.addColorStop(0, 'rgba(255,255,255,' + (0.9 * fade) + ')');
    grad.addColorStop(1, 'rgba(232,224,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * fade) + ')';
    ctx.beginPath();
    ctx.arc(hx, hy, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function onMouseMoveTrail(e) {
    if (lastMouseX < 0) {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      return;
    }
    var dx = e.clientX - lastMouseX;
    var dy = e.clientY - lastMouseY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < TRAIL_SPAWN_DIST) return;
    var steps = Math.min(Math.floor(dist / TRAIL_SPAWN_DIST), 5);
    for (var i = 0; i < steps; i++) {
      var k = (i + 1) / steps;
      trailParticles.push({
        x: lastMouseX + dx * k,
        y: lastMouseY + dy * k,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 600 + Math.random() * 600,
        r: 1 + Math.random()
      });
    }
    while (trailParticles.length > TRAIL_MAX) trailParticles.shift();
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }

  function drawTrail(dt) {
    if (!trailParticles.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = trailParticles.length - 1; i >= 0; i--) {
      var p = trailParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        trailParticles.splice(i, 1);
        continue;
      }
      var k = p.life / p.maxLife;
      p.x += p.vx;
      p.y += p.vy;
      var alpha = (1 - k) * 0.6;
      var r = p.r * (1 - k * 0.5);
      ctx.fillStyle = 'rgba(232,224,255,' + alpha + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'universe-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    sizeCanvas();
  }

  function sizeCanvas() {
    if (!canvas) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var targetW = Math.floor(w * dpr);
    var targetH = Math.floor(h * dpr);
    if (canvas.width === targetW && canvas.height === targetH) return;
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function on(target, ev, fn, opts) {
    target.addEventListener(ev, fn, opts);
    listeners.push({ target: target, ev: ev, fn: fn, opts: opts });
  }

  function offAll() {
    for (var i = 0; i < listeners.length; i++) {
      var l = listeners[i];
      l.target.removeEventListener(l.ev, l.fn, l.opts);
    }
    listeners = [];
  }

  function loop(t) {
    rafId = requestAnimationFrame(loop);
    var dt = lastFrameTime ? Math.min(t - lastFrameTime, 100) : 16;
    lastFrameTime = t;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawStars();
    if (!reducedMotion && !shootingStar && t >= nextShootingStarAt) {
      spawnShootingStar(t);
      scheduleShootingStar(t);
    }
    drawShootingStar();
    drawTrail(dt);
    drawRipples();
  }

  function onVisibility() {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!rafId) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function activate() {
    if (isActive) return;
    isActive = true;
    ensureCanvas();
    sizeCanvas();
    canvas.style.display = 'block';
    detectEnv();
    if (!stars.length) buildStars();
    if (!spritesBuilt) buildSprites();
    on(window, 'resize', sizeCanvas);
    on(document, 'visibilitychange', onVisibility);
    if (hasMouse) {
      on(window, 'mousemove', onMouseMoveHover);
      if (!reducedMotion) {
        on(window, 'mousemove', onMouseMoveParallax);
        on(window, 'mousemove', onMouseMoveTrail);
      }
    }
    if (!reducedMotion) {
      on(window, 'scroll', onScrollParallax, { passive: true });
    }
    pendingClickAttach = setTimeout(function () {
      pendingClickAttach = null;
      on(window, 'click', onClickRipple);
    }, 0);
    if (!reducedMotion) scheduleShootingStar(performance.now());
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function deactivate() {
    if (!isActive) return;
    isActive = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (pendingClickAttach) {
      clearTimeout(pendingClickAttach);
      pendingClickAttach = null;
    }
    offAll();
    trailParticles = [];
    lastMouseX = -1;
    lastMouseY = -1;
    hoverX = -9999;
    hoverY = -9999;
    ripples = [];
    lastFrameTime = 0;
    shootingStar = null;
    nextShootingStarAt = 0;
    for (var bi = 0; bi < stars.length; bi++) stars[bi].burstUntil = 0;
    if (canvas) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      canvas.style.display = 'none';
    }
  }

  window.Universe = {
    activate: activate,
    deactivate: deactivate
  };
})();
