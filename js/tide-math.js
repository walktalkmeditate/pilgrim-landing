/* =============================================
   Tide Math — harmonic synthesis

   Computes predicted tide height from harmonic
   constituents using the standard formula:

     h(t) = Σᵢ ampᵢ × cos(speedᵢ × hours_since_1900 − phaseᵢ)

   where:
     - speedᵢ in degrees/hour
     - phaseᵢ in degrees (Greenwich phase from NOAA Phase_GMT column)
     - hours_since_1900: hours since 1900-01-01T00:00:00Z

   The 1900 epoch is the standard tidal reference epoch used by NOAA's
   harmonic analysis. NOAA's Phase_GMT values are referenced to this
   epoch, not to Unix epoch (1970-01-01). Using Unix epoch shifts all
   cosine phases by (70 × 365.25 × 24 × speedᵢ) degrees, producing
   incorrect results.

   Reference: NOAA CO-OPS Technical Report NOS CO-OPS 003 (1998),
   Schureman (1958) "Manual of Harmonic Analysis and Prediction of Tides".

   All public-domain formulas and constants.
   Constituent speeds from Schureman (1958) / Doodson notation,
   as published in NOAA Tides and Currents documentation.

   Cross-checked in js/tide-math.test.js against NOAA Honolulu
   station 1612340 published predictions.
   ============================================= */

(function (root) {
  'use strict';

  // Standard tidal constituent speeds (degrees per hour).
  // Source: Schureman (1958), reproduced in NOAA CO-OPS Technical Report
  // and NOAA Tides & Currents harmonic constituent tables.
  var SPEEDS = {
    M2:  28.9841042,
    S2:  30.0,
    N2:  28.4397295,
    K1:  15.0410686,
    O1:  13.9430356,
    P1:  14.9589314,
    Q1:  13.3986609,
    K2:  30.0821373,
    M4:  57.9682084,
    MS4: 58.9841042
  };

  // 1900-01-01T00:00:00Z in milliseconds (standard NOAA tidal reference epoch).
  var EPOCH_1900_MS = Date.UTC(1900, 0, 1, 0, 0, 0);

  // Compute predicted tide height in metres above MSL.
  //
  // unixSeconds: Unix timestamp in seconds (integer or float).
  // constituents: object with at least one key matching SPEEDS.
  //   Each constituent: { amp, phase, speed }
  //   amp   — amplitude in metres
  //   phase — Greenwich phase in degrees (Phase_GMT from NOAA harcon API)
  //   speed — angular speed in degrees/hour (use SPEEDS constants)
  //
  // Formula: h(t) = Σᵢ ampᵢ × cos(speedᵢ × hours_since_1900 − phaseᵢ)
  // where hours_since_1900 = (unixSeconds × 1000 − EPOCH_1900_MS) / 3600000.
  function harmonicTideHeightM(unixSeconds, constituents) {
    var hours = (unixSeconds * 1000 - EPOCH_1900_MS) / 3600000;
    var h = 0;
    var names = Object.keys(constituents);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var c = constituents[name];
      var angle = c.speed * hours - c.phase;
      h += c.amp * Math.cos(angle * Math.PI / 180);
    }
    return h;
  }

  var api = {
    harmonicTideHeightM: harmonicTideHeightM,
    SPEEDS: SPEEDS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TideMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
