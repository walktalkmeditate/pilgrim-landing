/* =============================================
   Sun Path — past/future awareness on turning permalinks

   Each /sunpath/{year}-{turning} page knows where it sits relative
   to "now" via window.__sunpathForce.date. This script writes a
   small status pill under the tagline:

     passed · 6 weeks 2 days ago     (past, the moment has gone by)
     ahead  · 7 weeks 3 days away    (future, still upcoming)

   Within ~24 hours of the turning the pill is suppressed and the
   existing flourish (sunpath-turnings.js) takes over.

   Tagline copy stays fixed (past tense) — almost every visit lands
   after the turning, and reading "where day equalled night" alongside
   an "ahead" pill is mild enough to leave alone.
   ============================================= */

(function () {
  'use strict';

  if (!window.__sunpathForce || !window.__sunpathForce.date) return;

  function pluralize(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function describe(absMs) {
    var totalMin = Math.floor(absMs / 60000);
    var totalHours = Math.floor(totalMin / 60);
    var totalDays = Math.floor(totalHours / 24);
    var weeks = Math.floor(totalDays / 7);
    var days = totalDays - weeks * 7;
    var hours = totalHours - totalDays * 24;
    var minutes = totalMin - totalHours * 60;

    var parts = [];
    if (weeks > 0) parts.push(pluralize(weeks, 'week'));
    if (days > 0)  parts.push(pluralize(days, 'day'));
    if (!weeks && !days) {
      if (hours > 0)  parts.push(pluralize(hours, 'hour'));
      if (!hours && minutes > 0) parts.push(pluralize(minutes, 'minute'));
    }
    if (!parts.length) parts.push('moments');
    return parts.slice(0, 2).join(' ');
  }

  function init() {
    var instant = new Date(window.__sunpathForce.date);
    if (isNaN(instant.getTime())) return;
    var turning = window.__sunpathForce.turning;

    var now = new Date();
    var delta = instant.getTime() - now.getTime();
    var absHours = Math.abs(delta) / 3600000;
    if (absHours < 24) return; // turning day — flourish handles

    var state = delta < 0 ? 'past' : 'future';
    var phrase = describe(Math.abs(delta));
    var prefix = state === 'past' ? 'passed' : 'ahead';
    var suffix = state === 'past' ? 'ago' : 'away';

    var tagline = document.querySelector('.sunpath-tagline');
    if (!tagline) return;
    if (document.querySelector('.sunpath-temporal-status')) return;

    var pill = document.createElement('p');
    pill.className = 'sunpath-temporal-status';
    pill.dataset.turning = turning;
    pill.dataset.state = state;

    var label = document.createElement('span');
    label.className = 'sunpath-temporal-label';
    label.textContent = prefix;
    pill.appendChild(label);
    pill.appendChild(document.createTextNode(' · ' + phrase + ' ' + suffix));

    tagline.parentNode.insertBefore(pill, tagline.nextSibling);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
