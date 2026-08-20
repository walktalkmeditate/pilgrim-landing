/* The traces section's two glyphs — the wisp and the cairn.
 *
 * Loaded by index.html only. js/main.js is loaded by eight pages,
 * including two that sit under page-weight budgets, so this lives apart.
 *
 * The two glyphs share one clock: a stone placed on the cairn takes the
 * colour of whichever energy the wisp is breathing at that moment.
 */

(function () {
  'use strict';

  var G = window.TracesGlyphs;
  if (!G) return;

  var BREATH_MS = 5500;

  var breathIndex = 0;

  function currentEnergy() {
    return G.energyAt(breathIndex);
  }

  function paintAura(aura) {
    aura.style.setProperty('--wisp-energy', currentEnergy().hex);
  }

  function startBreathing(aura) {
    paintAura(aura);
    setInterval(function () {
      breathIndex++;
      paintAura(aura);
    }, BREATH_MS);
  }

  function init() {
    var aura = document.getElementById('wisp-aura');
    if (aura) startBreathing(aura);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
