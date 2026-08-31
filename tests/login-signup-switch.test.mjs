// "Create one free" navigated fine but always landed on the consultant form,
// even from the User login tab. These pin the mapping and the removed race.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

test('the login page hands off to the shared handler, not a hardcoded role', () => {
  assert.match(html, /No account\? <button type="button" onclick="guidcyGoSignupFromLogin\(\)">Create one free<\/button>/);
  // The nav "Get started" CTA at the top of index.html still hardcodes
  // consultant on purpose; only the login switch had to follow the tab.
  const switchLine = html.split('\n').find((l) => l.includes('Create one free'));
  assert.ok(!/swType\(/.test(switchLine), 'the login switch must not pick a role itself');
  assert.ok(!/setTimeout/.test(switchLine), 'the 50ms swType race must be gone');
});

test('the handler mirrors the selected login tab', () => {
  assert.ok(app.includes("window.guidcyGoSignupFromLogin=function()"));
  assert.ok(app.includes("selected==='li-c'?'consultant':'user'"),
    'consultant login -> consultant signup; user and admin -> user signup');
  assert.ok(app.includes("#page-login .type-tab.on"), 'must read the live tab, not assume one');
});

test('the login tab ids the handler reads still exist', () => {
  for (const id of ['li-u', 'li-c', 'li-a']) {
    assert.ok(html.includes(`id="${id}"`), `login tab ${id} missing`);
  }
  for (const id of ['su-u', 'su-c', 'su-user-form', 'su-cons-form']) {
    assert.ok(html.includes(`id="${id}"`), `signup element ${id} missing`);
  }
});
