/* Purchased Notes felt slow on the user dashboard and instant on the consultant
   one. Same renderer, same queries - the difference is WHEN each dashboard
   reaches it. The consultant arrives after auth has resolved; the user
   dashboard can render it during boot, and the no-session branch used to just
   return, leaving "Loading purchased notes..." up until some unrelated
   re-render happened to repaint it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const fn = app.slice(app.indexOf('async function purchases(btn,mainId){'),
                     app.indexOf('async function redownload(id)'));

test('a boot-time render waits for auth instead of an incidental repaint', () => {
  assert.match(fn, /window\.guidcyOnAuthReady\(function\(\)\{awaitingAuthForPurchases=false;purchases\(btn,mainId\)\}\)/,
    'it must re-render itself the moment initAuth finishes');
  assert.doesNotMatch(fn, /if\(orders===null\)return;/,
    'returning here is what left the panel on Loading');
  // the retry must carry the target panel, or the consultant view repaints the user one
  assert.match(fn, /purchases\(btn,mainId\)/);
});

test('it hooks auth only while auth is still pending, and only once', () => {
  assert.match(fn, /!window\.__guidcyAuthReadyFired&&typeof window\.guidcyOnAuthReady==='function'&&!awaitingAuthForPurchases/,
    'no second subscription, and no subscription once auth has already fired');
  assert.match(app, /let awaitingAuthForPurchases=false;/, 'the guard must outlive one call');
});

test('once auth has resolved, no session is stated rather than spun on', () => {
  assert.match(fn, /Please sign in to see your purchased notes/);
  const hook = fn.indexOf('guidcyOnAuthReady');
  const message = fn.indexOf('Please sign in to see your purchased notes');
  assert.ok(hook > -1 && message > hook,
    'the sign-in message must be the fallback after the auth wait, not before it');
});
