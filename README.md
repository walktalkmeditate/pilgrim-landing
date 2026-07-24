# Pilgrim — A Walking Practice

Landing page for [Pilgrim](https://github.com/walktalkmeditate/pilgrim-ios), a privacy-first iPhone, iPad, and Android app for intentional walking as creative practice.

## About

A single-scroll page designed as a walk itself — six sections from threshold to horizon. Colors shift with the seasons and time of day, the moon phase is real, and scroll distance is tracked as "meters walked."

Built with plain HTML, CSS, and JS. No build step. No dependencies.

## Features

- **Seasonal color engine** — colors shift based on the current season and time of day
- **Moon phase** — computed from the synodic month cycle, rendered as canvas
- **Time-aware quotes** — different walking wisdom for morning, afternoon, evening, and night
- **Dark/light mode** — respects `prefers-color-scheme` with manual toggle
- **Collective trail** — SVG path that draws itself on scroll, mapped to total distance walked by all pilgrims. Pilgrimage milestones, streak flame, km/mi toggle. Fetches from the counter API.
- **Logo heartbeat** — hero logo gently pulses when someone walked in the last hour
- **Goshuin seal** — generative SVG seal with hand-drawn animation on scroll. Hover elements to see what data shaped each ring, line, and dot. Full SHA-256 hash with shimmer.
- **Seasonal haiku** — Bashō poems on aged parchment card, changes with the season
- **Meditation video** — autoplay loop of the breathing circle embedded in the screenshot journey
- **Soundscape player** — 7 ambient soundscapes with long-press picker, iOS Safari compatible
- **Screenshot parallax** — subtle depth offset on screenshot pairs as you scroll
- **Walking footprints** — divider footprints animate in sequence on scroll
- **Cursor trail** — fading dots follow the mouse on desktop (respects prefers-reduced-motion)
- **App Store previews** — two 30s videos embedded on the press page
- **Scroll distance tracker** — converts scroll pixels to "meters walked"
- **Accessibility** — semantic HTML, `prefers-reduced-motion` support, ARIA labels

## Development

Open `index.html` in a browser. That's it.

## Deploy

Deployed via GitHub Pages from the `main` branch.

## Baking route data

The `assets/daylight/` directory holds pre-baked stage records used by the walk-budget feature. Run `./scripts/bake-daylight-routes` from the repo root whenever the upstream `open-pilgrimages` route data changes. The script reads `stages.json` and `metadata.json` from the sibling `../open-pilgrimages/` repo and writes one JSON array per route plus a `route-meta.json` summary — no dependencies beyond Node's built-ins. Output is deterministic: running the script twice in succession produces byte-identical files, so a clean `git diff assets/daylight/` confirms nothing drifted.

## Collective route data

`assets/collective-routes.json` holds the route catalog behind the collective trail on the homepage and `/now`. Run `./scripts/bake-collective-routes` from the repo root whenever the sibling `../open-pilgrimages` data changes — it reads `metadata.json`, `stages.json`, and `stats.json` for each route and rewrites the artifact. Output is deterministic, so a second run leaves `git diff assets/collective-routes.json` clean.

Baking only updates this repo. The apps read the same artifact from the CDN, so a route change reaches readers when it is published: `./scripts/publish-collective-routes` uploads it to `https://cdn.pilgrimapp.org/collective/routes.json` (the `collective/routes.json` object in the `pilgrimapp` R2 bucket). Pass `--dry-run` to print what would run without uploading. Both web pages read the CDN copy first and fall back to the committed `assets/` copy, so one publish updates every surface — site and apps together.

The script refuses to publish when the working artifact differs from a fresh bake, so what ships is always reproducible from `../open-pilgrimages`. If it stops you: re-bake, review the diff, commit, then publish.

**The `--remote` flag on `wrangler r2 object put` is load-bearing.** Without it wrangler writes to its local emulator, prints the same success line, and nothing reaches the CDN. The script always passes it — if you ever run the upload by hand, pass it too.

Bucket cache status is `DYNAMIC`, so an upload is live immediately and needs no purge. The published object carries `access-control-allow-origin: https://pilgrimapp.org`; from any other origin (a local server, a preview host) the CDN fetch fails and the pages fall back to the committed copy. That is the fallback working, not a bug.

## Related

- [Pilgrim iOS](https://github.com/walktalkmeditate/pilgrim-ios) — the iOS app
- [Pilgrim Android](https://github.com/walktalkmeditate/pilgrim-android) — the Android app
- [walktalkmeditate.org](https://walktalkmeditate.org) — philosophical companion project
