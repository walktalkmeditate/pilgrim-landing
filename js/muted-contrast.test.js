/* muted-contrast — proves --ink-fog stays legible everywhere it is used.

   Three things conspire against muted text on this site, and a token value on
   its own accounts for none of them:

     1. js/seasonal.js rewrites --parchment at runtime on index/guide/compare,
        so the background is a moving target across the year and the day.
     2. Per-element `opacity` composites the text toward the background, which
        is how .horizon-signoff read at 2.05:1 while its token measured 5.17:1.
     3. Light and dark mode have separate values and separate worst cases.

   So this walks the real seasonal envelope (365 days x 24 hours, both modes),
   composites each rule's own opacity over the worst background it can land
   on, and asserts WCAG AA for small text. Tokens are parsed from the
   stylesheets so the test cannot drift from what ships.

   --fog is deliberately NOT covered: it is decoration (the walker, the cairn,
   the middots) and is exempt as such. If it ever becomes text again, it
   belongs here. */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AA_SMALL = 4.5;

let count = 0;
function test(name, fn) { fn(); count++; }

function hexToRgb(h) {
  const s = h.replace('#', '').trim();
  return [0, 2, 4].map(function (i) { return parseInt(s.substr(i, 2), 16); });
}

function relLuminance(rgb) {
  const c = rgb.map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const l1 = relLuminance(a), l2 = relLuminance(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function composite(fg, alpha, bg) {
  return [0, 1, 2].map(function (i) {
    return Math.round(fg[i] * alpha + bg[i] * (1 - alpha));
  });
}

/* --- tokens, read from the stylesheet rather than restated here --- */

const styles = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');

function tokenIn(block, name) {
  const m = block.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})'));
  assert.ok(m, 'expected --' + name + ' to be defined');
  return m[1];
}

const lightBlock = styles.slice(styles.indexOf(':root'), styles.indexOf('[data-theme="dark"]'));
const darkBlock = styles.slice(styles.indexOf('[data-theme="dark"]'));

const INK_FOG = { light: tokenIn(lightBlock, 'ink-fog'), dark: tokenIn(darkBlock, 'ink-fog') };
const STATIC_PARCHMENT = { light: tokenIn(lightBlock, 'parchment'), dark: tokenIn(darkBlock, 'parchment') };

/* --- the seasonal envelope, driven by the real engine --- */

function worstParchment(mode) {
  const captured = {};
  const doc = {
    documentElement: {
      style: { setProperty: function (k, v) { captured[k] = v; } },
      getAttribute: function () { return mode; }
    }
  };
  // js/seasonal.js is a bare browser script: it touches `document` at call
  // time and exports nothing node can require. Evaluating it against a stub
  // document is how we test the real shift maths instead of restating it here
  // and letting the copy rot. The only input is this repo's own source file —
  // anyone who can edit it can already run code via the test itself.
  const src = fs.readFileSync(path.join(ROOT, 'js/seasonal.js'), 'utf8');
  const engine = {};
  new Function('document', 'window', 'out', src + '\n;out.applySeasonalColors = applySeasonalColors;')(doc, {}, engine);

  const RealDate = Date;
  let worst = hexToRgb(STATIC_PARCHMENT[mode]);
  let worstLum = relLuminance(worst);

  for (let day = 0; day < 365; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const when = new RealDate(2026, 0, 1, hour, 0, 0);
      when.setDate(when.getDate() + day);
      global.Date = class extends RealDate {
        constructor() { super(when.getTime()); }
        static now() { return when.getTime(); }
      };
      engine.applySeasonalColors();
      global.Date = RealDate;

      const rgb = hexToRgb(captured['--parchment']);
      const l = relLuminance(rgb);
      // light mode: darkest paper is worst for dark text. dark mode: lightest.
      if (mode === 'light' ? l < worstLum : l > worstLum) { worst = rgb; worstLum = l; }
    }
  }
  return worst;
}

const WORST_BG = { light: worstParchment('light'), dark: worstParchment('dark') };

/* --- every rule that paints muted text, with the opacity it actually renders at --- */

const MUTED_TEXT = [
  { sel: '.horizon-links a', opacity: 1 },
  { sel: '.horizon-icon-link', opacity: 1 },
  { sel: '.horizon-signoff', opacity: 1 },
  { sel: '.github-link', opacity: 1 },
  { sel: '.scroll-hint-text', opacity: 1 },
  { sel: '.scroll-tracker.visible', opacity: 1 },
  { sel: '.page-cairn-label', opacity: 1 },
  { sel: '.reliquary-lightbox-dist', opacity: 1 },
  { sel: '.legal-updated', opacity: 1 },
  { sel: '.legal-footer-links a', opacity: 1 }
];

test('--ink-fog clears AA for small text in both modes, at the seasonal worst case', function () {
  ['light', 'dark'].forEach(function (mode) {
    const bg = WORST_BG[mode];
    MUTED_TEXT.forEach(function (rule) {
      const painted = composite(hexToRgb(INK_FOG[mode]), rule.opacity, bg);
      const ratio = contrast(painted, bg);
      assert.ok(
        ratio >= AA_SMALL,
        mode + ' ' + rule.sel + ' is ' + ratio.toFixed(3) + ':1, below AA ' + AA_SMALL + ':1'
      );
    });
  });
});

test('no muted-text rule reintroduces a per-element opacity', function () {
  // Stacking opacity on --ink-fog is what caused the original failure, so the
  // rules above must not quietly regain one. .horizon-sep is excluded on
  // purpose: it is an aria-hidden decorative middot, not text.
  const legal = fs.readFileSync(path.join(ROOT, 'css/legal.css'), 'utf8');
  const all = styles + legal;

  MUTED_TEXT.forEach(function (rule) {
    const escaped = rule.sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = all.match(new RegExp('(^|\\n)' + escaped + '\\s*\\{([^}]*)\\}'));
    if (!m) { return; }
    const opacity = m[2].match(/opacity:\s*([0-9.]+)/);
    assert.ok(
      !opacity || parseFloat(opacity[1]) === 1,
      rule.sel + ' has opacity ' + (opacity && opacity[1]) + '; muted text must let --ink-fog carry the muting'
    );
  });
});

test('--fog is no longer used as a text colour anywhere', function () {
  const legal = fs.readFileSync(path.join(ROOT, 'css/legal.css'), 'utf8');
  [['css/styles.css', styles], ['css/legal.css', legal]].forEach(function (pair) {
    const file = pair[0], src = pair[1];
    const offenders = [];
    const re = /(^|\n)([^{}\n][^{}]*)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const sel = m[2].trim();
      if (!/color:\s*var\(--fog\)/.test(m[3])) { continue; }
      // decoration keeps --fog: the walker, the cairn's stones, a card icon
      if (/page-walker|page-cairn-stones|traces-card-icon/.test(sel)) { continue; }
      offenders.push(sel);
    }
    assert.strictEqual(
      offenders.length, 0,
      file + ' uses --fog as text on: ' + offenders.join(', ') + ' (--fog is decoration; use --ink-fog)'
    );
  });
});

test('the seasonal engine does not shift --ink-fog', function () {
  const seasonal = fs.readFileSync(path.join(ROOT, 'js/seasonal.js'), 'utf8');
  assert.ok(
    !/['"]?ink-fog['"]?\s*:/.test(seasonal),
    '--ink-fog appears in js/seasonal.js; it must stay static so its contrast cannot drift'
  );
});

console.log(count + ' passed');
