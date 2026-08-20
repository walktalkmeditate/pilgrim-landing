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

  var wispEls = {};

  function bandFor(wisp) {
    var cs = getComputedStyle(wisp);
    return [
      parseFloat(cs.getPropertyValue('--wisp-l-min')) || 30,
      parseFloat(cs.getPropertyValue('--wisp-l-max')) || 54
    ];
  }

  function paintEnergy() {
    var energy = currentEnergy();

    // The aura keeps the app's literal border colour. Behind the line
    // work it can be as pale as it likes.
    if (wispEls.aura) wispEls.aura.style.setProperty('--wisp-energy', energy.hex);

    // The glyph itself takes a legible remapping of that same colour.
    if (wispEls.wisp) {
      var band = bandFor(wispEls.wisp);
      wispEls.wisp.style.color = G.glyphColorFor(energy.hex, band[0], band[1]);
    }

    // The name is what actually distinguishes the seven. Their border
    // colours cluster into about three hue families — lightness and
    // stillness are near twins — so the word carries the identity and
    // the colour is atmosphere.
    if (wispEls.name) {
      wispEls.name.textContent = energy.name;
      wispEls.name.style.color = wispEls.wisp ? wispEls.wisp.style.color : '';
    }
  }

  var breathTimer = null;

  function startBreathing() {
    paintEnergy();
    breathTimer = setInterval(function () {
      breathIndex++;
      paintEnergy();
    }, BREATH_MS);
  }

  function stopBreathing() {
    if (breathTimer) { clearInterval(breathTimer); breathTimer = null; }
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

  // --- Chimes ---
  //
  // Seven sounds, one per tier, rising as the cairn grows. This is what
  // makes the climb an instrument rather than a button that makes noise.
  //
  // Lazy per tier: most visitors only ever pull stone-tier-1 (9 KB); a
  // climb to eternal pulls all seven.

  var STONE_CDN_BASE = 'https://cdn.pilgrimapp.org/audio/stone/';
  var STONE_VOLUME = 0.33;  // the app has a bellVolume preference; the web has none
  var IMPACT_MS = 120;      // the chime lands on impact, not on the press

  var chimeCache = {};
  var chimePlaying = null;

  function chimeFor(soundTier) {
    if (!chimeCache[soundTier]) {
      var a = new Audio(STONE_CDN_BASE + 'stone-tier-' + soundTier + '.m4a');
      a.preload = 'none';
      a.volume = STONE_VOLUME;
      chimeCache[soundTier] = a;
    }
    return chimeCache[soundTier];
  }

  // One sound at a time. The walker in js/main.js plays whispers from the
  // same CDN, and two sources at once is mush — iOS arbitrates this with
  // AudioSessionCoordinator and a consumer string, so a chime yields to a
  // playing whisper rather than talking over it.
  function whisperIsPlaying() {
    var audios = document.querySelectorAll('audio');
    for (var i = 0; i < audios.length; i++) {
      if (!audios[i].paused && !audios[i].ended) return true;
    }
    return false;
  }

  function playChime(stones) {
    if (whisperIsPlaying()) return;

    if (chimePlaying) {
      chimePlaying.pause();
      chimePlaying.currentTime = 0;
    }

    var a = chimeFor(G.soundTierFor(stones));
    chimePlaying = a;
    var p = a.play();
    if (p && typeof p.catch === 'function') {
      p['catch'](function () { /* autoplay refused or file missing — stay silent */ });
    }
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

  // At 108 everything holds for a beat: the wisp stops cycling and
  // settles on whichever energy was breathing when the last stone
  // landed, the eternal glow comes up slowly, and stone-tier-7 plays
  // alone. Reload resets it, like everything else here.
  function reachEternal() {
    stopBreathing();
    els.stack.classList.add('is-eternal');
  }

  function initCairn() {
    els.stack = document.getElementById('cairn-stack');
    els.under = document.getElementById('cairn-under');
    els.over = document.getElementById('cairn-over');
    els.counter = document.getElementById('cairn-counter');
    if (!els.stack || !els.under || !els.over || !els.counter) return;

    var HOLD_DELAY_MS = 400;   // long enough that an ordinary click never repeats
    var HOLD_STEP_MS = 250;
    var holdDelay = null, holdRepeat = null;

    function place() {
      var result = placeStone();
      animatePlacement(result);
      setTimeout(function () { playChime(result.stones); }, reduceMotion ? 0 : IMPACT_MS);
      if (result.stones === 108) reachEternal();
    }

    function startHold() {
      holdDelay = setTimeout(function () {
        holdRepeat = setInterval(place, HOLD_STEP_MS);
      }, HOLD_DELAY_MS);
    }

    function endHold() {
      if (holdDelay) { clearTimeout(holdDelay); holdDelay = null; }
      if (holdRepeat) { clearInterval(holdRepeat); holdRepeat = null; }
    }

    els.stack.addEventListener('click', place);
    els.stack.addEventListener('pointerdown', startHold);
    els.stack.addEventListener('pointerup', endHold);
    els.stack.addEventListener('pointerleave', endHold);
    els.stack.addEventListener('pointercancel', endHold);

    // Space and Enter both activate a <button>, and holding either
    // auto-repeats keydown. The first keydown is left to the synthetic
    // click it will produce; every repeat after that places directly.
    var keyHeld = false;
    els.stack.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (keyHeld) { e.preventDefault(); place(); }
      keyHeld = true;
    });
    els.stack.addEventListener('keyup', function () { keyHeld = false; });

    // Demonstrate the verb: one stone settles on its own the first time
    // the section comes into view. Silent — there is no user gesture, so
    // there is no sound, and an unprompted noise would be the wrong kind
    // of surprise anyway. It counts as stone 1, which is why the
    // counter's rule is "with the first stone" and not "after the first
    // click": there is no separate demonstration state to reason about.
    if (typeof IntersectionObserver === 'function') {
      var shown = false;
      var io = new IntersectionObserver(function (entries) {
        if (shown || !entries[0].isIntersecting) return;
        shown = true;
        io.disconnect();
        setTimeout(function () { animatePlacement(placeStone()); }, 600);
      }, { threshold: 0.6 });
      io.observe(els.stack);
    }
  }

  function init() {
    wispEls.aura = document.getElementById('wisp-aura');
    wispEls.wisp = document.querySelector('.wisp');
    wispEls.name = document.getElementById('wisp-energy');
    if (wispEls.aura || wispEls.wisp) startBreathing();
    initCairn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
