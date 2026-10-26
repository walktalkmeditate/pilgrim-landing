#!/usr/bin/env node
// Bakes the 88 temples of the Shikoku pilgrimage into
// assets/sunpath/temples.json: the staff's walk, one temple per turning.
//
//   node scripts/sunpath/bake-temples.mjs           # write the file
//   node scripts/sunpath/bake-temples.mjs --check   # exit 2 if it differs from a fresh bake
//
// This is the only reader of ../open-pilgrimages. The build and the tests
// read the committed file, so a checkout without the sibling still works.
// Temples are keyed by number, never by name: #4, #13 and #28 are all
// Dainichi-ji.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const SIBLING_ROOT = resolve(REPO_ROOT, '..', 'open-pilgrimages');
const OUT_PATH = resolve(REPO_ROOT, 'assets/sunpath/temples.json');

const SOURCE_FILES = ['awa', 'tosa', 'iyo', 'sanuki'].map(
  (province) => 'routes/shikoku-88-' + province + '/waypoints.geojson'
);
const TEMPLE_COUNT = 88;

const SOURCE = {
  repo: 'walktalkmeditate/open-pilgrimages',
  license: 'ODbL-1.0',
  attribution: 'Contains information from Open Pilgrimages, made available under the ODbL. Route data © OpenStreetMap contributors.'
};

function die(reason) {
  process.stderr.write('bake-temples: ' + reason + '\n');
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync('git', ['-C', SIBLING_ROOT, ...args], { encoding: 'utf8' }).trim();
  } catch (e) {
    die('could not read git history in ' + SIBLING_ROOT + ': ' + e.message);
  }
}

// The commit is the provenance a reader can follow back to GitHub, so it has
// to hold exactly the bytes baked: uncommitted edits would make it a lie.
function sourceCommit() {
  const dirty = git(['status', '--porcelain', '--', ...SOURCE_FILES]);
  if (dirty) die('uncommitted changes in ' + SIBLING_ROOT + '; commit them first so the recorded commit holds what was baked:\n' + dirty);
  const commit = git(['log', '-1', '--format=%H', '--', ...SOURCE_FILES]);
  if (!/^[0-9a-f]{40}$/.test(commit)) die('no commit touches ' + SOURCE_FILES.join(', ') + ' in ' + SIBLING_ROOT);
  return commit;
}

function readFeatures(rel) {
  const fp = resolve(SIBLING_ROOT, rel);
  if (!existsSync(fp)) die('missing ' + fp);
  let data;
  try { data = JSON.parse(readFileSync(fp, 'utf8')); }
  catch (e) { die('invalid JSON in ' + fp + ': ' + e.message); }
  if (!data || !Array.isArray(data.features)) die(fp + ' has no features array');
  return data.features;
}

function templeFrom(feature, rel) {
  const p = feature.properties || {};
  const n = p.templeNumber;
  const where = rel + ' feature ' + JSON.stringify(feature.id);
  if (!Number.isInteger(n) || n < 1 || n > TEMPLE_COUNT) die(where + ' has templeNumber ' + JSON.stringify(n) + ', not 1–' + TEMPLE_COUNT);
  const g = feature.geometry;
  if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) die(where + ' (temple ' + n + ') is not a Point');
  const [lon, lat] = g.coordinates;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) die(where + ' (temple ' + n + ') has coordinates ' + JSON.stringify(g.coordinates));
  const ja = p.nameLocalized && p.nameLocalized.ja;
  if (typeof p.name !== 'string' || !p.name.trim()) die(where + ' (temple ' + n + ') has no name');
  if (typeof ja !== 'string' || !ja.trim()) die(where + ' (temple ' + n + ') has no nameLocalized.ja');
  return { n, name: p.name, ja, lat, lon };
}

function bakeTemples() {
  if (!existsSync(SIBLING_ROOT)) die('sibling repo not found at ' + SIBLING_ROOT);
  const byNumber = new Map();
  for (const rel of SOURCE_FILES) {
    for (const feature of readFeatures(rel)) {
      if (feature.properties == null || feature.properties.templeNumber == null) continue;
      const temple = templeFrom(feature, rel);
      if (byNumber.has(temple.n)) die('temple ' + temple.n + ' appears twice, in ' + byNumber.get(temple.n).rel + ' and ' + rel);
      byNumber.set(temple.n, { temple, rel });
    }
  }
  const missing = [];
  for (let n = 1; n <= TEMPLE_COUNT; n++) if (!byNumber.has(n)) missing.push(n);
  if (missing.length) die('temples missing from ' + SIBLING_ROOT + ': ' + missing.join(', '));
  const temples = [...byNumber.keys()].sort((a, b) => a - b).map((n) => byNumber.get(n).temple);
  return { source: { repo: SOURCE.repo, commit: sourceCommit(), license: SOURCE.license, attribution: SOURCE.attribution }, temples };
}

// One temple per line keeps a re-bake's diff readable.
function serialize(asset) {
  const rows = asset.temples.map((t) => '    ' + JSON.stringify(t)).join(',\n');
  return '{\n  "source": ' + JSON.stringify(asset.source) + ',\n  "temples": [\n' + rows + '\n  ]\n}\n';
}

function main() {
  const check = process.argv.includes('--check');
  if (check && !existsSync(SIBLING_ROOT)) {
    console.log('bake-temples --check: no sibling at ' + SIBLING_ROOT + '; nothing to compare.');
    return;
  }
  const fresh = serialize(bakeTemples());
  if (check) {
    const committed = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : '';
    if (committed !== fresh) {
      console.error('Drift: assets/sunpath/temples.json differs from a fresh bake; run node scripts/sunpath/bake-temples.mjs');
      process.exit(2);
    }
    console.log('assets/sunpath/temples.json matches a fresh bake.');
    return;
  }
  writeFileSync(OUT_PATH, fresh);
  console.log('  → assets/sunpath/temples.json — ' + TEMPLE_COUNT + ' temples');
}

main();
