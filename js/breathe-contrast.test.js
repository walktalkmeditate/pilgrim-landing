'use strict';
// Guards WCAG AA for every page the hour-wash touches. The wash is a fixed
// layer *behind* the content, so a page's text is really read against the
// tint composited over that page's own background — not against the raw
// background token. This composites each hour's tint and re-checks the text.
//
// Tokens are read from the real stylesheets (the js/seek-contrast.test.js
// approach) so a palette edit can't silently drift away from this guard.
//
// The check is conditioned on the unwashed page, because one palette is already
// below AA before any wash exists: css/styles.css's --fog (#B8AFA2 on #F5F0E8 =
// 1.91:1) and light --stone fail on their own. The wash can neither cause nor
// cure that, and it must never touch a page's colours. So the invariant is:
// whatever clears AA unwashed must still clear it under every hour's wash. The
// tokens that don't are pinned below, so none can be added unnoticed.
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var BreatheTint = require('./breathe-tint.js');

function css(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'css', name), 'utf8');
}

function relLuminance(hex) {
  var m = hex.replace('#', '');
  var rgb = [0, 2, 4].map(function (i) { return parseInt(m.slice(i, i + 2), 16) / 255; });
  var lin = rgb.map(function (c) {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a, b) {
  var l1 = relLuminance(a), l2 = relLuminance(b);
  var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// The wash is an opaque colour at `alpha` over the page's background; the
// browser flattens it to this before any text is drawn on top.
function composite(tint, alpha, backdrop) {
  var f = tint.replace('#', ''), b = backdrop.replace('#', '');
  var out = '#';
  for (var i = 0; i < 3; i++) {
    var fv = parseInt(f.slice(i * 2, i * 2 + 2), 16);
    var bv = parseInt(b.slice(i * 2, i * 2 + 2), 16);
    var v = Math.round(fv * alpha + bv * (1 - alpha));
    out += ('0' + v.toString(16)).slice(-2);
  }
  return out;
}

function block(source, re, label) {
  var m = source.match(re);
  assert.ok(m, 'block not found: ' + label);
  return m[1];
}

function token(blockText, name) {
  var m = blockText.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})'));
  assert.ok(m, 'token --' + name + ' not found');
  return m[1];
}

// /now and /404 share a palette: light in :root, dark in a prefers-color-scheme
// media query (these pages have no [data-theme] — see js/breathe.js).
function quietPage(file) {
  var src = css(file);
  var light = block(src, /:root\s*\{([^}]*)\}/, file + ' :root');
  var dark = block(
    src,
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/,
    file + ' dark :root'
  );
  return [
    {
      name: file + ' light',
      bg: token(light, 'paper'),
      text: { ink: token(light, 'ink'), 'ink-soft': token(light, 'ink-soft'), 'ink-fog': token(light, 'ink-fog') }
    },
    {
      name: file + ' dark',
      bg: token(dark, 'paper'),
      text: { ink: token(dark, 'ink'), 'ink-soft': token(dark, 'ink-soft'), 'ink-fog': token(dark, 'ink-fog') }
    }
  ];
}

// press/privacy/terms wear css/styles.css (via css/legal.css); dark is gated on
// [data-theme="dark"] there, which is why those pages and /now differ.
function sitePalettes() {
  var src = css('styles.css');
  var light = block(src, /:root\s*\{([^}]*)\}/, 'styles.css :root');
  var dark = block(src, /\[data-theme="dark"\]\s*\{([^}]*)\}/, 'styles.css [data-theme="dark"]');
  return [
    {
      name: 'styles.css light',
      bg: token(light, 'parchment'),
      text: { ink: token(light, 'ink'), stone: token(light, 'stone'), fog: token(light, 'fog') }
    },
    {
      name: 'styles.css dark',
      bg: token(dark, 'parchment'),
      text: { ink: token(dark, 'ink'), stone: token(dark, 'stone'), fog: token(dark, 'fog') }
    }
  ];
}

var palettes = quietPage('404.css').concat(quietPage('now.css'), sitePalettes());

var count = 0;
function test(name, fn) { fn(); count++; }

function tintAt(hour) { return BreatheTint.hourTint(new Date(2026, 0, 15, hour, 0, 0)); }

test('the stylesheets still expose every token the wash sits under', function () {
  assert.strictEqual(palettes.length, 6, 'three palettes x two modes');
  palettes.forEach(function (p) {
    assert.ok(/^#[0-9A-Fa-f]{6}$/.test(p.bg), p.name + ' has a hex background');
    assert.ok(Object.keys(p.text).length >= 3, p.name + ' has its text tokens');
  });
});

// Tier 1 — the guard that matters: where a page's own palette clears AA, the
// wash must never be what pushes it under, at any hour.
test('every hour of wash keeps AA text above 4.5:1 on every page', function () {
  palettes.forEach(function (p) {
    Object.keys(p.text).forEach(function (name) {
      var fg = p.text[name];
      if (contrast(fg, p.bg) < 4.5) { return; }
      for (var h = 0; h < 24; h++) {
        var t = tintAt(h);
        var washed = composite(t.color, t.alpha, p.bg);
        var ratio = contrast(fg, washed);
        assert.ok(
          ratio >= 4.5,
          p.name + ' --' + name + ' ' + fg + ' at hour ' + h + ' (' + t.name +
          ' ' + t.color + ' @ ' + t.alpha + ' over ' + p.bg + ' = ' + washed +
          ') is ' + ratio.toFixed(3) + ':1 — needs >= 4.5:1'
        );
      }
    });
  });
});

// Pinned so a palette repair prompts an update here, and so a *new* sub-AA
// token can never hide among the known ones. These fail unwashed; the wash is
// neither their cause nor their cure (see the header note).
test('the set of tokens already below AA before any wash is unchanged', function () {
  var failing = [];
  palettes.forEach(function (p) {
    Object.keys(p.text).forEach(function (name) {
      if (contrast(p.text[name], p.bg) < 4.5) { failing.push(p.name + ' --' + name); }
    });
  });
  assert.deepStrictEqual(failing.sort(), [
    'styles.css dark --fog',
    'styles.css light --fog',
    'styles.css light --stone'
  ]);
});

test('/now and /404 resolve to the same palette', function () {
  assert.deepStrictEqual(quietPage('404.css'), quietPage('now.css').map(function (p) {
    return { name: p.name.replace('now.css', '404.css'), bg: p.bg, text: p.text };
  }));
});

console.log(count + ' passed');
