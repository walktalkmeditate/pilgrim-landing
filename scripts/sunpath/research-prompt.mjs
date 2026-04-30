#!/usr/bin/env node
// Emit a research prompt for a Sun Path year — paste into Claude (or any
// research-capable LLM) to fill in `assets/sunpath/turning-events-YYYY.json`
// with sourced facts, monuments, pilgrimages.
//
//   node scripts/sunpath/research-prompt.mjs 2028
//   node scripts/sunpath/research-prompt.mjs 2028 > /tmp/research-prompt.md
//
// The prompt embeds the year's Meeus-computed turning instants, points the
// LLM at the existing 2026 baseline + monuments.json, and lays out source
// standards + cultural-sensitivity rules. The LLM writes the JSON directly
// to disk; we don't translate its output here.
//
// Re-run any year you want to refresh — the prompt is deterministic from
// the year argument.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { turningsForYear } from './meeus.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function isoMinute(d) {
  const r = new Date(Math.floor(d.getTime() / 60000) * 60000);
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}T${pad(r.getUTCHours())}:${pad(r.getUTCMinutes())}:00Z`;
}

function main() {
  const year = Number(process.argv[2]);
  if (!year || !/^\d{4}$/.test(String(year))) {
    console.error('usage: node scripts/sunpath/research-prompt.mjs YYYY');
    process.exit(1);
  }

  const t = turningsForYear(year);
  const baselinePath = resolve(REPO_ROOT, 'assets/sunpath/turning-events-2026.json');
  const monumentsPath = resolve(REPO_ROOT, 'assets/sunpath/monuments.json');
  const targetPath = resolve(REPO_ROOT, `assets/sunpath/turning-events-${year}.json`);

  process.stdout.write(`# Sun Path ${year} — research prompt

Goal: populate ${targetPath} with verified facts, monument alignments, and pilgrimage entries — real annual practices walked by communities around the world. The page being populated is https://pilgrimapp.org/sunpath/${year}-{turning}.

## The ${year} turnings (Meeus-computed UTC instants)

- Spring Equinox: ${isoMinute(t['spring-equinox'])}
- Summer Solstice: ${isoMinute(t['summer-solstice'])}
- Autumn Equinox: ${isoMinute(t['autumn-equinox'])}
- Winter Solstice: ${isoMinute(t['winter-solstice'])}

## Baseline + monument index

Read these for structure, quality bar, and the closed list of monument IDs:

- ${baselinePath}
- ${monumentsPath}

The schema per turning has three arrays: \`facts\` (label/value pairs), \`monuments\` (string IDs that must exist in monuments.json), and \`pilgrimages\` (each with name, tradition, where, what, source). Match this shape exactly.

## Task

Write \`${targetPath}\` with content for all four turnings. Be conservative — each pilgrimage entry must be a real, sourced annual practice that involves walking, processing, or pilgrimage. Fabrication or weakly-attested entries are worse than fewer entries.

For each turning:

1. **Pilgrimages** — Most 2026 entries are annual practices that recur in ${year} with little change. For each, decide:
   - Carry it forward (most cases — descriptions are evergreen)
   - Update \`what\` if a ${year}-specific date is worth noting (lunisolar shifts: Holi ${year} falls on..., Mid-Autumn ${year} falls on..., Sukkot ${year} begins..., etc.)
   - Replace the source if a stronger / more recent / more authoritative one is available

   Add one or two new pilgrimages per turning if you can find well-sourced annual walking practices that are missing. Cultural-breadth gaps to consider:
   - African (Egyptian Coptic, Ethiopian Orthodox Genna processions)
   - Indigenous American (note: many Pueblo solstice ceremonies are explicitly closed to outsiders — respect that and omit)
   - Polynesian / Māori (Matariki rises in southern winter and is now a NZ public holiday)
   - Slavic (Koliada / Yule walks for winter solstice; Kupala for summer)
   - Caribbean traditions

   Do NOT add an entry without a verifiable source. Better seven solid entries than ten with weak sourcing.

2. **Facts** — Mostly carry forward from 2026 (day lengths at given latitudes don't shift year-to-year at the turnings since they depend on declination, which at solstice/equinox is essentially constant). Only update if a fact is genuinely ${year}-specific (e.g. local sunrise time at Brú na Bóinne for Newgrange chamber illumination on the actual ${year} solstice date).

3. **Monuments** — Same set applies each year (alignments drift sub-degree per century). Carry forward unless a research finding moves a monument from one turning to another.

## Cultural-sensitivity rule

Do not list practices that are explicitly closed to outsiders. When in doubt, omit.

## Source standards

Acceptable: UNESCO ICH listings, peer-reviewed academic books/journals, official government heritage bodies (English Heritage, Heritage Ireland/OPW, INAH, etc.), well-established encyclopedias for general framing.

Unacceptable as primary source: blog posts, listicles, AI-generated content, low-traffic news sites.

Wikipedia is fine for orientation but the cited source should be the underlying scholarly work.

## Output

Write the JSON file directly. Match the 2026 file's exact JSON shape:

\`\`\`json
{
  "year": ${year},
  "events": {
    "spring-equinox":  { "facts": [...], "monuments": [...], "pilgrimages": [...] },
    "summer-solstice": { ... },
    "autumn-equinox":  { ... },
    "winter-solstice": { ... }
  }
}
\`\`\`

Two-space indentation. No comments inside the JSON. After writing, return a short summary:
- How many pilgrimages per turning; which are new vs. carried from 2026
- Which ${year}-specific dates were locked in (lunisolar shifts)
- Anything investigated and rejected, with reason

After the file is written, run:

    node scripts/sunpath/verify.mjs ${year}
    node scripts/sunpath/build-permalinks.mjs ${year}

to confirm schema completeness and refresh the permalink HTMLs.
`);
}

main();
