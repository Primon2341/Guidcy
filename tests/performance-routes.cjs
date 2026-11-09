/* Deterministic route lab: production assets, fixture accounts/data, no live writes.
 * Usage: NODE_PATH=... node tests/performance-routes.cjs <build-root> <output.json>
 * These are lab timings and API invocation counts, not field INP or backend latency. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||'public'),output=process.argv[3];
const {metaFor}=require('../assets/js/seo');
const source=fs.readFileSync(path.join(__dirname,'browser-flow.test.cjs'),'utf8'),start=source.indexOf('const fakeSupabase =');
let sdk=vm.runInNewContext(source.slice(start,source.indexOf('\n(async',start))+'\nfakeSupabase');
sdk=sdk.replace('function query(table){','function query(table){window.__apiCalls.push(table);');
sdk=sdk.replace('rpc:function(){return Promise.resolve({data:[],error:null})}',`rpc:function(name,args){
 window.__apiCalls.push('rpc:'+name);
 if(name==='community_profile')return Promise.resolve({data:{id:args.p_id,name:'Test Expert',headline:'Career Coach',company:'Example',consultant_id:'test-expert',expertise:['Career'],followers:0,following:0},error:null});
 return Promise.resolve({data:[],error:null});
}`);
sdk+=';if(window.__perfRole==="guest"){const original=window.supabase.createClient;window.supabase.createClient=function(){const c=original();c.auth.getSession=async()=>({data:{session:null}});c.auth.getUser=async()=>({data:{user:null}});return c;}}';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');let file=path.join(root,u.pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file))file=path.join(root,'index.html');
 let body=u.pathname==='/assets/vendor/supabase.js'?Buffer.from(sdk):fs.readFileSync(file);
 const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream'};
 if(/gzip/.test(req.headers['accept-encoding']||'')){body=zlib.gzipSync(body);headers['Content-Encoding']='gzip';}
 res.writeHead(200,headers);res.end(body);
});
const routes=[['/','user'],['/find-experts','user'],['/consultant/test-expert','user'],['/dashboard','user'],['/consultant-dashboard','consultant'],['/admin-dashboard','admin'],['/login','guest'],['/signup','guest'],['/webinars','user'],['/marketplace','user'],['/blog','user'],['/find-jobs','user'],['/career-ai-finder','user'],['/careers','user']];
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
 try{for(const [route,role] of routes.filter(([route])=>!process.env.GUIDCY_AUDIT_ROUTE||process.env.GUIDCY_AUDIT_ROUTE.split(',').includes(route))){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(role=>{
   window.__perfRole=role;window.__apiCalls=[];window.__perf={cls:0,lcp:0,events:[],longTasks:0};
   for(const type of ['largest-contentful-paint','layout-shift','event','longtask'])new PerformanceObserver(list=>{for(const e of list.getEntries()){
    if(type==='largest-contentful-paint')window.__perf.lcp=e.startTime;
    if(type==='layout-shift'&&!e.hadRecentInput)window.__perf.cls+=e.value;
    if(type==='event'&&e.interactionId)window.__perf.events.push(e.duration);
    if(type==='longtask')window.__perf.longTasks+=e.duration;
   }}).observe({type,buffered:true,durationThreshold:16});
   const id=role==='consultant'?'expert-profile':role==='admin'?'admin-user':'test-user';
   window.__guidcyTestAuthUser={id,email:role+'@example.com',user_metadata:{full_name:'Test '+role,role}};
   window.__guidcyTestProfile={id,full_name:'Test '+role,role,email:role+'@example.com'};
  },role);
  await context.route('**/*',r=>{
   const u=r.request().url();if(u.startsWith(origin)&&!u.includes('/api/'))return r.continue();
   return r.fulfill({contentType:'application/json',body:JSON.stringify(u.includes('service=seo')?{body:'<div class="blog-landing"><h1>Guidcy Blog</h1></div>',meta:metaFor('/blog')}:[])});
  });
  const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8});
  await page.goto(origin+route,{waitUntil:'load'});await page.waitForTimeout(3500);
  const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const data=await page.evaluate(()=>({url:location.pathname,active:document.querySelector('.page.on')?.id,content:document.querySelector('.page.on')?.innerText.slice(0,180),...window.__perf,apiCalls:window.__apiCalls,resources:performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,transfer:r.transferSize,decoded:r.decodedBodySize})),dom:document.getElementsByTagName('*').length}));
  await page.locator('#mobile-burger').click();await page.waitForTimeout(200);
  data.menuInteractionMs=await page.evaluate(()=>Math.max(0,...window.__perf.events));
  const row={route,role,errors,metrics,...data};results.push(row);console.log(JSON.stringify({route,lcp:data.lcp,cls:data.cls,scriptMs:metrics.ScriptDuration*1000,requests:data.resources.length,apiCalls:data.apiCalls.length,errors}));
  await context.close();
 }
 if(output)fs.writeFileSync(output,JSON.stringify({environment:{chrome:await browser.version(),cpu:4,network:'1.6 Mbps / 150ms latency',data:'mock SDK, fixture accounts, empty public collections'},results},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
