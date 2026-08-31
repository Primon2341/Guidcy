const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', 'public');
const port = 3049;
let activeServer;
let activeBrowser;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml'
};

function serve(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
  let file = path.join(root, pathname.replace(/^\/+/, ''));
  if (pathname === '/') file = path.join(root, 'index.html');
  else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  else if (!fs.existsSync(file)) file = path.join(root, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, {'content-type': mime[ext] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}

const fakeSupabase = `
(function(){
  var now=new Date(); now.setDate(now.getDate()+2);
  var dateKey=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  var consultant={id:'test-expert',profile_id:'expert-profile',name:'Test Expert',specialty:'Career Coach',category:'Technology, Startup, R&D',bio:'Browser verification consultant.',highest_education:'MBA',college:'Test University',current_work:'Career Coach',current_company_college:'Guidcy Technologies',approval_status:'approved',is_approved:true,is_active:true,video_price:1000,audio_price:750,chat_price:500,rate:1000,session_types:['video'],availability_map:{},available_days:[],slots:['10:00 AM']};
  var misleadingCategoryConsultant={id:'test-finance-expert',profile_id:'finance-profile',name:'Finance Expert',specialty:'Content Creation Advisor',category:'Finance',bio:'Registered only for finance consultancy.',approval_status:'approved',is_approved:true,is_active:true,rate:800,session_types:['video'],availability_map:{},available_days:[],slots:['11:00 AM']};
  var educationConsultant={id:'test-education-expert',profile_id:'education-profile',name:'Education Expert',specialty:'Academic Mentor',category:'Education',bio:'Registered only for education consultancy.',approval_status:'approved',is_approved:true,is_active:true,rate:900,session_types:['video'],availability_map:{},available_days:[],slots:['12:00 PM']};
  consultant.availability_map[dateKey]=['10:00 AM','2:00 PM'];
  var user={id:'test-user',email:'user@example.com',user_metadata:{full_name:'Test User',role:'user'}};
  var profile={id:user.id,email:user.email,full_name:'Test User',role:'user',avatar_initials:'TU'};
  var consultantAvatar='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Crect width=%22120%22 height=%22120%22 fill=%22%231E72BE%22/%3E%3Ccircle cx=%2260%22 cy=%2245%22 r=%2224%22 fill=%22white%22/%3E%3Cpath d=%22M20 115c6-31 25-45 40-45s34 14 40 45%22 fill=%22white%22/%3E%3C/svg%3E';
  var expertPublicProfile={id:'expert-profile',email:'expert@example.com',full_name:'Test Expert',role:'consultant',avatar_initials:'TE',avatar_url:consultantAvatar,current_work:'Career Coach',current_company_college:'Guidcy Technologies'};
  var financePublicProfile={id:'finance-profile',email:'finance@example.com',full_name:'Finance Expert',role:'consultant'};
  var educationPublicProfile={id:'education-profile',email:'education@example.com',full_name:'Education Expert',role:'consultant'};
  var work={id:'role-1',title:'Verified Test Careers Opening',company_name:'Guidcy Technologies Pvt. Ltd.',employer_name:'Guidcy Technologies Pvt. Ltd.',category:'Engineering',work_type:'Full-time',work_mode:'Remote',description:'Browser verification careers listing.',required_skills:'Writing, Research',experience_level:'Fresher',duration:'1 month',pay_type:'Fixed',min_budget:5000,max_budget:8000,currency:'₹',payment_frequency:'After completion',status:'approved',verification_status:'verified',is_featured:false,is_urgent:false,applicants_count:0,openings:1,created_at:new Date().toISOString()};
  var purchasedNote={id:'note-legacy-1',title:'Purchased Test Notes',category:'Career',uploader_name:'Test Seller',status:'active',price:199,is_free:false,created_at:new Date().toISOString()};
  var legacyOrder={id:'order-legacy-1',note_id:purchasedNote.id,buyer_id:'',buyer_email:'user@example.com',note_title:purchasedNote.title,note_category:purchasedNote.category,price:199,payment_status:'success',order_status:'completed',payment_verified:true,download_granted:false,created_at:new Date().toISOString()};
  var payoutBookings=[
    {id:'booking-weekly-1',consultant_id:consultant.id,consultant_name:consultant.name,consultant_email:'expert@example.com',payment_status:'paid',payment_verified:true,payment_amount:100,payout_status:'pending',created_at:new Date().toISOString()},
    {id:'booking-weekly-2',consultant_id:consultant.id,consultant_name:consultant.name,consultant_email:'expert@example.com',payment_status:'success',payment_verified:true,payment_amount:200,payout_status:'pending',created_at:new Date().toISOString()},
    {id:'booking-weekly-paid',consultant_id:consultant.id,consultant_name:consultant.name,consultant_email:'expert@example.com',payment_status:'paid',payment_verified:true,payment_amount:100,payout_status:'paid',created_at:new Date().toISOString()}
  ];
  var bank={id:'bank-1',consultant_id:consultant.id,account_holder_name:'Test Expert',bank_name:'Test Bank',account_number:'1234567890',ifsc_code:'TEST0001234',upi_id:'expert@test',payout_preference:'bank_transfer',is_verified:true,updated_at:new Date().toISOString()};
  var payoutLogs=[];
  window.__guidcyTestDisputes=[];
  window.__guidcyBookingReadCount=0;
  window.__guidcyTestBookings=payoutBookings;
  function rows(table){
    if(table==='consultants')return [consultant,misleadingCategoryConsultant,educationConsultant];
    if(table==='profiles'){
      var profiles=[profile,expertPublicProfile,financePublicProfile,educationPublicProfile];
      if(window.__guidcyTestProfile){
        profiles=profiles.filter(function(row){return String(row.id)!==String(window.__guidcyTestProfile.id)});
        profiles.push(window.__guidcyTestProfile);
      }
      return profiles;
    }
    if(table==='job_posts')return [work];
    if(table==='marketplace_orders')return [legacyOrder];
    if(table==='marketplace_notes')return [purchasedNote];
    if(table==='bookings')return payoutBookings;
    if(table==='consultant_bank_details')return [bank];
    if(table==='consultant_payout_logs')return payoutLogs;
    if(table==='disputes')return window.__guidcyTestDisputes;
    return [];
  }
  function query(table){
    var q={}, filters=[], maxRows=null, mutation=null, mutationValue=null;
    q.select=function(){return q};
    q.eq=function(field,value){filters.push(function(row){return String(row&&row[field])===String(value)});return q};
    q.neq=function(field,value){filters.push(function(row){return String(row&&row[field])!==String(value)});return q};
    q.in=function(field,values){filters.push(function(row){return (values||[]).map(String).includes(String(row&&row[field]))});return q};
    q.ilike=function(field,value){var wanted=String(value||'').replace(/%/g,'').toLowerCase();filters.push(function(row){return String(row&&row[field]||'').toLowerCase().includes(wanted)});return q};
    q.not=function(field,operator,value){if(operator==='is'&&value===null)filters.push(function(row){return row&&row[field]!=null});return q};
    q.limit=function(value){maxRows=Number(value);return q};
    q.update=function(value){mutation='update';mutationValue=value||{};return q};
    q.insert=function(value){mutation='insert';mutationValue=Array.isArray(value)?value:[value];return q};
    ['gte','lte','gt','lt','or','order','range','filter','match','contains','upsert','delete'].forEach(function(k){q[k]=function(){return q}});
    function result(){
      var out=rows(table).filter(function(row){return filters.every(function(fn){return fn(row)})});
      if(table==='bookings'&&!mutation)window.__guidcyBookingReadCount++;
      if(mutation==='update')out.forEach(function(row){Object.assign(row,mutationValue)});
      if(mutation==='insert'){
        if(table==='consultant_payout_logs')mutationValue.forEach(function(row){payoutLogs.push(Object.assign({id:'log-'+(payoutLogs.length+1)},row))});
        if(table==='bookings')mutationValue=mutationValue.map(function(row){var saved=Object.assign({id:'booking-test-'+(payoutBookings.length+1),created_at:new Date().toISOString()},row);payoutBookings.push(saved);return saved});
        out=mutationValue;
      }
      return Number.isFinite(maxRows)?out.slice(0,maxRows):out
    }
    q.single=function(){return Promise.resolve({data:result()[0]||null,error:null})};
    q.maybeSingle=q.single;
    q.then=function(resolve,reject){var data=result();return Promise.resolve({data:data,error:null,count:data.length}).then(resolve,reject)};
    q.catch=function(fn){return Promise.resolve({data:result(),error:null}).catch(fn)};
    return q;
  }
  window.supabase={createClient:function(){return {
    auth:{getSession:function(){return new Promise(function(resolve){setTimeout(function(){resolve({data:{session:{user:window.__guidcyTestAuthUser||user,access_token:'test-token'}}})},Number(localStorage.getItem('__guidcy_test_session_delay')||0))})},getUser:function(){return Promise.resolve({data:{user:window.__guidcyTestAuthUser||user}})},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:function(){return Promise.resolve({error:null})},signInWithPassword:function(){var active=window.__guidcyTestAuthUser||user;return Promise.resolve({data:{user:active,session:{user:active}},error:null})}},
    from:function(table){return query(table)},rpc:function(){return Promise.resolve({data:[],error:null})},storage:{from:function(){return {download:function(){return Promise.resolve({data:null,error:new Error('not used')})}}}}
  }}};
})();`;

(async () => {
  const server = http.createServer(serve);
  activeServer = server;
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless: true});
  activeBrowser = browser;
  // A brand-new context opening Careers directly must render positions without
  // relying on an earlier page visit or browser cache.
  const coldContext = await browser.newContext({viewport: {width: 1365, height: 900}});
  await coldContext.route('**/assets/vendor/supabase.js*', route => route.fulfill({status: 200, contentType: 'text/javascript', body: fakeSupabase}));
  await coldContext.route('https://api.tavily.com/search', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({results:[]})}));
  const coldPage = await coldContext.newPage();
  const coldRequests = [];
  coldPage.on('request', request => coldRequests.push(request.url()));
  const coldStarted = Date.now();
  await coldPage.goto(`http://127.0.0.1:${port}/careers`, {waitUntil: 'domcontentloaded'});
  await coldPage.waitForSelector('#page-careers.on .gc-job', {timeout: 15000});
  const coldCareerReadyMs = Date.now() - coldStarted;
  assert.match(await coldPage.locator('#gc-list').innerText(), /Verified Test Careers Opening/);
  assert.ok(coldRequests.some(url => /\/assets\/vendor\/supabase\.js/.test(url)));
  assert.equal(coldRequests.some(url => /cdn\.jsdelivr\.net\/npm\/@supabase/i.test(url)), false);
  await coldContext.close();
  console.log('step-careers-fresh-window-passed', coldCareerReadyMs+'ms');

  const context = await browser.newContext({viewport: {width: 1365, height: 900}});
  await context.addInitScript(() => {
    const state=window.__guidcyVisualStability={activePageTransitions:[],pageAnimationStarts:[],profileWorkChanges:[],footerReadyLosses:0};
    let lastActive='',lastProfileWork='',footerWasReady=false;
    function sample(){
      const active=document.querySelector('.page.on,.page.active');
      const id=active?.id||'';
      if(id!==lastActive){state.activePageTransitions.push(id);lastActive=id;}
      const work=(document.querySelector('#page-profile .guidcy-profile-work-company')?.textContent||'').trim();
      if(work&&work!==lastProfileWork){state.profileWorkChanges.push(work);lastProfileWork=work;}
      const ready=!!document.body?.classList.contains('guidcy-footer-ready');
      if(footerWasReady&&!ready)state.footerReadyLosses++;
      if(ready)footerWasReady=true;
    }
    new MutationObserver(sample).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
    document.addEventListener('animationstart',event=>{
      if(event.target?.classList?.contains('page'))state.pageAnimationStarts.push(event.target.id||'page');
    },true);
  });
  await context.route('**/assets/vendor/supabase.js*', route => route.fulfill({status: 200, contentType: 'text/javascript', body: fakeSupabase}));
  await context.route('https://api.tavily.com/search', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({results:[]})}));
  const page = await context.newPage();
  const fatal = [];
  page.on('pageerror', error => fatal.push(String(error)));

  await page.goto(`http://127.0.0.1:${port}/consultant/test-expert`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-profile.on .profile-name', {timeout: 15000});
  await page.waitForURL(/\/consultant\/test-expert$/, {timeout: 10000});
  await page.waitForTimeout(350);
  assert.equal((await page.locator('.profile-name').first().innerText()).trim(), 'Test Expert');
  assert.equal((await page.locator('.guidcy-profile-work-company').innerText()).trim(), 'Career Coach, Guidcy Technologies');
  await page.waitForSelector('#page-profile .profile-avatar.has-photo img', {timeout: 10000});
  const profileAvatar=await page.locator('#page-profile .profile-avatar.has-photo img').evaluate(img=>({src:img.getAttribute('src')||'',width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,fit:getComputedStyle(img).objectFit}));
  assert.match(profileAvatar.src, /^data:image\/svg\+xml/);
  assert.ok(profileAvatar.width>60&&profileAvatar.height>60);
  assert.equal(profileAvatar.fit,'cover');
  const profileWorkStyle=await page.locator('.guidcy-profile-work-company').evaluate(el=>({color:getComputedStyle(el).color,weight:Number(getComputedStyle(el).fontWeight)}));
  assert.equal(profileWorkStyle.color, 'rgb(30, 114, 190)');
  assert.ok(profileWorkStyle.weight>=700);
  await page.waitForTimeout(900);
  assert.deepEqual((await page.evaluate(()=>window.__guidcyVisualStability.profileWorkChanges)), ['Career Coach, Guidcy Technologies']);
  assert.match(page.url(), /\/consultant\/test-expert$/);
  assert.ok((await page.locator('body').innerText()).trim().length > 500);
  assert.doesNotMatch(await page.locator('#toastbar').innerText().catch(() => ''), /availability has already passed/i);
  assert.equal(await page.evaluate(() => {
    const active=document.querySelector('#page-profile.on'),footer=document.querySelector('.footer');
    return !!(active&&footer&&(active.compareDocumentPosition(footer)&Node.DOCUMENT_POSITION_FOLLOWING));
  }), true);
  assert.ok(await page.evaluate(() => document.querySelector('.footer')?.getBoundingClientRect().height || 0) > 100);
  await page.screenshot({path: path.join(root, '..', 'tests', 'profile-desktop.png'), fullPage: true});

  await page.locator('.avail-slot').first().click();
  await page.getByRole('button', {name: 'Book this session'}).click();
  await page.waitForSelector('#page-payment.on', {timeout: 10000});
  assert.equal(new URL(page.url()).pathname, '/payment');
  assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('.page.on,.page.active')).map(page => page.id)), ['page-payment']);
  assert.match(await page.locator('#pay-desc').innerText(), /Test Expert/);
  assert.doesNotMatch(await page.locator('#page-payment .green-btn').innerText(), /Back to profile/i);
  await page.waitForFunction(() => {
    const active=document.querySelector('#page-payment.on'), footer=document.querySelector('.footer');
    return !!(active&&footer&&(active.compareDocumentPosition(footer)&Node.DOCUMENT_POSITION_FOLLOWING));
  }, null, {timeout: 5000});
  const footerAfterPayment = await page.evaluate(() => {
    const active=document.querySelector('#page-payment.on'), footer=document.querySelector('.footer');
    return !!(active&&footer&&(active.compareDocumentPosition(footer)&Node.DOCUMENT_POSITION_FOLLOWING));
  });
  assert.equal(footerAfterPayment, true);
  console.log('step-payment-transition-passed');

  // Simulate the real mobile cold-refresh race: sessionStorage may be absent
  // and Supabase auth can finish well after the route renders. The durable
  // payment context must still restore the slot before checkout validation.
  await page.evaluate(() => {
    localStorage.setItem('__guidcy_test_session_delay', '2200');
    sessionStorage.removeItem('guidcy_booking_price_lock_v3');
  });
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-payment.on', {timeout: 10000});
  await page.waitForTimeout(3600);
  assert.match(await page.locator('#pay-desc').innerText(), /Test Expert/);
  assert.doesNotMatch(await page.locator('#page-payment .green-btn').innerText(), /Back to profile/i);
  assert.doesNotMatch(await page.locator('#toastbar').innerText().catch(() => ''), /please select (?:a )?time slot/i);
  assert.equal(await page.evaluate(() => window.selSlot), '10:00 AM');
  assert.equal(await page.evaluate(() => !!JSON.parse(localStorage.getItem('guidcy_booking_payment_context_v4')||'null')?.timeSlot), true);
  const refreshVisualStability=await page.evaluate(() => window.__guidcyVisualStability);
  assert.equal(refreshVisualStability.footerReadyLosses, 0, 'footer must not disappear again after first paint');
  assert.ok(refreshVisualStability.pageAnimationStarts.filter(id => id==='page-payment').length <= 1, 'payment page must not replay its entrance animation during refresh restoration');
  assert.ok(refreshVisualStability.activePageTransitions.filter(id => id==='page-payment').length <= 1, 'payment page must activate only once during refresh restoration');
  await page.screenshot({path: path.join(root, '..', 'tests', 'payment-refresh-desktop.png'), fullPage: true});
  await page.locator('#page-payment .green-btn').click();
  await page.waitForTimeout(250);
  assert.doesNotMatch(await page.locator('#toastbar').innerText().catch(() => ''), /please select (?:a )?time slot/i);
  await page.evaluate(() => localStorage.removeItem('__guidcy_test_session_delay'));
  assert.equal(await page.evaluate(() => !!(document.querySelector('#page-payment.on').compareDocumentPosition(document.querySelector('.footer'))&Node.DOCUMENT_POSITION_FOLLOWING)), true);
  console.log('step-payment-refresh-passed');

  await page.evaluate(() => {sessionStorage.removeItem('guidcy_booking_price_lock_v3'); sessionStorage.removeItem('guidcy_last_consultant_id')});
  await page.goto(`http://127.0.0.1:${port}/book/test-expert`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-profile.on .profile-name', {timeout: 10000});
  await page.waitForTimeout(700);
  assert.doesNotMatch(await page.locator('#toastbar').innerText().catch(() => ''), /availability has already passed/i);
  assert.equal(await page.locator('#page-login.on').count(), 0);
  console.log('step-book-deeplink-passed');

  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-home.on', {timeout: 10000});
  const navigationEntriesBefore = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  await page.locator('#mobile-burger').click();
  await page.waitForSelector('#gmob-drawer.open', {timeout: 5000});
  await page.waitForTimeout(450);
  const categoriesItem=page.locator('#gmob-drawer .gmob-item').filter({hasText:'Categories'});
  await categoriesItem.scrollIntoViewIfNeeded();
  await categoriesItem.click();
  await page.waitForSelector('#page-categories.on', {timeout: 10000});
  assert.equal(new URL(page.url()).pathname, '/categories');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), navigationEntriesBefore);
  assert.equal(await page.locator('#gmob-drawer.open').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true);
const categoryCards=page.locator('.guidcy-final-cat-card');
assert.equal(await categoryCards.count(), 33);
await categoryCards.last().scrollIntoViewIfNeeded();
assert.match(await categoryCards.last().innerText(), /Content Creation/);
await page.screenshot({path: path.join(root, '..', 'tests', 'mobile-categories.png'), fullPage: true});
async function verifyRegisteredCategory(category,expectedNames){
  await page.evaluate(value=>window.filterAndBrowse(value),category);
  await page.waitForSelector('#page-browse.on', {timeout: 10000});
  await page.waitForFunction(({category,count})=>{
    const checked=Array.from(document.querySelectorAll('#filter-cat-list input:checked')).map(input=>input.value);
    const cards=document.querySelectorAll('#browse-grid .ccard').length;
    const empty=/No (?:verified )?consultants found/i.test(document.querySelector('#browse-grid')?.textContent||'');
    return window.browseFilters?.categories?.[0]===category&&checked.includes(category)&&(cards===count||(count===0&&empty));
  },{category,count:expectedNames.length},{timeout:10000});
  await page.waitForFunction(expected=>{
    const names=Array.from(document.querySelectorAll('#browse-grid .ccard .c-name')).map(node=>(node.textContent||'').trim()).filter(Boolean).sort();
    return JSON.stringify(names)===JSON.stringify(expected.slice().sort());
  },expectedNames,{timeout:10000});
  const names=await page.locator('#browse-grid .ccard .c-name').evaluateAll(nodes=>nodes.map(node=>(node.textContent||'').trim()).filter(Boolean));
  assert.deepEqual(names.sort(),expectedNames.slice().sort(),category+' must use only registered consultant mappings');
  assert.deepEqual(await page.evaluate(()=>({lexicalCategories:window.browseFilters.categories,checked:Array.from(document.querySelectorAll('#filter-cat-list input:checked')).map(input=>input.value)})),{lexicalCategories:[category],checked:[category]});
  await page.goBack();
  await page.waitForSelector('#page-categories.on', {timeout:10000});
}
await verifyRegisteredCategory('Technology',['Test Expert']);
await verifyRegisteredCategory('Startup',['Test Expert']);
await verifyRegisteredCategory('R&D',['Test Expert']);
await verifyRegisteredCategory('Finance',['Finance Expert']);
await verifyRegisteredCategory('Education',['Education Expert']);
await verifyRegisteredCategory('Content Creation',[]);
for(const width of [390,820,1365]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>window.filterAndBrowse('Technology'));
  await page.waitForSelector('#page-browse.on #browse-grid .ccard .c-avatar.has-photo img',{timeout:10000});
  const cardAvatar=await page.locator('#browse-grid .ccard .c-avatar.has-photo img').first().evaluate(img=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,display:getComputedStyle(img).display,fit:getComputedStyle(img).objectFit}));
  assert.ok(cardAvatar.width>40&&cardAvatar.height>40,'card avatar must be visible at '+width+'px');
  assert.equal(cardAvatar.display,'block');
  assert.equal(cardAvatar.fit,'cover');
  await page.goBack();
  await page.waitForSelector('#page-categories.on',{timeout:10000});
}
await page.setViewportSize({width:390,height:844});
await page.evaluate(() => window.go('blog'));
  await page.waitForSelector('#page-blog.on', {timeout: 10000});
  assert.equal(new URL(page.url()).pathname, '/blog');
  await page.goBack();
  await page.waitForSelector('#page-categories.on', {timeout: 10000});
  assert.equal(new URL(page.url()).pathname, '/categories');
  await page.goBack();
  await page.waitForSelector('#page-home.on', {timeout: 10000});
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), navigationEntriesBefore);
  console.log('step-mobile-navigation-passed');

  await page.setViewportSize({width: 1365, height: 900});
  await page.goto(`http://127.0.0.1:${port}/funds-grants`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-opportunities.on', {timeout: 10000});
  await page.waitForTimeout(800);
  assert.doesNotMatch(await page.locator('#page-opportunities').innerText(), /Search for (?:Funds & Grants Finder|Opportunities)/i);
  assert.equal(await page.locator('#opp-results-area [style*="dashed"]').count(), 0);
  console.log('step-funds-empty-section-removed');

  await page.goto(`http://127.0.0.1:${port}/find-jobs`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-jobs.on', {timeout: 10000});
  assert.equal(await page.locator('#page-jobs.on #jobs-main-area').count(), 1);
  await page.waitForTimeout(500);
  assert.doesNotMatch(await page.locator('#page-jobs').innerText(), /Search for any job role above/i);
  console.log('step-jobs-empty-section-removed');

  await page.goto(`http://127.0.0.1:${port}/careers`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-careers.on .gc-job', {timeout: 15000});
  assert.match(await page.locator('#gc-list').innerText(), /Verified Test Careers Opening/);
  assert.equal(await page.locator('#gc-list .gc-skel').count(), 0);
  // posting stays admin-only: a signed-in non-admin must never see the post/manage controls
  assert.equal(await page.locator('#gc-admin-bar [data-gc="new"]').count(), 0);
  assert.equal(await page.locator('#page-careers .gc-admin-row').count(), 0);
  // the page is reachable from the footer only, never the header or mobile menu
  assert.equal(await page.locator('#nav-links .nav-link', {hasText: /^Find Work$/}).count(), 0);
  assert.equal(await page.locator('.gmob-item', {hasText: /Find Work/}).count(), 0);
  assert.equal(await page.locator('.footer a[href="/careers"]').count(), 1);
  await page.screenshot({path: path.join(root, '..', 'tests', 'careers-desktop.png'), fullPage: true});
  console.log('step-careers-hydration-passed');

  // legacy /find-work links must resolve to the careers page
  await page.goto(`http://127.0.0.1:${port}/find-work`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-careers.on', {timeout: 15000});
  assert.equal(await page.locator('#page-work').count(), 0);
  console.log('step-legacy-find-work-redirect-passed');

  await page.goto(`http://127.0.0.1:${port}/dashboard?tab=marketplace`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-user-dash.on', {timeout: 10000});
  await page.waitForFunction(() => window.GuidcyMarketplace && typeof window.swUD === 'function', null, {timeout: 10000});
  await page.evaluate(() => window.swUD('marketplace', null));
  await page.waitForFunction(() => /Purchased Test Notes/.test(document.querySelector('#udash-main')?.textContent||''), null, {timeout: 10000});
  assert.match(await page.locator('#udash-main').innerText(), /Purchased Test Notes/);
  assert.doesNotMatch(await page.locator('#udash-main').innerText(), /No purchased notes yet/i);
  await page.screenshot({path: path.join(root, '..', 'tests', 'purchased-notes-desktop.png'), fullPage: true});
  console.log('step-purchased-notes-legacy-order-passed');

  await page.evaluate(() => window.guidcyRenderDisputesFromSupabase());
  await page.waitForFunction(() => /No disputes in Supabase/.test(document.querySelector('#adash-main')?.textContent||''), null, {timeout: 10000});
  assert.match((await page.locator('#adash-main').innerText()).replace(/\s+/g,''), /0TotalfromSupabase/);
  console.log('step-supabase-only-empty-disputes-passed');

  const meetingPolicy=await page.evaluate(() => ({
    validator:typeof window.guidcyIsGoogleMeetLink,
    acceptsGoogle:window.guidcyIsGoogleMeetLink('https://meet.google.com/abc-defg-hij'),
    rejectsOther:window.guidcyIsGoogleMeetLink('https://example.com/room')
  }));
  assert.deepEqual(meetingPolicy,{validator:'function',acceptsGoogle:true,rejectsOther:false});
  console.log('step-google-meet-only-policy-passed');

  await page.setViewportSize({width:390,height:500});
  const payoutScrollState=await page.evaluate(() => {
    window.scrollTo(0,Math.min(260,Math.max(0,document.documentElement.scrollHeight-window.innerHeight)));
    const before=window.scrollY;
    window.__guidcyConsultantPayoutGroups=[{id:'modal-scroll-test',pending:255,paid:85,pendingBookings:12,name:'Test Expert',bank:{payout_preference:'bank_transfer',account_holder_name:'Test Expert',bank_name:'Test Bank',account_number:'1234567890',ifsc_code:'TEST0001234',upi_id:'expert@test',is_verified:true}}];
    window.guidcyOpenConsultantBatchPayout('modal-scroll-test');
    const modal=document.getElementById('guidcy-consultant-batch-modal');
    const card=modal&&modal.querySelector('.guidcy-session-modal');
    if(card)card.scrollTop=120;
    return {before,bodyLocked:document.body.classList.contains('guidcy-payout-modal-scroll-lock'),htmlLocked:document.documentElement.classList.contains('guidcy-payout-modal-scroll-lock'),bodyPosition:getComputedStyle(document.body).position,cardOverflow:card&&getComputedStyle(card).overflowY,cardScrolled:card&&card.scrollTop>0,bodyTop:document.body.style.top};
  });
  assert.equal(payoutScrollState.bodyLocked,true);
  assert.equal(payoutScrollState.htmlLocked,true);
  assert.equal(payoutScrollState.bodyPosition,'fixed');
  assert.equal(payoutScrollState.cardOverflow,'auto');
  assert.equal(payoutScrollState.cardScrolled,true);
  assert.equal(payoutScrollState.bodyTop,`-${payoutScrollState.before}px`);
  await page.evaluate(() => window.guidcyCloseConsultantBatchPayout());
  assert.equal(await page.evaluate(() => document.body.classList.contains('guidcy-payout-modal-scroll-lock')),false);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('guidcy-payout-modal-scroll-lock')),false);
  assert.equal(await page.evaluate(() => document.getElementById('guidcy-consultant-batch-modal')===null),true);
  console.log('step-payout-modal-scroll-lock-passed');

  assert.equal(await page.locator('#page-become').count(), 0);
  assert.equal(await page.locator('a[href="/become"],a[href="/become-a-consultant"]').count(), 0);
  assert.doesNotMatch(await page.locator('.footer').innerText(), /Join as Expert/i);
  console.log('step-join-expert-removed');

  // Dynamic admin buttons are created with onclick closures whose source only
  // says swAD(view,this). The router must use data-admin-section so a late
  // approval render cannot pull Payouts or Webinar Registrations backward.
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(() => {
    const admin={id:'test-admin',email:'tripathiprakhar41@gmail.com',user_metadata:{full_name:'Test Admin',role:'admin'}};
    const adminProfile={id:admin.id,email:admin.email,full_name:'Test Admin',role:'admin',is_admin:true};
    window.__guidcyTestAuthUser=admin; window.__guidcyTestProfile=adminProfile;
    window.currentUser=admin; window.currentProfile=adminProfile; window.loggedIn='admin';
    try{currentUser=admin}catch(_){} try{currentProfile=adminProfile}catch(_){}
    window.__GUIDCY_SET_ROUTE_INTENT_V6__?.('/admin-dashboard?tab=overview');
    history.replaceState({page:'admin-dash',tab:'overview'},'','/admin-dashboard?tab=overview');
    window.renderPage('admin-dash');
    window.__GUIDCY_LAST_POINTER_AT_V6__=Date.now();
    window.swAD('overview',document.querySelector('#page-admin-dash [data-admin-section="overview"]'));
  });
await page.waitForSelector('#page-admin-dash.on [data-admin-section="payouts"]', {timeout:10000});
await page.locator('#page-admin-dash [data-admin-section="payouts"]').click();
await page.waitForFunction(() => new URLSearchParams(location.search).get('tab')==='payouts' && /Consultant Payouts/i.test(document.querySelector('#adash-main .dash-title')?.textContent||''), null, {timeout:10000});
  await page.waitForTimeout(500);
assert.equal(new URL(page.url()).searchParams.get('tab'),'payouts');
assert.match(await page.locator('#adash-main .dash-title').innerText(),/Consultant Payouts/i);
await page.waitForSelector('#page-admin-dash [data-admin-section="webinar-registrations"]', {timeout:10000});
await page.locator('#page-admin-dash [data-admin-section="webinar-registrations"]').click();
await page.waitForFunction(() => location.pathname==='/admin/webinar-registrations' && /Webinar Registrations/i.test(document.querySelector('#adash-main .dash-title')?.textContent||''), null, {timeout:10000});
await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).pathname,'/admin/webinar-registrations');
  assert.match(await page.locator('#adash-main .dash-title').innerText(),/Webinar Registrations/i);
  console.log('step-dynamic-admin-routes-stable');

  await page.setViewportSize({width:390,height:844});
  await page.goto(`http://127.0.0.1:${port}/dashboard?tab=upcoming`, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#page-user-dash.on', {timeout:10000});
  await page.locator('#mobile-burger').click();
  await page.waitForSelector('#gmob-drawer.open', {timeout:5000});
  await page.evaluate(() => window.toggleDashMenu('user'));
  assert.equal(await page.locator('#gmob-drawer.open').count(), 0);
  assert.equal(await page.locator('#page-user-dash .dash-side.on').count(), 1);
  await page.evaluate(() => window.openMobDrawer());
  assert.equal(await page.locator('#page-user-dash .dash-side.on').count(), 0);
  assert.equal(await page.locator('#gmob-drawer.open').count(), 1);
  await page.evaluate(() => window.closeMobDrawer());
  console.log('step-mobile-drawers-mutually-exclusive');

  assert.deepEqual(fatal, []);
  console.log(JSON.stringify({
    passed: true,
    checks: ['careers direct fresh-window hydration', 'profile deep-link', 'stable current work and company', 'booking without repeat login', 'payment footer order', 'cold payment refresh with lost sessionStorage and delayed auth', 'single stable payment refresh paint', 'Pay after refresh without slot prompt', 'no false expired warning', 'stepwise Back navigation', 'mobile SPA navigation', 'mobile overflow', 'mobile drawers mutually exclusive', 'funds empty section removed', 'jobs empty section removed', 'careers hydration', 'careers posting is admin-only', 'careers reachable from footer only', 'legacy find-work redirect', 'legacy purchased notes visible', 'Supabase-only empty disputes', 'Google Meet-only policy', 'payout modal scroll lock', 'join expert page and links removed', 'dynamic admin payout/webinar routes'],
    screenshots: ['tests/profile-desktop.png','tests/payment-refresh-desktop.png','tests/mobile-categories.png','tests/careers-desktop.png','tests/purchased-notes-desktop.png']
  }, null, 2));
  await browser.close();
  activeBrowser = null;
  await new Promise(resolve => server.close(resolve));
  activeServer = null;
})().catch(async error => {
  console.error(error && error.stack || error);
  try{if(activeBrowser)await activeBrowser.close()}catch(_){}
  try{if(activeServer)await new Promise(resolve => activeServer.close(resolve))}catch(_){}
  process.exitCode = 1;
});
