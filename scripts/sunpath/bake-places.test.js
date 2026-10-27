/* =============================================
   The place gazetteer bake

   Run via:  node scripts/sunpath/bake-places.test.js

   Reads only the committed scripts/sunpath/data/places.json, never the
   raw downloads. The place line must be able to name the small atolls
   the sun turns over, so each pinned place is looked for by name at its
   published position (Wikipedia's coordinates, rounded): a Baker Island
   off Melbourne would not do for the one on the equator. Names are
   matched as words with accents set aside, because GeoNames spells some
   in French and some without their accents: Île Mangareva, Reunion.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'places.json'), 'utf8'));

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function plain(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function overLand(lat, lon) {
  let inside = false;
  for (const ring of data.land) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[2 * i], yi = ring[2 * i + 1];
      const xj = ring[2 * j], yj = ring[2 * j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

console.log('\n=== the pinned places are there by name ===\n');

const PINNED = [
  { label: 'Temoe atoll', name: /\bTemoe\b/, lat: -23.333, lon: -134.483, kinds: /^(ATOL|ISL)$/ },
  { label: 'Mangareva', name: /\bMangareva\b/, lat: -23.117, lon: -134.967, kinds: /^(ATOL|ISL)$/ },
  { label: 'Nikunau', name: /\bNikunau\b/, lat: -1.35, lon: 176.45, kinds: /^(ATOL|ISL)$/ },
  { label: 'Howland', name: /\bHowland\b/, lat: 0.807, lon: -176.618, kinds: /^(ATOL|ISL)$/ },
  { label: 'Baker', name: /\bBaker\b/, lat: 0.195, lon: -176.479, kinds: /^(ATOL|ISL)$/ },
  { label: 'Réunion', name: /\bReunion\b/, lat: -21.114, lon: 55.533, kinds: /^(ATOL|ISL)$/ },
  { label: 'Boulia', name: /^Boulia$/, lat: -22.9, lon: 139.9, kinds: /^PPL/ }
];

PINNED.forEach(function (want) {
  const hit = data.places.find(function (p) {
    return want.name.test(plain(p[0])) && want.kinds.test(p[3]) && km(p[1], p[2], want.lat, want.lon) < 20;
  });
  ok(!!hit, want.label + ' is named within 20 km of ' + want.lat + ', ' + want.lon +
    (hit ? '  (' + JSON.stringify(hit) + ')' : ''));
});

console.log('\n=== the band ===\n');

const outside = data.places.filter(function (p) { return Math.abs(p[1]) > 35; });
ok(data.places.length > 0 && outside.length === 0,
  'all ' + data.places.length + ' places lie within ±35°' + (outside.length ? '  (first outside: ' + JSON.stringify(outside[0]) + ')' : ''));

const strayRings = data.land.filter(function (ring) {
  let lo = 90, hi = -90;
  for (let i = 1; i < ring.length; i += 2) { lo = Math.min(lo, ring[i]); hi = Math.max(hi, ring[i]); }
  return hi < -35 || lo > 35;
});
ok(data.land.length > 0 && strayRings.length === 0, 'all ' + data.land.length + ' land rings reach into ±35°');

console.log('\n=== over land, over sea ===\n');

ok(overLand(-22.9, 139.9), 'Boulia, in the Queensland outback, is over land');
ok(overLand(-21.114, 55.533), 'the middle of Réunion is over land');
ok(!overLand(-23.44, -133.0), 'the Pacific 150 km east of Temoe is over sea');
ok(!overLand(0, 0), 'the Gulf of Guinea at 0°, 0° is over sea, not Natural Earth\'s joke Null Island');

console.log('\n=== provenance ===\n');

const geonames = data.source.find(function (s) { return s.name === 'GeoNames'; });
const ne = data.source.find(function (s) { return s.name === 'Natural Earth'; });
ok(!!geonames && geonames.license === 'CC BY 4.0' && /GeoNames/.test(geonames.attribution) && /CC BY 4\.0/.test(geonames.attribution),
  'GeoNames is credited under CC BY 4.0');
ok(!!ne && ne.license === 'public domain' && /Natural Earth/.test(ne.attribution) && /public domain/.test(ne.attribution),
  'Natural Earth is credited as public domain');
data.source.forEach(function (s) {
  ok(/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved), s.name + ' records the day it was retrieved  (' + s.retrieved + ')');
  ok(s.files.length > 0 && s.files.every(function (f) { return /^[0-9a-f]{64}$/.test(f.sha256); }),
    s.name + ' records the sha256 of every file baked from');
});

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
