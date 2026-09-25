/* =============================================
   The walk story — index.html's markup, held to the core and the spec

   Run via:  node js/walk-story-markup.test.js

   Static checks on the shipped page, not on proxies:
   - the nine scenes are the core's nine, in its order, wearing its skies;
   - every phone string is one the app really shows (cited per string);
   - the Honor stage is the bake's, byte for byte, in both geometries;
   - nothing in the story is a bare .story or waits on the page's
     one-shot .reveal observer, which would fire while it is invisible.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./walk-story-core.js');
const B = require('../scripts/bake-honor-stage.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'nakahechi-stage-00.json'), 'utf8'));

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')');
}
function count(hay, needle) {
  return hay.split(needle).length - 1;
}

const start = html.indexOf('<section class="walk-story"');
const end = html.indexOf('<div id="after-walk-story">');
const story = start !== -1 && end > start ? html.slice(start, end) : '';

console.log('\n=== one story, nine scenes, the core\'s order ===\n');

ok(story.length > 0, 'index.html carries the story, closed by #after-walk-story');
eq(count(html, '<section class="walk-story"'), 1, 'exactly one story');
const scenes = Array.from(story.matchAll(
  /<section class="walk-story-scene[^"]*" id="scene-(\d)" data-scene="([a-z-]+)" data-sky="([a-z]+)" aria-labelledby="scene-\d-title">/g));
eq(scenes.length, 9, 'nine scenes');
scenes.forEach(function (m, i) {
  eq(+m[1], i + 1, 'scene ' + (i + 1) + ' is #scene-' + (i + 1));
  eq(m[2], C.SCENES[i].id, 'scene ' + (i + 1) + ' is ' + C.SCENES[i].id);
  eq(m[3], C.SCENES[i].sky, 'scene ' + (i + 1) + ' wears the core\'s sky: ' + C.SCENES[i].sky);
});
story.split(/(?=<section class="walk-story-scene)/).slice(1).forEach(function (b, i) {
  const h2 = b.match(/<h2 id="scene-(\d)-title">([\s\S]*?)<\/h2>/);
  ok(!!h2 && +h2[1] === i + 1, 'scene ' + (i + 1) + ' is labelled by its own headline');
  eq(h2 ? count(h2[2], '<em>') : 0, 1, 'scene ' + (i + 1) + '\'s headline has exactly one italic word');
  ok(b.indexOf('walk-story-line--landscape') !== -1 && b.indexOf('walk-story-line--portrait') !== -1,
    'scene ' + (i + 1) + ' carries its own line in both geometries');
  eq(count(b, 'class="ws-dot"'), 2, 'scene ' + (i + 1) + ' has a walker dot in each geometry');
});

console.log('\n=== the rail ===\n');

const rail = Array.from(story.matchAll(/<a href="#scene-(\d)" aria-label="Scene (\d) of 9: ([^"]+)"><\/a>/g));
eq(rail.length, 9, 'nine rail links');
rail.forEach(function (m, i) {
  ok(+m[1] === i + 1 && +m[2] === i + 1, 'rail ' + (i + 1) + ' points at its own scene');
  eq(m[3], C.SCENES[i].name, 'rail ' + (i + 1) + ' names ' + C.SCENES[i].name);
});

console.log('\n=== naming ===\n');

eq(count(html, 'class="story section"'), 1, '"Why Pilgrim exists" is still the only .story');
ok(!/class="story"/.test(html), 'nothing is a bare .story');
ok(!/\sclass="[^"]*\breveal\b/.test(story), 'nothing in the story waits on the page\'s one-shot .reveal observer');

console.log('\n=== what left the page ===\n');

['class="practice section"', 'class="traces section"', 'class="walkwithme section"',
  'class="seek-door section"', 'class="journey section"', 'class="privacy-section section"'
].forEach(function (s) { ok(html.indexOf(s) === -1, s + ' is gone'); });
ok(html.indexOf('class="traces reliquary section"') > end, 'the Reliquary follows the story');
const dividers = [];
let at = -1;
while ((at = html.indexOf('<!-- Footprint divider -->', at + 1)) !== -1) dividers.push(at);
ok(dividers.every(function (d, i) { return i === 0 || html.slice(dividers[i - 1], d).indexOf('<section') !== -1; }),
  'no two footprint dividers stand back to back');
ok(!/\.(journey|privacy-feature|privacy-section)[\w-]*\s*[{>]/.test(html), 'the journey and privacy styles left with their sections');
ok(story.indexOf('vector-effect') === -1, 'no dash-revealed path uses a non-scaling stroke, which would part ink from dot');
ok(!/\.seek-door(\s|::|\s*\{)/.test(html), 'the retired seek door\'s section styles are gone (its form classes stay)');

console.log('\n=== the phones quote the app ===\n');

[
  ['Set Your Intention', 'Scenes/ActiveWalk/IntentionSettingView.swift:85'],
  ['What purpose guides this walk?', 'Scenes/ActiveWalk/IntentionSettingView.swift:94'],
  ['Voice</span>', 'Scenes/ActiveWalk/IntentionSettingView.swift:118'],
  ['>5/140<', 'Scenes/ActiveWalk/IntentionSettingView.swift:126 (count/maxCharacters)'],
  ['>Recurring<', 'Scenes/ActiveWalk/IntentionSettingView.swift:137'],
  ['<span>Cancel</span>', 'Scenes/ActiveWalk/IntentionSettingView.swift:365'],
  ['>Set<', 'Scenes/ActiveWalk/IntentionSettingView.swift:375'],
  ['<span>WANDER</span><span>HONOR</span><span>SEEK</span>', 'Scenes/Home/WalkStartView.swift:326'],
  ['walk · talk · meditate', 'Models/Walk/WalkMode.swift:8'],
  ['<span class="ws-w">Wander</span>', 'Models/Walk/WalkMode.swift:16 (buttonLabel)'],
  ['<span class="ws-h">Honor</span>', 'Models/Walk/WalkMode.swift:17 (buttonLabel)'],
  ['<span class="ws-s">Seek</span>', 'Models/Walk/WalkMode.swift:18 (buttonLabel)'],
  ['walk in their steps', 'Models/Walk/WalkMode.swift:9 (subtitle)'],
  ['follow the unknown', 'Models/Walk/WalkMode.swift:10 (subtitle)'],
  ['Where they walked,<br>you walk', 'Support Files/Base.lproj/Localizable.strings:165 (Honor.Quote.1)'],
  ['What you seek<br>is seeking you', 'Support Files/Base.lproj/Localizable.strings:170 (Seek.Quote.1)'],
  ['Solvitur ambulando —<br>it is solved by walking', 'Support Files/Base.lproj/Localizable.strings:159 (Welcome.Quote.4)'],
  ['>Path<', 'the tab bar (docs/screenshots/01_walk_start.png)'],
  ['>Journal<', 'the tab bar (docs/screenshots/01_walk_start.png)'],
  ['>Settings<', 'the tab bar (docs/screenshots/01_walk_start.png)'],
  ['Distance</span>', 'Scenes/ActiveWalk/WalkStatsSheet.swift:488'],
  ['Steps</span>', 'Scenes/ActiveWalk/WalkStatsSheet.swift:490'],
  ['Ascent</span>', 'Scenes/ActiveWalk/WalkStatsSheet.swift:492'],
  ['<b>21:04</b>Walk', 'Scenes/ActiveWalk/WalkStatsSheet.swift:497'],
  ['<b>0:12</b>Talk', 'Scenes/ActiveWalk/WalkStatsSheet.swift:499'],
  ['<b>3:15</b>Meditate', 'Scenes/ActiveWalk/WalkStatsSheet.swift:501'],
  ['<span>Meditate</span>', 'Scenes/ActiveWalk/WalkStatsSheet.swift:527'],
  ['>Record<', 'Scenes/ActiveWalk/WalkStatsSheet.swift:560'],
  ['>Stop<', 'Scenes/ActiveWalk/WalkStatsSheet.swift:560'],
  ['<span>End</span>', 'Scenes/ActiveWalk/WalkStatsSheet.swift:531'],
  ['>' + fixture.stage.theme + '<', 'Scenes/Honor/StageMorningCard.swift:46 (stage.theme)'],
  ['3.6 km · 430 m up · 2 to 3 hours · moderate', 'Scenes/Honor/StageMorningCard.swift:5 (factsLine)'],
  ['>clear, 18°C<', 'Scenes/Honor/StageMorningCard.swift:18 (weatherLine)'],
  ['maps saved for today', 'Scenes/Honor/StageMorningCard.swift:25'],
  ['>walk<', 'Scenes/Honor/StageMorningCard.swift:79 (buttonTitle)'],
  ['>Done<', 'Scenes/WalkSummary/WalkSummaryView.swift:155'],
  ['You walked, spoke your mind, and found stillness.', 'Scenes/WalkSummary/WalkSummaryView.swift:468'],
  ['Elevation</span>', 'Scenes/WalkSummary/WalkSummaryView.swift:536'],
  ['walk with me<', 'pilgrim-worker src/generators/html-template.ts:2013'],
  ['>as it happened · 2h 41m<', 'pilgrim-worker src/generators/html-template.ts:2015 (walkDurationLabel)'],
  ['walk this<', 'pilgrim-worker src/generators/html-template.ts:2016'],
  ['Clear · waxing crescent ☽ · 18°C', 'pilgrim-worker src/generators/html-template.ts:1789 (storyWeatherLine)']
].forEach(function (pair) {
  ok(story.indexOf(pair[0]) !== -1, 'a phone says ' + JSON.stringify(pair[0]) + '  — ' + pair[1]);
});
ok(story.indexOf('What are you walking with') === -1, 'no invented intention prompt');
ok(story.indexOf('>' + fixture.stage.narrative + '<') !== -1, 'the morning card quotes the stage\'s narrative whole');

console.log('\n=== Honor, drawn from the bake ===\n');

const baked = B.bake(fixture);
eq(count(story, 'd="' + baked.d + '"'), 4, 'both geometries draw the baked stage, faint and inked');
Object.keys(B.GEOMETRIES).forEach(function (g) {
  ok(story.indexOf('transform="' + baked.placements[g].transform + '"') !== -1, g + ': placed by the bake\'s transform');
});
C.honorReveal(0).moments.forEach(function (m) {
  const at = Math.round(m.at * 1e4) / 1e4;
  eq(count(story, '--at:' + at + '"'), 2, 'the marker at frac ' + m.frac + ' carries --at:' + at + ' in both geometries');
});
ok(story.indexOf(fixture.stage.closing) !== -1, 'the closing line is the dataset\'s own');
ok(story.indexOf('On iPhone. Coming to Android.') !== -1, 'Honor says where it runs');
ok(story.indexOf('https://github.com/walktalkmeditate/open-pilgrimages') !== -1, 'the stage credits its dataset');

console.log('\n=== acts and ways out ===\n');

eq(count(story, 'data-seek-door'), 1, 'one seek door, keyed by data-seek-door');
ok(/<svg class="wisp"/.test(story) && story.indexOf('id="cairn-stack"') !== -1, 'the wisp and the cairn live in the story');
ok(story.indexOf('data-umami-event="click-app-store"') !== -1 && story.indexOf('data-umami-event="click-google-play"') !== -1,
  'scene 9 carries both store badges, events unchanged');
ok(story.indexOf('href="/privacy"') !== -1, 'scene 9 links the privacy policy');
ok(story.indexOf('data-umami-event="walk-with-me-demo"') !== -1, 'scene 8 carries the demo walk');
ok(story.indexOf('data-umami-event="enter-seek"') !== -1, 'scene 5 carries the way into /seek');
ok(/<video class="ws-video"[^>]*poster="assets\/screenshots\/03_meditation\.png"/.test(story),
  'the meditation video has a poster for Low Power Mode and reduced motion');
ok(/<link rel="stylesheet" href="css\/walk-story\.css">/.test(html), 'the story\'s stylesheet is linked');

console.log('\n=== CSS timings are the core\'s ===\n');

const css = fs.readFileSync(path.join(ROOT, 'css', 'walk-story.css'), 'utf8');
ok(css.indexOf('var(--hold, 1) / ' + C.LINE_INK_END + ',') !== -1, 'lines ink over ' + C.LINE_INK_END + ' of the hold, as lineInk does');
ok(css.indexOf('var(--hold, 1) / ' + C.HONOR.inkEnd + ',') !== -1, 'Honor inks over ' + C.HONOR.inkEnd + ', as honorReveal does');
ok(css.indexOf('(var(--hold, 1) - ' + C.HONOR.closingAt + ') / ') !== -1, 'the closing line waits for ' + C.HONOR.closingAt);
ok(css.indexOf('(var(--hold, 1) - var(--at)) / ' + C.HONOR.momentFade) !== -1, 'moments surface over ' + C.HONOR.momentFade);
ok(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.ws-ring[^}]*animation:\s*none/.test(css), 'reduced motion stills the breathing ring');

console.log('\n=== scripts ===\n');

const coreTag = html.match(/<script[^>]*src="js\/walk-story-core\.js"[^>]*>/);
const domTag = html.match(/<script[^>]*src="js\/walk-story\.js"[^>]*>/);
ok(coreTag && /\bdefer\b/.test(coreTag[0]), 'index.html loads js/walk-story-core.js, deferred');
ok(domTag && /\bdefer\b/.test(domTag[0]), 'index.html loads js/walk-story.js, deferred');
ok(coreTag && domTag && html.indexOf(coreTag[0]) < html.indexOf(domTag[0]), 'the core loads before the wiring that reads it');
ok(domTag && html.indexOf('src="js/traces-cairn.js"') < html.indexOf(domTag[0]), 'the cairn loads before the story that calls its demo');
ok(domTag && html.indexOf('src="js/moon.js"') < html.indexOf(domTag[0]), 'moon.js (getMoonPhase) loads before the story paints tonight\'s moon');
const wiring = fs.existsSync(path.join(ROOT, 'js', 'walk-story.js')) ? fs.readFileSync(path.join(ROOT, 'js', 'walk-story.js'), 'utf8') : '';
ok(wiring.length > 0, 'js/walk-story.js exists (a script tag pointing at a 404 is silent)');
ok(wiring.indexOf('getBoundingClientRect') === wiring.lastIndexOf('getBoundingClientRect') && /function measure\(\)[\s\S]*getBoundingClientRect/.test(wiring),
  'the only layout read is in measure(), never in the frame loop');
ok(/window\.innerWidth !== width/.test(wiring), 'height-only resizes (iOS toolbar) are ignored');
ok(/behavior: smooth \? 'smooth' : 'instant'/.test(wiring),
  'a focus jump is instant: the page\'s own scroll-behavior: smooth would animate "auto"');
ok(/CSS\.supports\('height', '100svh'\)/.test(wiring), 'no svh, no pinning: the story would collapse');
ok(/function settle\(\)[\s\S]*story-reach-end/.test(wiring) && !/function render\(p\)[\s\S]*?story-reach-end[\s\S]*?function settle/.test(wiring),
  'the reach event fires where the reader comes to rest, never mid-traversal');
ok(/\.walk-story--pinned\s*\{[^}]*overflow:\s*clip/.test(css) && !/\.walk-story--pinned \.walk-story-stage\s*\{[^}]*overflow/.test(css),
  'the story clips, not the stage, so the 100lvh sky reaches below it');
ok((css.match(/will-change/g) || []).length === 2 && /is-active \.walk-story-phone\s*\{\s*will-change/.test(css),
  'will-change on the sky layers and only the active phone: six promoted layers at most');

console.log('\n=== the story\'s neighbours ===\n');

const cairnSrc = fs.readFileSync(path.join(ROOT, 'js', 'traces-cairn.js'), 'utf8');
ok(/window\.TracesCairn\s*=\s*\{\s*demo:\s*demo\s*\}/.test(cairnSrc), 'traces-cairn.js exposes TracesCairn.demo()');
ok(cairnSrc.indexOf("closest('.walk-story--pinned')") !== -1,
  'the cairn\'s own observer stands down inside the pinned story, where it would fire unseen');
const mainSrc = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
eq((mainSrc.match(/classList\.contains\('walk-story-pinned'\)/g) || []).length, 2,
  'the scroll tracker and the page walker both rest while the story is pinned');
const storyCss = fs.readFileSync(path.join(ROOT, 'css', 'walk-story.css'), 'utf8');
ok(/body\.walk-story-pinned \.page-walker,\s*body\.walk-story-pinned \.scroll-tracker\s*\{[^}]*opacity:\s*0/.test(storyCss),
  'the walker and the tracker fade while the ink line is the companion');

console.log('\n=== the page claims only what the policy says ===\n');

const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
[/no cloud/i, /no telemetry/i, /no user id/i, /never uploaded/i, /Nothing is uploaded to any server/, /All data stays on your phone/].forEach(function (re) {
  ok(!re.test(html), 'index.html no longer says ' + re);
  ok(!re.test(llms), 'llms.txt no longer says ' + re);
});
ok(/Honor/.test(html.slice(html.indexOf('"featureList"'), html.indexOf('"screenshot"'))), 'the feature list names Honor');
ok(/data ODbL/.test(llms), 'llms.txt gives the dataset\'s real data licence');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
