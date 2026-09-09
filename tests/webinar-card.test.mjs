/* Two webinar-card regressions, each with a single cause:
 *  - a description clamped to two lines with no way to read the rest;
 *  - the whole card acting as the register button.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');

/* The renderer that actually runs is the last window.wbnRender assignment. */
const live = app.slice(app.lastIndexOf('window.wbnRender=function(){'));

test('published webinar cards omit registration totals without removing registration controls', () => {
 const metadata = live.slice(live.indexOf('<div class="wbn-card-meta">'), live.indexOf('<div class="wbn-card-speaker">'));
 assert.doesNotMatch(metadata, /registered|regCount\(/);
 assert.ok(live.includes('data-wbn-register='));
 assert.ok(app.includes('<th>Registrations</th>'), 'admin registration totals remain available');
 assert.doesNotMatch(app, /wbn-meta-item[^\n]* registered<\/div>/);
});

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
