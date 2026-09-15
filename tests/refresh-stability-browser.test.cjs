/* Real browser coverage of the interval between first paint and auth/data
 * completion. Runs against public/, with local fixtures; no production writes. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'browser-flow.test.cjs'),'utf8'),start=source.indexOf('const fakeSupabase =');
const fixture=vm.runInNewContext(source.slice(start,source.indexOf('\n(async',start))+'\nfakeSupabase');
const sdk=fixture+`\n(function(){
 var original=supabase.createClient;
 supabase.createClient=function(){
  var c=original.apply(this,arguments),from=c.from;
  c.from=function(table){var q=from(table);if(table==='profiles')q.or=function(){return q.eq('id',window.__guidcyTestProfile.id)};return q};
  function session(){return JSON.parse(sessionStorage.getItem('__session')||'null')}
  c.auth.getSession=async function(){window.__sessionReads=(window.__sessionReads||0)+1;await new Promise(r=>setTimeout(r,window.__authDelay||0));if(window.__authError)return {data:{session:null},error:new Error('offline')};return {data:{session:session()},error:null}};
  c.auth.getUser=async function(){await new Promise(r=>setTimeout(r,window.__authDelay||0));return {data:{user:session()?.user||null},error:null}};
  c.auth.onAuthStateChange=function(fn){setTimeout(()=>fn('INITIAL_SESSION',session()),window.__authDelay||0);return {data:{subscription:{unsubscribe(){}}}}};
  return c;
 };
})();`;
const root=path.resolve(__dirname,'../public');
const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.writeHead(200,{'content-type':types[path.extname(file)]||'text/html'});fs.createReadStream(file).pipe(res)});
(async()=>{
 let browser;
 try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 async function context(role='user'){
  const ctx=await browser.newContext({viewport:{width:1280,height:850}});
  await ctx.addInitScript(role=>{
   const user={id:role==='consultant'?'expert-profile':'test-'+role,email:role==='consultant'?'expert@example.com':role+'@example.com',user_metadata:{full_name:'Test '+role,role}};
   window.__guidcyTestAuthUser=user;window.__guidcyTestProfile={id:user.id,email:user.email,full_name:'Test '+role,role};
   if(role!=='guest'){
    sessionStorage.setItem('__session',JSON.stringify({user,access_token:'offline-test-token'}));
    localStorage.setItem('sb-lsthngfxehayeqyctkla-auth-token',JSON.stringify({user}));
   }
   window.__authDelay=Number(sessionStorage.getItem('__delay')||0);
   window.__authError=sessionStorage.getItem('__error')==='1';
   window.__frames=[];
   function frame(){
    const pages=[...document.querySelectorAll('.page')].filter(el=>getComputedStyle(el).display!=='none');
    if(document.querySelector('#nav-right'))window.__frames.push({url:location.pathname+location.search,pages:pages.map(e=>e.id),nav:document.querySelector('#nav-right').innerText});
    if(window.__frames.length<1200)requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  },role);
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.includes('/assets/vendor/supabase.js'))return r.fulfill({contentType:'text/javascript',body:sdk});if(!u.startsWith(origin)||u.includes('/_vercel/')||u.includes('/api/'))return r.abort();return r.continue()});
  return ctx;
 }
 if(process.env.CAPTURE_SHELLS){
  const ctx=await context('guest'),page=await ctx.newPage(),shells=[];
  for(const [url,id] of [['/find-jobs','jobs'],['/marketplace','marketplace'],['/career-ai-finder','smart-finder'],['/blog','blog'],['/careers','careers']]){
   await page.goto(origin+url);await page.waitForTimeout(2000);
   shells.push(await page.evaluate(id=>{
    var el=document.getElementById('page-'+id).cloneNode(true);el.className='page';
    el.querySelectorAll('script,[data-auth-retry]').forEach(n=>n.remove());
    el.querySelectorAll('#gmkt-grid,#gc-list,#cons-rec-grid').forEach(n=>{n.innerHTML='';n.classList.add('guidcy-panel-skeleton');n.setAttribute('aria-busy','true')});
    return el.outerHTML;
   },id));
  }
  fs.writeFileSync('/private/tmp/guidcy-public-shells.html',shells.join('\n'));console.log('Captured public structural shells');await ctx.close();return;
 }
 const publicContext=await context('guest'),publicPage=await publicContext.newPage();
 let holdApp=true;
 await publicPage.route('**/assets/js/app.js*',async r=>{if(holdApp)await new Promise(resolve=>setTimeout(resolve,1200));return r.continue()});
 for(const [url,id] of [['/','home'],['/browse','browse'],['/find-jobs','jobs'],['/marketplace','marketplace'],['/webinars','webinar'],['/funds-grants','opportunities'],['/career-ai-finder','smart-finder']]){
  await publicPage.goto(origin+url,{waitUntil:'commit'});await publicPage.waitForSelector('#nav-right',{state:'attached'});await publicPage.waitForTimeout(150);
  assert.ok(await publicPage.locator('#page-'+id).isVisible(),url+' initial shell');
  if(id!=='home')assert.equal(await publicPage.locator('#page-home').isVisible(),false,url+' never paints Home');
  await publicPage.waitForFunction(()=>window.__guidcyAuthReadyFired);
 }
 await publicPage.goto(origin+'/browse');await publicPage.waitForFunction(()=>window.__guidcyAuthReadyFired);await publicPage.waitForTimeout(500);
 const previousExperts=(await publicPage.locator('#browse-grid').innerText()).replace(/\s+/g,' ').trim();
 await publicPage.reload({waitUntil:'commit'});await publicPage.waitForSelector('#nav-right',{state:'attached'});await publicPage.waitForTimeout(150);
 assert.ok(await publicPage.locator('#browse-grid[data-guidcy-restored]').count(),'anonymous results restore before app startup');
 assert.equal((await publicPage.locator('#browse-grid').innerText()).replace(/\s+/g,' ').trim(),previousExperts,'existing public results remain visible');
 await publicPage.waitForFunction(()=>window.__guidcyAuthReadyFired);
 holdApp=false;
 await publicPage.evaluate(()=>{window.__navNode=document.querySelector('.nav');window.__footerNode=document.querySelector('.footer');window.__documentToken='same-document';window.go('jobs')});
 await publicPage.waitForTimeout(600);
 await publicPage.evaluate(()=>{window.__jobInput=document.querySelector('#job-q');window.renderPage('jobs')});
 await publicPage.waitForTimeout(500);
 assert.ok(await publicPage.evaluate(()=>window.__jobInput===document.querySelector('#job-q')),'job search controls stay mounted');
 await publicPage.evaluate(()=>window.guidcyNavigate('/webinars?category=Career'));await publicPage.waitForTimeout(500);
 assert.ok(await publicPage.evaluate(()=>window.__documentToken==='same-document'&&window.__navNode===document.querySelector('.nav')&&window.__footerNode===document.querySelector('.footer')),'SPA navigation preserves document and shell nodes');
 assert.equal(new URL(publicPage.url()).search,'?category=Career');
 await publicContext.close();console.log('public first paint and persistent SPA shell: ok');
 for(const [role,url,id] of [['user','/dashboard?tab=upcoming','user-dash'],['consultant','/consultant-dashboard?tab=overview','cons-dash'],['admin','/admin-dashboard?tab=overview','admin-dash']]){
  const ctx=await context(role),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+url);await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await page.waitForTimeout(2200);
  const actual=await page.evaluate(()=>location.pathname+location.search);
  assert.equal(actual,url,role+' initial URL');
  const nav=await page.locator('#nav-right').innerText();assert.match(nav,/Dashboard/);
  await page.evaluate(()=>sessionStorage.setItem('__delay','4000'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>location.pathname+location.search),url,role+' pending URL');
  assert.ok(await page.locator('#page-'+id).isVisible(),role+' pending shell');
  assert.ok(await page.locator('#page-'+id+' [data-guidcy-restored]').count(),role+' restores previous content before auth');
  fs.mkdirSync('/private/tmp/guidcy-refresh-shots',{recursive:true});
  await page.screenshot({path:'/private/tmp/guidcy-refresh-shots/'+role+'-refresh.png'});
  assert.doesNotMatch(await page.locator('#nav-right').innerText(),/log in/i,role+' pending nav');
  await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await page.waitForTimeout(1000);
  const frames=await page.evaluate(()=>window.__frames);
  assert.ok(frames.length>20);
  assert.ok(frames.every(f=>f.url===url),role+' must never redirect during restoration: '+JSON.stringify(frames.filter(f=>f.url!==url).slice(0,5)));
  assert.ok(frames.every(f=>!f.pages.includes('page-home')&&!f.pages.includes('page-login')),role+' must never paint another route');
  assert.ok(frames.every(f=>!/log in/i.test(f.nav)),role+' nav blink');
  assert.deepEqual(errors,[],role+' runtime errors');
  await ctx.close();console.log(role+' delayed auth refresh: ok');
 }
 const ctx=await context(),page=await ctx.newPage();
 await page.goto(origin+'/dashboard/webinars');await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await page.waitForTimeout(1500);
 assert.equal(new URL(page.url()).pathname,'/dashboard/webinars');
 assert.match(await page.locator('#udash-main').innerText(),/webinars/i);
 await page.evaluate(()=>sessionStorage.setItem('__error','1'));await page.reload();await page.waitForTimeout(1500);
 assert.equal(new URL(page.url()).pathname,'/dashboard/webinars','failed auth must not redirect');
 assert.ok(await page.locator('#page-user-dash').isVisible());
 assert.equal(await page.evaluate(()=>window.__guidcyAuthReadyFired),false);
 await page.evaluate(()=>{window.__authError=false;sessionStorage.removeItem('__error');window.guidcyRetryAuthRestore()});
 await page.waitForFunction(()=>window.__guidcyAuthReadyFired);
 assert.equal(new URL(page.url()).pathname,'/dashboard/webinars');
 console.log('nested route, offline restore and retry: ok');
 // A slow revalidation cannot erase live content, even after the old 6s timeout.
 await page.evaluate(()=>{var p=document.getElementById('udash-main');p.innerHTML='<div class="dash-title">My Webinars</div><article data-test-stale>Existing registration</article>';p.innerHTML='<div class="dash-title">My Webinars</div><div>Loading...</div>'});
 await page.waitForTimeout(6500);
 assert.equal(await page.locator('[data-test-stale]').count(),1);
 await page.evaluate(()=>document.getElementById('udash-main').innerHTML='<div class="dash-title">My Webinars</div><article>Updated registration</article>');
 assert.match(await page.locator('#udash-main').innerText(),/Updated registration/);
 console.log('slow region revalidation: ok');
 await ctx.close();
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
