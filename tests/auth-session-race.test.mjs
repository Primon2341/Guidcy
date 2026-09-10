import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const start = app.indexOf(' function getCurrentUser()', app.indexOf('function installGuidcyJobSaves'));
const helpers = app.slice(start, app.indexOf(' function userKey()', start));

test('login return URLs include Home and queries but reject external and authentication routes', () => {
 const from = app.indexOf(' function safeSameSitePath(raw){');
 const source = app.slice(from, app.indexOf(' function rawStoredReturn()', from));
 const validate = vm.runInNewContext(`(function(){${source};return safeSameSitePath})()`, { URL, location: { origin: 'https://guidcy.example' } });
 assert.equal(validate('/'), '/');
 assert.equal(validate('/marketplace?category=Career#notes'), '/marketplace?category=Career#notes');
 for (const path of ['/login', '/signup', '/get-started', 'https://other.example/', '//other.example/']) assert.equal(validate(path), '');
});

test('Supabase auth events release the callback before profile work starts', async () => {
 let listener, insideCallback = false, profiles = 0;
 const window = {};
 const context = vm.createContext({
 window, queueMicrotask, currentUser: null, currentProfile: null, loggedIn: null,
 console, updateNav() {},
 sb: { auth: {
 getSession: async () => ({ data: { session: null } }),
 onAuthStateChange(fn) { listener = fn; },
 } },
 loadProfile: async () => { assert.equal(insideCallback, false); profiles++; },
 });
 const from = app.indexOf('async function initAuth(){');
 const source = app.slice(from, app.indexOf('async function loadProfile(){', from));
 await vm.runInContext(source + '\ninitAuth()', context);
 insideCallback = true;
 assert.equal(listener('SIGNED_IN', { user: { id: 'google-user' } }), undefined);
 assert.equal(profiles, 0);
 insideCallback = false;
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(profiles, 1);
 listener('SIGNED_IN', { user: { id: 'google-user' } });
 window.__guidcyAuthEpoch = 1;
 window.__guidcySignedOut = true;
 listener('SIGNED_OUT', null);
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(profiles, 1, 'logout cancels queued profile work');
 assert.equal(window.currentUser, null);
});

test('boot recovery cannot undo an explicit login return to Home', () => {
 const from = app.indexOf(' function targetInfo(){');
 const source = app.slice(from, app.indexOf(' function activePage()', from));
 const home = { known: true, page: 'home', url: '/' };
 const bootInfo = { known: true, page: 'login', url: '/login?code=callback' };
 const window = { __GUIDCY_REQUESTED_URL_V6__: '/' };
 const targetInfo = vm.runInNewContext(`(function(){${source};return targetInfo})()`, {
 window, bootInfo, bootPath: bootInfo.url, bootUntil: Date.now() + 12000,
 infoFor: () => home, currentUrl: () => '/', cleanPath: () => '/', location: { pathname: '/' },
 });
 assert.equal(targetInfo(), home);
 window.__GUIDCY_REQUESTED_URL_V6__ = bootInfo.url;
 assert.equal(targetInfo(), bootInfo, 'boot recovery remains available before intentional navigation');
});

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
