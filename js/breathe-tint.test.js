'use strict';
var assert = require('assert');
var BreatheTint = require('./breathe-tint.js');
var hourTint = BreatheTint.hourTint;

var count = 0;
function test(name, fn) { fn(); count++; }

function at(hour) { return hourTint(new Date(2026, 0, 15, hour, 0, 0)); }

test('night hours return the night tint', function () {
  assert.strictEqual(at(21).name, 'night');
  assert.strictEqual(at(23).name, 'night');
  assert.strictEqual(at(2).name, 'night');
  assert.strictEqual(at(4).name, 'night');
});

test('dawn hours return the dawn tint', function () {
  assert.strictEqual(at(5).name, 'dawn');
  assert.strictEqual(at(7).name, 'dawn');
});

test('daylight hours return the day tint', function () {
  assert.strictEqual(at(8).name, 'day');
  assert.strictEqual(at(12).name, 'day');
  assert.strictEqual(at(16).name, 'day');
});

test('evening hours return the dusk tint', function () {
  assert.strictEqual(at(17).name, 'dusk');
  assert.strictEqual(at(20).name, 'dusk');
});

test('every hour of the day returns a tint', function () {
  for (var h = 0; h < 24; h++) {
    assert.ok(at(h) && at(h).name, 'a tint at hour ' + h);
  }
});

test('every tint is a valid hex colour', function () {
  for (var h = 0; h < 24; h++) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(at(h).color), 'hex colour at hour ' + h);
  }
});

// A ceiling, not a contrast proof: a low alpha does not by itself preserve AA
// (dusk and night once cleared 0.08 and still broke /now's --ink-fog). The real
// guard composites each tint over the actual stylesheet tokens — see
// js/breathe-contrast.test.js. This only keeps the wash from becoming a layer.
test('alpha stays within the wash ceiling', function () {
  for (var h = 0; h < 24; h++) {
    var t = at(h);
    assert.ok(t.alpha > 0 && t.alpha <= 0.08,
      'alpha within 0..0.08 at hour ' + h + ' (got ' + t.alpha + ')');
  }
});

test('missing or invalid input falls back to the day tint', function () {
  assert.strictEqual(hourTint(null).name, 'day');
  assert.strictEqual(hourTint(undefined).name, 'day');
  assert.strictEqual(hourTint(new Date('not a date')).name, 'day');
  assert.strictEqual(hourTint('nope').name, 'day');
});

console.log(count + ' passed');
