#!/usr/bin/env node
// Read-only Sun Path reporter. Flags problems, never writes.
//
//   node scripts/sunpath/verify.mjs                     # all years, all turnings
//   node scripts/sunpath/verify.mjs 2026                # one year
//   node scripts/sunpath/verify.mjs 2026-spring-equinox # one turning
//
// Checks:
//   1. Schema completeness for each turning data file.
//   2. Year consistency (instantUTC year matches filename + h1 + tagline).
//   3. Meeus drift — recompute instant, compare to stored (within 5 min).
//   4. Pilgrimage schema (name, tradition, where, what, source all non-empty).
//   5. Monument cross-reference against assets/sunpath/monuments.json.
//   6. Lunisolar/lunar festivals that shift each year — flag for review.
//   7. Aged-source warning (citation with year > 25 yrs old).
//   8. URL-bearing sources HEAD-checked (only when present).
//   9. Derived artifacts in sync — build-permalinks --check + build-live-archive --check.
//
// Exits 0 in all cases; finding count printed at the end. Use the markdown
// for human triage near a turning.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { turningInstant } from './meeus.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const TURNINGS_DIR = resolve(REPO_ROOT, 'assets/sunpath/turnings');
const MONUMENTS_PATH = resolve(REPO_ROOT, 'assets/sunpath/monuments.json');

const REQUIRED_TURNING_FIELDS = [
  'year', 'key', 'kanji', 'name', 'instantUTC', 'displayDate',
  'h1', 'tagline', 'title', 'description', 'ogTitle', 'ogDescription',
  'twitterDescription', 'ariaLabel', 'noscriptIntro', 'articleDescription',
  'schemaAboutName', 'schemaAboutDescription', 'dateModified'
];

const REQUIRED_PILGRIMAGE_FIELDS = ['name', 'tradition', 'where', 'what', 'source'];

// Pilgrimages whose Gregorian date shifts each year (lunisolar / weekday-tied
// / shifting). Heuristic match on `name` substring. Flagged for manual recheck
// each year, since the *date* of the walk relative to the turning shifts even
// though the description text stays evergreen.
const LUNAR_HINTS = [
  'Holi', 'Navratri', 'Sukkot', 'Mid-Autumn', '中秋',
  'Chuseok', 'Higan', 'Passover', 'Easter', 'Diwali',
  'Ramadan', 'Eid', 'Midsommar', 'Mooncake'
];

const URL_REGEX = /(https?:\/\/[^\s)\]]+)/g;
const YEAR_IN_SOURCE = /\((\d{4})\)/;

async function loadAll() {
  const files = (await readdir(TURNINGS_DIR)).filter((f) => f.endsWith('.json'));
  const turnings = await Promise.all(files.map(async (f) => {
    const raw = await readFile(resolve(TURNINGS_DIR, f), 'utf8');
    return JSON.parse(raw);
  }));
  return turnings;
}

async function loadEvents(year) {
  const path = resolve(REPO_ROOT, `assets/sunpath/turning-events-${year}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadMonuments() {
  if (!existsSync(MONUMENTS_PATH)) return [];
  return JSON.parse(await readFile(MONUMENTS_PATH, 'utf8'));
}

function checkTurningData(t, findings) {
  const head = `${t.year}-${t.key}`;
  for (const f of REQUIRED_TURNING_FIELDS) {
    if (t[f] === undefined || t[f] === null || t[f] === '') {
      findings.push({ kind: 'error', area: head, msg: `missing field "${f}"` });
    }
  }
  if (typeof t.year === 'number' && !t.instantUTC.startsWith(String(t.year))) {
    findings.push({ kind: 'error', area: head, msg: `instantUTC year mismatch with file year ${t.year}` });
  }
  if (t.h1 && !t.h1.includes(String(t.year))) {
    findings.push({ kind: 'warn', area: head, msg: `h1 does not contain year (${t.h1})` });
  }
  if (t.tagline && t.displayDate && !t.tagline.includes(t.displayDate)) {
    findings.push({ kind: 'warn', area: head, msg: `tagline does not contain displayDate` });
  }

  // Meeus drift check — recompute, compare ms.
  try {
    const fresh = turningInstant(t.year, t.key);
    const stored = new Date(t.instantUTC);
    const diffMin = Math.abs(fresh.getTime() - stored.getTime()) / 60000;
    if (diffMin > 5) {
      findings.push({
        kind: 'error', area: head,
        msg: `Meeus instant drift ${diffMin.toFixed(1)} min vs stored — recompute (fresh: ${fresh.toISOString()})`
      });
    }
  } catch (e) {
    findings.push({ kind: 'error', area: head, msg: `Meeus compute failed: ${e.message}` });
  }
}

function checkPilgrimages(year, key, pilgrimages, findings) {
  const head = `${year}-${key}`;
  if (!Array.isArray(pilgrimages) || !pilgrimages.length) {
    findings.push({ kind: 'warn', area: head, msg: 'no pilgrimages — events skeleton not yet filled' });
    return [];
  }
  const urlsToCheck = [];
  for (const p of pilgrimages) {
    for (const f of REQUIRED_PILGRIMAGE_FIELDS) {
      if (!p[f] || !String(p[f]).trim()) {
        findings.push({ kind: 'error', area: head, msg: `pilgrimage "${p.name || '?'}" missing/empty field "${f}"` });
      }
    }
    const src = p.source || '';

    // Aged-source warning.
    const m = src.match(YEAR_IN_SOURCE);
    if (m) {
      const sy = Number(m[1]);
      const cy = new Date().getUTCFullYear();
      if (cy - sy > 25) {
        findings.push({ kind: 'note', area: head, msg: `"${p.name}" source dated ${sy} (${cy - sy} yrs) — spot-check for newer reference` });
      }
    }

    // Lunar / annual-shift hint.
    for (const hint of LUNAR_HINTS) {
      if (p.name && p.name.indexOf(hint) !== -1) {
        findings.push({ kind: 'note', area: head, msg: `"${p.name}" date shifts each Gregorian year (${hint}) — confirm dates around this turning before publishing` });
        break;
      }
    }

    // Pull URLs from source for HEAD-check later.
    const urls = src.match(URL_REGEX) || [];
    for (const u of urls) urlsToCheck.push({ pilgrimage: p.name, url: u });
  }

  // Monument cross-ref handled separately via the events block below.
  return urlsToCheck;
}

function checkEventMonuments(year, key, eventMonuments, monuments, findings) {
  const monumentIds = new Set(monuments.map((m) => m.id));
  const head = `${year}-${key}`;
  if (!Array.isArray(eventMonuments)) return;
  for (const id of eventMonuments) {
    if (!monumentIds.has(id)) {
      findings.push({ kind: 'error', area: head, msg: `unknown monument id "${id}" (not in monuments.json)` });
    }
  }
}

async function headCheck(url) {
  // Best-effort. Some sites refuse HEAD; fall back to GET range.
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (r.ok) return { ok: true, status: r.status };
    if (r.status === 405 || r.status === 403) {
      const r2 = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
      return { ok: r2.ok, status: r2.status };
    }
    return { ok: false, status: r.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function runCheck(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf8' });
  return { ok: r.status === 0, status: r.status, stderr: r.stderr || '', stdout: r.stdout || '' };
}

function formatFindings(findings) {
  const counts = { error: 0, warn: 0, note: 0 };
  for (const f of findings) counts[f.kind]++;
  const icon = { error: '✗', warn: '!', note: '·' };
  const lines = findings.map((f) => `- [${icon[f.kind]}] ${f.area} — ${f.msg}`);
  return { lines, counts };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    console.error('usage: node scripts/sunpath/verify.mjs [YYYY[-turning-key]]');
    process.exit(1);
  }
  const filter = args[0];
  if (filter && !/^\d{4}(-[a-z-]+)?$/.test(filter)) {
    console.error(`Bad filter "${filter}". Expected YYYY or YYYY-turning-key.`);
    process.exit(1);
  }

  const all = await loadAll();
  const monuments = await loadMonuments();
  const findings = [];

  let turnings = all;
  if (filter) {
    turnings = all.filter((t) => `${t.year}-${t.key}`.startsWith(filter));
    if (!turnings.length) {
      console.error(`No turning matches "${filter}".`);
      process.exit(1);
    }
  }

  const headerScope = filter || 'all years';
  console.log(`# Sun Path · verify · ${headerScope}\n`);

  // Per-turning checks.
  const eventsByYear = new Map();
  for (const t of turnings) {
    checkTurningData(t, findings);
    if (!eventsByYear.has(t.year)) {
      eventsByYear.set(t.year, await loadEvents(t.year));
    }
    const events = eventsByYear.get(t.year);
    if (!events) {
      findings.push({ kind: 'warn', area: `${t.year}-${t.key}`, msg: `turning-events-${t.year}.json missing` });
      continue;
    }
    const block = events.events && events.events[t.key];
    if (!block) {
      findings.push({ kind: 'warn', area: `${t.year}-${t.key}`, msg: `events block missing for "${t.key}"` });
      continue;
    }
    const urls = checkPilgrimages(t.year, t.key, block.pilgrimages, findings);
    checkEventMonuments(t.year, t.key, block.monuments, monuments, findings);

    if (urls.length) {
      console.log(`\n## URL HEAD-checks (${t.year}-${t.key})`);
      for (const u of urls) {
        const r = await headCheck(u.url);
        if (!r.ok) {
          findings.push({ kind: 'error', area: `${t.year}-${t.key}`, msg: `source URL not reachable (${r.status || r.error}): ${u.url} — ${u.pilgrimage}` });
          console.log(`  ✗ ${r.status || r.error}  ${u.url}`);
        } else {
          console.log(`  ✓ ${r.status}  ${u.url}`);
        }
      }
    }
  }

  // Derived artifacts (only if checking the full repo, not a slice).
  if (!filter) {
    console.log('\n## Derived artifacts');
    const r1 = runCheck('node', ['scripts/sunpath/build-permalinks.mjs', '--check']);
    console.log(`  ${r1.ok ? '✓' : '✗'} build-permalinks --check`);
    if (!r1.ok) findings.push({ kind: 'error', area: 'build', msg: 'permalink HTMLs drifted from data — run build-permalinks.mjs' });

    const r2 = runCheck('node', ['scripts/sunpath/build-live-archive.mjs', '--check']);
    console.log(`  ${r2.ok ? '✓' : '✗'} build-live-archive --check`);
    if (!r2.ok) findings.push({ kind: 'error', area: 'build', msg: 'live archive section drifted from data — run build-live-archive.mjs' });
  }

  // Findings.
  console.log('\n## Findings');
  const { lines, counts } = formatFindings(findings);
  if (!lines.length) {
    console.log('  (clean)');
  } else {
    for (const l of lines) console.log(l);
  }
  console.log(`\n${counts.error} errors · ${counts.warn} warnings · ${counts.note} notes\n`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
