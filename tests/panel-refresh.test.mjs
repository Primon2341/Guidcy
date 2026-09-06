/* Dashboard views render in two steps - "Loading ..." first, real markup after.
   Re-rendering a view already on screen therefore blanked a good table for a
   few hundred ms, which is the blink. The placeholder is now held back while
   the panel has content. What must NOT change: real markup, empty states and
   error messages all still land, and nothing outside the three panels is
   touched. Verified in Chrome; these pin the decisions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../assets/js/ui-refresh.js', import.meta.url), 'utf8');

/* Exercise the real predicates rather than assert on their source. */
function load() {
  const from = src.indexOf('function textOf(');
  const to = src.indexOf('function setBusy(');
  assert.ok(from > -1 && to > from, 'the placeholder predicates must still be there');
  const PANEL = { firstChild: null, html: '' };
  const nativeStub = { get: { call: () => PANEL.html } };
  return {
    ...new Function('native', 'PLACEHOLDER_WORDS', 'PLACEHOLDER_MAX_TEXT',
      src.slice(from, to) + '\nreturn { isPlaceholder, hasContent };')(
      nativeStub, /(loading|searching|filtering|please wait|fetching)/i, 160),
    PANEL,
  };
}

test('only short loading-shaped markup counts as a placeholder', () => {
  const { isPlaceholder } = load();
  assert.equal(isPlaceholder('<div class="dash-title">All bookings</div><div>Loading booking, payment and payout details...</div>'), true);
  assert.equal(isPlaceholder('<div>Searching experts...</div>'), true);
  assert.equal(isPlaceholder('<div>Filtering experts...</div>'), true);

  // the three payloads that must never be held back
  assert.equal(isPlaceholder('<div>Unable to load booking and payout details. Please check access and try again.</div>'), false,
    'an error must always reach the panel');
  assert.equal(isPlaceholder('<div>No bookings found.</div>'), false,
    'an empty state is a result, not a placeholder');
  assert.equal(isPlaceholder('<table><tr><td>BK-1</td><td>Paid</td></tr></table>'), false);
  assert.equal(isPlaceholder(''), false);
  assert.equal(isPlaceholder(null), false);

  // a long payload that merely mentions the word is content, not a placeholder
  assert.equal(isPlaceholder('<div>' + 'Loading '.repeat(40) + '</div>'), false,
    'the length cap is what stops real markup being mistaken for a spinner');
});

test('a panel showing only its own placeholder is not treated as content', () => {
  const { hasContent, PANEL } = load();
  PANEL.firstChild = null;
  assert.equal(hasContent(PANEL), false, 'an empty panel must still get its first-paint spinner');

  PANEL.firstChild = {};
  PANEL.html = '<div class="dash-title">X</div><div>Loading purchased notes...</div>';
  assert.equal(hasContent(PANEL), false, 'a slow first load must not hold back its own spinner');

  PANEL.html = '<table><tr><td>BK-1</td></tr></table>';
  assert.equal(hasContent(PANEL), true, 'a rendered table is worth keeping on screen');
});

test('it stays narrowly scoped and cannot strand a panel', () => {
  assert.match(src, /var PANEL_IDS = \['adash-main', 'cdash-main', 'udash-main'\];/,
    'only the dashboard panels, nothing else on the site');
  assert.match(src, /var STALE_MS = 6000;/);
  assert.match(src, /pendingTimer = setTimeout\(/,
    'a render that never finishes must show its placeholder after all');
  assert.match(src, /catch \(_\) \{\s*native\.set\.call\(target, value\);/,
    'anything unexpected must fall through to the native setter');
  assert.match(src, /if \(!native \|\| typeof native\.set !== 'function'/,
    'no native descriptor means do nothing at all');
});

test('the script is registered so it actually ships', () => {
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const build = fs.readFileSync(new URL('../build-static.js', import.meta.url), 'utf8');
  const order = [...index.matchAll(/src="\/(assets\/js\/[\w.-]+\.js)"/g)].map(m => m[1]);
  assert.ok(order.includes('assets/js/ui-refresh.js'), 'index.html must load it');
  assert.ok(order.indexOf('assets/js/ui-refresh.js') > order.indexOf('assets/js/app.js'),
    'the panels are rendered by app.js, so attach after it');
  assert.equal((build.match(/assets\/js\/ui-refresh\.js/g) || []).length, 2,
    'it must be both minified and content-hashed, like every other script');
});
