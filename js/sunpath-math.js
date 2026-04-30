/* =============================================
   Sun Path — math primitives

   Subsolar point, day/night terminator, sunrise azimuth at a
   location and date, obliquity shift through time, analemma,
   daylight hours, great-circle distance.

   All public-domain formulas. No external dependencies.

   Cross-checked in js/sunpath-math.test.js against NOAA solar
   position calculator and published archaeoastronomy values.
   ============================================= */

(function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var EARTH_R_KM = 6371;

  // --- Helpers ---

  function dayOfYear(date) {
    var start = Date.UTC(date.getUTCFullYear(), 0, 0);
    var diff = date.getTime() - start;
    return Math.floor(diff / 86400000);
  }

  function fractionalUTCHours(date) {
    return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  }

  function normalizeDeg(d) {
    d = d % 360;
    if (d < 0) d += 360;
    return d;
  }

  // --- Solar position ---

  // Fractional year angle γ in radians, accurate to within hours.
  // Per NOAA Solar Calculator (Spencer 1971 truncated series).
  function fractionalYear(date) {
    var n = dayOfYear(date);
    var hours = fractionalUTCHours(date);
    return (2 * Math.PI / 365) * (n - 1 + (hours - 12) / 24);
  }

  // Solar declination in degrees. Accurate to ~0.05° via Spencer truncated series.
  function declination(date) {
    var g = fractionalYear(date);
    var rad = 0.006918
      - 0.399912 * Math.cos(g)
      + 0.070257 * Math.sin(g)
      - 0.006758 * Math.cos(2 * g)
      + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g)
      + 0.00148  * Math.sin(3 * g);
    return rad * RAD;
  }

  // Equation of time in minutes via Spencer truncated series. ~0.5 min accuracy.
  function equationOfTime(date) {
    var g = fractionalYear(date);
    return 229.18 * (
      0.000075
      + 0.001868 * Math.cos(g)
      - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g)
      - 0.040849 * Math.sin(2 * g)
    );
  }

  // Subsolar point: lat/lon where the sun is directly overhead at the given UTC instant.
  function subsolarPoint(date) {
    var d = declination(date);
    var eot = equationOfTime(date);
    var solarTime = fractionalUTCHours(date) + eot / 60;
    var lon = -15 * (solarTime - 12);
    // Wrap longitude to [-180, 180].
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return { lat: d, lon: lon };
  }

  // --- Sunrise / sunset / day length ---

  // Sunrise azimuth at a given lat/lon on a given date.
  // Returns degrees east of north (0 = north, 90 = east, 180 = south, 270 = west).
  // Uses atan2 to disambiguate east vs west; arccos-only forms would mirror.
  // Returns null at extreme latitudes when the sun does not rise.
  function sunriseAzimuth(lat, date) {
    var d = declination(date);
    var phi = lat * DEG;
    var delta = d * DEG;
    var cosH = -Math.tan(phi) * Math.tan(delta);
    if (cosH > 1 || cosH < -1) return null; // polar day or polar night
    var H = -Math.acos(cosH); // sunrise hour angle (negative)
    var az = Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)
    );
    return normalizeDeg(az * RAD + 180); // shift from azimuth-from-south to east-of-north
  }

  // Daylight hours at a given lat on a given date.
  // Uses elevation = -0.833° to account for atmospheric refraction.
  // Returns 24 (polar day) or 0 (polar night) when applicable.
  function daylightHours(lat, date) {
    var d = declination(date);
    var phi = lat * DEG;
    var delta = d * DEG;
    var elev = -0.833 * DEG;
    var num = Math.sin(elev) - Math.sin(phi) * Math.sin(delta);
    var den = Math.cos(phi) * Math.cos(delta);
    var arg = num / den;
    if (arg > 1) return 0;        // polar night
    if (arg < -1) return 24;      // polar day
    // H = half the day's hour-angle span (sunrise to noon).
    // Total daylight hours = 2H * (12/π) = (24/π) * H.
    var H = Math.acos(arg);
    return (24 / Math.PI) * H;
  }

  // --- Obliquity (axial tilt) shift over time ---

  // Earth's obliquity of the ecliptic in degrees, for a given calendar year.
  // Polynomial valid roughly -3000 to +3000.
  function obliquity(year) {
    var T = (year - 2000) / 100;
    return 23.43929 - 0.013004 * T - 1.64e-6 * T * T + 5.04e-7 * T * T * T;
  }

  // Sunrise azimuth at a given lat for a given year on a named turning,
  // using that year's obliquity. Used by the megalith time machine.
  // turning: 'summer-solstice' | 'winter-solstice' | 'spring-equinox' | 'autumn-equinox'
  function sunriseAzimuthForYear(lat, year, turning) {
    var eps = obliquity(year);
    var d;
    switch (turning) {
      case 'summer-solstice': d = eps; break;
      case 'winter-solstice': d = -eps; break;
      case 'spring-equinox':
      case 'autumn-equinox': d = 0; break;
      default: return null;
    }
    var phi = lat * DEG;
    var delta = d * DEG;
    var cosH = -Math.tan(phi) * Math.tan(delta);
    if (cosH > 1 || cosH < -1) return null;
    var H = -Math.acos(cosH);
    var az = Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)
    );
    return normalizeDeg(az * RAD + 180);
  }

  // --- Great circle ---

  // Great-circle distance in kilometers between two lat/lon points.
  function greatCircleKm(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * DEG, p2 = lat2 * DEG;
    var dLon = (lon2 - lon1) * DEG;
    var c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLon);
    if (c > 1) c = 1;
    if (c < -1) c = -1;
    return EARTH_R_KM * Math.acos(c);
  }

  // --- Analemma (sun's noon position over a year, at one location) ---

  // Returns 365 {altitude, azimuth} points for solar noon at the city's longitude.
  function analemma(lat, lon, year) {
    var year0 = year || new Date().getUTCFullYear();
    var pts = [];
    for (var n = 0; n < 365; n++) {
      var date = new Date(Date.UTC(year0, 0, 1 + n, 12, 0, 0));
      // Adjust UTC time so it's solar noon at this longitude.
      var noonUTC = 12 - lon / 15;
      date = new Date(Date.UTC(year0, 0, 1 + n, Math.floor(noonUTC), Math.round((noonUTC % 1) * 60), 0));
      var d = declination(date);
      var eot = equationOfTime(date);
      var phi = lat * DEG;
      var delta = d * DEG;
      // Hour angle at solar noon, accounting for equation of time.
      var H = (eot / 60) * 15 * DEG;
      var alt = Math.asin(
        Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H)
      );
      var az = Math.atan2(
        Math.sin(H),
        Math.cos(H) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)
      );
      pts.push({ altitude: alt * RAD, azimuth: normalizeDeg(az * RAD + 180), day: n + 1 });
    }
    return pts;
  }

  var api = {
    // helpers
    dayOfYear: dayOfYear,
    fractionalUTCHours: fractionalUTCHours,
    normalizeDeg: normalizeDeg,
    // solar
    declination: declination,
    equationOfTime: equationOfTime,
    subsolarPoint: subsolarPoint,
    // sunrise + daylight
    sunriseAzimuth: sunriseAzimuth,
    daylightHours: daylightHours,
    // obliquity / time machine
    obliquity: obliquity,
    sunriseAzimuthForYear: sunriseAzimuthForYear,
    // distance
    greatCircleKm: greatCircleKm,
    // analemma
    analemma: analemma,
    // constants
    EARTH_R_KM: EARTH_R_KM
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SunPathMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
