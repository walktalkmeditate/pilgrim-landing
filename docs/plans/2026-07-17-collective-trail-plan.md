# Collective Trail — Daily Pilgrimage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each slice maps its acceptance to the spec's numbered ACs for traceability.

**Spec:** `docs/specs/2026-07-17-collective-trail.md` (v2)
**Goal:** Replace the three drifting hardcoded route tables with one baked, dataset-sourced asset, and turn the frozen "Via Francigena walked N times" line into a daily-rotating real pilgrimage (season-weighted) with the collective's real distance mapped onto it — on the homepage trail and `/now`.
**Architecture:** Static HTML + vanilla JS + node-based tests, zero npm deps. A new bake script `scripts/bake-collective-routes` reads `../open-pilgrimages/routes/<id>/` → `assets/collective-routes.json`. A new pure module `js/collective-routes.js` does all selection + phrasing + crossing logic and is shared by both pages. `index.html` §10 and `now.html` are rewired to consume it; their inline tables are deleted.
**Tech Stack:** Vanilla JS (UMD-style `module.exports` when `typeof module !== 'undefined'`), Node built-ins only for the bake + tests, tests run via direct `node js/<file>.test.js` (no `test` script, no deps). Matches the `js/sunpath-math.test.js` harness and the `scripts/bake-daylight-routes` bake precedent.

## Decision summary (pulled from spec)

| ID | Decision |
|---|---|
| D1 | `times = total_distance_km / route.km` — never fabricated. |
| D2 | `scripts/bake-collective-routes` reads sibling `../open-pilgrimages/routes/<id>/`; mirrors bake-daylight-routes fail-loud + idempotent contract. |
| D3 | Route selection is a pure function of `(UTC date, UTC month)` — **not** distance. Distance drives numbers only. |
| D4 | Pool = 7 dataset routes + 3 cosmic horizons (`around · the Earth` 40075, `to · the Moon` 384400, `to · the Sun` 149600000). |
| D5 | Phrasing: reached (`≥2` → "N times", `==1` → "one … complete") / toward (routes → whole %; cosmic → 1-decimal % above `PERCENT_FLOOR=1.0`, else km-to-go); cold start (`≤0`) → "The path is beginning." |
| D6 | Season-weighted deterministic pick: weight = 1 (+2 if `month∈bestMonths`, +3 more if `month∈peakMonths`); cosmic = 1. seed = `YYYYMMDD` (UTC); `weighted[seed % len]`. Month is 1-based UTC. Season name via N-hemisphere map. |
| D7 | Daily texture = `interior.reflection.en`, index `seed % reflections.length`. |
| D8 | `/daylight/?route=<id>` (query scheme — no per-route pages exist). |
| D9 | Annual figure only with its metric qualifier (`metricNote`); Kumano is "overnight visitors," never "walked"; omit if absent. |
| D10 | Crossings are `/now`-only, per-visitor `localStorage['pilgrim.collective.lastSeenKm']`, written **only** after a finite `total>0` fetch. |
| D11 | No backend/API changes. |

## Global Constraints

- **No new third-party host, script, or font.** Asset is same-origin (`/assets/collective-routes.json`). (AC #14)
- **No npm deps.** Bake + tests use Node built-ins only; tests run via `node js/<file>.test.js`. (Spec: In scope)
- **Idempotent bake:** no timestamp in output; second run is byte-identical. (AC #2)
- **Never fabricate a number.** All counts derive from live `total_distance_km` or the baked dataset. (D1)
- **Honest metric qualifier:** an annual figure always carries its `metricNote`; never render a bare "N walked/pilgrims". (D9, AC #10)
- **Keep the SVG squiggle trail** as the visualization — no map library, no route GeoJSON on the web. (Spec: Non-goals)
- **ODbL attribution** wherever dataset text/stats surface. (AC #15)

## File structure

**Created:**
- `scripts/bake-collective-routes` — Node bake. Iterates a hardcoded `ROUTE_IDS` (the 7), reads `../open-pilgrimages/routes/<id>/{metadata,stages,stats}.json`, writes `assets/collective-routes.json`. Exposes `buildAsset()` on `module.exports` (for the test) and runs `main()` when invoked directly. Mirrors `bake-daylight-routes`'s `die()` / `readJson()` / `assertSchemaVersion()` / `assertField()` helpers.
- `scripts/bake-collective-routes.test.js` — node test: `buildAsset()` shape (7 pilgrimages + 3 horizons, required fields present) + determinism (two calls deep-equal). Run: `node scripts/bake-collective-routes.test.js`.
- `assets/collective-routes.json` — bake output (committed).
- `js/collective-routes.js` — pure module. Exports `select(totalDistanceKm, utcDate, asset)`, `crossingsSince(prevKm, totalKm, asset)`, plus internals for testing (`chooseEntry`, `phraseFor`, `seasonName`, `weightFor`, `utcSeed`, `PERCENT_FLOOR`). No DOM access. UMD + `window.CollectiveRoutes`.
- `js/collective-routes.test.js` — node test harness (matches `sunpath-math.test.js`). Covers AC #5, #6, #7, #8, #11, #13.

**Modified:**
- `index.html` — §10 trail script (`~1778–1999`): delete inline `routes[]`; fetch `assets/collective-routes.json` once; call `select()`; render lines; re-feed `drawTrail`'s markers from the baked `pilgrimages`. Add `<script src="js/collective-routes.js">` before the inline block. Add ODbL credit in the trail section.
- `now.html` — script (`~79–192`): delete inline `PILGRIMAGES[]`; fetch the asset once; keep the 30 s `/api/now` poll; call `select()` + `crossingsSince()`; add `aria-live="polite"` + reserved `min-height` to `<section class="cumulative">`. Add `<script src="js/collective-routes.js">`. Add ODbL credit.

## Slice DAG

```
slice 1 (bake → asset) ──┐
                         ├──→ slice 4 (rewire index.html) ──┐
slice 2 (module: select) ┤                                  ├──→ slice 6 (attribution + verify)
        └── slice 3 (module: phrasing/lines) ──→ slice 5 (rewire now.html + crossings + a11y) ──┘
```

Critical path: **1 → 2 → 3 → 5 → 6** (slice 4 parallels slice 5 once 1–3 land). Slices 2 and 3 can be built against the fixture asset before slice 1's real output exists, but both gate on the asset **shape** frozen in slice 1.

---

### Slice 1: Bake the dataset into one asset

**Files:**
- Create: `scripts/bake-collective-routes`, `scripts/bake-collective-routes.test.js`
- Output: `assets/collective-routes.json`

**Spec ACs covered:** AC #1 (shape), AC #2 (idempotent), AC #3 (fail-loud required), AC #4 (graceful optional).
**No dependencies.** Data foundation.

**Interfaces produced:**
- `buildAsset()` → `{ pilgrimages: [{ id, nameEn, km, bestMonths, peakMonths, reflections:[string], annual:{count,year,metricNote,source}|null }], horizons: [{ id, preposition, body, km, kind:'cosmic' }] }`

**Acceptance:**
- [ ] `node scripts/bake-collective-routes` writes `assets/collective-routes.json` with 7 `pilgrimages` (ids: camino-frances, camino-ingles, camino-norte, camino-portugues, camino-primitivo, kumano-kodo, shikoku-88) and 3 `horizons`.
- [ ] Running it twice → `git diff --exit-code assets/collective-routes.json` is clean (AC #2).
- [ ] Kumano entry: `km === 39`, `bestMonths === [3,4,5,10,11]`, `reflections.length === 4`, `annual.metricNote` contains "overnight visitors" (AC #10 source), `annual` non-null. Camino-frances: `km === 764`.
- [ ] With `../open-pilgrimages` moved/absent, the script exits non-zero with `bake-collective-routes: missing or invalid <path> — <reason>` (AC #3).

**Steps:**

- [ ] **Step 1: Write the failing bake test.** Create `scripts/bake-collective-routes.test.js`:

```js
'use strict';
var B = require('./bake-collective-routes.js'); // requires UMD export; see step 3
var passed = 0, failed = 0, failures = [];
function ok(c, label){ if(c){passed++;console.log('  ✓ '+label);} else {failed++;failures.push(label);console.log('  ✗ '+label);} }

var asset = B.buildAsset();
ok(asset.pilgrimages.length === 7, '7 pilgrimages');
ok(asset.horizons.length === 3, '3 horizons');
var kumano = asset.pilgrimages.filter(function(p){return p.id==='kumano-kodo';})[0];
ok(kumano && kumano.km === 39, 'kumano km=39');
ok(kumano && kumano.reflections.length === 4, 'kumano 4 reflections');
ok(kumano && kumano.annual && /overnight visitors/i.test(kumano.annual.metricNote), 'kumano metricNote has "overnight visitors"');
var frances = asset.pilgrimages.filter(function(p){return p.id==='camino-frances';})[0];
ok(frances && frances.km === 764, 'camino-frances km=764');
var sun = asset.horizons.filter(function(h){return h.id==='to-the-sun';})[0];
ok(sun && sun.km === 149600000 && sun.preposition==='to' && sun.body==='the Sun', 'to-the-sun horizon');
// determinism: two builds deep-equal
ok(JSON.stringify(B.buildAsset()) === JSON.stringify(B.buildAsset()), 'buildAsset deterministic');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { failures.forEach(function(f){console.log('  - '+f);}); process.exit(1); }
```

- [ ] **Step 2: Run it — confirm RED.** Run: `node scripts/bake-collective-routes.test.js` → Expected: FAIL (`Cannot find module './bake-collective-routes.js'`).

- [ ] **Step 3: Write the bake script.** Create `scripts/bake-collective-routes` (also `require`-able — the test requires `./bake-collective-routes.js`, so create the file with a `.js` twin OR make the extensionless file the module and have the test require it by adding a symlink; simplest: name the requirable logic file `scripts/bake-collective-routes.js` and a thin extensionless `scripts/bake-collective-routes` that `require`s it and calls `main()`. Follow the split below):

`scripts/bake-collective-routes.js`:
```js
#!/usr/bin/env node
'use strict';
var fs = require('fs');
var path = require('path');

var REPO_ROOT    = path.resolve(__dirname, '..');
var SIBLING_ROOT = path.resolve(REPO_ROOT, '..', 'open-pilgrimages');
var ROUTES_DIR   = path.join(SIBLING_ROOT, 'routes');
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
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { die('missing or invalid ' + fp + ' — ' + e.message); }
}
function assertSchemaVersion(d, fp){
  if (d.schemaVersion !== REQUIRED_SCHEMA_VERSION)
    die('missing or invalid ' + fp + ' — schemaVersion must be "' + REQUIRED_SCHEMA_VERSION + '", got ' + JSON.stringify(d.schemaVersion));
}
function assertField(v, name, fp){ if (v === undefined || v === null) die('missing or invalid ' + fp + ' — required field "' + name + '" is absent'); }

function bakePilgrimage(routeId){
  var dir = path.join(ROUTES_DIR, routeId);
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

function buildAsset(){
  if (!fs.existsSync(SIBLING_ROOT)) die('missing or invalid ' + SIBLING_ROOT + ' — sibling repo not found');
  if (!fs.existsSync(ROUTES_DIR)) die('missing or invalid ' + ROUTES_DIR + ' — routes directory not found');
  return { pilgrimages: ROUTE_IDS.map(bakePilgrimage), horizons: HORIZONS };
}

function main(){
  var asset = buildAsset();
  fs.writeFileSync(OUT_PATH, JSON.stringify(asset, null, 2) + '\n', 'utf8');
  process.stdout.write('  collective-routes.json — ' + asset.pilgrimages.length + ' routes + ' + asset.horizons.length + ' horizons\n');
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildAsset: buildAsset, main: main };
if (require.main === module) main();
```

Then create the extensionless entry `scripts/bake-collective-routes` (mirrors the daylight bake being run as `./scripts/bake-...`):
```js
#!/usr/bin/env node
'use strict';
require('./bake-collective-routes.js').main();
```
`chmod +x scripts/bake-collective-routes`.

- [ ] **Step 4: Run the test — confirm GREEN.** Run: `node scripts/bake-collective-routes.test.js` → Expected: all ✓, exit 0. (Requires the sibling `../open-pilgrimages` present.)

- [ ] **Step 5: Generate the asset + verify idempotency.** Run: `node scripts/bake-collective-routes` then again; then `git diff --exit-code assets/collective-routes.json` → Expected: clean (no diff). Spot-check the file: `node -e "var a=require('./assets/collective-routes.json');console.log(a.pilgrimages.map(function(p){return p.id+':'+p.km;}).join(', '))"`.

- [ ] **Step 6: Verify fail-loud.** Run: `node -e "process.chdir('/tmp'); require('/Users/rubberduck/GitHub/momentmaker/pilgrim-landing/scripts/bake-collective-routes.js').buildAsset()"` from a location where the sibling resolves absent → Expected: stderr `bake-collective-routes: missing or invalid … — sibling repo not found`, exit 1. (Restore after.)

- [ ] **Step 7: Commit.**
```bash
git add scripts/bake-collective-routes scripts/bake-collective-routes.js scripts/bake-collective-routes.test.js assets/collective-routes.json
git commit -m "feat(collective): bake the world's real pilgrimages into one asset"
```

---

### Slice 2: Module — deterministic season-weighted selection

**Files:**
- Create: `js/collective-routes.js` (selection half), `js/collective-routes.test.js`

**Spec ACs covered:** AC #5 (deterministic, distance-independent), AC #7 (season weighting), AC #13 (daily cadence).
**Depends on:** slice 1 asset shape (built against the fixture below; no runtime dep).

**Interfaces produced:**
- `chooseEntry(utcDate, asset)` → an entry (pilgrimage or horizon)
- `utcSeed(utcDate)` → integer `YYYYMMDD`
- `weightFor(entry, month)` → integer
- `select(...)` is completed in slice 3; slice 2 lands `chooseEntry` + the module skeleton + UMD export.

**Acceptance:**
- [ ] `chooseEntry(utcDate, asset)` returns the same entry for a given UTC date regardless of anything else; `weightFor(kumano, 10) === 6` (best+peak) and `weightFor(kumano, 7) === 1`.
- [ ] Over 2026-10-01..2026-10-30, ≥ 18/30 days select a route whose `bestMonths` includes 10 (AC #7 ≥ 60%).

**Steps:**

- [ ] **Step 1: Write the failing selection tests.** Create `js/collective-routes.test.js`:

```js
'use strict';
var C = require('./collective-routes.js');
var passed = 0, failed = 0, failures = [];
function ok(c, label){ if(c){passed++;console.log('  ✓ '+label);} else {failed++;failures.push(label);console.log('  ✗ '+label);} }
function eq(a, e, label){ ok(a === e, label + '  (' + JSON.stringify(a) + ' vs ' + JSON.stringify(e) + ')'); }
function d(s){ return new Date(s + 'T00:00:00Z'); }

var ASSET = {
  pilgrimages: [
    { id:'kumano-kodo',    nameEn:'Kumano Kodo',    km:39,  bestMonths:[3,4,5,10,11], peakMonths:[4,5,10,11], reflections:['What did you leave behind at the gate?'], annual:{count:44540,year:2024,metricNote:'Foreign overnight visitors in Hongu area',source:'x'} },
    { id:'camino-frances', nameEn:'Camino Francés',  km:764, bestMonths:[5,6,9,10],    peakMonths:[7,8],       reflections:['r1'], annual:null }
  ],
  horizons: [
    { id:'around-earth', preposition:'around', body:'the Earth', km:40075,     kind:'cosmic' },
    { id:'to-the-moon',  preposition:'to',     body:'the Moon',  km:384400,    kind:'cosmic' },
    { id:'to-the-sun',   preposition:'to',     body:'the Sun',   km:149600000, kind:'cosmic' }
  ]
};

console.log('\n=== selection ===\n');
eq(C.weightFor(ASSET.pilgrimages[0], 10), 6, 'kumano weight in October (best+peak)');
eq(C.weightFor(ASSET.pilgrimages[0], 7), 1, 'kumano weight in July (off-season)');
eq(C.weightFor(ASSET.horizons[0], 10), 1, 'cosmic weight constant');
// named-id determinism (AC #5): seed(2026-10-07)=20261007; weighted list in October is
//   frances×3 [idx 0..2], kumano×6 [3..8], Earth,Moon,Sun ×1 [9,10,11]; 20261007 % 12 = 3 → kumano.
eq(C.chooseEntry(d('2026-10-07'), ASSET).id, 'kumano-kodo', 'named daily pick (2026-10-07 → kumano-kodo)');
// season distribution (AC #7)
var inSeason = 0;
for (var day = 1; day <= 30; day++) {
  var ds = '2026-10-' + (day < 10 ? '0' + day : day);
  var e = C.chooseEntry(d(ds), ASSET);
  if (e.bestMonths && e.bestMonths.indexOf(10) !== -1) inSeason++;
}
ok(inSeason >= 18, 'October in-season majority (' + inSeason + '/30 ≥ 18)');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { failures.forEach(function(f){console.log('  - '+f);}); process.exit(1); }
```

- [ ] **Step 2: Run — confirm RED.** Run: `node js/collective-routes.test.js` → Expected: FAIL (`Cannot find module './collective-routes.js'`).

- [ ] **Step 3: Implement selection.** Create `js/collective-routes.js`:

```js
'use strict';

var PERCENT_FLOOR = 1.0;
var WEIGHT_BASE = 1, WEIGHT_BEST = 2, WEIGHT_PEAK = 3;

function seasonName(month){
  if (month === 12 || month === 1 || month === 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'autumn'; // 9,10,11
}
function inList(arr, month){ return Array.isArray(arr) && arr.indexOf(month) !== -1; }
function weightFor(entry, month){
  if (entry.kind === 'cosmic') return WEIGHT_BASE;
  var w = WEIGHT_BASE;
  if (inList(entry.bestMonths, month)) w += WEIGHT_BEST;
  if (inList(entry.peakMonths, month)) w += WEIGHT_PEAK;
  return w;
}
function orderedEntries(asset){
  var routes = asset.pilgrimages.slice().sort(function(a,b){ return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return routes.concat(asset.horizons.slice()); // horizons keep asset order: Earth, Moon, Sun
}
function utcSeed(utcDate){
  return utcDate.getUTCFullYear() * 10000 + (utcDate.getUTCMonth() + 1) * 100 + utcDate.getUTCDate();
}
function chooseEntry(utcDate, asset){
  var month = utcDate.getUTCMonth() + 1;
  var weighted = [];
  orderedEntries(asset).forEach(function(e){
    var w = weightFor(e, month);
    for (var i = 0; i < w; i++) weighted.push(e);
  });
  return weighted[utcSeed(utcDate) % weighted.length];
}

// select() + phrasing/lines land in slice 3.

var api = {
  PERCENT_FLOOR: PERCENT_FLOOR,
  seasonName: seasonName, weightFor: weightFor, utcSeed: utcSeed, chooseEntry: chooseEntry
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CollectiveRoutes = api;
```

- [ ] **Step 4: Run — confirm GREEN.** Run: `node js/collective-routes.test.js` → Expected: all ✓, exit 0.

- [ ] **Step 5: Commit.**
```bash
git add js/collective-routes.js js/collective-routes.test.js
git commit -m "feat(collective): choose the day's path — season-weighted, deterministic"
```

---

### Slice 3: Module — phrasing, season clause, reflection, links, annual

**Files:**
- Modify: `js/collective-routes.js` (add `phraseFor`, `select`, line builders), `js/collective-routes.test.js` (append)

**Spec ACs covered:** AC #6 (phrasing branches), AC #8 (texture), AC #9 (daylight link), AC #10 (honest annual).
**Depends on:** slice 2.

**Interfaces produced:**
- `phraseFor(entry, totalKm)` → `{ phase:'reached'|'toward', label:string }`
- `select(totalDistanceKm, utcDate, asset)` → `{ entry, times, phase, label, seasonLine|null, reflection|null, daylightHref|null, annualLine|null }`

**Acceptance (all from AC #6/#8/#9/#10; assert the model string, not fragile substrings):**
- [ ] Kumano @ 694.5 → "Together, we've walked the Kumano Kodo 17 times."
- [ ] A route with `1 ≤ times < 2` → "Together, one {nameEn} complete." (never "1 times")
- [ ] Camino Francés (764) @ 694.5 → "We are 91% of the way to one Camino Francés."
- [ ] Earth @ 694.5 → "We are 1.7% of the way around the Earth." (one decimal, not "2%")
- [ ] Moon @ 694.5 → "383,706 km to the Moon."; Sun → "149,599,306 km to the Sun."
- [ ] total 0 → "The path is beginning."
- [ ] seasonLine for Kumano in month 10 → "Its season is autumn — and it is autumn now."; month 7 → `null`.
- [ ] `daylightHref` for Kumano → "/daylight/?route=kumano-kodo"; cosmic → `null`.
- [ ] `annualLine` for Kumano → "44,540 Foreign overnight visitors in Hongu area (2024)"; camino-frances (annual null) → `null`.

**Steps:**

- [ ] **Step 1: Append failing phrasing tests** to `js/collective-routes.test.js` (before the summary block):

```js
console.log('\n=== phrasing ===\n');
var K = ASSET.pilgrimages[0], F = ASSET.pilgrimages[1];
var EARTH = ASSET.horizons[0], MOON = ASSET.horizons[1], SUN = ASSET.horizons[2];
eq(C.phraseFor(K, 694.5).label, "Together, we've walked the Kumano Kodo 17 times.", 'kumano 17 times');
eq(C.phraseFor({nameEn:'Test Route', km:500}, 694.5).label, 'Together, one Test Route complete.', 'floor==1 → one complete');
eq(C.phraseFor(F, 694.5).label, 'We are 91% of the way to one Camino Francés.', 'camino 91% toward');
eq(C.phraseFor(EARTH, 694.5).label, 'We are 1.7% of the way around the Earth.', 'earth 1.7% one-decimal');
eq(C.phraseFor(MOON, 694.5).label, '383,706 km to the Moon.', 'moon km-to-go');
eq(C.phraseFor(SUN, 694.5).label, '149,599,306 km to the Sun.', 'sun km-to-go');
eq(C.phraseFor(K, 0).label, 'The path is beginning.', 'cold start');

console.log('\n=== lines ===\n');
// AC #5 distance-independence: the route is the same regardless of total distance.
eq(C.select(1, d('2026-10-07'), ASSET).entry.id, C.select(999999, d('2026-10-07'), ASSET).entry.id, 'route is distance-independent');
eq(C.select(1, d('2026-10-07'), ASSET).entry.id, 'kumano-kodo', "select picks the day's route (2026-10-07 → kumano-kodo)");
// seasonLine / reflection / href / annual tested via direct helpers for the two known routes:
eq(C.seasonLineFor(K, 10), 'Its season is autumn — and it is autumn now.', 'kumano autumn clause');
eq(C.seasonLineFor(K, 7), null, 'kumano off-season → null');
eq(C.daylightHrefFor(K), '/daylight/?route=kumano-kodo', 'daylight href');
eq(C.daylightHrefFor(EARTH), null, 'cosmic no daylight href');
eq(C.annualLineFor(K), '44,540 Foreign overnight visitors in Hongu area (2024)', 'kumano annual line');
eq(C.annualLineFor(F), null, 'camino no annual line');
```

- [ ] **Step 2: Run — confirm RED** (new assertions fail; `phraseFor`/`select`/helpers undefined). Run: `node js/collective-routes.test.js`.

- [ ] **Step 3: Implement phrasing + lines** in `js/collective-routes.js` (insert before the `api` object, and add to `api`):

```js
function nf(n){ return Math.round(n).toLocaleString('en-US'); }

function phraseFor(entry, totalKm){
  if (!(totalKm > 0)) return { phase: 'toward', label: 'The path is beginning.' };
  var times = totalKm / entry.km;
  if (entry.kind === 'cosmic') {
    var pct = times * 100;
    if (pct >= PERCENT_FLOOR)
      return { phase: 'toward', label: 'We are ' + pct.toFixed(1) + '% of the way ' + entry.preposition + ' ' + entry.body + '.' };
    return { phase: 'toward', label: nf(entry.km - totalKm) + ' km ' + entry.preposition + ' ' + entry.body + '.' };
  }
  var floor = Math.floor(times);
  if (floor >= 2) return { phase: 'reached', label: "Together, we've walked the " + entry.nameEn + ' ' + floor + ' times.' };
  if (floor === 1) return { phase: 'reached', label: 'Together, one ' + entry.nameEn + ' complete.' };
  return { phase: 'toward', label: 'We are ' + Math.round(times * 100) + '% of the way to one ' + entry.nameEn + '.' };
}

function seasonLineFor(entry, month){
  if (entry.kind === 'cosmic' || !inList(entry.bestMonths, month)) return null;
  var s = seasonName(month);
  return 'Its season is ' + s + ' — and it is ' + s + ' now.';
}
function reflectionFor(entry, seed){
  if (entry.kind === 'cosmic' || !entry.reflections || entry.reflections.length === 0) return null;
  return entry.reflections[seed % entry.reflections.length];
}
function daylightHrefFor(entry){
  return entry.kind === 'cosmic' ? null : '/daylight/?route=' + entry.id;
}
function annualLineFor(entry){
  if (entry.kind === 'cosmic' || !entry.annual) return null;
  var a = entry.annual;
  return a.count.toLocaleString('en-US') + ' ' + a.metricNote + ' (' + a.year + ').';
}

function select(totalDistanceKm, utcDate, asset){
  var entry = chooseEntry(utcDate, asset);
  var seed = utcSeed(utcDate);
  var month = utcDate.getUTCMonth() + 1;
  var total = totalDistanceKm || 0;
  var p = phraseFor(entry, total);
  return {
    entry: entry,
    times: total / entry.km,
    phase: p.phase,
    label: p.label,
    seasonLine: seasonLineFor(entry, month),
    reflection: reflectionFor(entry, seed),
    daylightHref: daylightHrefFor(entry),
    annualLine: annualLineFor(entry)
  };
}
```
Add to `api`: `phraseFor, select, seasonLineFor, reflectionFor, daylightHrefFor, annualLineFor`.

- [ ] **Step 4: Run — confirm GREEN.** Run: `node js/collective-routes.test.js` → all ✓, exit 0.

- [ ] **Step 5: Commit.**
```bash
git add js/collective-routes.js js/collective-routes.test.js
git commit -m "feat(collective): say it true — reached, toward, and the cosmic horizons"
```

---

### Slice 4: Rewire the homepage trail

**Files:**
- Modify: `index.html` (§10 script `~1778–1999`; add `<script src="js/collective-routes.js">` near the other `js/*` scripts `~1774`)

**Spec ACs covered:** AC #12 (tables unified, incl. markers), AC #14 (network), AC #15 (attribution).
**Depends on:** slices 1–3. Parallel with slice 5.

**Interfaces consumed:** `CollectiveRoutes.select(totalDistanceKm, utcDate, asset)`, baked `assets/collective-routes.json`.

**Acceptance:**
- [ ] `grep -nE "Via Francigena|Appalachian|Te Araroa|km: *[0-9]" index.html` → no route/distance table (AC #12).
- [ ] Homepage renders the day's route line (via `select`) + `drawTrail` markers now come from the baked `pilgrimages`.
- [ ] DevTools Network shows one `/assets/collective-routes.json` fetch, no new third-party host (AC #14).

**Steps:**

- [ ] **Step 1: Load the module.** In `index.html` near `~1774` (with the other `<script src="js/…">`), add:
```html
<script src="js/collective-routes.js"></script>
```

- [ ] **Step 2: Delete the inline `routes[]` table** (`index.html:1792–1800`) and replace the data source. In the `(function(){ … })()` trail IIFE, remove the `var routes = [ … ];` literal. Add an asset fetch and gate the existing render on it:
```js
var COLLECTIVE = null; // { pilgrimages, horizons }
function withAsset(cb){
  if (COLLECTIVE) return cb(COLLECTIVE);
  fetch('/assets/collective-routes.json').then(function(r){return r.json();})
    .then(function(a){ COLLECTIVE = a; cb(a); })
    .catch(function(){ /* leave existing static fallback text */ });
}
```

- [ ] **Step 3: Route the milestone line through `select`.** Replace the body of `pilgrimageMessage(km)` / `renderStats` milestone assignment so the milestone text comes from `CollectiveRoutes.select`:
```js
function milestoneText(km){
  if (!COLLECTIVE) return 'The path is beginning.';
  var m = CollectiveRoutes.select(km, new Date(), COLLECTIVE);
  return m.label; // homepage shows the single line; reflection/annual/link are /now-richer (kept minimal here)
}
```
and in `renderStats`, set `milestoneEl.textContent = milestoneText(km);` after `COLLECTIVE` is available (wrap the existing `fetch('https://walk.pilgrimapp.org/api/now')…renderStats` so `renderStats` runs inside `withAsset(...)`).

- [ ] **Step 4: Re-feed `drawTrail` markers from the asset.** In `drawTrail` (`index.html:1850`), change `routes.forEach(...)` to iterate `COLLECTIVE.pilgrimages` using `route.km` and `route.nameEn` (was `route.name`):
```js
(COLLECTIVE ? COLLECTIVE.pilgrimages : []).forEach(function(route){
  if (route.km > km || route.km > maxKm) return;
  // …existing marker + label code, using route.nameEn for the label…
});
```

- [ ] **Step 5: Add the ODbL credit** in the trail section markup (near `trail-info`, `index.html:~1658`):
```html
<p class="trail-credit"><em>route data: <a href="https://github.com/walktalkmeditate/open-pilgrimages">open-pilgrimages</a> · ODbL</em></p>
```

- [ ] **Step 6: Verify.** Run: `grep -nE "Via Francigena|Appalachian|Te Araroa|km: *[0-9]" index.html` → Expected: no route/km table lines. Then open `index.html` in a browser against live `/api/now` (or `python3 -m http.server`), confirm the trail line renders a real route and markers appear; DevTools → one asset fetch, no third-party host.

- [ ] **Step 7: Commit.**
```bash
git add index.html
git commit -m "feat(collective): the homepage trail walks the day's real path"
```

---

### Slice 5: Rewire `/now` + milestone crossings + a11y

**Files:**
- Modify: `js/collective-routes.js` (add `crossingsSince`), `js/collective-routes.test.js` (append), `now.html` (script `~79–192`; `<section class="cumulative">` `~68`; add `<script src="js/collective-routes.js">`)

**Spec ACs covered:** AC #6/#8/#9/#10 (rich render), AC #11 (crossings, fetch-guarded), AC #13 (cadence), AC #16 (a11y / no shift).
**Depends on:** slices 1–3. Parallel with slice 4.

**Interfaces produced:** `crossingsSince(prevKm, totalKm, asset)` → `[nameEn]`.

**Acceptance:**
- [ ] `crossingsSince(30, 800, ASSET)` contains both `'Kumano Kodo'` (39) and `'Camino Francés'` (764) — both in `(30,800]`, returned in `asset.pilgrimages` order; `crossingsSince(50,100,ASSET)` → `[]`; `crossingsSince(30, 0, ASSET)` → `[]` (failed/zero fetch, AC #11); `crossingsSince(NaN, 800, ASSET)` → `[]`.
- [ ] `/now` inline `PILGRIMAGES[]` deleted; both bottom lines render via `select`; season/reflection/annual/daylight-link appear where present.
- [ ] `<section class="cumulative">` has `aria-live="polite"` and a reserved `min-height`; a simulated date change causes no sibling shift (AC #16).
- [ ] `localStorage['pilgrim.collective.lastSeenKm']` is written **only** after a finite `total>0` fetch; the catch path leaves it untouched (AC #11).

**Steps:**

- [ ] **Step 1: Append failing crossing tests** to `js/collective-routes.test.js`:
```js
console.log('\n=== crossings ===\n');
var crossed = C.crossingsSince(30, 800, ASSET);
ok(crossed.indexOf('Kumano Kodo') !== -1 && crossed.indexOf('Camino Francés') !== -1, 'kumano(39)+frances(764) cross in (30,800]');
eq(C.crossingsSince(50, 100, ASSET).length, 0, 'nothing crosses in (50,100]');
eq(C.crossingsSince(30, 0, ASSET).length, 0, 'failed/zero fetch → no crossings');
eq(C.crossingsSince(NaN, 800, ASSET).length, 0, 'no baseline → no crossings');
```

- [ ] **Step 2: Run — confirm RED.** Run: `node js/collective-routes.test.js`.

- [ ] **Step 3: Implement `crossingsSince`** in `js/collective-routes.js` (add to `api` too):
```js
function crossingsSince(prevKm, totalKm, asset){
  if (!(totalKm > 0) || !isFinite(totalKm)) return [];   // failed/zero/non-finite fetch
  if (!(prevKm >= 0) || !isFinite(prevKm)) return [];     // no valid baseline (first visit)
  return asset.pilgrimages
    .filter(function(r){ return r.km > prevKm && r.km <= totalKm; })
    .map(function(r){ return r.nameEn; });                // cosmic excluded (not iterated)
}
```

- [ ] **Step 4: Run — confirm GREEN.** Run: `node js/collective-routes.test.js` → all ✓.

- [ ] **Step 5: Add a11y to the cumulative section.** In `now.html:68`, change to:
```html
<section class="cumulative" id="cumulative-section" aria-live="polite" hidden>
```
and in `css/now.css` give the rotating container a reserved height:
```css
.cumulative { min-height: 4.5rem; }
```

- [ ] **Step 6: Load module + delete inline table.** In `now.html`, add `<script src="js/collective-routes.js"></script>` before the inline IIFE; delete `PILGRIMAGES[]` (`now.html:81`) and `findMilestone` (superseded by `select`). Fetch the asset once at the top of the IIFE:
```js
var COLLECTIVE = null;
fetch('/assets/collective-routes.json').then(function(r){return r.json();}).then(function(a){ COLLECTIVE = a; }).catch(function(){});
```

- [ ] **Step 7: Route the two bottom lines through `select` + crossings.** Replace `renderCumulative(walks, distanceKm)` body so the milestone line + extras come from the module, guarded on a finite total:
```js
function renderCumulative(walks, distanceKm){
  var section = document.getElementById('cumulative-section');
  var line = document.getElementById('cumulative-line');
  var milestone = document.getElementById('milestone-line');
  if (!walks || walks <= 0) { section.hidden = true; return; }

  line.replaceChildren(
    document.createTextNode('Since launch, '),
    el('strong', fmt(walks)),
    document.createTextNode(' walks have been taken with the collective.')
  );

  var nodes = [];
  if (COLLECTIVE && distanceKm > 0 && isFinite(distanceKm)) {
    var m = CollectiveRoutes.select(distanceKm, new Date(), COLLECTIVE);
    nodes.push(document.createTextNode(m.label));
    if (m.seasonLine) { nodes.push(el('br')); nodes.push(document.createTextNode(m.seasonLine)); }
    if (m.reflection) { nodes.push(el('br')); nodes.push(el('em', m.reflection)); }
    if (m.annualLine) { nodes.push(el('br')); nodes.push(document.createTextNode(m.annualLine)); }
    if (m.daylightHref) {
      nodes.push(el('br'));
      var a = document.createElement('a'); a.href = m.daylightHref; a.textContent = 'find its light →';
      nodes.push(a);
    }
    // crossings (fetch-guarded): only advance the baseline on a finite positive total
    try {
      var KEY = 'pilgrim.collective.lastSeenKm';
      var prev = parseFloat(localStorage.getItem(KEY));
      var crossed = CollectiveRoutes.crossingsSince(prev, distanceKm, COLLECTIVE);
      crossed.forEach(function(nameEn){
        nodes.push(el('br'));
        nodes.push(document.createTextNode('Since you were last here, together we completed the ' + nameEn + '.'));
      });
      localStorage.setItem(KEY, String(distanceKm)); // only reached when distanceKm finite>0
    } catch (e) { /* localStorage unavailable — skip crossings */ }
  }
  milestone.replaceChildren.apply(milestone, nodes);
  section.hidden = false;
}
```
(The `distanceKm > 0 && isFinite` guard means a failed fetch — which lands `total_distance_km || 0` = 0 — never writes the key. AC #11.)

- [ ] **Step 8: Add the ODbL credit** to `now.html` footer area:
```html
<p class="now-credit"><em>route data: <a href="https://github.com/walktalkmeditate/open-pilgrimages">open-pilgrimages</a> · ODbL</em></p>
```

- [ ] **Step 9: Verify.** `grep -nE "Via Francigena|Appalachian|PCT|St\. Olav|km: *[0-9]" now.html` → no table. Open `/now` in a browser; confirm the day's route line + any season/reflection/annual/link render; DevTools → `<section class="cumulative">` has `aria-live="polite"`, one asset fetch. Simulate a crossing: set `localStorage['pilgrim.collective.lastSeenKm']='30'`, reload → expect a "completed the …" line; set it to the current total, reload → no crossing line.

- [ ] **Step 10: Commit.**
```bash
git add js/collective-routes.js js/collective-routes.test.js now.html css/now.css
git commit -m "feat(collective): /now turns daily, remembers what you crossed"
```

---

### Slice 6: Attribution audit + full verification

**Files:**
- Modify (if needed): `index.html`, `now.html`, `css/*` for credit styling.

**Spec ACs covered:** AC #14 (network), AC #15 (attribution present on both surfaces), AC #16 (a11y), plus a full test-suite green.
**Depends on:** slices 4, 5.

**Acceptance:**
- [ ] `node scripts/bake-collective-routes.test.js` and `node js/collective-routes.test.js` both exit 0.
- [ ] Both `index.html` and `/now` show the ODbL credit; neither introduces a third-party host (DevTools Network audit — all requests same-origin except the pre-existing `walk.pilgrimapp.org/api/now` and the existing analytics/fonts already on the page).
- [ ] `git grep -nE "Via Francigena|Appalachian|Te Araroa|St\. Olav|PCT" index.html now.html` → empty (all three tables gone).

**Steps:**
- [ ] **Step 1: Run the full node suite.** `node scripts/bake-collective-routes.test.js && node js/collective-routes.test.js` → both green.
- [ ] **Step 2: Manual browser pass** on `index.html` + `/now` against live `/api/now`: day's route renders, markers present, crossings simulate correctly, credits visible, no layout shift on a simulated date change, DevTools shows no new third-party host.
- [ ] **Step 3: Confirm tables gone.** Run the `git grep` above → empty.
- [ ] **Step 4: Commit any credit-styling tweaks.**
```bash
git add -A
git commit -m "chore(collective): attribution + verification pass"
```

---

## Self-review (against the spec)

- **Spec coverage:** AC #1–#3 → slice 1; #4 → slices 1+3 (fixture); #5,#7,#13 → slice 2; #6,#8,#9,#10 → slice 3; #11 → slice 5; #12 → slices 4+5; #14,#15,#16 → slices 4/5/6. D1–D11 all land in a slice. No orphan requirements.
- **Type consistency:** the render model `{ entry, times, phase, label, seasonLine, reflection, daylightHref, annualLine }` and `crossingsSince → [nameEn]` are used identically in slices 3, 4, 5. Route field is `nameEn` everywhere (never `name`), fixing the old `route.name` marker label. Horizon fields `preposition`/`body`/`km`/`kind` consistent across bake (slice 1) and phrasing (slice 3).
- **Known simplification to flag at execution:** the homepage (slice 4) shows only the single `label` line (keeps the below-the-fold trail minimal); the richer season/reflection/annual/crossing stack lives on `/now` (slice 5). If the homepage should carry the extras too, that's a one-block addition mirroring slice 5's `renderCumulative` — not assumed here.
- **Metric-note copy (D9):** v1 renders `metricNote` verbatim from the dataset (`latest.note || dataNote`), which is honest but occasionally clunky (e.g. "… — all-time record"). Curated per-route sentences are a spec-noted later upgrade; do not hand-edit copy into the bake.

## Execution handoff

Two options — see the "Execution Handoff" of `superpowers:writing-plans`:
1. **Subagent-Driven (recommended)** — a fresh subagent per slice, review between slices.
2. **Inline Execution** — batch through the slices in one session with checkpoints.
