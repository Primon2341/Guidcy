const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('response',async r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url(),(await r.text()).slice(0,500))});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text().slice(0,350))});
  let analyticsRequests=0;
  page.on('request',request=>{if(request.url().includes('/_vercel/insights/'))analyticsRequests++});
  await page.goto('https://www.guidcy.com/find-experts',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#guidcy-cookie-banner');
  assert.equal(analyticsRequests,0,'analytics stays off before consent');
  await page.locator('#guidcy-cookie-banner [data-cookie-settings]').click();
  assert.equal(await page.locator('#gc-analytics').isChecked(),false);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
  await page.locator('dialog [data-cookie-choice="reject"]').click();
  assert.equal(await page.locator('#guidcy-cookie-banner').isVisible(),false);
  assert.equal(analyticsRequests,0,'rejecting optional analytics sends no tracking requests');
  try{await page.waitForFunction(()=>document.querySelectorAll('.ccard').length>0,null,{timeout:30000})}catch(e){console.log(await page.evaluate(()=>({title:document.title,url:location.href,active:[...document.querySelectorAll('.page.on')].map(x=>x.id),cards:[...document.querySelectorAll('[class*=card]')].slice(0,15).map(x=>x.className),script:typeof window.guidcyLoadPdfJs})));console.log(errors);throw e}
  const pdf=await page.evaluate(async()=>{
   const lib=await window.guidcyLoadPdfJs();
   const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];
   let doc='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(doc.length);doc+=(i+1)+' 0 obj\n'+o+'\nendobj\n'});
   const xref=doc.length;doc+='xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
   const task=lib.getDocument({data:new TextEncoder().encode(doc),isEvalSupported:false});const loaded=await task.promise;
   const page=await loaded.getPage(1);const viewport=page.getViewport({scale:1});const canvas=document.createElement('canvas');canvas.width=200;canvas.height=200;
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   const result={version:lib.version,pages:loaded.numPages};await task.destroy();return result;
  });
  assert.equal(pdf.version,'6.3.289');assert.equal(pdf.pages,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: live cookie banner, analytics opt-in, mobile expert directory, CSP-compatible scripts and PDF.js 6 first-page rendering.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
