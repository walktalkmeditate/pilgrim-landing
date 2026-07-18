/* seek-word — the intention word, cleaned on its way in.
   Pure and DOM-free so it can be node-tested and shared: js/seek.js is a
   bare IIFE that touches the DOM at load and can't be required in node, so
   the authoritative sanitizer lives here (mirrors js/collective-routes.js). */

(function (root) {
  'use strict';

  // 32 chars, lowercased, whitespace-collapsed, with HTML-significant
  // characters neutralized. The word is displayed via textContent (so markup
  // can't execute regardless), but a crafted ?word= link is attacker-supplied,
  // so we strip the dangerous characters here as a second, insertion-agnostic
  // layer. Internal spaces survive so secret phrases ("the way") still match.
  function sanitizeWord(raw) {
    var s = (raw == null) ? '' : String(raw);
    s = s.replace(/[<>&"'`]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim().toLowerCase();
    if (s.length > 32) { s = s.slice(0, 32).trim(); }
    return s;
  }

  var api = { sanitizeWord: sanitizeWord };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.SeekWord = api; }
})(typeof window !== 'undefined' ? window : globalThis);
