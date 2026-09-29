const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {handler}=require('../lib/seo-public');
const source=fs.readFileSync(path.join(__dirname,'browser-flow.test.cjs'),'utf8'),start=source.indexOf('const fakeSupabase =');
const fixture=vm.runInNewContext(source.slice(start,source.indexOf('\n(async',start))+'\nfakeSupabase')
 .replace('function query(table){','function query(table){ if(table===\'blog_posts\')return window.__blogQuery();')
 .replace("rpc:function(){return Promise.resolve({data:[],error:null})}","rpc:function(name){return Promise.resolve({data:name==='guidcy_is_admin'?window.__blogAllowed:[],error:null})}");
const root=path.resolve(__dirname,'../public');
let posts=[],failWrite=false;
const seed=()=>({id:'11111111-1111-4111-8111-111111111111',title:'Published guidance',slug:'published-guidance',excerpt:'A useful guide for readers.',author:'Guidcy',category:'Guidance',content:[{type:'p',children:['Original article body.']}],status:'published',published_at:'2026-05-10T00:00:00Z',first_published_at:'2026-05-10T00:00:00Z',created_at:'2026-05-10T00:00:00Z',updated_at:'2026-05-10T00:00:00Z',version:1});
// Keep public rendering real, replace only the remote database transport.
global.fetch=async raw=>{
 const url=new URL(raw);let data=[];
 if(url.pathname.endsWith('/blog_posts')){
  data=posts.filter(p=>p.status==='published'&&Date.parse(p.published_at)<=Date.now());
  if(url.searchParams.has('slug'))data=data.filter(p=>p.slug===url.searchParams.get('slug').slice(3));
  const offset=Number(url.searchParams.get('offset')||0);data=data.slice(offset,offset+Number(url.searchParams.get('limit')||1000));
 }
 return {ok:true,json:async()=>data};
};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/__blogdb'){
  let body='';for await(const chunk of req)body+=chunk;
  const {op,value,filters,single,allowed}=JSON.parse(body);
  let result={data:null,error:null};
  if(!allowed)result.error={message:'Denied'};
  else if(op!=='select'&&failWrite)result.error={message:'Unable to save right now'};
  else {
   let rows=posts.filter(p=>filters.every(([key,val])=>p[key]===val));
   if(op==='insert'){
    if(posts.some(p=>p.slug===value.slug))result.error={code:'23505'};
    else{const p={...value,id:require('node:crypto').randomUUID(),version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};if(p.status==='published'){p.published_at||=new Date().toISOString();p.first_published_at=new Date().toISOString();}posts.unshift(p);rows=[p];}
   }
   if(op==='update')rows.forEach(p=>{Object.assign(p,value);p.version++;p.updated_at=new Date().toISOString();if(p.status==='published'){p.published_at||=new Date().toISOString();p.first_published_at||=new Date().toISOString();}});
   if(op==='delete')posts=posts.filter(p=>!rows.includes(p));
   result.data=single?rows[0]:rows;
   if(single&&!rows.length)result.error={code:'PGRST116'};
  }
  res.setHeader('content-type','application/json');return res.end(JSON.stringify(result));
 }
 if(url.pathname==='/api/jobs'||url.pathname==='/blog'||url.pathname.startsWith('/blog/')){
  req.query=Object.fromEntries(url.searchParams);req.query.path||=url.pathname;return handler(req,res);
 }
 let file=path.join(root,url.pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file))file=path.join(root,'index.html');
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{let browser;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [390,1280]){
  posts=[seed()];failWrite=false;
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(()=>{
   window.__blogAllowed=true;
   window.__guidcyTestAuthUser={id:'test-admin',email:'admin@example.com',user_metadata:{full_name:'Test Admin',role:'admin'}};
   window.__guidcyTestProfile={id:'test-admin',email:'admin@example.com',full_name:'Test Admin',role:'admin'};
   localStorage.setItem('guidcy_cookie_consent_v1',JSON.stringify({version:1,analytics:false,savedAt:Date.now()}));
   localStorage.setItem('guidcy_blog_posts',JSON.stringify([{title:'PRIVATE LOCAL CONTENT',body:'Never render me'}]));
   window.__blogQuery=()=>{
    let op='select',value,filters=[],single=false;const q={};
    for(const name of ['select','order','range'])q[name]=()=>q;
    q.eq=(key,val)=>{filters.push([key,val]);return q;};
    for(const name of ['insert','update','delete'])q[name]=v=>{op=name;value=v;return q;};
    q.single=()=>{single=true;return q;};
    q.then=(ok,bad)=>fetch('/__blogdb',{method:'POST',body:JSON.stringify({op,value,filters,single,allowed:window.__blogAllowed})}).then(r=>r.json()).then(ok,bad);
    return q;
   };
  });
  await context.route('**/*',route=>{const url=route.request().url();if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(!url.startsWith(origin))return route.abort();return route.continue()});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(origin+'/admin-dashboard?tab=blog');
  await page.getByRole('button',{name:'Create article',exact:true}).waitFor({timeout:15000});
  await page.getByRole('button',{name:'Create article',exact:true}).click();
  await page.locator('#blog-title').fill('New useful article');await page.locator('#blog-excerpt').fill('An excerpt for the new article.');
  await page.locator('#blog-content').fill('Rich text body for the new article.');
  await page.locator('#blog-meta_title').fill('Custom search title');await page.locator('#blog-meta_description').fill('Custom search description.');
  page.removeAllListeners('dialog');page.once('dialog',d=>d.dismiss());
  await page.locator('#page-admin-dash [data-admin-section=users]').evaluate(button=>button.click());
  assert.equal(await page.locator('#blog-title').inputValue(),'New useful article','cancelled navigation preserves edits');
  page.on('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Preview',exact:true}).click();await page.locator('dialog h1').filter({hasText:'New useful article'}).waitFor();
  assert.equal(posts.length,1,'preview does not persist');await page.getByRole('button',{name:'Close preview'}).click();
  await page.screenshot({path:'/private/tmp/guidcy-blog-editor-'+width+'.png',fullPage:true});
  await page.waitForTimeout(2500);assert.equal(await page.locator('#blog-title').inputValue(),'New useful article','background refresh preserves edits');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'editor fits viewport');
  await page.getByRole('button',{name:'Save article'}).click();await page.getByRole('button',{name:'Create article',exact:true}).waitFor();
  assert.equal(posts.length,2);assert.equal(posts[0].status,'draft');
  const slug=posts[0].slug;
  const draftResponse=await context.request.get(origin+'/blog/'+slug);assert.equal(draftResponse.status(),404);assert.ok(!(await draftResponse.text()).includes('Rich text body'));
  let row=page.locator('.blog-admin-row').filter({hasText:'New useful article'});
  await row.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#blog-title').fill('Edited useful article');
  failWrite=true;await page.getByRole('button',{name:'Save article'}).click();await page.locator('#blog-edit-error').filter({hasText:'Unable to save'}).waitFor();assert.equal(await page.locator('#blog-title').inputValue(),'Edited useful article');assert.equal(posts[0].title,'New useful article');
  failWrite=false;await page.getByRole('button',{name:'Save article'}).click();await page.getByRole('button',{name:'Create article',exact:true}).waitFor();
  row=page.locator('.blog-admin-row').filter({hasText:'Edited useful article'});await row.getByRole('button',{name:'Publish',exact:true}).click();await row.getByRole('button',{name:'Unpublish',exact:true}).waitFor();
  await page.goto(origin+'/blog/'+slug);await page.locator('#blog-list h1').filter({hasText:'Edited useful article'}).waitFor();await page.waitForTimeout(1800);
  assert.equal(new URL(page.url()).pathname,'/blog/'+slug);assert.equal(await page.title(),'Custom search title');assert.ok(!(await page.locator('#blog-list').textContent()).includes('PRIVATE LOCAL'));
  assert.equal(await page.locator('meta[property="og:type"]').getAttribute('content'),'article');assert.equal(await page.locator('#blog-list h1').count(),1);
  await page.screenshot({path:'/private/tmp/guidcy-blog-article-'+width+'.png',fullPage:true});
  await page.reload();await page.locator('#blog-list h1').filter({hasText:'Edited useful article'}).waitFor();
  await page.locator('#blog-list nav a[href="/blog"]').click();await page.locator('.blog-card').first().waitFor();
  assert.equal(await page.locator('.blog-card').count(),2);
  await page.goto(origin+'/admin-dashboard?tab=blog');await page.getByRole('button',{name:'Create article',exact:true}).waitFor();
  row=page.locator('.blog-admin-row').filter({hasText:'Edited useful article'});await row.getByRole('button',{name:'Unpublish',exact:true}).click();await row.getByRole('button',{name:'Publish',exact:true}).waitFor();
  assert.equal((await context.request.get(origin+'/blog/'+slug)).status(),404);
  await row.getByRole('button',{name:'Delete',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.blog-admin-row').length===1);assert.equal(posts.length,1);
  await page.evaluate(()=>{window.__blogAllowed=false;return window.GuidcyBlog.renderAdmin()});await page.getByRole('alert').filter({hasText:'Administrator access is required'}).waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS '+width+'px: draft, preview, edit, denied save, publish, SSR route/refresh, unpublish, delete and admin guard');
  await context.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1});
