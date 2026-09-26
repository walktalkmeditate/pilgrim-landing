/* =============================================
   Page weight — every page, ratcheted

   Run via:  node js/page-weight.test.js

   /sunpath has a BUDGET (js/sunpath-budget.test.js, D9): a fixed +12.00 KB
   allowance over a named baseline, because that feature was designed with a
   ceiling and §B was cut rather than raise it. Every other page had nothing
   at all — and the page that most needed one is the heaviest on the site.

   This is a RATCHET, not a budget. It pins what each page weighs today and
   fails when that grows. There is no invented ceiling, because nobody has
   decided what /daylight ought to weigh; there is only a rule that it may
   not grow without someone saying so in a diff.

   Why a ratchet and not a per-change tolerance: /daylight went 52 → 106 KB
   by accepting four increases that were each small on their own. A generous
   tolerance cannot catch accumulation, because every accepted step becomes
   the new baseline. So the tolerance is tight and the friction is the point
   — raising a number below should be a line a reviewer sees.

   Measured per file with Node zlib at level 9, the same implementation
   js/sunpath-budget.test.js uses. Mixing gzip implementations (Apple gzip
   vs Node zlib) has produced a wrong figure in this repo four times; there
   is one implementation here and it is this one.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

// Gzipped KB per page: the document plus every same-origin /js/ and /css/
// asset it references. Raising one of these is a deliberate act.
//
// /sunpath is absent on purpose — js/sunpath-budget.test.js owns it under a
// stricter contract, and two pinned numbers for one page means two places to
// update and one of them going stale.
const BASELINE_KB = {
  'daylight/index.html':                       112.48,
  'sunpath/2026-winter-solstice/index.html':    90.33,
  'sunpath/2027-winter-solstice/index.html':    90.33,
  'sunpath/2027-summer-solstice/index.html':    90.28,
  'sunpath/2026-summer-solstice/index.html':    90.27,
  'sunpath/2026-autumn-equinox/index.html':     90.14,
  'sunpath/2027-autumn-equinox/index.html':     90.12,
  'sunpath/2027-spring-equinox/index.html':     90.11,
  'sunpath/2026-spring-equinox/index.html':     90.10,
  'moonpath/index.html':                        68.70,
  // +9.39: traces real glyphs. css/traces-glyphs.css (2.71), js/traces-cairn.js
  // (3.74), js/traces-glyphs.js (2.18) and the inline wisp (1.35), less the
  // rules this removed from styles.css. The seven cairn paintings (20.1 KB
  // gzipped) and the seven chimes (188 KB) are fetched assets and so are
  // invisible here — at rest a visitor pulls one painting, and only a visitor
  // who climbs to eternal pulls all of it.
  // +9.20: the hidden clearing. Most of it is js/clearing-core.js carrying
  // the app's real seek-clearing glyph path (9.2 KB raw, ~2/3 of the delta
  // gzipped); the rest is js/clearing.js — including measured placement,
  // which walks each zone for a content-free band rather than trusting a
  // curated offset — the inline styles, and the rider's seasonal breath.
  // Same trade traces made: the app's actual drawing, priced in the open,
  // not a lighter imitation.
  // The walk story (docs/superpowers/specs/2026-09-24-one-walk-story-design.md),
  // +31.60 over 83.50 in all: index.html +5.06, css/walk-story.css 15.32,
  // js/walk-story.js 6.70, js/walk-story-core.js 3.73, js/clearing.js
  // +0.42, js/traces-cairn.js +0.24, js/universe.js +0.08, js/main.js +0.06.
  // Step by step:
  // +24.30 (107.80): nine scenes, each with its copy, an HTML phone and its
  // line in two geometries, replace six sections, whose inline CSS went
  // with them (index.html +4.95); the stacked story's stylesheet, then the
  // pinned stage, its easing loop and the pure core (css 11.96, js 4.54,
  // core 2.62); the cairn's demo and the clearing's new zones
  // (traces-cairn.js +0.14, clearing.js +0.05, main.js +0.06).
  // +0.63 (108.43): the dark phones' palette (the app's fog, a black sheet
  // backdrop, the shared page kept light) and the labels' scale moving
  // into the core, where it is tested.
  // +0.63 (109.06): the docked pill's chip tokens, the phone finale's moon,
  // and the line's quieter past on a phone.
  // +0.53 (109.59): a short laptop stage (1366x650, 1280x720) compacts the
  // copy instead of running it into the line.
  // +0.95 (110.54): the walked lines follow the scroll instead of a timed
  // fade, and are veiled where the light theme's ink turns, in the core
  // where both are tested; the sky's crossfade is eased.
  // +1.07 (111.61): star mode clears the stars from behind the story's
  // text and dresses the phones, rail, moon and fog for a starfield; the
  // starfield wraps as the page scrolls (js/universe.js, +0.09).
  // +0.74 (112.35): the frame budget. The clearing's rider reads no layout
  // while the story is pinned (js/clearing.js +0.36), and the story's frame
  // reads the scroll position before it writes (js/walk-story.js +0.13,
  // the core +0.20).
  // +0.80 (113.15): a phone turned sideways and back, or a window
  // narrowed while pinned, keeps its scene (js/walk-story.js +0.36, the
  // core -0.05); the final review's fixes: the skip link hides in its own
  // box, an upright tablet caps its phones by width and docks the pill
  // above the line, and pinning reads a 100svh probe, not innerHeight
  // (css/walk-story.css +0.35, js/walk-story.js +0.16).
  // +0.64 (113.79): the ink turn's rules for the rail and the walked
  // lines (css/walk-story.css +0.08) and the finale's line on sharing
  // (index.html +0.02); between 721 and 1000px wide the pill docks where
  // the line, the rail and the traces leave it room, the phones stand
  // clear of it, and a narrow short stage widens the finale's column
  // (css/walk-story.css +0.53).
  // +0.20 (113.99): every stage from 721 to 1920 wide and 560 to 1200 tall
  // keeps the pill, the phones and the finale clear: a smaller corner pill
  // up to 1140px, the Honor phone capped by width, a frame no wider than
  // the line past 16:9, and the finale compacted on short and wide stages
  // (css/walk-story.css +0.20).
  // +0.54 (114.53): the code review's fixes. A reader past the story
  // keeps their distance from its end across a resize, a pin and an
  // unpin (js/walk-story.js +0.43); a reader's own stone cancels the
  // cairn's pending demo (js/traces-cairn.js +0.10); inline SVG is an
  // obstacle to the clearing (js/clearing.js +0.01).
  // +0.36 (114.89): a link to a scene lands on it, on load and on a
  // change of address, and a modified click on the rail or the pill
  // keeps its browser meaning (js/walk-story.js +0.36).
  // +0.21 (115.10): the skip link lands a pixel past the story's end, so
  // the story leaves, and leaving gives the page's walker and distance one
  // scroll to catch up on (js/walk-story.js +0.22).
  'index.html':                                 115.10,
  'walk.html':                                  47.73,
  'guide.html':                                 34.39,
  'compare.html':                               32.25,
  'found.html':                                 20.68,
  'press.html':                                 20.24,
  'privacy.html':                               19.76,
  'terms.html':                                 19.42,
  'seek.html':                                  16.91,
  'now.html':                                    9.63,
  '404.html':                                    5.24
};

// Tight on purpose. gzip is deterministic — the same bytes always give the
// same size — so this is not noise tolerance, it is the width of an edit
// nobody needs to think about. The growth this exists to catch was +2.79 KB.
const DRIFT_KB = 0.50;

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// Absolute AND relative, because the site uses both: the sub-pages write
// `/css/styles.css` and the root page writes `css/styles.css`. A scan that
// matched only the absolute form counted ZERO assets for the landing page
// and called its 22 KB document the whole story. That is the same
// worth-exactly-zero blind spot js/sunpath-budget.test.js has been caught
// by twice, reproduced here on the first draft of its replacement.
//
// Query strings and fragments are cache-busters, not different files.
function referencedFiles(html, pageRel) {
  const dir = path.dirname(pageRel);
  const out = [];
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let ref = m[1];
    if (/^(?:https?:)?\/\//.test(ref) || /^(?:#|mailto:|data:|tel:)/.test(ref)) continue;
    ref = ref.replace(/[?#].*$/, '');
    if (!/\.(?:js|css)$/.test(ref)) continue;
    out.push(ref.charAt(0) === '/'
      ? ref.slice(1)
      : path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, ref)));
  }
  return out;
}

function weigh(pageRel) {
  const abs = path.join(ROOT, pageRel);
  const html = fs.readFileSync(abs, 'utf8');
  const refs = referencedFiles(html, pageRel);
  const parts = [{ file: pageRel, bytes: zlib.gzipSync(fs.readFileSync(abs), { level: 9 }).length }];
  const missing = [];
  refs.forEach(function (rel) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) { missing.push(rel); return; }
    parts.push({ file: rel, bytes: zlib.gzipSync(fs.readFileSync(full), { level: 9 }).length });
  });
  return {
    kb: parts.reduce(function (a, p) { return a + p.bytes; }, 0) / 1024,
    parts: parts,
    missing: missing
  };
}

console.log('\n=== Every page, gzipped (Node zlib, level 9) ===\n');

let siteKb = 0;
const rows = Object.keys(BASELINE_KB).map(function (page) {
  const w = weigh(page);
  siteKb += w.kb;
  return { page: page, now: w.kb, was: BASELINE_KB[page], missing: w.missing, parts: w.parts };
}).sort(function (a, b) { return b.now - a.now; });

rows.forEach(function (r) {
  const delta = r.now - r.was;
  console.log('  ' + r.now.toFixed(2).padStart(7) + ' KB  '
    + (Math.abs(delta) < 0.005 ? '     ' : (delta > 0 ? '+' : '') + delta.toFixed(2))
    + '  ' + r.page);
});
console.log('\n  site total: ' + siteKb.toFixed(0) + ' KB across ' + rows.length + ' pages\n');

// A page that references something that is not there weighs less than it
// should, and the gate reads that as good news. This is the failure mode
// that has bitten the sibling budget test twice.
rows.forEach(function (r) {
  ok(r.missing.length === 0,
    r.page + ': every referenced asset resolves on disk'
      + (r.missing.length ? ' — missing: ' + r.missing.join(', ') : ''));
});

rows.forEach(function (r) {
  const delta = r.now - r.was;
  if (delta > DRIFT_KB) {
    const grew = r.parts
      .map(function (p) { return p.file + ' (' + (p.bytes / 1024).toFixed(2) + ' KB)'; })
      .sort()
      .slice(0, 3)
      .join(', ');
    ok(false, r.page + ' grew ' + delta.toFixed(2) + ' KB to ' + r.now.toFixed(2)
      + ' KB — over the ' + DRIFT_KB + ' KB drift allowance. Heaviest parts: ' + grew
      + '. Update the baseline in js/page-weight.test.js deliberately, or cut something.');
  } else {
    ok(true, r.page + ' is ' + r.now.toFixed(2) + ' KB'
      + (delta < -DRIFT_KB ? ' — LIGHTER by ' + Math.abs(delta).toFixed(2)
          + ' KB; lower the baseline to keep the ratchet tight' : ''));
  }
});

// The ratchet has to be able to see growth, and every mistake this family of
// test has made was the same one: the thing it forgot to count was worth
// exactly zero bytes, so the total looked right.
console.log('\n=== The ratchet can see growth (self-test) ===\n');

const probe = fs.readFileSync(path.join(ROOT, 'js', 'sunpath-math.js'));
const plain = zlib.gzipSync(probe, { level: 9 }).length;
const grown = zlib.gzipSync(Buffer.concat([probe, require('crypto').randomBytes(4096)]), { level: 9 }).length;
ok(grown - plain > 3500,
  'adding 4096 incompressible bytes moves the measurement by ' + (grown - plain) + ' B');

// Every page in the baseline must still exist, and every page on disk must
// be in the baseline. A page that drops out of this map stops being weighed
// without the total moving.
// EVERY .html, not just index.html. Ten of this site's pages are top-level
// files (walk.html, seek.html, guide.html…) rather than directories, and the
// first version of this check looked only for index.html — so it asserted
// "every page on disk is weighed" while never being able to see them. A
// completeness check scoped to the same convention as the thing it checks
// cannot fail, which makes it decoration.
function discoverPages(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name.startsWith('.')) return;
    if (['node_modules', 'assets', 'js', 'css', 'scripts', 'docs'].indexOf(e.name) !== -1) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) discoverPages(p, acc);
    else if (/\.html$/.test(e.name)) acc.push(path.relative(ROOT, p));
  });
  return acc;
}
const onDisk = discoverPages(ROOT, []);
const covered = Object.keys(BASELINE_KB).concat(['sunpath/index.html']);
const unweighed = onDisk.filter(function (p) { return covered.indexOf(p) === -1; });
const vanished = Object.keys(BASELINE_KB).filter(function (p) { return onDisk.indexOf(p) === -1; });

ok(unweighed.length === 0,
  'every page on disk is weighed by this file or by js/sunpath-budget.test.js'
    + (unweighed.length ? ' — unweighed: ' + unweighed.join(', ') : ''));
ok(vanished.length === 0,
  'and every page named in the baseline still exists'
    + (vanished.length ? ' — gone: ' + vanished.join(', ') : ''));

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
