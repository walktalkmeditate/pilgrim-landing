(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvg(attrs, children) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    for (var key in attrs) svg.setAttribute(key, attrs[key]);
    children.forEach(function (child) {
      var el = document.createElementNS(SVG_NS, child.tag);
      for (var k in child.attrs) el.setAttribute(k, child.attrs[k]);
      svg.appendChild(el);
    });
    return svg;
  }

  function sunIcon() {
    return createSvg({}, [
      { tag: 'circle', attrs: { cx: '12', cy: '12', r: '5' } },
      { tag: 'line', attrs: { x1: '12', y1: '1', x2: '12', y2: '3' } },
      { tag: 'line', attrs: { x1: '12', y1: '21', x2: '12', y2: '23' } },
      { tag: 'line', attrs: { x1: '4.22', y1: '4.22', x2: '5.64', y2: '5.64' } },
      { tag: 'line', attrs: { x1: '18.36', y1: '18.36', x2: '19.78', y2: '19.78' } },
      { tag: 'line', attrs: { x1: '1', y1: '12', x2: '3', y2: '12' } },
      { tag: 'line', attrs: { x1: '21', y1: '12', x2: '23', y2: '12' } },
      { tag: 'line', attrs: { x1: '4.22', y1: '19.78', x2: '5.64', y2: '18.36' } },
      { tag: 'line', attrs: { x1: '18.36', y1: '5.64', x2: '19.78', y2: '4.22' } }
    ]);
  }

  function moonIcon() {
    return createSvg({}, [
      { tag: 'path', attrs: { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' } }
    ]);
  }

  // --- Theme ---
  function getPreferredTheme() {
    var stored = localStorage.getItem('theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeToggle(theme);
    if (window.SeasonalEngine) window.SeasonalEngine.applySeasonalColors();
    if (window.Moon) {
      var moonEl = document.querySelector('.moon-phase');
      if (moonEl) window.Moon.renderMoon(moonEl);
    }
  }

  function updateThemeToggle() {}

  // --- Quotes (time-aware) ---
  var quotesByTime = {
    morning: [
      'The world is new this morning',
      'Walk as if you are kissing the earth with your feet',
      'Every day is a journey, and the journey itself is home',
      'The morning wind spreads its fresh smell'
    ],
    afternoon: [
      'The path is made by walking',
      'Solvitur ambulando \u2014 it is solved by walking',
      'Not all who wander are lost',
      'Every journey begins with a single step'
    ],
    evening: [
      'The day gives back what it borrowed from the light',
      'Along this road goes no one \u2014 autumn evening',
      'The journey of a thousand miles begins beneath your feet',
      'We do not see nature with our eyes, but with our understandings and our hearts'
    ],
    night: [
      'In the middle of the road of my life, I found myself in a dark wood',
      'The night walked down the sky with the moon in her hand',
      'I went to the woods because I wished to live deliberately',
      'The stars are the land-marks of the universe'
    ]
  };

  var hour = new Date().getHours();
  var timeOfDay = hour >= 5 && hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  var quotes = quotesByTime[timeOfDay];

  var currentQuoteIndex = 0;
  var quoteInterval = null;

  function initQuotes() {
    var container = document.querySelector('.hero-quotes');
    if (!container) return;

    quotes.forEach(function (text, i) {
      var el = document.createElement('span');
      el.className = 'hero-quote' + (i === 0 ? ' active' : '');
      el.textContent = text;
      container.appendChild(el);
    });

    quoteInterval = setInterval(nextQuote, 8000);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(quoteInterval);
      } else {
        quoteInterval = setInterval(nextQuote, 8000);
      }
    });
  }

  function nextQuote() {
    var els = document.querySelectorAll('.hero-quote');
    if (!els.length) return;
    els[currentQuoteIndex].classList.remove('active');
    currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
    els[currentQuoteIndex].classList.add('active');
  }

  // --- Scroll Reveal ---
  function initScrollReveal() {
    var reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      reveals.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    reveals.forEach(function (el) { observer.observe(el); });
  }

  // --- Scroll Distance ---
  function initScrollTracker() {
    var tracker = document.querySelector('.scroll-tracker');
    if (!tracker) return;

    var heroHeight = window.innerHeight;
    var scaleFactor = 0.02;

    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (y > heroHeight * 0.8) {
        tracker.classList.add('visible');
      } else {
        tracker.classList.remove('visible');
      }
      var meters = Math.round(y * scaleFactor);
      tracker.textContent = '~' + meters + ' m walked';
    }, { passive: true });
  }

  // --- Particles ---
  function initParticles() {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    var container = document.querySelector('.particles');
    if (!container) return;

    for (var i = 0; i < 10; i++) {
      var p = document.createElement('div');
      p.className = 'particle';
      p.style.setProperty('--particle-x', Math.random() * 100 + '%');
      p.style.setProperty('--particle-size', (2 + Math.random() * 2) + 'px');
      p.style.setProperty('--particle-opacity', (0.06 + Math.random() * 0.06).toFixed(2));
      p.style.setProperty('--drift-x', (Math.random() * 40 - 20) + 'px');
      p.style.setProperty('--float-duration', (10 + Math.random() * 8) + 's');
      p.style.setProperty('--float-delay', (Math.random() * 10) + 's');
      container.appendChild(p);
    }
  }

  // --- Seasons Highlight ---
  function initSeasonsHighlight() {
    if (!window.SeasonalEngine) return;
    var current = window.SeasonalEngine.getCurrentSeason();
    var swatch = document.querySelector('.season-swatch[data-season="' + current + '"]');
    if (swatch) swatch.classList.add('active');
  }

  // --- Footprint Walk Animation ---
  function initFootprints() {
    var dividers = document.querySelectorAll('.divider-footprints');
    if (!dividers.length) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var prints = entry.target.querySelectorAll('.footprint');
          prints.forEach(function(p, i) {
            setTimeout(function() { p.classList.add('visible'); }, i * 200);
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    dividers.forEach(function(d) { observer.observe(d); });
  }

  // --- Parallax Screenshots ---
  function initParallax() {
    var pairs = document.querySelectorAll('.journey-pair');
    if (!pairs.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    pairs.forEach(function(pair) {
      var imgs = pair.querySelectorAll('.journey-screenshot');
      if (imgs.length === 2) {
        imgs[0].style.transition = 'transform 0.1s ease-out';
        imgs[1].style.transition = 'transform 0.1s ease-out';
      }
    });

    window.addEventListener('scroll', function() {
      pairs.forEach(function(pair) {
        var rect = pair.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var viewCenter = window.innerHeight / 2;
        var offset = (center - viewCenter) / window.innerHeight;
        var imgs = pair.querySelectorAll('.journey-screenshot');
        if (imgs.length === 2) {
          imgs[0].style.transform = 'translateY(' + (offset * -12) + 'px)';
          imgs[1].style.transform = 'translateY(' + (offset * 12) + 'px)';
        }
      });
    }, { passive: true });
  }

  // --- Cursor Footprint Trail ---
  function initCursorTrail() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var lastX = 0, lastY = 0;
    var minDist = 40;

    document.addEventListener('mousemove', function(e) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (dx * dx + dy * dy < minDist * minDist) return;
      lastX = e.clientX;
      lastY = e.clientY;

      var dot = document.createElement('div');
      dot.style.cssText = 'position:fixed;width:4px;height:4px;border-radius:50%;pointer-events:none;z-index:9999;' +
        'background:var(--stone);opacity:0.12;transition:opacity 2s ease,transform 2s ease;' +
        'left:' + e.clientX + 'px;top:' + e.clientY + 'px;transform:translate(-50%,-50%)';
      document.body.appendChild(dot);

      requestAnimationFrame(function() {
        dot.style.opacity = '0';
        dot.style.transform = 'translate(-50%,-50%) scale(0.3)';
      });

      setTimeout(function() { dot.remove(); }, 2200);
    });
  }

  // --- Page Walker + Cairn ---
  // The walker figure lives in the left margin and descends the page
  // as the reader scrolls. It walks (bobs) only while scroll is active.
  // On reaching the footer for the first time this session it bows,
  // drops a fresh stone onto the footer cairn, and — if the visit
  // crossed a tier threshold — whispers "Your cairn has grown."
  // Persistence is via localStorage; one stone per day max.
  // The tier system mirrors CairnTier.swift in the iOS app.
  function initPageWalker() {
    if (window.innerWidth < 640) return;

    var walker = document.getElementById('page-walker');
    var walkerWrapper = document.getElementById('page-walker-figure-wrapper');
    var trailWalked = document.getElementById('page-walker-trail-walked');
    var cairn = document.querySelector('.page-cairn');
    var cairnStones = document.getElementById('page-cairn-stones');
    var cairnLabel = document.getElementById('page-cairn-label');
    var cairnWhisper = document.getElementById('page-cairn-whisper');

    if (!walker || !walkerWrapper || !trailWalked || !cairn ||
        !cairnStones || !cairnLabel || !cairnWhisper) return;

    // Match the moon's top offset (--padding-lg = 1.5rem) so the walker
    // starts at the same Y as the moon-phase theme toggle on the right.
    var topOffsetPx = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.5;
    var bottomOffsetPx = topOffsetPx;

    var prefersReducedMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- Tier helpers (port of CairnTier.swift) ---
    function tierFor(visits) {
      if (visits >= 108) return 'eternal';
      if (visits >= 77) return 'sacred';
      if (visits >= 42) return 'great';
      if (visits >= 12) return 'large';
      if (visits >= 7) return 'medium';
      if (visits >= 3) return 'small';
      return 'faint';
    }

    function mantraFor(tier) {
      return {
        faint:   'The path begins',
        small:   "You've been here before",
        medium:  'The path remembers you',
        large:   'Quiet devotion',
        great:   'Walker',
        sacred:  'A sacred walk',
        eternal: 'Solvitur ambulando'
      }[tier];
    }

    // Visible stone count caps at 8 — the visual grows for the first
    // eight visits and then tier names carry the rest of the meaning,
    // culminating in the glowing "eternal" tier at visit 108.
    function stonesForVisits(visits) {
      return Math.max(0, Math.min(8, visits));
    }

    // --- Persistence ---
    var VISITS_KEY = 'pilgrimCairnVisits';
    var LAST_DATE_KEY = 'pilgrimCairnLastDate';
    var FIRST_DATE_KEY = 'pilgrimCairnFirstDate';

    var storedVisits = 0;
    var isNewVisit = false;
    try {
      storedVisits = parseInt(localStorage.getItem(VISITS_KEY) || '0', 10) || 0;
      var lastDate = localStorage.getItem(LAST_DATE_KEY);
      var today = new Date().toISOString().slice(0, 10);
      if (lastDate !== today) {
        isNewVisit = true;
        localStorage.setItem(VISITS_KEY, String(storedVisits + 1));
        localStorage.setItem(LAST_DATE_KEY, today);
        if (!localStorage.getItem(FIRST_DATE_KEY)) {
          localStorage.setItem(FIRST_DATE_KEY, today);
        }
      }
    } catch (e) {
      // localStorage unavailable — behave as a first-visit every time
      storedVisits = 0;
      isNewVisit = true;
    }

    var currentVisits = isNewVisit ? storedVisits + 1 : storedVisits;
    var currentTier = tierFor(currentVisits);
    var previousTier = tierFor(storedVisits);
    var tierChanged = isNewVisit && currentTier !== previousTier;
    var isFirstVisit = currentVisits === 1;

    // --- Cairn rendering ---
    // Eight-stone pyramid stacked in a 60x40 viewBox. Position and
    // size are tuned to read as a wabi-sabi pile rather than a neat
    // pyramid — slight horizontal offsets on every other stone.
    var STONE_LAYOUT = [
      { cx: 30, cy: 35, rx: 11, ry: 3.2 },  // 1 — base
      { cx: 31, cy: 29, rx: 8.5, ry: 2.8 }, // 2
      { cx: 29, cy: 24, rx: 6.8, ry: 2.5 }, // 3
      { cx: 31, cy: 19, rx: 5.5, ry: 2.2 }, // 4
      { cx: 29, cy: 15, rx: 4.4, ry: 1.9 }, // 5
      { cx: 31, cy: 11, rx: 3.6, ry: 1.7 }, // 6
      { cx: 30, cy: 8,  rx: 2.9, ry: 1.4 }, // 7
      { cx: 30, cy: 5,  rx: 2.2, ry: 1.1 }  // 8 — crown
    ];
    var SVG_NS_LOCAL = 'http://www.w3.org/2000/svg';

    function renderCairn(stoneCount, animateLast) {
      while (cairnStones.firstChild) cairnStones.removeChild(cairnStones.firstChild);
      for (var i = 0; i < stoneCount; i++) {
        var layout = STONE_LAYOUT[i];
        var el = document.createElementNS(SVG_NS_LOCAL, 'ellipse');
        el.setAttribute('cx', layout.cx);
        el.setAttribute('cy', layout.cy);
        el.setAttribute('rx', layout.rx);
        el.setAttribute('ry', layout.ry);
        el.setAttribute('class', 'stone');
        if (i === stoneCount - 1 && animateLast && !prefersReducedMotion) {
          el.classList.add('dropping');
        }
        cairnStones.appendChild(el);
      }
      cairn.classList.toggle('eternal', currentTier === 'eternal');
      cairnLabel.textContent = mantraFor(currentTier);
    }

    // Initial render: if this is a new visit, show the PREVIOUS state
    // so the walker can drop the new stone on arrival. Otherwise show
    // the full current state right away.
    var initialStones = isNewVisit
      ? stonesForVisits(storedVisits)
      : stonesForVisits(currentVisits);
    renderCairn(initialStones, false);
    cairn.classList.add('visible');

    // --- Walker scroll logic ---
    var walkerRevealed = !isFirstVisit;
    var hasArrived = false;
    var scrollCount = 0;

    if (!isFirstVisit) {
      walker.classList.add('visible');
    }

    function updateWalker() {
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      var percent = Math.min(1, Math.max(0, scrollTop / docHeight));
      var viewportH = window.innerHeight;

      // Walker starts at the moon's Y (topOffsetPx from top) and
      // descends to near the bottom of the viewport as scroll
      // progresses. Same padding on both ends so the range is centered.
      var walkerY = topOffsetPx + percent * (viewportH - topOffsetPx - bottomOffsetPx);
      walkerWrapper.style.top = walkerY + 'px';
      trailWalked.style.height = walkerY + 'px';

      // First-visit reveal: fade the walker in after the reader has
      // actually begun scrolling (roughly 15 scroll events in). Avoids
      // popping them into a just-loaded page and mirrors the app's
      // tone of "joining a walk already in progress".
      if (isFirstVisit && !walkerRevealed) {
        scrollCount++;
        if (scrollCount >= 15) {
          walker.classList.add('visible');
          walkerRevealed = true;
        }
      }

      // Arrival: when the walker reaches the bottom for the first time
      // this session, bow and plant a new stone if it's a new visit.
      if (!hasArrived && percent >= 0.95) {
        hasArrived = true;
        walker.classList.add('bowing');
        setTimeout(function() {
          walker.classList.remove('bowing');
        }, 900);

        if (isNewVisit) {
          // Drop the new stone (the Nth stone where N = stonesForVisits(currentVisits))
          renderCairn(stonesForVisits(currentVisits), true);

          if (tierChanged && !isFirstVisit) {
            cairnWhisper.textContent = 'Your cairn has grown.';
            cairnWhisper.classList.add('visible');
            setTimeout(function() {
              cairnWhisper.classList.remove('visible');
            }, 4200);
          }
        }
      }
    }

    updateWalker();
    window.addEventListener('scroll', updateWalker, { passive: true });
    window.addEventListener('resize', updateWalker, { passive: true });
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    setTheme(getPreferredTheme());

    if (window.SeasonalEngine) window.SeasonalEngine.applySeasonalColors();

    if (window.Moon) {
      var moonEl = document.querySelector('.moon-phase');
      if (moonEl) window.Moon.renderMoon(moonEl);
    }

    initQuotes();
    initScrollReveal();
    initScrollTracker();
    initParticles();
    initSeasonsHighlight();
    initParallax();
    initFootprints();
    initCursorTrail();
    initPageWalker();

    var moonToggle = document.getElementById('moon-toggle');
    if (moonToggle) {
      moonToggle.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
      moonToggle.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          moonToggle.click();
        }
      });
      if (!localStorage.getItem('moonNudged')) {
        setTimeout(function () {
          moonToggle.classList.add('nudge');
          moonToggle.addEventListener('animationend', function () {
            moonToggle.classList.remove('nudge');
          });
          localStorage.setItem('moonNudged', '1');
        }, 3000);
      }
    }
  });
})();
