# Meditation Breath Waves — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single grey meditation breath ring on the page-walker with three staggered dawn-amber concentric rings plus a subtle 1.5px walker silhouette rise on the inhale.

**Architecture:** Pure CSS. Two pseudo-elements (`::before`, `::after`) on the existing `.page-walker-breath` div become rings 2 and 3, each with its own keyframe block and `animation-delay`. A new keyframe runs against `.page-walker.meditating .page-walker-figure` for the silhouette rise. No DOM changes, no JS changes.

**Tech Stack:** CSS (`css/styles.css`), verified visually via Chrome DevTools MCP against `http://localhost:8765`.

**Spec reference:** `docs/superpowers/specs/2026-04-11-meditation-breath-waves-design.md`

**Verification method:** This is a static site with no test runner. Each task ends with a visual verification step — load the page, scroll to trigger `.meditating`, confirm the behaviour, then commit. Use a local http server:

```bash
python3 -m http.server 8765
```

---

### Task 1: Add the two concentric breath rings

**Files:**
- Modify: `css/styles.css` — `.page-walker-breath` rule and the `@keyframes page-walker-breathe` block (currently around lines 921–947)

- [ ] **Step 1: Read the current breath section to confirm line numbers**

Run:
```
Read css/styles.css offset=915 limit=35
```

Expected: see `.page-walker-breath { border: 1px solid var(--fog); ... }`, `.page-walker.meditating .page-walker-breath { animation: page-walker-breathe 5500ms ease-in-out infinite; }`, and `@keyframes page-walker-breathe { 0% ... 45% ... 55% ... 100% }`.

- [ ] **Step 2: Change the ring 1 border to dawn amber and add pseudo-element rings**

Replace the `.page-walker-breath` block through the end of `@keyframes page-walker-breathe` with the following. This warms ring 1, adds `::before` and `::after` pseudo-elements styled identically to ring 1, and adds the two new keyframes for rings 2 and 3.

```css
.page-walker-breath {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--dawn);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.7);
  pointer-events: none;
}

/* Rings 2 and 3 — pseudo-elements on .page-walker-breath. Each is the
   same 28px circle, anchored at the walker's center, animated by its
   own keyframe so the peak scale/opacity can differ per ring. */
.page-walker-breath::before,
.page-walker-breath::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid var(--dawn);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.85);
  pointer-events: none;
}

.page-walker.meditating .page-walker-breath {
  animation: page-walker-breathe 5500ms ease-in-out infinite;
}

/* Staggered 0.4s / 0.8s delays mean the three rings are always at
   different phases of the breath cycle — reads as a continuous
   outward wave rather than three discrete pulses. */
.page-walker.meditating .page-walker-breath::before {
  animation: page-walker-breathe-mid 5500ms ease-in-out 0.4s infinite;
}

.page-walker.meditating .page-walker-breath::after {
  animation: page-walker-breathe-outer 5500ms ease-in-out 0.8s infinite;
}

/* Breath cycle: inhale (grow), brief hold, exhale (shrink). Peak scale
   1.45 on the inner ring — about a 40px diameter, snug around the 28px
   walker. Middle and outer rings peak larger and fainter so the breath
   dissipates outward into the page. */
@keyframes page-walker-breathe {
  0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.85); }
  45%  { opacity: 0.42; transform: translate(-50%, -50%) scale(1.45); }
  55%  { opacity: 0.42; transform: translate(-50%, -50%) scale(1.45); }
  100% { opacity: 0;    transform: translate(-50%, -50%) scale(0.85); }
}

@keyframes page-walker-breathe-mid {
  0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.85); }
  45%  { opacity: 0.28; transform: translate(-50%, -50%) scale(1.85); }
  55%  { opacity: 0.28; transform: translate(-50%, -50%) scale(1.85); }
  100% { opacity: 0;    transform: translate(-50%, -50%) scale(0.85); }
}

@keyframes page-walker-breathe-outer {
  0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.85); }
  45%  { opacity: 0.16; transform: translate(-50%, -50%) scale(2.35); }
  55%  { opacity: 0.16; transform: translate(-50%, -50%) scale(2.35); }
  100% { opacity: 0;    transform: translate(-50%, -50%) scale(0.85); }
}
```

- [ ] **Step 3: Start local server if not already running**

```bash
python3 -m http.server 8765
```

- [ ] **Step 4: Load the page and trigger meditation**

In the browser (via Chrome DevTools MCP), navigate to `http://localhost:8765`. Scroll down past the hero, then stop scrolling for ~1.5 seconds. JS will add `.meditating` to `.page-walker` and the breath rings will become visible.

- [ ] **Step 5: Verify three rings animate with staggered dawn-amber breath**

Run this in the browser devtools console:

```js
(() => {
  document.body.classList.add('scroll-paused'); // no-op unless used
  const walker = document.querySelector('.page-walker');
  const breath = document.querySelector('.page-walker-breath');
  const cs = getComputedStyle(breath);
  const before = getComputedStyle(breath, '::before');
  const after  = getComputedStyle(breath, '::after');
  return {
    ring1Anim:  cs.animationName,
    ring2Anim:  before.animationName,
    ring3Anim:  after.animationName,
    ring1Delay: cs.animationDelay,
    ring2Delay: before.animationDelay,
    ring3Delay: after.animationDelay,
    ring1Border: cs.borderTopColor,
    meditating:  walker.classList.contains('meditating'),
  };
})();
```

Expected (when `.meditating` is applied):
- `ring1Anim: "page-walker-breathe"`
- `ring2Anim: "page-walker-breathe-mid"`
- `ring3Anim: "page-walker-breathe-outer"`
- `ring1Delay: "0s"`, `ring2Delay: "0.4s"`, `ring3Delay: "0.8s"`
- `ring1Border` is a warm amber (rgb(196, 149, 106) light mode or rgb(212, 168, 122) dark mode), **not** grey.

Visually: three concentric amber rings fade in and out in stagger, with the outer rings larger and fainter.

- [ ] **Step 6: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
feat(page-walker): layered dawn breath rings during meditation

Replace the single grey breath ring with three staggered dawn-amber
rings via pseudo-elements on .page-walker-breath. The 0.4s / 0.8s
stagger means the three rings are always at different phases of the
5500ms breath cycle, reading as a continuous outward wave rather than
three discrete pulses. Middle and outer rings peak larger and fainter
so the breath dissipates outward into the page.
EOF
)"
```

---

### Task 2: Walker silhouette rises on the inhale

**Files:**
- Modify: `css/styles.css` — add a new rule for `.page-walker.meditating .page-walker-figure` and a new `@keyframes page-walker-meditate-rise` block, placed immediately after the `@keyframes page-walker-breathe-outer` block added in Task 1.

- [ ] **Step 1: Add the walker rise animation rule and keyframe**

Insert the following block after the `@keyframes page-walker-breathe-outer` block from Task 1 (before the `/* Whispering: ... */` comment that starts the whispering section):

```css
/* During meditation the walker silhouette gently rises with each
   inhale and settles on the exhale — 1.5px of lift, synced to ring 1's
   peak at 45%–55% of the breath cycle. Translation-only; no scale,
   so the silhouette's proportions stay honest. */
.page-walker.meditating .page-walker-figure {
  animation: page-walker-meditate-rise 5500ms ease-in-out infinite;
}

@keyframes page-walker-meditate-rise {
  0%, 100% { transform: translateY(0);    }
  45%, 55% { transform: translateY(-1.5px);}
}
```

- [ ] **Step 2: Reload the page and re-trigger meditation**

In the browser, reload `http://localhost:8765` (ignore cache), scroll, stop, wait ~1.5s until `.meditating` is applied.

- [ ] **Step 3: Verify the walker rises with the inhale**

Run in the browser devtools console:

```js
(() => {
  const fig = document.querySelector('.page-walker-figure');
  const cs = getComputedStyle(fig);
  return {
    anim: cs.animationName,
    duration: cs.animationDuration,
    meditating: document.querySelector('.page-walker').classList.contains('meditating'),
  };
})();
```

Expected (when meditating):
- `anim: "page-walker-meditate-rise"`
- `duration: "5.5s"`

Visually: the walker silhouette subtly lifts at the same time as the innermost breath ring swells, settling back as the breath exhales. Movement should be small enough that you only notice it if you look — a 1.5px lift on a 28px figure.

- [ ] **Step 4: Confirm the walking bob still works when scrolling resumes**

Scroll the page again. Expected: the breath rings and rise stop; the walker resumes its two-beat `page-walker-bob` cadence.

- [ ] **Step 5: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
feat(page-walker): silhouette rises with the inhale during meditation

Add page-walker-meditate-rise keyframe — 1.5px translateY lift that
peaks at the same moment as the innermost breath ring, so the walker
and the breath swell together. Translation-only, no scale change.
Runs only under .meditating so the walking bob and arrival bow are
untouched.
EOF
)"
```

---

### Task 3: Extend the reduced-motion override

**Files:**
- Modify: `css/styles.css` — the `@media (prefers-reduced-motion: reduce)` block at the bottom of the page-walker section (currently around lines 995–1004).

- [ ] **Step 1: Read the current reduced-motion block**

Run:
```
Read css/styles.css offset=995 limit=12
```

Expected: a media query listing `.page-walker.walking .page-walker-figure`, `.page-walker.meditating .page-walker-breath`, and `.page-walker.bowing .page-walker-figure` under `animation: none;`.

- [ ] **Step 2: Extend the selector list to cover the new animations**

Replace the existing `@media (prefers-reduced-motion: reduce) { ... }` block at the end of the page-walker section with:

```css
@media (prefers-reduced-motion: reduce) {
  .page-walker { transition: none; }
  .page-walker-figure-wrapper { transition: none; }
  .page-walker-trail-walked { transition: none; }
  .page-walker.walking .page-walker-figure,
  .page-walker.meditating .page-walker-breath,
  .page-walker.meditating .page-walker-breath::before,
  .page-walker.meditating .page-walker-breath::after,
  .page-walker.meditating .page-walker-figure,
  .page-walker.bowing .page-walker-figure {
    animation: none;
  }
}
```

- [ ] **Step 3: Simulate reduced-motion in the browser**

In Chrome DevTools: Command Menu (Cmd-Shift-P) → "Rendering" → "Emulate CSS media feature prefers-reduced-motion" → "reduce". Reload the page.

- [ ] **Step 4: Verify no oscillation during meditation**

Scroll to trigger meditation, wait for `.meditating` to apply, and observe for at least 6 seconds (longer than one breath cycle). Expected: the walker silhouette holds still; no breath rings pulse. A static inner ring may remain visible at its starting scale/opacity — that's fine per spec.

Run in the console:

```js
(() => {
  const fig   = document.querySelector('.page-walker-figure');
  const breath = document.querySelector('.page-walker-breath');
  const before = getComputedStyle(breath, '::before');
  const after  = getComputedStyle(breath, '::after');
  return {
    figAnim:    getComputedStyle(fig).animationName,
    breathAnim: getComputedStyle(breath).animationName,
    beforeAnim: before.animationName,
    afterAnim:  after.animationName,
  };
})();
```

Expected: all four values are `"none"`.

- [ ] **Step 5: Disable reduced-motion emulation and confirm full animation returns**

Command Menu → "Emulate CSS media feature prefers-reduced-motion" → "No emulation". Reload, trigger meditation, confirm the three rings and walker rise all animate again.

- [ ] **Step 6: Commit**

```bash
git add css/styles.css
git commit -m "$(cat <<'EOF'
polish(page-walker): reduced-motion covers new breath rings and rise

Extend the prefers-reduced-motion override to zero out the ring 2 and
ring 3 pseudo-element animations and the walker silhouette rise added
by the layered meditation breath work.
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Three concentric breath rings with 0.4s/0.8s stagger → Task 1
- Warm dawn tint on all rings → Task 1 (border color change on `.page-walker-breath` + new pseudo-element rules)
- 1.5px walker silhouette rise synced to ring 1 peak → Task 2
- Reduced-motion override extension → Task 3
- No DOM / JS / index.html changes → confirmed, all three tasks only touch `css/styles.css`

**Placeholder scan:** No TBDs, no "implement later", no "similar to earlier task", no hand-waving. Every code block is concrete CSS with real values. Every verification step has an exact command and exact expected output.

**Type / identifier consistency:**
- Keyframe names: `page-walker-breathe` (existing, unchanged), `page-walker-breathe-mid` (new), `page-walker-breathe-outer` (new), `page-walker-meditate-rise` (new) — all distinct, all referenced consistently between their definition and the rules that use them.
- Pseudo-element references: `::before` and `::after` on `.page-walker-breath` — consistent across Tasks 1 and 3.
- Commit message format matches the existing project style (seen in recent git log: `feat(page-walker): ...`, `polish(page-walker): ...`, `fix(page-walker): ...`).
