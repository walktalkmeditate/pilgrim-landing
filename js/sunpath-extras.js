/* =============================================
   Sun Path — extras

   - Live walker count (from walk.pilgrimapp.org/api/now)
   - Today in the Saka, Hijri, and Maya Long Count calendars
     (rotating through one every 6 seconds)

   Both are quiet single lines under the subsolar caption. Each
   is independent and bails silently if its DOM target is missing
   or its data source is unavailable.
   ============================================= */

(function () {
  'use strict';

  function htmlEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function clearChildren(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // ---------- Walker count ----------

  function setupWalkerCount() {
    var el = document.getElementById('sunpath-walkers');
    if (!el) return;
    function tick() {
      fetch('https://walk.pilgrimapp.org/api/now', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var n = d && d.estimated_active;
          if (!n || n <= 0) {
            el.hidden = true;
            return;
          }
          clearChildren(el);
          el.appendChild(document.createTextNode('about '));
          var strong = htmlEl('strong', 'sunpath-walkers-count', String(n));
          el.appendChild(strong);
          el.appendChild(document.createTextNode(' walking with the collective right now'));
          el.hidden = false;
        })
        .catch(function () { el.hidden = true; });
    }
    tick();
    setInterval(tick, 60000);
  }

  // ---------- Cultural calendars ----------
  // All conversions use Julian Day Number (JDN) as the bridge.

  function gregorianToJDN(year, month, day) {
    var a = Math.floor((14 - month) / 12);
    var y = year + 4800 - a;
    var m = month + 12 * a - 3;
    return day + Math.floor((153 * m + 2) / 5)
      + 365 * y + Math.floor(y / 4)
      - Math.floor(y / 100) + Math.floor(y / 400)
      - 32045;
  }

  // Saka civil calendar (Indian national calendar). Reformed 1957;
  // rules: Year = Gregorian year - 78. Year starts on March 22 (or
  // March 21 in Gregorian leap years). 12 months, 30/31 days each.
  function gregorianToSaka(year, month, day) {
    var SAKA_MONTHS = ['Chaitra','Vaisakha','Jyaistha','Asadha','Sravana','Bhadra',
                       'Asvina','Kartika','Agrahayana','Pausa','Magha','Phalguna'];
    // Gregorian leap year?
    var leap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    var startDay = leap ? 21 : 22;
    var sakaYear = year - 78;
    if (month < 3 || (month === 3 && day < startDay)) sakaYear--;

    // Days from start of Saka year (1 Chaitra)
    var daysInGregorianMonth = [31, 28+(leap?1:0), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var doy = day - 1;
    for (var i = 0; i < month - 1; i++) doy += daysInGregorianMonth[i];
    var sakaStart = (leap ? 80 : 80); // March 21 leap = day 81 (1-indexed); March 22 non-leap = day 81 too
    sakaStart = leap ? (31 + 29 + 21 - 1) : (31 + 28 + 22 - 1); // 0-indexed
    var sakaDoy = doy - sakaStart;
    if (sakaDoy < 0) sakaDoy += leap ? 366 : 365;

    // Saka month lengths (year-start variable rules):
    // Chaitra: 30 (31 in leap), then Vaisakha-Bhadra: 31 each (5 months), then Asvina-Phalguna: 30 each (6 months)
    var sakaLeap = leap;
    var monthLengths = [
      sakaLeap ? 31 : 30, // Chaitra
      31, 31, 31, 31, 31, // Vaisakha through Bhadra
      30, 30, 30, 30, 30, 30 // Asvina through Phalguna
    ];

    var m = 0;
    while (sakaDoy >= monthLengths[m] && m < 11) {
      sakaDoy -= monthLengths[m];
      m++;
    }
    var sakaDay = sakaDoy + 1;
    return SAKA_MONTHS[m] + ' ' + sakaDay + ', Saka ' + sakaYear;
  }

  // Islamic (Hijri) calendar — tabular Kuwaiti algorithm, accurate to 1-2 days.
  function gregorianToHijri(year, month, day) {
    var HIJRI_MONTHS = ['Muharram','Safar','Rabi I','Rabi II','Jumada I','Jumada II',
                        'Rajab','Shaban','Ramadan','Shawwal','Dhu al-Qadah','Dhu al-Hijjah'];
    var jd = gregorianToJDN(year, month, day);
    var l = jd - 1948440 + 10632;
    var n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719)
          + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
          - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    var m = Math.floor((24 * l) / 709);
    var d = l - Math.floor((709 * m) / 24);
    var y = 30 * n + j - 30;
    return HIJRI_MONTHS[m - 1] + ' ' + d + ', ' + y + ' AH';
  }

  // Maya Long Count — days since 4 Ahau 8 Cumku (correlation 584283 = GMT).
  function gregorianToMaya(year, month, day) {
    var jd = gregorianToJDN(year, month, day);
    var days = jd - 584283;
    var baktun = Math.floor(days / 144000); days -= baktun * 144000;
    var katun  = Math.floor(days / 7200);   days -= katun * 7200;
    var tun    = Math.floor(days / 360);    days -= tun * 360;
    var uinal  = Math.floor(days / 20);     var kin = days - uinal * 20;
    return baktun + '.' + katun + '.' + tun + '.' + uinal + '.' + kin + '  · Long Count';
  }

  function setupCalendars() {
    var el = document.getElementById('sunpath-calendars');
    if (!el) return;
    var now = new Date();
    var Y = now.getUTCFullYear();
    var M = now.getUTCMonth() + 1;
    var D = now.getUTCDate();
    var entries = [
      { label: 'Saka',   value: gregorianToSaka(Y, M, D) },
      { label: 'Hijri',  value: gregorianToHijri(Y, M, D) },
      { label: 'Maya',   value: gregorianToMaya(Y, M, D) }
    ];
    var idx = 0;
    function show() {
      var e = entries[idx];
      clearChildren(el);
      el.appendChild(htmlEl('span', 'sunpath-calendars-label', 'today in the ' + e.label));
      el.appendChild(document.createTextNode(' · '));
      el.appendChild(htmlEl('span', 'sunpath-calendars-value', e.value));
      idx = (idx + 1) % entries.length;
    }
    show();
    setInterval(show, 6000);
  }

  function init() {
    setupWalkerCount();
    setupCalendars();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
