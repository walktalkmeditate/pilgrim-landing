/* =============================================
   Traces glyphs — every animation has an off switch

   Run via:  node js/traces-motion.test.js

   css/traces-glyphs.css grew its animations across seven commits, and
   their reduced-motion counterparts live in a block sixty lines from the
   rules they disable. The failure this guards is not "someone forgot
   accessibility" in the abstract — it is the eighth animation, added in
   a later commit, whose counterpart nobody writes because it is nowhere
   near the code being edited.

   So this DISCOVERS the animations rather than listing them: every
   selector that declares `animation:` outside a reduced-motion block
   must be named inside one. An animation added tomorrow is covered the
   day it is written, which a hand-maintained list would not be.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'css', 'traces-glyphs.css');
// Comments carry the words "animation" and selector names, and swallowing
// them into a selector makes every failure label unreadable.
const CSS = fs.readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// Split the file into the reduced-motion blocks and everything else.
const REDUCED_RE = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g;
let reducedText = '';
let outsideText = CSS;
let m;
while ((m = REDUCED_RE.exec(CSS)) !== null) {
  reducedText += m[1];
  outsideText = outsideText.replace(m[0], '');
}

console.log('\n=== the stylesheet switches motion off at all ===\n');

ok(reducedText.length > 0, 'there is at least one prefers-reduced-motion block');

// Parse rules into { selector, key, props } where props is which of
// animation/transition the rule actually sets. Checking the property and
// not just the selector name matters: `.wisp` sets BOTH an animation and
// a colour transition, and a reduce block that only says
// `animation: none` looks like coverage while the transition runs on.
function keyOf(selector) {
  // Last simple selector token, minus any pseudo-element.
  return selector.trim().split(/[\s>]+/).pop().replace(/::?[a-z-]+$/, '').split('.').pop();
}

function rulesIn(text) {
  const out = [];
  const RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
  let r;
  while ((r = RULE_RE.exec(text)) !== null) {
    const selectorList = r[1].trim();
    const body = r[2];
    if (!selectorList || selectorList.charAt(0) === '@') continue;  // @keyframes, @media wrappers
    const props = [];
    if (/(^|[\s;])animation(-name)?\s*:/.test(body)) props.push('animation');
    if (/(^|[\s;])transition\s*:/.test(body)) props.push('transition');
    // display:none removes the element entirely, which suppresses motion
    // more completely than animation:none does.
    const removed = /(^|[\s;])display\s*:\s*none/.test(body);
    if (!props.length && !removed) continue;
    // A comma-separated list is several selectors, and indexing only the
    // last of them silently loses coverage the stylesheet really has.
    selectorList.split(',').forEach(function (sel) {
      out.push({ selector: sel.trim(), key: keyOf(sel), body: body, props: props, removed: removed });
    });
  }
  return out;
}

const animated = rulesIn(outsideText).filter(function (rule) {
  return rule.props.some(function (p) {
    return !new RegExp(p + '(-name)?\\s*:\\s*none').test(rule.body);
  });
});
const silenced = rulesIn(reducedText);

ok(animated.length > 0, 'found animated selectors to check (' + animated.length + ')');

console.log('\n=== every animated selector is switched off under reduce ===\n');

animated.forEach(function (rule) {
  rule.props.forEach(function (prop) {
    if (new RegExp(prop + '(-name)?\\s*:\\s*none').test(rule.body)) return;
    const match = silenced.filter(function (s) { return s.key === rule.key; });
    const stopped = match.some(function (s) {
      return s.removed || new RegExp(prop + '(-name)?\\s*:\\s*none').test(s.body);
    });
    const how = match.some(function (s) { return s.removed; }) ? 'display:none' : prop + ':none';
    ok(stopped, rule.selector + ' — its ' + prop + ' is stopped under reduce'
      + (stopped ? ' (' + how + ')' : ''));
  });
});

console.log('\n=== sound is not motion ===\n');

// The chime must NOT be disabled by reduced motion. A stylesheet has no
// say over audio anyway; this asserts nobody has tried to give it one.
ok(CSS.indexOf('stone-tier') === -1,
  'the stylesheet has no say over audio — chimes stay on under reduced motion');

// And the JS must not gate the chime on reduceMotion. It uses the flag
// only to drop the impact delay, since with no drop to sync to there is
// nothing to wait for.
const JS = fs.readFileSync(path.join(ROOT, 'js', 'traces-cairn.js'), 'utf8');
const chimeCall = JS.match(/playChime\(result\.stones\);?\s*\}[^\n]*/);
ok(!!chimeCall, 'the chime call is where this test expects it');
ok(!/if\s*\(\s*reduceMotion\s*\)\s*return[^]{0,200}playChime/.test(JS),
  'playChime is never skipped for reduced motion — only its delay is dropped');

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
