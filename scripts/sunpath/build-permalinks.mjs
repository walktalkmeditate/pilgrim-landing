#!/usr/bin/env node
// Read every assets/sunpath/turnings/*.json, group by year, render the four
// permalink HTMLs per year via permalink-template.mjs.
//
// Run from repo root:
//   node scripts/sunpath/build-permalinks.mjs
//   node scripts/sunpath/build-permalinks.mjs 2027        # only this year
//   node scripts/sunpath/build-permalinks.mjs --check     # diff vs disk; non-zero on drift
//
// --check (run by the pre-commit hook) also fails when a turning in the next
// 24 months has no page, or when a lead carries a number typed outside its
// slots. The first reads the clock on purpose: with no CI, from 20 Mar 2027,
// when the 2029 spring equinox enters the window, every commit is told to
// run scripts/sunpath/year.mjs 2029 until it has been.

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { renderPermalink, TURNING_KEYS } from './permalink-template.mjs';
import { turningInstant } from './meeus.mjs';

const require = createRequire(import.meta.url);
const { hasDigitsOutsideSlots } = require('./turning-claims.js');

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const TURNINGS_DIR = resolve(REPO_ROOT, 'assets/sunpath/turnings');

async function loadAllTurnings() {
  const files = (await readdir(TURNINGS_DIR)).filter((f) => f.endsWith('.json'));
  const turnings = await Promise.all(
    files.map(async (f) => {
      const raw = await readFile(resolve(TURNINGS_DIR, f), 'utf8');
      return JSON.parse(raw);
    })
  );
  return turnings;
}

function groupByYear(turnings) {
  const byYear = new Map();
  for (const t of turnings) {
    if (!byYear.has(t.year)) byYear.set(t.year, []);
    byYear.get(t.year).push(t);
  }
  return byYear;
}

function validateYearGroup(year, group) {
  const got = new Set(group.map((t) => t.key));
  const missing = TURNING_KEYS.filter((k) => !got.has(k));
  if (missing.length) {
    throw new Error(`Year ${year} missing turning data: ${missing.join(', ')}`);
  }
}

// published: a Set of "YYYY-key". Returns the turnings due within 24
// months of `now` that have no page (R19).
export function missingAhead(now, published) {
  const horizon = new Date(now);
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 2);
  const missing = [];
  for (let year = now.getUTCFullYear(); year <= horizon.getUTCFullYear(); year++) {
    for (const key of TURNING_KEYS) {
      const at = turningInstant(year, key);
      if (at >= now && at <= horizon && !published.has(`${year}-${key}`)) missing.push(`${year}-${key}`);
    }
  }
  return missing;
}

// AE12: every number in a lead comes from the claim menu's slots.
export function leadProblems(turnings) {
  const problems = [];
  for (const t of turnings) {
    const head = `${t.year}-${t.key}`;
    const claim = t.lead && (t.claims || []).find((c) => c.id === t.lead.claim);
    if (!claim) {
      problems.push(`${head}: the lead names claim "${t.lead && t.lead.claim}", which its menu does not have`);
      continue;
    }
    const template = t.lead.text || claim.template;
    if (hasDigitsOutsideSlots(template)) {
      problems.push(`${head}: the lead "${template}" has a number typed outside its slots; use the claim's {slots}`);
    }
  }
  return problems;
}

function publishedPages(now) {
  const out = new Set();
  for (let year = now.getUTCFullYear(); year <= now.getUTCFullYear() + 2; year++) {
    for (const key of TURNING_KEYS) {
      if (existsSync(resolve(REPO_ROOT, `sunpath/${year}-${key}/index.html`))) out.add(`${year}-${key}`);
    }
  }
  return out;
}

async function buildYear(year, group, { check, onlyYear }) {
  if (onlyYear && year !== onlyYear) return [];
  validateYearGroup(year, group);
  const archive = group; // template extracts what it needs

  const results = [];
  for (const data of group) {
    const html = renderPermalink(data, archive);
    const outDir = resolve(REPO_ROOT, `sunpath/${data.year}-${data.key}`);
    const outFile = resolve(outDir, 'index.html');

    if (check) {
      const existing = existsSync(outFile) ? await readFile(outFile, 'utf8') : '';
      const drift = existing !== html;
      results.push({ outFile, drift });
      continue;
    }

    if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
    await writeFile(outFile, html);
    results.push({ outFile, written: true });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const yearArg = args.find((a) => /^\d{4}$/.test(a));
  const onlyYear = yearArg ? Number(yearArg) : null;

  const turnings = await loadAllTurnings();
  if (!turnings.length) {
    console.error('No turning data files found in', TURNINGS_DIR);
    process.exit(1);
  }

  const byYear = groupByYear(turnings);
  if (onlyYear !== null && !byYear.has(onlyYear)) {
    console.error(`No turning data found for year ${onlyYear} in ${TURNINGS_DIR}.`);
    process.exit(1);
  }
  const allResults = [];
  for (const [year, group] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
    const r = await buildYear(year, group, { check, onlyYear });
    allResults.push(...r);
  }

  if (check) {
    const drifted = allResults.filter((r) => r.drift);
    if (drifted.length) {
      console.error('Drift detected in:');
      for (const r of drifted) console.error('  ', r.outFile);
      process.exit(2);
    }
    const leads = leadProblems(turnings);
    if (leads.length) {
      console.error('Leads that do not come from their claim menu:');
      for (const l of leads) console.error('  ', l);
      process.exit(2);
    }
    const now = new Date();
    const missing = missingAhead(now, publishedPages(now));
    if (missing.length) {
      console.error('Turnings within the next 24 months with no published page:');
      for (const m of missing) console.error('  ', m);
      const years = [...new Set(missing.map((m) => m.slice(0, 4)))];
      console.error(`Run: ${years.map((y) => `node scripts/sunpath/year.mjs ${y}`).join(' && ')}`);
      process.exit(2);
    }
    console.log('All permalink HTMLs match their generated form, every lead is from its menu, and pages reach two years ahead.');
    return;
  }

  for (const r of allResults) console.log('  →', r.outFile);
  console.log(`Wrote ${allResults.length} permalink HTML(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.stack || e.message);
    process.exit(1);
  });
}
