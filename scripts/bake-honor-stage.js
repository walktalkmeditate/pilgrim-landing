#!/usr/bin/env node
/* Bakes the Kumano Kodō Nakahechi stage 1 line for the walk story's
 * Honor scene. Reads the committed fixture, never ../open-pilgrimages:
 * scripts/bake-collective-routes.test.js fails on any checkout without
 * the sibling repo, and this bake must not.
 *
 *   node scripts/bake-honor-stage.js           prints the SVG to paste
 *   node scripts/bake-honor-stage.js --json    prints the numbers
 *
 * The line is projected equirectangularly (x scaled by cos latitude,
 * north up) into a local box 100 wide, then placed once per geometry:
 * translated and scaled, never distorted, so its first point sits on
 * the previous scene's end point. The ink reveals by path length, so
 * each moment is placed at its fraction of the polyline's length — the
 * ink and the marker arrive together. No non-scaling stroke: with it,
 * browsers lay pathLength dashes out in screen space while the dot is
 * placed in user space, and the ink and the dot come apart. The group
 * carries its scale so the stylesheet can divide the stroke by it.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Core = require('../js/walk-story-core.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'nakahechi-stage-00.json');
const LOCAL_WIDTH = 100;
const DOT_PX = 6;

const GEOMETRIES = {
  landscape: { start: [1250, 830], width: 270 },
  portrait: { start: [84, 744], width: 90 }
};

// Takijiri-oji and Nezu-oji sit 12 units apart at the stage's foot, and
// the route climbs steeply just past Nezu-oji, so no label may reach
// rightward over the climb. On a desktop both hang left of the foot, one
// under the line and one over it, which keeps the bottom-right corner
// free for the pill. On a phone the screen's edge is to the left, so
// Takijiri-oji hangs below and Nezu-oji sits beyond the climb, under the
// line's next rise. Takahara, at the top, reads back toward the line on
// a desktop; on a phone that is where the earlier scenes' line winds, so
// it reads outward, into the space the phone's column leaves.
const LABELS = {
  landscape: [{ x: -18, y: 24, anchor: 'end' }, { x: -10, y: -30, anchor: 'end' }, { x: -10, y: -18, anchor: 'end' }],
  portrait: [{ x: 8, y: 26, anchor: 'start' }, { x: 30, y: -5, anchor: 'start' }, { x: 10, y: -3, anchor: 'start' }]
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

function project(route) {
  const latMid = route.reduce(function (a, p) { return a + p[0]; }, 0) / route.length;
  const k = Math.cos(latMid * Math.PI / 180);
  return route.map(function (p) { return [p[1] * k, -p[0]]; });
}

function toLocal(xy) {
  const xs = xy.map(function (p) { return p[0]; });
  const ys = xy.map(function (p) { return p[1]; });
  const xmin = Math.min.apply(null, xs);
  const ymin = Math.min.apply(null, ys);
  const scale = LOCAL_WIDTH / (Math.max.apply(null, xs) - xmin);
  return xy.map(function (p) { return [(p[0] - xmin) * scale, (p[1] - ymin) * scale]; });
}

function pointAtFrac(pts, frac) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let want = frac * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const t = seg[i] === 0 ? 0 : Math.min(1, want / seg[i]);
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
      ];
    }
    want -= seg[i];
  }
  return pts[pts.length - 1];
}

function bake(fixture) {
  const local = toLocal(project(fixture.route));
  const d = 'M' + local.map(function (p) { return round1(p[0]) + ' ' + round1(p[1]); }).join(' L');
  const height = round1(Math.max.apply(null, local.map(function (p) { return p[1]; })));
  const reveal = Core.honorReveal(0);
  const moments = fixture.moments.map(function (m, i) {
    return {
      label: m.label,
      ja: m.ja,
      words: m.words,
      frac: m.frac,
      at: Math.round(reveal.moments[i].at * 10000) / 10000,
      local: pointAtFrac(local, m.frac).map(round1)
    };
  });
  const placements = {};
  Object.keys(GEOMETRIES).forEach(function (name) {
    const g = GEOMETRIES[name];
    const s = g.width / LOCAL_WIDTH;
    const tx = round1(g.start[0] - s * local[0][0]);
    const ty = round1(g.start[1] - s * local[0][1]);
    placements[name] = {
      scale: s,
      transform: 'translate(' + tx + ' ' + ty + ') scale(' + s + ')',
      dotRadius: round1(DOT_PX / s),
      start: g.start,
      end: [round1(tx + s * local[local.length - 1][0]), round1(ty + s * local[local.length - 1][1])],
      moments: moments.map(function (m) {
        return [round1(tx + s * m.local[0]), round1(ty + s * m.local[1])];
      })
    };
  });
  return {
    d: d,
    height: height,
    localStart: local[0].map(round1),
    localEnd: local[local.length - 1].map(round1),
    moments: moments,
    placements: placements
  };
}

function svgFor(baked, name) {
  const p = baked.placements[name];
  const end = baked.localEnd;
  const lines = [
    '<g class="ws-honor-route" style="--ws-route-scale:' + p.scale + '" transform="' + p.transform + '">',
    '  <path class="ws-honor-theirs" d="' + baked.d + '" pathLength="1"/>',
    '  <path class="ws-line ws-honor-yours" d="' + baked.d + '" pathLength="1"/>',
    '  <g class="ws-dot" transform="translate(' + end[0] + ' ' + end[1] + ')"><circle r="' + p.dotRadius + '"/></g>',
    '</g>'
  ];
  baked.moments.forEach(function (m, i) {
    const xy = p.moments[i];
    const l = LABELS[name][i];
    lines.push('<g class="ws-moment" style="--at:' + m.at + '" transform="translate(' + xy[0] + ' ' + xy[1] + ')">');
    lines.push('  <g class="ws-moment-mark">');
    lines.push('    <circle r="5"/>');
    lines.push('    <text class="ws-moment-label" x="' + l.x + '" y="' + l.y + '" text-anchor="' + l.anchor + '">' + m.label + '</text>');
    lines.push('    <text class="ws-moment-ja" x="' + l.x + '" y="' + (l.y + 15) + '" text-anchor="' + l.anchor + '" lang="ja">' + m.ja + '</text>');
    lines.push('  </g>');
    lines.push('</g>');
  });
  return lines.join('\n');
}

if (require.main === module) {
  const baked = bake(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
  if (process.argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(baked, null, 1) + '\n');
  } else {
    Object.keys(GEOMETRIES).forEach(function (name) {
      process.stdout.write('<!-- ' + name + ' -->\n' + svgFor(baked, name) + '\n');
    });
  }
}

module.exports = { bake: bake, svgFor: svgFor, GEOMETRIES: GEOMETRIES, LABELS: LABELS, LOCAL_WIDTH: LOCAL_WIDTH };
