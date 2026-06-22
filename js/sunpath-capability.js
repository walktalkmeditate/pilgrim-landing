/* Sun Path — renderer capability detection. selectRenderer() is pure. */
(function (root) {
  'use strict';
  function selectRenderer(env) {
    if (env.forceFlat || !env.webgl || env.reducedMotion || env.lowEnd) return 'svg';
    return 'gl';
  }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function isLowEnd() {
    var mem = navigator.deviceMemory;            // GiB, where supported
    var cores = navigator.hardwareConcurrency;   // logical cores
    if (typeof mem === 'number' && mem <= 2) return true;
    if (typeof cores === 'number' && cores <= 2) return true;
    return false;
  }
  function detectEnv() {
    var forceFlat = /[?&]flat\b/.test(location.search);
    return { webgl: hasWebGL(), reducedMotion: prefersReducedMotion(), lowEnd: isLowEnd(), forceFlat: forceFlat };
  }
  var api = { selectRenderer: selectRenderer, hasWebGL: hasWebGL, prefersReducedMotion: prefersReducedMotion, isLowEnd: isLowEnd, detectEnv: detectEnv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunPathCapability = api;
})(typeof window !== 'undefined' ? window : globalThis);
