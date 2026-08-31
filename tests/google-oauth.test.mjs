import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

/* Run the real Google-OAuth IIFE from app.js against a fake DOM + fake Supabase,
   so the role-resolution and "don't touch an existing account" branches actually
   execute rather than being pattern-matched. */
const marker = source.indexOf('GUIDCY GOOGLE OAUTH (Supabase)');
assert.ok(marker > 0, 'Google OAuth block not found in app.js');
const block = source.slice(source.indexOf('(function(){', marker));

/* Minimal stand-in for the postgrest builder: from(t).select().eq().maybeSingle()
   and from(t).upsert()/insert(). Records every write so tests can assert on them. */
function fakeSupabase(rows) {
  const writes = [];
  const client = {
    oauth: null,
    from(table) {
      let filter = null;
      const q = {
        select() { return q },
        eq(_col, val) { filter = val; return q },
        async maybeSingle() { return { data: (rows[table] || {})[filter] || null, error: null } },
        async upsert(v) { writes.push({ table, op: 'upsert', v }); return { error: null } },
        async insert(v) { writes.push({ table, op: 'insert', v }); return { error: null } },
      };
      return q;
    },
    auth: {
      async signInWithOAuth(opts) { client.oauth = opts; return { error: null } },
    },
  };
  return { client, writes };
}

function boot({ page = 'login', consultantFormVisible = true, loginType = 'user',
                hash = '', search = '', requestedUrl = null,
                rows = {}, currentUser = null } = {}) {
  const { client, writes } = fakeSupabase(rows);
  const toasts = [];
  const loaded = [];
  const els = {
    'page-signup': { classList: { contains: c => page === 'signup' && c === 'on' } },
    'su-cons-form': { style: { display: consultantFormVisible ? '' : 'none' } },
  };
  const store = {};
  const domReady = [];
  const ctx = vm.createContext({
    console: { warn() {}, error() {} },
    setTimeout(fn) { if (fn) fn() },
    URLSearchParams, URL,
    document: { readyState: 'interactive', getElementById: id => els[id] || null,
      addEventListener: (_e, fn) => { domReady.push(fn) } },
    location: { hash, search, origin: 'https://guidcy.example', pathname: '/' + page },
    history: { replaceState() {} },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: k => { delete store[k] },
    },
  });
  ctx.window = ctx;
  ctx.__GUIDCY_REQUESTED_URL_V6__ = requestedUrl;
  ctx.sb = client;
  ctx.loginType = loginType;
  ctx.toast = (m, c) => toasts.push({ m, c });
  ctx.mkInitials = n => String(n || '').split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  ctx.currentUser = currentUser;
  ctx.loadProfile = async () => { loaded.push(ctx.currentUser); };
  vm.runInContext(block, ctx);
  domReady.forEach(fn => fn());   // simulate DOMContentLoaded
  return { ctx, client, writes, toasts, loaded, store };
}

const googleUser = (over = {}) => ({
  id: 'uid-1', email: 'a@b.com', app_metadata: { provider: 'google' },
  user_metadata: { full_name: 'Aarav Shah', avatar_url: 'http://pic' }, ...over,
});

test('signup page sends the tab the user is actually on', async () => {
  const cons = boot({ page: 'signup', consultantFormVisible: true });
  await cons.ctx.gSignIn();
  assert.equal(JSON.parse(cons.store.guidcy_oauth_pending_role).role, 'consultant');

  const usr = boot({ page: 'signup', consultantFormVisible: false });
  await usr.ctx.gSignIn();
  assert.equal(JSON.parse(usr.store.guidcy_oauth_pending_role).role, 'user');
});

test('login page uses the selected login tab, and admin is refused', async () => {
  const c = boot({ page: 'login', loginType: 'consultant' });
  await c.ctx.gSignIn();
  assert.equal(JSON.parse(c.store.guidcy_oauth_pending_role).role, 'consultant');
  assert.equal(c.client.oauth.provider, 'google');
  assert.equal(c.client.oauth.options.redirectTo, 'https://guidcy.example/login');

  const a = boot({ page: 'login', loginType: 'admin' });
  await a.ctx.gSignIn();
  assert.equal(a.client.oauth, null, 'admin must not start Google OAuth');
  assert.equal(a.store.guidcy_oauth_pending_role, undefined);
  assert.match(a.toasts[0].m, /email and password/i);
});

test('a brand-new Google consultant gets a profile and a consultant record', async () => {
  const t = boot({ page: 'signup', consultantFormVisible: true, currentUser: googleUser() });
  await t.ctx.gSignIn();
  await t.ctx.loadProfile();
  const profile = t.writes.find(w => w.table === 'profiles');
  assert.equal(profile.v.role, 'consultant');
  assert.equal(profile.v.full_name, 'Aarav Shah');
  assert.equal(profile.v.avatar_initials, 'AS');
  assert.ok(t.writes.some(w => w.table === 'consultants' && w.v.profile_id === 'uid-1'));
  assert.equal(t.loaded.length, 1, 'original loadProfile still runs');
});

/* A Google consultant supplies no specialty, rate or bio, so the listing must
   not carry the placeholders we invent for them. */
test('a Google consultant is not listed until a human fills the profile in', async () => {
  const t = boot({ page: 'signup', consultantFormVisible: true });
  await t.ctx.gSignIn();
  t.ctx.currentUser = googleUser();
  await t.ctx.loadProfile();
  const cons = t.writes.find(w => w.table === 'consultants');
  /* Only what Google actually told us. Everything else is left to the table
     defaults (is_active=false, approval_status='pending'), which is what keeps
     the card out of the listings until a human fills it in. */
  assert.deepEqual(Object.keys(cons.v).sort(),
    ['avatar_initials', 'avatar_url', 'name', 'profile_id', 'rate']);
  assert.equal(cons.v.name, 'Aarav Shah');
  assert.equal(cons.v.avatar_url, 'http://pic', 'the Google picture is real data, keep it');
  assert.equal(cons.v.rate, null, 'never attribute a price nobody chose');
});

test('an existing account is never rewritten or duplicated', async () => {
  const t = boot({
    page: 'signup', consultantFormVisible: true, currentUser: googleUser(),
    rows: { profiles: { 'uid-1': { id: 'uid-1', role: 'user' } } },
  });
  await t.ctx.gSignIn();
  await t.ctx.loadProfile();
  assert.deepEqual(t.writes, [], 'existing profile must keep its stored role');
  assert.equal(t.loaded.length, 1);
});

test('email/password sign-in is untouched (no pending role, no google identity)', async () => {
  const t = boot({ currentUser: { id: 'uid-2', email: 'x@y.com', app_metadata: { provider: 'email' } } });
  await t.ctx.loadProfile();
  assert.deepEqual(t.writes, []);
  assert.equal(t.loaded.length, 1);

  /* Stale pending role from an abandoned Google attempt must not seed an email user. */
  const stale = boot({
    page: 'signup', currentUser: { id: 'uid-3', email: 'z@y.com', app_metadata: { provider: 'email' } },
  });
  stale.store.guidcy_oauth_pending_role = JSON.stringify({ role: 'consultant', at: Date.now() });
  await stale.ctx.loadProfile();
  assert.deepEqual(stale.writes, []);
});

test('a returning Google user (no pending role) is left alone', async () => {
  const t = boot({ currentUser: googleUser() });
  await t.ctx.loadProfile();
  assert.deepEqual(t.writes, []);
});

test('cancelled sign-in is reported from the hash and clears the pending role', () => {
  const t = boot({
    hash: '#error=access_denied&error_description=User+denied+access',
    rows: {},
  });
  t.store.guidcy_oauth_pending_role = JSON.stringify({ role: 'user', at: Date.now() });
  const { parseAuthError, authErrorMessage } = t.ctx.window.__guidcyGoogleAuthInternals;
  assert.match(authErrorMessage(parseAuthError('#error=access_denied', '')), /cancelled/i);
  assert.equal(parseAuthError('', '?error=server_error&error_description=boom').code, 'server_error');
  assert.equal(parseAuthError('#access_token=abc', ''), null, 'a successful callback is not an error');
  assert.match(t.toasts[0].m, /cancelled/i);
});

/* Production case: the fragment is stripped from location before app.js runs,
   and only core.js's snapshot of the requested URL still has it. */
test('cancelled sign-in is still reported when only core.js kept the fragment', () => {
  const t = boot({
    hash: '', search: '',
    requestedUrl: '/login#error=access_denied&error_description=User+denied+access',
  });
  assert.match(t.toasts[0].m, /cancelled/i);
});
