/* A reload creates a new document. Restore its last rendered regions before
 * deferred application code starts, in the actual layout (no overlay).
 * This is a bounded, tab-local presentation cache, never an auth/data source. */
(function(){
 'use strict';
 var pathTabs={"/dashboard/webinars":"my-webinars","/dashboard/my-webinars":"my-webinars","/dashboard/payments":"payments","/dashboard/history":"history","/dashboard/profile":"settings","/dashboard/settings":"settings","/dashboard/upcoming":"upcoming","/dashboard/saved":"saved","/dashboard/marketplace":"marketplace","/consultant-dashboard/webinars":"my-webinars","/consultant-dashboard/my-webinars":"my-webinars","/consultant-dashboard/profile":"settings","/consultant-dashboard/settings":"settings","/consultant-dashboard/earnings":"earnings","/consultant-dashboard/history":"webinar-history","/consultant-dashboard/schedule":"schedule","/consultant-dashboard/requests":"requests","/consultant-dashboard/marketplace":"marketplace","/admin-dashboard/webinars":"webinars","/admin-dashboard/users":"users","/admin-dashboard/payments":"payments","/admin-dashboard/bookings":"bookings","/admin-dashboard/analytics":"overview","/admin-dashboard/marketplace":"marketplace","/admin-dashboard/webinar-registrations":"webinar-registrations"};
 window.guidcyDashboardPathTab=function(path){return pathTabs[String(path||'').replace(/\/$/,'')]||''};
 var KEY='guidcy:refresh:v1',TTL=10*60*1000,LIMIT=900000;
 var regions=['adash-main','cdash-main','udash-main','browse-grid','cats-full-grid','cons-grid','cons-rec-grid','reviews-grid','wbn-cards','wbn-regs-list','gmkt-grid','gc-list','jobs-main-area','sf-results','opp-results','profile-layout','blog-list','home-trust-strip'];
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
 window.guidcyClearRefreshCache=function(){
  window.__guidcyRestoredOwner='';
  try{sessionStorage.removeItem(KEY);localStorage.removeItem('guidcy_nav_cache')}catch(_){}
  document.querySelectorAll('[data-guidcy-restored]').forEach(function(n){n.replaceChildren();n.removeAttribute('inert');n.removeAttribute('data-guidcy-restored')});
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
   var entry={at:Date.now(),uid:uid,page:id,regions:{},height:page.getBoundingClientRect().height};
   regions.forEach(function(key){
    var el=document.getElementById(key);
    if(el&&page.contains(el)&&el.firstChild&&!el.hasAttribute('aria-busy')&&!el.hasAttribute('data-guidcy-restored'))entry.regions[key]={html:cleanHtml(el),height:el.getBoundingClientRect().height};
   });
   entry.identity={};
   if(uid)identity.forEach(function(key){var n=document.getElementById(key);if(n&&page.contains(n))entry.identity[key]={html:cleanHtml(n),style:n.getAttribute('style')||'',className:n.className}});
   entry.controls={};
   controls.forEach(function(key){var field=document.getElementById(key);if(field&&page.contains(field))entry.controls[key]=field.value});
   var cache=read();
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
   if(!el||!page.contains(el))return;
   el.innerHTML=saved.html;
   el.classList.remove('guidcy-panel-skeleton','guidcy-panel-busy','guidcy-panel-swap');
   el.removeAttribute('aria-busy');
   el.setAttribute('data-guidcy-restored','');
   el.setAttribute('inert','');
   // Reserve the last measured region while its data revalidates.
   if(saved.height>0)el.style.minHeight=Math.min(saved.height,2400)+'px';
  });
 };
 window.addEventListener('pagehide',window.guidcySavePageShell);
 document.addEventListener('visibilitychange',function(){if(document.hidden)window.guidcySavePageShell()});
 var cacheOwner=owner();
 window.addEventListener('storage',function(e){if(/^sb-.*-auth-token$/.test(e.key||'')&&owner()!==cacheOwner){cacheOwner=owner();window.guidcyClearRefreshCache()}});
})();
