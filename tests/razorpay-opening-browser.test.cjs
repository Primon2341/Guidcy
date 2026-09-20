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
const root = path.resolve(__dirname, '..', 'public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
 let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
 if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
 res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
 fs.createReadStream(file).pipe(res);
});


const sdkSource=`window.__paymentTimes.push({stage:'sdk-ready',at:performance.now()});window.Razorpay=function(options){window.__razorpayOptions=options;this.on=function(name,fn){window.__razorpayFailed=fn};this.open=function(){window.__paymentTimes.push({stage:'opened',at:performance.now()});window.__openCount=(window.__openCount||0)+1}};`;
const title='Advanced career planning and professional development: a comprehensive guide to opportunities, leadership and sustainable success for students and working professionals';
(async()=>{
 let browser;
 try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [390,1280]){
  let sdkRequests=0;
  const ctx=await browser.newContext({viewport:{width,height:844}});
  await ctx.addInitScript(title=>{
    window.__paymentTimes=[];
    window.__guidcyTestAuthUser={id:'test-user',email:'user@example.com',user_metadata:{full_name:'Test User',role:'user'}};
    window.__guidcyTestProfile={id:'test-user',email:'user@example.com',full_name:'Test User',role:'user'};
    sessionStorage.setItem('guidcy_webinar_payment_v1',JSON.stringify({flow:'webinar',webinar:{id:'timing-webinar',title,date:'2099-09-23',time:'16:00',price_amount:499,is_paid:true},registration:{id:'timing-registration',webinar_id:'timing-webinar',email:'user@example.com',name:'Test User',payment_status:'pending',registration_status:'pending_payment'},details:{name:'Test User',email:'user@example.com'},amount:499,completed:false,blocking:false,openedAt:Date.now()}));
    const fetchOriginal=window.fetch;
    window.fetch=async function(input,init){
      const u=typeof input==='string'?input:input.url;
      if(u.includes('/api/create-order')){
        window.__paymentTimes.push({stage:'order-start',at:performance.now()});
        await new Promise(r=>setTimeout(r,350));
        window.__paymentTimes.push({stage:'order-ready',at:performance.now()});
        return new Response(JSON.stringify({keyId:'rzp_test_fixture',order:{id:'order_TIMING123',amount:49900,currency:'INR'}}),{headers:{'Content-Type':'application/json'}});
      }
      if(u.includes('/api/verify-payment')){
        window.__paymentTimes.push({stage:'verified',at:performance.now()});
        return new Response(JSON.stringify({registration:{id:'timing-registration',webinar_id:'timing-webinar',email:'user@example.com',payment_verified:true,payment_status:'success',registration_status:'confirmed'}}),{headers:{'Content-Type':'application/json'}});
      }
      return fetchOriginal.apply(this,arguments);
    };
  },title);
  await ctx.route('**/*',async r=>{
    const u=r.request().url();
    if(u.includes('/assets/vendor/supabase.js'))return r.fulfill({contentType:'text/javascript',body:fakeSupabase.replace('out=mutationValue;',"if(table==='marketplace_orders')mutationValue=mutationValue.map(row=>Object.assign({id:'marketplace-timing'},row));out=mutationValue;")});
    if(u==='https://checkout.razorpay.com/v1/checkout.js'){sdkRequests++;await new Promise(r=>setTimeout(r,700));return r.fulfill({contentType:'text/javascript',body:sdkSource})}
    if(!u.startsWith(origin)||u.includes('/api/'))return r.abort();return r.continue();
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/payment',{waitUntil:'domcontentloaded'});
  await page.locator('.pay-webinar-summary').waitFor();
  for(const viewport of [width,320,430]){
    await page.setViewportSize({width:viewport,height:844});
    const geometry=await page.locator('.pay-webinar-summary').evaluate(el=>{
      const labels=[...el.querySelectorAll('.pay-webinar-label')];
      return {labels:labels.map(e=>({height:e.getBoundingClientRect().height,line:Number.parseFloat(getComputedStyle(e).lineHeight),width:e.getBoundingClientRect().width,scroll:e.scrollWidth})),overflow:document.documentElement.scrollWidth>innerWidth+1,title:el.querySelector('.pay-webinar-value').textContent};
    });
    assert.equal(geometry.title,title);assert.equal(geometry.overflow,false);
    assert.ok(geometry.labels.every(l=>l.height<=l.line+1&&l.scroll<=l.width+1),'checkout labels remain single-line at '+viewport);
    await page.locator('#page-payment .pay-wrap').screenshot({path:'/private/tmp/guidcy-webinar-title-'+viewport+'.png'});
  }
  await page.setViewportSize({width,height:844});
  await page.waitForFunction(()=>!!window.Razorpay);
  assert.equal(sdkRequests,1);assert.equal(await page.evaluate(()=>window.__openCount||0),0,'preloading does not open checkout');
  assert.equal(await page.evaluate(()=>window.__paymentTimes.filter(e=>e.stage==='order-start').length),0,'preloading does not create an order');
  await page.locator('#page-payment .green-btn').click();
  await page.waitForFunction(()=>window.__openCount===1);
  const times=await page.evaluate(()=>window.__paymentTimes);
  const at=stage=>times.find(e=>e.stage===stage).at;
  assert.ok(at('sdk-ready')<at('order-start'),'SDK available before Pay');
  assert.ok(at('opened')-at('order-ready')<80,'no fixed delay between ready order and opening');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('guidcy-razorpay-checkout-open')),true);
  await page.evaluate(()=>window.__razorpayOptions.handler({razorpay_order_id:'order_TIMING123',razorpay_payment_id:'pay_FIXTURE',razorpay_signature:'fixture'}));
  await page.waitForFunction(()=>window.__paymentTimes.some(e=>e.stage==='verified'));
  await page.waitForFunction(()=>!document.body.classList.contains('guidcy-razorpay-checkout-open'));
  // The native Marketplace buy path shares the same already-warm opener.
  await page.evaluate(()=>{sessionStorage.removeItem('guidcy_webinar_payment_v1');window.__guidcyPaymentFlowLock=false;document.querySelector('#booking-confirm-popup')?.remove();window.GuidcyMarketplace.secureDownload=async function(){};window.guidcyStartRazorpayMarketplace('note-legacy-1')});
  await page.waitForFunction(()=>window.__openCount===2);
  assert.equal(sdkRequests,1,'Marketplace reuses the same SDK');
  await page.evaluate(()=>window.__razorpayOptions.modal.ondismiss());
  await page.waitForFunction(()=>!window.__guidcyRazorpayMarketplaceBusy);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('guidcy-razorpay-checkout-open')),false);
  assert.deepEqual(errors,[]);
  console.log(width+': SDK preloaded before Pay; order-ready → open '+Math.round(at('opened')-at('order-ready'))+'ms; webinar verification, Marketplace cancel and long-title layout passed');
  await ctx.close();
 }

 // Each purchase entry route warms proactively, without creating an order.
 for(const entry of ['/consultant/test-expert','/webinars','/marketplace']){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});let requests=0,orders=0;
  await ctx.addInitScript(()=>window.__paymentTimes=[]);
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.includes('/assets/vendor/supabase.js'))return r.fulfill({contentType:'text/javascript',body:fakeSupabase});if(u==='https://checkout.razorpay.com/v1/checkout.js'){requests++;return r.fulfill({contentType:'text/javascript',body:sdkSource})}if(u.includes('/api/create-order'))orders++;if(!u.startsWith(origin)||u.includes('/api/'))return r.abort();return r.continue()});
  const page=await ctx.newPage();await page.goto(origin+entry);await page.waitForFunction(()=>!!window.Razorpay);
  assert.equal(requests,1);assert.equal(orders,0);assert.equal(await page.evaluate(()=>window.__openCount||0),0);
  await ctx.close();console.log(entry+': SDK preloaded without opening or creating an order');
 }
 // A failed speculative download must be retryable, with concurrent callers coalesced.
 const ctx=await browser.newContext();let requests=0;
 await ctx.addInitScript(()=>window.__paymentTimes=[]);
 await ctx.route('**/*',r=>{const u=r.request().url();if(u.includes('/assets/vendor/supabase.js'))return r.fulfill({contentType:'text/javascript',body:fakeSupabase});if(u==='https://checkout.razorpay.com/v1/checkout.js'){requests++;if(requests===1)return r.abort();return r.fulfill({contentType:'text/javascript',body:sdkSource})}if(!u.startsWith(origin)||u.includes('/api/'))return r.abort();return r.continue()});
 const page=await ctx.newPage();await page.goto(origin+'/about');assert.equal(requests,0,'unrelated pages do not load checkout');
 await page.evaluate(()=>window.guidcyWarmRazorpayCheckout());assert.equal(requests,1);
 await page.evaluate(()=>Promise.all([window.guidcyLoadRazorpayCheckout(),window.guidcyLoadRazorpayCheckout(),window.guidcyWarmRazorpayCheckout()]));
 assert.equal(requests,2,'one retry shared by all callers');
 assert.equal(await page.locator('script[src="https://checkout.razorpay.com/v1/checkout.js"]').count(),1);
 await ctx.close();console.log('Failed SDK prewarm retries successfully without duplicate scripts');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
