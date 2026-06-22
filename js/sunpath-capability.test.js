'use strict';
var C = require('./sunpath-capability.js');
var passed = 0, failed = 0, fails = [];
function eq(a, e, label) { if (a === e) passed++; else { failed++; fails.push(label + ': got ' + a + ' want ' + e); } }

eq(C.selectRenderer({ webgl: true,  reducedMotion: false, lowEnd: false, forceFlat: false }), 'gl',  'capable → gl');
eq(C.selectRenderer({ webgl: false, reducedMotion: false, lowEnd: false, forceFlat: false }), 'svg', 'no webgl → svg');
eq(C.selectRenderer({ webgl: true,  reducedMotion: true,  lowEnd: false, forceFlat: false }), 'svg', 'reduced motion → svg');
eq(C.selectRenderer({ webgl: true,  reducedMotion: false, lowEnd: true,  forceFlat: false }), 'svg', 'low-end → svg');
eq(C.selectRenderer({ webgl: true,  reducedMotion: false, lowEnd: false, forceFlat: true  }), 'svg', 'force flat → svg');

console.log('capability: ' + passed + ' passed, ' + failed + ' failed');
if (failed) { fails.forEach(function (f) { console.log('  ✗ ' + f); }); }
process.exit(failed ? 1 : 0);
