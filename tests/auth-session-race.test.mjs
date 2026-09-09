import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const start = app.indexOf(' function getCurrentUser()', app.indexOf('function installGuidcyJobSaves'));
const helpers = app.slice(start, app.indexOf(' function userKey()', start));

function fixture(getUser) {
  const window = { currentUser: null, __guidcyAuthEpoch: 0 };
  const context = vm.createContext({ window, currentUser: null, client: () => ({ auth: { getUser } }) });
  const ensureUser = vm.runInContext(`(function(){${helpers};return ensureUser})()`, context);
  return { window, context, ensureUser };
}

test('saved-jobs session restoration does not overwrite its user getter', async () => {
  const user = { id: 'session-user' };
  const { window, context, ensureUser } = fixture(async () => ({ data: { user } }));
  assert.equal(await ensureUser(), user);
  assert.equal(window.currentUser, user);
  assert.equal(context.currentUser, user);
  assert.equal(await ensureUser(), user);
});

test('a saved-jobs session lookup finishing after logout cannot restore the old user', async () => {
  let finish;
  const { window, context, ensureUser } = fixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = ensureUser();
  window.__guidcySignedOut = true;
  window.__guidcyAuthEpoch++;
  finish({ data: { user: { id: 'old-user' } } });
  assert.equal(await pending, null);
  assert.equal(window.currentUser, null);
  assert.equal(context.currentUser, null);
  assert.equal(await ensureUser(), null);
});

test('legacy boot routing cannot replay a queryless public route', () => {
  const routeStart = app.indexOf(' async function routeFromPath()');
  const legacyRouter = app.slice(routeStart, app.indexOf('async function postRazorpayEmailCheck()', routeStart));
  assert.doesNotMatch(legacyRouter, /addEventListener\(['"](?:popstate|DOMContentLoaded|load)['"]/);
  assert.doesNotMatch(app, /setTimeout\(\(\)=>\{history\.replaceState\(\{page:pageForPath\(\)\}/);
});

for (const stage of ['select', 'upsert']) {
  test(`profile ${stage} completion after logout cannot publish the previous account`, async () => {
    const window = { __guidcyAuthEpoch: 0 };
    const published = [];
    let finish, started;
    const reached = new Promise(resolve => { started = resolve; });
    const hold = () => new Promise(resolve => { finish = resolve; started(); });
    const row = { id: 'previous-account', role: 'user' };
    const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return stage === 'select' ? hold() : Promise.resolve({ data: row }); }, upsert() { return stage === 'upsert' ? hold() : Promise.resolve({}); } };
    const context = vm.createContext({ window, sb: { from: () => query }, setCP: value => published.push(value), isAdminEmail: () => false, safeInitials: () => 'PA' });
    const profileStart = app.indexOf('  window.guidcyEnsureAdminProfile=async function(user){');
    const profileEnd = app.indexOf('  window.loadProfile=async function(){', profileStart);
    vm.runInContext(app.slice(profileStart, profileEnd), context);
    const pending = window.guidcyEnsureAdminProfile({ id: row.id, email: 'previous@example.com' });
    await reached;
    window.__guidcySignedOut = true;
    window.__guidcyAuthEpoch++;
    finish({ data: row });
    assert.equal(await pending, null);
    assert.deepEqual(published, []);
  });
}
