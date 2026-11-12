// Fixture-only browser verification; no posts or engagement are written to Supabase.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const vm=require('node:vm');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'browser-flow.test.cjs'),'utf8');
const start=source.indexOf('const fakeSupabase =');
let sdk=vm.runInNewContext(source.slice(start,source.indexOf('\n(async',start))+'\nfakeSupabase');
const OWNER='11111111-1111-4111-8111-111111111111',EXPERT='22222222-2222-4222-8222-222222222222',MEMBER='33333333-3333-4333-8333-333333333333';
sdk=sdk.replaceAll('test-user',OWNER).replaceAll('expert-profile',EXPERT);
function socialFixture(){
 const owner='11111111-1111-4111-8111-111111111111',expert='22222222-2222-4222-8222-222222222222',member='33333333-3333-4333-8333-333333333333';
 const makeID=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');
 const people=[{id:owner,name:'Test User',headline:'Product Designer',professional_status:'open_to_work',professional_status_note:'Retired status fixture',public_contact_email:'private-fixture@example.com',website_url:'https://example.com/private',linkedin_url:'https://linkedin.com/in/private-fixture',company:'Guidcy',cover_path:owner+'/'+makeID(900)+'.webp',followers:0,following:0},{id:expert,name:'Test Expert',headline:'Career Coach',company:'Guidcy Technologies',consultant_id:'test-expert',expertise:['Career growth','Technology'],followers:0,following:0},{id:member,name:'Community Member',headline:'Software Engineer',company:'Example',college:'Test College',followers:0,following:0}];
 const tables=window.__social={community_posts:Array.from({length:15},(_,i)=>({id:makeID(i+1),author_id:i%2?member:expert,body:i===0?'A practical lesson from mentoring: ask better questions. <img src=x onerror=alert(1)>':i===2?'Detailed mentoring lesson. '.repeat(35):'Community perspective '+(i+1),kind:'Insight',image_path:null,image_alt:'',created_at:new Date(Date.now()-i*3600000-1000).toISOString(),updated_at:new Date(Date.now()-i*3600000-1000).toISOString()})),saved_consultants:[],community_likes:[],community_saves:[],community_follows:[],community_comments:[],profile_entries:[],profile_featured:[],community_organizations:[{id:makeID(901),kind:'company',name:'Guidcy',name_key:'guidcy',logo_url:'/assets/images/guidcy-mark.png',is_approved:true},{id:makeID(902),kind:'company',name:'Optical Research',name_key:'optical research',logo_url:'/assets/images/guidcy-mark.png',is_approved:true},{id:makeID(903),kind:'college',name:'IIT Roorkee',name_key:'iit roorkee',logo_url:'/assets/images/guidcy-mark.png',is_approved:true}]};
 let sequence=20;window.__socialQueries=[];window.__authListeners=[];window.__uploads=[];window.__removedImages=[];
 const native=window.supabase.createClient;
 window.supabase.createClient=function(){const c=native();const oldFrom=c.from;c.auth.getSession=async()=>({data:{session:window.__guest?null:{user:{id:owner,email:'user@example.com',user_metadata:{full_name:'Test User',role:'user'}},access_token:'fixture'}}});c.auth.onAuthStateChange=fn=>{window.__authListeners.push(fn);return {data:{subscription:{unsubscribe(){}}}}};
 c.from=table=>{
  if(table==='blog_posts'){const q={};for(const key of ['select','eq','ilike','order','limit'])q[key]=()=>q;q.then=resolve=>Promise.resolve({data:[],error:null}).then(resolve);return q;}if(!tables[table])return oldFrom(table);const q={};let filters=[],limit=Infinity,op='',values=null;
  q.in=(k,v)=>{filters.push(r=>v.includes(r[k]));return q};q.ilike=(k,v)=>{const query=v.replace(/^%|%$/g,'').toLowerCase();filters.push(r=>String(r[k]||'').toLowerCase().includes(query));return q};q.select=()=>q;q.neq=(k,v)=>{filters.push(r=>r[k]!==v);return q};q.is=(k,v)=>{filters.push(r=>r[k]==v);return q};q.eq=(k,v)=>{filters.push(r=>r[k]===v);return q};q.gt=(k,v)=>{filters.push(r=>r[k]>v);return q};q.order=()=>q;q.limit=n=>{limit=n;return q};q.or=()=>q;
  q.insert=q.upsert=v=>{op='insert';values=v;return q};q.update=v=>{op='update';values=v;return q};q.delete=()=>{op='delete';return q};
  const run=()=>{window.__socialQueries.push({table,op});if(window.__failSocial){window.__failSocial=false;return {data:null,error:{message:'Fixture failure'}};}let rows=tables[table].filter(r=>filters.every(f=>f(r)));
   if(op==='insert'){rows=[{id:makeID(sequence++),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...values}];tables[table].push(...rows);}
   if(op==='update')rows.forEach(r=>Object.assign(r,values,{updated_at:new Date().toISOString()}));
   if(op==='delete')tables[table]=tables[table].filter(r=>!rows.includes(r));
   if(table==='profile_entries'&&op){for(const id of new Set(rows.filter(r=>r.kind==='education').map(r=>r.profile_id))){const entry=tables.profile_entries.filter(r=>r.profile_id===id&&r.kind==='education').sort((a,b)=>String(b.start_date||'').localeCompare(String(a.start_date||'')))[0];Object.assign(people.find(p=>p.id===id),{college:entry?.organization||'',education:entry?.title||''});}}
   return {data:rows.slice(0,limit),error:null};};
  q.then=(resolve,reject)=>Promise.resolve(run()).then(resolve,reject);q.single=()=>{const r=run();return Promise.resolve({...r,data:r.data?.[0]||null})};return q;
 };
 c.rpc=async(name,args={})=>{
  window.__socialQueries.push({rpc:name,args});name=name.replace(/_with_documents$/,'');if(window.__failFeed&&name==='community_feed')return {data:null,error:{message:'Fixture offline'}};
  const uid=window.__guest?null:owner;
  if(name==='community_organization_matches'){
   const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase(),term=norm(args.p_query);
   const registered={id:makeID(904),kind:args.p_kind,name:'Guidcy Technologies',name_key:'guidcy technologies',logo_url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc1sAAAAASUVORK5CYII=',source:'consultant',consultant_id:'test-expert'};
   const rows=tables.community_organizations.filter(r=>r.kind===args.p_kind&&r.is_approved).map(r=>({...r,name_key:norm(r.name),source:'directory'}));if(!tables.community_organizations.some(r=>r.kind===args.p_kind&&norm(r.name)===registered.name_key))rows.push(registered);rows.push({...registered,id:makeID(905),name:'Guidcy Institute',name_key:'guidcy institute'});
   return {data:rows.filter(r=>args.p_names?args.p_names.map(norm).includes(r.name_key):term.length>=2&&r.name_key.includes(term)).sort((a,b)=>Number(b.name_key===term)-Number(a.name_key===term)||a.name_key.localeCompare(b.name_key)).slice(0,args.p_names?150:8),error:null};
  }
  if(name==='community_update_photo'){
   if(window.__failProfile){window.__failProfile=false;return {data:null,error:{message:'Fixture photo failure'}};}
   const p=people.find(p=>p.id===owner);if(args.p_kind==='cover')p.cover_path=args.p_value;else p.avatar_url=args.p_value||'';return {data:{id:owner,full_name:p.name,avatar_url:p.avatar_url||'',cover_path:p.cover_path||null},error:null};
  }
  if(name==='community_update_identity'){
   if(window.__failProfile){window.__failProfile=false;return {data:null,error:{message:'Fixture profile failure'}};}
   Object.assign(people.find(p=>p.id===owner),args.p_data,{cover_path:args.p_data.cover});return {data:null,error:null};
  }
  if(name==='community_update_professional'){
   if(window.__failProfile){window.__failProfile=false;return {data:null,error:{message:'Fixture profile failure'}};}
   const p=people.find(p=>p.id===owner);if(args.p_section==='intro')Object.assign(p,{name:args.p_data.name,headline:args.p_data.headline,bio:args.p_data.bio,cover_path:args.p_data.cover,company:args.p_data.company,city:args.p_data.city});
   if(args.p_section==='experience'){const old=p.company_experience||[];p.company_experience=args.p_data;const current=args.p_data.find(e=>e.currently_working);if(current)p.company=current.company_name;else if(old.some(e=>e.company_name===p.company))p.company='';}if(args.p_section==='skills'){p.skills=args.p_data;p.expertise=args.p_data;}return {data:null,error:null};
  }
  if(name==='community_featureable_webinars')return {data:[],error:null};
  if(name==='community_featured')return {data:tables.profile_featured.filter(f=>f.profile_id===args.p_id).map(f=>{const e=tables.profile_entries.find(e=>e.id===f.entry_id),p=tables.community_posts.find(p=>p.id===f.post_id);return {...f,kind:e?.kind||'Post',title:e?.title||p?.body||'Featured resource'};}),error:null};
  if(name==='community_profile'){await new Promise(r=>setTimeout(r,window.__profileDelay||150));const p=people.find(p=>p.id===args.p_id);return {data:p?{...p,followers:tables.community_follows.filter(f=>f.following_id===p.id).length,following:tables.community_follows.filter(f=>f.follower_id===p.id).length,is_following:tables.community_follows.some(f=>f.follower_id===uid&&f.following_id===p.id),bio:p.bio||'A short professional introduction.',city:p.city||'Delhi',education:p.education??'M.Tech Polymer Science',cover_path:p.cover_path||null}:null,error:null};}
  if(name==='community_update_profile'){Object.assign(people.find(p=>p.id===owner),{name:args.p_name,headline:args.p_headline,bio:args.p_bio,cover_path:args.p_cover});return {data:null,error:null};}
  if(name==='community_people')return {data:people.filter(p=>args.p_ids?args.p_ids.includes(p.id):p.consultant_id).map(p=>({...p,followers:tables.community_follows.filter(f=>f.following_id===p.id).length,following:tables.community_follows.filter(f=>f.follower_id===p.id).length,is_following:tables.community_follows.some(f=>f.following_id===p.id&&f.follower_id===uid)})),error:null};
  if(name==='community_profile_activity'){const r=await c.rpc('community_feed',{p_mode:'latest',p_author:args.p_id,p_before:args.p_before,p_before_id:args.p_before_id,p_kind:args.p_kind});return {...r,data:r.data.slice(0,6)}}
  if(name==='community_feed'){
   if(window.__holdFeed)await new Promise(resolve=>window.__releaseFeed=resolve);
   const followed=id=>tables.community_follows.some(f=>f.follower_id===uid&&f.following_id===id);
   let rows=tables.community_posts.filter(p=>(!args.p_post||p.id===args.p_post)&&(!args.p_kind||p.kind===args.p_kind)&&(!args.p_author||p.author_id===args.p_author)&&(args.p_mode!=='mine'||p.author_id===uid)&&(args.p_mode!=='saved'||tables.community_saves.some(s=>s.post_id===p.id&&s.user_id===uid))&&(args.p_mode!=='following'||followed(p.author_id))).map(p=>({...p,rank_at:new Date(Date.parse(p.created_at)+(args.p_mode==='community'&&followed(p.author_id)&&!args.p_post&&!args.p_author?43200000:0)).toISOString(),likes:tables.community_likes.filter(l=>l.post_id===p.id).length,comments:tables.community_comments.filter(l=>l.post_id===p.id).length,liked:tables.community_likes.some(l=>l.post_id===p.id&&l.user_id===uid),saved:tables.community_saves.some(l=>l.post_id===p.id&&l.user_id===uid)}));
   rows.sort((a,b)=>b.rank_at.localeCompare(a.rank_at)||b.id.localeCompare(a.id));if(args.p_before)rows=rows.filter(p=>p.rank_at<args.p_before||(p.rank_at===args.p_before&&p.id<args.p_before_id));return {data:rows.slice(0,13),error:null};
  }return {data:[],error:null};
 };
 c.storage={from:bucket=>({getPublicUrl:()=>({data:{publicUrl:bucket==='community-documents'?'/assets/images/community-test.pdf':'/assets/images/footer-logo.webp'}}),upload:async(path,blob)=>{window.__uploads.push({bucket,path,size:blob.size,type:blob.type});return {data:{path},error:null}},remove:async paths=>{window.__removedImages.push(...paths);return {data:[],error:null}}})};return c;
 };
 const realFetch=window.fetch.bind(window);window.fetch=async(url,options)=>String(url).startsWith('data:')||String(url).includes('/assets/images/')?realFetch(url,options):new Response('[]',{headers:{'Content-Type':'application/json'}});
}
const fixture=sdk+'\n('+socialFixture.toString()+')();';
const root=path.resolve(process.env.GUIDCY_TEST_ROOT||path.join(__dirname,'../public'));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let file=path.join(root,url.pathname);if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1365,height:1000}});
 await context.route('**/*',route=>{const url=route.request().url();if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture});return url.startsWith(origin)?route.continue():route.abort();});
 await context.addInitScript(()=>{
  if(location.pathname.startsWith('/consultant/')||location.pathname==='/profile'){
   let uid='';try{uid=JSON.parse(localStorage.getItem('sb-lsthngfxehayeqyctkla-auth-token')||'null')?.user?.id||''}catch(_){}
   if(!JSON.parse(sessionStorage.getItem('guidcy:refresh:v1')||'{}')[location.pathname+location.search]?.regions?.['profile-layout']?.profileVersion)sessionStorage.setItem('guidcy:refresh:v1',JSON.stringify({[location.pathname+location.search]:{at:Date.now(),uid,page:'profile',regions:{'profile-layout':{html:'<div class="profile-hero"><div class="profile-avatar">OLD CACHED PROFILE</div></div>',height:1000,at:Date.now()}}}}));
  }
  sessionStorage.setItem('guidcy_hide_profile_card','1'); // Retired card preferences cannot affect the feed.
  window.__profileWidths=[];
  function captureWidth(){const hero=document.querySelector('#page-profile.on .gnet-profile-header');if(hero&&hero.getBoundingClientRect().width)window.__profileWidths.push(hero.getBoundingClientRect().width);requestAnimationFrame(captureWidth)}requestAnimationFrame(captureWidth);
  window.__legacyProfilePaints=[];
  new MutationObserver(()=>{if(document.querySelector('#page-profile.on .profile-avatar,#page-profile.on .profile-role,#page-profile.on .guidcy-profile-experience'))window.__legacyProfilePaints.push('legacy');}).observe(document,{childList:true,subtree:true});
 });
 // Slow public profile reads show only the shared animation for both profile types.
 for(const width of [390,1365])for(const route of ['/profile?member='+OWNER,'/consultant/test-expert']){
  const loadingPage=await context.newPage();await loadingPage.setViewportSize({width,height:900});await loadingPage.addInitScript(()=>window.__profileDelay=1000);
  await loadingPage.goto(origin+route);await loadingPage.locator('#guidcy-loading-status').waitFor();
  assert.equal(await loadingPage.locator('#profile-layout .gnet-skeleton,.gnet-placeholder-avatar,.gnet-placeholder-line').count(),0,'profiles contain no loading shapes');
  assert.equal(await loadingPage.locator('.gnet-profile-header').isVisible(),false,'the empty header card is hidden while loading');
  assert.equal(await loadingPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await loadingPage.screenshot({path:'/private/tmp/guidcy-profile-loading-'+(route.startsWith('/consultant')?'consultant':'member')+'-'+width+'.png'});
  await loadingPage.locator('.gnet-profile-header .profile-name').waitFor();await loadingPage.waitForSelector('[data-guidcy-profile-loading]',{state:'detached'});await loadingPage.locator('#guidcy-loading-status').waitFor({state:'hidden'});
  await loadingPage.close();
 }
 console.log('Member and consultant cold loads show only the loading animation at 390/1365px');
 const identityPage=await context.newPage();await identityPage.addInitScript(()=>window.__guest=true);
 await identityPage.goto(origin);
 await identityPage.locator('#gnet-compose-avatar img.gnet-brand').waitFor();
 await identityPage.locator('#gnet-compose-avatar img').evaluate(img=>img.decode());
 await identityPage.locator('#gnet-me .gnet-me-guest').waitFor();
 await identityPage.setViewportSize({width:390,height:900});assert.equal(await identityPage.locator('#gnet-me').isVisible(),false);assert.equal(await identityPage.locator('#gnet-mobile-avatar a').getAttribute('href'),'/login');await identityPage.locator('.gnet-mobile-compose').click();await identityPage.waitForSelector('#gnet-dialog');assert.match(await identityPage.locator('#gnet-dialog').innerText(),/Sign in to post/);await identityPage.locator('#gnet-dialog header [data-close]').click();await identityPage.setViewportSize({width:1365,height:1000});
 const loginPhoto='data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../favicon-96x96.png')).toString('base64');
 await identityPage.evaluate(async({owner,photo})=>{
  await window.guidcyGetSupabaseClient().rpc('community_update_photo',{p_kind:'avatar',p_value:photo});
  window.__guest=false;
  window.__authListeners.forEach(fn=>fn('SIGNED_IN',{user:{id:owner,email:'user@example.com',user_metadata:{full_name:'Test User',role:'user'}},access_token:'fixture'}));
 },{owner:OWNER,photo:loginPhoto});
 await identityPage.waitForFunction(photo=>document.querySelector('#gnet-compose-avatar img:not(.gnet-brand)')?.getAttribute('src')===photo,loginPhoto);
 await identityPage.locator('#nav-right a.avatar-chip').waitFor();assert.equal(await identityPage.locator('#nav-right a.avatar-chip').getAttribute('href'),'/profile?member='+OWNER);
 await identityPage.close();
 console.log('Guest logo loads; signing in replaces it with the account photo without reloading');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'no-preference'});
 // Opening cached expert results is a quiet background check, not an initial load.
 const expertsPage=await context.newPage();expertsPage.on('pageerror',e=>errors.push(e.message));await expertsPage.goto(origin+'/find-experts');await expertsPage.waitForSelector('#browse-grid .ccard');await expertsPage.waitForFunction(()=>/^Showing/.test(document.querySelector('#browse-count').textContent)&&document.querySelector('#browse-grid').getAttribute('aria-busy')!=='true');
 const visibleExperts=await expertsPage.locator('#browse-grid .ccard').count();
 await expertsPage.evaluate(()=>{const fetch=window.fetchConsultants;window.__browseReleases=[];window.__holdBrowse=true;window.fetchConsultants=async function(...args){const rows=await fetch.apply(this,args);if(window.__holdBrowse)await new Promise(resolve=>window.__browseReleases.push(resolve));return rows;};window.guidcyNavigate('/about');});await expertsPage.locator('#page-about.on').waitFor();await expertsPage.evaluate(()=>window.guidcyNavigate('/find-experts'));await expertsPage.waitForFunction(()=>window.__browseReleases.length>0);
 assert.equal(await expertsPage.locator('#browse-count').innerText(),'Showing '+visibleExperts+' expert'+(visibleExperts===1?'':'s'));assert.equal(await expertsPage.locator('#browse-grid .ccard').count(),visibleExperts);assert.equal(await expertsPage.locator('#guidcy-loading-status').isVisible(),false,'cached expert cards do not show a global loading overlay');
 await expertsPage.evaluate(()=>{window.__holdBrowse=false;window.__browseReleases.forEach(resolve=>resolve());});await expertsPage.waitForFunction(()=>document.querySelector('#browse-grid').getAttribute('aria-busy')==='false');
 await expertsPage.evaluate(owner=>{localStorage.setItem('sb-lsthngfxehayeqyctkla-auth-token',JSON.stringify({user:{id:owner}}));window.guidcySavePageShell();},OWNER);
 let releaseExpertsApp;await expertsPage.route('**/assets/js/app.js*',async route=>{await new Promise(resolve=>releaseExpertsApp=resolve);await route.continue();});await expertsPage.reload({waitUntil:'commit'});await expertsPage.waitForSelector('#browse-grid .ccard');assert.equal(await expertsPage.locator('#browse-count').innerText(),'Showing '+visibleExperts+' expert'+(visibleExperts===1?'':'s'),'restored count matches restored cards before app.js runs');releaseExpertsApp();await expertsPage.waitForFunction(()=>window.__guidcyAuthReadyFired&&document.querySelector('#browse-grid').getAttribute('aria-busy')==='false'&&!document.querySelector('#browse-grid').hasAttribute('data-guidcy-restored'));await expertsPage.unroute('**/assets/js/app.js*');await expertsPage.close();
 console.log('Expert cards keep their actual count during background checks and hard refresh restoration');
 await page.goto(origin);await page.waitForSelector('.gnet-post');await page.waitForFunction(()=>document.querySelector('#gnet-compose-avatar .gnet-avatar')&&document.querySelector('#nav-right a.avatar-chip'));
 const dashboardAppearance=()=>page.locator('#nav-right #guidcy-dashboard-btn').evaluate(el=>({radius:getComputedStyle(el).borderRadius,height:el.getBoundingClientRect().height,background:getComputedStyle(el).backgroundColor}));
 const homeDashboard=await dashboardAppearance();assert.equal(homeDashboard.height,36,'Dashboard is only slightly shorter while retaining its width and text');assert.equal(homeDashboard.background,'rgb(30, 114, 190)');assert.ok(parseFloat(homeDashboard.radius)>=homeDashboard.height/2);
 await page.locator('#nav-right #guidcy-dashboard-btn').click();await page.waitForSelector('#page-user-dash.on');await page.mouse.move(2,700);await page.waitForTimeout(180);assert.deepEqual(await dashboardAppearance(),homeDashboard,'Dashboard keeps its original size and rounded design after navigation');await page.locator('#nav-right a.avatar-chip').click();await page.waitForSelector('#page-profile.on #gnet-member');await page.waitForTimeout(1200);assert.match(page.url(),/profile\?member=/,'late dashboard updates cannot replace the profile');await page.goBack();await page.waitForSelector('#page-user-dash.on');await page.evaluate(()=>window.guidcyNavigate('/'));await page.waitForSelector('#page-home.on');await page.waitForSelector('.gnet-post');

 await page.locator('#guidcy-cookie-banner [data-cookie-choice=reject]').click();
 // Guidcy AI shares the global modal lock, restores the page offset, and keeps its own content scrollable.
 await page.evaluate(()=>window.scrollTo({top:500,behavior:'instant'}));const aiScroll=await page.evaluate(()=>scrollY);
 await page.locator('.grag-launcher').click();await page.waitForFunction(()=>document.body.classList.contains('guidcy-modal-scroll-lock'));
 assert.equal(await page.locator('#grag-panel').getAttribute('aria-modal'),'true');
 const aiTop=await page.locator('#gnet-feed').evaluate(el=>el.getBoundingClientRect().top);
 await page.mouse.move(5,400);await page.mouse.wheel(0,600);await page.waitForTimeout(80);assert.equal(await page.locator('#gnet-feed').evaluate(el=>el.getBoundingClientRect().top),aiTop,'AI backdrop prevents background scrolling');
 await page.locator('#grag-body').evaluate(el=>{const filler=document.createElement('div');filler.className='test-ai-scroll';filler.style.minHeight='1000px';filler.textContent='Long conversation fixture';el.append(filler);});await page.locator('#grag-body').hover();await page.mouse.wheel(0,400);await page.waitForFunction(()=>document.querySelector('#grag-body').scrollTop>0);assert.equal(await page.locator('#gnet-feed').evaluate(el=>el.getBoundingClientRect().top),aiTop,'AI conversation scrolls independently');await page.locator('#grag-panel').screenshot({path:'/private/tmp/guidcy-ai-controls.png'});
 await page.locator('#grag-input').focus();await page.keyboard.press('Escape');await page.waitForFunction(y=>!document.body.classList.contains('guidcy-modal-scroll-lock')&&Math.abs(scrollY-y)<2,aiScroll);
 assert.equal(await page.locator('.grag-launcher').evaluate(el=>el===document.activeElement),true,'closing restores focus');
 await page.locator('.grag-launcher').click();await page.waitForFunction(()=>document.body.classList.contains('guidcy-modal-scroll-lock'));
 await page.evaluate(()=>{const d=document.createElement('dialog');d.id='ai-test-dialog';d.innerHTML='<button>Another dialog</button>';document.body.append(d);d.showModal();document.querySelector('.grag-close').click();});
 await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.body.classList.contains('guidcy-modal-scroll-lock')),true,'closing AI does not unlock another dialog');
 await page.evaluate(()=>{const d=document.querySelector('#ai-test-dialog');d.close();d.remove();});await page.waitForFunction(()=>!document.body.classList.contains('guidcy-modal-scroll-lock'));
 await page.locator('.grag-launcher').click();await page.evaluate(()=>{window.__beforeRagFetch=window.fetch;window.fetch=(url,options)=>String(url)==='/api/rag-chat'?new Promise(resolve=>window.__resolveRag=()=>resolve(new Response(JSON.stringify({answer:'Fixture answer'}),{status:200}))):window.__beforeRagFetch(url,options);});
 await page.locator('#grag-input').fill('How can I book?');await page.locator('#grag-send').click();await page.waitForFunction(()=>!!window.__resolveRag);
 await page.locator('.grag-close').click();await page.evaluate(()=>{window.__resolveRag();window.fetch=window.__beforeRagFetch;});await page.waitForFunction(()=>!document.querySelector('#grag-send').disabled);
 assert.equal(await page.locator('.grag-launcher').evaluate(el=>el===document.activeElement),true,'a late response does not focus the closed AI panel');
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 assert.equal(await page.locator('link[rel=icon]').count(),5);assert.equal(await page.locator('link[rel=icon]').evaluateAll(links=>links.every(el=>el.href.includes('guidcy-mark-20261007'))),true);
 assert.equal(await page.locator('.gnet-post').count(),12);assert.equal(await page.locator('.gnet-post-body img').count(),0);assert.equal(await page.locator('#gnet-more').isVisible(),true);
 // Long text is measured by rendered lines, while short posts need no toggle.
 const longPost=page.locator('#gnet-feed [data-post="aaaaaaaa-aaaa-4aaa-8aaa-000000000003"]'),moreText=longPost.locator('[data-action=expand]');
 await moreText.waitFor({state:'visible'});const previewHeight=await longPost.locator('.gnet-post-body').evaluate(el=>el.clientHeight);
 assert.equal(await moreText.innerText(),'… more');await moreText.click();assert.equal(await longPost.locator('[data-action=expand]').count(),0,'expanded posts have no See less toggle');assert.ok(await longPost.locator('.gnet-post-body').evaluate(el=>el.clientHeight)>previewHeight);
 assert.equal(await page.locator('#gnet-feed [data-post="aaaaaaaa-aaaa-4aaa-8aaa-000000000004"] [data-action=expand]').isVisible(),false,'short posts stay fully visible without See more');
 assert.equal(await page.locator('#gnet-feed .gnet-post>header .gnet-headline').first().innerText(),'Career Coach','post headers show the headline without appending company');
 // Hard refresh restores the existing community regions before app.js starts.
 const inlineAvatar='data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../favicon-512x512.png')).toString('base64');
 await page.evaluate(src=>{document.querySelectorAll('#gnet-feed .gnet-person .gnet-avatar').forEach(el=>{const img=document.createElement('img');img.className='gnet-avatar';img.width=44;img.height=44;img.src=src;el.replaceWith(img);});},inlineAvatar);
 await page.evaluate(owner=>{localStorage.setItem('sb-lsthngfxehayeqyctkla-auth-token',JSON.stringify({user:{id:owner}}));window.guidcySavePageShell();},OWNER);
 assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('guidcy:refresh:v1'))['/'].images.length),1,'repeated inline photos are stored once');
 await page.evaluate(owner=>{const nav=document.querySelector('#nav-right').cloneNode(true),chip=nav.querySelector('.avatar-chip'),old=document.createElement('div');old.className=chip.className;old.style.cssText=chip.style.cssText;old.textContent=chip.textContent;old.setAttribute('onclick',"go('user-dash')");chip.replaceWith(old);localStorage.setItem('guidcy_nav_cache',JSON.stringify({uid:owner,html:nav.innerHTML}));},OWNER);
 let releaseApp;
 await context.route('**/assets/js/app.js*',async route=>{await new Promise(resolve=>releaseApp=resolve);await route.continue();});
 await page.reload({waitUntil:'commit'});
 await page.waitForSelector('#gnet-feed[data-guidcy-restored] .gnet-post');
 assert.equal(await page.locator('#gnet-feed .gnet-post').count(),12);
 assert.equal(await page.locator('#gnet-feed .gnet-person img').first().getAttribute('src'),inlineAvatar,'cached photos restore without blank placeholders');
 assert.equal(await page.locator('#gnet-me').isVisible(),true,'desktop refresh restores the profile card');
 assert.equal(await page.locator('#nav-right a.avatar-chip').getAttribute('href'),'/profile?member='+OWNER,'old cached dashboard avatars become profile links before app.js loads');
 assert.equal(await page.locator('#nav-right a.avatar-chip').getAttribute('onclick'),null);
 await page.evaluate(()=>{window.__emptyFeedPaints=0;new MutationObserver(()=>{if(!document.querySelector('#gnet-feed .gnet-post'))window.__emptyFeedPaints++;}).observe(document.querySelector('#gnet-feed'),{childList:true});});
 releaseApp();await context.unroute('**/assets/js/app.js*');
 await page.waitForFunction(()=>document.querySelector('#gnet-feed')?.getAttribute('aria-busy')==='false'&&!document.querySelector('#gnet-feed').hasAttribute('inert'));
 assert.equal(await page.evaluate(()=>window.__emptyFeedPaints),0,'cached feed must not flash empty while revalidating');
 // In-page refresh retains mounted posts and the static composer until data arrives.
 await page.evaluate(()=>{window.__holdFeed=true;window.__firstFeedCard=document.querySelector('.gnet-post');window.__composer=document.querySelector('.gnet-composer');});
 await page.locator('[data-action=refresh]').click();await page.waitForFunction(()=>!!window.__releaseFeed);
 assert.equal(await page.evaluate(()=>window.__firstFeedCard===document.querySelector('.gnet-post')&&window.__composer===document.querySelector('.gnet-composer')),true);
 await page.locator('#guidcy-loading-status').waitFor();assert.equal(await page.locator('#guidcy-loading-status .guidcy-loading-track').evaluate(el=>getComputedStyle(el,'::after').animationName),'guidcy-segment-load','a pending refresh shows the segmented loading bar');assert.match(await page.locator('#guidcy-loading-status').innerText(),/Loading/i);assert.equal(await page.locator('#gnet-feed #guidcy-loading-status').count(),0,'loading status stays outside preserved content');assert.equal(await page.locator('#guidcy-loading-status [aria-valuenow]').count(),0,'indeterminate loading does not claim a percentage');
 await page.locator('#guidcy-loading-status').evaluate(el=>{el.getAnimations().forEach(a=>a.finish());el.querySelector('.guidcy-loading-track').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=1100;});});assert.ok(await page.locator('#guidcy-loading-status .guidcy-loading-track').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el,'::after').transform);return m.m41>0;}),'loading blocks are revealed by the moving cover');await page.locator('#guidcy-loading-status').screenshot({path:'/private/tmp/guidcy-segmented-loading.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#guidcy-loading-status .guidcy-loading-track').evaluate(el=>getComputedStyle(el,'::after').animationName),'none','reduced motion uses a static segmented bar');await page.emulateMedia({reducedMotion:'no-preference'});

 await page.evaluate(()=>{window.__holdFeed=false;window.__releaseFeed();});
 await page.waitForFunction(()=>document.querySelector('#gnet-feed').getAttribute('aria-busy')==='false');await page.locator('#guidcy-loading-status').waitFor({state:'hidden'});
 // Returning Home must not wait for a read started before leaving the page.
 await page.evaluate(()=>{window.__releaseFeed=null;window.__holdFeed=true;});
 await page.locator('[data-action=refresh]').click();await page.waitForFunction(()=>!!window.__releaseFeed);
 await page.evaluate(()=>window.guidcyNavigate('/about'));await page.locator('#page-about.on').waitFor();await page.locator('#guidcy-loading-status').waitFor({state:'hidden'});
 await page.evaluate(()=>{window.__holdFeed=false;window.guidcyNavigate('/');});
 await page.waitForFunction(()=>document.querySelector('#gnet-feed').getAttribute('aria-busy')==='false',null,{timeout:2500});
 assert.equal(await page.locator('.gnet-post').count(),12,'returning Home starts a fresh read without the stalled response');
 await page.evaluate(()=>{window.__feedCardAfterReturn=document.querySelector('.gnet-post');window.__releaseFeed();});
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.__feedCardAfterReturn===document.querySelector('.gnet-post')),true,'late previous-page reads cannot repaint the current feed');
 // Universal search stays separate from the consultant-only search and supports keyboard navigation.
 await page.locator('#gnet-site-search').focus();await page.waitForSelector('#gnet-site-results button');assert.match(await page.locator('#gnet-site-results').innerText(),/Marketplace Notes[\s\S]*Webinars[\s\S]*Find Jobs/);
 await page.locator('#gnet-site-search').fill('privacy');await page.waitForFunction(()=>document.querySelector('#gnet-site-results')?.textContent.includes('Privacy Policy'));
 await page.locator('#gnet-site-search').press('ArrowDown');await page.keyboard.press('Enter');await page.waitForSelector('#page-privacy.on');
 await page.evaluate(()=>window.guidcyNavigate('/'));await page.waitForSelector('.gnet-post');
 await page.locator('#gnet-site-search').fill('expert');await page.waitForFunction(()=>!!document.querySelector('#gnet-site-results [data-guidcy-search-kind=consultant]'));await page.locator('#gnet-site-results [data-guidcy-search-kind=consultant]').first().click();await page.waitForSelector('.gnet-profile-header');
 await page.evaluate(()=>window.guidcyNavigate('/'));await page.waitForSelector('.gnet-post');
 await page.locator('#gnet-site-search').fill('mentoring');await page.waitForSelector('#gnet-site-results [data-guidcy-search-kind=post]');await page.locator('#gnet-site-results [data-guidcy-search-kind=post]').first().click();await page.waitForFunction(()=>new URLSearchParams(location.search).has('post')&&document.querySelectorAll('#gnet-feed .gnet-post').length===1);await page.evaluate(()=>window.guidcyNavigate('/'));await page.waitForSelector('.gnet-post');
 await page.locator('#gnet-site-search').fill('notes');await page.locator('#gnet-site-search').press('Escape');await page.waitForTimeout(300);assert.equal(await page.locator('#gnet-site-results').isVisible(),false);
 await page.locator('.gnet-compose-trigger').click();assert.equal(await page.locator('#gnet-kind,#gnet-alt').count(),0);await page.locator('#gnet-dialog [data-close]').click();
 await page.goto(origin);await page.waitForSelector('.gnet-post');await page.waitForFunction(()=>document.querySelector('#gnet-compose-avatar .gnet-avatar')&&document.querySelector('#nav-right a.avatar-chip'));
 await page.locator('#gnet-more').click();await page.waitForFunction(()=>document.querySelectorAll('.gnet-post').length===15);assert.equal(await page.locator('#gnet-more').isVisible(),false);
 const first=page.locator('.gnet-post').first();await first.locator('[data-follow]').click();await page.waitForFunction(id=>document.querySelectorAll('[data-follow="'+id+'"][aria-pressed="true"]').length>1,EXPERT);
 assert.equal(await first.locator('[data-follow] [data-follow-label]').innerText(),'Following');assert.equal(await first.locator('[data-follow] svg').count(),1);const followingStyle=await first.locator('[data-follow]').evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderStyle,weight:getComputedStyle(el).fontWeight,radius:getComputedStyle(el).borderRadius,color:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity,tag:el.tagName}));assert.equal(followingStyle.border,'none');assert.equal(followingStyle.weight,'700');assert.equal(followingStyle.color,'rgb(30, 114, 190)');assert.equal(followingStyle.opacity,'1');assert.equal(followingStyle.tag,'BUTTON');assert.ok(parseFloat(followingStyle.radius)>=20,'Following is a rounded action button');await first.locator('[data-follow]').screenshot({path:'/private/tmp/guidcy-following-button.png'});
 await page.evaluate(()=>window.__failSocial=true);await first.locator('[data-follow]').click();await page.waitForFunction(id=>document.querySelector('[data-follow="'+id+'"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-follow="'+id+'"]').disabled,EXPERT);
 await page.emulateMedia({reducedMotion:'no-preference'}); await first.locator('.gnet-post-body').dblclick();await page.waitForFunction(()=>document.querySelector('[data-like-count]').textContent==='1 likes');assert.equal(await first.locator('.gnet-like-burst').count(),1,'double click shows a large heart');assert.ok(await first.locator('[data-action=like] svg').evaluate(el=>el.getAnimations().length)>0,'like icon animates');
 assert.equal(await first.locator('[data-action=like] svg').evaluate(el=>getComputedStyle(el).fill),'rgb(30, 114, 190)');
 await first.locator('.gnet-like-burst').evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=260;});await first.screenshot({path:'/private/tmp/guidcy-like-animation.png'});await first.locator('.gnet-like-burst').evaluate(el=>el.getAnimations()[0]?.play());

 await page.evaluate(()=>window.__failSocial=true);await first.locator('[data-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-action=like]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-action=like]').disabled);
 assert.equal(await first.locator('[data-action=like] svg').evaluate(el=>getComputedStyle(el).fill),'rgb(30, 114, 190)','failed unlike restores the filled heart');
 await first.locator('[data-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-like-count]').textContent==='0 likes');
 assert.equal(await first.locator('[data-action=like] svg').evaluate(el=>getComputedStyle(el).fill),'none');
 assert.equal(await first.locator('.gnet-like-burst').count(),0,'unlike removes the heart effect');
 await page.evaluate(()=>window.__failSocial=true);await first.locator('.gnet-post-body').dblclick();await page.waitForFunction(()=>document.querySelector('[data-action=like]').getAttribute('aria-pressed')==='false'&&!document.querySelector('[data-action=like]').disabled);assert.equal(await first.locator('.gnet-like-burst').count(),0,'a failed like clears the effect');assert.equal(await first.locator('[data-action=like] svg').evaluate(el=>el.getAnimations().length),0,'failed like cancels icon motion');
 await page.emulateMedia({reducedMotion:'reduce'});await first.locator('.gnet-post-body').dblclick();await page.waitForFunction(()=>document.querySelector('[data-like-count]').textContent==='1 likes');assert.equal(await first.locator('.gnet-like-burst').count(),0);assert.equal(await first.locator('[data-action=like] svg').evaluate(el=>el.getAnimations().length),0,'reduced motion likes without animation');await first.locator('[data-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-like-count]').textContent==='0 likes');await page.emulateMedia({reducedMotion:'no-preference'});

 await first.locator('[data-action=like] svg').evaluate(el=>Object.defineProperty(el,'animate',{configurable:true,value:()=>{throw new Error('Animation unavailable');}}));await first.locator('[data-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-like-count]').textContent==='1 likes'&&!document.querySelector('[data-action=like]').disabled);await first.locator('[data-action=like] svg').evaluate(el=>delete el.animate);await first.locator('[data-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-like-count]').textContent==='0 likes');

 await page.locator('.gnet-shortcuts [data-action=network]').click();await page.locator('#gnet-network-list .gnet-expert').waitFor();assert.equal(await page.locator('#gnet-dialog-title').evaluate(el=>el===document.activeElement),true,'people dialog opens without framing the cross with an autofocus outline');
 const closeAppearance=await page.locator('#gnet-dialog header [data-close]').evaluate(el=>({border:getComputedStyle(el).borderWidth,shadow:getComputedStyle(el).boxShadow,outline:getComputedStyle(el).outlineStyle}));assert.equal(closeAppearance.border,'0px');assert.equal(closeAppearance.shadow,'none');assert.equal(closeAppearance.outline,'none');await page.locator('#gnet-dialog').screenshot({path:'/private/tmp/guidcy-people-follow-popup.png'});await page.keyboard.press('Tab');assert.equal(await page.locator('#gnet-dialog header [data-close]').evaluate(el=>el===document.activeElement),true,'close icon remains keyboard accessible');await page.locator('#gnet-dialog header [data-close]').click();
 await first.locator('[data-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-like-count]').textContent==='1 likes');
 await first.locator('.gnet-post-body').dblclick();assert.equal(await first.locator('[data-action=like]').getAttribute('aria-pressed'),'true','double-clicking an already liked post never unlikes it');
 assert.equal(await page.evaluate(()=>window.__social.community_likes.length),1,'no duplicate likes');await first.locator('.gnet-like-burst').waitFor({state:'detached'});assert.equal(await first.locator('[data-action=like] svg').evaluate(el=>el.getAnimations().length),0,'completed heart effects leave no running animations');
 await first.locator('[data-action=save]').click();await page.waitForFunction(()=>document.querySelector('[data-save-label]').textContent==='Saved');
 await first.locator('[data-action=comments]').last().click();await first.locator('.gnet-comment-form textarea').waitFor();assert.equal(await first.locator('.gnet-comment-form button').isVisible(),false,'Post starts hidden');assert.equal(await first.locator('.gnet-comments-heading').innerText(),'Comments');await first.locator('.gnet-comment-form textarea').fill('   ');assert.equal(await first.locator('.gnet-comment-form button').isVisible(),false,'whitespace keeps Post hidden');await first.locator('.gnet-comment-form textarea').fill('Draft');assert.equal(await first.locator('.gnet-comment-form button').isVisible(),true,'typing reveals Post');await first.locator('.gnet-comment-form textarea').fill('');assert.equal(await first.locator('.gnet-comment-form button').isVisible(),false,'clearing hides Post');await first.locator('.gnet-comment-form textarea').fill('A useful professional discussion.');await first.locator('.gnet-comment-form button').click();await page.waitForSelector('.gnet-comment');assert.match(await first.locator('.gnet-comments').innerText(),/useful professional/);assert.equal(await first.locator('.gnet-comment-form button').isVisible(),false,'successful posting resets Post visibility');
 assert.equal(await first.locator('.gnet-comment-form').evaluate(el=>el.compareDocumentPosition(el.parentElement.querySelector('.gnet-comment-list'))&Node.DOCUMENT_POSITION_FOLLOWING),4,'composer appears above comments');
 assert.equal(await first.locator('.gnet-comment time[datetime]').count(),1,'comments have real timestamps');
 await first.locator('.gnet-comments').screenshot({path:'/private/tmp/guidcy-comments-desktop.png'});
 await first.locator('[data-delete-comment]').click();await page.waitForFunction(()=>!document.querySelector('.gnet-comment'));
 assert.equal(await page.evaluate(()=>window.__social.community_comments.length),0,'own comment deletion remains persisted');
 await first.locator('.gnet-comment-form textarea').fill('Retain my comment draft on failure.');await page.evaluate(()=>window.__failSocial=true);await first.locator('.gnet-comment-form button').click();await first.locator('.gnet-comment-form .gnet-form-error').filter({hasText:'not sent'}).waitFor();assert.equal(await first.locator('.gnet-comment-form textarea').inputValue(),'Retain my comment draft on failure.');
 await first.locator('[data-action=share]').click();assert.match(await page.locator('#gnet-share-url').inputValue(),/\?post=aaaaaaaa/);assert.equal(await page.locator('#gnet-dialog a[target=_blank]').count(),3);await page.locator('#gnet-dialog [data-close]').click();
 await page.locator('.gnet-compose-trigger').click();await page.locator('#gnet-body').fill('My achievement from the browser test');
 await page.locator('#gnet-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:fs.readFileSync(path.resolve(__dirname,'../favicon-192x192.png'))});
 await page.waitForFunction(()=>document.querySelector('#gnet-preview img')&&!document.querySelector('#gnet-post-form [type=submit]').disabled);assert.equal(await page.locator('#gnet-alt').count(),0);await page.locator('#gnet-post-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});
 await page.locator('[data-mode=mine]').click();await page.waitForFunction(()=>document.querySelectorAll('.gnet-post').length===1);let own=page.locator('.gnet-post').first();assert.match(await own.innerText(),/My achievement/);assert.equal((await page.evaluate(()=>window.__uploads))[0].type,'image/webp');
 await page.evaluate(owner=>{window.__social.community_posts.find(p=>p.author_id===owner).image_alt='Existing accessible description';},OWNER);await page.locator('[data-action=refresh]').click();await page.waitForFunction(()=>document.querySelector('.gnet-post-image')?.alt==='Existing accessible description');
 // Post media must keep equal gutters even under the mobile global max-width rule.
 async function checkPostImage(selector,label,targetPage=page){
  const media=targetPage.locator(selector).first();await media.waitFor();await media.evaluate(img=>img.decode());
  for(const width of [1365,768,390,320]){
   await targetPage.setViewportSize({width,height:1000});
   const bounds=await media.evaluate(img=>{const image=img.getBoundingClientRect(),card=img.closest('.gnet-post').getBoundingClientRect();return {left:image.left-card.left,right:card.right-image.right,center:Math.abs((image.left+image.right-card.left-card.right)/2)};});
   assert.ok(bounds.center<1,label+' image is centered at '+width);assert.ok(Math.abs(bounds.left-bounds.right)<1,label+' image has equal left and right gutters at '+width);assert.ok(bounds.left>=0&&bounds.right>=0,label+' image stays inside its card');
   await media.screenshot({path:'/private/tmp/guidcy-post-image-'+label+'-'+width+'.png'});
  }
  await targetPage.setViewportSize({width:1365,height:1000});
 }
 await checkPostImage('#gnet-feed .gnet-post-image','home');
 const mediaPage=await context.newPage();await mediaPage.goto(origin);await mediaPage.waitForSelector('.gnet-post');
 await mediaPage.evaluate(async()=>{await window.guidcyGetSupabaseClient().from('community_posts').update({image_path:'22222222-2222-4222-8222-222222222222/test.webp'}).eq('id','aaaaaaaa-aaaa-4aaa-8aaa-000000000001');window.guidcyNavigate('/consultant/test-expert');});
 await mediaPage.waitForSelector('#gnet-profile-posts .gnet-post-image');await checkPostImage('#gnet-profile-posts .gnet-post-image','profile',mediaPage);await mediaPage.close();
 await own.locator('summary').click();await own.locator('[data-action=edit]').click();await page.locator('#gnet-body').fill('Edited achievement');await page.evaluate(()=>window.__failSocial=true);await page.locator('#gnet-post-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.gnet-form-error').textContent.includes('could not'));assert.equal(await page.locator('#gnet-body').inputValue(),'Edited achievement');await page.locator('#gnet-post-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelector('.gnet-post-body')?.textContent==='Edited achievement');
 assert.doesNotMatch(await page.locator('.gnet-post-meta').innerText(),/Edited/,'editing does not add a public Edited label');assert.equal(await page.locator('.gnet-post-image').getAttribute('alt'),'Existing accessible description');assert.doesNotMatch(await page.locator('.gnet-post-meta').innerText(),/Insight|Achievement|Career update|Learning|Opportunity|Project/);
 own=page.locator('.gnet-post').first();await own.locator('summary').click();await own.locator('[data-action=delete]').click();await page.locator('#gnet-delete-confirm').click();await page.waitForFunction(()=>document.querySelectorAll('.gnet-post').length===0);assert.equal((await page.evaluate(()=>window.__removedImages)).length,1);
 await page.evaluate(id=>window.guidcyNavigate('/?author='+id),MEMBER);await page.waitForSelector('.gnet-post');assert.match(await page.locator('.gnet-post .gnet-person').first().innerText(),/Community Member/);
 await page.locator('[data-mode=community]').click();await page.waitForSelector('.gnet-post');await page.screenshot({path:'/private/tmp/guidcy-community-desktop.png',fullPage:false});
 // Existing consultant route, availability and booking UI are reused.
 await page.locator('.gnet-post .gnet-person').first().click();await page.waitForSelector('#page-profile.on .profile-name');await page.waitForSelector('.gnet-profile-header');assert.equal(await page.locator('.book-box').count(),1);
 await page.reload();await page.waitForSelector('.gnet-profile-header');await page.waitForSelector('#gnet-profile-posts .gnet-post');await page.waitForTimeout(200);const widths=await page.evaluate(()=>window.__profileWidths);assert.ok(widths.length>1);assert.ok(Math.max(...widths)-Math.min(...widths)<1,'header keeps its initial width through reload/hydration');assert.equal(await page.locator('[data-guidcy-restored]#profile-layout').count(),0,'old profile cache is ignored');
 assert.deepEqual(await page.evaluate(()=>window.__legacyProfilePaints),[],'no old profile during the delayed public-profile read');
 async function checkProfileReload(member=false){
  await page.waitForFunction(()=>!document.querySelector('#gnet-portfolio-loading')&&document.querySelector('#gnet-profile-posts')?.getAttribute('aria-busy')==='false');
  await page.evaluate(()=>window.guidcySavePageShell());
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('guidcy:refresh:v1'))[location.pathname+location.search].regions['profile-layout'].profileVersion),3);
  let resume;const hold=new Promise(resolve=>resume=resolve);
  await context.route('**/assets/js/app.js',async route=>{await hold;await route.continue()});
  await page.reload({waitUntil:'commit'});
  await page.waitForSelector('#profile-layout[data-guidcy-restored] .gnet-profile-header');
  assert.equal(await page.locator('#profile-layout').evaluate(el=>el.inert),true,'snapshot cannot book or edit before live data');
  assert.equal(await page.locator('#profile-layout').evaluate(el=>el.classList.contains('gnet-member-layout')),member);
  await page.evaluate(()=>{window.__missingProfile=[];new MutationObserver(()=>{if(!document.querySelector('.gnet-profile-header .profile-name'))window.__missingProfile.push('blank')}).observe(document.querySelector('#profile-layout'),{childList:true,subtree:true})});
  resume();await context.unroute('**/assets/js/app.js');
  await page.waitForFunction(()=>!document.querySelector('#profile-layout').hasAttribute('inert')&&!document.querySelector('#gnet-portfolio-loading')&&document.querySelector('#gnet-profile-posts')?.getAttribute('aria-busy')==='false');
  assert.deepEqual(await page.evaluate(()=>window.__missingProfile),[],'profile stays visible throughout revalidation');
  assert.equal(await page.locator('#profile-layout [data-guidcy-restored]:not([hidden])').count(),0,'visible sections finish rehydrating');
  if(!member)assert.match(await page.locator('.book-box .green-btn').getAttribute('onclick'),/startBooking/);
 }
 await checkProfileReload();
 assert.equal(await page.locator('[data-action=connection],[data-action=connections],[data-network-action]').count(),0,'profiles have no Connect, connection lists or invitations');
 assert.doesNotMatch(await page.locator('.gnet-profile-count-line').innerText(),/connections|invitations/i);
 const profileFollow=page.locator('.gnet-profile-actions [data-follow]'),beforeFollow=await profileFollow.getAttribute('aria-pressed');
 await profileFollow.click();assert.notEqual(await profileFollow.getAttribute('aria-pressed'),beforeFollow);await profileFollow.click();assert.equal(await profileFollow.getAttribute('aria-pressed'),beforeFollow,'Follow/Unfollow works without Connect');

 assert.equal(await page.locator('#gnet-profile-posts .gnet-post>header .gnet-headline').first().innerText(),'Career Coach','profile activity uses the same headline-only post header');
 assert.equal(await page.locator('.gnet-activity [data-tab=comments]').count(),0,'profile Activity has no Comments tab');
 for(const width of [1365,390,320]){
  await page.setViewportSize({width,height:1000});
  const rail=page.locator('#gnet-profile-posts');
  const layout=await rail.evaluate(el=>{const cards=[...el.querySelectorAll('.gnet-post')].map(n=>n.getBoundingClientRect());return {top:cards.map(r=>r.top),overflow:el.scrollWidth>el.clientWidth,pageWidth:document.documentElement.scrollWidth,viewport:innerWidth};});
  assert.ok(layout.top.length>1&&layout.top.every(top=>Math.abs(top-layout.top[0])<1),'profile posts share a horizontal row at '+width);
  assert.equal(layout.overflow,true,'profile posts scroll horizontally at '+width);assert.ok(layout.pageWidth<=layout.viewport,'post rail does not widen the page');
  await rail.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('#gnet-profile-posts').scrollLeft>0);
  await page.waitForTimeout(200);await rail.evaluate(el=>{el.scrollTo({left:0,behavior:'instant'});el.blur()});await page.waitForFunction(()=>document.querySelector('#gnet-profile-posts').scrollLeft<=4);
  await page.locator('.gnet-activity').screenshot({path:'/private/tmp/guidcy-profile-post-rail-'+width+'.png'});
 }
 await page.setViewportSize({width:1365,height:1000});
 const profileLike=page.locator('#gnet-profile-posts [data-action=like]').first();await profileLike.click();assert.equal(await profileLike.getAttribute('aria-pressed'),'true');assert.equal(await profileLike.locator('svg').evaluate(el=>getComputedStyle(el).fill),'rgb(30, 114, 190)');await profileLike.click();
 // Refresh activity without removing the existing card or profile header.
 await page.evaluate(()=>{window.__holdFeed=true;window.__profileCard=document.querySelector('#gnet-profile-posts .gnet-post');window.__profileHeader=document.querySelector('.gnet-profile-header')});
 await page.locator('[data-action=refresh-activity][data-tab=posts]').click();
 assert.equal(await page.evaluate(()=>document.querySelector('#gnet-profile-posts .gnet-post')===window.__profileCard&&document.querySelector('.gnet-profile-header')===window.__profileHeader),true);
 await page.evaluate(()=>{window.__holdFeed=false;window.__releaseFeed()});
 await page.waitForFunction(()=>document.querySelector('#gnet-profile-posts').getAttribute('aria-busy')==='false');

 assert.equal(await page.locator('#gnet-profile-extras').evaluate(el=>el.open),true);assert.equal(await page.locator('#gnet-booking-options').evaluate(el=>el.open),true);await page.locator('.gnet-profile-actions [data-action=book]').click();assert.equal(await page.locator('#gnet-booking-options').evaluate(el=>el.open),true);assert.equal(await page.evaluate(()=>window.selDur),30);
 await page.waitForSelector('#gnet-profile-posts .gnet-post');assert.ok(await page.locator('#gnet-profile-posts .gnet-post').count()<=5);
 await page.locator('.gnet-profile-actions [data-action=share-profile]').scrollIntoViewIfNeeded();const beforeDialog=await page.evaluate(()=>window.scrollY);await page.locator('.gnet-profile-actions [data-action=share-profile]').click();await page.waitForFunction(()=>document.body.classList.contains('guidcy-modal-scroll-lock'));const lockedTop=await page.locator('.gnet-profile-header').evaluate(el=>el.getBoundingClientRect().top);await page.mouse.move(2,450);await page.mouse.wheel(0,500);await page.waitForTimeout(100);assert.equal(await page.locator('.gnet-profile-header').evaluate(el=>el.getBoundingClientRect().top),lockedTop);await page.keyboard.press('Escape');await page.waitForFunction(y=>!document.body.classList.contains('guidcy-modal-scroll-lock')&&Math.abs(window.scrollY-y)<2,beforeDialog);
 await page.locator('#gnet-section-skills .gnet-skill').first().waitFor();assert.equal(await page.locator('[data-action=endorse],[data-endorsement],.gnet-endorsement-count').count(),0);assert.equal(await page.locator('.gnet-skill-list').evaluate(el=>getComputedStyle(el).display),'flex');

 assert.equal(await page.locator('[data-action=message],[data-action=inbox]').count(),0,'community messaging is removed from profiles and the homepage');
 await page.waitForSelector('#guidcy-save-cons-btn');
 assert.equal(await page.locator('.gnet-profile-actions #guidcy-save-cons-btn').count(),1);assert.ok(await page.evaluate(()=>document.querySelector('#guidcy-save-cons-btn').getBoundingClientRect().top>=document.querySelector('.gnet-cover').getBoundingClientRect().bottom),'Save is below the cover');await page.locator('#guidcy-save-cons-btn').click();await page.waitForFunction(()=>document.querySelector('#guidcy-save-cons-btn').getAttribute('aria-pressed')==='true'&&window.__social.saved_consultants.length===1);await page.locator('#guidcy-save-cons-btn').click();await page.waitForFunction(()=>document.querySelector('#guidcy-save-cons-btn').getAttribute('aria-pressed')==='false'&&window.__social.saved_consultants.length===0);
 assert.equal(await page.locator('.guidcy-profile-education-row').isVisible(),false,'education is shown once');
 await page.evaluate(()=>{document.querySelector('#gnet-booking-options').open=false;window.scrollTo({top:0,behavior:'instant'})});
 await page.screenshot({path:'/private/tmp/guidcy-compact-profile-desktop.png',fullPage:false});
 await page.goto(origin+'/profile?member='+MEMBER);await page.waitForSelector('#gnet-member');await page.waitForTimeout(1800);assert.match(page.url(),/profile\?member=/);assert.match(await page.locator('#gnet-member').innerText(),/Test College/);await checkProfileReload(true);
 await page.evaluate(()=>{window.guidcyNavigate('/');window.__profileRedirectToken='same-document';window.guidcyNavigate('/profile?member=22222222-2222-4222-8222-222222222222');});await page.waitForSelector('#page-profile.on .gnet-profile-header');await page.waitForFunction(()=>location.pathname==='/consultant/test-expert');assert.equal(await page.evaluate(()=>window.__profileRedirectToken),'same-document');await page.goBack();await page.waitForSelector('#page-home.on');
 await page.goto(origin+'/profile?member='+OWNER);await page.waitForSelector('#gnet-member');assert.equal(await page.locator('.gnet-profile-actions [data-follow]').count(),0);await page.locator('.gnet-profile-actions [data-action=edit-profile]').click();await page.locator('#gnet-edit-headline').fill('Polymer researcher | HFCL | Manager | NPD | IIT Roorkee | NTU | Coating | Adhesive | Sustainability | Recycling');await page.locator('#gnet-edit-pronouns').fill('He/Him');assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed');assert.equal(await page.locator('#gnet-edit-status,#gnet-edit-status-note,#gnet-edit-contact,#gnet-edit-linkedin').count(),0);await page.locator('#gnet-edit-city').fill('Hyderabad, Telangana, India');await page.locator('#gnet-profile-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});assert.match(await page.locator('#gnet-member').innerText(),/Polymer researcher/);
 assert.match(await page.locator('.gnet-profile-headline').innerText(),/HFCL \| Manager/);assert.match(await page.locator('.gnet-pronouns').innerText(),/He\/Him/);assert.equal(await page.locator('.gnet-status-frame,.gnet-professional-status,[data-action=contact-info]').count(),0);assert.equal(await page.locator('.gnet-profile-header a[href^="mailto:"],.gnet-profile-header a[href*="linkedin.com/in"]').count(),0);
 await page.waitForSelector('.gnet-current-location');await page.waitForSelector('.gnet-organizations [data-organization="guidcy"] img');
 // Registered company suggestions do not require a manually seeded organization directory.
 await page.locator('.gnet-profile-actions [data-action=edit-profile]').click();await page.locator('#gnet-edit-company').fill('Guidcy');await page.waitForSelector('#gnet-edit-company-organizations option[value="Guidcy Technologies"]',{state:'attached'});await page.locator('#gnet-edit-company').fill('Guidcy Technologies');await page.locator('#gnet-profile-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelector('#toastbar')?.textContent==='Profile Saved');await page.waitForSelector('.gnet-organizations [data-organization="guidcy technologies"] img');assert.match(await page.locator('.gnet-organizations [data-organization="guidcy technologies"] img').getAttribute('src'),/^data:image\/png;base64,/);

 for(const visible of [false,true]){
  await page.locator('.gnet-profile-actions [data-action=edit-profile]').click();assert.equal(await page.locator('#gnet-edit-city').inputValue(),'Hyderabad, Telangana, India');await page.locator('#gnet-show-location').setChecked(visible);await page.locator('#gnet-profile-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('#gnet-member');await page.waitForFunction(show=>!!document.querySelector('.gnet-current-location')===show,visible);
 }
 // Website stays private until explicitly enabled, can be removed, and never restores contact details.
 assert.equal(await page.locator('.gnet-profile-website').count(),0);
 for(const show of [true,false,true]){await page.locator('.gnet-profile-actions [data-action=edit-profile]').click();await page.locator('#gnet-edit-website').fill('https://example.com/my-work');await page.locator('#gnet-website-public').setChecked(show);await page.locator('#gnet-profile-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('#gnet-member');await page.waitForFunction(visible=>!!document.querySelector('.gnet-profile-website')===visible,show);}
 assert.equal(await page.locator('.gnet-profile-website').getAttribute('href'),'https://example.com/my-work');assert.equal(await page.locator('.gnet-profile-website').getAttribute('rel'),'noopener noreferrer');
 await page.locator('.gnet-profile-actions [data-action=edit-profile]').click();await page.locator('#gnet-edit-website').fill('');await page.locator('#gnet-profile-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('.gnet-profile-website',{state:'detached'});
 // Desktop identity card; mobile avatar/search/post share one row without a composer card.
 await page.evaluate(()=>window.guidcyNavigate('/'));await page.waitForSelector('#page-home.on .gnet-home-toolbar');
 await page.waitForFunction(()=>document.querySelector('#gnet-me')?.textContent.includes('Polymer researcher'));
 assert.equal(await page.locator('.footer-brand .guidcy-footer-text').count(),0);assert.equal(await page.locator('.guidcy-footer-mark + .guidcy-footer-tagline').innerText(),'Guidance Made Simple');
 for(const width of [1365,768,700,390,320]){
  await page.setViewportSize({width,height:1000});const mobile=width<=700;
  assert.equal(await page.locator('#gnet-me').isVisible(),!mobile);assert.equal(await page.locator('.gnet-composer').isVisible(),!mobile);
  assert.equal(await page.locator('.gnet-mobile-compose').isVisible(),mobile);assert.equal(await page.locator('#gnet-mobile-avatar').isVisible(),mobile);
  assert.equal(await page.locator('.gnet-shortcuts').isVisible(),!mobile);assert.equal(await page.locator('.gnet-feed-toolbar').isVisible(),!mobile);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(mobile){
   assert.ok(await page.evaluate(()=>document.querySelector('#gnet-feed').getBoundingClientRect().top-document.querySelector('.gnet-home-toolbar').getBoundingClientRect().bottom<=12),'mobile feed follows the search row without shortcut/filter gaps');
   const row=await page.evaluate(()=>['#gnet-mobile-avatar','#gnet-site-search-form','.gnet-mobile-compose'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y+r.height/2,right:r.right,height:r.height}}));
   assert.ok(row[0].right<=row[1].x&&row[1].right<=row[2].x,'avatar, search and Post remain in that order');assert.ok(row.every(r=>Math.abs(r.y-row[0].y)<1&&r.height>=44),'same row with touch-sized controls');
   await page.locator('.gnet-mobile-compose').click();await page.waitForSelector('#gnet-body');assert.equal(await page.locator('#gnet-file').count(),1,'compact Post opens the existing image/text editor');await page.locator('#gnet-dialog [data-close]').click();
  }
  await page.evaluate(()=>window.__avatarNavigationToken='same-document');
  await page.locator(mobile?'#gnet-mobile-avatar a':'#gnet-me .gnet-me-profile').click();await page.waitForSelector('#page-profile.on #gnet-member');
  assert.equal(new URL(page.url()).searchParams.get('member'),OWNER);assert.equal(await page.evaluate(()=>window.__avatarNavigationToken),'same-document','profile opens without reloading');
  await page.goBack();await page.waitForSelector('#page-home.on .gnet-home-toolbar');
 }
 await page.setViewportSize({width:1365,height:1000});await page.locator('#nav-right a.avatar-chip').click();await page.waitForSelector('#page-profile.on #gnet-member');
 // Photo-only popups: no settings redirect, crop/update/delete, failure recovery, keyboard/mobile access.
 assert.equal(await page.locator('.gnet-cover-edit').count(),0);assert.doesNotMatch(await page.locator('.gnet-profile-photo-row').innerText(),/Edit photo/);
 assert.equal(await page.locator('.gnet-organizations .gnet-education').count(),0,'a profile without a college must not show a degree as an institution');assert.equal(await page.locator('.guidcy-profile-work-company').first().evaluate(el=>getComputedStyle(el).fontWeight),'700');
 for(const kind of ['cover','avatar']){
  const url=page.url(),target=page.locator('[data-photo-kind="'+kind+'"]');await target.click();assert.match(await page.locator('#gnet-dialog h2').innerText(),kind==='cover'?/Cover photo/:/Profile photo/);assert.equal(await page.locator('#gnet-profile-form').count(),0);
  const chooser=page.waitForEvent('filechooser');await page.locator('#gnet-photo-update').click();await (await chooser).setFiles({name:'photo.png',mimeType:'image/png',buffer:fs.readFileSync(path.resolve(__dirname,'../favicon-192x192.png'))});await page.waitForSelector('#gnet-photo-canvas');await page.waitForFunction(()=>!document.querySelector('#gnet-photo-save').disabled);
  await page.locator('#gnet-photo-zoom').fill('1.25');await page.locator('#gnet-photo-x').fill('35');
  if(kind==='cover'){await page.evaluate(()=>window.__failProfile=true);await page.locator('#gnet-photo-save').click();await page.waitForFunction(()=>document.querySelector('.gnet-form-error')?.textContent.includes('not saved'));assert.equal(await page.locator('#gnet-photo-canvas').isVisible(),true);}
  await page.locator('#gnet-photo-save').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector(kind==='cover'?'.gnet-cover>img':'.gnet-photo-target>img');assert.equal(page.url(),url);if(kind==='avatar')await page.waitForSelector('#gnet-compose-avatar img',{state:'attached'});
  await target.click();await page.locator('#gnet-photo-edit').click();await page.waitForSelector('#gnet-photo-crop',{state:'visible'});await page.locator('#gnet-photo-zoom').fill('1.5');await page.locator('#gnet-photo-save').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});
  await target.click();await page.locator('#gnet-photo-delete').click();assert.equal(await page.locator('#gnet-photo-delete').innerText(),'Confirm delete');await page.locator('#gnet-photo-delete').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector(kind==='cover'?'.gnet-cover>img':'.gnet-photo-target>img',{state:'detached'});assert.equal(page.url(),url);
 }
 for(const width of [320,390]){await page.setViewportSize({width,height:900});for(const kind of ['cover','avatar']){await page.locator('[data-photo-kind="'+kind+'"]').click();await page.waitForSelector('#gnet-photo-update');assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position),'fixed');await page.locator('#gnet-dialog [data-close]').click();}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}await page.setViewportSize({width:1365,height:1000});
 await page.locator('[data-photo-kind=cover]').focus();await page.keyboard.press('Enter');await page.waitForSelector('#gnet-photo-update');await page.keyboard.press('Escape');await page.waitForSelector('#gnet-dialog',{state:'detached'});
 await page.locator('[data-action=close-profile]').click();await page.waitForSelector('#page-home.on');assert.equal(await page.locator('#gnet-me').isVisible(),true);assert.equal(await page.locator('[data-action=hide-me],[data-action=show-me]').count(),0);
 await page.goto(origin+'/?post=aaaaaaaa-aaaa-4aaa-8aaa-000000000002');await page.waitForSelector('.gnet-post');assert.equal(await page.locator('.gnet-post').count(),1);await page.waitForTimeout(1000);assert.match(page.url(),/\?post=/);
 for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.goto(origin);await page.waitForSelector('.gnet-post');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at '+width);await page.screenshot({path:'/private/tmp/guidcy-community-mobile-'+width+'.png',fullPage:false});await page.goto(origin+'/consultant/test-expert');await page.waitForSelector('.gnet-profile-header');await page.waitForSelector('#gnet-profile-posts .gnet-post');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Profile overflow at '+width);await page.screenshot({path:'/private/tmp/guidcy-compact-profile-mobile-'+width+'.png',fullPage:false});await page.goto(origin);await page.waitForSelector('.gnet-post');}
 // Professional portfolio: owner edits, public presentation, same posts and commerce entry points.
 await page.setViewportSize({width:1365,height:1000});await page.goto(origin+'/profile?member='+OWNER);await page.waitForSelector('#gnet-section-strength');
 assert.equal(await page.locator('#gnet-section-experience').isVisible(),true,'owners can find Experience before adding a role');
 assert.match(await page.locator('#gnet-section-experience').innerText(),/Add your roles/);

 await page.locator('#gnet-section-experience [data-section=experience]').click();
 for(const width of [1365,390,320]){
  await page.setViewportSize({width,height:900});
  const modal=await page.locator('.gnet-role-dialog').evaluate(d=>({width:d.getBoundingClientRect().width,viewport:innerWidth,saveBottom:d.querySelector('[type=submit]').getBoundingClientRect().bottom,lock:getComputedStyle(document.body).position}));
  assert.ok(modal.width<=modal.viewport,'role editor fits '+width);assert.ok(modal.saveBottom<=900,'Save remains visible at '+width);assert.equal(modal.lock,'fixed');
  await page.locator('.gnet-role-dialog').screenshot({path:'/private/tmp/guidcy-role-editor-'+width+'.png'});
 }
 await page.setViewportSize({width:1365,height:1000});
 await page.locator('#gp-designation').fill('R&D Engineer');await page.locator('#gp-company_name').fill('Optical');await page.waitForSelector('#gp-company_name-organizations option',{state:'attached'});assert.equal(await page.locator('#gp-company_name-organizations option').first().getAttribute('value'),'Optical Research');await page.locator('#gp-company_name').fill('Optical Research');await page.locator('#gp-employment_type').selectOption('Full-time');await page.locator('#gp-start_month').selectOption('06');await page.locator('#gp-start_year').fill('2022');await page.locator('#gp-location_type').selectOption('On-site');await page.locator('[name=currently_working]').check();await page.locator('#gp-location').fill('Roorkee');await page.locator('#gp-description').fill('Developed optical fiber materials.');await page.locator('#gp-skills').fill('Polymer Science, Optical Fiber');await page.locator('.gnet-prof-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelector('#gnet-section-experience')?.textContent.includes('R&D Engineer'));assert.match(await page.locator('#gnet-section-experience').innerText(),/Full-time[\s\S]*On-site[\s\S]*R&D Engineer[\s\S]*Present/);
 await page.waitForSelector('#gnet-section-experience [data-organization] img');
 await page.locator('#gnet-section-experience [data-section=experience]').click();
 await page.locator('#gp-designation').fill('Research Intern');await page.locator('#gp-company_name').fill('Optical Research');await page.locator('#gp-employment_type').selectOption('Internship');await page.locator('#gp-start_month').selectOption('06');await page.locator('#gp-start_year').fill('2020');await page.locator('#gp-end_month').selectOption('05');await page.locator('#gp-end_year').fill('2021');await page.locator('#gp-location_type').selectOption('On-site');await page.locator('#gp-location').fill('Delhi');await page.locator('#gp-description').fill('Studied sustainable materials.');await page.locator('#gp-skills').fill('Research, Materials');
 await page.locator('#gp-end_year').fill('2019');await page.locator('.gnet-prof-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.gnet-form-error')?.textContent.includes('End date must follow'));await page.locator('#gp-end_year').fill('2021');
 await page.locator('.gnet-prof-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('#gnet-section-experience .gnet-career-entry').length===2);
 assert.deepEqual(await page.locator('#gnet-section-experience .gnet-career-entry h3').allTextContents(),['R&D Engineer','Research Intern'],'current work appears before previous roles');
 assert.equal(await page.locator('#gnet-section-experience .gnet-experience-company').count(),1,'roles at the same company share a logo and company heading');
 await page.locator('#gnet-section-experience').screenshot({path:'/private/tmp/guidcy-experience-timeline.png'});
 await page.locator('#gnet-section-experience .gnet-career-entry').filter({hasText:'Research Intern'}).locator('[data-action=edit-experience]').click();
 for(const [field,value] of Object.entries({designation:'Research Intern',company_name:'Optical Research',employment_type:'Internship',start_month:'06',start_year:'2020',end_month:'05',end_year:'2021',location_type:'On-site',location:'Delhi',description:'Studied sustainable materials.',skills:'Research, Materials'}))assert.equal(await page.locator('#gp-'+field).inputValue(),value,'experience preserves '+field);
 await page.locator('#gnet-remove-entry').click();await page.locator('#gnet-remove-entry').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('#gnet-section-experience .gnet-career-entry').length===1);
 await page.locator('#gnet-section-experience [data-action=edit-experience]').click();await page.locator('#gp-company_name').fill('Technologies');await page.waitForSelector('#gp-company_name-organizations option[value="Guidcy Technologies"]',{state:'attached'});await page.locator('#gp-company_name').fill('Guidcy Technologies');await page.locator('#gp-description').fill('Led materials research and product development.');await page.locator('.gnet-prof-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelector('#gnet-section-experience')?.textContent.includes('Led materials'));await page.waitForSelector('#gnet-section-experience [data-organization="guidcy technologies"] img');await page.waitForSelector('.gnet-organizations [data-organization="guidcy technologies"] img');
 await page.locator('#gnet-section-skills [data-section=skills]').click();await page.locator('#gp-skills').fill('Polymer Science, Optical Fiber, Career Guidance');await page.locator('.gnet-prof-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelector('#gnet-section-skills')?.textContent.includes('Polymer Science'));await page.locator('#gnet-section-skills').screenshot({path:'/private/tmp/guidcy-profile-skill-labels.png'});
 for(const kind of ['education','certification','award','publication','project','patent','achievement']){
  await page.locator('[data-action=add-section]').click();await page.locator('#gnet-dialog [data-section="'+kind+'"]').click();await page.locator('#gp-title').fill(kind==='education'?'M.Tech Polymer Science':'My '+kind);if(kind==='education'){await page.locator('#gp-organization').fill('Guidcy Inst');await page.waitForSelector('#gp-organization-organizations option[value="Guidcy Institute"]',{state:'attached'});await page.locator('#gp-organization').fill('Guidcy Institute');}else await page.locator('#gp-organization').fill('IIT Roorkee');await page.locator('#gp-description').fill('Professional '+kind+' details.');
  if(kind==='education'){await page.locator('#gp-field').fill('Polymer Science');await page.locator('#gp-start_date').fill('2020');await page.locator('#gp-end_date').fill('2022');await page.locator('#gp-grade').fill('9.0');}
  await page.locator('.gnet-prof-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('#gnet-section-'+kind);
 }
 await page.waitForSelector('#gnet-section-education [data-organization] img');
 for(const width of [1365,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.querySelector('#gnet-section-experience').getBoundingClientRect().top<document.querySelector('#gnet-section-education').getBoundingClientRect().top),true,'Experience is above Education at '+width);
 }
 await page.setViewportSize({width:1365,height:1000});
 for(const selector of ['.gnet-organizations a[data-organization="guidcy institute"]','.gnet-education a[data-organization-name="guidcy institute"]','#gnet-section-education a[data-organization-name="guidcy institute"]','#gnet-section-experience a[data-organization-name="guidcy technologies"]']){await page.waitForSelector(selector);assert.equal(await page.locator(selector).getAttribute('href'),'/consultant/test-expert');}
 for(const selector of ['#gnet-section-education a[data-organization-name="guidcy institute"]','#gnet-section-experience a[data-organization="guidcy technologies"]']){await page.locator(selector).click();await page.waitForFunction(()=>location.pathname==='/consultant/test-expert'&&document.querySelector('#page-profile.on .gnet-profile-header'));await page.evaluate(id=>window.guidcyNavigate('/profile?member='+id),OWNER);await page.waitForSelector('#gnet-section-education');}

 await page.locator('#gnet-section-project [data-action=edit-entry]').click();await page.locator('#gp-title').fill('Optical fiber project');await page.locator('.gnet-prof-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForFunction(()=>document.querySelector('#gnet-section-project')?.textContent.includes('Optical fiber project'));
 await page.locator('#gnet-section-award [data-action=edit-entry]').click();assert.equal(await page.locator('#gnet-remove-entry').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');await page.locator('#gnet-remove-entry').click();await page.locator('#gnet-remove-entry').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('#gnet-section-award',{state:'detached'});
 await page.locator('#gnet-section-featured [data-section=featured]').click();await page.locator('#gnet-feature-source').selectOption('entry');await page.locator('.gnet-feature-choice').filter({hasText:'Optical fiber project'}).click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('.gnet-featured-item');assert.match(await page.locator('.gnet-featured-item').innerText(),/Optical fiber project/);
 // Deleting a current role/college removes the header and homepage summaries too.
 await page.locator('#gnet-section-education [data-action=edit-entry]').click();assert.equal(await page.locator('#gnet-remove-entry').innerText(),'Delete');await page.locator('#gnet-remove-entry').click();await page.locator('#gnet-remove-entry').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('.gnet-organizations .gnet-education',{state:'detached'});
 await page.locator('#gnet-section-experience [data-action=edit-experience]').click();assert.equal(await page.locator('#gnet-remove-entry').innerText(),'Delete');await page.locator('#gnet-remove-entry').click();await page.locator('#gnet-remove-entry').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('.gnet-organizations .guidcy-profile-work-company',{state:'detached'});
 await page.locator('.gnet-profile-actions [data-action=edit-profile]').click();await page.locator('#gnet-edit-company').fill('Temporary company');await page.locator('#gnet-profile-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('.guidcy-profile-work-company');await page.locator('.gnet-profile-actions [data-action=edit-profile]').click();await page.locator('#gnet-edit-company').fill('');await page.locator('#gnet-profile-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('.gnet-organizations .guidcy-profile-work-company',{state:'detached'});
 await page.locator('.gnet-featured-item a').first().click();assert.match(await page.locator('#gnet-section-project').innerText(),/Optical fiber project/);
 assert.equal(await page.locator('.gnet-profile-more').count(),0);await page.locator('[data-action=share-profile]').click();assert.match(await page.locator('#gnet-share-url').inputValue(),/profile\?member=/);assert.equal(await page.locator('#gnet-dialog a[target=_blank]').count(),3);await page.locator('#gnet-dialog [data-close]').click();
 await page.locator('[data-action=profile-network][data-direction=following]').click();assert.match(await page.locator('#gnet-dialog h2').innerText(),/Following/);await page.locator('#gnet-dialog [data-close]').click();
 await page.locator('[data-tab=posts]').click();await page.locator('.gnet-activity [data-action=compose]').first().click();await page.locator('#gnet-body').fill('A real achievement post from the profile editor fixture.');await page.locator('#gnet-post-form [type=submit]').click();await page.waitForSelector('#gnet-dialog',{state:'detached'});await page.waitForSelector('#gnet-profile-posts .gnet-post');
 await page.locator('[data-tab=posts]').click();await page.waitForFunction(()=>document.querySelector('#gnet-profile-posts')?.textContent.includes('real achievement post'));
 await page.locator('#gnet-profile-posts .gnet-post [data-action=comments]').last().click();await page.locator('.gnet-comment-form textarea').fill('A useful professional conversation on my profile.');await page.locator('.gnet-comment-form button').click();await page.waitForSelector('.gnet-comment');
 assert.equal(await page.locator('[data-tab=comments],.gnet-activity-comment').count(),0,'Activity lists posts only; individual post comments remain available');
 await page.locator('[data-tab=posts]').click();await page.waitForSelector('#gnet-profile-posts .gnet-post');await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'/private/tmp/guidcy-professional-owner.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Professional portfolio fits '+width);await page.screenshot({path:'/private/tmp/guidcy-professional-owner-'+width+'.png',fullPage:true});}
 await page.goto(origin+'/consultant/test-expert');await page.waitForSelector('.gnet-profile-header');await page.waitForSelector('#gnet-profile-posts .gnet-post');assert.equal(await page.locator('#gnet-section-strength').count(),0,'strength is never public');await page.locator('#gnet-activity-more').click();await page.waitForFunction(()=>document.querySelectorAll('#gnet-profile-posts .gnet-post').length>5);assert.equal(new Set(await page.locator('#gnet-profile-posts .gnet-post').evaluateAll(els=>els.map(el=>el.dataset.post))).size,await page.locator('#gnet-profile-posts .gnet-post').count(),'activity pagination has no duplicates');
 await page.goto(origin);await page.waitForSelector('.gnet-post');
 await page.evaluate(()=>{window.__guest=true;window.__authListeners.forEach(fn=>fn('SIGNED_OUT',null));});await page.waitForFunction(()=>!document.querySelector('.gnet-post [data-action=edit]'));await page.locator('.gnet-post [data-action=like]').first().click();await page.waitForSelector('#gnet-dialog');assert.match(await page.locator('#gnet-dialog').innerText(),/Sign in/);await page.locator('#gnet-dialog a[href="/login"]').click();await page.waitForSelector('#page-login.on');assert.equal(await page.locator('#gnet-dialog').count(),0);await page.goto(origin);await page.waitForSelector('.gnet-post');
 await page.setViewportSize({width:1365,height:1000});await page.evaluate(()=>window.__failFeed=true);await page.locator('[data-action=refresh]').click();await page.waitForFunction(()=>document.querySelector('#gnet-feed').textContent.includes('couldn’t load'));await page.setViewportSize({width:320,height:900});await page.evaluate(()=>window.__failFeed=false);await page.locator('#gnet-feed [data-action=refresh]').click();await page.waitForSelector('.gnet-post');
 assert.deepEqual(await page.evaluate(()=>window.__legacyProfilePaints),[],'the old profile is never rendered');
 await page.evaluate(()=>document.querySelector('[data-action=organization-directory]').click());await page.waitForSelector('#gnet-org-list .gnet-org-row');await page.locator('#gnet-org-add').click();await page.locator('#gnet-org-name').fill('Directory browser fixture');await page.locator('#gnet-org-logo').fill('https://example.com/logo.png');await page.locator('#gnet-org-approved').check();await page.locator('#gnet-org-form [type=submit]').click();await page.waitForSelector('#gnet-org-search');assert.match(await page.locator('#gnet-org-list').innerText(),/Directory browser fixture/);await page.locator('.gnet-org-row').filter({hasText:'Directory browser fixture'}).click();await page.locator('#gnet-org-approved').uncheck();await page.locator('#gnet-org-form [type=submit]').click();await page.waitForSelector('#gnet-org-search');assert.match(await page.locator('#gnet-org-list').innerText(),/Directory browser fixture · Company · Hidden/);await page.locator('#gnet-dialog [data-close]').click();
 // Expert cards must honor company deletion immediately, including warm caches.
 await page.evaluate(async()=>{const c=window.guidcyGetSupabaseClient();await c.from('consultants').update({current_company:'HFCL',current_company_college:'HFCL'}).eq('id','test-expert');window.guidcyBroadcastDataChange('consultants');await window.fetchConsultants({});await window.GuidcyConsultantSearch.loadCandidates();});
 const cleared=await page.evaluate(async()=>{const c=window.guidcyGetSupabaseClient();await c.from('consultants').update({current_company:'',current_company_college:'HFCL'}).eq('id','test-expert');window.guidcyBroadcastDataChange('consultants');const rows=await window.fetchConsultants({}),suggestions=await window.GuidcyConsultantSearch.loadCandidates();window.renderGrid(rows,'browse-grid');return {company:rows.find(c=>c.id==='test-expert').current_company_college,searchCompany:suggestions.find(c=>c.id==='test-expert').current_company_college,card:document.querySelector('#browse-grid [data-consultant-id="test-expert"]').textContent};});
 assert.equal(cleared.company,'');assert.equal(cleared.searchCompany,'');assert.doesNotMatch(cleared.card,/HFCL/);
 await page.evaluate(async()=>{const c=window.guidcyGetSupabaseClient();await c.from('consultants').update({highest_education:'M.Tech',education:'M.Tech',college:'IIT Roorkee'}).eq('id','test-expert');window.guidcyBroadcastDataChange('consultants');await window.fetchConsultants({});await window.GuidcyConsultantSearch.loadCandidates();});
 const educationCleared=await page.evaluate(async()=>{const c=window.guidcyGetSupabaseClient();await c.from('consultants').update({highest_education:'',college:''}).eq('id','test-expert');window.guidcyBroadcastDataChange('consultants');const rows=await window.fetchConsultants({}),suggestions=await window.GuidcyConsultantSearch.loadCandidates();window.renderGrid(rows,'browse-grid');return {degree:rows.find(c=>c.id==='test-expert').highest_education,college:rows.find(c=>c.id==='test-expert').college,searchDegree:suggestions.find(c=>c.id==='test-expert').highest_education,card:document.querySelector('#browse-grid [data-consultant-id="test-expert"]').textContent};});
 assert.equal(educationCleared.degree,'');assert.equal(educationCleared.college,'');assert.equal(educationCleared.searchDegree,'');assert.doesNotMatch(educationCleared.card,/M.Tech|IIT Roorkee/);

 assert.equal(await page.evaluate(()=>window.__socialQueries.some(q=>['community_connection','community_network'].includes(q.rpc))),false,'no retired connection API requests');
 // Real touch input on a mobile viewport exercises the gesture rather than dispatching a desktop double click.
 const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
 await touch.route('**/*',route=>{const url=route.request().url();if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixture});return url.startsWith(origin)?route.continue():route.abort();});
 const mobile=await touch.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin);await mobile.waitForSelector('.gnet-post');await mobile.waitForFunction(()=>document.querySelector('#gnet-compose-avatar .gnet-avatar')&&document.querySelector('#nav-right a.avatar-chip'));await mobile.evaluate(()=>document.fonts.ready);
 await mobile.locator('#guidcy-cookie-banner [data-cookie-choice=reject]').click();
 const search=await mobile.locator('.gnet-site-search-field').evaluate(el=>({height:el.getBoundingClientRect().height,input:getComputedStyle(el.querySelector('input')).fontSize,placeholder:getComputedStyle(el.querySelector('input'),'::placeholder').fontSize,button:!!el.querySelector('button'),radius:getComputedStyle(el).borderRadius}));
 assert.ok(search.height<=48,'mobile search stays compact');assert.equal(search.input,'16px','input avoids iOS focus zoom');assert.equal(search.placeholder,'13px');assert.equal(search.button,false,'search has no visible submit button');assert.equal(search.radius,'28px','search has rounded ends like the composer');
 await mobile.locator('.gnet-site-search-field').screenshot({path:'/private/tmp/guidcy-rounded-search-mobile.png'});
 // A touch tap must settle without another tap clearing a sticky hover pill.
 async function checkTouchFollow(selector){
  const button=mobile.locator(selector).first();
  for(const pressed of [true,false]){
   await button.tap();
   await mobile.waitForFunction(({selector,pressed})=>{const b=document.querySelector(selector);return b?.getAttribute('aria-pressed')===String(pressed)&&!b.disabled;},{selector,pressed});
   const style=await button.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,weight:getComputedStyle(el).fontWeight,label:el.querySelector('[data-follow-label]').textContent}));
   assert.equal(style.background,'rgba(0, 0, 0, 0)','touch follow has no lingering label background');
   assert.equal(style.color,'rgb(30, 114, 190)');assert.equal(style.weight,'700');assert.equal(style.label,pressed?'Following':'Follow');
  }
 }
 await checkTouchFollow('.gnet-post [data-follow]');

 const mobilePost=mobile.locator('.gnet-post').first(),body=mobilePost.locator('.gnet-post-body');await body.scrollIntoViewIfNeeded();const box=await body.boundingBox(),x=box.x+25,y=box.y+18;
 await mobile.touchscreen.tap(x,y);assert.equal(await mobilePost.locator('[data-action=like]').getAttribute('aria-pressed'),'false','one tap does not like');await mobile.touchscreen.tap(x,y);await mobile.waitForFunction(()=>window.__social.community_likes.length===1);assert.equal(await mobilePost.locator('.gnet-like-burst').count(),1,'touch double-tap displays a heart');
 await mobile.touchscreen.tap(x,y);await mobile.touchscreen.tap(x,y);assert.equal(await mobile.evaluate(()=>window.__social.community_likes.length),1,'repeated double-taps never unlike or duplicate');
 await mobilePost.locator('[data-action=like]').click();await mobile.waitForFunction(()=>window.__social.community_likes.length===0);
 await body.evaluate(el=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:9,clientX:25,clientY:25}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:9,clientX:25,clientY:70}));el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:9,clientX:25,clientY:25}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:9,clientX:25,clientY:25}));});assert.equal(await mobile.evaluate(()=>window.__social.community_likes.length),0,'a swipe followed by a tap does not like');
 // Media and card whitespace share the same gesture; player controls stay independent.
 await mobilePost.evaluate(async card=>{const video=document.createElement('video');video.className='gnet-test-video';video.controls=true;video.style.cssText='display:block;width:100%;height:180px';card.querySelector('.gnet-post-counts').before(video);const image=new Image();image.className='gnet-post-image gnet-test-image';image.src='/favicon-192x192.png';video.after(image);await image.decode();});
 for(const selector of ['.gnet-test-video','.gnet-test-image']){
  const media=mobilePost.locator(selector);await media.scrollIntoViewIfNeeded();const r=await media.boundingBox();await mobile.touchscreen.tap(r.x+30,r.y+30);await mobile.touchscreen.tap(r.x+30,r.y+30);await mobile.waitForFunction(()=>window.__social.community_likes.length===1);
  await mobile.touchscreen.tap(r.x+30,r.y+30);await mobile.touchscreen.tap(r.x+30,r.y+30);assert.equal(await mobile.evaluate(()=>window.__social.community_likes.length),1,'media double taps do not duplicate likes');await mobilePost.locator('[data-action=like]').click();await mobile.waitForFunction(()=>window.__social.community_likes.length===0);
 }
 await mobilePost.locator('.gnet-test-video').evaluate(el=>{const r=el.getBoundingClientRect();for(let i=0;i<2;i++){el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:10,clientX:r.x+30,clientY:r.bottom-10}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:10,clientX:r.x+30,clientY:r.bottom-10}));}});assert.equal(await mobile.evaluate(()=>window.__social.community_likes.length),0,'native video control strip does not like');
 await mobilePost.locator('.gnet-post-body').scrollIntoViewIfNeeded();const postEdge=await mobilePost.boundingBox();await mobile.touchscreen.tap(postEdge.x+5,postEdge.y+100);await mobile.touchscreen.tap(postEdge.x+5,postEdge.y+100);await mobile.waitForFunction(()=>window.__social.community_likes.length===1);await mobilePost.locator('[data-action=like]').click();await mobile.waitForFunction(()=>window.__social.community_likes.length===0);await mobilePost.evaluate(card=>card.querySelectorAll('.gnet-test-video,.gnet-test-image').forEach(el=>el.remove()));
 await mobilePost.locator('[data-action=comments]').last().click();await mobilePost.locator('.gnet-comment-form textarea').fill('A compact mobile comment.');const postButton=await mobilePost.locator('.gnet-comment-submit').evaluate(el=>({target:el.getBoundingClientRect().height,pill:el.querySelector('span').getBoundingClientRect().height,width:el.querySelector('span').getBoundingClientRect().width,bar:el.closest('.gnet-comment-input').getBoundingClientRect().height}));assert.ok(postButton.target>=44,'compact Post keeps a touch target');assert.equal(postButton.pill,28,'visible Post pill is compact');assert.ok(postButton.width>=56,'Post pill has room around its label');assert.ok(postButton.pill<postButton.bar*.7,'Post is inset within the comment bar');await mobilePost.locator('.gnet-comment-form').screenshot({path:'/private/tmp/guidcy-comment-post-button-mobile.png'});await mobilePost.locator('.gnet-comment-form button').click();await mobilePost.locator('.gnet-comment').waitFor();assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await mobilePost.locator('.gnet-comments').screenshot({path:'/private/tmp/guidcy-comments-mobile.png'});
 await mobile.goto(origin+'/consultant/test-expert');await mobile.waitForSelector('#gnet-profile-posts .gnet-post');await checkTouchFollow('.gnet-profile-actions [data-follow]');const activityPost=mobile.locator('#gnet-profile-posts .gnet-post').first();await activityPost.locator('[data-action=comments]').last().click();await activityPost.locator('.gnet-comment-form textarea').waitFor();assert.equal(await activityPost.locator('.gnet-comments-more').isVisible(),false,'empty comments have no pagination control');assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'comments fit narrow profile activity cards');
 await activityPost.screenshot({path:'/private/tmp/guidcy-comments-profile-mobile.png'});
 await mobile.evaluate(()=>window.guidcyNavigate('/'));await mobile.waitForSelector('.gnet-post');await mobile.locator('#gnet-site-search').fill('webinars');await mobile.locator('#gnet-site-search').press('Enter');await mobile.waitForSelector('#page-webinar.on');
 // Long company and college names remain fully wrapped in the right-hand profile column.
 await mobile.evaluate(async owner=>{await window.guidcyGetSupabaseClient().rpc('community_update_identity',{p_data:{company:'Guidcy Technologies Private Limited',college:'Lal Bahadur Shastri Institute of Management, New Delhi'}});window.guidcyNavigate('/profile?member='+owner);},OWNER);
 await mobile.waitForSelector('.gnet-organizations .gnet-education');
 for(const width of [320,390,768,1365]){
  await mobile.setViewportSize({width,height:900});await mobile.evaluate(()=>document.fonts.ready);
  const organizations=await mobile.locator('.gnet-profile-intro').evaluate(el=>{const heading=el.querySelector('.gnet-profile-heading').getBoundingClientRect(),org=el.querySelector('.gnet-organizations').getBoundingClientRect();return {right:org.left>=heading.right,top:Math.abs(org.top-heading.top),names:[...el.querySelectorAll('.gnet-organizations strong')].map(n=>({text:n.textContent,wrap:getComputedStyle(n).whiteSpace,align:getComputedStyle(n).textAlign,left:n.getBoundingClientRect().left,rightGap:Math.abs(n.parentElement.getBoundingClientRect().right-el.getBoundingClientRect().right),fits:n.scrollWidth<=n.clientWidth+1})),fits:document.documentElement.scrollWidth<=innerWidth};});
  assert.ok(organizations.right,'organizations stay on the right at '+width);assert.ok(organizations.top<=4,'organizations share the introduction row');assert.ok(organizations.fits);assert.equal(organizations.names.length,2);assert.ok(organizations.names.every(n=>n.wrap==='normal'&&n.fits),'long organization names wrap without cropping');assert.ok(organizations.names.every(n=>n.align==='left'&&n.rightGap<1),'organization block stays at the far-right content edge with left-aligned names');assert.ok(Math.abs(organizations.names[0].left-organizations.names[1].left)<1,'company and college text share one starting column');
  await mobile.locator('.gnet-profile-header').screenshot({path:'/private/tmp/guidcy-profile-organizations-'+width+'.png'});
 }
 // Reproduce the supplied mobile profile: short organization names, a multi-line headline, and a public website.
 await mobile.evaluate(async()=>{await window.guidcyGetSupabaseClient().rpc('community_update_identity',{p_data:{name:'Prakhar Tripathi',headline:'HFCL | IIT Roorkee | NTU | Polymer | Recycling | Adhesive',company:'HFCL',college:'IIT Roorkee',city:'Hyderabad',website_url:'https://www.hfcl.com',website_public:true}});window.guidcyNavigate('/profile?member=33333333-3333-4333-8333-333333333333');});
 await mobile.waitForFunction(()=>document.querySelector('.gnet-profile-header .profile-name')?.textContent==='Community Member');await mobile.evaluate(owner=>window.guidcyNavigate('/profile?member='+owner),OWNER);
 await mobile.waitForFunction(()=>document.querySelector('.gnet-profile-website')?.textContent.includes('www.hfcl.com'));
 for(const width of [320,390,430,768]){
  await mobile.setViewportSize({width,height:1000});await mobile.evaluate(()=>document.fonts.ready);
  const spacing=await mobile.locator('.gnet-profile-header').evaluate(header=>{const marks=[...header.querySelectorAll('.gnet-organizations .gnet-org-mark')].map(n=>n.getBoundingClientRect()),names=[...header.querySelectorAll('.gnet-organizations strong')].map(n=>n.getBoundingClientRect()),city=header.querySelector('.gnet-current-location').getBoundingClientRect(),website=header.querySelector('.gnet-profile-website').getBoundingClientRect(),followers=header.querySelector('.gnet-profile-count-line').getBoundingClientRect();return {organizationWidth:header.querySelector('.gnet-organizations').getBoundingClientRect().width,logos:Math.abs(marks[0].left-marks[1].left),names:Math.abs(names[0].left-names[1].left),cityToWebsite:website.top-city.bottom,websiteToFollowers:followers.top-website.bottom,fits:document.documentElement.scrollWidth<=innerWidth};});
  assert.ok(spacing.organizationWidth<=130,'short organization names do not leave a large gap beside their logos');assert.ok(spacing.logos<1,'company and college logos share one column at '+width);assert.ok(spacing.names<1,'organization labels share one starting column');assert.ok(spacing.cityToWebsite>=0&&spacing.cityToWebsite<=8,'city and website spacing stays compact');assert.ok(spacing.websiteToFollowers>=0&&spacing.websiteToFollowers<=12,'website and followers stay together');assert.ok(spacing.fits);
  await mobile.locator('.gnet-profile-header').screenshot({path:'/private/tmp/guidcy-profile-spacing-'+width+'.png'});
 }
 await mobile.setViewportSize({width:390,height:844});
 // Check the shared controls on public routes as a signed-out mobile visitor.
 await mobile.evaluate(()=>{window.__guest=true;window.__authListeners.forEach(fn=>fn('SIGNED_OUT',null));});
 for(const route of ['/find-experts','/marketplace','/webinars','/find-jobs','/blog','/funds-grants','/career-ai-finder']){
  await mobile.evaluate(route=>window.guidcyNavigate(route),route);await mobile.waitForFunction(()=>!!document.querySelector('.page.on'));await mobile.evaluate(()=>document.fonts.ready);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'public controls fit mobile '+route);
  if(['/find-experts','/marketplace','/webinars'].includes(route))await mobile.screenshot({path:'/private/tmp/guidcy-controls-'+route.slice(1)+'.png'});
 }
 await touch.close();
 console.log('AI scroll lock, touch likes, blue hearts, compact search and comment controls passed');
 assert.deepEqual(errors,[]);
 // Read-only smoke test against the configured public database. No fixture/auth writes.
 if(process.env.COMMUNITY_LIVE==='1'){
  const live=await browser.newContext({viewport:{width:1365,height:1000}});
  await live.route('**/*',r=>{const url=r.request().url();return url.startsWith(origin)||url.startsWith('https://lsthngfxehayeqyctkla.supabase.co/')?r.continue():r.abort();});
  const actual=await live.newPage(),requests=[];actual.on('request',r=>requests.push(r.url()));
  await actual.goto(origin);await actual.waitForSelector('#gnet-experts .gnet-person');await actual.waitForFunction(()=>document.querySelector('#gnet-feed').getAttribute('aria-busy')==='false');
  assert.doesNotMatch(await actual.locator('#gnet-feed').innerText(),/couldn’t load/);
  await actual.locator('[data-cookie-choice=reject]').first().click();
  await actual.screenshot({path:'/private/tmp/guidcy-community-public-desktop.png',fullPage:false});
  assert.equal(requests.some(url=>/home_opportunities_cache/.test(url)),false);
  await actual.locator('#gnet-experts .gnet-person').first().click();await actual.waitForSelector('#page-profile.on .profile-name');await actual.waitForSelector('.gnet-profile-header');assert.equal(await actual.locator('.book-box').count(),1);
  await actual.goto(origin+'/consultant/88eebb17-27b4-4116-a6ea-2104f00751cf');await actual.locator('.gnet-profile-actions [data-action=book]').waitFor();await actual.locator('.gnet-consultation .book-box').waitFor();
  assert.doesNotMatch(await actual.locator('.gnet-organizations').allTextContents().then(x=>x.join(' ')),/M.Tech|IIT Roorkee/);
  const realCard=await actual.evaluate(async()=>{const rows=await window.fetchConsultants({search:'Guidcy'});window.renderGrid(rows,'browse-grid');return document.querySelector('#browse-grid [data-consultant-id="88eebb17-27b4-4116-a6ea-2104f00751cf"]')?.textContent});
  assert.match(realCard,/Guidcy Technologies/);assert.doesNotMatch(realCard,/M.Tech|IIT Roorkee/);
  await actual.goto(origin+'/?post=aaaaaaaa-aaaa-4aaa-8aaa-000000000001');await actual.waitForFunction(()=>document.querySelector('#gnet-feed').textContent.includes('no longer available'));
  await actual.setViewportSize({width:390,height:900});await actual.goto(origin);await actual.waitForSelector('#gnet-experts .gnet-person');await actual.waitForFunction(()=>document.querySelector('#gnet-feed').getAttribute('aria-busy')==='false');
  assert.equal(await actual.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await actual.screenshot({path:'/private/tmp/guidcy-community-public-mobile.png',fullPage:false});await live.close();
  console.log('Public Supabase smoke check passed: real experts, empty feed, missing post, existing booking profile, no obsolete homepage cache reads.');
 }
 assert.equal(await page.evaluate(()=>window.__socialQueries.some(q=>/endorse/.test(q.rpc||''))),false,'profiles make no endorsement requests');
 console.log('Identity, follows, skills without endorsements, modal scroll lock, cold/warm profile layout and community + professional profile checks passed: CRUD, skills, career/education/portfolio editors, featured items, activity tabs/pagination, followers, sharing, guest gates, single renderer, 320/390/1365px.');
})().catch(async e=>{console.error(e);const page=browser?.contexts()[0]?.pages()[0];for(const c of browser?.contexts()||[])for(const p of c.pages())console.error('Open page',await p.evaluate(()=>({url:location.href,fixture:!!window.__social})).catch(()=>({closed:true})));if(page){console.error(await page.evaluate(()=>({url:location.href,feed:document.querySelector('#gnet-feed')?.textContent.slice(0,200),queries:window.__socialQueries?.slice(-8)})));await page.screenshot({path:'/private/tmp/guidcy-community-failure.png'});}process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
