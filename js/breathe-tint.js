/* breathe-tint — the hour's wash, as a colour.

   Pure and DOM-free so it can be node-tested; js/breathe.js does the DOM work.
   Deliberately NOT derived from js/seasonal.js: that engine's time-of-day logic
   is unexported and returns HSL deltas meant for shifting a page's palette,
   which is exactly what this must not do. A page keeps its own colours; this
   only supplies a thin wash laid behind them.

   Alphas stay <= 0.08 so the wash can never cost a page its WCAG AA text
   contrast (js/breathe-tint.test.js enforces that ceiling). */

(function (root) {
  'use strict';

  var TINTS = {
    dawn:  { name: 'dawn',  color: '#e8b87a', alpha: 0.06 },
    day:   { name: 'day',   color: '#f2e4c8', alpha: 0.04 },
    dusk:  { name: 'dusk',  color: '#d8956a', alpha: 0.06 },
    night: { name: 'night', color: '#2c3a5a', alpha: 0.07 }
  };

  function hourTint(date) {
    var d = (date instanceof Date && !isNaN(date.getTime())) ? date : null;
    if (!d) { return TINTS.day; }

    var h = d.getHours();
    if (h >= 5 && h < 8)   { return TINTS.dawn; }
    if (h >= 8 && h < 17)  { return TINTS.day; }
    if (h >= 17 && h < 21) { return TINTS.dusk; }
    return TINTS.night;
  }

  var api = { hourTint: hourTint, TINTS: TINTS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.BreatheTint = api; }
})(typeof window !== 'undefined' ? window : globalThis);
