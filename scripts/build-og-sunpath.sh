#!/usr/bin/env bash
# Build all Sun Path OG images via headless Chrome.
#
# Outputs:
#   assets/og-sunpath.png
#   assets/og-{year}-{key}.png   for each turning
#
# Run from repo root:
#   bash scripts/build-og-sunpath.sh           # default year = 2026
#   bash scripts/build-og-sunpath.sh 2027      # render a specific year
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

echo "rendering Sun Path OG images (year=$YEAR)…"

render "file://$SCRIPTS/render-og-sunpath.html" \
       "$ASSETS/og-sunpath.png"

for KEY in spring-equinox summer-solstice autumn-equinox winter-solstice; do
  render "file://$SCRIPTS/render-og-turning.html?key=$KEY&year=$YEAR" \
         "$ASSETS/og-$YEAR-$KEY.png"
done

echo "done."
