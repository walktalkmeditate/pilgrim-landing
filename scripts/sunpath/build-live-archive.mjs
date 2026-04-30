#!/usr/bin/env node
// Regenerate the year-archive section in /sunpath/index.html — the tab list
// of years and the per-year panels of four turnings + ICS link.
//
// Replaces everything between markers:
//   <!-- archive-section:start -->
//   <!-- archive-section:end -->
//
// Reads:
//   assets/sunpath/years.json                     — which years exist
//   assets/sunpath/turnings/{year}-{key}.json     — per-turning data
//
// Run from repo root:
//   node scripts/sunpath/build-live-archive.mjs

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TURNING_KEYS } from './permalink-template.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const TURNINGS_DIR = resolve(REPO_ROOT, 'assets/sunpath/turnings');
const YEARS_JSON = resolve(REPO_ROOT, 'assets/sunpath/years.json');
const INDEX_HTML = resolve(REPO_ROOT, 'sunpath/index.html');

const MARK_START = '<!-- archive-section:start -->';
const MARK_END = '<!-- archive-section:end -->';

async function loadTurningsByYear() {
  const files = (await readdir(TURNINGS_DIR)).filter((f) => f.endsWith('.json'));
  const byYear = new Map();
  for (const f of files) {
    const data = JSON.parse(await readFile(resolve(TURNINGS_DIR, f), 'utf8'));
    if (!byYear.has(data.year)) byYear.set(data.year, {});
    byYear.get(data.year)[data.key] = data;
  }
  return byYear;
}

function renderArchiveSection(years, byYear, activeYear) {
  const yearTabs = years.map((y) => `        <button type="button" class="sunpath-archive-year${y === activeYear ? ' is-active' : ''}" role="tab" aria-selected="${y === activeYear ? 'true' : 'false'}" data-year="${y}">${y}</button>`).join('\n');

  const yearPanels = years.map((y) => {
    const yearData = byYear.get(y) || {};
    const items = TURNING_KEYS.map((k) => {
      const t = yearData[k];
      if (!t) return null;
      return `          <li class="sunpath-archive-item" data-turning="${k}">
            <a href="/sunpath/${y}-${k}">
              <span class="sunpath-archive-kanji" aria-hidden="true">${t.kanji}</span>
              <span class="sunpath-archive-name">${t.name}</span>
              <span class="sunpath-archive-date">${t.displayDate}</span>
            </a>
          </li>`;
    }).filter(Boolean).join('\n');

    const hidden = y === activeYear ? '' : ' hidden';
    return `      <div class="sunpath-archive-year-panel" data-year="${y}"${hidden}>
        <p class="sunpath-ics">
          <a href="/sunpath/turnings-${y}.ics" download>Add to your calendar (.ics)</a>
        </p>
        <ul class="sunpath-archive-list">
${items}
        </ul>
      </div>`;
  }).join('\n\n');

  return `${MARK_START}
    <section class="sunpath-section sunpath-archive" aria-label="Year archive and calendar download">
      <div class="sunpath-archive-years" role="tablist" aria-label="Year">
${yearTabs}
      </div>

${yearPanels}
    </section>
    ${MARK_END}`;
}

function pickActiveYear(years) {
  if (!years.length) return null;
  const nowYear = new Date().getUTCFullYear();
  if (years.includes(nowYear)) return nowYear;
  // Prefer the next upcoming year, else the most recent past year.
  const future = years.filter((y) => y > nowYear).sort((a, b) => a - b);
  if (future.length) return future[0];
  return years[years.length - 1];
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');

  if (!existsSync(YEARS_JSON)) {
    console.error(`Missing ${YEARS_JSON}`);
    process.exit(1);
  }
  const yearsData = JSON.parse(await readFile(YEARS_JSON, 'utf8'));
  const years = (yearsData.years || []).slice().sort((a, b) => a - b);
  if (!years.length) {
    console.error('years.json has no years');
    process.exit(1);
  }

  const byYear = await loadTurningsByYear();
  const activeYear = pickActiveYear(years);
  const newSection = renderArchiveSection(years, byYear, activeYear);

  const html = await readFile(INDEX_HTML, 'utf8');
  const startIdx = html.indexOf(MARK_START);
  const endIdx = html.indexOf(MARK_END);
  if (startIdx < 0 || endIdx < 0) {
    console.error(`Markers not found in ${INDEX_HTML}`);
    process.exit(1);
  }

  const before = html.slice(0, startIdx);
  const after = html.slice(endIdx + MARK_END.length);
  const updated = before + newSection + after;

  if (check) {
    if (updated !== html) {
      console.error('Drift in /sunpath/index.html archive section.');
      process.exit(2);
    }
    console.log('Live archive section matches its generated form.');
    return;
  }

  if (updated === html) {
    console.log(`No change. Active year: ${activeYear}, years: ${years.join(', ')}.`);
    return;
  }
  await writeFile(INDEX_HTML, updated);
  console.log(`Rewrote archive section. Active year: ${activeYear}, years: ${years.join(', ')}.`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
