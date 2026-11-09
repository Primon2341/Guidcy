import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{withRouteSeo}=require('../lib/seo');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
test('route HTML loads only its feature scripts, including when generated from home HTML',()=>{
 const home=withRouteSeo(index,'/');
 const active=html=>Array.from(html.matchAll(/<script defer data-guidcy-feature="([^"]+)"/g),m=>m[1]);
 assert.deepEqual(active(home),['community']);
 assert.deepEqual(active(withRouteSeo(home,'/find-experts')),[]);
 assert.deepEqual(active(withRouteSeo(home,'/blog')),['blog','blog']);
 assert.deepEqual(active(withRouteSeo(home,'/profile')),['resources','community']);
 assert.doesNotMatch(home,/rel="preload"[^>]+home-hero/);
});
test('consultant reminders look up the same email once per batch and still schedule every booking',async()=>{
 const start=app.indexOf('async function guidcyScanUpcomingBookingsAndSchedule(){');
 const code=app.slice(start,app.indexOf('\nasync function saveBooking',start));
 const reads=[],scheduled=[],checked=[];
 const context={currentUser:{id:'owner'},document:{hidden:false},console,encodeURIComponent,
  supabaseRest:async url=>{reads.push(url);return {data:url.startsWith('profiles?')?[{email:'owner@example.com'}]:url.startsWith('consultants?')?[{id:'consultant',profile_id:'owner'}]:url.includes('consultant_id')?[{id:'one'},{id:'two'},{id:'three'}]:[]}},
  guidcyScheduleReminderTimersForBooking:async(row,email)=>scheduled.push([row.id,email]),guidcyCheckCompletedAndAskReview:async row=>checked.push(row.id)};
 vm.runInNewContext(code,context);await context.guidcyScanUpcomingBookingsAndSchedule();
 assert.equal(reads.filter(url=>url.startsWith('profiles?')).length,1);
 assert.deepEqual(scheduled,[['one','owner@example.com'],['two','owner@example.com'],['three','owner@example.com']]);
 assert.deepEqual(checked,['one','two','three']);
});
test('feature loader coalesces concurrent navigation and retries failed downloads',async()=>{
 const code=fs.readFileSync(new URL('../assets/js/feature-loader.js',import.meta.url),'utf8');
 let loads=0,finish,calls=0;
 const window={addEventListener(){},guidcyLoadScript:()=>{loads++;return new Promise(resolve=>{finish=()=>{window.GuidcyCommunity={mount:()=>calls++};resolve()}})}};
 const document={readyState:'loading',addEventListener(){},getElementById(){return null},querySelectorAll(){return [{dataset:{src:'/community.js'}}]},querySelector(){return null}};
 vm.runInNewContext(code,{window,document,Map,URLSearchParams,location:{search:''},MutationObserver:class{}});
 const one=window.GuidcyCommunity.mount(),two=window.GuidcyCommunity.mount();finish();await Promise.all([one,two]);
 assert.equal(loads,1);assert.equal(calls,2);
 // A failed module must remain retryable; no resolved empty module is cached.
 window.guidcyLoadScript=async()=>{loads++;throw new Error('offline')};
 await window.GuidcyBlog.renderAdmin();
 window.guidcyLoadScript=async()=>{loads++;window.GuidcyBlog={renderAdmin:()=>calls++}};
 await window.GuidcyBlog.renderAdmin();assert.equal(loads,3);assert.equal(calls,3);
});
test('stale dashboard completions only replay a genuinely wrong tab',()=>{
 const start=app.indexOf('var finish=function(){',app.indexOf('function dashboardController(name)'));
 const code=app.slice(start,app.indexOf('try{Promise.resolve(result).then(finish',start));
 let replays=0,title='Overview';
 const context={requestVersion:1,dashboardRequestVersion:{swAD:2},name:'swAD',tab:'overview',info:{mainId:'adash-main'},desiredDashboard:{name:'swAD',tab:'overview'},
  document:{getElementById:()=>({querySelector:()=>({textContent:title})})},clean:s=>s||'',dashboardTabFromLocation:()=>context.desiredDashboard.tab,
  dashboardTitleMatches:(_name,tab,text)=>text.toLowerCase()===tab,scheduleLatestDashboard:()=>replays++};
 vm.runInNewContext(code,context);context.finish();assert.equal(replays,0,'same-tab refresh cannot replay itself');
 context.desiredDashboard.tab='users';title='Users';context.finish();assert.equal(replays,0,'new tab is already correct');
 title='Overview';context.finish();assert.equal(replays,1,'old render actually overwrote the new tab');
});
test('route activation ignores no-op class writes from a renderer',()=>{
 const code=fs.readFileSync(new URL('../assets/js/feature-loader.js',import.meta.url),'utf8');
 let observe,calls=0;const page={id:'page-blog',classList:{contains:()=>true}};
 const document={readyState:'loading',addEventListener(){},querySelector:()=>page,getElementById:id=>id==='page-blog'?page:null};
 const window={addEventListener(){},GuidcyBlog:{renderPublic:()=>calls++}};
 const location={pathname:'/blog',search:''};
 vm.runInNewContext(code,{window,document,Map,URLSearchParams,location,MutationObserver:class{constructor(fn){observe=fn}observe(){}}});
 observe();assert.equal(calls,1);observe();assert.equal(calls,1,'identical class writes do not restart rendering');
 location.search='?q=career';observe();assert.equal(calls,2,'query changes still activate the same page');
});
