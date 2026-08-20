# Traces section — the real glyphs

**Date:** 2026-08-20
**Status:** Design approved, not implemented

## Summary

Replace the two hand-coded icons in the "The path remembers" section
(`index.html:1128` and `:1143`) with the actual artwork the app ships, and give
each one a motion that demonstrates the sentence beside it.

- **Whispers** — the app's wisp glyph, breathing through the seven energy
  colours as an aura.
- **Cairns** — the app's seven tier paintings, on a cairn you can stack by
  clicking, with the app's seven stone chimes rising as it grows.

The footer cairn (`.page-cairn`, `js/main.js:412`) is **not touched**. Its
one-stone-per-day, 108-day arc stays exactly as it is.

## Why

The current glyphs are generic: a sound-ripple and a stack of ellipses. The app
ships real artwork for both objects, and the site has never shown it.

The two cairns then have two different jobs, and separating them is what makes
this work:

| | Footer cairn | Section cairn |
|---|---|---|
| Job | The **record** | The **demo** |
| Growth | One stone per day returned | Click to place, unlimited |
| Persistence | `localStorage`, 108-day arc | None — resets on reload |
| Art | Drawn ellipses (unchanged) | The seven tier paintings |

The site already has a scarce, accruing cairn. Making a second one scarce would
mean shipping seven paintings and seven chimes that almost nobody ever sees. The
section cairn is generous *because* the footer one is not.

## Assets

### Source

From `pilgrim-ios/Pilgrim/Support Files/`:

| Asset | Path | Raw | Gzipped |
|---|---|---|---|
| Wisp | `Assets.xcassets/glyphs/whisperWisp.imageset/whisper.svg` | 1,953 B | 959 B |
| `cairn-faint` | `Assets.xcassets/glyphs/cairn-faint.imageset/` | 1,912 B | 916 B |
| `cairn-small` | `…/cairn-small.imageset/` | 3,296 B | 1,472 B |
| `cairn-medium` | `…/cairn-medium.imageset/` | 4,966 B | 2,074 B |
| `cairn-large` | `…/cairn-large.imageset/` | 6,841 B | 2,705 B |
| `cairn-great` | `…/cairn-great.imageset/` | 20,160 B | 7,060 B |
| `cairn-sacred` | `…/cairn-sacred.imageset/` | 11,139 B | 4,434 B |
| `cairn-eternal` | `…/cairn-eternal.imageset/` | 12,909 B | 4,731 B |
| Chimes | `stone-tier-1.m4a` … `stone-tier-7.m4a` | 188 KB total | — |

Copy into `assets/traces/`. Run every SVG through SVGO first — this is QuiverAI
output with six-decimal path data, and `cairn-great` at 20 KB raw is the tell.

### Baseline normalisation — do this before any animation work

The seven viewBoxes do not agree. `cairn-faint` is `0 -40.65 144 144`;
`cairn-sacred` is `-45.05 0 246 246`. Centre-aligning them makes the pile jump
between tiers and the illusion dies in one frame.

**Every tier must be re-authored to a common viewBox with an identical ground
line** — the base of the pile at the same y, horizontally centred on the same x.
Nothing downstream works until this is true, and it is checkable: overlay all
seven at 50% opacity and the bases must coincide.

### Hosting

- **SVGs** — `assets/traces/*.svg`, same-origin.
- **Chimes** — `https://cdn.pilgrimapp.org/audio/stone/stone-tier-N.m4a`,
  alongside the existing whisper audio (`js/main.js:442`). *This upload is a
  prerequisite and is not done by this change.*

Only `cairn-faint` and the wisp load with the page (~1.9 KB gzipped combined).
Every other tier and every chime is fetched on demand, on first need.

### On the page-weight ratchet

`js/page-weight.test.js` weighs the document plus referenced `.js`/`.css` only.
Images and audio are invisible to it. Going external therefore avoids the
*measurement*, not the cost. The diff must say so plainly and state the real
on-demand byte cost in its description. The `index.html` baseline (64.55 KB)
will move for the new CSS and JS and must be raised deliberately in the same
commit.

## Where the code lives

**New file `js/traces-cairn.js`, referenced only by `index.html`.**

`js/main.js` is loaded by eight pages — `compare`, `found`, `index`, `guide`,
`walk`, `moonpath`, `daylight`, `sunpath`. Adding to it would grow all eight,
including `/daylight` at 112.48 KB and `/sunpath`, which is governed by the
stricter fixed-budget `js/sunpath-budget.test.js`. A separate file confines the
cost to one page and the ratchet change to one line.

The file owns both glyphs — the wisp's energy cycle and the cairn — because the
coupling between them means they share a clock.

## Component 1 — the wisp

`whisper.svg` is a single-fill line drawing (`#06090E`). Set `fill:
currentColor` and it inherits the page's ink in both themes.

### The colour goes around it, not in it

The Swift property is named `borderColor` (`WhisperDefinition.swift:23`) — in the
app the energy tints an aura, not the glyph. That is also the only version that
passes here: four of the seven are near-invisible as a thin line on parchment
`#F5F0E8`.

So: **the wisp stays near-ink; the energy colour breathes behind it as a soft
radial halo.**

### The seven energies

Derived from `WhisperDefinition.swift:25-31`:

| Energy | Hex |
|---|---|
| presence | `#1C3B4A` |
| lightness | `#C2A68C` |
| wonder | `#A8B8BF` |
| gratitude | `#C7A14F` |
| compassion | `#A8D9D1` |
| courage | `#C7B887` |
| stillness | `#B8946B` |

`play` is deliberately excluded — it is an eighth energy that contradicts the
"seven energies" copy in `index.html:1139`, the same reason the landing whisper
pool omits it.

### Motion

One energy per breath, on the ~5.5s cadence the site already uses
(`.page-walker-breath`, `css/styles.css:1477`). The halo cross-fades between
adjacent energies over the breath; it never snaps. Seven breaths is one full
cycle, and the cycle simply continues — this one does loop, because the energies
are a set and not an arc.

**Order: presence, wonder, gratitude, compassion, courage, lightness,
stillness** — the order the copy beside it lists them in (`index.html:1139`),
not the `WhisperCategory` enum order, which differs. The glyph should cycle in
the same order the sentence reads.

## Component 2 — the section cairn

### Growth

**One click places one stone.** Tiers change at the app's real thresholds
(`CairnTier.from(stoneCount:)`):

| Stones | Tier |
|---|---|
| 0–2 | faint |
| 3–6 | small |
| 7–11 | medium |
| 12–41 | large |
| 42–76 | great |
| 77–107 | sacred |
| 108+ | eternal |

One click = one stone rather than one tier, so the page does not contradict its
own copy ("the eternal cairn that glows at 108 stones"). The early thresholds
are close together — three tier changes inside the first twelve clicks — so the
demonstration lands in about fifteen seconds. The gaps then widen, and the
widening is the point: how far 108 is becomes something felt rather than read.

**Press-and-hold** begins repeating after ~400ms held — long enough that an
ordinary click never triggers it — then places one stone per 250ms until
release. That puts 108 about thirty seconds away.

State is in-memory only. Reload resets to `faint`. No `localStorage`.

### The counter

Appears **with the first stone** and not before, fading in as it lands. An
untouched cairn shows nothing.

```
   19 stones · large
```

`--font-ui`, `--ink-fog` (the vetted muted token, 5.13:1, guarded by
`js/muted-contrast.test.js`). Stone count and tier name, nothing else.

It is load-bearing, not decorative: between `large` (12) and `great` (42) there
are thirty clicks with no change to the artwork, and without a readout that
reads as broken.

No "23 to go" and no progress bar. Crossing a threshold is the event; the tier
name changing is how you know.

### Discoverability

No label and no call to action. On scroll-in, one stone settles by itself —
silently, since there is no user gesture — which demonstrates the verb. A
pointer cursor and a faint hover lift are the invitation.

**That stone counts as stone 1**, and the counter fades in with it. There is no
separate "demonstration" state: a stone landed, so the cairn holds one stone and
says so. This is why the counter's rule is "with the first stone" rather than
"after the first click".

### Sizing

The current icons render at 40px, where `cairn-great`'s detail is mud. The
section cairn renders at **96px**, the wisp stays at 40px.

## The coupling

Each stone placed takes the colour of whichever energy the wisp is breathing at
that moment, and that tint bleeds into the pile's glow over ~1.2s.

A climb to eternal therefore produces a cairn tinted by however many moments it
took, under whichever energies happened to be passing. The two glyphs stop being
two icons and become one instrument.

## Animation

Two events that must look nothing alike. Most clicks do not change the artwork
at all, so the per-click feedback cannot be an art swap.

### Every click — the stone that lands

1. **Drop.** A small stone-shaped mark falls from ~24px above on a heavy-in
   ease, `cubic-bezier(.55,.06,.68,.19)`. No ease-out at the bottom: real things
   arrive, they do not decelerate into the ground.
2. **Settle.** On impact the whole pile compresses ~1.5% vertically and springs
   back over ~180ms. This is the most important detail in the feature — mass is
   communicated by what the receiving object does, never by the falling one.
3. **Dust.** Two or three specks kick outward and down at the base, gone in
   ~400ms.
4. **Chime on impact, not on click** — ~120ms after the press.

### Tier change — seven times

**An upward wipe from the base**, never a cross-fade. A mask sweeps bottom→top
over ~500ms revealing the new painting while the old one holds underneath.
Cairns grow upward, so an upward reveal reads as accretion — the new pile
assembling out of the ground — rather than one image dissolving into another.
That single choice is what makes seven unrelated paintings feel like one object
that grew.

Stronger settle, brighter dust, chime one step higher.

At `sacred` and `eternal` the paintings carry radial-gradient glows. Those
**arrive late** — fading up over ~900ms *after* the wipe completes, so the pile
assembles and then begins to shine.

Implementation: two stacked layers, outgoing and incoming, swapping roles each
tier change.

### 108

Hold everything for a beat. The wisp stops cycling and settles on one colour —
whichever energy was breathing when the 108th stone landed — the eternal glow
comes up slowly, and `stone-tier-7` plays alone. One moment of stillness after
108 stones.

The wisp stays settled and the cairn stays eternal for the rest of the session.
Reload resets both, like everything else here.

### Reduced motion

Under `prefers-reduced-motion: reduce`: no drop, no dust, no wipe, no breathing
halo. Artwork swaps directly, the counter updates, and the chime still plays —
sound is not motion.

## Audio

Seven chimes, one per tier, selected by the same derivation the app uses
(`CairnTier.soundTier(forStoneCount:)`). The chime rises as the cairn grows;
this is what makes the climb an instrument rather than a button.

- **Lazy, per tier.** Fetch only the chime about to play. Most visitors pull
  `stone-tier-1` (9 KB); a climb to eternal pulls all 188 KB.
- **One sound at a time.** The walker already plays whispers from the CDN. iOS
  solves this with `AudioSessionCoordinator` and a `consumer:` string — mirror
  it. A chime yields to a playing whisper rather than overlapping it.
- **Never unprompted.** The scroll-in demonstration stone is silent. Only user
  clicks make sound.
- **Quiet by default.** The app has a `bellVolume` preference; the web has none,
  so ship at ~0.4.

## Accessibility

- The cairn is a `<button>` with an accessible name, keyboard-activatable.
  Space/Enter place a stone; holding either repeats.
- The counter is `aria-live="polite"` so tier changes are announced.
- The wisp stays `aria-hidden` — it is decorative.
- Contrast: the halo is decorative and sits behind near-ink line work, so no
  energy colour ever carries text or meaning on its own.

## Out of scope

- The footer cairn (`.page-cairn`) — unchanged in art, mechanism and copy.
- Persisting section-cairn state across visits.
- Any change to the reliquary card's icon.
- Uploading the chimes to the CDN (prerequisite, done separately).

## Testing

- **Threshold table** — a port test asserting the seven boundaries match
  `CairnTier.from(stoneCount:)` exactly. This table has forked before; iOS
  guards it with a single derivation and so should this.
- **Energy table** — the seven hex values match `WhisperDefinition.swift`, and
  `play` is absent.
- **Baseline normalisation** — all seven SVGs share one viewBox and one ground
  line.
- **Page weight** — `index.html` baseline raised deliberately, with the
  on-demand asset cost stated in the commit body.
- **Reduced motion** — no animation properties applied under the media query,
  following the existing block at `css/styles.css:1084`.
- **Muted contrast** — the counter passes `js/muted-contrast.test.js`.
