// Defensive escaping for HTML attribute/text and JSON-LD string contexts.
// Data files are hand-curated and currently safe, but a stray `"` or `&` in
// a future field should not break the rendered page or the JSON-LD payload.

export function htmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function htmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Renders a JSON string literal (with surrounding quotes) safe to drop into
// a <script type="application/ld+json"> payload. JSON.stringify handles the
// usual escapes; we additionally escape `<` to keep a stray `</script>` from
// terminating the host script tag.
export function jsonStr(value) {
  return JSON.stringify(String(value)).replace(/</g, '\\u003c');
}
