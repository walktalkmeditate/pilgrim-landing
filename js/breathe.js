/* breathe — a page's living signal: the real moon, and the hour's wash.

   DOM-guarded, so requiring this in node is safe and a page that loads it
   without the markup simply does nothing (moon.js's renderMoon writes to the
   container immediately and has no null guard of its own).

   The moon uses #breathe-moon, never .moon-phase / #moon-toggle, so js/main.js's
   dark-mode toggle wiring can never claim it. renderMoon sets aria-label/title
   to the phase name, which is the element's accessible name. */

(function () {
  'use strict';

  if (typeof document === 'undefined') { return; }

  function breathe() {
    var tint = window.BreatheTint;
    var wash = document.getElementById('breathe-wash');
    if (wash && tint && typeof tint.hourTint === 'function') {
      var t = tint.hourTint(new Date());
      wash.style.backgroundColor = t.color;
      wash.style.opacity = String(t.alpha);
      wash.setAttribute('data-hour', t.name);
    }

    var moon = document.getElementById('breathe-moon');
    if (moon && window.Moon && typeof window.Moon.renderMoon === 'function') {
      window.Moon.renderMoon(moon, undefined, { isDark: prefersDark() });
      // Named only once it exists. Shipped aria-hidden, so a page with JS off
      // or a missing dependency leaves an empty div decorative rather than an
      // img role with no accessible name. renderMoon sets the label.
      moon.removeAttribute('aria-hidden');
      moon.setAttribute('role', 'img');
    }
  }

  // These pages carry no [data-theme]; their dark mode is the media query.
  function prefersDark() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', breathe);
  } else {
    breathe();
  }
})();
