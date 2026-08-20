/* =============================================
   Hidden clearing — index.html wiring

   Run via:  node js/clearing-wiring.test.js

   Static checks on the shipped page, not on proxies. Three of these
   guard traps this repo has already fallen into elsewhere:

   - #0a1624 is the iOS asset's night-ink fill. On the app's parchment
     map it is the drawing; on this page's dark section it is invisible.
     If it appears anywhere in the wiring, the reveal reveals nothing.
   - The reduced-motion block must hide the rider entirely. A crescent
     that rides the viewport IS motion; there is no calmer variant of
     it worth keeping.
   - core before DOM: clearing.js reads window.ClearingCore at parse
     time plus guard. Both defer, so order in the document is order of
     execution.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

console.log('\n=== scripts ===\n');

const coreTag = html.match(/<script[^>]*src="js\/clearing-core\.js"[^>]*>/);
const domTag = html.match(/<script[^>]*src="js\/clearing\.js"[^>]*>/);
ok(coreTag, 'index.html loads js/clearing-core.js');
ok(domTag, 'index.html loads js/clearing.js');
ok(coreTag && /\bdefer\b/.test(coreTag[0]), 'clearing-core.js is deferred');
ok(domTag && /\bdefer\b/.test(domTag[0]), 'clearing.js is deferred');
ok(coreTag && domTag && html.indexOf(coreTag[0]) < html.indexOf(domTag[0]),
  'core loads before the DOM module that reads it');
ok(fs.existsSync(path.join(ROOT, 'js', 'clearing.js')),
  'js/clearing.js exists (a script tag pointing at a 404 is silent)');

console.log('\n=== styles ===\n');

['.clearing-host', '.clearing-fog', '.clearing-glyph', '.clearing-rider'].forEach(function (cls) {
  ok(html.indexOf(cls) !== -1, 'inline style defines ' + cls);
});

const fogRule = html.match(/\.clearing-fog\s*\{[^}]*\}/);
const fogSize = fogRule && fogRule[0].match(/width:\s*(\d+)px/);
ok(fogSize && parseInt(fogSize[1], 10) >= 44,
  'the fog patch is a real tap target (width ≥ 44px)');

console.log('\n=== reduced motion ===\n');

const rmBlocks = html.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n    \}/g) || [];
ok(rmBlocks.some(function (b) {
  return b.indexOf('.clearing-rider') !== -1 && /\.clearing-rider[^}]*display:\s*none/.test(b);
}), 'reduced motion hides the riding crescent entirely');

console.log('\n=== the night-ink trap ===\n');

ok(html.indexOf('#0a1624') === -1, 'index.html carries no hardcoded night-ink fill');
['clearing-core.js', 'clearing.js'].forEach(function (f) {
  const p = path.join(ROOT, 'js', f);
  const src = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  ok(src.indexOf('#0a1624') === -1, 'js/' + f + ' carries no hardcoded night-ink fill');
});

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
