#!/usr/bin/env node
// Bootstrap an entire Sun Path year in one command.
//
//   node scripts/sunpath/year.mjs 2027
//   node scripts/sunpath/year.mjs 2027 --dry      # preview, no writes
//   node scripts/sunpath/year.mjs 2027 --force    # overwrite existing files
//
// What it does, in order:
//   1. Compute Meeus instants for the four turnings of YEAR.
//   2. Write assets/sunpath/turnings/YEAR-{key}.json (data files, idempotent).
//   3. Write assets/sunpath/turning-events-YEAR.json (empty events skeleton).
//   4. Write sunpath/turnings-YEAR.ics (regenerable).
//   5. Render sunpath/YEAR-{key}/index.html via build-permalinks.mjs.
//   6. Render assets/og-YEAR-{key}.png via build-og-sunpath.sh.
//   7. Append YEAR to assets/sunpath/years.json.
//   8. Append four <url> entries to sitemap.xml.
//
// Idempotent: refuses to overwrite existing data files unless --force.
// HTML, ICS, OG images, sitemap, years.json are always regenerated.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { turningsForYear } from './meeus.mjs';
import { TURNING_KEYS } from './permalink-template.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TURNING_META = {
  'spring-equinox': {
    kanji: '春分', name: 'Spring Equinox',
    schemaName: 'March equinox',
    schemaDesc: 'The astronomical moment when the sun crosses the celestial equator northward and day equals night across the Earth.',
    titleSuffix: 'where day equals night, exactly',
    tagline: 'where day equalled night',
    longLine: 'the sun crossed the equator and day equalled night across the Earth',
    icsBody: 'The sun crosses the equator. Day equals night across the Earth.\\n\\nFrom here, northern days grow until summer solstice.',
    icsAlarm: 'Spring Equinox tomorrow — day will equal night',
    icsCategory: 'Equinox,Astronomy',
    ogDesc: 'The exact moment day equalled night, with monuments and pilgrimages tied to the turning.',
    twDesc: 'The exact moment day equalled night across the Earth.'
  },
  'summer-solstice': {
    kanji: '夏至', name: 'Summer Solstice',
    schemaName: 'June solstice',
    schemaDesc: 'The astronomical moment when the sun reaches its furthest declination north, the longest day in the northern hemisphere.',
    titleSuffix: 'the longest light',
    tagline: 'the longest light',
    longLine: 'the sun stood at its furthest north and the northern day reached its longest',
    icsBody: 'The sun stands at its furthest north. The longest northern day.\\n\\nFrom here, northern days shorten until winter solstice.',
    icsAlarm: 'Summer Solstice tomorrow — the longest light',
    icsCategory: 'Solstice,Astronomy',
    ogDesc: 'The longest day of the northern year, with sun-aligned monuments and pilgrimages from many traditions.',
    twDesc: 'The longest day of the northern year.'
  },
  'autumn-equinox': {
    kanji: '秋分', name: 'Autumn Equinox',
    schemaName: 'September equinox',
    schemaDesc: 'The astronomical moment when the sun crosses the celestial equator southward and northern days begin to shorten.',
    titleSuffix: 'the southern crossing',
    tagline: 'the southern crossing',
    longLine: 'the sun crossed the equator again and northern days began to shorten',
    icsBody: 'The sun crosses the equator again. Day equals night.\\n\\nFrom here, northern nights grow longer until winter solstice.',
    icsAlarm: 'Autumn Equinox tomorrow — northern days begin to shorten',
    icsCategory: 'Equinox,Astronomy',
    ogDesc: 'The southern crossing — when northern days begin to shorten and the harvest pilgrimages walk.',
    twDesc: 'The southern crossing — northern days begin to shorten.'
  },
  'winter-solstice': {
    kanji: '冬至', name: 'Winter Solstice',
    schemaName: 'December solstice',
    schemaDesc: 'The astronomical moment when the sun reaches its furthest declination south, the longest night in the northern hemisphere.',
    titleSuffix: 'the longest dark',
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

// Truncate to the start of the containing UTC minute. The existing 2026
// data files use this convention (e.g. Meeus says 14:46:45 → display 14:46).
function floorMinute(date) {
  return new Date(Math.floor(date.getTime() / 60000) * 60000);
}

function utcInstantString(date) {
  const d = floorMinute(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`;
}

function icsTimestamp(date) {
  const d = floorMinute(date);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

function todayISO() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function buildTurningData(year, key, instant) {
  const meta = TURNING_META[key];
  const display = utcDisplayDate(instant);
  const longDate = utcLongDate(instant, year);
  const heroH1 = `${meta.name} ${year}`;
  return {
    year,
    key,
    kanji: meta.kanji,
    name: meta.name,
    instantUTC: utcInstantString(instant),
    displayDate: display,
    h1: heroH1,
    tagline: `${meta.tagline} — ${display}`,
    title: `${meta.name} ${year} — ${meta.titleSuffix}`,
    description: `On ${longDate}, ${meta.longLine}. Real-time globe, ancient sun-aligned monuments, and pilgrimages from many traditions.`,
    ogTitle: `${meta.name} ${year} · Sun Path`,
    ogDescription: meta.ogDesc,
    twitterDescription: meta.twDesc,
    ariaLabel: `Where the sun stood at the ${meta.name.toLowerCase()} ${year}`,
    noscriptIntro: `On <strong>${longDate}</strong>, ${meta.longLine}.`,
    articleDescription: `On ${longDate}, ${meta.longLine}.`,
    schemaAboutName: meta.schemaName,
    schemaAboutDescription: meta.schemaDesc,
    dateModified: todayISO()
  };
}

function buildICS(year, instants) {
  const stamp = `${year}0101T000000Z`; // stable across regenerations

  const events = TURNING_KEYS.map((key) => {
    const meta = TURNING_META[key];
    const dt = instants[key];
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
      `SUMMARY:${meta.name} ${year} · ${meta.kanji}`,
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

  const instants = turningsForYear(year);
  for (const key of TURNING_KEYS) {
    console.log(`  ${key.padEnd(18)} ${utcDisplayDate(instants[key])}`);
  }
  console.log();

  const log = (r) => {
    if (r.skipped)   console.log(`  · skip   ${r.path}${r.reason ? '  (' + r.reason + ')' : ''}`);
    else if (r.dry)  console.log(`  · would  ${r.would}${r.path ? '  ' + r.path : ''}`);
    else if (r.ran)  console.log(`  · ran    ${r.ran}`);
    else if (r.path) console.log(`  · write  ${r.path}`);
  };

  // 1. Per-turning JSON data files (idempotent: refuse overwrite without --force).
  console.log('Turning data files:');
  for (const key of TURNING_KEYS) {
    const data = buildTurningData(year, key, instants[key]);
    const path = resolve(REPO_ROOT, `assets/sunpath/turnings/${year}-${key}.json`);
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
  log(await writeAlways(icsPath, buildICS(year, instants), { dry }));
  console.log();

  // 4. Permalink HTMLs (regenerable from JSON data).
  console.log('Permalink HTMLs:');
  log(runChild('node', ['scripts/sunpath/build-permalinks.mjs', String(year)], { dry }));
  console.log();

  // 5. OG images (regenerable; uses headless Chrome).
  console.log('OG images:');
  log(runChild('bash', ['scripts/build-og-sunpath.sh', String(year)], { dry }));
  console.log();

  // 6. years.json + sitemap.xml (additive, idempotent).
  console.log('Manifests:');
  log(await updateYearsManifest(year, { dry }));
  log(await updateSitemap(year, { dry }));
  console.log();

  // 7. /sunpath/ archive section — pick up new year tab + panel.
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

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
