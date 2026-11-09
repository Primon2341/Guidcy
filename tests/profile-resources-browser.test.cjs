const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const {chromium} = require('playwright');
const source = fs.readFileSync(path.join(__dirname, 'browser-flow.test.cjs'), 'utf8');
const start = source.indexOf('const fakeSupabase =');
let sdk = vm.runInNewContext(source.slice(start, source.indexOf('\n(async', start)) + '\nfakeSupabase');
sdk = sdk.replace("var consultant={", "var consultant={company_experience:[{company_name:'Guidcy',designation:'Consultant',start_date:'2024-01'}],")
  .replace("if(table==='job_posts')return [work];", "if(table==='webinars')return window.__webinars;if(table==='webinar_registrations')return window.__webinarRegs;if(table==='job_posts')return [work];")
  .replace("if(table==='marketplace_notes')return [purchasedNote];", "if(table==='marketplace_notes')return window.__resources;")
  .replace("if(table==='marketplace_orders')return [legacyOrder];", "if(table==='marketplace_orders')return window.__orders;")
  .replace('q.select=function(){return q};', "q.select=function(fields){if(table==='marketplace_notes')window.__resourceQueries.push(fields);return q};q.is=function(field,value){filters.push(row=>row[field]==value);return q};")
  .replace('q.then=function(resolve,reject){var data=result();return Promise.resolve({data:data,error:null,count:data.length}).then(resolve,reject)};', "q.or=function(expr){if(table==='marketplace_notes'){const terms=expr.split(',').map(term=>term.split('.eq.'));filters.push(row=>terms.some(([field,value])=>String(row[field])===value));}return q};q.then=function(resolve,reject){var data=result();return new Promise(done=>setTimeout(()=>done({data:data,error:table==='marketplace_notes'&&window.__failResourceReads?new Error('fixture offline'):null,count:data.length}),table==='marketplace_notes'?window.__resourceDelay||0:0)).then(resolve,reject)};")
  .replace('out=mutationValue;', "if(table==='marketplace_orders')mutationValue=mutationValue.map(row=>{const saved=Object.assign({id:'purchase-'+window.__orders.length},row);window.__orders.push(saved);return saved});out=mutationValue;")
  .replace('from:function(table){return query(table)}', "channel:function(){const ch={on:function(type,filter,cb){if(filter.table==='webinars')window.__webinarRealtime=cb;else if(filter.table==='marketplace_notes')window.__resourceRealtime=cb;return ch},subscribe:function(){return ch}};return ch},removeChannel:function(){window.__resourceRealtime=null;window.__removedChannels=(window.__removedChannels||0)+1;return Promise.resolve()},from:function(table){return query(table)}");
sdk = sdk.replace('rpc:function(){return Promise.resolve({data:[],error:null})}', `rpc:function(name,args){
  if(name==='community_featured'){const note=window.__resources.find(n=>n.id==='resource-2'&&n.uploader_id===args.p_id&&n.status==='active'&&!n.removed_at);return Promise.resolve({data:note?[{id:'featured-note',kind:'Resource',resource_id:note.id,title:note.title,description:note.description,price:note.price,is_free:note.is_free}]:[],error:null});}
  if(name==='community_profile'){
    var c=[consultant,misleadingCategoryConsultant,educationConsultant].find(c=>c.profile_id===args.p_id);
    return Promise.resolve({data:c?{id:c.profile_id,name:c.name,headline:c.specialty,company:c.current_company_college,college:c.college,education:c.highest_education,bio:c.bio,consultant_id:c.id,expertise:[],followers_count:0,following_count:0}:null,error:null});
  }
  return Promise.resolve({data:[],error:null});
}`);
assert.ok(sdk.includes("return window.__resources"));
assert.ok(sdk.includes("return window.__orders"));
const setup = `
window.__resourceQueries=[];window.__orders=[{id:'owned',note_id:'resource-0',buyer_id:'test-user',download_granted:true,payment_status:'success',price:199},{id:'unpaid',note_id:'resource-2',buyer_id:'test-user',download_granted:false,payment_status:'pending'}];
window.__resources=Array.from({length:7},(_,i)=>({id:'resource-'+i,uploader_id:'expert-profile',title:'Career planning guide '+i,category:'Study guide',description:i===0?'A complete guide to planning your next career step, with practical exercises, detailed examples, reusable templates, interview preparation and a final checklist for building confidence.':'Practical exercises and templates to help you prepare for your next career step.',price:i===1?0:199,is_free:i===1,status:'active',removed_at:null,downloads_count:i+2,created_at:new Date().toISOString(),preview_file_path:i<3?'expert-profile/preview-'+i+'.pdf':null,preview_bucket:'marketplace-previews',thumbnail_url:i===0?'/assets/images/footer-logo.webp':null}));
['draft','rejected','inactive','deleted','unpublished'].forEach((status,i)=>window.__resources.push({...window.__resources[0],id:'hidden-'+i,status,title:'Hidden '+status}));
window.__resources.push({...window.__resources[0],id:'wrong-owner',uploader_id:'someone-else',title:'Wrong owner'});
window.__resources.push({...window.__resources[0],id:'removed',removed_at:new Date().toISOString(),title:'Removed resource'});
window.__webinars=Array.from({length:6},(_,i)=>({id:'profile-webinar-'+i,created_by:'expert-profile',title:'Expert webinar '+i,description:'A full workshop with practical examples, guidance and questions from attendees.',category:'Career',date:'2099-09-'+(25+i),time:'16:00',duration:'60 minutes',seats:i===0?1:10,speaker:'Test Expert',price_type:i===2?'paid':'free',price_amount:i===2?199:0,is_paid:i===2}));
window.__webinars.push({...window.__webinars[1],id:'other-webinar',created_by:'someone-else',title:'Wrong owner webinar'});
window.__webinars.push({...window.__webinars[1],id:'past-webinar',date:'2000-01-01',title:'Past webinar'});
window.__webinarRegs=[{id:'full-seat',webinar_id:'profile-webinar-0',email:'other@example.com',payment_status:'free',registration_status:'confirmed'}, {id:'owned-seat',webinar_id:'profile-webinar-3',email:'user@example.com',name:'Test User',payment_status:'free',registration_status:'confirmed',payment_verified:true}];
window.fetch=async function(url,options){
 if(String(url).includes('/rest/v1/guidcy_webinar_counts?'))return new Response(JSON.stringify([{webinar_id:'profile-webinar-0',count:1},{webinar_id:'profile-webinar-3',count:1}]),{headers:{'Content-Type':'application/json'}});
 if(String(url).includes('/rest/v1/webinars?'))return new Response(JSON.stringify(window.__webinars),{headers:{'Content-Type':'application/json'}});
 if(String(url).includes('/rest/v1/webinar_registrations?'))return new Response(JSON.stringify(window.__webinarRegs),{headers:{'Content-Type':'application/json'}});
 if(String(url).includes('/api/create-order')){window.__createdPayment=JSON.parse(options.body);return new Response(JSON.stringify({keyId:'fixture',order:{id:'order_RESOURCE1',amount:19900,currency:'INR'}}))}
 if(String(url).includes('/api/verify-payment')){const args=JSON.parse(options.body);const order=window.__orders.find(o=>o.id===args.orderId);Object.assign(order,{download_granted:true,payment_verified:true,payment_status:'success',order_status:'completed'});window.__verifiedOrder=order.id;return new Response(JSON.stringify({order}))}
 return new Response('[]',{headers:{'Content-Type':'application/json'}});
};
`;
const root = path.resolve(__dirname, '../public');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/assets/vendor/supabase.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(setup+sdk);return}
  let file=path.join(root,pathname);
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
let browser;
(async()=>{
  await new Promise(resolve=>server.listen(Number(process.env.PORT||0),'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  if(process.argv.includes('--serve')){console.log(origin);return}
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const width of [1280,390,320]){
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await context.addInitScript(()=>{
      window.__pdfLoads=[];window.__pdfPages=[];
      window.pdfjsLib={GlobalWorkerOptions:{},getDocument({url}){
        window.__pdfLoads.push(url);
        return {destroy:async()=>{},promise:Promise.resolve({numPages:1,destroy:async()=>{},getPage:async number=>{
          window.__pdfPages.push(number);
          return {getViewport:({scale})=>({width:600*scale,height:800*scale}),render:({canvasContext:ctx,viewport:v})=>{
            ctx.fillStyle='#fff';ctx.fillRect(0,0,v.width,v.height);ctx.fillStyle='#1e72be';ctx.fillRect(0,0,v.width,v.height/4);ctx.fillStyle='#172a40';ctx.font='14px serif';ctx.fillText('Career guide',8,v.height/3);return {promise:Promise.resolve()};
          }};
        }})};
      }};
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    async function openExtras(){
      await page.waitForSelector('.gnet-profile-header');
      const details=page.locator('#gnet-profile-extras');
      assert.equal(await details.evaluate(el=>el.open),true,'resources, webinars and reviews are expanded on arrival');
      assert.equal(await page.locator('#gnet-booking-options').evaluate(el=>el.open),true,'availability and session options are expanded on arrival');
      assert.equal(await page.locator('.book-box').isVisible(),true);
    }
    await page.goto(origin+'/consultant/test-expert');
    await openExtras();
    await page.waitForSelector('#profile-resources .gpr-card');
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('#profile-resources .gpr-card').count(),4);
    assert.equal(await page.locator('#profile-resources h3').innerText(),'Resources by Test Expert');
    const resourceStrip=page.locator('#profile-resources .gpr-list');
    assert.ok(await resourceStrip.evaluate(el=>el.scrollWidth>el.clientWidth),'resources overflow inside their horizontal strip');
    const resourceBounds=await page.locator('#profile-resources').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:innerWidth-r.right}});
    assert.ok(resourceBounds.left>=0&&resourceBounds.left<=24&&resourceBounds.right>=0&&resourceBounds.right<=24,'resources span the screen with narrow side gutters: '+JSON.stringify(resourceBounds));
    assert.ok(await resourceStrip.evaluate(el=>Array.from(el.children).every(card=>Math.abs(card.getBoundingClientRect().top-el.firstElementChild.getBoundingClientRect().top)<1)),'resource cards stay in one row');
    await resourceStrip.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('#profile-resources .gpr-list').scrollLeft>0);
    await resourceStrip.evaluate(el=>{el.scrollLeft=0;el.blur()});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'resource strip does not overflow the page');
    assert.equal(await page.locator('.guidcy-profile-experience').isVisible(),false,'compact profile omits large experience section');
    await page.waitForSelector('#profile-webinars .gpr-card');
    assert.equal(await page.locator('#profile-webinars .gpr-card').count(),4);
    assert.equal(await page.locator('#profile-webinars h3').innerText(),'Webinars by Test Expert');
    const calendar=page.locator('#profile-webinars .gpw-date').first();
    assert.equal(await calendar.locator('.gpw-day').innerText(),'25');
    assert.match(await calendar.locator('.gpw-month').innerText(),/^Sept?$/i);
    assert.equal(await calendar.locator('.gpw-year').innerText(),'2099');
    assert.ok(await page.locator('#profile-webinars').evaluate(el=>!!el.closest('#gnet-profile-extras')),'existing webinars remain accessible inside the compact disclosure');
    assert.equal(await page.locator('[data-wbn-register="profile-webinar-0"]').first().isDisabled(),true,'full webinar cannot register');
    assert.equal(await page.locator('#profile-webinars [data-wbn-register="profile-webinar-2"]').innerText(),'Pay & register');
    await page.locator('#profile-webinars [data-wbn-register="profile-webinar-1"]').click();
    await page.waitForSelector('#wbn-reg-modal.on');
    assert.match(await page.locator('#wbn-reg-webinar-name').innerText(),/Expert webinar 1/);
    assert.equal(await page.locator('#page-profile').evaluate(el=>el.classList.contains('on')),true,'registration opens directly from profile');
    await page.evaluate(()=>window.wbnCloseModal());
    await page.locator('#profile-webinars [data-wbn-register="profile-webinar-2"]').click();
    await page.waitForSelector('#wbn-reg-modal.on');
    await page.waitForFunction(()=>document.querySelector('#wbn-modal-subtitle').textContent.includes('199'));
    await page.evaluate(()=>window.wbnCloseModal());
    await page.locator('#profile-webinars [data-wbn-register="profile-webinar-3"]').click();
    await page.waitForSelector('#wbn-reg-success.on');
    assert.match(await page.locator('#wbn-reg-success').innerText(),/already registered/);
    await page.evaluate(()=>window.wbnCloseModal());
    await page.locator('#profile-webinars .gpr-more').click();
    assert.equal(await page.locator('#profile-webinars .gpr-card').count(),6);
    assert.doesNotMatch(await page.locator('#profile-webinars').innerText(),/Wrong owner webinar|Past webinar/);
    await page.locator('#profile-webinars').screenshot({path:'/private/tmp/guidcy-profile-webinars-'+width+'.png'});
    await page.locator('.book-box').evaluate(el=>{window.__webinarBookingNode=el;return true});
    await page.evaluate(()=>{window.__webinars=window.__webinars.filter(w=>w.id!=='profile-webinar-1');window.__webinarRealtime()});
    await page.waitForFunction(()=>document.querySelectorAll('#profile-webinars .gpr-card').length===5);
    assert.ok(await page.evaluate(()=>window.__webinarBookingNode===document.querySelector('.book-box')),'webinar refresh preserves booking');

    assert.ok(await page.locator('#profile-resources').evaluate(el=>el.parentElement.id==='profile-layout'),'resources span both profile columns outside the disclosure');
    assert.equal(await page.locator('[data-resource-id="resource-0"] [data-resource-action="buy"]').innerText(),'Download');
    assert.equal(await page.locator('[data-resource-id="resource-1"] [data-resource-action="buy"]').innerText(),'Download Free');
    assert.equal(await page.locator('[data-resource-id="resource-2"] [data-resource-action="buy"]').innerText(),'Buy Now');
    assert.equal(await page.locator('#profile-resources').innerText().then(t=>/Hidden |Wrong owner|Removed resource/.test(t)),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal page overflow at '+width);
    await page.locator('#profile-resources').screenshot({path:'/private/tmp/guidcy-profile-resources-'+width+'.png'});
    await page.evaluate(()=>{window.__bookingNode=document.querySelector('.book-box');window.__profileNode=document.querySelector('.profile-hero')});
    await page.locator('#profile-resources [data-resource-action="more"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#profile-resources .gpr-card').length===7);
    assert.equal(await page.locator('#profile-resources [data-resource-action="more"]').count(),0);
    assert.ok(await page.evaluate(()=>window.__bookingNode===document.querySelector('.book-box')&&window.__profileNode===document.querySelector('.profile-hero')));
    await page.locator('.gpr-card[data-resource-id="resource-0"]').scrollIntoViewIfNeeded();
    await page.waitForSelector('.gpr-card[data-resource-id="resource-0"] img[alt^="First page"]');
    assert.ok(await page.evaluate(()=>window.__pdfPages.every(p=>p===1)),'thumbnail renders only page one');
    assert.equal(await page.evaluate(()=>window.__pdfLoads.filter(u=>u.endsWith('/preview-0.pdf')).length),1,'expanded cards reuse the first-page thumbnail');
    // Details uses the original Marketplace modal without routing away.
    await page.locator('[data-action="featured-view"][data-resource="resource-2"]').scrollIntoViewIfNeeded();
    const beforePopup=await page.evaluate(()=>window.scrollY);
    await page.locator('[data-action="featured-view"][data-resource="resource-2"]').click();
    await page.waitForSelector('#gmkt-modal.on');
    assert.match(await page.locator('#gmkt-modal-body h2').innerText(),/Career planning guide 2/);
    await page.waitForFunction(()=>document.body.classList.contains('guidcy-modal-scroll-lock'));
    const lockedTop=await page.evaluate(()=>document.querySelector('#profile-resources').getBoundingClientRect().top);
    await page.mouse.move(2,450);await page.mouse.wheel(0,600);await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.querySelector('#profile-resources').getBoundingClientRect().top),lockedTop,'background stays fixed while popup is open');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed');
    await page.locator('#gmkt-modal .gmkt-close').click();
    await page.waitForFunction(y=>!document.body.classList.contains('guidcy-modal-scroll-lock')&&Math.abs(window.scrollY-y)<2,beforePopup);
    assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed','closing restores scrolling');
    // Real shared checkout, mocked only at payment provider and download boundaries.
    await page.evaluate(()=>{
      window.Razorpay=function(options){window.__checkout=options;this.on=function(){};this.open=function(){window.__checkoutOpened=(window.__checkoutOpened||0)+1}};
      window.GuidcyMarketplace.secureDownload=async function(note,order){window.__download={id:note.id,orderId:order.id}};
    });
    await page.locator('[data-action="featured-buy"][data-resource="resource-2"]').click();
    await page.waitForFunction(()=>window.__checkoutOpened===1);
    await page.evaluate(()=>window.__checkout.handler({razorpay_order_id:'order_RESOURCE1',razorpay_payment_id:'pay_FIXTURE',razorpay_signature:'fixture'}));
    await page.waitForFunction(()=>window.__download?.id==='resource-2');
    await page.waitForFunction(()=>document.querySelector('[data-resource-id="resource-2"] [data-resource-action="buy"]').textContent==='Download');
    assert.ok(await page.evaluate(()=>window.__download.orderId===window.__verifiedOrder&&window.__createdPayment.flow==='marketplace'));
    const purchases=await page.evaluate(()=>window.__orders.length);
    await page.locator('[data-resource-id="resource-2"] [data-resource-action="buy"]').click();
    await page.waitForFunction(()=>!window.__guidcyRazorpayMarketplaceBusy);
    assert.equal(await page.evaluate(()=>window.__orders.length),purchases,'owned download creates no duplicate order');
    await page.locator('[data-resource-id="resource-1"] [data-resource-action="buy"]').click();
    await page.waitForFunction(()=>window.__download?.id==='resource-1');
    await page.waitForFunction(()=>document.querySelector('[data-resource-id="resource-1"] [data-resource-action="buy"]').textContent==='Download');
    // Realtime and explicit refresh remove withdrawn rows without touching booking.
    await page.evaluate(()=>{window.__resources[0].status='inactive';window.__resourceRealtime()});
    await page.waitForFunction(()=>!document.querySelector('.gpr-card[data-resource-id="resource-0"]'));
    assert.ok(await page.evaluate(()=>window.__bookingNode===document.querySelector('.book-box')));
    await page.evaluate(()=>{window.__resources=window.__resources.filter(n=>n.id!=='resource-3');window.__resourceRealtime()});
    await page.waitForFunction(()=>!document.querySelector('.gpr-card[data-resource-id="resource-3"]'));
    // A stale card cannot start a purchase after unpublishing, even before revalidation.
    await page.evaluate(()=>{window.__resources.find(n=>n.id==='resource-4').status='unpublished'});
    await page.locator('[data-resource-id="resource-4"] [data-resource-action="buy"]').click();
    await page.waitForFunction(()=>!document.querySelector('.gpr-card[data-resource-id="resource-4"]'));
    assert.equal(await page.evaluate(()=>window.__checkoutOpened),1);
    if(width===1280){
      await page.evaluate(async()=>{window.__failResourceReads=true;await window.GuidcyProfileResources.refresh()});
      assert.match(await page.locator('#profile-resources .gpr-status').innerText(),/Could not refresh/);
      await page.evaluate(async()=>{window.__failResourceReads=false;await window.GuidcyProfileResources.refresh()});
      assert.equal(await page.locator('#profile-resources .gpr-status').isVisible(),false,'successful retry clears the error');
      await page.evaluate(()=>{window.__resourceDelay=400;window.GuidcyProfileResources.refresh()});
    }
    await page.evaluate(()=>window.openProfile('test-finance-expert',-1));
    await page.waitForFunction(()=>window.curCons?.id==='test-finance-expert');
    await openExtras();
    await page.waitForTimeout(650);
    await page.evaluate(()=>{window.__resourceDelay=0});
    assert.equal(await page.locator('#profile-resources').isVisible(),false,'no resources hides the entire section');
    assert.equal(await page.locator('#profile-webinars').isVisible(),false,'no webinars hides the entire section');
    // A consultant's first publications must reveal previously empty sections
    // while the profile is open, without rebuilding the booking calendar.
    await page.evaluate(()=>{
      window.__financeBookingNode=document.querySelector('.book-box');
      window.__resources.push({...window.__resources.find(n=>n.status==='active'),id:'new-finance-note',uploader_id:'legacy-admin',profile_consultant_id:'test-finance-expert',title:'New finance guide',removed_at:null});
      window.__webinars.push({...window.__webinars[1],id:'new-finance-webinar',created_by:'finance-profile',title:'New finance webinar'});
      window.__resourceRealtime();window.__webinarRealtime();
    });
    await page.locator('#profile-resources .gpr-card[data-resource-id="new-finance-note"]').waitFor();
    await page.locator('#profile-webinars [data-profile-webinar-id="new-finance-webinar"]').waitFor();
    assert.equal(await page.locator('#profile-resources .gpr-card').count(),1);
    assert.equal(await page.evaluate(()=>window.__resources.find(n=>n.id==='new-finance-note').uploader_id),'legacy-admin','profile attribution preserves the uploader');
    await page.locator('#profile-resources [data-resource-action=details]').click();
    await page.locator('#gmkt-modal').filter({hasText:'New finance guide'}).waitFor();
    await page.evaluate(()=>window.GuidcyMarketplace.closeModal());
    assert.equal(await page.locator('#profile-webinars .gpr-card').count(),1);
    assert.ok(await page.evaluate(()=>window.__financeBookingNode===document.querySelector('.book-box')),'new publications preserve booking controls');
    if(width===1280){
      // Public viewers may receive no webinar Realtime event because the base
      // table is owner-only. Exercise the real visible-profile refresh timer.
      await page.evaluate(()=>{
        window.__resources.push({...window.__resources.find(n=>n.id==='new-finance-note'),id:'missed-event-note',title:'Another finance guide'});
        window.__webinars.push({...window.__webinars.find(w=>w.id==='new-finance-webinar'),id:'missed-event-webinar',title:'Another finance webinar'});
      });
      await page.locator('#profile-webinars [data-profile-webinar-id="missed-event-webinar"]').waitFor({timeout:75000});
      await page.locator('#profile-resources .gpr-card[data-resource-id="missed-event-note"]').waitFor();
      assert.ok(await page.evaluate(()=>window.__financeBookingNode===document.querySelector('.book-box')),'missed-event refresh preserves booking controls');
    }
    await page.evaluate(()=>window.openProfile('test-expert',-1));
    await openExtras();
    await page.waitForSelector('#profile-resources h3');
    await page.waitForFunction(()=>document.querySelector('#profile-resources h3')?.textContent==='Resources by Test Expert');
    assert.equal(await page.locator('[data-resource-id="new-finance-note"],[data-profile-webinar-id="new-finance-webinar"]').count(),0,'new publications appear only on their owner profile');
    await page.evaluate(()=>window.go('home'));
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(()=>window.__removedChannels>0));
    await page.goBack();
    await openExtras();
    await page.waitForSelector('#page-profile.on .gpr-card');
    await page.reload();
    await openExtras();
    await page.waitForSelector('.gpr-card');
    assert.equal(await page.locator('#profile-resources .gpr-card').count(),4,'refresh starts with four');
    // Verify the separate public Marketplace card renderer on its own route.
    await page.goto(origin+'/marketplace');
    const more=page.locator('#gmkt-grid .gmkt-description-toggle[aria-expanded="false"]').first();
    await page.waitForSelector('#page-marketplace.on');
    await more.waitFor({state:'visible'});
    const desc=page.locator('#gmkt-grid .gmkt-desc').first();
    assert.ok(await desc.evaluate(el=>{
      const tail=el.querySelector('.gmkt-description-tail'),text=tail.firstChild;
      const range=document.createRange();range.selectNodeContents(text);
      return Math.abs(range.getBoundingClientRect().top-tail.querySelector('button').getBoundingClientRect().top)<3;
    }),'View more stays on the same line as the final visible word');
    await more.click();
    assert.equal(await desc.locator('[data-gmkt-description-full]').isVisible(),true);
    assert.match(await desc.innerText(),/a final checklist for building confidence/);
    await desc.getByRole('button',{name:'View less'}).click();
    assert.equal(await desc.locator('[data-gmkt-description-full]').isVisible(),false);
    assert.deepEqual(errors,[]);
    await context.addInitScript(()=>{window.__guidcyTestAuthUser={id:'expert-profile',email:'expert@example.com',user_metadata:{full_name:'Test Expert',role:'consultant'}};window.__guidcyTestProfile={id:'expert-profile',email:'expert@example.com',full_name:'Test Expert',role:'consultant'};});
    await page.goto(origin+'/consultant/test-expert');await page.locator('.gnet-profile-actions [data-action=edit-profile]').waitFor();await page.locator('#profile-resources .gpr-card').first().waitFor();
    assert.equal(await page.locator('#profile-resources [data-resource-action=buy]:not([disabled])').count(),0,'own resource purchases disabled');
    assert.equal(await page.locator('[data-action=featured-buy]').isDisabled(),true);
    const orderCount=await page.evaluate(()=>window.__orders.length);
    for(const id of ['resource-1','resource-2'])await page.evaluate(id=>window.GuidcyMarketplace.buyOrDownload(id),id);
    assert.equal(await page.evaluate(()=>window.__orders.length),orderCount,'no paid or free self-order');
    assert.equal(await page.evaluate(()=>!!window.__createdPayment),false,'no self-checkout request');
    await page.goto(origin+'/marketplace');await page.locator('#gmkt-grid:not([inert]) [data-gmkt-action=buy]').first().waitFor();
    assert.equal(await page.locator('#gmkt-grid [data-gmkt-action=buy][data-gmkt-id^="resource-"]:not([disabled])').count(),0,'marketplace labels own resources');
    assert.ok(await page.locator('#gmkt-grid [data-gmkt-action=edit]').count()>0,'owners retain management');
    await page.locator('#gmkt-grid [data-gmkt-action=details][data-gmkt-id=resource-2]').click();
    assert.equal(await page.locator('#gmkt-modal button[onclick*=buyOrDownload]').isDisabled(),true,'resource details also blocks self-purchase');
    console.log(width+': profile placement, filtering, ownership, details, paid/free checkout, live removal, SPA/back/refresh and booking stability passed');
    await context.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(!process.argv.includes('--serve'))server.close()});
