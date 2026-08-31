const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', 'public');
const desktopMode = process.argv.includes('--desktop');
const cpuProfileMode = process.argv.includes('--cpu-profile');
const port = desktopMode ? 3052 : 3051;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.xml':'application/xml'};
let server;
let browser;

function serve(req,res){
  const pathname=decodeURIComponent(new URL(req.url,`http://127.0.0.1:${port}`).pathname);
  let file=path.join(root,pathname.replace(/^\/+/,''));
  if(pathname==='/')file=path.join(root,'index.html');
  else if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  else if(!fs.existsSync(file))file=path.join(root,'index.html');
  const ext=path.extname(file);
  res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}

const fakeSupabase=`
(function(){
  var user={id:'perf-user',email:'perf@example.com',user_metadata:{full_name:'Perf User',role:'user'}};
  function query(table){var q={};['select','eq','neq','gte','lte','gt','lt','in','or','ilike','order','limit','range','filter','match','contains','upsert','insert','update','delete'].forEach(function(k){q[k]=function(){return q}});q.single=function(){return Promise.resolve({data:table==='profiles'?{id:user.id,email:user.email,full_name:'Perf User',role:'user'}:null,error:null})};q.maybeSingle=q.single;q.then=function(resolve,reject){return Promise.resolve({data:[],error:null,count:0}).then(resolve,reject)};q.catch=function(fn){return Promise.resolve({data:[],error:null}).catch(fn)};return q}
  window.supabase={createClient:function(){return {auth:{getSession:function(){return Promise.resolve({data:{session:{user:user,access_token:'perf-token'}}})},getUser:function(){return Promise.resolve({data:{user:user}})},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:function(){return Promise.resolve({error:null})}},from:function(table){return query(table)},storage:{from:function(){return {download:function(){return Promise.resolve({data:null,error:null})}}}}}}};
})();`;

async function metrics(cdp){
  const result=await cdp.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map(metric=>[metric.name,metric.value]));
}

(async()=>{
  server=http.createServer(serve);
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext(desktopMode?
    {viewport:{width:1440,height:900},deviceScaleFactor:1}:
    {viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await context.route('**/assets/vendor/supabase.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:fakeSupabase}));
  await context.addInitScript(()=>{
    window.__guidcyLongTasks=[];
    try{new PerformanceObserver(list=>list.getEntries().forEach(entry=>window.__guidcyLongTasks.push(entry.duration))).observe({type:'longtask',buffered:true})}catch(_){}
  });
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:desktopMode?2:4});
  if(cpuProfileMode){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:100});await cdp.send('Profiler.start')}
  const started=Date.now();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#page-home.on',{timeout:30000});
  const homeReadyMs=Date.now()-started;
  let cpuHotspots=[];
  if(cpuProfileMode){
    await page.waitForTimeout(1200);
    const stopped=await cdp.send('Profiler.stop');
    cpuHotspots=(stopped.profile.nodes||[]).filter(node=>node.hitCount).sort((a,b)=>(b.hitCount||0)-(a.hitCount||0)).slice(0,24).map(node=>({
      functionName:node.callFrame.functionName||'(anonymous)',
      file:new URL(node.callFrame.url||'http://local/').pathname.split('/').pop(),
      line:node.callFrame.lineNumber+1,
      hits:node.hitCount
    }));
  }
  await page.waitForTimeout(2500);
  const before=await metrics(cdp);
  const clickStarted=Date.now();
  if(desktopMode){
    await page.locator('#nav-links .nav-link').filter({hasText:'Categories'}).first().click();
  }else{
    await page.locator('#mobile-burger').click();
    await page.waitForSelector('#gmob-drawer.open');
    const item=page.locator('#gmob-drawer .gmob-item').filter({hasText:'Categories'});
    await item.scrollIntoViewIfNeeded();
    await item.click();
  }
  await page.waitForSelector('#page-categories.on',{timeout:30000});
  const categoryReadyMs=Date.now()-clickStarted;
  await page.waitForTimeout(2500);
  const after=await metrics(cdp);
  const browserData=await page.evaluate(()=>({
    longTasks:window.__guidcyLongTasks||[],
    nodes:document.getElementsByTagName('*').length,
    resources:performance.getEntriesByType('resource').map(entry=>({name:new URL(entry.name).pathname.split('/').pop(),transferSize:entry.transferSize,decodedBodySize:entry.decodedBodySize,duration:entry.duration})).filter(entry=>/\.(js|css)$/.test(entry.name))
  }));
  const report={
    passed:true,
    mode:desktopMode?'desktop-2x-cpu':'mobile-4x-cpu',
    homeReadyMs,
    categoryReadyMs,
    taskDurationMs:Math.round((after.TaskDuration-before.TaskDuration)*1000),
    scriptDurationMs:Math.round((after.ScriptDuration-before.ScriptDuration)*1000),
    layoutDurationMs:Math.round((after.LayoutDuration-before.LayoutDuration)*1000),
    recalcStyleDurationMs:Math.round((after.RecalcStyleDuration-before.RecalcStyleDuration)*1000),
    longTaskCount:browserData.longTasks.length,
    longTaskTotalMs:Math.round(browserData.longTasks.reduce((sum,value)=>sum+value,0)),
    maxLongTaskMs:Math.round(Math.max(0,...browserData.longTasks)),
    nodes:browserData.nodes,
    resources:browserData.resources,
    ...(cpuProfileMode?{cpuHotspots}:{})
  };
  assert.ok(homeReadyMs<(desktopMode?1800:4000),`${report.mode} home took ${homeReadyMs} ms`);
  assert.ok(categoryReadyMs<(desktopMode?1500:4000),`${report.mode} category navigation took ${categoryReadyMs} ms`);
  assert.ok(report.taskDurationMs<(desktopMode?1800:5000),`${report.mode} main-thread work took ${report.taskDurationMs} ms`);
  console.log(JSON.stringify(report,null,2));
  await browser.close();browser=null;
  await new Promise(resolve=>server.close(resolve));server=null;
})().catch(async error=>{
  console.error(error&&error.stack||error);
  try{if(browser)await browser.close()}catch(_){}
  try{if(server)await new Promise(resolve=>server.close(resolve))}catch(_){}
  process.exitCode=1;
});
