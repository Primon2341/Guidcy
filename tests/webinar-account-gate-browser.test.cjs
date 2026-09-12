/* A visitor must be signed in to register for a webinar. Signed-out: the
   sign-up prompt appears instead of the form, the webinar is remembered, and
   after sign-in / sign-up the same webinar's registration reopens (never the
   dashboard). A confirmed seat is shown as "already registered", never
   registered twice. Runs at phone, tablet and desktop widths. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, 'browser-flow.test.cjs'), 'utf8');
const start = source.indexOf('const fakeSupabase =');
const fixture = vm.runInNewContext(source.slice(start, source.indexOf('\n(async', start)) + '\nfakeSupabase');
const gateFixture = fixture + `
(function(){
 var original=window.supabase.createClient;
 var state=window.__authTest={session:JSON.parse(sessionStorage.getItem('__gateTestSession')||'null')};
 var listeners=[];
 var db=window.__testDb=JSON.parse(sessionStorage.getItem('__gateTestDb')||'null')||{webinars:window.__testWebinars,webinar_registrations:window.__testSeedRegistrations||[],webinar_meetings:window.__testMeetings||[]};
 function persist(){sessionStorage.setItem('__gateTestDb',JSON.stringify(db))}
 function tableQuery(table){
 var filters=[],mutation=null,value=null,q={};
 q.select=function(){return q};q.order=function(){return q};q.limit=function(){return q};
 q.eq=function(f,v){filters.push(function(r){return String(r[f])===String(v)});return q};
 q.in=function(f,vs){filters.push(function(r){return (vs||[]).map(String).includes(String(r[f]))});return q};
 q.ilike=function(f,v){var w=String(v||'').replace(/%/g,'').toLowerCase();filters.push(function(r){return String(r[f]||'').toLowerCase()===w});return q};
 q.insert=function(v){mutation='insert';value=v;return q};
 q.update=function(v){mutation='update';value=v;return q};
 function run(){
 var out=db[table].filter(function(r){return filters.every(function(fn){return fn(r)})});
 if(mutation==='update'){out.forEach(function(r){Object.assign(r,value)});persist()}
 if(mutation==='insert'){db[table].push(value);out=[value];persist()}
 return out;
 }
 q.single=q.maybeSingle=function(){return Promise.resolve({data:run()[0]||null,error:null})};
 q.then=function(res,rej){var d=run();return Promise.resolve({data:d,error:null}).then(res,rej)};
 return q;
 }
 window.supabase.createClient=function(){
 var c=original.apply(this,arguments),from=c.from;
 c.from=function(table){
 if(table==='webinars'||table==='webinar_registrations'||table==='webinar_meetings')return tableQuery(table);
 var q=from(table);if(table==='profiles')q.or=function(){return q.eq('id',window.__guidcyTestProfile.id)};return q;
 };
 c.auth.getSession=function(){return Promise.resolve({data:{session:state.session},error:null})};
 c.auth.getUser=function(){return Promise.resolve({data:{user:state.session&&state.session.user},error:null})};
 c.auth.onAuthStateChange=function(fn){listeners.push(fn);queueMicrotask(function(){fn('INITIAL_SESSION',state.session)});return {data:{subscription:{unsubscribe:function(){}}}}};
 function signIn(){state.session={user:window.__guidcyTestAuthUser,access_token:'t'};sessionStorage.setItem('__gateTestSession',JSON.stringify(state.session));listeners.forEach(function(fn){fn('SIGNED_IN',state.session)});return {data:{user:state.session.user,session:state.session},error:null}}
 c.auth.signInWithPassword=async function(){return signIn()};
 c.auth.signUp=async function(){return signIn()};
 c.auth.signOut=async function(){state.session=null;sessionStorage.removeItem('__gateTestSession');return {error:null}};
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

const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const local = at => { const d = new Date(at); const p = n => String(n).padStart(2, '0'); return { date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), time: p(d.getHours()) + ':' + p(d.getMinutes()) }; };
const soon = local(Date.now() + 20 * 60000), yesterday = local(Date.now() - 86400000);
const webinars = [
 { id: 'free-1', title: 'Free seat check', category: 'Career', date, time: '18:00', duration: '60 minutes', seats: 100, speaker: 'Test Expert', description: 'Free webinar.', is_paid: false, price_type: 'free', price_amount: 0 },
 { id: 'paid-1', title: 'Paid seat check', category: 'Career', date, time: '19:00', duration: '60 minutes', seats: 100, speaker: 'Test Expert', description: 'Paid webinar.', is_paid: true, price_type: 'paid', price_amount: 499 },
 { id: 'live-1', title: 'Starting soon session', category: 'Startup', date: soon.date, time: soon.time, duration: '45 minutes', seats: 100, speaker: 'Live Host', description: 'Starts in twenty minutes.', is_paid: true, price_type: 'paid', price_amount: 99 },
 { id: 'done-1', title: 'Finished yesterday', category: 'Finance', date: yesterday.date, time: yesterday.time, duration: '60 minutes', seats: 100, speaker: 'Past Host', description: 'Already over.', is_paid: false, price_type: 'free', price_amount: 0 }
];
// registrations this account already holds: a paid one starting soon (meeting link ready), a finished one, and one whose webinar the host deleted
const seedFor = email => [
 { id: 'REG-live', webinar_id: 'live-1', webinar_title: 'Starting soon session', email, name: 'Seed', registered_at: new Date(Date.now() - 3 * 86400000).toISOString(), registration_status: 'confirmed', payment_status: 'paid', payment_verified: true, amount_paid: 99, razorpay_payment_id: 'pay_seed1' },
 { id: 'REG-done', webinar_id: 'done-1', webinar_title: 'Finished yesterday', email, name: 'Seed', registered_at: new Date(Date.now() - 5 * 86400000).toISOString(), registration_status: 'confirmed', payment_status: 'free', payment_verified: true, amount_paid: 0 },
 { id: 'REG-gone', webinar_id: 'gone-1', webinar_title: 'Host removed this one', email, name: 'Seed', registered_at: new Date(Date.now() - 6 * 86400000).toISOString(), registration_status: 'confirmed', payment_status: 'paid', payment_verified: true, amount_paid: 149 }
];
const meetings = [{ webinar_id: 'live-1', meet_link: 'https://meet.google.com/abc-defg-hij' }];

(async () => {
 let browser;
 try {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
 const runs = [[390, 'signin', 'user'], [390, 'signup', 'user'], [820, 'signin', 'user'], [1280, 'signup', 'user'], [1280, 'signin', 'consultant']];
 for (const [width, entry, role] of runs) {
 const context = await browser.newContext({ viewport: { width, height: 850 } });
 await context.addInitScript(([rows, role, seedForSource, meetings]) => {
 const seedFor = eval('(' + seedForSource + ')');
 window.__testWebinars = rows;
 const id = role === 'consultant' ? 'expert-profile' : 'test-user', email = role === 'consultant' ? 'expert@example.com' : 'user@example.com';
 window.__guidcyTestAuthUser = { id, email, user_metadata: { full_name: 'Test ' + role, role } };
 window.__guidcyTestProfile = { id, email, full_name: 'Test ' + role, role, phone: '+91 98765 43210' };
 window.__testSeedRegistrations = seedFor(email);
 window.__testMeetings = meetings;
 }, [webinars, role, seedFor.toString(), meetings]);
 await context.route('**/*', route => {
 const url = route.request().url();
 if (url.includes('/assets/vendor/supabase.js')) return route.fulfill({ contentType: 'text/javascript', body: gateFixture });
 if (url.includes('/api/verify-payment')) {
 const body = route.request().postDataJSON();
 return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, verified: true, registration: { id: body.registrationId, registration_status: 'confirmed', payment_status: 'free', payment_verified: true } }) });
 }
 if (url.includes('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
 if (url.includes('/rest/v1/webinars?')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(webinars) });
 if (url.includes('/rest/v1/webinar_registrations?')) return route.fulfill({ contentType: 'application/json', body: '[]' });
 if (!url.startsWith(origin)) return route.abort();
 return route.continue();
 });
 const page = await context.newPage();
 page.on('pageerror', error => console.log('browser error:', error.stack));
 page.setDefaultTimeout(10000);
 const activePage = () => page.evaluate(() => document.querySelector('.page.on')?.id);
 const modalOpen = () => page.evaluate(() => document.getElementById('wbn-reg-modal').classList.contains('on'));

 await page.goto(origin + '/webinars');
 await page.waitForFunction(() => window.__guidcyAuthReadyFired && window.wbnLoad);
 await page.evaluate(() => window.wbnLoad());
 await page.locator('[data-wbn-id="free-1"] [data-wbn-register]').click();

 // signed out: prompt instead of the form, intent remembered
 const gate = page.locator('#guidcy-webinar-account-gate');
 await gate.waitFor();
 assert.match(await gate.textContent(), /Create your free Guidcy account to reserve your seat/);
 assert.match(await gate.textContent(), /Free seat check/);
 assert.equal(await modalOpen(), false);
 assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('guidcy_webinar_intent_v1')).webinarId), 'free-1');
 assert.ok((await gate.boundingBox()).width <= width, 'prompt fits the viewport');

 if (entry === 'signin') {
 await gate.getByRole('button', { name: /Already have an account\? Sign In/ }).click();
 await page.waitForFunction(() => document.querySelector('#page-login').classList.contains('on'));
 await page.locator(role === 'consultant' ? '#li-c' : '#li-u').click();
 await page.locator('#li-email').fill(await page.evaluate(() => window.__guidcyTestAuthUser.email));
 await page.locator('#li-pass').fill('test-password');
 await page.locator('#page-login .primary-btn').click();
 } else {
 await gate.getByRole('button', { name: 'Create Account' }).click();
 await page.waitForFunction(() => document.querySelector('#page-signup').classList.contains('on') && document.querySelector('#su-u').classList.contains('on'));
 for (const [id, value] of [['su-fn', 'Test'], ['su-ln', 'User'], ['su-em', 'user@example.com'], ['su-edu', 'MBA'], ['su-college', 'Test University'], ['su-work', 'Analyst'], ['su-pw', 'password123']]) {
 await page.evaluate(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; }, [id, value]);
 }
 await page.evaluate(() => window.doSignup('user'));
 }

 // back on the same webinar with its registration open, prefilled from the account
 await page.waitForFunction(() => document.querySelector('#page-webinar').classList.contains('on') && document.getElementById('wbn-reg-modal').classList.contains('on'), null, { timeout: 15000 });
 assert.equal(await page.evaluate(() => location.pathname), '/webinars');
 assert.equal(await page.locator('#wbn-reg-email').inputValue(), await page.evaluate(() => window.__guidcyTestAuthUser.email));
 assert.equal(await page.locator('#wbn-reg-email').evaluate(el => el.readOnly), true);
 assert.equal((await page.locator('#wbn-reg-name').inputValue()).toLowerCase(), 'test ' + role);
 assert.equal(await page.evaluate(() => sessionStorage.getItem('guidcy_webinar_intent_v1')), null);

 if (entry === 'signin') {
 // profile had a phone, so the form was complete and the free registration finished by itself
 await page.waitForFunction(() => document.getElementById('wbn-reg-success').classList.contains('on'));
 } else {
 // a brand-new account has no phone yet: one field, one click
 await page.waitForTimeout(600);
 assert.equal(await page.evaluate(() => document.getElementById('wbn-reg-success').classList.contains('on')), false);
 await page.locator('#wbn-reg-phone').fill('+91 98765 43210');
 await page.locator('#wbn-reg-form .btn-blue').click();
 await page.waitForFunction(() => document.getElementById('wbn-reg-success').classList.contains('on'));
 }
 assert.match(await page.locator('#wbn-reg-success .wbn-success-title').textContent(), /You’re registered!/);
 assert.equal(await page.evaluate(() => window.__testDb.webinar_registrations.filter(r => r.webinar_id === 'free-1').length), 1);
 assert.equal(await page.evaluate(() => window.__testDb.webinar_registrations.find(r => r.webinar_id === 'free-1').user_id), await page.evaluate(() => window.__guidcyTestAuthUser.id), 'registration is linked to the account');

 // "View in My Webinars" lands on the dashboard tab with that webinar's details open
 const dashPage = role === 'consultant' ? '#page-cons-dash' : '#page-user-dash';
 const dashMain = role === 'consultant' ? '#cdash-main' : '#udash-main';
 await page.locator('#gmw-success-view').click();
 await page.waitForFunction(([dashPage, dashMain]) => document.querySelector(dashPage).classList.contains('on') && /My Webinars/.test(document.querySelector(dashMain + ' .dash-title')?.textContent || '') && document.querySelector('#gmw-detail'), [dashPage, dashMain]);
 assert.match(await page.evaluate(() => location.pathname + location.search), /tab=my-webinars$/);
 assert.match(await page.locator('#gmw-detail').textContent(), /Free seat check[\s\S]*Meeting details will be available here once they are published by the host/);
 assert.equal(await page.locator('#gmw-detail a[href]').count(), 0, 'no join link without a real meeting link');
 await page.locator('#gmw-detail .modal-close').click();
 // default tab Upcoming, nearest first; counts computed from the account's rows
 assert.match(await page.locator(dashMain + ' .gmw-summary').textContent(), /4\s*Registered\s*2\s*Upcoming\s*1\s*Completed\s*1\s*Cancelled/);
 assert.equal(await page.locator('.gmw-tab.on').textContent(), 'Upcoming');
 assert.deepEqual(await page.locator('.gmw-card .gmw-title').allTextContents(), ['Starting soon session', 'Free seat check']);
 const live = page.locator('.gmw-card[data-gmw-id="live-1"]');
 assert.match(await live.textContent(), /Live soon[\s\S]*Google Meet \/ Online[\s\S]*₹99 • Paid/);
 assert.equal(await live.locator('a.gmw-join-hot').getAttribute('href'), 'https://meet.google.com/abc-defg-hij', 'join link is the stored meeting link and is prominent near start');
 assert.equal(await page.locator('.gmw-card[data-gmw-id="free-1"] a[href]').count(), 0);
 assert.match(await page.locator('.gmw-card[data-gmw-id="free-1"]').textContent(), /Upcoming[\s\S]*Test Expert[\s\S]*Free/);
 assert.equal(await page.locator(dashPage + ' .side-btn.on').textContent().then(t => t.trim()), 'My Webinars');
 await page.locator('.gmw-tab', { hasText: 'Completed' }).click();
 assert.deepEqual(await page.locator('.gmw-card .gmw-title').allTextContents(), ['Finished yesterday']);
 assert.equal(await page.locator('.gmw-card a[href]').count(), 0, 'no join for a finished webinar');
 await page.locator('.gmw-card .btn', { hasText: 'View Details' }).click();
 assert.match(await page.locator('#gmw-detail').textContent(), /This webinar has ended/);
 await page.locator('#gmw-detail .modal-close').click();
 await page.locator('.gmw-tab', { hasText: 'Cancelled' }).click();
 assert.match(await page.locator('.gmw-card').textContent(), /Host removed this one[\s\S]*Webinar Cancelled · Refund Pending/);
 assert.equal(await page.locator('.gmw-card a[href]').count(), 0);
 await page.locator('.gmw-tab', { hasText: 'All' }).click();
 assert.deepEqual(await page.locator('.gmw-card .gmw-title').allTextContents(), ['Starting soon session', 'Free seat check', 'Finished yesterday', 'Host removed this one']);

 // consultants: the published-webinars section is separate and untouched
 if (role === 'consultant') assert.equal(await page.locator('#cons-webinars-btn').count(), 1);

 // the dashboard home tab carries the compact upcoming block
 await page.evaluate(sel => document.querySelector(sel).click(), dashPage + ' .side-btn[data-dash-section="' + (role === 'consultant' ? 'overview' : 'upcoming') + '"]');
 await page.waitForFunction(() => document.querySelector('#gmw-home .gmw-title'), null, { timeout: 15000 });
 assert.match(await page.locator('#gmw-home').textContent(), /Upcoming Webinars[\s\S]*Starting soon session[\s\S]*Join now[\s\S]*Free seat check[\s\S]*View All Webinars/);
 assert.equal(await page.locator('#gmw-home .gmw-title').count(), 2);
 await page.screenshot({ path: '/private/tmp/guidcy-my-webinars-home-' + role + '-' + width + '.png' });
 await page.locator('#gmw-home .gmw-home-link').click();
 await page.waitForFunction(dashMain => /My Webinars/.test(document.querySelector(dashMain + ' .dash-title')?.textContent || '') && document.querySelector('.gmw-card'), dashMain);
 await page.screenshot({ path: '/private/tmp/guidcy-my-webinars-' + role + '-' + width + '.png', fullPage: true });

 await page.evaluate(() => window.go('webinar'));
 await page.waitForFunction(() => document.querySelector('#page-webinar').classList.contains('on'));
 await page.evaluate(() => window.wbnLoad());

 // second click: already registered, no second row
 await page.locator('[data-wbn-id="free-1"] [data-wbn-register]').click();
 await page.waitForFunction(() => document.getElementById('wbn-reg-success').classList.contains('on') && /already registered/.test(document.querySelector('#wbn-reg-success .wbn-success-title').textContent));
 assert.equal(await page.locator('#wbn-reg-success button').textContent(), 'View webinar details');
 assert.equal(await page.evaluate(() => document.getElementById('wbn-reg-form').style.display), 'none');
 assert.equal(await page.evaluate(() => window.__testDb.webinar_registrations.filter(r => r.webinar_id === 'free-1').length), 1);
 await page.evaluate(() => window.wbnCloseModal());

 // signed in: a paid webinar opens the form straight away (payment comes after)
 await page.locator('[data-wbn-id="paid-1"] [data-wbn-register]').click();
 await page.waitForFunction(() => document.getElementById('wbn-reg-modal').classList.contains('on'));
 assert.equal(await page.locator('#guidcy-webinar-account-gate').count(), 0);
 assert.equal(await page.evaluate(() => document.getElementById('wbn-reg-form').style.display !== 'none'), true);
 await page.screenshot({ path: '/private/tmp/guidcy-webinar-gate-' + entry + '-' + width + '.png' });
 console.log('webinar account gate + My Webinars passed:', role, entry, width);
 await context.close();
 }
 } finally {
 if (browser) await browser.close();
 server.close();
 }
})().catch(error => { console.error(error); process.exit(1); });
