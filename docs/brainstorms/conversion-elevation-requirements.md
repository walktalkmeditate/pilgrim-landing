---
date: 2026-07-17
topic: conversion-elevation
---

# Site Elevation: The Taste That Opens a Want

## Summary

Elevate the whole site around one repeatable, on-brand gesture — the *"paper map → territory"* bridge — placed at each of its three free peaks (`/seek`'s reveal, each almanac instrument's close, the homepage horizon), so the earned feeling channels into *begin* instead of leaking. Ship and measure that spine first, repairing `/seek`'s proven leaks so its taste doesn't break before the bridge; then layer the site-wide *"you've already begun"* throughline and a discoverable home for the instruments.

---

## Problem Frame

The site is already crafted — a seasonal color engine, a real moon, `/seek`, the almanac instruments, the goshuin seal. But its primary job (per `PRODUCT.md`) is to move the right people to download Pilgrim, and its most affecting moments spend their emotion and then drop the visitor cold.

The `/seek` critique (30/40) named it exactly: the page builds to a personalized, earned reveal — a genuine peak — and then pivots to two low-contrast store pills with no bridge. *"Are you converting, or giving away the payoff and hoping the afterglow sells?"* The download moment is the flattest thing on the page. The same pattern almost certainly repeats on the instruments and at the homepage horizon: each free experience crests into feeling, then abandons the visitor at the moment they're most open.

Compounding it, the flagship taste (`/seek`) can break *before* it ever reaches a bridge: a stray scroll silently resets the stillness fill at the emotional peak, the fallback hides for 25 seconds, and scrolling toward the story conscripts a reader into a seek they never asked for. A visitor frustrated at the peak carries that memory to the CTA.

The funnel to download is already instrumented (18 umami events tracing enter-seek → seek-begin → seek-store, and homepage → app-store), so the leak is measurable — but at least one event miscounts (`seek-sound-on` fires on sound-*off*), and the analytics aren't currently being read. The care is real; it just isn't converting.

---

## Key Flows

- F1. The flagship taste (`/seek`)
  - **Trigger:** A visitor enters `/seek` — from the homepage seek-hero (pre-seeded via `?word=`) or directly.
  - **Steps:** whisper an intention (or arrive pre-seeded) → walk through fog → stillness reveals a clearing grown from their word → **bridge**: the reveal crests into wanting the daily, real, on-the-land version → offered download.
  - **Outcome:** The visitor leaves either having begun the practice for real (download) or wanting to, with the want named rather than the need merely met.
  - **Covered by:** R1, R2, R5, R6, R7, R8, R9, R10, R11

- F2. An instrument (`/sunpath`, `/moonpath`, `/daylight`)
  - **Trigger:** A visitor explores an almanac instrument (the secondary CTA, or found via the observatory in phase two).
  - **Steps:** play with the instrument → a moment of quiet wonder / understanding → **bridge**: this is a taste of the app's living sky, carried with you daily → offered download.
  - **Outcome:** The craft proves itself and the instrument's close points at the app, rather than dead-ending.
  - **Covered by:** R1, R3, R5, R15, R16

- F3. The homepage walk
  - **Trigger:** A visitor scrolls the single-scroll homepage from threshold to horizon.
  - **Steps:** the walk unfolds (seasonal, moon, collective trail) → arrives at the horizon where the store buttons already live → **bridge**: an earned line before the buttons turns arrival into invitation.
  - **Outcome:** The download reads as the natural end of the journey, not a bolted-on funnel.
  - **Covered by:** R1, R4, R5, R14

---

## Requirements

**The Bridge — the conversion spine**
- R1. Voice the bridge as **three sibling idioms** — one shared idea (*this was the paper map; the app is the territory*), spoken distinctly at each peak: `/seek` in its fog-language, an instrument in its sky-language, the homepage walk in its threshold-language. Same want, three voices — never a single copy-pasted line. Each stays quiet, offered, never extracted.
- R2. Place the bridge at `/seek`'s reveal: after the clearing lands, the earned feeling is channeled toward the daily, real version before the store links, so the reveal opens a want instead of ending in catharsis.
- R3. Place the bridge at each instrument's close: each of `/sunpath`, `/moonpath`, `/daylight` ends by pointing at the app as where this lives daily, in the instrument's own idiom.
- R4. Place the bridge at the homepage horizon: an earned line precedes the existing store buttons. This adds language, not new buttons — the horizon already carries the CTAs.
- R5. Every bridge honors WCAG AA (text ≥ 4.5:1 in every season and both modes) and `prefers-reduced-motion`; the bridge is never gated behind an animation that can fail to fire.

**The seek on-ramp — homepage hero + continuation** *(spec locked in prior session)*
- R6. Convert the homepage `.seek-door` section into a full seek hero: a threshold presence with a breathing crescent and an intention input, inviting the visitor to whisper a word on the homepage itself.
- R7. Submitting the intention (a control labeled **Seek**, activated by click or Enter) navigates to `/seek?word=<intention>`.
- R8. `/seek` reads `?word=` and, when present, skips intention entry — dropping the visitor into the walk already seeded with their word.
- R9. Drop the evergreen "New —" framing on the seek-door; the hero stands on its own, not as an announcement.

**Repairing the flagship taste (`/seek` critique fixes)**
- R10. Stillness-fill fragility (P1): when the fill resets because of scroll, the page explains that stillness — not error — is what it waits for; the impatience fallback appears early (well before the current 25s, and no later than the ~9s it bypasses); small scroll tolerance prevents inertial/sub-pixel motion from resetting; and returning to a backgrounded tab does not jump the fill straight to an unearned reveal.
- R11. Auto-begin conscription (P1): reaching the story by scrolling no longer forces a visitor into a seek they didn't ask for; a seek begins only after the visitor shows intent (e.g., engaging the intention input), and a reader can reach the story freely.
- R12. Golden-theme contrast (P2): the muted secondary copy (hour kicker and the second lede) clears 4.5:1 in the golden/dawn/dusk palette as well as day and night.
- R13. Optional polish (P3): keep the crescent's interpretive key available rather than transient; make the sound toggle honest (it never reads "on" while silent). In scope only if cheap alongside the above; otherwise deferred.

**Trustworthy measurement**
- R14. Instrument each new bridge (all three peaks) so the peak → bridge → download path is legible in analytics, without adding third-party trackers (the site's no-tracking ethos holds).
- R15. Fix miscounting in the existing funnel — at minimum the `seek-sound-on` event firing on sound-*off* — so the numbers can be trusted when read.

**Phase two — The Threshold** *(designed here, sequenced after the spine ships and is measured)*
- R16. A discoverable home for the instruments (the observatory): a quiet index that gathers `/sunpath`, `/moonpath`, `/daylight` as the "explore an instrument" secondary CTA, each instrument bridging to download from within it.
- R17. A site-wide throughline — *"you've already begun; the app is where it continues, daily, on real ground"* — that makes the three peaks feel like one coherent invitation rather than three separate ones.
- R18. Light atmospheric deepening (the whole site breathing with real hour + season + moon) presented as a *taste of the app's aliveness*, in service of the want — not as decoration.

---

## Acceptance Examples

- AE1. **Covers R2.** Given a visitor has reached `/seek`'s reveal and read the clearing grown from their word, when the reveal settles, then a bridge line is present that points at the daily real version and is offered (dismissible / skippable, not a wall between them and leaving).
- AE2. **Covers R8.** Given `/seek` is opened with `?word=stillness`, when the page loads, then intention entry is skipped and the walk begins already seeded with "stillness" — the visitor never re-types it.
- AE3. **Covers R10.** Given a visitor is in the stillness gate and their thumb nudges the scroll, when the fill resets, then the page tells them stillness is what it waits for (not an error), and an escape appears early rather than after 25 seconds.
- AE4. **Covers R11.** Given a visitor scrolls down the `/seek` page intending only to read the story, when they pass the path, then no seek is forced on them — fog, crescent, and pings do not activate without their intent.
- AE5. **Covers R12.** Given the golden/dawn/dusk theme is active, when the hour kicker and second lede render, then both measure at least 4.5:1 against the parchment background.

---

## Success Criteria

- More of the right visitors reach and act on a download CTA — measured as a lift in the peak → bridge → store-click path (`seek-begin` → `seek-app-store`/`seek-google-play`, and the instrument/horizon equivalents) once the spine ships and the funnel is trustworthy.
- No free peak dead-ends: `/seek`, each instrument, and the homepage horizon each end with an earned, on-brand hand-off toward the app.
- The flagship taste no longer breaks before its bridge: the stillness gate cannot silently livelock, and no reader is conscripted into a seek.
- The elevation still reads as *offered, not sold* — a mindfulness-curious visitor allergic to funnels does not feel handled at any peak.
- A downstream implementer can build each bridge and `/seek` fix without inventing product behavior; the analytics distinguish which peak converts.

---

## Scope Boundaries

- The Continuation bet (a personal record — seek/cairn/visited-days — that "you can't take with you unless you download") is deferred to a data-gated phase three, decided on whether the spine moves the needle.
- Ambient hour-following sound and site-wide hidden "clearings" are deferred as texture; they may deepen the want later but are not the conversion spine.
- No reporting dashboard or analytics pipeline is being built — measurement work is limited to trustworthy events and instrumenting the bridges.
- No third-party trackers (Meta/Google/TikTok pixels, etc.) — the site's no-tracking ethos is a hard boundary.
- Retention/return-loop as a *goal* is out — the chosen win is download, not bringing people back (the companion is repurposed only if phase three revives it as a want-opener).
- No map library / real map is introduced; the existing SVG trail and instrument idioms stay.

---

## Key Decisions

- Conversion is the win, not ambience or pure identity: the five dream ideas are re-ranked by whether they open a want; the ones that only make the site nicer become seasoning.
- The free moment is a *taste that opens a want*, not a complete gift: the peaks are designed to leave the visitor wanting the daily, real version, which is what gives the bridge something to channel.
- Build the spine (The Bridge) first and measure it before investing in The Threshold's larger surface: the bridge is the one leak the critique *proved*, it's cheap, and it teaches where the real drop-off is.
- The `/seek` critique fixes are in-scope as part of this work (the two P1s + the golden-theme AA fail), because a broken flagship taste undermines the spine; the P3 polish is optional.
- Measurement is fixed, not built: make the existing funnel trustworthy and instrument the bridges — no dashboard, no new trackers.
- The bridge is voiced as three sibling idioms (one want, each peak in its own language), not one line varied — chosen for craft over recognizability, since a single visitor rarely sees two peaks in a session.
- The Threshold (observatory, throughline, atmospheric deepening) is phase two — designed here, built only after the spine ships and is measured — per the *A-spine, then B* direction.

---

## Dependencies / Assumptions

- The bridge copy references real app capabilities (daily practice, whispers, cairns, living sky, soundscapes) — assumes those remain the app's actual features so the "territory" claim stays honest.
- Instrument bridges assume each instrument page can host a quiet closing hand-off without disrupting its contemplative-instrument character (no CTAs mid-experience — the bridge is at the close).
- Trustworthy measurement assumes continued use of the self-hosted umami instance (`analytics.walktalkmeditate.org`); the session's MCP could not reach it, so reading the numbers depends on the user's own dashboard access until MCP access is arranged.
- The seek on-ramp assumes `/seek` can accept and safely render a `?word=` value (the same 32-char cap / sanitization the intention input already applies).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R10][Technical] The exact stillness-reset mechanics (scroll tolerance threshold, fallback timing, `visibilitychange` handling) — resolved against the live behavior during planning/implementation.
- [Affects R3, R16][Technical] Which instruments already have a natural closing beat to host a bridge, and which need one designed — determined per-instrument during planning.
