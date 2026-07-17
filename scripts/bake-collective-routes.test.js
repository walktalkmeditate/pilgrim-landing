'use strict';
var B = require('./bake-collective-routes.js'); // requires UMD export; see step 3
var passed = 0, failed = 0, failures = [];
function ok(c, label){ if(c){passed++;console.log('  ✓ '+label);} else {failed++;failures.push(label);console.log('  ✗ '+label);} }

var asset = B.buildAsset();
ok(asset.pilgrimages.length === 7, '7 pilgrimages');
ok(asset.horizons.length === 3, '3 horizons');
var kumano = asset.pilgrimages.filter(function(p){return p.id==='kumano-kodo';})[0];
ok(kumano && kumano.km === 39, 'kumano km=39');
ok(kumano && kumano.reflections.length === 4, 'kumano 4 reflections');
ok(kumano && kumano.annual && /overnight visitors/i.test(kumano.annual.metricNote), 'kumano metricNote has "overnight visitors"');
var frances = asset.pilgrimages.filter(function(p){return p.id==='camino-frances';})[0];
ok(frances && frances.km === 764, 'camino-frances km=764');
var sun = asset.horizons.filter(function(h){return h.id==='to-the-sun';})[0];
ok(sun && sun.km === 149600000 && sun.preposition==='to' && sun.body==='the Sun', 'to-the-sun horizon');
// determinism: two builds deep-equal
ok(JSON.stringify(B.buildAsset()) === JSON.stringify(B.buildAsset()), 'buildAsset deterministic');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { failures.forEach(function(f){console.log('  - '+f);}); process.exit(1); }
