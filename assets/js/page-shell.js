/* A reload creates a new document. Restore its last rendered regions before
 * deferred application code starts, in the actual layout (no overlay).
 * This is a bounded, tab-local presentation cache, never an auth/data source. */
(function(){
 'use strict';
 var pathTabs={"/dashboard/webinars":"my-webinars","/dashboard/my-webinars":"my-webinars","/dashboard/payments":"payments","/dashboard/history":"history","/dashboard/profile":"settings","/dashboard/settings":"settings","/dashboard/upcoming":"upcoming","/dashboard/saved":"saved","/dashboard/marketplace":"marketplace","/consultant-dashboard/webinars":"my-webinars","/consultant-dashboard/my-webinars":"my-webinars","/consultant-dashboard/profile":"settings","/consultant-dashboard/settings":"settings","/consultant-dashboard/earnings":"earnings","/consultant-dashboard/history":"webinar-history","/consultant-dashboard/schedule":"schedule","/consultant-dashboard/requests":"requests","/consultant-dashboard/marketplace":"marketplace","/admin-dashboard/webinars":"webinars","/admin-dashboard/users":"users","/admin-dashboard/payments":"payments","/admin-dashboard/bookings":"bookings","/admin-dashboard/analytics":"overview","/admin-dashboard/marketplace":"marketplace","/admin-dashboard/webinar-registrations":"webinar-registrations"};
 window.guidcyDashboardPathTab=function(path){return pathTabs[String(path||'').replace(/\/$/,'')]||''};
 var KEY='guidcy:refresh:v1',TTL=10*60*1000,LIMIT=900000;
 var regions=['adash-main','cdash-main','udash-main','browse-grid','cats-full-grid','cons-grid','cons-rec-grid','reviews-grid','wbn-regs-list','gmkt-grid','gc-list','jobs-main-area','sf-results','opp-results','profile-layout','blog-list','home-trust-strip'];
 var controls=['job-q','job-loc','job-source','job-salary','job-exp','job-filter-loc','job-sector','gmkt-search','gmkt-cat','gmkt-price','gmkt-sort'];
 var identity=['udash-name','cdash-name','udash-av','cdash-av','adash-av'];
 var route=function(){return location.pathname+location.search};
 var bootRoute=route(),restored=false;
 function owner(){
  try{
   // Match only the project's storage key once configuration is available.
   var project=window.CFG&&window.CFG.supabase_url;
   var expected=project?'sb-'+new URL(project).hostname.split('.')[0]+'-auth-token':'sb-lsthngfxehayeqyctkla-auth-token';
   for(var i=0;i<localStorage.length;i++){
    var key=localStorage.key(i);
    if(expected?key===expected:/^sb-.*-auth-token$/.test(key)){
     var value=JSON.parse(localStorage.getItem(key)||'null');
     return value&&value.user&&value.user.id||'';
    }
   }
  }catch(_){}
  return '';
 }
 function read(){try{return JSON.parse(sessionStorage.getItem(KEY)||'{}')}catch(_){return {}}}
 function cleanHtml(el){
  var copy=el.cloneNode(true);
  copy.querySelectorAll('script,iframe,object,embed,[data-auth-retry]').forEach(function(n){n.remove()});
  copy.querySelectorAll('input[type=password],input[type=hidden],input[type=file]').forEach(function(n){n.removeAttribute('value')});
  copy.querySelectorAll('textarea').forEach(function(n){n.textContent=''});
  copy.querySelectorAll('[aria-busy],[inert],[data-guidcy-restored]').forEach(function(n){n.removeAttribute('aria-busy');n.removeAttribute('inert');n.removeAttribute('data-guidcy-restored')});
  copy.querySelectorAll('*').forEach(function(n){Array.from(n.attributes).forEach(function(a){if(/^on/i.test(a.name))n.removeAttribute(a.name)})});
  copy.querySelectorAll('[data-guidcy-route-bound-v6]').forEach(function(n){n.removeAttribute('data-guidcy-route-bound-v6')});
  return copy.innerHTML;
 }
 // Public webinar previews have their own verified-list snapshot. Never replay
 // old generic HTML or the legacy localStorage catalogue (which includes history).
 var WEBINARS_KEY='guidcy:public-webinars:v1';
 window.guidcyWebinarSchedule=function(row){
  row=row||{};
  var date=String(row.date||row.webinar_date||''),time=String(row.time||row.webinar_time||'00:00');
  var start=Date.parse(date+'T'+time+'+05:30'); // Published times are IST, on every device.
  var duration=String(row.duration||row.dur||row.duration_minutes||60).toLowerCase();
  var hours=duration.match(/([\d.]+)\s*(?:hours?|hrs?)/),minutes=duration.match(/([\d.]+)\s*(?:minutes?|mins?)/);
  var length=hours||minutes?(hours?Number(hours[1])*60:0)+(minutes?Number(minutes[1]):0):Number(duration);
  if(!Number.isFinite(length)||length<=0)length=60;
  var end=start+length*60000,now=Date.now();
  return {start:start,end:end,status:!Number.isFinite(start)||end<=now?'past':start-now<=30*60000?'live':'upcoming'};
 };
 window.guidcyWebinarEmptyHtml=function(){
  return '<div class="wbn-empty" style="grid-column:1/-1"><span class="wbn-empty-icon">📅</span><div style="font-size:18px;font-weight:var(--font-weight-semibold,600);margin-bottom:8px;color:var(--ink)">No webinars scheduled yet</div><p style="font-size:13px;color:var(--muted);max-width:340px;margin:0 auto">Check back soon — new expert sessions are added weekly.</p></div>';
 };
 window.guidcySavePublicWebinars=function(rows){
  try{
   var container=document.getElementById('wbn-cards');
   if(!container||container.hasAttribute('data-guidcy-restored'))return;
   var cards=[];
   container.querySelectorAll('.wbn-card[data-wbn-id]').forEach(function(card){
    var row=rows.find(function(w){return String(w.id)===card.getAttribute('data-wbn-id')});
    if(!row)return;
    var schedule=window.guidcyWebinarSchedule(row);
    if(schedule.status==='past')return;
    var wrapper=document.createElement('div');wrapper.appendChild(card.cloneNode(true));
    wrapper.querySelectorAll('[onclick*="wbnEditSession"],[onclick*="wbnDeleteSession"]').forEach(function(button){button.remove()});
    cards.push({id:String(row.id),start:schedule.start,end:schedule.end,html:cleanHtml(wrapper)});
   });
   var filter=document.getElementById('wbn-filter-cat');
   var data=JSON.stringify({at:Date.now(),category:filter&&filter.value||'',cards:cards});
   if(data.length<=LIMIT)sessionStorage.setItem(WEBINARS_KEY,data);
  }catch(_){}
 };
 window.guidcyRestorePublicWebinars=function(){
  try{
   var saved=JSON.parse(sessionStorage.getItem(WEBINARS_KEY)||'null');
   var container=document.getElementById('wbn-cards'),count=document.getElementById('wbn-stat-count');
   if(!saved||!container||!Array.isArray(saved.cards)||Date.now()-saved.at>TTL)return;
   var cards=saved.cards.filter(function(card){return Number.isFinite(card.end)&&card.end>Date.now()});
   container.innerHTML=cards.length?cards.map(function(card){return card.html}).join(''):window.guidcyWebinarEmptyHtml();
   cards.forEach(function(card){
    var node=Array.from(container.children).find(function(n){return n.getAttribute('data-wbn-id')===card.id});
    var badge=node&&node.querySelector('.wbn-status-badge');
    if(badge){var live=card.start-Date.now()<=30*60000;badge.className='wbn-status-badge '+(live?'wsb-live':'wsb-upcoming');badge.textContent=live?'● Live now':'Upcoming'}
   });
   container.setAttribute('data-guidcy-restored','');container.setAttribute('inert','');
   if(count)count.textContent=String(cards.length);
   var filter=document.getElementById('wbn-filter-cat');if(filter)filter.value=saved.category||'';
  }catch(_){}
 };
 window.guidcyClearRefreshCache=function(){
  window.__guidcyRestoredOwner='';
  try{sessionStorage.removeItem(KEY);localStorage.removeItem('guidcy_nav_cache')}catch(_){}
  document.querySelectorAll('[data-guidcy-restored]').forEach(function(n){if(n.id==='wbn-cards')return;n.replaceChildren();if(n.__guidcyRestoreMinHeight!==undefined){n.style.minHeight=n.__guidcyRestoreMinHeight;delete n.__guidcyRestoreMinHeight}n.removeAttribute('inert');n.removeAttribute('data-guidcy-restored')});
 };
 window.guidcySavePageShell=function(){
  try{
   var page=document.querySelector('.page.on,.page.active');
   if(!page||!window.__guidcyAuthReadyFired||window.__guidcySignedOut)return;
   var id=page.id.replace('page-','');
   // Payment, confirmation, meeting and auth forms always use their live flow.
   if(['login','signup','payment','confirm','meeting','review'].indexOf(id)>=0)return;
   var uid=owner(),isPrivate=/-dash$/.test(id);
   if(isPrivate&&(!uid||!window.currentUser||window.currentUser.id!==uid))return;
   var cache=read(),previous=cache[route()];
   if(previous&&(previous.uid!==uid||previous.page!==id||Date.now()-previous.at>TTL))previous=null;
   var entry={at:Date.now(),uid:uid,page:id,regions:{},height:page.getBoundingClientRect().height};
   regions.forEach(function(key){
    var el=document.getElementById(key);
    if(!el||!page.contains(el))return;
    if(el.getAttribute('aria-busy')==='true'||el.hasAttribute('data-guidcy-restored')){
     // Reloading during revalidation must not overwrite the last good region.
     var saved=previous&&previous.regions[key];
     if(saved&&Date.now()-(saved.at||previous.at)<=TTL)entry.regions[key]=Object.assign({},saved,{at:saved.at||previous.at});
    }else if(el.firstChild&&!el.classList.contains('guidcy-panel-skeleton')){
     entry.regions[key]={html:cleanHtml(el),height:el.getBoundingClientRect().height,at:Date.now()};
    }
   });
   entry.identity={};
   if(uid)identity.forEach(function(key){var n=document.getElementById(key);if(n&&page.contains(n))entry.identity[key]={html:cleanHtml(n),style:n.getAttribute('style')||'',className:n.className}});
   entry.controls={};
   controls.forEach(function(key){var field=document.getElementById(key);if(field&&page.contains(field))entry.controls[key]=field.value});
   Object.keys(cache).forEach(function(k){if(Date.now()-cache[k].at>TTL||cache[k].uid!==uid)delete cache[k]});
   cache[route()]=entry;
   var keys=Object.keys(cache).sort(function(a,b){return cache[a].at-cache[b].at});
   var data=JSON.stringify(cache);
   while((data.length>LIMIT||keys.length>6)&&keys.length){delete cache[keys.shift()];data=JSON.stringify(cache)}
   sessionStorage.setItem(KEY,data);
  }catch(_){} // Storage disabled/quota: ordinary granular loading still works.
 };
 window.guidcyRestorePageShell=function(){
  if(restored)return;restored=true;
  window.guidcyRestorePublicWebinars();
  var cache=read(),entry=cache[bootRoute],uid=owner();
  if(!entry||entry.uid!==uid||Date.now()-entry.at>TTL)return;
  if(!/^[a-z-]+$/.test(entry.page))return;
  window.__guidcyRestoredOwner=entry.uid;
  var page=document.getElementById('page-'+entry.page);
  if(!page)return;
  Object.keys(entry.identity||{}).forEach(function(key){var n=document.getElementById(key),v=entry.identity[key];if(uid&&identity.indexOf(key)>=0&&n&&page.contains(n)){n.innerHTML=v.html;n.setAttribute('style',v.style);n.className=v.className}});
  Object.keys(entry.controls||{}).forEach(function(key){var field=document.getElementById(key);if(controls.indexOf(key)>=0&&field&&page.contains(field))field.value=entry.controls[key]});
  Object.keys(entry.regions||{}).forEach(function(key){
   if(regions.indexOf(key)<0)return;
   var el=document.getElementById(key),saved=entry.regions[key];
   if(!el||!page.contains(el)||Date.now()-(saved.at||entry.at)>TTL)return;
   el.innerHTML=saved.html;
   el.classList.remove('guidcy-panel-skeleton','guidcy-panel-busy','guidcy-panel-swap');
   el.removeAttribute('aria-busy');
   el.setAttribute('data-guidcy-restored','');
   el.setAttribute('inert','');
   // Reserve the last measured region while its data revalidates.
   if(saved.height>0){el.__guidcyRestoreMinHeight=el.style.minHeight;el.style.minHeight=Math.min(saved.height,2400)+'px'}
  });
 };
 window.addEventListener('pagehide',window.guidcySavePageShell);
 document.addEventListener('visibilitychange',function(){if(document.hidden)window.guidcySavePageShell()});
 var cacheOwner=owner();
 window.addEventListener('storage',function(e){if(/^sb-.*-auth-token$/.test(e.key||'')&&owner()!==cacheOwner){cacheOwner=owner();window.guidcyClearRefreshCache()}});
})();
