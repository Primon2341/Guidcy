/* Three UI regressions, each with a single cause:
 *  - a webinar description clamped to two lines with no way to read the rest;
 *  - the whole webinar card acting as the register button;
 *  - the mobile dashboard "Menu" strip disappearing once open, so the drawer
 *    could not be closed by tapping it again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');

/* The renderer that actually runs is the last window.wbnRender assignment. */
const live = app.slice(app.lastIndexOf('window.wbnRender=function(){'));

test('only the register button opens registration, not the card', () => {
  const card = live.slice(live.indexOf('<div class="wbn-card"'), live.indexOf('wbn-card-banner'));
  assert.ok(!card.includes('onclick'), 'the card element must not carry an onclick');
  assert.ok(live.includes('data-wbn-register='), 'the register button keeps its hook');
  assert.ok(
    !app.includes(".wbn-card[data-wbn-id]')"),
    'the delegated handler must no longer open registration for any click on a card'
  );
});

test('a long description gets a View more toggle that un-clamps it', () => {
  assert.match(live, /String\(w\.desc\|\|''\)\.length>\d+\?'<button[^']*wbn-desc-more/);
  assert.match(css, /\.wbn-card-desc\.wbn-desc-open[\s\S]*?-webkit-line-clamp:unset!important/);

  /* The toggle itself, run against a stub element. */
  const fn = new Function('window', app.slice(app.indexOf('window.wbnToggleDesc=function'), app.lastIndexOf('window.wbnRender=function(){')) + 'return window.wbnToggleDesc;')({});
  const classes = new Set(['wbn-card-desc']);
  const desc = { classList: { contains: (c) => classes.has(c), toggle: (c) => (classes.has(c) ? (classes.delete(c), false) : (classes.add(c), true)) } };
  const btn = { previousElementSibling: desc, textContent: 'View more' };
  fn(btn);
  assert.ok(classes.has('wbn-desc-open'));
  assert.equal(btn.textContent, 'View less');
  fn(btn);
  assert.ok(!classes.has('wbn-desc-open'));
  assert.equal(btn.textContent, 'View more');
});

test('a second tap on the top-right Dashboard button goes back where it was', () => {
  const block = app.slice(app.indexOf('=== guidcy-dashboard-button-toggle ==='));
  assert.ok(block, 'the dashboard toggle handler is missing');
  /* Capture phase, or the button's own inline go() runs first. */
  assert.match(block, /addEventListener\('click',function\(e\)\{[\s\S]*\},true\)/);
  /* Only the header button and the drawer's copy of it. */
  assert.match(block, /#guidcy-dashboard-btn/);
  assert.match(block, /textContent[\s\S]*?'dashboard'/);
  /* First tap must fall through to the normal handler, so the dashboard opens. */
  assert.match(block, /if\(!dashboardOpen\(\)\)\{[\s\S]*?return;\}/);
  /* Second tap restores the page and the scroll position it was pressed at. */
  assert.match(block, /window\.history\.back\(\)/);
  assert.match(block, /window\.scrollTo\(0,y\)/);
});
