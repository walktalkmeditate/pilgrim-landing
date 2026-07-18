'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;
var B = require('./bake-collective-routes.js');
var C = require('../js/collective-routes.js');
var passed = 0, failed = 0, failures = [];
function ok(c, label){ if(c){passed++;console.log('  ✓ '+label);} else {failed++;failures.push(label);console.log('  ✗ '+label);} }
function eq(a, e, label){ ok(a === e, label + '  (' + JSON.stringify(a) + ' vs ' + JSON.stringify(e) + ')'); }

var MODULE_PATH = path.resolve(__dirname, 'bake-collective-routes.js');
var OUT_PATH    = path.resolve(__dirname, '..', 'assets', 'collective-routes.json');

/* A minimal sibling repo covering every id in ROUTE_IDS. Lets the version and
   fail-loud tests vary one input at a time without touching ../open-pilgrimages. */
function writeFixture(root, opts){
  opts = opts || {};
  var km = opts.km || {};
  B.ROUTE_IDS.forEach(function(id, i){
    var dir = path.join(root, 'routes', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({
      schemaVersion: '1.0.0',
      id: id,
      name: { en: id },
      overview: { distanceKm: km[id] || (100 + i), bestMonths: [5], peakMonths: [7] }
    }), 'utf8');
    fs.writeFileSync(path.join(dir, 'stages.json'), JSON.stringify({
      schemaVersion: '1.0.0', stages: []
    }), 'utf8');
    if (opts.omitStatsFor === id) return;
    var shikokuNote = opts.shikokuNote != null
      ? opts.shikokuNote
      : 'Estimated total (all modes). Walking completions: 1,622.';
    fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify({
      schemaVersion: '1.0.0',
      annualPilgrims: { latest: {
        year:  opts.year != null ? opts.year : 2025,
        count: 1000 + i,
        note:  id === 'shikoku-88' ? shikokuNote : 'Compostelas issued'
      } }
    }), 'utf8');
  });
  return root;
}
function withFixture(opts, fn){
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-'));
  try { return fn(writeFixture(dir, opts)); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function bakeInSubprocess(siblingRoot){
  return spawnSync(process.execPath, [
    '-e', "require(" + JSON.stringify(MODULE_PATH) + ").buildAsset(" + JSON.stringify(siblingRoot) + ")"
  ], { encoding: 'utf8' });
}

console.log('\n=== build ===\n');
var asset = B.buildAsset();
ok(asset.pilgrimages.length === 7, '7 pilgrimages');
ok(asset.horizons.length === 3, '3 horizons');
var kumano = asset.pilgrimages.filter(function(p){return p.id==='kumano-kodo';})[0];
ok(kumano && kumano.km === 39, 'kumano km=39');
ok(kumano && kumano.reflections.length === 4, 'kumano 4 reflections');
ok(kumano && kumano.annual && /overnight visitors/i.test(kumano.annual.metricNote), 'kumano metricNote has "overnight visitors"');
var frances = asset.pilgrimages.filter(function(p){return p.id==='camino-frances';})[0];
ok(frances && frances.km === 764, 'camino-frances km=764');
var shikoku = asset.pilgrimages.filter(function(p){return p.id==='shikoku-88';})[0];
var sun = asset.horizons.filter(function(h){return h.id==='to-the-sun';})[0];
ok(sun && sun.km === 149600000 && sun.preposition==='to' && sun.body==='the Sun', 'to-the-sun horizon');

console.log('\n=== determinism ===\n');
ok(JSON.stringify(B.buildAsset()) === JSON.stringify(B.buildAsset()), 'buildAsset deterministic');
var serialized = JSON.stringify(B.buildAsset(), null, 2) + '\n';
ok(serialized === JSON.stringify(B.buildAsset(), null, 2) + '\n', 'two bakes serialize byte-identically');
ok(fs.readFileSync(OUT_PATH, 'utf8') === serialized, 'committed artifact is byte-identical to a fresh bake');

console.log('\n=== kind markers ===\n');
ok(asset.pilgrimages.every(function(p){ return p.kind === 'route'; }), 'every pilgrimage carries kind="route"');
ok(asset.horizons.every(function(h){ return h.kind === 'cosmic'; }), 'every horizon retains kind="cosmic"');
// The web's only kind test is `=== 'cosmic'`, so a non-cosmic marker must not shift weighting.
eq(C.weightFor(kumano, 10), 6, 'kind="route" leaves in-season weighting unchanged (kumano, October)');
eq(C.weightFor(kumano, 7), 1, 'kind="route" leaves off-season weighting unchanged (kumano, July)');
eq(C.weightFor(sun, 10), 1, 'cosmic weighting unchanged');

console.log('\n=== company lines ===\n');
var allEntries = asset.pilgrimages.concat(asset.horizons);
eq(allEntries.length, 10, '10 entries total');
ok(allEntries.every(function(e){ return typeof e.companyLine === 'string' && e.companyLine.trim() !== ''; }),
   'every entry has a non-empty companyLine');
// Routes compose from the upstream annual figures, with grouping separators and an explicit year.
ok(/242,179/.test(frances.companyLine), 'camino-frances companyLine has its grouped annual count (242,179)');
ok(/\b2025\b/.test(frances.companyLine), 'camino-frances companyLine names the figure\'s year explicitly (2025)');
eq(frances.companyLine.indexOf(String(frances.annual.count)), -1, 'the ungrouped count does not appear (grouping applied)');
ok(/30,204/.test(asset.pilgrimages.filter(function(p){return p.id==='camino-ingles';})[0].companyLine), 'camino-ingles grouped count');
// kumano-kodo counts foreign overnight visitors, not walkers — and its figure is a 2024 vintage.
ok(/44,540/.test(kumano.companyLine), 'kumano-kodo companyLine has its grouped count (44,540)');
ok(/\b2024\b/.test(kumano.companyLine), 'kumano-kodo names 2024, not the 2025 vintage the other routes carry');
ok(/overnight/i.test(kumano.companyLine), 'kumano-kodo companyLine says overnight (visitors, not completions)');
ok(!/completed|walked/i.test(kumano.companyLine), 'kumano-kodo companyLine does not claim completions');
// shikoku-88's headline number is an all-modes estimate; the walking figure must be broken out.
ok(/150,000/.test(shikoku.companyLine), 'shikoku-88 companyLine has its grouped all-modes estimate (150,000)');
ok(/1,622/.test(shikoku.companyLine), 'shikoku-88 companyLine breaks out the 1,622 walking completions');
ok(/\b2025\b/.test(shikoku.companyLine), 'shikoku-88 names 2025');
// Horizons have no annual data at all and still produce a sentence.
var byId = {};
allEntries.forEach(function(e){ byId[e.id] = e; });
ok(!byId['around-earth'].annual && !byId['to-the-moon'].annual && !byId['to-the-sun'].annual, 'horizons carry no annual data');
eq(byId['around-earth'].companyLine, 'A handful have ever walked it; the first finished in 1974.', 'around-earth companyLine');
eq(byId['to-the-moon'].companyLine, 'No one has ever walked it.', 'to-the-moon companyLine');
eq(byId['to-the-sun'].companyLine, 'No one ever will.', 'to-the-sun companyLine');

console.log('\n=== company line guards ===\n');
eq(B.COMPANY_LINE_MAX_CHARS, 90, 'character budget is 90');
ok(allEntries.every(function(e){ return B.companyLineProblem(e.id, e.companyLine) === null; }),
   'every baked companyLine passes its own guards');
ok(allEntries.every(function(e){ return e.companyLine.length <= B.COMPANY_LINE_MAX_CHARS; }),
   'every baked companyLine is inside the budget');
// empty
ok(B.companyLineProblem('x', '') !== null, 'guard: empty line rejected');
ok(/"x"/.test(B.companyLineProblem('x', '') || ''), 'guard: empty line names the entry');
ok(B.companyLineProblem('x', '   ') !== null, 'guard: whitespace-only line rejected');
ok(B.companyLineProblem('x', null) !== null, 'guard: missing line rejected');
// baked distances — the app converts units per the pilgrim's preference and cannot convert a baked one
['764 km walked in 2025.', '764km walked in 2025.', '12 miles walked in 2025.', '12 mi walked in 2025.',
 '1,200 kilometres walked in 2025.', '5 kilometers walked in 2025.'].forEach(function(bad){
  var why = B.companyLineProblem('kumano-kodo', bad);
  ok(why !== null, 'guard: rejects baked distance — ' + JSON.stringify(bad));
  ok(/kumano-kodo/.test(why || ''), 'guard: baked distance names the entry — ' + JSON.stringify(bad));
});
ok(B.companyLineProblem('x', '242,179 pilgrims completed it in 2025.') === null, 'guard: a bare grouped count is not a distance');
ok(B.companyLineProblem('x', '150,000 minutes of walking in 2025.') === null, 'guard: "minutes" is not the "mi" unit');
ok(B.companyLineProblem('x', '44,540 stayed in Kumano in 2024.') === null, 'guard: "Kumano" is not the "km" unit');
// relative time references rot silently at every year boundary
['242,179 pilgrims completed it last year.', '242,179 completed it this year.',
 'No one will walk it next year.', '1,622 walked it last month.', '900 walked it this season.'].forEach(function(bad){
  var why = B.companyLineProblem('shikoku-88', bad);
  ok(why !== null, 'guard: rejects relative time — ' + JSON.stringify(bad));
  ok(/shikoku-88/.test(why || ''), 'guard: relative time names the entry — ' + JSON.stringify(bad));
});
ok(B.companyLineProblem('x', 'A handful have ever walked it; the first finished in 1974.') === null, 'guard: an explicit year is not a relative reference');
// budget boundary
var atBudget   = new Array(B.COMPANY_LINE_MAX_CHARS + 1).join('a');
var overBudget = new Array(B.COMPANY_LINE_MAX_CHARS + 2).join('a');
eq(atBudget.length, B.COMPANY_LINE_MAX_CHARS, 'boundary fixture is exactly at budget');
ok(B.companyLineProblem('x', atBudget) === null, 'guard: a line exactly at the budget is accepted');
var overWhy = B.companyLineProblem('to-the-moon', overBudget);
ok(overWhy !== null, 'guard: a line one over the budget is rejected');
ok(/to-the-moon/.test(overWhy || ''), 'guard: over-budget names the entry');
ok(new RegExp(String(B.COMPANY_LINE_MAX_CHARS + 1)).test(overWhy || ''), 'guard: over-budget names the actual length');

console.log('\n=== guards are wired into the bake ===\n');
withFixture({ year: 'last year' }, function(root){
  var run = bakeInSubprocess(root);
  ok(run.status !== 0, 'fail-loud: a composed line that trips a guard exits non-zero');
  ok(/bake-collective-routes: /.test(run.stderr), 'fail-loud: guard failure carries the message prefix');
  ok(/camino-frances/.test(run.stderr), 'fail-loud: guard failure names the offending entry');
  ok(/relative time/i.test(run.stderr), 'fail-loud: guard failure names the rule that was broken');
});
withFixture({ omitStatsFor: 'camino-norte' }, function(root){
  var run = bakeInSubprocess(root);
  ok(run.status !== 0, 'fail-loud: a route with no annual figure exits non-zero');
  ok(/camino-norte/.test(run.stderr), 'fail-loud: missing annual names the offending route');
});
// shikoku-88's walking figure is read back out of upstream prose, so a reword
// upstream must stop the bake rather than silently drop the breakout.
withFixture({ shikokuNote: 'Estimated total (all modes). On foot: 1,622.' }, function(root){
  var run = bakeInSubprocess(root);
  ok(run.status !== 0, 'fail-loud: a reworded walking-completions note exits non-zero');
  ok(/shikoku-88/.test(run.stderr), 'fail-loud: reworded note names shikoku-88');
  ok(/Walking completions/i.test(run.stderr), 'fail-loud: reworded note names the expected wording');
});
withFixture({ shikokuNote: 'Estimated total (all modes). Walking completions: 4,090.' }, function(root){
  var line = B.buildAsset(root).pilgrimages.filter(function(p){ return p.id === 'shikoku-88'; })[0].companyLine;
  ok(/4,090/.test(line), 'a changed upstream walking figure flows into the sentence  (' + line + ')');
  ok(!/1,622/.test(line), 'the previous walking figure is not transcribed into the script');
});

console.log('\n=== version ===\n');
ok(typeof asset.version === 'string' && asset.version.length > 0, 'asset carries a non-empty version string');
eq(B.buildAsset().version, B.buildAsset().version, 'version is stable across identical runs');
// Excluded from its own input, or it would be self-referential.
eq(B.contentVersion({ pilgrimages: asset.pilgrimages, horizons: asset.horizons }), asset.version,
   'version is computed over the entries payload with the version field excluded');
withFixture({}, function(a){
  return withFixture({ km: { 'camino-norte': 999 } }, function(b){
    var va = B.buildAsset(a).version, vb = B.buildAsset(b).version;
    eq(B.buildAsset(a).version, va, 'fixture version is stable');
    ok(va !== vb, 'changing a route distance upstream changes the version  (' + va + ' vs ' + vb + ')');
  });
});

console.log('\n=== web module still reads the artifact ===\n');
// Pinned against the artifact as it stood before companyLine/kind/version were added.
[['2026-01-15','camino-portugues'], ['2026-04-01','camino-primitivo'], ['2026-07-18','to-the-sun'],
 ['2026-10-07','camino-primitivo'], ['2026-12-25','camino-norte']].forEach(function(pair){
  eq(C.chooseEntry(new Date(pair[0] + 'T00:00:00Z'), asset).id, pair[1],
     'selection unchanged by the new fields (' + pair[0] + ')');
});
var full = C.select(694.5, new Date('2026-10-07T00:00:00Z'), asset);
eq(JSON.stringify(Object.keys(full).sort()),
   JSON.stringify(['annualLine','daylightHref','entry','label','phase','reflection','seasonLine','times']),
   'select() shape unchanged by the new fields');
ok(typeof full.label === 'string' && full.label.length > 0, 'select() still renders a label from the artifact');
ok(C.crossingsSince(30, 800, asset).length > 0, 'crossingsSince still reads the artifact');

console.log('\n=== fail-loud ===\n');
var failLoud = spawnSync(process.execPath, [
  '-e',
  "require('" + MODULE_PATH + "').buildAsset('/definitely/no/such/dir')"
], { encoding: 'utf8' });
ok(failLoud.status !== 0, 'fail-loud: missing sibling dir exits non-zero');
ok(/bake-collective-routes: missing or invalid/.test(failLoud.stderr), 'fail-loud: stderr has the message prefix');
ok(/sibling repo not found/.test(failLoud.stderr), 'fail-loud: stderr says sibling repo not found');

console.log('\n=== distanceKm validation ===\n');
var scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-'));
try {
  var badRouteDir = path.join(scratchDir, 'routes', 'camino-frances');
  fs.mkdirSync(badRouteDir, { recursive: true });
  fs.writeFileSync(path.join(badRouteDir, 'metadata.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    id: 'camino-frances',
    name: { en: 'Camino Francés' },
    overview: { distanceKm: 0 }
  }), 'utf8');
  fs.writeFileSync(path.join(badRouteDir, 'stages.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    stages: []
  }), 'utf8');

  var badDistance = spawnSync(process.execPath, [
    '-e',
    "require('" + MODULE_PATH + "').buildAsset('" + scratchDir + "')"
  ], { encoding: 'utf8' });
  ok(badDistance.status !== 0, 'fail-loud: distanceKm=0 exits non-zero');
  ok(/distanceKm must be a positive finite number/.test(badDistance.stderr), 'fail-loud: stderr names the distanceKm validation');
} finally {
  fs.rmSync(scratchDir, { recursive: true, force: true });
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { failures.forEach(function(f){console.log('  - '+f);}); process.exit(1); }
