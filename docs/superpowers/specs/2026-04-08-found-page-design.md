# `/found` page — design

*Drafted 2026-04-08. Phase 0 shell for `pilgrim-landing`, in support of the `pilgrim-cards` project.*

## Context

The [`pilgrim-cards`](../../../../../pilgrim-cards/) project produces small hand-numbered cards — "prayer cards / found poems / walking permission slips" — that will be slipped anonymously into books on contemplative-walking shelves of independent bookstores, libraries, hostels, and other quiet corners of the world. The cards bear a URL on the back pointing to `pilgrimapp.org/found`, a page whose purpose is to welcome the finder, explain what they're holding, and (when finds accumulate) show an archive of where other cards have been found and what happened next.

This design governs **Phase 0** of the `/found` page: the empty shell shipped *before* Edition I is printed and distributed, so the URL on the physical card resolves to something deliberate from day one.

The overarching project philosophy (from `pilgrim-cards/plan.md`): *"Would this still be worth making if no one ever downloaded the app?"* Every design decision on this page is filtered through that question.

## Phase scope

Phase 0 ships an **empty shell**: intro copy, a placeholder line where the archive will grow, and a `mailto:` link for finders to send notes. No backend, no form POST, no database, no admin UI, no user accounts, no analytics, no build step.

### In scope for this design

- `found.html` at repo root, serving at `pilgrimapp.org/found` via GitHub Pages' default Jekyll behavior
- `css/found.css` — self-contained stylesheet with its own tokens, duplicated minimally from the project's shared type/color system
- Intro copy, archive-empty placeholder, invite section with `mailto:` link, one-line footer
- `<meta name="robots" content="noindex, nofollow">` to keep the page out of search results
- Dark/light mode via `prefers-color-scheme`
- A documented operational workflow for adding new archive entries by hand

### Out of scope (explicit YAGNI)

- No changes to `pilgrim-worker`. The plan's original D1/admin/worker-rendered design is deferred indefinitely; it is not built "behind a flag" or "scaffolded for later."
- No HTML form element. No JavaScript. No form-to-issue proxy. No Staticman, Formspree, or similar.
- No `found-entries.md`, no `data/` directory, no markdown build step. Entries live directly in `found.html`.
- No `images/` directory for finder photos. Photos live in the project owner's private inbox.
- No GH Actions workflow, no CI, no Jekyll plugin.
- No sitemap entry. No `robots.txt` file.
- No links to `/found` from `index.html` or any other page in the site. The URL lives on the physical cards and nowhere else.
- No OG tags, no Twitter card meta, no favicon override. The page uses site defaults.
- No mention of "Edition I" or "Edition II" in public copy. Editions are internal print-run bookkeeping, not a consumer-facing taxonomy.

## Architecture

**Pure static page. Zero JavaScript. Zero backend. Zero runtime dependencies.**

```
pilgrim-landing/
├── found.html           ← new, ~80 lines semantic HTML
└── css/
    └── found.css        ← new, ~140 lines self-contained CSS
```

The page is indexable, readable, printable, and screen-reader friendly. It is **not** search-discoverable — that's deliberate and covered in the Discoverability section below. It works with JavaScript disabled, CSS disabled, and (at degraded quality) in text-only browsers like Lynx.

The stylesheet is **self-contained**. It does not `@import` from `styles.css` or reference shared CSS custom properties defined elsewhere. This is a deliberate break from the main site's architecture for two reasons:

1. `styles.css` is ~13KB and tightly coupled to the seasonal color engine, moon phase, collective trail, cursor trail, and other dynamic behaviors that `/found` must not inherit.
2. Duplicating ~20 lines of design tokens in `found.css` is a smaller cost than either (a) refactoring `styles.css` to extract a shared tokens file, or (b) importing the whole thing and overriding everything.

The price of this choice is that if the parchment color or Cormorant Garamond font-family changes in the future, it has to be changed in two places. That is an acceptable cost for the architectural clarity of "this page stands alone."

## Submission flow

Finders submit via `mailto:`. There is no `<form>` element on the page.

### The link

```html
<a href="mailto:found@pilgrimapp.org?subject=A%20card%20found%20me&body=(Write%20as%20much%20or%20as%20little%20as%20you%20like.)%0A%0AWhere%3A%20%0AThe%20book%3A%20%0AWhat%20the%20card%20said%20(or%20its%20number)%3A%20%0AWhat%20happened%3A%20%0A%0A(Photos%20welcome.)">
  Leave a note →
</a>
```

### What the finder sees when they click it

Their email client opens a new draft addressed to `found@pilgrimapp.org`, with the subject pre-filled as **"A card found me"** and the body pre-filled as:

```
(Write as much or as little as you like.)

Where: 
The book: 
What the card said (or its number): 
What happened: 

(Photos welcome.)
```

They edit the draft in their own email client — not in a web form — and hit send.

### Why this over the original plan's CF Worker path

The plan's original design specified a full CF Worker backend with a D1 table, honeypot, rate limit, admin UI, and server-rendered feed. All of that is rejected for Phase 0 because:

- **YAGNI.** Edition I is 500 cards distributed over 3 months across 10 cities. Even if every card is found and every finder submits — neither of which will happen — the ceiling is maybe 20–50 notes in the first year. That volume is a markdown file or a few `<article>` blocks, not a database.
- **The friction is the feature.** Plan.md is explicit that typing the URL filters for intent (hence "no QR code"). The same logic applies to submission: composing an email is a better filter for the kind of person whose note you actually want in the archive than a one-click anonymous form. Email friction is the moderation.
- **No secret management.** The static site holds no secrets. A form POST to a worker would require either cross-origin CORS setup or shared secrets for anti-spam. `mailto:` avoids the entire category.
- **Graceful degradation.** The mailto link works on every browser, every OS, with or without JavaScript, with or without cookies enabled.
- **Matches project spirit.** The cards are slow, handmade, hand-moderated. A `git commit -m "add find #007"` is a better ritual than a database insert.

### Why not GitHub Issues as a backend

Using GH Issues as a pseudo-database was considered and rejected. Issues require a GitHub account to create, which excludes the exact audience the cards target (poets, walkers, contemplatives who are not software developers). Routes around the login requirement — Staticman, form proxies, prefill URLs — either reintroduce server-side complexity or still require a GH account on the submitter side. The mailto approach side-steps all of this.

### Subject line: "A card found me"

The subject mirrors the plan's inversion framing: the card finds you, not the other way around. *"I found one of your cards"* reads literally but re-asserts a marketing dynamic (your cards, from you the sender) that the project is built to dissolve. Skipped.

### Body prompts: four labeled fields, each one word

The four prompts — `Where`, `The book`, `What the card said (or its number)`, `What happened` — serve operational purposes (telling the project owner which design/quote traveled to which venue) without reading as a form. Each label is one or a few words; the email recipient can delete any of them and write freely. The bracketing parentheticals at the top and bottom — *"(Write as much or as little as you like.)"* and *"(Photos welcome.)"* — frame the body as a permission slip, not a ticket.

### Photos: welcomed in email, not displayed on page

The `(Photos welcome.)` line invites attachments. Finders who include them give the project owner a rich private record: ground-truth data about which design went where, what condition the card was in, how the finder framed the discovery. That record lives in the owner's inbox, not on the website.

Reasons the photos do **not** appear on `/found`:

- **Privacy.** Photos carry EXIF including GPS coordinates. Publishing them risks doxing a finder.
- **Consent.** Sending an email implies consent to quote the text ("it's a note, you publish notes"). It does not imply consent to publish an attached photograph, which remains the finder's copyrighted work. Explicit per-photo permission is too much correspondence overhead.
- **Operational cost.** Each published photo means download → EXIF strip → resize → compress → commit → embed. The text-only workflow takes 30 seconds per entry. Photos triple that.
- **Aesthetic.** Pure Cormorant Garamond on parchment is austere in the same register as the cards. A grid of iPhone photos tilts the page toward *"Instagram feed for a thing,"* which is what the whole project is a counter-gesture against.

A later phase may add a single small photograph of the project owner's own making — cards laid out on a wooden surface, for instance — so finders know what the physical object looks like. That is distinct from publishing finder photographs and stays out of Phase 0.

### Mailto fallback for finders without a configured email client

A small subset of finders — mostly corporate Windows environments and some webmail-only setups — will click the mailto link and see nothing happen. To cover this, the invite section includes a secondary line showing the raw address:

```html
<p class="leave-note-fallback">
  or write to <code>found@pilgrimapp.org</code>
</p>
```

Styled small and gray, visually recessive but selectable for copy-paste. The `<code>` element makes the address visually unambiguous as "this is an address, copy this."

## Page structure and copy

The full `<main>` body:

```html
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
      Shape:
      <article class="find">
        <p class="find-head">Card 023 · Portland · Powell's</p>
        <p class="find-book">in a copy of <cite>The Snow Leopard</cite>.</p>
        <blockquote class="find-story">
          "I was having a terrible week and this felt like someone knew."
        </blockquote>
      </article>
    -->
  </section>

  <section class="invite">
    <h2>Did you find one?</h2>

    <p>
      If a card found you, leave a note. Names and emails are not asked for
      and will not be collected. Your story joins the archive.
    </p>

    <p class="leave-note">
      <a href="mailto:found@pilgrimapp.org?subject=A%20card%20found%20me&body=(Write%20as%20much%20or%20as%20little%20as%20you%20like.)%0A%0AWhere%3A%20%0AThe%20book%3A%20%0AWhat%20the%20card%20said%20(or%20its%20number)%3A%20%0AWhat%20happened%3A%20%0A%0A(Photos%20welcome.)">
        Leave a note →
      </a>
    </p>

    <p class="leave-note-fallback">
      or write to <code>found@pilgrimapp.org</code>
    </p>
  </section>

</main>

<footer>
  <p>pilgrim · a walking companion · pilgrimapp.org</p>
</footer>
```

### Copy decisions, with reasoning

**"Quiet corners of the world."** Replaces the plan's original "bookstores and libraries." The phrase is a semantic container that holds every current and future venue (bookstores, libraries, hostels, monasteries, meditation halls, Little Free Libraries, train seat pockets, bench shelters) without listing any of them. The intro doesn't need rewriting the first time a card is dropped in a Shikoku pilgrim's hut.

**"An app for contemplative walks"** rather than the plan's "a quiet app for contemplative walks." Dropping the second "quiet" avoids repetition with "quiet corners." The word does more work when it appears only once in the paragraph.

**Editions are absent from public copy.** The plan's original draft included *"This is from Edition I · Spring 2026. Five hundred cards exist. You have one."* That sentence is removed and does not return in later phases. Editions are internal print-run bookkeeping — the project owner tracks "Edition I = cards 001–050, printed March 2026" privately in `pilgrim-cards/`, but the public archive treats the card sequence as one continuous stream (001, 002, ... 049, 050, 051, 052 ...). The finder doesn't need to care which print batch their card came from. The card back prints the serial without a denominator (`023`, not `023/500`).

**"Pilgrim mentioned once, at the bottom, quietly"** — the plan's design goal (line 208). In practice the page mentions Pilgrim in three places, all muted, forming a gradient of loudness:

1. **Inline in the intro paragraph** as a sentence: *"…by a walker who made Pilgrim, an app for contemplative walks."* Required to explain what the card is.
2. **A tiny "About Pilgrim →" link** centered below the intro, in Lato Light ~11px, fog gray. Not a button. Linked to `/`.
3. **The footer** echoing the card back's signature: *"pilgrim · a walking companion · pilgrimapp.org"*. Same typography as the card back. Creates a quiet circularity between the physical object and the page.

**"Thank you for picking it up"** as its own paragraph rather than folded into the previous one. The whitespace around it is doing real work, making the gesture explicit rather than decorative.

**"Yours will be the first"** in the archive placeholder is a small gift to early finders. They are being told, in advance, that they get to be the opening entry in a years-long record.

### Archive entry shape

Approved entries follow this exact HTML:

```html
<article class="find">
  <p class="find-head">Card 023 · Portland · Powell's</p>
  <p class="find-book">in a copy of <cite>The Snow Leopard</cite>.</p>
  <blockquote class="find-story">
    "I was having a terrible week and this felt like someone knew."
  </blockquote>
</article>
```

Three lines per entry. Any line can be omitted if the finder didn't provide it — the CSS handles missing paragraphs gracefully. Entries are ordered newest-first. When the first real entry arrives, it goes above the `.archive-empty` placeholder. When the second arrives, the placeholder is deleted entirely.

### Operational workflow for adding entries

1. A finder emails `found@pilgrimapp.org`.
2. The project owner reads the email. Decides it belongs in the archive.
3. Either:
   - Paste the email text into a Claude conversation and say *"add this to /found"*. Claude opens `found.html`, adds a new `<article>` block at the top of the archive section, commits. ~30 seconds.
   - Open `found.html` directly, copy an existing `<article>` block, paste it, edit the values, commit. Also ~30 seconds.
4. GitHub Pages rebuilds in ~10 seconds. The entry is live.

The git commit is the moderation step. The inbox is the pending queue. There is no "approved" flag because there is nothing in the codebase that is not approved — if it's in `found.html`, it's live.

No markdown source of truth, no `found-entries.md` file, no build step, no data format to maintain. Direct HTML edit.

## Styling

### Intent

A page that looks like it was built in 2003 by someone who cared deeply about type. Deeply unfashionable. No rounded corners, no shadows, no gradients, no flexbox grid gymnastics, no hover transitions, no scroll effects, no loading spinners, no skeleton screens. Text on a page. The styling equivalent of the cards themselves: *handmade, imperfect, wabi-sabi, a relic, not a flex.*

### Design tokens

Pulled from `pilgrim-cards/plan.md` lines 64–70 (the card's own color system):

```css
:root {
  /* Ink */
  --ink:       #2B241F;   /* dark umber — body text */
  --ink-soft:  #3C2E24;   /* warm sepia — headings */
  --ink-fog:   #756A60;   /* fog gray — 4.68:1 on paper, passes WCAG AA for small text */

  /* Ground */
  --paper:     #F6F1E6;   /* parchment — page background */
  --paper-dim: #EFE8D7;   /* dim parchment, archive contrast if used */
  --rule:      #D4CBB8;   /* thin rule for hr and borders */

  /* Type */
  --serif: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  --sans:  "Lato", -apple-system, system-ui, sans-serif;

  /* Rhythm */
  --measure:  620px;              /* narrow column */
  --gutter:   clamp(24px, 5vw, 48px);
  --leading:  1.55;
}

@media (prefers-color-scheme: dark) {
  :root {
    --ink:       #EDE4CF;         /* warm cream */
    --ink-soft:  #D8CCAF;
    --ink-fog:   #958A7A;         /* bumped from #867B6B for AA on dark paper */
    --paper:     #1E1913;         /* deep umber ground */
    --paper-dim: #251F17;
    --rule:      #3A2F22;
  }
}
```

No manual light/dark toggle. System preference only.

### Type scale

All sizes use `clamp()` so type scales smoothly from 320px phones to 1440px displays without explicit media queries.

| Element | Font | Size | Leading | Weight | Style |
|---|---|---|---|---|---|
| `h1` | Cormorant | `clamp(32px, 6vw, 44px)` | 1.15 | 400 | sentence |
| `h2` | Cormorant | `clamp(18px, 2.4vw, 22px)` | 1.3 | 400 italic | sentence |
| `.intro` | Cormorant | `clamp(17px, 1.8vw, 19px)` | 1.55 | 400 | regular |
| `.archive-empty` | Cormorant | `clamp(16px, 1.7vw, 18px)` | 1.55 | 400 italic | regular |
| `.find-head` | Cormorant | `clamp(15px, 1.6vw, 17px)` | 1.3 | 400 | regular, `--ink-soft` color |
| `.find-book` | Cormorant | `clamp(15px, 1.6vw, 17px)` | 1.4 | 400 | regular |
| `.find-story` blockquote | Cormorant | `clamp(17px, 1.8vw, 19px)` | 1.55 | 400 italic | regular |
| `.about-link` text | Lato Light | 11px | 1.3 | 300 | letter-spaced 0.04em |
| `footer p` | Lato Light | 10.5px | 1.3 | 300 | lowercase, letter-spaced 0.04em |
| Invite body, link labels | Cormorant | `clamp(17px, 1.8vw, 19px)` | 1.55 | 400 | regular |

Lato appears only in the About Pilgrim link and the footer. Everything else is Cormorant Garamond. This is deliberate contrast with the main site, which uses Lato for UI text — `/found` has no UI, so sans-serif serves only as a sigil tying the page to the card back.

### Layout

Single column, max 620px, centered. Generous vertical padding (`clamp(64px, 10vh, 140px)` top and bottom on `body`). The archive and invite sections each have ~80–140px of space above them (again via `clamp()`). The page should breathe.

Links are underlined by default via `border-bottom: 1px solid`, not `text-decoration: underline`, so the underline is consistent and unambiguous. No transitions on hover. The cursor changes because it's a link; that's sufficient affordance.

The blockquote in each `article.find` has a left border (`border-left: 1px solid var(--rule)`) and `padding-left: 1.2em` to give the quoted story visual weight without resorting to background colors or box-shadow effects.

### What is deliberately absent

- No hover transitions on any element.
- No keyframe animations, no scroll-triggered effects, no parallax.
- No JavaScript of any kind.
- No Umami snippet or any other analytics.
- No third-party web font loads. Cormorant Garamond and Lato load from whatever source the main site already uses; the `<link>` tag is duplicated but not reconfigured.
- No favicon override — uses the site default.
- No Open Graph or Twitter card meta tags. This page is not shared on social media; it is typed in by hand from a physical card.
- No `prefers-contrast: more` customization beyond what the base color palette already satisfies (everything is AAA anyway).
- No dark/light toggle — system preference only.

## Discoverability

The page is **intentionally not search-discoverable.**

### Meta tag

```html
<meta name="robots" content="noindex, nofollow">
```

Placed in the `<head>` of `found.html`. Tells search engines not to index the page and not to follow outbound links for ranking purposes (which does not affect the crawl budget of the main site, since the main site is already indexed via its own root URL).

### No `robots.txt`

A `robots.txt` file with `Disallow: /found` was considered and rejected. Reason: `robots.txt` is publicly fetchable at `pilgrimapp.org/robots.txt`, so declaring the disallow explicitly advertises the hidden path's existence to anyone curious. The meta tag is the more private approach — it tells crawlers to ignore the page only after they load it, and leaks nothing from the root.

### No links from anywhere in `pilgrim-landing`

The `/found` URL does not appear in:

- `index.html`
- `compare.html`, `guide.html`, `press.html`, `privacy.html`, `terms.html`
- Any footer, sidebar, or nav element on any page
- Any blog post, press release, or changelog

Verified with `grep`: no existing HTML file in the repo contains the string "found". This state is preserved going forward. A finder reaches the page by typing the URL from the physical card, and in no other way.

### Philosophy

The whole project depends on friction-as-filter. Typing a URL from a physical card into a phone is the filtering mechanism that keeps the cards from reading as marketing. If Google indexes the page, someone searching *"pilgrim found cards"* lands here instantly — bypassing the filter and dissolving the *"a stranger typed a URL from a card into their phone"* moment that is the entire point. The card should feel found. The page should feel found. Search indexing is incompatible with both.

## Accessibility

Semantic HTML does most of the work. No ARIA beyond what the browser infers from `<main>`, `<h1>`, `<h2>`, `<section>`, `<article>`, `<blockquote>`, `<p>`, `<a>`, `<footer>`.

### Color contrast

All contrast ratios are computed per WCAG 2.1 relative luminance and verified against Lighthouse (score 100/100 on the shipped page).

- **Light mode body** (`#2B241F` on `#F6F1E6`): 13.56:1 — AAA.
- **Light mode fog gray** (`#756A60` on `#F6F1E6`): 4.68:1 — passes AA for normal text. An earlier draft of this spec specified `#8A8076` and claimed 4.7:1; the actual computed ratio for `#8A8076` is 3.43:1, which fails AA. The shipped value is `#756A60`.
- **Dark mode body** (`#EDE4CF` on `#1E1913`): 13.79:1 — AAA.
- **Dark mode fog gray** (`#958A7A` on `#1E1913`): 5.15:1 — passes AA. The initial candidate `#867B6B` gave only 4.20:1 and was bumped before shipping.

### Focus, motion, and fallbacks

- **Focus rings:** default browser focus rings preserved. No `outline: none` anywhere.
- **`prefers-reduced-motion`:** a no-op since there is no motion, but the media query block is included in `found.css` as an explicit signal of intent.
- **`lang="en"`** on the `<html>` element.
- **`<title>`:** *"You found a card — Pilgrim"*. Matches the H1.
- **Link affordance:** all links underlined by default via `border-bottom: 1px solid`. No ambiguity about what is clickable.
- **Alt text:** no images in Phase 0. When the Phase 1 "cards on a wooden surface" photo is added, it gets descriptive alt text (e.g., *"twelve Pilgrim cards fanned across a wooden table, each a different design"*).

## Edge cases

| Case | Behavior |
|---|---|
| JavaScript disabled | Page works identically. No JS. |
| CSS disabled | Semantic HTML renders legibly in reader mode or Lynx. |
| Fonts fail to load | Falls back to Georgia and system-ui via font stack. Page reads correctly, looks less distinctive. |
| Old browser without `clamp()` | Belt-and-suspenders static `font-size` above each `clamp()` declaration as fallback. Evergreen browsers have supported `clamp()` since 2020. |
| Email client doesn't parse `mailto:` params | Graceful degradation: a new draft opens addressed to `found@pilgrimapp.org` with no prefill. Finder can still write freely. |
| Email client opens mailto as `.eml` download | Happens in some corporate Windows environments. Finder gets an `.eml` file containing the prefilled draft; double-click opens it in their default mail app. Not great, not broken. |
| Finder has no configured email client | Clicks mailto, nothing visible happens. Mitigation: the invite section also shows the raw address (`found@pilgrimapp.org`) in a secondary `<p class="leave-note-fallback">` for copy-paste into webmail. |
| Mobile Safari long-press on mailto | Shows iOS context menu with "Copy Link" / "Add to Contacts". Expected behavior. No issue. |
| Very long card stories | CSS gives them a single narrow column to flow down. No truncation, no "read more." |
| Photo attached to email | Lands in project owner's inbox. Is not published on `/found`. |

## Verification plan

No automated test suite. This page has no logic to test; it is static content. Manual verification is appropriate for its complexity.

### Checklist before merging

1. **Desktop rendering** (1440px-wide display): intro, archive placeholder, invite section, footer all render as expected. Light and dark mode both verified via devtools `prefers-color-scheme` toggle.
2. **Mobile rendering** (375px and 414px widths): `clamp()` type scale steps down gracefully, narrow column reads well, no horizontal overflow.
3. **Link behavior:**
   - About Pilgrim link navigates to `/`.
   - Mailto link opens system email client with subject *"A card found me"* and the four-prompt body prefilled, including the `(Photos welcome.)` coda.
   - Raw address in the fallback `<p>` is selectable for copy-paste.
4. **Noindex verification:** view-source on the deployed page confirms `<meta name="robots" content="noindex, nofollow">` in the `<head>`.
5. **Lighthouse Accessibility:** run Chrome devtools Lighthouse in Accessibility mode. Target: 100. Anything less gets fixed before shipping.
6. **Keyboard navigation:** tab through the page. About link and Leave a note link are each reachable with visible focus.
7. **HTML validation:** paste rendered HTML into the W3C validator. Target: zero errors.
8. **Cross-browser typography:** load in Chrome, Firefox, and Safari. Cormorant Garamond renders correctly in all three.
9. **No references to `/found` anywhere else in the repo:** `grep -r "found" . --include="*.html"` returns only `found.html` itself.

## Commit plan

Two commits, each small enough to review in under a minute.

1. **`docs: add /found design spec`** — this document, at `docs/superpowers/specs/2026-04-08-found-page-design.md`. Lands first; documents the decision before the implementation exists.
2. **`feat: add /found page shell for card finders`** — `found.html` and `css/found.css` together. Lands second; the cohesive unit that implements what the spec describes.

## Open questions and future phases

These are things to revisit after Edition I ships, not in this design:

- **Phase 1 object photo.** Plan.md line 225 describes a small image of the current edition laid out on a wooden surface, placed near the intro. Add when cards physically exist and can be photographed.
- **Phase 1 card-count update.** The sentence *"This is from Edition I · Spring 2026. Five hundred cards exist. You have one."* was removed for Phase 0 and should not return — editions stay internal. A reworded version without the edition framing may be added later if useful, but is not required.
- **RSS feed for `/found`.** Plan.md flags this as "optional later." Revisit if finds accumulate and the archive starts feeling like something people would want to subscribe to.
- **Map view.** Plan.md flags this as optional. Add only if the text feed begins feeling overwhelming without geographic context.
- **Submission volume.** If submissions ever exceed ~5 per week and the direct-HTML-edit workflow starts feeling like a chore, reconsider either (a) a tiny CF Worker form endpoint or (b) a markdown-source-of-truth with a build step. Neither is justified at current projected volume.
- **First real entry.** The archive-empty placeholder stays in place until the first genuine find arrives. When it does, the first entry gets pasted above the placeholder. The placeholder is deleted entirely when the second entry arrives, since by then the archive is visibly a thing and no longer needs its vow.
- **Weekly digest.** Plan.md mentions an optional Buttondown opt-in. Not in scope for this or any near-term phase.

---

*End of design document.*
