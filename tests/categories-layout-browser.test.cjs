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
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
    await context.route('**/*',r=>r.request().url().startsWith(origin)&&!r.request().url().includes('/api/')?r.continue():r.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    async function verify(label){
      await page.waitForSelector('#cats-full-grid .guidcy-final-cat-card');
      const result=await page.locator('#cats-full-grid').evaluate(grid=>{
        const cards=[...grid.children],names=cards.map(c=>c.querySelector('.guidcy-final-cat-title')?.textContent.trim()).filter(Boolean);
        return {count:cards.length,names,unexpected:cards.filter(c=>!c.classList.contains('guidcy-final-cat-card')).map(c=>c.outerHTML),missingStructure:cards.filter(c=>!c.querySelector('.guidcy-final-cat-desc')||!c.querySelector('.guidcy-final-cat-foot')).length,overflow:document.documentElement.scrollWidth>innerWidth+1};
      });
      assert.deepEqual(result.unexpected,[],label+': all category entries use the same card renderer');
      assert.equal(result.missingStructure,0,label+': every card has a description and action');
      assert.equal(new Set(result.names.map(n=>n.toLowerCase())).size,result.count,label+': no duplicate categories');
      assert.ok(result.count>=30,label+': full category list retained');
      for(const name of ['E-Commerce','Sustainability & ESG','Taxation','Design','Content Creation'])assert.equal(result.names.filter(n=>n===name).length,1,label+': '+name+' appears once');
      assert.equal(result.overflow,false,label+': no horizontal overflow');
    }
    await page.goto(origin+'/categories');await page.waitForFunction(()=>window.__guidcyAuthReadyFired);
    await page.waitForTimeout(2200);await verify('direct load after legacy startup timers');
    for(let cycle=0;cycle<3;cycle++){
      await page.locator('#main-nav .logo-wrap').click();await page.waitForSelector('#page-home.on');
      await page.locator('.home-cats-grid .home-cat-card').filter({hasText:'View All'}).click();
      await verify('View All return '+cycle);await page.waitForTimeout(700);await verify('settled return '+cycle);
    }
    await page.reload();await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await page.waitForTimeout(2200);await verify('refresh');
    const ecommerce=page.locator('.guidcy-final-cat-card').filter({has:page.locator('.guidcy-final-cat-title',{hasText:'E-Commerce'})});
    await ecommerce.click();await page.waitForSelector('#page-browse.on');
    await page.waitForFunction(()=>window.browseFilters.categories.includes('E-Commerce'));
    assert.deepEqual(errors,[]);
    console.log(width+': uniform cards, no duplicate/legacy rows, direct load, repeated View All, refresh and E-Commerce filter passed');
    await context.close();
  }
  await browser.close();browser=null;await new Promise(resolve=>server.close(resolve));
})().catch(async error=>{console.error(error);if(browser)await browser.close();server.close();process.exitCode=1});
