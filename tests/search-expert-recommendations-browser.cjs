// Static app + real matching endpoint over fixtures. No production reads/writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{makeHandler}=require('./helpers/expert-match-fixture.cjs');
const source=fs.readFileSync(path.join(__dirname,'community-browser.cjs'),'utf8');
const fixtureEnd=source.indexOf('let browser;');assert.ok(fixtureEnd>0,'fixture preamble boundary exists');
const setup=vm.runInNewContext(source.slice(0,fixtureEnd)+';({fixture,server});',{require,__dirname,process,Buffer,URL});
let browser,debug;
(async()=>{
 await new Promise(resolve=>setup.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+setup.server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [320,390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(()=>{window.__fixtureNativeFetch=window.fetch;localStorage.setItem('guidcy_cookie_consent_v1',JSON.stringify({version:1,analytics:false,savedAt:Date.now()}));});
  const api=makeHandler(),requests=[],errors=[];let fail=false,delay='';
  await context.route('**/*',async route=>{
   const url=route.request().url();
   if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:setup.fixture+'\nwindow.fetch=window.__fixtureNativeFetch;'});
   if(url.includes('/api/expert-match')){
    const body=route.request().postDataJSON();requests.push(body);
    const result=await api.request(body.goal,body);if(body.goal===delay)await new Promise(r=>setTimeout(r,700));
    return route.fulfill({status:fail?503:200,json:fail?{ok:false}:result}).catch(()=>{});
   }
   if(url.includes('/api/jobs?'))return route.fulfill({json:{jobs:[{id:'job-1',title:'Fixture Role',company:'Fixture Company',location:'India',applyLink:'https://example.com/job'}]}});
   if(url.includes('/api/smart-finder'))return route.fulfill({json:{summary:'Fixture AI results',jobs:[],programs:[]}});
   if(url.includes('/api/opportunities'))return route.fulfill({json:{results:[{id:'grant-1',title:'Fixture Grant',url:'https://example.com/grant',content:'Research opportunity',type:'student'}]}});
   if(url.startsWith(origin)&&!url.includes('/api/'))return route.continue();return route.abort();
  });
  const page=await context.newPage();debug={page,requests};page.on('pageerror',e=>errors.push(e.message));
  async function profiles(pageId,expected){
   const selector='#guidcy-adaptive-recs-'+pageId;
   await page.waitForFunction(({selector,expected})=>{const box=document.querySelector(selector),ids=Array.from(box?.querySelectorAll('[data-consultant-id]')||[],e=>e.dataset.consultantId);return expected.length?JSON.stringify(ids)===JSON.stringify(expected):box?.style.display==='none';},{selector,expected});
   assert.equal(await page.locator('#page-'+pageId+' .guidcy-adaptive-recs').count(),1,'one recommendation section');
   assert.equal(await page.locator('#cons-rec-grid').count(),0,'legacy consultant grid is removed');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
   if(expected.length){
    const alignment=await page.locator(selector).evaluate((box,pageId)=>{
     const result=document.getElementById({jobs:'jobs-main-area','smart-finder':'sf-results',opportunities:'opp-results-area'}[pageId]),r=result.getBoundingClientRect();
     return {sameColumn:box.parentElement===result.parentElement,edges:[box,box.querySelector('h3'),box.querySelector('.guidcy-adaptive-grid')].map(el=>{const b=el.getBoundingClientRect();return {left:Math.abs(b.left-r.left),right:Math.abs(b.right-r.right)}})};
    },pageId);
    assert.ok(alignment.sameColumn,'suggestions belong to the result content column');
    assert.ok(alignment.edges.every(edge=>edge.left<1&&edge.right<1),'heading and expert grid align with both result edges at '+width+'px on '+pageId);
   }
  }
  await page.goto(origin+'/find-jobs');await page.waitForSelector('#job-q');
  await page.locator('#job-q').fill('polymer');await page.locator('#job-search-btn').click();await profiles('jobs',['test-expert']);
  assert.equal(requests.at(-1).goal,'polymer','location, filters and result text cannot broaden the keyword');
  const count=requests.length;await page.locator('#job-search-btn').click();await page.waitForTimeout(400);assert.equal(requests.length,count,'repeated identical searches reuse recent suggestions');
  await page.locator('#job-q').fill('zzqxvplm');await page.locator('#job-search-btn').click();await profiles('jobs',[]);
  delay='polymer';await page.locator('#job-q').fill('polymer');await page.locator('#job-search-btn').click();await page.waitForFunction(()=>document.querySelector('.guidcy-adaptive-recs [role=status]'));
  await page.locator('#job-q').fill('tax');await page.locator('#job-search-btn').click();await profiles('jobs',['finance']);await page.waitForTimeout(800);await profiles('jobs',['finance']);delay='';
  await page.goto(origin+'/career-ai-finder');await page.waitForSelector('#sf-j-role');await page.locator('#sf-j-role').fill('polymer');await page.locator('#sf-submit-btn').click();await profiles('smart-finder',['test-expert']);assert.equal(requests.at(-1).goal,'polymer','default degree and hidden education form are excluded');
  await page.locator('#sf-mode-edu').click();await page.locator('#sf-e-stream').fill('Finance');await page.locator('#sf-e-goal').fill('Scholarship');await page.locator('#sf-submit-btn').click();await profiles('smart-finder',['startup']);assert.equal(requests.at(-1).goal,'Scholarship','explicit goal takes priority over background qualifications');
  await page.locator('#sf-e-goal').fill('zzqxvplm');await page.locator('#sf-submit-btn').click();await profiles('smart-finder',[]);
  await page.goto(origin+'/funds-grants');await page.waitForSelector('#opp-search-input');await page.locator('#opp-search-input').fill('polymer');await page.locator('#opp-search-input').press('Enter');await profiles('opportunities',['test-expert']);
  await page.locator('#opp-search-input').fill('Scholarship');await profiles('opportunities',['startup']);assert.equal(requests.at(-1).goal,'Scholarship','live opportunity search uses the same keyword matcher');
  fail=true;await page.locator('#opp-search-input').fill('tax');await page.locator('#opp-search-input').press('Enter');await page.getByText('Expert suggestions are temporarily unavailable.',{exact:true}).waitFor();assert.equal(await page.locator('#guidcy-adaptive-recs-opportunities .ccard').count(),0,'failed request never displays fallback experts');
  fail=false;await page.locator('#guidcy-adaptive-recs-opportunities button').click();await profiles('opportunities',['finance']);
  await page.locator('#opp-search-input').fill('');await page.locator('#opp-search-input').press('Enter');await page.waitForSelector('#guidcy-adaptive-recs-opportunities',{state:'detached'});
  assert.ok(requests.every(r=>r.mode==='adaptive_recommendations'),'all finders share the strict match mode');assert.deepEqual(errors,[]);
  console.log('Single relevant recommendation section, jobs/AI career/AI college/funds, empty matches, caching, stale responses, retry and clearing passed at '+width+'px');await context.close();
 }
})().catch(async e=>{console.error(e);console.error(debug?.requests);if(debug?.page)console.error(await debug.page.evaluate(()=>({url:location.href,query:document.querySelector('#opp-search-input')?.value,oninput:document.querySelector('#opp-search-input')?.getAttribute('oninput'),page:document.querySelector('.page.on')?.id,box:document.querySelector('.guidcy-adaptive-recs')?.outerHTML})));process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>setup.server.close(r));});
