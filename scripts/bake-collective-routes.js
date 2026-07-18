#!/usr/bin/env node
'use strict';
var crypto = require('crypto');
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

/* Both render surfaces are caption-sized with tight line limits. The longest
   sentence baked today is 60 characters, so 90 leaves a curator half again as
   much room while staying inside what those labels show without truncating. */
var COMPANY_LINE_MAX_CHARS = 90;

/* A baked distance can never be converted to the pilgrim's chosen unit, so no
   sentence may state one. Longest units first — `mi` must not shadow `miles`. */
var DISTANCE_UNIT_RE = /\d[\d,.]*\s*(kilometres|kilometers|kilometre|kilometer|miles|mile|km|mi)\b/i;

/* A relative reference is false the moment the vintage it describes rolls over,
   and nothing schedules a re-bake. Sentences name an explicit year instead. */
var RELATIVE_TIME_RE = /\b(last|this|next)\s+(year|month|season)\b/i;

var WALKING_COMPLETIONS_RE = /walking completions:\s*([\d,]+)/i;

var HORIZONS = [
  { id: 'around-earth', preposition: 'around', body: 'the Earth',
    companyLine: 'A handful have ever walked it; the first finished in 1974.',
    km: 40075, kind: 'cosmic' },
  { id: 'to-the-moon',  preposition: 'to',     body: 'the Moon',
    companyLine: 'No one has ever walked it.',
    km: 384400, kind: 'cosmic' },
  { id: 'to-the-sun',   preposition: 'to',     body: 'the Sun',
    companyLine: 'No one ever will.',
    km: 149600000, kind: 'cosmic' }
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

function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

/* Returns a reason string naming the offending entry, or null when the sentence
   is fit to ship. Every entry passes through this before the artifact is
   written — a curator's edit reaches every device without code review, so the
   rules are enforced where the text is authored. */
function companyLineProblem(id, line){
  if (typeof line !== 'string' || line.trim() === '')
    return 'entry "' + id + '" has an empty companyLine';
  var unit = line.match(DISTANCE_UNIT_RE);
  if (unit)
    return 'entry "' + id + '" companyLine bakes a distance ("' + unit[0] + '"), which the app cannot convert to the pilgrim\'s unit: ' + JSON.stringify(line);
  var relative = line.match(RELATIVE_TIME_RE);
  if (relative)
    return 'entry "' + id + '" companyLine uses a relative time reference ("' + relative[0] + '"); name the figure\'s explicit year instead: ' + JSON.stringify(line);
  if (line.length > COMPANY_LINE_MAX_CHARS)
    return 'entry "' + id + '" companyLine is ' + line.length + ' characters, over the ' + COMPANY_LINE_MAX_CHARS + '-character budget: ' + JSON.stringify(line);
  return null;
}

/* Shikoku's headline figure is an all-modes estimate; the walking figure lives
   in the upstream note. Reading it back out keeps a re-bake in step with the
   source rather than carrying a transcription frozen into this script. */
function walkingCompletions(routeId, annual){
  var found = String(annual.metricNote).match(WALKING_COMPLETIONS_RE);
  if (!found)
    die('missing or invalid stats.json for "' + routeId + '" — metricNote must state "Walking completions: <n>", got ' + JSON.stringify(annual.metricNote));
  var n = Number(found[1].replace(/,/g, ''));
  if (!isFinite(n) || n <= 0)
    die('missing or invalid stats.json for "' + routeId + '" — walking completions must be a positive number, got ' + JSON.stringify(found[1]));
  return n;
}

/* The seven routes do not share a metric, so one generic sentence would be
   false for two of them. Each names its figure's explicit year, because the
   annual data carries mixed vintages and nothing schedules a re-bake. */
var COMPANY_PHRASING = {
  /* 44,540 counts foreign overnight visitors in the Hongu area, not walkers. */
  'kumano-kodo': function(annual){
    return fmt(annual.count) + ' foreign visitors stayed overnight near Hongu in ' + annual.year + '.';
  },
  /* 150,000 includes bus tours and cars; only the breakout figure walked it. */
  'shikoku-88': function(annual, routeId){
    return 'About ' + fmt(annual.count) + ' made the circuit in ' + annual.year +
           '; ' + fmt(walkingCompletions(routeId, annual)) + ' on foot.';
  }
};

function companyLineFor(routeId, annual){
  if (!annual)
    die('missing or invalid stats.json for "' + routeId + '" — no annual figure, so a company sentence cannot be composed');
  var custom = COMPANY_PHRASING[routeId];
  if (custom) return custom(annual, routeId);
  /* The remaining five are Compostela certificates — genuine completions. */
  return fmt(annual.count) + ' pilgrims completed it in ' + annual.year + '.';
}

/* Derived from the entries payload with the version field itself excluded, or it
   would be self-referential. Twelve hex characters distinguish hand-curated
   revisions and still read in a diff; consumers compare with `!=` and never with
   an ordering, so a rollback applies like any other change. */
function contentVersion(entries){
  return crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 12);
}

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
  var km = meta.overview.distanceKm;
  if (typeof km !== 'number' || !isFinite(km) || km <= 0) die('missing or invalid ' + metaPath + ' — overview.distanceKm must be a positive finite number, got ' + JSON.stringify(km));

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
    kind: 'route',
    nameEn: meta.name.en.replace(/\s*\([^)]*\)\s*$/, ''),
    companyLine: companyLineFor(routeId, annual),
    km: km,
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
  var entries = {
    pilgrimages: ROUTE_IDS.map(function(routeId){ return bakePilgrimage(routeId, routesDir); }),
    horizons: HORIZONS
  };
  entries.pilgrimages.concat(entries.horizons).forEach(function(entry){
    var problem = companyLineProblem(entry.id, entry.companyLine);
    if (problem) die(problem);
  });
  return { version: contentVersion(entries), pilgrimages: entries.pilgrimages, horizons: entries.horizons };
}

function main(){
  var asset = buildAsset();
  fs.writeFileSync(OUT_PATH, JSON.stringify(asset, null, 2) + '\n', 'utf8');
  process.stdout.write('  collective-routes.json — ' + asset.pilgrimages.length + ' routes + ' + asset.horizons.length + ' horizons @ ' + asset.version + '\n');
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  buildAsset: buildAsset,
  main: main,
  ROUTE_IDS: ROUTE_IDS,
  companyLineProblem: companyLineProblem,
  COMPANY_LINE_MAX_CHARS: COMPANY_LINE_MAX_CHARS,
  contentVersion: contentVersion
};
if (require.main === module) main();
