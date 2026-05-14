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

  // Half the day/twilight-band hour-angle span in hours for a given solar elevation.
  // elevDeg: solar elevation at the event boundary (e.g. -0.833 for sunrise/set,
  //          -6 for civil twilight, -12 for nautical, -18 for astronomical).
  // Returns hours from solar noon to rise/set, or null when the sun never
  // crosses that elevation at this lat/date (polar conditions).
  function hourAngleHalfSpan(lat, date, elevDeg) {
    var d = declination(date);
    var phi = lat * DEG;
    var delta = d * DEG;
    var elev = elevDeg * DEG;
    var num = Math.sin(elev) - Math.sin(phi) * Math.sin(delta);
    var den = Math.cos(phi) * Math.cos(delta);
    var arg = num / den;
    if (arg > 1 || arg < -1) return null;
    return Math.acos(arg) * 12 / Math.PI;
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
    if (arg > 1) return 0;
    if (arg < -1) return 24;
    var H = Math.acos(arg);
    return (24 / Math.PI) * H;
  }

  // UTC instant of sunrise at a given lat/lon on a given date.
  // Returns null for polar day (daylightHours = 24) or polar night (daylightHours = 0).
  // Solar noon UTC = 12 - lon/15 - EoT/60 (Spencer EoT sign convention: subtract).
  function sunriseUTC(lat, lon, date) {
    var dlh = daylightHours(lat, date);
    if (dlh === 0 || dlh === 24) return null;
    var eot = equationOfTime(date);
    var noonH = 12 - lon / 15 - eot / 60;
    var riseH = noonH - dlh / 2;
    var dayOffset = 0;
    while (riseH < 0)  { riseH += 24; dayOffset--; }
    while (riseH >= 24) { riseH -= 24; dayOffset++; }
    var midnightMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return new Date(midnightMs + dayOffset * 86400000 + riseH * 3600000);
  }

  // UTC instant of sunset at a given lat/lon on a given date.
  // Returns null for polar day or polar night (same sentinel as sunriseUTC).
  function sunsetUTC(lat, lon, date) {
    var dlh = daylightHours(lat, date);
    if (dlh === 0 || dlh === 24) return null;
    var eot = equationOfTime(date);
    var noonH = 12 - lon / 15 - eot / 60;
    var setH = noonH + dlh / 2;
    var dayOffset = 0;
    while (setH < 0)  { setH += 24; dayOffset--; }
    while (setH >= 24) { setH -= 24; dayOffset++; }
    var midnightMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return new Date(midnightMs + dayOffset * 86400000 + setH * 3600000);
  }

  // --- Twilight: civil (-6°), nautical (-12°), astronomical (-18°) ---

  // Shared builder for all six twilight UTC functions.
  // isDawn = true for dawn (before solar noon), false for dusk (after solar noon).
  function twilightUTC(lat, lon, date, elevDeg, isDawn) {
    var halfSpanH = hourAngleHalfSpan(lat, date, elevDeg);
    if (halfSpanH === null) return null;
    var eot = equationOfTime(date);
    var noonH = 12 - lon / 15 - eot / 60;
    var t = isDawn ? noonH - halfSpanH : noonH + halfSpanH;
    var dayOffset = 0;
    while (t < 0)   { t += 24; dayOffset--; }
    while (t >= 24) { t -= 24; dayOffset++; }
    var midnightMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return new Date(midnightMs + dayOffset * 86400000 + t * 3600000);
  }

  function civilDawnUTC(lat, lon, date)        { return twilightUTC(lat, lon, date,  -6, true);  }
  function civilDuskUTC(lat, lon, date)        { return twilightUTC(lat, lon, date,  -6, false); }
  function nauticalDawnUTC(lat, lon, date)     { return twilightUTC(lat, lon, date, -12, true);  }
  function nauticalDuskUTC(lat, lon, date)     { return twilightUTC(lat, lon, date, -12, false); }
  function astronomicalDawnUTC(lat, lon, date) { return twilightUTC(lat, lon, date, -18, true);  }
  function astronomicalDuskUTC(lat, lon, date) { return twilightUTC(lat, lon, date, -18, false); }

  // --- Moon position and rise/set ---

  // Julian Day Number at 0h UTC for given calendar date components.
  function julianDay(year, month, day) {
    if (month <= 2) { year -= 1; month += 12; }
    var A = Math.floor(year / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
  }

  // Earth's obliquity at a given Julian Day (degrees).
  function obliquityAtJD(jd) {
    var T = (jd - 2451545.0) / 36525;
    return 23.4392911 - (0.0130042 + (0.00000164 - 0.000000504 * T) * T) * T;
  }

  // Greenwich Mean Sidereal Time in degrees at 0h UTC for a given JD.
  function gmstDeg(jd) {
    var T = (jd - 2451545.0) / 36525;
    var theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
      + T * T * (0.000387933 - T / 38710000);
    return ((theta % 360) + 360) % 360;
  }

  // Moon geocentric RA/Dec (degrees) at a given JD (low precision).
  // Meeus "Astronomical Algorithms" 2nd ed., Ch. 47 simplified series.
  // Accurate to ~10' in longitude, sufficient for ±15 min rise/set.
  function moonRADec(jd) {
    var T = (jd - 2451545.0) / 36525;
    var L0 = ((218.3164477 + 481267.88123421 * T) % 360 + 360) % 360;
    var M  = ((134.9633964 + 477198.8675055  * T) % 360 + 360) % 360;
    var Ms = ((357.5291092 +  35999.0502909  * T) % 360 + 360) % 360;
    var F  = (( 93.2720950 + 483202.0175233  * T) % 360 + 360) % 360;
    var D  = ((297.8501921 + 445267.1114034  * T) % 360 + 360) % 360;
    var Mr = M * DEG, Msr = Ms * DEG, Fr = F * DEG, Dr = D * DEG;
    var dL = 6.288774 * Math.sin(Mr)
      + 1.274027 * Math.sin(2 * Dr - Mr)
      + 0.658314 * Math.sin(2 * Dr)
      + 0.213618 * Math.sin(2 * Mr)
      - 0.185116 * Math.sin(Msr)
      - 0.114332 * Math.sin(2 * Fr)
      + 0.058793 * Math.sin(2 * Dr - 2 * Mr)
      + 0.057066 * Math.sin(2 * Dr - Msr - Mr)
      + 0.053322 * Math.sin(2 * Dr + Mr)
      + 0.045758 * Math.sin(2 * Dr - Msr)
      - 0.040923 * Math.sin(Msr - Mr)
      - 0.034720 * Math.sin(Dr)
      - 0.030383 * Math.sin(Msr + Mr);
    var dB = 5.128122 * Math.sin(Fr)
      + 0.280602 * Math.sin(Mr + Fr)
      + 0.277693 * Math.sin(Mr - Fr)
      + 0.173237 * Math.sin(2 * Dr - Fr)
      + 0.055413 * Math.sin(2 * Dr + Fr - Mr)
      + 0.046271 * Math.sin(2 * Dr - Fr - Mr)
      + 0.032573 * Math.sin(2 * Dr + Fr)
      + 0.017198 * Math.sin(2 * Mr + Fr)
      + 0.009266 * Math.sin(2 * Dr + Mr - Fr);
    var lam = (L0 + dL) * DEG;
    var bet = dB * DEG;
    var eps = obliquityAtJD(jd) * DEG;
    var sinDec = Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam);
    var dec = Math.asin(sinDec);
    var ra = Math.atan2(
      Math.cos(bet) * Math.sin(lam) * Math.cos(eps) - Math.sin(bet) * Math.sin(eps),
      Math.cos(bet) * Math.cos(lam)
    );
    if (ra < 0) ra += 2 * Math.PI;
    return { ra: ra * RAD, dec: dec * RAD };
  }

  // UTC moonrise for a given lat/lon/date. Returns null when the moon does not
  // rise within the 24-hour UTC window centred on the given date.
  // Meeus, Ch. 15 — iterative interpolation over three consecutive midnight positions.
  function moonriseUTC(lat, lon, date) {
    return _moonEvent(lat, lon, date, true);
  }

  // UTC moonset for a given lat/lon/date. Returns null when the moon does not
  // set within the 24-hour UTC window centred on the given date.
  function moonsetUTC(lat, lon, date) {
    return _moonEvent(lat, lon, date, false);
  }

  function _moonEvent(lat, lon, date, isRise) {
    var jd0 = julianDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    var p0 = moonRADec(jd0 - 1);
    var p1 = moonRADec(jd0);
    var p2 = moonRADec(jd0 + 1);
    var ra0 = p0.ra, ra1 = p1.ra, ra2 = p2.ra;
    if (ra1 - ra0 > 180) ra0 += 360;
    if (ra0 - ra1 > 180) ra0 -= 360;
    if (ra2 - ra1 > 180) ra1 += 360;
    if (ra1 - ra2 > 180) ra1 -= 360;
    var dec0 = p0.dec, dec1 = p1.dec, dec2 = p2.dec;
    var phi = lat * DEG;
    var L   = lon;
    var h0  = -0.583 * DEG;
    var th0 = gmstDeg(jd0);
    var m0  = (ra1 + L - th0) / 360;
    m0 = m0 - Math.floor(m0);
    var cosH0 = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec1 * DEG))
                / (Math.cos(phi) * Math.cos(dec1 * DEG));
    if (cosH0 < -1 || cosH0 > 1) return null;
    var H0 = Math.acos(cosH0) * RAD;
    var m  = isRise ? m0 - H0 / 360 : m0 + H0 / 360;
    m = m - Math.floor(m);
    for (var iter = 0; iter < 3; iter++) {
      var ra_m  = ra0  + m * ((ra1  - ra0)  + m * (ra2  - 2 * ra1  + ra0)  / 2);
      var dec_m = dec0 + m * ((dec1 - dec0) + m * (dec2 - 2 * dec1 + dec0) / 2);
      var th_m  = th0 + 360.985647 * m;
      var H_m   = ((th_m - L - ra_m) % 360 + 360) % 360;
      if (H_m > 180) H_m -= 360;
      var h_m = Math.asin(
        Math.sin(phi) * Math.sin(dec_m * DEG)
        + Math.cos(phi) * Math.cos(dec_m * DEG) * Math.cos(H_m * DEG)
      ) * RAD;
      var dm = (h_m - (-0.583)) / (360 * Math.cos(dec_m * DEG) * Math.cos(phi) * Math.sin(H_m * DEG));
      m = m + dm;
    }
    var midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return new Date(midnight + m * 86400000);
  }

  // --- New moon helpers (Meeus-based, added slice 1) ---

  var MOON_RADIUS_KM = 1737.4;

  // Distance terms (Σ_r) from Meeus Ch. 47 Table 47.A (top 10 by magnitude).
  // Returns geocentric distance in km.
  function moonDistanceAt(date) {
    var jd = julianDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
             + fractionalUTCHours(date) / 24;
    var T  = (jd - 2451545.0) / 36525;
    var M  = ((134.9633964 + 477198.8675055  * T) % 360 + 360) % 360;
    var Ms = ((357.5291092 +  35999.0502909  * T) % 360 + 360) % 360;
    var F  = (( 93.2720950 + 483202.0175233  * T) % 360 + 360) % 360;
    var D  = ((297.8501921 + 445267.1114034  * T) % 360 + 360) % 360;
    var Mr = M * DEG, Msr = Ms * DEG, Fr = F * DEG, Dr = D * DEG;
    // Σ_r in units of 0.001 km (Meeus Table 47.B, top 10 terms).
    var sumR = -20905355 * Math.cos(Mr)
               - 3699111 * Math.cos(2 * Dr - Mr)
               - 2955968 * Math.cos(2 * Dr)
               -  569925 * Math.cos(2 * Mr)
               +   48888 * Math.cos(Msr)
               -    3149 * Math.cos(2 * Fr)
               +  246158 * Math.cos(2 * Dr - 2 * Mr)
               - 152138  * Math.cos(2 * Dr - Msr - Mr)
               - 170733  * Math.cos(2 * Dr + Mr)
               - 204586  * Math.cos(2 * Dr - Msr)
               - 129620  * Math.cos(Msr - Mr)
               +  108743 * Math.cos(Dr)
               +  104755 * Math.cos(Msr + Mr);
    var distanceKm = 385000.56 + sumR / 1000;
    return { distanceKm: distanceKm };
  }

  // Topocentric altitude and azimuth of the moon at a given location.
  // Meeus Ch. 13 (horizontal coordinates transform) + Ch. 40 (parallax).
  // Returns { altitude: degrees, azimuth: degrees east of north }.
  function moonAltAzAt(date, lat, lon) {
    var jd = julianDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
             + fractionalUTCHours(date) / 24;
    var rd = moonRADec(jd);
    var dist = moonDistanceAt(date);
    // Horizontal parallax (degrees).
    // sinPi = sine of horizontal parallax (dimensionless). Meeus Ch. 40 eq. 40.6.
    var sinPi = 6378.14 / dist.distanceKm;
    // gmstDeg(jd) already accounts for fractional hours because jd includes them.
    var gmst = ((gmstDeg(jd) % 360) + 360) % 360;
    // Local hour angle (degrees).
    var H = ((gmst + lon - rd.ra) % 360 + 360) % 360;
    if (H > 180) H -= 360;
    var phi = lat * DEG;
    var Hr = H * DEG;
    var decR = rd.dec * DEG;
    // Topocentric correction (Meeus Ch. 40, eq. 40.6–40.8).
    // dRA is in radians; the formula uses sinPi (sine of parallax), not parallax itself.
    var dRA = -sinPi * Math.cos(phi) * Math.sin(Hr)
              / (Math.cos(decR) - sinPi * Math.cos(phi) * Math.cos(Hr));
    var decTopR = Math.atan2(
      (Math.sin(decR) - sinPi * Math.sin(phi)) * Math.cos(dRA),
      Math.cos(decR) - sinPi * Math.cos(phi) * Math.cos(Hr)
    );
    var Htop = Hr + dRA;
    // Altitude.
    var alt = Math.asin(
      Math.sin(phi) * Math.sin(decTopR) + Math.cos(phi) * Math.cos(decTopR) * Math.cos(Htop)
    ) * RAD;
    // Azimuth (east of north).
    var az = Math.atan2(
      Math.sin(Htop),
      Math.cos(Htop) * Math.sin(phi) - Math.tan(decTopR) * Math.cos(phi)
    ) * RAD;
    az = normalizeDeg(az + 180);
    return { altitude: alt, azimuth: az };
  }

  // Apparent angular diameter of the moon in degrees.
  // Formula: 2 × atan(MOON_RADIUS_KM / distanceKm) × (180/π).
  function apparentDiameterAt(date) {
    var dist = moonDistanceAt(date);
    var diameterDeg = 2 * Math.atan(MOON_RADIUS_KM / dist.distanceKm) * RAD;
    return { diameterDeg: diameterDeg };
  }

  // Nearest major or minor lunar standstill to targetYear.
  // The lunar nodes regress with period 6798.4 days (18.6136 yr).
  // Major standstill: moon reaches max declination = obliquity + i (i ≈ 5.145°).
  // Minor standstill: moon reaches max declination = obliquity − i.
  // Reference: Meeus Ch. 53; Ruggles "Astronomy in Prehistoric Britain and Ireland" p. 74.
  function lunarStandstillNear(date, targetYear) {
    var NODAL_PERIOD_YR = 6798.4 / 365.25; // ≈ 18.6136 years
    var I_DEG = 5.145; // Moon's orbital inclination to ecliptic
    var eps = obliquity(targetYear);
    // Major standstill years follow 18.61-yr cycle; anchor: known major standstill ~2006.
    var ANCHOR_MAJOR = 2006.0;
    var n = Math.round((targetYear - ANCHOR_MAJOR) / NODAL_PERIOD_YR);
    var majorYear = ANCHOR_MAJOR + n * NODAL_PERIOD_YR;
    // The minor standstill is half a nodal period away.
    var minorYear = majorYear + NODAL_PERIOD_YR / 2;
    var distMajor = Math.abs(targetYear - majorYear);
    var distMinor = Math.abs(targetYear - minorYear);
    if (distMajor <= distMinor) {
      return {
        year: Math.round(majorYear * 10) / 10,
        type: 'major',
        peakDeclination: eps + I_DEG
      };
    }
    return {
      year: Math.round(minorYear * 10) / 10,
      type: 'minor',
      peakDeclination: eps - I_DEG
    };
  }

  // Next perigee moment after a given date.
  // Walks forward in 1-hour steps, finds the local distance minimum,
  // then refines with parabolic interpolation to within ±2 hours.
  // Pure: no IO.
  function perigeeMomentAfter(date) {
    var STEP_MS = 3600000; // 1 hour
    var t = date.getTime();
    var d0 = moonDistanceAt(new Date(t)).distanceKm;
    var d1 = moonDistanceAt(new Date(t + STEP_MS)).distanceKm;
    // Walk until distance starts increasing again after a decrease.
    var MAX_STEPS = 30 * 24; // max 30 days
    for (var i = 0; i < MAX_STEPS; i++) {
      var d2 = moonDistanceAt(new Date(t + 2 * STEP_MS)).distanceKm;
      if (d1 < d0 && d1 < d2) {
        // Parabolic interpolation: minimum at offset h relative to t + STEP_MS.
        var h = 0.5 * (d0 - d2) / (d0 - 2 * d1 + d2);
        var minMs = t + STEP_MS + Math.round(h * STEP_MS);
        var minDist = moonDistanceAt(new Date(minMs)).distanceKm;
        return { utcMs: minMs, distanceKm: minDist };
      }
      t += STEP_MS;
      d0 = d1;
      d1 = d2;
    }
    return null;
  }

  // Next syzygy (new or full moon) moment after a given date.
  // kind: 'new' (phase ≈ 0) or 'full' (phase ≈ 0.5).
  // Walks forward in 6-hour steps; each pair of steps detects when phase crosses
  // through the target by monotonic counting — avoids 0/1 wrap ambiguity.
  // Refines with bisection to ±2 hours.
  function syzygyMomentAfter(date, kind) {
    var SYNODIC_MONTH = 29.53059;
    var target = (kind === 'full') ? 0.5 : 0.0;
    var STEP_MS = 6 * 3600000; // 6 hours
    // Convert phase to a monotonically increasing "turn count" relative to target.
    // turnCount = floor((phase - target + 0.5) % 1 + turnsFromStart × 1) is tricky.
    // Simpler: express phase as fractional elapsed synodic months from a reference.
    var KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
    var SYNODIC_MS = SYNODIC_MONTH * 86400000;

    function elapsedPhase(ms) {
      // Returns elapsed phase-cycles (non-wrapped) since known new moon.
      return (ms - KNOWN_NEW_MOON_MS) / SYNODIC_MS;
    }

    // Target is at: floor(elapsedPhase) + target (full=0.5), or the next one.
    var t0 = date.getTime() + 3600000; // 1 h after start to avoid returning start
    var ep0 = elapsedPhase(t0);
    // Nearest cycle count that is strictly after ep0.
    var cycleN = Math.ceil(ep0 - target) + (target === 0 ? 0 : 0);
    var targetCycle = cycleN + target;
    if (targetCycle <= ep0) targetCycle += 1;

    var targetMs = KNOWN_NEW_MOON_MS + targetCycle * SYNODIC_MS;
    // Verify: targetMs should be within one synodic month.
    if (targetMs - t0 > SYNODIC_MS * 1.1) return null;

    // Bisect around targetMs to refine (the linear model is accurate to ~minutes).
    var lo = targetMs - 2 * 86400000;
    var hi = targetMs + 2 * 86400000;
    // Find actual crossing by checking elapsedPhase bracket.
    for (var j = 0; j < 40; j++) {
      var mid = Math.floor((lo + hi) / 2);
      if (elapsedPhase(mid) < targetCycle) lo = mid; else hi = mid;
      if (hi - lo < 120000) break;
    }
    return { utcMs: Math.floor((lo + hi) / 2) };
  }

  // Moon phase at a given UTC instant as a value in [0, 1).
  // 0 = new moon, 0.5 = full moon. Thin passthrough to Moon.getMoonPhase.
  // In browser, Moon is the global from moon.js. In Node test runner, inline the math.
  function moonPhaseAtUTC(d) {
    if (typeof Moon !== 'undefined') return Moon.getMoonPhase(d);
    var SYNODIC_MONTH = 29.53059;
    var KNOWN_NEW_MOON = new Date(Date.UTC(2000, 0, 6, 18, 14));
    var diffDays = (d.getTime() - KNOWN_NEW_MOON.getTime()) / 86400000;
    return ((diffDays % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH / SYNODIC_MONTH;
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

  // --- Eclipse helpers (Meeus Ch. 54) ---

  // Moonrise azimuth at a given location on a given date.
  // Returns compass bearing in [0, 360) (0 = N, clockwise), or null when the
  // moon does not rise that day (circumpolar or polar conditions).
  function moonriseAzimuthAt(date, lat, lon) {
    var riseInstant = moonriseUTC(lat, lon, date);
    if (riseInstant === null) return null;
    var altaz = moonAltAzAt(riseInstant, lat, lon);
    var az = altaz.azimuth % 360;
    if (az < 0) az += 360;
    // Ensure strict [0, 360) — never return exactly 360.
    if (az >= 360) az = az - 360;
    return az;
  }

  // Compute ecliptic latitude of the moon (degrees) at JD.
  // Uses the same Meeus Ch. 47 fundamental arguments as moonRADec.
  function _moonEclipticLatAt(jd) {
    var T = (jd - 2451545.0) / 36525;
    var M  = ((134.9633964 + 477198.8675055  * T) % 360 + 360) % 360;
    var Ms = ((357.5291092 +  35999.0502909  * T) % 360 + 360) % 360;
    var F  = (( 93.2720950 + 483202.0175233  * T) % 360 + 360) % 360;
    var D  = ((297.8501921 + 445267.1114034  * T) % 360 + 360) % 360;
    var Mr = M * DEG, Msr = Ms * DEG, Fr = F * DEG, Dr = D * DEG;
    return 5.128122 * Math.sin(Fr)
      + 0.280602 * Math.sin(Mr + Fr)
      + 0.277693 * Math.sin(Mr - Fr)
      + 0.173237 * Math.sin(2 * Dr - Fr)
      + 0.055413 * Math.sin(2 * Dr + Fr - Mr)
      + 0.046271 * Math.sin(2 * Dr - Fr - Mr)
      + 0.032573 * Math.sin(2 * Dr + Fr)
      + 0.017198 * Math.sin(2 * Mr + Fr)
      + 0.009266 * Math.sin(2 * Dr + Mr - Fr);
  }

  // Meeus Ch. 54 — gamma at a given JD (signed shadow-axis distance in Earth radii).
  // Used to find the eclipse maximum by scanning for minimum |gamma| near new moon.
  function _moonGammaAt(jd) {
    var dist = moonDistanceAt(new Date((jd - 2440587.5) * 86400000)).distanceKm;
    return Math.sin(_moonEclipticLatAt(jd) * DEG) * (dist / 6378.14);
  }

  // Meeus Ch. 54 — solar eclipse check for a new moon.
  // Scans ±15 h around jdNewMoon to find the minimum |gamma| (eclipse maximum).
  // Absorbs the linear-syzygy model's ±8 h timing error.
  // Returns null if no eclipse touches Earth, or {magnitudePct, gamma, utcMs} otherwise.
  // magnitudePct = Meeus linear magnitude × 100 (clamped to [0, 100]).
  function _solarEclipseAtNewMoon(jdNewMoon) {
    var T0 = (jdNewMoon - 2451545.0) / 36525;
    var F0 = (( 93.2720950 + 483202.0175233 * T0) % 360 + 360) % 360;
    var Fabs = F0 % 360;
    if (Fabs > 180) Fabs = 360 - Fabs;
    // Meeus §54: eclipse only possible when |F| < 37° or > 143°.
    if (Fabs >= 37 && Fabs <= 143) return null;

    // Scan ±15 h to find minimum |gamma| (true eclipse maximum time).
    var newMoonMs = (jdNewMoon - 2440587.5) * 86400000;
    var minGammaAbs = Infinity;
    var bestJd = jdNewMoon;
    var bestMs = newMoonMs;
    for (var dh = -15; dh <= 15; dh++) {
      var tMs = newMoonMs + dh * 3600000;
      var jd  = 2440587.5 + tMs / 86400000;
      var ga  = Math.abs(_moonGammaAt(jd));
      if (ga < minGammaAbs) { minGammaAbs = ga; bestJd = jd; bestMs = tMs; }
    }

    // Meeus solar eclipse limits (low-precision constants, u ≈ 0.0059):
    var u = 0.0059;
    var penumbraLimit = 1.5433 + u; // ≈ 1.5492
    if (minGammaAbs >= penumbraLimit) return null;

    // Meeus linear magnitude formula (§54):
    // mag = (1.0128 - u - |gamma|) / (0.5450 + 0.0200)
    // Clamped to [0, 1]; values > 1 (total/annular) → 1.
    var mag = (1.0128 - u - minGammaAbs) / (0.5450 + 0.0200);
    if (mag < 0) mag = 0;
    if (mag > 1) mag = 1;
    return { magnitudePct: mag * 100, gamma: _moonGammaAt(bestJd), utcMs: bestMs };
  }

  // Observer visibility check: within the ±15 h eclipse window, is there any
  // moment when the sun is above the horizon at (lat, lon)?
  // Solar eclipses are only visible from the sunlit hemisphere.
  function _solarEclipseObserverVisible(newMoonMs, lat, lon) {
    var phi1 = lat * DEG;
    for (var dh = -15; dh <= 15; dh += 2) {
      var sub = subsolarPoint(new Date(newMoonMs + dh * 3600000));
      var phi2 = sub.lat * DEG;
      var dLon = (lon - sub.lon) * DEG;
      if (Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLon) > 0) {
        return true;
      }
    }
    return false;
  }

  // Next solar eclipse visible from (lat, lon) after date.
  // Returns {utcMs, magnitudePct} or null if none found within search window.
  // Meeus Ch. 54 low-precision. Accuracy: ±1 day, ±5 pct-points magnitude.
  function nextSolarEclipseAfter(date, lat, lon) {
    var SYNODIC_MONTH = 29.53059;
    var SYNODIC_MS    = SYNODIC_MONTH * 86400000;
    var MAX_MONTHS    = 600;

    var syzygy = syzygyMomentAfter(date, 'new');
    if (!syzygy) return null;
    var currentMs = syzygy.utcMs;

    for (var i = 0; i < MAX_MONTHS; i++) {
      var jd = 2440587.5 + currentMs / 86400000;
      var eclipseInfo = _solarEclipseAtNewMoon(jd);
      if (eclipseInfo !== null && _solarEclipseObserverVisible(currentMs, lat, lon)) {
        return { utcMs: eclipseInfo.utcMs, magnitudePct: Math.round(eclipseInfo.magnitudePct * 10) / 10 };
      }
      var nextDate   = new Date(currentMs + SYNODIC_MS * 0.9);
      var nextSyzygy = syzygyMomentAfter(nextDate, 'new');
      if (!nextSyzygy) break;
      currentMs = nextSyzygy.utcMs;
    }
    return null;
  }

  // Meeus Ch. 54 — lunar eclipse check for a full moon.
  // Returns null if no eclipse, or {kind, utcPeak, halfDurationMs} if one occurs.
  // kind: 'total' | 'partial' | 'penumbral'
  // halfDurationMs: half the penumbral contact duration for horizon-overlap check.
  function _lunarEclipseAtFullMoon(jdFullMoon) {
    var T = (jdFullMoon - 2451545.0) / 36525;
    var F = (( 93.2720950 + 483202.0175233 * T) % 360 + 360) % 360;
    var Fabs = F % 360;
    if (Fabs > 180) Fabs = 360 - Fabs;
    // Meeus §54: lunar eclipse only possible when |F| < 21° or > 159°.
    if (Fabs >= 21 && Fabs <= 159) return null;

    var beta     = _moonEclipticLatAt(jdFullMoon);
    var dist     = moonDistanceAt(new Date((jdFullMoon - 2440587.5) * 86400000)).distanceKm;
    var moonDistER = dist / 6378.14;

    // Shadow cone radii (Meeus §54 low-precision constants):
    // u = 0.2725 (moon's semi-diameter in units of Earth's shadow half-width)
    // Penumbra half-width at Moon ≈ 1.0128 + u = 1.2853 (in Earth-radii equivalent)
    // Umbra half-width ≈ 1.0128 - u = 0.7403
    // Total: moon fully inside umbra when |gamma| ≤ 1.0128 - 2u = 0.4678
    var u            = 0.2725;
    var penumbraLimit = 1.0128 + u;  // 1.2853
    var umbraLimit    = 1.0128 - u;  // 0.7403
    var totalLimit    = umbraLimit - u; // 0.4678

    // gamma: Moon's center distance from Earth's shadow axis (in Earth-radii equiv.).
    // For full moon: gamma = sin(beta) × (dist / 6378.14).
    var gamma    = Math.sin(beta * DEG) * moonDistER;
    var gammaAbs = Math.abs(gamma);
    if (gammaAbs >= penumbraLimit) return null;

    var kind = gammaAbs <= totalLimit ? 'total'
             : gammaAbs <= umbraLimit ? 'partial'
             : 'penumbral';

    // Half-duration (penumbral contacts to contacts): Meeus §54 approximate.
    // Moon's apparent velocity relative to shadow ≈ 0.5080°/hr.
    var moonVelDegPerHr  = 0.5080;
    var halfDurationHr   = Math.sqrt(Math.max(0, penumbraLimit * penumbraLimit - gammaAbs * gammaAbs))
                          / moonVelDegPerHr;
    var halfDurationMs   = halfDurationHr * 3600000;
    var utcPeak          = (jdFullMoon - 2440587.5) * 86400000;

    return { kind: kind, utcPeak: utcPeak, halfDurationMs: halfDurationMs };
  }

  // Next lunar eclipse visible from (lat, lon) after date.
  // "Visible" = any portion of the eclipse window overlaps with moon above horizon.
  // Returns {utcMs, kind} or null.
  function nextLunarEclipseAfter(date, lat, lon) {
    var SYNODIC_MONTH = 29.53059;
    var SYNODIC_MS    = SYNODIC_MONTH * 86400000;
    var MAX_MONTHS    = 600;

    var syzygy = syzygyMomentAfter(date, 'full');
    if (!syzygy) return null;
    var currentMs = syzygy.utcMs;

    for (var i = 0; i < MAX_MONTHS; i++) {
      var jd = 2440587.5 + currentMs / 86400000;
      var eclipseInfo = _lunarEclipseAtFullMoon(jd);
      if (eclipseInfo !== null) {
        var peakMs = eclipseInfo.utcPeak;
        var halfMs = eclipseInfo.halfDurationMs;
        // Sample 5 evenly-spaced points across the full eclipse window.
        var checkPoints = [
          peakMs - halfMs,
          peakMs - halfMs * 0.5,
          peakMs,
          peakMs + halfMs * 0.5,
          peakMs + halfMs
        ];
        var visible = false;
        for (var k = 0; k < checkPoints.length; k++) {
          if (moonAltAzAt(new Date(checkPoints[k]), lat, lon).altitude > 0) {
            visible = true;
            break;
          }
        }
        if (visible) {
          return { utcMs: peakMs, kind: eclipseInfo.kind };
        }
      }
      var nextDate   = new Date(currentMs + SYNODIC_MS * 0.9);
      var nextSyzygy = syzygyMomentAfter(nextDate, 'full');
      if (!nextSyzygy) break;
      currentMs = nextSyzygy.utcMs;
    }
    return null;
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
    sunriseUTC: sunriseUTC,
    sunsetUTC: sunsetUTC,
    // twilight
    civilDawnUTC: civilDawnUTC,
    civilDuskUTC: civilDuskUTC,
    nauticalDawnUTC: nauticalDawnUTC,
    nauticalDuskUTC: nauticalDuskUTC,
    astronomicalDawnUTC: astronomicalDawnUTC,
    astronomicalDuskUTC: astronomicalDuskUTC,
    // moon
    moonriseUTC: moonriseUTC,
    moonsetUTC: moonsetUTC,
    moonPhaseAtUTC: moonPhaseAtUTC,
    moonAltAzAt: moonAltAzAt,
    moonDistanceAt: moonDistanceAt,
    apparentDiameterAt: apparentDiameterAt,
    lunarStandstillNear: lunarStandstillNear,
    perigeeMomentAfter: perigeeMomentAfter,
    syzygyMomentAfter: syzygyMomentAfter,
    // eclipse + azimuth (v1.1 slice 1)
    moonriseAzimuthAt: moonriseAzimuthAt,
    nextSolarEclipseAfter: nextSolarEclipseAfter,
    nextLunarEclipseAfter: nextLunarEclipseAfter,
    // obliquity / time machine
    obliquity: obliquity,
    sunriseAzimuthForYear: sunriseAzimuthForYear,
    // distance
    greatCircleKm: greatCircleKm,
    // analemma
    analemma: analemma,
    // constants
    EARTH_R_KM: EARTH_R_KM,
    MOON_RADIUS_KM: MOON_RADIUS_KM
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SunPathMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
