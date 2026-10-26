/* The field — pure core: where the sun and moon stand, where the path
 * runs, where each blade grows, what colour the field wears. index.html
 * only; DOM-free, so js/hero-field-core.test.js runs it under node.
 *
 * The sky is honest but unlocated: the page never asks where you are. The
 * sun keeps your clock (noon at 12:00, 13:00 under daylight saving); the
 * moon keeps js/moon.js's real phase, which fixes its hour too — full is
 * highest at midnight, new at noon. Declination is ignored, so a body
 * stands roughly where you would find it, not to the degree.
 */

(function (root) {
  'use strict';

  var MOON_HALF_ARC_HOURS = 6.2;

  // Metres. The eye stands just above the grass, so the field reads as a
  // surface the wind crosses, and only far plumes stand against the sky.
  var EYE = 1.7;
  var D_NEAR = 0.7;
  var D_FAR = 95;
  var WALK_METRES = 5;

  // On the ground plane (x across, d away): left to right, a little away.
  var WIND = (function () { var l = Math.sqrt(1 + 0.24 * 0.24); return [1 / l, 0.24 / l]; })();
  var WIND_ANGLE = Math.atan2(WIND[1], WIND[0]);

  // The Seasons section's own swatch dots: the first for the stem, the warm
  // middle one for the plume (js/hero-field-wiring.test.js holds them).
  var SEASON_COLORS = {
    spring: { stem: '#8B9B7F', plume: '#C4A574' },
    summer: { stem: '#8BA06F', plume: '#D4A87A' },
    autumn: { stem: '#8B7355', plume: '#C47E50' },
    winter: { stem: '#7A7B80', plume: '#A09080' }
  };

  // The season's own field. Susuki plumes in autumn; young grass and almost
  // none in spring; summer lush, its plumes only beginning; winter's dry
  // stalks bowed over snow. Each brings what drifts through it: petals on
  // the spring wind, fireflies on summer nights, winter's snow.
  var SEASON_FIELDS = {
    spring: { plumeShare: 0.04, heightScale: 0.78, bow: 0, snow: false, particles: 'petals', count: 46 },
    summer: { plumeShare: 0.12, heightScale: 1.12, bow: 0, snow: false, particles: 'fireflies', count: 64 },
    autumn: { plumeShare: 0.42, heightScale: 1, bow: 0, snow: false, particles: null, count: 0 },
    winter: { plumeShare: 0.18, heightScale: 0.86, bow: 0.32, snow: true, particles: 'snow', count: 260 }
  };

  function seasonField(season) {
    return SEASON_FIELDS[season] || SEASON_FIELDS.autumn;
  }

  // Fireflies need the dark; the rest drift by day and night alike.
  function particlesFor(season, bodies) {
    var f = seasonField(season);
    if (!f.particles) return { kind: null, count: 0 };
    if (f.particles === 'fireflies' && bodies.sun.alt > -0.05) return { kind: null, count: 0 };
    return { kind: f.particles, count: f.count };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function wrapHours(h) {
    var w = ((h % 24) + 24) % 24;
    return w >= 12 ? w - 24 : w;
  }

  function dayOfYear(date) {
    var start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date - start) / 86400000);
  }

  // Hours by which the clock runs ahead of standard time today.
  function daylightSavingHours(date) {
    var y = date.getFullYear();
    var jan = new Date(y, 0, 1).getTimezoneOffset();
    var jul = new Date(y, 6, 1).getTimezoneOffset();
    return (Math.max(jan, jul) - date.getTimezoneOffset()) / 60;
  }

  // x01 runs east (left — the page faces south) to west; alt is 1 at the
  // top of the arc, 0 on the horizon, negative below it.
  function onArc(hourAngle, halfArc) {
    return {
      x01: 0.5 + 0.5 * clamp(hourAngle / halfArc, -1.25, 1.25) * 0.84,
      alt: Math.cos(clamp(hourAngle / halfArc, -2, 2) * Math.PI / 2),
      visible: Math.abs(hourAngle) < halfArc
    };
  }

  // `phase` is js/moon.js's getMoonPhase — one moon for the whole page.
  function skyBodies(date, phase) {
    var hours = date.getHours() + date.getMinutes() / 60;
    var noon = 12 + daylightSavingHours(date);
    var halfDay = 6 + 1.6 * Math.cos(2 * Math.PI * (dayOfYear(date) - 172) / 365);

    var moonTransit = noon + phase * 24;

    var sun = onArc(wrapHours(hours - noon), halfDay);
    var moon = onArc(wrapHours(hours - moonTransit), MOON_HALF_ARC_HOURS);
    moon.phase = phase;
    moon.illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    return { sun: sun, moon: moon };
  }

  // The light plumes catch as the wind turns them: gold from a low sun,
  // faint from a high one, at night the moon's — as bright as it is full.
  function sheenFor(bodies) {
    var sun = bodies.sun;
    var moon = bodies.moon;
    if (sun.alt > -0.08) {
      var low = 1 - clamp(sun.alt, 0, 1);
      return {
        rgb: [1.0, 0.86 - 0.16 * low, 0.62 - 0.26 * low],
        strength: 0.35 + 0.5 * low * low,
        warm: low
      };
    }
    var moonLight = moon.alt > 0 ? moon.illumination : 0;
    return {
      rgb: [0.92, 0.93, 0.97],
      strength: 0.18 + 0.42 * moonLight,
      warm: 0
    };
  }

  // In praise of shadows: a light shows itself in the dark it falls on.
  // The key light is the sun while it is up, else the moon while it is up
  // and lit, else nothing — and then the field is lit only by its own
  // lanterns and fireflies. A low light lays a lane across the grass
  // toward you and rims every stalk between; a high one barely does.
  function keyLight(bodies) {
    var sun = bodies.sun, moon = bodies.moon;
    if (sun.alt > -0.05) {
      return { kind: 'sun', x01: sun.x01, alt: Math.max(sun.alt, 0), strength: 1, low: 1 - clamp(sun.alt, 0, 1) };
    }
    if (moon.alt > 0 && moon.illumination > 0.05) {
      return { kind: 'moon', x01: moon.x01, alt: moon.alt, strength: 0.25 + 0.75 * moon.illumination, low: 1 - clamp(moon.alt, 0, 1) };
    }
    return { kind: null, x01: 0.5, alt: 0, strength: 0, low: 0 };
  }

  function fieldLight(key) {
    if (!key.kind) return { shadow: 0.78, lane: 0, rim: 0 };
    var reach = key.strength * (0.35 + 0.65 * key.low);
    return {
      shadow: key.kind === 'sun' ? 0.12 + 0.4 * key.low : 0.72 - 0.17 * key.strength,
      lane: reach,
      rim: reach * key.low
    };
  }

  // The ink wash at the top of the sky, as a fraction of the way to ink (or
  // to black at night), at a height y down the hero (0 its top). Strong at
  // the very top like the band in a woodblock print, gone by the horizon.
  var BOKASHI = { light: [0.42, 0.11], dark: [0.6, 0.16] };

  function bokashiAt(y01, dark) {
    var b = dark ? BOKASHI.dark : BOKASHI.light;
    return b[0] * Math.exp(-Math.max(0, y01) / b[1]);
  }

  function bokashiGlsl() {
    var f = glslFloat;
    return 'float bokashi(float y, float dark){ vec2 b = mix(vec2(' + f(BOKASHI.light[0]) + ', ' + f(BOKASHI.light[1]) +
      '), vec2(' + f(BOKASHI.dark[0]) + ', ' + f(BOKASHI.dark[1]) + '), dark); return b.x * exp(-max(0.0, y) / b.y); }';
  }

  // One curve, read twice: pathX clears the grass, and pathGlsl() gives the
  // shader the same numbers to leave the path as bare paper. Straight out
  // from under "begin walking" for eleven metres (the foot of a laptop's
  // hero), then right and back left until the grass closes over it.
  var PATH = { amp: 0.1, freq: 2.2, ref: 11, settleFrom: 11, settleOver: 6, half: 0.42, halfNear: 0.4, nearUntil: 16 };

  function pathX(d) {
    if (d <= 0) return 0;
    var settle = clamp((d - PATH.settleFrom) / PATH.settleOver, 0, 1);
    return d * PATH.amp * settle * Math.sin(PATH.freq * Math.log(d / PATH.ref));
  }

  function pathHalfWidth(d) {
    return PATH.half + PATH.halfNear * clamp(1 - d / PATH.nearUntil, 0, 1);
  }

  function inPath(x, d) {
    return Math.abs(x - pathX(d)) < pathHalfWidth(d);
  }

  // Negative inside the path. The verge is trodden low, or tall grass
  // hides the path and shows only the gap above it.
  function fromPath(x, d) {
    return Math.abs(x - pathX(d)) - pathHalfWidth(d);
  }

  // Your path wears in. Each local day you come back, the painted path
  // reaches farther toward the horizon and the verge is trodden wider, so
  // more of it shows between the grass; a first visit sees it as first
  // laid. Counted on this device only.
  function pathReach(days) {
    var worn = 1 - Math.exp(-Math.max(0, (days || 1) - 1) / 12);
    return { fadeFrom: 22 + 38 * worn, fadeTo: 40 + 40 * worn, verge: 1.6 + 1.1 * worn };
  }

  function localDay(date) {
    var m = date.getMonth() + 1, d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function countVisitDay(stored, today) {
    var days = stored && stored.days > 0 ? Math.floor(stored.days) : 0;
    if (!days) return { days: 1, last: today };
    return stored.last === today ? { days: days, last: today } : { days: days + 1, last: today };
  }

  function glslFloat(v) {
    var s = String(v);
    return s.indexOf('.') === -1 ? s + '.0' : s;
  }

  function pathGlsl() {
    var f = glslFloat;
    return 'float pathX(float d){ if (d <= 0.0) return 0.0;' +
      ' float settle = clamp((d - ' + f(PATH.settleFrom) + ') / ' + f(PATH.settleOver) + ', 0.0, 1.0);' +
      ' return d * ' + f(PATH.amp) + ' * settle * sin(' + f(PATH.freq) + ' * log(d / ' + f(PATH.ref) + ')); }' +
      'float pathHalf(float d){ return ' + f(PATH.half) + ' + ' + f(PATH.halfNear) +
      ' * clamp(1.0 - d / ' + f(PATH.nearUntil) + ', 0.0, 1.0); }';
  }

  // Below the hero's words, leaving room for the moon and tall plumes.
  function horizonFraction(contentBottomPx, heightPx) {
    if (!(heightPx > 0)) return 0.62;
    return clamp((contentBottomPx + 0.13 * heightPx + 40) / heightPx, 0.58, 0.8);
  }

  // A level camera, its image shifted so eye level lands on the horizon.
  // Upright screens widen the vertical field rather than letterbox it.
  function projection(widthPx, heightPx, horizonFrac) {
    var aspect = widthPx / heightPx;
    var tanHalfY = Math.max(Math.tan(20 * Math.PI / 180), Math.tan(19 * Math.PI / 180) / aspect);
    return {
      aspect: aspect,
      tanHalfY: tanHalfY,
      tanHalfX: tanHalfY * aspect,
      shift: 1 - 2 * horizonFrac
    };
  }

  // The ray stops at the grass tops, not the ground — the tops are what sit
  // under the cursor. Null above the horizon.
  function pointerOnField(px, py, widthPx, heightPx, proj, walked) {
    var nx = (px / widthPx) * 2 - 1;
    var ny = 1 - (py / heightPx) * 2 - proj.shift;
    if (ny > -0.004) return null;
    var dist = (EYE - 1.0) / (-ny * proj.tanHalfY);
    if (dist > 60) dist = 60;
    return { x: nx * proj.tanHalfX * dist, d: dist + (walked || 0) };
  }

  // Your movement is wind. Strength is speed in screens a second, so a
  // phone and a monitor agree, eased so a drift is a breath and a flick a
  // gust, and capped so no scribble flattens the field. Direction is the
  // way you travelled over the grass tops; a gust carries on past you at
  // part of that speed and fades.
  var PUFF_MAX = 0.92;
  var PUFF_TOP_SPEED = 28;

  function windStrength(screenSpeedPx, widthPx) {
    if (!(screenSpeedPx > 0) || !(widthPx > 0)) return 0;
    return PUFF_MAX * (1 - Math.exp(-(screenSpeedPx / widthPx) / 0.9));
  }

  function puffFromMove(from, to, dtSec, screenSpeedPx, widthPx) {
    var dt = Math.max(dtSec, 0.008);
    var vx = (to.x - from.x) / dt * 0.7;
    var vd = (to.d - from.d) / dt * 0.7;
    var speed = Math.sqrt(vx * vx + vd * vd);
    if (speed > PUFF_TOP_SPEED) { vx *= PUFF_TOP_SPEED / speed; vd *= PUFF_TOP_SPEED / speed; }
    return { x: to.x, d: to.d, vx: vx, vd: vd, s: windStrength(screenSpeedPx, widthPx), r: 0.7 + to.d * 0.045 };
  }

  // A scroll is a step along the path: the gust rises on it just ahead of
  // you and runs the way you are walking — away as you scroll down, back
  // toward you as you scroll up.
  function scrollPuff(deltaPx, dtSec, heightPx, walked) {
    var speed = Math.abs(deltaPx) / Math.max(dtSec, 0.008);
    var strength = PUFF_MAX * (1 - Math.exp(-(speed / heightPx) / 1.6));
    var d = (walked || 0) + 6;
    return { x: pathX(d), d: d, vx: 0, vd: (deltaPx > 0 ? 1 : -1) * (8 + 16 * strength), s: strength * 0.8, r: 2.4 };
  }

  // One frame of a gust: it travels, slows, spreads and weakens. False once
  // it is too faint to move a blade.
  function stepPuff(p, dtSec) {
    p.x += p.vx * dtSec;
    p.d += p.vd * dtSec;
    var drag = Math.exp(-dtSec * 1.4);
    p.vx *= drag;
    p.vd *= drag;
    p.s *= Math.exp(-dtSec / 0.7);
    p.r += dtSec * 0.8;
    return p.s > 0.02;
  }

  // What drifts through the field carries its own motion, so a gust blows
  // it rather than bending it and letting it spring back: each flake,
  // petal or firefly has a velocity that a gust accelerates and that then
  // settles back to the ambient wind — from wherever the gust left it.
  // Per particle: pos x, y, depth, size, extra (a petal's spin, a
  // firefly's glow); vel x, y, depth. A few hundred of them at most, so
  // this costs the CPU next to nothing.
  var DRIFTS = {
    snow: { top: 7, fall: 0.5, fallSpread: 0.5, wind: 0.9, sway: 0.35, swayRate: 0.8, gust: 4.5, lift: 0.4, settle: 1.4, size: 0.03, sizeSpread: 0.03, near: 2.5, span: 34 },
    petals: { top: 5, fall: 0.22, fallSpread: 0.25, wind: 2, sway: 0.6, swayRate: 1.3, gust: 7, lift: 0.8, settle: 2.4, size: 0.05, sizeSpread: 0.035, near: 2.5, span: 34 },
    fireflies: { low: 0.6, high: 1.6, gust: 2, settle: 1.6, size: 0.07, sizeSpread: 0, near: 3, span: 22 }
  };

  function driftInit(kind, n, tanHalfX, walked, seed) {
    var k = DRIFTS[kind];
    var rand = mulberry32(seed === undefined ? 7 : seed);
    var st = { pos: new Float32Array(n * 5), vel: new Float32Array(n * 3), seed: new Float32Array(n * 4) };
    for (var i = 0; i < n; i++) {
      var r = [rand(), rand(), rand(), rand()];
      st.seed.set(r, i * 4);
      var vz = k.near + r[1] * k.span;
      var reach = vz * tanHalfX * 1.1 + 1;
      st.pos[i * 5] = (r[0] * 2 - 1) * reach;
      st.pos[i * 5 + 1] = k.top ? r[3] * k.top : k.low + r[3] * (k.high - k.low);
      st.pos[i * 5 + 2] = vz + (walked || 0);
      st.pos[i * 5 + 3] = k.size + r[2] * k.sizeSpread;
    }
    return st;
  }

  function driftStep(st, kind, n, dt, time, puffs, walked, tanHalfX) {
    var k = DRIFTS[kind];
    var ease = Math.min(1, dt / k.settle);
    var w = walked || 0;
    for (var i = 0; i < n; i++) {
      var p = i * 5, v = i * 3, r = i * 4;
      var x = st.pos[p], y = st.pos[p + 1], d = st.pos[p + 2];
      var s0 = st.seed[r], s2 = st.seed[r + 2], s3 = st.seed[r + 3];
      var ax, ay, ad;
      if (k.top) {
        ax = WIND[0] * k.wind + k.sway * k.swayRate * Math.cos(time * k.swayRate + s2 * 6.28);
        ay = -(k.fall + s2 * k.fallSpread);
        ad = 0;
      } else {
        ax = 0.25 * Math.sin(time * 0.21 + s2 * 7);
        ay = (k.low + s3 * (k.high - k.low) - y) * 0.6 + 0.12 * Math.cos(time * 0.5 + s0 * 9);
        ad = 0.17 * Math.cos(time * 0.17 + s3 * 5);
      }
      var gx = 0, gy = 0, gd = 0;
      for (var j = 0; j < puffs.length; j++) {
        var q = puffs[j];
        var dx = x - q.x, dd = d - q.d;
        var f = q.s * Math.exp(-(dx * dx + dd * dd) / (2 * q.r * q.r));
        if (f < 0.002) continue;
        var vl = Math.sqrt(q.vx * q.vx + q.vd * q.vd) || 1;
        gx += q.vx / vl * f * k.gust;
        gd += q.vd / vl * f * k.gust;
        gy += f * k.gust * (k.lift || 0);
      }
      st.vel[v] += (ax - st.vel[v]) * ease + gx * dt;
      st.vel[v + 1] += (ay - st.vel[v + 1]) * ease + gy * dt;
      st.vel[v + 2] += (ad - st.vel[v + 2]) * ease + gd * dt;
      x += st.vel[v] * dt;
      y += st.vel[v + 1] * dt;
      d += st.vel[v + 2] * dt;

      if (d < w + k.near) d += k.span;
      else if (d > w + k.near + k.span) d -= k.span;
      var reach = (d - w) * tanHalfX * 1.1 + 1;
      if (x > reach) x -= 2 * reach;
      else if (x < -reach) x += 2 * reach;
      if (k.top) {
        if (y < 0) y += k.top;
        else if (y > k.top) y -= k.top;
      } else {
        y = clamp(y, 0.3, 2.3);
      }
      st.pos[p] = x;
      st.pos[p + 1] = y;
      st.pos[p + 2] = d;
      if (kind === 'petals') {
        var speed = Math.abs(st.vel[v] - ax) + Math.abs(st.vel[v + 2]);
        st.pos[p + 4] += dt * (1 + s3 * 2 + speed * 1.5);
      } else if (kind === 'fireflies') {
        st.pos[p + 4] = Math.pow(Math.max(0, Math.sin(time * (0.5 + s2 * 0.7) + s0 * 40)), 3);
      }
    }
  }

  // A lantern for each person the trail's counter says is walking now, a
  // few at most; one if someone walked within the hour. Each walks the far
  // stretch of the path, away from you, and fades at either end of it.
  var MAX_LANTERNS = 3;
  var LANTERN_NEAR = 20;
  var LANTERN_FAR = 52;

  function lanternsFor(walkers) {
    if (!walkers) return 0;
    if (walkers.active > 0) return Math.min(MAX_LANTERNS, walkers.active);
    return walkers.recent ? 1 : 0;
  }

  function lanternAt(i, timeSec, walked) {
    var span = LANTERN_FAR - LANTERN_NEAR;
    var along = ((i * 11.3 + timeSec * 0.32) % span + span) % span;
    var d = LANTERN_NEAR + along + (walked || 0);
    var ends = Math.min(along, span - along) / 4;
    return {
      x: pathX(d) + Math.sin(timeSec * 0.4 + i * 2.1) * 0.12,
      d: d,
      y: 1.12 + Math.sin(timeSec * 3.1 + i) * 0.025,
      alpha: clamp(ends, 0, 1)
    };
  }

  // The year's major showers, by their usual peak night, and where each
  // radiant rises (0 east, the page's left). A peak drifts a day either
  // way from year to year, so each counts the night before and after too.
  // A night runs until six in the morning.
  var SHOWERS = [
    { name: 'Quadrantids', month: 0, day: 3, radiant: 0.18 },
    { name: 'Lyrids', month: 3, day: 22, radiant: 0.3 },
    { name: 'Eta Aquariids', month: 4, day: 6, radiant: 0.62 },
    { name: 'Perseids', month: 7, day: 12, radiant: 0.22 },
    { name: 'Orionids', month: 9, day: 21, radiant: 0.4 },
    { name: 'Leonids', month: 10, day: 17, radiant: 0.28 },
    { name: 'Geminids', month: 11, day: 14, radiant: 0.35 }
  ];

  function showerTonight(date) {
    var night = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getHours() < 6 ? 1 : 0));
    for (var i = 0; i < SHOWERS.length; i++) {
      for (var y = night.getFullYear() - 1; y <= night.getFullYear() + 1; y++) {
        var peak = new Date(y, SHOWERS[i].month, SHOWERS[i].day);
        if (Math.abs(Math.round((night - peak) / 86400000)) <= 1) return SHOWERS[i];
      }
    }
    return null;
  }

  function meteorsNow(date, bodies) {
    var shower = showerTonight(date);
    return shower && bodies.sun.alt < -0.1 ? shower : null;
  }

  function showerLine(shower) {
    return 'Tonight, the ' + shower.name;
  }

  // A meteor starts somewhere in the sky and streaks down and away from
  // its radiant, which sits just above the top edge on the shower's side.
  function meteorFrom(shower, r1, r2, widthPx, horizonPx) {
    var x0 = (0.08 + 0.84 * r1) * widthPx;
    var y0 = (0.06 + 0.42 * r2) * horizonPx;
    var dx = x0 - shower.radiant * widthPx;
    var dy = y0 + 0.15 * horizonPx;
    var l = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x0: x0, y0: y0, dx: dx / l, dy: dy / l, len: (0.14 + 0.1 * r2) * widthPx };
  }

  // Clouds across the moon. Each night brings its own weather — some clear,
  // some with a few ink-wash bands drifting past on the wind — and a cloud
  // that crosses the moon veils its light on the grass until it has gone.
  // Clouds live in the band of sky between the words and the horizon, in
  // coordinates of that band (x a fraction of the width, y of the band's
  // height), so they never wash the words.
  var MAX_CLOUDS = 4;

  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function cloudsFor(date) {
    var night = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getHours() < 6 ? 1 : 0));
    var rand = mulberry32(Math.imul(night.getFullYear() * 400 + night.getMonth() * 32 + night.getDate(), 2654435761));
    var roll = rand();
    var count = roll < 0.3 ? 0 : roll < 0.55 ? 1 : roll < 0.8 ? 2 : roll < 0.93 ? 3 : 4;
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push({
        x0: rand() * 2.4 - 0.6, y: 0.2 + rand() * 0.65,
        w: 0.22 + rand() * 0.3, h: 0.14 + rand() * 0.16,
        density: 0.55 + rand() * 0.4, speed: 0.0016 + rand() * 0.0024, seed: rand() * 50
      });
    }
    return out;
  }

  function cloudAt(c, timeSec) {
    var span = 2.4;
    var x = ((c.x0 + 0.6 + c.speed * timeSec) % span + span) % span - 0.6;
    return { x: x, y: c.y, w: c.w, h: c.h, density: c.density, seed: c.seed };
  }

  function cloudDensity(c, x, y) {
    var dx = (x - c.x) / c.w, dy = (y - c.y) / c.h;
    return c.density * (1 - smoothstep(0.2, 1, Math.sqrt(dx * dx + dy * dy)));
  }

  function moonVeil(clouds, x, y) {
    var clear = 1;
    for (var i = 0; i < clouds.length; i++) clear *= 1 - cloudDensity(clouds[i], x, y);
    return 1 - clear;
  }

  function cloudGlsl() {
    return 'float cloudShape(vec2 p, vec4 c){ vec2 d = (p - c.xy) / c.zw; return 1.0 - smoothstep(0.2, 1.0, length(d)); }';
  }

  // Geese across the moon, Hiroshige's: in the migrating seasons, from dusk
  // on, a skein crosses the sky once a visit — south (left to right) in
  // autumn, north again in spring — aimed to pass over the moon. Sky
  // coordinates: x a fraction of the width, y of the sky's height.
  function geeseFly(season, bodies) {
    return (season === 'autumn' || season === 'spring') && bodies.sun.alt < 0.3;
  }

  function skeinAt(timeSec, start, duration, count, target, dir) {
    var u = (timeSec - start) / duration;
    if (u < 0 || u > 1) return [];
    var lx = target.x + dir * (u - 0.5) * 1.5;
    var ly = target.y - (u - 0.5) * 0.12 + Math.sin(timeSec * 0.7) * 0.006;
    var out = [];
    for (var i = 0; i < count; i++) {
      var rank = Math.ceil(i / 2), arm = i % 2 ? -1 : 1;
      out.push({
        x: lx - dir * rank * 0.026 + Math.sin(timeSec * 1.1 + i * 1.7) * 0.0015,
        y: ly + arm * rank * 0.024 + Math.sin(timeSec * 0.9 + i * 2.3) * 0.003,
        flap: Math.sin(timeSec * 2 * Math.PI * 1.5 + i * 0.9)
      });
    }
    return out;
  }

  // Your own lantern: be still on the hero a while and one is lit where
  // the path begins, just ahead of you, and walks away up it at a walker's
  // pace until the far field takes it. Once a visit.
  var STILL_SECONDS = 12;
  var OWN_START = 5;
  var OWN_PACE = 0.55;

  function ownLanternAt(litAt, timeSec) {
    var age = Math.max(0, timeSec - litAt);
    var d = OWN_START + age * OWN_PACE;
    var kindle = clamp(age / 2.5, 0, 1);
    var away = 1 - clamp((d - LANTERN_FAR) / 12, 0, 1);
    return {
      x: pathX(d) + Math.sin(age * 0.5) * 0.05,
      d: d,
      y: 1.0 + Math.sin(age * 3.3) * 0.025,
      alpha: kindle * kindle * (3 - 2 * kindle) * away
    };
  }

  // Where a point in the field lands on screen, in pixels from the top
  // left, with how many pixels a metre spans there.
  function screenOf(x, y, d, walked, widthPx, heightPx, proj) {
    var vz = Math.max(d - (walked || 0), 0.05);
    var nx = x / (proj.tanHalfX * vz);
    var ny = (y - EYE) / (proj.tanHalfY * vz) + proj.shift;
    return {
      x: (nx + 1) / 2 * widthPx,
      y: (1 - ny) / 2 * heightPx,
      metre: heightPx * 0.5 / proj.tanHalfY / vz
    };
  }

  function bladeBudget(widthPx, heightPx, opts) {
    var o = opts || {};
    var n = 22000 * (widthPx * heightPx) / (1440 * 900);
    if (o.coarse) n *= 0.7;
    if (o.cores && o.cores <= 4) n *= 0.75;
    if (o.saveData) n *= 0.5;
    return Math.round(clamp(n, 7000, 28000));
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Grass grows in clumps; scattered evenly, a field reads as wallpaper.
  function patchNoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    function h(a, b) {
      var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return n - Math.floor(n);
    }
    var a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), e = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + e) * ux * uy;
  }

  var FLOATS_PER_BLADE = 8;
  var NEAR_SHARE = 0.1;
  var NEAR_BAND = [1.4, 7];

  // Per blade: x, depth, height, half-width; phase, kind (1 plume, 0
  // leaf), lean direction, lean amount. Density rises into the distance so
  // the far field closes into a tone; a tenth stand close for depth. All
  // lean downwind, combed as a steady wind combs. Far to near: paint order.
  function layoutBlades(count, tanHalfX, seed, shape) {
    var f = shape || SEASON_FIELDS.autumn;
    var vergeWidth = f.verge || 1.6;
    var plumeShare = f.plumeShare === undefined ? SEASON_FIELDS.autumn.plumeShare : f.plumeShare;
    var heightScale = f.heightScale || 1;
    var bow = f.bow || 0;
    var rand = mulberry32(seed === undefined ? 108 : seed);
    var depths = new Float64Array(count);
    var nearCount = Math.round(count * NEAR_SHARE);
    var i;
    for (i = 0; i < count; i++) {
      depths[i] = i < nearCount
        ? NEAR_BAND[0] + (NEAR_BAND[1] - NEAR_BAND[0]) * rand()
        : D_NEAR + (D_FAR - D_NEAR) * Math.pow(rand(), 1 / 1.7);
    }
    depths.sort();

    var out = new Float32Array(count * FLOATS_PER_BLADE);
    for (i = 0; i < count; i++) {
      var d = depths[count - 1 - i];
      var reach = (d - WALK_METRES * 0.2) * tanHalfX * 1.12 + 1.2;
      var x = 0;
      for (var tries = 0; tries < 10; tries++) {
        x = (rand() * 2 - 1) * reach;
        if (inPath(x, d)) continue;
        if (rand() < 0.25 + 0.75 * patchNoise(x * 0.16, d * 0.16)) break;
      }
      // Ten misses in a row: step off the path onto its verge.
      if (inPath(x, d)) x = pathX(d) + (rand() < 0.5 ? -1 : 1) * (pathHalfWidth(d) + rand() * 2);

      var verge = clamp(fromPath(x, d) / vergeWidth, 0, 1);
      var patch = (0.72 + 0.56 * patchNoise(x * 0.06 + 31, d * 0.06 + 17)) * (0.35 + 0.65 * verge) * heightScale;
      var plume = rand() < plumeShare;
      var height = plume
        ? (1.0 + rand() * 0.36) * patch + (d > 9 ? rand() * rand() * 0.6 : 0)
        : (0.45 + rand() * 0.45) * patch;

      var k = i * FLOATS_PER_BLADE;
      out[k] = x;
      out[k + 1] = d;
      out[k + 2] = height;
      out[k + 3] = plume ? 0.006 + rand() * 0.003 : 0.008 + rand() * 0.007;
      out[k + 4] = rand();
      out[k + 5] = plume ? 1 : 0;
      out[k + 6] = WIND_ANGLE + (rand() - 0.5) * (plume ? 0.9 : 3.2);
      out[k + 7] = (plume ? 0.06 + rand() * 0.18 : 0.2 + rand() * 0.38) + bow * rand();
    }
    return out;
  }

  function hexToRgb(hex) {
    var h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (h.length !== 6 || isNaN(n)) return null;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  // Built from the page's own tokens: ink thinned toward the paper, the
  // season's hue, the paper's own mist. Dark inverts it — pale on night.
  function palette(tokens, season, dark) {
    var paper = hexToRgb(tokens.parchment) || (dark ? [0.11, 0.098, 0.078] : [0.96, 0.94, 0.91]);
    var ink = hexToRgb(tokens.ink) || (dark ? [0.94, 0.92, 0.88] : [0.17, 0.14, 0.12]);
    var colors = SEASON_COLORS[season] || SEASON_COLORS.autumn;
    var stem = hexToRgb(colors.stem);
    var plume = hexToRgb(colors.plume);

    if (dark) {
      return {
        paper: paper,
        stem: mix(mix(paper, ink, 0.3), stem, 0.25),
        plume: mix(mix(paper, ink, 0.62), plume, 0.22),
        mist: mix(paper, ink, 0.1),
        ground: SEASON_FIELDS[season] && SEASON_FIELDS[season].snow ? mix(paper, ink, 0.2) : mix(paper, [0, 0, 0], 0.3),
        path: mix(paper, ink, 0.025),
        moonLit: mix(ink, [1, 1, 1], 0.2),
        meteor: mix(ink, [1, 1, 1], 0.5),
        dusk: [0.012, 0.011, 0.01],
        cloud: mix(paper, ink, 0.09),
        goose: mix(paper, [0, 0, 0], 0.55),
        shade: mix(paper, [0, 0, 0], 0.45),
        rimBase: mix(ink, [1, 1, 1], 0.25),
        lamp: [1, 0.74, 0.38],
        drift: { snow: mix(ink, [1, 1, 1], 0.3), petals: mix(paper, [0.96, 0.76, 0.79], 0.8), fireflies: [0.82, 0.95, 0.42], lantern: [1, 0.78, 0.44] }
      };
    }
    return {
      paper: paper,
      stem: mix(mix(paper, ink, 0.74), stem, 0.25),
      plume: mix(mix(paper, ink, 0.17), plume, 0.2),
      mist: mix(paper, [1, 1, 1], 0.28),
      ground: SEASON_FIELDS[season] && SEASON_FIELDS[season].snow ? mix(paper, [1, 1, 1], 0.45) : mix(paper, ink, 0.2),
      path: mix(paper, [1, 1, 1], 0.12),
      moonLit: mix(paper, [1, 1, 1], 0.82),
      meteor: mix(paper, ink, 0.55),
      dusk: ink,
      cloud: mix(paper, ink, 0.13),
      goose: mix(paper, ink, 0.78),
      shade: mix(paper, ink, 0.5),
      rimBase: mix(paper, [1, 1, 1], 0.75),
      lamp: [0.86, 0.55, 0.2],
      drift: { snow: mix(paper, [1, 1, 1], 0.9), petals: mix(paper, [0.9, 0.62, 0.66], 0.55), fireflies: [0.7, 0.56, 0.16], lantern: [0.78, 0.5, 0.18] }
    };
  }

  var api = {
    EYE: EYE,
    D_NEAR: D_NEAR,
    D_FAR: D_FAR,
    WALK_METRES: WALK_METRES,
    FLOATS_PER_BLADE: FLOATS_PER_BLADE,
    WIND: WIND,
    PATH: PATH,
    pathGlsl: pathGlsl,
    keyLight: keyLight,
    fieldLight: fieldLight,
    bokashiAt: bokashiAt,
    bokashiGlsl: bokashiGlsl,
    SEASON_COLORS: SEASON_COLORS,
    daylightSavingHours: daylightSavingHours,
    skyBodies: skyBodies,
    sheenFor: sheenFor,
    pathX: pathX,
    pathHalfWidth: pathHalfWidth,
    inPath: inPath,
    fromPath: fromPath,
    pathReach: pathReach,
    localDay: localDay,
    countVisitDay: countVisitDay,
    horizonFraction: horizonFraction,
    projection: projection,
    pointerOnField: pointerOnField,
    driftInit: driftInit,
    driftStep: driftStep,
    MAX_LANTERNS: MAX_LANTERNS,
    LANTERN_NEAR: LANTERN_NEAR,
    LANTERN_FAR: LANTERN_FAR,
    lanternsFor: lanternsFor,
    screenOf: screenOf,
    showerTonight: showerTonight,
    meteorsNow: meteorsNow,
    showerLine: showerLine,
    meteorFrom: meteorFrom,
    lanternAt: lanternAt,
    geeseFly: geeseFly,
    skeinAt: skeinAt,
    MAX_CLOUDS: MAX_CLOUDS,
    cloudsFor: cloudsFor,
    cloudAt: cloudAt,
    cloudDensity: cloudDensity,
    moonVeil: moonVeil,
    cloudGlsl: cloudGlsl,
    STILL_SECONDS: STILL_SECONDS,
    ownLanternAt: ownLanternAt,
    PUFF_MAX: PUFF_MAX,
    PUFF_TOP_SPEED: PUFF_TOP_SPEED,
    windStrength: windStrength,
    puffFromMove: puffFromMove,
    scrollPuff: scrollPuff,
    stepPuff: stepPuff,
    bladeBudget: bladeBudget,
    layoutBlades: layoutBlades,
    hexToRgb: hexToRgb,
    palette: palette,
    seasonField: seasonField,
    particlesFor: particlesFor
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeroFieldCore = api;
})(typeof window !== 'undefined' ? window : this);
