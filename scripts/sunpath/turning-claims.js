/* =============================================
   The turning leaf — the place under the sun and the claim menu

   Build-only. scripts/sunpath/year.mjs computes each turning's claims
   here and stores them in its data file; scripts/sunpath/build-permalinks.mjs
   checks the chosen lead with hasDigitsOutsideSlots. The page never loads
   this file or the gazetteer it reads, so neither weighs on the plate.

   Tested in scripts/sunpath/turning-claims.test.js.
   ============================================= */

'use strict';

var M = require('../../js/sunpath-math.js');
var C = require('../../js/turning-leaf-core.js');

var DEG = Math.PI / 180;
var DAY_MS = 86400000;
var MIN_MS = 60000;

function f1(n) { return Math.round(n * 10) / 10; }
function wrap180(d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d === -180 ? 180 : d; }

// --- the place under the sun (KTD6) ---

var KM_PER_DEG = 6371 * DEG;
// An island's own shore lies within this of its gazetteer point; a coast
// farther off belongs to other land, and quoting its distance beside the
// island's name would be false.
var SHORE_KM = 25;

function hav(lat1, lon1, lat2, lon2) {
  var a = Math.pow(Math.sin((lat2 - lat1) * DEG / 2), 2) +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.pow(Math.sin((lon2 - lon1) * DEG / 2), 2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}
function overLand(land, lat, lon) {
  var inside = false;
  land.forEach(function (ring) {
    for (var i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) {
      var xi = ring[2 * i], yi = ring[2 * i + 1], xj = ring[2 * j], yj = ring[2 * j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
  });
  return inside;
}
// Nearest point on any land-ring edge, on a flat projection about the
// point; each segment is unwrapped from its own first vertex so an edge
// never spans the projection's seam.
function nearestShore(land, lat, lon) {
  var kx = Math.cos(lat * DEG) * KM_PER_DEG, ky = KM_PER_DEG, best = Infinity, at = null;
  land.forEach(function (ring) {
    for (var i = 0, n = ring.length / 2; i < n; i++) {
      var j = (i + 1) % n;
      var ax = wrap180(ring[2 * i] - lon) * kx, ay = (ring[2 * i + 1] - lat) * ky;
      var bx = ax + wrap180(ring[2 * j] - ring[2 * i]) * kx, by = (ring[2 * j + 1] - lat) * ky;
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      var px = ax + u * dx, py = ay + u * dy, d = px * px + py * py;
      if (d < best) { best = d; at = { lat: lat + py / ky, lon: lon + px / kx }; }
    }
  });
  return at && { lat: at.lat, lon: at.lon, km: hav(lat, lon, at.lat, at.lon) };
}
function nearestOf(places, test, lat, lon) {
  var best = null;
  places.forEach(function (p) {
    if (!test.test(p[3])) return;
    var d = hav(lat, lon, p[1], p[2]);
    if (!best || d < best.km) best = { name: p[0], lat: p[1], lon: p[2], cc: p[4], km: d };
  });
  return best;
}

var regions = null;
function countryName(cc) {
  if (!cc) return '';
  regions = regions || new Intl.DisplayNames(['en'], { type: 'region' });
  return regions.of(cc);
}
// "over the United Arab Emirates", "over Australia".
function withArticle(name) {
  return /^(United |Central African|Dominican)|Islands$|Republic$|^(Philippines|Netherlands|Bahamas|Maldives|Comoros|Gambia|Seychelles)$/.test(name) ? 'the ' + name : name;
}

// gazetteer: scripts/sunpath/data/places.json (build only).
function placeLine(instant, gazetteer) {
  var s = M.subsolarPoint(instant);
  var land = overLand(gazetteer.land, s.lat, s.lon);
  var hit, km;
  if (land) {
    hit = nearestOf(gazetteer.places, /^PPL/, s.lat, s.lon);
    km = hit.km;
  } else {
    hit = nearestOf(gazetteer.places, /^(ISL|ATOL)/, s.lat, s.lon);
    var shore = nearestShore(gazetteer.land, s.lat, s.lon);
    km = shore && shore.km < hit.km && hav(shore.lat, shore.lon, hit.lat, hit.lon) <= SHORE_KM ? shore.km : hit.km;
  }
  var country = countryName(hit.cc);
  return {
    lat: s.lat, lon: s.lon,
    kind: land ? 'land' : 'sea',
    place: hit.name,
    country: country,
    region: withArticle(country),
    km: f1(km),
    // Past the band's edge a nearer place may exist that the gazetteer
    // never kept, so the line cannot vouch for "nearest".
    unreliable: km > (gazetteer.band - Math.abs(s.lat)) * 111
  };
}

// --- the claim menu (KTD4) ---

var TURNED = {
  'spring-equinox': 'crossed the equator heading north',
  'summer-solstice': 'turned south',
  'autumn-equinox': 'crossed the equator heading south',
  'winter-solstice': 'turned north'
};
var HEADING = { 'spring-equinox': 'north', 'summer-solstice': 'south', 'autumn-equinox': 'south', 'winter-solstice': 'north' };
var NAMED = {
  'spring-equinox': 'March equinox', 'summer-solstice': 'June solstice',
  'autumn-equinox': 'September equinox', 'winter-solstice': 'December solstice'
};
var LONDON = { lat: 51.5074, lon: -0.1278 };
var SUN_WIDTH = 0.533;
var ERATOSTHENES_YEAR = -240;
var SOURCE_SUN = 'Sun position: NOAA solar series (Meeus), js/sunpath-math.js.';

function round10(km) { return Math.round(km / 10) * 10; }
// Strings, so a claim prints 0.40° and 63.0° rather than 0.4° and 63°.
function sig2(x) { return x.toPrecision(2); }
function isSolstice(key) { return /solstice/.test(key); }

function dailyMotion(instant) {
  return Math.abs(M.declination(new Date(+instant + DAY_MS)) - M.declination(instant));
}

// How long the sunrise at `lat` stays within one sun-width of its
// solstice azimuth: the edge each side, found by bisection.
function stillSpan(instant, lat) {
  var a0 = M.sunriseAzimuth(lat, instant);
  function edge(dir) {
    var lo = 0, hi = 40;
    for (var i = 0; i < 50; i++) {
      var mid = (lo + hi) / 2;
      if (Math.abs(M.sunriseAzimuth(lat, new Date(+instant + dir * mid * DAY_MS)) - a0) <= SUN_WIDTH) lo = mid; else hi = mid;
    }
    return lo;
  }
  return edge(-1) + edge(1);
}

function sunAltAt(date, place) { return C.sunAltAz(date, place.lat, place.lon).alt; }

// The moon's highest crossing of London's meridian within a day of the
// instant, while the sun is down there.
function moonCulmination(instant) {
  var alt = function (t) { return M.moonAltAzAt(new Date(t), LONDON.lat, LONDON.lon).altitude; };
  var best = null, step = 10 * MIN_MS, t0 = +instant - DAY_MS / 2, track = [];
  for (var s = 0; s <= 144; s++) track.push(alt(t0 + s * step));
  for (var k = 1; k < 144; k++) {
    if (!(track[k] >= track[k - 1] && track[k] > track[k + 1])) continue;
    var t = t0 + k * step, lo = t - step, hi = t + step;
    while (hi - lo > 1000) {
      var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (alt(m1) < alt(m2)) lo = m1; else hi = m2;
    }
    var at = (lo + hi) / 2, a = alt(at);
    if (a > 0 && sunAltAt(new Date(at), LONDON) < 0 && (!best || a > best.alt)) best = { alt: a, t: at };
  }
  return best;
}

// t: { key, instant, recent: the four turning instants before this one,
// oldest first, gazetteer }.
function claimMenu(t) {
  var key = t.key, instant = t.instant, prev = t.recent[3];
  var solstice = isSolstice(key);
  var prevName = NAMED[C.TURNINGS[(C.TURNINGS.indexOf(key) + 3) % 4]];
  var claims = [];

  var p = placeLine(instant, t.gazetteer);
  var placeClaim = p.kind === 'sea'
    ? { template: 'The sun ' + TURNED[key] + ' over open sea, about {km} km from {place}' + (p.country ? ', {country}.' : '.'),
        values: { km: round10(p.km), place: p.place, country: p.country } }
    : { template: 'The sun ' + TURNED[key] + ' over {region}, {km} km from {place}.',
        values: { km: round10(p.km), place: p.place, region: p.region } };
  claims.push({
    id: 'place', template: placeClaim.template, values: placeClaim.values, unreliable: p.unreliable,
    source: SOURCE_SUN + ' Nearest land: GeoNames (CC BY 4.0) and Natural Earth (public domain).'
  });

  var deg = sig2(dailyMotion(instant)), other = sig2(dailyMotion(prev));
  claims.push(solstice
    ? { id: 'motion', template: 'The day after this solstice, the sun moved {deg}° ' + HEADING[key] + '; the day after the ' + prevName + ', {eqDeg}°.',
        values: { deg: deg, eqDeg: other }, source: SOURCE_SUN + ' Declination one day after each instant.' }
    : { id: 'motion', template: 'The day after this equinox, the sun moved {deg}° ' + HEADING[key] + '; the day after the ' + prevName + ', just {solDeg}°.',
        values: { deg: deg, solDeg: other }, source: SOURCE_SUN + ' Declination one day after each instant.' });

  var len = +instant - +prev;
  var others = [1, 2, 3].map(function (i) { return +t.recent[i] - +t.recent[i - 1]; });
  var rank = others.every(function (o) { return len < o; }) ? ', the shortest of the year\'s four seasons'
    : others.every(function (o) { return len > o; }) ? ', the longest of the year\'s four seasons' : '';
  var mins = Math.floor(len / MIN_MS);
  claims.push({
    id: 'season',
    template: 'From the ' + prevName + ' to this ' + (solstice ? 'solstice' : 'equinox') + ', {days} days and {hours} hours' + rank + '.',
    values: { days: Math.floor(mins / 1440), hours: Math.floor(mins % 1440 / 60), minutes: mins % 60 },
    source: 'Turning instants: Meeus, Astronomical Algorithms, ch. 27.'
  });

  if (solstice) {
    claims.push({
      id: 'sunrise',
      template: 'At {lat}°N the sunrise stays within one sun-width of its ' + (key === 'winter-solstice' ? 'southernmost' : 'northernmost') + ' point for {days} days around this solstice.',
      values: { lat: 40, days: Math.floor(stillSpan(instant, 40)) },
      source: SOURCE_SUN + ' One sun-width is the sun\'s mean diameter, ' + SUN_WIDTH + '°.'
    });
  }

  var drift = Math.round((M.obliquity(ERATOSTHENES_YEAR) - M.obliquity(new Date(instant).getUTCFullYear())) * KM_PER_DEG);
  var tropic = key === 'winter-solstice' ? 'the Tropic of Capricorn has' : key === 'summer-solstice' ? 'the Tropic of Cancer has' : 'each tropic has';
  claims.push({
    id: 'tropic',
    template: 'Since Eratosthenes measured the sun at Syene, around {bc} BC, ' + tropic + ' crept {km} km toward the equator.',
    values: { bc: -ERATOSTHENES_YEAR, km: drift },
    source: 'Obliquity of the ecliptic: Meeus 22.2, js/sunpath-math.js.'
  });

  if (solstice) {
    // Against the noon sun at the opposite solstice, which the four
    // instants before this one include.
    var opposite = t.recent[2];
    var noon = f1(90 - Math.abs(LONDON.lat - M.declination(opposite)));
    var moon = moonCulmination(instant);
    var moonAlt = moon && f1(moon.alt);
    var winter = key === 'winter-solstice';
    if (moon && (winter ? moonAlt > noon : moonAlt < noon)) {
      claims.push({
        id: 'moon',
        template: winter
          ? 'On the night of this solstice the moon crossed London\'s meridian {moon}° up, higher than the midsummer noon sun at {sun}°.'
          : 'On the night of this solstice the moon crossed London\'s meridian just {moon}° up, lower than the midwinter noon sun at {sun}°.',
        values: { moon: moonAlt.toFixed(1), sun: noon.toFixed(1) },
        source: 'Moon: Meeus ch. 47, topocentric, js/sunpath-math.js. ' + SOURCE_SUN
      });
    }
  }

  // Without a pick the place line leads (R10), unless it cannot vouch for
  // its own "nearest".
  var lead = p.unreliable ? claims[1].id : 'place';
  return { claims: claims, lead: lead };
}

function renderClaim(template, values) {
  return template.replace(/\{(\w+)\}/g, function (_, k) {
    if (!values || values[k] === undefined || values[k] === null) throw new Error('claim slot {' + k + '} has no value');
    return String(values[k]);
  });
}
// AE12: every number in a claim comes from its slots.
function hasDigitsOutsideSlots(template) {
  return /[0-9０-９]/.test(template.replace(/\{\w+\}/g, ''));
}

module.exports = {
  placeLine: placeLine,
  claimMenu: claimMenu,
  renderClaim: renderClaim,
  hasDigitsOutsideSlots: hasDigitsOutsideSlots
};
