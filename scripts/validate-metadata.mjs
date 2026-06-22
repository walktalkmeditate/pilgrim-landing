#!/usr/bin/env node
// Validate structured data and social metadata across every HTML page.
//
//   node scripts/validate-metadata.mjs
//
// Exits non-zero on any failure. Guards the regressions the JSON-LD entity
// graph is prone to: invalid JSON, dangling @id references, organization-name
// drift, and missing canonical / Open Graph tags on indexable pages.

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

const LDJSON_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'css', 'js', '.claude', '.kaijutsu', 'docs']);

const REQUIRED_META = [
  ['rel=canonical', /<link\s+rel="canonical"/i],
  ['og:title', /property="og:title"/i],
  ['og:site_name', /property="og:site_name"/i],
  ['og:image', /property="og:image"/i],
];

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await htmlFiles(full)));
    } else if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function isReferenceOnly(node) {
  const keys = Object.keys(node);
  return keys.length === 1 && keys[0] === '@id';
}

function isEntityDefinition(node) {
  return node['@id'] && (node['@type'] || node.name);
}

function collectIds(node, defined, referenced, definitions, file) {
  if (Array.isArray(node)) {
    for (const item of node) collectIds(item, defined, referenced, definitions, file);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (isReferenceOnly(node)) {
    referenced.push(node['@id']);
  } else if (isEntityDefinition(node)) {
    defined.add(node['@id']);
    if (node.name) definitions.push({ id: node['@id'], name: node.name, file });
  }
  for (const value of Object.values(node)) {
    collectIds(value, defined, referenced, definitions, file);
  }
}

async function main() {
  const files = (await htmlFiles(REPO_ROOT)).sort();
  const errors = [];
  const definitions = [];
  let blockCount = 0;

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const html = await readFile(file, 'utf8');

    const blocks = [];
    let match;
    LDJSON_RE.lastIndex = 0;
    while ((match = LDJSON_RE.exec(html))) {
      blockCount += 1;
      try {
        blocks.push(JSON.parse(match[1]));
      } catch (e) {
        errors.push(`${rel}: invalid JSON-LD — ${e.message}`);
      }
    }

    const defined = new Set();
    const referenced = [];
    for (const block of blocks) collectIds(block, defined, referenced, definitions, rel);
    for (const ref of referenced) {
      if (!defined.has(ref)) errors.push(`${rel}: @id "${ref}" is referenced but defined on no node in this page`);
    }

    const noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
    const is404 = rel.endsWith('404.html');
    if (!noindex && !is404) {
      for (const [label, re] of REQUIRED_META) {
        if (!re.test(html)) errors.push(`${rel}: missing ${label}`);
      }
    }
  }

  const namesById = new Map();
  for (const { id, name } of definitions) {
    if (!namesById.has(id)) namesById.set(id, new Set());
    namesById.get(id).add(name);
  }
  for (const [id, names] of namesById) {
    if (names.size > 1) {
      errors.push(`@id "${id}" has conflicting names across pages: ${[...names].map((n) => `"${n}"`).join(', ')}`);
    }
  }

  if (errors.length) {
    console.error(`✗ metadata validation failed (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
    for (const e of errors) console.error('  -', e);
    process.exit(1);
  }
  console.log(`✓ metadata OK — ${files.length} pages, ${blockCount} JSON-LD blocks, no issues.`);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
