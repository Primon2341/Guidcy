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
  var authCallbacks=[];
  var now=new Date(); now.setDate(now.getDate()+2);
  var dateKey=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  var consultant={id:'test-expert',profile_id:'expert-profile',name:'Test Expert',specialty:'Career Coach',category:'Career',bio:'Browser verification consultant.',highest_education:'MBA',college:'Test University',current_company_college:'Guidcy',approval_status:'approved',is_approved:true,is_active:true,video_price:1000,audio_price:750,chat_price:500,rate:1000,session_types:['video'],availability_map:{},available_days:[],slots:['10:00 AM']};
  consultant.availability_map[dateKey]=['10:00 AM','2:00 PM'];
  var user={id:'test-user',email:'user@example.com',user_metadata:{full_name:'Test User',role:'user'}};
  var profile={id:user.id,email:user.email,full_name:'Test User',role:'user',avatar_initials:'TU'};
  var career={id:'career-1',posted_by:'test-admin',posted_by_role:'admin',title:'Guidcy Operations Associate',company_name:'Guidcy Technologies Pvt. Ltd.',employer_name:'Guidcy Technologies Pvt. Ltd.',category:'Operations',work_type:'Full-time',work_mode:'Hybrid',description:'Help the Guidcy team deliver a reliable guidance experience.',responsibilities:'Coordinate operations and support quality.',required_skills:'Communication, Research, Operations',experience_level:'0–2 years',status:'approved',verification_status:'verified',is_featured:false,is_urgent:false,applicants_count:0,openings:1,created_at:new Date().toISOString()};
  var purchasedNote={id:'note-legacy-1',title:'Purchased Test Notes',category:'Career',uploader_name:'Test Seller',status:'active',price:199,is_free:false,created_at:new Date().toISOString()};
  var legacyOrder={id:'order-legacy-1',note_id:purchasedNote.id,buyer_id:'',buyer_email:'user@example.com',note_title:purchasedNote.title,note_category:purchasedNote.category,price:199,payment_status:'success',order_status:'completed',payment_verified:true,download_granted:false,created_at:new Date().toISOString()};
  function rows(table){
    if(table==='consultants')return [consultant];
    if(table==='profiles')return [profile];
    if(table==='job_posts')return [career];
    if(table==='marketplace_orders')return [legacyOrder];
    if(table==='marketplace_notes')return [purchasedNote];
    return [];
  }
  function query(table){
    var q={}, filters=[], maxRows=null;
    q.select=function(){return q};
    q.eq=function(field,value){filters.push(function(row){return String(row&&row[field])===String(value)});return q};
    q.neq=function(field,value){filters.push(function(row){return String(row&&row[field])!==String(value)});return q};
    q.in=function(field,values){filters.push(function(row){return (values||[]).map(String).includes(String(row&&row[field]))});return q};
    q.ilike=function(field,value){var wanted=String(value||'').replace(/%/g,'').toLowerCase();filters.push(function(row){return String(row&&row[field]||'').toLowerCase().includes(wanted)});return q};
    q.limit=function(value){maxRows=Number(value);return q};
    ['gte','lte','gt','lt','or','order','range','filter','match','contains','upsert','update','delete'].forEach(function(k){q[k]=function(){return q}});
    q.insert=function(payload){window.__fakeSupabaseInserts=window.__fakeSupabaseInserts||[];window.__fakeSupabaseInserts.push({table:table,payload:payload});return q};
    function result(){var out=rows(table).filter(function(row){return filters.every(function(fn){return fn(row)})});return Number.isFinite(maxRows)?out.slice(0,maxRows):out}
    q.single=function(){return Promise.resolve({data:result()[0]||null,error:null})};
    q.maybeSingle=q.single;
    q.then=function(resolve,reject){var data=result();return Promise.resolve({data:data,error:null,count:data.length}).then(resolve,reject)};
    q.catch=function(fn){return Promise.resolve({data:result(),error:null}).catch(fn)};
    return q;
  }
  window.__guidcyEmitAuthEvent=function(event){authCallbacks.slice().forEach(function(callback){try{callback(event,{user:user,access_token:'test-token'})}catch(error){setTimeout(function(){throw error},0)}})};
  window.supabase={createClient:function(){return {
    auth:{getSession:function(){return new Promise(function(resolve){setTimeout(function(){resolve({data:{session:{user:user,access_token:'test-token'}}})},Number(localStorage.getItem('__guidcy_test_session_delay')||0))})},getUser:function(){return Promise.resolve({data:{user:user}})},onAuthStateChange:function(callback){authCallbacks.push(callback);return {data:{subscription:{unsubscribe:function(){authCallbacks=authCallbacks.filter(function(item){return item!==callback})}}}}},signOut:function(){return Promise.resolve({error:null})},signInWithPassword:function(){return Promise.resolve({data:{user:user,session:{user:user}},error:null})}},
    from:function(table){return query(table)},storage:{from:function(){return {download:function(){return Promise.resolve({data:null,error:new Error('not used')})}}}}
  }}};
})();`;

(async () => {
  const server = http.createServer(serve);
  activeServer = server;
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless: true});
  activeBrowser = browser;
  const context = await browser.newContext({viewport: {width: 1365, height: 900}});
  await context.addInitScript(() => {
    const state=window.__guidcyVisualStability={activePageTransitions:[],pageAnimationStarts:[],footerReadyLosses:0};
    let lastActive='',footerWasReady=false;
    function sample(){
      const active=document.querySelector('.page.on,.page.active');
      const id=active?.id||'';
      if(id!==lastActive){state.activePageTransitions.push(id);lastActive=id;}
      const ready=!!document.body?.classList.contains('guidcy-footer-ready');
      if(footerWasReady&&!ready)state.footerReadyLosses++;
      if(ready)footerWasReady=true;
    }
    new MutationObserver(sample).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
    document.addEventListener('animationstart',event=>{
      if(event.target?.classList?.contains('page'))state.pageAnimationStarts.push(event.target.id||'page');
    },true);
  });
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js', route => route.fulfill({status: 200, contentType: 'text/javascript', body: fakeSupabase}));
  const page = await context.newPage();
  const fatal = [];
  page.on('pageerror', error => fatal.push(String(error)));

  await page.goto(`http://127.0.0.1:${port}/consultant/test-expert`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-profile.on .profile-name', {timeout: 15000});
  await page.waitForURL(/\/consultant\/test-expert$/, {timeout: 10000});
  await page.waitForTimeout(350);
  assert.equal((await page.locator('.profile-name').first().innerText()).trim(), 'Test Expert');
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
  // A recovered/refreshed signed-in session is background state, not a fresh
  // login submission. It must not consume stale return intent, open a
  // dashboard, repaint the page, or disturb the reader's scroll position.
  await page.evaluate(() => {
    sessionStorage.setItem('guidcy_pending_action', JSON.stringify({type:'dashboard',target:'user-dash',createdAt:Date.now()}));
    sessionStorage.setItem('guidcy_pending_route', '/dashboard?tab=upcoming');
    window.scrollTo(0, Math.min(700, document.documentElement.scrollHeight-window.innerHeight));
  });
  const publicPageBeforeAuthEvent=await page.evaluate(() => ({
    path:location.pathname,active:document.querySelector('.page.on,.page.active')?.id,
    scrollY:window.scrollY,transitions:window.__guidcyVisualStability.activePageTransitions.length,
    animations:window.__guidcyVisualStability.pageAnimationStarts.length
  }));
  await page.evaluate(() => {window.__guidcyEmitAuthEvent('SIGNED_IN');window.__guidcyEmitAuthEvent('TOKEN_REFRESHED')});
  await page.waitForTimeout(1800);
  const publicPageAfterAuthEvent=await page.evaluate(() => ({
    path:location.pathname,active:document.querySelector('.page.on,.page.active')?.id,
    scrollY:window.scrollY,transitions:window.__guidcyVisualStability.activePageTransitions.length,
    animations:window.__guidcyVisualStability.pageAnimationStarts.length
  }));
  assert.equal(publicPageAfterAuthEvent.path, publicPageBeforeAuthEvent.path);
  assert.equal(publicPageAfterAuthEvent.active, publicPageBeforeAuthEvent.active);
  assert.ok(Math.abs(publicPageAfterAuthEvent.scrollY-publicPageBeforeAuthEvent.scrollY)<3);
  assert.equal(publicPageAfterAuthEvent.transitions, publicPageBeforeAuthEvent.transitions);
  assert.equal(publicPageAfterAuthEvent.animations, publicPageBeforeAuthEvent.animations);
  await page.evaluate(() => {sessionStorage.removeItem('guidcy_pending_action');sessionStorage.removeItem('guidcy_pending_route')});
  await page.screenshot({path: path.join(root, '..', 'tests', 'mobile-categories.png'), fullPage: true});
  console.log('step-mobile-navigation-and-background-auth-stability-passed');

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

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const careerFooterLink=page.locator('.footer a[href="/careers"]').filter({hasText:/^Career$/});
  await careerFooterLink.click();
  await page.waitForURL(/\/careers$/, {timeout:10000});
  await page.waitForSelector('#page-careers.on .gcareer-card', {timeout: 15000});
  await page.waitForTimeout(180);
  assert.ok(await page.evaluate(() => window.scrollY) < 5, 'Clicking Career must open the page at the top');
  await page.waitForTimeout(550);
  assert.equal(await page.evaluate(() => {
    const bar=document.getElementById('guidcy-nav-loading-bar');
    return !bar||(!bar.classList.contains('on')&&!bar.classList.contains('finishing')&&parseFloat(bar.style.width||'0')===0);
  }), true, 'Career SPA navigation progress must finish after the page renders');
  assert.equal(await page.locator('.gcareer-hero-visual img').evaluate(img => img.complete && img.naturalWidth > 1000), true);
  assert.equal(await page.locator('.gcareer-culture-media img').evaluate(img => img.complete && img.naturalWidth > 1000), true);
  assert.match(await page.locator('#gcareer-list').innerText(), /Guidcy Operations Associate/);
  assert.doesNotMatch(await page.locator('#gcareer-list').innerText(), /Loading Guidcy careers/i);
  assert.equal(await page.locator('#nav-links button').filter({hasText:/^Careers?$/}).count(), 0);
  assert.equal(await page.locator('.footer-col').filter({has: page.getByRole('heading', {name:'Platform'})}).getByRole('link', {name:'Career', exact:true}).count(), 0);
  assert.equal(await page.locator('.footer-col').filter({has: page.getByRole('heading', {name:'Company'})}).getByRole('link', {name:'Career', exact:true}).count(), 1);
  assert.equal(await page.locator('.footer a[href="/careers"]').filter({hasText:/^Career$/}).count(), 1);
  assert.equal(await page.locator('#gcareer-post-btn:visible').count(), 0);
  await page.locator('#page-careers.on .gcareer-card').scrollIntoViewIfNeeded();
  const careerPopupBackgroundY=await page.evaluate(() => window.scrollY);
  await page.locator('#page-careers.on .gcareer-card button').filter({hasText:/View & Apply/}).click();
  await page.waitForSelector('.gcareer-modal.on .gcareer-dialog', {timeout:5000});
  await page.waitForFunction(() => document.body.classList.contains('guidcy-popup-scroll-locked'), null, {timeout:5000});
  const lockedBodyBeforeWheel=await page.evaluate(() => ({position:getComputedStyle(document.body).position,top:getComputedStyle(document.body).top}));
  await page.mouse.move(20, 120);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(150);
  const lockedBodyAfterWheel=await page.evaluate(() => ({position:getComputedStyle(document.body).position,top:getComputedStyle(document.body).top}));
  assert.equal(lockedBodyBeforeWheel.position, 'fixed');
  assert.deepEqual(lockedBodyAfterWheel, lockedBodyBeforeWheel, 'popup background must not move while scrolling');
  assert.equal(await page.locator('.gcareer-dialog').evaluate(dialog => {dialog.scrollTop=120;return dialog.scrollTop>0||dialog.scrollHeight<=dialog.clientHeight}), true, 'popup content must remain independently scrollable');
  await page.locator('.gcareer-modal.on .gcareer-close').click();
  await page.waitForFunction(() => !document.body.classList.contains('guidcy-popup-scroll-locked'), null, {timeout:5000});
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY))-careerPopupBackgroundY)<3, 'closing popup must restore the exact background position');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(900);
  assert.ok(await page.evaluate(() => window.scrollY) > 500, 'Careers page must remain scrollable and must not jump back to the top');
  await page.locator('.footer a[href="/careers"]').filter({hasText:/^Career$/}).click();
  await page.waitForTimeout(180);
  assert.ok(await page.evaluate(() => window.scrollY) < 5, 'Clicking Career again from the footer must return to the top');
  assert.equal(await page.evaluate(() => window.GuidcyCareers.openPost()), false);
  assert.equal(await page.locator('#gcareer-post-form').count(), 0);

  await page.evaluate(() => {window.currentProfile.role='admin';window.loggedIn='admin';window.GuidcyCareers.render()});
  await page.waitForSelector('#gcareer-post-btn:visible', {timeout: 5000});
  await page.locator('#gcareer-post-btn').click();
  await page.waitForSelector('#gcareer-post-form', {timeout: 5000});
  await page.locator('#gcareer-post-title').fill('Guidcy Test Administrator Role');
  await page.locator('#gcareer-post-department').fill('Operations');
  await page.locator('#gcareer-post-description').fill('A verified Guidcy test career description.');
  await page.locator('#gcareer-post-responsibilities').fill('Test the official Guidcy careers workflow.');
  await page.locator('#gcareer-post-skills').fill('Testing, Operations');
  await page.locator('#gcareer-post-form button[type="submit"]').click();
  await page.waitForFunction(() => (window.__fakeSupabaseInserts||[]).some(item => item.table==='job_posts'), null, {timeout: 5000});
  const careerInsert=await page.evaluate(() => (window.__fakeSupabaseInserts||[]).filter(item => item.table==='job_posts').at(-1).payload);
  assert.equal(careerInsert.posted_by_role, 'admin');
  assert.equal(careerInsert.status, 'approved');
  assert.equal(careerInsert.company_name, 'Guidcy Technologies Pvt. Ltd.');
  await page.waitForSelector('#page-careers.on .gcareer-card', {timeout:5000});
  await page.screenshot({path: path.join(root, '..', 'tests', 'careers-desktop.png'), fullPage: true});

  await page.setViewportSize({width:390,height:844});
  await page.goto(`http://127.0.0.1:${port}/careers`, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#page-careers.on .gcareer-card', {timeout:15000});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true);
  await page.locator('#mobile-burger').click();
  await page.waitForSelector('#gmob-drawer.open', {timeout:5000});
  assert.equal(await page.locator('#gmob-drawer .gmob-item').filter({hasText:/^Careers?$/}).count(), 0);
  await page.evaluate(() => {window.closeMobDrawer?.();window.closeMobileMenu?.()});
  await page.waitForFunction(() => !document.querySelector('#gmob-drawer.open'), null, {timeout:5000});
  assert.equal(await page.locator('.footer a[href="/careers"]').filter({hasText:/^Career$/}).count(), 1);
  await page.locator('#page-careers.on .gcareer-card').scrollIntoViewIfNeeded();
  const mobilePopupBackgroundY=await page.evaluate(() => window.scrollY);
  await page.locator('#page-careers.on .gcareer-card button').filter({hasText:/View & Apply/}).click();
  await page.waitForSelector('.gcareer-modal.on .gcareer-dialog', {timeout:5000});
  await page.waitForFunction(() => document.body.classList.contains('guidcy-popup-scroll-locked'), null, {timeout:5000});
  const mobileLockedTop=await page.evaluate(() => getComputedStyle(document.body).top);
  await page.mouse.move(12, 110);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).top), mobileLockedTop);
  await page.locator('.gcareer-modal.on .gcareer-close').click();
  await page.waitForFunction(() => !document.body.classList.contains('guidcy-popup-scroll-locked'), null, {timeout:5000});
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY))-mobilePopupBackgroundY)<3);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(900);
  assert.ok(await page.evaluate(() => window.scrollY) > 300, 'Mobile Careers must remain scrollable and must not jump back to the top');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'), true);
  await page.locator('#page-careers.on .gcareer-card').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({path: path.join(root, '..', 'tests', 'careers-mobile.png'), fullPage:true});

  await page.goto(`http://127.0.0.1:${port}/find-work`, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#page-work').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /Loading work opportunities/i);
  console.log('step-careers-admin-only-and-mobile-passed');

  await page.setViewportSize({width:1365,height:900});

  await page.goto(`http://127.0.0.1:${port}/dashboard?tab=marketplace`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#page-user-dash.on', {timeout: 10000});
  await page.waitForFunction(() => window.GuidcyMarketplace && typeof window.swUD === 'function', null, {timeout: 10000});
  await page.evaluate(() => window.swUD('marketplace', null));
  await page.waitForFunction(() => /Purchased Test Notes/.test(document.querySelector('#udash-main')?.textContent||''), null, {timeout: 10000});
  assert.match(await page.locator('#udash-main').innerText(), /Purchased Test Notes/);
  assert.doesNotMatch(await page.locator('#udash-main').innerText(), /No purchased notes yet/i);
  await page.screenshot({path: path.join(root, '..', 'tests', 'purchased-notes-desktop.png'), fullPage: true});
  console.log('step-purchased-notes-legacy-order-passed');

  assert.equal(await page.locator('#page-become').count(), 0);
  assert.equal(await page.locator('a[href="/become"],a[href="/become-a-consultant"]').count(), 0);
  assert.doesNotMatch(await page.locator('.footer').innerText(), /Join as Expert/i);
  console.log('step-join-expert-removed');

  assert.deepEqual(fatal, []);
  console.log(JSON.stringify({
    passed: true,
    checks: ['profile deep-link', 'booking without repeat login', 'payment footer order', 'cold payment refresh with lost sessionStorage and delayed auth', 'single stable payment refresh paint', 'Pay after refresh without slot prompt', 'no false expired warning', 'mobile SPA navigation', 'background auth events preserve public route, paint, and scroll', 'mobile overflow', 'funds empty section removed', 'jobs empty section removed', 'careers desktop and mobile rendering', 'careers original images load', 'Career footer click opens at top', 'Career SPA progress completes', 'Career is under Company only', 'desktop and mobile popup background scroll lock', 'popup scroll position restoration', 'careers footer-only navigation', 'careers desktop and mobile scroll stability', 'careers admin-only posting payload', 'former find-work route removed', 'legacy purchased notes visible', 'join expert page and links removed'],
    screenshots: ['tests/profile-desktop.png','tests/payment-refresh-desktop.png','tests/mobile-categories.png','tests/careers-desktop.png','tests/careers-mobile.png','tests/purchased-notes-desktop.png']
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
