// Real dashboard renderer, delayed local order/gateway fixtures; no production writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'community-browser.cjs'),'utf8'),end=source.indexOf('let browser;');assert.ok(end>0);
const setup=vm.runInNewContext(source.slice(0,end)+';({fixture,server});',{require,__dirname,process,Buffer,URL});
function purchaseFixture(){
 window.fetch=window.__nativeFixtureFetch;
 window.__purchaseQueries=[];
 const buyer='11111111-1111-4111-8111-111111111111',note={id:'paid-note',title:'Purchased Test Notes',category:'Career',uploader_name:'Test Seller',status:'active',price:199,file_path:'fixture.pdf'},pendingNote={...note,id:'pending-note',title:'Recovered Purchase'};
 window.__purchaseRows=[{id:'paid-order',note_id:note.id,buyer_id:'',buyer_email:'user@example.com',note_title:note.title,note_category:note.category,seller_name:note.uploader_name,price:199,payment_status:'success',order_status:'completed',payment_verified:true,created_at:new Date().toISOString()},{id:'pending-order',note_id:pendingNote.id,buyer_id:buyer,buyer_email:'user@example.com',note_title:pendingNote.title,price:199,payment_status:'pending',razorpay_order_id:'order_fixture_pending',payment_verified:false,created_at:new Date().toISOString()}];
 const native=supabase.createClient;supabase.createClient=function(){const c=native(),from=c.from;c.from=function(table){
  if(!['marketplace_orders','marketplace_notes'].includes(table))return from(table);
  let fields='*',filters=[],single=false;const q={select(v){fields=v;return q},eq(k,v){filters.push(row=>row[k]===v);return q},not(k){filters.push(row=>row[k]!=null);return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},update(){return q},abortSignal(){return q},in(k,values){filters.push(row=>values.includes(row[k]));return q}};
  q.then=(resolve,reject)=>new Promise(done=>{const query={table,fields,start:performance.now()};window.__purchaseQueries.push(query);setTimeout(()=>{query.end=performance.now();if(window.__failPurchase&&table==='marketplace_orders')return done({data:null,error:{message:'Fixture offline'}});let rows=(table==='marketplace_orders'?window.__purchaseRows:[note,pendingNote]).filter(row=>filters.every(filter=>filter(row))).map(row=>({...row}));if(fields.includes('marketplace_notes('))rows=rows.map(row=>({...row,marketplace_notes:row.note_id===note.id?note:pendingNote}));done({data:single?rows[0]||null:rows,error:null});},100)}).then(resolve,reject);return q;
 };c.storage.from=()=>({download:async()=>({data:new Blob(['%PDF-1.4 fixture'],{type:'application/pdf'}),error:null})});return c;};
}
let browser,debug;
(async()=>{
 await new Promise(resolve=>setup.server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+setup.server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const baseline=!!process.env.GUIDCY_PURCHASE_BASELINE;
 for(const width of baseline?[1280]:[1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,isMobile:width<600});await context.addInitScript(()=>{window.__nativeFixtureFetch=window.fetch;localStorage.setItem('guidcy_cookie_consent_v1',JSON.stringify({version:1,analytics:false,savedAt:Date.now()}));});
  let gatewayFinished=false,verifications=0;
  await context.route('**/*',async route=>{
   const url=route.request().url();if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:setup.fixture+'\n('+purchaseFixture.toString()+')();'});
   if(url.includes('/api/verify-payment')){verifications++;await new Promise(r=>setTimeout(r,1500));gatewayFinished=true;await debug.page.evaluate(()=>{Object.assign(window.__purchaseRows[1],{payment_status:'success',order_status:'completed',payment_verified:true,download_granted:true});});return route.fulfill({json:{ok:true,verified:true,reconciled:true}}).catch(()=>{});}
   return url.startsWith(origin)&&!url.includes('/api/')?route.continue():route.abort();
  });
  const page=await context.newPage();debug={page};const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/dashboard?tab=upcoming');await page.waitForFunction(()=>window.__guidcyAuthReadyFired&&window.GuidcyMarketplace?.purchases.__guidcyReconcilesSupabase);
  await page.evaluate(()=>{window.__purchaseQueries=[];window.__purchaseStart=performance.now();window.swUD('marketplace',document.querySelector('[data-gmkt-buyer]'));});
  await page.waitForFunction(()=>document.querySelector('#udash-main table')?.textContent.includes('Purchased Test Notes'));
  const first=await page.evaluate(()=>({elapsed:Math.round(performance.now()-window.__purchaseStart),queries:window.__purchaseQueries,rows:document.querySelectorAll('#udash-main tbody tr').length}));
  console.log((baseline?'Before':'After')+' first purchase table at '+width+'px:',JSON.stringify({elapsedMs:first.elapsed,gatewayFinished,queryCount:first.queries.length,rows:first.rows}));
  if(baseline){fs.writeFileSync('/private/tmp/guidcy-purchases-before.json',JSON.stringify(first));await context.close();continue;}
  assert.equal(gatewayFinished,false,'confirmed purchases render before slow payment recovery');assert.equal(first.rows,1,'unverified purchases are not unlocked early');assert.equal(first.queries.filter(q=>q.table==='marketplace_notes').length,0,'no full notes catalogue lookup');
  const button=page.getByRole('button',{name:'View / Download',exact:true}).first(),size=await button.evaluate(el=>({target:el.getBoundingClientRect().height,pill:el.querySelector('span').getBoundingClientRect().height,width:el.getBoundingClientRect().width,font:getComputedStyle(el).fontSize}));assert.equal(size.pill,32);assert.ok(size.width<140);assert.equal(size.font,'12px');assert.ok(size.target>=(width<600?44:32));
  await page.waitForFunction(()=>document.querySelector('#udash-main table')?.textContent.includes('Recovered Purchase'));assert.equal(verifications,1);assert.equal(await page.locator('#guidcy-loading-status').isVisible(),false,'recovery does not keep the global loader open');
  const count=await page.evaluate(()=>window.__purchaseQueries.length);await page.evaluate(()=>window.GuidcyMarketplace.purchases());assert.equal(await page.evaluate(()=>window.__purchaseQueries.length),count,'reopening reuses the same-account recent table');
  await page.evaluate(()=>{window.dispatchEvent(new Event('guidcy:marketplace-purchase-updated'));return window.GuidcyMarketplace.purchases();});
  assert.equal(await page.evaluate(()=>window.__purchaseQueries.length),count+2,'checkout completion invalidates the cached ID/email lookups');
  await page.locator('#udash-main table').screenshot({path:'/private/tmp/guidcy-purchases-'+width+'.png'});
  await page.evaluate(()=>{window.__failPurchase=true;window.GuidcyMarketplace.invalidatePurchases();return window.GuidcyMarketplace.purchases();});await page.getByText('Could not load your purchased notes.',{exact:false}).waitFor();
  await page.evaluate(()=>{window.__failPurchase=false;});await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#udash-main table')?.textContent.includes('Purchased Test Notes'));
  // A different auth identity cannot reuse this account's table or in-flight requests.
  await page.evaluate(async()=>{const previous=window.currentUser;window.currentUser={id:'44444444-4444-4444-8444-444444444444',email:'other@example.com'};await window.GuidcyMarketplace.purchases();window.__previousPurchaseUser=previous;});
  assert.equal(await page.locator('#udash-main').textContent().then(t=>t.includes('Purchased Test Notes')),false);
  await page.evaluate(()=>{window.currentUser=window.__previousPurchaseUser;window.GuidcyMarketplace.invalidatePurchases();window.__purchaseQueries=[];return Promise.all([window.GuidcyMarketplace.purchases(),window.GuidcyMarketplace.purchases()]);});
  assert.equal(await page.evaluate(()=>window.__purchaseQueries.filter(q=>q.fields.includes('marketplace_notes(')).length),2,'concurrent table requests share the ID/email lookups');
  await page.evaluate(()=>{window.GuidcyMarketplace.invalidatePurchases();window.__latePurchase=window.GuidcyMarketplace.purchases();window.swUD('goals',document.querySelector('#page-user-dash [data-dash-section="goals"]'));return window.__latePurchase;});
  assert.match(await page.locator('#udash-main .dash-title').textContent(),/goal tracker/i,'late table results cannot overwrite the next tab');
  await page.evaluate(()=>window.swUD('marketplace',document.querySelector('[data-gmkt-buyer]')));await page.waitForFunction(()=>document.querySelector('#udash-main table')?.textContent.includes('Recovered Purchase'));
  const download=page.waitForEvent('download');await page.locator('#udash-main tbody tr').filter({hasText:'Recovered Purchase'}).getByRole('button',{name:'View / Download'}).click();
  assert.equal((await download).suggestedFilename(),'Recovered Purchase.pdf','compact button still invokes the existing authenticated download flow');
  assert.deepEqual(errors,[]);await context.close();
 }
})().catch(async error=>{console.error(error);if(debug?.page)console.error(await debug.page.evaluate(()=>({url:location.href,text:document.querySelector('#udash-main')?.innerText,queries:window.__purchaseQueries})).catch(()=>({})));process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>setup.server.close(resolve));});
