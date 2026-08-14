/* =============================================
   /sunpath — page-weight budget

   Run via:  node js/sunpath-budget.test.js

   Verifies D9 / AC #11 of docs/specs/2026-08-13-after-the-sun.md:
   /sunpath grows by no more than 12 KB gzipped for the whole feature.
   The budget exists because /daylight went 52.1 -> 106.0 KB across three
   slices with no budget, and every slice argued its own increase was
   small. §B was cut by this gate before it was written (D6).

   It lives in its own file for the same reason js/daylight-perf.test.js
   does: a non-functional budget shares no helpers with a legibility
   sweep, and js/muted-contrast.test.js's own header scopes that file to
   text legibility.

   Three things this measures carefully, each of which it got wrong once:

   1. **Every referenced file must resolve.** The first version skipped
      anything fs.existsSync could not find, so appending `?v=2` to the
      d3-geo tag dropped 12.76 KB and the gate reported comfort.
   2. **One gzip implementation throughout.** The recorded baseline came
      from Apple `gzip -9` (90.94 KB) while the test computed with Node
      `zlib` (90.63 KB on the same tree), so the delta subtracted one
      tool from another. Everything here is Node `zlib`, level 9.
   3. **Per file, not one page total.** The page shares css/styles.css
      and js/main.js with every other page on the site. A site-wide
      refresh must not go red with a message about a dark-hours curve, so
      the baseline is recorded per file and the failure names what grew.

   Per-file rather than one concatenated stream, because per-file is what
   a CDN actually sends; concatenating understates the page by ~5%.
   ============================================= */

'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var ROOT = path.join(__dirname, '..');
var BUDGET_KB = 12.0;
var SPEC_PATH = path.join(ROOT, 'docs/specs/2026-08-13-after-the-sun.md');

/* Gzipped bytes per file at b270938 — the spec commit, before a line of
   §A was written — measured with THIS file's zlib.gzipSync(level: 9) so
   the subtraction below is one implementation minus itself. Regenerate
   with:

     git show b270938:<path> | node -e "…zlib.gzipSync(input,{level:9})…"

   A file that appears on the page and not in this table is treated as
   new weight, which is what it is. */
var BASELINE_BYTES = {
  'css/styles.css':                   13034,
  'css/sunpath.css':                   7656,
  'js/moon.js':                        1128,
  'js/turnings.js':                    2215,
  'js/universe.js':                    3488,
  'js/main.js':                        9510,
  'js/sunpath-math.js':               11030,
  'js/sunpath-globe-math.js':           594,
  'js/sunpath-capability.js':           654,
  'js/vendor/d3-array.min.js':         5936,
  'js/vendor/d3-geo.min.js':          13069,
  'js/vendor/topojson-client.min.js':  2605,
  'js/sunpath-globe-svg.js':           2493,
  'js/sunpath.js':                     7100,
  'js/sunpath-tools.js':               4283,
  'js/sunpath-time-machine.js':        2974,
  'js/sunpath-turnings.js':            2946,
  'js/sunpath-countdown.js':           1514,
  'js/sunpath-archive-tabs.js':         581,
  // The document itself. The gate measured only the assets it references,
  // so markup-only growth — a new section's headings and prose — was worth
  // exactly zero bytes to it. That is the third time this file has been
  // caught not counting something: the other two were an unresolvable path
  // and a mixed gzip implementation, and both were also worth zero.
  'sunpath/index.html':                5050
};

var passed = 0, failed = 0, failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// Query strings and fragments are cache-busters, not different files.
// Stripped before resolving, because an unresolvable path used to be
// silently worth zero bytes.
function referencedFiles(page) {
  return (page.match(/(?:src|href)="\/(?:js|css)\/[^"]+"/g) || [])
    .map(function (tag) {
      return tag.replace(/^(?:src|href)="\//, '')
                .replace(/"$/, '')
                .replace(/[?#].*$/, '');
    });
}

var PAGE_REL = 'sunpath/index.html';
var page = fs.readFileSync(path.join(ROOT, PAGE_REL), 'utf8');
// The document is measured alongside its assets, not instead of them: its
// gzipped weight already contains every inline <script> and <style>, which
// were the other thing the old scan could not see.
var files = referencedFiles(page).concat([PAGE_REL]);
var inlineScriptBytes = (page.match(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g) || [])
  .reduce(function (a, m) { return a + m.length; }, 0);

console.log('\n=== /sunpath, per-file gzipped (Node zlib, level 9) ===\n');

ok(files.length > 0, 'the page references js/css assets at all');

var missing = files.filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); });
ok(missing.length === 0,
  'every referenced asset resolves on disk' + (missing.length ? ' — missing: ' + missing.join(', ') : ''));

// --- Can this gate see growth at all? ---
//
// Every mistake this file has made was the same one: the thing it forgot
// to count was worth exactly zero bytes, so the total looked right and the
// assertion passed. An unresolvable path, a mixed gzip implementation, and
// the document itself — three misses, three silent zeroes. A budget test
// that cannot demonstrate it responds to growth is not a budget test.
var probeRel = 'js/sunpath-tools.js';
var probeBuf = fs.readFileSync(path.join(ROOT, probeRel));
var probePlain = zlib.gzipSync(probeBuf, { level: 9 }).length;
// Incompressible, so the gzip delta is the byte delta rather than a guess.
var probeNoise = require('crypto').randomBytes(4096);
var probeGrown = zlib.gzipSync(Buffer.concat([probeBuf, probeNoise]), { level: 9 }).length;
ok(probeGrown - probePlain > 3500,
  'the measurement responds to growth: +4096 incompressible bytes moves the gzip figure by '
    + (probeGrown - probePlain) + ' B');

// And the scan and the baseline must describe the same set of files. A key
// in one and not the other is how a file stops being counted without the
// total moving.
var measuredSet = {};
files.forEach(function (f) { measuredSet[f] = true; });
var baselineOnly = Object.keys(BASELINE_BYTES).filter(function (f) { return !measuredSet[f]; });
var scanOnly = files.filter(function (f) { return !(f in BASELINE_BYTES); });
ok(baselineOnly.length === 0,
  'every file the baseline names is still scanned'
    + (baselineOnly.length ? ' — orphaned: ' + baselineOnly.join(', ') : ''));
ok(scanOnly.length === 0,
  'and every file scanned has a baseline to compare against'
    + (scanOnly.length ? ' — unbaselined: ' + scanOnly.join(', ') : ''));

var nowBytes = 0, baseBytes = 0, grew = [];
files.forEach(function (f) {
  var full = path.join(ROOT, f);
  if (!fs.existsSync(full)) return;
  var size = zlib.gzipSync(fs.readFileSync(full), { level: 9 }).length;
  var was = BASELINE_BYTES[f] || 0;
  nowBytes += size;
  baseBytes += was;
  if (size !== was) {
    grew.push({ file: f, delta: size - was });
  }
});

var nowKb = nowBytes / 1024;
var baseKb = baseBytes / 1024;
var deltaKb = nowKb - baseKb;

grew.sort(function (a, b) { return b.delta - a.delta; });
grew.forEach(function (g) {
  console.log('  ' + (g.delta >= 0 ? '+' : '') + (g.delta / 1024).toFixed(2)
    + ' KB  ' + g.file);
});
console.log('\n  (of which ' + inlineScriptBytes + ' B is inline <script>, inside the document\'s own gzip)');
console.log('\n  baseline b270938 : ' + baseKb.toFixed(2) + ' KB');
console.log('  now              : ' + nowKb.toFixed(2) + ' KB');
console.log('  delta            : ' + (deltaKb >= 0 ? '+' : '') + deltaKb.toFixed(2)
  + ' KB against a ' + BUDGET_KB.toFixed(2) + ' KB budget\n');

ok(deltaKb <= BUDGET_KB,
  '/sunpath is ' + (deltaKb >= 0 ? '+' : '') + deltaKb.toFixed(2) + ' KB against its '
    + BUDGET_KB + ' KB budget'
    + (deltaKb > BUDGET_KB
        ? ' — the growth is in ' + grew.slice(0, 3).map(function (g) {
            return g.file + ' (' + (g.delta / 1024).toFixed(2) + ' KB)';
          }).join(', ') + '. Raise the budget deliberately in the spec, or cut something.'
        : ''));

// AC #14: no spec figure without a test that recomputes it. The Result
// section's weight row is the figure this file measures, so it is read
// back out of the document rather than trusted. Three numbers drifted in
// the sibling page's spec across three review rounds; the same spec
// carried three different values for THIS one.
console.log('=== The spec states what this file measures (AC #14) ===\n');

var spec = fs.readFileSync(SPEC_PATH, 'utf8');
var stated = /\|\s*\*\*after §A\*\*\s*\|\s*\*\*([\d.]+) KB — \+([\d.]+) KB\*\*\s*\|/.exec(spec);

ok(!!stated, 'the spec states its post-§A weight as "**after §A** | **N KB — +N KB**"');
if (stated) {
  var statedNow = parseFloat(stated[1]);
  var statedDelta = parseFloat(stated[2]);
  console.log('  spec states ' + statedNow.toFixed(2) + ' KB, +' + statedDelta.toFixed(2)
    + ' KB; measured ' + nowKb.toFixed(2) + ' KB, +' + deltaKb.toFixed(2) + ' KB');
  ok(Math.abs(statedNow - nowKb) < 0.01,
    'the spec\'s post-§A weight is the weight this file measures');
  ok(Math.abs(statedDelta - deltaKb) < 0.01,
    'and its delta is the delta this file measures');
}

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failed > 0) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nall green');
