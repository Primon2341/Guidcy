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
 var state=window.__authTest={session:JSON.parse(sessionStorage.getItem('__authTestOAuthSession')||'null'),signIns:0,signOuts:0,holdLogout:false,events:[]};
 var listeners=[];
 function emit(event){state.events.push(event);listeners.forEach(function(fn){fn(event,state.session)})}
 state.emit=emit;
 window.supabase.createClient=function(){
 var c=original.apply(this,arguments),from=c.from;
 c.from=function(table){var q=from(table);if(table==='profiles')q.or=function(){return q.eq('id',window.__guidcyTestProfile.id)};return q};
 c.auth.getSession=function(){return Promise.resolve({data:{session:state.session},error:null})};
 c.auth.getUser=function(){return Promise.resolve({data:{user:state.session&&state.session.user},error:null})};
 c.auth.signInWithOAuth=async function(options){
 var user=Object.assign({},window.__guidcyTestAuthUser,{app_metadata:{provider:'google'}});
 sessionStorage.setItem('__authTestOAuthSession',JSON.stringify({user:user,access_token:'offline-google-token'}));
 location.assign(options.options.redirectTo+'?code=offline-google-code');
 return {error:null};
 };
 c.auth.onAuthStateChange=function(fn){listeners.push(fn);queueMicrotask(function(){fn('INITIAL_SESSION',state.session)});return {data:{subscription:{unsubscribe:function(){listeners=listeners.filter(function(x){return x!==fn})}}}}};
 c.auth.signInWithPassword=async function(credentials){
 state.signIns++;
 if(credentials.password==='wrong-password')return {data:{user:null,session:null},error:{message:'Invalid login credentials'}};
 state.session={user:window.__guidcyTestAuthUser,access_token:'offline-test-token'};
 emit('SIGNED_IN');
 return {data:{user:state.session.user,session:state.session},error:null};
 };
 c.auth.signOut=async function(){
 state.signOuts++;
 if(state.holdLogout)await new Promise(function(resolve){state.finishLogout=resolve});
 state.session=null;sessionStorage.removeItem('__authTestOAuthSession');emit('SIGNED_OUT');return {error:null};
 };
 return c;
 };
})();`;
const root = path.resolve(__dirname, '..', 'public');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
 let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
 if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
 res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/html' });
 fs.createReadStream(file).pipe(res);
});

(async () => {
 let browser;
 try {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
 for (const width of [390, 1280]) for (const role of ['user', 'consultant', 'admin']) {
 const context = await browser.newContext({ viewport: { width, height: 850 } });
 await context.addInitScript(role => {
 const id = role === 'consultant' ? 'expert-profile' : role === 'admin' ? 'test-admin' : 'test-user';
 const email = role === 'consultant' ? 'expert@example.com' : role === 'admin' ? 'admin@example.com' : 'user@example.com';
 window.__guidcyTestAuthUser = { id, email, user_metadata: { full_name: 'Test ' + role, role } };
 window.__guidcyTestProfile = { id, email, full_name: 'Test ' + role, role };
 window.__routeTestLog = [];
 for (const name of ['pushState', 'replaceState']) {
 const original = History.prototype[name];
 History.prototype[name] = function(state, title, url) {
 window.__routeTestLog.push({ url, stack: new Error().stack });
 return original.apply(this, arguments);
 };
 }
 }, role);
 await context.route('**/*', route => {
 const url = route.request().url();
 if (url.includes('/assets/vendor/supabase.js')) return route.fulfill({ contentType: 'text/javascript', body: authFixture });
 if (!url.startsWith(origin)) return route.abort();
 return route.continue();
 });
 const page = await context.newPage();
 const browserErrors = [];
 page.on('pageerror', error => { browserErrors.push(error.stack); console.log('browser error:', error.stack); });
 page.setDefaultTimeout(10000);
 const waitForFunction = page.waitForFunction.bind(page);
 page.waitForFunction = async (...args) => {
 try { return await waitForFunction(...args); }
 catch (error) {
 console.log(JSON.stringify(await page.evaluate(() => ({ path: location.href, active: document.querySelector('.page.on')?.id, user: window.currentUser, profile: window.currentProfile, auth: window.__authTest, signedOut: window.__guidcySignedOut, intent: window.__GUIDCY_REQUESTED_URL_V6__, returnTo: sessionStorage.getItem('guidcy_login_return_v6'), log: window.__routeTestLog.slice(-12) })), null, 2));
 throw error;
 }
 };
 let checkedAdminEntry = false;
 async function enterLogin() {
 if (!(await page.locator('#page-login').evaluate(el => el.classList.contains('on')))) {
 if (width < 900) {
 await page.locator('#mobile-burger').click();
 await page.locator('#gmob-auth-btns').getByRole('button', { name: /^(Log in|Sign in)$/i }).click();
 } else {
 await page.locator('#nav-right').getByRole('button', { name: /^(Log in|Sign in)$/i }).click();
 }
 }
 if (!checkedAdminEntry) {
 await require('./login-admin-entry.cjs')(page, width);
 checkedAdminEntry = true;
 }
 await page.locator('#li-' + ({ user: 'u', consultant: 'c', admin: 'a' }[role])).click().catch(async error => {
 console.log(JSON.stringify(await page.evaluate(() => ({ path: location.href, active: document.querySelector('.page.on')?.id, log: window.__routeTestLog })), null, 2));
 throw error;
 });
 await page.locator('#li-email').fill(await page.evaluate(() => window.__guidcyTestAuthUser.email));
 await page.locator('#li-pass').fill('test-password');
 }
 for (const target of ['/', '/find-experts?q=career', '/marketplace?category=Career', '/webinars?category=Career', '/find-jobs?query=design']) {
 await page.goto(origin + target);
 await page.waitForFunction(() => window.__guidcyAuthReadyFired && window.doLogin);
 await enterLogin();
 await page.locator('#page-login .primary-btn').click().catch(async error => {
 console.log(await page.evaluate(() => ({ path: location.pathname + location.search, active: document.querySelector('.page.on')?.id, user: window.currentUser?.id, role: window.currentProfile?.role, auth: window.__authTest, intent: window.__GUIDCY_REQUESTED_URL_V6__ })));
 throw error;
 });
 await page.waitForFunction(target => {
 const expected = new URL(target, location.origin);
 const aliases = { '/find-experts': '/browse', '/webinars': '/webinar', '/find-jobs': '/jobs' };
 return !!window.currentUser && (location.pathname === expected.pathname || location.pathname === aliases[expected.pathname]) && location.search === expected.search;
 }, target).catch(async error => {
 console.log(await page.evaluate(() => ({ path: location.pathname + location.search, active: document.querySelector('.page.on')?.id, user: window.currentUser?.id, role: window.currentProfile?.role, auth: window.__authTest, returnTo: sessionStorage.getItem('guidcy_login_return_v6'), intent: window.__GUIDCY_REQUESTED_URL_V6__ })));
 throw error;
 });
 assert.equal(await page.evaluate(() => window.__authTest.signIns), 1);
 assert.equal(await page.evaluate(() => window.currentProfile.role), role);
 await page.evaluate(() => window.logOut());
 assert.equal(await page.evaluate(() => window.__authTest.session), null);
 assert.equal(await page.evaluate(() => window.currentUser), null);
 }
 // A new login must wait for the actual outstanding logout, even when it finishes slowly.
 await page.evaluate(() => window.go('/marketplace?category=Career'));
 await enterLogin();
 await page.locator('#page-login .primary-btn').click();
 await page.waitForFunction(() => !!window.currentUser && location.pathname === '/marketplace');
 await page.evaluate(() => { window.__authTest.holdLogout = true; window.__logoutRun = window.logOut(); });
 await page.waitForFunction(() => typeof window.__authTest.finishLogout === 'function');
 await page.evaluate(() => window.go('/find-experts?q=return'));
 await enterLogin();
 const attempts = await page.evaluate(() => window.__authTest.signIns);
 await page.locator('#page-login .primary-btn').click();
 assert.equal(await page.evaluate(() => window.__authTest.signIns), attempts, 'login must await logout completion');
 await page.evaluate(() => { window.__authTest.holdLogout = false; window.__authTest.finishLogout(); });
 await page.waitForFunction(() => !!window.currentUser && ['/find-experts','/browse'].includes(location.pathname) && location.search === '?q=return');
 assert.equal(await page.evaluate(() => window.__authTest.signIns), attempts + 1);
 assert.ok(await page.evaluate(() => !!window.__authTest.session));
 await page.evaluate(() => window.go('categories'));
 await page.waitForTimeout(3200);
 assert.equal(new URL(page.url()).pathname, '/categories', 'no delayed login redirect may overwrite a later navigation');
 await page.goBack();
 await page.waitForFunction(() => ['/find-experts','/browse'].includes(location.pathname) && location.search === '?q=return');
 await page.goForward();
 await page.waitForFunction(() => location.pathname === '/categories');
 await page.evaluate(() => window.logOut());
 await page.goto(origin + '/login');
 await page.waitForFunction(() => window.__guidcyAuthReadyFired && window.doLogin);
 await enterLogin();
 await page.locator('#li-pass').fill('wrong-password');
 assert.equal(await page.evaluate(() => window.doLogin()), false);
 assert.equal(await page.evaluate(() => window.__authTest.session), null);
 assert.equal(new URL(page.url()).pathname, '/login');
 await page.locator('#li-pass').fill('test-password');
 assert.equal(await page.evaluate(() => window.doLogin()), true);
 const defaultPath = role === 'admin' ? '/admin-dashboard' : role === 'consultant' ? '/consultant-dashboard' : '/dashboard';
 await page.waitForFunction(expected => location.pathname === expected, defaultPath);
 assert.equal(await page.evaluate(() => window.currentProfile.role), role);
 await page.evaluate(() => window.logOut());
 await page.goto(origin + '/login');
 await page.waitForFunction(() => window.__guidcyAuthReadyFired && window.doLogin);
 await enterLogin();
 await page.locator(role === 'admin' ? '#li-u' : '#li-a').click();
 assert.equal(await page.evaluate(() => window.doLogin()), false, 'wrong role must be rejected');
 assert.equal(await page.evaluate(() => window.__authTest.session), null);
 assert.equal(await page.evaluate(() => window.currentUser), null);
 assert.equal(new URL(page.url()).pathname, '/login');
 if (role !== 'admin') {
 for (const target of ['/', '/find-experts?q=career', '/marketplace?category=Career', '/webinars?category=Career', '/find-jobs?query=design', null]) {
 await page.goto(origin + (target || '/login'));
 await page.waitForFunction(() => window.__guidcyAuthReadyFired && window.doLogin);
 await enterLogin();
 await page.locator('#page-login .goog-btn').click();
 const expected = new URL(target || defaultPath, origin);
 await page.waitForFunction(({ pathname, search }) => {
 const aliases = { '/find-experts': '/browse', '/webinars': '/webinar', '/find-jobs': '/jobs' };
 return !!window.currentUser && (location.pathname === pathname || location.pathname === aliases[pathname]) && (pathname.endsWith('dashboard') || location.search === search);
 }, { pathname: expected.pathname, search: expected.search });
 assert.equal(await page.evaluate(() => window.currentProfile.role), role);
 assert.equal(await page.evaluate(() => sessionStorage.getItem('guidcy_oauth_login_pending')), null);
 const expectedPage = ({ '/': 'home', '/find-experts': 'browse', '/marketplace': 'marketplace', '/webinars': 'webinar', '/find-jobs': 'jobs', '/dashboard': 'user-dash', '/consultant-dashboard': 'cons-dash' })[expected.pathname];
 await page.locator('#page-' + expectedPage + '.on').waitFor({ state: 'visible' });
 assert.equal(await page.locator('#guidcy-already-logged-in-modal:visible').count(), 0);
 if (target === '/') await page.screenshot({ path: '/private/tmp/guidcy-login-return-' + role + '-' + width + '.png' });
 const returnedPath = new URL(page.url()).pathname;
 await page.evaluate(() => { window.go('about'); window.__authTest.emit('SIGNED_IN'); window.__authTest.emit('TOKEN_REFRESHED'); });
 await page.waitForTimeout(1000);
 assert.equal(new URL(page.url()).pathname, '/about', 'passive auth events must not replay the login destination');
 await page.goBack();
 await page.waitForFunction(path => location.pathname === path, returnedPath);
 await page.goForward();
 await page.waitForFunction(() => location.pathname === '/about');
 await page.evaluate(() => window.logOut());
 }
 console.log(role + ' at ' + width + ': Google callback returns, default, passive events and Back/Forward passed');
 }
 assert.deepEqual(browserErrors, [], 'authentication/navigation must not cause browser errors');
 console.log(role + ' at ' + width + ': return routes, logout, first re-login, Back/Forward, defaults, invalid password and wrong-role rejection passed');
 await context.close();
 }
 } finally {
 if (browser) await browser.close();
 await new Promise(resolve => server.close(resolve));
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
