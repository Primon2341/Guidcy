const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, 'browser-flow.test.cjs'), 'utf8');
const start = source.indexOf('const fakeSupabase =');
const sdk = vm.runInNewContext(source.slice(start, source.indexOf('\n(async', start)) + '\nfakeSupabase');
const root = path.resolve(__dirname, '../public');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  let file = path.join(root, pathname);
  if (pathname === '/assets/vendor/supabase.js') { res.writeHead(200, {'content-type':'text/javascript'}); res.end(sdk + (process.argv.includes('--serve') ? ';window.fetch=async function(){return new Response("[]",{headers:{"Content-Type":"application/json"}})};' : '')); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(Number(process.env.PORT || 0), '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  if (process.argv.includes('--serve')) { console.log(origin); return; }
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const diagnose = process.argv.includes('--diagnose');
  for (const width of diagnose ? [1280] : [1280, 390]) {
    const context = await browser.newContext({viewport:{width,height:900}, isMobile:width < 600, hasTouch:width < 600});
    const page = await context.newPage();
    const errors = [];
    let documents = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (req.isNavigationRequest() && req.frame() === page.mainFrame()) documents++; });
    await context.route('**/*', route => route.request().url().startsWith(origin) && !route.request().url().includes('/api/') ? route.continue() : route.abort());
    async function measure(label) {
      const data = await page.evaluate(() => {
        const grid = document.querySelector('#page-home .home-cats-grid');
        const cards = [...grid.querySelectorAll('.home-cat-card')];
        const visible = cards.filter(card => card.getClientRects().length && getComputedStyle(card).display !== 'none');
        return {total:cards.length, visible:visible.length, labels:visible.map(c => c.querySelector('.home-cat-name').textContent), rows:new Set(visible.map(c => Math.round(c.getBoundingClientRect().top))).size, columns:getComputedStyle(grid).gridTemplateColumns, hidden:cards.filter(c => c.style.display === 'none').length};
      });
      if (diagnose) { console.log(label, data); return; }
      assert.equal(data.total, 12, label + ': exactly twelve cards');
      assert.equal(data.visible, 12, label + ': all cards visible');
      assert.equal(data.hidden, 0, label + ': no stale inline hiding');
      assert.equal(new Set(data.labels).size, 12, label + ': no duplicate cards');
      assert.equal(data.labels.at(-1), 'View All');
      if (width >= 901) assert.equal(data.rows, 2, label + ': two desktop rows');
    }
    // Reproduce the hidden-grid case: complete startup on a different route.
    await page.goto(origin + '/marketplace');
    await page.waitForFunction(() => window.__guidcyAuthReadyFired && typeof window.go === 'function');
    await page.waitForTimeout(2200);
    if (diagnose) console.log('hidden grid', await page.locator('.home-cats-grid').evaluate(el => ({columns:getComputedStyle(el).gridTemplateColumns, cards:el.children.length, hidden:[...el.children].filter(c => c.style.display === 'none').length})));
    const documentCount = documents;
    await page.locator('#main-nav .logo-wrap').click();
    await page.waitForSelector('#page-home.on');
    await measure('cold deep link → home');
    await page.waitForTimeout(2200);
    await measure('home after startup timers');
    if (!diagnose) assert.equal(documents, documentCount, 'Home navigation remains in the same document');
    await page.reload();
    await page.waitForFunction(() => window.__guidcyAuthReadyFired);
    await page.waitForTimeout(2200);
    await measure('refresh');
    if (!diagnose) {
      for (const target of ['browse', 'categories', 'marketplace']) {
        const label = {browse:'Find the Expert',categories:'Categories',marketplace:'Marketplace'}[target];
        if(width < 600){await page.locator('#mobile-burger').click();await page.locator('#gmob-drawer .gmob-item').filter({hasText:label}).first().click()}
        else await page.locator('#nav-links .nav-link').filter({hasText:label}).first().click();
        await page.waitForFunction(() => !document.querySelector('#page-home').classList.contains('on'));
        // Resizing while Home is hidden used to poison the cached card limit too.
        await page.setViewportSize({width:width + 10,height:900});
        await page.waitForTimeout(200);
        await page.setViewportSize({width,height:900});
        await page.goBack();
        await page.waitForSelector('#page-home.on').catch(async error => { console.log('Back diagnostic', target, await page.evaluate(() => ({path:location.pathname, active:[...document.querySelectorAll('.page.on')].map(p=>p.id), history:history.length}))); throw error; });
        await measure('Back from ' + target);
        await page.goForward();
        await page.waitForFunction(() => !document.querySelector('#page-home').classList.contains('on'));
        await page.locator('#main-nav .logo-wrap').click();
        await page.waitForSelector('#page-home.on');
        await measure('internal return from ' + target);
      }
      const beforeReload = documents;
      await page.goto(origin + '/');
      await page.waitForFunction(() => window.__guidcyAuthReadyFired);
      await measure('direct visit');
      assert.equal(documents, beforeReload + 1, 'only explicit document navigation reloads');
      await page.locator('.home-cats-grid .home-cat-card').filter({hasText:'Technology'}).click();
      await page.waitForSelector('#page-browse.on');
      await page.waitForFunction(() => window.browseFilters.categories.includes('Technology'));
      await page.locator('#main-nav .logo-wrap').click();
      await page.waitForSelector('#page-home.on');
      await page.locator('.home-cats-grid .home-cat-card').filter({hasText:'View All'}).click();
      await page.waitForSelector('#page-categories.on');
      assert.deepEqual(errors, []);
      console.log(width + ': twelve cards, desktop two rows, deep link, refresh, Back/Forward, internal navigation, resize and category links passed');
    }
    await context.close();
  }
  await browser.close(); browser = null;
  await new Promise(resolve => server.close(resolve));
})().catch(async error => {
  console.error(error);
  if (browser) await browser.close();
  server.close(); process.exitCode = 1;
});
