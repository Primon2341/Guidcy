/* Refresh keeps the current page on screen from the first frame.
 *
 * Every route lives in index.html with page-home marked "on", so a refresh used
 * to paint Home and swap to the real page only after app.js (~2MB) had run. The
 * head bootstrap now shows the requested page's static shell (or a skeleton for
 * JS-built pages) and the cached signed-in header before any script executes.
 * This holds app.js back for a moment and looks at that window, then checks the
 * bootstrap hands over cleanly once the app renders.
 *
 * Run: npm run build && node tests/refresh-first-paint-browser.test.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, 'browser-flow.test.cjs'), 'utf8');
const start = source.indexOf('const fakeSupabase =');
const fixture = vm.runInNewContext(source.slice(start, source.indexOf('\n(async', start)) + '\nfakeSupabase');
const authFixture = fixture + `
(function(){
 var original=window.supabase.createClient;
 var session=JSON.parse(sessionStorage.getItem('__authTestOAuthSession')||'null');
 window.supabase.createClient=function(){
 var c=original.apply(this,arguments),from=c.from;
 c.from=function(table){var q=from(table);if(table==='profiles')q.or=function(){return q.eq('id',window.__guidcyTestProfile.id)};return q};
 c.auth.getSession=function(){return Promise.resolve({data:{session:session},error:null})};
 c.auth.getUser=function(){return Promise.resolve({data:{user:session&&session.user},error:null})};
 c.auth.onAuthStateChange=function(fn){queueMicrotask(function(){fn('INITIAL_SESSION',session)});return {data:{subscription:{unsubscribe:function(){}}}}};
 return c;
 };
})();`;

const root = path.resolve(__dirname, '..', 'public');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
 let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
 if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
 res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/html' });
 fs.createReadStream(file).pipe(res);
});

const HOLD_MS = 2500;
const shots = process.env.SHOT_DIR || '';

(async () => {
 let browser;
 try {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

 async function makeContext(loggedIn) {
 const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
 await context.addInitScript(loggedIn => {
 const user = { id: 'test-user', email: 'user@example.com', user_metadata: { full_name: 'Test user', role: 'user' } };
 window.__guidcyTestAuthUser = user;
 window.__guidcyTestProfile = { id: user.id, email: user.email, full_name: 'Test user', role: 'user' };
 if (loggedIn && !localStorage.getItem('__test_signed_out')) {
 sessionStorage.setItem('__authTestOAuthSession', JSON.stringify({ user, access_token: 'offline-test-token' }));
 /* What the real SDK leaves behind; the bootstrap keys the cached header to it. */
 if (!localStorage.getItem('sb-test-auth-token')) localStorage.setItem('sb-test-auth-token', JSON.stringify({ user: { id: user.id } }));
 }
 }, loggedIn);
 let hold = false;
 await context.route('**/*', async route => {
 const url = route.request().url();
 if (url.includes('/assets/vendor/supabase.js')) return route.fulfill({ contentType: 'text/javascript', body: authFixture });
 if (!url.startsWith(origin) || url.includes('/_vercel/')) return route.abort();
 if (hold && url.includes('/assets/js/app.js')) await new Promise(r => setTimeout(r, HOLD_MS));
 return route.continue();
 });
 const page = await context.newPage();
 const errors = [];
 page.on('pageerror', e => errors.push((e && (e.message || e.name)) || String(e)));
 return { context, page, errors, setHold: v => { hold = v; } };
 }

 /* What is actually on screen while app.js is still on its way. */
 async function firstPaint(page, url, label) {
 await page.goto(origin + url, { waitUntil: 'commit' });
 await page.waitForSelector('#nav-right', { state: 'attached' });
 await page.waitForTimeout(400);
 if (shots) await page.screenshot({ path: path.join(shots, label + '-first-paint.png') });
 return page.evaluate(() => {
 const visible = el => !!el && getComputedStyle(el).display !== 'none';
 return {
 appLoaded: typeof window.go === 'function',
 boot: document.documentElement.getAttribute('data-guidcy-boot'),
 home: visible(document.getElementById('page-home')),
 shown: [...document.querySelectorAll('.page[id^="page-"]')].filter(visible).map(e => e.id),
 skeleton: visible(document.getElementById('guidcy-boot-skeleton')),
 nav: document.getElementById('nav-right').innerText.replace(/\s+/g, ' ').trim(),
 hasAvatar: !!document.querySelector('#nav-right .avatar-chip,#nav-right img'),
 };
 });
 }
 async function settled(page, label) {
 await page.waitForFunction(() => window.__guidcyAuthReadyFired && !document.documentElement.hasAttribute('data-guidcy-boot'));
 await page.waitForTimeout(1600);
 if (shots) await page.screenshot({ path: path.join(shots, label + '-settled.png') });
 return page.evaluate(() => ({
 boot: document.documentElement.getAttribute('data-guidcy-boot'),
 bootStyle: [...document.head.querySelectorAll('style')].some(s => /data-guidcy-boot/.test(s.textContent)),
 on: [...document.querySelectorAll('.page.on,.page.active')].map(e => e.id),
 skeleton: getComputedStyle(document.getElementById('guidcy-boot-skeleton')).display,
 nav: document.getElementById('nav-right').innerText.replace(/\s+/g, ' ').trim(),
 path: location.pathname,
 }));
 }

 /* ── Logged out: static pages show their own shell, JS-built pages a skeleton ── */
 {
 const { page, errors, setHold } = await makeContext(false);
 setHold(true);
 let fp = await firstPaint(page, '/webinars', 'webinars');
 assert.equal(fp.appLoaded, false, 'app.js must still be held back');
 assert.equal(fp.home, false, 'Home must not paint on /webinars');
 assert.deepEqual(fp.shown, ['page-webinar']);
 assert.equal(fp.skeleton, false);
 let done = await settled(page, 'webinars');
 assert.equal(done.boot, null); assert.equal(done.bootStyle, false);
 assert.deepEqual(done.on, ['page-webinar']);

 fp = await firstPaint(page, '/marketplace', 'marketplace');
 assert.equal(fp.home, false, 'Home must not paint on /marketplace');
 assert.deepEqual(fp.shown, []);
 assert.equal(fp.skeleton, true, 'JS-built page shows the skeleton');
 done = await settled(page, 'marketplace');
 assert.equal(done.skeleton, 'none');
 assert.ok(done.on.includes('page-marketplace'), JSON.stringify(done));

 /* A signed-out visitor refreshing a dashboard lands on login without ever seeing Home. */
 fp = await firstPaint(page, '/dashboard', 'dashboard-logged-out');
 assert.equal(fp.home, false);
 assert.deepEqual(fp.shown, ['page-user-dash']);
 done = await settled(page, 'dashboard-logged-out');
 assert.deepEqual(done.on, ['page-login']);
 assert.equal(done.path, '/login');

 /* Home itself is untouched by the bootstrap. */
 fp = await firstPaint(page, '/', 'home');
 assert.equal(fp.home, true); assert.equal(fp.boot, null);

 setHold(false);
 assert.deepEqual(errors, []);
 await page.context().close();
 }

 /* ── Logged in: the dashboard shell and the signed-in header are there from the first frame ── */
 {
 const { page, errors, setHold } = await makeContext(true);
 /* First visit renders the header for real and caches it. */
 await page.goto(origin + '/dashboard');
 await page.waitForFunction(() => !!document.querySelector('#nav-right .avatar-chip,#nav-right img'));
 assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('guidcy_nav_cache') || 'null')?.uid === 'test-user'), 'header cached for the session user');

 setHold(true);
 const fp = await firstPaint(page, '/dashboard?tab=upcoming', 'dashboard-logged-in');
 assert.equal(fp.appLoaded, false);
 assert.equal(fp.home, false, 'Home must not paint on a dashboard refresh');
 assert.deepEqual(fp.shown, ['page-user-dash']);
 assert.equal(fp.hasAvatar, true, 'signed-in header restored before app.js');
 assert.doesNotMatch(fp.nav, /log in/i);
 const done = await settled(page, 'dashboard-logged-in');
 assert.deepEqual(done.on, ['page-user-dash']);
 assert.equal(done.path, '/dashboard');
 assert.doesNotMatch(done.nav, /log in/i);
 setHold(false);

 /* Signing out drops the cached header so the next visitor never sees it. */
 await page.evaluate(() => { localStorage.setItem('__test_signed_out', '1'); localStorage.removeItem('sb-test-auth-token'); sessionStorage.removeItem('__authTestOAuthSession'); });
 await page.goto(origin + '/webinars');
 await page.waitForFunction(() => window.__guidcyAuthReadyFired);
 assert.equal(await page.evaluate(() => localStorage.getItem('guidcy_nav_cache')), null, 'cache cleared once the session is gone');
 assert.match(await page.evaluate(() => document.getElementById('nav-right').innerText), /log in|sign in/i);

 assert.deepEqual(errors, []);
 await page.context().close();
 }

 console.log('refresh first paint: ok');
 } finally {
 if (browser) await browser.close();
 server.close();
 }
})().catch(error => { console.error(error); process.exit(1); });
