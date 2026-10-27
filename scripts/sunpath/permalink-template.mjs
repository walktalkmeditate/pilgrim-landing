// Render: turning data + same-year archive → permalink HTML. The page opens
// on its plate, drawn by js/turning-leaf-core.js from the committed temples
// and sky days, so the same inputs always give the same bytes.
// HTML attributes go through htmlAttr(); HTML text through htmlText();
// JSON-LD values through jsonStr() (which provides the surrounding quotes).
// noscriptIntro is intentionally raw HTML — the data file embeds <strong>.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { htmlAttr, htmlText, jsonStr } from './escape.mjs';
import { turningInstant } from './meeus.mjs';

const require = createRequire(import.meta.url);
const core = require('../../js/turning-leaf-core.js');
const { renderClaim } = require('./turning-claims.js');

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(readFileSync(resolve(REPO_ROOT, rel), 'utf8'));
const TEMPLES = readJson('assets/sunpath/temples.json');
const SKY_DAYS = readJson('assets/sunpath/sky-days.json').days;
const CARD_TEMPLATE = readFileSync(resolve(REPO_ROOT, 'scripts/render-og-plate.html'), 'utf8');
const PLATE_CSS = readFileSync(resolve(REPO_ROOT, 'css/turning-leaf.css'), 'utf8');

const TURNING_KEYS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// KTD11: the globe's scripts, in load order. The page names them on the
// globe's section instead of loading them, and js/turning-leaf.js adds
// them as the reader nears it, so the plate paints first.
// js/page-weight.test.js still weighs them with the page.
const GLOBE_SCRIPTS = [
  '/js/sunpath-globe-math.js',
  '/js/sunpath-capability.js',
  '/js/vendor/d3-array.min.js',
  '/js/vendor/d3-geo.min.js',
  '/js/vendor/topojson-client.min.js',
  '/js/sunpath-globe-svg.js',
  '/js/sunpath.js',
  '/js/sunpath-turnings.js',
  '/js/sunpath-temporal.js'
];

export { TURNING_KEYS };

function pad2(n) { return String(n).padStart(2, '0'); }
function isoSecond(date) { return date.toISOString().replace('.000Z', 'Z'); }
// A clock reading names the minute containing the instant, as the data's
// displayDate does.
function clock(date) { return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`; }
function dayMonth(date) { return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`; }

// The turning `step` places away on the calendar, to the second like the
// data's own instants. The 2026 spring equinox's season starts at a turning
// with no data file, so this asks the calendar rather than the archive.
function neighbourInstant(year, key, step) {
  let i = TURNING_KEYS.indexOf(key) + step, y = year;
  if (i < 0) { i = 3; y--; }
  if (i > 3) { i = 0; y++; }
  return new Date(Math.round(turningInstant(y, TURNING_KEYS[i]).getTime() / 1000) * 1000);
}

function templeOf(data) {
  const temple = TEMPLES.temples.find((t) => t.n === data.temple);
  if (!temple) throw new Error(`${data.year}-${data.key}: no Temple ${data.temple} in assets/sunpath/temples.json`);
  return temple;
}

// R10: the one sentence for the headline, <title>, link titles and JSON-LD.
function renderLead(data) {
  const claim = data.claims.find((c) => c.id === data.lead.claim);
  if (!claim) throw new Error(`${data.year}-${data.key}: the lead names claim "${data.lead.claim}", which its menu does not have`);
  return renderClaim(data.lead.text || claim.template, claim.values);
}

// KTD15: a page weighed as it will be once every day of its season has a
// photo. A day without one borrows a real day's colour and time, so its
// bytes compress like a real day's would.
function fullSeasonSkyDays(prev, instant) {
  const have = new Map(SKY_DAYS.map((d) => [d[0], d]));
  return core.seasonDates(prev, instant).map((date, i) => {
    const lend = SKY_DAYS[i % SKY_DAYS.length];
    return have.get(date) || [date, lend[1], lend[2]];
  });
}

// KTD13: the seal and stamp kanji, each once, for a Noto Serif JP subset.
function kanjiOf(key, temple) {
  return [...new Set(core.SEAL_KANJI[key] + core.numberKanji(temple.n) + temple.ja)].join('');
}

function whenLine(data, instant, temple) {
  const local = new Date(instant.getTime() + core.TEMPLE_TZ_MIN * 60000);
  const nextDay = core.plateDay(instant) !== isoSecond(instant).slice(0, 10) ? ` on ${dayMonth(local)}` : '';
  return `<time datetime="${data.instantUTC}">${dayMonth(instant)} ${instant.getUTCFullYear()}, ${clock(instant)} UTC</time>` +
    ` · ${clock(local)}${nextDay} at ${htmlText(temple.name)}`;
}

function staffCaption(temple, geo) {
  const red = geo.instant && geo.instant.gx !== undefined ? ', the red one at the instant' : '';
  return `A pilgrim’s staff at ${temple.name}, Temple ${temple.n} of the Shikoku 88, one temple per turning. ` +
    `Its strokes are its shadow hour by hour through ${dayMonth(new Date(geo.date))} by the temple’s clock${red}; ` +
    'the dotted line follows the shadow’s tip.';
}

// The first screen (KTD3), to the page ⇄ player contract js/turning-leaf.js
// is built to: the season's days live only in the strip's bars.
function plateMarkup(data, lead, { fullSeason }) {
  const temple = templeOf(data);
  const instant = new Date(data.instantUTC);
  const prev = neighbourInstant(data.year, data.key, -1);
  const next = neighbourInstant(data.year, data.key, 1);
  const season = core.seasonDays(prev, instant, fullSeason ? fullSeasonSkyDays(prev, instant) : SKY_DAYS);
  const place = core.templePlace(temple);
  const date = core.plateDay(instant);
  const tl = {
    key: data.key, year: data.year, instant: data.instantUTC, prev: isoSecond(prev),
    temple: { n: temple.n, name: temple.name, ja: temple.ja, lat: temple.lat, lon: temple.lon }
  };
  const strip = core.stripSvg(season.days);
  return `    <section class="tl-plate" data-tl="${htmlAttr(JSON.stringify(tl))}">
      <div class="tl-marks">${core.sealSvg(data.key)}${core.stampSvg(temple.n, temple)}</div>
      <div class="tl-figure">${core.sceneSvg({ place, date, instant, season: season.days })}</div>
      <div class="tl-text">
        <h1 class="tl-lead">${htmlText(lead)}</h1>
        <p class="tl-when">${whenLine(data, instant, temple)}</p>
        <p class="tl-caption">${htmlText(staffCaption(temple, core.dayGeometry({ place, date, instant })))}</p>
        <p class="tl-readout" hidden></p>
        <p class="tl-quiet" role="status"></p>
        <div class="tl-controls">
          <button type="button" class="tl-play" hidden>play the day</button>
          <button type="button" class="tl-sound" aria-pressed="false" hidden>sound off</button>
          <button type="button" class="tl-here" hidden>draw it where I am</button>
          <button type="button" class="tl-back" hidden>back to the turning</button>
        </div>
      </div>
      <div class="tl-walkwrap">${core.walkMapSvg(TEMPLES.temples, temple.n, next)}</div>
${strip ? `      <div class="tl-stripwrap">${strip}<p class="tl-strip-hint" hidden>drag along the days</p></div>\n` : ''}${season.note ? `      <p class="tl-note">${htmlText(season.note)}</p>\n` : ''}    </section>`;
}

// KTD3: a card is named by a short hash of the card template and the
// page's plate, whose words are the lead and the date line, so a changed
// card gets a new URL and cached link previews fetch it again.
export function cardHash(template, plate) {
  return createHash('sha256').update(template).update('\0').update(plate).digest('hex').slice(0, 10);
}

// R2: the link card is the page's own plate, as published (never the
// full-season weighing), laid out by scripts/render-og-plate.html.
export function linkCard(data) {
  const plate = plateMarkup(data, renderLead(data), { fullSeason: false });
  const html = CARD_TEMPLATE
    .replace('{{kanji}}', () => encodeURIComponent(kanjiOf(data.key, templeOf(data))))
    .replace('{{plate-css}}', () => PLATE_CSS)
    .replace('{{plate}}', () => plate);
  // The card inlines the plate CSS, so its look names the card as surely
  // as its words do.
  return { png: `assets/og-${data.year}-${data.key}-${cardHash(CARD_TEMPLATE + '\0' + PLATE_CSS, plate)}.png`, html };
}

// options.fullSeason draws the strip and season arcs as if every day had
// its photo: the weight scripts/sunpath/year.mjs pins (KTD15).
export function renderPermalink(data, archive, { fullSeason = false } = {}) {
  const canonical = `https://pilgrimapp.org/sunpath/${data.year}-${data.key}`;
  const ogImage = `https://pilgrimapp.org/${linkCard(data).png}`;
  const sourcePath = `sunpath/${data.year}-${data.key}/index.html`;
  const lead = renderLead(data);
  const kanji = kanjiOf(data.key, templeOf(data));

  // Archive list — same year, in canonical order, with self-links pointing
  // back to each turning's permalink (catches the copy-paste bug the old
  // hand-edited pages had).
  const archiveItems = TURNING_KEYS
    .map((k) => archive.find((t) => t.key === k))
    .filter(Boolean)
    .map((t) => `          <li class="sunpath-archive-item" data-turning="${t.key}">
            <a href="/sunpath/${t.year}-${t.key}">
              <span class="sunpath-archive-kanji" aria-hidden="true">${htmlText(t.kanji)}</span>
              <span class="sunpath-archive-name">${htmlText(t.name)}</span>
              <span class="sunpath-archive-date">${htmlText(t.displayDate)}</span>
            </a>
          </li>`)
    .join('\n');

  // Deep-time drift hook — only the solstices drift; an equinox sunrise
  // keeps its bearing in every era. Each solstice features its sourced
  // monument.
  const DEEP_MONUMENT = { 'summer-solstice': 'stonehenge', 'winter-solstice': 'omori-katsuyama' };
  const deepTimeBlock = DEEP_MONUMENT[data.key] ? `
        <!-- Deep-time drift — the headline hook -->
        <div class="sunpath-deeptime" id="sunpath-deeptime" data-monument="${DEEP_MONUMENT[data.key]}">
          <button type="button" class="sunpath-deeptime-toggle" id="sunpath-deeptime-toggle" aria-expanded="false" aria-controls="sunpath-deeptime-panel">
            <span aria-hidden="true">◷</span> where the solstice sun has drifted
          </button>
          <div class="sunpath-deeptime-panel" id="sunpath-deeptime-panel" hidden>
            <p class="sunpath-deeptime-caption" id="sunpath-deeptime-caption" aria-live="polite"></p>
            <a class="sunpath-deeptime-more" href="/sunpath/#sunpath-time-machine">watch it drift across the years ↓</a>
          </div>
        </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script>
    (function () {
      var p = location.pathname;
      if (p.endsWith('.html') && p !== '/404.html') {
        history.replaceState(null, '',
          p.replace(/\\/index\\.html$/, '/').replace(/\\.html$/, '')
          + location.search + location.hash);
      }
    })();
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${htmlText(lead)}</title>
  <meta name="description" content="${htmlAttr(data.description)}">

  <link rel="canonical" href="${canonical}">

  <meta property="og:title" content="${htmlAttr(lead)}">
  <meta property="og:description" content="${htmlAttr(data.ogDescription)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="Pilgrim">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${htmlAttr(lead)}">
  <meta name="twitter:description" content="${htmlAttr(data.twitterDescription)}">
  <meta name="twitter:image" content="${ogImage}">

  <link rel="icon" href="/assets/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/pilgrim-logo.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=Lato:wght@300&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&text=${encodeURIComponent(kanji)}&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/sunpath.css">
  <link rel="stylesheet" href="/css/turning-leaf.css">

  <script defer src="https://analytics.walktalkmeditate.org/script.js" data-website-id="29086588-fb14-43db-84b6-2528fa3f47fa"></script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": ${jsonStr(lead)},
        "description": ${jsonStr(data.articleDescription)},
        "datePublished": ${jsonStr(data.instantUTC)},
        "dateModified": ${jsonStr(data.dateModified)},
        "image": ${jsonStr(ogImage)},
        "mainEntityOfPage": ${jsonStr(canonical)},
        "author": { "@id": "https://pilgrimapp.org#org" },
        "publisher": {
          "@type": "Organization",
          "@id": "https://pilgrimapp.org#org",
          "name": "Walk Talk Meditate",
          "url": "https://walktalkmeditate.org",
          "logo": { "@type": "ImageObject", "url": "https://pilgrimapp.org/assets/pilgrim-logo.png" }
        },
        "about": {
          "@type": "Thing",
          "name": ${jsonStr(data.schemaAboutName)},
          "description": ${jsonStr(data.schemaAboutDescription)}
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Pilgrim", "item": "https://pilgrimapp.org" },
          { "@type": "ListItem", "position": 2, "name": "Sun Path", "item": "https://pilgrimapp.org/sunpath" },
          { "@type": "ListItem", "position": 3, "name": ${jsonStr(data.h1)} }
        ]
      }
    ]
  }
  </script>
</head>
<body class="sunpath-body">

  <div class="moon-phase" role="button" tabindex="0" aria-label="Toggle dark mode" id="moon-toggle"></div>

  <main>

${plateMarkup(data, lead, { fullSeason })}

    <div class="sunpath-main">

      <p class="turning-echo" id="turning-echo" hidden>
        <span class="turning-echo-kanji" id="turning-echo-kanji" aria-hidden="true"></span>
        <span class="turning-echo-text" id="turning-echo-text"></span>
      </p>

      <section class="sunpath-flourish" id="sunpath-turning-flourish" hidden></section>

      <section class="sunpath-section sunpath-section--hero" aria-label="${htmlAttr(data.ariaLabel)}" data-lazy-scripts="${GLOBE_SCRIPTS.join(' ')}">
        <h2 class="sunpath-title">${htmlText(data.h1)}</h2>
        <p class="sunpath-tagline">${htmlText(data.tagline)}</p>

        <noscript>
          <div class="sunpath-noscript">
            <p>${data.noscriptIntro}</p>
            <p>The interactive globe needs JavaScript to draw itself. The other turnings of the year, and a calendar download, sit below.</p>
          </div>
        </noscript>

        <div class="sunpath-globe-stage">
          <div class="sunpath-globe-wrap" id="sunpath-globe">
            <div class="sunpath-popover" id="sunpath-monument-popover" hidden role="dialog" aria-live="polite"></div>
          </div>
        </div>

        <p class="sunpath-subsolar-caption" id="sunpath-subsolar" aria-live="polite">listening for the sun…</p>
        <p class="sunpath-globe-hint">drag to rotate · tap a gold pin to read its alignment</p>
${deepTimeBlock}
        <p class="sunpath-see-live">
          <a href="/sunpath/">See the sun move through the whole year on the live Sun Path →</a>
        </p>
      </section>

      <section class="sunpath-section sunpath-archive" aria-label="Other turnings of ${data.year}">
        <p class="sunpath-ics">
          <a href="/sunpath/turnings-${data.year}.ics" download>Add to your calendar (.ics)</a>
        </p>
        <ul class="sunpath-archive-list">
${archiveItems}
        </ul>
      </section>

      <!-- provenance: the first paragraph keeps byte-identical with sunpath/index.html -->
      <details class="sunpath-method">
        <summary>How this is computed</summary>
        <p><em>The sun's position uses the NOAA Solar Calculator's equations — declination within 0.004°, the equation of time within 4 seconds, against JPL Horizons for 2000–2050. The moon and the deep-time scrubber use Meeus, <cite>Astronomical Algorithms</cite> (2nd ed.). Ancient solar and lunar alignments are pinned from archaeological literature (Ruggles, <cite>Astronomy in Prehistoric Britain and Ireland</cite>), not derived from the model. Good for contemplation, not for navigation. The deep-time horizon uses each year's obliquity (valid roughly 3000 BC–3000 AD) for the sunrise/sunset azimuth, against a fixed alignment bearing: Stonehenge's solstitial axis (Lockyer &amp; Penrose 1901; Ruggles 1997) and the great-circle bearing from Ōmori-Katsuyama to Mt. Iwaki's summit, whose winter-solstice sunset is documented by Kaner (World Archaeology 115, 2022) and the UNESCO Jōmon listing. Azimuths assume a flat sea-level horizon and ignore atmospheric refraction (~0.5°) and disc radius, so they mark the geometric event, not the first gleam.</em></p>
        <p><em>The plate's staff walks the 88 temples of the Shikoku pilgrimage, one temple per turning, and its sun is the same NOAA series, at the temple. ${htmlText(TEMPLES.source.attribution)} The place under the sun is named from <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0) and measured to Natural Earth's coastlines (public domain). The strip's colours are the daily sky photos at <a href="https://ig.fz.ax/">ig.fz.ax</a> (CC0); a photo's time is read as the same clock hour at the temple, never as the same sun.</em></p>
      </details>

    </div>

  </main>

  <footer class="sunpath-footer">
    <div class="sunpath-footer-inner">
      <p class="sunpath-footer-attribution">
        Sun Path is part of <a href="/">Pilgrim</a> — a walking practice
      </p>
      <div class="sunpath-footer-links">
        <a href="/sunpath/">Live</a>
        <span class="sunpath-footer-sep" aria-hidden="true">·</span>
        <a href="/privacy">Privacy</a>
        <span class="sunpath-footer-sep" aria-hidden="true">·</span>
        <a href="https://github.com/walktalkmeditate/pilgrim-landing/blob/main/${sourcePath}" target="_blank" rel="noopener">Source</a>
      </div>
      <p class="sunpath-footer-license">open source · GPLv3</p>
    </div>
  </footer>

  <!-- The globe's scripts are named on its section and added by the
       player as the reader nears it. -->
  <script src="/js/moon.js"></script>
  <script src="/js/turnings.js"></script>
  <script src="/js/universe.js"></script>
  <script src="/js/main.js"></script>
  <script defer src="/js/sunpath-math.js"></script>
  <script defer src="/js/turning-leaf-core.js"></script>
  <script defer src="/js/turning-leaf.js"></script>
</body>
</html>
`;
}
