/* Sun Path — pure 3D helpers for the globe renderers. Browser + node. */
(function (root) {
  'use strict';
  var DEG = Math.PI / 180;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function lonLatToVec3(lon, lat, r) {
    if (r == null) r = 1;
    var la = lat * DEG, lo = lon * DEG, cl = Math.cos(la);
    return { x: r * cl * Math.cos(lo), y: r * Math.sin(la), z: -r * cl * Math.sin(lo) };
  }

  function subsolarToSunDir(sub) { return lonLatToVec3(sub.lon, sub.lat, 1); }

  function litFactor(pointLonLat, sub) {
    var p = lonLatToVec3(pointLonLat[0], pointLonLat[1], 1);
    var s = subsolarToSunDir(sub);
    return p.x * s.x + p.y * s.y + p.z * s.z;
  }

  function isLit(pointLonLat, sub) { return litFactor(pointLonLat, sub) > 0; }

  function alignmentFlareStrength(todayAz, targetAz, windowDeg) {
    var d = Math.abs(todayAz - targetAz);
    return clamp01(1 - d / windowDeg);
  }

  var api = {
    clamp01: clamp01, lonLatToVec3: lonLatToVec3, subsolarToSunDir: subsolarToSunDir,
    litFactor: litFactor, isLit: isLit, alignmentFlareStrength: alignmentFlareStrength
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunPathGlobeMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
