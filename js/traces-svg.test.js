/* =============================================
   Traces glyph SVGs — one viewBox, one ground line

   Run via:  node js/traces-svg.test.js

   The seven cairn paintings ship from iOS with viewBoxes that disagree —
   cairn-faint is "0 -40.65 144 144", cairn-sacred is "-45.05 0 246 246".
   Rendered as-is into the same box they are different sizes sitting at
   different heights, so the upward wipe that reveals one tier beneath the
   next reads as a glitch rather than as a pile that grew. cairn-faint was
   the worst of them: it rendered 61px high AND the widest of all seven,
   which is exactly backwards for a "faint trace".

   The obvious test here is the one this file used to contain: assert each
   SVG carries a transform attribute. That is a proxy, and it is wrong in
   both directions. Four of the seven need no transform at all (their
   source viewBox was already 0 0 150 150), so requiring one would mean
   writing transform="scale(1)" as decoration to satisfy a test. And a
   transform being PRESENT proves nothing about where the pile actually
   lands. This repo has a documented history of exactly this mistake —
   tests asserting on upstream proxies rather than emitted output.

   So the ground line is measured, not inferred: rasterise each tier and
   compare the bottom of its content. That needs rsvg-convert and
   ImageMagick, which are not guaranteed to exist. When they are missing
   this check reports itself as SKIPPED rather than passing quietly — a
   check that cannot run must not look like a check that ran.
   ============================================= */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'traces');
const TIERS = ['faint', 'small', 'medium', 'large', 'great', 'sacred', 'eternal'];
const VIEWBOX = '0 0 150 150';

// Rasterise at 200px for 150 units. The bases must agree within 3px,
// which is 2.25 user units — tight enough to catch a mis-anchored tier,
// loose enough not to trip on a soft glow edge (cairn-sacred's radial
// gradient fades out about 2px below its lowest stone).
const RENDER_PX = 200;
const TOLERANCE_PX = 3;

let passed = 0, failed = 0, skipped = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function skip(label) {
  skipped++;
  console.log('  ⊘ SKIPPED — ' + label);
}

function have(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0;
}

console.log('\n=== every cairn shares one viewBox ===\n');

TIERS.forEach(function (t) {
  const file = path.join(DIR, 'cairn-' + t + '.svg');
  ok(fs.existsSync(file), 'cairn-' + t + '.svg exists');
  if (!fs.existsSync(file)) return;
  const svg = fs.readFileSync(file, 'utf8');
  const m = svg.match(/viewBox="([^"]+)"/);
  ok(!!m && m[1] === VIEWBOX,
    'cairn-' + t + ' declares viewBox="' + VIEWBOX + '"'
      + (m ? ' (found "' + m[1] + '")' : ' (no viewBox at all)'));
  // The group is the hook the ground line is tuned through. It may carry
  // no transform — four tiers need none — but it must exist, so that
  // re-tuning is an edit rather than a re-measure.
  ok(/<g class="cairn-art"/.test(svg),
    'cairn-' + t + ' routes its artwork through a <g class="cairn-art"> group');
});

console.log('\n=== the bases actually coincide (measured) ===\n');

if (!have('rsvg-convert') || !have('magick')) {
  skip('needs rsvg-convert and ImageMagick (brew install librsvg imagemagick). '
    + 'The ground line is UNVERIFIED in this run.');
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'traces-svg-'));
  const bases = {};
  let measured = true;

  TIERS.forEach(function (t) {
    const src = path.join(DIR, 'cairn-' + t + '.svg');
    const png = path.join(tmp, t + '.png');
    try {
      execFileSync('rsvg-convert',
        ['-w', String(RENDER_PX), '-h', String(RENDER_PX), '-b', '#F5F0E8', src, '-o', png]);
      // Trim the flat background away; what remains is the artwork, and
      // its bottom edge is the ground line. 15% fuzz so the soft glows on
      // sacred and eternal do not read as content.
      const geom = execFileSync('magick',
        [png, '-bordercolor', '#F5F0E8', '-fuzz', '15%', '-trim',
         '-format', '%w %h %X %Y', 'info:'], { encoding: 'utf8' }).trim();
      const parts = geom.split(/\s+/).map(function (v) { return parseInt(v, 10); });
      bases[t] = { base: parts[3] + parts[1], height: parts[1] };   // offsetY + height
    } catch (e) {
      measured = false;
      ok(false, 'cairn-' + t + ' could not be rasterised: ' + e.message);
    }
  });

  if (measured) {
    const values = TIERS.map(function (t) { return bases[t].base; });
    const lo = Math.min.apply(null, values);
    const hi = Math.max.apply(null, values);

    TIERS.forEach(function (t) {
      console.log('    ' + t.padEnd(9) + ' base at ' + bases[t].base + 'px, '
        + bases[t].height + 'px tall');
    });
    console.log('');

    ok(hi - lo <= TOLERANCE_PX,
      'all seven bases agree within ' + TOLERANCE_PX + 'px (spread is '
        + (hi - lo) + 'px: ' + lo + '–' + hi + ')');

    // The source art is not monotonic in height — sacred is a touch
    // shorter than large — so "each tier is taller than the last" would
    // be a false invariant. What IS invariant is that a faint trace is
    // the smallest thing here, and cairn-faint shipped as the LARGEST of
    // the seven before it was re-anchored. That is the regression worth
    // a gate.
    const faintHeight = bases.faint.height;
    const smallestOther = Math.min.apply(null, TIERS
      .filter(function (t) { return t !== 'faint'; })
      .map(function (t) { return bases[t].height; }));
    ok(faintHeight < smallestOther,
      'cairn-faint is the smallest of the seven (' + faintHeight
        + 'px vs next-smallest ' + smallestOther + 'px)');
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\n=== the wisp inherits page ink ===\n');

const wisp = path.join(DIR, 'whisper.svg');
ok(fs.existsSync(wisp), 'whisper.svg exists');
if (fs.existsSync(wisp)) {
  const svg = fs.readFileSync(wisp, 'utf8');
  ok(!/fill="#[0-9A-Fa-f]{6}"/.test(svg),
    'whisper.svg has no hardcoded fill — it must inherit currentColor in both themes');
  ok(/fill="currentColor"/.test(svg), 'whisper.svg fills with currentColor');
}

console.log('\n=== Summary ===\n');
console.log('passed:  ' + passed);
console.log('failed:  ' + failed);
console.log('skipped: ' + skipped);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
if (skipped) console.log('\nNOTE: ' + skipped + ' check(s) skipped — see above.');
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
