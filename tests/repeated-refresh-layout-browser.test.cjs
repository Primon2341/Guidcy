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
 async function context(width,role='guest'){
  const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600});
  await ctx.addInitScript(role=>{
   const user={id:role==='consultant'?'expert-profile':'test-'+role,email:role+'@example.com',user_metadata:{full_name:'Test '+role,role}};
   window.__guidcyTestAuthUser=user;window.__guidcyTestProfile={id:user.id,email:user.email,full_name:'Test '+role,role};
   if(role!=='guest'){
    sessionStorage.setItem('__session',JSON.stringify({user,access_token:'offline-test-token'}));
    localStorage.setItem('sb-lsthngfxehayeqyctkla-auth-token',JSON.stringify({user}));
   }
   window.__authDelay=500;
   window.__extraPages=[];
   function frame(){
    const visible=[...document.querySelectorAll('.page')].filter(el=>getComputedStyle(el).display!=='none');
    if(visible.length>1)window.__extraPages.push(visible.map(el=>el.id));
    if(performance.now()<2500)requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  },role);
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.includes('/assets/vendor/supabase.js'))return r.fulfill({contentType:'text/javascript',body:sdk});if(!u.startsWith(origin)||u.includes('/api/'))return r.abort();return r.continue()});
  return ctx;
 }
 async function footer(page,label){
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const gap=await page.evaluate(()=>document.documentElement.scrollHeight-(document.querySelector('.footer').getBoundingClientRect().bottom+scrollY));
  assert.ok(gap<=2,label+' content below footer: '+gap);
 }
 async function reload(page,url,cycle){
  let release,entered;
  const hold=new Promise(r=>release=r),requested=new Promise(r=>entered=r);
  const handler=async r=>{entered();await hold;await r.continue()};
  await page.route('**/assets/js/app.js*',handler);
  await page.reload({waitUntil:'commit'});await requested;
  await page.waitForSelector('#nav-right',{state:'attached'});
  const early=await page.evaluate(()=>{
   window.__headerNodes=[...document.querySelectorAll('#nav-links > *,#nav-right > *')];
   return {labels:[...document.querySelectorAll('#nav-links > *')].map(e=>e.textContent.trim()),account:document.querySelector('#nav-right').innerText};
  });
  release();await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await page.waitForLoadState('load');
  const late=await page.evaluate(()=>({labels:[...document.querySelectorAll('#nav-links > *')].map(e=>e.textContent.trim()),account:document.querySelector('#nav-right').innerText,same:window.__headerNodes.every((e,i)=>e===[...document.querySelectorAll('#nav-links > *,#nav-right > *')][i])}));
  assert.deepEqual(await page.evaluate(()=>window.__extraPages),[],url+' only the routed page is visible');
  assert.deepEqual(late.labels,early.labels,url+' menu labels reload '+cycle);
  assert.equal(late.account,early.account,url+' account reload '+cycle);
  assert.ok(late.same,url+' menu nodes rebuilt reload '+cycle);
  assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,url);
  await page.unroute('**/assets/js/app.js*',handler);
 }
 for(const width of [390,1280]){
  const ctx=await context(width),page=await ctx.newPage();
  for(const url of ['/','/browse','/find-jobs','/career-ai-finder','/marketplace','/webinars','/funds-grants']){
   await page.goto(origin+url);await page.waitForFunction(()=>window.__guidcyAuthReadyFired);
   const settledUrl=new URL(page.url()).pathname+new URL(page.url()).search;
   for(let cycle=1;cycle<=4;cycle++)await reload(page,settledUrl,cycle);
   for(const id of ['jobs-main-area','sf-results']){
    if(await page.locator('#'+id).isVisible())assert.equal(await page.locator('#'+id).getAttribute('aria-busy'),null,id+' idle is not loading');
   }
   await footer(page,width+' '+url);
  }
  // Interrupted revalidation must preserve the last successful snapshot.
  await page.goto(origin+'/browse');await page.waitForFunction(()=>window.__guidcyAuthReadyFired&&!document.querySelector('#browse-grid').hasAttribute('aria-busy'));
  const saved=await page.evaluate(()=>{
   const el=document.querySelector('#browse-grid');el.innerHTML='<article>Previously loaded expert</article>';el.setAttribute('aria-busy','false');
   window.guidcySavePageShell();const before=JSON.parse(sessionStorage.getItem('guidcy:refresh:v1'))['/browse'].regions['browse-grid'];
   el.innerHTML='<p>Loading experts...</p>';window.guidcySavePageShell();
   return {before,after:JSON.parse(sessionStorage.getItem('guidcy:refresh:v1'))['/browse'].regions['browse-grid']};
  });
  assert.ok(saved.before,'aria-busy=false is settled content and must be saved');
  assert.deepEqual(saved.after,saved.before,'busy pagehide retains the last good snapshot');
  for(let cycle=0;cycle<4;cycle++){
   await page.reload();await page.waitForFunction(()=>window.__guidcyAuthReadyFired);
   await page.evaluate(()=>{
    const el=document.querySelector('#browse-grid');el.__guidcyRestoreMinHeight='';el.style.minHeight='2000px';el.setAttribute('data-guidcy-restored','');
    el.innerHTML='<article>Updated expert</article>';
   });
   assert.equal(await page.locator('#browse-grid').evaluate(e=>e.style.minHeight),'','live content releases the cache height');
  }
  await ctx.close();console.log(width+' public: four consecutive reloads per route, footer, idle results, interrupted cache and height release passed');
  for(const [role,url,panel] of [['user','/dashboard/webinars','udash-main'],['consultant','/consultant-dashboard?tab=overview','cdash-main'],['admin','/admin-dashboard?tab=overview','adash-main']]){
   const ctx=await context(width,role),page=await ctx.newPage();
   await page.goto(origin+url);await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await page.waitForTimeout(700);
   const settledUrl=new URL(page.url()).pathname+new URL(page.url()).search;
   for(let cycle=1;cycle<=4;cycle++)await reload(page,settledUrl,cycle);
   await footer(page,width+' '+role);
   // The restored Dashboard button must also work, not just look correct.
   await page.evaluate(()=>{window.__sameDocument=true;window.go('browse')});
   await page.locator('#nav-right #guidcy-dashboard-btn').click();await page.waitForTimeout(250);
   assert.ok(await page.evaluate(mobile=>window.__sameDocument&&document.querySelector(mobile?'.dash-side.on':'.page.on .dash-main'),width<600),'restored dashboard action works');
   await ctx.close();console.log(width+' '+role+': four reloads, stable header and dashboard action passed');
  }
 }
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
