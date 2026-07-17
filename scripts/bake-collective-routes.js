#!/usr/bin/env node
'use strict';
var fs = require('fs');
var path = require('path');

var REPO_ROOT    = path.resolve(__dirname, '..');
var SIBLING_ROOT = path.resolve(REPO_ROOT, '..', 'open-pilgrimages');
var OUT_PATH     = path.join(REPO_ROOT, 'assets', 'collective-routes.json');
var REQUIRED_SCHEMA_VERSION = '1.0.0';

var ROUTE_IDS = [
  'camino-frances', 'camino-ingles', 'camino-norte',
  'camino-portugues', 'camino-primitivo', 'kumano-kodo', 'shikoku-88'
];

var HORIZONS = [
  { id: 'around-earth', preposition: 'around', body: 'the Earth', km: 40075,     kind: 'cosmic' },
  { id: 'to-the-moon',  preposition: 'to',     body: 'the Moon',  km: 384400,    kind: 'cosmic' },
  { id: 'to-the-sun',   preposition: 'to',     body: 'the Sun',   km: 149600000, kind: 'cosmic' }
];

function die(reason){ process.stderr.write('bake-collective-routes: ' + reason + '\n'); process.exit(1); }
function readJson(fp, label){
  if (!fs.existsSync(fp)) die('missing or invalid ' + fp + ' — ' + label + ' not found');
  var raw;
  try { raw = fs.readFileSync(fp, 'utf8'); }
  catch (e) { die('missing or invalid ' + fp + ' — could not read: ' + e.message); }
  try { return JSON.parse(raw); }
  catch (e) { die('missing or invalid ' + fp + ' — invalid JSON: ' + e.message); }
}
function assertSchemaVersion(d, fp){
  if (d.schemaVersion !== REQUIRED_SCHEMA_VERSION)
    die('missing or invalid ' + fp + ' — schemaVersion must be "' + REQUIRED_SCHEMA_VERSION + '", got ' + JSON.stringify(d.schemaVersion));
}
function assertField(v, name, fp){ if (v === undefined || v === null) die('missing or invalid ' + fp + ' — required field "' + name + '" is absent'); }

function bakePilgrimage(routeId, routesDir){
  var dir = path.join(routesDir, routeId);
  var metaPath = path.join(dir, 'metadata.json');
  var meta = readJson(metaPath, 'metadata.json for ' + routeId);
  assertSchemaVersion(meta, metaPath);
  assertField(meta.id, 'id', metaPath);
  assertField(meta.name, 'name', metaPath);
  assertField(meta.name.en, 'name.en', metaPath);
  assertField(meta.overview, 'overview', metaPath);
  assertField(meta.overview.distanceKm, 'overview.distanceKm', metaPath);

  var reflections = [];
  var stagesPath = path.join(dir, 'stages.json');
  var stagesData = readJson(stagesPath, 'stages.json for ' + routeId);
  assertSchemaVersion(stagesData, stagesPath);
  assertField(stagesData.stages, 'stages', stagesPath);
  (stagesData.stages || []).forEach(function(s){
    if (s.interior && s.interior.reflection && s.interior.reflection.en) reflections.push(s.interior.reflection.en);
  });

  var annual = null;
  var statsPath = path.join(dir, 'stats.json');
  if (fs.existsSync(statsPath)) {
    var stats = readJson(statsPath, 'stats.json for ' + routeId);
    var latest = stats.annualPilgrims && stats.annualPilgrims.latest;
    var note = (latest && latest.note) || stats.dataNote || null;
    if (latest && latest.count != null && latest.year != null && note) {
      annual = {
        count: latest.count,
        year: latest.year,
        metricNote: note,
        source: (stats.annualPilgrims && stats.annualPilgrims.source) || null
      };
    }
  }

  return {
    id: meta.id,
    nameEn: meta.name.en,
    km: meta.overview.distanceKm,
    bestMonths: meta.overview.bestMonths || [],
    peakMonths: meta.overview.peakMonths || [],
    reflections: reflections,
    annual: annual
  };
}

function buildAsset(siblingRoot){
  siblingRoot = siblingRoot || SIBLING_ROOT;
  var routesDir = path.join(siblingRoot, 'routes');
  if (!fs.existsSync(siblingRoot)) die('missing or invalid ' + siblingRoot + ' — sibling repo not found');
  if (!fs.existsSync(routesDir)) die('missing or invalid ' + routesDir + ' — routes directory not found');
  return {
    pilgrimages: ROUTE_IDS.map(function(routeId){ return bakePilgrimage(routeId, routesDir); }),
    horizons: HORIZONS
  };
}

function main(){
  var asset = buildAsset();
  fs.writeFileSync(OUT_PATH, JSON.stringify(asset, null, 2) + '\n', 'utf8');
  process.stdout.write('  collective-routes.json — ' + asset.pilgrimages.length + ' routes + ' + asset.horizons.length + ' horizons\n');
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildAsset: buildAsset, main: main };
if (require.main === module) main();
