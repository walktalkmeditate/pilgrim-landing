/* =============================================
   Sun Path — year-archive tab switcher

   Loads only on /sunpath/ (the live page). When more than one year is
   listed in the archive, swaps which year's panel is visible on tap.
   With a single year, this script is a no-op — the static markup
   already shows the right thing.
   ============================================= */

(function () {
  'use strict';

  function init() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.sunpath-archive-year'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.sunpath-archive-year-panel'));
    if (tabs.length < 2) return;

    function activate(year) {
      tabs.forEach(function (t) {
        var active = t.dataset.year === year;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach(function (p) { p.hidden = p.dataset.year !== year; });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { activate(tab.dataset.year); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
