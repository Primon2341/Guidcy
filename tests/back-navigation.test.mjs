/* Regression: the browser Back button jumped straight to the homepage.
   window.onpopstate fell back to 'home' whenever the history entry had a null
   state, and several pushState calls (footer routes) store exactly that. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not locate ${from} .. ${to}`);
  return src.slice(a, b + to.length);
};

const win = { location: { pathname: '/', hash: '' } };
const ctx = vm.createContext({ window: win });
vm.runInContext(slice('function getPageFromPath(){', "return h || 'home';\n}"), ctx);
const at = p => { win.location.pathname = p; return ctx.getPageFromPath(); };

test('null-state history entries still resolve to their real page, not home', () => {
  for (const [path, page] of [['/blog', 'blog'], ['/webinars', 'webinar'], ['/help-center', 'help'],
                              ['/dispute-resolution', 'dispute'], ['/browse', 'browse'],
                              ['/consultant/abc123', 'profile'], ['/', 'home']])
    assert.equal(at(path), page, path);
});

test('no popstate handler falls back to a hardcoded home', () => {
  for (const m of src.matchAll(/onpopstate\s*=\s*function[^\n]*\n?/g))
    assert.ok(!/\|\|\s*'home'\s*\)?;/.test(m[0]) || /getPageFromPath/.test(m[0]),
      `popstate handler hardcodes home: ${m[0].slice(0, 120)}`);
});
