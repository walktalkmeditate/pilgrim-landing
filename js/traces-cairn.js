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

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  var GLOWING_TIERS = ['sacred', 'eternal'];

  // Swaps the layers so the outgoing art holds beneath the incoming one,
  // then wipes the new tier up from the base.
  function showTier(name) {
    els.under.src = els.over.src;
    els.over.src = artFor(name);

    els.stack.classList.toggle('is-glowing', GLOWING_TIERS.indexOf(name) !== -1);

    if (reduceMotion) return;

    els.over.classList.remove('is-wiping');
    void els.over.offsetWidth;
    els.over.classList.add('is-wiping');
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

  function spawn(className, styles, lifeMs) {
    var el = document.createElement('span');
    el.className = className;
    for (var k in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, k)) el.style.setProperty(k, styles[k]);
    }
    els.stack.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, lifeMs);
  }

  function animatePlacement(result) {
    if (reduceMotion) return;

    // Land on top of the pile as it is NOW, not at a fixed height.
    spawn('falling-stone', {
      '--stone-energy': result.energy.hex,
      '--stone-land': (G.tierFor(result.stones).artTop * 100).toFixed(1) + '%'
    }, 300);

    // The settle has to restart on every click, and a class that is
    // already present will not replay its animation. Strip it, force a
    // reflow, put it back.
    els.stack.classList.remove('is-settling');
    void els.stack.offsetWidth;
    els.stack.classList.add('is-settling');

    var count = result.tierChanged ? 5 : 3;
    for (var i = 0; i < count; i++) {
      var spread = (i - (count - 1) / 2) * 7;
      spawn('dust', { '--dx': spread.toFixed(1) + 'px' }, 420);
    }
  }

  function initCairn() {
    els.stack = document.getElementById('cairn-stack');
    els.under = document.getElementById('cairn-under');
    els.over = document.getElementById('cairn-over');
    els.counter = document.getElementById('cairn-counter');
    if (!els.stack || !els.under || !els.over || !els.counter) return;

    els.stack.addEventListener('click', function () {
      animatePlacement(placeStone());
    });
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
