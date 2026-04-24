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
  const DUCK_LINK = "https://chiefrubberduck.org";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const STALE_FEED_DAYS = 10;

  // Layout constants (matching CalligraphyPathRenderer's verticalSpacing/maxMeander/topInset).
  const VERTICAL_SPACING = 124;
  const MAX_MEANDER = 32;  // ~1/4 of vertical spacing, like the app
  const TOP_INSET = 40;
  const BOTTOM_INSET = 72;
  const STROKE_MIN = 1.6;
  const STROKE_MAX = 3.6;
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

  function renderStatsLine(feed) {
    const el = document.getElementById("walk-stats-line");
    if (!el) return;
    const d = feed.duck;
    const parts = [];
    if (typeof d.daysOnRoute === "number") {
      parts.push(`day ${Math.max(1, d.daysOnRoute)}`);
    }
    if (typeof d.kmFromStart === "number" && typeof d.totalKm === "number") {
      parts.push(`${formatKm(d.kmFromStart)} of ${d.totalKm} km`);
    } else if (typeof d.kmFromStart === "number") {
      parts.push(`${formatKm(d.kmFromStart)} km`);
    }
    if (parts.length === 0) {
      el.textContent = "";
      return;
    }
    el.textContent = "";
    parts.forEach((p, i) => {
      if (i > 0) {
        const sep = document.createElement("span");
        sep.className = "walk-stats-sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "·";
        el.append(sep);
      }
      const span = document.createElement("span");
      span.textContent = p;
      el.append(span);
    });
  }

  function formatKm(v) {
    if (v >= 10) return String(Math.round(v));
    return v.toFixed(1).replace(/\.0$/, "");
  }

  // Render the duck's real geographic route as a faint watermark behind the
  // page. Always draws the full outline so there's geographic context even
  // at stage 1; overlays the walked portion more prominently.
  function renderBgMap(feed) {
    const container = document.getElementById("walk-bgmap");
    if (!container) return;
    const path = feed.routePath ? feed.routePath[feed.duck.route] : null;
    if (!Array.isArray(path) || path.length < 2) return;

    const currentStage = Math.max(1, Math.min(path.length, feed.duck.stage));
    const walked = path.slice(0, currentStage);

    const allLons = path.map((p) => p[0]);
    const allLats = path.map((p) => p[1]);
    const frameLonMin = Math.min(...allLons);
    const frameLonMax = Math.max(...allLons);
    const frameLatMin = Math.min(...allLats);
    const frameLatMax = Math.max(...allLats);
    const lonRange = frameLonMax - frameLonMin || 1;
    const latRange = frameLatMax - frameLatMin || 1;

    const W = 800;
    const H = 800;
    const PAD = 60;

    function project(lon, lat) {
      const x = PAD + ((lon - frameLonMin) / lonRange) * (W - 2 * PAD);
      const y = PAD + ((frameLatMax - lat) / latRange) * (H - 2 * PAD);
      return [x, y];
    }

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "walk-bgmap-svg");

    // Full outline of the route (geographic context — faint)
    const fullPts = path.map((p) => project(p[0], p[1]).join(",")).join(" ");
    const full = document.createElementNS(SVG_NS, "polyline");
    full.setAttribute("points", fullPts);
    full.setAttribute("class", "walk-bgmap-full");
    svg.append(full);

    // Walked portion (only if >= 2 points — else just show the current-pos dot)
    if (walked.length >= 2) {
      const walkedPts = walked.map((p) => project(p[0], p[1]).join(",")).join(" ");
      const w = document.createElementNS(SVG_NS, "polyline");
      w.setAttribute("points", walkedPts);
      w.setAttribute("class", "walk-bgmap-walked");
      svg.append(w);
    }

    // Mark duck's current position
    const last = project(walked[walked.length - 1][0], walked[walked.length - 1][1]);
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(last[0]));
    dot.setAttribute("cy", String(last[1]));
    dot.setAttribute("r", "5");
    dot.setAttribute("class", "walk-bgmap-duck");
    svg.append(dot);

    while (container.firstChild) container.removeChild(container.firstChild);
    container.append(svg);
  }

  // Draw a small moon SVG for a given date, sized to inline with meta text.
  function buildEntryMoon(iso) {
    if (!window.Moon || typeof window.Moon.getMoonPhase !== "function") return null;
    const phase = window.Moon.getMoonPhase(new Date(iso + "T12:00:00Z"));
    const size = 11;
    const half = size / 2;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "walk-entry-moon");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));

    const bg = document.createElementNS(SVG_NS, "circle");
    bg.setAttribute("cx", String(half));
    bg.setAttribute("cy", String(half));
    bg.setAttribute("r", String(half));
    bg.setAttribute("fill", "currentColor");
    bg.setAttribute("fill-opacity", "0.65");
    svg.append(bg);

    const shadow = document.createElementNS(SVG_NS, "path");
    let d;
    if (phase < 0.5) {
      const sweep = 1 - phase * 4;
      d = [
        `M ${half} 0`,
        `A ${half} ${half} 0 0 1 ${half} ${size}`,
        `C ${half + half * sweep} ${half + half * 0.55}, ${half + half * sweep} ${half - half * 0.55}, ${half} 0`,
        "Z",
      ].join(" ");
    } else {
      const sweep = (phase - 0.5) * 4 - 1;
      d = [
        `M ${half} ${size}`,
        `A ${half} ${half} 0 0 1 ${half} 0`,
        `C ${half - half * sweep} ${half - half * 0.55}, ${half - half * sweep} ${half + half * 0.55}, ${half} ${size}`,
        "Z",
      ].join(" ");
    }
    shadow.setAttribute("d", d);
    shadow.setAttribute("fill", "var(--walk-parchment)");
    svg.append(shadow);

    svg.setAttribute("aria-label", window.Moon.getMoonPhaseName(phase));
    return svg;
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
    const moon = buildEntryMoon(entry.date);
    meta.append(date);
    if (moon) meta.append(moon);
    meta.append(stage);
    el.append(meta);

    // Sub-meta: weather + distance-from-last on their own soft line
    const subBits = [];
    if (entry.weather) subBits.push({ cls: "walk-entry-weather", text: entry.weather });
    if (typeof entry.kmSinceLastEntry === "number" && entry.kmSinceLastEntry > 0) {
      subBits.push({
        cls: "walk-entry-km",
        text: `${formatKm(entry.kmSinceLastEntry)} km from the last offering`,
      });
    }
    if (subBits.length > 0) {
      const sub = document.createElement("div");
      sub.className = "walk-entry-meta-sub";
      subBits.forEach((b, i) => {
        if (i > 0) {
          const sep = document.createElement("span");
          sep.className = "walk-stats-sep";
          sep.setAttribute("aria-hidden", "true");
          sep.textContent = "·";
          sub.append(sep);
        }
        const span = document.createElement("span");
        span.className = b.cls;
        span.textContent = b.text;
        sub.append(span);
      });
      el.append(sub);
    }

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

  // Build a single curved stroke segment between two dots. Uses a filter
  // for organic brush-edge variation instead of stacking multiple paths.
  function buildBrushSegment(a, b, strokeWidth, swayEntry) {
    const midY = (a.cy + b.cy) / 2;
    const sway = (meanderHash(swayEntry) - 0.5) * MAX_MEANDER * 0.6;
    const cp1x = a.cx + sway;
    const cp1y = midY - VERTICAL_SPACING * 0.18;
    const cp2x = b.cx - sway;
    const cp2y = midY + VERTICAL_SPACING * 0.18;

    const d = `M ${a.cx} ${a.cy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${b.cx} ${b.cy}`;

    const seg = document.createElementNS(SVG_NS, "path");
    seg.setAttribute("d", d);
    seg.setAttribute("stroke-width", String(strokeWidth));
    seg.setAttribute("stroke-linecap", "round");
    seg.setAttribute("stroke-linejoin", "round");
    seg.setAttribute("fill", "none");
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

    // Path segments — one stroked curve per pair, plus a thin fiber overlay
    // offset slightly for an optical brush-hair effect.
    for (let i = 0; i < positions.length - 1; i++) {
      const a = positions[i];
      const b = positions[i + 1];
      const t = positions.length > 1 ? i / (positions.length - 1) : 0;
      // Newer segments thicker; older segments thinner (ink drying out).
      const width = STROKE_MIN + (STROKE_MAX - STROKE_MIN) * (1 - t);

      const main = buildBrushSegment(a, b, width, a.entry);
      main.setAttribute("filter", "url(#brush-fiber)");
      let cls = "walk-path-stroke";
      if (t > 0.7) cls += " walk-path-stroke--oldest";
      else if (t > 0.4) cls += " walk-path-stroke--older";
      main.setAttribute("class", cls);
      main.style.setProperty("--seg-i", String(i));
      svg.append(main);

      // Single thin fiber overlay, offset 0.6px for brush-hair texture
      const fiber = buildBrushSegment(a, b, Math.max(0.6, width * 0.35), b.entry);
      fiber.setAttribute("class", "walk-path-fiber");
      fiber.setAttribute("transform", "translate(0.6, 0.3)");
      fiber.style.setProperty("--seg-i", String(i));
      svg.append(fiber);
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

    // Duck marker — wrapped in an <a> that links to chiefrubberduck.org.
    // The duck's center sits on the dot's center so it reads as perched on it.
    if (positions.length > 0) {
      const top = positions[0];
      const duckSize = 36;

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
      img.setAttribute("y", String(top.cy - duckSize / 2));
      img.setAttribute("width", String(duckSize));
      img.setAttribute("height", String(duckSize));

      anchor.append(img);
      svg.append(anchor);
    }

    return { svg, positions };
  }

  // ---- Moon + theme + constellation ----

  // Theme cycle: each click advances light → dark → constellation → light.
  const THEME_MODES = ["light", "dark", "constellation"];

  function applyMode(mode) {
    // Map mode to the two orthogonal switches: data-theme + body.constellation
    if (mode === "constellation") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.classList.add("constellation");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
      document.body.classList.remove("constellation");
    }
  }

  function currentMode() {
    if (document.body.classList.contains("constellation")) return "constellation";
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function initMoonAndTheme() {
    const moonBtn = document.getElementById("walk-moon");
    if (!moonBtn) return;

    const saved = localStorage.getItem("pilgrim-mode");
    let mode;
    if (saved && THEME_MODES.includes(saved)) {
      mode = saved;
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      mode = "dark";
    } else {
      mode = "light";
    }
    applyMode(mode);
    renderMoonInto(moonBtn);

    moonBtn.addEventListener("click", () => {
      const i = THEME_MODES.indexOf(currentMode());
      const next = THEME_MODES[(i + 1) % THEME_MODES.length];
      applyMode(next);
      localStorage.setItem("pilgrim-mode", next);
      renderMoonInto(moonBtn);
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
    renderStatsLine(feed);
    renderBgMap(feed);

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
