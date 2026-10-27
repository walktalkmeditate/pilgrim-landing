/* =============================================
   The turning pages' link cards (KTD3, R2, R10, AE12)

   Run via:  node scripts/sunpath/og-cards.test.js

   - each page's og:image, twitter:image and JSON-LD image name one card,
     a 1200×630 PNG that is on disk;
   - the card's name is a short hash of the card template and the page's
     plate, whose words are the lead and the date line, so rewording the
     lead renames the card and a cached preview refreshes;
   - the card page carries the page's plate byte for byte, so its words
     are the page's h1;
   - build-permalinks.mjs --check names a page whose card is missing.

   Expected values come from the committed pages, the card template on
   disk and the claim module, never from scripts/sunpath/permalink-template.mjs.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { renderClaim } = require('./turning-claims.js');

const ROOT = path.resolve(__dirname, '..', '..');
const KEYS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];
const YEARS = [2026, 2027, 2028];
const CARD_TEMPLATE = 'scripts/render-og-plate.html';

let passed = 0, failed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + (actual === expected ? '' : '  (' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected) + ')'));
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readJson(rel) { return JSON.parse(read(rel)); }
function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function pngSize(rel) {
  const head = fs.readFileSync(path.join(ROOT, rel)).subarray(16, 24);
  return head.readUInt32BE(0) + '×' + head.readUInt32BE(4);
}

async function main() {
  const template = await import(pathToFileURL(path.join(ROOT, 'scripts/sunpath/permalink-template.mjs')).href);
  const permalinks = await import(pathToFileURL(path.join(ROOT, 'scripts/sunpath/build-permalinks.mjs')).href);
  const cardTemplate = fs.existsSync(path.join(ROOT, CARD_TEMPLATE)) ? read(CARD_TEMPLATE) : '';
  const plateCss = read('css/turning-leaf.css');

  const pages = [];
  YEARS.forEach(function (year) {
    KEYS.forEach(function (key) {
      const data = readJson('assets/sunpath/turnings/' + year + '-' + key + '.json');
      const html = read('sunpath/' + year + '-' + key + '/index.html');
      const claim = data.claims.find(function (c) { return c.id === data.lead.claim; });
      const plate = / {4}<section class="tl-plate"[\s\S]*?<\/section>/.exec(html);
      pages.push({
        head: year + '-' + key, year: year, key: key, data: data, html: html,
        lead: renderClaim(data.lead.text || claim.template, claim.values),
        plate: plate ? plate[0] : ''
      });
    });
  });

  console.log('\n=== each page names one card, and it is on disk ===\n');

  ok(cardTemplate.length > 0, CARD_TEMPLATE + ' exists');
  pages.forEach(function (p) {
    const og = /<meta property="og:image" content="https:\/\/pilgrimapp\.org\/([^"]+)">/.exec(p.html);
    const tw = /<meta name="twitter:image" content="https:\/\/pilgrimapp\.org\/([^"]+)">/.exec(p.html);
    const ld = /"image": "https:\/\/pilgrimapp\.org\/([^"]+)"/.exec(p.html);
    p.card = og ? og[1] : '';
    const named = new RegExp('^assets/og-' + p.year + '-' + p.key + '-([0-9a-f]{10})\\.png$').exec(p.card);
    ok(!!named, p.head + ': og:image is assets/og-' + p.head + '-{hash}.png  (' + p.card + ')');
    eq(tw && tw[1], p.card, p.head + ': twitter:image names the same card');
    eq(ld && ld[1], p.card, p.head + ': the JSON-LD image names the same card');
    const onDisk = !!p.card && fs.existsSync(path.join(ROOT, p.card));
    ok(onDisk, p.head + ': its card is on disk');
    if (onDisk) eq(pngSize(p.card), '1200×630', p.head + ': and it is 1200×630');
    ok(!fs.existsSync(path.join(ROOT, 'assets/og-' + p.head + '.png')), p.head + ': the unhashed card is gone');
    const others = fs.readdirSync(path.join(ROOT, 'assets')).filter(function (f) {
      return f.startsWith('og-' + p.head + '-') && 'assets/' + f !== p.card;
    });
    eq(others.join(', '), '', p.head + ': no superseded card is left beside it');
  });

  console.log('\n=== the name is a hash of the card template and the page\'s plate (KTD3) ===\n');

  pages.forEach(function (p) {
    // The card inlines css/turning-leaf.css, so a change to the plate's
    // look renames the card as surely as a change to its words.
    const hash = crypto.createHash('sha256').update(cardTemplate).update('\0').update(plateCss).update('\0').update(p.plate).digest('hex').slice(0, 10);
    eq(p.card, 'assets/og-' + p.head + '-' + hash + '.png', p.head + ': the card is named by sha256(template, plate css, plate)');
  });

  const winter = pages.find(function (p) { return p.head === '2026-winter-solstice'; });
  const claim = winter.data.claims.find(function (c) { return c.id === winter.data.lead.claim; });
  const reworded = JSON.parse(JSON.stringify(winter.data));
  reworded.lead.text = 'Where the sun turns: ' + (winter.data.lead.text || claim.template);
  eq(template.linkCard(winter.data).png, winter.card, 'the build names the 2026 winter card as its page does');
  const renamed = template.linkCard(reworded).png;
  ok(renamed !== winter.card && /^assets\/og-2026-winter-solstice-[0-9a-f]{10}\.png$/.test(renamed),
    'AE12: rewording only the lead renames the card  (' + renamed + ')');
  ok(template.cardHash(cardTemplate + ' ', winter.plate) !== template.cardHash(cardTemplate, winter.plate),
    'a change to the card template alone renames the card');
  const when = /<p class="tl-when">[\s\S]*?<\/p>/.exec(winter.plate)[0];
  ok(template.cardHash(cardTemplate, winter.plate.replace(when, when.replace('UTC', 'UT'))) !== template.cardHash(cardTemplate, winter.plate),
    'a change to the date line alone renames the card');

  console.log('\n=== the card page carries the page\'s plate and lead, verbatim (R2, R10) ===\n');

  pages.forEach(function (p) {
    const card = template.linkCard(p.data);
    ok(p.plate.length > 0 && card.html.includes(p.plate), p.head + ': the card embeds the page\'s plate byte for byte');
    const h1 = /<h1 class="tl-lead">([^<]*)<\/h1>/.exec(card.html);
    eq(h1 && unescapeHtml(h1[1]), p.lead, p.head + ': the card\'s words are the rendered lead');
    ok(/<svg class="tl-scene"/.test(card.html) && /<svg class="tl-seal"/.test(card.html) && /<svg class="tl-stamp"/.test(card.html) && /<svg class="tl-walk"/.test(card.html),
      p.head + ': and its scene, seal, stamp and walk map');
  });

  console.log('\n=== --check names a page whose card is missing ===\n');

  const ghost = '<meta property="og:image" content="https://pilgrimapp.org/assets/og-1999-spring-equinox-0000000000.png">';
  const missing = permalinks.missingCards([{ outFile: 'sunpath/1999-spring-equinox/index.html', html: ghost }]);
  eq(missing.length, 1, 'a page naming a card that is not on disk is reported');
  eq(missing[0] && missing[0].card, 'assets/og-1999-spring-equinox-0000000000.png', 'and the report names the missing file');
  eq(permalinks.missingCards(pages.map(function (p) { return { outFile: p.head, html: p.html }; })).length, 0,
    'the twelve committed pages name cards that are all on disk');

  // The pre-commit hook runs --check against the working tree, but the site
  // serves what is committed: a fresh card left out of the commit would pass
  // on disk and 404 in every link preview. So the hook also asks the index.
  const winterPage = pages.find(function (p) { return p.head === '2026-winter-solstice'; });
  const one = [{ outFile: winterPage.head, html: winterPage.html }];
  const unstaged = permalinks.missingCards(one, { staged: new Set() });
  eq(unstaged.length, 1, 'a card on disk but not in the commit is reported');
  ok(unstaged[0] && /not staged/.test(unstaged[0].why), '...as not staged  (' + (unstaged[0] && unstaged[0].why) + ')');
  eq(permalinks.missingCards(one, { staged: new Set([winterPage.card]) }).length, 0, 'once staged, it passes');
  eq(permalinks.stagedFiles('assets/') instanceof Set && permalinks.stagedFiles('assets/').has(winterPage.card), true,
    'the index is read from git, and holds the committed 2026 winter card');

  console.log('\n=== Summary ===\n');
  console.log('passed: ' + passed);
  console.log('failed: ' + failed);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
  }
  console.log(failed ? '' : '\nall green');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error(e.stack || e.message);
  process.exit(1);
});
