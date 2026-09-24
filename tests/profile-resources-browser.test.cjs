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
  .replace("if(table==='marketplace_notes')return [purchasedNote];", "if(table==='marketplace_notes')return window.__resources;")
  .replace("if(table==='marketplace_orders')return [legacyOrder];", "if(table==='marketplace_orders')return window.__orders;")
  .replace('q.select=function(){return q};', "q.select=function(fields){if(table==='marketplace_notes')window.__resourceQueries.push(fields);return q};q.is=function(field,value){filters.push(row=>row[field]==value);return q};")
  .replace('q.then=function(resolve,reject){var data=result();return Promise.resolve({data:data,error:null,count:data.length}).then(resolve,reject)};', "q.then=function(resolve,reject){var data=result();return new Promise(done=>setTimeout(()=>done({data:data,error:table==='marketplace_notes'&&window.__failResourceReads?new Error('fixture offline'):null,count:data.length}),table==='marketplace_notes'?window.__resourceDelay||0:0)).then(resolve,reject)};")
  .replace('out=mutationValue;', "if(table==='marketplace_orders')mutationValue=mutationValue.map(row=>{const saved=Object.assign({id:'purchase-'+window.__orders.length},row);window.__orders.push(saved);return saved});out=mutationValue;")
  .replace('from:function(table){return query(table)}', "channel:function(){const ch={on:function(type,filter,cb){window.__resourceRealtime=cb;return ch},subscribe:function(){return ch}};return ch},removeChannel:function(){window.__resourceRealtime=null;window.__removedChannels=(window.__removedChannels||0)+1;return Promise.resolve()},from:function(table){return query(table)}");
assert.ok(sdk.includes("return window.__resources"));
assert.ok(sdk.includes("return window.__orders"));
const setup = `
window.__resourceQueries=[];window.__orders=[{id:'owned',note_id:'resource-0',buyer_id:'test-user',download_granted:true,payment_status:'success',price:199},{id:'unpaid',note_id:'resource-2',buyer_id:'test-user',download_granted:false,payment_status:'pending'}];
window.__resources=Array.from({length:7},(_,i)=>({id:'resource-'+i,uploader_id:'expert-profile',title:'Career planning guide '+i,category:'Study guide',description:i===0?'A complete guide to planning your next career step, with practical exercises, detailed examples, reusable templates, interview preparation and a final checklist for building confidence.':'Practical exercises and templates to help you prepare for your next career step.',price:i===1?0:199,is_free:i===1,status:'active',removed_at:null,downloads_count:i+2,created_at:new Date().toISOString(),preview_file_path:i<3?'expert-profile/preview-'+i+'.pdf':null,preview_bucket:'marketplace-previews',thumbnail_url:i===0?'/assets/images/footer-logo.webp':null}));
['draft','rejected','inactive','deleted','unpublished'].forEach((status,i)=>window.__resources.push({...window.__resources[0],id:'hidden-'+i,status,title:'Hidden '+status}));
window.__resources.push({...window.__resources[0],id:'wrong-owner',uploader_id:'someone-else',title:'Wrong owner'});
window.__resources.push({...window.__resources[0],id:'removed',removed_at:new Date().toISOString(),title:'Removed resource'});
window.fetch=async function(url,options){
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
        return {promise:Promise.resolve({numPages:1,destroy:async()=>{},getPage:async number=>{
          window.__pdfPages.push(number);
          return {getViewport:({scale})=>({width:600*scale,height:800*scale}),render:({canvasContext:ctx,viewport:v})=>{
            ctx.fillStyle='#fff';ctx.fillRect(0,0,v.width,v.height);ctx.fillStyle='#1e72be';ctx.fillRect(0,0,v.width,v.height/4);ctx.fillStyle='#172a40';ctx.font='14px serif';ctx.fillText('Career guide',8,v.height/3);return {promise:Promise.resolve()};
          }};
        }})};
      }};
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/consultant/test-expert');
    await page.waitForSelector('#profile-resources .gpr-card');
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('.gpr-card').count(),4);
    assert.equal(await page.locator('#profile-resources h3').innerText(),'Resources by Test Expert');
    await page.waitForSelector('.guidcy-profile-experience');
    assert.ok(await page.evaluate(()=>!!(document.querySelector('#profile-resources').compareDocumentPosition(document.querySelector('.guidcy-profile-experience')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    assert.equal(await page.locator('[data-resource-id="resource-0"] [data-resource-action="buy"]').innerText(),'Download');
    assert.equal(await page.locator('[data-resource-id="resource-1"] [data-resource-action="buy"]').innerText(),'Download Free');
    assert.equal(await page.locator('[data-resource-id="resource-2"] [data-resource-action="buy"]').innerText(),'Buy Now');
    assert.equal(await page.locator('#profile-resources').innerText().then(t=>/Hidden |Wrong owner|Removed resource/.test(t)),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal page overflow at '+width);
    await page.locator('#profile-resources').screenshot({path:'/private/tmp/guidcy-profile-resources-'+width+'.png'});
    await page.evaluate(()=>{window.__bookingNode=document.querySelector('.book-box');window.__profileNode=document.querySelector('.profile-hero')});
    await page.locator('[data-resource-action="more"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.gpr-card').length===7);
    assert.equal(await page.locator('[data-resource-action="more"]').count(),0);
    assert.ok(await page.evaluate(()=>window.__bookingNode===document.querySelector('.book-box')&&window.__profileNode===document.querySelector('.profile-hero')));
    await page.locator('.gpr-card[data-resource-id="resource-0"]').scrollIntoViewIfNeeded();
    await page.waitForSelector('.gpr-card[data-resource-id="resource-0"] img[alt^="First page"]');
    assert.ok(await page.evaluate(()=>window.__pdfPages.every(p=>p===1)),'thumbnail renders only page one');
    assert.equal(await page.evaluate(()=>window.__pdfLoads.filter(u=>u.endsWith('/preview-0.pdf')).length),1,'expanded cards reuse the first-page thumbnail');
    // Details uses the original Marketplace modal without routing away.
    await page.locator('[data-resource-id="resource-2"] [data-resource-action="details"]').scrollIntoViewIfNeeded();
    const beforePopup=await page.evaluate(()=>window.scrollY);
    await page.locator('[data-resource-id="resource-2"] [data-resource-action="details"]').click();
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
    await page.locator('[data-resource-id="resource-2"] [data-resource-action="buy"]').click();
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
    await page.waitForTimeout(650);
    await page.evaluate(()=>{window.__resourceDelay=0});
    assert.equal(await page.locator('#profile-resources').isVisible(),false,'no resources hides the entire section');
    await page.evaluate(()=>window.openProfile('test-expert',-1));
    await page.waitForSelector('.gpr-card');
    await page.evaluate(()=>window.go('home'));
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(()=>window.__removedChannels>0));
    await page.goBack();
    await page.waitForSelector('#page-profile.on .gpr-card');
    await page.reload();
    await page.waitForSelector('.gpr-card');
    assert.equal(await page.locator('.gpr-card').count(),4,'refresh starts with four');
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
    console.log(width+': profile placement, filtering, ownership, details, paid/free checkout, live removal, SPA/back/refresh and booking stability passed');
    await context.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(!process.argv.includes('--serve'))server.close()});
