#!/usr/bin/env node
// Bakes the gazetteer the turning pages' place line is computed from:
// named land near any point the sun can stand over, small atolls included,
// and the land itself so a point can be told over land or over sea and
// measured to the coast. Build-only — no page ever loads it.
//
//   node scripts/sunpath/bake-places.mjs --fetch   download the raw sources
//   node scripts/sunpath/bake-places.mjs           bake scripts/sunpath/data/places.json
//
// The raw downloads (about 430 MB) stay under scripts/sunpath/data/raw/,
// which git ignores; --fetch records the day each file was retrieved there,
// so the same raw files always bake to the same bytes.
//
// places.json:
//   source   provenance per source: files with their sha256, retrieval day,
//            licence and the attribution string the page credits.
//   places   [name, lat, lon, kind, cc], kind being the GeoNames feature
//            code: ATOL and ISL* are land in the sea or in rivers and
//            lakes, PPL* are populated places. Names are GeoNames' own,
//            as it spells them: Île Mangareva, Reunion. Its English names
//            are no better — many are old charts' names, so the Galápagos'
//            Isla Isabela would turn back into Albemarle Island.
//   land     Natural Earth land rings as flat [lon, lat, lon, lat, …],
//            open (the closing point is implied). A point is over land
//            when it falls inside an odd number of rings.
//
// The sun stands over ±23.44° at most. Within ±35° lies the nearest land
// to every such point but one stretch: on and just north of the Tropic
// of Capricorn at 78–85° E, out in the Indian Ocean, the nearest land is
// Île Amsterdam at 37.8° S, 1,600 km off. A nearest distance longer than
// the way from the point to the band's edge may have missed land beyond
// it. Land rings that reach into the band are kept whole rather than
// clipped, so no edge along the band's limit can pass for a coast; rings
// that never reach it, the Caspian's among them, cannot change the count
// for a point inside it and are dropped.

import { createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(SCRIPT_DIR, 'data');
const RAW_DIR = resolve(DATA_DIR, 'raw');
const RETRIEVED_PATH = resolve(RAW_DIR, 'retrieved.json');
const OUT_PATH = resolve(DATA_DIR, 'places.json');

const SOURCES = [
  {
    name: 'GeoNames',
    url: 'https://www.geonames.org/',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Place names from GeoNames (geonames.org), licensed under CC BY 4.0.',
    files: [
      { file: 'allCountries.zip', entry: 'allCountries.txt', url: 'https://download.geonames.org/export/dump/allCountries.zip' }
    ]
  },
  {
    name: 'Natural Earth',
    url: 'https://www.naturalearthdata.com/',
    license: 'public domain',
    attribution: 'Land outlines made with Natural Earth (naturalearthdata.com), public domain.',
    files: [
      { file: 'ne_10m_land.geojson', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson' }
    ]
  }
];

const BAND_DEG = 35;
const COORD_DECIMALS = 3;

const ISLAND_CODES = new Set(['ATOL', 'ISL', 'ISLET', 'ISLM', 'ISLS', 'ISLT']);
// Living places only: sections of a city (PPLX), and abandoned, destroyed
// or historical places (PPLQ, PPLW, PPLH, PPLCH) would put the sun near
// a place no one can find today.
const PLACE_CODES = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLF', 'PPLG', 'PPLL', 'PPLR', 'PPLS']);
const SEAT_CODES = new Set(['PPLA', 'PPLC', 'PPLG']);
const TOWN_POPULATION = 1000;

// Towns of a thousand leave the deserts and the outback empty: from
// Boulia the nearest is the edge of Mount Isa, 245 km away. A
// smaller place with a recorded population fills in wherever no kept
// place lies within this distance, largest first.
const FILL_KM = 50;

// Douglas–Peucker tolerance, in degrees of latitude (about 1.1 km). The
// place line rounds to 10 km, so the coast moves by nothing a reader sees.
const SIMPLIFY_DEG = 0.01;

const EARTH_KM = 6371.0088;

function die(reason) {
  process.stderr.write('bake-places: ' + reason + '\n');
  process.exit(1);
}

function rawPath(f) {
  return resolve(RAW_DIR, f.file);
}

async function fetchRaw() {
  const today = new Date().toISOString().slice(0, 10);
  const retrieved = {};
  for (const s of SOURCES) {
    for (const f of s.files) {
      const res = await fetch(f.url);
      if (!res.ok) die('could not fetch ' + f.url + ' — HTTP ' + res.status);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(rawPath(f)));
      retrieved[f.file] = today;
    }
  }
  writeFileSync(RETRIEVED_PATH, JSON.stringify(retrieved, null, 1) + '\n');
}

function readRetrieved() {
  if (!existsSync(RETRIEVED_PATH)) die('missing ' + RETRIEVED_PATH + ' — run with --fetch first');
  const retrieved = JSON.parse(readFileSync(RETRIEVED_PATH, 'utf8'));
  for (const s of SOURCES) {
    for (const f of s.files) {
      if (!existsSync(rawPath(f))) die('missing ' + rawPath(f) + ' — run with --fetch first');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(retrieved[f.file] || '')) die('no retrieval day for ' + f.file + ' in ' + RETRIEVED_PATH);
    }
  }
  return retrieved;
}

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function eachZipLine(f, onLine) {
  const unzip = spawn('unzip', ['-p', rawPath(f), f.entry]);
  let stderr = '';
  unzip.stderr.on('data', (d) => { stderr += d; });
  const exited = new Promise((ok) => unzip.on('close', ok));
  let n = 0;
  for await (const line of createInterface({ input: unzip.stdout, crlfDelay: Infinity })) {
    n++;
    if (line) onLine(line.split('\t'), n);
  }
  const code = await exited;
  if (code !== 0) die('unzip ' + f.file + ' ' + f.entry + ' exited ' + code + ': ' + stderr.trim());
  if (n === 0) die(f.file + ' ' + f.entry + ' is empty');
}

function round(n) {
  const k = 10 ** COORD_DECIMALS;
  return Math.round(n * k) / k;
}

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function readGeonames(f) {
  const islands = [];
  const towns = [];
  const villages = [];
  await eachZipLine(f, (c, n) => {
    if (c.length !== 19) die(f.entry + ' line ' + n + ' has ' + c.length + ' columns, not 19');
    const lat = Number(c[4]);
    const lon = Number(c[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || c[4] === '' || c[5] === '') {
      die(f.entry + ' line ' + n + ' has no coordinates: ' + c[4] + ', ' + c[5]);
    }
    if (Math.abs(lat) > BAND_DEG) return;
    const code = c[7];
    const p = { id: Number(c[0]), name: c[1], lat, lon, kind: code, cc: c[8], population: Number(c[14]) || 0 };
    if (c[6] === 'T' && ISLAND_CODES.has(code)) islands.push(p);
    else if (c[6] === 'P' && PLACE_CODES.has(code)) {
      if (p.population >= TOWN_POPULATION || SEAT_CODES.has(code)) towns.push(p);
      else if (p.population > 0) villages.push(p);
    }
  });
  return { islands, towns, villages };
}

function cellKey(lat, lon) {
  return Math.floor(lat) + ':' + ((Math.floor(lon) % 360 + 360) % 360);
}

// One-degree cells hold every place within FILL_KM in the 3×3 block
// around a point: a degree of longitude is still 91 km at the band's edge.
function fillSparse(towns, villages) {
  const grid = new Map();
  const add = (p) => {
    const k = cellKey(p.lat, p.lon);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  };
  const covered = (p) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const near = grid.get(cellKey(p.lat + dy, p.lon + dx));
        if (near && near.some((q) => km(p.lat, p.lon, q.lat, q.lon) <= FILL_KM)) return true;
      }
    }
    return false;
  };
  towns.forEach(add);
  const kept = [];
  villages
    .slice()
    .sort((a, b) => b.population - a.population || a.id - b.id)
    .forEach((p) => {
      if (!covered(p)) { kept.push(p); add(p); }
    });
  return kept;
}

function compareRows(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function bakePlaces(geo) {
  const seen = new Set();
  const rows = [];
  for (const p of [...geo.islands, ...geo.towns, ...geo.fill]) {
    const row = [p.name, round(p.lat), round(p.lon), p.kind, p.cc];
    const key = JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows.sort(compareRows);
}

function readLand(f) {
  let g;
  try { g = JSON.parse(readFileSync(rawPath(f), 'utf8')); }
  catch (e) { die(f.file + ' is not JSON: ' + e.message); }
  if (g.type !== 'FeatureCollection' || !Array.isArray(g.features) || g.features.length === 0) {
    die(f.file + ' is not a non-empty FeatureCollection');
  }
  const polygons = [];
  for (const feat of g.features) {
    // Natural Earth's joke island, a 1 km square at 0°, 0°, sits where an
    // equinox sun at noon over Greenwich would land on it.
    if ((feat.properties || {}).featurecla === 'Null island') continue;
    const geom = feat.geometry || {};
    if (geom.type === 'Polygon') polygons.push(geom.coordinates);
    else if (geom.type === 'MultiPolygon') polygons.push(...geom.coordinates);
    else die(f.file + ' has a ' + geom.type + ' feature; only Polygon and MultiPolygon are land');
  }
  for (const poly of polygons) {
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) die(f.file + ' has a ring of fewer than 4 points');
      for (const pt of ring) {
        if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) die(f.file + ' has a malformed coordinate');
      }
    }
  }
  return polygons;
}

function touchesBand(ring) {
  let lo = 90;
  let hi = -90;
  for (const [, lat] of ring) {
    lo = Math.min(lo, lat);
    hi = Math.max(hi, lat);
  }
  return hi >= -BAND_DEG && lo <= BAND_DEG;
}

// Measured with longitude scaled by the cosine of latitude, so the
// tolerance is the same distance on the ground in every direction.
function deviation(p, a, b) {
  const k = Math.cos(p[1] * Math.PI / 180);
  const px = p[0] * k, ax = a[0] * k, bx = b[0] * k;
  const dx = bx - ax, dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, p[1] - a[1] - t * dy);
}

// Iterative, because a continent's ring is long enough to overflow the
// stack if the recursion ever runs deep.
function douglasPeucker(pts, keep, first, last) {
  const stack = [[first, last]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let far = -1;
    let farD = SIMPLIFY_DEG;
    for (let m = i + 1; m < j; m++) {
      const d = deviation(pts[m], pts[i], pts[j]);
      if (d > farD) { far = m; farD = d; }
    }
    if (far !== -1) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
}

// The ring is split at its point farthest from the start, so both halves
// have distinct ends; an island small enough to collapse below a triangle
// keeps every point it had.
function simplifyRing(ring) {
  const open = ring.slice(0, -1);
  const n = open.length;
  let far = 0;
  let farD = -1;
  for (let m = 1; m < n; m++) {
    const d = (open[m][0] - open[0][0]) ** 2 + (open[m][1] - open[0][1]) ** 2;
    if (d > farD) { far = m; farD = d; }
  }
  const closed = open.concat([open[0]]);
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = 1;
  douglasPeucker(closed, keep, 0, far);
  douglasPeucker(closed, keep, far, n);
  let kept = open.filter((_, m) => keep[m]);
  if (kept.length < 3) kept = open;
  const flat = [];
  for (const [lon, lat] of kept) {
    const x = round(lon), y = round(lat);
    const len = flat.length;
    if (len && flat[len - 2] === x && flat[len - 1] === y) continue;
    flat.push(x, y);
  }
  if (flat.length >= 4 && flat[0] === flat[flat.length - 2] && flat[1] === flat[flat.length - 1]) flat.length -= 2;
  return flat.length >= 6 ? flat : null;
}

function bakeLand(polygons) {
  const rings = [];
  for (const poly of polygons) {
    for (const ring of poly) {
      if (!touchesBand(ring)) continue;
      const flat = simplifyRing(ring);
      if (flat) rings.push(flat);
    }
  }
  return rings;
}

function serialize(out) {
  const lines = (rows) => rows.map((r) => JSON.stringify(r)).join(',\n');
  return '{\n' +
    '"source": ' + JSON.stringify(out.source, null, 1) + ',\n' +
    '"band": ' + out.band + ',\n' +
    '"places": [\n' + lines(out.places) + '\n],\n' +
    '"land": [\n' + lines(out.land) + '\n]\n' +
    '}\n';
}

async function bake() {
  const retrieved = readRetrieved();
  const [allCountries] = SOURCES[0].files;
  const [landFile] = SOURCES[1].files;

  const geo = await readGeonames(allCountries);
  geo.fill = fillSparse(geo.towns, geo.villages);
  const places = bakePlaces(geo);
  const land = bakeLand(readLand(landFile));

  const source = [];
  for (const s of SOURCES) {
    const files = [];
    for (const f of s.files) files.push({ file: f.file, url: f.url, sha256: await sha256(rawPath(f)) });
    const entry = { name: s.name, url: s.url, license: s.license };
    if (s.licenseUrl) entry.licenseUrl = s.licenseUrl;
    entry.attribution = s.attribution;
    entry.retrieved = s.files.map((f) => retrieved[f.file]).sort().pop();
    entry.files = files;
    source.push(entry);
  }

  writeFileSync(OUT_PATH, serialize({ source, band: BAND_DEG, places, land }));
  process.stdout.write('bake-places: ' + places.length + ' places (' + geo.islands.length + ' islands, ' +
    geo.towns.length + ' towns, ' + geo.fill.length + ' filled in), ' + land.length + ' land rings → ' + OUT_PATH + '\n');
}

if (process.argv.includes('--fetch')) await fetchRaw();
else await bake();
