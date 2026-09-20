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
// Seed owned purchases and a seller listing so the regression verifies records,
// not merely a successful-looking empty table.
const dashboardSupabase=fakeSupabase
 .replace("uploader_name:'Test Seller',status:","uploader_id:'expert-profile',uploader_name:'Test Seller',status:")
 .replace("buyer_email:'user@example.com'","seller_id:'expert-profile',buyer_email:(window.__guidcyTestAuthUser?.email||'user@example.com')");
const root = path.resolve(__dirname, '..', 'public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
 let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
 if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
 res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
 fs.createReadStream(file).pipe(res);
});


(async()=>{
 let browser;
 try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const role of ['consultant','user','admin']) for(const width of [1280,390]) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(role=>{
    const id=role==='consultant'?'expert-profile':'test-'+role,email=role==='consultant'?'expert@example.com':role+'@example.com';
    window.__guidcyTestAuthUser={id,email,user_metadata:{full_name:'Test '+role,role}};
    window.__guidcyTestProfile={id,email,full_name:'Test '+role,role};
  },role);
  await context.route('**/*',r=>{const u=r.request().url();if(u.includes('/assets/vendor/supabase.js'))return r.fulfill({contentType:'text/javascript',body:dashboardSupabase});if(u.includes('/rest/v1/notifications'))return r.fulfill({contentType:'application/json',body:'[]'});if(!u.startsWith(origin)||u.includes('/api/'))return r.abort();return r.continue()});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const owner=role==='consultant'?'cons':role,dash='#page-'+owner+'-dash',main='#'+(role==='consultant'?'c':role==='admin'?'a':'u')+'dash-main';
  const base=role==='user'?'/dashboard':role==='consultant'?'/consultant-dashboard':'/admin-dashboard';
  await page.goto(origin+base);await page.waitForFunction(()=>window.__guidcyAuthReadyFired);
  await page.waitForSelector(dash+' .side-btn[data-dash-section="marketplace"]');
  if(role!=='admin')await page.waitForSelector(dash+' .side-btn[data-dash-section="notification-preferences"]',{state:'attached'});
  if(role==='consultant')await page.waitForSelector('#cons-notification-btn',{state:'attached'});
  if(role==='admin')await page.waitForSelector('#gadmin-support-sidebtn',{state:'attached'});
  const links=await page.locator(dash+' .side-btn').evaluateAll(bs=>bs.map(b=>({tab:b.dataset.dashSection||b.dataset.adminSection,label:b.textContent.trim()})).filter(b=>b.tab));
  links.sort((a,b)=>Number(b.tab.startsWith('marketplace'))-Number(a.tab.startsWith('marketplace')));
  const titles={
   user:{upcoming:/upcoming sessions/i,goals:/goal tracker/i,history:/session history/i,saved:/saved consultants/i,payments:/payment history/i,notifications:/^notifications$/i,reviews:/my reviews/i,settings:/settings/i,marketplace:/purchased notes/i,'my-webinars':/my webinars/i,'notification-preferences':/notification preferences/i},
   consultant:{overview:/^overview$/i,requests:/booking requests/i,'my-bookings':/my bookings/i,'my-webinars':/my webinars/i,schedule:/availability|schedule/i,earnings:/^earnings$/i,reviews:/client reviews/i,webinars:/webinar history/i,notifications:/^notifications$/i,settings:/settings/i,marketplace:/my marketplace/i,'marketplace-purchases':/purchased notes/i,'notification-preferences':/notification preferences/i},
   admin:{overview:/analytics|overview/i,consultants:/manage consultants/i,users:/users/i,bookings:/bookings/i,payments:/payment/i,support:/support tickets/i,disputes:/disputes/i,'marketing-strip':/moving consultant strip/i,webinars:/webinar history/i,'promo-codes':/promo codes/i,'referral-program':/referral program/i,'marketplace-payouts':/marketplace payouts/i,'webinar-payouts':/webinar payouts/i,'consultant-earnings':/consultant earnings/i,approvals:/approval requests/i,payouts:/consultant payouts/i,featured:/featured experts/i,marketplace:/^marketplace$/i,'webinar-registrations':/webinar registrations/i}
  };
  async function settled(tab){
    assert.ok(titles[role][tab],'explicit content expectation for '+role+' '+tab);
    await page.waitForFunction(({main,tab,titlePattern})=>{
      const m=document.querySelector(main),title=m?.querySelector('.dash-title')?.textContent||'';
      if(!new RegExp(titlePattern,'i').test(title))return false;
      return m&&!m.hasAttribute('aria-busy')&&!m.hasAttribute('data-guidcy-restored')&&!m.classList.contains('guidcy-panel-skeleton')&&!/Loading(?:…|\.{3}| your| purchased| saved| session| bookings| webinar| reviews| earnings| notifications)/i.test(m.innerText)&&title&&m.children.length>1;
    },{main,tab,titlePattern:titles[role][tab].source},{timeout:10000}).catch(async e=>{console.log('FAIL',role,width,tab,await page.locator(main).innerText(),errors);throw e});
    const text=await page.locator(main).innerText();
    assert.doesNotMatch(text,/Unable to load|Could not load|temporarily unavailable|Please sign in/i,role+' '+tab+' must load successfully');
    if(tab==='marketplace')assert.match(text,role==='consultant'?/My Marketplace[\s\S]*Sales & Payouts/:role==='user'?/My Purchased Notes[\s\S]*Purchased Test Notes/:/Marketplace/);
    if(tab==='marketplace'&&role==='consultant')assert.match(text,/Purchased Test Notes/);
    if(tab==='marketplace-purchases')assert.match(text,/My Purchased Notes[\s\S]*Purchased Test Notes/);
    const url=new URL(page.url());assert.equal(url.pathname==='/admin/webinar-registrations'?'webinar-registrations':url.searchParams.get('tab'),tab);
    assert.equal(await page.locator(dash+' .side-btn.on').first().evaluate(b=>b.dataset.dashSection||b.dataset.adminSection),tab);
    return text;
  }
  for(const link of links){
    if(width<600){await page.locator('#nav-right #guidcy-dashboard-btn').click();await page.locator(dash+' .dash-side.on').waitFor()}
    await page.locator(dash+' .side-btn[data-dash-section="'+link.tab+'"],'+dash+' .side-btn[data-admin-section="'+link.tab+'"]').first().click();
    await settled(link.tab);
    console.log(role,width,link.tab,'render passed');
    if(!link.tab.startsWith('marketplace')){await page.reload();await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await settled(link.tab)}
    if(link.tab.startsWith('marketplace')){
      for(let i=0;i<3;i++){await page.reload();await page.waitForFunction(()=>window.__guidcyAuthReadyFired);await settled(link.tab)}
      await page.evaluate(()=>window.guidcyNavigate('/about'));await page.goBack();await settled(link.tab);
      await page.goForward();await page.locator('#page-about.on').waitFor();await page.goBack();await settled(link.tab);
    }
  }
  const finalTabs=await page.locator(dash+' .side-btn').evaluateAll(bs=>bs.map(b=>b.dataset.dashSection||b.dataset.adminSection).filter(Boolean));
  assert.deepEqual([...new Set(finalTabs)].sort(),[...new Set(links.map(l=>l.tab))].sort(),'all dynamically registered tabs included');
  assert.deepEqual(errors,[],role+' runtime errors');
  console.log(role,width,links.length,'dashboard tabs passed');await context.close();
 }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
