#!/usr/bin/env node
// Bakes the daily sky photos' colour and clock time into
// assets/sunpath/sky-days.json for the turning leaf's season strip.
//
//   node scripts/sunpath/bake-sky.mjs           # write the file
//   node scripts/sunpath/bake-sky.mjs --check   # exit 2 if it differs from a fresh bake
//
// This is the only reader of ../photos (the ig repo). The build and the
// tests read the committed file, so a checkout without the sibling still
// works. Only `sky` entries are kept: `count` photos share their dates.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const SIBLING_ROOT = resolve(REPO_ROOT, '..', 'photos');
const MANIFEST_PATH = resolve(SIBLING_ROOT, 'data/manifest.json');
const OUT_PATH = resolve(REPO_ROOT, 'assets/sunpath/sky-days.json');

const MANIFEST_VERSION = 1;
const LICENSE = 'CC0-1.0';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function die(reason) {
  process.stderr.write('bake-sky: ' + reason + '\n');
  process.exit(1);
}

function isCalendarDate(s) {
  return DATE_RE.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
}

function dayFrom(entry) {
  const where = 'sky entry ' + JSON.stringify(entry.date);
  if (typeof entry.date !== 'string' || !isCalendarDate(entry.date)) die(where + ' has no YYYY-MM-DD date');
  if (typeof entry.color !== 'string' || !COLOR_RE.test(entry.color)) die(where + ' has colour ' + JSON.stringify(entry.color) + ', not #rrggbb');
  if (typeof entry.time !== 'string' || !TIME_RE.test(entry.time)) die(where + ' has time ' + JSON.stringify(entry.time) + ', not HH:MM');
  return [entry.date, entry.color.toLowerCase(), entry.time];
}

function bakeSky() {
  if (!existsSync(SIBLING_ROOT)) die('sibling repo not found at ' + SIBLING_ROOT);
  if (!existsSync(MANIFEST_PATH)) die('missing ' + MANIFEST_PATH);
  const raw = readFileSync(MANIFEST_PATH);
  let manifest;
  try { manifest = JSON.parse(raw.toString('utf8')); }
  catch (e) { die('invalid JSON in ' + MANIFEST_PATH + ': ' + e.message); }
  if (manifest.version !== MANIFEST_VERSION) die(MANIFEST_PATH + ' has version ' + JSON.stringify(manifest.version) + ', expected ' + MANIFEST_VERSION);
  if (manifest.license !== LICENSE) die(MANIFEST_PATH + ' has license ' + JSON.stringify(manifest.license) + ', expected ' + LICENSE);
  if (!Array.isArray(manifest.entries)) die(MANIFEST_PATH + ' has no entries array');

  const days = manifest.entries.filter((e) => e && e.type === 'sky').map(dayFrom);
  if (!days.length) die(MANIFEST_PATH + ' holds no sky entries');
  days.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (let i = 1; i < days.length; i++) {
    if (days[i][0] === days[i - 1][0]) die('two sky entries share the date ' + days[i][0]);
  }
  return {
    source: {
      repo: 'momentmaker/ig',
      manifestHash: createHash('sha256').update(raw).digest('hex'),
      license: LICENSE
    },
    days
  };
}

// One day per line keeps a re-bake's diff readable.
function serialize(asset) {
  const rows = asset.days.map((d) => '    ' + JSON.stringify(d)).join(',\n');
  return '{\n  "source": ' + JSON.stringify(asset.source) + ',\n  "days": [\n' + rows + '\n  ]\n}\n';
}

function main() {
  const check = process.argv.includes('--check');
  if (check && !existsSync(SIBLING_ROOT)) {
    console.log('bake-sky --check: no sibling at ' + SIBLING_ROOT + '; nothing to compare.');
    return;
  }
  const asset = bakeSky();
  const fresh = serialize(asset);
  if (check) {
    const committed = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : '';
    if (committed !== fresh) {
      console.error('Drift: assets/sunpath/sky-days.json differs from a fresh bake; run node scripts/sunpath/bake-sky.mjs');
      process.exit(2);
    }
    console.log('assets/sunpath/sky-days.json matches a fresh bake.');
    return;
  }
  writeFileSync(OUT_PATH, fresh);
  console.log('  → assets/sunpath/sky-days.json — ' + asset.days.length + ' days, ' + asset.days[0][0] + ' to ' + asset.days[asset.days.length - 1][0]);
}

main();
