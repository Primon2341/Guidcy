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

const listed=[
 {id:'future',title:'Listed future webinar',category:'Career',description:'Future session',date:'2026-09-21',time:'11:00',duration:'2 hours',seats:100,speaker:'Test Expert'},
 {id:'live',title:'Currently live webinar',category:'Career',description:'Live session',date:'2026-09-20',time:'19:00',duration:'60 minutes',seats:100,speaker:'Test Expert'},
 {id:'finished',title:'Finished webinar must never flash',category:'Career',date:'2026-09-20',time:'18:00',duration:'60 minutes',seats:100,speaker:'Test Expert'}
];
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const [width,timezoneId] of [[390,'America/Los_Angeles'],[1280,'Asia/Kolkata']]){
   const ctx=await browser.newContext({viewport:{width,height:844},timezoneId});
   await ctx.addInitScript(rows=>{
    localStorage.setItem('guidcy_webinars',JSON.stringify(rows));
    if(!sessionStorage.getItem('__seededOldWebinars')){
     sessionStorage.setItem('__seededOldWebinars','1');
     sessionStorage.setItem('guidcy:refresh:v1',JSON.stringify({'/webinars':{at:Date.now(),uid:'',page:'webinar',regions:{'wbn-cards':{html:'<div class="wbn-card" data-wbn-id="finished">Old finished webinar</div>',height:100,at:Date.now()}}}}));
    }
    window.__seenFinished=false;
    new MutationObserver(records=>{
     for(const record of records)for(const node of record.addedNodes){
      if(node.nodeType===1&&(node.matches?.('[data-wbn-id="finished"]')||node.querySelector?.('[data-wbn-id="finished"]')))window.__seenFinished=true;
     }
    }).observe(document,{childList:true,subtree:true});
   },listed);
   await ctx.addInitScript(anon=>window.__publicAnon=anon,width===390);
   let appGate=null,releaseApp,listGate=null,releaseList,rows=listed;
   await ctx.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/assets/js/app.js')&&appGate){await appGate;return route.continue()}
    if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fakeSupabase+`(function(){var create=window.supabase.createClient;window.supabase.createClient=function(){var c=create();if(window.__publicAnon){c.auth.getSession=async()=>({data:{session:null}});c.auth.getUser=async()=>({data:{user:null}})}return c}})();`});
    if(url.includes('/rest/v1/webinars?')){if(listGate)await listGate;return route.fulfill({contentType:'application/json',body:JSON.stringify(rows)})}
    if(url.includes('/rest/v1/webinar_registrations?'))return route.fulfill({contentType:'application/json',body:'[]'});
    if(!url.startsWith(origin)||url.includes('/api/'))return route.abort();return route.continue();
   });
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date('2026-09-20T14:00:00Z'));
   await page.goto(origin+'/webinars');
   await page.waitForFunction(()=>document.querySelector('#wbn-stat-count').textContent==='2');
   assert.equal(await page.evaluate(()=>window.__seenFinished),false,'old catalogue/snapshot cannot flash finished cards');
   await page.waitForFunction(()=>!!sessionStorage.getItem('guidcy:public-webinars:v1'));
   for(let refresh=0;refresh<3;refresh++){
    // Keep the snapshot recent while a live session crosses its actual end time.
    if(refresh===1){
     await page.clock.setFixedTime(new Date('2026-09-20T14:25:00Z'));
     await page.evaluate(()=>window.wbnLoad());
     await page.clock.setFixedTime(new Date('2026-09-20T14:31:00Z'));
    }
    appGate=new Promise(r=>releaseApp=r);listGate=new Promise(r=>releaseList=r);
    await page.reload({waitUntil:'commit'});
    const count=refresh===0?'2':'1';
    await page.waitForFunction(count=>document.querySelector('#wbn-stat-count')?.textContent===count,count);
    assert.equal(await page.evaluate(()=>typeof window.wbnLoad),'undefined','count and filtered list render before app.js or its API calls');
    const ids=await page.locator('#wbn-cards .wbn-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.wbnId));
    assert.deepEqual(ids,refresh===0?['future','live']:['future']);
    assert.match(await page.locator('[data-wbn-id="future"] .wbn-card-meta').textContent(),/21 Sept? 2026/,'scheduled date also stays correct outside India');
    assert.equal(await page.evaluate(()=>window.__seenFinished),false);
    await page.screenshot({path:'/private/tmp/guidcy-webinars-immediate-'+width+'-'+refresh+'.png',fullPage:true});
    releaseApp();appGate=null;
    await page.waitForFunction(()=>typeof window.wbnLoad==='function'&&window.__guidcyAuthReadyFired);
    assert.equal(await page.locator('#wbn-stat-count').textContent(),count,'restoring auth while the API is pending preserves the count');
    assert.deepEqual(await page.locator('#wbn-cards .wbn-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.wbnId)),ids,'public preview survives auth resolution');
    releaseList();listGate=null;
    await page.evaluate(()=>window.wbnLoad());
    assert.equal(await page.locator('#wbn-stat-count').textContent(),count);
    assert.equal(await page.evaluate(()=>window.__seenFinished),false);
    console.log(width+' '+timezoneId+' refresh '+refresh+': current list/count visible before application download; no finished-card flash');
   }
   rows=[];await page.evaluate(()=>{window.guidcyInvalidateReadCache('webinars');return window.wbnLoad()});
   assert.equal(await page.locator('#wbn-stat-count').textContent(),'0');
   appGate=new Promise(r=>releaseApp=r);await page.reload({waitUntil:'commit'});
   await page.waitForFunction(()=>document.querySelector('#wbn-stat-count')?.textContent==='0');
   assert.equal(await page.evaluate(()=>typeof window.wbnLoad),'undefined');
   assert.equal(await page.locator('#wbn-cards .wbn-card').count(),0,'removed sessions cannot return from an older snapshot');
   releaseApp();appGate=null;await page.waitForFunction(()=>typeof window.wbnLoad==='function');
   assert.deepEqual(errors,[]);await ctx.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
