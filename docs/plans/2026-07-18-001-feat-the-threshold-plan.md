---
title: "feat: The Threshold — observatory, throughline, light breathing"
type: feat
status: active
date: 2026-07-18
origin: docs/brainstorms/the-threshold-requirements.md
---

# feat: The Threshold — observatory, throughline, light breathing

## Summary

Three light, restraint-first enhancements, sequenced observatory → throughline → breathing: expand the homepage's Sun Path teaser into an almanac block gathering all three instruments and add a consistent instrument index to every footer (observatory); weave a shared "you've already begun; the app is where it continues, daily, on real ground" verbal frame across the free peaks + observatory (throughline); and give `/now` and the static pages a living signal — the real moon + a subtle hour-of-day wash — reusing the existing engines without a palette refactor (breathing).

---

## Problem Frame

Phase 1 shipped (PR #11, live). But the free peaks still read as separate hand-offs, the almanac instruments have no home (the homepage visually teases only `/sunpath`; `/moonpath` appears nowhere; no footer links the instruments from non-instrument pages), and most of the site sits static while the homepage and `/seek` visibly breathe. Full framing in the origin (see Sources & References). The Continuation (Phase 3) is cut.

---

## Requirements

*(R-IDs trace to the origin `docs/brainstorms/the-threshold-requirements.md`.)*

**Observatory**
- R1. Homepage almanac block gathers all three instruments (Sun Path, Moon Path, Daylight), within the walk, without disrupting threshold → horizon.
- R2. A consistent instrument index (Sun Path · Moon Path · Daylight) in every page's footer.
- R3. Discovery, not a new CTA — links into the instruments; the Phase-1 close-whisper to `/seek` carries the funnel.

**Throughline**
- R4. A shared "you've already begun; the app is where it continues, daily, on real ground" frame unifies the free peaks (`/seek` reveal bridge, instrument whispers, homepage horizon) + the observatory into one invitation.
- R5. Quiet and offered; consistent across surfaces; the sibling idioms from Phase 1 are preserved.

**Breathing (light)**
- R6. Pages that lack a living signal (`/now` + the static pages) gain the real moon phase + an hour-of-day tint, without rebuilding their palettes.
- R7. Instruments (`/sunpath`, `/moonpath`, `/daylight`) are excluded (they render the real sky).
- R8. Reuse `js/moon.js` for the real moon. The hour-wash tint is a small **DOM-free table** of its own — `js/seasonal.js`'s time logic is unexported and returns HSL *deltas* (not a wash color), so it is not the tint source. Still no per-page palette engine.

**Origin flows:** F1 (explore-an-instrument discovery).
**Origin acceptance examples:** AE1 (R1), AE2 (R2), AE3 (R6), AE4 (R7).

---

## Scope Boundaries

- No dedicated `/almanac` or `/observatory` page — the observatory is in-place.
- No palette refactor — the breathing is a wash overlay + moon, each page keeps its colors.
- Instruments are not re-tinted; `/seek` (own hour theming) and `guide`/`compare` (already load moon + seasonal) are left as they are.
- Phase 3 (the Continuation) is cut; ambient hour-sound and site-wide hidden clearings remain deferred texture.

### Deferred to Follow-Up Work

- `found.html` / `walk.html` already load `js/moon.js` but not seasonal; whether they gain the hour wash is confirmed during U5, not assumed.

---

## Context & Research

### Relevant Code and Patterns

- `index.html` — the Sun Path teaser: `<a href="/sunpath" class="home-sunpath-link" data-umami-event="click-sunpath-teaser">` (~line 1746) rendered live by `js/home-sunpath-teaser.js` (loaded ~1858); `/daylight` appears only in JSON-LD, `/moonpath` nowhere. The homepage moon is `.moon-phase#moon-toggle` (~line 991), rendered by `js/moon.js` and doubling as the dark-mode toggle. Seasonal tint via `js/seasonal.js` (`applySeasonalColors()` sets `--stone` etc. on `documentElement`); a `#seasonal-haiku` reflects it.
- `js/moon.js` (82 lines) — `getMoonPhase(date)` → 0..1, `getMoonPhaseName(phase)`, `renderMoon(container, phaseValue)`. Pure + a render helper; reusable on any page.
- `js/seasonal.js` (186 lines) — `getSeasonalTransform(date)`, `getTimeOfDayModifier(hour)`, `applySeasonalColors()`, `getCurrentSeason()`; drives the homepage's continuous hour+season tint. The hour→hue logic is the source for the light wash (used to derive a wash color, not to rewrite a page's palette).
- `/seek`'s per-hour theming (`html[data-hour="day|golden|night"]` set before paint) is the reference for wash hues.
- Footers vary per page: `index.html` `<footer class="horizon section">`, `walk.html` `.walk-footer`, `press/privacy/terms` `.legal-footer section`, `now`/`found`/`guide`/`compare` bespoke. **None of the non-instrument pages link the instruments today.** The instrument pages (`sunpath`/`moonpath`/`daylight`) DO cross-link in their footers, but inconsistently (each omits itself / varies) — U2 unifies them.
- Quiet in-copy link pattern to mirror: `css/now.css` `.milestone-line a` (warm ink, hairline underline). Instrument whisper styling: `.{page}-close-whisper` (shipped Phase 1).

### Which pages load the engines today
- Both moon + seasonal: `index`, `guide`, `compare` (already breathe → excluded from breathing).
- Moon only: `found`, `walk`.
- Neither: **`now`, `press`, `privacy`, `terms`, `404`** (the breathing targets). `/seek` has its own hour theming (excluded).

### Institutional Learnings
- `docs/solutions/` does not exist. Project memory: `almanac_aesthetic` (no CTAs on entry pages — a quiet whisper to `/seek` is permitted; slow-patience restraint), `brand_voice` (quiet/offered-never-sold), `conversion_elevation` (Phase 1 shipped; Phase 3 cut).

---

## Key Technical Decisions

- Observatory = enhance the existing homepage teaser + footers, no new page (origin decision) — keeps the Sun Path live preview as the featured instrument and adds Moon Path + Daylight as a quiet index beside it.
- Breathing hour tint = a **subtle wash overlay** (a fixed, low-opacity tinted layer) whose color comes from a small **DOM-free `hourTint` table** in its own module — NOT from `js/seasonal.js` (unexported, HSL deltas) and NOT by shifting a page's palette vars. The real moon is reused from `js/moon.js`. Each page keeps its identity; carrying cost stays low.
- Breathing splits into a DOM-free `hourTint` module (dual-export, node-requireable — the `js/seek-word.js` pattern) plus a DOM-wiring file guarded behind `typeof document`, because a single bare-IIFE file can't both touch the DOM at load and be `require`d in a node test (the Phase-1 `seek.js` lesson).
- The breathing moon uses a **distinct class/id** (not `.moon-phase#moon-toggle`), so `js/main.js`'s dark-mode-toggle wiring can never hijack it into a toggle.
- Throughline = a shared **verbal frame** ("begun → continues, daily, on real ground") woven across the peaks + observatory — the connective tissue, not a new visual-mark system and not a rewrite of Phase-1's sibling idioms.
- Footer index = a consistent text index (Sun Path · Moon Path · Daylight) on every page's footer (discovery, no CTA), styled to each footer's own link treatment; unifies the instruments' existing cross-links.
- The only real logic — the hour→wash-tint mapping — is extracted as a pure, node-testable helper; everything else is markup/CSS/copy verified in the browser.

---

## Open Questions

### Resolved During Planning
- Breathing mechanism: a wash overlay + moon, not a palette refactor (confirmed with user).
- Breathing tint source: a small DOM-free `hourTint` table, NOT `js/seasonal.js` (its logic is unexported and returns HSL deltas) — surfaced by the doc review.
- Throughline mechanism: a shared verbal frame, not a new visual mark (confirmed).
- Reach: footer index on every page; breathing on `/now` + the legal/static pages (confirmed).
- `found`/`walk` breathing: **excluded** from Phase 2 (they already render a `#moon-toggle` moon); deferred to follow-up.

### Deferred to Implementation
- Exact placement of the almanac block relative to the horizon (the teaser sits outside `</main>` before the footer) so it reads as the walk's last stop, not a branching menu.
- Exact `hourTint` values (color + alpha per hour bucket), tuned live so no page's text drops below 4.5:1 in either mode — the input the AA compositing test needs.
- The reference-frame wording for the throughline (U3) — a short shared line, varied per surface.

---

## Implementation Units

### U1. Homepage almanac block (observatory)

**Goal:** Expand the homepage's Sun Path teaser area into an almanac block presenting all three instruments — Sun Path (the existing live teaser, featured) plus Moon Path and Daylight as a quiet index — within the walk, without disrupting the threshold → horizon narrative.

**Requirements:** R1, R3 · **Covers** F1, AE1

**Dependencies:** None

**Files:**
- Modify: `index.html` (the Sun Path teaser section ~1746 and surrounding markup)
- Modify: `css/styles.css` or the homepage inline `<style>` (almanac-block styling)
- Reference: `js/home-sunpath-teaser.js` (keep the live Sun Path preview working)

**Approach:**
- Keep the existing live Sun Path teaser as the featured instrument; add Moon Path and Daylight as a **quiet, visually-subordinate stacked text list** beside/below it — each a name + one-line description + link (mirroring `css/now.css` `.milestone-line a`), **not** an equal-weight card/grid (which would read as a generic feature grid next to the one live-rendered instrument).
- Distinct discovery events: `click-moonpath-teaser`, `click-daylight-teaser` (mirroring `click-sunpath-teaser`).
- Placement: the Sun Path teaser + Collective Trail currently sit **outside `</main>`, just before the horizon footer** (not "mid-walk"). The almanac block extends that existing location; the exact spot relative to the horizon is a design decision (see Open Questions) — but it must read as the walk's last *stop*, not a discovery menu that branches attention out of the funnel before the horizon.
- No CTA — links into the instruments (discovery); the Phase-1 close-whisper carries the funnel onward.
- WCAG AA at the seasonal worst-case × both modes + reduced-motion (the Sun Path preview handles its own motion; the added index is static links).

**Patterns to follow:** `js/home-sunpath-teaser.js` + the `.home-sunpath-link` treatment; `css/now.css` `.milestone-line a` for quiet links; the instrument footer cross-link style.

**Test scenarios:**
- Covers AE1. Happy path: all three instruments present and reachable from the homepage (browser-verified).
- Happy path: `click-moonpath-teaser` / `click-daylight-teaser` present on their links (attribute check).
- Edge: the Sun Path live preview still renders (browser-verified).
- Accessibility: block text/links ≥4.5:1 at the seasonal worst-case × both modes (contrast-checked).

**Verification:** the homepage almanac block shows and links all three instruments with distinct events; the walk narrative and the Sun Path preview are intact.

---

### U2. Unified footer instrument index (observatory)

**Goal:** A consistent Sun Path · Moon Path · Daylight index in every page's footer, and unify the instrument pages' existing cross-links to the same shape.

**Requirements:** R2, R3 · **Covers** AE2

**Dependencies:** None

**Files:**
- Modify existing footers: `index.html`, `now.html`, `found.html`, `walk.html`, `press.html`, `privacy.html`, `terms.html`, `404.html`
- **Author a footer where none exists:** `guide.html` and `compare.html` have **no `<footer>`** — they end with a hard app-store CTA (`.guide-closing` / `.compare-closing`). Add a minimal quiet footer (or attach the index by the closing back-link), decoupled from that CTA so a soft discovery index doesn't sit flush against a hard "download" CTA (R3).
- Modify (unify existing cross-links): `sunpath/index.html`, `moonpath/index.html`, `daylight/index.html`
- Modify CSS: `css/styles.css`, `css/now.css`, `css/walk.css`, `css/legal.css`, `css/found.css`, `css/404.css`, `css/sunpath.css`, `css/moonpath.css`, `css/daylight.css` (`found.css`/`404.css` were missing from the earlier list; those two pages load only their own CSS)

**Approach:**
- Add a consistent instrument index (three links: `/sunpath`, `/moonpath`, `/daylight`, labelled Sun Path · Moon Path · Daylight) to each footer, styled quietly in that footer's own idiom.
- On the instrument pages, normalize the existing cross-links to the same three-item index (they currently omit self / vary).
- A shared discovery event per link (e.g., `footer-instrument-sunpath`), or one grouped marker.
- Text index only (no CTA), matching the almanac restraint.

**Patterns to follow:** each page footer's existing link markup where one exists; the instrument footers' current cross-link block. For `guide`/`compare` (no footer), mirror the quietest existing footer (e.g. `legal-footer`), not the adjacent CTA.

**Test scenarios:**
- Covers AE2. Happy path: **every** target footer shows the same three-instrument index and the links resolve (browser-verified per footer — they span independent CSS files, not one-per-"type").
- Accessibility: the index links ≥4.5:1 in **each** footer's palette, including dark mode and (for `index.html`) the seasonal extreme (contrast-checked per footer).
- Test expectation: none for logic — markup/links/styling.

**Verification:** every page's footer carries the same instrument index; `/moonpath` is reachable from anywhere; instrument pages' cross-links are unified.

---

### U3. The "you've already begun" throughline

**Goal:** Weave a shared "you've begun; the app is where it continues, daily, on real ground" verbal frame across the free peaks (`/seek` reveal bridge, instrument whispers, homepage horizon) and the observatory, so they read as one invitation while keeping their distinct idioms.

**Requirements:** R4, R5

**Dependencies:** U1 (the observatory block carries the motif)

**Files:**
- Modify: `index.html` (horizon bridge + the U1 almanac block), `seek.html` (reveal bridge copy), `sunpath/index.html`, `moonpath/index.html`, `daylight/index.html` (whisper copy)

**Approach:**
- Fix a **reference frame** first — one short shared phrasing of "you've begun; it continues, daily, on real ground" (e.g. *"…and in the app, this happens on real ground, every walk."*) — then adjust each peak's existing line so it *echoes* that frame in its own idiom (sun/moon/daylight/threshold/fog). Connective tissue, not a rewrite; preserve each sibling idiom.
- Add the frame to the observatory block (the almanac points at "the app, daily").
- Guard the failure mode: the same line repeated verbatim across `/seek` + three whispers + the horizon + the observatory reads as a **repeated sell-line** (anti-brand). Vary the wording per surface while keeping the shared frame; it must still *offer*, not sell.
- Mechanism is verbal (no new visual mark). Quiet/offered, brand voice.

**Patterns to follow:** the Phase-1 bridge/whisper copy already in these files.

**Test scenarios:**
- Happy path: reading the peaks + observatory in sequence, the shared "begun → continues daily on real ground" frame recurs and points the reader at a concrete continuation (begin the practice for real in the app) — not a decorative refrain, and not the same sentence five times (browser/manual review).
- Edge: each peak's sibling idiom is intact and the frame still *offers* rather than sells (manual review).
- Accessibility: any changed copy stays ≥4.5:1 (contrast-checked where color is involved).
- Test expectation: none for logic — copy consistency.

**Verification:** the peaks + observatory share the "begun → continues, daily, on real ground" frame in one voice, sibling idioms preserved, still offered-not-sold.

---

### U4. Light breathing helper + `/now`

**Goal:** Give `/now` a living signal — the real moon phase + a subtle hour-of-day wash — reusing `js/moon.js` and `js/seasonal.js`, without rebuilding `/now`'s palette.

**Requirements:** R6, R8 · **Covers** AE3

**Dependencies:** None (sequenced after U1–U3 per origin)

**Files:**
- Create: `js/breathe-tint.js` — a DOM-free `hourTint(date)` module (dual-export, node-requireable; the `js/seek-word.js` / `js/collective-routes.js` pattern)
- Create: `js/breathe-tint.test.js` — node test of `hourTint`
- Create: `js/breathe.js` — the DOM wiring (render the moon via `js/moon.js`, apply the wash), guarded behind `typeof document !== 'undefined'` so it stays require-safe
- Modify: `now.html` (load `js/moon.js` → `js/breathe-tint.js` → `js/breathe.js`, in that order; add a moon element with a **distinct** class/id + a wash-overlay element), `css/now.css` (wash + moon styling)

**Approach:**
- Render the real moon (`js/moon.js` `renderMoon`) into a quiet element with a **distinct class/id** (not `.moon-phase#moon-toggle`), and guard `renderMoon` against a null container (it calls `setAttribute` immediately).
- Apply a subtle hour-of-day **wash**: a fixed, low-opacity tinted overlay whose color comes from the pure `hourTint(date)` table in `js/breathe-tint.js` — a small DOM-free hour→(color, alpha) map of its own (NOT `js/seasonal.js`, whose time logic is unexported and returns HSL deltas). Layered behind content; does NOT touch `/now`'s palette tokens.
- `js/breathe.js` wires it up (moon + wash), DOM-guarded, loaded after the two dependencies.
- Reduced-motion: the wash and moon are static (no animation).
- AA: the wash sits behind text; verify `/now` body text stays ≥4.5:1 with the wash **alpha-composited over `--paper`** in **both light and dark modes**, across hours.

**Execution note:** implement `hourTint` test-first — it's the only pure logic in the breathing.

**Patterns to follow:** the DOM-free dual-export module shape of `js/seek-word.js` / `js/collective-routes.js` (for `breathe-tint.js`); `js/moon.js` `renderMoon`; `/seek`'s day/golden/night hues as a wash reference; the contrast helper in `js/seek-contrast.test.js` (extended with alpha-compositing).

**Test scenarios:**
- Covers AE3. Happy path: `/now` at night shows the real moon phase + a night wash; at midday, a day wash (browser-verified).
- Happy path (`hourTint`): representative hours map to the expected (color, alpha) bucket (node test on the DOM-free module).
- Edge: a null moon/wash container does not throw (the guard) (browser-verified).
- Edge: `prefers-reduced-motion` → no animation on the wash or moon (browser-verified).
- Accessibility: a contrast test **alpha-composites** `hourTint`'s (color, alpha) over `/now`'s `--paper` (light AND dark), then asserts the text token ≥4.5:1 across hours — OR, if the compositing math is deferred, an explicit manual per-hour × per-mode checklist (not folded into "browser-verified").

**Verification:** `/now` breathes (real moon + hour wash) without a palette rewrite; AA holds across hours **and both modes**; reduced-motion honored; the moon element is decoupled from the dark-mode toggle.

---

### U5. Extend light breathing to the static/legal pages

**Goal:** Apply the same light breathing (moon + hour wash) to the static/legal pages that lack it — `press`, `privacy`, `terms`, `404` — reusing the U4 helper, and confirm the instrument exclusion.

**Requirements:** R6, R7 · **Covers** AE4

**Dependencies:** U4 (`js/breathe.js`)

**Files:**
- Modify: `press.html`, `privacy.html`, `terms.html`, `404.html` (load `js/moon.js` → `js/breathe-tint.js` → `js/breathe.js`; add the moon element + wash), their CSS (`css/legal.css`, `css/404.css`)
- **Excluded:** `found.html`, `walk.html` already load `js/moon.js` + `js/main.js` and render their own `#moon-toggle` moon — `js/breathe.js` must not double-render a moon there. Their breathing is **deferred to follow-up**, not decided here.

**Approach:**
- Include the U4 breathing helper on each target page (`press`, `privacy`, `terms`, `404`); verify AA on each page's palette with the wash, in both modes.
- Explicitly do NOT touch: the instruments (`/sunpath`, `/moonpath`, `/daylight` — real sky), `/seek` (own theming), `guide`/`compare` (already load moon + seasonal), and `found`/`walk` (already render a `#moon-toggle` moon — avoid a double moon).
- Keep the treatment identical/consistent with `/now`; coordinate the `css/404.css` edit with U2's footer-index edit to the same file (avoid two uncoordinated changes).

**Test scenarios:**
- Happy path: each target page (`press`/`privacy`/`terms`/`404`) shows the moon + hour wash consistently with `/now` (browser-verified per page).
- Covers AE4. Edge: opening an instrument page — and `found`/`walk` — shows **no** added second moon / wash (browser-verified — the exclusions hold).
- Accessibility: each page's text ≥4.5:1 with the wash, both modes (contrast-checked).
- Test expectation: none for logic beyond the shared helper (covered in U4).

**Verification:** the static/legal pages breathe consistently with `/now`; the instruments and already-breathing pages are untouched.

---

## System-Wide Impact

- **Interaction graph:** breathing adds two files — a DOM-free `js/breathe-tint.js` (`hourTint`) and the DOM-wiring `js/breathe.js` — reusing `js/moon.js` untouched (not `js/seasonal.js`). The breathing moon uses a distinct class/id so `js/main.js`'s `.moon-phase` → dark-mode-toggle wiring can't hijack it; `js/main.js` isn't loaded on the target pages today, but the distinct id keeps it safe if it ever is.
- **API surface parity:** the footer instrument index (U2) and the almanac block (U1) share the same three routes; keep labels/links consistent.
- **Unchanged invariants:** no new page/URL; `js/moon.js` reused untouched (the hour-wash tint is a small new DOM-free table, not `js/seasonal.js`); the instruments, `/seek`, `guide`, `compare`, `found`, `walk` are not re-themed; Phase-1 peak copy keeps its sibling idioms.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The wash overlay drops text below WCAG AA | Verify by alpha-compositing the wash (color, alpha) over each page's bg token in both modes × hours; keep opacity low. A two-hex-token test (`seek-contrast`) is insufficient here. |
| `guide.html`/`compare.html` have no footer — U2 must author one next to an existing hard CTA | Add a minimal quiet footer decoupled from the `.guide-closing`/`.compare-closing` app-store CTA (R3, discovery-not-CTA). |
| U2 touches ~13 footers spanning independent CSS + dark mode + seasonal | One consistent link-group pattern; AA-verify **every** footer's own CSS (not a sample); text-only, no CTA. |
| A single `js/breathe.js` couldn't both touch the DOM at load and be node-required | Split: DOM-free `js/breathe-tint.js` (`hourTint`, requireable) + DOM-guarded `js/breathe.js` — the Phase-1 `seek-word.js` lesson. |
| The breathing moon gets hijacked into a dark-mode toggle by `js/main.js` | Distinct class/id (not `.moon-phase#moon-toggle`); guard `renderMoon` against a null container. |
| The throughline reads as a repeated sell-line, or stays decorative | Fix a reference frame, vary per surface, anchor acceptance to the concrete continuation it opens (not just recurrence); preserve sibling idioms; still offers. |

---

## Sources & References

- **Origin document:** docs/brainstorms/the-threshold-requirements.md
- Upstream (Phase 1): docs/brainstorms/conversion-elevation-requirements.md, docs/plans/2026-07-17-001-feat-conversion-elevation-plan.md (shipped as PR #11)
- Positioning: `PRODUCT.md`; project memory `almanac_aesthetic`, `brand_voice`, `conversion_elevation`
- Related code: `index.html`, `js/home-sunpath-teaser.js`, `js/moon.js`, `js/seasonal.js`, `now.html`, `css/now.css`, the instrument pages + footers
