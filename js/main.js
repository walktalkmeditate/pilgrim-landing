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

  function updateThemeToggle(theme) {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(theme === 'dark' ? sunIcon() : moonIcon());
  }

  // --- Quotes ---
  var quotes = [
    'The path is made by walking',
    'Solvitur ambulando \u2014 it is solved by walking',
    'Not all who wander are lost',
    'Walk as if you are kissing the earth with your feet',
    'Every journey begins with a single step',
    'The journey of a thousand miles begins beneath your feet'
  ];

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

    var toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  });
})();
