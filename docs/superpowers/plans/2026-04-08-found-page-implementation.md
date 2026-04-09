# `/found` Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 0 empty shell of `pilgrimapp.org/found` — a quiet, static HTML page that welcomes strangers who type the URL from a physical card, with a `mailto:` link as the only submission path and a hand-curated archive (empty for now).

**Architecture:** One static HTML file (`found.html`) at repo root, one self-contained CSS file (`css/found.css`), zero JavaScript, zero backend, zero analytics, `noindex`, not linked from any other page. Deploys via existing GitHub Pages Jekyll default. See spec: `docs/superpowers/specs/2026-04-08-found-page-design.md`.

**Tech Stack:** Plain HTML5 + CSS3. Google Fonts for Cormorant Garamond and Lato Light. No build step, no dependencies, no testing framework — verification is manual via browser, devtools Lighthouse, and the W3C validator.

**Commit strategy:** The spec calls for a single implementation commit. This plan builds the files iteratively across four tasks, with a final commit in Task 5 that ships the complete feature. This deviates from the writing-plans "frequent commits" default because the feature is small enough (two files, ~240 lines total) that intermediate states have no review value — an HTML file referencing a missing stylesheet is broken, and styling split across multiple commits adds review overhead without clarity gain.

---

## File Structure

Two new files. No existing files modified.

```
pilgrim-landing/
├── found.html           ← NEW — ~90 lines semantic HTML
└── css/
    └── found.css        ← NEW — ~150 lines self-contained CSS
```

**`found.html`** — the entire page. All copy, all structure, all semantics. Links to `css/found.css`, no JavaScript references. Contains a documentation HTML comment showing how to add archive entries.

**`css/found.css`** — self-contained stylesheet. Does not import from `css/styles.css` or share any CSS custom properties with the main site. Defines its own design tokens, type scale, layout, dark mode, and component styles. The duplication is deliberate (see spec rationale).

---

## Task 1: Create `found.html` with complete content

**Files:**
- Create: `found.html`

- [ ] **Step 1.1: Create `found.html` at repo root with full content**

Create the file at `/Users/rubberduck/GitHub/momentmaker/pilgrim-landing/found.html` with exactly this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>You found a card — Pilgrim</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Lato:wght@300&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/found.css">
</head>
<body>

  <main>

    <h1>You found a card.</h1>

    <p class="intro">
      These cards are slipped into books in libraries, bookstores, and other
      quiet corners of the world, by a walker who made Pilgrim, an app for
      contemplative walks. Each card is a small gift for a stranger. You are
      holding one of them.
    </p>

    <p class="intro">
      Thank you for picking it up.
    </p>

    <p class="about-link">
      <a href="/">About Pilgrim →</a>
    </p>

    <section class="archive">
      <h2>Where the cards have been found</h2>

      <p class="archive-empty">
        No cards have yet been found.<br>
        The first cards ship in Spring 2026.<br>
        When one finds you, leave a note — yours will be the first.
      </p>

      <!--
        Approved entries get pasted here, newest first.

        Placeholder lifecycle:
        - First real entry arrives: paste it ABOVE the .archive-empty paragraph
          (keep the placeholder — it still reads true, since only one find exists).
        - Second real entry arrives: DELETE the .archive-empty paragraph entirely
          (the archive is visibly a thing now and no longer needs the vow).
        - Third and beyond: paste newest-first at the top of this section.

        Shape:
        <article class="find">
          <p class="find-head">Card 023 · Portland · Powell's</p>
          <p class="find-context">in a copy of <cite>The Snow Leopard</cite>.</p>
          <blockquote class="find-story">
            "I was having a terrible week and this felt like someone knew."
          </blockquote>
        </article>
      -->
    </section>

    <section class="invite">
      <h2>Did you find one?</h2>

      <p class="intro">
        If a card found you, leave a note. Where you found it, what the
        card said, what happened — any or all of it, in whatever words
        feel right.
      </p>

      <p class="intro">
        Names and emails are not asked for and will not be collected.
        Your story joins the archive.
      </p>

      <p class="leave-note">
        <a href="mailto:found@pilgrimapp.org?subject=A%20card%20found%20me&body=(Write%20as%20much%20or%20as%20little%20as%20you%20like.)%0A%0AWhere%3A%20%0AWhat%20the%20card%20said%20(or%20its%20number)%3A%20%0AWhat%20happened%3A%20%0A%0A(Photos%20welcome.)">
          Leave a note →
        </a>
      </p>

      <p class="leave-note-fallback">
        or write to <span class="addr">found@pilgrimapp.org</span>
      </p>
    </section>

  </main>

  <footer>
    <p>pilgrim · a walking companion · pilgrimapp.org</p>
  </footer>

</body>
</html>
```

- [ ] **Step 1.2: Verify the file was created and is well-formed**

Run:
```bash
ls -la found.html && wc -l found.html
```

Expected: file exists, approximately 85–95 lines.

- [ ] **Step 1.3: Verify no references to `/found` exist elsewhere in the repo before this commit**

Run:
```bash
grep -rn "found" --include="*.html" .
```

Expected: the only matches should be inside `found.html` itself. If any other `.html` file in the repo references `/found`, that is a design violation — the spec mandates the URL be unlinked from everywhere else.

---

## Task 2: Create `css/found.css` with tokens, layout, and typography

**Files:**
- Create: `css/found.css`

- [ ] **Step 2.1: Create `css/found.css` with the full stylesheet**

Create the file at `/Users/rubberduck/GitHub/momentmaker/pilgrim-landing/css/found.css` with exactly this content:

```css
/* /found — a quiet sibling to pilgrim-landing.
   Self-contained. No imports, no shared state with styles.css. */

:root {
  /* Ink */
  --ink:       #2B241F;   /* dark umber — body text */
  --ink-soft:  #3C2E24;   /* warm sepia — headings */
  --ink-fog:   #756A60;   /* fog gray — 4.68:1 on paper (WCAG AA for small text) */

  /* Ground */
  --paper:     #F6F1E6;   /* parchment — page background */
  --paper-dim: #EFE8D7;   /* dim parchment */
  --rule:      #D4CBB8;   /* thin rule for borders */

  /* Type */
  --serif: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  --sans:  "Lato", -apple-system, system-ui, sans-serif;

  /* Rhythm */
  --measure: 620px;
  --gutter:  clamp(24px, 5vw, 48px);
  --leading: 1.55;
}

@media (prefers-color-scheme: dark) {
  :root {
    --ink:       #EDE4CF;
    --ink-soft:  #D8CCAF;
    --ink-fog:   #958A7A;   /* bumped from #867B6B for AA contrast on dark paper */
    --paper:     #1E1913;
    --paper-dim: #251F17;
    --rule:      #3A2F22;
  }
}

html {
  background: var(--paper);
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 18px;
  line-height: var(--leading);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  margin: 0;
  padding: clamp(64px, 10vh, 140px) var(--gutter);
}

main {
  max-width: var(--measure);
  margin: 0 auto;
}

/* Headings */

h1 {
  font-size: clamp(32px, 6vw, 44px);
  line-height: 1.15;
  font-weight: 400;
  color: var(--ink-soft);
  margin: 0 0 1.2em;
}

h2 {
  font-size: clamp(18px, 2.4vw, 22px);
  line-height: 1.3;
  font-weight: 400;
  font-style: italic;
  color: var(--ink-soft);
  margin: 0 0 1.2em;
}

/* Intro and invite body paragraphs share the .intro class */

.intro {
  font-size: clamp(17px, 1.8vw, 19px);
  margin: 0 0 1.4em;
}

/* Body link affordance — underlined via border-bottom, no transition */

.intro a,
.leave-note a {
  color: var(--ink);
  text-decoration: none;
  border-bottom: 1px solid var(--ink);
}

/* About Pilgrim link — tiny, centered, Lato Light */

.about-link {
  margin: 2.4em 0 0;
  text-align: center;
  font-family: var(--sans);
  font-weight: 300;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.about-link a {
  color: var(--ink-fog);
  text-decoration: none;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 1px;
}

/* Archive and invite section spacing */

section.archive,
section.invite {
  margin-top: clamp(80px, 12vh, 140px);
}

/* Archive empty placeholder */

.archive-empty {
  text-align: center;
  color: var(--ink-fog);
  font-size: clamp(16px, 1.7vw, 18px);
  font-style: italic;
  margin: 2em 0;
}

/* Archive entries */

article.find {
  margin: 0 0 3em;
}

article.find .find-head {
  font-size: clamp(15px, 1.6vw, 17px);
  line-height: 1.3;
  color: var(--ink-soft);
  margin: 0 0 .2em;
}

article.find .find-context {
  font-size: clamp(15px, 1.6vw, 17px);
  line-height: 1.4;
  color: var(--ink);
  margin: 0 0 .8em;
}

article.find .find-story {
  font-size: clamp(17px, 1.8vw, 19px);
  font-style: italic;
  color: var(--ink);
  margin: 0;
  padding-left: 1.2em;
  border-left: 1px solid var(--rule);
}

/* Primary leave-a-note link (mailto) */

.leave-note {
  margin-top: 2em;
}

/* Mailto fallback for finders without a configured email client */

.leave-note-fallback {
  font-size: 14px;
  color: var(--ink-fog);
  margin-top: 0.8em;
}

.leave-note-fallback .addr {
  font-family: var(--sans);
  font-size: 14px;
  color: var(--ink);
}

/* Footer — echoes the card back signature */

footer {
  max-width: var(--measure);
  margin: clamp(120px, 16vh, 200px) auto 0;
  padding-top: 2em;
  border-top: 1px solid var(--rule);
  text-align: center;
}

footer p {
  font-family: var(--sans);
  font-weight: 300;
  font-size: 10.5px;
  line-height: 1.3;
  letter-spacing: 0.04em;
  color: var(--ink-fog);
  text-transform: lowercase;
  margin: 0;
}

/* Reduced motion — no-op here by design, but declares intent */

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0s !important;
    transition-duration: 0s !important;
  }
}
```

- [ ] **Step 2.2: Verify the file was created**

Run:
```bash
ls -la css/found.css && wc -l css/found.css
```

Expected: file exists, approximately 145–160 lines.

---

## Task 3: Local verification of rendering (light, dark, responsive)

**Files:** none modified in this task — this task is browser verification only.

- [ ] **Step 3.1: Start a local HTTP server from the repo root**

File-based URLs (`file://`) can behave differently from HTTP URLs for `mailto:` links, relative paths, and font loading. Use Python's built-in HTTP server to mirror production behavior.

Run:
```bash
python3 -m http.server 8765
```

Expected: `Serving HTTP on :: port 8765 (http://[::]:8765/) ...`

Leave this running in one terminal. All subsequent browser verification uses `http://localhost:8765/found.html`.

- [ ] **Step 3.2: Open in a desktop browser and verify the page loads correctly**

In Chrome (or your preferred modern browser), navigate to:
```
http://localhost:8765/found.html
```

Visually verify:
- Parchment background (warm off-white `#F6F1E6`)
- Cormorant Garamond rendering for all body and heading text (check: the lowercase "a" has a distinctive serif shape, not the flat "a" of sans-serif)
- Narrow centered column, not edge-to-edge
- H1 "You found a card." is large, left-aligned, warm sepia color
- Two intro paragraphs read smoothly
- Tiny "About Pilgrim →" link appears centered below the intro in Lato Light 11px, fog gray
- Archive H2 "Where the cards have been found" is italic, smaller than H1
- Archive placeholder paragraph is centered, italic, fog gray, three lines
- Invite H2 "Did you find one?" is italic
- Invite body paragraph reads smoothly
- "Leave a note →" link is underlined, dark umber
- Secondary line "or write to `found@pilgrimapp.org`" appears below, smaller, with the address in monospaced `<code>`
- Footer shows "pilgrim · a walking companion · pilgrimapp.org" in tiny lowercase Lato Light
- Footer has a thin top border line (the `--rule` color)

If any of these are wrong, inspect with devtools and correct either the HTML or CSS before proceeding.

- [ ] **Step 3.3: Verify dark mode via devtools**

In Chrome devtools, open the Rendering tab (Ctrl/Cmd+Shift+P → "Show Rendering"). Find "Emulate CSS media feature prefers-color-scheme" and set it to `prefers-color-scheme: dark`.

Verify:
- Background flips to deep umber (`#1E1913`)
- Body text flips to warm cream (`#EDE4CF`)
- Headings shift to a slightly softer cream (`#D8CCAF`)
- Fog-gray elements (About link, footer, archive placeholder, leave-note-fallback) use the bumped `#958A7A` so they remain legible against the dark paper
- All text remains comfortably readable (no AA contrast failures)

Then set it back to `prefers-color-scheme: light` (or "No emulation") to return to light mode.

- [ ] **Step 3.4: Verify responsive scaling at mobile widths**

In Chrome devtools, open Device Mode (Ctrl/Cmd+Shift+M). Test at these widths:
- **375px (iPhone SE)**: type scales down via `clamp()`, single column stays readable, no horizontal scrollbar, H1 fits on 1–2 lines, archive placeholder doesn't wrap awkwardly.
- **414px (iPhone Pro)**: same checks, slightly more breathing room.
- **768px (iPad portrait)**: type is mid-range, column starts to center clearly in the viewport.
- **1440px (desktop)**: type is at max `clamp()`, column is firmly centered at 620px max width with generous whitespace on both sides.

If horizontal overflow appears at any width, inspect which element is overflowing and adjust. The most common culprit would be the long mailto URL in the `<a href>` somehow rendering as text — but it shouldn't, because it's inside an `href` attribute, not text content.

- [ ] **Step 3.5: Verify the mailto link opens the email client correctly**

Click the "Leave a note →" link in the browser.

Expected: the OS default email client opens a new compose window with:
- **To:** `found@pilgrimapp.org`
- **Subject:** `A card found me`
- **Body:** exactly this text:
  ```
  (Write as much or as little as you like.)

  Where: 
  What the card said (or its number): 
  What happened: 

  (Photos welcome.)
  ```

If the body is missing, misformatted, or the prompts are missing line breaks, inspect the `mailto:` href in `found.html` and verify every `%0A` (newline) and `%20` (space) is present. The encoding is easy to typo.

If no email client opens at all (e.g., you're in an environment without one configured), that's fine — the fallback `<p class="leave-note-fallback">` line shows the raw address for copy-paste. Verify that the raw address displays correctly and is selectable by mouse.

Close the email draft without sending.

- [ ] **Step 3.6: Verify the "About Pilgrim →" link navigates to the home page**

Click the "About Pilgrim →" link in the browser.

Expected: the browser navigates to `http://localhost:8765/` which should serve `index.html` (the main Pilgrim landing page). Use the back button to return to `/found.html`.

- [ ] **Step 3.7: Verify `noindex` meta tag in the rendered HTML**

In the browser, view page source (Ctrl/Cmd+U) and confirm this line is present in the `<head>`:

```html
<meta name="robots" content="noindex, nofollow">
```

Alternatively, run:
```bash
curl -s http://localhost:8765/found.html | grep -i 'robots'
```

Expected output:
```
  <meta name="robots" content="noindex, nofollow">
```

If the meta tag is missing, add it to `found.html` in the `<head>` block and re-verify.

---

## Task 4: Accessibility, cross-browser, and HTML validation

**Files:** none modified in this task — verification only.

- [ ] **Step 4.1: Run Chrome Lighthouse in Accessibility mode**

In Chrome devtools with `found.html` loaded, open the Lighthouse tab. Select only the "Accessibility" category. Click "Analyze page load."

Expected: score of **100**. Any failures will be listed — fix each one before proceeding. Common sources of failure:
- Missing `lang` attribute on `<html>` → already present, so should not fail
- Insufficient color contrast → verify both light and dark mode
- Missing `title` → already present
- Headings skipping levels → h1 → h2 is correct, no skips
- Form labels → there are no forms on this page

If the score is below 100, the Lighthouse report will list the exact issues. Fix them and re-run until score is 100.

- [ ] **Step 4.2: Verify keyboard tab navigation**

In the browser with `found.html` loaded, click once on the browser's URL bar and then press Tab repeatedly. Verify that these elements receive focus in this order, each with a visible default focus outline:

1. The "About Pilgrim →" link (should show browser default focus ring around the text + underline)
2. The "Leave a note →" link (should show browser default focus ring)

No other elements should be tab-focusable because there are no form inputs and no other anchor elements besides those two. The email address inside `<code>` is plain text, not a link, so it's not focusable.

- [ ] **Step 4.3: Verify typography rendering in Firefox**

Open `http://localhost:8765/found.html` in Firefox. Verify that Cormorant Garamond loads and renders correctly — the type should look identical (or near-identical) to Chrome. If Firefox falls back to Georgia, the page will still be legible but will look slightly different; in that case verify that the `<link>` to Google Fonts is being loaded (Firefox Network tab) and that `fonts.googleapis.com` returned a 200 response.

- [ ] **Step 4.4: Verify typography rendering in Safari**

Open `http://localhost:8765/found.html` in Safari. Same verification as Firefox. Safari has historically been the most forgiving for Google Fonts; any failure here would be surprising.

- [ ] **Step 4.5: Validate the HTML via W3C Nu validator**

Visit https://validator.w3.org/nu/ in a browser. In the "Check by" dropdown, select "file upload" and upload `found.html`. Or, if the validator supports URL input and your local server is accessible publicly (it isn't by default), you could use the URL option — but file upload is simpler.

Alternatively, use a curl-based approach:
```bash
curl -s -H "Content-Type: text/html; charset=utf-8" \
  --data-binary @found.html \
  "https://validator.w3.org/nu/?out=gnu"
```

Expected: zero errors. Warnings about trailing slashes on `<link>` tags or stylistic advice are acceptable; actual errors are not. Fix any errors and re-validate.

- [ ] **Step 4.6: Final noindex and no-stray-references check**

Run:
```bash
grep -rn "/found\b\|found\.html" --include="*.html" --include="*.css" --include="*.js" .
```

Expected: the only matches should be:
- `found.html` (the file itself, which references `css/found.css`)
- `css/found.css` (no references to `/found` expected, but its filename matches)
- Any spec/plan files in `docs/superpowers/` (acceptable — these are documentation, not part of the live site)

Crucially, **no matches inside `index.html`, `compare.html`, `guide.html`, `press.html`, `privacy.html`, or `terms.html`**. If any of those files mention `/found`, delete the reference before committing — the spec mandates the URL be unlinked from everywhere else in the site.

- [ ] **Step 4.7: Stop the local HTTP server**

In the terminal where `python3 -m http.server 8765` is running, press `Ctrl+C` to stop the server.

---

## Task 5: Commit the feature

**Files:**
- Add: `found.html`
- Add: `css/found.css`

- [ ] **Step 5.1: Verify git status shows exactly two new files**

Run:
```bash
git status
```

Expected output (or similar):
```
On branch main
Your branch is ahead of 'origin/main' by 2 commits.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	css/found.css
	found.html

nothing added to commit but untracked files present
```

If there are unexpected modified or untracked files, investigate before committing. The only expected additions are `found.html` and `css/found.css`.

- [ ] **Step 5.2: Stage both new files**

Run:
```bash
git add found.html css/found.css
```

- [ ] **Step 5.3: Create the feature commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
feat: add /found page shell for card finders

Phase 0 of the pilgrim-cards guerrilla-bookmark project. Static HTML +
self-contained CSS, no JavaScript, no backend, noindex. Submission via
mailto link with prefilled subject and soft-prompt body. Archive is
hand-curated via direct HTML edits — no markdown source, no build step.

The URL is unlinked from anywhere else in the site; finders arrive only
by typing it from a physical card. See docs/superpowers/specs/2026-04-08-
found-page-design.md for the full design rationale.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.4: Verify the commit landed and the tree is clean**

Run:
```bash
git status && git log --oneline -5
```

Expected:
- `git status` shows "nothing to commit, working tree clean"
- `git log --oneline` shows the new feat commit at the top, with the docs spec commit and chore gitignore commit from earlier in the session just below

- [ ] **Step 5.5: (Optional, user-confirm only) Push to origin**

Do NOT push automatically. This step requires explicit user approval because pushing to main is a shared-state action.

If the user asks to push, run:
```bash
git push origin main
```

Expected: three commits land on origin/main (spec, gitignore, feat), and GitHub Pages rebuilds the site within ~10–30 seconds. After the rebuild, verify the live URL:

```bash
curl -sI https://pilgrimapp.org/found | head -3
```

Expected: `HTTP/2 200` response.

Then open `https://pilgrimapp.org/found` in a browser and repeat a subset of the Task 3 visual checks against the deployed page. Dark mode, mobile width, mailto link should all work identically to localhost.

---

## Out of scope for this plan (explicit)

These are covered by the spec's "future phases" section and must **not** be built by this plan:

- No `pilgrim-worker` changes.
- No link to `/found` from `index.html` or any other page.
- No sitemap entry, no `robots.txt` file.
- No build step, no GH Actions workflow, no markdown source file for entries.
- No OG tags, no Twitter card meta, no favicon override.
- No JavaScript, no Umami snippet.
- No archive entries beyond the empty-state placeholder.
- No image of the physical cards.
- No RSS feed, no map view.
- No "Edition I / Edition II" language in any public copy.
- No push to `origin/main` without explicit user approval.

If the engineer is tempted to add any of the above "while they're in there," stop and confirm with the user first.

---

## Verification summary (all checks from Tasks 3–4 consolidated)

Before committing in Task 5, all of these must be green:

- [ ] Local HTTP server running, page loads at `http://localhost:8765/found.html`
- [ ] Visual check: parchment bg, Cormorant Garamond, narrow centered column, all copy present and correctly formatted (light mode, desktop)
- [ ] Dark mode toggles correctly via devtools `prefers-color-scheme: dark`
- [ ] Responsive check at 375px, 414px, 768px, 1440px widths — no overflow, type scales gracefully
- [ ] Mailto link opens email client with subject "A card found me" and the exact four-prompt body including "(Photos welcome.)" footer
- [ ] About Pilgrim link navigates to `/`
- [ ] `<meta name="robots" content="noindex, nofollow">` present in rendered HTML
- [ ] Lighthouse Accessibility score = 100
- [ ] Keyboard tab navigation reaches the two links with visible focus rings
- [ ] Cormorant Garamond renders correctly in Firefox and Safari
- [ ] W3C Nu HTML validator returns zero errors
- [ ] No references to `/found` exist in any other `.html`, `.css`, or `.js` file outside of `found.html`, `css/found.css`, and the `docs/superpowers/` directory
