/* Session restoration is an asynchronous state, never a temporary sign-out.
 * No stored profile is used here to grant a role or authorize an operation.
 * Supabase continues to own token persistence, refresh and OAuth. */
(function(){
 'use strict';
 window.__guidcyAuthResolved=false;
 window.guidcyDashboardAuthReady=function(){
  return !!(window.__guidcyAuthReadyFired&&window.__guidcyAuthUser&&
   window.currentProfile&&window.currentProfile.id===window.__guidcyAuthUser.id&&!window.__guidcySignedOut);
 };
 window.guidcyConfigureAuthClient=function(client){
  if(!client||!client.auth||client.auth.__guidcyLifecycle)return client;
  var auth=client.auth,read=auth.getSession.bind(auth),pending=null;
  auth.__guidcyLifecycle=true;
  auth.getSession=function(){
   if(pending)return pending;
   var epoch=window.__guidcyAuthEpoch||0;
   var request=Promise.resolve().then(read).then(function(result){
    if(result&&!result.error&&epoch===(window.__guidcyAuthEpoch||0)){
     window.__guidcyAuthResolved=true;
     window.__guidcyAuthUser=result.data&&result.data.session&&result.data.session.user||null;
     if(!window.__guidcyAuthUser&&window.__guidcyRestoredOwner&&window.guidcyClearRefreshCache)window.guidcyClearRefreshCache();
    }
    return result;
   });
   pending=request;
   request.then(clear,clear);
   function clear(){if(pending===request)pending=null}
   return request;
  };
  auth.onAuthStateChange(function(event,session){
   if(event==='SIGNED_OUT'||event==='SIGNED_IN')pending=null;
   if(event==='SIGNED_OUT'){
    window.__guidcyAuthResolved=true;
    window.__guidcyAuthUser=null;
    window.guidcyClearRefreshCache&&window.guidcyClearRefreshCache();
   }
   // Listener work involving Supabase always runs outside the SDK's lock.
   if(event==='SIGNED_IN'&&!window.__guidcyAuthReadyFired){
    queueMicrotask(function(){window.guidcyRetryAuthRestore&&window.guidcyRetryAuthRestore()});
   }
  });
  return client;
 };
 window.guidcyAuthRestoreFailed=function(){
  if(window.__guidcyAuthReadyFired)return;
  document.documentElement.setAttribute('data-guidcy-auth-unresolved','');
  var page=document.querySelector('.page.on,.page.active');
  var panel=page&&page.querySelector('.dash-main');
  if(panel&&!page.querySelector('[data-auth-retry]')){
   var note=document.createElement('div');
   note.dataset.authRetry='';note.className='guidcy-dash-load-error';
   note.setAttribute('role','status');
   note.innerHTML='<p>Your session could not be restored. Check your connection and retry.</p><button class="btn" type="button">Retry</button>';
   note.querySelector('button').addEventListener('click',function(){window.guidcyRetryAuthRestore()});
   page.insertBefore(note,page.firstChild);
  }
 };
 var retry=null;
 window.guidcyRetryAuthRestore=function(){
  if(retry||window.__guidcyAuthReadyFired)return retry;
  if(window.guidcyBindSupabaseClient)window.guidcyBindSupabaseClient();
  if(typeof window.initAuth!=='function')return;
  retry=Promise.resolve(window.initAuth()).finally(function(){retry=null});
  return retry;
 };
 window.addEventListener('online',window.guidcyRetryAuthRestore);
 window.addEventListener('guidcy:auth-ready',function(){
  document.documentElement.removeAttribute('data-guidcy-auth-unresolved');
  document.querySelectorAll('[data-auth-retry]').forEach(function(el){el.remove()});
  if(window.updateNav)window.updateNav();
  queueMicrotask(function(){
   if(window.guidcyRefreshRouteFromLocation)window.guidcyRefreshRouteFromLocation();
  });
 });
})();
