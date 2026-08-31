/* Guidcy interaction controllers.
 *
 * One capture-phase click owner handles dashboard drawer toggles and section
 * selection. Public-site navigation remains owned by the existing main-menu
 * controller. Logout is a single transaction that clears UI/auth state before
 * routing home, so late auth callbacks cannot reactivate a dashboard.
 */
(function(){
 'use strict';

 if(window.__GUIDCY_INTERACTION_CONTROLLERS__)return;
 window.__GUIDCY_INTERACTION_CONTROLLERS__=true;

 var dashboardPages={
 user:'page-user-dash',
 cons:'page-cons-dash',
 admin:'page-admin-dash'
 };
 var dashboardSwitchers={user:'swUD',cons:'swCD',admin:'swAD'};
var activationTimes=new WeakMap();
var pointerActivations=new WeakMap();
var handledPointerActivations=new WeakMap();
var gestureStarts=new Map();
var blockedGestures=new WeakMap();
var pointerActivationSerial=0;
 var ACTIVATION_GUARD_MS=360;
var TAP_MOVE_LIMIT=12;
var TAP_TIME_LIMIT=850;

 function pageFor(which){
 return document.getElementById(dashboardPages[which]||'');
 }

 function dashboardForElement(element){
 var page=element&&element.closest&&element.closest('#page-user-dash,#page-cons-dash,#page-admin-dash');
 if(!page)return '';
 if(page.id==='page-user-dash')return 'user';
 if(page.id==='page-cons-dash')return 'cons';
 if(page.id==='page-admin-dash')return 'admin';
 return '';
 }

 function setToggleState(which,open){
 var page=pageFor(which);
 var toggle=page&&page.querySelector('.dash-mobile-toggle');
 if(toggle)toggle.setAttribute('aria-expanded',open?'true':'false');
 }

 function unlockDashboardScroll(){
 var raw=document.body&&document.body.dataset?document.body.dataset.dashScrollY:'';
 var restoreY=parseInt(raw||'0',10)||0;
 document.documentElement.classList.remove('guidcy-dash-drawer-locked');
 document.body.classList.remove('guidcy-dash-drawer-locked','guidcy-dash-drawer-open','dash-menu-open');
 document.body.style.top='';
 if(document.body.dataset)delete document.body.dataset.dashScrollY;
 if(raw!==''){
 try{window.scrollTo(0,restoreY)}catch(_){}
 }
 }

function closeDashboardMenu(which){
 var names=which?[which]:Object.keys(dashboardPages);
 names.forEach(function(name){
 var page=pageFor(name);
 if(!page)return;
 var side=page.querySelector('.dash-side');
 var overlay=page.querySelector('.dash-overlay');
 if(side)side.classList.remove('on','open');
 if(overlay)overlay.classList.remove('on','open');
 setToggleState(name,false);
 });
 unlockDashboardScroll();
 }

function openDashboardMenu(which){
 var page=pageFor(which);
 if(!page)return;
 try{if(typeof window.closeMobDrawer==='function')window.closeMobDrawer()}catch(_){}
 closeDashboardMenu();
 var side=page.querySelector('.dash-side');
 var overlay=page.querySelector('.dash-overlay');
 if(!overlay){
 overlay=document.createElement('div');
 overlay.className='dash-overlay';
 page.appendChild(overlay);
 }
 if(side)side.classList.add('on');
 overlay.classList.add('on');
 setToggleState(which,true);
 document.documentElement.classList.add('guidcy-dash-drawer-locked');
 document.body.classList.add('guidcy-dash-drawer-locked','guidcy-dash-drawer-open');
 if(window.innerWidth<=900&&!document.body.classList.contains('dash-menu-open')){
 var y=window.scrollY||document.documentElement.scrollTop||0;
 document.body.dataset.dashScrollY=String(y);
 document.body.style.top='-'+y+'px';
 document.body.classList.add('dash-menu-open');
 }
 }

function toggleDashboardMenu(which){
 var page=pageFor(which);
 var side=page&&page.querySelector('.dash-side');
 if(side&&side.classList.contains('on'))closeDashboardMenu(which);
 else openDashboardMenu(which);
 }

window.openDashMenu=openDashboardMenu;
window.guidcyCloseDashboardMenu=closeDashboardMenu;
/* Legacy section renderers call closeDashMenu() even for automatic refreshes.
 * Once the interaction controller has opened a drawer, those renderers no
 * longer own its state. Deliberate closes use closeDashboardMenu() directly
 * from the toggle, overlay, navigation, route and logout handlers below. */
window.closeDashMenu=function(which){
 var page=which?pageFor(which):document.querySelector('#page-user-dash.on,#page-cons-dash.on,#page-admin-dash.on');
 var side=page&&page.querySelector('.dash-side');
 if(side&&side.classList.contains('on'))return;
 closeDashboardMenu(which);
};
window.toggleDashMenu=toggleDashboardMenu;

function isDuplicateActivation(element){
 var pointerActivation=pointerActivations.get(element)||0;
 if(pointerActivation){
 if(handledPointerActivations.get(element)===pointerActivation)return true;
 handledPointerActivations.set(element,pointerActivation);
 return false;
 }
 var now=Date.now();
 var previous=activationTimes.get(element)||0;
 activationTimes.set(element,now);
 return now-previous<ACTIVATION_GUARD_MS;
 }

function dashboardControlFromEvent(event){
 var target=event.target&&event.target.closest&&event.target.closest('.dash-mobile-toggle,.dash-side .side-btn');
 return target&&dashboardForElement(target)?target:null;
 }

document.addEventListener('pointerdown',function(event){
 var control=dashboardControlFromEvent(event);
 if(!control)return;
 var activation=++pointerActivationSerial;
 pointerActivations.set(control,activation);
 gestureStarts.set(event.pointerId,{control:control,x:event.clientX,y:event.clientY,at:Date.now(),moved:false,activation:activation});
},true);

 document.addEventListener('pointermove',function(event){
 var start=gestureStarts.get(event.pointerId);
 if(!start||start.moved)return;
 if(Math.abs(event.clientX-start.x)>TAP_MOVE_LIMIT||Math.abs(event.clientY-start.y)>TAP_MOVE_LIMIT){
 start.moved=true;
 blockedGestures.set(start.control,Date.now()+700);
 }
 },true);

function finishPointer(event){
 var start=gestureStarts.get(event.pointerId);
 if(!start)return;
 gestureStarts.delete(event.pointerId);
 if(Math.abs(event.clientX-start.x)>TAP_MOVE_LIMIT||Math.abs(event.clientY-start.y)>TAP_MOVE_LIMIT)start.moved=true;
 if(start.moved||Date.now()-start.at>TAP_TIME_LIMIT)blockedGestures.set(start.control,Date.now()+700);
}

 function claimDashboardControl(element){
   if(element&&element.hasAttribute&&element.hasAttribute('onclick'))element.removeAttribute('onclick');
 }
 document.addEventListener('pointerup',finishPointer,true);
 document.addEventListener('pointercancel',finishPointer,true);

 function isBlockedGesture(element){
 return (blockedGestures.get(element)||0)>Date.now();
 }

 function handleDashboardClick(event){
 if(event.button!=null&&event.button!==0)return;
 var toggle=event.target&&event.target.closest&&event.target.closest('.dash-mobile-toggle');
 if(toggle){
  var toggleDashboard=dashboardForElement(toggle);
  if(!toggleDashboard)return;
  claimDashboardControl(toggle);
  event.preventDefault();
 event.stopImmediatePropagation();
 if(isBlockedGesture(toggle))return;
 if(!isDuplicateActivation(toggle))toggleDashboardMenu(toggleDashboard);
 return;
 }

 var button=event.target&&event.target.closest&&event.target.closest('.dash-side .side-btn');
 if(!button)return;
 var which=dashboardForElement(button);
 if(!which)return;
 var section=(button.dataset&&(button.dataset.dashSection||button.dataset.adminSection))||'';
 if(!section)return;
 claimDashboardControl(button);

 /* The earlier touch guard rejects scroll/drag gestures before this handler.
 * Once a click reaches here it is the sole navigation action for that tap. */
 event.preventDefault();
 event.stopImmediatePropagation();
 if(isBlockedGesture(button))return;
 if(isDuplicateActivation(button))return;
 window.__GUIDCY_LAST_POINTER_AT_V6__=Date.now();
 closeDashboardMenu(which);
 var switcher=window[dashboardSwitchers[which]];
 if(typeof switcher==='function'){
 var result=switcher(section,button);
 // The router has already received the explicit button. Do not let unrelated
 // delayed renderers reuse this tap timestamp and overwrite the chosen route.
 window.__GUIDCY_LAST_POINTER_AT_V6__=0;
 return result;
 }
 window.__GUIDCY_LAST_POINTER_AT_V6__=0;
 }

 document.addEventListener('click',handleDashboardClick,true);

 document.addEventListener('click',function(event){
 var overlay=event.target&&event.target.closest&&event.target.closest('.dash-overlay');
 if(!overlay)return;
 var which=dashboardForElement(overlay);
 event.preventDefault();
 event.stopImmediatePropagation();
 closeDashboardMenu(which||undefined);
 },true);

 window.addEventListener('popstate',function(){closeDashboardMenu()});
 window.addEventListener('pageshow',function(){closeDashboardMenu()});
 window.addEventListener('resize',function(){if(window.innerWidth>900)closeDashboardMenu()});

 function closeAllTransientUi(){
 try{if(typeof window.closeMobDrawer==='function')window.closeMobDrawer()}catch(_){}
 closeDashboardMenu();
 document.querySelectorAll('.modal-overlay.on,.gmkt-modal.on,#guidcy-already-logged-in-modal').forEach(function(element){
 if(element.id==='guidcy-already-logged-in-modal')element.remove();
 else element.classList.remove('on','open');
 });
 document.body.classList.remove('menu-open','gmob-open','guidcy-modal-open','guidcy-final-auth-open','guidcy-payout-modal-scroll-lock','guidcy-razorpay-opening','guidcy-razorpay-checkout-open');
 document.documentElement.classList.remove('guidcy-payout-modal-scroll-lock');
 document.body.style.overflow='';
 document.body.style.position='';
 document.body.style.width='';
 }

 var sessionUiKeys=[
 'guidcy_active_role','guidcy_user_dash_view','guidcy_user_dash_tab',
 'guidcy_cons_dash_view','guidcy_cons_dash_tab','guidcy_admin_dash_view',
 'guidcy_admin_dash_tab','guidcy_admin_last_view','guidcy_login_return_v6',
 'guidcy_login_return_v6_at','guidcy_pending_route','guidcy_pending_after_login',
 'guidcy_pending_return','guidcy_post_login_return','guidcy_claude_last_page',
 'guidcy_claude_last_dash_tab'
 ];

 function clearSessionUiState(){
 sessionUiKeys.forEach(function(key){
 try{sessionStorage.removeItem(key)}catch(_){}
 try{localStorage.removeItem(key)}catch(_){}
 });
 try{if(typeof window.guidcyPurgeSessionUiState==='function')window.guidcyPurgeSessionUiState()}catch(_){}
 }

 function setSignedOutGlobals(){
 try{window.currentUser=null}catch(_){}
 try{window.currentProfile=null}catch(_){}
 try{window.loggedIn=null}catch(_){}
 try{window.loggedInUser=null}catch(_){}
 try{window.currentSession=null}catch(_){}
 try{currentUser=null}catch(_){}
 try{currentProfile=null}catch(_){}
 try{loggedIn=null}catch(_){}
 }

 function showHomeAfterLogout(){
 window.__guidcyLogoutInProgressUntil=Date.now()+5000;
 try{window.__GUIDCY_RESET_ROUTE_AFTER_LOGOUT_V6__&&window.__GUIDCY_RESET_ROUTE_AFTER_LOGOUT_V6__()}catch(_){}
 try{window.__GUIDCY_SET_ROUTE_INTENT_V6__&&window.__GUIDCY_SET_ROUTE_INTENT_V6__('/')}catch(_){}
 try{history.replaceState({page:'home'},'','/')}catch(_){}
 try{
 document.querySelectorAll('.page').forEach(function(page){page.classList.remove('on','active')});
 var home=document.getElementById('page-home');
 if(home)home.classList.add('on');
 }catch(_){}
 try{if(typeof window.renderPage==='function')window.renderPage('home')}catch(error){console.warn('Home render after logout failed:',error)}
 try{if(typeof window.initHome==='function')window.initHome()}catch(error){console.warn('Home initialization after logout failed:',error)}
 try{if(typeof window.updateNav==='function')window.updateNav()}catch(_){}
 try{window.scrollTo(0,0)}catch(_){}
 }

 function protectedDashboardStillActive(){
 var path='';
 try{path=(location.pathname||'/').replace(/\/+$/,'')||'/'}catch(_){}
 if(/^\/(?:dashboard|user-dashboard|user-dash|consultant-dashboard|cons-dash|admin|admin-dashboard|admin-dash)(?:\/|$)/.test(path))return true;
 try{return !!document.querySelector('#page-user-dash.on,#page-cons-dash.on,#page-admin-dash.on')}catch(_){return false}
 }

 var logoutPromise=null;
 window.logOut=function(){
 if(logoutPromise)return logoutPromise;
 logoutPromise=(async function(){
 closeAllTransientUi();
 clearSessionUiState();
 setSignedOutGlobals();
 showHomeAfterLogout();

 var client=null;
 try{client=window.guidcyGetSupabaseClient&&window.guidcyGetSupabaseClient()}catch(_){}
 if(client&&client.auth&&typeof client.auth.signOut==='function'){
 try{
 await Promise.race([
 client.auth.signOut({scope:'local'}),
 new Promise(function(resolve){setTimeout(resolve,3500)})
 ]);
 }catch(error){
 console.warn('Supabase sign-out cleanup failed; local UI session was still cleared:',error);
 }
 }

 setSignedOutGlobals();
 /* The user can navigate to another public page while remote sign-out is
    finishing. Only recover to Home if a protected dashboard somehow remains;
    otherwise preserve that deliberate public route. */
 if(protectedDashboardStillActive())showHomeAfterLogout();
 else{
 try{if(typeof window.updateNav==='function')window.updateNav()}catch(_){}
 }
 try{(window.toast||window.showToast||function(){})('Signed out','blue')}catch(_){}
 })().finally(function(){
 setTimeout(function(){logoutPromise=null},400);
 });
 return logoutPromise;
 };

 try{logOut=window.logOut}catch(_){}
})();
