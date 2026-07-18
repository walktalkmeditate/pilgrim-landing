---
title: "feat: Site Elevation — The Taste That Opens a Want"
type: feat
status: active
date: 2026-07-17
origin: docs/brainstorms/conversion-elevation-requirements.md
---

# feat: Site Elevation — The Taste That Opens a Want

## Summary

Build the conversion spine across four surfaces: convert the homepage `.seek-door` into a self-contained seek hero that hands an intention to `/seek?word=`; give `/seek` a pre-seeded continuation and repair the three critique leaks that break its taste before the bridge; place three sibling bridges (one shared want, each peak in its own voice) at `/seek`'s reveal, the homepage horizon, and each instrument's close as a whisper; and make the download funnel trustworthy. Extends existing patterns (seek.js's `begin(word)`, the seasonal token system, the `data-umami-event` convention) rather than adding machinery.

---

## Problem Frame

The site's most affecting moments spend their emotion and abandon the visitor at the moment they're most open — the `/seek` critique (30/40) proved it, and the pattern repeats at every free peak. Compounding it, `/seek`'s flagship taste can break *before* its bridge (silent stillness resets, 25s-hidden fallback, auto-begin conscription), and at least one funnel event miscounts. Full situational detail lives in the origin doc (see Sources & References).

---

## Requirements

**The Bridge — conversion spine**
- R1. Three sibling bridges — one shared want (*paper map → territory*), each peak in its own voice: `/seek` fog-language, instruments sky-language, homepage threshold-language. Never one copy-pasted line.
- R2. Bridge at `/seek`'s reveal, before the store links.
- R3. Bridge at each instrument's close — as a **whisper** (almanac marginalia, no store badge), per the reconciliation decision.
- R4. Bridge at the homepage horizon — a line before the existing store badges (language, not new buttons).
- R5. Every bridge honors WCAG AA (≥4.5:1 across every season and both modes) and `prefers-reduced-motion`; never gated behind an animation that can fail to fire.

**The seek on-ramp**
- R6. Convert the homepage `.seek-door` into a full seek hero: threshold presence, breathing crescent, intention input.
- R7. Submitting the intention (a control labeled **Seek**, click or Enter) navigates to `/seek?word=<intention>`.
- R8. `/seek` reads `?word=`, and when present skips intention entry, dropping the visitor into the walk pre-seeded.
- R9. Drop the evergreen "New —" framing.

**Repairing the flagship taste**
- R10. Stillness-fill fragility: scroll-reset diagnosis, earlier fallback, scroll tolerance, `visibilitychange` clamp.
- R11. Auto-begin conscription: a seek begins only on visitor intent; the story is reachable freely.
- R12. Golden-theme muted secondary copy clears 4.5:1 (as well as day/night).
- R13. Optional P3 polish: honest sound toggle (in scope, rides with R15); persistent crescent hint (deferred unless trivial).

**Trustworthy measurement**
- R14. Instrument each new bridge so the peak → bridge → download path is legible. No third-party trackers.
- R15. Fix the `seek-sound-on` event miscounting (fires on sound-off too).

**Origin actors:** the mindfulness-curious visitor (single primary; instrument-page reader is the same actor arriving via the almanac).
**Origin flows:** F1 (the flagship taste `/seek`), F2 (an instrument), F3 (the homepage walk).
**Origin acceptance examples:** AE1 (covers R2), AE2 (covers R8), AE3 (covers R10), AE4 (covers R11), AE5 (covers R12).

---

## Scope Boundaries

- The Threshold (observatory, site-wide throughline, atmospheric breathing) — phase two, not this plan.
- The Continuation (a record you can't take with you), ambient hour-sound, site-wide hidden clearings — deferred (origin: `docs/brainstorms/conversion-elevation-requirements.md`).
- No reporting dashboard or analytics pipeline; measurement work is trustworthy events only.
- No third-party trackers; no map library.
- Instrument bridges are whispers, never store CTAs — the no-CTA-on-entry-pages principle holds.

### Deferred to Follow-Up Work

- Persistent crescent-hint fix (R13 second half): included only if trivial during U3; otherwise a follow-up polish pass.
- A dedicated seek.js test harness: not built here — DOM-coupled fixes are browser-verified (see Key Technical Decisions).

---

## Context & Research

### Relevant Code and Patterns

- `index.html` — `.seek-door` markup (lines ~1363–1371: kicker/h2/p/`<a href="/seek">`) and inline `<style>` (~878–943); **two** `.store-badges` blocks firing identical `click-app-store` / `click-google-play` events — the mid-page "Screenshot Journey" CTA (~1422) and the real horizon at `<footer class="horizon section">` (~1711). The R4 bridge belongs at the **horizon footer (~1711)**, not the journey CTA. Seasonal color engine via `js/seasonal.js` (continuous, full-intensity `--stone` drift — not four fixed swatches), real moon via `js/moon.js`.
- `seek.html` — the store links (`seek-app-store` / `seek-google-play`) live in the `.story` section, **not** in the clearing card; the clearing card holds only the keepsake + "Seek again" buttons. `.stillness` is an `aria-live="polite"` region; the arrival has an explicit `<label for="intention-word">`; `<noscript>` routes to the story. `.clearing-halo` overlays the clearing text at full opacity once revealed.
- `js/seek.js` — `begin(word)` (already accepts a word), the stillness state machine (`fillStart`/`startFill`/`cancelFill`/`leaveZone`, rAF `t = (now - fillStart) / STILLNESS_MS`), `autoBeginObserver` (IntersectionObserver forcing begin on scroll), sound toggle (`aria-pressed`), `hourLabel()`. No `URLSearchParams`/`?word` reading and no `visibilitychange` handler exist today.
- `seek.html` — arrival (intention input, begin button), `.clearing` / `#clearing-card` with `seek-app-store` / `seek-google-play` links.
- `css/seek.css` — per-hour theme tokens on `html[data-hour="day|golden|night"]`; failing pair is golden `--ink-fog #8A7457` on `--paper #F5E7CF`; `.arrival-lede--second` and the hour kicker use `--ink-fog`.
- `sunpath/index.html`, `moonpath/index.html`, `daylight/index.html` — instrument pages, each with a quiet footer close and **zero** CTAs today (verified); paired CSS `css/sunpath.css`, `css/moonpath.css`, `css/daylight.css`.
- `css/now.css` `.milestone-line a` — the established pattern for a quiet in-copy link (warm ink, hairline underline that warms on hover); the bridge links should mirror it.
- Test convention: pure modules get `node js/<name>.test.js` (e.g., `js/collective-routes.test.js`, `js/sunpath-math.test.js`); DOM-coupled code has no harness.

### Institutional Learnings

- `docs/solutions/` does not exist — no prior recorded learnings to carry.
- Project memory: almanac pages carry no CTAs by design (slow-patience acquisition); reconciled here by keeping instrument bridges as whispers, not CTAs.

---

## Key Technical Decisions

- The seek hero is self-contained on the homepage (its own small CSS/SVG crescent + inline submit logic), not an import of `js/seek.js` — the homepage is a different page with its own inline styles; importing seek.js's full machinery would be wrong.
- `/seek` is the authority on word sanitization: the hero does minimal encoding (`encodeURIComponent` + the input's maxlength), and `js/seek.js` re-applies the authoritative 32-char clamp/trim on read. Avoids a shared module in a build-free site while keeping defense-in-depth.
- Golden-theme contrast: darken `--ink-fog` per theme (golden primarily; nudge day for headroom, leave night) until the smallest muted text clears 4.5:1 — cleaner than promoting individual elements, and its other uses (borders, hint text) tolerate a darker value. Verified by a pure contrast-ratio test over the token pairs.
- DOM-coupled `/seek` fixes (stillness, auto-begin, `visibilitychange`) are browser-verified via the chrome-devtools tooling; only extractable pure helpers (word sanitize, contrast ratios, stillness timing math) get node tests. No seek.js harness is built in this plan.
- Instrument whispers link to `/seek` (feeding the flagship taste, keeping visitors on-site), not to a store link or the homepage — the gentlest funnel consistent with the almanac's slow-patience bet.
- Bridge copy is authored static in markup (revealed with its surface) and styled per surface, rather than injected by JS — keeps each bridge reachable with JS disabled and immune to animation-fire failures (R5).
- Word sanitization lives in a standalone `js/seek-word.js` module (mirroring `js/collective-routes.js`'s IIFE + `module.exports` seam, zero top-level DOM), loaded before `js/seek.js`, which calls it — because `js/seek.js` is a bare IIFE that touches the DOM at load and cannot be `require`d in node, so a pure helper defined inside it would have no runnable node test.
- All `?word=`-derived text is inserted via `textContent` (never `innerHTML` / template-literal HTML) — the word is attacker-controllable via a crafted link, so safe insertion prevents reflected XSS; `sanitizeWord` also neutralizes HTML-significant characters as defense-in-depth.
- After `begin()` consumes `?word=`, the parameter is stripped from the URL via `history.replaceState` before any analytics beacon fires — the intention word must not leave the page (privacy invariant) and umami reports the page URL by default; this also prevents re-triggering the seeded path on back-navigation.
- The homepage seek hero is a native `<form method="get" action="/seek">` with a `name="word"` input and a `<label>` — it works with JS disabled (matching `/seek`'s own noscript precedent), with the breathing crescent and inline `encodeURIComponent` as progressive enhancement.
- The `/seek` reveal bridge carries its own quiet inline store link (mirroring `css/now.css` `.milestone-line a`) so the peak moment and the download action aren't separated by the ~520svh of path before the `.story` store links.

---

## Open Questions

### Resolved During Planning

- Instrument bridge vs. no-CTA principle: reconciled as a whisper (almanac marginalia), not a CTA.
- Bridge voicing: three sibling idioms (origin decision).
- Where the instrument whisper points: `/seek` (see Key Technical Decisions).

### Deferred to Implementation

- Exact golden `--ink-fog` hex value: chosen against the live background and verified ≥4.5:1 during U4.
- Scroll-tolerance threshold and fallback timing for the stillness gate: tuned against live behavior in U3 (target: fallback appears well before the current 25s and no later than the 9s it bypasses).
- Whether the persistent crescent-hint fix (R13) is trivial enough to land in U3 or becomes follow-up.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

The seek on-ramp continuation, end to end:

```
Homepage seek hero (index.html, self-contained)
  intention input + "Seek" (click / Enter)
        │  builds /seek?word=<encodeURIComponent(intention)>
        ▼
/seek loads (js/seek.js)
  read ?word=  ──present──▶ sanitizeWord() ──▶ begin(word)  ──▶ walk, pre-seeded (arrival skipped)
        │
     absent ──▶ arrival as today (whisper an intention)
```

The stillness gate, repaired (U3):

```
enter zone ──▶ startFill (fillStart = now)
  scroll delta > tolerance ──▶ cancelFill + show "stillness is what it waits for" (not an error)
  tab hidden ──▶ clamp: on return, rebase fillStart so t cannot jump to 1 (no unearned reveal)
  elapsed ≥ early-fallback ──▶ surface "rest here" escape (not at 25s)
  t reaches 1 ──▶ reveal
```

---

## Implementation Units

### U1. Homepage seek hero

**Goal:** Replace the static `.seek-door` link with a self-contained hero — threshold presence, a breathing crescent, and an intention input whose **Seek** control (click or Enter) navigates to `/seek?word=<intention>`. Drop the "New —" kicker.

**Requirements:** R6, R7, R9

**Dependencies:** None (pairs with U2)

**Files:**
- Modify: `index.html` (the `.seek-door` markup ~1363–1371 and its inline `<style>` ~878–943)

**Approach:**
- Replace the kicker/paragraph/link with a native `<form method="get" action="/seek">` containing a labeled intention input (`name="word"`) and a **Seek** submit button — so it navigates with JS disabled by default (no-JS fallback), matching `/seek`'s noscript precedent. Keep the section heading in the seek voice; give the input a `<label>` mirroring `seek.html`.
- Progressive enhancement (JS on): a small self-contained crescent (CSS/inline SVG) breathes slowly (`prefers-reduced-motion` → static); the submit handler `encodeURIComponent`s the word. Enter submits natively via the form.
- Empty input still navigates to `/seek` with no `word` (arrival handles the default).
- Preserve `data-umami-event="enter-seek"` on the submit so the on-ramp stays measured (fires on native submit).
- Text, label, and input must hold ≥4.5:1 at the seasonal engine's worst-case boundaries and in both modes — not one sampled season.

**Patterns to follow:**
- The seek voice and crescent aesthetic in `seek.html` / `css/seek.css` (echoed, not imported).
- Quiet in-copy link/affordance styling from `css/now.css` `.milestone-line a`.

**Test scenarios:**
- Happy path: typing a word and pressing Enter navigates to `/seek?word=<word>` (browser-verified).
- Happy path: clicking **Seek** with a word navigates identically (browser-verified).
- Edge case: empty input → navigates to `/seek` with no `word` param (browser-verified).
- Edge case: JavaScript disabled → the form still submits to `/seek?word=<word>` (browser-verified).
- Edge case: `prefers-reduced-motion` → crescent is static, no breathing (browser-verified).
- Accessibility: the input has an associated `<label>`; hero text + input ≥4.5:1 at the seasonal worst-case boundaries × both modes (contrast-checked, extending U4's approach to the `--stone`/parchment pairs).

**Verification:**
- The homepage hero invites an intention and hands it to `/seek`; the "New —" framing is gone; motion and contrast constraints hold.

---

### U2. `/seek` pre-seeded continuation (`?word=`)

**Goal:** When `/seek` loads with `?word=`, skip intention entry and begin the walk already seeded with that word.

**Requirements:** R8

**Dependencies:** None (consumes U1's output but is independently testable)

**Files:**
- Create: `js/seek-word.js` (new standalone module — `sanitizeWord`, IIFE + `module.exports` seam, zero top-level DOM)
- Modify: `seek.html` (load `js/seek-word.js` before `js/seek.js`; the seeded-arrival state markup)
- Modify: `js/seek.js` (read `location.search`; call `window.SeekWord.sanitizeWord`; `textContent` insertion; `history.replaceState` to drop `?word=`)
- Test: `js/seek-word.test.js` (new — `sanitizeWord`, node-run)

**Approach:**
- `sanitizeWord(raw)` in the new `js/seek-word.js`: authoritative 32-char clamp/trim mirroring the intention input, plus neutralizing HTML-significant characters (defense-in-depth). Pure and exported for node tests.
- On load, parse `?word=`; if present, run `sanitizeWord`, populate the seeded display **via `textContent`** (never `innerHTML`), and call the existing `begin(word)`.
- Define the seeded-arrival state explicitly: the arrival intention prompt is hidden / `aria-hidden` (a screen-reader user is not asked a question already answered); optionally show a quiet "seeking: <word>" confirmation. Decide and note whether `begin()`'s load-time `scrollIntoView` is intended here (it currently auto-scrolls; if kept, mark it deliberate — otherwise suppress it on the seeded path so the visitor can orient).
- After `begin()` consumes the word, `history.replaceState` drops `?word=` from the URL (privacy invariant + no back-nav re-trigger).
- Absent `?word=`, arrival behaves exactly as today.

**Execution note:** Implement `sanitizeWord` test-first — it's the authoritative sanitizer and a pure function.

**Patterns to follow:**
- Existing `begin(word)` entry in `js/seek.js`; the IIFE/`module.exports` test seam used by `js/collective-routes.js`.

**Test scenarios:**
- Covers AE2. Happy path: `?word=stillness` → arrival skipped/hidden, walk begins seeded with "stillness" (browser-verified).
- Happy path (`sanitizeWord`): a normal word passes through trimmed (node test).
- Edge case (`sanitizeWord`): a 40-char input clamps to 32 (node test).
- Edge case (`sanitizeWord`): empty / whitespace-only → falls back to the default word (node test).
- Error path (XSS): a `<script>alert(1)</script>` / `<img onerror=…>` payload renders as literal text, not markup — asserted against `sanitizeWord` + the `textContent` insertion path (node test).
- Integration: after load, the URL no longer contains `?word=` (`history.replaceState` fired); back-navigation does not re-seed (browser-verified).
- Edge case: no `?word=` → arrival unchanged (browser-verified).

**Verification:**
- A pre-seeded `/seek` URL drops straight into the walk with the word already in place; direct `/seek` is unchanged; `sanitizeWord` tests pass.

---

### U3. `/seek` interaction repairs — stillness gate + auto-begin

**Goal:** Stop the flagship taste from breaking before its bridge: the stillness fill no longer silently livelocks, and no reader is conscripted into a seek.

**Requirements:** R10, R11 (and R13 crescent-hint only if trivial)

**Dependencies:** None

**Files:**
- Modify: `js/seek.js` (stillness machine, `autoBeginObserver`; add `visibilitychange`)
- Modify: `seek.html` (the scroll-reset diagnosis line + earlier fallback affordance)
- Modify: `css/seek.css` (styling for the diagnosis line / fallback)
- Test: `js/seek-stillness.test.js` (new — extractable timing math, if a pure helper is factored out)

**Approach:**
- Scroll tolerance: ignore sub-threshold / inertial scroll deltas so the fill isn't reset by micro-movement.
- Scroll-reset diagnosis: when a genuine scroll cancels the fill, surface a gentle line — **reusing the existing `.stillness` `aria-live="polite"` region** (not a new toast, to avoid duplicate SR announcements) — saying stillness, not error, is what it waits for. Show it on re-entry into the zone; revert to "Be still." after renewed stillness; author the copy in the almanac voice.
- Earlier fallback: reveal the "rest here" escape well before the current 25s (and no later than the 9s it bypasses).
- `visibilitychange` clamp: when the tab is hidden mid-fill, rebase `fillStart` on return so elapsed time can't jump `t` to 1 and fire an unearned reveal.
- **Reduced-motion parity:** the reduced-motion branch uses a plain `setTimeout(reveal, …)` and shares `leaveZone` / `cancelFill`, so it has the same silent-reset failure — wire the diagnosis line, scroll tolerance, and earlier fallback into *both* branches, not just the animated fill.
- Auto-begin: gate `autoBeginObserver` on a "visitor has shown intent" flag. **"Shown intent" = the first `input` / keydown that types an actual character (or form submit) — NOT `focus` alone** — so a keyboard or mobile visitor who lands on the input without typing can still scroll the story freely.
- If cheap: keep the crescent interpretive hint present while the crescent is far from the clearing (R13); otherwise defer.

**Execution note:** Characterize the current stillness/auto-begin behavior in the browser before changing it — the failure modes (livelock, tab-return skip, conscription) are the baseline to verify against.

**Test scenarios:**
- Covers AE3. Edge case: a thumb-nudge scroll during the gate → fill resets *with* the stillness diagnosis, not silently (browser-verified).
- Edge case: the same thumb-nudge under `prefers-reduced-motion` (the `setTimeout` branch) also surfaces the diagnosis and respects tolerance/fallback — reduced-motion parity (browser-verified).
- Covers AE4. Edge case: scrolling to the story without intent → no fog/crescent/pings forced (browser-verified).
- Edge case: tabbing into / tapping the input **without typing** still allows free scroll-through of the story — no conscription (browser-verified).
- Edge case: continuous micro-scroll no longer livelocks — reveal can still complete within tolerance (browser-verified).
- Error path: backgrounding the tab mid-fill then returning → no instant/unearned reveal (browser-verified).
- Edge case: the impatience fallback appears before 25s (browser-verified).
- Happy path (if a timing helper is extracted to a standalone module): fill progress clamps to [0,1] and respects the tolerance threshold (node test).

**Verification:**
- The stillness gate cannot silently reset without explanation, cannot livelock, and cannot be skipped by a tab switch; the story is reachable without being drafted into a seek.

---

### U4. Golden-theme contrast fix

**Goal:** The muted secondary copy (hour kicker, second lede) clears 4.5:1 in the golden/dawn/dusk palette as well as day and night.

**Requirements:** R12, R5

**Dependencies:** None

**Files:**
- Modify: `css/seek.css` (`--ink-fog` per `html[data-hour="…"]`)
- Test: `js/seek-contrast.test.js` (new — WCAG ratio over the theme token pairs)

**Approach:**
- Darken `--ink-fog` for golden (the failing pair — primary fix); leave night (already passing). Nudge day *only* if the same token is reused by the new bridge copy (U6/U7) and needs the headroom to clear AA there — otherwise leave day untouched (don't diff passing code without cause).
- Verify the smallest muted text (`.arrival-lede--second`, hour kicker) ≥4.5:1 against its theme `--paper` in all three hours — and against the *composited* paper + `.clearing-halo` background where clearing text sits (a pure token-pair test can pass while the on-screen composite fails).
- Confirm darker `--ink-fog` still reads well in its non-text uses — borders, hint text, and the `.world-hill` silhouette fill.

**Execution note:** Test-first — encode the target ratio as a failing assertion over the current golden pair, then adjust the token until it passes.

**Test scenarios:**
- Covers AE5. Happy path: golden `--ink-fog` on `--paper` ≥4.5:1 (node test).
- Happy path: day and night muted pairs ≥4.5:1 (node test).
- Regression: the contrast test covers all three hours so a future token edit can't silently regress AA (node test).

**Verification:**
- All three themes pass the muted-text contrast assertion; golden dawn/dusk copy is legible.

---

### U5. Sound-toggle honesty + `seek-sound-on` measurement fix

**Goal:** The sound toggle never reads "on" while silent, and the sound event stops miscounting sound-off as sound-on.

**Requirements:** R15, R13 (sound-toggle half)

**Dependencies:** None

**Files:**
- Modify: `js/seek.js` (toggle state after ctx/buffers resolve; explicit event tracking)
- Modify: `seek.html` (remove the static `data-umami-event="seek-sound-on"` that fires on every click)

**Approach:**
- Track sound explicitly in JS with distinct on/off signals (via `window.umami.track`), replacing the static attribute that fires regardless of state.
- Set `aria-pressed="true"` only after AudioContext + buffers resolve; on failure revert to `false` (optionally note "sound unavailable").
- Define a pending state for the click→resolve gap (the two buffer fetches take time): a subtle "enabling…" affordance, and a re-entrancy guard so a double-tap during the fetch can't leave the visible state out of sync with `audio.enabled`.

**Test scenarios:**
- Happy path: enabling sound tracks an "on" signal and sets pressed only once audio is ready (browser-verified).
- Error path: no AudioContext / failed buffer fetch → toggle reverts to off, does not read "on" (browser-verified).
- Edge case: double-clicking the toggle during buffer fetch leaves the visible state consistent with `audio.enabled` (browser-verified).
- Regression: toggling off does not emit an "on" event (browser-verified; attribute-presence check that the static `seek-sound-on` is gone).

**Verification:**
- The toggle's visible/ARIA state matches actual audio; on/off are counted separately and correctly.

---

### U6. `/seek` reveal bridge — fog-language

**Goal:** The reveal crests into wanting the daily, real version — a fog-language sibling bridge between the clearing and the store links.

**Requirements:** R1, R2, R14, R5

**Dependencies:** U3 (shares the reveal/clearing area; sequence after the interaction repairs settle)

**Files:**
- Modify: `seek.html` (bridge copy **in the clearing card** — note the `.story` store links sit ~520svh below, so the bridge carries its own inline store link)
- Modify: `css/seek.css` (bridge styling; quiet inline link per `.milestone-line a`)
- Modify: `js/seek.js` (reveal un-hides the bridge with the card; emit a `seek-bridge` signal on the crest for R14)

**Approach:**
- Author the fog-idiom bridge line static in the clearing card so it's present with JS disabled and immune to animation-fire failures; reveal it with the card.
- Because the `.story` store links are ~520svh below the clearing, the bridge **carries its own quiet inline store link** (mirroring `css/now.css` `.milestone-line a`) so the peak moment and the download action aren't separated by the whole path — this is what makes the reveal actually convert, and prevents a dead-end for instrument visitors routed here.
- "Offered, not extracted" means plain in-flow text with an inline link — no blocking overlay, modal, or dismiss control; the visitor is free to scroll past.
- Verify the bridge text ≥4.5:1 against the composited clearing background (paper + `.clearing-halo` at full opacity), not just the `--paper` token.
- Emit a `seek-bridge` signal on the crest so reveal → bridge → store is legible (R14), no new trackers.

**Test scenarios:**
- Covers AE1. Happy path: after the reveal settles, the bridge line is present, points at the daily real version, and carries an inline store link reachable without scrolling to `.story` (browser-verified).
- Edge case: `prefers-reduced-motion` → bridge is present without a motion gate (browser-verified).
- Accessibility: bridge text ≥4.5:1 against the composited clearing + halo background in all three hours (contrast-checked).

**Verification:**
- The `/seek` reveal ends by opening a want in its own voice, then offers the app; nothing dead-ends.

---

### U7. Homepage horizon bridge — threshold-language

**Goal:** The homepage walk arrives at the download as the natural end of the journey — a threshold-language line before the existing store badges.

**Requirements:** R1, R4, R14, R5

**Dependencies:** None

**Files:**
- Modify: `index.html` (a line before the **horizon-footer** `.store-badges` at `<footer class="horizon section">` ~1711 — *not* the mid-page journey CTA at ~1422; inline style if needed)

**Approach:**
- One earned threshold-idiom line above the horizon-footer store badges (~1711) — language, not new buttons.
- Because both `.store-badges` blocks currently fire identical `click-app-store` / `click-google-play` events, the horizon badges get **distinct event names** (e.g. a `-horizon` suffix) so this bridge's conversion is separable from the mid-page journey CTA — required for R14, not optional.
- Hold ≥4.5:1 at the seasonal worst-case boundaries and both modes.

**Test scenarios:**
- Happy path: the horizon footer (~1711) shows the bridge line immediately above its store badges (browser-verified).
- Instrumentation: the horizon badges fire distinct events from the journey CTA (attribute-presence check) (R14).
- Accessibility: the line ≥4.5:1 at the seasonal worst-case boundaries × both modes (contrast-checked).
- Test expectation: none for logic — copy/placement/instrumentation only.

**Verification:**
- The homepage download reads as arrival, not a bolted-on funnel.

---

### U8. Instrument whispers — sky-language

**Goal:** Each instrument closes with a quiet sky-language whisper that opens a want and points to `/seek`, without becoming a CTA.

**Requirements:** R1, R3, R14, R5

**Dependencies:** None

**Files:**
- Modify: `sunpath/index.html`, `moonpath/index.html`, `daylight/index.html` (marginalia near each footer close, linking to `/seek`)
- Modify: `css/sunpath.css`, `css/moonpath.css`, `css/daylight.css` (quiet whisper styling per instrument)

**Approach:**
- A single line of almanac marginalia at each close, in that instrument's idiom (sun / moon / daylight), linking to `/seek` — no store badge, no loud CTA.
- Mirror the quiet in-copy link treatment (`css/now.css` `.milestone-line a`): warm ink, hairline underline, no shout.
- Instrument each whisper with a distinct `data-umami-event` (e.g., per-instrument seek link) so the almanac → `/seek` path is legible (R14).
- Preserve each page's contemplative character; the whisper sits at the close, never mid-experience.

**Test scenarios:**
- Happy path: each instrument close shows the whisper linking to `/seek` (browser-verified per page).
- Accessibility: whisper text ≥4.5:1 in each instrument's palette (contrast-checked).
- Instrumentation: each whisper carries its `data-umami-event` (attribute-presence check).
- Test expectation: none for logic — copy/placement/link only.

**Verification:**
- All three instruments end with an on-brand whisper toward `/seek`; no page gains a store CTA; the no-CTA-on-entry-pages principle holds.

---

## System-Wide Impact

- **Interaction graph:** `js/seek.js` — the stillness machine, `autoBeginObserver`, and the new `visibilitychange` handler interact; changing the auto-begin gate must not break waymark reveals or the reduced-motion path. The homepage hero adds an inline submit handler independent of `js/seek.js`.
- **Error propagation:** sound-init failure must degrade gracefully (toggle reverts, no false "on"); `?word=` parsing failure must fall back to the default arrival, never a broken walk.
- **State lifecycle risks:** the `visibilitychange` clamp must not strand the fill in a permanently-paused state on return; the auto-begin intent flag must reset appropriately if the visitor navigates back to arrival.
- **API surface parity:** the hero (`index.html`) and `/seek` (`js/seek.js`) must agree on the `?word=` contract; `/seek` re-sanitizes as the authority.
- **Integration coverage:** the on-ramp (hero → `/seek?word=` → seeded walk) crosses two files and only proves out in a browser — cover it end-to-end there.
- **Unchanged invariants:** the seasonal color engine, real moon, collective trail, `/now`, and the almanac instruments' contemplative character are not altered beyond the whisper at each close and the contrast token fix; no store CTA is added to any instrument.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Stillness-gate changes regress the reveal or reduced-motion path | Characterize current behavior first (U3 execution note); browser-verify each failure mode against baseline. |
| Darkening `--ink-fog` harms its non-text uses (borders, hints, `.world-hill` silhouette fill) | Verify those uses visually — explicitly including the `.world-hill` fill; borders/hints tolerate a darker value, and a pure contrast test guards the text pairs. |
| Instrument whispers erode the almanac's quiet / read as selling | Whisper-not-CTA constraint, `.milestone-line a` restraint, close-placement only, per-instrument idiom; single line each. |
| Hero contrast fails in some season (continuous seasonal engine) | Contrast-check the hero at the seasonal engine's worst-case boundaries (peak days × time-of-day windows × both modes), not one sample. |
| DOM-coupled fixes ship without unit coverage | Browser verification via chrome-devtools tooling; extract and node-test the pure helpers (sanitize, contrast, timing). |
| Reflected XSS via `?word=` rendered into the DOM | `textContent`-only insertion (Key Decisions), `sanitizeWord` char-neutralization, and a node test with a `<script>` / `<img onerror>` payload. |
| Intention word leaking into analytics or the shareable URL | Strip `?word=` via `history.replaceState` after consumption; bridge events stay name-only (no word in payload). Static-host access logs are out of scope (accepted). |
| Instrument visitors bottleneck on `/seek`'s stillness gate | The reveal bridge carries its own store link (U6) so `/seek` no longer dead-ends far from the action; U3 repairs the gate; the dependency-free U7/U8 can ship first to bank conversion (see Phased Delivery). |

---

## Phased Delivery

The origin's win is banking the *proven* leak cheaply, then investing. The units support shipping in that order:

### First — dependency-free bridges (bank conversion, de-risk)
- U7 (homepage horizon bridge) and U8 (instrument whispers) depend on nothing and address the origin's proven leak. Landing these first banks conversion value before the riskier DOM-coupled work.

### Then — the on-ramp and the flagship repairs
- U1 + U2 (seek hero + `?word=` continuation), then U3 (interaction repairs), U4, U5. U6 (the `/seek` reveal bridge) lands after U3 so it's authored against a repaired reveal.

Ordering is a recommendation, not a hard gate; only U6→U3 is a true dependency.

---

## Documentation / Operational Notes

- Deploys via GitHub Pages legacy (deploy-from-branch); no build step. If the CDN wedges, re-trigger a Pages build.
- After landing, refine the `almanac_aesthetic` project memory to record the whisper-vs-CTA nuance (a quiet close-whisper is permitted; a store CTA on an entry page is not).

---

## Sources & References

- **Origin document:** docs/brainstorms/conversion-elevation-requirements.md
- Critique: `.impeccable/critique/2026-07-18T00-03-43Z__seek-html.md`
- Positioning: `PRODUCT.md`
- Related code: `index.html`, `seek.html`, `js/seek.js`, `css/seek.css`, `sunpath/index.html`, `moonpath/index.html`, `daylight/index.html`, `css/now.css`
