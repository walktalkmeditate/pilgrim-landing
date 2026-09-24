# One walk, told by scroll

**Date:** 2026-09-24
**Status:** Design approved, not implemented
**Reference:** [underdog.ai](https://underdog.ai/). The user's own words: "all of the animations are smooth and the whole thing looks super dope like the underdog.ai page"

## Summary

The middle of the home page becomes one walk, told by scrolling. A pinned stage
plays nine scenes that run from first light to night. One ink line walks through
all of them as the visitor's companion. The page itself is the landscape: line,
light, fog, stones. Beside the text, a phone shows the app's screen for that
moment, built in HTML so it plays with the scroll.

Pilgrim 2.0 brings Honor and the three ways to walk, and they live inside this
story. It replaces six separate sections (practice, traces, walk with me, the
seek door, the screenshot journey, the privacy cards), each of which described
one feature on its own.

## Why

PRODUCT.md's fifth principle is already "the single scroll is a walk from
threshold to horizon". The page never delivered that: after the hero it becomes
a stack of feature sections, each with its own demo, and nothing carries the
visitor from one to the next.

Underdog shows what carries a visitor:

| Underdog | This page |
|---|---|
| One pinned stage, 9 numbered scenes, a dot rail | One pinned stage, 9 numbered scenes, a dot rail |
| A dog walks beside you: sits, walks, sleeps at the end | The ink line walks beside you: meanders, pauses, follows, closes |
| Dawn pastels → night by the last scene | `seasonal.js`'s dawn → day → golden → dusk → night, driven by scroll, still wearing the real season |
| First person, the dog talking | Second person, present tense: the page walks beside you |
| Headline with one italic word ("an *errand*.") | Same, in Cormorant italic |
| A real product screen plays its task as you scroll | A phone plays the app's moment as you scroll |
| "Scroll to walk with me ↓" / "Keep walking with me ↓" | "Begin walking ↓" / "Keep walking ↓" |

The site already owns most of the pieces as separate demos: the wisp, the cairn
stack, the clearing glyph, the real moon, the breathing video, the seek door.
The story is the thread that stitches them into one walk.

## Quality bar

This is a requirement, not a nice-to-have. The page must feel as smooth and
look as finished as underdog.ai. Concretely:

**Motion**
- Only `transform` and `opacity` animate. Nothing animates layout properties
  (`top`, `height`, `width`, `margin`) or filters. SVG `stroke-dashoffset` is
  the one paint-bound exception, allowed only on the short scene paths (under
  200 points).
- Scroll drives a *target* progress. A single `requestAnimationFrame` loop eases
  the displayed progress toward that target (`p += (target - p) * 0.14`, snapping
  within 0.0005), so a trackpad flick and a mouse wheel's 100 px steps both glide.
  The loop sleeps when displayed and target progress agree, and when the story is
  off-screen (IntersectionObserver).
- No per-frame layout reads. The story's top and height are measured on load,
  on resize, and on font load, never inside the frame loop.
- A few long-lived layers (the phone, the line layer, the atmosphere) carry
  `will-change: transform`, never more than six elements at once.
- Scene cross-fades use one shared easing (`cubic-bezier(.22,.61,.36,1)`) and
  one shared duration band (the first and last 12% of each scene's scroll).
- **Frame budget:** a Chrome performance trace of the whole story at 4× CPU
  throttle shows no long task over 50 ms and no frame over 32 ms after the
  first paint. This is checked before the PR, and the trace summary goes in
  the PR description.
- iOS Safari: use `100svh`/`100dvh` for the stage, never `100vh`, so the
  collapsing toolbar doesn't jolt the pinned stage.

**Look**
- **Display type:** Cormorant Garamond at hero scale for headlines, with one
  italic word per headline. Lato small caps with wide tracking for the numbered
  kicker (`04 · HONOR`), as Underdog does with its mono kicker.
- **Atmosphere:** soft radial gradients from the season's palette, shifting hour
  by hour. It is the same technique as Underdog's pastel wash, in Pilgrim's
  colours.
- **Phone:** a crisp device frame with a long, soft shadow, sitting slightly
  forward of the landscape (a small parallax offset against the line layer).
- **Asides:** Cormorant italic in the muted colour, never a novelty font.
- **Space:** generous whitespace. Each scene holds one idea: a headline, two or
  three lines, and one act.
- **Visual review:** before the PR, screenshots of every scene at 1440×900 and
  390×844, light and dark, set side by side with underdog.ai's scenes. Anything
  that looks unfinished next to it gets fixed, not argued.

## The nine scenes

Each scene: a kicker, a headline with one italic word, a body of two or three
lines, what the landscape does, and what the phone shows. The hour is the
stage's time of day during that scene.

### 01 · Set out · dawn
- **Headline:** You set out with an *intention*.
- **Body:** Before the first step, one line: what you are walking with. Then a
  way to walk. Wander, with no aim at all. Honor, in someone else's steps. Seek,
  toward what you don't know.
- **Landscape:** the line's first dot appears; a short first stroke.
- **Phone:** the Path tab: the logo, "Solvitur ambulando", and WANDER · HONOR ·
  SEEK with the underline sliding across all three (p 0.2–0.7). Then the intention
  sheet, "What are you walking with?", types "to listen" (p 0.7–0.95).

### 02 · Wander
- **Headline:** You walk, and say it *out loud*.
- **Body:** A thought arrives mid-stride. Tap once. It's recorded, pinned where
  you stood, and written down on your phone.
- **Aside:** *Nothing leaves it.*
- **Landscape:** the line meanders; a small pin drops where the recording starts.
- **Phone:** the active walk. The duration counts, record pulses at p 0.3, and
  the transcript writes itself in word by word over p 0.4–0.9: "the light on the
  water keeps changing, and I keep trying to hold it still".

### 03 · Stillness
- **Headline:** You stop, and *breathe*.
- **Body:** A breathing circle in your own rhythm, a voice guide if you want one.
  Your stillness is counted apart from your walking.
- **Landscape:** the line pauses; a ring breathes where the dot rests (scale 1 ↔
  1.35 on the breathing cycle, reduced motion: static ring).
- **Phone:** `assets/previews/02_meditation_preview.mp4`, muted and looping. It
  plays only while this scene is active and on screen.

### 04 · Honor
- **Headline:** You walk in someone else's *steps*.
- **Body:** A walk a friend shared, one of your own walked again, or a stage of
  the Camino, the Kumano Kodō, or Shikoku's eighty-eight temples. Their line
  waits, faint, before you. It does not hurry you.
- **Landscape:** the real line of Kumano Kodō Nakahechi stage 1 (see *Honor data*),
  faint and dotted. Your line inks over it with scene progress, walker dot at its
  tip. The three moments surface as your line reaches their true fractions. At
  p ≥ 0.92 the closing line appears: *What did you leave behind at the gate?*
- **Phone:** the morning card: "Kumano Kodō · Nakahechi · stage 1 of 4",
  "Takijiri-oji to Takahara", "3.6 km · 430 m up · 2–3 hours", and the stage's
  first sentence.
- **Captions:** "Save the maps before you go, and the way holds with no signal at
  all." · "On iPhone. Coming to Android." · "Stage from
  [open-pilgrimages](https://github.com/walktalkmeditate/open-pilgrimages), ODbL."
- There is no companion dot. The app shows one only on shared walks, never on
  stages. And no 同行二人: it belongs to Shikoku, and this stage is Kumano.

### 05 · Seek
- **Headline:** You walk toward what you *don't know*.
- **Body:** Whisper what you're looking for. Places wait, hidden in fog, and only
  stillness reveals them.
- **Landscape:** a fog bank drifts across the stage. The crescent rides the dot
  and leans toward a denser patch. Over p 0.75–0.95 the patch thins to reveal the
  clearing, using the app's own glyph from `js/clearing-core.js`.
- **Act:** today's seek door form, unchanged in behaviour: "What are you
  seeking?", "one word is enough", Seek → `/seek`, event `enter-seek`.

### 06 · Traces · golden hour
- **Headline:** You pass what someone *left*.
- **Body:** A whisper, left for whoever walks by. A cairn, one stone at a time.
  No names on either.
- **Landscape:** the wisp floats beside the line and brightens as the dot passes.
  The cairn stack sits at the line's edge and takes a stone per click.
- **Act:** both reuse `js/traces-cairn.js` and `js/traces-glyphs.js` as they are.
  Only their host markup moves.

### 07 · Home · dusk
- **Headline:** You come home, and the walk *remembers*.
- **Body:** Your route, what you said, the photos you took where you took them.
  A seal pressed from this walk alone. And over many walks, the words that keep
  returning.
- **Landscape:** the line closes into a ring where the seal will press.
- **Phone:** the walk summary. A route thumbnail with three relic pins; a themes
  chip, "water · the fourth walk it has come back"; and at p 0.7 the seal
  presses: scale 1.15 → 1 and opacity 0 → 1 with a small ink-spread ring.

### 08 · Give
- **Headline:** You give the walk *away*.
- **Body:** Share it as a living page. Your voice plays where you spoke, your
  photographs wait where you stood, and whoever walks it after you walks in your
  steps.
- **Act:** "Walk one yourself →", linking `https://walk.pilgrimapp.org/9mYhRL7GWx`
  (event `walk-with-me-demo`).
- **Landscape:** a second, fainter line begins to follow yours: someone, later.
  This closes the loop back to scene 04.
- **Phone:** the share page's overture: the route inks itself and the walker
  settles at its end (today's `.walkwithme-route`, moved).

### 09 · Yours alone · night
- **Headline:** Your walk is yours *alone*.
- **Body:** No account, and nothing that says who you are. What you make on a
  walk stays on your phone. The little that travels is written down, plainly.
- **List:**
  - Transcribed on your phone.
  - No login, no profile.
  - No analytics, advertising or crash-reporting SDKs.
  - Your walks export whole, any time.
- **Link:** "Everything the app sends →" `/privacy`.
- **Act:** the store badges (App Store, Google Play; events unchanged) under
  "Begin your own walk".
- **Landscape:** the real moon at tonight's phase (moon.js's rendering, decorative).

These words match the rewritten privacy policy (pilgrim-landing PR #25). They
replace the old privacy cards' "no user ID" and "no third-party SDKs", which
the policy contradicts.

## Honor data

- **Source:** `../open-pilgrimages/routes/kumano-kodo-nakahechi/ways/stage-00.json`,
  open-pilgrimages v1.12.0 (ODbL).
- **Line:** the stage's 45 route points. It runs from Takijiri-oji
  (33.775981, 135.50398) to Takahara (33.794446, 135.529428).
- **Moments:** the dataset's own words, English label plus the Japanese name.

| Frac | Label | Japanese | Words |
|---|---|---|---|
| 0.0000 | Takijiri-oji | 滝尻王子 | One of the Five Great Oji. Gate to the sacred mountains. |
| 0.0934 | Nezu-oji (remains) | 不寝王子跡 | Ruins of an Oji shrine. |
| 0.9959 | Takahara | 高原 | *(no words; the stage ends)* |

- **Card:** 3.6 km · 430 m up · 2–3 hours. First narrative sentence: "Takijiri-oji
  stands at the confluence of two rivers, where pilgrims traditionally waded
  into the water to purify themselves before entering the divine realm."
- **Closing:** "What did you leave behind at the gate?"
- **Bake:** `scripts/bake-honor-stage.js` projects the 45 points (equirectangular,
  x scaled by cos(latitude)) into a fixed viewBox and prints the SVG path plus
  each moment's point, for pasting into `index.html`. It reads a committed fixture,
  `scripts/fixtures/nakahechi-stage-00.json` (the 45 points, 3 moments and stage
  facts copied from the dataset), not the sibling repo.
  `scripts/bake-collective-routes.test.js` fails on any checkout without
  `../open-pilgrimages`; this one must not.

## What moves where

**Stays before the story:** the hero, "Walking is how we think", "What Pilgrim
is not".

**Absorbed into the story; their sections are removed:**

| Section today | `index.html` | Goes to |
|---|---|---|
| Practice, "Four moments of a walk" | 1189–1222 | Scenes 02, 03, 07 (the Privacy card → 09) |
| Traces, "The path remembers" | 1224–1285 | Scene 06 |
| Walk with me | 1530–1557 | Scene 08 |
| Seek door | 1559–1584 | Scene 05 |
| Screenshot journey + store badges | 1586–1650 | The phones in 01–08; badges → 09 |
| Privacy, "Your walk is yours alone" | 1786–1824 | Scene 09 |

**After the story, in this order:** Reliquary (the full demo with lightbox, unchanged)
→ seasons → haiku → goshuin → soundscape → "Why Pilgrim exists" → the collective
trail → the almanac → the horizon.

**The hidden clearing must keep working.**
- `js/clearing.js` keys off `.seek-door`, and `ClearingCore.ZONES` includes
  `.journey.section` and `.privacy-section`, both of which are removed.
- Scene 05's door keeps the `seek-door` class. The crescent's ride begins when the
  story ends, not when the door scrolls past, because the door is pinned.
- ZONES drops the two removed selectors and gains `.reliquary.section`.
  `js/clearing-core.test.js` and `js/clearing-wiring.test.js` are updated to the
  new zones.

**Metadata.**
- The JSON-LD `featureList` gains Seek, Honor, pilgrimage stages from
  open-pilgrimages, offline maps for pilgrimages, Walk with me, and themes across
  walks.
- Two false entries are replaced: "No cloud storage — all data on-device" becomes
  "No accounts; walks stored on the device", and "No analytics or telemetry"
  becomes "No analytics or advertising SDKs".
- `llms.txt` gets the same feature additions. Its "Privacy posture" is rewritten
  to match PR #25: no "No user ID", no "No cloud", no "no third-party SDKs".

## Structure

```html
<section class="story" id="story" aria-label="A walk, from first light to dark">
  <a class="story-skip" href="#after-story">Skip the walk</a>
  <div class="story-stage">                         <!-- sticky when pinned -->
    <div class="story-atmosphere" aria-hidden="true"></div>
    <svg class="story-line" aria-hidden="true">…</svg>
    <div class="story-phone" aria-hidden="true">…</div>
    <nav class="story-rail" aria-label="Scenes">9 × <a href="#scene-N"></a></nav>
    <a class="story-pill" href="#scene-2">Begin walking ↓</a>
  </div>
  <section class="story-scene" id="scene-1" aria-labelledby="scene-1-title">…</section>
  … ×9
</section>
<div id="after-story"></div>
```

- Scene text lives in real `<section>`s in reading order, so screen readers and
  search engines get the story as prose. The atmosphere, line and phone are
  decorative. Anything they say that matters (the transcript line, the morning
  card's facts, the Honor moments, the closing line) is also in the scene's text
  or an ordered list.
- The line layer holds one `<path>` per scene. Each scene's path starts at the
  screen point where the previous one ended, so the dot never jumps. Scene 04's
  real stage path is translated and scaled as one group, keeping its shape and
  never distorting it, so its first point (Takijiri-oji) sits on scene 03's end
  point. The bake prints that start point so the handoff is set once.

## Scroll model

- Each scene owns `SCENE_VH = 140` of scroll: 12% entry fade, 76% hold (where
  its act plays), 12% exit fade. Nine scenes come to about 12.6 screens.
- `js/story-core.js` holds the pure functions (no DOM), tested in Node:
  - `storyProgress(scrollY, top, height, vh)` → 0…1
  - `sceneAt(p, n)` → `{ index, local }`
  - `fade(local)` → opacity from the shared curve
  - `hourFor(index, local)` → 6.0 … 23.0, monotonic across the story
  - `honorReveal(local)` → how far the line has inked, plus which moments and
    whether the closing line are showing
  - `pillLabel(index)`
- `js/story.js` wires it up: measuring, the rAF easing loop, writing `--p`,
  `--scene`, `data-scene` and the hour's colour variables onto the stage, scene
  video play/pause, rail and pill clicks (smooth-scroll to a scene's hold
  start), and `focusin`. Tabbing to the seek input or the cairn button while
  pinned scrolls to its scene first.
- **Time of day:** the stage gets its own custom properties from
  `hourFor(...)` through `seasonal.js`'s existing `getTimeOfDayModifier`. Page
  chrome outside the story keeps the real clock. `seasonal.js` switches at 10,
  16, 19 and 22, so each scene has a pinned start hour, and `hourFor`
  interpolates linearly to the next scene's start:

  | Scene | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | end |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Starts at | 6.0 | 8.0 | 10.0 | 12.0 | 14.0 | 16.5 | 19.5 | 21.0 | 22.5 | 23.0 |

  That puts 01 in dawn, 06 in golden hour, 07 at dusk and 09 at night, as the
  scene list says.

## Fallbacks

- **No JavaScript:** `.story` is never `.story--pinned`. The scenes stack as
  ordinary sections in their finished states: lines fully drawn, moments and
  closing shown, the seal pressed, the phones on their final frame.
- **Reduced motion:** the same as no-JS. Nothing pins, nothing eases, and the
  breathing ring and fog are static. The video shows its poster frame and plays
  only on tap.
- **Short viewports** (height < 560 px, e.g. a landscape phone): unpinned, as
  reduced motion.
- **Phones (≤ 720 px wide):** the text takes the top of the stage (at most 46% of
  its height) and the phone mock sits bottom-right at about 38% height, with the
  landscape full-bleed behind both. The rail becomes a slim column of dots at the
  right edge.

## Files

| File | Change |
|---|---|
| `index.html` | Remove the six sections; add `.story` with nine scenes; move Reliquary to directly after it; metadata edits |
| `css/story.css` | New: stage, scenes, line, phone, rail, pill, fallbacks |
| `js/story-core.js` | New: pure scroll/scene/hour/honor functions |
| `js/story.js` | New: DOM wiring and the rAF loop |
| `js/story-core.test.js` | New |
| `scripts/bake-honor-stage.js`, `scripts/fixtures/nakahechi-stage-00.json`, `scripts/bake-honor-stage.test.js` | New |
| `js/clearing-core.js`, its two tests | ZONES updated |
| `js/page-weight.test.js` | index baseline raised by the measured delta, with the reason |
| `llms.txt` | Features and privacy posture |

## Testing

- `node js/story-core.test.js`:
  - scene boundaries at `p = k/9`
  - local progress 0 → 1 within each scene
  - the fade curve is 0 at the edges and 1 through the hold
  - `hourFor` never decreases, starts at dawn and ends at night
  - `honorReveal` shows moment i exactly when the ink passes its fraction, and
    the closing line from 0.92
  - `pillLabel` gives "Begin walking" for scene 1, "Keep walking" for 2–8, and
    nothing for 9
- `node scripts/bake-honor-stage.test.js`: the bake is deterministic from the
  fixture, gives 45 points in, starts at Takijiri-oji's projected point, and puts
  the moments at their fractions.
- The clearing tests pass with the new zones.
- The contrast tests (`js/muted-contrast.test.js`, `js/breathe-contrast.test.js`)
  extend to the story's text over the atmosphere at each of the five hours, in
  both colour schemes: body text ≥ 4.5:1.
- `node js/page-weight.test.js` passes with the raised index baseline.
- **In a browser (Chrome DevTools MCP), before the PR:**
  - the frame-budget trace from *Quality bar*
  - the screenshot matrix (every scene × 2 sizes × 2 schemes), set against
    underdog.ai
  - no-JS, reduced-motion and keyboard walkthroughs
  - the hidden clearing still appears
- On a real iPhone (the user's 16e): the pinned stage doesn't jolt when
  Safari's toolbar collapses.

## Out of scope

- Other pages (/seek, /walk, the almanac instruments, press).
- New illustration or a character: the ink line is the companion by decision.
- Audio in the story. The soundscape player stays in its own section after the
  story.
- Android screenshots or Android-specific scenes. Honor's caption says iPhone.
