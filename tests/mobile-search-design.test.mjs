import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');

test('Find Expert and Funds & Grants use mobile-only roomy rounded search fields', () => {
  assert.match(html, /class="browse-search-toolbar"/);
  assert.match(html, /class="opp-search-grid"/);
  assert.match(html, /class="opp-search-field"/);
  const mobileBlock = css.slice(css.indexOf('/* Mobile search inputs:'));
  assert.match(mobileBlock, /@media\(max-width:700px\)/);
  assert.match(mobileBlock, /#browse-search\{[\s\S]*?min-height:56px!important;[\s\S]*?font-size:16px!important/);
  assert.match(mobileBlock, /#opp-search-input\{[\s\S]*?height:58px!important;[\s\S]*?border-radius:20px!important;[\s\S]*?font-size:16px!important/);
  assert.match(mobileBlock, /\.opp-search-field\{[\s\S]*?grid-column:1\/-1!important/);
});

test('Find Expert filter request token is safe during early page initialization', () => {
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /window\.__guidcyFilterRun=Number\(window\.__guidcyFilterRun\)\|\|0/);
  assert.match(app, /const run=\+\+window\.__guidcyFilterRun/);
  assert.doesNotMatch(app, /let guidcyFilterRun=0/);
});
