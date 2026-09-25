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
| Dawn pastels → night by the last scene | The story's own dawn → day → golden → dusk → night palettes, driven by scroll, tinted by the real season |
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
  on font load, and when the viewport's *width* changes. Height-only resizes are
  ignored, because iOS Safari fires `resize` as its toolbar collapses.
- A few long-lived layers (the phone, the line layer, the atmosphere) carry
  `will-change: transform`, never more than six elements at once.
- Scene cross-fades use one shared easing (`cubic-bezier(.22,.61,.36,1)`) and
  one shared duration band (the first and last 12% of each scene's scroll).
- **Frame budget:** a Chrome performance trace of the whole story at 4× CPU
  throttle shows no long task over 50 ms and no frame over 32 ms after the
  first paint. The trace is taken in light, dark and star modes. This is
  checked before the PR, and the trace summary goes in the PR description.
- **iOS Safari:** the stage's backdrop layers (atmosphere, line) are sized at
  `100lvh`, and its content frame (text, phone, rail, pill) at `100svh`,
  anchored to the top. Never `dvh`, which follows the toolbar and reflows the
  stage as it collapses.

**Look**
- **Display type:** Cormorant Garamond at hero scale for headlines, with one
  italic word per headline. Lato small caps with wide tracking for the numbered
  kicker (`04 · HONOR`), as Underdog does with its mono kicker.
- **Atmosphere:** five story-owned palettes (dawn, day, golden, dusk, night), each
  in light and dark. Each is painted once as a soft radial-gradient layer, and
  the layers crossfade by opacity as the hour moves. `seasonal.js` contributes
  only the season's tint. This follows `js/breathe-tint.js`, which is
  "deliberately NOT derived from js/seasonal.js": its time-of-day modifiers
  shift parchment by barely a shade. In star mode (`body.constellation`) the
  atmosphere layers are transparent, and the starfield is the story's sky.
- **Phone:** a crisp device frame with a long, soft shadow, sitting slightly
  forward of the landscape (a small parallax offset against the line layer).
  Every string and element on it is the app's own, copied from the cited
  pilgrim-ios file. Nothing the app doesn't show appears on the phone.
- **Asides:** Cormorant italic in the muted colour, never a novelty font.
- **Space:** generous whitespace. Each scene holds one idea: a headline, two or
  three lines, and one act.
- **Visual review:** before the PR, screenshots of every scene at 1440×900 and
  390×844, in light, dark and star modes, set side by side with underdog.ai's
  scenes. Anything that looks unfinished next to it gets fixed, not argued. Each
  phone frame is also set beside the same screen from the app's demo mode.

## The nine scenes

Each scene: a kicker, a headline with one italic word, a body of two or three
lines, what the landscape does, and what the phone shows. The hour is the
stage's time of day during that scene. **Every act timing below is hold-local:**
0 at the start of the scene's hold, 1 at its end (see *Scroll model*). No payoff
lands inside a fade.

### 01 · Set out · dawn
- **Headline:** You set out with an *intention*.
- **Body:** Before the first step, one line: what you are walking with. Then a
  way to walk. Wander, with no aim at all. Honor, in someone else's steps. Seek,
  toward what you don't know.
- **Landscape:** the line's first dot appears; a short first stroke.
- **Phone:** the Path tab: the logo, "Solvitur ambulando", and WANDER · HONOR ·
  SEEK with the underline sliding across all three (0.1–0.55). Then the intention
  sheet (`IntentionSettingView.swift`): "Set Your Intention", the field's
  placeholder "What purpose guides this walk?", and the **Recurring** chips
  holding the words that keep coming back. They are nouns, as Thought Threads'
  themes are. One chip, "water", is tapped and fills the field (0.6–0.9).

### 02 · Wander
- **Headline:** You walk, and say it *out loud*.
- **Body:** A thought arrives mid-stride. Tap once. It's recorded, pinned where
  you stood, and written down on your phone.
- **Aside:** *No audio is sent anywhere to be transcribed.*
- **Landscape:** the line meanders; a small pin drops where the recording starts.
- **Phone:** the active walk. The duration counts, record pulses at 0.25, and
  the transcript writes itself in word by word over 0.35–0.85: "the light on the
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
  faint and dotted, captioned "Kumano Kodō · Nakahechi · stage 1 of 4". Your line
  inks over it with the hold, walker dot at its tip.
  - **Moments:** each surfaces when the ink reaches its true fraction. A small
    ring appears on the line at the moment's point, with the English label and
    the Japanese name beside it. Ring and label scale 0.85 → 1 and fade 0 → 1
    over 0.06 of the hold on the shared easing: the same treatment as scene 07's
    seal press, at a smaller size. Once shown, they stay for the rest of the
    scene.
  - **Closing line:** at 0.92 of the hold, *What did you leave behind at the gate?*
- **Phone:** the morning card, as `StageMorningCard.swift` renders it: the theme
  "Entry", the narrative's first sentence, "3.6 km · 430 m up · 2 to 3 hours ·
  moderate", the maps line "maps saved for today", and its "walk" button.
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
  and leans toward a denser patch, leaning harder as the hold runs. **Nothing is
  revealed.** The scene ends on the lean. The page's only reveal stays the hidden
  clearing below the story, which, like the app, opens only for stillness.
- **Act:** today's seek door form, unchanged in behaviour: "What are you
  seeking?", "one word is enough", Seek → `/seek`, event `enter-seek`. The form
  carries `data-seek-door`, not the `.seek-door` class (see *What moves where*).

### 06 · Traces · golden hour
- **Headline:** You pass what someone *left*.
- **Body:** A whisper, left for whoever walks by. A cairn, one stone at a time.
  No names on either.
- **Landscape:** the wisp floats beside the line and brightens as the dot passes.
  The cairn stack sits at the line's edge and takes a stone per click.
- **Act:**
  - Both reuse `js/traces-glyphs.js` as it is, and `js/traces-cairn.js` with one
    change.
  - Today the cairn drops its demo stone from its own IntersectionObserver.
    Inside the pinned stage that would fire at scene 01, while the cairn is
    invisible. So `traces-cairn.js` exposes `TracesCairn.demo()` and skips its own
    observer when the stack sits inside the pinned story. `walk-story.js` calls
    `demo()` when scene 06's hold begins.
  - The cairn keeps its `.traces-card` wrapper, so the counter's hidden-until-
    the-first-stone state and its caption styling still apply.

### 07 · Home · dusk
- **Headline:** You come home, and the walk *remembers*.
- **Body:** Your route, what you said, the photos you took where you took them.
  A seal pressed from this walk alone. And over many walks, the words that keep
  returning.
- **Landscape:** the line closes into a ring where the seal will press.
- **Phone:** the walk summary: a route thumbnail with three relic pins. At 0.7
  the seal presses: scale 1.15 → 1 and opacity 0 → 1, with a small ink-spread
  ring. The summary shows no themes. The body's recurring words are the ones
  scene 01 already showed as the intention sheet's Recurring chips.

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
  settles at its end. This is today's `.walkwithme-route`, moved without its
  `.reveal` class; `walk-story.js` adds `.revealed` when scene 08's hold begins,
  so the route doesn't draw unseen at scene 01.

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
  "Begin your own walk". Reaching this scene's hold fires the umami event
  `story-reach-end` (see *Success*).
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

- **Card:** theme "Entry"; "3.6 km · 430 m up · 2 to 3 hours · moderate"; first
  narrative sentence: "Takijiri-oji stands at the confluence of two rivers, where
  pilgrims traditionally waded into the water to purify themselves before
  entering the divine realm."
- **Closing:** "What did you leave behind at the gate?"
- **Bake:**
  - `scripts/bake-honor-stage.js` projects the 45 points equirectangularly (x
    scaled by cos(latitude)) into the stage path's own local coordinates.
  - It prints that path, each moment's local point, and a placement transform for
    each of the two line geometries, landscape and portrait (see *Structure*), for
    pasting into `index.html`.
  - It reads a committed fixture, `scripts/fixtures/nakahechi-stage-00.json`,
    holding the 45 points, 3 moments and stage facts copied from the dataset. It
    does not read the sibling repo. `scripts/bake-collective-routes.test.js` fails
    on any checkout without `../open-pilgrimages`; this one must not.

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
- `js/clearing.js` keys off `.seek-door` today, and `ClearingCore.ZONES` includes
  `.journey.section` and `.privacy-section`, both of which are removed.
- `clearing.js` keys off `[data-seek-door]` on scene 05's form instead, so the
  door's inline styles aren't imported into the scene. Today's `.seek-door`
  rules (index.html:878–929) include an all-italic h2, 70vw blurred fog, and body
  text at about 3:1. The crescent's ride begins when the story ends, not when the
  door scrolls past, because the door is pinned.
- ZONES drops the two removed selectors and gains `.reliquary.section`. The
  existing `.story.section` zone ("Why Pilgrim exists") stays. Because the new
  story is `.walk-story`, it remains that zone's only match.
- `js/clearing-core.test.js` is updated to the new zones. `js/clearing-wiring.test.js`
  gains an assertion that every ZONES selector matches exactly one element in
  `index.html`.

**The page walker and scroll tracker rest during the story.** `main.js`'s page
walker (fixed in the left margin) and the "~N m walked" tracker would otherwise
walk alongside the ink line through all 12.6 pinned screens. The walker also
writes `style.top` and `style.height` on every scroll. While the story is pinned,
`walk-story.js` sets `body.walk-story-pinned`. `css/styles.css` fades both to
opacity 0 under that class, and `initPageWalker` skips its updates while the
class is present. Both resume after the story.

**Metadata and page copy.** Every claim the rewritten policy (PR #25) disproves
goes, not just the two feature-list entries:
- The JSON-LD `featureList` gains Seek, Honor, pilgrimage stages from
  open-pilgrimages, offline maps for pilgrimages, Walk with me, and themes across
  walks.
- Its false entries are replaced. "No cloud storage — all data on-device" becomes
  "No accounts; walks stored on the device", and "No analytics or telemetry"
  becomes "No analytics or advertising SDKs". The Reliquary entry's "no photos
  stored or uploaded" becomes "photos stay in your library; they upload only when
  you share a walk interactively".
- The JSON-LD `description` (index.html:60) drops "no analytics, no cloud".
- The FAQ answers (index.html:153, :185) drop "no telemetry", "no cloud storage",
  "All data stays on your phone" and "Nothing is uploaded to any server". Each is
  replaced with the policy's framing: anonymous, no accounts, walks live on your
  device, and what you choose to share travels.
- The Reliquary section's own "never uploaded" line gets the same change as its
  feature-list entry.
- `llms.txt` gets the feature additions. Its "Privacy posture", its summary
  blockquote (line 4) and its "Who Pilgrim fits" privacy line (line 96) are
  rewritten to match PR #25: no "No user ID", no "No cloud", no "no telemetry",
  no "no third-party SDKs".
- "What Pilgrim is not" stays as it is. "Not a data business" (no analytics,
  advertising or profiling) and "Not a cloud service. Your walks live on your
  phone." are both still true.

## Ship order

- This merges after pilgrim-landing PR #25, the privacy rewrite. PR #25 itself
  waits for pilgrim-worker #45 to be deployed.
- Until #25 lands, scene 09's "Everything the app sends →" would open the old
  policy, which says no data leaves the device during normal use.
- iOS 2.0.0 is already live on the App Store, so nothing waits on the app.

## Structure

```html
<section class="walk-story" id="walk-story" aria-label="A walk, from first light to dark">
  <a class="walk-story-skip" href="#after-walk-story">Skip the walk</a>
  <div class="walk-story-stage">                    <!-- sticky when pinned -->
    <div class="walk-story-atmosphere" aria-hidden="true">5 palette layers</div>
    <div class="walk-story-line-slot" aria-hidden="true"></div>
    <div class="walk-story-phone-slot" aria-hidden="true"></div>
    <nav class="walk-story-rail" aria-label="Scenes">
      9 × <a href="#scene-N" aria-label="Scene N of 9: Name"></a>
    </nav>
    <a class="walk-story-pill" href="#scene-2">Begin walking ↓</a>
  </div>
  <section class="walk-story-scene" id="scene-1" aria-labelledby="scene-1-title">
    text · <svg class="walk-story-line" aria-hidden="true"> ·
    <div class="walk-story-phone" aria-hidden="true">
  </section>
  … ×9
</section>
<div id="after-walk-story"></div>
```

- **Naming:** every class, id, file and function is prefixed `walk-story`. The
  existing "Why Pilgrim exists" section is `class="story section"`, and
  `css/styles.css:1111–1123` styles `.story`, `.story h2` and `.story p`, so a bare
  `.story` would collide in both directions.
- **Each scene carries its own visuals.** Its phone and its line segment live
  inside its `<section>`.
  - Stacked (no JS, reduced motion, short viewports), each scene shows its own
    finished phone and line beside its text.
  - Pinned, CSS lifts the active scene's phone and line into the stage's slots.
    Inactive scenes are `visibility: hidden`, so their links and buttons can't
    take clicks or focus through the active scene.
- **Scene text stays readable.** It lives in real `<section>`s in reading order,
  so screen readers and search engines get the story as prose. The atmosphere,
  lines and phones are decorative. Anything they say that matters (the transcript
  line, the morning card's facts, the Honor moments, the closing line) is also in
  the scene's text or an ordered list.
- **Two line geometries.** The line is drawn in two geometries: landscape
  (> 720 px) and portrait (≤ 720 px). `walk-story.js` switches between them at
  the 720 px breakpoint. In each geometry, a scene's path starts at the screen
  point where the previous scene's path ended, so the dot never jumps. Scene 04's
  real stage path is placed as one group, translated and scaled but never
  distorted, by the bake's transform for that geometry, so its first point
  (Takijiri-oji) sits on scene 03's end point.
- **Rail:** each dot is labelled "Scene N of 9: {scene name}" (for example "Scene
  4 of 9: Honor"). The dot for the active scene carries `aria-current="step"`,
  updated by `walk-story.js` as the scene changes. The current dot is drawn
  filled and elongated, as Underdog's is.
- **Pill:** "Begin walking ↓" at scene 01, then "Keep walking ↓" through scene 08.
  At scene 09 it fades out on the shared cross-fade curve and leaves the tab
  order, because scene 09's store badges are the story's own ending.
- **Focus:** when any focusable element inside any scene gets focus while the
  story is pinned, `walk-story.js` scrolls that scene's hold into view first. This
  covers links, the seek input, the cairn button, the store badges and the
  privacy link, so focus never lands in a faded scene.

## Scroll model

- Each scene owns `SCENE_VH = 140` of scroll: 12% entry fade, 76% hold (where
  its act plays), 12% exit fade. Nine scenes come to about 12.6 screens.
- `js/walk-story-core.js` holds the pure functions (no DOM), tested in Node:
  - `storyProgress(scrollY, top, height, vh)` → 0…1
  - `sceneAt(p, n)` → `{ index, local }`
  - `holdLocal(local)` → `clamp((local − 0.12) / 0.76, 0, 1)`. Every act timing
    reads this, never `local` directly.
  - `fade(local)` → opacity from the shared curve
  - `hourFor(index, local)` → 6.0 … 23.0, monotonic across the story
  - `atmosphereWeights(hour)` → the five palette layers' opacities, summing to 1,
    blending between neighbouring palettes
  - `honorReveal(hold)` → how far the line has inked, which moments are showing,
    and whether the closing line is
  - `pillLabel(index)`
- `js/walk-story.js` wires it up:
  - measuring, and the rAF easing loop;
  - writing `--p` and `data-scene` on the active scene, and opacities on the five
    atmosphere layers;
  - geometry switching at 720 px;
  - scene video play/pause;
  - rail and pill clicks, which smooth-scroll to a scene's hold start;
  - the focus rule from *Structure*;
  - the story-driven demos: `TracesCairn.demo()` at scene 06 and `.revealed` at
    scene 08;
  - `body.walk-story-pinned`;
  - the `story-reach-end` event.
- **Time of day:** the stage's hour comes from `hourFor`, not the real clock.
  Page chrome outside the story keeps the real clock. Each scene has a pinned
  start hour, and `hourFor` interpolates linearly to the next scene's start:

  | Scene | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | end |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Starts at | 6.0 | 8.0 | 10.0 | 12.0 | 14.0 | 16.5 | 19.5 | 21.0 | 22.5 | 23.0 |

  The palettes are anchored at 6 (dawn), 12 (day), 17 (golden), 20.5 (dusk) and
  23 (night). `atmosphereWeights` blends continuously between neighbouring
  anchors, so the sky never snaps mid-scene.

## Fallbacks and layouts

- **No JavaScript:** `.walk-story` is never `.walk-story--pinned`. The scenes
  stack as ordinary sections, each with its own phone and line in the finished
  state: lines fully drawn, moments and closing shown, the seal pressed. Each is
  shown at its scene's palette.
- **Reduced motion:** the same as no-JS. Nothing pins, nothing eases, and the
  breathing ring and fog are static. The video shows its poster frame and plays
  only on tap.
- **Short viewports** (height < 560 px, e.g. a landscape phone): unpinned, as
  reduced motion.
- **Desktop (> 1024 px), pinned:**
  - The text column spans 8–44% of the stage width, vertically centred.
  - The phone is centred at 68% of the width, 72% of the stage height (at most
    720 px tall).
  - The rail sits 3% from the right edge, vertically centred.
  - The pill sits bottom-centre, 4% above the stage's bottom edge.
  - The landscape is full-bleed behind everything, in the landscape geometry.
- **Tablets and small laptops (721–1024 px):** the desktop arrangement, with the
  text column at 6–48% and the phone at 60% of the stage height.
- **Phones (≤ 720 px wide):**
  - The text takes the top of the stage, at most 46% of its height.
  - The phone mock sits bottom-right at about 38% height.
  - The landscape is full-bleed behind both, in the portrait geometry.
  - The rail becomes a slim column of dots at the right edge.
- **Star mode:** the atmosphere layers are transparent and the starfield shows
  through.

## Success

PRODUCT.md defines success as installs, and every gate in *Quality bar* measures
polish. So the story is measured on installs too:
- A `story-reach-end` umami event fires when scene 09's hold is reached.
- Compare store-badge clicks per visit (`click-app-store`, `click-google-play`)
  over the four weeks before launch and the four weeks after.
- A drop sends the story's length and the skip link back for review.

## Files

| File | Change |
|---|---|
| `index.html` | Remove the six sections; add `.walk-story` with nine scenes; move Reliquary to directly after it; the metadata and page-copy edits |
| `css/walk-story.css` | New: stage, atmosphere layers, scenes, lines, phones, rail, pill, layouts, fallbacks |
| `js/walk-story-core.js` | New: pure scroll/scene/hour/atmosphere/honor functions |
| `js/walk-story.js` | New: DOM wiring and the rAF loop |
| `js/walk-story-core.test.js` | New |
| `scripts/bake-honor-stage.js`, `scripts/fixtures/nakahechi-stage-00.json`, `scripts/bake-honor-stage.test.js` | New |
| `js/clearing.js` | Key off `[data-seek-door]` |
| `js/clearing-core.js`, `js/clearing-core.test.js`, `js/clearing-wiring.test.js` | ZONES updated; exactly-one-match assertion |
| `js/traces-cairn.js` | Expose `TracesCairn.demo()`; skip its own observer inside the pinned story |
| `js/main.js`, `css/styles.css` | Page walker and scroll tracker rest under `body.walk-story-pinned` |
| `js/muted-contrast.test.js`, `js/breathe-contrast.test.js` | Extended to the story's text over the atmosphere at each hour, in both colour schemes |
| `js/page-weight.test.js` | index baseline raised by the measured delta, with the reason |
| `llms.txt` | Features, summary, privacy posture, "Who Pilgrim fits" |

## Testing

- `node js/walk-story-core.test.js`:
  - scene boundaries at `p = k/9`
  - local progress 0 → 1 within each scene
  - `holdLocal` is 0 through the entry fade, 1 through the exit fade, and linear
    between
  - the fade curve is 0 at the edges and 1 through the hold
  - `hourFor` never decreases, starts at dawn and ends at night
  - `atmosphereWeights` sums to 1 at every hour and changes continuously
  - `honorReveal` shows moment i exactly when the ink passes its fraction, and
    the closing line from hold-local 0.92
  - `pillLabel` gives "Begin walking" for scene 1, "Keep walking" for 2–8, and
    nothing for 9
- **The night is really night:** scene 09's atmosphere background is at least 25
  HSL lightness points darker than scene 01's in the light scheme.
- `node scripts/bake-honor-stage.test.js`: the bake is deterministic from the
  fixture, gives 45 points in, starts at Takijiri-oji's local point, puts the
  moments at their fractions, and prints both geometry transforms.
- The clearing tests pass with the new zones, including the exactly-one-match
  assertion.
- The contrast tests (`js/muted-contrast.test.js`, `js/breathe-contrast.test.js`)
  extend to the story's text over the atmosphere at each of the five palettes, in
  both colour schemes: body text ≥ 4.5:1.
- `node js/page-weight.test.js` passes with the raised index baseline.
- **In a browser (Chrome DevTools MCP), before the PR:**
  - the frame-budget trace from *Quality bar*, in light, dark and star modes
  - the screenshot matrix (every scene × 2 sizes × light/dark/star), set against
    underdog.ai
  - each phone frame beside the same screen from the app's demo mode
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

## Deferred / Open Questions

### From 2026-09-25 review

- **Scroll-reversal behavior for word-by-word and ink reveals is undefined** — The nine scenes / Scroll model (P1, design-lens, confidence 75)
  If the transcript's word count and the Honor line's ink are plain functions of progress, scrolling back up will visibly delete words and un-draw the line. The reviewer's fix is to hold each reveal at its furthest point until the scene is left and re-entered. That conflicts with how scroll-scrubbed stories usually behave, and underdog.ai scrubs both ways. The agent's lean: reveals scrub both ways, smoothed by the easing loop. Decide before planning.
  <!-- dedup-key: section="the nine scenes scroll model" title="scrollreversal behavior for wordbyword and ink reveals is undefined" evidence="the transcript writes itself in word by word over p 0.4–0.9" -->
