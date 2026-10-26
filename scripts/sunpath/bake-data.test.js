/* =============================================
   The turning leaf's baked data — temples and sky days

   Run via:  node scripts/sunpath/bake-data.test.js

   Reads only the committed JSON, never ../open-pilgrimages or
   ../photos, so it passes on a checkout without the siblings.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ASSETS = path.resolve(__dirname, '..', '..', 'assets', 'sunpath');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}
function readAsset(name) {
  const fp = path.join(ASSETS, name);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
function isCalendarDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
}

const ROMAJI_RE = /^[A-Za-zĀāĒēĪīŌōŪū' -]+$/;
const KANJI_RE = /^[\u3400-\u9fff]+$/;

console.log('\n=== temples ===\n');

const templesAsset = readAsset('temples.json');
ok(templesAsset !== null, 'assets/sunpath/temples.json is committed');
const temples = (templesAsset && templesAsset.temples) || [];
const byNumber = {};
temples.forEach(function (t) { byNumber[t.n] = t; });

eq(temples.length, 88, 'there are exactly 88 temples');
eq(temples.map(function (t) { return t.n; }).join(','),
  Array.from({ length: 88 }, function (_, i) { return i + 1; }).join(','),
  'they are numbered 1–88 in walking order');
ok(temples.length > 0 && temples.every(function (t) { return typeof t.name === 'string' && ROMAJI_RE.test(t.name); }),
  'every temple has a romaji name');
ok(temples.length > 0 && temples.every(function (t) { return typeof t.ja === 'string' && KANJI_RE.test(t.ja); }),
  'every temple has a kanji name');
ok(temples.length > 0 && temples.every(function (t) { return typeof t.lat === 'number' && t.lat >= 32.7 && t.lat <= 34.4; }),
  'every temple stands within 32.7–34.4°N');
ok(temples.length > 0 && temples.every(function (t) { return typeof t.lon === 'number' && isFinite(t.lon); }),
  'every temple has a longitude');

eq(byNumber[1] && byNumber[1].ja, '霊山寺', 'Temple 1 is Ryōzen-ji, where the walk begins');
eq(byNumber[4] && byNumber[4].name, 'Dainichi-ji', 'Temple 4 is Dainichi-ji');
eq(byNumber[13] && byNumber[13].name, 'Dainichi-ji', 'Temple 13 is Dainichi-ji too');
ok(!!(byNumber[4] && byNumber[13]) &&
  (byNumber[4].lat !== byNumber[13].lat || byNumber[4].lon !== byNumber[13].lon),
  'the two Dainichi-ji stand in different places, so the walk is keyed by number');
eq(byNumber[88] && byNumber[88].ja, '大窪寺', 'Temple 88 is Ōkubo-ji, where the walk closes');

const ts = (templesAsset && templesAsset.source) || {};
eq(ts.repo, 'walktalkmeditate/open-pilgrimages', 'the temples name their source repo');
ok(/^[0-9a-f]{40}$/.test(ts.commit || ''), 'the temples record their source commit');
eq(ts.license, 'ODbL-1.0', 'the temples carry the ODbL licence');
ok(/Open Pilgrimages/.test(ts.attribution || '') && /OpenStreetMap contributors/.test(ts.attribution || ''),
  'the temples carry the attribution the ODbL source requires');

console.log('\n=== sky days ===\n');

const skyAsset = readAsset('sky-days.json');
ok(skyAsset !== null, 'assets/sunpath/sky-days.json is committed');
const days = (skyAsset && skyAsset.days) || [];
const dates = days.map(function (d) { return d[0]; });

ok(days.length > 0, 'there are sky days');
ok(days.every(function (d) { return Array.isArray(d) && d.length === 3; }),
  'each day is [date, colour, time]');
ok(dates.every(isCalendarDate), 'every date is a real YYYY-MM-DD date');
ok(dates.every(function (d, i) { return i === 0 || dates[i - 1] < d; }),
  'days are sorted with one per date, so no count photo shares a sky date');
ok(days.every(function (d) { return /^#[0-9a-f]{6}$/.test(d[1]); }), 'every colour is a #rrggbb hex');
ok(days.every(function (d) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(d[2]); }), 'every time is HH:MM');
eq(dates[0], '2026-05-04', 'the photos begin on 4 May 2026');
ok(dates.length > 0 && dates.indexOf('2026-07-18') === -1, '2026-07-18 has no sky photo and is absent');

const ss = (skyAsset && skyAsset.source) || {};
eq(ss.repo, 'momentmaker/ig', 'the sky days name their source repo');
ok(/^[0-9a-f]{64}$/.test(ss.manifestHash || ''), 'the sky days record the manifest\'s sha256');
eq(ss.license, 'CC0-1.0', 'the sky days carry the CC0 licence');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
