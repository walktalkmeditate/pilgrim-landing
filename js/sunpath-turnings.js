/* =============================================
   Sun Path — turning-day flourishes (Stage C)

   On the four turning days only, surfaces an extra section near
   the top of the page with:
   - facts specific to today's turning
   - hand-curated pilgrimages happening now
   - a faint glow on monuments aligned to today's turning

   Hidden every other day. Test override: append ?turning=spring-equinox
   (or summer-solstice / autumn-equinox / winter-solstice) to the URL.

   Loads after sunpath.js + sunpath-tools.js. Reuses window.SunPathMath
   and window.Turnings.
   ============================================= */

(function () {
  'use strict';

  function htmlEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function clearChildren(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // --- Detect today's turning ---------------------------------------------

  var VALID_TURNINGS = ['spring-equinox', 'summer-solstice', 'autumn-equinox', 'winter-solstice'];

  function detectTurning() {
    // Permalink pages set window.__sunpathForce.turning before script runs.
    if (window.__sunpathForce && VALID_TURNINGS.indexOf(window.__sunpathForce.turning) !== -1) {
      return window.__sunpathForce.turning;
    }
    // URL override for testing.
    var url = new URL(window.location.href);
    var override = url.searchParams.get('turning');
    if (VALID_TURNINGS.indexOf(override) !== -1) return override;
    if (!window.Turnings) return null;
    var name = window.Turnings.getTurningOnDate(new Date());
    if (!name) return null;
    // Normalize to kebab-case used in events JSON.
    return name.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  function turningKanji(turning) {
    return {
      'spring-equinox':  '春分',
      'summer-solstice': '夏至',
      'autumn-equinox':  '秋分',
      'winter-solstice': '冬至'
    }[turning] || '';
  }

  function turningHeading(turning) {
    return {
      'spring-equinox':  'Today is the spring equinox',
      'summer-solstice': 'Today is the summer solstice',
      'autumn-equinox':  'Today is the autumn equinox',
      'winter-solstice': 'Today is the winter solstice'
    }[turning] || '';
  }

  // --- Render ---------------------------------------------------------------

  function init() {
    var turning = detectTurning();
    if (!turning) return;

    var container = document.getElementById('sunpath-turning-flourish');
    if (!container) return;

    container.dataset.turning = turning;
    container.hidden = false;

    fetch('/assets/sunpath/turning-events.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.events || !data.events[turning]) return;
        renderFlourish(container, turning, data.events[turning]);
        glowMonuments(data.events[turning].monuments || []);
      })
      .catch(function () { /* graceful skip */ });
  }

  function renderFlourish(container, turning, event) {
    clearChildren(container);

    var inner = htmlEl('div', 'sunpath-flourish-inner');

    var heading = htmlEl('h2', 'sunpath-flourish-heading');
    heading.appendChild(htmlEl('span', 'sunpath-flourish-kanji', turningKanji(turning)));
    heading.appendChild(htmlEl('span', 'sunpath-flourish-title', turningHeading(turning)));
    inner.appendChild(heading);

    if (event.facts && event.facts.length) {
      var factsList = htmlEl('ul', 'sunpath-flourish-facts');
      event.facts.forEach(function (f) {
        var li = htmlEl('li', 'sunpath-flourish-fact');
        li.appendChild(htmlEl('span', 'sunpath-flourish-fact-label', f.label));
        li.appendChild(htmlEl('span', 'sunpath-flourish-fact-value', f.value));
        factsList.appendChild(li);
      });
      inner.appendChild(factsList);
    }

    // Quiet Pilgrim app callout — only shown on turning days.
    var appNote = htmlEl('p', 'sunpath-flourish-app-note');
    appNote.appendChild(document.createTextNode('Walking today? '));
    var appLink = document.createElement('a');
    appLink.href = 'https://apps.apple.com/app/pilgrim-mindful-walking/id6760921056';
    appLink.target = '_blank';
    appLink.rel = 'noopener';
    appLink.textContent = 'Pilgrim';
    appNote.appendChild(appLink);
    appNote.appendChild(document.createTextNode(
      ' marks each of the four turnings — a quiet visual touch on the walk summary, the route map, and the goshuin seal. iOS · free · open source.'
    ));
    inner.appendChild(appNote);

    if (event.pilgrimages && event.pilgrimages.length) {
      var pilHeading = htmlEl('h3', 'sunpath-flourish-subheading', 'Pilgrimages happening today');
      inner.appendChild(pilHeading);
      var pilList = htmlEl('ul', 'sunpath-flourish-pilgrimages');
      event.pilgrimages.forEach(function (p) {
        var li = htmlEl('li', 'sunpath-flourish-pilgrimage');
        li.appendChild(htmlEl('span', 'sunpath-flourish-pilgrimage-name', p.name));
        li.appendChild(htmlEl('span', 'sunpath-flourish-pilgrimage-where', p.where));
        li.appendChild(htmlEl('p', 'sunpath-flourish-pilgrimage-what', p.what));
        if (p.source) {
          li.appendChild(htmlEl('p', 'sunpath-flourish-pilgrimage-source', '— ' + p.source));
        }
        pilList.appendChild(li);
      });
      inner.appendChild(pilList);
    }

    container.appendChild(inner);
  }

  // --- Monument glow on turning days --------------------------------------
  // Adds a class to matching monument pins so they shimmer with today's
  // turning palette. Re-applies after the globe re-renders pins.

  var glowingIds = [];

  function glowMonuments(ids) {
    glowingIds = ids || [];
    apply();
    // Re-apply when globe redraws (terminator update + drag rotate).
    var observer = new MutationObserver(apply);
    var layer = document.getElementById('sunpath-monuments-layer');
    if (layer) {
      observer.observe(layer, { childList: true });
    }
  }

  function apply() {
    if (!glowingIds.length) return;
    var pins = document.querySelectorAll('.sunpath-monument-pin');
    pins.forEach(function (pin) {
      var id = pin.getAttribute('data-monument-id');
      if (glowingIds.indexOf(id) !== -1) {
        pin.classList.add('sunpath-monument-glowing');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
