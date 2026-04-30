#!/usr/bin/env node
// Read every assets/sunpath/turnings/*.json, group by year, render the four
// permalink HTMLs per year via permalink-template.mjs.
//
// Run from repo root:
//   node scripts/sunpath/build-permalinks.mjs
//   node scripts/sunpath/build-permalinks.mjs 2027        # only this year
//   node scripts/sunpath/build-permalinks.mjs --check     # diff vs disk; non-zero on drift

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPermalink, TURNING_KEYS } from './permalink-template.mjs';

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
    console.log('All permalink HTMLs match their generated form.');
    return;
  }

  for (const r of allResults) console.log('  →', r.outFile);
  console.log(`Wrote ${allResults.length} permalink HTML(s).`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
