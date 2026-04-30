/* =============================================
   Sun Path — countdown to next turning

   Quiet line under the globe hint:
     "Next: spring equinox 春分 — 7 weeks 4 days 3 hours"
   Updates every minute. Click jumps to that turning's permalink.
   Hidden on the actual turning day (the flourish takes over).
   ============================================= */

(function () {
  'use strict';

  if (!window.Turnings) return;

  var TURNING_LABELS = {
    springEquinox:  { en: 'spring equinox',  kanji: '春分', slug: 'spring-equinox' },
    summerSolstice: { en: 'summer solstice', kanji: '夏至', slug: 'summer-solstice' },
    autumnEquinox:  { en: 'autumn equinox',  kanji: '秋分', slug: 'autumn-equinox' },
    winterSolstice: { en: 'winter solstice', kanji: '冬至', slug: 'winter-solstice' }
  };

  function nextTurning(now) {
    var year = now.getUTCFullYear();
    var ordered = ['springEquinox', 'summerSolstice', 'autumnEquinox', 'winterSolstice'];
    var thisYear = window.Turnings.getTurningsForYear(year);
    var nextYear = window.Turnings.getTurningsForYear(year + 1);
    for (var i = 0; i < ordered.length; i++) {
      var name = ordered[i];
      if (thisYear[name].getTime() > now.getTime()) {
        return { name: name, instant: thisYear[name] };
      }
    }
    return { name: 'springEquinox', instant: nextYear.springEquinox };
  }

  function describeDelta(ms) {
    if (ms <= 0) return 'right now';
    var totalMin = Math.floor(ms / 60000);
    var totalHours = Math.floor(totalMin / 60);
    var totalDays = Math.floor(totalHours / 24);
    var weeks = Math.floor(totalDays / 7);
    var days = totalDays - weeks * 7;
    var hours = totalHours - totalDays * 24;
    var mins = totalMin - totalHours * 60;

    var parts = [];
    if (weeks > 0) parts.push(weeks + (weeks === 1 ? ' week' : ' weeks'));
    if (days > 0)  parts.push(days  + (days  === 1 ? ' day'  : ' days'));
    if (weeks === 0 && hours > 0) parts.push(hours + (hours === 1 ? ' hour' : ' hours'));
    if (weeks === 0 && days === 0) parts.push(mins + (mins === 1 ? ' minute' : ' minutes'));
    return parts.slice(0, 2).join(', ');
  }

  function isOnTurningDay(now) {
    if (!window.Turnings.getTurningOnDate) return false;
    return window.Turnings.getTurningOnDate(now) !== null;
  }

  var timer = null;

  function tick() {
    var el = document.getElementById('sunpath-countdown');
    if (!el) return;
    var now = new Date();
    if (isOnTurningDay(now)) {
      el.hidden = true;
      return;
    }
    var t = nextTurning(now);
    var info = TURNING_LABELS[t.name];
    var delta = describeDelta(t.instant.getTime() - now.getTime());

    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(document.createTextNode('next turning · '));
    var link = document.createElement('a');
    link.href = '/sunpath/2026-' + info.slug;
    link.className = 'sunpath-countdown-link';
    link.dataset.turning = info.slug;
    var kanji = document.createElement('span');
    kanji.className = 'sunpath-countdown-kanji';
    kanji.textContent = info.kanji;
    link.appendChild(kanji);
    link.appendChild(document.createTextNode(' '));
    link.appendChild(document.createTextNode(info.en));
    el.appendChild(link);
    el.appendChild(document.createTextNode(' — ' + delta));
    el.hidden = false;
  }

  function init() {
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (timer) { clearInterval(timer); timer = null; }
      } else if (!timer) {
        timer = setInterval(tick, 60000);
        tick();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
