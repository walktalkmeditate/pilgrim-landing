/* =============================================
   Forbidden claims — two things the sky does not do (R21, KTD14)

   Run via:  node js/forbidden-claims.test.js

   At an equinox the sun does not rise due east everywhere, and day does
   not equal night: refraction and the sun's disc lift the sunrise early
   and set it late, so the day runs several minutes past twelve hours and
   the sunrise sits within about two degrees of due east at mid-latitudes.
   Copy may state that bound, or say nothing; it may not round it away.

   This is the one scan (KTD14). It reads every place the copy is made or
   shipped: the rendered turning pages and the hub, the turning data and
   the events facts, the calendar files, the link-card renderers and the site-wide banner
   js/main.js shows on a turning day. A
   sentence fails when it makes either claim without a bound or a
   negation in the same sentence.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// Words that turn either claim into a true one: a stated bound, or a
// denial of the exact version.
const BOUND = /\b(?:within|nearly|almost|roughly|about|approximately|close to|not|never|isn[’']t|doesn[’']t|don[’']t|longer than|more than)\b|°|\bdegrees?\b/i;

// "sunrise due east, everywhere": the sun rising or setting due (or
// exactly) east or west.
const DUE_EAST = /\b(?:sun\s*rises?|sunrises?|sun\s*sets?|sunsets?|rises?|rising|sets?|setting)\b[^.!?\n]*?\b(?:due|exactly|precisely|true)\s+(?:in\s+the\s+)?(?:east|west)\b|\b(?:due|exactly|precisely)\s+(?:east|west)\b[^.!?\n]*?\b(?:sun\s*rises?|sunrises?|sun\s*sets?|sunsets?|rises|sets)\b/i;

// "day equals night, exactly": day and night of equal length.
const DAY_EQUALS_NIGHT = new RegExp([
  /\b(?:day|daylight|light)\s+(?:equals|matches|=)\s+(?:the\s+)?(?:night|dark(?:ness)?)\b/.source,
  /\b(?:night|dark(?:ness)?)\s+(?:equals|matches|=)\s+(?:the\s+)?(?:day|daylight|light)\b/.source,
  /\b(?:day|daylight|light)\s+and\s+(?:night|dark(?:ness)?)\s+(?:are|stand|run|become|grow|lie)\s+(?:exactly\s+|perfectly\s+)?(?:equal|even|level|balanced|the\s+same\s+length)\b/.source,
  /\bequal\s+(?:parts\s+)?(?:day\s+and\s+night|night\s+and\s+day|days?\s+and\s+nights?|light\s+and\s+dark(?:ness)?|dark(?:ness)?\s+and\s+light)\b/.source,
  /\b(?:day|daylight)\s+(?:is\s+)?as\s+long\s+as\s+(?:the\s+)?night\b/.source,
  /\b(?:twelve|12)\s+hours\s+of\s+(?:day(?:light)?|light|sun(?:light)?)\s+and\s+(?:twelve|12)\b/.source
].join('|'), 'i');

// Sentences, so a bound only rescues the claim it sits beside. Markup is
// dropped first; a calendar's escaped "\n" ends a sentence too.
function sentences(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .split(/\\n|\n|[.!?](?=\s|$|["'’”])/)
    .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
    .filter(Boolean);
}

function offences(text) {
  return sentences(text).filter(function (s) {
    return (DUE_EAST.test(s) || DAY_EQUALS_NIGHT.test(s)) && !BOUND.test(s);
  });
}

console.log('\n=== the patterns catch the claims and pass the true bounds ===\n');

[
  'The sun rises due east everywhere on Earth.',
  'Today the sun rises due east and sets due west.',
  'Sunrise is exactly east today, for everyone.',
  'where day equals night',
  'Today, day equals night',
  'Day and night are equal across the whole world.',
  'An equinox brings equal day and night.',
  'Twelve hours of daylight and twelve of dark, everywhere.',
  'DESCRIPTION:The sun crosses the equator.\\n\\nDay and night stand equal.'
].forEach(function (claim) {
  ok(offences(claim).length === 1, 'flags: "' + claim + '"');
});

[
  'Sunrise at mid-latitudes: within about 2° of due east, refraction counted.',
  'At the equator the sun rises within 23½° of due east all year.',
  'At the equinox they all agree: due east and due west, within two degrees.',
  'The sun rose within two degrees of due east at mid-latitudes.',
  'Day and night are nearly equal, the day a few minutes longer.',
  'Day does not quite equal night: refraction lifts the sun early.',
  'Equinox means "equal night" in Latin.',
  'The sun crosses the equator heading north.',
  'the sun turned east of the date line'
].forEach(function (truth) {
  ok(offences(truth).length === 0, 'passes: "' + truth + '"');
});

console.log('\n=== nothing shipped makes either claim ===\n');

function list(dir, re) {
  return fs.readdirSync(path.join(ROOT, dir))
    .filter(function (f) { return re.test(f); })
    .map(function (f) { return path.posix.join(dir, f); });
}

const turningPages = fs.readdirSync(path.join(ROOT, 'sunpath'), { withFileTypes: true })
  .filter(function (e) { return e.isDirectory() && /^\d{4}-[a-z-]+$/.test(e.name); })
  .map(function (e) { return 'sunpath/' + e.name + '/index.html'; });

const SOURCES = [
  ['rendered turning pages', turningPages],
  ['the hub', ['sunpath/index.html']],
  ['turning data', list('assets/sunpath/turnings', /\.json$/)],
  ['turning events', list('assets/sunpath', /^turning-events-\d{4}\.json$/)],
  ['calendars', list('sunpath', /\.ics$/)],
  ['link-card renderers', list('scripts', /^render-og-.*\.html$/)],
  ['the site-wide turning banner', ['js/main.js']]
];

SOURCES.forEach(function (source) {
  const files = source[1];
  ok(files.length > 0, source[0] + ': ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' to read');
  files.forEach(function (rel) {
    const found = offences(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    ok(found.length === 0, rel + (found.length ? ' claims: "' + found.join('" | "') + '"' : ''));
  });
});

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
