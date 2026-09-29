const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const js=fs.readFileSync('assets/js/cookie-consent.js','utf8');
const css=fs.readFileSync('assets/css/cookie-consent.css','utf8');
const key='guidcy_cookie_consent_v1';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
 for(const width of [1280,320]){
  const context=await browser.newContext({viewport:{width,height:800}});let scripts=0,events=0;
  await context.route('https://www.guidcy.com/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/_vercel/insights/script.js'){
    scripts++;return route.fulfill({contentType:'application/javascript',body:`let filter;window.va=function(type,fn){if(type==='beforeSend')filter=fn};(window.vaq||[]).forEach(args=>window.va(...args));window.sendTestEvent=function(){if(filter({type:'pageview',url:location.href}))fetch('/_vercel/insights/view',{method:'POST'})};sendTestEvent();`});
   }
   if(path==='/_vercel/insights/view'){events++;return route.fulfill({body:'{}'})}
   return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial}main{min-height:1100px}${css}</style></head><body><main>Guidcy fixture</main><button data-cookie-settings>Cookie settings</button><script>${js}</script></body></html>`});
  });
  const page=await context.newPage();await page.goto('https://www.guidcy.com/');
  assert.equal(scripts,0);assert.equal(await page.locator('#guidcy-cookie-banner').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no mobile horizontal overflow');
  await page.evaluate(()=>localStorage.setItem('sb-auth-fixture','keep-me'));
  await page.locator('#guidcy-cookie-banner [data-cookie-choice="reject"]').click();
  await page.reload();assert.equal(scripts,0);assert.equal(await page.locator('#guidcy-cookie-banner').isVisible(),false);
  await page.locator('body > [data-cookie-settings]').click();
  assert.equal(await page.locator('#gc-analytics').isChecked(),false);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);
  await page.locator('body > [data-cookie-settings]').click();await page.locator('#gc-analytics').check();await page.locator('[data-cookie-save]').click();
  await page.waitForFunction(()=>typeof window.sendTestEvent==='function');await page.waitForTimeout(100);
  assert.equal(scripts,1);assert.equal(events,1);
  await page.locator('body > [data-cookie-settings]').click();await page.locator('dialog [data-cookie-choice="reject"]').click();
  await page.evaluate(()=>{history.pushState({},'', '/marketplace');window.sendTestEvent()});await page.waitForTimeout(100);
  assert.equal(events,1,'withdrawal stops subsequent analytics without reload');
  assert.equal(await page.evaluate(()=>localStorage.getItem('sb-auth-fixture')),'keep-me');
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({version:1,analytics:true,savedAt:Date.now()-181*86400000})),key);await page.reload();
  assert.equal(scripts,1,'expired consent cannot load analytics');assert.equal(await page.locator('#guidcy-cookie-banner').isVisible(),true);
  await page.locator('#guidcy-cookie-banner [data-cookie-settings]').click();assert.equal(await page.locator('#gc-analytics').isChecked(),false);
  await page.keyboard.press('Escape');await page.locator('#guidcy-cookie-banner [data-cookie-choice="accept"]').click();
  await page.waitForFunction(()=>typeof window.sendTestEvent==='function');
  const other=await context.newPage();await other.goto('https://www.guidcy.com/');
  await other.locator('body > [data-cookie-settings]').click();await other.locator('dialog [data-cookie-choice="reject"]').click();
  await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).analytics===false,key);
  const before=events;await page.evaluate(()=>window.sendTestEvent());await page.waitForTimeout(100);assert.equal(events,before,'withdrawal syncs across tabs');
  await context.close();console.log(width+': consent defaults, persistence, expiration, withdrawal, cross-tab sync, keyboard/modal and essential storage passed');
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
