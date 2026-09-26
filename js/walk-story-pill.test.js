/* =============================================
   The walk story — the docked pill keeps clear of the line

   Run via:  node js/walk-story-pill.test.js

   Once the walk is under way, "Keep walking" docks to the stage's
   bottom-right corner, where the line never goes. That promise is
   geometry, so it is checked as geometry, with no browser:

   - the pill's docked box comes from css/walk-story.css itself (its
     right, bottom, font-size, padding and gap, cascaded through the
     media queries that match each viewport), sized for the widest
     label it carries there, with room to spare;
   - every scene's line, walker, pin, ring, seal, crescent, Honor
     moment and label is read from index.html, in the geometry that
     viewport draws, and mapped to the screen by the SVG's own
     viewBox and preserveAspectRatio;
   - at eleven viewports, short laptops among them, with and without a
     desktop scrollbar, nothing meets the pill: docked, against every
     scene it docks in and every walked line before it; and on a
     desktop, the centred "Begin walking" of scene 01 against scene
     01's own line.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./walk-story-core.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'walk-story.css'), 'utf8');

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

// Conservative text metrics. Lato measures 5.83em for "Keep walking",
// 6.06em for "Begin walking" and 0.65em for "↓" in Chrome; the pill's
// box is 1.65em of line plus its padding, and the arrow's fallback glyph
// adds about a pixel. Each is rounded up here.
const EM_PER_CHAR = 0.5;
const ARROW_EM = 0.8;
const LINE_EM = 1.8;
const ROOT_PX = 16;
// Clearance on screen between the pill and anything drawn, in px.
const CLEAR_PX = 2;
// A desktop browser may take a classic scrollbar from the stage's width.
const SCROLLBAR_PX = 15;

// The short laptop stages are listed too: there the line takes a larger
// share of the height, and the corner the pill docks in is nearer to it.
const VIEWPORTS = [[1920, 1080], [1440, 900], [1024, 768], [562, 915], [390, 844], [375, 667],
  [1440, 789], [1536, 730], [1280, 720], [1366, 650], [1280, 600]];

// --- the stylesheet, cascaded per viewport ---

function parseCss(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  function block(media, discard) {
    while (i < src.length) {
      const open = src.indexOf('{', i);
      const close = src.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return; }
      if (open === -1) { i = src.length; return; }
      const prelude = src.slice(i, open).trim();
      i = open + 1;
      if (prelude.indexOf('@media') === 0) {
        block(media.concat([prelude.slice(6).trim()]), discard);
      } else if (prelude.charAt(0) === '@') {
        block(media, true);
      } else {
        const end = src.indexOf('}', i);
        if (!discard) {
          rules.push({ selectors: prelude.split(',').map(function (s) { return s.trim(); }), body: src.slice(i, end), media: media });
        }
        i = end + 1;
      }
    }
  }
  block([], false);
  return rules;
}

function mediaMatches(query, vw, vh) {
  return query.split(/\s+and\s+/).every(function (cond) {
    const m = /^\((min|max)-(width|height):\s*(\d+)px\)$/.exec(cond.trim());
    if (!m) return false;
    const v = m[2] === 'width' ? vw : vh;
    return m[1] === 'min' ? v >= +m[3] : v <= +m[3];
  });
}

function decls(body) {
  const out = {};
  body.split(';').forEach(function (d) {
    const k = d.indexOf(':');
    if (k !== -1) out[d.slice(0, k).trim()] = d.slice(k + 1).trim();
  });
  return out;
}

function specificity(sel) {
  return (sel.match(/[.[]/g) || []).length;
}

const RULES = parseCss(css);

// The declarations that reach an element, named by the selectors that
// target it, at a viewport and theme.
function cascade(targets, vw, vh, theme) {
  const hits = [];
  RULES.forEach(function (r, order) {
    if (!r.media.every(function (q) { return mediaMatches(q, vw, vh); })) return;
    r.selectors.forEach(function (sel) {
      let bare = sel;
      if (sel.indexOf('[data-theme="dark"] ') === 0) {
        if (theme !== 'dark') return;
        bare = sel.slice('[data-theme="dark"] '.length);
      }
      if (targets.indexOf(bare) !== -1) hits.push({ spec: specificity(sel), order: order, d: decls(r.body) });
    });
  });
  hits.sort(function (a, b) { return a.spec - b.spec || a.order - b.order; });
  return hits.reduce(function (acc, h) { return Object.assign(acc, h.d); }, {});
}

// The pill, docked (scenes 02–08, and 01 on a phone) or not (the hero,
// scene 01).
function pillStyle(vw, vh, theme, docked) {
  const targets = ['.walk-story--pinned .walk-story-pill'].concat(docked ? ['.walk-story--pinned .walk-story-pill.is-docked'] : []);
  return cascade(targets, vw, vh, theme);
}

function px(value, fontPx) {
  const m = /^([\d.]+)(rem|em|px)$/.exec(value);
  if (!m) throw new Error('unreadable length: ' + value);
  return +m[1] * (m[2] === 'rem' ? ROOT_PX : m[2] === 'em' ? fontPx : 1);
}

// right/bottom: a percentage of the stage, maybe inside calc() with an
// env() inset, which is 0 here (see the viewport check below).
function offset(value, extent) {
  const stripped = value.replace(/env\([^)]*\)\)?/g, '0px');
  const pct = stripped.match(/([\d.]+)%/g) || [];
  const pxs = stripped.match(/([\d.]+)px/g) || [];
  if (!pct.length && !pxs.length) throw new Error('unreadable offset: ' + value);
  return pct.reduce(function (a, p) { return a + parseFloat(p) / 100 * extent; }, 0) +
    pxs.reduce(function (a, p) { return a + parseFloat(p); }, 0);
}

function pillBox(vw, vh, W, theme, label, docked) {
  const s = pillStyle(vw, vh, theme, docked);
  const font = px(s['font-size'], ROOT_PX);
  const pad = s.padding.split(/\s+/).map(function (v) { return px(v, font); });
  const padY = pad[0], padX = pad.length > 1 ? pad[1] : pad[0];
  const gap = px(s.gap, font);
  const width = 2 * padX + label.length * EM_PER_CHAR * font + gap + ARROW_EM * font;
  const height = 2 * padY + LINE_EM * font;
  const bottom = vh - offset(s.bottom, vh);
  if (s.left === 'auto' && s.transform === 'none') {
    const right = W - offset(s.right, W);
    return [right - width, bottom - height, right, bottom];
  }
  if (/^translateX?\(-50%/.test(s.transform || '')) {
    const centre = offset(s.left, W);
    return [centre - width / 2, bottom - height, centre + width / 2, bottom];
  }
  throw new Error('the pill is expected to sit by right and bottom, or centred on left: ' + s.left + ' / ' + s.transform);
}

// --- the scenes' drawings, from index.html ---

function matMul(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}
function apply(m, p) {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}
function parseTransform(t) {
  let m = [1, 0, 0, 1, 0, 0];
  (t || '').replace(/(translate|scale)\(([^)]*)\)/g, function (_, fn, args) {
    const v = args.trim().split(/[\s,]+/).map(Number);
    const step = fn === 'translate' ? [1, 0, 0, 1, v[0], v[1] || 0] : [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
    m = matMul(m, step);
    return _;
  });
  if (/(rotate|matrix|skew)/.test(t || '')) throw new Error('unsupported transform: ' + t);
  return m;
}

function arcPoints(x1, y1, rx, ry, phiDeg, fa, fsw, x2, y2, n) {
  const phi = phiDeg * Math.PI / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  let lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fsw) co = -co;
  const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  function ang(ux, uy, vx, vy) {
    return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  }
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fsw && dt > 0) dt -= 2 * Math.PI;
  if (fsw && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const t = t1 + dt * k / n;
    pts.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  return pts;
}

// Absolute M, L, C, S, A and Z: all the story's lines use. Anything else
// fails loudly, so a new shape cannot slip past unmeasured.
function samplePath(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g);
  const pts = [];
  let i = 0, cmd = null, cur = [0, 0], start = [0, 0], lastCtrl = null;
  const N = 48;
  function num() { return +tokens[i++]; }
  function cubic(p0, p1, p2, p3) {
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
  }
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if ('MLCSAZ'.indexOf(cmd) === -1) throw new Error('unsupported path command ' + cmd + ' in ' + d.slice(0, 40));
    if (cmd === 'M') {
      cur = [num(), num()]; start = cur; pts.push(cur); cmd = 'L'; lastCtrl = null;
    } else if (cmd === 'L') {
      cur = [num(), num()]; pts.push(cur); lastCtrl = null;
    } else if (cmd === 'C') {
      const p1 = [num(), num()], p2 = [num(), num()], p3 = [num(), num()];
      cubic(cur, p1, p2, p3); cur = p3; lastCtrl = p2;
    } else if (cmd === 'S') {
      const p1 = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      const p2 = [num(), num()], p3 = [num(), num()];
      cubic(cur, p1, p2, p3); cur = p3; lastCtrl = p2;
    } else if (cmd === 'A') {
      const rx = num(), ry = num(), rot = num(), fa = num(), fsw = num(), to = [num(), num()];
      arcPoints(cur[0], cur[1], rx, ry, rot, fa, fsw, to[0], to[1], N).forEach(function (p) { pts.push(p); });
      cur = to; lastCtrl = null;
    } else if (cmd === 'Z') {
      pts.push(start); cur = start; lastCtrl = null;
    }
  }
  return pts;
}

function attr(tag, name) {
  const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
  return m ? m[1] : null;
}

const cssNumber = function (re, fallback) {
  const m = re.exec(css);
  return m ? +m[1] : fallback;
};
const STROKE = {
  landscape: cssNumber(/\.walk-story-line \{ --ws-stroke: ([\d.]+); \}/),
  portrait: cssNumber(/\.walk-story-line--portrait \{ --ws-stroke: ([\d.]+); \}/)
};
const WALKER_SCALE = { landscape: 1, portrait: cssNumber(/\.walk-story-line--portrait \.ws-dot > circle \{ transform: scale\(([\d.]+)\); \}/, 1) };
const BREATH = cssNumber(/@keyframes ws-breath \{.*?50% \{ transform: scale\(([\d.]+)\)/, 1);
const SEAL_PRESS = cssNumber(/\.ws-seal \{[^}]*transform: scale\(calc\(([\d.]+) -/, 1);

// Everything a scene draws in one geometry, in viewBox units: polylines
// with the half-width they are drawn at (a line's is its walker, which
// rides all of it), circles, and label boxes (about their marker).
function drawings(svg, geometry) {
  const lines = [], circles = [], labels = [];
  const stack = [[1, 0, 0, 1, 0, 0]];
  const classes = [];
  const tagRe = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>([^<]*)/g;
  let m, inDefs = false;
  while ((m = tagRe.exec(svg))) {
    const closing = m[1] === '/', name = m[2], rest = m[3], selfClosing = m[4] === '/';
    if (name === 'defs') { inDefs = !closing; continue; }
    if (inDefs || name === 'svg') continue;
    if (closing) {
      if (name === 'g') { stack.pop(); classes.pop(); }
      continue;
    }
    const cls = attr(rest, 'class') || '';
    const here = matMul(stack[stack.length - 1], parseTransform(attr(rest, 'transform')));
    const inside = classes.join(' ');
    const k = Math.hypot(here[0], here[1]);
    if (name === 'g' && !selfClosing) { stack.push(here); classes.push(cls); continue; }
    if (/\bws-(fog|moon)/.test(cls + ' ' + inside) || name === 'ellipse') continue;
    if (name === 'path' && /\bws-(line|follower|honor-theirs)\b/.test(cls)) {
      const walker = 6 * WALKER_SCALE[geometry];
      const half = /\bws-line\b/.test(cls) ? Math.max(walker, STROKE[geometry] / 2) : STROKE[geometry] / 2;
      lines.push({ what: cls, half: half, pts: samplePath(attr(rest, 'd')).map(function (p) { return apply(here, p); }) });
    } else if (name === 'path' && /\bws-seal-ink\b/.test(cls)) {
      continue;
    } else if (name === 'circle') {
      let r = +attr(rest, 'r');
      if (/\bws-ring\b/.test(cls)) r = r * BREATH + 1;
      else if (/\bws-seal-ink\b/.test(cls)) r = (r + 2) * SEAL_PRESS;
      else if (/\bws-crescent\b/.test(cls)) r += 1.25;
      else if (/\bws-dot\b/.test(inside)) r *= WALKER_SCALE[geometry];
      const at = apply(here, [+(attr(rest, 'cx') || 0), +(attr(rest, 'cy') || 0)]);
      circles.push({ what: (cls || inside.split(' ').pop()), c: at, r: r * k });
    } else if (name === 'text' && /\bws-moment-(label|ja)\b/.test(cls)) {
      const text = m[5];
      const perChar = /ws-moment-ja/.test(cls) ? 12 : 6.3;
      const w = text.length * perChar;
      const x = +attr(rest, 'x'), y = +attr(rest, 'y');
      const x0 = attr(rest, 'text-anchor') === 'end' ? x - w : x;
      const up = /ws-moment-ja/.test(cls) ? 11 : 10;
      labels.push({ what: text, origin: apply(here, [0, 0]), box: [x0, y - up, x0 + w, y + 3] });
    }
  }
  return { lines: lines, circles: circles, labels: labels };
}

const storyStart = html.indexOf('<section class="walk-story"');
const story = html.slice(storyStart, html.indexOf('<div id="after-walk-story">'));

function sceneSvg(n, geometry) {
  const from = story.indexOf('id="scene-' + n + '"');
  const at = story.indexOf('walk-story-line--' + geometry, from);
  const open = story.lastIndexOf('<svg', at);
  return story.slice(open, story.indexOf('</svg>', at));
}

function toScreen(svgTag, W, H) {
  const vb = attr(svgTag, 'viewBox').split(/\s+/).map(Number);
  const par = attr(svgTag, 'preserveAspectRatio').split(/\s+/);
  if (par[1] !== 'meet') throw new Error('expected meet: ' + par.join(' '));
  const s = Math.min(W / vb[2], H / vb[3]);
  const align = par[0];
  const ax = /xMin/.test(align) ? 0 : /xMid/.test(align) ? (W - vb[2] * s) / 2 : W - vb[2] * s;
  const ay = /YMin/.test(align) ? 0 : /YMid/.test(align) ? (H - vb[3] * s) / 2 : H - vb[3] * s;
  return { s: s, map: function (p) { return [(p[0] - vb[0]) * s + ax, (p[1] - vb[1]) * s + ay]; } };
}

// Does segment p–q enter the box? (Liang–Barsky)
function segmentHits(p, q, b) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const checks = [[-dx, p[0] - b[0]], [dx, b[2] - p[0]], [-dy, p[1] - b[1]], [dy, b[3] - p[1]]];
  for (let i = 0; i < 4; i++) {
    const pp = checks[i][0], qq = checks[i][1];
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function grow(b, by) {
  return [b[0] - by, b[1] - by, b[2] + by, b[3] + by];
}
function circleHits(c, r, b) {
  const x = Math.max(b[0], Math.min(c[0], b[2]));
  const y = Math.max(b[1], Math.min(c[1], b[3]));
  return Math.hypot(c[0] - x, c[1] - y) < r;
}
function boxesOverlap(a, b) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

console.log('\n=== the stylesheet and page this test reads ===\n');

const viewportMeta = (html.match(/<meta name="viewport"[^>]*>/) || [''])[0];
ok(viewportMeta && viewportMeta.indexOf('viewport-fit=cover') === -1,
  'the page is not viewport-fit=cover, so env(safe-area-inset-bottom) is 0 and the pill sits where its CSS says');
ok(STROKE.landscape > 0 && STROKE.portrait > 0, 'the line\'s stroke is read from the stylesheet in both geometries  (' + STROKE.landscape + ', ' + STROKE.portrait + ')');
ok(BREATH > 1 && SEAL_PRESS > 1, 'the ring\'s breath and the seal\'s press are read at their largest  (' + BREATH + ', ' + SEAL_PRESS + ')');
// Chrome's own boxes at 1024x768 (getBoundingClientRect, scenes 02 and
// 01): the derived boxes must hold them, or the check below is too kind.
function holds(outer, inner) {
  return outer[0] <= inner[0] + 0.5 && outer[1] <= inner[1] + 0.5 && outer[2] >= inner[2] - 0.5 && outer[3] >= inner[3] - 0.5;
}
[[true, 'Keep walking', [872.6, 705.2, 993.3, 745.0]], [false, 'Begin walking', [435.9, 686.9, 588.1, 737.3]]].forEach(function (c) {
  const box = pillBox(1024, 768, 1024, 'light', c[1], c[0]);
  ok(holds(box, c[2]), 'at 1024x768 the derived ' + (c[0] ? 'docked' : 'centred') + ' box holds the pill Chrome draws, [' + c[2].join(', ') +
    ']  ([' + box.map(function (v) { return v.toFixed(1); }).join(', ') + '])');
});

// Every mark scenes from..to draw, checked against one pill box.
function collisions(pill, W, vh, geometry, from, to) {
  const hits = [];
  let checked = 0;
  for (let n = from; n <= to; n++) {
    const svg = sceneSvg(n, geometry);
    const view = toScreen(svg.slice(0, svg.indexOf('>') + 1), W, vh);
    const d = drawings(svg, geometry);
    d.lines.forEach(function (l) {
      if (!(l.half > 0)) throw new Error('scene ' + n + ': no stroke width for ' + l.what);
      const box = grow(pill, l.half * view.s + CLEAR_PX);
      const pts = l.pts.map(view.map);
      for (let i = 1; i < pts.length; i++) {
        if (segmentHits(pts[i - 1], pts[i], box)) { hits.push('scene ' + n + ' ' + l.what + ' near (' + pts[i].map(Math.round) + ')'); break; }
      }
      checked++;
    });
    d.circles.forEach(function (c) {
      if (circleHits(view.map(c.c), c.r * view.s + CLEAR_PX, pill)) hits.push('scene ' + n + ' ' + c.what + ' at (' + view.map(c.c).map(Math.round) + ')');
      checked++;
    });
    const k = C.labelScale(view.s);
    d.labels.forEach(function (l) {
      const a = view.map([l.origin[0] + k * l.box[0], l.origin[1] + k * l.box[1]]);
      const b = view.map([l.origin[0] + k * l.box[2], l.origin[1] + k * l.box[3]]);
      if (boxesOverlap(grow([a[0], a[1], b[0], b[1]], CLEAR_PX), pill)) hits.push('scene ' + n + ' label ' + l.what);
      checked++;
    });
  }
  return { hits: hits, checked: checked };
}

function report(result, pill, what) {
  ok(result.checked > 0 && result.hits.length === 0,
    what + ' at [' + pill.map(Math.round).join(', ') + '] meets none of ' + result.checked + ' marks' +
    (result.hits.length ? '  — ' + result.hits.slice(0, 4).join('; ') : ''));
}

console.log('\n=== nothing the walk draws meets the pill ===\n');

VIEWPORTS.forEach(function (v) {
  const vw = v[0], vh = v[1];
  const compact = vw <= 720;
  const geometry = compact ? 'portrait' : 'landscape';
  // A desktop docks from scene 02 and a phone from scene 01; every walked
  // line stays drawn, so a docked scene is checked against all before it.
  const docked = C.SCENES.map(function (_, i) { return i; }).filter(function (i) {
    return C.pillLabel(i) && (compact || i > 0);
  });
  const label = docked.map(C.pillLabel).sort(function (a, b) { return b.length - a.length; })[0];
  const last = Math.max.apply(null, docked) + 1;
  [0, SCROLLBAR_PX].forEach(function (bar) {
    if (compact && bar) return;
    const W = vw - bar;
    const at = vw + 'x' + vh + (bar ? ' (scrollbar)' : '');
    ['light', 'dark'].forEach(function (theme) {
      const pill = pillBox(vw, vh, W, theme, label, true);
      report(collisions(pill, W, vh, geometry, 1, last), pill, at + ' · ' + theme + ': "' + label + '" docked through scenes 1–' + last);
      if (!compact) {
        const hero = pillBox(vw, vh, W, theme, C.pillLabel(0), false);
        report(collisions(hero, W, vh, geometry, 1, 1), hero, at + ' · ' + theme + ': "' + C.pillLabel(0) + '", centred in scene 1,');
      }
    });
  });
});

console.log('\n=== on a desktop, nothing the walk draws meets a phone ===\n');

// A phone is centred on its left and top, in the front's centred frame,
// at a height the stage sets and a ceiling caps, and it rides by its hold
// (half the transform's travel either way). Scene 04's phone sits further
// left. Every walked line stays drawn, so a phone is checked against its
// own scene's whole line and every scene before it.
const FRAME_HALF = cssNumber(/\.walk-story--pinned \.walk-story-front \{[^}]*inset: 0 max\(0px, calc\(50% - (\d+)px\)\)/);
const PHONE_ASPECT = (function () {
  const m = /\.walk-story-phone \{[^}]*aspect-ratio: (\d+) \/ (\d+);/.exec(css);
  return m ? +m[1] / +m[2] : NaN;
})();
const phoneScenes = C.SCENES.map(function (_, i) { return i + 1; }).filter(function (n) {
  const from = story.indexOf('id="scene-' + n + '"');
  const to = n < C.SCENES.length ? story.indexOf('id="scene-' + (n + 1) + '"') : story.length;
  return story.slice(from, to).indexOf('class="walk-story-phone"') !== -1;
});

function pct(value) {
  const m = /^([\d.]+)%$/.exec(value || '');
  if (!m) throw new Error('expected a percentage: ' + value);
  return +m[1] / 100;
}

function phoneBox(vw, vh, W, honor) {
  const targets = ['.walk-story--pinned .walk-story-phone'].concat(honor ? ['.walk-story--pinned .walk-story-scene[data-scene="honor"] .walk-story-phone'] : []);
  const s = cascade(targets, vw, vh, 'light');
  const ride = /\* ([\d.]+)px\)\)$/.exec(s.transform || '');
  if (!ride) throw new Error('the phone is expected to ride by its hold: ' + s.transform);
  const inset = Math.max(0, W / 2 - FRAME_HALF);
  const height = Math.min(pct(s.height) * vh, px(s['max-height'], ROOT_PX));
  const width = height * PHONE_ASPECT;
  const cx = inset + pct(s.left) * (W - 2 * inset);
  const cy = pct(s.top) * vh;
  const travel = +ride[1] / 2;
  return [cx - width / 2, cy - height / 2 - travel, cx + width / 2, cy + height / 2 + travel];
}

ok(FRAME_HALF > 0 && PHONE_ASPECT > 0 && phoneScenes.length >= 4,
  'the frame, the phone\'s shape and the scenes that carry one are read from the page  (' + FRAME_HALF + ', ' + PHONE_ASPECT.toFixed(3) + ', scenes ' + phoneScenes.join(' ') + ')');
VIEWPORTS.filter(function (v) { return v[0] > 720; }).forEach(function (v) {
  const vw = v[0], vh = v[1];
  [0, SCROLLBAR_PX].forEach(function (bar) {
    const W = vw - bar;
    const at = vw + 'x' + vh + (bar ? ' (scrollbar)' : '');
    phoneScenes.forEach(function (n) {
      const phone = phoneBox(vw, vh, W, C.SCENES[n - 1].id === 'honor');
      report(collisions(phone, W, vh, 'landscape', 1, n), phone, at + ': scene ' + n + '\'s phone, through its whole ride,');
    });
  });
});

console.log('\n---');
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS: ' + passed);
}
