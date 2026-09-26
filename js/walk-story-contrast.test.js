/* =============================================
   The walk story — every scene's text over its own sky

   Run via:  node js/walk-story-contrast.test.js

   The story paints its own skies (css/walk-story.css), so neither
   js/muted-contrast.test.js's seasonal sweep nor
   js/breathe-contrast.test.js's hour-wash sweep sees them. This one
   does, the same way those do: tokens parsed from the shipped
   stylesheet, so a palette edit cannot drift past it.

   A scene's ink is fixed for the whole scene and its sky changes only
   in the crossfade between scenes, so each scene is checked against
   its own sky, flat and under its glow at full strength.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./walk-story-core.js');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'walk-story.css'), 'utf8');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

function block(selector) {
  const i = css.indexOf(selector + ' {');
  return i === -1 ? '' : css.slice(i, css.indexOf('}', i));
}
function tokens(text) {
  const t = {};
  text.replace(/--(ws-[a-z-]+):\s*([^;]+);/g, function (_, k, v) { t[k] = v.trim(); return _; });
  return t;
}
const light = tokens(block(':root'));
const dark = Object.assign({}, light, tokens(block('[data-theme="dark"]')));

function parse(v) {
  let m = /^#([0-9a-f]{6})$/i.exec(v || '');
  if (m) return { rgb: [0, 2, 4].map(function (i) { return parseInt(m[1].slice(i, i + 2), 16) / 255; }), a: 1 };
  m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v || '');
  if (m) return { rgb: [m[1], m[2], m[3]].map(function (x) { return +x / 255; }), a: +m[4] };
  throw new Error('unparseable colour: ' + v);
}
function over(top, base) {
  return top.rgb.map(function (c, i) { return c * top.a + base.rgb[i] * (1 - top.a); });
}
function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(rgb) {
  const l = rgb.map(lin);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hslLightness(rgb) {
  return (Math.max.apply(null, rgb) + Math.min.apply(null, rgb)) / 2 * 100;
}

console.log('\n=== tokens parse ===\n');

C.SKIES.forEach(function (s) {
  ['light', 'dark'].forEach(function (scheme) {
    const t = scheme === 'light' ? light : dark;
    ok(!!t['ws-' + s + '-base'] && !!t['ws-' + s + '-glow'], scheme + ' · ' + s + ' has a base and a glow');
  });
});

console.log('\n=== AA for every scene, both schemes ===\n');

C.SCENES.forEach(function (s, i) {
  ['light', 'dark'].forEach(function (scheme) {
    const t = scheme === 'light' ? light : dark;
    const base = parse(t['ws-' + s.sky + '-base']);
    const glow = over(parse(t['ws-' + s.sky + '-glow']), base);
    const suffix = (scheme === 'dark' || s.sky === 'dusk' || s.sky === 'night') ? 'darksky' : 'lightsky';
    [['ink', parse(t['ws-ink-' + suffix]).rgb], ['muted', parse(t['ws-muted-' + suffix]).rgb]].forEach(function (pair) {
      [['its sky', base.rgb], ['its glow', glow]].forEach(function (bg) {
        const r = contrast(pair[1], bg[1]);
        ok(r >= 4.5, scheme + ' · ' + (i + 1) + ' ' + s.id + ' · ' + pair[0] + ' on ' + bg[0] + ' ≥ 4.5:1  (' + r.toFixed(2) + ')');
      });
    });
  });
});

console.log('\n=== star mode: the starfield is the sky ===\n');

// css/styles.css paints star mode's ground; the story's skies step aside
// for it and its text takes the dark theme's light ink.
const siteCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
const starGround = (/body\.constellation \{\s*background: (#[0-9a-f]{6}) !important;/i.exec(siteCss) || [])[1];
ok(!!starGround, 'star mode\'s ground is read from css/styles.css  (' + starGround + ')');
[['ink', dark['ws-ink-darksky']], ['muted', dark['ws-muted-darksky']]].forEach(function (pair) {
  const r = contrast(parse(pair[1]).rgb, parse(starGround).rgb);
  ok(r >= 4.5, 'star · every scene · ' + pair[0] + ' on the starfield ≥ 4.5:1  (' + r.toFixed(2) + ')');
});
// The text clears the stars behind it with a field of this colour; the
// ground itself, so the AA above holds on the clearing too.
const star = tokens(block('body.constellation'));
ok(!!star['ws-star-ground'] && star['ws-star-ground'].toLowerCase() === (starGround || '').toLowerCase(),
  'star · the text\'s clearing is the starfield\'s own ground  (' + star['ws-star-ground'] + ' vs ' + starGround + ')');
ok(/\.ws-clearings i\s*\{[^}]*background:\s*var\(--ws-star-ground\)/.test(css), 'star · the clearing is painted in that colour');
const starFog = star['ws-fog'] ? parse(star['ws-fog']).rgb : null;
ok(!!starFog && starFog[2] > starFog[0], 'star · the fog is a cool mist on the cool starfield, not the dark theme\'s warm grey  (' + star['ws-fog'] + ')');

console.log('\n=== the docked pill is a button on every sky it docks on ===\n');

// It docks from scene 01 on a phone, so every scene but the finale. Its
// label must read on its own fill, and the chip must stand off the sky
// by its fill or by its hairline, drawn over the fill.
const pillSkies = C.SCENES.filter(function (s) { return C.pillLabel(C.SCENES.indexOf(s)); })
  .map(function (s) { return s.sky; })
  .filter(function (s, i, a) { return a.indexOf(s) === i; });
[['light', light], ['dark', dark], ['star', dark]].forEach(function (pair) {
  const scheme = pair[0], t = pair[1];
  ok(!!t['ws-pill-bg'] && !!t['ws-pill-edge'] && !!t['ws-pill-ink'], scheme + ': the pill has a fill, a hairline and an ink');
  if (!t['ws-pill-bg'] || !t['ws-pill-edge'] || !t['ws-pill-ink']) return;
  const fill = parse(t['ws-pill-bg']).rgb;
  const edge = over(parse(t['ws-pill-edge']), parse(t['ws-pill-bg']));
  const label = contrast(parse(t['ws-pill-ink']).rgb, fill);
  if (scheme !== 'star') ok(label >= 4.5, scheme + ': "Keep walking" on the pill ≥ 4.5:1  (' + label.toFixed(2) + ')');
  const grounds = scheme === 'star' ? [['starfield', parse(starGround).rgb]] : [].concat.apply([], pillSkies.map(function (s) {
    const base = parse(t['ws-' + s + '-base']);
    return [[s + ' sky', base.rgb], [s + ' glow', over(parse(t['ws-' + s + '-glow']), base)]];
  }));
  grounds.forEach(function (g) {
    const r = Math.max(contrast(fill, g[1]), contrast(edge, g[1]));
    ok(r >= 1.2, scheme + ': the pill stands off the ' + g[0] + ' ≥ 1.2:1  (' + r.toFixed(2) + ')');
  });
});

console.log('\n=== the stylesheet switches ink where this test assumes ===\n');

ok(/\.walk-story-scene\[data-sky="dusk"\],\s*\.walk-story-scene\[data-sky="night"\][\s\S]*?--ws-ink:\s*var\(--ws-ink-darksky\)/.test(css),
  'dusk and night scenes take the dark-sky ink');
ok(/\[data-theme="dark"\] \.walk-story-scene[\s\S]*?--ws-ink:\s*var\(--ws-ink-darksky\)/.test(css),
  'dark mode takes the dark-sky ink everywhere');
// js/walk-story.js veils the walked lines where the stage's ink turns,
// and the core finds those turns from its own list of dark skies; it
// must be the stylesheet's list, or a turn would flip in plain sight.
const darkInkRule = (css.match(/([^{}]*)\{\s*--ws-ink:\s*var\(--ws-ink-darksky\)/) || [])[1] || '';
['scene', 'stage'].forEach(function (el) {
  const skies = Array.from(darkInkRule.matchAll(new RegExp('\\.walk-story-' + el + '\\[data-sky="([a-z]+)"\\]', 'g'))).map(function (m) { return m[1]; }).sort();
  const want = C.DARK_SKIES.slice().sort().join(',');
  ok(skies.join(',') === want, 'the ' + el + ' takes the light ink on exactly the core\'s dark skies  (' + skies.join(',') + ' vs ' + want + ')');
});
ok(/\.walk-story-scene\s*\{\s*color:\s*var\(--ws-ink\);/.test(css), 'scene text is the scene\'s ink');
ok(/body\.constellation \.walk-story-atmosphere\s*\{\s*display:\s*none;/.test(css), 'star mode: the starfield is the sky');
ok(/\.walk-story-scene \.traces-card-title\s*\{\s*color:\s*var\(--ws-ink\)/.test(css),
  'scene 06\'s moved titles take the scene\'s ink, not moss and rust');
ok(/\.walk-story-scene \.traces-card p\.wisp-energy\s*\{\s*color:\s*var\(--ws-muted\) !important/.test(css),
  'scene 06\'s captions take the muted ink, over the colour js/traces-cairn.js sets inline');

console.log('\n=== the night is really night ===\n');

const dawnL = hslLightness(parse(light['ws-dawn-base']).rgb);
const nightL = hslLightness(parse(light['ws-night-base']).rgb);
ok(dawnL - nightL >= 25,
  'light mode: scene 9\'s sky is at least 25 lightness points darker than scene 1\'s  (' + dawnL.toFixed(1) + ' → ' + nightL.toFixed(1) + ')');

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
