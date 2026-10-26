/* =============================================
   The tab wears the theme

   Run via:  node js/theme-tab.test.js

   js/main.js runs here against a small fake browser. Clicking the moon
   toggle walks light → dark → star → light, and each step must change
   what the browser shows outside the page: the tab's icon and, on
   phones, the bar's colour (theme-color). Only the site's own icon is
   swapped: /walk loads the same main.js with the duck's icon, and a
   theme change must leave the duck alone.
   ============================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; failures.push(label); console.log('  ✗ ' + label); }
}

function boot(iconHref, prefersDark) {
  const docOn = {};
  const head = { children: [], appendChild: function (el) { this.children.push(el); } };
  const icon = { attrs: { href: iconHref }, getAttribute: function (k) { return this.attrs[k]; }, setAttribute: function (k, v) { this.attrs[k] = v; } };
  const toggle = {
    tagName: 'DIV', on: {}, attrs: {}, firstChild: null, classList: { add: function () {}, remove: function () {} },
    addEventListener: function (t, fn) { this.on[t] = fn; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    removeChild: function () {}, appendChild: function () {}
  };
  const classes = new Set();
  const store = {};
  const sandbox = {
    console: console,
    Math: Math,
    Date: Date,
    innerWidth: 1200,
    location: { hostname: 'localhost', protocol: 'http:' },
    matchMedia: function (q) { return { matches: /dark/.test(q) ? !!prefersDark : false }; },
    localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    setTimeout: function () { return 0; },
    setInterval: function () { return 0; },
    Universe: { activate: function () {}, deactivate: function () {} },
    document: {
      cookie: '',
      head: head,
      documentElement: { attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; }, getAttribute: function (k) { return this.attrs[k] || null; } },
      body: { classList: { add: function (c) { classes.add(c); }, remove: function (c) { classes.delete(c); }, contains: function (c) { return classes.has(c); } } },
      querySelector: function (sel) {
        if (sel === 'link[rel="icon"]') return icon;
        if (sel === 'meta[name="theme-color"]') return head.children.filter(function (c) { return c.name === 'theme-color'; })[0] || null;
        return null;
      },
      querySelectorAll: function () { return []; },
      getElementById: function (id) { return id === 'moon-toggle' ? toggle : null; },
      // Star mode paints its toggle on a canvas; nothing here reads it back.
      createElement: function () {
        const ctx = new Proxy({}, { get: function (t, k) { return k in t ? t[k] : function () { return { addColorStop: function () {} }; }; } });
        return { style: {}, getContext: function () { return ctx; } };
      },
      addEventListener: function (t, fn) { docOn[t] = fn; }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(MAIN, sandbox, { filename: 'main.js' });
  docOn.DOMContentLoaded();
  return {
    icon: function () { return icon.attrs.href; },
    bar: function () { const m = sandbox.document.querySelector('meta[name="theme-color"]'); return m && m.content; },
    click: function () { toggle.on.click(); }
  };
}

console.log('\n=== the moon toggle changes the tab ===\n');

const page = boot('assets/favicon.png', false);
ok(page.icon() === 'assets/favicon-light.png' && page.bar() === '#F5F0E8', 'a light visit shows the light icon and a paper-coloured bar');
page.click();
ok(page.icon() === 'assets/favicon-dark.png' && page.bar() === '#1C1914', 'dark: the gold mark on slate, and a night bar');
page.click();
ok(page.icon() === 'assets/favicon-star.png' && page.bar() === '#0a0a12', 'star: the lavender mark among stars, and a starfield bar');
page.click();
ok(page.icon() === 'assets/favicon-light.png' && page.bar() === '#F5F0E8', 'and round again to light');

ok(boot('assets/favicon.png', true).icon() === 'assets/favicon-dark.png', 'a visitor whose system is dark arrives with the dark icon');

const deep = boot('/assets/favicon.png', false);
deep.click();
ok(deep.icon() === '/assets/favicon-dark.png', 'a page that links the icon from the root keeps its root');

const duck = boot('assets/duck/favicon-32.png', false);
duck.click();
duck.click();
ok(duck.icon() === 'assets/duck/favicon-32.png', '/walk keeps its duck through every theme');

console.log('\n=== the icons are there ===\n');

['favicon-light', 'favicon-dark', 'favicon-star'].forEach(function (name) {
  ok(fs.existsSync(path.join(ROOT, 'assets', name + '.png')), 'assets/' + name + '.png exists (a missing icon fails silently, as a blank tab)');
});
['now.html', '404.html'].forEach(function (p) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  ok(/<link rel="icon" href="\/?assets\/favicon-dark\.png" type="image\/png" media="\(prefers-color-scheme: dark\)">/.test(html),
    p + ', which has no toggle, follows the system: the dark icon when the system is dark');
});

console.log('\n=== Summary ===\n');
console.log('passed: ' + passed);
console.log('failed: ' + failed);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log(failed ? '' : '\nall green');
process.exit(failed ? 1 : 0);
