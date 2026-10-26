# The field — the hero as a living ink painting

**Date:** 2026-10-25
**Status:** Built on `feat/hero-field`, browser-verified in Chrome; Safari/iOS unverified
**Ask:** replace the hero's ten floating dots with something that amazes a first-time visitor, on intuition.

## What it is

The hero becomes a field of susuki (pampas) grass painted in ink on the page's parchment, after the Edo
*Musashino* screens, where a large moon sits low over an endless field of grass. A footpath begins under
"begin walking" and winds away into the field. Gusts roll across it as visible waves. The moon is the
page's real moon, with its phase from `js/moon.js`, standing roughly where it is at the visitor's hour. A
low sun lights the plumes gold from behind, and moonlight turns them silver.

It answers the visitor quietly. The grass parts around a resting cursor. A click or tap sends a ring of
wind outward. Each new whisper in the hero arrives on a gust tinted with its energy's colour. Scrolling
the hero walks you five metres up the path before it fades into the page.

## Why this and not something louder

- The walk story below already owns gradient skies, the ink line and the phones; the hero shouldn't repeat them.
  The hero shows *now* (the real hour, the real moon). The story then walks through a whole day.
- "Craft is the argument": the real moon, the season's own swatch colours and the actual hour prove the
  care that copy can't. Every visit at a different hour looks different.
- Quiet over loud: slow wind, muted ink, no sound, no CTA, nothing to click to get somewhere.

## Decisions locked

- **Raw WebGL, no library.** Two programs: a full-screen sky (moon, sun glow, mist, ground, the path
  left as bare paper) and one instanced blade (a 13-level ribbon expanded in screen space). Painter's
  order far to near, no depth buffer, premultiplied blending. WebGL2, or WebGL1 + `ANGLE_instanced_arrays`.
- **Everything with a right answer is in `js/hero-field-core.js`**, which is DOM-free and tested: the sky,
  the path, the layout, the camera, the budget and the palette. `js/hero-field.js` is wiring and shaders.
- **One path, read twice.** `PATH` constants generate both `pathX()` (clears the grass) and `pathGlsl()`
  (paints it). The test translates the GLSL back to JS and holds them equal.
- **The verge is trodden low.** Tall grass beside a path hides it: the visible gap is above the path, so
  you see darker ground beyond. The grass shortens over 1.6 m from the path's edge.
- **The sky is honest but unlocated.** The page never asks for location. Solar noon is 12:00, or 13:00
  under daylight saving. The moon transits at noon + phase × 24 h. Declination is ignored.
- **Uniforms shared by a program's two shaders must match precision**, or the program fails to link and the hero
  silently falls back to plain parchment. That happened in development. `uRes` is pinned to `mediump` in both
  blade shaders. The fragment shaders take `highp` where available, because a phone's mediump is
  16-bit and can't hash pixel coordinates. `js/hero-field-wiring.test.js` links under both branches.
- **Cost only while seen.** The loop runs only while the hero intersects the viewport and the tab is
  visible. With reduced motion it paints one still frame, repainted only on theme or season change, with no rAF.
  The canvas is capped at 1.5× device pixels. The budget is 22k blades at 1440×900, between 7k and 28k.
- **Contrast.** "begin walking" stands on the path, so the path is the ground it is tested against
  (≥ 4.5:1 in both themes, every season). The dark path had to sit just off night paper (4.85:1).
- **Rejected in review:** an ink rim on the light-mode moon (it read as a sticker); busy two-octave maria
  on the light moon (it read as a cotton ball).

## Found on the way

`js/moon.js` drew the toggle inverted, filling the lit region with the shadow colour: a full moon showed as
a crescent. Its terminator also never reached the limb. Fixed in its own commit, with `js/moon-render.test.js`.

## Measured

- Chrome, 1696×915 at DPR 2 (canvas 1.5×): 300 frames, median 16.7 ms, p99 17.6 ms, none over 20 ms.
- Index +13.04 KB gzipped (see `js/page-weight.test.js`).

## Open

- Safari / iOS on real hardware. The risks are the precision preamble, MSAA cost at DPR 3 capped to 1.5, and
  touch rings firing at the start of every scroll gesture in the hero.
- A lower-end Android GPU pass. The budget's `coarse` and `cores` factors are guesses until measured.

## Follow-up: in praise of shadows, and the inscription (2026-10-26)

The user's prompt was Tanizaki's *In Praise of Shadows*: a light shows itself in the dark it falls on.
The hero lit the field evenly, so nothing in the painting said where the light came from.

- **Key light** (`keyLight`): the sun while it is up, else the moon while it is up and lit, else
  nothing. **Field light** (`fieldLight`): how deep the shadow is, and how strong the lane and rims are.
- **Lane:** a band below the key light that narrows as it recedes. It is brightest toward the horizon,
  because grass seen against the light glows at grazing angles, and the light carries through the haze.
  Outside the lane the grass sinks into shadow. Inside it the stalks go dark with their edges lit, and
  gusts flash as they cross it.
- **Silhouettes:** plumes go dark against the moon. On light paper this is reduced to a hint, because
  a pale moon is no ground for a silhouette and it read as a stain. A low sun is drawn as a soft core
  at the horizon, so silhouettes against it make sense.
- **Ink-wash sky:** the darkening is strong at the very top and gone by the horizon, pushed back
  around the light. One curve (`bokashiGlsl`) feeds both the shader and the contrast test. The title
  holds 7:1 wherever the hero can place it, and `--ink-fog` holds 4.6:1 from a fifth of the way down.
- **Moonless nights** are truly dark. Each lantern warms the plumes around it (`screenOf` projects it).
- **Inscription:** the app-icon tile is gone. The name, the seal and the line beneath are set
  upper-left like a painter's inscription, and the whisper is the poem, in `--ink-fog`; its energy
  colours had fallen as low as 1.8:1. The seal is the app mark from `assets/pilgrim-logo.svg`, cut out
  of a vermilion seal with an SVG mask, with a sparse low-frequency grain. Dense fine grain read as rust.
- **Traps:** with the words inside a positioned inscription, `offsetTop` is measured from it, so the
  field now measures with `getBoundingClientRect`. "begin walking" is centred explicitly, because it
  had been centred only by the hero's alignment.

## Follow-up: the path becomes the story's line (2026-10-26)

The field's footpath goes on down the page as one line of ink and becomes the walk story's, so the
whole page is one walk. Code: `js/path-line-core.js` (pure, tested), `js/path-line.js`, and the
line's rules at the end of `css/hero-field.css`.

- **Route:** from under "begin walking", an S swings out of the column before the first heading. It
  walks the margin 56px from the words, wandering a little. Through "What Pilgrim is not" it drifts
  toward the story's gutter. In the story's first scene it comes down beside the words and rounds
  into the trailhead, where the walker's dot waits. Every point descends, so how far the line is drawn
  is a single height on the page.
- **Two SVGs:** one on the page down to the story's top, and one inside scene 01 from its top to the
  trailhead. Once the story pins, the scene's part stays with the held scene.
- **Drawing:** the tip stands at 0.7 of the screen beside the words. Over the last 0.6 screens before
  the pin it runs ahead, reaching the trailhead exactly as the story pins. Past the pin, the way down
  fades within 0.6 screens as the walker sets out. It eases toward the scroll position by the story's
  own factor, so the two lines meet in step.
- **Brush:** it sets down heavy at the path's mouth and lifts to the story's own stroke width, which is
  measured from the story's line. It runs at 0.55 ink beside the words and reaches full strength as it
  enters the story.
- **Room:** `.philosophy` gets 10rem above it on wide screens for the swing. On phones the two sections
  get a 2.25rem gutter, because a 16px margin pressed the line against the glass.
- **The page walker:** the line keeps off its rail. A pinned story puts the walker away whenever the
  story is on screen, so the scene's part may pass where the rail stood. Only that part may, and only
  near the story, where the story is always on screen.
- **Still and stacked:** with reduced motion the line is drawn whole and still. With a stacked story,
  the scene's part is drawn in scene 01's own box and scrolls away with it.
- **Measured:** rebuilding the whole outline costs 0.08 ms. Scrolling through the stretch holds
  60 fps (p99 17.5 ms). Index +6.68 KB gzipped.
