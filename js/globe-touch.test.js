/* =============================================
   Globe drag — touch-action, per renderer

   Run via:  node js/globe-touch.test.js

   /sunpath draws its globe with one of two renderers. The SVG one carried
   `touch-action: none`; the WebGL one, which is what nearly every phone
   actually gets, did not. Without it the browser claims a finger drag for
   page scroll — the page is ~8000px tall — fires pointercancel, and the
   drag ends on the first move. Reported from the field as "dragging the
   globe isn't working on touch". Desktop was fine the whole time, because
   a mouse drag was never competing with a scroll gesture.

   The JS was ported between renderers (sunpath-globe-gl.js says so in a
   comment: "Wire pointer events exactly as SVG renderer does"). The CSS
   was not. So this asserts the pairing directly: every renderer that
   listens for pointerdown must have `touch-action: none` in the
   stylesheet for the class it stamps on that element.

   Renderers are DISCOVERED, not listed. A third one added tomorrow is
   covered the day it registers a pointerdown, which is the only way this
   check keeps meaning anything.

   Node cannot compute a style, so this reads css/sunpath.css as text —
   it proves the declaration is written for the right class, not that a
   browser resolved it. The browser half was checked by hand under mobile
   emulation, where the canvas measured touch-action:auto before the fix
   and none after.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'sunpath.css'), 'utf8');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// The class has to be on the SUBJECT of the selector — the rightmost
// compound. `.stage .canvas` styles the canvas; `.canvas .pin` does not,
// and a looser "does the name appear anywhere" test would call both a
// pass and let the real bug through wearing a descendant's clothes.
function selectorTargets(selector, className) {
  const subject = selector.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() || '';
  return new RegExp('\\.' + className + '(?![\\w-])').test(subject);
}

function declaresTouchActionNone(css, className) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rule.exec(stripped)) !== null) {
    if (!/touch-action\s*:\s*none/.test(m[2])) continue;
    if (m[1].split(',').some(function (sel) { return selectorTargets(sel, className); })) return true;
  }
  return false;
}

// Both shapes the two renderers use to stamp their root class:
//   glRenderer.domElement.className = 'sunpath-globe-canvas'
//   svgEl('svg', { 'class': 'sunpath-globe-svg', ... })
function rootClassesIn(src) {
  const found = [];
  const patterns = [
    /\.className\s*=\s*['"]([\w-]+)['"]/g,
    /['"]class['"]\s*:\s*['"]([\w-]+)['"]/g
  ];
  patterns.forEach(function (re) {
    let m;
    while ((m = re.exec(src)) !== null) {
      if (/^sunpath-globe-/.test(m[1]) && found.indexOf(m[1]) === -1) found.push(m[1]);
    }
  });
  return found;
}

console.log('\n=== Globe renderers on disk ===\n');

const renderers = fs.readdirSync(path.join(ROOT, 'js'))
  .filter(function (f) { return /^sunpath-globe-.*\.js$/.test(f) && !/\.test\.js$/.test(f); })
  .map(function (f) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    return { file: f, draggable: /addEventListener\(\s*['"]pointerdown['"]/.test(src), classes: rootClassesIn(src) };
  });

renderers.forEach(function (r) {
  console.log('  ' + r.file + (r.draggable ? '  [draggable] ' : '  [static]     ') + r.classes.join(', '));
});

const draggable = renderers.filter(function (r) { return r.draggable; });

console.log('\n=== Every draggable globe surface refuses the browser\'s scroll ===\n');

draggable.forEach(function (r) {
  r.classes.forEach(function (cls) {
    ok(declaresTouchActionNone(CSS, cls),
      r.file + ' drags .' + cls + ' — css/sunpath.css must give it touch-action: none, '
        + 'or a finger drag becomes a page scroll and pointercancel kills it');
  });
});

// A scan that matches nothing passes every assertion after it. That is the
// exact way this repo's tests have been wrong before, so the scan has to
// prove it found something first.
console.log('\n=== The scan actually found the renderers (self-test) ===\n');

ok(renderers.length >= 2, 'discovered ' + renderers.length + ' globe renderer sources (expected the SVG and GL pair, at least)');
ok(draggable.length >= 2, draggable.length + ' of them register pointerdown');
draggable.forEach(function (r) {
  ok(r.classes.length > 0,
    r.file + ' yielded a root class to check'
      + (r.classes.length ? '' : ' — it stamps its class some way this scan cannot see, so it was silently skipped'));
});

// And the matcher has to be able to say no, in both ways it could lie.
console.log('\n=== The matcher can say no (self-test) ===\n');

ok(!declaresTouchActionNone(CSS, 'sunpath-globe-stage'),
  '.sunpath-globe-stage has no touch-action rule and is not reported as having one');
ok(!declaresTouchActionNone('.a .b { touch-action: none; }', 'a'),
  'a class that only appears as an ANCESTOR does not count as styled');
ok(declaresTouchActionNone('.a, .b { touch-action: none; }', 'b'),
  'and a class in a grouped selector does count');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
