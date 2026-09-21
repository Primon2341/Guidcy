/* Reproducible production-build lab audit. Real SDK/assets; deterministic,
 * read-only empty API fixtures. No production credentials or writes are used.
 * NODE_PATH must include locally installed playwright and lighthouse packages.
 * Usage: node tests/performance-audit.cjs <output-dir> [production-dir] [runs]
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const out = path.resolve(process.argv[2] || '/private/tmp/guidcy-performance');
const root = path.resolve(process.argv[3] || 'public');
const runs = Number(process.argv[4] || 3);
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const lighthouseCLI = require.resolve('lighthouse/cli/index.js');
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon'};
const fixture = `<script>
window.__auditReads=[];
const auditFetch=window.fetch.bind(window);
window.fetch=function(input,init){
 const u=new URL(typeof input==='string'?input:input.url,location.href);
 if(u.hostname.endsWith('.supabase.co')){
  if(((init&&init.method)||input.method||'GET').toUpperCase()==='GET')window.__auditReads.push(u.pathname+u.search);
  return auditFetch('/__fixture'+u.pathname+u.search,init);
 }
 if(u.origin!==location.origin)return auditFetch('/__external');
 return auditFetch(input,init);
};
</script>`;
const server = http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__fixture')||url.pathname.startsWith('/api/')||url.pathname==='/__external'){
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json','Content-Range':'*/0'});res.end(url.pathname.startsWith('/__fixture')?'[]':JSON.stringify({results:[],jobs:[],data:[],opportunities:[]}));},100);
  return;
 }
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file))file=path.join(root,'index.html');
 const ext=path.extname(file);
 let body=fs.readFileSync(file);
 if(ext==='.html')body=Buffer.from(body.toString().replace('<head>','<head>'+fixture));
 const headers={'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=3600'};
 if(/gzip/.test(req.headers['accept-encoding']||'')&&/\.(html|js|css|svg)$/.test(file)){body=zlib.gzipSync(body);headers['Content-Encoding']='gzip';}
 res.writeHead(200,headers);res.end(body);
});
function cli(args){return new Promise((resolve,reject)=>{let stderr='';const child=spawn(process.execPath,[lighthouseCLI,...args],{env:{...process.env,CHROME_PATH:chrome},stdio:['ignore','ignore','pipe']});child.stderr.on('data',v=>{stderr+=v});child.on('error',reject);child.on('close',code=>code?reject(new Error(stderr)):resolve());});}
function summarize(lhr){
 const a=lhr.audits;
 const value=id=>a[id]?.numericValue;
 const requests=a['network-requests'].details.items;
 return {performance:Math.round(lhr.categories.performance.score*100),lcpMs:value('largest-contentful-paint'),cls:value('cumulative-layout-shift'),tbtMs:value('total-blocking-time'),ttfbMs:value('server-response-time'),mainThreadMs:value('mainthread-work-breakdown'),jsExecutionMs:value('bootup-time'),requests:requests.length,jsDecodedBytes:requests.filter(r=>r.resourceType==='Script').reduce((s,r)=>s+r.resourceSize,0),transferBytes:requests.reduce((s,r)=>s+r.transferSize,0),warnings:lhr.runWarnings};
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 console.log('Audit server: '+origin);
 const reports=[];
 try{
  for(let i=0;i<runs;i++){
   const prefix=path.join(out,'lighthouse-home-'+(i+1));
   await cli([origin+'/', '--only-categories=performance','--output=json','--output=html','--output-path='+prefix,'--chrome-flags=--headless --no-sandbox','--quiet']);
   const report=summarize(JSON.parse(fs.readFileSync(prefix+'.report.json')));
   reports.push(report);console.log(JSON.stringify({run:i+1,...report}));
  }
  const browser=await chromium.launch({headless:true,executablePath:chrome});
  try{
   const routes=[];
   for(const route of ['/','/find-experts','/marketplace','/webinars','/find-jobs','/careers']){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const page=await context.newPage();const cdp=await context.newCDPSession(page);
    await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    await cdp.send('Profiler.startPreciseCoverage',{callCount:true,detailed:true});
    await page.addInitScript(()=>{
     window.__lab={longTasks:[],shifts:[],events:[],writes:{}};
     for(const [type,key] of [['longtask','longTasks'],['layout-shift','shifts'],['event','events']]){
      try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab[key].push({duration:e.duration,value:e.value,hadRecentInput:e.hadRecentInput,interactionId:e.interactionId});}).observe({type,buffered:true,durationThreshold:16});}catch(_){}
     }
     const inner=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
     Object.defineProperty(Element.prototype,'innerHTML',{...inner,set(value){if(this.id)window.__lab.writes[this.id]=(window.__lab.writes[this.id]||0)+1;inner.set.call(this,value);}});
    });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+route,{waitUntil:'load'});await page.waitForTimeout(6000);
    const loaded=await cdp.send('Performance.getMetrics');
    const profile=await cdp.send('Profiler.stop');
    const coverage=await cdp.send('Profiler.takePreciseCoverage');
    const name=route==='/'?'home':route.slice(1);
    fs.writeFileSync(path.join(out,name+'.cpuprofile'),JSON.stringify(profile.profile));
    fs.writeFileSync(path.join(out,name+'-coverage.json'),JSON.stringify(coverage));
    await page.screenshot({path:path.join(out,name+'.png')});
    // A real tap followed by paint; this is a lab interaction sample, not field INP.
    await page.locator('#mobile-burger').click();await page.waitForTimeout(300);
    await page.locator('#gmob-drawer .gmob-item').filter({hasText:'Categories'}).first().click();await page.waitForTimeout(1200);
    const data=await page.evaluate(()=>({lab:window.__lab,reads:window.__auditReads,resources:performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,size:r.decodedBodySize})),documents:performance.getEntriesByType('navigation').length}));
    const counts={};for(const read of data.reads)counts[read]=(counts[read]||0)+1;
    const result={route,errors,metrics:Object.fromEntries(loaded.metrics.map(m=>[m.name,m.value])),...data,duplicateReads:Object.entries(counts).filter(([,n])=>n>1)};
    routes.push(result);console.log(JSON.stringify({route,errors,reads:data.reads.length,duplicateReads:result.duplicateReads,writes:Object.entries(data.lab.writes).sort((a,b)=>b[1]-a[1]).slice(0,8)}));
    await context.close();
   }
   const assets=fs.readdirSync(path.join(root,'assets/js')).filter(f=>f.endsWith('.js')).map(file=>{const content=fs.readFileSync(path.join(root,'assets/js',file));return {file,bytes:content.length,gzipBytes:zlib.gzipSync(content).length};});
   fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({environment:{chrome:await browser.version(),lighthouse:require('lighthouse/package.json').version,cpu:4,fixtures:'empty read-only API responses, 100ms latency; real local Supabase SDK',root},lighthouse:reports,assets,routes},null,2));
  }finally{await browser.close();}
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
