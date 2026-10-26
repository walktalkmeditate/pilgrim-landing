/* =============================================
   The turning leaf — the pure core

   Run via:  node js/turning-leaf-core.test.js

   Every turning page's plate is drawn at build time by
   js/turning-leaf-core.js, and the player redraws it in the browser
   through the same functions. Most checks here read the markup the core
   emits (where the glow stands, where the tips fall, what the strip
   holds), not the numbers it computed on the way, because a picture can
   be wrong while its inputs are right.

   Turning instants come from scripts/sunpath/meeus.mjs, the source the
   build itself uses, never from the core. The sun's place is checked
   against JPL Horizons, named where it is used. The place line and the
   claim menu are build-only and tested in
   scripts/sunpath/turning-claims.test.js.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const C = require('./turning-leaf-core.js');

const temples = require('../assets/sunpath/temples.json').temples;
const skyDays = require('../assets/sunpath/sky-days.json').days;

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function near(actual, expected, tol, label) {
  const shown = typeof actual === 'number' ? actual.toFixed(4) : String(actual);
  ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol,
    label + '  (' + shown + ' vs ' + expected + ' ± ' + tol + ')');
}

// --- markup readers ---

function attrs(s) {
  const out = {};
  s.replace(/([\w:-]+)="([^"]*)"/g, function (_, k, v) { out[k] = v; return ''; });
  return out;
}
function elements(svg, tag, cls) {
  const re = new RegExp('<' + tag + '\\b([^>]*)>', 'g');
  const found = [];
  let m;
  while ((m = re.exec(svg))) {
    const a = attrs(m[1]);
    if (!cls || (a.class || '').split(' ').indexOf(cls) >= 0) found.push(a);
  }
  return found;
}
function texts(svg, cls) {
  const re = /<text\b([^>]*)>([^<]*)<\/text>/g;
  const found = [];
  let m;
  while ((m = re.exec(svg))) {
    const a = attrs(m[1]);
    if (!cls || (a.class || '').split(' ').indexOf(cls) >= 0) { a.text = m[2]; found.push(a); }
  }
  return found;
}
// Absolute points of an M…l… path (the core writes arcs as one move and
// relative line steps).
function pathPoints(d) {
  const nums = (d.match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
  const pts = [[nums[0], nums[1]]];
  for (let i = 2; i + 1 < nums.length; i += 2) {
    const p = pts[pts.length - 1];
    pts.push([p[0] + nums[i], p[1] + nums[i + 1]]);
  }
  return pts;
}
function group(svg, cls) {
  const start = svg.indexOf('<g class="' + cls + '"');
  if (start < 0) return '';
  let depth = 0;
  const re = /<(\/?)g\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(svg))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return svg.slice(start, re.lastIndex);
  }
  return '';
}

const DAY_MS = 86400000;
const KEYS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];
const temple = function (n) { return temples[n - 1]; };

async function main() {
  const meeus = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'sunpath', 'meeus.mjs')).href);
  const instant = meeus.turningInstant;

  // The turning before (year, key).
  function previous(year, key) {
    const i = KEYS.indexOf(key);
    return i === 0 ? [year - 1, KEYS[3]] : [year, KEYS[i - 1]];
  }
  function turning(year, key) {
    const n = C.templeNumber(year, key);
    const t = { year: year, key: key, instant: instant(year, key), temple: temple(n), n: n };
    const p = previous(year, key);
    t.prev = instant(p[0], p[1]);
    t.place = C.templePlace(t.temple);
    t.day = C.plateDay(t.instant);
    t.season = C.seasonDays(t.prev, t.instant, skyDays);
    t.scene = C.sceneSvg({ place: t.place, date: t.day, instant: t.instant, season: t.season.days });
    return t;
  }

  console.log('\n=== it loads in node and as a browser global ===\n');

  ok(typeof C.sceneSvg === 'function' && typeof C.dayGeometry === 'function', 'require() returns the core');
  // The place line and the claim menu run only in the build
  // (scripts/sunpath/turning-claims.js), so the page never downloads them.
  ok(['placeLine', 'claimMenu', 'renderClaim', 'hasDigitsOutsideSlots'].every(function (k) { return !(k in C); }),
    'the browser core carries no claim code');
  const src = fs.readFileSync(path.join(__dirname, 'turning-leaf-core.js'), 'utf8');
  const mathSrc = fs.readFileSync(path.join(__dirname, 'sunpath-math.js'), 'utf8');
  const win = {};
  const ctx = vm.createContext({ window: win, Intl: Intl, Math: Math, Date: Date });
  vm.runInContext(mathSrc, ctx);
  vm.runInContext(src, ctx);
  ok(!!win.TurningLeafCore && typeof win.TurningLeafCore.dayGeometry === 'function',
    'in a page with js/sunpath-math.js loaded first, window.TurningLeafCore is the core');

  console.log('\n=== the walk: one temple per turning ===\n');

  ok(C.templeNumber(2026, 'spring-equinox') === 1, '2026 spring equinox is Temple 1, Ryozen-ji');
  ok(C.templeNumber(2026, 'winter-solstice') === 4, '21 Dec 2026 is Temple 4');
  ok(C.templeNumber(2047, 'winter-solstice') === 88, 'the 2047 winter solstice is Temple 88');
  ok(C.templeNumber(2048, 'spring-equinox') === 1, 'the 2048 spring equinox returns to Temple 1');

  const w26 = turning(2026, 'winter-solstice');
  // Three temples share the name Dainichi-ji; only #4 stands at 34.151, 134.431.
  ok(w26.place.lat === 34.151 && w26.place.lon === 134.431, 'the staff stands at #4\'s coordinates, not #13\'s (34.038, 134.463)');
  const stamp4 = C.stampSvg(4, temple(4));
  ok(stamp4.indexOf('四番') >= 0 && stamp4.indexOf('大日寺') >= 0 && stamp4.indexOf('十三番') < 0,
    'the number stamp reads 四番 大日寺, not 十三番');
  ok(C.stampSvg(88, temple(88)).indexOf('八十八番') >= 0, 'Temple 88 is stamped 八十八番');
  ok(C.sealSvg('winter-solstice').indexOf('冬') >= 0 && C.sealSvg('winter-solstice').indexOf('至') >= 0, 'the winter seal carries 冬至');
  ok(['spring-equinox', 'summer-solstice', 'autumn-equinox'].every(function (k, i) {
    const s = C.sealSvg(k), kan = ['春分', '夏至', '秋分'][i];
    return s.indexOf(kan[0]) >= 0 && s.indexOf(kan[1]) >= 0;
  }), 'the other seals carry 春分, 夏至, 秋分');

  const walk = C.walkMapSvg(temples, 4, instant(2027, 'spring-equinox'));
  ok(elements(walk, 'circle', 'walk-dot').length === 88, 'the walk map draws all 88 temples');
  const done = elements(walk, 'polyline', 'walk-done')[0];
  ok(!!done && done.points.trim().split(/\s+/).length === 4, 'the walked path runs through temples 1 to 4');
  ok(elements(walk, 'circle', 'walk-now').length === 1 && elements(walk, 'circle', 'walk-next').length === 1,
    'the current temple is marked and the next one ghosted');
  ok(/Jizo-ji/.test(walk) && /20 March 2027/.test(walk), 'the next temple is named with the next turning\'s date  (Jizo-ji, 20 March 2027)');
  const walk88 = C.walkMapSvg(temples, 88, instant(2048, 'spring-equinox'));
  ok(/Ryozen-ji/.test(walk88), 'after Temple 88 the next temple is Ryozen-ji again');

  console.log('\n=== the plate\'s day and the season (KTD7) ===\n');

  // 21 Dec 2026, 20:50 UTC is 05:50 on the 22nd in Japan (UTC+9, no DST).
  ok(w26.day === '2026-12-22', 'the 21 Dec 2026 plate is drawn for 22 Dec, the temple\'s local date');
  ok(w26.season.days.length === 90 && w26.season.days[0].date === '2026-09-23' && w26.season.days[89].date === '2026-12-21',
    'the winter 2026 season runs from the autumn equinox\'s UTC date to the solstice\'s, inclusive  (' +
    w26.season.days.length + ' days, ' + w26.season.days[0].date + ' to ' + w26.season.days[w26.season.days.length - 1].date + ')');

  // AE6: spring 2026's season (21 Dec 2025 to 20 Mar 2026) ended before the photos began.
  const sp26 = C.seasonDays(instant(2025, 'winter-solstice'), instant(2026, 'spring-equinox'), skyDays);
  ok(sp26.strip === false && C.stripSvg(sp26.days) === '' && /4 May 2026/.test(sp26.note || ''),
    'AE6: a season over before 4 May 2026 has no strip and a note naming the day the photos began');

  // AE9: summer 2026 (20 Mar to 21 Jun) began before the photos did.
  const su26 = C.seasonDays(instant(2026, 'spring-equinox'), instant(2026, 'summer-solstice'), skyDays);
  const su26strip = C.stripSvg(su26.days);
  const bars = elements(su26strip, 'rect');
  const beforeBars = elements(su26strip, 'rect', 'before');
  const firstPhoto = skyDays.find(function (d) { return d[0] === '2026-05-04'; });
  // 20 March to 3 May inclusive is 45 days.
  ok(bars.length === su26.days.length && beforeBars.length === 45, 'AE9: the 45 bars before 4 May 2026 are blank  (' + beforeBars.length + ')');
  ok(beforeBars.every(function (b) { return !b.fill; }), 'AE9: and none of them carries a colour');
  ok(bars[45].fill === firstPhoto[1], 'AE9: the bar for 4 May 2026 carries that day\'s colour  (' + bars[45].fill + ')');
  ok(typeof su26.note === 'string' && /4 May 2026/.test(su26.note) && su26.strip === true,
    'AE9: one note says the daily photos began on 4 May 2026  (' + su26.note + ')');

  const missing = w26.season.days.length && C.seasonDays(instant(2026, 'summer-solstice'), instant(2026, 'autumn-equinox'), skyDays);
  const jul18 = missing.days.find(function (d) { return d.date === '2026-07-18'; });
  ok(!!jul18 && jul18.state === 'none' && !jul18.color, 'a day with no photo (18 Jul 2026, absent from the manifest) is blank');

  console.log('\n=== AE1: 21 Dec 2026, before dawn at Dainichi-ji ===\n');

  const g26 = C.dayGeometry({ place: w26.place, date: w26.day, instant: w26.instant });
  // JPL Horizons, airless apparent, topocentric 134.431E 34.151N (fetched
  // 2026-10-26): 20:50 UT alt -14.962 az 108.435; 20:51 UT alt -14.766 az
  // 108.558. Interpolated to the instant, about 20:50:13.
  const u26 = (w26.instant.getTime() - Date.UTC(2026, 11, 21, 20, 50)) / 60000;
  near(g26.instant.alt, -14.962 + (-14.766 + 14.962) * u26, 0.1, 'the sun at the instant is about 15° below the horizon');
  near(g26.instant.az, 108.435 + (108.558 - 108.435) * u26, 0.1, 'at bearing ≈108°');
  const glows = elements(w26.scene, 'ellipse', 'glow');
  ok(glows.length === 1 && Number(glows[0].cx) < C.SCENE.cx, 'the plate draws one glow, on the east side of the staff  (cx ' + (glows[0] && glows[0].cx) + ')');
  near(Number(glows[0].cx), C.SCENE.cx + (108.6 - 180) * C.SCENE.ax, 0.6, 'the glow stands at the sun\'s true bearing on the sky\'s azimuth scale');
  ok(elements(w26.scene, 'circle', 'sun').length === 0, 'and no risen sun');
  ok(texts(w26.scene, 'tiny').some(function (t) { return /15° below the horizon/.test(t.text); }), 'its label says 15° below the horizon');

  console.log('\n=== the glow\'s side and the horizon edge ===\n');

  // 18:30 at the temple on 22 Dec, an hour and more after sunset.
  const dusk = new Date(Date.UTC(2026, 11, 22, 9, 30));
  const duskScene = C.sceneSvg({ place: w26.place, date: '2026-12-22', instant: dusk, season: [] });
  const duskGlow = elements(duskScene, 'ellipse', 'glow');
  ok(duskGlow.length === 1 && Number(duskGlow[0].cx) > C.SCENE.cx, 'after sunset the glow is on the west side  (cx ' + (duskGlow[0] && duskGlow[0].cx) + ')');

  // Sunrise on 22 Dec, found by bisection on the core's own altitude: the
  // input comes from the core, the expectation does not. A Date holds whole
  // milliseconds, about 3e-6° of the rising sun, so "exactly" means that.
  let lo = Date.UTC(2026, 11, 21, 21, 30), hi = Date.UTC(2026, 11, 21, 23, 0);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (C.sunAltAz(new Date(mid), w26.place.lat, w26.place.lon).alt < 0) lo = mid; else hi = mid;
  }
  const rise = new Date(hi);
  const riseAlt = C.sunAltAz(rise, w26.place.lat, w26.place.lon).alt;
  const edgeScene = C.sceneSvg({ place: w26.place, date: '2026-12-22', instant: rise, season: [] });
  ok(riseAlt >= 0 && riseAlt < 1e-5 &&
    elements(edgeScene, 'ellipse', 'glow').length === 0 && elements(edgeScene, 'circle', 'sun-below').length === 0,
    'with the sun exactly on the horizon there is neither glow nor below-horizon mark  (alt ' + riseAlt.toExponential(1) + ')');
  ok(elements(edgeScene, 'circle', 'sun').length === 1, 'the sun is drawn on the horizon instead');

  console.log('\n=== the shadows fall toward the viewer ===\n');

  // Facing south, north is toward the viewer (down) and west is right. The
  // 12:00 sun at the temple stands near due south, so its shadow falls
  // straight down; the 09:00 sun is in the south-east, so its shadow runs
  // down and to the right.
  const hrs = elements(w26.scene, 'g', 'hr');
  const tipAt = function (scene, m) {
    const s = scene.indexOf('<g class="hr" data-m="' + m + '">');
    return s < 0 ? null : elements(scene.slice(s, scene.indexOf('</g>', s)), 'circle', 'tip')[0];
  };
  const noonTip = tipAt(w26.scene, 720), nineTip = tipAt(w26.scene, 540);
  ok(hrs.length > 0 && !!noonTip && Number(noonTip.cy) > C.SCENE.by && Math.abs(Number(noonTip.cx) - C.SCENE.cx) < 25,
    'at the temple the noon shadow falls straight toward the viewer  (' + (noonTip && noonTip.cx + ', ' + noonTip.cy) + ')');
  ok(!!nineTip && Number(nineTip.cx) > C.SCENE.cx && Number(nineTip.cy) > C.SCENE.by,
    'the 09:00 shadow runs toward the viewer and west, to the right');
  // Facing north from Sydney, south is toward the viewer and west is left.
  const sydneyNoon = { lat: -33.87, lon: 151.21, tzMin: 660, where: 'reader' };
  const sScene = C.sceneSvg({ place: sydneyNoon, date: '2026-12-22', season: [] });
  const sNine = tipAt(sScene, 600);
  ok(!!sNine && Number(sNine.cx) < C.SCENE.cx && Number(sNine.cy) > C.SCENE.by,
    'facing north, the 10:00 shadow runs toward the viewer and west, now to the left');

  ok(elements(w26.scene, 'g', 'inst').length === 0, 'before sunrise there is no shadow at the instant');
  const a26 = C.sceneSvg({ place: C.templePlace(temple(3)), date: '2026-09-23', instant: instant(2026, 'autumn-equinox'), season: [] });
  ok(elements(a26, 'g', 'inst').length === 1 && elements(a26, 'path', 'hair-seal').length === 7,
    'with the sun up (09:06, 23 Sep 2026) the instant\'s shadow is drawn in the seal\'s red');

  console.log('\n=== AE2: on an equinox the shadow tips run straight ===\n');

  function maxOffLine(pts) {
    const n = pts.length;
    const mx = pts.reduce(function (s, p) { return s + p[0]; }, 0) / n;
    const my = pts.reduce(function (s, p) { return s + p[1]; }, 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; });
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    return Math.max.apply(null, pts.map(function (p) { return Math.abs((p[0] - mx) * nx + (p[1] - my) * ny); }));
  }
  [2026, 2027, 2028].forEach(function (y) {
    ['spring-equinox', 'autumn-equinox'].forEach(function (k) {
      const t = turning(y, k);
      const tips = elements(t.scene, 'circle', 'tip').map(function (c) { return [Number(c.cx), Number(c.cy)]; });
      const off = tips.length >= 6 ? maxOffLine(tips) : Infinity;
      ok(off <= 1.0, y + ' ' + k + ': ' + tips.length + ' hourly tips lie within 1.0 px of one line  (max ' + off.toFixed(2) + ' px)');
    });
  });

  console.log('\n=== AE10 and the scrubbed day ===\n');

  const autumn = turning(2026, 'autumn-equinox');
  const aug5 = autumn.season.days.find(function (d) { return d.date === '2026-08-05'; });
  ok(!!aug5 && aug5.time === '23:00', 'the manifest has a sky photo at 23:00 on 5 Aug 2026');
  const night = C.dayGeometry({ place: autumn.place, date: aug5.date, photo: aug5.time });
  const nightLine = C.photoLine(aug5, autumn.place);
  ok(night.photo && night.photo.night === true && /night at the temple/.test(nightLine.text) && nightLine.mark === false,
    'AE10: a photo at 23:00 reads as night at the temple  (' + nightLine.text + ')');
  ok(elements(C.dayLayer(night), 'circle', 'sc-sun').length === 0, 'AE10: and no sun is marked');

  const day = autumn.season.days.find(function (d) { return d.state === 'photo' && d.time >= '11:00' && d.time <= '13:00'; });
  const dayGeo = C.dayGeometry({ place: autumn.place, date: day.date, photo: day.time });
  const dayLine = C.photoLine(day, autumn.place);
  ok(dayLine.mark === true && dayLine.text.indexOf('you looked up at ' + day.time + '; at ' + day.time + ' at the temple the sun stood here') >= 0,
    'a midday photo marks the sun with the "you looked up" line  (' + dayLine.text + ')');
  ok(elements(C.dayLayer(dayGeo), 'circle', 'sc-sun').length === 1, 'and the scrubbed day draws that sun');
  ok(/no photograph/.test(C.photoLine(jul18, autumn.place).text), 'a day without a photo says so');

  console.log('\n=== AE11: drawn where the reader stands ===\n');

  // Sydney, 33.87°S, in AEDT (UTC+11) on 22 Dec 2026. Solar noon there is
  // about 12:54 (the zone's meridian is 165°E, Sydney 13.8° west of it, plus
  // daylight saving, less a 1.5 min equation of time), so the 13:00 sun is
  // the highest of the whole hours.
  const sydney = { lat: -33.87, lon: 151.21, tzMin: 660, where: 'reader' };
  const sGeo = C.dayGeometry({ place: sydney, date: '2026-12-22', instant: w26.instant });
  ok(sGeo.facing === 0, 'a reader at 34°S faces north, toward the noon sun');
  const sLayer = C.dayLayer(sGeo);
  const dots = elements(sLayer, 'circle', 'sundot');
  const labels = texts(sLayer, 'hour');
  const top = dots.reduce(function (b, d, i) { return Number(d.cy) < Number(dots[b].cy) ? i : b; }, 0);
  ok(labels[top] && labels[top].text === '13', 'hours read in the reader\'s own clock: 13:00 is the highest  (' + (labels[top] && labels[top].text) + ')');
  // Six minutes past noon, 80° up, the sun is already about 8° of azimuth
  // west of north.
  near(Number(dots[top].cx), C.SCENE.cx, 12 * C.SCENE.ax, 'and stands over the staff, within 12° of due north');
  ok(Number(dots[0].cx) > C.SCENE.cx && Number(dots[dots.length - 1].cx) < C.SCENE.cx,
    'the morning sun is on the right (east, facing north) and the evening sun on the left');

  const polar = C.dayGeometry({ place: { lat: 80, lon: 15, tzMin: 60, where: 'reader' }, date: '2026-12-22', instant: w26.instant });
  const polarLayer = C.dayLayer(polar);
  ok(polar.polar === 'night' && /does not rise/.test(polar.note), 'a reader in polar night is told the sun does not rise there that day  (' + polar.note + ')');
  ok(elements(polarLayer, 'path', 'sunpath').length === 0 && elements(polarLayer, 'path', 'hair').length === 0 &&
    elements(polarLayer, 'path', 'trace').length === 0, 'and no arc or shadow is drawn');

  console.log('\n=== the season\'s arcs ===\n');

  const arcs = elements(group(w26.scene, 'season-arcs'), 'path');
  const coloured = w26.season.days.filter(function (d) { return d.color; });
  ok(arcs.length === 90, 'the winter 2026 plate draws one arc per day of the season  (' + arcs.length + ')');
  ok(arcs.filter(function (a) { return /unseen/.test(a.class); }).length === 90 - coloured.length, 'days without a photo are drawn in faint ink');
  ok(w26.season.days.every(function (d, i) {
    return d.color ? arcs[i].style === 'stroke:' + d.color : /unseen/.test(arcs[i].class);
  }), 'each photographed day\'s arc is stroked in that day\'s colour');

  console.log('\n=== the phone crop holds every sun of 2026–2028 ===\n');

  // The user chose the wider sky at visual review: 1.9 px per degree of
  // azimuth, altitude unchanged.
  ok(C.SCENE.ax === 1.9 && C.SCENE.ay === 3.8, 'the sky is 1.9 px per degree of azimuth and 3.8 per degree of altitude');

  const crop = C.PHONE_CROP;
  const inside = function (x, y, r) {
    r = r || 0;
    return x - r >= crop.x && x + r <= crop.x + crop.w && y - r >= crop.y && y + r <= crop.y + crop.h;
  };
  // JPL Horizons, airless apparent, topocentric at each turning's temple at
  // its instant (fetched 2026-10-26): azimuth and altitude. Every temple
  // stands north of the sun all year, so every plate faces south.
  const SKY = {
    '2026 spring-equinox': [349.65, -55.40], '2026 summer-solstice': [284.94, 20.66],
    '2026 autumn-equinox': [121.62, 37.70], '2026 winter-solstice': [108.47, -14.91],
    '2027 spring-equinox': [83.63, -9.29], '2027 summer-solstice': [345.69, -31.06],
    '2027 autumn-equinox': [242.12, 34.61], '2027 winter-solstice': [174.93, 32.27],
    '2028 spring-equinox': [157.25, 53.71], '2028 summer-solstice': [62.09, 1.05],
    '2028 autumn-equinox': [297.20, -34.07], '2028 winter-solstice': [244.95, -4.93]
  };
  let pinned = 0;
  [2026, 2027, 2028].forEach(function (y) {
    KEYS.forEach(function (k) {
      const t = turning(y, k);
      const day = group(t.scene, 'day');
      const pathEl = elements(day, 'path', 'sunpath')[0];
      const pts = pathEl ? pathPoints(pathEl.d) : [];
      const ends = pts.length ? [pts[0], pts[pts.length - 1]] : [];
      const onHorizon = ends.length === 2 && ends.every(function (p) { return Math.abs(p[1] - C.SCENE.hy) < 0.11; });
      ok(pts.length > 10 && onHorizon && pts.every(function (p) { return inside(p[0], p[1]); }),
        y + ' ' + k + ': the sun\'s path from sunrise to sunset lies inside the phone crop');

      const marks = elements(day, 'circle', 'sun').concat(elements(day, 'circle', 'sun-below'));
      const glow = elements(day, 'ellipse', 'glow');
      const words = texts(day, 'tiny').map(function (l) { return l.text; }).join(' / ');
      const sky = SKY[y + ' ' + k];
      let off = sky[0] - 180;
      off = off > 180 ? off - 360 : off < -180 ? off + 360 : off;
      const trueX = C.SCENE.cx + off * C.SCENE.ax;
      const outside = trueX < crop.x || trueX > crop.x + crop.w;
      const markIn = marks.length === 1 && inside(Number(marks[0].cx), Number(marks[0].cy), Number(marks[0].r));
      if (sky[1] > 0) {
        ok(markIn && glow.length === 0 && Math.abs(Number(marks[0].cx) - trueX) < 1,
          y + ' ' + k + ': the risen sun stands inside the crop at its true bearing  (x ' + (marks[0] && marks[0].cx) + ' vs ' + trueX.toFixed(1) + ')');
      } else if (!outside) {
        ok(markIn && glow.length === 1 && Math.abs(Number(glow[0].cx) - trueX) < 1 && !/behind you/.test(words),
          y + ' ' + k + ': the glow stands inside the crop at its true bearing  (x ' + (glow[0] && glow[0].cx) + ' vs ' + trueX.toFixed(1) + ')');
      } else {
        pinned++;
        const edge = trueX < crop.x ? crop.x : crop.x + crop.w;
        const below = Math.round(-sky[1]);
        ok(markIn && glow.length === 1 && Math.abs(Number(glow[0].cx) - edge) <= C.SCENE.sunR &&
          Math.abs(Number(marks[0].cx) - Number(glow[0].cx)) < 0.05,
          y + ' ' + k + ': the sun behind the viewer (true x ' + trueX.toFixed(0) + ') is pinned at the crop\'s nearer edge  (x ' +
            (glow[0] && glow[0].cx) + ')');
        ok(new RegExp('behind you, ' + below + '° below the horizon').test(words),
          y + ' ' + k + ': and its label says so  (' + words + ')');
      }
    });
  });
  ok(pinned === 2, 'two turnings fall near midnight at the temple, 2026 spring and 2027 summer  (' + pinned + ' pinned)');

  console.log('\n=== the pieces are deterministic and filter-free ===\n');

  function pieces() {
    const t = turning(2026, 'winter-solstice');
    return [t.scene, C.stripSvg(t.season.days), C.sealSvg('winter-solstice'), C.stampSvg(4, temple(4)),
      C.walkMapSvg(temples, 4, instant(2027, 'spring-equinox'))];
  }
  const a = pieces(), b = pieces();
  ok(a.every(function (s, i) { return s === b[i] && s.length > 0; }), 'the same input yields the identical markup');
  const fresh = vm.createContext({ window: {}, Intl: Intl, Math: Math, Date: Date });
  vm.runInContext(mathSrc, fresh);
  vm.runInContext(src, fresh);
  const F = fresh.window.TurningLeafCore;
  ok(F.sceneSvg({ place: w26.place, date: w26.day, instant: w26.instant, season: w26.season.days }) === a[0],
    'a second copy of the module draws the same scene: nothing is carried between calls');
  ok(a.every(function (s) { return s.indexOf('<filter') < 0 && s.indexOf('filter=') < 0; }), 'no piece uses an SVG filter');
  ok(a[0].indexOf('viewBox="' + C.VIEWBOX + '"') >= 0, 'the scene declares the exported viewBox');
  ok(a.every(function (s) { return !/\d\.\d\d/.test(s.replace(/<defs>[\s\S]*?<\/defs>/g, '').replace(/(stroke-width|opacity|offset)="[^"]*"/g, '')); }),
    'coordinates are rounded to one decimal');

  console.log('\n=== Summary ===\n');
  console.log('passed: ' + passed);
  console.log('failed: ' + failed);
  if (failed > 0) {
    console.log('\nfailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('\nall green');
}

main().catch(function (e) { console.error(e); process.exit(1); });
