/* =============================================
   Sun Path — extras

   - Live walker count (from walk.pilgrimapp.org/api/now)

   Quiet single line under the subsolar caption. Bails silently
   if the DOM target is missing or the data source is unavailable.
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

  function setupWalkerCount() {
    var el = document.getElementById('sunpath-walkers');
    if (!el) return;
    function tick() {
      fetch('https://walk.pilgrimapp.org/api/now', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d) { el.hidden = true; return; }
          var n = d.estimated_active || 0;
          var streak = d.streak_days || 0;
          clearChildren(el);
          if (n > 0) {
            el.appendChild(document.createTextNode('about '));
            el.appendChild(htmlEl('strong', 'sunpath-walkers-count', String(n)));
            el.appendChild(document.createTextNode(' walking with the collective right now'));
            el.hidden = false;
          } else if (streak > 0) {
            el.appendChild(document.createTextNode('the path is quiet right now · '));
            el.appendChild(htmlEl('strong', 'sunpath-walkers-count', String(streak)));
            el.appendChild(document.createTextNode(streak === 1 ? ' day unbroken' : ' days unbroken'));
            el.hidden = false;
          } else {
            el.hidden = true;
          }
        })
        .catch(function () { el.hidden = true; });
    }
    tick();
    setInterval(tick, 60000);
  }

  function init() {
    setupWalkerCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
