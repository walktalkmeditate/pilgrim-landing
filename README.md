# Pilgrim — A Walking Practice

Pre-launch landing page for [Pilgrim](https://github.com/momentmaker/pilgrim-ios), a privacy-first iOS app for intentional walking as creative practice.

## About

A single-scroll page designed as a walk itself — six sections from threshold to horizon. Colors shift with the seasons and time of day, the moon phase is real, and scroll distance is tracked as "meters walked."

Built with plain HTML, CSS, and JS. No build step. No dependencies.

## Features

- **Seasonal color engine** — ported from the iOS app's Swift implementation, colors shift based on the current season and time of day
- **Moon phase** — computed from the synodic month cycle, rendered as a canvas element
- **Dark/light mode** — respects `prefers-color-scheme` with manual toggle, persisted to localStorage
- **Scroll-reveal animations** — Intersection Observer-driven fade-ins with staggered timing
- **Ambient particles** — CSS-animated floating dots in the hero
- **Rotating quotes** — crossfading walking wisdom on an 8-second interval
- **Scroll distance tracker** — converts scroll pixels to "meters walked"
- **Accessibility** — semantic HTML, `prefers-reduced-motion` support, ARIA labels

## Development

Open `index.html` in a browser. That's it.

## Deploy

Deployed via GitHub Pages from the `main` branch.

## Related

- [Pilgrim iOS](https://github.com/momentmaker/pilgrim-ios) — the app
- [walktalkmeditate.org](https://walktalkmeditate.org) — philosophical companion project
