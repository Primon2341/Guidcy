const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

// Reuse the existing offline role/session fixture; no production data is accessed.
const fixtureSource = fs.readFileSync(path.join(__dirname, 'browser-flow.test.cjs'), 'utf8');
const fixtureStart = fixtureSource.indexOf('const fakeSupabase =');
const fixtureEnd = fixtureSource.indexOf('\n(async', fixtureStart);
const fakeSupabase = vm.runInNewContext(fixtureSource.slice(fixtureStart, fixtureEnd) + '\nfakeSupabase');
const root = path.resolve(__dirname, '..', 'public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
 let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
 if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
 res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
 fs.createReadStream(file).pipe(res);
});

(async () => {
 let browser;
 try {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
 for (const role of ['user', 'consultant', 'admin']) {
 const context = await browser.newContext({ viewport: { width: 320, height: 812 } });
 await context.addInitScript(role => {
 const id = role === 'consultant' ? 'expert-profile' : role === 'admin' ? 'test-admin' : 'test-user';
 const email = role === 'consultant' ? 'expert@example.com' : role === 'admin' ? 'admin@example.com' : 'user@example.com';
 window.__guidcyTestAuthUser = { id, email, user_metadata: { full_name: 'Test ' + role, role } };
 window.__guidcyTestProfile = { id, email, full_name: 'Test ' + role, role };
 }, role);
 await context.route('**/*', route => {
 const url = route.request().url();
 if (url.includes('/assets/vendor/supabase.js')) return route.fulfill({ contentType: 'text/javascript', body: fakeSupabase });
 if (!url.startsWith(origin)) return route.abort();
 return route.continue();
 });
 const page = await context.newPage();
 await page.goto(origin + '/about');
 const button = page.locator('#nav-right #guidcy-dashboard-btn');
 await button.waitFor();
 await page.waitForTimeout(1600);
 const owner = role === 'consultant' ? 'cons' : role;
 const dash = '#page-' + owner + '-dash';
 assert.equal(await button.getAttribute('data-dashboard-route'), owner + '-dash');
 for (const route of ['home', 'browse', 'marketplace']) {
 await page.goto(origin + (route === 'home' ? '/' : '/' + route));
 await button.waitFor();
 await page.waitForTimeout(1600);
 if (route === 'home' && role === 'user') await require('./home-motion-loading.cjs')(page);
 for (const width of [320, 375, 390, 430]) {
 await page.setViewportSize({ width, height: 812 });
 const before = page.url();
 await button.click();
 await page.locator(dash + ' .dash-side.on').waitFor({ state: 'visible' });
 const layers = await page.evaluate(() => ({
 sidebar: !!document.elementFromPoint(40, 200)?.closest('.dash-side.on'),
 backdrop: !!document.elementFromPoint(innerWidth - 10, 200)?.closest('.dash-overlay.on'),
 header: (() => {
 const button = document.querySelector('#nav-right #guidcy-dashboard-btn');
 const rect = button.getBoundingClientRect();
 return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button;
 })()
 }));
 assert.deepEqual(layers, { sidebar: true, backdrop: true, header: true }, role + ': menu must be above ' + route + ' at ' + width);
 if (route === 'home') await page.screenshot({ path: '/private/tmp/guidcy-home-menu-' + role + '-' + width + '.png' });
 await button.click();
 assert.equal(page.url(), before);
 }
 }
 await page.goto(origin + '/about');
 await button.waitFor();
 await page.waitForTimeout(1600);
 for (const width of [320, 375, 390, 430]) {
 await page.setViewportSize({ width, height: 812 });
 const before = page.url();
 const historyLength = await page.evaluate(() => history.length);
 await button.click();
 await page.locator(dash + ' .dash-side.on').waitFor({ state: 'visible' });
 assert.equal(page.url(), before);
 assert.equal(await page.locator('.dash-mobile-toggle:visible').count(), 0);
 assert.equal(await page.locator('.dash-side:visible').count(), 1);
 const spacing = await page.locator(dash + ' .dash-side').evaluate(side => {
 const avatar = side.querySelector('.dash-av').getBoundingClientRect();
 const close = side.querySelector('.dash-side-close').getBoundingClientRect();
 return { gap: avatar.top - side.getBoundingClientRect().top, overlaps: avatar.left < close.right && avatar.right > close.left && avatar.top < close.bottom && avatar.bottom > close.top };
 });
 assert.ok(spacing.gap >= 8 && spacing.gap <= 16, role + ': compact profile gap at ' + width);
 assert.equal(spacing.overlaps, false, 'close button must not cover profile photo');
 assert.equal(await page.locator('#page-about.on').count(), 1);
 await page.screenshot({ path: '/private/tmp/guidcy-menu-' + role + '-' + width + '.png' });
 await button.click();
 assert.equal(await page.locator('.dash-side.on').count(), 0);
 assert.equal(await page.evaluate(() => history.length), historyLength);
 assert.equal(page.url(), before);
 }
 await button.click();
 const links = await page.locator(dash + ' .side-btn').evaluateAll(buttons => buttons.map(b => ({ section: b.dataset.dashSection || b.dataset.adminSection, label: b.textContent.trim() })).filter(b => b.section));
 assert.ok(links.length >= 8, role + ' should expose its complete sidebar');
 const section = role === 'user' ? 'goals' : role === 'admin' ? 'users' : 'settings';
 await page.locator(dash + ' .side-btn[data-dash-section="' + section + '"], ' + dash + ' .side-btn[data-admin-section="' + section + '"]').click();
 await page.locator(dash + '.on').waitFor();
 assert.equal(new URL(page.url()).searchParams.get('tab'), section);
 assert.equal(await page.locator('.dash-side.on').count(), 0);
 await button.click();
 await button.click();
 assert.equal(new URL(page.url()).searchParams.get('tab'), section);
 await page.goBack();
 await page.locator('#page-about.on').waitFor();
 await page.goForward();
 await page.locator(dash + '.on').waitFor();
 assert.equal(new URL(page.url()).searchParams.get('tab'), section);
 await page.screenshot({ path: '/private/tmp/guidcy-dashboard-' + role + '.png' });
 if (role === 'user') {
 for (const width of [320, 375, 390, 430]) {
 await page.setViewportSize({ width, height: 812 });
 await page.screenshot({ path: '/private/tmp/guidcy-goals-' + width + '.png', fullPage: true });
 const overflow = await page.locator('.goal-tracker-wrap').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
 assert.ok(overflow.scroll <= overflow.client + 1, 'Goal Tracker must fit at ' + width);
 }
 }
 await button.click();
 await page.locator('#mobile-burger').click();
 assert.equal(await page.locator('.dash-side.on').count(), 0, 'public hamburger closes the dashboard drawer');
 await page.evaluate(() => window.closeMobDrawer());
 for (const link of links) {
 await page.evaluate(() => window.go('about'));
 await button.click();
 const item = page.locator(dash + ' .side-btn[data-dash-section="' + link.section + '"], ' + dash + ' .side-btn[data-admin-section="' + link.section + '"]').first();
 await item.click();
 await page.locator(dash + '.on').waitFor();
 const url = new URL(page.url());
 assert.equal(url.pathname === '/admin/webinar-registrations' ? 'webinar-registrations' : url.searchParams.get('tab'), link.section, role + ': ' + link.label);
 }
 await page.setViewportSize({ width: 1280, height: 900 });
 await page.locator(dash + ' .dash-side').waitFor({ state: 'visible', timeout: 5000 }).catch(async error => {
 console.log(await page.evaluate(() => ({ url: location.href, active: document.querySelector('.page.on')?.id, body: document.body.className })));
 throw error;
 });
 console.log(role + ': toggle, ' + links.length + ' role links, page selection, Back/Forward, 320-430px passed');
 await context.close();
 }
 } finally {
 if (browser) await browser.close();
 await new Promise(resolve => server.close(resolve));
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
