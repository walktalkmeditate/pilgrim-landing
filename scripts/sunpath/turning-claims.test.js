/* =============================================
   The turning leaf — the place under the sun and the claim menu

   Run via:  node scripts/sunpath/turning-claims.test.js

   Each turning page leads with a claim the build computes in
   scripts/sunpath/turning-claims.js; the browser never loads that code.
   Every expected number here comes from outside it: JPL Horizons for the
   instants, the sun and the moon, USNO for season lengths, Kepler's
   second law for the sun's daily motion, and Laskar's obliquity series
   for the Tropic.
   ============================================= */

'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const T = require('./turning-claims.js');

const gazetteer = require('./data/places.json');
const temples = require('../../assets/sunpath/temples.json').temples;
const C = require('../../js/turning-leaf-core.js');

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

const KEYS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];

async function main() {
  const meeus = await import(pathToFileURL(path.join(__dirname, 'meeus.mjs')).href);
  const instant = meeus.turningInstant;

  // The four turning instants before (year, key), oldest first.
  function previous(year, key) {
    const i = KEYS.indexOf(key);
    return i === 0 ? [year - 1, KEYS[3]] : [year, KEYS[i - 1]];
  }
  function recent(year, key) {
    const out = [];
    let y = year, k = key;
    for (let i = 0; i < 4; i++) { const p = previous(y, k); y = p[0]; k = p[1]; out.unshift(instant(y, k)); }
    return out;
  }

  console.log('\n=== the place under the sun (KTD6) ===\n');

  // A minute of time moves the point under the sun 0.25° of longitude, so
  // these use the true instants to the second: when JPL Horizons puts the
  // sun's apparent geocentric ecliptic longitude at 270° or 180° (fetched
  // 2026-10-26). USNO's minute-rounded times agree, and
  // scripts/sunpath/meeus.mjs comes within 5 s of them
  // (scripts/sunpath/turning-data.test.js).
  const R = Math.PI / 180;
  const hav = function (a, b, c, d) {
    const x = Math.sin((c - a) * R / 2) ** 2 + Math.cos(a * R) * Math.cos(c * R) * Math.sin((d - b) * R / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  };
  const nearestKind = function (p, kinds) {
    return gazetteer.places.filter(function (g) { return kinds.test(g[3]); })
      .map(function (g) { return [g[0], hav(p.lat, p.lon, g[1], g[2])]; })
      .sort(function (a, b) { return a[1] - b[1]; })[0];
  };
  const pW26 = T.placeLine(new Date('2026-12-21T20:50:15Z'), gazetteer);
  const islW26 = nearestKind(pW26, /^(ISL|ATOL)/);
  ok(pW26.kind === 'sea' && pW26.place === 'Temoe' && islW26[0] === 'Temoe' && Math.abs(pW26.km - islW26[1]) < 0.5,
    '21 Dec 2026, 20:50:15 UT: over sea, named by the nearest island, Temoe  (' + pW26.place + ', ' + pW26.km + ' km)');
  ok(pW26.km >= 145 && pW26.km <= 160, 'about 150 km from it');
  // Nikunau's own shore (a Natural Earth ring) is a few km nearer than its
  // gazetteer point, and is what the distance is measured to.
  const pA26 = T.placeLine(new Date('2026-09-23T00:05:14Z'), gazetteer);
  ok(pA26.kind === 'sea' && /Nikunau/.test(pA26.place) && pA26.km >= 145 && pA26.km <= 160,
    'autumn 2026, 00:05:14 UT: over sea, about 150 km from Nikunau  (' + pA26.place + ', ' + pA26.km + ' km)');
  ok(pA26.km < nearestKind(pA26, /^ATOL$/)[1], 'measured to the atoll\'s shore, nearer than its centre');
  ok(pA26.country === 'Kiribati' && pW26.country === 'French Polynesia', 'each is named with its country');

  const pW27 = T.placeLine(new Date('2027-12-22T02:42:11Z'), gazetteer);
  const town = nearestKind(pW27, /^PPL/);
  ok(pW27.kind === 'land' && pW27.country === 'Australia', '22 Dec 2027, 02:42:11 UT: over land, Australia');
  ok(pW27.place === 'Boulia' && town[0] === 'Boulia' && Math.abs(pW27.km - town[1]) < 0.5 && pW27.km >= 100 && pW27.km <= 115,
    'named by the nearest populated place, Boulia  (' + pW27.place + ', ' + pW27.km + ' km)');

  // One island 60° from the equator: far outside the ±35° gazetteer band, so
  // a nearer place could exist that the gazetteer never kept.
  const far = { band: 35, places: [['Far Isle', 0, 60, 'ISL', 'MU']], land: [] };
  const eq = instant(2027, 'spring-equinox');
  const pFar = T.placeLine(eq, far);
  ok(pFar.unreliable === true, 'a place farther than the band can vouch for is marked unreliable');
  const jizoji = C.templePlace(temples.find(function (t) { return t.n === 5; }));
  const menuFar = T.claimMenu({ key: 'spring-equinox', instant: eq, recent: recent(2027, 'spring-equinox'), gazetteer: far, temple: jizoji });
  ok(menuFar.lead !== 'place' && menuFar.claims.some(function (c) { return c.id === menuFar.lead; }),
    'and an unreliable place line never becomes the default lead  (lead: ' + menuFar.lead + ')');
  ok(pW26.unreliable === false && T.claimMenu({ key: 'winter-solstice', instant: instant(2026, 'winter-solstice'), recent: recent(2026, 'winter-solstice'), gazetteer: gazetteer }).lead === 'place',
    'a reliable place line is the default lead');

  console.log('\n=== the claim menu, checked against outside formulas ===\n');

  const menus = {};
  [2026, 2027, 2028].forEach(function (y) {
    KEYS.forEach(function (k) {
      const n = C.templeNumber(y, k);
      const temple = C.templePlace(temples.find(function (t) { return t.n === n; }));
      menus[y + ' ' + k] = T.claimMenu({ key: k, instant: instant(y, k), recent: recent(y, k), gazetteer: gazetteer, temple: temple });
    });
  });
  const claim = function (y, k, id) { return menus[y + ' ' + k].claims.find(function (c) { return c.id === id; }); };

  // Kepler's second law gives the sun's speed along the ecliptic; near a
  // solstice the declination is a parabola, delta = tan(eps) (lambda' t)^2 / 2.
  // Mean motion 0.98560028°/day, e 0.016709, perihelion longitude 283.0°
  // (282.94° at J2000, +0.017°/yr), obliquity 23.436°.
  const EPS = 23.436 * R;
  function lambdaRate(lambdaDeg) {
    const e = 0.016709, nu = (lambdaDeg - 283.0) * R;
    return 0.98560028 * Math.pow(1 + e * Math.cos(nu), 2) / Math.pow(1 - e * e, 1.5);
  }
  function solsticeDayDeg(lambdaDeg) { const w = lambdaRate(lambdaDeg) * R; return Math.tan(EPS) * w * w / 2 / R; }
  function equinoxDayDeg(lambdaDeg) { return Math.sin(EPS) * lambdaRate(lambdaDeg); }

  const mJ27 = claim(2027, 'summer-solstice', 'motion');
  near(Number(mJ27.values.deg), 0.0035, 0.0003, 'June 2027 solstice: the sun moves about 0.0035° north–south in the day after (plan figure)');
  near(Number(mJ27.values.deg), solsticeDayDeg(90), 0.0001, 'June 2027 solstice: matches Kepler\'s parabola');
  const mD26 = claim(2026, 'winter-solstice', 'motion');
  near(Number(mD26.values.deg), solsticeDayDeg(270), 0.0001, 'December 2026 solstice: matches Kepler\'s parabola (faster near perihelion)');
  near(Number(mD26.values.eqDeg), equinoxDayDeg(180), 0.01, 'and the September equinox it is set against moves about 0.39° a day');
  const mM27 = claim(2027, 'spring-equinox', 'motion');
  near(Number(mM27.values.deg), equinoxDayDeg(0), 0.01, 'March 2027 equinox: about 0.39° a day');

  // USNO Earth's Seasons (aa.usno.navy.mil/api/seasons, fetched
  // 2026-10-26): 21 Dec 2026 20:50 UT, 20 Mar 2027 20:25 UT, so the
  // northern winter of 2026–27 lasts 88 d 23 h 35 min.
  const sM27 = claim(2027, 'spring-equinox', 'season');
  const usnoWinter = (Date.UTC(2027, 2, 20, 20, 25) - Date.UTC(2026, 11, 21, 20, 50)) / 60000;
  const coreWinter = Number(sM27.values.days) * 1440 + Number(sM27.values.hours) * 60 + Number(sM27.values.minutes);
  ok(sM27.values.days === 88 && sM27.values.hours === 23, 'winter 2026–27 lasted 88 days 23 hours  (' + sM27.values.days + ' d ' + sM27.values.hours + ' h)');
  near(coreWinter, usnoWinter, 10, 'within 10 minutes of USNO\'s published instants (minutes)');
  ok(/shortest/.test(T.renderClaim(sM27.template, sM27.values)), 'and it is named the shortest season  (' + T.renderClaim(sM27.template, sM27.values) + ')');
  const sA27 = claim(2027, 'autumn-equinox', 'season');
  ok(/longest/.test(T.renderClaim(sA27.template, sA27.values)), 'the northern summer, June to September, is named the longest');
  ok(!/shortest|longest/.test(T.renderClaim(claim(2027, 'summer-solstice', 'season').template, claim(2027, 'summer-solstice', 'season').values)),
    'spring, March to June, is neither');

  // Near a solstice the sunrise azimuth at 40°N moves by dA = cos(delta) /
  // (cos(phi) sin(A)) d(delta); one sun-width (32', 0.533°) of azimuth is
  // that much declination, and the parabola above says how long it takes.
  function stillDays(lambdaDeg) {
    const phi = 40 * R, dec = (lambdaDeg === 90 ? 1 : -1) * EPS;
    const A = Math.acos(Math.sin(dec) / Math.cos(phi));
    const dDec = 0.533 * R * Math.cos(phi) * Math.sin(A) / Math.cos(dec);
    const t = Math.sqrt(2 * dDec / Math.tan(EPS)) / (lambdaRate(lambdaDeg) * R);
    return 2 * t;
  }
  const rD26 = claim(2026, 'winter-solstice', 'sunrise');
  ok(rD26.values.days === 19, 'December 2026: at 40°N the sunrise stays within one sun-width for 19 days  (' + rD26.values.days + ')');
  ok(rD26.values.days === Math.floor(stillDays(270)), 'matching the parabola  (' + stillDays(270).toFixed(2) + ' days)');
  const rJ27 = claim(2027, 'summer-solstice', 'sunrise');
  ok(rJ27.values.days === Math.floor(stillDays(90)), 'June 2027: ' + rJ27.values.days + ' days, matching the parabola  (' + stillDays(90).toFixed(2) + ')');
  ok(!claim(2027, 'spring-equinox', 'sunrise'), 'an equinox has no sunrise-stillness claim');

  // Laskar 1986 (Meeus 22.3), independent of js/sunpath-math.js's series.
  function laskar(year) {
    const U = (year - 2000) / 10000;
    const c = [-4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45];
    let s = 84381.448, p = 1;
    for (let i = 0; i < c.length; i++) { p *= U; s += c[i] * p; }
    return s / 3600;
  }
  const tD26 = claim(2026, 'winter-solstice', 'tropic');
  near(tD26.values.km, (laskar(-240) - laskar(2026)) * R * 6371, 1, 'the Tropic has crept about 32 km since Eratosthenes (Laskar), km');
  ok(/Capricorn/.test(tD26.template) && /Cancer/.test(claim(2027, 'summer-solstice', 'tropic').template),
    'December names the Tropic of Capricorn, June the Tropic of Cancer');

  // JPL Horizons, airless apparent, topocentric London 51.5074N 0.1278W
  // (fetched 2026-10-26): the moon culminates 63.035° up at 21:45 UT on
  // 21 Dec 2026; the sun stood 61.929° up at 12:02–12:03 UT on 21 Jun 2026.
  const moon26 = claim(2026, 'winter-solstice', 'moon');
  ok(!!moon26, 'December 2026: the solstice-night moon over London is notable');
  near(Number(moon26 && moon26.values.moon), 63.035, 0.15, 'its meridian height matches JPL Horizons');
  near(Number(moon26 && moon26.values.sun), 61.929, 0.1, 'and the midsummer noon sun it beats matches too');
  ok(!claim(2027, 'winter-solstice', 'moon'), 'December 2027: a moon that culminates at dawn, 23° up, is not notable');
  ok(!claim(2027, 'spring-equinox', 'moon'), 'an equinox carries no moon claim');

  console.log('\n=== claim templates and their slots ===\n');

  let all = [];
  Object.keys(menus).forEach(function (k) { all = all.concat(menus[k].claims); });
  ok(all.every(function (c) { return !T.hasDigitsOutsideSlots(c.template); }), 'no computed template has a digit outside its slots  (' + all.length + ' claims)');
  ok(all.every(function (c) { return typeof c.source === 'string' && c.source.length > 0; }), 'every claim names its source');
  ok(all.every(function (c) { return T.renderClaim(c.template, c.values).indexOf('{') < 0; }), 'every claim renders with all its slots filled');
  ok(T.hasDigitsOutsideSlots('about 120 km from {place}'), 'a typed number outside the slots is caught');
  ok(T.hasDigitsOutsideSlots('about １２０ km from {place}'), 'so is one typed in full-width digits');
  ok(!T.hasDigitsOutsideSlots('about {km} km from {place}'), 'slots alone pass');
  ok(T.renderClaim('about {km} km from {place}.', { km: 120, place: 'Temoe' }) === 'about 120 km from Temoe.', 'renderClaim fills the slots');
  let threw = false;
  try { T.renderClaim('about {km} km from {place}.', { km: 120 }); } catch (e) { threw = /place/.test(e.message); }
  ok(threw, 'renderClaim refuses a slot it has no value for');

  const placeClaim = claim(2026, 'winter-solstice', 'place');
  ok(/turned north/.test(placeClaim.template), 'December: the sun "turned north"');
  ok(/turned south/.test(claim(2027, 'summer-solstice', 'place').template), 'June: "turned south"');
  ok(/crossed the equator heading south/.test(claim(2026, 'autumn-equinox', 'place').template), 'September: "crossed the equator heading south"');
  ok(/crossed the equator heading north/.test(claim(2027, 'spring-equinox', 'place').template), 'March: "crossed the equator heading north"');
  ok(/^The sun turned north over open sea, about \d+0\u00a0km from Temoe, French Polynesia\.$/.test(T.renderClaim(placeClaim.template, placeClaim.values)),
    'the 21 Dec 2026 place line  (' + T.renderClaim(placeClaim.template, placeClaim.values) + ')');
  ok(claim(2026, 'winter-solstice', 'moon').values.moon === '63.0' && claim(2026, 'winter-solstice', 'motion').values.deg === '0.0039' &&
    claim(2027, 'spring-equinox', 'motion').values.deg === '0.40', 'numbers keep their stated precision  (63.0°, 0.0039°, 0.40°)');

  // At declination 0 the shadow tip runs the equinoctial line, due east;
  // with declination d it bends toward the sunrise and sunset shadows,
  // about d / cos(latitude) off east. On the plate's day d stays within
  // half a degree of 0, so with refraction near the horizon the tip keeps
  // within a degree of due east. A solstice tip swings tens of degrees.
  [2026, 2027, 2028].forEach(function (y) {
    ['spring-equinox', 'autumn-equinox'].forEach(function (k) {
      const s = claim(y, k, 'straight');
      ok(s && +s.values.deg > 0.1 && +s.values.deg <= 1 && /due east/.test(s.template) && !T.hasDigitsOutsideSlots(s.template),
        y + ' ' + k + ': the shadow tip runs due east to within ' + (s && s.values.deg) + '°  (' + (s && T.renderClaim(s.template, s.values)) + ')');
    });
    ['summer-solstice', 'winter-solstice'].forEach(function (k) {
      ok(!claim(y, k, 'straight'), y + ' ' + k + ': no straight-line claim at a solstice');
    });
  });
  ok(/\u00a0km/.test(claim(2027, 'winter-solstice', 'place').template) && /\u00a0km/.test(claim(2026, 'winter-solstice', 'place').template),
    'a place line keeps its number and "km" on one line');

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
