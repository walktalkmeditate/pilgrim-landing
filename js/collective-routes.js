(function (root) {
  'use strict';

  var PERCENT_FLOOR = 1.0;
  var WEIGHT_BASE = 1, WEIGHT_BEST = 2, WEIGHT_PEAK = 3;

  function hashSeed(n){ var h = n >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^ (h >>> 16)) >>> 0; }

  function seasonName(month){
    if (month === 12 || month === 1 || month === 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn'; // 9,10,11
  }
  function inList(arr, month){ return Array.isArray(arr) && arr.indexOf(month) !== -1; }
  function weightFor(entry, month){
    if (entry.kind === 'cosmic') return WEIGHT_BASE;
    var w = WEIGHT_BASE;
    if (inList(entry.bestMonths, month)) {
      w += WEIGHT_BEST;
      if (inList(entry.peakMonths, month)) w += WEIGHT_PEAK;
    }
    return w;
  }
  function orderedEntries(asset){
    var routes = asset.pilgrimages.slice().sort(function(a,b){ return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return routes.concat(asset.horizons.slice()); // horizons keep asset order: Earth, Moon, Sun
  }
  function utcSeed(utcDate){
    return utcDate.getUTCFullYear() * 10000 + (utcDate.getUTCMonth() + 1) * 100 + utcDate.getUTCDate();
  }
  function chooseEntry(utcDate, asset){
    var month = utcDate.getUTCMonth() + 1;
    var weighted = [];
    orderedEntries(asset).forEach(function(e){
      var w = weightFor(e, month);
      for (var i = 0; i < w; i++) weighted.push(e);
    });
    return weighted[hashSeed(utcSeed(utcDate)) % weighted.length];
  }

  function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

  function phraseFor(entry, totalKm){
    if (!(totalKm > 0)) return { phase: 'toward', label: 'The path is beginning.' };
    var times = totalKm / entry.km;
    if (entry.kind === 'cosmic') {
      if (times >= 1) {
        var n = Math.floor(times);
        return { phase: 'reached', label: n >= 2
          ? 'Together, ' + n + ' times ' + entry.preposition + ' ' + entry.body + '.'
          : 'Together, once ' + entry.preposition + ' ' + entry.body + '.' };
      }
      var pct = times * 100;
      if (pct >= PERCENT_FLOOR)
        return { phase: 'toward', label: 'We are ' + pct.toFixed(1) + '% of the way ' + entry.preposition + ' ' + entry.body + '.' };
      return { phase: 'toward', label: fmt(entry.km - totalKm) + ' km ' + entry.preposition + ' ' + entry.body + '.' };
    }
    var floor = Math.floor(times);
    if (floor >= 2) return { phase: 'reached', label: "Together, we've walked the " + entry.nameEn + ' ' + floor + ' times.' };
    if (floor === 1) return { phase: 'reached', label: 'Together, one ' + entry.nameEn + ' complete.' };
    return { phase: 'toward', label: 'We are ' + Math.min(99, Math.round(times * 100)) + '% of the way to one ' + entry.nameEn + '.' };
  }

  function seasonLineFor(entry, month){
    if (entry.kind === 'cosmic' || !inList(entry.bestMonths, month)) return null;
    var s = seasonName(month);
    return 'Its season is ' + s + ' — and it is ' + s + ' now.';
  }
  function reflectionFor(entry, seed){
    if (entry.kind === 'cosmic' || !entry.reflections || entry.reflections.length === 0) return null;
    return entry.reflections[seed % entry.reflections.length];
  }
  function daylightHrefFor(entry){
    return entry.kind === 'cosmic' ? null : '/daylight/?route=' + entry.id;
  }
  function annualLineFor(entry){
    if (entry.kind === 'cosmic' || !entry.annual) return null;
    var a = entry.annual;
    var note = a.metricNote.replace(/\.\s*$/, '');
    var suffix = note.indexOf(String(a.year)) !== -1 ? '' : ' (' + a.year + ')';
    return fmt(a.count) + ' ' + note + suffix + '.';
  }

  function select(totalDistanceKm, utcDate, asset){
    var entry = chooseEntry(utcDate, asset);
    var seed = utcSeed(utcDate);
    var month = utcDate.getUTCMonth() + 1;
    var total = totalDistanceKm || 0;
    var p = phraseFor(entry, total);
    return {
      entry: entry,
      times: total / entry.km,
      phase: p.phase,
      label: p.label,
      seasonLine: seasonLineFor(entry, month),
      reflection: reflectionFor(entry, seed),
      daylightHref: daylightHrefFor(entry),
      annualLine: annualLineFor(entry)
    };
  }

  function crossingsSince(prevKm, totalKm, asset){
    if (!(totalKm > 0) || !isFinite(totalKm)) return [];   // failed/zero/non-finite fetch
    if (!(prevKm >= 0) || !isFinite(prevKm)) return [];     // no valid baseline (first visit)
    return asset.pilgrimages
      .filter(function(r){ return r.km > prevKm && r.km <= totalKm; })
      .map(function(r){ return r.nameEn; });                // cosmic excluded (not iterated)
  }

  var api = {
    PERCENT_FLOOR: PERCENT_FLOOR,
    seasonName: seasonName, weightFor: weightFor, utcSeed: utcSeed, hashSeed: hashSeed, chooseEntry: chooseEntry,
    phraseFor: phraseFor, select: select, seasonLineFor: seasonLineFor, reflectionFor: reflectionFor,
    daylightHrefFor: daylightHrefFor, annualLineFor: annualLineFor, crossingsSince: crossingsSince
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CollectiveRoutes = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
