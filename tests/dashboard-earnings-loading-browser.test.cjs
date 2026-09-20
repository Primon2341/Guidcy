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
  const originalFrom=c.from;
  c.from=function(table){const q=originalFrom(table),then=q.then;
    if(table==='bookings')q.then=function(resolve,reject){return new Promise(r=>setTimeout(r,window.__dataDelay||0)).then(()=>{if(window.__bookingReadError)return resolve({data:null,error:{message:'Test read unavailable'}});return then.call(q,resolve,reject)})};return q};
  c.channel=function(name){return {on(event,filter,fn){if(name==='guidcy-live-bookings')window.__bookingRealtime=fn;return this},subscribe(){return this},unsubscribe(){}}};
  c.removeChannel=function(){};
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
   window.__authDelay=500;window.__dataDelay=350;
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
 for(const width of [390,1280]){
  const ctx=await context(width,'consultant'),page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await ctx.route('**/*.woff2',async route=>{await new Promise(r=>setTimeout(r,900));await route.continue()});
  await ctx.addInitScript(()=>{
    window.__loadingSamples=[];
    function sample(){
      const p=document.querySelector('#cdash-main.guidcy-panel-skeleton'),h=p?.querySelector('.dash-title');
      if(h){const css=getComputedStyle(p,'::after'),rect=h.getBoundingClientRect();window.__loadingSamples.push({position:css.position,top:css.top,height:rect.height,text:h.textContent,visible:getComputedStyle(h).visibility})}
      if(performance.now()<5000)requestAnimationFrame(sample);
    }requestAnimationFrame(sample);
  });
  for(let cycle=0;cycle<4;cycle++){
    if(cycle===0)await page.goto(origin+'/consultant-dashboard?tab=my-bookings',{waitUntil:'domcontentloaded'});
    else {if(cycle===3){const cdp=await ctx.newCDPSession(page);await cdp.send('Network.clearBrowserCache');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true})}await page.reload({waitUntil:'domcontentloaded'})}
    await page.waitForFunction(()=>window.__guidcyAuthReadyFired&&!document.querySelector('#cdash-main').hasAttribute('aria-busy')&&!document.querySelector('#cdash-main').hasAttribute('data-guidcy-restored'),null,{timeout:10000}).catch(async e=>{console.log('load diagnostic',cycle,await page.evaluate(()=>({url:location.href,panel:document.querySelector('#cdash-main').innerHTML,auth:window.guidcyDashboardAuthReady(),reads:window.__guidcyBookingReadCount})),errors);throw e});
    assert.match(await page.locator('#cdash-main .dash-title').innerText(),/My bookings/i);
    const samples=await page.evaluate(()=>window.__loadingSamples);
    if(cycle===0)assert.ok(samples.length,'cold load sampled the real loading heading');
    assert.ok(await page.evaluate(()=>window.__guidcyBookingReadCount<35),'slow loading does not restart queries indefinitely');
    assert.ok(samples.every(s=>s.position==='static'&&s.top==='auto'&&s.height>25&&s.visible==='visible'),'skeleton remains below the heading in normal flow');
    assert.equal(new URL(page.url()).search,'?tab=my-bookings');
  }
  if(width<600){await page.locator('#nav-right #guidcy-dashboard-btn').click();await page.waitForFunction(()=>document.querySelector('#page-cons-dash .dash-side')?.classList.contains('on'))}
  if(width<600){
    // pageshow may arrive after a user opens the menu while fonts are pending.
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false})));
    assert.ok(await page.locator('#page-cons-dash .dash-side').evaluate(el=>el.classList.contains('on')),'normal pageshow must preserve a menu opened during loading');
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    assert.equal(await page.locator('#page-cons-dash .dash-side').evaluate(el=>el.classList.contains('on')),false,'BFCache restoration still dismisses a restored drawer');
    await page.locator('#nav-right #guidcy-dashboard-btn').click();
    await page.waitForFunction(()=>document.querySelector('#page-cons-dash .dash-side')?.classList.contains('on'));
  }
  await page.locator('#page-cons-dash [data-dash-section=overview]').click();
  await page.waitForSelector('.earnings-empty',{timeout:10000}).catch(async e=>{console.log('dashboard diagnostic',await page.evaluate(()=>({url:location.href,panel:document.querySelector('#cdash-main').innerText})),errors);throw e});
  assert.equal(await page.locator('.earnings-empty').innerText(),'No earnings data yet');
  await page.waitForFunction(()=>typeof window.__bookingRealtime==='function');
  await page.evaluate(()=>{
    window.__guidcyTestBookings.splice(0,window.__guidcyTestBookings.length,{id:'earned-1',consultant_id:'test-expert',payment_verified:true,payment_status:'success',status:'completed',session_status:'completed',payout_status:'paid',amount:1000,consultant_payout_amount:850,session_completed_at:new Date().toISOString(),created_at:new Date().toISOString()});
    window.__bookingRealtime({});
  });
  await page.waitForSelector('.earnings-bars',{timeout:10000}).catch(async e=>{console.log('live diagnostic',await page.evaluate(()=>({url:location.href,panel:document.querySelector('#cdash-main').innerText,rows:window.__guidcyTestBookings,reads:window.__guidcyBookingReadCount,buttons:[...document.querySelectorAll('#page-cons-dash .side-btn.on')].map(e=>e.textContent),client:window.currentUser?.id,auth:window.guidcyDashboardAuthReady(),pages:[...document.querySelectorAll('.page.on')].map(e=>e.id),drawer:document.querySelector('#page-cons-dash .dash-side')?.className,stale:window.__guidcyDashboardsStaleAt})),errors);throw e});
  assert.match(await page.locator('.earnings-month').last().getAttribute('aria-label'),/₹850/);
  assert.equal(await page.locator('.earnings-value').last().innerText(),'₹850');
  assert.equal(await page.locator('.earnings-total strong').innerText(),'₹850');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'chart scroll remains inside its section');
  await page.locator('.earnings-trend').screenshot({path:'/private/tmp/guidcy-earnings-amounts-'+width+'.png'});
  await page.evaluate(()=>{window.__guidcyTestBookings[0].consultant_payout_amount=425;window.__bookingRealtime({})});
  await page.waitForFunction(()=>document.querySelector('.earnings-month:last-child')?.getAttribute('aria-label').includes('₹425'));
  assert.equal(await page.locator('.earnings-value').last().innerText(),'₹425');
  assert.equal(await page.locator('.earnings-total strong').innerText(),'₹425');
  await page.evaluate(()=>{window.__guidcyTestBookings[0].status='cancelled';window.__guidcyTestBookings[0].payout_status='not_eligible';window.__bookingRealtime({})});
  await page.waitForSelector('.earnings-empty');
  await page.evaluate(()=>{window.__bookingReadError=true;window.__bookingRealtime({})});
  await page.waitForSelector('#cdash-main .guidcy-dash-load-error');
  assert.equal(await page.locator('.earnings-empty').count(),0,'a failed read must not claim no earnings');
  await page.evaluate(()=>window.__bookingReadError=false);
  await page.locator('#cdash-main .guidcy-dash-load-error button').click();
  await page.waitForSelector('.earnings-empty');

  if(width<600){await page.locator('#nav-right #guidcy-dashboard-btn').click();await page.waitForFunction(()=>document.querySelector('#page-cons-dash .dash-side')?.classList.contains('on'))}
  await page.locator('#page-cons-dash [data-dash-section=my-bookings]').click();
  await page.waitForFunction(()=>document.querySelector('#cdash-main .dash-title')?.textContent==='My bookings'&&!document.querySelector('#cdash-main').hasAttribute('aria-busy'));
  await page.screenshot({path:'/private/tmp/guidcy-dashboard-heading-'+width+'.png'});
  // Verify the actual rendered rupee font, not just the CSS declaration.
  for(const family of ['DM Sans','Cormorant Garamond','Plus Jakarta Sans']){
    await page.evaluate(async family=>{await document.fonts.load('600 24px "'+family+'"','₹499');const el=document.createElement('span');el.id='font-probe';el.style.cssText='position:fixed;top:0;left:0;z-index:99999;font-family:"'+family+'";font-size:24px;font-weight:600';el.textContent='₹499';document.body.append(el);el.getBoundingClientRect();await new Promise(requestAnimationFrame)},family);
    const cdp=await ctx.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
    const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#font-probe'});
    const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    assert.ok(fonts.length===1&&fonts[0].isCustomFont&&fonts[0].familyName.startsWith(family)&&fonts[0].glyphCount===4,family+' rupee and digits use the same real font: '+JSON.stringify(fonts));
    await page.locator('#font-probe').evaluate(e=>e.remove());await cdp.detach();
  }
  assert.deepEqual(errors,[]);
  await ctx.close();console.log(width+': four reloads, slow fonts/auth/data, tab navigation, live eligible earnings, empty state, and real rupee glyph fonts passed');
 }
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
