/*
 * /walk — fetches the duck's feed and renders it as a sumi-e ink journey.
 *
 * Port + elaboration of CalligraphyPathRenderer + WalkDotView from the
 * Pilgrim iOS app (Pilgrim/Scenes/Home/*.swift).
 */

(function () {
  "use strict";

  const FEED_URL =
    "https://cdn.jsdelivr.net/gh/walktalkmeditate/rubberduck-walk@main/feed.json";
  const DUCK_GIF = "assets/duck/duck.gif";
  const DUCK_LINK = "https://chiefrubberduck.com";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const STALE_FEED_DAYS = 10;

  // Layout constants (matching CalligraphyPathRenderer's verticalSpacing/maxMeander/topInset).
  const VERTICAL_SPACING = 124;
  const MAX_MEANDER = 38;
  const TOP_INSET = 40;
  const BOTTOM_INSET = 72;
  const BASE_STROKE = 1.6;
  const MAX_STROKE = 4.2;
  const PATH_WIDTH = 110;
  const PATH_WIDTH_MOBILE = 54;

  // Seasonal palette (spring → moss, summer → rust, autumn → dawn, winter → ink).
  function seasonForDate(iso) {
    const m = Number(iso.slice(5, 7));
    if (m >= 3 && m <= 5) return "moss";
    if (m >= 6 && m <= 8) return "rust";
    if (m >= 9 && m <= 11) return "dawn";
    return "ink";
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function seasonColor(key) {
    return cssVar(`--walk-${key}`) || "#7a8b6f";
  }

  // Dot body radius by kind.
  const DOT_RADIUS = {
    offering: 9,
    notice: 8,
    threshold: 13,
    letter: 10,
    silence: 5,
  };

  // Temple-number → nameLocalized.ja for Shikoku 88. Sourced from
  // open-pilgrimages waypoints.geojson (walktalkmeditate/open-pilgrimages).
  // We keep just the subset needed for ruby rendering; a full static table
  // ships in the client so we don't have to round-trip for kanji.
  const SHIKOKU_KANJI = {
    "Ryozen-ji": "霊山寺",
    "Gokuraku-ji": "極楽寺",
    "Konsen-ji": "金泉寺",
    "Dainichi-ji": "大日寺",
    "Jizo-ji": "地蔵寺",
    "Anraku-ji": "安楽寺",
    "Juraku-ji": "十楽寺",
    "Kumadani-ji": "熊谷寺",
    "Horin-ji": "法輪寺",
    "Kirihata-ji": "切幡寺",
    "Fujii-dera": "藤井寺",
    "Shozan-ji": "焼山寺",
    // Closure / orei-mairi
    "Koya-san Okunoin": "高野山奥之院",
    "Kōya-san Okunoin": "高野山奥之院",
    "Wakayama": "和歌山",
    "Hashimoto": "橋本",
    "Tokushima port": "徳島港",
  };

  function kanjiFor(name) {
    if (!name) return null;
    if (SHIKOKU_KANJI[name]) return SHIKOKU_KANJI[name];
    // Attempt "Name-ji" → "Name ji" fallback lookup
    const alt = name.replace("-ji", "ji");
    return SHIKOKU_KANJI[alt] ?? null;
  }

  // Deterministic x-meander per entry — stable hash so a given entry
  // always sits at the same horizontal position across reloads.
  function meanderHash(entry) {
    const s = `${entry.date}:${entry.route}:${entry.stage}:${entry.glyph}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 0xffffffff; // 0..1
  }
  function meanderOffset(entry) {
    return (meanderHash(entry) - 0.5) * MAX_MEANDER * 1.6;
  }

  function ageClass(ageDays) {
    if (ageDays <= 30) return "";
    if (ageDays <= 90) return "walk-entry--age-soft";
    return "walk-entry--age-distant";
  }

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function feedAgeDays(feed) {
    if (!feed.generatedAt) return 0;
    const generated = new Date(feed.generatedAt).getTime();
    if (Number.isNaN(generated)) return 0;
    return Math.floor((Date.now() - generated) / (1000 * 60 * 60 * 24));
  }

  function renderStateLine(feed) {
    const el = document.getElementById("walk-state-line");
    if (!el) return;

    if (feedAgeDays(feed) >= STALE_FEED_DAYS) {
      el.textContent = "the duck is resting elsewhere";
      return;
    }

    const d = feed.duck;
    if (d.mode === "resting") {
      el.textContent = `the duck is resting at ${d.stageName}`;
    } else if (d.mode === "completing") {
      el.textContent = `walking toward closure, near ${d.stageName}`;
    } else {
      el.textContent = `at ${d.stageName} · stage ${d.stage} of the ${d.routeName}`;
    }
  }

  // ---- Entry card ----

  function buildEntryCard(entry) {
    const el = document.createElement("article");
    el.className = `walk-entry walk-entry--${entry.kind} ${ageClass(entry.ageDays)}`.trim();
    el.style.setProperty("--dot-i", String(entry._index));

    const meta = document.createElement("div");
    meta.className = "walk-entry-meta";
    const date = document.createElement("span");
    date.className = "walk-entry-date";
    date.textContent = formatDate(entry.date);
    const stage = document.createElement("span");
    stage.className = "walk-entry-stage";
    stage.textContent = entry.stageName;
    const kanji = kanjiFor(entry.stageName);
    if (kanji) {
      const ja = document.createElement("span");
      ja.className = "walk-entry-stage-ja";
      ja.textContent = kanji;
      stage.append(ja);
    }
    meta.append(date, stage);
    el.append(meta);

    const glyph = document.createElement("div");
    glyph.className = "walk-entry-glyph";
    glyph.textContent = entry.glyph;
    el.append(glyph);

    const body = document.createElement("div");
    body.className = "walk-entry-body";
    if (entry.kind !== "silence") {
      const paragraphs = Array.isArray(entry.paragraphs) ? entry.paragraphs : [];
      for (const p of paragraphs) {
        const pEl = document.createElement("p");
        pEl.textContent = p;
        body.append(pEl);
      }
    }
    el.append(body);

    if (entry.kind === "letter" && entry.author) {
      const author = document.createElement("p");
      author.className = "walk-entry-author";
      author.textContent = entry.author;
      el.append(author);
    }

    return el;
  }

  // ---- SVG path + dots ----

  function buildBrushSegment(a, b, strokeWidth, swayEntry, fiber) {
    const midY = (a.cy + b.cy) / 2;
    const sway = (meanderHash(swayEntry) - 0.5) * MAX_MEANDER * 0.85;
    const cp1x = a.cx + sway;
    const cp1y = midY - VERTICAL_SPACING * 0.22;
    const cp2x = b.cx - sway;
    const cp2y = midY + VERTICAL_SPACING * 0.22;

    // Ink-brush taper: width varies along segment. Approximate with two
    // half-widths (start & end) and a smooth taper between.
    const startHalf = strokeWidth * (0.55 + fiber * 0.2);
    const endHalf = strokeWidth * (0.85 - fiber * 0.1);

    const d = [
      `M ${a.cx - startHalf} ${a.cy}`,
      `C ${cp1x - startHalf} ${cp1y}, ${cp2x - endHalf} ${cp2y}, ${b.cx - endHalf} ${b.cy}`,
      `L ${b.cx + endHalf} ${b.cy}`,
      `C ${cp2x + endHalf} ${cp2y}, ${cp1x + startHalf} ${cp1y}, ${a.cx + startHalf} ${a.cy}`,
      "Z",
    ].join(" ");

    const seg = document.createElementNS(SVG_NS, "path");
    seg.setAttribute("d", d);
    return seg;
  }

  function buildPathSvg(entries, totalHeight, pathWidth, isNewestPulsing) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "walk-path");
    svg.setAttribute("viewBox", `0 0 ${pathWidth} ${totalHeight}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    svg.style.height = `${totalHeight}px`;

    const centerX = pathWidth / 2;

    const positions = entries.map((entry, i) => ({
      cx: centerX + meanderOffset(entry) * (pathWidth / PATH_WIDTH),
      cy: TOP_INSET + i * VERTICAL_SPACING + VERTICAL_SPACING / 2,
      entry,
      index: i,
    }));

    // Path segments (main + two fiber layers).
    for (let i = 0; i < positions.length - 1; i++) {
      const a = positions[i];
      const b = positions[i + 1];
      const t = positions.length > 1 ? i / (positions.length - 1) : 0;
      const width = BASE_STROKE + (MAX_STROKE - BASE_STROKE) * (1 - t) * 0.75;

      // Main ink stroke
      const main = buildBrushSegment(a, b, width, a.entry, 0);
      main.setAttribute("filter", "url(#brush-fiber)");
      let cls = "walk-path-segment";
      if (t > 0.7) cls += " walk-path-segment--oldest";
      else if (t > 0.4) cls += " walk-path-segment--older";
      main.setAttribute("class", cls);
      main.style.setProperty("--seg-i", String(i));
      svg.append(main);

      // Fiber overlays — thinner paths at low opacity for brush-hair effect
      const fiber1 = buildBrushSegment(a, b, width * 0.42, b.entry, 0.6);
      fiber1.setAttribute("class", "walk-path-fiber");
      fiber1.style.setProperty("--seg-i", String(i));
      svg.append(fiber1);

      const fiber2 = buildBrushSegment(a, b, width * 0.28, a.entry, -0.8);
      fiber2.setAttribute("class", "walk-path-fiber");
      fiber2.setAttribute("transform", "translate(0.6, 0)");
      fiber2.style.setProperty("--seg-i", String(i));
      svg.append(fiber2);
    }

    // Dots
    const filterIds = ["sumi-dot", "sumi-dot-2", "sumi-dot-3"];
    for (const pos of positions) {
      const { entry, cx, cy, index } = pos;
      const baseR = DOT_RADIUS[entry.kind] ?? 8;
      const color = seasonColor(seasonForDate(entry.date));

      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "walk-dot-group");
      group.setAttribute("transform", `translate(${cx} ${cy})`);
      group.style.setProperty("--dot-i", String(index));

      // Ambient bleed (lighter, larger, distorted)
      const bleed = document.createElementNS(SVG_NS, "circle");
      bleed.setAttribute("class", "walk-dot-bleed");
      bleed.setAttribute("r", String(baseR * 2.1));
      bleed.setAttribute("fill", color);
      group.append(bleed);

      // Main dot body — sumi-e filter gives irregular edge
      const body = document.createElementNS(SVG_NS, "circle");
      const filterPick = filterIds[(meanderHash(entry) * 100 | 0) % filterIds.length];
      body.setAttribute("class", "walk-dot-body" + (filterPick !== "sumi-dot" ? " walk-dot-body--irregular" : ""));
      body.setAttribute("r", String(baseR));
      body.setAttribute("fill", color);
      body.setAttribute("filter", `url(#${filterPick})`);
      group.append(body);

      // Dark ink pool at center
      const pool = document.createElementNS(SVG_NS, "circle");
      pool.setAttribute("class", "walk-dot-pool");
      pool.setAttribute("r", String(baseR * 0.42));
      pool.setAttribute("fill", cssVar("--walk-ink"));
      group.append(pool);

      // Highlight sheen
      const hl = document.createElementNS(SVG_NS, "circle");
      hl.setAttribute("class", "walk-dot-highlight");
      hl.setAttribute("r", String(baseR * 0.3));
      hl.setAttribute("cx", String(-baseR * 0.25));
      hl.setAttribute("cy", String(-baseR * 0.3));
      group.append(hl);

      // Letter ring
      if (entry.kind === "letter") {
        const ring = document.createElementNS(SVG_NS, "circle");
        ring.setAttribute("class", "walk-dot-ring");
        ring.setAttribute("r", String(baseR + 4));
        ring.setAttribute("stroke", color);
        group.append(ring);
      }

      svg.append(group);
    }

    // Ripples on newest dot
    if (isNewestPulsing && positions.length > 0) {
      const top = positions[0];
      const topColor = seasonColor(seasonForDate(top.entry.date));
      for (let k = 0; k < 2; k++) {
        const r = document.createElementNS(SVG_NS, "circle");
        r.setAttribute("class", "walk-dot-ripple" + (k ? " walk-dot-ripple--delayed" : ""));
        r.setAttribute("cx", String(top.cx));
        r.setAttribute("cy", String(top.cy));
        r.setAttribute("r", "12");
        r.setAttribute("fill", "none");
        r.setAttribute("stroke", topColor);
        svg.append(r);
      }
    }

    // Duck marker — wrapped in an <a> that links to chiefrubberduck.com
    if (positions.length > 0) {
      const top = positions[0];
      const duckSize = 34;

      const anchor = document.createElementNS(SVG_NS, "a");
      anchor.setAttribute("class", "walk-duck-link");
      anchor.setAttribute("href", DUCK_LINK);
      anchor.setAttributeNS(XLINK_NS, "xlink:href", DUCK_LINK);
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");

      const img = document.createElementNS(SVG_NS, "image");
      img.setAttributeNS(XLINK_NS, "xlink:href", DUCK_GIF);
      img.setAttribute("href", DUCK_GIF);
      img.setAttribute("class", "walk-duck-marker");
      img.setAttribute("x", String(top.cx - duckSize / 2));
      img.setAttribute("y", String(top.cy - duckSize * 0.95));
      img.setAttribute("width", String(duckSize));
      img.setAttribute("height", String(duckSize));

      anchor.append(img);
      svg.append(anchor);
    }

    return { svg, positions };
  }

  // ---- Moon + theme + constellation ----

  function initMoonAndTheme() {
    const moonBtn = document.getElementById("walk-moon");
    if (!moonBtn) return;

    // Restore saved theme
    const saved = localStorage.getItem("pilgrim-theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
    renderMoonInto(moonBtn);

    // Single click — toggle light/dark
    let clickCount = 0;
    let clickTimer = null;
    moonBtn.addEventListener("click", () => {
      clickCount++;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        if (clickCount === 1) {
          const current = document.documentElement.getAttribute("data-theme");
          const next = current === "dark" ? "light" : "dark";
          document.documentElement.setAttribute("data-theme", next);
          localStorage.setItem("pilgrim-theme", next);
          renderMoonInto(moonBtn);
        }
        clickCount = 0;
      }, 380);

      // Triple-click → constellation
      if (clickCount >= 3) {
        clearTimeout(clickTimer);
        clickCount = 0;
        document.body.classList.toggle("constellation");
      }
    });
  }

  function renderMoonInto(el) {
    if (window.Moon && typeof window.Moon.renderMoon === "function") {
      window.Moon.renderMoon(el);
    }
  }

  // ---- Main ----

  async function main() {
    initMoonAndTheme();

    const journey = document.querySelector(".walk-journey");
    const empty = document.getElementById("walk-empty");
    if (!journey) return;

    let feed;
    try {
      const res = await fetch(FEED_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
      feed = await res.json();
    } catch (err) {
      const stateEl = document.getElementById("walk-state-line");
      if (stateEl) stateEl.textContent = "the duck is somewhere";
      console.error(err);
      return;
    }

    renderStateLine(feed);

    const entries = (feed.entries ?? [])
      .filter((e) => e.route === feed.duck.route)
      .map((e, i) => Object.assign({}, e, { _index: i }));

    if (entries.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }

    const pathWidth = window.matchMedia("(max-width: 640px)").matches
      ? PATH_WIDTH_MOBILE
      : PATH_WIDTH;

    const totalHeight = TOP_INSET + entries.length * VERTICAL_SPACING + BOTTOM_INSET;
    const isRecent = feedAgeDays(feed) < STALE_FEED_DAYS;

    const { svg, positions } = buildPathSvg(entries, totalHeight, pathWidth, isRecent);

    const entriesCol = document.createElement("div");
    entriesCol.className = "walk-entries";
    entriesCol.style.position = "relative";
    entriesCol.style.height = `${totalHeight}px`;

    for (let i = 0; i < entries.length; i++) {
      const card = buildEntryCard(entries[i]);
      card.style.position = "absolute";
      card.style.left = "0";
      card.style.right = "0";
      card.style.top = `${positions[i].cy - 14}px`;
      entriesCol.append(card);
    }

    journey.append(svg);
    journey.append(entriesCol);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
