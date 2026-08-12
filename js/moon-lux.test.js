/* =============================================
   Moon-lux helper — test harness

   Run via:  node js/moon-lux.test.js

   Covers:
     - moonLuxAt()      — below-horizon / new-moon zero cases, a known value
     - luxBracketFor()  — D19 half-open bracket boundaries

   These mirror the equivalent assertions in js/moonpath.test.js — this
   file is the direct proof that js/moon-lux.js computes byte-identical
   results to the code it was extracted from.
   ============================================= */

'use strict';

var MoonLux = require('./moon-lux.js');

var passed   = 0;
var failed   = 0;
var failures = [];

function equal(actual, expected, label) {
  if (actual === expected) {
    passed++;
    console.log('  ✓ ' + label + '  (' + actual + ')');
  } else {
    failed++;
    failures.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    console.log('  ✗ ' + label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
  }
}

function ok(condition, label) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failed++;
    failures.push(label + ': condition was false');
    console.log('  ✗ ' + label);
  }
}

console.log('\n=== moonLuxAt — zero cases ===\n');

equal(MoonLux.moonLuxAt(1, 0),    0, 'altitude=0 (horizon) → 0 lux');
equal(MoonLux.moonLuxAt(1, -5),   0, 'altitude=-5 (below horizon) → 0 lux');
equal(MoonLux.moonLuxAt(0, 45),   0, 'k=0 (new moon) → 0 lux regardless of altitude');
equal(MoonLux.moonLuxAt(0, 90),   0, 'k=0 (new moon) at zenith → 0 lux');

console.log('\n=== moonLuxAt — known value ===\n');

// Full moon (k=1) at zenith (90°): lux = 0.32 × 1 × sin(90°) = 0.32 exactly.
ok(Math.abs(MoonLux.moonLuxAt(1, 90) - 0.32) < 1e-9, 'k=1, altitude=90 → 0.32 lux (full moon overhead)');

// k=0.5 at altitude=30°: lux = 0.32 × 0.5 × sin(30°) = 0.32 × 0.5 × 0.5 = 0.08
ok(Math.abs(MoonLux.moonLuxAt(0.5, 30) - 0.08) < 1e-9, 'k=0.5, altitude=30 → 0.08 lux');

console.log('\n=== luxBracketFor — D19 half-open bracket boundaries ===\n');

equal(MoonLux.luxBracketFor(0.2).label,    'bright', 'lux=0.2 → bright (boundary into upper bracket)');
equal(MoonLux.luxBracketFor(1.0).label,    'bright', 'lux=1.0 → bright');
equal(MoonLux.luxBracketFor(0.05).label,   'mid',    'lux=0.05 → mid (boundary into upper bracket)');
equal(MoonLux.luxBracketFor(0.1999).label, 'mid',    'lux=0.1999 → mid (just below 0.2)');
equal(MoonLux.luxBracketFor(0.005).label,  'dim',    'lux=0.005 → dim (boundary into upper bracket)');
equal(MoonLux.luxBracketFor(0.0049).label, 'faint',  'lux=0.0049 → faint (just below 0.005)');
equal(MoonLux.luxBracketFor(0).label,      'faint',  'lux=0 → faint');

ok(MoonLux.luxBracketFor(0.2).prose.length   > 0, 'bright prose non-empty');
ok(MoonLux.luxBracketFor(0.05).prose.length  > 0, 'mid prose non-empty');
ok(MoonLux.luxBracketFor(0.005).prose.length > 0, 'dim prose non-empty');
ok(MoonLux.luxBracketFor(0).prose.length     > 0, 'faint prose non-empty');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
