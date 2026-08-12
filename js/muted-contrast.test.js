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
   belongs here.

   css/daylight.css gets a second, separate sweep near the bottom of this
   file: its bar labels are SVG text painted with `fill` + `fill-opacity`
   rather than `color` + `opacity`, and /daylight never loads seasonal.js,
   so neither the --ink-fog machinery nor the seasonal envelope above
   applies. The failure shape is the same one this file already exists to
   catch — a per-element opacity composited toward the background — so it
   gets the same AA proof, walking fill/fill-opacity through the cascade
   instead.

   A third, separate sweep near the very bottom covers the darkness
   ribbon's five band fills. Those aren't text, so AA doesn't apply — but
   they are decoration that a shipped version once rendered nearly flat
   (1.02:1 between adjacent bands), so this file also gates the property
   that actually matters for them: pairwise separation, not AA. */

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

/* --- css/daylight.css: the bar's SVG labels ------------------------ */

// Comments stripped before parsing: the fix for this exact file writes
// CSS comments that explain fill-opacity cascade behaviour and so contain
// the literal text "fill-opacity: <number>" themselves — without this,
// the regexes below would read a comment's example value instead of the
// declaration that follows it.
const daylightCss = fs.readFileSync(path.join(ROOT, 'css/daylight.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const INK = { light: tokenIn(lightBlock, 'ink'), dark: tokenIn(darkBlock, 'ink') };
const STONE = { light: tokenIn(lightBlock, 'stone'), dark: tokenIn(darkBlock, 'stone') };

function ruleDeclarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(^|\\n)' + escaped + '\\s*\\{([^}]*)\\}'));
  return m ? m[2] : null;
}

function resolveFillColor(raw, mode) {
  const varM = raw.match(/var\(--([\w-]+)\)/);
  if (varM) {
    const table = { ink: INK, stone: STONE, 'ink-fog': INK_FOG }[varM[1]];
    assert.ok(table, 'css/daylight.css label rule uses unhandled token --' + varM[1]);
    return { rgb: hexToRgb(table[mode]), alpha: 1 };
  }
  const rgbaM = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
  if (rgbaM) {
    return {
      rgb: [parseInt(rgbaM[1], 10), parseInt(rgbaM[2], 10), parseInt(rgbaM[3], 10)],
      alpha: rgbaM[4] !== undefined ? parseFloat(rgbaM[4]) : 1
    };
  }
  const hexM = raw.match(/#[0-9A-Fa-f]{6}/);
  assert.ok(hexM, 'unrecognized fill value in css/daylight.css: ' + raw);
  return { rgb: hexToRgb(hexM[0]), alpha: 1 };
}

/* Models the cascade rather than restating it: `fill` and `fill-opacity`
   are independent SVG properties, so a body.constellation override that
   only restates `fill` silently inherits `fill-opacity` from the
   light-mode rule and multiplies into it. Each property here falls back
   from the dark-mode rule to the base rule independently, exactly as a
   browser resolves it — which is the gap that let a dark-mode label look
   fine on paper while an unrelated light-mode fill-opacity was still
   composited in underneath it. */
function labelEffectiveAlpha(baseSelector, darkSelector, mode) {
  const baseDecls = ruleDeclarations(daylightCss, baseSelector);
  assert.ok(baseDecls, 'expected ' + baseSelector + ' in css/daylight.css');
  const darkDecls = mode === 'dark' ? ruleDeclarations(daylightCss, darkSelector) : null;

  const fillSrc = (darkDecls && /fill:/.test(darkDecls)) ? darkDecls : baseDecls;
  const fillM = fillSrc.match(/fill:\s*([^;]+);/);
  assert.ok(fillM, baseSelector + ' has no fill declaration');
  const color = resolveFillColor(fillM[1].trim(), mode);

  const opacitySrc = (darkDecls && /fill-opacity:/.test(darkDecls)) ? darkDecls : baseDecls;
  const opacityM = opacitySrc.match(/fill-opacity:\s*([\d.]+)/);
  const fillOpacity = opacityM ? parseFloat(opacityM[1]) : 1;

  return { rgb: color.rgb, alpha: color.alpha * fillOpacity };
}

const SVG_LABELS = [
  { base: '.dl-bar-label-adapt', dark: 'body.constellation .dl-bar-label-adapt' },
  { base: '.dl-bar-label',       dark: 'body.constellation .dl-bar-label' },
  { base: '.dl-bar-label-now',   dark: 'body.constellation .dl-bar-label-now' },
  { base: '.dl-ribbon-label',    dark: 'body.constellation .dl-ribbon-label' }
];

test('daylight bar SVG labels clear AA for small text in both modes, fill-opacity cascade included', function () {
  ['light', 'dark'].forEach(function (mode) {
    const bg = hexToRgb(STATIC_PARCHMENT[mode]);
    SVG_LABELS.forEach(function (entry) {
      const color = labelEffectiveAlpha(entry.base, entry.dark, mode);
      const painted = composite(color.rgb, color.alpha, bg);
      const ratio = contrast(painted, bg);
      assert.ok(
        ratio >= AA_SMALL,
        mode + ' ' + entry.base + ' is ' + ratio.toFixed(3) + ':1 (effective fill-opacity '
          + color.alpha.toFixed(3) + '), below AA ' + AA_SMALL + ':1'
      );
    });
  });
});

/* The ribbon's caption and summary sit outside <svg> on purpose (D8/D11's
   outside-SVG text equivalence), so they cascade through `color`, not
   `fill`/`fill-opacity` — a CSS colour value resolves the same way
   regardless of which property carries it, so this reuses resolveFillColor
   rather than a second value-parser. */
function textColorFor(baseSelector, darkSelector, mode) {
  const baseDecls = ruleDeclarations(daylightCss, baseSelector);
  assert.ok(baseDecls, 'expected ' + baseSelector + ' in css/daylight.css');
  const darkDecls = mode === 'dark' ? ruleDeclarations(daylightCss, darkSelector) : null;

  const colorSrc = (darkDecls && /color:/.test(darkDecls)) ? darkDecls : baseDecls;
  const colorM = colorSrc.match(/color:\s*([^;]+);/);
  assert.ok(colorM, baseSelector + ' has no color declaration');
  return resolveFillColor(colorM[1].trim(), mode);
}

const DOM_TEXT_LABELS = [
  { base: '.dl-ribbon-caption', dark: 'body.constellation .dl-ribbon-caption' },
  { base: '.dl-ribbon-summary', dark: 'body.constellation .dl-ribbon-summary' }
];

test('daylight ribbon caption/summary (outside-SVG text) clear AA for small text in both modes', function () {
  ['light', 'dark'].forEach(function (mode) {
    const bg = hexToRgb(STATIC_PARCHMENT[mode]);
    DOM_TEXT_LABELS.forEach(function (entry) {
      const color = textColorFor(entry.base, entry.dark, mode);
      const painted = composite(color.rgb, color.alpha, bg);
      const ratio = contrast(painted, bg);
      assert.ok(
        ratio >= AA_SMALL,
        mode + ' ' + entry.base + ' is ' + ratio.toFixed(3) + ':1, below AA ' + AA_SMALL + ':1'
      );
    });
  });
});

/* --- css/daylight.css: the ribbon's five band fills, pairwise -------

   The five band classes are decoration, not text — AA doesn't gate
   them (the launch doc already recorded that plainly). But the
   feature's entire point is a reader telling five steps apart, and a
   shipped version once measured 1.02:1 between adjacent bands in light
   mode: correct data, correct geometry, visually inert, and it passed
   a no-crowding pass because "not crowded" and "not visible" are
   different questions. This sweep is what would have caught it: parse
   the raw rgba() straight from the stylesheet (never restated as a
   literal here, so it can't drift from what ships), composite each
   band over the mode's real background at the stylesheet's own alpha —
   same composite()/contrast() this whole file already uses — and gate
   three things D9's five discrete bands and D11's "band identity never
   rests on hue alone" both depend on: every band reads against its own
   background, every adjacent pair clears a floor chosen to be actually
   perceptible rather than merely non-identical, and the two extremes
   (band-0 vs band-4) span wide enough that the ramp reads as five
   steps rather than a flat strip with rounding noise at the ends.

   'dark' here means the same thing it means for SVG_LABELS above:
   body.constellation's override, checked against STATIC_PARCHMENT.dark
   as the page's proxy background (this is the ribbon's *own* dark
   treatment, not [data-theme="dark"] — /daylight has no such toggle). */

const RIBBON_BAND_VS_BG_MIN = 1.1;
const RIBBON_BAND_ADJACENT_MIN = 1.25;
const RIBBON_BAND_EXTREMES_MIN = 2.0;
const RIBBON_BAND_COUNT = 5;

function ribbonBandColor(index, mode) {
  const sel = (mode === 'dark' ? 'body.constellation ' : '') + '.dl-ribbon-band-' + index;
  // Not ruleDeclarations (single first-match): .dl-ribbon-band-4 is also the
  // last name in the shared band-0..4 selector list above (no trailing comma
  // before its `{`), so a first-match lookup finds that shared geometry rule
  // — stroke-width/fill/stroke-linecap, no colour — instead of the colour
  // rule further down. Scanning every match and keeping the last one that
  // actually declares `stroke:` sidesteps the ambiguity without changing the
  // shared helper every other lookup in this file already relies on.
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|\\n)' + escaped + '\\s*\\{([^}]*)\\}', 'g');
  let m, decls = null;
  while ((m = re.exec(daylightCss)) !== null) {
    if (/stroke:\s*[^;]+;/.test(m[2])) decls = m[2];
  }
  assert.ok(decls, 'expected a stroke: colour declaration for ' + sel + ' in css/daylight.css');
  const strokeM = decls.match(/stroke:\s*([^;]+);/);
  return resolveFillColor(strokeM[1].trim(), mode);
}

test('darkness ribbon bands stay pairwise distinguishable in both themes (D11)', function () {
  ['light', 'dark'].forEach(function (mode) {
    const bg = hexToRgb(STATIC_PARCHMENT[mode]);
    const composited = [];
    for (let i = 0; i < RIBBON_BAND_COUNT; i++) {
      const color = ribbonBandColor(i, mode);
      composited.push(composite(color.rgb, color.alpha, bg));
    }

    console.log('\n  darkness ribbon band separation — ' + mode + ' (bg ' + STATIC_PARCHMENT[mode] + ')');
    composited.forEach(function (c, i) {
      const ratio = contrast(c, bg);
      console.log('    band-' + i + '  ' + c + '  vs bg = ' + ratio.toFixed(3) + ':1');
      assert.ok(
        ratio >= RIBBON_BAND_VS_BG_MIN,
        mode + ' .dl-ribbon-band-' + i + ' is ' + ratio.toFixed(3) + ':1 against its page background, below the '
          + RIBBON_BAND_VS_BG_MIN + ':1 distinguishability floor'
      );
    });

    let minAdjacent = Infinity;
    for (let i = 0; i < composited.length - 1; i++) {
      const ratio = contrast(composited[i], composited[i + 1]);
      console.log('    band-' + i + ' -> band-' + (i + 1) + '  = ' + ratio.toFixed(3) + ':1');
      minAdjacent = Math.min(minAdjacent, ratio);
      assert.ok(
        ratio >= RIBBON_BAND_ADJACENT_MIN,
        mode + ' band-' + i + '->band-' + (i + 1) + ' is ' + ratio.toFixed(3) + ':1, below the '
          + RIBBON_BAND_ADJACENT_MIN + ':1 adjacent-pair floor'
      );
    }

    const extremes = contrast(composited[0], composited[RIBBON_BAND_COUNT - 1]);
    console.log('    band-0 -> band-4 (extremes) = ' + extremes.toFixed(3) + ':1   (min adjacent '
      + minAdjacent.toFixed(3) + ':1)');
    assert.ok(
      extremes >= RIBBON_BAND_EXTREMES_MIN,
      mode + ' band-0 vs band-4 is ' + extremes.toFixed(3) + ':1, below the ' + RIBBON_BAND_EXTREMES_MIN
        + ':1 extremes floor'
    );
  });
});

console.log(count + ' passed');
