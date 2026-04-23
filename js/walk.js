(function () {
  "use strict";

  const FEED_URL =
    "https://cdn.jsdelivr.net/gh/walktalkmeditate/rubberduck-walk@main/feed.json";
  const DUCK_GIF = "assets/duck/duck.gif";
  const SVG_NS = "http://www.w3.org/2000/svg";

  function ageClass(ageDays) {
    if (ageDays <= 30) return "walk-entry--age-recent";
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

  function renderEntry(entry) {
    const el = document.createElement("article");
    el.className = `walk-entry walk-entry--${entry.kind} ${ageClass(entry.ageDays)}`;

    const meta = document.createElement("div");
    meta.className = "walk-entry-meta";
    const date = document.createElement("span");
    date.className = "walk-entry-date";
    date.textContent = formatDate(entry.date);
    const stage = document.createElement("span");
    stage.className = "walk-entry-stage";
    stage.textContent = entry.stageName;
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

  function renderStateLine(feed) {
    const el = document.getElementById("walk-state-line");
    if (!el) return;
    const d = feed.duck;
    if (d.mode === "resting") {
      el.textContent = `The duck is resting at ${d.stageName}.`;
    } else if (d.mode === "completing") {
      el.textContent = `The duck is walking toward closure, near ${d.stageName}.`;
    } else {
      el.textContent = `The duck is at ${d.stageName}, stage ${d.stage} of the ${d.routeName}.`;
    }
  }

  function renderMap(feed) {
    const svg = document.getElementById("walk-map");
    if (!svg) return;
    const path = feed.routePath[feed.duck.route];
    if (!path || path.length < 2) return;

    const lons = path.map((p) => p[0]);
    const lats = path.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latRange = maxLat - minLat || 1;
    const lonRange = maxLon - minLon || 1;

    const W = 600;
    const H = 400;
    const PAD = 40;

    function project([lon, lat]) {
      const x = PAD + ((lon - minLon) / lonRange) * (W - 2 * PAD);
      const y = PAD + ((maxLat - lat) / latRange) * (H - 2 * PAD);
      return [x, y];
    }

    const polyline = document.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute(
      "points",
      path.map(project).map((p) => p.join(",")).join(" ")
    );
    polyline.setAttribute("class", "walk-map-route");
    svg.append(polyline);

    for (const entry of feed.entries) {
      if (!entry.coords) continue;
      const [x, y] = project(entry.coords);
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", String(x));
      c.setAttribute("cy", String(y));
      c.setAttribute("r", "3");
      c.setAttribute("class", "walk-map-entry-dot");
      svg.append(c);
    }

    const [dx, dy] = project(feed.duck.coords);
    const img = document.createElementNS(SVG_NS, "image");
    img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", DUCK_GIF);
    img.setAttribute("href", DUCK_GIF);
    img.setAttribute("x", String(dx - 22));
    img.setAttribute("y", String(dy - 22));
    img.setAttribute("width", "44");
    img.setAttribute("height", "44");
    img.setAttribute("class", "walk-map-duck");
    svg.append(img);
  }

  async function main() {
    try {
      const res = await fetch(FEED_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
      const feed = await res.json();

      renderStateLine(feed);
      renderMap(feed);

      const feedEl = document.getElementById("walk-feed");
      if (feedEl) {
        for (const entry of feed.entries) {
          feedEl.append(renderEntry(entry));
        }
      }
    } catch (err) {
      const stateEl = document.getElementById("walk-state-line");
      if (stateEl) stateEl.textContent = "The duck is somewhere.";
      console.error(err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
