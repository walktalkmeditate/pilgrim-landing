// Pure render: turning data + same-year archive → permalink HTML.
// HTML attributes go through htmlAttr(); HTML text through htmlText();
// JSON-LD values through jsonStr() (which provides the surrounding quotes).
// noscriptIntro is intentionally raw HTML — the data file embeds <strong>.

import { htmlAttr, htmlText, jsonStr } from './escape.mjs';

const TURNING_KEYS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];

export { TURNING_KEYS };

export function renderPermalink(data, archive) {
  const canonical = `https://pilgrimapp.org/sunpath/${data.year}-${data.key}`;
  const ogImage = `https://pilgrimapp.org/assets/og-${data.year}-${data.key}.png`;
  const sourcePath = `sunpath/${data.year}-${data.key}/index.html`;

  // Archive list — same year, in canonical order, with self-links pointing
  // back to each turning's permalink (catches the copy-paste bug the old
  // hand-edited pages had).
  const archiveItems = TURNING_KEYS
    .map((k) => archive.find((t) => t.key === k))
    .filter(Boolean)
    .map((t) => `        <li class="sunpath-archive-item" data-turning="${t.key}">
          <a href="/sunpath/${t.year}-${t.key}">
            <span class="sunpath-archive-kanji" aria-hidden="true">${htmlText(t.kanji)}</span>
            <span class="sunpath-archive-name">${htmlText(t.name)}</span>
            <span class="sunpath-archive-date">${htmlText(t.displayDate)}</span>
          </a>
        </li>`)
    .join('\n');

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

  <title>${htmlText(data.title)}</title>
  <meta name="description" content="${htmlAttr(data.description)}">

  <link rel="canonical" href="${canonical}">

  <meta property="og:title" content="${htmlAttr(data.ogTitle)}">
  <meta property="og:description" content="${htmlAttr(data.ogDescription)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="Pilgrim">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${htmlAttr(data.ogTitle)}">
  <meta name="twitter:description" content="${htmlAttr(data.twitterDescription)}">
  <meta name="twitter:image" content="${ogImage}">

  <link rel="icon" href="/assets/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/pilgrim-logo.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=Lato:wght@300&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/sunpath.css">

  <script defer src="https://analytics.walktalkmeditate.org/script.js" data-website-id="29086588-fb14-43db-84b6-2528fa3f47fa"></script>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": ${jsonStr(data.title)},
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

  <script>
    window.__sunpathForce = {
      turning: '${data.key}',
      date: '${data.instantUTC}'
    };
  </script>
</head>
<body class="sunpath-body">

  <div class="moon-phase" role="button" tabindex="0" aria-label="Toggle dark mode" id="moon-toggle"></div>

  <main class="sunpath-main">

    <p class="turning-echo" id="turning-echo" hidden>
      <span class="turning-echo-kanji" id="turning-echo-kanji" aria-hidden="true"></span>
      <span class="turning-echo-text" id="turning-echo-text"></span>
    </p>

    <section class="sunpath-flourish" id="sunpath-turning-flourish" hidden></section>

    <section class="sunpath-section sunpath-section--hero" aria-label="${htmlAttr(data.ariaLabel)}">
      <h1 class="sunpath-title">${htmlText(data.h1)}</h1>
      <p class="sunpath-tagline">${htmlText(data.tagline)}</p>

      <noscript>
        <div class="sunpath-noscript">
          <p>${data.noscriptIntro}</p>
          <p>The interactive globe needs JavaScript to draw itself. The other turnings of the year, and a calendar download, sit below.</p>
        </div>
      </noscript>

      <div class="sunpath-globe-wrap" id="sunpath-globe">
        <div class="sunpath-popover" id="sunpath-monument-popover" hidden role="dialog" aria-live="polite"></div>
      </div>

      <p class="sunpath-subsolar-caption" id="sunpath-subsolar" aria-live="polite">listening for the sun…</p>
      <p class="sunpath-globe-hint">drag to rotate · tap a gold pin to read its alignment</p>
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

    <!-- provenance: keep byte-identical with sunpath/index.html -->
    <details class="sunpath-method">
      <summary>How this is computed</summary>
      <p><em>The sun's position uses the NOAA Solar Calculator (Spencer 1971 truncated series) — declination accurate to about 0.05°, the equation of time to about half a minute. The moon and the deep-time scrubber use Meeus, <cite>Astronomical Algorithms</cite> (2nd ed.). Ancient solar and lunar alignments are pinned from archaeological literature (Ruggles, <cite>Astronomy in Prehistoric Britain and Ireland</cite>), not derived from the model. Good for contemplation, not for navigation.</em></p>
    </details>

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

  <script src="/js/moon.js"></script>
  <script src="/js/turnings.js"></script>
  <script src="/js/universe.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/sunpath-math.js"></script>
  <script src="/js/vendor/d3-array.min.js"></script>
  <script src="/js/vendor/d3-geo.min.js"></script>
  <script src="/js/vendor/topojson-client.min.js"></script>
  <script src="/js/sunpath.js"></script>
  <script src="/js/sunpath-turnings.js"></script>
  <script src="/js/sunpath-temporal.js"></script>
</body>
</html>
`;
}
