/* =============================================
   The turning data — instants, claims, leads, two years ahead

   Run via:  node scripts/sunpath/turning-data.test.js

   Each turning page leads with a claim computed from its instant, so the
   instant has to be right to the second: a minute moves the point under
   the sun a quarter of a degree of longitude. The reference is JPL
   Horizons, never scripts/sunpath/meeus.mjs itself.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

function load(rel) { return import(pathToFileURL(path.join(ROOT, rel)).href); }
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }

// The instant JPL Horizons puts the sun's apparent geocentric ecliptic
// longitude at 0°, 90°, 180° or 270° (observer table, quantity 31, 1-minute
// steps interpolated; fetched 2026-10-26). Horizons carries ΔT = 69.18 s
// through 2029.
const JPL = [
  [2026, 'spring-equinox', '2026-03-20T14:45:58.6Z'],
  [2026, 'summer-solstice', '2026-06-21T08:24:31.5Z'],
  [2026, 'autumn-equinox', '2026-09-23T00:05:14.3Z'],
  [2026, 'winter-solstice', '2026-12-21T20:50:15.3Z'],
  [2027, 'spring-equinox', '2027-03-20T20:24:42.5Z'],
  [2027, 'summer-solstice', '2027-06-21T14:10:51.2Z'],
  [2027, 'autumn-equinox', '2027-09-23T06:01:44.0Z'],
  [2027, 'winter-solstice', '2027-12-22T02:42:10.6Z'],
  [2028, 'spring-equinox', '2028-03-20T02:17:09.3Z'],
  [2028, 'summer-solstice', '2028-06-20T20:02:01.3Z'],
  [2028, 'autumn-equinox', '2028-09-22T11:45:19.2Z'],
  [2028, 'winter-solstice', '2028-12-21T08:19:40.9Z'],
  [2029, 'spring-equinox', '2029-03-20T08:01:59.7Z']
];

async function main() {
  const meeus = await load('scripts/sunpath/meeus.mjs');

  console.log('\n=== the instants are UT, to the second ===\n');

  // Meeus' chapter 27 series alone gives Terrestrial Time, 42–95 s after
  // these: ΔT plus up to half a minute of its own error.
  JPL.forEach(function (j) {
    const got = meeus.turningInstant(j[0], j[1]);
    const off = (got.getTime() - new Date(j[2]).getTime()) / 1000;
    ok(Math.abs(off) <= 5, j[0] + ' ' + j[1] + ' is within 5 s of JPL Horizons\' ' + j[2].slice(11, 19) + ' UT  (' +
      (off >= 0 ? '+' : '') + off.toFixed(1) + ' s)');
  });

  const year = await load('scripts/sunpath/year.mjs');
  const permalinks = await load('scripts/sunpath/build-permalinks.mjs');
  const gazetteer = readJson('scripts/sunpath/data/places.json');
  const KEYS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];
  const jplAt = function (y, k) { return new Date(JPL.find(function (j) { return j[0] === y && j[1] === k; })[2]); };

  console.log('\n=== a turning\'s data keeps its seconds ===\n');

  const w26 = year.buildTurningData(2026, 'winter-solstice', { gazetteer: gazetteer });
  ok(/^2026-12-21T20:50:\d\dZ$/.test(w26.instantUTC) &&
    Math.abs(new Date(w26.instantUTC) - jplAt(2026, 'winter-solstice')) <= 5000,
    'the 21 Dec 2026 instant is stored to the second, within 5 s of JPL  (' + w26.instantUTC + ')');
  ok(w26.displayDate === '21 December, 20:50 UTC', 'and its display date names the true minute, 20:50  (' + w26.displayDate + ')');
  ok(w26.temple === 4, 'it stands at Temple 4, the fourth turning from the 2026 spring equinox  (' + w26.temple + ')');

  console.log('\n=== AE8: with no lead picked, the place line leads ===\n');

  ok(w26.claims.length > 0 && w26.claims.every(function (c) {
    return typeof c.id === 'string' && typeof c.template === 'string' && c.values && typeof c.source === 'string';
  }), 'the data carries the claim menu, each with id, template, values and source  (' + w26.claims.map(function (c) { return c.id; }).join(', ') + ')');
  ok(JSON.stringify(w26.lead) === JSON.stringify({ claim: 'place' }), 'AE8: the lead is the place line  (' + JSON.stringify(w26.lead) + ')');
  const picked = { claim: 'moon', text: 'The moon over London on solstice night: {moon}°.' };
  const forced = year.buildTurningData(2026, 'winter-solstice', { gazetteer: gazetteer, existing: { lead: picked } });
  ok(JSON.stringify(forced.lead) === JSON.stringify(picked), 'regenerating keeps a lead the user picked and reworded');

  console.log('\n=== AE12: a lead\'s numbers come only from its slots ===\n');

  const place = w26.claims[0];
  const withLead = function (lead) { return [{ year: 2026, key: 'winter-solstice', lead: lead, claims: w26.claims }]; };
  ok(permalinks.leadProblems(withLead({ claim: 'place' })).length === 0, 'the computed place line passes');
  ok(permalinks.leadProblems(withLead({ claim: 'place', text: 'The sun turned north {km} km from {place}.' })).length === 0,
    'a reworded lead that keeps its numbers in slots passes');
  const typed = permalinks.leadProblems(withLead({ claim: 'place', text: 'The sun turned north 150 km from {place}.' }));
  ok(typed.length === 1 && /2026-winter-solstice/.test(typed[0]), 'AE12: a reworded lead with a typed number fails  (' + typed[0] + ')');
  ok(place.id === 'place', 'the place line is the first claim on the menu');

  console.log('\n=== AE7: published pages reach two years ahead ===\n');

  const published = new Set();
  [2026, 2027, 2028].forEach(function (y) { KEYS.forEach(function (k) { published.add(y + '-' + k); }); });
  const at = function (iso) { return permalinks.missingAhead(new Date(iso), published); };
  ok(at('2026-10-26T12:00:00Z').length === 0, 'with 2026–2028 published, the check passes on 26 Oct 2026');
  ok(at('2026-12-21T23:59:00Z').length === 0, 'and on launch day, 2026-12-21T23:59Z');
  const late = at('2027-03-20T08:03:00Z');
  ok(late.length === 1 && late[0] === '2029-spring-equinox',
    'AE7: at 2027-03-20T08:03Z the 2029 spring equinox (08:02 UT) enters the window and is missing  (' + late.join(', ') + ')');

  console.log('\n=== twelve turnings are published, 2026–2028 ===\n');

  [2026, 2027, 2028].forEach(function (y, yi) {
    KEYS.forEach(function (k, ki) {
      const rel = 'assets/sunpath/turnings/' + y + '-' + k + '.json';
      const d = fs.existsSync(path.join(ROOT, rel)) ? readJson(rel) : null;
      const off = d ? Math.abs(new Date(d.instantUTC) - jplAt(y, k)) / 1000 : NaN;
      ok(!!d && /:\d\dZ$/.test(d.instantUTC) && off <= 5 && d.temple === yi * 4 + ki + 1 &&
        Array.isArray(d.claims) && d.claims.length > 0 && !!d.lead && d.claims.some(function (c) { return c.id === d.lead.claim; }) &&
        fs.existsSync(path.join(ROOT, 'sunpath', y + '-' + k, 'index.html')),
        y + ' ' + k + ': data with its instant to the second, Temple ' + (yi * 4 + ki + 1) + ', claims, a lead and a page' +
          (d ? '  (' + d.instantUTC + ', ' + off.toFixed(1) + ' s from JPL)' : ''));
    });
  });
  const ics = fs.readFileSync(path.join(ROOT, 'sunpath', 'turnings-2026.ics'), 'utf8');
  const dt = /UID:turning-winter-solstice-2026@[^\n]*\nDTSTAMP:[^\n]*\nDTSTART:(\d{8}T\d{6}Z)/.exec(ics);
  const dtStart = dt && new Date(dt[1].replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, '$1-$2-$3T$4:$5:$6Z'));
  ok(!!dtStart && Math.abs(dtStart - jplAt(2026, 'winter-solstice')) <= 5000,
    'the calendar starts the 21 Dec 2026 event at its second too  (' + (dt && dt[1]) + ')');

  console.log('\n=== a new year is pinned at the weight the ratchet will measure ===\n');

  // js/page-weight.test.js weighs each page with every script it loads,
  // the globe's lazy ones included; the weight year.mjs pins for a new
  // year must match it, or the next year fails the ratchet on its first run.
  const ratchet = fs.readFileSync(path.join(ROOT, 'js', 'page-weight.test.js'), 'utf8');
  const archive28 = KEYS.map(function (k) { return readJson('assets/sunpath/turnings/2028-' + k + '.json'); });
  archive28.forEach(function (d) {
    const pinned = +new RegExp("'sunpath/2028-" + d.key + "/index.html':\\s*([\\d.]+)").exec(ratchet)[1];
    const kb = year.fullSeasonPageKb(d, archive28);
    ok(Math.abs(kb - pinned) <= 0.05, '2028 ' + d.key + ': pinned at ' + kb.toFixed(2) + ' KB, the ratchet holds ' + pinned + ' KB');
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
}

main().catch(function (e) { console.error(e); process.exit(1); });
