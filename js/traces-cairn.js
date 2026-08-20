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

  // --- The cairn ---
  //
  // In-memory only. This is the demo; the footer cairn in js/main.js is
  // the record, and it is deliberately untouched.

  var stones = 0;
  var tierName = 'faint';

  var els = {};

  function artFor(name) {
    return 'assets/traces/cairn-' + name + '.svg';
  }

  function renderCounter() {
    els.counter.textContent = stones + (stones === 1 ? ' stone · ' : ' stones · ') + tierName;
    els.counter.classList.add('is-visible');
  }

  // Swaps the two layers so the outgoing art stays beneath the incoming
  // one. Task 6 animates the reveal; here it is an instant swap.
  function showTier(name) {
    els.under.src = els.over.src;
    els.over.src = artFor(name);
  }

  function placeStone() {
    stones++;
    var next = G.tierNameFor(stones);
    var tierChanged = next !== tierName;
    tierName = next;

    if (tierChanged) showTier(tierName);
    renderCounter();

    return {
      stones: stones,
      tier: tierName,
      energy: currentEnergy(),
      tierChanged: tierChanged
    };
  }

  function initCairn() {
    els.stack = document.getElementById('cairn-stack');
    els.under = document.getElementById('cairn-under');
    els.over = document.getElementById('cairn-over');
    els.counter = document.getElementById('cairn-counter');
    if (!els.stack || !els.under || !els.over || !els.counter) return;

    els.stack.addEventListener('click', function () { placeStone(); });
  }

  function init() {
    var aura = document.getElementById('wisp-aura');
    if (aura) startBreathing(aura);
    initCairn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
