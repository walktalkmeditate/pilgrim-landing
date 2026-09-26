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
   - at thirty viewports, short laptops, tablets and short windows among
     them, with and without a desktop scrollbar, nothing meets the pill:
     docked, against every scene it docks in and every walked line
     before it, the rail's links and scene 06's traces; and on a
     desktop, the centred "Begin walking" of scene 01 against scene 01's
     own line;
   - on a desktop or tablet, no phone meets the line, the docked pill or
     the copy beside it, and the finale's copy, estimated from its text,
     stands whole between the stage's top and the walked lines.
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
// So are iPads upright (744 to 1024 wide): the 721–1024px layout on a
// stage taller than it is wide, where a phone sized by the height is
// widest against its column. And the stages of that layout between
// upright and landscape (half of a 1512 to 1728px MacBook screen in split
// view among them), where the corner beside the Honor climb is too small
// for the pill and a phone may reach down to where it docks instead, from
// the narrowest to one whose corner is free again; and the short windows
// of that band, where the rail and scene 06's traces fill the stage's
// middle and the finale has the least room.
const VIEWPORTS = [[1920, 1080], [1440, 900], [1024, 768], [562, 915], [390, 844], [375, 667],
  [1440, 789], [1536, 730], [1280, 720], [1366, 650], [1280, 600],
  [768, 1024], [810, 1080], [820, 1180], [834, 1194], [744, 1133], [1024, 1366],
  [725, 600], [760, 900], [800, 640], [840, 900], [864, 1000], [900, 1000], [1000, 1000], [1010, 1330],
  [725, 720], [760, 620], [810, 600], [980, 700], [1000, 580]];

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
          rules.push({ selectors: splitSelectors(prelude), body: src.slice(i, end), media: media });
        }
        i = end + 1;
      }
    }
  }
  block([], false);
  return rules;
}

// A selector list splits on its top-level commas only: :is(a, b) is one.
function splitSelectors(prelude) {
  const out = [];
  let depth = 0, from = 0;
  for (let k = 0; k < prelude.length; k++) {
    const ch = prelude.charAt(k);
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { out.push(prelude.slice(from, k).trim()); from = k + 1; }
  }
  out.push(prelude.slice(from).trim());
  return out;
}

function mediaMatches(query, vw, vh) {
  return query.split(/\s+and\s+/).every(function (cond) {
    const ratio = /^\((min|max)-aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\)$/.exec(cond.trim());
    if (ratio) return ratio[1] === 'min' ? vw * +ratio[3] >= vh * +ratio[2] : vw * +ratio[3] <= vh * +ratio[2];
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

// right/bottom: a sum of a percentage of the stage, px, rem and vw, maybe
// inside calc() with an env() inset, which is 0 here (see the viewport
// check below).
function offset(value, extent, vw) {
  const stripped = value.replace(/env\([^)]*\)\)?/g, '0px');
  const terms = stripped.match(/[\d.]+(%|px|rem|vw)/g) || [];
  if (!terms.length) throw new Error('unreadable offset: ' + value);
  return terms.reduce(function (a, t) {
    const v = parseFloat(t);
    if (/%$/.test(t)) return a + v / 100 * extent;
    if (/rem$/.test(t)) return a + v * ROOT_PX;
    if (/vw$/.test(t)) return a + v / 100 * vw;
    return a + v;
  }, 0);
}

function pillBox(vw, vh, W, theme, label, docked) {
  const s = pillStyle(vw, vh, theme, docked);
  const font = px(s['font-size'], ROOT_PX);
  const pad = s.padding.split(/\s+/).map(function (v) { return px(v, font); });
  const padY = pad[0], padX = pad.length > 1 ? pad[1] : pad[0];
  const gap = px(s.gap, font);
  const width = 2 * padX + label.length * EM_PER_CHAR * font + gap + ARROW_EM * font;
  const height = 2 * padY + LINE_EM * font;
  const bottom = vh - offset(s.bottom, vh, vw);
  if (s.left === 'auto' && s.transform === 'none') {
    const right = W - offset(s.right, W, vw);
    return [right - width, bottom - height, right, bottom];
  }
  if (/^translateX?\(-50%/.test(s.transform || '')) {
    const centre = offset(s.left, W, vw);
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

// A length: %, vw, svh, rem, em and px, added, subtracted and scaled by
// plain numbers, in calc(), min(), max(), clamp() and parentheses, with
// env() insets at 0 (see the viewport check above). `on` gives what % is
// of, the viewport (vw, vh; 100svh is the viewport's height here) and the
// em. Anything else fails loudly.
function cssLength(value, on) {
  const src = String(value || '').replace(/env\([^()]*\)/g, '0px').replace(/\s+/g, '');
  const tokens = src.match(/(?:calc|min|max|clamp)?\(|[\d.]+(?:%|vw|svh|rem|em|px)?|[-+*,)]/g) || [];
  if (!src || tokens.join('') !== src) throw new Error('unreadable length: ' + value);
  let i = 0;
  function fail() { throw new Error('unreadable length: ' + value); }
  function sum() {
    let v = product();
    while (tokens[i] === '+' || tokens[i] === '-') v = tokens[i++] === '+' ? v + product() : v - product();
    return v;
  }
  function product() {
    let v = operand();
    while (tokens[i] === '*') { i++; v *= operand(); }
    return v;
  }
  function operand() {
    const t = tokens[i++] || '';
    if (/\($/.test(t)) {
      const args = [sum()];
      while (tokens[i] === ',') { i++; args.push(sum()); }
      if (tokens[i++] !== ')') fail();
      if (t === 'min(') return Math.min.apply(null, args);
      if (t === 'max(') return Math.max.apply(null, args);
      if (t === 'clamp(' && args.length === 3) return Math.max(args[0], Math.min(args[1], args[2]));
      if (args.length > 1) fail();
      return args[0];
    }
    const m = /^([\d.]+)(%|vw|svh|rem|em|px)?$/.exec(t);
    const unit = m && { '%': on.pct / 100, vw: on.vw / 100, svh: on.vh / 100, rem: ROOT_PX, em: on.em, px: 1 }[m[2] || 'px'];
    if (!m || unit === undefined) fail();
    return +m[1] * (m[2] ? unit : 1);
  }
  const length = sum();
  if (i !== tokens.length || isNaN(length)) fail();
  return length;
}

function phoneBox(vw, vh, W, honor) {
  const targets = ['.walk-story--pinned .walk-story-phone'].concat(honor ? ['.walk-story--pinned .walk-story-scene[data-scene="honor"] .walk-story-phone'] : []);
  const s = cascade(targets, vw, vh, 'light');
  const ride = /\* ([\d.]+)px\)\)$/.exec(s.transform || '');
  if (!ride) throw new Error('the phone is expected to ride by its hold: ' + s.transform);
  const inset = Math.max(0, W / 2 - FRAME_HALF);
  const height = Math.min(cssLength(s.height, { pct: vh, vw: vw, vh: vh }), px(s['max-height'], ROOT_PX));
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

console.log('\n=== on a desktop or tablet, the docked pill keeps clear of every phone ===\n');

// Where the pill cannot dock beside the Honor climb (a stage 721 to
// 1000px wide), it docks above the line, or above the rail on a stage as
// wide as it is tall, and a phone may reach to either; so each phone is
// checked against the pill of its own scene.
VIEWPORTS.filter(function (v) { return v[0] > 720; }).forEach(function (v) {
  const vw = v[0], vh = v[1];
  [0, SCROLLBAR_PX].forEach(function (bar) {
    const W = vw - bar;
    const at = vw + 'x' + vh + (bar ? ' (scrollbar)' : '');
    phoneScenes.filter(function (n) { return n > 1 && C.pillLabel(n - 1); }).forEach(function (n) {
      const phone = phoneBox(vw, vh, W, C.SCENES[n - 1].id === 'honor');
      const pill = pillBox(vw, vh, W, 'light', C.pillLabel(n - 1), true);
      ok(!boxesOverlap(grow(pill, CLEAR_PX), phone), at + ': scene ' + n + '\'s docked pill at [' + pill.map(Math.round).join(', ') +
        '] keeps clear of its phone at [' + phone.map(Math.round).join(', ') + ']');
    });
  });
});

console.log('\n=== the docked pill keeps clear of the rail, and of scene 06\'s traces ===\n');

// The rail: its links stacked at the stage's right, centred on its top,
// each dot reaching out to its ::before, the link's hit area. The pill
// stays out of that reach, or a tap meant for one lands on the other.
const RAIL_LINKS = ((story.match(/<nav class="walk-story-rail"[\s\S]*?<\/nav>/) || [''])[0].match(/<a /g) || []).length;

function railBox(vw, vh, W) {
  const s = cascade(['.walk-story--pinned .walk-story-rail'], vw, vh, 'light');
  const dot = cascade(['.walk-story-rail a'], vw, vh, 'light');
  const reach = cascade(['.walk-story-rail a::before'], vw, vh, 'light').inset.split(/\s+/).map(function (v) {
    if (!/^-[\d.]+px$/.test(v)) throw new Error('the rail\'s reach is expected as negative px: ' + v);
    return -parseFloat(v);
  });
  if (s.transform !== 'translateY(-50%)') throw new Error('the rail is expected to centre on its top: ' + s.transform);
  const len = function (v, of) { return cssLength(v, { pct: of, vw: vw, vh: vh }); };
  const height = RAIL_LINKS * len(dot.height) + (RAIL_LINKS - 1) * len(s.gap);
  const right = W - len(s.right, W);
  const cy = len(s.top, vh);
  return [right - len(dot.width) - reach[1], cy - height / 2 - reach[0], right + reach[1], cy + height / 2 + reach[0]];
}

// Scene 06's act: its two cards, centred in their column (52% to 84% of
// the front) on the stage's middle, and grown by the act's scale about
// that centre. The cards are Chrome's 217 by 184px with the cairn at its
// first stone; its longest count, "108 stones · eternal", widens them to
// about 222. On a phone the act stands in the grid, above the pill's row.
const TRACES_PX = [224, 184];

function tracesBox(vw, vh, W) {
  const s = cascade(['.walk-story--pinned .ws-act--right', '.walk-story--pinned .ws-act--traces'], vw, vh, 'light');
  const scale = /^translateY\(-50%\) scale\(([\d.]+)\)$/.exec(s.transform || '');
  if (!scale || s['transform-origin'] !== '50% 50%') throw new Error('the traces are expected to centre on their top and grow about their middle: ' + s.transform);
  const inset = Math.max(0, W / 2 - FRAME_HALF);
  const cx = inset + (pct(s.left) + pct(s.width) / 2) * (W - 2 * inset);
  const cy = pct(s.top) * vh;
  const half = [TRACES_PX[0] * scale[1] / 2, TRACES_PX[1] * scale[1] / 2];
  return [cx - half[0], cy - half[1], cx + half[0], cy + half[1]];
}

ok(RAIL_LINKS === C.SCENES.length, 'the rail carries a link for each of the ' + C.SCENES.length + ' scenes  (' + RAIL_LINKS + ')');
VIEWPORTS.forEach(function (v) {
  const vw = v[0], vh = v[1];
  const compact = vw <= 720;
  const label = C.SCENES.map(function (_, i) { return C.pillLabel(i); }).filter(function (l, i) {
    return l && (compact || i > 0);
  }).sort(function (a, b) { return b.length - a.length; })[0];
  [0, SCROLLBAR_PX].forEach(function (bar) {
    if (compact && bar) return;
    const W = vw - bar;
    const at = vw + 'x' + vh + (bar ? ' (scrollbar)' : '');
    const pill = pillBox(vw, vh, W, 'light', label, true);
    const rail = railBox(vw, vh, W);
    ok(!boxesOverlap(grow(pill, CLEAR_PX), rail), at + ': the docked pill at [' + pill.map(Math.round).join(', ') +
      '] keeps clear of the rail\'s reach at [' + rail.map(Math.round).join(', ') + ']');
    if (compact) return;
    const traces = tracesBox(vw, vh, W);
    ok(!boxesOverlap(grow(pill, CLEAR_PX), traces), at + ': the docked pill at [' + pill.map(Math.round).join(', ') +
      '] keeps clear of scene 06\'s traces at [' + traces.map(Math.round).join(', ') + ']');
  });
});

console.log('\n=== on a desktop or tablet, no phone meets the copy beside it ===\n');

// The copy is a column at the stage's left, set by its left and width
// (scene 02's spoken words share it); a caption may run to the column's
// edge, so a phone stands clear of the whole column, by a rem.
const COPY_CLEAR_PX = 16;

function sceneTargets(scene, what) {
  const own = '[data-scene="' + scene + '"]';
  const out = ['.walk-story--pinned ' + what];
  RULES.forEach(function (r) {
    r.selectors.forEach(function (sel) {
      const m = /^\.walk-story--pinned \.walk-story-scene(\[[^\]]+\]|:is\((.*)\)) (.+)$/.exec(sel);
      if (m && m[3] === what && (m[1] === own || splitSelectors(m[2] || '').indexOf(own) !== -1)) out.push(sel);
    });
  });
  return out;
}

function columnRight(vw, vh, W, scene, what) {
  const s = cascade(sceneTargets(scene, what), vw, vh, 'light');
  const inset = Math.max(0, W / 2 - FRAME_HALF);
  return inset + (pct(s.left) + pct(s.width)) * (W - 2 * inset);
}

VIEWPORTS.filter(function (v) { return v[0] > 720; }).forEach(function (v) {
  const vw = v[0], vh = v[1];
  [0, SCROLLBAR_PX].forEach(function (bar) {
    const W = vw - bar;
    const at = vw + 'x' + vh + (bar ? ' (scrollbar)' : '');
    phoneScenes.forEach(function (n) {
      const scene = C.SCENES[n - 1].id;
      const phone = phoneBox(vw, vh, W, scene === 'honor');
      const from = story.indexOf('id="scene-' + n + '"');
      const block = story.slice(from, n < C.SCENES.length ? story.indexOf('id="scene-' + (n + 1) + '"') : story.length);
      ['.walk-story-copy'].concat(block.indexOf('class="ws-said"') !== -1 ? ['.ws-said'] : []).forEach(function (what) {
        const edge = columnRight(vw, vh, W, scene, what);
        const gap = phone[0] - edge;
        ok(gap >= COPY_CLEAR_PX, at + ': scene ' + n + '\'s phone stands ' + Math.round(gap) + 'px clear of its ' + what +
          ' column (right edge ' + Math.round(edge) + ', phone from ' + Math.round(phone[0]) + ')');
      });
    });
  });
});

console.log('\n=== on a desktop or tablet, the finale stands whole on the stage ===\n');

// Scene 09's copy is the story's tallest: the privacy lines and the call
// to act. A short stage compacts it and hides none of it (the markup
// test), so it must still fit: below the stage's top, and above every
// walked line (scene 07's ring rises nearest). Its height is estimated
// from its own text and the cascade. Each block is wrapped word by word
// at the width Chrome sets its type, in em a character, rounded up: the
// kicker's tracked capitals 0.837, the light headline 0.363, the body
// 0.386 (and its ch 0.477, rounded down), the list 0.375 to 0.413, the
// link and its arrow 0.422, the italic lead-in 0.394. The badges are
// their contents, 137 and 110 by 30px, and their padding.
const FINALE_EM = { kicker: 0.86, headline: 0.364, body: 0.39, list: 0.42, link: 0.43, leadIn: 0.4, ch: 0.47 };
const BADGE_PX = [[137, 30], [110, 30]];
// The finale's height in Chrome (getBoundingClientRect, no scrollbar).
const FINALE_CHROME = [[1920, 1080, 664.3], [1366, 650, 450.2], [1280, 600, 435.1], [1024, 768, 473.2], [768, 1024, 666.7], [725, 600, 444.2]];
const BODY_TYPE = decls(/\nbody \{([^}]*)\}/.exec(fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8'))[1]);
const INLINE_CSS = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const BADGE = decls(/\.app-store-badge,\s*\.google-play-badge \{([^}]*)\}/.exec(INLINE_CSS)[1]);
const BADGE_ROW = decls(/\n\s*\.store-badges \{([^}]*)\}/.exec(INLINE_CSS)[1]);
const finale = (function () {
  const from = story.indexOf('id="scene-9"');
  return story.slice(from, story.indexOf('</section>', from));
})();

function plainText(markup) {
  return markup.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '·').replace(/\s+/g, ' ').trim();
}
function finaleText(re) {
  const m = re.exec(finale);
  if (!m) throw new Error('scene 09 is missing ' + re);
  return plainText(m[1]);
}

// Lines of text set word by word in `width`, a character `em` wide.
function wrappedLines(text, em, fontPx, width) {
  let lines = 1, used = 0;
  text.split(' ').forEach(function (word) {
    const w = word.length * em * fontPx;
    if (used && used + em * fontPx + w > width) { lines++; used = w; }
    else used += (used ? em * fontPx : 0) + w;
  });
  return lines;
}

// A block's top and bottom margins, from `margin` and its longhands.
function margins(s, len) {
  const all = (s.margin || '0').split(/\s+(?![^(]*\))/);
  return [len(s['margin-top'] || all[0]), len(s['margin-bottom'] || all[all.length > 2 ? 2 : 0])];
}

function finaleBox(vw, vh, W) {
  const style = function (what, base) { return cascade(base.concat(sceneTargets('yours-alone', what)), vw, vh, 'light'); };
  const len = function (v, of, em) { return cssLength(v, { pct: of, vw: vw, vh: vh, em: em }); };
  const inset = Math.max(0, W / 2 - FRAME_HALF);
  const copy = style('.walk-story-copy', []);
  if (copy.transform !== 'translateY(-50%)') throw new Error('the copy is expected to centre on its top: ' + copy.transform);
  const col = len(copy.width, W - 2 * inset);
  const left = inset + len(copy.left, W - 2 * inset);
  const bodyPx = len(BODY_TYPE['font-size']), bodyLh = +BODY_TYPE['line-height'];
  const blocks = [];
  function text(what, base, source, em, measure) {
    const s = style(what, base);
    const font = s['font-size'] ? len(s['font-size']) : bodyPx;
    const width = measure ? Math.min(col, measure(s, font)) : col;
    const lh = +(s['line-height'] || bodyLh);
    blocks.push({ h: wrappedLines(source, em, font, width) * font * lh, m: margins(s, len) });
  }
  text('.ws-kicker', ['.ws-kicker'], finaleText(/<p class="ws-kicker">([\s\S]*?)<\/p>/), FINALE_EM.kicker);
  text('.walk-story-copy h2', ['.walk-story-copy h2'], finaleText(/<h2[^>]*>([\s\S]*?)<\/h2>/), FINALE_EM.headline);
  text('.ws-body', ['.ws-body'], finaleText(/<p class="ws-body">([\s\S]*?)<\/p>/), FINALE_EM.body, function (s, font) {
    return len(s['max-width'].replace(/ch$/, 'em'), 0, FINALE_EM.ch * font);
  });
  const list = style('.ws-list', ['.ws-list']), item = style('.ws-list li', ['.ws-list li']);
  const itemM = margins(item, len), listM = margins(list, len);
  const items = (/<ul class="ws-list">([\s\S]*?)<\/ul>/.exec(finale) || ['', ''])[1].split('</li>').map(plainText).filter(Boolean);
  if (items.length < 4) throw new Error('scene 09 is expected to list its four privacy lines');
  blocks.push({
    h: items.reduce(function (a, t) { return a + wrappedLines(t, FINALE_EM.list, bodyPx, col) * bodyPx * +(item['line-height'] || bodyLh); }, 0) +
      (items.length - 1) * Math.max(itemM[0], itemM[1]),
    m: [Math.max(listM[0], itemM[0]), Math.max(listM[1], itemM[1])]
  });
  blocks.push({ h: wrappedLines(finaleText(/<p><a href="\/privacy">([\s\S]*?)<\/a><\/p>/), FINALE_EM.link, bodyPx, col) * bodyPx * bodyLh, m: [0, 0] });
  text('.ws-begin', ['.ws-begin'], finaleText(/<p class="ws-begin">([\s\S]*?)<\/p>/), FINALE_EM.leadIn);
  const row = Object.assign({}, BADGE_ROW, style('.walk-story-copy .store-badges', ['.walk-story-copy .store-badges']));
  const badge = Object.assign({}, BADGE, style('.walk-story-copy .store-badges .app-store-badge', []));
  const pad = badge.padding.split(/\s+/).map(function (v) { return len(v); });
  const gap = len(row.gap);
  const oneRow = row['flex-wrap'] === 'nowrap' || BADGE_PX[0][0] + BADGE_PX[1][0] + 4 * pad[1] + gap <= col;
  const badgeH = BADGE_PX[0][1] + 2 * pad[0];
  blocks.push({ h: oneRow ? badgeH : 2 * badgeH + gap, m: margins(row, len) });
  const height = blocks.reduce(function (a, b, i) { return a + b.h + (i ? Math.max(blocks[i - 1].m[1], b.m[0]) : 0); }, 0);
  const cy = len(copy.top, vh);
  return [left, cy - height / 2, left + col, cy + height / 2];
}

// The estimate must hold Chrome's finale, or the checks below are too kind.
FINALE_CHROME.forEach(function (c) {
  const box = finaleBox(c[0], c[1], c[0]);
  ok(box[3] - box[1] >= c[2] - 0.5, 'at ' + c[0] + 'x' + c[1] + ' the estimated finale, ' + Math.round(box[3] - box[1]) +
    'px tall, holds the ' + c[2] + 'px Chrome sets');
});
VIEWPORTS.filter(function (v) { return v[0] > 720; }).forEach(function (v) {
  const vw = v[0], vh = v[1];
  [0, SCROLLBAR_PX].forEach(function (bar) {
    const W = vw - bar;
    const at = vw + 'x' + vh + (bar ? ' (scrollbar)' : '');
    const box = finaleBox(vw, vh, W);
    ok(box[1] >= 0, at + ': the finale\'s copy starts ' + Math.round(box[1]) + 'px below the stage\'s top');
    report(collisions(box, W, vh, 'landscape', 1, C.SCENES.length), box, at + ': the finale\'s copy');
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
