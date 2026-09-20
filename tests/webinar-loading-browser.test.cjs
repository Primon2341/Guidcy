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

const upcoming={id:'load-webinar',title:'Webinar loading verification',category:'Career',description:'A detailed session description that remains expanded while the independent photo and registration requests finish loading in the background.',date:'2099-09-23',time:'16:00',seats:1,speaker:'Test Expert',created_by:'expert-profile'};
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const width of [390,1280]){
   const ctx=await browser.newContext({viewport:{width,height:844}});
   await ctx.addInitScript(()=>{
    window.__photosReady=new Promise(r=>window.__releasePhotos=r);
    window.__photosStarted=false;
   });
   let releaseCounts,countsGate,rows=[upcoming],listRequests=0,failList=false;
   const sdk=fakeSupabase
    .replace('q.select=function(){return q}',"q.select=function(fields){q.__fields=fields;return q}")
    .replace('q.then=function(resolve,reject){var data=result();',"q.then=function(resolve,reject){if(table==='webinars'&&window.__failWebinarList)return Promise.resolve({data:null,error:{message:'offline'}}).then(resolve,reject);if(table==='profiles'&&q.__fields==='id,email,avatar_url'){window.__photosStarted=true;return window.__photosReady.then(function(){var data=result();return {data:data,error:null}}).then(resolve,reject)}var data=result();");
   await ctx.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:sdk});
    if(url.includes('/rest/v1/webinars?')){
     listRequests++;
     return route.fulfill({status:failList?503:200,contentType:'application/json',body:JSON.stringify(failList?{message:'offline'}:rows)});
    }
    if(url.includes('/rest/v1/webinar_registrations?')){
     await countsGate;
     return route.fulfill({contentType:'application/json',body:JSON.stringify([{webinar_id:upcoming.id,payment_status:'paid',payment_verified:true}])});
    }
    if(!url.startsWith(origin)||url.includes('/api/'))return route.abort();
    return route.continue();
   });
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(let refresh=0;refresh<3;refresh++){
    countsGate=new Promise(r=>releaseCounts=r);listRequests=0;
    if(refresh)await page.reload({waitUntil:'domcontentloaded'});else await page.goto(origin+'/webinars',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#wbn-stat-count').textContent==='1');
    await page.waitForFunction(()=>window.__photosStarted);
    const card=page.locator('#wbn-cards [data-wbn-id="load-webinar"]');
    assert.equal(await card.count(),1,'cards and count precede photos and registration results');
    assert.equal(await card.locator('.wbn-register-btn').isDisabled(),true,'unknown seat count is not treated as available');
    if(!refresh)await page.screenshot({path:'/private/tmp/guidcy-webinar-first-content-'+width+'.png',fullPage:true});
    await card.locator('.wbn-desc-more').click();
    await card.evaluate(el=>window.__originalWebinarCard=el);
    releaseCounts();
    await page.waitForFunction(()=>document.querySelector('#wbn-cards .wbn-register-btn').textContent==='Full');
    assert.equal(await card.locator('.wbn-register-btn').isDisabled(),true);
    await page.evaluate(()=>window.__releasePhotos());
    await card.locator('.wbn-speaker-av img').waitFor();
    assert.equal(await card.evaluate(el=>el===window.__originalWebinarCard),true,'enrichment preserves card DOM');
    assert.equal(await card.locator('.wbn-desc-open').count(),1,'expanded description survives enrichment');
    // Observe beyond the former startup retry window, not just the first paint.
    await page.waitForTimeout(3600);
    assert.ok(listRequests<=2,'startup requests coalesced, got '+listRequests);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    console.log(width+' refresh '+refresh+': count/cards before both gated requests; preserved nodes; '+listRequests+' list requests');
   }
   // Background errors retain the existing real list, and successful empty data clears it.
   failList=true;await page.evaluate(()=>window.__failWebinarList=true);
   await page.evaluate(()=>{window.guidcyInvalidateReadCache('webinars');return window.wbnLoad()});
   assert.equal(await page.locator('#wbn-stat-count').textContent(),'1');
   failList=false;rows=[];await page.evaluate(()=>window.__failWebinarList=false);
   const beforeEmpty=listRequests;await page.evaluate(()=>{window.guidcyInvalidateReadCache('webinars');return window.wbnLoad()});
   assert.equal(await page.locator('#wbn-stat-count').textContent(),'0');
   assert.equal(await page.locator('#wbn-cards .wbn-card').count(),0);
   assert.equal(listRequests-beforeEmpty,1,'valid empty list does not cause a fallback REST query');
   rows=[upcoming];await page.evaluate(()=>{window.guidcyInvalidateReadCache('webinars');return window.wbnLoad()});
   assert.equal(await page.locator('#wbn-stat-count').textContent(),'1','newly available webinar appears on revalidation');
   await page.evaluate(()=>window.guidcyNavigate('/about'));await page.waitForURL('**/about');
   await page.evaluate(()=>window.guidcyNavigate('/webinars'));await page.waitForURL('**/webinars');
   await page.waitForFunction(()=>document.querySelector('#wbn-cards .wbn-card'));
   assert.deepEqual(errors,[]);
   await ctx.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
