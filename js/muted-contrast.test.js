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

   'dark' means html[data-theme="dark"] (Finding 2), not
   body.constellation: /daylight carries the site's full three-theme
   system (light / dark / star — js/main.js cycleTheme), and plain dark
   sets data-theme="dark" without the constellation class. Keying the
   ribbon's dark colours to body.constellation alone left plain dark
   painting the light-mode rgba() values onto #1C1914 — measured at
   1.09:1 adjacent, 1.36:1 extremes, both under the floors below: the
   ribbon went effectively invisible for any OS-dark visitor who never
   explicitly picked star mode. Constellation sets data-theme="dark" too
   (js/main.js setTheme, theme 'star'), so 'dark' here now covers both —
   proven identical below, not assumed, by asserting the old
   body.constellation colour selector is gone rather than trusting two
   themes to coincide by luck.

   Every mode is composited over EVERY background it really renders on,
   not just one per mode. Star mode paints #0a0a12 (css/styles.css,
   body.constellation) while plain dark paints --parchment #1C1914, and
   both resolve the same html[data-theme="dark"] ramp — sweeping only
   #1C1914 left the star background untested. It happens to clear every
   floor today, which is exactly the shape of the blind spot that let
   plain dark ship at 1.09:1: not a live defect, but nothing was holding
   it true either.

   The dashed sweep (Finding 3, then Finding 6) runs on REAL merged runs,
   not an abstract five-step ramp. The dash pattern's gaps let the
   background through, so a stroke painted a fraction `d` of the time
   composites the same as a solid stroke at `d` times the alpha — but `d`
   is not the flat on/(on+off) this file used to assume. stroke-dasharray
   restarts its phase at every <line> and stroke-dashoffset is never set,
   so each run starts painted and ends wherever its own length lands
   inside the period: d = (floor(L/p)×on + min(L mod p, on)) / L, which
   equals on/(on+off) only when L is a whole number of periods and rises
   toward 1.0 otherwise. Modelling a flat duty on an abstract ramp
   reported 1.318:1 for the darkest pair while the pair Shikoku actually
   draws — band 3's short runs at duty 0.786 against band 4's long ones
   at 0.754 — sat at 1.239:1, under this file's own floor. So the sweep
   below reads each dashed route's real merged runs (the same
   DaylightMath.mergeDarknessRuns output renderRibbon draws), gives every
   run its own length's duty, and asserts the floors on the pairs the
   ribbon genuinely puts next to each other. */

const DaylightMath = require('./daylight-math.js');

const RIBBON_BAND_VS_BG_MIN = 1.1;
const RIBBON_BAND_ADJACENT_MIN = 1.25;
const RIBBON_BAND_EXTREMES_MIN = 2.0;
const RIBBON_BAND_COUNT = 5;

const RIBBON_MODE_SELECTOR_PREFIX = { light: '', dark: 'html[data-theme="dark"] ' };

// Star mode's background is a `background:` on body.constellation in
// css/styles.css, not a --parchment token, so it needs its own lookup.
// The rule is written as a two-selector group (html:has(body.constellation),
// body.constellation) and body.constellation appears again further down
// for `color:`, so this scans every match and keeps the one that actually
// declares a background.
function constellationBackground() {
  const re = /(^|\n)body\.constellation\s*\{([^}]*)\}/g;
  let m, found = null;
  while ((m = re.exec(styles)) !== null) {
    const bg = m[2].match(/background:\s*(#[0-9A-Fa-f]{6})/);
    if (bg) found = bg[1];
  }
  assert.ok(found, 'expected a body.constellation background colour in css/styles.css');
  return found;
}

// Every background each mode's one ramp is really painted onto. js/main.js
// setTheme puts data-theme="dark" on <html> for BOTH plain dark and star,
// so the dark ramp has two real backgrounds, not one.
const RIBBON_BACKGROUNDS = {
  light: [{ label: STATIC_PARCHMENT.light + ' (light parchment)', rgb: hexToRgb(STATIC_PARCHMENT.light) }],
  dark: [
    { label: STATIC_PARCHMENT.dark + ' (dark parchment)', rgb: hexToRgb(STATIC_PARCHMENT.dark) },
    { label: constellationBackground() + ' (star mode)', rgb: hexToRgb(constellationBackground()) }
  ]
};

// The dash pattern, read from the stylesheet's own stroke-dasharray rather
// than hardcoded — so a future retuning of the dash can't silently desync
// this test's math from what ships.
function ribbonDashPattern() {
  const decls = ruleDeclarations(daylightCss, '.dl-ribbon-unvalidated');
  assert.ok(decls, 'expected .dl-ribbon-unvalidated in css/daylight.css');
  const m = decls.match(/stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/);
  assert.ok(m, '.dl-ribbon-unvalidated has no stroke-dasharray: <on> <off> declaration');
  const on = parseFloat(m[1]), off = parseFloat(m[2]);
  return { on: on, off: off, period: on + off };
}

const DASH = ribbonDashPattern();

// The fraction of a run of length `lengthUnits` that is actually painted.
// Phase restarts per <line> (one element per run, and stroke-dashoffset is
// never set), so every run opens on a dash and closes on a partial period.
function dashDutyFor(lengthUnits) {
  const wholePeriods = Math.floor(lengthUnits / DASH.period);
  const remainder = lengthUnits - wholePeriods * DASH.period;
  return (wholePeriods * DASH.on + Math.min(remainder, DASH.on)) / lengthUnits;
}

function ribbonBandColor(index, mode, dashed) {
  const base = RIBBON_MODE_SELECTOR_PREFIX[mode] + '.dl-ribbon-band-' + index;
  const sel = dashed ? base + '.dl-ribbon-unvalidated' : base;
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

/* The real runs, per route: the same mergeDarknessRuns output renderRibbon
   turns into <line> elements, converted to the ribbon's own drawing units
   with the same kmToRibbonX arithmetic (fraction of coveredKm across
   DARKNESS_RIBBON_WIDTH). Read from assets/darkness/ so a re-bake changes
   what this test measures instead of leaving it asserting a shape that no
   longer ships. `dashed` mirrors renderRibbon exactly: heldOutValidation
   !== true, not === false. */
const DARKNESS_DIR = path.join(ROOT, 'assets/darkness');

const DARKNESS_ROUTES = fs.readdirSync(DARKNESS_DIR)
  .filter(function (f) { return /\.json$/.test(f) && f !== 'meta.json'; })
  .map(function (f) {
    const artifact = JSON.parse(fs.readFileSync(path.join(DARKNESS_DIR, f), 'utf8'));
    const windowKm = DaylightMath.darknessAggregateWindowKm(artifact.positionalConfidence);
    const runs = DaylightMath.mergeDarknessRuns(
      artifact.values, artifact.stepKm, artifact.coveredKm, windowKm);
    return {
      id: f.replace(/\.json$/, ''),
      dashed: artifact.heldOutValidation !== true,
      runs: runs.map(function (r) {
        const lengthUnits = (r.endKm - r.startKm) / artifact.coveredKm * DaylightMath.DARKNESS_RIBBON_WIDTH;
        return { band: r.band, lengthUnits: lengthUnits, duty: dashDutyFor(lengthUnits) };
      })
    };
  });

const DASHED_ROUTES = DARKNESS_ROUTES.filter(function (r) { return r.dashed; });

test('the dashed sweep has real unvalidated routes to measure (fixture sanity)', function () {
  assert.ok(DASHED_ROUTES.length > 0,
    'no artifact in assets/darkness/ renders dashed — the dashed floors below would pass vacuously');
  assert.ok(DASHED_ROUTES.some(function (r) { return r.runs.length > 1; }),
    'no dashed route has more than one run — the adjacent-pair floor below would pass vacuously');
});

test('darkness ribbon bands stay pairwise distinguishable, solid, on every background each theme really paints (D11, Finding 2)', function () {
  ['light', 'dark'].forEach(function (mode) {
    const colors = [];
    for (let i = 0; i < RIBBON_BAND_COUNT; i++) colors.push(ribbonBandColor(i, mode, false));

    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const bg = background.rgb;
      const composited = colors.map(function (c) { return composite(c.rgb, c.alpha, bg); });

      const label = mode + ' solid over ' + background.label;
      console.log('\n  darkness ribbon band separation — ' + label);
      composited.forEach(function (c, i) {
        const ratio = contrast(c, bg);
        console.log('    band-' + i + '  ' + c + '  vs bg = ' + ratio.toFixed(3) + ':1');
        assert.ok(
          ratio >= RIBBON_BAND_VS_BG_MIN,
          label + ' .dl-ribbon-band-' + i + ' is ' + ratio.toFixed(3) + ':1 against its page background, below the '
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
          label + ' band-' + i + '->band-' + (i + 1) + ' is ' + ratio.toFixed(3) + ':1, below the '
            + RIBBON_BAND_ADJACENT_MIN + ':1 adjacent-pair floor'
        );
      }

      const extremes = contrast(composited[0], composited[RIBBON_BAND_COUNT - 1]);
      console.log('    band-0 -> band-4 (extremes) = ' + extremes.toFixed(3) + ':1   (min adjacent '
        + minAdjacent.toFixed(3) + ':1)');
      assert.ok(
        extremes >= RIBBON_BAND_EXTREMES_MIN,
        label + ' band-0 vs band-4 is ' + extremes.toFixed(3) + ':1, below the ' + RIBBON_BAND_EXTREMES_MIN
          + ':1 extremes floor'
      );
    });
  });
});

test('dashed bands stay distinguishable on the runs the ribbon actually draws, each at its own length\'s duty (Finding 3, Finding 6)', function () {
  ['light', 'dark'].forEach(function (mode) {
    const colors = [];
    for (let i = 0; i < RIBBON_BAND_COUNT; i++) colors.push(ribbonBandColor(i, mode, true));

    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const bg = background.rgb;

      DASHED_ROUTES.forEach(function (route) {
        const label = mode + ' dashed ' + route.id + ' over ' + background.label;
        console.log('\n  darkness ribbon band separation — ' + label);

        const composited = route.runs.map(function (run) {
          return composite(colors[run.band].rgb, colors[run.band].alpha * run.duty, bg);
        });

        route.runs.forEach(function (run, i) {
          const ratio = contrast(composited[i], bg);
          console.log('    run ' + i + '  band-' + run.band + '  L=' + run.lengthUnits.toFixed(2)
            + 'u  duty=' + run.duty.toFixed(4) + '  effective alpha '
            + (colors[run.band].alpha * run.duty).toFixed(4) + '  vs bg = ' + ratio.toFixed(3) + ':1');
          assert.ok(
            ratio >= RIBBON_BAND_VS_BG_MIN,
            label + ' run ' + i + ' (band-' + run.band + ') is ' + ratio.toFixed(3)
              + ':1 against its page background, below the ' + RIBBON_BAND_VS_BG_MIN + ':1 floor'
          );
        });

        for (let i = 0; i < composited.length - 1; i++) {
          const ratio = contrast(composited[i], composited[i + 1]);
          console.log('    run ' + i + ' (band-' + route.runs[i].band + ') -> run ' + (i + 1)
            + ' (band-' + route.runs[i + 1].band + ')  = ' + ratio.toFixed(3) + ':1');
          assert.ok(
            ratio >= RIBBON_BAND_ADJACENT_MIN,
            label + ' run ' + i + ' (band-' + route.runs[i].band + ', duty ' + route.runs[i].duty.toFixed(4)
              + ') against run ' + (i + 1) + ' (band-' + route.runs[i + 1].band + ', duty '
              + route.runs[i + 1].duty.toFixed(4) + ') is ' + ratio.toFixed(3) + ':1, below the '
              + RIBBON_BAND_ADJACENT_MIN + ':1 adjacent-pair floor'
          );
        }
      });
    });
  });
});

/* A run shorter than one dash renders fully painted — duty 1.0 — because
   the phase starts on a dash. Nothing ships that short today (Shikoku's
   narrowest is 18.66u), but it is one re-bake away, and it inverts bands
   rather than merely dimming them: a short dashed band-1 run at full duty
   composites darker than a long dashed band-2 run at 0.75, so the reader
   reads the wrong band entirely. The sweep above would catch it only if
   the two happened to end up adjacent; this catches the shape itself. */
test('no dashed run is short enough to render fully solid (Finding 6)', function () {
  DASHED_ROUTES.forEach(function (route) {
    route.runs.forEach(function (run, i) {
      assert.ok(
        run.lengthUnits > DASH.on,
        route.id + ' run ' + i + ' (band-' + run.band + ') is ' + run.lengthUnits.toFixed(2)
          + ' units long, not longer than the ' + DASH.on + '-unit dash — it renders fully solid (duty '
          + run.duty.toFixed(3) + ') and can read as a darker band than it is'
      );
    });
  });
});

/* The sweep above can only measure band pairs that some shipped route
   actually draws next to each other — today that is bands 2, 3 and 4.
   This closes the rest of the ramp against the duty spread those real
   runs establish: every adjacent pair is measured with the brighter band
   at the highest duty any real run reaches and the darker band at the
   dash's nominal floor, which is the worst pairing the spread permits.
   The duty numbers are the real ones, not a flat model — that flat model
   is precisely what reported 1.318:1 for a pair sitting at 1.239:1. */
test('the whole dashed ramp holds its floors across the duty spread the real runs exhibit (Finding 6)', function () {
  const duties = DASHED_ROUTES.reduce(function (all, route) {
    return all.concat(route.runs.map(function (run) { return run.duty; }));
  }, []);
  const dutyCeiling = Math.max.apply(null, duties);
  const dutyFloor = DASH.on / DASH.period;
  assert.ok(dutyCeiling >= dutyFloor, 'a real run cannot be painted less than the nominal duty');

  ['light', 'dark'].forEach(function (mode) {
    const colors = [];
    for (let i = 0; i < RIBBON_BAND_COUNT; i++) colors.push(ribbonBandColor(i, mode, true));

    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const bg = background.rgb;
      const label = mode + ' dashed ramp over ' + background.label;
      console.log('\n  darkness ribbon dashed ramp, worst duty pairing — ' + label
        + '  (duty ' + dutyFloor.toFixed(4) + '..' + dutyCeiling.toFixed(4) + ')');

      const brightest = colors.map(function (c) { return composite(c.rgb, c.alpha * dutyCeiling, bg); });
      const darkest = colors.map(function (c) { return composite(c.rgb, c.alpha * dutyFloor, bg); });

      for (let i = 0; i < RIBBON_BAND_COUNT - 1; i++) {
        const ratio = contrast(brightest[i], darkest[i + 1]);
        console.log('    band-' + i + ' at duty ' + dutyCeiling.toFixed(4) + ' -> band-' + (i + 1)
          + ' at duty ' + dutyFloor.toFixed(4) + '  = ' + ratio.toFixed(3) + ':1');
        assert.ok(
          ratio >= RIBBON_BAND_ADJACENT_MIN,
          label + ' band-' + i + '->band-' + (i + 1) + ' is ' + ratio.toFixed(3)
            + ':1 at the worst duty pairing the real runs permit, below the '
            + RIBBON_BAND_ADJACENT_MIN + ':1 adjacent-pair floor'
        );
      }

      const extremes = contrast(brightest[0], darkest[RIBBON_BAND_COUNT - 1]);
      console.log('    band-0 -> band-4 (extremes, worst duty pairing) = ' + extremes.toFixed(3) + ':1');
      assert.ok(
        extremes >= RIBBON_BAND_EXTREMES_MIN,
        label + ' band-0 vs band-4 is ' + extremes.toFixed(3) + ':1 at the worst duty pairing, below the '
          + RIBBON_BAND_EXTREMES_MIN + ':1 extremes floor'
      );
    });
  });
});

test('constellation renders the ribbon bands through the same html[data-theme="dark"] rule as plain dark, not a separate one (Finding 2)', function () {
  // js/main.js setTheme: theme 'star' sets BOTH data-theme="dark" on <html>
  // AND class="constellation" on <body> — never one without the other. If a
  // distinct body.constellation .dl-ribbon-band-N colour rule existed
  // alongside html[data-theme="dark"] .dl-ribbon-band-N, the two themes
  // could silently diverge again even though each independently clears the
  // floors above — so this asserts the old selector is gone outright,
  // rather than trusting a coincidence.
  assert.ok(
    !/body\.constellation\s+\.dl-ribbon-band-\d/.test(daylightCss),
    'css/daylight.css still has a body.constellation .dl-ribbon-band-N colour rule — constellation and plain dark can diverge again'
  );
});

/* =============================================
   Slice 3, Task 7 — the moon strip's silver ramp (spec D8; AC #12)

   Same floors as the darkness ribbon, over the same three real
   backgrounds. The strip is solid on every route — it carries no
   validation claim of its own, so there is no dashed variant and no duty
   correction to make.

   The extra requirement here is that the two ramps stay TELLABLE APART.
   They sit on one shared axis, a few pixels apart; if a moon band and a
   darkness band composite to the same colour on some background, a
   reader has two strips they cannot separate at a glance.
   ============================================= */

function moonBandColor(index, mode) {
  const sel = RIBBON_MODE_SELECTOR_PREFIX[mode] + '.dl-moon-band-' + index;
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|\\n)' + escaped + '\\s*\\{([^}]*)\\}', 'g');
  let m, decls = null;
  while ((m = re.exec(daylightCss)) !== null) {
    if (/stroke:\s*[^;]+;/.test(m[2])) decls = m[2];
  }
  assert.ok(decls, 'expected a stroke: colour declaration for ' + sel + ' in css/daylight.css');
  return resolveFillColor(decls.match(/stroke:\s*([^;]+);/)[1].trim(), mode);
}

test('moon strip bands stay pairwise distinguishable on every background each theme really paints (D8, AC #12)', function () {
  ['light', 'dark'].forEach(function (mode) {
    const colors = [];
    for (let i = 0; i < RIBBON_BAND_COUNT; i++) colors.push(moonBandColor(i, mode));

    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const bg = background.rgb;
      const composited = colors.map(function (c) { return composite(c.rgb, c.alpha, bg); });

      const label = mode + ' moon strip over ' + background.label;
      console.log('\n  moon strip band separation — ' + label);

      composited.forEach(function (c, i) {
        const ratio = contrast(c, bg);
        console.log('    moon-' + i + '  ' + c + '  vs bg = ' + ratio.toFixed(3) + ':1');
        assert.ok(
          ratio >= RIBBON_BAND_VS_BG_MIN,
          label + ' .dl-moon-band-' + i + ' is ' + ratio.toFixed(3) + ':1 against its page background, below the '
            + RIBBON_BAND_VS_BG_MIN + ':1 floor'
        );
      });

      /* Band 0 is held to the ADJACENT floor against the background, not
         the weaker vs-background one the other four get.

         This strip is the one thing on the page with real holes in it —
         shikoku's 288 km between temple clusters draw as bare parchment
         — so "no moon" and "nothing drawn" are two readings a reader has
         to separate, which makes the page background band 0's neighbour
         and 1.25:1 its floor. It shipped at 1.247:1, missing by 0.003,
         while a real band-0 cell on shikoku (9.00 units) is narrower
         than a real gap (9.70 units) and 24% of kumano's start dates
         render the entire strip as band 0. */
      const gapRatio = contrast(composited[0], bg);
      console.log('    moon-0 vs a GAP (bare background) = ' + gapRatio.toFixed(3) + ':1');
      assert.ok(
        gapRatio >= RIBBON_BAND_ADJACENT_MIN,
        label + ' .dl-moon-band-0 is ' + gapRatio.toFixed(3) + ':1 against bare background, below the '
          + RIBBON_BAND_ADJACENT_MIN + ':1 adjacent-pair floor — "no moon" and "nothing drawn" are '
          + 'not tellable apart, and this strip really does draw gaps'
      );

      let minAdjacent = Infinity;
      for (let i = 0; i < composited.length - 1; i++) {
        const ratio = contrast(composited[i], composited[i + 1]);
        console.log('    moon-' + i + ' -> moon-' + (i + 1) + '  = ' + ratio.toFixed(3) + ':1');
        minAdjacent = Math.min(minAdjacent, ratio);
        assert.ok(
          ratio >= RIBBON_BAND_ADJACENT_MIN,
          label + ' moon-' + i + '->moon-' + (i + 1) + ' is ' + ratio.toFixed(3) + ':1, below the '
            + RIBBON_BAND_ADJACENT_MIN + ':1 adjacent-pair floor'
        );
      }

      const extremes = contrast(composited[0], composited[RIBBON_BAND_COUNT - 1]);
      console.log('    moon-0 -> moon-4 (extremes) = ' + extremes.toFixed(3) + ':1   (min adjacent '
        + minAdjacent.toFixed(3) + ':1)');
      assert.ok(
        extremes >= RIBBON_BAND_EXTREMES_MIN,
        label + ' moon-0->moon-4 is ' + extremes.toFixed(3) + ':1, below the '
          + RIBBON_BAND_EXTREMES_MIN + ':1 extremes floor'
      );
    });
  });
});

/* The mark on a named night (H1, D10).

   The two nights the closing sentence names carry a short vertical
   stroke. It hangs BELOW the strip, in the axis-label row, so the thing
   it has to be tellable apart from is the page — one known colour per
   theme — and not whichever of five ramp steps happens to lie under it.

   That is why it moved. The sweep this replaces measured the mark
   against every band, and the mark could not clear an honest floor on
   any of them: 1.550:1 on band 4 in dark themes, and a lantern night is
   by definition on the ramp's bright end, so the worst case was the
   common case (89% of shikoku's marks land on a block, and on the pinned
   date both named nights are blocks). Nor was that a tuning failure —
   against the dark ramp's composited extremes, band 0 rgb(60,56,49) and
   band 4 rgb(219,204,154), the best achievable worst-case for any grey
   is 2.681:1, at value 122. No colour on the band clears 3:1 at both
   ends, and the earlier 1.45 floor was the number that relationship
   could reach, not the number the reader needs.

   Off the band, WCAG 1.4.11's 3:1 for a graphical object carrying
   essential information is simply reachable — and locating the named
   night is this mark's whole purpose, so 3:1 is the right bar.

   This measurement is only the right one while the mark really is off
   the band. That is not asserted here, where the CSS is: it is measured
   in js/daylight-render.test.js, from the emitted y attributes against
   this stylesheet's own band stroke-width. */
const MOON_MARK_VS_BG_MIN = 3.0;

/* Resolves .dl-moon-tick's stroke the way a browser would, base rule
   plus any dark-theme override. The mark ships as one rule painted in
   var(--ink-fog) — a token that flips itself between themes, so no
   second rule can fall through in a theme the first did not cover, which
   is how the ribbon's own bands once shipped at 1.02:1. If a dark
   override is ever added back, this measures it rather than the base. */
function moonMarkColor(mode) {
  const base = ruleDeclarations(daylightCss, '.dl-moon-tick');
  assert.ok(base, 'expected .dl-moon-tick in css/daylight.css');
  const dark = mode === 'dark'
    ? ruleDeclarations(daylightCss, RIBBON_MODE_SELECTOR_PREFIX.dark + '.dl-moon-tick')
    : null;
  const src = (dark && /stroke:\s*[^;]+;/.test(dark)) ? dark : base;
  const m = src.match(/stroke:\s*([^;]+);/);
  assert.ok(m, '.dl-moon-tick has no stroke colour declaration');
  return resolveFillColor(m[1].trim(), mode);
}

const NIGHT_SPEC_PATH = path.join(ROOT, 'docs/specs/2026-08-13-night-worth-walking.md');

function markVsBackgroundRatios() {
  const out = [];
  ['light', 'dark'].forEach(function (mode) {
    const mark = moonMarkColor(mode);
    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      out.push({
        label: background.label,
        mode: mode,
        painted: composite(mark.rgb, mark.alpha, background.rgb),
        ratio: contrast(composite(mark.rgb, mark.alpha, background.rgb), background.rgb)
      });
    });
  });
  return out;
}

test('a named night\'s mark clears 3:1 against the page it sits on, on all three backgrounds (H1, D10, AC #12)', function () {
  markVsBackgroundRatios().forEach(function (r) {
    console.log('\n  named-night mark over ' + r.label + '  ' + r.painted
      + ' = ' + r.ratio.toFixed(3) + ':1');
    assert.ok(
      r.ratio >= MOON_MARK_VS_BG_MIN,
      r.mode + ' .dl-moon-tick is ' + r.ratio.toFixed(3) + ':1 against ' + r.label
        + ', below the ' + MOON_MARK_VS_BG_MIN + ':1 floor WCAG 1.4.11 asks of a graphical '
        + 'object carrying essential information — a mark nobody can find names nothing'
    );
  });
});

test('every figure the spec states for the mark is the figure the mark measures (H1, AC #12)', function () {
  /* The same guard AC #12's ramp triple already has, applied to the
     number this wave introduced — and applied to EVERY occurrence of it,
     because the mark's figure is stated twice (D10 and AC #12) and a
     correction that lands in one place and not the other is how the ramp
     figure came to be wrong the second time. */
  const spec = fs.readFileSync(NIGHT_SPEC_PATH, 'utf8');
  const measured = markVsBackgroundRatios().map(function (r) { return r.ratio; });

  const re = /the mark measures\s+\*\*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+):1\*\*/g;
  let m, occurrences = 0;
  while ((m = re.exec(spec)) !== null) {
    occurrences++;
    const stated = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
    console.log('  spec occurrence ' + occurrences + ' states '
      + stated.map(function (v) { return v.toFixed(3); }).join(' / ')
      + '  measured ' + measured.map(function (v) { return v.toFixed(3); }).join(' / '));
    assert.strictEqual(stated.length, measured.length,
      'the spec states ' + stated.length + ' figures for the mark but it has '
        + measured.length + ' real backgrounds');
    measured.forEach(function (value, i) {
      assert.ok(
        Math.abs(value - stated[i]) < 0.001,
        'the spec states ' + stated[i] + ':1 for the mark on background ' + i
          + ', but the shipped stylesheet measures ' + value.toFixed(3) + ':1'
      );
    });
  }
  assert.strictEqual(occurrences, 2,
    'the spec states the mark\'s measured contrast in ' + occurrences + ' places, expected 2 '
      + '(D10 and AC #12) — a figure this file cannot find is a figure that can drift');
});

test('a named night\'s mark is no louder than the axis labels it now sits beside (H1)', function () {
  /* The mark moved into the label row of a deliberately restrained
     instrument. "Off the band" bought the contrast; it must not also buy
     a new loudest mark on the strip. Painting it in the labels' own ink
     is the whole of the answer, and this is what holds it there. */
  ['light', 'dark'].forEach(function (mode) {
    const mark = moonMarkColor(mode);
    const labelDecls = ruleDeclarations(daylightCss, '.dl-moon-label');
    assert.ok(labelDecls, 'expected .dl-moon-label in css/daylight.css');
    const labelFill = resolveFillColor(labelDecls.match(/fill:\s*([^;]+);/)[1].trim(), mode);
    const labelOpacityM = labelDecls.match(/fill-opacity:\s*([\d.]+)/);
    const labelAlpha = labelFill.alpha * (labelOpacityM ? parseFloat(labelOpacityM[1]) : 1);

    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const bg = background.rgb;
      const markRatio = contrast(composite(mark.rgb, mark.alpha, bg), bg);
      const labelRatio = contrast(composite(labelFill.rgb, labelAlpha, bg), bg);
      console.log('  ' + background.label + ': mark ' + markRatio.toFixed(3)
        + ':1, axis label ' + labelRatio.toFixed(3) + ':1');
      assert.ok(
        markRatio <= labelRatio + 0.001,
        mode + ' .dl-moon-tick is ' + markRatio.toFixed(3) + ':1 against ' + background.label
          + ' while .dl-moon-label beside it is ' + labelRatio.toFixed(3)
          + ':1 — the mark has become the loudest thing under the strip'
      );
    });
  });
});

test('a named night\'s mark is wide enough to survive the narrowest viewport this page renders at (G1)', function () {
  /* The F6 lesson, in the one place it applies to a solid stroke. The
     strip is an SVG with a 600-unit viewBox and `width: 100%`, so one
     unit is one CSS pixel only at full width; on a phone the whole
     drawing is scaled down. A stroke narrower than one device pixel is
     painted by antialiasing at partial coverage, which is an alpha
     multiplier the sweep above does not model — and the measured
     contrast would then be a fiction, exactly as a flat dash duty was
     for the ribbon.

     600 is the viewBox width; 280 is the narrowest content column this
     page renders at (a 320px phone less the layout's own padding). */
  const VIEWBOX_UNITS = 600;
  const NARROWEST_CONTENT_PX = 280;

  const decls = ruleDeclarations(daylightCss, '.dl-moon-tick');
  assert.ok(decls, 'expected .dl-moon-tick in css/daylight.css');
  const m = decls.match(/stroke-width:\s*([\d.]+)/);
  assert.ok(m, '.dl-moon-tick has no stroke-width declaration');
  const devicePx = parseFloat(m[1]) * (NARROWEST_CONTENT_PX / VIEWBOX_UNITS);
  console.log('\n  named-night mark: stroke-width ' + m[1] + ' units renders at '
    + devicePx.toFixed(3) + ' px on a ' + NARROWEST_CONTENT_PX + 'px column');
  assert.ok(
    devicePx >= 1,
    '.dl-moon-tick is ' + devicePx.toFixed(3) + ' device px wide on the narrowest column this page '
      + 'renders at — under one pixel it is painted at partial coverage, and every contrast figure '
      + 'measured for it above is optimistic'
  );
});

test('the moon ramp is warm where the darkness ramp is cool, so two strips on one axis stay tellable apart (D8)', function () {
  // Deliberately a HUE test, not a luminance one. Two five-step ramps
  // that each span their theme's usable luminance range must overlap in
  // luminance somewhere — a contrast() floor between them would demand
  // the impossible and force bad colour choices to satisfy a requirement
  // that was never the real one. What D8 actually asks is that the two
  // read as different instruments, and that is carried by hue.
  //
  // Checked over bands 2-4, where each ramp's identity lives: band 0 of
  // both ramps is near-neutral by design (an absence, in both cases).
  const MIN_MOON_WARMTH = 30;   // R - B
  function warmth(c) { return c.rgb[0] - c.rgb[2]; }

  ['light', 'dark'].forEach(function (mode) {
    for (let i = 2; i < RIBBON_BAND_COUNT; i++) {
      const moonW = warmth(moonBandColor(i, mode));
      const darkW = warmth(ribbonBandColor(i, mode, false));
      console.log('  ' + mode + ' band ' + i + ': moon R-B ' + moonW + ', darkness R-B ' + darkW);
      assert.ok(moonW >= MIN_MOON_WARMTH,
        mode + ' .dl-moon-band-' + i + ' has R-B of ' + moonW + ', not warm enough to read as the moon strip');
      assert.ok(darkW < 0,
        mode + ' .dl-ribbon-band-' + i + ' has R-B of ' + darkW + ', no longer cool — the two ramps would converge');
      assert.ok(moonW - darkW >= MIN_MOON_WARMTH,
        mode + ' band ' + i + ': the two ramps are only ' + (moonW - darkW) + ' apart in R-B');
    }
  });
});

test('the spec\'s stated moon-ramp extremes are the ramp\'s actual extremes (AC #12)', function () {
  /* Twice now the spec has carried a contrast figure the CSS did not
     produce. The second time it was written into the very commit whose
     purpose was correcting a misstated number, quoting the ramp's
     pre-retune extremes (4.9 / 7.3 / 8.6) after the alphas had already
     moved. A number in a spec that nothing checks is a number that
     drifts, so this reads the three figures back out of the document and
     recomputes them from what ships. */
  const spec = fs.readFileSync(NIGHT_SPEC_PATH, 'utf8');
  /* Anchored on its own sentence, not on "the first triple in the
     document". The unanchored version broke the moment the spec gained a
     SECOND figure of the same shape — the mark's, checked below — and
     silently measured the ramp against it. A regex that matches two
     different claims is not checking either. */
  // \s+ rather than literal spaces: the spec is hand-wrapped prose, and a
  // reflow that puts the anchor and the figure on two lines is a legitimate
  // edit that must not silently switch this guard off.
  const m = spec.match(/its extremes measure\s+\*\*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+):1\*\*/);
  assert.ok(m, 'the spec no longer states the moon ramp\'s three extremes as '
    + '"its extremes measure **a / b / c:1**"');
  const stated = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];

  const measured = [];
  ['light', 'dark'].forEach(function (mode) {
    const first = moonBandColor(0, mode);
    const last = moonBandColor(RIBBON_BAND_COUNT - 1, mode);
    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const bg = background.rgb;
      measured.push(contrast(composite(first.rgb, first.alpha, bg),
                             composite(last.rgb, last.alpha, bg)));
    });
  });

  console.log('\n  spec extremes stated ' + stated.map(function (v) { return v.toFixed(3); }).join(' / ')
    + '  measured ' + measured.map(function (v) { return v.toFixed(3); }).join(' / '));
  assert.strictEqual(measured.length, stated.length,
    'the spec states ' + stated.length + ' extremes but the ramp has ' + measured.length + ' real backgrounds');
  measured.forEach(function (value, i) {
    assert.ok(
      Math.abs(value - stated[i]) < 0.001,
      'the spec states ' + stated[i] + ':1 for the moon ramp\'s extremes on background ' + i
        + ', but the shipped alphas measure ' + value.toFixed(3) + ':1'
    );
  });
});

test('the moon ramp is defined for both themes and never scoped to body.constellation (D8)', function () {
  // moonBandColor, not ruleDeclarations: .dl-moon-band-4 is also the last
  // name in the shared band-0..4 geometry selector, so a first-match
  // lookup finds stroke-width/fill and no colour at all — the same trap
  // ribbonBandColor documents above.
  for (let i = 0; i < RIBBON_BAND_COUNT; i++) {
    const c = moonBandColor(i, 'light');
    assert.ok(c && c.rgb && c.rgb.length === 3,
      '.dl-moon-band-' + i + ' has no light-theme stroke colour');
  }
  assert.ok(
    !/body\.constellation\s+\.dl-moon-band-\d/.test(daylightCss),
    'css/daylight.css scopes a moon band to body.constellation — star mode and plain dark can diverge, '
      + 'which is exactly how the ribbon shipped invisible in plain dark'
  );
  assert.ok(
    /html\[data-theme="dark"\]\s+\.dl-moon-band-4/.test(daylightCss),
    'the moon ramp has no html[data-theme="dark"] rule — it would render at light-theme alpha on dark backgrounds'
  );
});

/* =============================================
   The dark-hours curve (after-the-sun §A, Task 7)

   Three elements on one plot, and the whole argument of the section is
   that they read as different things:

     .sunpath-dark-curve    the nights that have a night
     .sunpath-dark-none     the stretch that does not
     .sunpath-dark-turning  the four hinges

   The band is the one that matters. A stretch with no night drawn as a
   fainter shade of the curve reads as "less of this"; it is not less
   dark, it is no dark. So it is checked against the curve, not only
   against the page.
   ============================================= */

const sunpathCss = fs.readFileSync(path.join(ROOT, 'css', 'sunpath.css'), 'utf8');

function sunpathStroke(selector, prop) {
  const decls = ruleDeclarations(sunpathCss, selector);
  assert.ok(decls, 'expected ' + selector + ' in css/sunpath.css');
  const m = new RegExp(prop + ':\\s*([^;]+);').exec(decls);
  assert.ok(m, selector + ' has no ' + prop);
  return m[1].trim();
}

function sunpathOpacity(selector) {
  const decls = ruleDeclarations(sunpathCss, selector);
  const m = /opacity:\s*([\d.]+)/.exec(decls || '');
  return m ? parseFloat(m[1]) : 1;
}

test('the dark-hours curve clears AA-large against every background it is drawn on (§A)', function () {
  ['light', 'dark'].forEach(function (mode) {
    const curve = resolveFillColor(sunpathStroke('.sunpath-dark-curve', 'stroke'), mode);
    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const px = composite(curve.rgb, curve.alpha, background.rgb);
      const ratio = contrast(px, background.rgb);
      console.log('  dark-hours curve — ' + mode + ' over ' + background.label
        + ' = ' + ratio.toFixed(3) + ':1');
      assert.ok(ratio >= 3.0,
        mode + ' .sunpath-dark-curve is ' + ratio.toFixed(3)
          + ':1 against ' + background.label + ', below the 3:1 a line carrying the reading needs');
    });
  });
});

test('the no-night band is distinguishable from the curve, not a fainter version of it (§A, D5)', function () {
  ['light', 'dark'].forEach(function (mode) {
    const curve = resolveFillColor(sunpathStroke('.sunpath-dark-curve', 'stroke'), mode);
    const band = resolveFillColor(sunpathStroke('.sunpath-dark-none', 'fill'), mode);
    const bandAlpha = sunpathOpacity('.sunpath-dark-none');

    RIBBON_BACKGROUNDS[mode].forEach(function (background) {
      const curvePx = composite(curve.rgb, curve.alpha, background.rgb);
      const bandPx = composite(band.rgb, band.alpha * bandAlpha, background.rgb);

      const vsBg = contrast(bandPx, background.rgb);
      const vsCurve = contrast(bandPx, curvePx);
      console.log('  no-night band — ' + mode + ' over ' + background.label
        + ': vs page ' + vsBg.toFixed(3) + ':1, vs curve ' + vsCurve.toFixed(3) + ':1');

      // Visible at all...
      assert.ok(vsBg >= 1.1,
        mode + ' .sunpath-dark-none is ' + vsBg.toFixed(3)
          + ':1 against ' + background.label + ' — the stretch would not be visible');
      // ...and clearly not the same mark as the curve.
      assert.ok(vsCurve >= 2.0,
        mode + ' .sunpath-dark-none and .sunpath-dark-curve are only ' + vsCurve.toFixed(3)
          + ':1 apart over ' + background.label + ' — the band would read as a faded curve');
    });
  });
});

test('/sunpath stays inside the +12 KB budget the spec set before any of this was written (D9, AC #11)', function () {
  // The budget exists because /daylight went 52 -> 106 KB across three
  // slices with no budget, each increase small on its own. Measured
  // per-file, which is what a CDN actually sends — gzipping the
  // concatenated stream understates it by about 5%.
  const page = fs.readFileSync(path.join(ROOT, 'sunpath', 'index.html'), 'utf8');
  const files = (page.match(/(?:src|href)="\/(?:js|css)\/[^"]+"/g) || [])
    .map(function (m) { return m.replace(/^(?:src|href)="\//, '').replace(/"$/, ''); });

  const zlib = require('zlib');
  let total = 0;
  files.forEach(function (f) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) total += zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length;
  });

  const BASELINE_KB = 90.94;   // b270938, the spec commit, before any code
  const BUDGET_KB = 12.0;
  const nowKb = total / 1024;
  const delta = nowKb - BASELINE_KB;

  console.log('  /sunpath: ' + nowKb.toFixed(2) + ' KB gzipped, '
    + (delta >= 0 ? '+' : '') + delta.toFixed(2) + ' KB against a ' + BUDGET_KB + ' KB budget');
  assert.ok(delta <= BUDGET_KB,
    '/sunpath has grown ' + delta.toFixed(2) + ' KB, past the ' + BUDGET_KB
      + ' KB this feature was given. §B was cut for exactly this reason (D6) — raise the '
      + 'budget deliberately in the spec, or cut something, but do not let it drift here.');
});

console.log(count + ' passed');
