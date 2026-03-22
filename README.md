# Pilgrim — A Walking Practice

Landing page for [Pilgrim](https://github.com/momentmaker/pilgrim-ios), a privacy-first iOS app for intentional walking as creative practice.

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

## Related

- [Pilgrim iOS](https://github.com/momentmaker/pilgrim-ios) — the app
- [walktalkmeditate.org](https://walktalkmeditate.org) — philosophical companion project
