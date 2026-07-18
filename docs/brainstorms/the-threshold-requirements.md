---
date: 2026-07-18
topic: the-threshold
---

# The Threshold — Phase 2 of the Conversion Elevation

## Summary

Three light, restraint-first enhancements that make the site feel like one coherent, living invitation: an **observatory** (a homepage almanac block gathering all three instruments + a unified footer index — no new page), a **throughline** ("you've already begun; the app is where it continues, daily, on real ground") that unifies the free peaks, and a **light breathing** signal (real moon phase + hour-of-day tint) on the pages that lack one. Sequenced observatory → throughline → breathing.

---

## Problem Frame

Phase 1 (The Bridge) shipped and is live: each free peak now crests into a want with a door right there. But the peaks still read as three separate hand-offs, and the almanac instruments — the secondary "explore an instrument" path — have no home. Discovery is fragmented: the homepage teases `/sunpath` and links `/daylight`, `/moonpath` is reachable only through footer cross-links, and there's no site nav at all. And most of the site sits static while the homepage and `/seek` visibly breathe with real time — so the "living organism" promise is only half-kept. This phase closes those gaps without adding surfaces or engines to maintain (the slow-patience bet). The Continuation (Phase 3) is cut.

---

## Key Flows

- F1. Explore-an-instrument discovery
  - **Trigger:** A visitor not ready to install looks for the almanac (the secondary CTA).
  - **Actors:** the mindfulness-curious visitor.
  - **Steps:** homepage almanac block **or** any footer's instrument index → an instrument (`/sunpath`, `/moonpath`, `/daylight`) → the instrument's close-whisper toward `/seek` (shipped in Phase 1) → the flagship taste → the app.
  - **Outcome:** the instruments are reachable from anywhere and feed the existing funnel, instead of being buried.
  - **Covered by:** R1, R2, R3, R4

---

## Requirements

**Observatory (origin R16)**
- R1. The homepage gains an almanac block that gathers **all three** instruments (Sun Path, Moon Path, Daylight) — each with its name and a one-line description — replacing today's partial teasing (`/sunpath` + `/daylight` only; `/moonpath` absent). It sits within the single-scroll walk without disrupting the threshold → horizon narrative.
- R2. Every page's footer carries a **consistent instrument index** (Sun Path · Moon Path · Daylight), so the almanac is reachable from anywhere (footers cross-link inconsistently today).
- R3. The observatory is discovery, not a new CTA: the block and index link *into* each instrument; the instruments' existing close-whisper to `/seek` carries the funnel onward.

**Throughline (origin R17)**
- R4. A "you've already begun; the app is where it continues, daily, on real ground" motif unifies the free peaks (`/seek`'s reveal bridge, the instrument whispers, the homepage horizon) and the observatory into **one coherent invitation**, so they read as one voice rather than three separate hand-offs.
- R5. The motif is quiet and offered (brand voice) and consistent across surfaces. Its concrete form — a recurring line vs a small shared visual mark — is a design decision; the shared "begun → continues" frame is the fixed intent.

**Breathing — light (origin R18)**
- R6. Pages that lack a living signal (primarily `/now` and the static pages) gain the **real moon phase + an hour-of-day tint**, so the whole site feels tuned to real time — without rebuilding each page's palette.
- R7. The instruments (`/sunpath`, `/moonpath`, `/daylight`) are **excluded** — they already render the real sky, so a generic moon/hour tint would be redundant or conflict.
- R8. The living signal reuses the existing real-moon (`js/moon.js`) and hour/season logic (`js/seasonal.js`), not a new engine.

**Origin flows:** the Phase-1 free peaks (`/seek`, instruments, homepage horizon) feed F1.
**Origin requirements:** realizes the deferred R16 (observatory), R17 (throughline), R18 (breathing) from `docs/brainstorms/conversion-elevation-requirements.md`.

---

## Acceptance Examples

- AE1. **Covers R1.** Given a visitor on the homepage, when they reach the almanac block, then all three instruments are present and reachable (not just Sun Path and Daylight).
- AE2. **Covers R2.** Given a visitor on any page, when they reach the footer, then they find the same Sun Path · Moon Path · Daylight index.
- AE3. **Covers R6.** Given `/now` loads at night, then the page shows the real current moon phase and a night-appropriate tint; at midday it shows a day tint — without a bespoke per-page palette.
- AE4. **Covers R7.** Given a visitor opens `/sunpath`, then no generic moon/hour tint is layered over its own sky rendering.

---

## Success Criteria

- The instruments are discoverable from the homepage **and** every footer — `/moonpath` is no longer buried.
- The free peaks and the observatory read as one coherent "you've begun, it continues" invitation rather than separate hand-offs.
- Pages that were static now carry a quiet living signal (real moon + hour tint), without palette rebuilds or a new engine.
- WCAG AA and `prefers-reduced-motion` preserved on every surface touched.
- Carrying cost stays low: no new page/URL, no new atmospheric engine — a downstream implementer can build each part without inventing product behavior.

---

## Scope Boundaries

- No dedicated `/almanac` or `/observatory` page — the observatory is an in-place enhancement.
- No full unification of page palettes into one atmospheric engine — the breathing is a light shared touch only.
- The instruments are not re-tinted (they already render the real sky).
- Phase 3 (the Continuation — a record you can't take with you unless you download) is **cut**.
- Ambient hour-sound and site-wide hidden "clearings" remain deferred as optional texture, not part of this phase.

---

## Key Decisions

- Observatory = enhance existing surfaces (homepage almanac block + unified footer index), not a new page — restraint, and no new surface to maintain (the slow-patience bet).
- Breathing = a light living touch (real moon + hour tint) on the pages that lack it, not a palette refactor — captures the "alive" feeling at low carrying cost.
- Sequencing: observatory → throughline → breathing (concrete discovery first, atmospheric polish last).
- Throughline intent fixed (one coherent "begun → continues" invitation); the exact mechanism (line vs visual mark) is deferred to design.

---

## Dependencies / Assumptions

- The living signal reuses `js/moon.js` (real moon phase) and `js/seasonal.js` (hour/season) rather than new logic.
- Assumes the homepage's single-scroll walk can host an almanac block without disrupting the threshold → horizon narrative (placement resolved in planning).
- Relies on the Phase-1 instrument close-whisper to `/seek` (shipped) to carry the observatory's funnel onward.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Design] Where the homepage almanac block sits within the walk (which section, before/after the horizon) so it reads as part of the journey, not a bolted-on index.
- [Affects R4, R5][Design] The throughline's concrete mechanism — a recurring line, a small shared visual mark, or both.
- [Affects R6][Technical] The exact set of pages that receive the living signal (confirm `/now` + which static pages; exclude the instruments per R7).
