/* =============================================
   The turning pages' plate — the shipped markup, held to the core

   Run via:  node scripts/sunpath/plate-markup.test.js

   Static checks on the twelve generated pages, never on the template:
   - the plate's scene, strip, seal, stamp and walk map are the core's own
     output, byte for byte, drawn from the committed temples and sky days;
   - the headline, <title>, link titles and JSON-LD headline are the one
     rendered lead (R10);
   - the date line names the instant in UTC and at the temple (R4);
   - AE6 and AE9: the seasons the photos missed say so;
   - without scripts the plate and its words are there, the controls are
     not, and the stylesheet already knows the reader's theme (KTD8);
   - the phone crop is the core's PHONE_CROP, and the sources are credited
     (R18).

   Expected values come from the core, the claim module, the committed
   data and the calendar, never from scripts/sunpath/permalink-template.mjs.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const C = require('../../js/turning-leaf-core.js');
const { renderClaim } = require('./turning-claims.js');

const ROOT = path.resolve(__dirname, '..', '..');
const KEYS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];
const YEARS = [2026, 2027, 2028];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + (actual === expected ? '' : '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')'));
}
function count(hay, needle) { return hay.split(needle).length - 1; }
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function textOf(html) { return unescapeHtml(html.replace(/<[^>]+>/g, '')).replace(/[ \t\r\n\f]+/g, ' ').trim(); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function iso(d) { return d.toISOString().replace('.000Z', 'Z'); }

const temples = readJson('assets/sunpath/temples.json');
const skyDays = readJson('assets/sunpath/sky-days.json').days;
const hub = read('sunpath/index.html');
const css = (fs.existsSync(path.join(ROOT, 'css/turning-leaf.css')) ? read('css/turning-leaf.css') : '').replace(/\/\*[\s\S]*?\*\//g, '');

async function main() {
  const meeus = await import(pathToFileURL(path.join(ROOT, 'scripts/sunpath/meeus.mjs')).href);

  // A neighbouring turning's instant: its data file where one exists,
  // otherwise the calendar, rounded to the second as every instant is.
  function neighbour(year, key, step) {
    let i = KEYS.indexOf(key) + step, y = year;
    if (i < 0) { i = 3; y--; }
    if (i > 3) { i = 0; y++; }
    const rel = 'assets/sunpath/turnings/' + y + '-' + KEYS[i] + '.json';
    if (fs.existsSync(path.join(ROOT, rel))) return new Date(readJson(rel).instantUTC);
    return new Date(Math.round(meeus.turningInstant(y, KEYS[i]).getTime() / 1000) * 1000);
  }

  const pages = [];
  YEARS.forEach(function (year) {
    KEYS.forEach(function (key) {
      const data = readJson('assets/sunpath/turnings/' + year + '-' + key + '.json');
      const html = read('sunpath/' + year + '-' + key + '/index.html');
      const temple = temples.temples[data.temple - 1];
      const instant = new Date(data.instantUTC);
      const prev = neighbour(year, key, -1), next = neighbour(year, key, 1);
      const season = C.seasonDays(prev, instant, skyDays);
      const claim = data.claims.find(function (c) { return c.id === data.lead.claim; });
      pages.push({
        year: year, key: key, head: year + ' ' + key, data: data, html: html, temple: temple,
        instant: instant, prev: prev, next: next, season: season,
        lead: renderClaim(data.lead.text || claim.template, claim.values)
      });
    });
  });

  console.log('\n=== each page carries the core\'s plate, verbatim ===\n');

  pages.forEach(function (p) {
    eq(count(p.html, '<section class="tl-plate"'), 1, p.head + ': one plate');
    eq(p.temple.n, p.data.temple, p.head + ': its temple is Temple ' + p.data.temple + ' of temples.json');
    const place = C.templePlace(p.temple);
    const scene = C.sceneSvg({ place: place, date: C.plateDay(p.instant), instant: p.instant, season: p.season.days });
    ok(p.html.indexOf(scene) !== -1, p.head + ': the scene is the core\'s, byte for byte');
    ok(p.html.indexOf(C.sealSvg(p.key)) !== -1, p.head + ': the seal is the core\'s');
    ok(p.html.indexOf(C.stampSvg(p.temple.n, p.temple)) !== -1, p.head + ': the number stamp is the core\'s (' + C.numberKanji(p.temple.n) + ' ' + p.temple.ja + ')');
    ok(p.html.indexOf(C.walkMapSvg(temples.temples, p.temple.n, p.next)) !== -1,
      p.head + ': the walk map is the core\'s, next turning on ' + iso(p.next).slice(0, 10));
    const strip = C.stripSvg(p.season.days);
    if (strip) ok(p.html.indexOf(strip) !== -1, p.head + ': the strip is the core\'s, ' + p.season.days.length + ' days');
    else ok(p.html.indexOf('tl-stripwrap') === -1 && p.html.indexOf('class="tl-strip"') === -1, p.head + ': no strip, as the core draws none');
    const note = /<p class="tl-note">([^<]*)<\/p>/.exec(p.html);
    eq(note ? unescapeHtml(note[1]) : null, p.season.note, p.head + ': the season note is the core\'s');

    const m = /<section class="tl-plate" data-tl="([^"]*)"/.exec(p.html);
    let tl = null;
    try { tl = m && JSON.parse(unescapeHtml(m[1])); } catch (e) { tl = null; }
    ok(!!tl && tl.key === p.key && tl.year === p.year && tl.instant === p.data.instantUTC && tl.prev === iso(p.prev) &&
      tl.temple && tl.temple.n === p.temple.n && tl.temple.name === p.temple.name && tl.temple.ja === p.temple.ja &&
      tl.temple.lat === p.temple.lat && tl.temple.lon === p.temple.lon,
      p.head + ': data-tl carries key, year, instant, prev ' + iso(p.prev) + ' and the temple  (' + (m ? unescapeHtml(m[1]).slice(0, 80) + '…' : 'missing') + ')');

    const order = ['class="tl-marks"', 'class="tl-figure"', 'class="tl-text"', 'class="tl-walkwrap"']
      .map(function (s) { return p.html.indexOf(s); });
    ok(order.every(function (at, i) { return at > 0 && (i === 0 || at > order[i - 1]); }),
      p.head + ': marks, figure, text and walk map in the contract\'s order');
  });

  console.log('\n=== one sentence heads the page, the card and the search result (R10) ===\n');

  pages.forEach(function (p) {
    const h1s = p.html.match(/<h1[\s>][\s\S]*?<\/h1>/g) || [];
    eq(h1s.length, 1, p.head + ': exactly one h1');
    const h1 = /<h1 class="tl-lead">([\s\S]*?)<\/h1>/.exec(p.html);
    const title = /<title>([\s\S]*?)<\/title>/.exec(p.html);
    const og = /<meta property="og:title" content="([^"]*)">/.exec(p.html);
    const tw = /<meta name="twitter:title" content="([^"]*)">/.exec(p.html);
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(p.html);
    let headline = null;
    try { headline = JSON.parse(ld[1])['@graph'].find(function (n) { return n['@type'] === 'Article'; }).headline; } catch (e) { headline = null; }
    eq(h1 && textOf(h1[1]), p.lead, p.head + ': the h1 is the rendered lead');
    eq(title && unescapeHtml(title[1]), p.lead, p.head + ': <title> is the lead');
    eq(og && unescapeHtml(og[1]), p.lead, p.head + ': og:title is the lead');
    eq(tw && unescapeHtml(tw[1]), p.lead, p.head + ': twitter:title is the lead');
    eq(headline, p.lead, p.head + ': the JSON-LD headline is the lead');
  });

  console.log('\n=== the date line: the date, the UTC minute and the temple\'s clock (R4) ===\n');

  pages.forEach(function (p) {
    const when = /<p class="tl-when">([\s\S]*?)<\/p>/.exec(p.html);
    const text = when ? textOf(when[1]) : '';
    const u = p.instant;
    const local = new Date(u.getTime() + 9 * 3600000);
    const utcDate = u.getUTCDate() + ' ' + MONTHS[u.getUTCMonth()] + ' ' + u.getUTCFullYear();
    const utcTime = pad(u.getUTCHours()) + ':' + pad(u.getUTCMinutes()) + ' UTC';
    const localTime = pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes());
    const localDay = local.getUTCDate() + ' ' + MONTHS[local.getUTCMonth()];
    ok(text.indexOf(utcDate) !== -1 && text.indexOf(utcTime) !== -1, p.head + ': names ' + utcDate + ', ' + utcTime + '  (' + text + ')');
    ok(text.indexOf(localTime + (local.getUTCDate() === u.getUTCDate() ? '' : ' on ' + localDay) + ' at ' + p.temple.name) !== -1,
      p.head + ': and ' + localTime + ' at ' + p.temple.name + (local.getUTCDate() === u.getUTCDate() ? '' : ', on ' + localDay));
    ok(new RegExp('<time datetime="' + p.data.instantUTC + '">').test(p.html), p.head + ': the instant is machine-readable to the second');
  });
  const w26 = pages.find(function (p) { return p.head === '2026 winter-solstice'; });
  ok(textOf((/<p class="tl-when">([\s\S]*?)<\/p>/.exec(w26.html) || ['', ''])[1]).indexOf('05:50 on 22 December at Dainichi-ji') !== -1,
    'AE1: 21 Dec 2026 is 05:50 the next morning at Dainichi-ji');
  ok(/<p class="tl-caption">[^<]*Dainichi-ji, Temple 4 of the Shikoku 88/.test(w26.html),
    'the staff caption names the temple and its number');

  console.log('\n=== AE6, AE9: the seasons the photos missed ===\n');

  const spring26 = pages.find(function (p) { return p.head === '2026 spring-equinox'; });
  ok(spring26.html.indexOf('tl-stripwrap') === -1, 'AE6: the spring 2026 page has no strip');
  ok(/<p class="tl-note">The daily sky photos began on 4 May 2026[^<]*<\/p>/.test(spring26.html),
    'AE6: and a line says the daily sky photos began on 4 May 2026');

  const summer26 = pages.find(function (p) { return p.head === '2026 summer-solstice'; });
  const bars = (/<svg class="tl-strip"[\s\S]*?<\/svg>/.exec(summer26.html) || [''])[0].match(/<rect [^>]*>/g) || [];
  // 20 March to 3 May 2026 inclusive: 12 + 30 + 3 days.
  const blankBefore = bars.slice(0, 45);
  ok(bars.length === 94, 'AE9: summer 2026 has one bar for each day, 20 March to 21 June  (' + bars.length + ')');
  ok(blankBefore.every(function (b) { return /class="future before"/.test(b) && !/fill=/.test(b); }),
    'AE9: the 45 bars before 4 May 2026 are blank');
  const photographed = bars.slice(45).filter(function (b) { return /fill="#[0-9a-f]{6}"/i.test(b); });
  const shot = skyDays.filter(function (d) { return d[0] >= '2026-05-04' && d[0] <= '2026-06-21'; }).length;
  ok(photographed.length === shot && shot > 0, 'AE9: and every photographed day from 4 May carries its colour  (' + photographed.length + ' of ' + shot + ')');
  eq(count(summer26.html, '<p class="tl-note">'), 1, 'AE9: under one note');
  ok(/<p class="tl-note">The daily sky photos began on 4 May 2026\.<\/p>/.test(summer26.html), 'AE9: which says the daily photos began that day');

  console.log('\n=== without scripts: the plate and its words, no controls ===\n');

  pages.forEach(function (p) {
    const plate = p.html.slice(p.html.indexOf('<section class="tl-plate"'), p.html.indexOf('</section>', p.html.indexOf('<section class="tl-plate"')));
    const controls = ['tl-play', 'tl-sound', 'tl-here', 'tl-back'].map(function (c) {
      return new RegExp('<button type="button" class="' + c + '"[^>]* hidden>').test(plate);
    });
    ok(controls.every(Boolean) && /<p class="tl-readout" hidden><\/p>/.test(plate) &&
      (plate.indexOf('tl-strip-hint') === -1 || /<p class="tl-strip-hint" hidden>/.test(plate)) &&
      /<p class="tl-quiet" role="status"><\/p>/.test(plate),
      p.head + ': every control, the readout and the strip hint wait hidden for the player');
    ok(plate.indexOf('<svg class="tl-scene"') !== -1 && plate.indexOf('<h1 class="tl-lead">') !== -1 && plate.indexOf('<p class="tl-caption">') !== -1,
      p.head + ': the scene, the lead and the caption are in the static page');
    ok(p.html.indexOf('<section class="tl-plate"') < p.html.indexOf('id="sunpath-globe"') &&
      p.html.indexOf('id="sunpath-globe"') < p.html.indexOf('class="sunpath-archive-list"'),
      p.head + ': the plate comes first, then the globe, then the archive');
    eq(p.html.indexOf('id="sunpath-deeptime"') !== -1, /solstice/.test(p.key), p.head + ': the deep-time block stays on the solstices only');
  });

  function block(selector) {
    const at = css.indexOf(selector + ' {');
    return at === -1 ? null : css.slice(at, css.indexOf('}', at));
  }
  function tokens(b) {
    const out = {};
    (b || '').replace(/(--tl-[\w-]+):\s*([^;]+);/g, function (_, k, v) { out[k] = v.trim(); });
    return out;
  }
  const light = tokens(block('.tl-plate'));
  const darkAttr = tokens(block('[data-theme="dark"] .tl-plate'));
  const media = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \.tl-plate \{([^}]*)\}/.exec(css);
  const darkMedia = tokens(media && media[1]);
  ok(Object.keys(light).length >= 6 && Object.keys(light).every(function (k) { return !!darkAttr[k]; }),
    'the plate\'s light tokens each have a dark value  (' + Object.keys(light).join(', ') + ')');
  ok(JSON.stringify(darkMedia) === JSON.stringify(darkAttr),
    'KTD8: a dark system paints the dark plate before js/main.js sets [data-theme], with the same values');

  console.log('\n=== the phone crop is the core\'s PHONE_CROP ===\n');

  const crop = /\.tl-figure \.tl-scene \{([^}]*)\}/g;
  let phone = null, mm;
  while ((mm = crop.exec(css)) !== null) if (/margin-left/.test(mm[1])) phone = mm[1];
  const num = function (re) { const r = re.exec(phone || ''); return r ? r.slice(1).map(Number) : null; };
  const width = num(/width:\s*calc\(100% \* (\d+) \/ (\d+)\)/);
  const left = num(/margin-left:\s*calc\(-100% \* (\d+) \/ (\d+)\)/);
  const aspect = /\.tl-figure \{[^}]*aspect-ratio:\s*(\d+) \/ (\d+)/.exec(css);
  ok(!!width && width[0] === C.SCENE.w && width[1] === C.PHONE_CROP.w, 'the cropped scene is ' + C.SCENE.w + '/' + C.PHONE_CROP.w + ' of the screen wide  (' + width + ')');
  ok(!!left && left[0] === C.PHONE_CROP.x && left[1] === C.PHONE_CROP.w, 'and starts ' + C.PHONE_CROP.x + ' units in  (' + left + ')');
  ok(!!aspect && +aspect[1] === C.PHONE_CROP.w && +aspect[2] === C.PHONE_CROP.h && C.PHONE_CROP.y === 0 && C.PHONE_CROP.h === C.SCENE.h,
    'in a window ' + C.PHONE_CROP.w + ' by ' + C.PHONE_CROP.h + ', the scene\'s full height  (' + (aspect && aspect.slice(1).join('/')) + ')');

  console.log('\n=== head: the plate\'s files, fonts and scripts (KTD8, KTD13) ===\n');

  pages.forEach(function (p) {
    eq(count(p.html, '<link rel="stylesheet" href="/css/turning-leaf.css">'), 1, p.head + ': links css/turning-leaf.css');
    const math = p.html.indexOf('<script src="/js/sunpath-math.js"></script>');
    const core = p.html.indexOf('<script defer src="/js/turning-leaf-core.js"></script>');
    const player = p.html.indexOf('<script defer src="/js/turning-leaf.js"></script>');
    ok(math !== -1 && core > math && player > core && count(p.html, 'src="/js/sunpath-math.js"') === 1,
      p.head + ': sunpath-math.js once, then the core and the player, deferred');
    const kanji = Array.from(new Set(Array.from(C.SEAL_KANJI[p.key] + C.numberKanji(p.temple.n) + p.temple.ja))).sort().join('');
    const font = /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Serif\+JP:wght@600&text=([^&"]+)&display=swap" rel="stylesheet">/.exec(p.html);
    const got = font ? Array.from(decodeURIComponent(font[1])).sort().join('') : null;
    eq(got, kanji, p.head + ': Noto Serif JP is subset to the seal and stamp\'s kanji');
  });
  ok(hub.indexOf('turning-leaf') === -1, 'KTD8: the hub loads none of the plate\'s files');
  ok(/font-family:\s*"Noto Serif JP", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Yu Mincho", "YuMincho", "MS Mincho", serif/.test(css),
    'KTD13: the kanji fall back to the site\'s Mincho stack');

  console.log('\n=== sources (R18) ===\n');

  const hubMethod = /<details class="sunpath-method">\s*<summary>How this is computed<\/summary>\s*(<p>[\s\S]*?<\/p>)/.exec(hub)[1];
  pages.forEach(function (p) {
    ok(p.html.indexOf(hubMethod) !== -1, p.head + ': the hub\'s sun-model sentence, verbatim');
    ok(p.html.indexOf('Spencer') === -1, p.head + ': and not the old Spencer one');
    const sources = textOf((/<details class="sunpath-method">([\s\S]*?)<\/details>/.exec(p.html) || ['', ''])[1]);
    ok(sources.indexOf(temples.source.attribution) !== -1, p.head + ': the temples\' ODbL attribution');
    ok(/GeoNames \(CC BY 4\.0\)/.test(sources) && /Natural Earth/.test(sources), p.head + ': GeoNames (CC BY 4.0) and Natural Earth for the place names');
    ok(/ig\.fz\.ax/.test(sources) && /CC0/.test(sources), p.head + ': and the daily sky photos, ig.fz.ax, CC0');
  });

  console.log('\n=== Summary ===\n');
  console.log('passed: ' + passed);
  console.log('failed: ' + failed);
  if (failed > 0) {
    console.log('\nfailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('\nall green');
}

main().catch(function (e) { console.error(e); process.exit(1); });
