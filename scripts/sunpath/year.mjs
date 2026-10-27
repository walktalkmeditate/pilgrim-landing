#!/usr/bin/env node
// Bootstrap an entire Sun Path year in one command.
//
//   node scripts/sunpath/year.mjs 2027
//   node scripts/sunpath/year.mjs 2027 --dry      # preview, no writes
//   node scripts/sunpath/year.mjs 2027 --force    # overwrite existing files
//
// What it does, in order:
//   1. Compute the four turning instants of YEAR, to the second.
//   2. Write assets/sunpath/turnings/YEAR-{key}.json (data files, idempotent):
//      the copy, the temple, the claim menu and the lead.
//   3. Write assets/sunpath/turning-events-YEAR.json (empty events skeleton).
//   4. Write sunpath/turnings-YEAR.ics (regenerable).
//   5. Render sunpath/YEAR-{key}/index.html via build-permalinks.mjs.
//   6. Pin each new page's weight in js/page-weight.test.js.
//   7. Render assets/og-YEAR-{key}-{hash}.png via build-og-sunpath.sh: each
//      page's own plate, under the name its og:image already carries.
//   8. Append YEAR to assets/sunpath/years.json.
//   9. Append four <url> entries to sitemap.xml.
//
// Idempotent: refuses to overwrite existing data files unless --force, and
// --force keeps a lead the user has picked. HTML, ICS, OG images, sitemap,
// years.json are always regenerated.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { turningInstant } from './meeus.mjs';
import { TURNING_KEYS, renderPermalink } from './permalink-template.mjs';

const require = createRequire(import.meta.url);
const core = require('../../js/turning-leaf-core.js');
const { claimMenu } = require('./turning-claims.js');

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const GAZETTEER = resolve(SCRIPT_DIR, 'data/places.json');
const PAGE_WEIGHT_TEST = resolve(REPO_ROOT, 'js/page-weight.test.js');
const TEMPLES = JSON.parse(readFileSync(resolve(REPO_ROOT, 'assets/sunpath/temples.json'), 'utf8')).temples;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TURNING_META = {
  'spring-equinox': {
    name: 'Spring Equinox',
    schemaName: 'March equinox',
    schemaDesc: 'The astronomical moment when the sun crosses the celestial equator heading north.',
    tagline: 'the northern crossing',
    longLine: 'the sun crossed the equator heading north',
    icsBody: 'The sun crosses the equator heading north.\\n\\nFrom here, northern days grow until summer solstice.',
    icsAlarm: 'Spring Equinox tomorrow — the sun crosses the equator heading north',
    icsCategory: 'Equinox,Astronomy',
    ogDesc: 'The moment the sun crossed the equator heading north, with monuments and pilgrimages tied to the turning.',
    twDesc: 'The moment the sun crossed the equator heading north.'
  },
  'summer-solstice': {
    name: 'Summer Solstice',
    schemaName: 'June solstice',
    schemaDesc: 'The astronomical moment when the sun reaches its furthest declination north, the longest day in the northern hemisphere.',
    tagline: 'the longest light',
    longLine: 'the sun stood at its furthest north and the northern day reached its longest',
    icsBody: 'The sun stands at its furthest north. The longest northern day.\\n\\nFrom here, northern days shorten until winter solstice.',
    icsAlarm: 'Summer Solstice tomorrow — the longest light',
    icsCategory: 'Solstice,Astronomy',
    ogDesc: 'The longest day of the northern year, with sun-aligned monuments and pilgrimages from many traditions.',
    twDesc: 'The longest day of the northern year.'
  },
  'autumn-equinox': {
    name: 'Autumn Equinox',
    schemaName: 'September equinox',
    schemaDesc: 'The astronomical moment when the sun crosses the celestial equator southward, when northern days shorten fastest.',
    tagline: 'the southern crossing',
    longLine: 'the sun crossed the equator again, heading south, as northern days shortened fastest',
    icsBody: 'The sun crosses the equator again, heading south.\\n\\nFrom here, northern nights grow longer until winter solstice.',
    icsAlarm: 'Autumn Equinox tomorrow — the sun crosses the equator heading south',
    icsCategory: 'Equinox,Astronomy',
    ogDesc: 'The southern crossing — when northern days shorten fastest and the harvest pilgrimages walk.',
    twDesc: 'The southern crossing — northern days shortening fastest.'
  },
  'winter-solstice': {
    name: 'Winter Solstice',
    schemaName: 'December solstice',
    schemaDesc: 'The astronomical moment when the sun reaches its furthest declination south, the longest night in the northern hemisphere.',
    tagline: 'the longest dark',
    longLine: 'the sun reached its furthest south and the northern night became its longest',
    icsBody: 'The sun reaches its furthest south. The longest northern night.\\n\\nFrom here, light returns. Northern days grow until summer solstice.',
    icsAlarm: 'Winter Solstice tomorrow — the longest dark, and the turning back toward light',
    icsCategory: 'Solstice,Astronomy',
    ogDesc: 'The longest northern night, the moment Newgrange floods with chamber light, the turning back toward the sun.',
    twDesc: 'The longest northern night — and the turning back toward light.'
  }
};

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function utcDisplayDate(date) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function utcLongDate(date, year) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${year} at ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

// Every instant is stored, computed from and printed at the same whole
// second; a display names the minute containing it.
function toSecond(date) {
  return new Date(Math.round(date.getTime() / 1000) * 1000);
}

function utcInstantString(date) {
  return date.toISOString().replace('.000Z', 'Z');
}

function icsTimestamp(date) {
  return utcInstantString(date).replace(/[-:]/g, '');
}

function todayISO() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function instantOf(year, key) {
  return toSecond(turningInstant(year, key));
}

// The four turnings before (year, key), oldest first: the claim menu
// measures the season just ended against the three before it.
function recentInstants(year, key) {
  const out = [];
  let y = year, i = TURNING_KEYS.indexOf(key);
  for (let n = 0; n < 4; n++) {
    if (--i < 0) { i = 3; y--; }
    out.unshift(instantOf(y, TURNING_KEYS[i]));
  }
  return out;
}

let gazetteer = null;
function loadGazetteer() {
  gazetteer = gazetteer || JSON.parse(readFileSync(GAZETTEER, 'utf8'));
  return gazetteer;
}

// existing: the data file already on disk, if any. A lead in it was picked
// by hand and survives regeneration.
export function buildTurningData(year, key, { gazetteer: places = loadGazetteer(), existing = null } = {}) {
  const meta = TURNING_META[key];
  const instant = instantOf(year, key);
  const display = utcDisplayDate(instant);
  const longDate = utcLongDate(instant, year);
  const heroH1 = `${meta.name} ${year}`;
  const n = core.templeNumber(year, key);
  const temple = core.templePlace(TEMPLES.find((t) => t.n === n));
  const menu = claimMenu({ key, instant, recent: recentInstants(year, key), gazetteer: places, temple });
  return {
    year,
    key,
    kanji: core.SEAL_KANJI[key],
    name: meta.name,
    instantUTC: utcInstantString(instant),
    displayDate: display,
    temple: n,
    h1: heroH1,
    tagline: `${meta.tagline} — ${display}`,
    description: `On ${longDate}, ${meta.longLine}. Real-time globe, ancient sun-aligned monuments, and pilgrimages from many traditions.`,
    ogDescription: meta.ogDesc,
    twitterDescription: meta.twDesc,
    ariaLabel: `Where the sun stood at the ${meta.name.toLowerCase()} ${year}`,
    noscriptIntro: `On <strong>${longDate}</strong>, ${meta.longLine}.`,
    articleDescription: `On ${longDate}, ${meta.longLine}.`,
    schemaAboutName: meta.schemaName,
    schemaAboutDescription: meta.schemaDesc,
    dateModified: todayISO(),
    lead: existing && existing.lead ? existing.lead : { claim: menu.lead },
    claims: menu.claims
  };
}

export function buildICS(year) {
  const stamp = `${year}0101T000000Z`; // stable across regenerations

  const events = TURNING_KEYS.map((key) => {
    const meta = TURNING_META[key];
    const dt = instantOf(year, key);
    const start = icsTimestamp(dt);
    const endDate = new Date(dt.getTime() + 3600000); // +1h
    const end = icsTimestamp(endDate);
    const url = `https://pilgrimapp.org/sunpath/${year}-${key}`;
    return [
      'BEGIN:VEVENT',
      `UID:turning-${key}-${year}@pilgrimapp.org`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${meta.name} ${year} · ${core.SEAL_KANJI[key]}`,
      `DESCRIPTION:${meta.icsBody}\\n\\n${url}`,
      `URL:${url}`,
      `CATEGORIES:${meta.icsCategory}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${meta.icsAlarm}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT'
    ].join('\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pilgrim//Sun Path//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Sun Path — Four Turnings ${year}`,
    `X-WR-CALDESC:The four hinges of the year — solstices and equinoxes — at their exact UTC instants. From pilgrimapp.org/sunpath.`,
    '',
    events.join('\n\n'),
    '',
    'END:VCALENDAR',
    ''
  ].join('\n');
}

function buildEventsSkeleton(year) {
  const events = {};
  for (const key of TURNING_KEYS) {
    events[key] = { facts: [], monuments: [], pilgrimages: [] };
  }
  return { year, events };
}

async function writeIfFresh(path, content, { force, dry }) {
  const exists = existsSync(path);
  if (exists && !force) {
    return { path, skipped: true };
  }
  if (dry) return { path, dry: true, would: exists ? 'overwrite' : 'create' };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return { path, written: true };
}

async function writeAlways(path, content, { dry }) {
  if (dry) return { path, dry: true, would: existsSync(path) ? 'rewrite' : 'create' };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return { path, written: true };
}

async function updateYearsManifest(year, { dry }) {
  const path = resolve(REPO_ROOT, 'assets/sunpath/years.json');
  const raw = existsSync(path) ? await readFile(path, 'utf8') : '{"years": []}\n';
  const parsed = JSON.parse(raw);
  if (parsed.years.includes(year)) return { path, skipped: true, reason: 'year already listed' };
  parsed.years.push(year);
  parsed.years.sort((a, b) => a - b);
  const out = JSON.stringify(parsed, null, 2) + '\n';
  if (dry) return { path, dry: true, would: 'update' };
  await writeFile(path, out);
  return { path, written: true };
}

async function updateSitemap(year, { dry }) {
  const path = resolve(REPO_ROOT, 'sitemap.xml');
  if (!existsSync(path)) return { path, skipped: true, reason: 'sitemap.xml missing' };
  const xml = await readFile(path, 'utf8');

  // Skip if year's URLs already present.
  if (xml.includes(`/sunpath/${year}-spring-equinox<`)) {
    return { path, skipped: true, reason: 'year URLs already in sitemap' };
  }

  const today = todayISO();
  const entries = TURNING_KEYS.map((key) => `  <url>
    <loc>https://pilgrimapp.org/sunpath/${year}-${key}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

  const updated = xml.replace('</urlset>', `${entries}\n</urlset>`);
  if (dry) return { path, dry: true, would: 'append four URLs' };
  await writeFile(path, updated);
  return { path, written: true };
}

// Gzipped KB of a turning page and every same-origin /js/ and /css/ file it
// references, measured exactly as js/page-weight.test.js measures it. The
// page is rendered with every day of its season photographed (KTD15), so
// its strip filling in day by day never trips the drift before the turning.
export function fullSeasonPageKb(data, archive) {
  const pageRel = `sunpath/${data.year}-${data.key}/index.html`;
  const html = renderPermalink(data, archive, { fullSeason: true });
  const dir = posix.dirname(pageRel);
  let bytes = gzipSync(Buffer.from(html), { level: 9 }).length;
  // The globe's scripts arrive later, declared in data-lazy-scripts; the
  // ratchet weighs them with the page, so the pin must too.
  const refs = [];
  const re = /(?:src|href)="([^"]+)"|\sdata-lazy-scripts="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) refs.push(m[1]);
    else refs.push(...m[2].trim().split(/\s+/).filter(Boolean));
  }
  for (let ref of refs) {
    if (/^(?:https?:)?\/\//.test(ref) || /^(?:#|mailto:|data:|tel:)/.test(ref)) continue;
    ref = ref.replace(/[?#].*$/, '');
    if (!/\.(?:js|css)$/.test(ref)) continue;
    const rel = ref.charAt(0) === '/' ? ref.slice(1) : posix.normalize(posix.join(dir === '.' ? '' : dir, ref));
    bytes += gzipSync(readFileSync(resolve(REPO_ROOT, rel)), { level: 9 }).length;
  }
  return bytes / 1024;
}

// js/page-weight.test.js fails on any page it does not weigh, so a new
// year's pages get their baselines here, with the reason the file's
// convention asks for, after the last turning page already pinned.
async function pinPageWeights(year, { dry }) {
  const src = await readFile(PAGE_WEIGHT_TEST, 'utf8');
  const pageOf = (key) => `sunpath/${year}-${key}/index.html`;
  const fresh = TURNING_KEYS.filter((key) => !src.includes(`'${pageOf(key)}':`));
  if (!fresh.length) return { path: PAGE_WEIGHT_TEST, skipped: true, reason: 'pages already weighed' };
  if (dry) return { path: PAGE_WEIGHT_TEST, dry: true, would: `pin ${fresh.length} page weights in` };
  const archive = await Promise.all(TURNING_KEYS.map(async (key) =>
    JSON.parse(await readFile(resolve(REPO_ROOT, `assets/sunpath/turnings/${year}-${key}.json`), 'utf8'))));
  const lines = src.split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (/^\s*'sunpath\/\d{4}-[a-z-]+\/index\.html':/.test(l)) last = i; });
  if (last < 0) throw new Error(`no turning page in ${PAGE_WEIGHT_TEST}'s BASELINE_KB to add ${year}'s after`);
  const pinned = [
    `  // ${year}'s turning pages, added by scripts/sunpath/year.mjs on ${todayISO()}`,
    '  // at full-season weight: every day of the strip photographed (KTD15).',
    ...fresh.map((key) => `  ${`'${pageOf(key)}':`.padEnd(45)}` +
      `${fullSeasonPageKb(archive.find((t) => t.key === key), archive).toFixed(2).padStart(6)},`)
  ];
  lines.splice(last + 1, 0, ...pinned);
  await writeFile(PAGE_WEIGHT_TEST, lines.join('\n'));
  return { path: PAGE_WEIGHT_TEST, written: true };
}

function runChild(cmd, args, { dry }) {
  if (dry) return { dry: true, would: `run: ${cmd} ${args.join(' ')}` };
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
  return { ran: `${cmd} ${args.join(' ')}` };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const force = args.includes('--force');
  const yearArg = args.find((a) => /^\d{4}$/.test(a));
  if (!yearArg) {
    console.error('usage: node scripts/sunpath/year.mjs YYYY [--dry] [--force]');
    process.exit(1);
  }
  const year = Number(yearArg);
  if (year < 1000 || year > 3000) {
    console.error(`year ${year} outside Meeus accuracy band (1000–3000).`);
    process.exit(1);
  }

  console.log(`${dry ? '[dry] ' : ''}Bootstrapping Sun Path year ${year}${force ? ' (--force)' : ''}…\n`);

  for (const key of TURNING_KEYS) {
    console.log(`  ${key.padEnd(18)} ${utcInstantString(instantOf(year, key))}`);
  }
  console.log();

  const log = (r) => {
    if (r.skipped)   console.log(`  · skip   ${r.path}${r.reason ? '  (' + r.reason + ')' : ''}`);
    else if (r.dry)  console.log(`  · would  ${r.would}${r.path ? '  ' + r.path : ''}`);
    else if (r.ran)  console.log(`  · ran    ${r.ran}`);
    else if (r.path) console.log(`  · write  ${r.path}`);
  };

  // 1. Per-turning JSON data files (idempotent: refuse overwrite without --force;
  //    --force keeps a picked lead).
  console.log('Turning data files:');
  for (const key of TURNING_KEYS) {
    const path = resolve(REPO_ROOT, `assets/sunpath/turnings/${year}-${key}.json`);
    const existing = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : null;
    if (existing && !force) { log({ path, skipped: true }); continue; }
    const data = buildTurningData(year, key, { existing });
    log(await writeIfFresh(path, JSON.stringify(data, null, 2) + '\n', { force, dry }));
  }
  console.log();

  // 2. Empty events skeleton for hand-fill. Always refuses to overwrite
  //    even with --force — the events file is hand-curated (pilgrimages,
  //    monuments, facts) and re-running bootstrap should never wipe it.
  //    To replace, delete the file first.
  console.log('Events skeleton:');
  const eventsPath = resolve(REPO_ROOT, `assets/sunpath/turning-events-${year}.json`);
  log(await writeIfFresh(eventsPath, JSON.stringify(buildEventsSkeleton(year), null, 2) + '\n', { force: false, dry }));
  console.log();

  // 3. ICS file (regenerable from instants alone).
  console.log('Calendar (.ics):');
  const icsPath = resolve(REPO_ROOT, `sunpath/turnings-${year}.ics`);
  log(await writeAlways(icsPath, buildICS(year), { dry }));
  console.log();

  // 4. Permalink HTMLs (regenerable from JSON data).
  console.log('Permalink HTMLs:');
  log(runChild('node', ['scripts/sunpath/build-permalinks.mjs', String(year)], { dry }));
  console.log();

  // 5. Baselines for pages js/page-weight.test.js has never weighed.
  console.log('Page weights:');
  log(await pinPageWeights(year, { dry }));
  console.log();

  // 6. OG images (regenerable; uses headless Chrome), after the pages so
  //    each card lands under the name its page names.
  console.log('OG images:');
  log(runChild('bash', ['scripts/build-og-sunpath.sh', String(year)], { dry }));
  console.log();

  // 7. years.json + sitemap.xml (additive, idempotent).
  console.log('Manifests:');
  log(await updateYearsManifest(year, { dry }));
  log(await updateSitemap(year, { dry }));
  console.log();

  // 8. /sunpath/ archive section — pick up new year tab + panel.
  console.log('Live archive section:');
  log(runChild('node', ['scripts/sunpath/build-live-archive.mjs'], { dry }));
  console.log();

  console.log(`${dry ? '[dry] ' : ''}Done. Year ${year} ${dry ? 'would be' : 'is'} bootstrapped.`);
  if (!dry) {
    console.log(`\nNext: fill assets/sunpath/turning-events-${year}.json with`);
    console.log('       facts, monuments, pilgrimages. To pull a research prompt:');
    console.log(`         node scripts/sunpath/research-prompt.mjs ${year}`);
    console.log('       Once the events file is filled, refresh derived artifacts:');
    console.log(`         node scripts/sunpath/build-permalinks.mjs ${year}`);
    console.log(`         node scripts/sunpath/verify.mjs ${year}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
}
