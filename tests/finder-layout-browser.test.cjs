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
 for(const width of [390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600});
  const requests=[];
  await ctx.route('**/*',r=>{
   const u=r.request().url();
   if(u.includes('/assets/vendor/supabase.js'))return r.fulfill({contentType:'text/javascript',body:sdk});
   if(u.includes('/api/jobs?')){requests.push('jobs');return r.fulfill({json:{jobs:[{title:'Fixture Developer',company:'Fixture Company',location:'India',url:'https://example.com/job'}]}})}
   if(u.includes('/api/smart-finder')){const body=r.request().postDataJSON();requests.push(body.mode);return r.fulfill({json:{summary:'Fixture profile recommendations',jobs:[],colleges:[]}})}
   if(!u.startsWith(origin)||u.includes('/api/'))return r.abort();return r.continue();
  });
  const page=await ctx.newPage();
  for(const [url,id] of [['/find-jobs','jobs-main-area'],['/career-ai-finder','sf-results']]){
   await page.goto(origin+url);await page.waitForFunction(()=>window.__guidcyAuthReadyFired);
   const state=await page.locator('#'+id).evaluate(e=>({height:e.offsetHeight,busy:e.getAttribute('aria-busy')==='true',skeleton:e.classList.contains('guidcy-panel-skeleton'),before:getComputedStyle(e,'::before').content}));
   assert.deepEqual(state,{height:0,busy:false,skeleton:false,before:'none'},url+' empty results do not draw a box');
   await page.screenshot({path:'/private/tmp/guidcy-fixed-'+id+'-'+width+'.png',fullPage:true});
   await page.evaluate(()=>window.__nav=document.querySelector('#nav-right').firstElementChild);
   if(id==='jobs-main-area'){
    await page.locator('#job-q').fill('Developer');await page.locator('#job-search-btn').click();
    await page.getByText('Fixture Developer',{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>{window.guidcySavePageShell();return JSON.parse(sessionStorage.getItem('guidcy:refresh:v1'))[location.pathname+location.search].regions['jobs-main-area']?.html.includes('Fixture Developer')}),'completed jobs are cached even with aria-busy=false');
    for(let cycle=0;cycle<4;cycle++){
     await page.reload();await page.getByText('Fixture Developer',{exact:true}).waitFor();
     await page.waitForFunction(()=>!document.querySelector('#jobs-main-area').hasAttribute('inert'));
    }
    await page.evaluate(()=>window.__nav=document.querySelector('#nav-right').firstElementChild);
   }else{
    await page.locator('#sf-j-role').fill('Developer');await page.locator('#sf-j-skills').fill('JavaScript');
    await page.locator('#sf-submit-btn').click();await page.getByText('Fixture profile recommendations',{exact:true}).waitFor();
    await page.locator('#sf-mode-edu').click();await page.locator('#sf-submit-btn').click();
    await page.waitForFunction(()=>!document.querySelector('#sf-submit-btn').disabled);
   }
   assert.ok(await page.evaluate(()=>window.__nav===document.querySelector('#nav-right').firstElementChild),'search preserves account controls');
  }
  assert.equal(requests.length,3,'job search and both AI modes reach their existing API');
  for(const url of ['/','/browse','/find-jobs','/career-ai-finder','/marketplace','/webinars','/funds-grants','/categories','/blog','/careers','/about','/contact','/faq','/help-center','/terms','/privacy','/refund','/disclaimer','/dispute-resolution','/login','/signup']){
   await page.goto(origin+url);await page.waitForFunction(()=>window.__guidcyAuthReadyFired);
   if(width<600){await page.evaluate(()=>window.openMobDrawer());await page.evaluate(()=>window.closeMobDrawer())}
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   const measure=await page.evaluate(()=>({gap:document.documentElement.scrollHeight-(document.querySelector('.footer').getBoundingClientRect().bottom+scrollY),width:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(measure.gap<=2,url+' whitespace below footer at '+width+': '+measure.gap);
  }
  await ctx.close();console.log(width+': both finders functional, no idle boxes, 21 routes end at footer after menu close');
 }
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
