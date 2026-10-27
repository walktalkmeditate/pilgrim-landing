#!/usr/bin/env bash
# Build all Sun Path OG images via headless Chrome.
#
# Outputs:
#   assets/og-sunpath.png
#   assets/og-{year}-{key}-{hash}.png   for each turning: the page's own
#       plate on scripts/render-og-plate.html, named by the hash the page's
#       og:image already carries (scripts/sunpath/permalink-template.mjs)
#
# Run from repo root:
#   bash scripts/build-og-sunpath.sh           # default year = 2026
#   bash scripts/build-og-sunpath.sh 2027      # render a specific year
#
# A turning keeps only the card its page names: older hashed cards are
# removed, and the unhashed og-{year}-{key}.png once no file names it.
#
# Requires: Google Chrome (or Chromium) at the standard macOS path,
# and ImageMagick `convert` (Chrome's --screenshot leaves ~40px of
# bottom padding; we crop to exact 1200x630).

set -euo pipefail

YEAR="${1:-2026}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/assets"
SCRIPTS="$ROOT/scripts"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "error: Chrome not found at: $CHROME" >&2
  exit 1
fi

if ! command -v convert >/dev/null 2>&1; then
  echo "error: ImageMagick 'convert' not found (brew install imagemagick)" >&2
  exit 1
fi

render() {
  local url="$1"
  local out="$2"
  local raw="/tmp/og-raw-$$.png"
  echo "  → $out"
  "$CHROME" \
    --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1200,670 \
    --screenshot="$raw" \
    --virtual-time-budget=8000 \
    "$url" >/dev/null 2>&1
  convert "$raw" -crop 1200x630+0+0 +repage "$out"
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

render "file://$SCRIPTS/render-og-sunpath.html" \
       "$ASSETS/og-sunpath.png"

CARDS="$(mktemp -d)"
trap 'rm -rf "$CARDS"' EXIT

node "$SCRIPTS/sunpath/build-permalinks.mjs" "$YEAR" --cards "$CARDS" > "$CARDS/cards.tsv"

while IFS=$'\t' read -r PAGE PNG <&3; do
  render "file://$PAGE" "$ROOT/$PNG"
  prune "$(basename "$PAGE" .html)" "$PNG"
done 3< "$CARDS/cards.tsv"

echo "done."
