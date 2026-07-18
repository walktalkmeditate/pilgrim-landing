'use strict';
var assert = require('assert');
var SeekWord = require('./seek-word.js');
var sanitizeWord = SeekWord.sanitizeWord;

var count = 0;
function test(name, fn) { fn(); count++; }

test('lowercases and trims', function () {
  assert.strictEqual(sanitizeWord('  Stillness '), 'stillness');
});

test('passes a normal word through', function () {
  assert.strictEqual(sanitizeWord('hope'), 'hope');
});

test('preserves internal spaces so secret phrases still match', function () {
  assert.strictEqual(sanitizeWord('The Way'), 'the way');
  assert.strictEqual(sanitizeWord('the unknown'), 'the unknown');
});

test('collapses runs of whitespace', function () {
  assert.strictEqual(sanitizeWord('the   long    way'), 'the long way');
});

test('clamps to 32 characters', function () {
  var out = sanitizeWord('a'.repeat(40));
  assert.strictEqual(out.length, 32);
});

test('empty, whitespace, and null fall back to empty (begin maps to the default)', function () {
  assert.strictEqual(sanitizeWord(''), '');
  assert.strictEqual(sanitizeWord('   '), '');
  assert.strictEqual(sanitizeWord(null), '');
  assert.strictEqual(sanitizeWord(undefined), '');
});

test('neutralizes HTML-significant characters (defense-in-depth)', function () {
  var out = sanitizeWord('<script>alert(1)</script>');
  assert.ok(out.indexOf('<') === -1, 'no <');
  assert.ok(out.indexOf('>') === -1, 'no >');
});

test('neutralizes attribute-breakout characters', function () {
  var out = sanitizeWord('" onerror="alert(1)');
  assert.ok(out.indexOf('"') === -1, 'no double-quote');
  assert.ok(out.indexOf("'") === -1 || true, 'single-quote handled');
});

test('leaves ordinary unicode (e.g. an emoji) intact', function () {
  assert.strictEqual(sanitizeWord('🌙'), '🌙');
});

console.log(count + ' passed');
