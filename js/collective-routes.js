'use strict';

var PERCENT_FLOOR = 1.0;
var WEIGHT_BASE = 1, WEIGHT_BEST = 2, WEIGHT_PEAK = 3;

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
  if (inList(entry.bestMonths, month)) w += WEIGHT_BEST;
  if (inList(entry.peakMonths, month)) w += WEIGHT_PEAK;
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
  return weighted[utcSeed(utcDate) % weighted.length];
}

// select() + phrasing/lines land in slice 3.

var api = {
  PERCENT_FLOOR: PERCENT_FLOOR,
  seasonName: seasonName, weightFor: weightFor, utcSeed: utcSeed, chooseEntry: chooseEntry
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CollectiveRoutes = api;
