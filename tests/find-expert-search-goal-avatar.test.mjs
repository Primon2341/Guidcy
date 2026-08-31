import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/base.css', import.meta.url), 'utf8');

test('expert dropdown renders the profile image with an initials fallback', () => {
  const helperStart = source.indexOf('function guidcySuggestAvatar(c){');
  const helperEnd = source.indexOf('\nfunction guidcyText(', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'avatar helper is present');

  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /c\.avatar_url\|\|c\.profile_image_url/);
  assert.match(helper, /<img src=/);
  assert.match(helper, /onerror="this\.remove\(\)"/);
  assert.match(helper, /guidcyEscHtml\(ini\)/);
  assert.ok((source.match(/guidcySuggestAvatar\(c\)/g) || []).length >= 4, 'all expert suggestion renderers use the shared avatar helper');
  assert.match(css, /\.search-suggest-avatar img\{[^}]*object-fit:cover/);
});

test('Goal stays independent from search unless the explicit action is used', () => {
  assert.doesNotMatch(source, /hGoal\.value\s*=\s*srch\.value/);
  assert.doesNotMatch(source, /bGoal\.value\s*=\s*bs\.value/);
  assert.doesNotMatch(source, /guidcyMatchBound/);
  assert.match(source, /id="'\+prefix\+'-goal" type="text" autocomplete="off"/);
  assert.match(source, />Use current search<\/button>/);
});
