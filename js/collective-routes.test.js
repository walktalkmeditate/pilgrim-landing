'use strict';
var C = require('./collective-routes.js');
var passed = 0, failed = 0, failures = [];
function ok(c, label){ if(c){passed++;console.log('  ✓ '+label);} else {failed++;failures.push(label);console.log('  ✗ '+label);} }
function eq(a, e, label){ ok(a === e, label + '  (' + JSON.stringify(a) + ' vs ' + JSON.stringify(e) + ')'); }
function d(s){ return new Date(s + 'T00:00:00Z'); }

var ASSET = {
  pilgrimages: [
    { id:'kumano-kodo',    nameEn:'Kumano Kodo',    km:39,  bestMonths:[3,4,5,10,11], peakMonths:[4,5,10,11], reflections:['R0 at the gate?','R1 in the mist?'], annual:{count:44540,year:2024,metricNote:'Foreign overnight visitors in Hongu area',source:'x'} },
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
// peak-gate lock: the peak bonus only applies when the month is ALSO a best month.
var CAMINO_SHAPED = { id:'camino-shaped', km:700, bestMonths:[5,6,9], peakMonths:[7,8] };
eq(C.weightFor(CAMINO_SHAPED, 7), 1, 'peak-not-best (Jul) → base only, gated');
eq(C.weightFor(CAMINO_SHAPED, 5), 3, 'best-not-peak (May) → base+best');
eq(C.weightFor(ASSET.pilgrimages[0], 10), 6, 'kumano Oct still best AND peak → 6 (unchanged)');
// sparse fixture: no bestMonths/peakMonths/reflections/annual keys at all
eq(C.weightFor({id:'sparse',km:100}, 7), 1, 'sparse entry → base weight only');
eq(C.seasonLineFor({id:'sparse',km:100}, 7), null, 'sparse entry → no season line');
eq(C.reflectionFor({id:'sparse',km:100,reflections:[]}, 9), null, 'sparse entry (empty reflections) → no reflection');
eq(C.annualLineFor({id:'sparse',km:100}), null, 'sparse entry → no annual line');
// named-id determinism (AC #5): seed(2026-10-07)=20261007; hashSeed(20261007)=3837869072, %12=8;
//   weighted list in October is frances×3 [idx 0..2], kumano×6 [3..8], Earth,Moon,Sun ×1 [9,10,11];
//   index 8 falls within kumano's [3..8] range → kumano.
eq(C.chooseEntry(d('2026-10-07'), ASSET).id, 'kumano-kodo', 'named daily pick (2026-10-07 → kumano-kodo)');
// season distribution (AC #7): recomputed after hashing + peak-gating; still an in-season majority.
var inSeason = 0;
for (var day = 1; day <= 30; day++) {
  var ds = '2026-10-' + (day < 10 ? '0' + day : day);
  var e = C.chooseEntry(d(ds), ASSET);
  if (e.bestMonths && e.bestMonths.indexOf(10) !== -1) inSeason++;
}
eq(inSeason, 26, 'October in-season majority (26/30 days pick an in-season route)');

console.log('\n=== phrasing ===\n');
var K = ASSET.pilgrimages[0], F = ASSET.pilgrimages[1];
var EARTH = ASSET.horizons[0], MOON = ASSET.horizons[1], SUN = ASSET.horizons[2];
eq(C.phraseFor(K, 694.5).label, "Together, we've walked the Kumano Kodo 17 times.", 'kumano 17 times');
eq(C.phraseFor({nameEn:'Test Route', km:500}, 694.5).label, 'Together, one Test Route complete.', 'floor==1 → one complete');
eq(C.phraseFor(F, 694.5).label, 'We are 91% of the way to one Camino Francés.', 'camino 91% toward');
eq(C.phraseFor({nameEn:'Near Route', km:700}, 699).label, 'We are 99% of the way to one Near Route.', 'toward-% clamps at 99 (never misreads 100% before completion)');
eq(C.phraseFor(EARTH, 694.5).label, 'We are 1.7% of the way around the Earth.', 'earth 1.7% one-decimal');
eq(C.phraseFor(MOON, 694.5).label, '383,706 km to the Moon.', 'moon km-to-go');
eq(C.phraseFor(SUN, 694.5).label, '149,599,306 km to the Sun.', 'sun km-to-go');
eq(C.phraseFor(K, 0).label, 'The path is beginning.', 'cold start');
eq(C.phraseFor(EARTH, 40075).label, 'Together, once around the Earth.', 'earth completion at exactly 1× (cosmic)');
eq(C.phraseFor(EARTH, 90000).label, 'Together, 2 times around the Earth.', 'earth completion at 2×+ (cosmic)');

console.log('\n=== lines ===\n');
// AC #5 distance-independence: the route is the same regardless of total distance.
eq(C.select(1, d('2026-10-07'), ASSET).entry.id, C.select(999999, d('2026-10-07'), ASSET).entry.id, 'route is distance-independent');
eq(C.select(1, d('2026-10-07'), ASSET).entry.id, 'kumano-kodo', "select picks the day's route (2026-10-07 → kumano-kodo)");
// seasonLine / href / annual tested via direct helpers for the two known routes; reflection covered below:
eq(C.seasonLineFor(K, 10), 'Its season is autumn — and it is autumn now.', 'kumano autumn clause');
eq(C.seasonLineFor(K, 7), null, 'kumano off-season → null');
eq(C.daylightHrefFor(K), '/daylight/?route=kumano-kodo', 'daylight href');
eq(C.daylightHrefFor(EARTH), null, 'cosmic no daylight href');
eq(C.annualLineFor(K), '44,540 Foreign overnight visitors in Hongu area (2024).', 'kumano annual line');
eq(C.annualLineFor(F), null, 'camino no annual line');

console.log('\n=== reflection ===\n');
eq(C.reflectionFor(K, 0), 'R0 at the gate?', 'reflectionFor: seed%2===0 → first reflection');
eq(C.reflectionFor(K, 9), 'R1 in the mist?', 'reflectionFor: seed%2===1 → second reflection');
eq(C.reflectionFor({kind:undefined, reflections:[]}, 9), null, 'reflectionFor: empty reflections → null');
eq(C.reflectionFor(EARTH, 9), null, 'reflectionFor: cosmic → null');

console.log('\n=== select full-shape ===\n');
var shape = C.select(694.5, d('2026-10-07'), ASSET);
eq(JSON.stringify(Object.keys(shape).sort()), JSON.stringify(['annualLine','daylightHref','entry','label','phase','reflection','seasonLine','times']), 'select() returns exactly the expected keys');
ok(shape.entry && typeof shape.entry === 'object', 'select().entry is an object');
eq(typeof shape.times, 'number', 'select().times is a number');
eq(typeof shape.phase, 'string', 'select().phase is a string');
eq(typeof shape.label, 'string', 'select().label is a string');
eq(typeof shape.seasonLine, 'string', 'select().seasonLine is a string (kumano, October)');
eq(typeof shape.reflection, 'string', 'select().reflection is a string (kumano has reflections)');
eq(typeof shape.daylightHref, 'string', 'select().daylightHref is a string (non-cosmic)');
eq(typeof shape.annualLine, 'string', 'select().annualLine is a string (kumano has annual)');

console.log('\n=== crossings ===\n');
var crossed = C.crossingsSince(30, 800, ASSET);
ok(crossed.indexOf('Kumano Kodo') !== -1 && crossed.indexOf('Camino Francés') !== -1, 'kumano(39)+frances(764) cross in (30,800]');
eq(C.crossingsSince(50, 100, ASSET).length, 0, 'nothing crosses in (50,100]');
eq(C.crossingsSince(30, 0, ASSET).length, 0, 'failed/zero fetch → no crossings');
eq(C.crossingsSince(NaN, 800, ASSET).length, 0, 'no baseline → no crossings');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { failures.forEach(function(f){console.log('  - '+f);}); process.exit(1); }
