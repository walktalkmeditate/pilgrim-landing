#!/usr/bin/env bash
# Build all Sun Path OG images via headless Chrome.
#
# Outputs:
#   assets/og-sunpath.png               with --hub only
#   assets/og-{year}-{key}-{hash}.png   for each turning: the page's own
#       plate on scripts/render-og-plate.html, named by the hash the page's
#       og:image already carries (scripts/sunpath/permalink-template.mjs)
#
# Run from repo root:
#   bash scripts/build-og-sunpath.sh             # default year = 2026
#   bash scripts/build-og-sunpath.sh 2027        # render a specific year
#   bash scripts/build-og-sunpath.sh 2027 --hub  # and the hub's card too
#
# A turning card already on disk is kept: its name is a hash of everything
# it shows, so the same name means the same picture, and re-rendering it
# would only churn the PNG's bytes. Delete a card to render it again. The
# hub's og-sunpath.png carries no such hash, so it is rendered only when
# asked for with --hub.
#
# A turning keeps only the card its page names: older hashed cards are
# removed, and the unhashed og-{year}-{key}.png once no file names it.
#
# Requires Google Chrome or Chromium (the macOS app, google-chrome or
# chromium on PATH, or $CHROME) and ImageMagick (Chrome's --screenshot
# leaves ~40px of bottom padding; we crop to exact 1200x630).

set -euo pipefail

YEAR=2026
HUB=0
for arg in "$@"; do
  case "$arg" in
    --hub) HUB=1 ;;
    *) YEAR="$arg" ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/assets"
SCRIPTS="$ROOT/scripts"

if [ -z "${CHROME:-}" ]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$(command -v "$c")"; break; fi
  done
fi
if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "error: Chrome not found; set CHROME to its path" >&2
  exit 1
fi

if command -v magick >/dev/null 2>&1; then
  CROP=(magick)
elif command -v convert >/dev/null 2>&1; then
  CROP=(convert)
else
  echo "error: ImageMagick not found (brew install imagemagick)" >&2
  exit 1
fi

# Linux runners confine the unprivileged user namespaces Chrome's sandbox
# needs. The pages rendered here are this repo's own.
SANDBOX=()
if [ "$(uname)" = "Linux" ]; then SANDBOX=(--no-sandbox); fi

render() {
  local url="$1"
  local out="$2"
  local raw="/tmp/og-raw-$$.png"
  echo "  → $out"
  "$CHROME" ${SANDBOX[@]+"${SANDBOX[@]}"} \
    --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1200,670 \
    --screenshot="$raw" \
    --virtual-time-budget=8000 \
    "$url" >/dev/null 2>&1
  "${CROP[@]}" "$raw" -crop 1200x630+0+0 +repage "$out"
  rm -f "$raw"
}

# $1: the turning (2026-winter-solstice); $2: the card its page names.
prune() {
  local turning="$1"
  local keep="$ASSETS/$(basename "$2")"
  local old
  for old in "$ASSETS/og-$turning"-*.png; do
    if [ -e "$old" ] && [ "$old" != "$keep" ]; then
      echo "  ✗ ${old#"$ROOT"/}"
      rm -f "$old"
    fi
  done
  old="$ASSETS/og-$turning.png"
  if [ -e "$old" ] && ! grep -rIqF --exclude-dir='.*' --exclude-dir=docs \
      "og-$turning.png" "$ROOT"; then
    echo "  ✗ ${old#"$ROOT"/}"
    rm -f "$old"
  fi
}

echo "rendering Sun Path OG images (year=$YEAR)…"

if [ "$HUB" = 1 ]; then
  render "file://$SCRIPTS/render-og-sunpath.html" \
         "$ASSETS/og-sunpath.png"
fi

CARDS="$(mktemp -d)"
trap 'rm -rf "$CARDS"' EXIT

node "$SCRIPTS/sunpath/build-permalinks.mjs" "$YEAR" --cards "$CARDS" > "$CARDS/cards.tsv"

while IFS=$'\t' read -r PAGE PNG <&3; do
  if [ ! -e "$ROOT/$PNG" ]; then render "file://$PAGE" "$ROOT/$PNG"; fi
  prune "$(basename "$PAGE" .html)" "$PNG"
done 3< "$CARDS/cards.tsv"

echo "done."
