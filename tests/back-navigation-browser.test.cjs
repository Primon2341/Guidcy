const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'browser-flow.test.cjs'),'utf8');
const start=source.indexOf('const fakeSupabase =');
const fake=vm.runInNewContext(source.slice(start,source.indexOf('\n(async',start))+'\nfakeSupabase')
 .replace("rpc:function(){return Promise.resolve({data:[],error:null})}", "rpc:function(name,args){return Promise.resolve({data:name==='community_profile'?{id:consultant.profile_id,name:consultant.name,headline:consultant.specialty,consultant_id:consultant.id,expertise:[],followers:0,following:0}:[],error:null})}");
const root=path.resolve(__dirname,'../public');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/jobs'&&url.searchParams.get('service')==='seo'){
  res.setHeader('Content-Type','application/json');
  return res.end(JSON.stringify({meta:require('../assets/js/seo').metaFor('/blog'),body:'<h1>Blog</h1>'}));
 }
 let file=path.join(root,url.pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'text/html');
 fs.createReadStream(file).pipe(res);
});
(async()=>{let browser;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(()=>localStorage.setItem('guidcy_cookie_consent_v1',JSON.stringify({version:1,analytics:false,savedAt:Date.now()})));
  await context.route('**/*',route=>{const u=route.request().url();if(u.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fake});if(!u.startsWith(origin))return route.abort();return route.continue()});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const at=async(url,id)=>{await page.waitForURL(origin+url);await page.locator('#page-'+id+'.on').waitFor()};
  const navigate=async(url,id)=>{await page.evaluate(url=>window.guidcyNavigate(url),url);await at(url,id)};
  // Direct listing pages defer the community script until Home is requested.
  await page.goto(origin+'/find-experts');await page.waitForFunction(()=>window.__guidcyAuthReadyFired&&window.guidcyBack);
  for(const url of ['/find-experts','/marketplace','/webinars','/about']){
   if(new URL(page.url()).pathname!==url)await page.evaluate(url=>window.guidcyNavigate(url),url);
   await page.locator('#main-nav .logo-wrap').click();await at('/','home');
   await page.waitForFunction(()=>document.querySelector('#gnet-feed')?.getAttribute('aria-busy')==='false');
   await page.locator('#page-home [data-action="compose"]').first().click();
   await page.locator('#gnet-dialog[open]').waitFor();await page.locator('#gnet-dialog [data-close]').first().click();
  }
  console.log(width+': return Home via logo stays interactive after deferred loading and cached revisits');
  await page.goto(origin+'/');await page.waitForFunction(()=>window.__guidcyAuthReadyFired&&window.guidcyBack);
  await page.locator(width<600?'.footer a[href="/find-experts"]':'.nav-links a[href="/find-experts"]').click();
  await at('/find-experts','browse');
  const expert=page.locator('#browse-grid .ccard').filter({has:page.locator('.c-name',{hasText:/^Test Expert$/})});
  for(const selector of ['.c-avatar','.c-name','.ccard-top','.ccard-bot .btn']){
   const count=await page.evaluate(()=>history.length);
   await expert.locator(selector).click();await at('/consultant/test-expert','profile');
   await page.locator('.gnet-profile-close').waitFor();
   if(selector==='.c-avatar')assert.equal(await page.evaluate(()=>history.length),count+1,'card click creates exactly one history entry');
   if(selector==='.ccard-bot .btn'){await page.reload();await page.locator('.gnet-profile-close').waitFor();}
   await page.goBack();
   assert.equal(new URL(page.url()).pathname,'/find-experts','Homepage → Find the Expert → '+selector+' → Back must keep the expert list');
   await at('/find-experts','browse');
   await page.goForward();await at('/consultant/test-expert','profile');
   await page.locator('.gnet-profile-close').click();await at('/find-experts','browse');
  }
  await page.goBack();await at('/','home');
  await page.goto(origin+'/find-experts?q=career');await at('/find-experts?q=career','browse');
  await page.waitForFunction(()=>window.__guidcyAuthReadyFired&&window.guidcyBack);
  await navigate('/consultant/test-expert','profile');await page.locator('.gnet-profile-close').waitFor();
  await navigate('/terms','terms');await navigate('/privacy','privacy');
  await page.locator('#page-privacy button').filter({hasText:'← Back'}).click();await at('/terms','terms');
  await page.locator('#page-terms button').filter({hasText:'← Back'}).click();await at('/consultant/test-expert','profile');
  await page.reload();await page.locator('.gnet-profile-close').waitFor();
  const before=await page.evaluate(()=>history.length);
  await page.locator('.gnet-profile-close').click();await at('/find-experts?q=career','browse');
  assert.equal(await page.evaluate(()=>history.length),before,'Back must not push a new entry');
  await page.goForward();await at('/consultant/test-expert','profile');
  await page.goBack();await at('/find-experts?q=career','browse');
  for(const [url,id] of [['/marketplace','marketplace'],['/webinars','webinar'],['/find-jobs','jobs'],['/careers','careers'],['/blog','blog'],['/about','about'],['/contact','contact'],['/refund','refund'],['/disclaimer','disclaimer'],['/dashboard?tab=history','user-dash']]){
   await navigate(url,id);await page.goBack();await at('/find-experts?q=career','browse');
  }
  // Starting a new tab has no previous page: use the related listing fallback.
  const direct=await context.newPage();await direct.goto(origin+'/consultant/test-expert');await direct.locator('.gnet-profile-close').waitFor();
  await direct.locator('.gnet-profile-close').click();await direct.waitForURL(origin+'/find-experts');
  console.log(width+': Back buttons, profile close, refresh, Forward, public routes, dashboard and direct-link fallback passed');
  await context.close();
 }
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}})().catch(error=>{console.error(error);process.exitCode=1});
