/* =============================================
   Daylight walk-budget math

   Walking velocity model and pace presets for estimating
   how long a route will take given distance and elevation gain.

   No external dependencies.

   Cross-checked in js/daylight-math.test.js against hand-computed
   values from the Tobler-inspired velocity formula.
   ============================================= */

(function (root) {
  'use strict';

  // km/h at each named pace on flat ground (s = 0).
  var PACE_PRESETS = {
    slow:     3,
    standard: 4,
    brisk:    5
  };

  // Walking velocity in km/h given slope s (elevGainM / horizontal distance m).
  // Tobler-inspired: v(s) = v_flat × exp(-3.5 × s), s ≥ 0.
  // Departs from canonical Tobler (6 km/h base, +0.05 offset) by substituting
  // v_flat from the caller's pace preset and dropping the offset term.
  function walkingVelocity(vFlat, slope) {
    return vFlat * Math.exp(-3.5 * slope);
  }

  // Format a Date as a UTC instant in RFC 5545 basic format: YYYYMMDDTHHMMSSZ.
  function fmtUTCInstant(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + ''
      + p(d.getUTCMonth() + 1)
      + p(d.getUTCDate())
      + 'T'
      + p(d.getUTCHours())
      + p(d.getUTCMinutes())
      + p(d.getUTCSeconds())
      + 'Z';
  }

  // Escape a string per RFC 5545 TEXT escaping rules.
  function escapeICSText(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/,/g,  '\\,')
      .replace(/;/g,  '\\;')
      .replace(/\n/g, '\\n');
  }

  // Fold an ICS content line to max 75 octets per RFC 5545 §3.1.
  // Continuation lines start with a single space.
  function foldICSLine(line) {
    var bytes = [];
    for (var i = 0; i < line.length; i++) {
      var cp = line.charCodeAt(i);
      if (cp < 0x80) {
        bytes.push(line[i]);
      } else if (cp < 0x800) {
        bytes.push(line[i], line[i]);
      } else {
        bytes.push(line[i], line[i], line[i]);
      }
    }
    // Simple byte-count-by-char approximation: fold on byte count.
    // We use char length as a conservative proxy (ASCII-dominant content).
    var result = '';
    var pos = 0;
    var limit = 75;
    while (pos < line.length) {
      var chunk = line.slice(pos, pos + limit);
      if (pos > 0) result += '\r\n ';
      result += chunk;
      pos += limit;
      limit = 74; // continuation lines: 1 byte for the leading space, so 74 payload chars
    }
    return result;
  }

  // Build a VCALENDAR/VEVENT ICS string for a daylight walk.
  //
  // opts:
  //   routeName      — display name of the route (string)
  //   stageLabel     — display name of the stage (string)
  //   startUTC       — walk start as a Date (forward: output.startUTC; reverse: output.latestDepartUTC)
  //   endUTC         — walk end   as a Date (forward: output.arrivalUTC; reverse: output.walkEndUTC)
  //   urlHref        — canonical URL for the event (string)
  //   mode           — 'forward' | 'reverse' (passed through to DESCRIPTION context, not used in ICS logic)
  //   stageTz        — IANA timezone string — present in signature per spec D9 but UNUSED in v1
  //                    body. Two-call negative test in daylight-math.test.js guards against silent
  //                    regression if this ever gets used accidentally.
  //   descriptionLine — one-line plain-text summary (will be RFC-5545-escaped and folded)
  //
  // Returns a VCALENDAR string. Pure: no globals, no Date.now() calls.
  // DTSTAMP uses startUTC as a deterministic value (matches turnings-2026.ics pattern of a
  // fixed literal rather than "now").
  function buildICS(opts) {
    var routeName     = opts.routeName      || '';
    var stageLabel    = opts.stageLabel     || '';
    var startUTC      = opts.startUTC;
    var endUTC        = opts.endUTC;
    var urlHref       = opts.urlHref        || '';
    var descLine      = opts.descriptionLine || '';
    // stageTz is intentionally unused — see comment above.

    var summary     = 'Walk: ' + routeName + ' — ' + stageLabel;
    var uid         = 'daylight-' + fmtUTCInstant(startUTC) + '@pilgrimapp.org';
    var dtstamp     = fmtUTCInstant(startUTC);
    var dtstart     = fmtUTCInstant(startUTC);
    var dtend       = fmtUTCInstant(endUTC);
    var description = escapeICSText(descLine);

    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pilgrim//Daylight Walk Budget//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      '',
      'BEGIN:VEVENT',
      foldICSLine('UID:' + uid),
      'DTSTAMP:' + dtstamp,
      'DTSTART:' + dtstart,
      'DTEND:'   + dtend,
      foldICSLine('SUMMARY:' + summary),
      foldICSLine('DESCRIPTION:' + description),
      foldICSLine('URL:' + urlHref),
      'CATEGORIES:Pilgrimage,Walking',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Walk tomorrow',
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
      '',
      'END:VCALENDAR'
    ];

    return lines.join('\r\n');
  }

  // Minutes to walk a route at a given pace preset (or explicit min/km pace).
  // distanceKm:          horizontal route length in km.
  // elevGainM:           total ascent in metres (descents not modelled in v1, pass 0).
  // pacePresetOrMinPerKm: a key from PACE_PRESETS ('slow'|'standard'|'brisk')
  //                       or a numeric minutes-per-km pace (e.g. 15 → 4 km/h).
  function walkingMinutes(opts) {
    var distanceKm = opts.distanceKm;
    var elevGainM  = opts.elevGainM  || 0;
    var preset     = opts.pacePresetOrMinPerKm;

    var vFlat;
    if (typeof preset === 'number') {
      vFlat = 60 / preset;
    } else {
      vFlat = PACE_PRESETS[preset];
    }

    var slope    = distanceKm > 0 ? elevGainM / (distanceKm * 1000) : 0;
    var velocity = walkingVelocity(vFlat, slope);
    return 60 * distanceKm / velocity;
  }

  var api = {
    PACE_PRESETS:    PACE_PRESETS,
    walkingMinutes:  walkingMinutes,
    buildICS:        buildICS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DaylightMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
