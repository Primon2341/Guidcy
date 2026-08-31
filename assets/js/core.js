/* Guidcy route bootstrap.
 *
 * This file intentionally does not render pages or inspect clickable elements.
 * app.js owns rendering and navigation. The bootstrap only preserves the
 * requested URL until that controller is ready and gives browser Back/Forward
 * one deterministic hand-off point.
 */
(function(){
 'use strict';

 var nativeReplace=History.prototype.replaceState;

 function currentUrl(){
 return (location.pathname||'/')+(location.search||'')+(location.hash||'');
 }

 /* Keep old admin bookmarks working without installing another router. */
 try{
 var boot=new URL(location.href);
 if(/^\/admin(?:-dash(?:board)?)?\/?$/.test(boot.pathname)
 && boot.searchParams.get('section')
 && !boot.searchParams.get('tab')){
 boot.searchParams.set('tab',boot.searchParams.get('section'));
 boot.searchParams.delete('section');
 nativeReplace.call(history,history.state||{},'',boot.pathname+boot.search+boot.hash);
 }
 }catch(_){}

 var requested=currentUrl();
 window.__GUIDCY_REQUESTED_URL_V6__=requested;

 window.__GUIDCY_SET_ROUTE_INTENT_V6__=function(url){
 if(typeof url!=='string'||!url.trim())return requested;
 try{
 var parsed=new URL(url,location.origin);
 if(parsed.origin!==location.origin)return requested;
 requested=parsed.pathname+parsed.search+parsed.hash;
 window.__GUIDCY_REQUESTED_URL_V6__=requested;
 }catch(_){}
 return requested;
 };

 window.addEventListener('popstate',function(event){
 requested=currentUrl();
 window.__GUIDCY_REQUESTED_URL_V6__=requested;
 if(typeof window.__GUIDCY_HANDLE_POPSTATE_V7__==='function'){
 event.stopImmediatePropagation();
 window.__GUIDCY_HANDLE_POPSTATE_V7__(event);
 }
 });

 window.addEventListener('pageshow',function(){
 requested=currentUrl();
 window.__GUIDCY_REQUESTED_URL_V6__=requested;
 });
})();
