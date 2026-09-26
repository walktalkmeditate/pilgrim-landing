/* One walk, told by scroll — DOM wiring. Loaded by index.html only,
 * after js/walk-story-core.js; both defer, so order in the document is
 * order of execution.
 *
 * Without this file, with reduced motion, without sticky or svh, or on a
 * viewport under 560px tall, the story stays nine stacked sections in
 * their finished states: every act in css/walk-story.css reads
 * var(--hold, 1) and nothing sets --hold. Pinned, each frame first reads
 * the scroll position and every moving dot's point, then writes: --hold on
 * scenes whose hold changed, opacity on fronts, lines, the rail and the five
 * sky layers, and a transform on each moving dot. The scroll listener only
 * asks for a frame. The only layout read is measure().
 */

(function () {
  'use strict';

  var C = window.WalkStoryCore;
  if (!C) return;

  var root = document.querySelector('.walk-story');
  if (!root) return;

  var scenes = Array.prototype.slice.call(root.querySelectorAll('.walk-story-scene'));
  var n = scenes.length;
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var video = root.querySelector('.ws-video');

  paintMoon();
  wireTapToPlay();

  // Without svh (iOS 15.0–15.3) or sticky, the pinned heights would be
  // invalid and the story would collapse to nothing; it stays stacked.
  var capable = !reduceMotion && n === C.SCENES.length &&
    'IntersectionObserver' in window && window.CSS &&
    CSS.supports('position', 'sticky') && CSS.supports('height', '100svh');
  if (!capable) return;

  var stage = root.querySelector('.walk-story-stage');
  var skies = Array.prototype.slice.call(root.querySelectorAll('.ws-sky'));
  var railEl = root.querySelector('.walk-story-rail');
  var rail = Array.prototype.slice.call(root.querySelectorAll('.walk-story-rail a'));
  var pill = root.querySelector('.walk-story-pill');
  var pillText = pill && pill.querySelector('.ws-pill-label');
  var skip = root.querySelector('.walk-story-skip');
  var after = document.getElementById('after-walk-story');
  var videoScene = video ? scenes.indexOf(video.closest('.walk-story-scene')) : -1;
  var tracesScene = sceneIndex('traces');
  var portraitQuery = window.matchMedia('(max-width: 720px)');
  var clearings = root.querySelector('.ws-clearings');
  // Pinned or stacked is decided by the small viewport's height, 100svh,
  // which Safari's toolbar never changes. innerHeight follows the toolbar,
  // so a phone near 560px would flip the story, and the page's height with
  // it, as the toolbar moved.
  var svhProbe = root.appendChild(document.createElement('div'));
  svhProbe.className = 'ws-svh';

  var state = scenes.map(function (scene) {
    var svgs = Array.prototype.slice.call(scene.querySelectorAll('.walk-story-line'));
    var texts = Array.prototype.slice.call(scene.querySelectorAll('.walk-story-copy, .ws-said, .ws-closing, .ws-act--traces'));
    // Star mode's clearings, one per block of text (css/walk-story.css).
    var clearEl = clearings ? clearings.appendChild(document.createElement('div')) : null;
    return {
      frontEl: scene.querySelector('.walk-story-front'),
      texts: texts,
      clearEl: clearEl,
      clears: clearEl ? texts.map(function () { return clearEl.appendChild(document.createElement('i')); }) : [],
      lines: svgs,
      tracks: svgs.map(function (svg) {
        var path = svg.querySelector('.ws-line');
        var dot = svg.querySelector('.ws-dot');
        return path && dot ? {
          path: path,
          dot: dot,
          home: dot.getAttribute('transform'),
          length: 0,
          portrait: svg.classList.contains('walk-story-line--portrait')
        } : null;
      }).filter(Boolean),
      hold: -1,
      frontOpacity: -1,
      lineOpacity: -1
    };
  });

  var pinned = false, compact = false;
  var top = 0, height = 0, stageHeight = 0, width = 0;
  var scrollTop = 0, target = 0, shown = 0, raf = 0, lastT = 0;
  var current = -1, inView = false, demoed = false, reachedEnd = false;
  var skyOpacity = skies.map(function () { return -1; });
  var railOpacity = -1;

  // Stacked, the scene across the viewport's middle is being read; a
  // re-pin resumes there.
  var onLine = [];
  var lineWatch = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { onLine[scenes.indexOf(e.target)] = e.isIntersecting; });
  }, { rootMargin: '-50% 0px -50% 0px' });

  function watchLine(scene) {
    onLine = scenes.map(function (s, j) { return j === scene; });
    scenes.forEach(function (s) { lineWatch.observe(s); });
  }

  function sceneIndex(id) {
    for (var i = 0; i < C.SCENES.length; i++) if (C.SCENES[i].id === id) return i;
    return -1;
  }

  function measure() {
    var portrait = portraitQuery.matches;
    var rectOf = function (el) { return el.getBoundingClientRect(); };
    // Scene 06's act spans its column; its two cards sit in the middle.
    var inkOf = function (el) {
      if (!el.classList.contains('ws-act--traces')) return rectOf(el);
      var a = rectOf(el.firstElementChild), b = rectOf(el.lastElementChild);
      return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
    };
    compact = portrait;
    width = window.innerWidth;
    top = rectOf(root).top + window.scrollY;
    var stageBox = rectOf(stage);
    height = root.offsetHeight;
    stageHeight = stage.offsetHeight;
    var box = root.querySelector('.walk-story-line--' + (portrait ? 'portrait' : 'landscape')).viewBox.baseVal;
    var scale = Math.min(stage.offsetWidth / box.width, stageHeight / box.height);
    root.style.setProperty('--ws-label-k', C.labelScale(scale).toFixed(3));
    state.forEach(function (s) {
      s.clears.forEach(function (c, k) {
        var r = inkOf(s.texts[k]);
        c.style.cssText = 'left:' + (r.left - stageBox.left) + 'px;top:' + (r.top - stageBox.top) +
          'px;width:' + (r.right - r.left) + 'px;height:' + (r.bottom - r.top) + 'px';
      });
      s.tracks.forEach(function (t) {
        t.length = 0;
        if (t.portrait !== portrait) return;
        try { t.length = t.path.getTotalLength(); } catch (e) { t.length = 0; }
      });
      s.hold = -1;   // re-place every dot in the geometry now on screen
      s.lineOpacity = -1;
    });
    current = -1;    // and re-apply the scene, whose pill may dock by width
    readScroll();
  }

  // At the top of a frame, before any write: in the scroll handler this
  // read forced a layout on nearly every scroll.
  function readScroll() {
    scrollTop = window.scrollY;
    target = C.storyProgress(scrollTop, top, height, stageHeight);
  }

  function pointsFor(j, hold) {
    var ink = C.lineInk(C.SCENES[j].id, hold);
    return state[j].tracks.map(function (t) {
      return t.length ? t.path.getPointAtLength(ink * t.length) : null;
    });
  }

  function syncVideo() {
    if (!video) return;
    if (pinned && inView && current === videoScene) {
      var played = video.play();
      if (played && played.catch) played.catch(function () {});
    } else if (!video.paused) {
      video.pause();
    }
  }

  function setCurrent(i) {
    current = i;
    scenes.forEach(function (scene, j) { scene.classList.toggle('is-active', j === i); });
    rail.forEach(function (a, j) {
      if (j === i) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
    });
    stage.setAttribute('data-sky', C.SCENES[i].sky);
    if (pill) {
      var label = C.pillLabel(i);
      pill.classList.toggle('is-hidden', !label);
      pill.classList.toggle('is-docked', i > 0 || compact);
      if (label) {
        pillText.textContent = label;
        pill.setAttribute('href', '#scene-' + (i + 2));
        pill.removeAttribute('tabindex');
        pill.removeAttribute('aria-hidden');
      } else {
        pill.setAttribute('tabindex', '-1');
        pill.setAttribute('aria-hidden', 'true');
      }
    }
    syncVideo();
  }

  // The theme can change under a pinned story, so it is read per frame;
  // an attribute, not layout.
  function inkTurns() {
    return C.inkTurns(document.documentElement.getAttribute('data-theme') === 'dark');
  }

  function render(p) {
    var at = C.sceneAt(p, n);
    var veil = C.inkVeil(p * n, inkTurns());
    var moved = [];
    var j, s;
    // Read every moving dot's point first, then write: a geometry read
    // after a --hold write would force a style recalc inside the frame.
    for (j = 0; j < n; j++) {
      var hold = Math.round(C.holdLocal(C.clamp(p * n - j, 0, 1)) * 10000) / 10000;
      if (hold !== state[j].hold) moved.push({ j: j, hold: hold, points: pointsFor(j, hold) });
    }
    moved.forEach(function (m) {
      scenes[m.j].style.setProperty('--hold', m.hold);
      state[m.j].tracks.forEach(function (t, k) {
        var pt = m.points[k];
        if (pt) t.dot.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
      });
      state[m.j].hold = m.hold;
    });
    for (j = 0; j < n; j++) {
      s = state[j];
      var l = p * n - j;
      var front = Math.round(C.frontOpacity(l, j, n) * 1000) / 1000;
      if (front !== s.frontOpacity) {
        s.frontEl.style.opacity = front;
        if (s.clearEl) s.clearEl.style.opacity = front;
        s.frontOpacity = front;
      }
      var line = Math.round(C.lineOpacityAt(j, p, n, compact) * veil * 1000) / 1000;
      if (line !== s.lineOpacity) {
        for (var q = 0; q < s.lines.length; q++) s.lines[q].style.opacity = line;
        s.lineOpacity = line;
      }
    }
    var layers = C.layerOpacities(C.skyWeights(p, n));
    for (var i = 0; i < skies.length; i++) {
      var o = Math.round(layers[i] * 1000) / 1000;
      if (o !== skyOpacity[i]) {
        skies[i].style.opacity = o;
        skyOpacity[i] = o;
      }
    }
    var railNow = Math.round(veil * 1000) / 1000;
    if (railEl && railNow !== railOpacity) {
      railEl.style.opacity = railNow;
      railOpacity = railNow;
    }
    if (at.index !== current) setCurrent(at.index);
  }

  // Events fire only where the reader comes to rest: a skip, a fling or
  // a reload that lands below the story passes through without counting.
  function settle() {
    var run = height - stageHeight;
    if (run <= 0) return;
    var raw = (scrollTop - top) / run;
    if (!demoed && tracesScene !== -1 && window.TracesCairn &&
        raw >= C.holdStartProgress(tracesScene, n) && raw < (tracesScene + 1) / n) {
      demoed = true;
      window.TracesCairn.demo();
    }
    if (!reachedEnd && raw >= C.holdStartProgress(n - 1, n) && raw <= 1) {
      reachedEnd = true;
      if (window.umami) window.umami.track('story-reach-end');
    }
  }

  // Scroll sets a target; this eases the shown progress toward it, so a
  // mouse wheel's 100px steps glide like a trackpad. The factor is 0.14
  // per 60Hz frame, scaled by the real frame time, so a 120Hz display
  // settles at the same speed as the phone in a walker's pocket.
  function frame(t) {
    raf = 0;
    readScroll();
    var dt = lastT ? Math.min(64, t - lastT) : 16.667;
    lastT = t;
    shown += (target - shown) * (1 - Math.pow(0.86, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) shown = target;
    render(shown);
    if (shown !== target) {
      raf = window.requestAnimationFrame(frame);
    } else {
      lastT = 0;
      settle();
    }
  }

  function request() {
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  // A re-pin puts the stacked scene on stage: the old scroll position
  // means another scene pinned.
  function snap(scene) {
    measure();
    if (scene >= 0) scrollToScene(scene, false);
    shown = target;
    render(shown);
    settle();
  }

  // The page's html { scroll-behavior: smooth } would animate 'auto',
  // so a jump that must land now says 'instant'.
  function scrollToScene(i, smooth) {
    var y = C.sceneScrollTop(i, n, top, height, stageHeight);
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'instant' });
    if (!smooth) {
      readScroll();
      shown = target;
      render(shown);
    }
  }

  function enter() {
    if (inView) return;
    inView = true;
    document.body.classList.add('walk-story-pinned');
    window.addEventListener('scroll', request, { passive: true });
    readScroll();
    shown = target;
    render(shown);
    settle();
    syncVideo();
  }

  function leave() {
    if (!inView) return;
    inView = false;
    document.body.classList.remove('walk-story-pinned');
    window.removeEventListener('scroll', request);
    // Off screen nothing eases: land where the scroll left the story,
    // rather than write every frame ahead of other scripts' reads.
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
      lastT = 0;
      shown = target;
      render(shown);
    }
    syncVideo();
  }

  function pin() {
    var resume = onLine.indexOf(true);
    lineWatch.disconnect();
    pinned = true;
    root.classList.add('walk-story--pinned');
    snap(resume);
    if (scrollTop + window.innerHeight > top && scrollTop < top + height) enter();
  }

  // Back to the stacked story: every inline value the frame loop wrote
  // comes off, so the stylesheet's finished states show again, and the
  // scene that was on stage stays in view.
  function unpin() {
    var keep = inView ? C.runScene(scrollTop, top, height, stageHeight, n) : -1;
    leave();
    pinned = false;
    root.classList.remove('walk-story--pinned');
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    lastT = 0;
    scenes.forEach(function (scene, j) {
      var s = state[j];
      scene.style.removeProperty('--hold');
      scene.classList.remove('is-active');
      s.frontEl.style.opacity = '';
      if (s.clearEl) s.clearEl.style.opacity = '';
      s.lines.forEach(function (el) { el.style.opacity = ''; });
      s.tracks.forEach(function (t) { t.dot.setAttribute('transform', t.home); });
      s.hold = -1;
      s.frontOpacity = -1;
      s.lineOpacity = -1;
    });
    skies.forEach(function (el, i) { el.style.opacity = ''; skyOpacity[i] = -1; });
    if (railEl) railEl.style.opacity = '';
    railOpacity = -1;
    root.style.removeProperty('--ws-label-k');
    rail.forEach(function (a) { a.removeAttribute('aria-current'); });
    if (pill) pill.classList.remove('is-docked');
    stage.setAttribute('data-sky', 'dawn');
    current = -1;
    if (keep !== -1) scenes[keep].scrollIntoView({ block: 'start', behavior: 'instant' });
    watchLine(keep);
  }

  function tallEnough() {
    return svhProbe.offsetHeight >= 560;
  }

  // iOS fires resize as its toolbar collapses, changing only innerHeight;
  // 100svh and the story's height stay put, so that resize changes
  // nothing. A real layout change moves the width or the story's height,
  // and keeps the scene on stage (the page above reflows, so the old
  // scroll position means another scene); a short viewport (a phone
  // turned sideways) unpins.
  function onResize() {
    var tall = tallEnough();
    if (tall !== pinned) {
      if (tall) pin(); else unpin();
      return;
    }
    if (pinned && (window.innerWidth !== width || root.offsetHeight !== height)) {
      snap(inView ? C.runScene(scrollTop, top, height, stageHeight, n) : -1);
    }
  }

  rail.forEach(function (a, i) {
    a.addEventListener('click', function (e) {
      if (!pinned) return;
      e.preventDefault();
      scrollToScene(i, true);
    });
  });

  if (pill) {
    pill.addEventListener('click', function (e) {
      if (!pinned) return;
      e.preventDefault();
      scrollToScene(Math.min(n - 1, current + 1), true);
    });
  }

  // Skipping means skipping: no smooth ride through 12.6 screens.
  if (skip && after) {
    skip.addEventListener('click', function (e) {
      if (!pinned) return;
      e.preventDefault();
      after.setAttribute('tabindex', '-1');
      window.scrollTo({ top: top + height, behavior: 'instant' });
      after.focus({ preventScroll: true });
    });
  }

  // A focused element must never sit in a faded scene: tabbing into a
  // scene brings that scene on stage first.
  root.addEventListener('focusin', function (e) {
    if (!pinned) return;
    var scene = e.target.closest ? e.target.closest('.walk-story-scene') : null;
    var i = scene ? scenes.indexOf(scene) : -1;
    if (i !== -1 && i !== current) scrollToScene(i, false);
  });

  new IntersectionObserver(function (entries) {
    if (!pinned) return;
    if (entries[entries.length - 1].isIntersecting) enter(); else leave();
  }).observe(root);

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('load', function () { if (pinned) snap(); }, { once: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (pinned) snap(); });
  }

  if (tallEnough()) pin(); else watchLine(-1);

  function paintMoon() {
    if (typeof window.getMoonPhase !== 'function') return;
    var phase = window.getMoonPhase(new Date());
    Array.prototype.forEach.call(root.querySelectorAll('.ws-moon-lit'), function (el) {
      el.setAttribute('d', C.moonPath(phase,
        +el.getAttribute('data-cx'), +el.getAttribute('data-cy'), +el.getAttribute('data-r')));
    });
  }

  // Unpinned, the meditation video shows its poster and plays on a tap.
  function wireTapToPlay() {
    if (!video) return;
    video.addEventListener('click', function () {
      if (root.classList.contains('walk-story--pinned')) return;
      if (video.paused) {
        var played = video.play();
        if (played && played.catch) played.catch(function () {});
      } else {
        video.pause();
      }
    });
  }
})();
