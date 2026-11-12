// Isolated renderer contract checks. No API, auth or production data is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../public');
const html='<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/css/site.css"><script defer src="/assets/js/ui-refresh.js"></script><main class="page on" style="padding:24px"><div id="browse-grid"><article>Existing expert results</article></div><div id="gnet-experts">Existing suggestions</div><div id="jobs-main-area">Existing jobs</div></main>';
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
 const file=path.join(root,url.pathname);
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript'});fs.createReadStream(file).pipe(res);
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.guidcyAttachPanelRefresh);
 const loader=page.locator('#guidcy-loading-status');
 const start=async()=>{await page.evaluate(()=>document.querySelector('#browse-grid').innerHTML='<p>Loading experts...</p>');await loader.waitFor();};
 const stopped=async()=>{await loader.waitFor({state:'hidden'});assert.equal(await page.locator('#browse-grid').getAttribute('aria-busy'),null);};

 await start();assert.equal(await page.locator('#browse-grid').innerText(),'Existing expert results','refresh preserves mounted results');
 const theme=await loader.evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderWidth,shadow:getComputedStyle(el).boxShadow,center:{x:(el.getBoundingClientRect().left+el.getBoundingClientRect().right)/2,y:(el.getBoundingClientRect().top+el.getBoundingClientRect().bottom)/2},viewport:{width:innerWidth,height:innerHeight},color:getComputedStyle(el).color,fill:getComputedStyle(el.querySelector('.guidcy-loading-fill')).backgroundImage}));
 assert.equal(theme.background,'rgba(0, 0, 0, 0)');assert.equal(theme.border,'0px');assert.equal(theme.shadow,'none');assert.ok(Math.abs(theme.center.x-theme.viewport.width/2)<1);assert.ok(Math.abs(theme.center.y-theme.viewport.height/2)<1);assert.equal(theme.color,'rgb(30, 114, 190)');assert.match(theme.fill,/rgb\(61, 184, 74\)/);
 await page.evaluate(()=>{const result=document.createElement('article');result.textContent='Updated expert results';document.querySelector('#browse-grid').replaceChildren(result);});
 await stopped();assert.equal(await page.locator('#browse-grid').innerText(),'Updated expert results','native DOM completion clears loading');

 await start();await page.evaluate(()=>window.guidcyFinishPanelRefresh(document.querySelector('#browse-grid')));await stopped();
 await start();await page.evaluate(()=>document.querySelector('#browse-grid').innerHTML='<article>Loading lessons from my first job</article>');await stopped();
 assert.match(await page.locator('#browse-grid').innerText(),/Loading lessons/,'real content containing loading words renders');
 await start();await page.evaluate(()=>document.querySelector('#browse-grid').innerHTML='<p>Loading failed. Please try again.</p>');await stopped();
 assert.match(await page.locator('#browse-grid').innerText(),/Loading failed/,'error state renders and ends loading');

 await page.evaluate(()=>document.querySelector('#gnet-experts').innerHTML='<p>Loading suggestions...</p>');
 await page.waitForFunction(()=>document.querySelector('#gnet-experts').getAttribute('aria-busy')==='true');
 assert.equal(await loader.isVisible(),false,'secondary recommendations do not hold the global loader open');

 await page.evaluate(()=>{const jobs=document.querySelector('#jobs-main-area');jobs.setAttribute('aria-busy','true');jobs.append(document.createTextNode(' More jobs'));});
 await loader.waitFor();assert.equal(await page.locator('#jobs-main-area').getAttribute('aria-busy'),'true','explicit pending requests retain their own lifecycle');
 await page.evaluate(()=>document.querySelector('#jobs-main-area').setAttribute('data-guidcy-background-refresh',''));await loader.waitFor({state:'hidden'});
 await page.evaluate(()=>document.querySelector('#jobs-main-area').removeAttribute('data-guidcy-background-refresh'));await loader.waitFor();
 await page.evaluate(()=>document.querySelector('#jobs-main-area').setAttribute('aria-busy','false'));await loader.waitFor({state:'hidden'});

 await start();await page.evaluate(()=>document.querySelector('.page').classList.remove('on'));await loader.waitFor({state:'hidden'});
 await page.evaluate(()=>document.querySelector('.page').classList.add('on'));await loader.waitFor();
 await page.evaluate(()=>window.guidcyFinishPanelRefresh(document.querySelector('#browse-grid')));await stopped();
 // Every primary cold-load surface uses the same animation without card/bar shapes.
 for(const id of ['browse-grid','cats-full-grid','adash-main','cdash-main','udash-main','gnet-feed','profile-layout','jobs-main-area','sf-results','opp-results-area','gc-list','gmkt-grid','wbn-cards','page-blog']){
  await page.evaluate(id=>{let el=document.getElementById(id);if(!el){el=document.createElement('div');el.id=id;document.querySelector('.page').append(el);}el.replaceChildren();window.guidcyAttachPanelRefresh();el.innerHTML='<span class="sr-only" role="status">Loading content…</span>';},id);
  await loader.waitFor();
  const state=await page.locator('#'+id).evaluate(el=>({before:getComputedStyle(el,'::before').content,after:getComputedStyle(el,'::after').content,visibleChildren:[...el.children].filter(child=>getComputedStyle(child).display!=='none').length}));
  assert.deepEqual(state,{before:'none',after:'none',visibleChildren:0},id+' has no placeholder shapes or second loading message');
  await page.evaluate(id=>{document.getElementById(id).innerHTML='<article>Loaded content</article>';},id);await loader.waitFor({state:'hidden'});
 }
 // The profile header finishes in a nested DOM update rather than a root assignment.
 await page.evaluate(()=>{const el=document.getElementById('profile-layout');el.innerHTML='<article>Previous person</article>';el.innerHTML='<section><span data-guidcy-profile-loading>Loading profile…</span></section><button>Book Session</button>';});await loader.waitFor();
 assert.doesNotMatch(await page.locator('#profile-layout').innerHTML(),/Previous person/,'changing profiles replaces the previous person and booking DOM');
 await page.evaluate(()=>{document.querySelector('#profile-layout section').innerHTML='<h1>Loaded expert</h1>';});await loader.waitFor({state:'hidden'});assert.equal(await page.locator('#profile-layout').getAttribute('aria-busy'),null);
 assert.deepEqual(errors,[]);
 console.log('Loading completion, native DOM commits, errors, real records, secondary requests, navigation and Guidcy colors passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
