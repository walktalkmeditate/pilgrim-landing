'use strict';
// Guards WCAG AA for /seek's muted secondary text (--ink-fog) across all three
// hours. Reads the real tokens from css/seek.css so a future palette edit can't
// silently regress contrast — the golden/dawn/dusk palette is the one that broke.
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'seek.css'), 'utf8');

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

function block(selector) {
  var re = new RegExp(selector.replace(/[[\]"]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  var m = css.match(re);
  assert.ok(m, 'block not found: ' + selector);
  return m[1];
}

function token(blockText, name) {
  var m = blockText.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})'));
  assert.ok(m, 'token --' + name + ' not found');
  return m[1];
}

var hours = {
  day:    block(':root'),
  golden: block('html[data-hour="golden"]'),
  night:  block('html[data-hour="night"]')
};

var count = 0;
Object.keys(hours).forEach(function (hour) {
  var fog = token(hours[hour], 'ink-fog');
  var paper = token(hours[hour], 'paper');
  var ratio = contrast(fog, paper);
  assert.ok(
    ratio >= 4.5,
    hour + ' muted text (--ink-fog ' + fog + ' on --paper ' + paper + ') is ' +
    ratio.toFixed(2) + ':1 — needs >= 4.5:1'
  );
  count++;
});

console.log(count + ' hours pass AA for muted text');
