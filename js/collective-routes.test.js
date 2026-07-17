'use strict';
var C = require('./collective-routes.js');
var passed = 0, failed = 0, failures = [];
function ok(c, label){ if(c){passed++;console.log('  ✓ '+label);} else {failed++;failures.push(label);console.log('  ✗ '+label);} }
function eq(a, e, label){ ok(a === e, label + '  (' + JSON.stringify(a) + ' vs ' + JSON.stringify(e) + ')'); }
function d(s){ return new Date(s + 'T00:00:00Z'); }

var ASSET = {
  pilgrimages: [
    { id:'kumano-kodo',    nameEn:'Kumano Kodo',    km:39,  bestMonths:[3,4,5,10,11], peakMonths:[4,5,10,11], reflections:['What did you leave behind at the gate?'], annual:{count:44540,year:2024,metricNote:'Foreign overnight visitors in Hongu area',source:'x'} },
    { id:'camino-frances', nameEn:'Camino Francés',  km:764, bestMonths:[5,6,9,10],    peakMonths:[7,8],       reflections:['r1'], annual:null }
  ],
  horizons: [
    { id:'around-earth', preposition:'around', body:'the Earth', km:40075,     kind:'cosmic' },
    { id:'to-the-moon',  preposition:'to',     body:'the Moon',  km:384400,    kind:'cosmic' },
    { id:'to-the-sun',   preposition:'to',     body:'the Sun',   km:149600000, kind:'cosmic' }
  ]
};

console.log('\n=== selection ===\n');
eq(C.weightFor(ASSET.pilgrimages[0], 10), 6, 'kumano weight in October (best+peak)');
eq(C.weightFor(ASSET.pilgrimages[0], 7), 1, 'kumano weight in July (off-season)');
eq(C.weightFor(ASSET.horizons[0], 10), 1, 'cosmic weight constant');
// named-id determinism (AC #5): seed(2026-10-07)=20261007; weighted list in October is
//   frances×3 [idx 0..2], kumano×6 [3..8], Earth,Moon,Sun ×1 [9,10,11]; 20261007 % 12 = 3 → kumano.
eq(C.chooseEntry(d('2026-10-07'), ASSET).id, 'kumano-kodo', 'named daily pick (2026-10-07 → kumano-kodo)');
// season distribution (AC #7)
var inSeason = 0;
for (var day = 1; day <= 30; day++) {
  var ds = '2026-10-' + (day < 10 ? '0' + day : day);
  var e = C.chooseEntry(d(ds), ASSET);
  if (e.bestMonths && e.bestMonths.indexOf(10) !== -1) inSeason++;
}
ok(inSeason >= 18, 'October in-season majority (' + inSeason + '/30 ≥ 18)');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { failures.forEach(function(f){console.log('  - '+f);}); process.exit(1); }
