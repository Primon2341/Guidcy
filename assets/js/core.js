/* Guidcy core bootstrap -- extracted from the first inline <script> in index.html verbatim (CFG, Supabase client, auth, router, global state, core helpers). Must load before app.js. */


(function(){
  var nativePush=History.prototype.pushState;
  var nativeReplace=History.prototype.replaceState;
  var stable=(location.pathname||'/')+(location.search||'')+(location.hash||'');
  var lastRender=0;
  window.__GUIDCY_REQUESTED_URL_V6__=stable;
  function path(raw){try{return new URL(raw,location.origin).pathname.replace(/\/+$/,'')||'/'}catch(e){return '/'}}
  function intent(raw){
    try{
      var u=new URL(raw,location.origin),p=u.pathname.replace(/\/+$/,'')||'/',tab=u.searchParams.get('tab')||'';
      if(p==='/careers'||p==='/career')return {kind:'page',page:'careers',url:'/careers'};
      if(p==='/marketplace')return {kind:'page',page:'marketplace',url:'/marketplace'};
      if(p==='/dashboard'||p==='/user-dashboard'||p==='/user-dash')return {kind:'dash',name:'swUD',page:'user-dash',pageId:'page-user-dash',tab:tab||'upcoming',url:'/dashboard?tab='+encodeURIComponent(tab||'upcoming')};
      if(p==='/consultant-dashboard'||p==='/cons-dash')return {kind:'dash',name:'swCD',page:'cons-dash',pageId:'page-cons-dash',tab:tab||'overview',url:'/consultant-dashboard?tab='+encodeURIComponent(tab||'overview')};
      if(p==='/admin/webinar-registrations')return {kind:'dash',name:'swAD',page:'admin-dash',pageId:'page-admin-dash',tab:'webinar-registrations',url:'/admin/webinar-registrations'};
      if(p==='/admin'||p==='/admin-dashboard'||p==='/admin-dash')return {kind:'dash',name:'swAD',page:'admin-dash',pageId:'page-admin-dash',tab:tab||'overview',url:'/admin-dashboard?tab='+encodeURIComponent(tab||'overview')};
    }catch(e){}
    return null;
  }
  function queueEnforceSeries(){
    [0,120,450,1100,2400].forEach(function(delay){setTimeout(enforce,delay)});
  }
  function setStable(next){stable=next||'';window.__GUIDCY_REQUESTED_URL_V6__=stable;queueEnforceSeries()}
  window.__GUIDCY_SET_ROUTE_INTENT_V6__=setStable;
  function blocksLegacyHistoryWrite(raw){
    if(raw==null)return false;
    var wanted=intent(stable),target=intent(raw);
    if(!wanted)return false;
    if(Date.now()-Number(window.__GUIDCY_LAST_POINTER_AT_V6__||0)<1500)return false;
    if(wanted.kind==='dash')return !!(target&&target.kind==='dash'&&target.name===wanted.name&&target.tab!==wanted.tab);
    return false;
  }
  History.prototype.pushState=function(state,title,url){
    if(blocksLegacyHistoryWrite(url))return;
    var result=nativePush.call(this,state,title,url);
    queueEnforceSeries();
    return result;
  };
  History.prototype.replaceState=function(state,title,url){
    if(blocksLegacyHistoryWrite(url))return;
    var result=nativeReplace.call(this,state,title,url);
    queueEnforceSeries();
    return result;
  };
  function activePage(){var el=document.querySelector&&document.querySelector('.page.on,.page.active');return el&&el.id?el.id.replace(/^page-/,''):''}
  function mark(info){
    var root=document.getElementById(info.pageId);if(!root)return;
    var buttons=Array.from(root.querySelectorAll('.side-btn'));
    var target=buttons.find(function(button){
      var src=(button.getAttribute('onclick')||'')+' '+String(button.onclick||'');
      var text=String(button.textContent||'').toLowerCase();
      return src.indexOf("'"+info.tab+"'")!==-1||src.indexOf('"'+info.tab+'"')!==-1||
        (info.tab==='marketplace'&&/marketplace|purchased notes/.test(text))||
        (info.tab==='webinar-registrations'&&/webinar registrations/.test(text));
    });
    if(target){buttons.forEach(function(button){button.classList.remove('on','active')});target.classList.add('on')}
  }
  function titleTab(info){
    var root=document.getElementById(info.pageId),title=String(root&&root.querySelector('.dash-title')&&root.querySelector('.dash-title').textContent||'').trim().toLowerCase();
    var map={
      swUD:{'my purchased notes':'marketplace','purchased notes':'marketplace','upcoming sessions':'upcoming','goal tracker':'goals','session history':'history','payment history':'payments','notifications':'notifications','my reviews':'reviews','profile & settings':'settings','account settings':'settings'},
      swCD:{'earnings':'earnings','profile & settings':'settings','account settings':'settings','my marketplace':'marketplace','overview':'overview','booking requests':'requests','my schedule':'schedule'},
      swAD:{'disputes':'disputes','dispute management':'disputes','marketplace':'marketplace','promo codes':'promo-codes','webinar registrations':'webinar-registrations','analytics':'overview'}
    };
    return map[info.name]&&map[info.name][title]||'';
  }
  function enforce(){
    var info=intent(stable);if(!info)return;
    if(activePage()!==info.page){
      if(info.kind==='page'&&Date.now()-lastRender>500&&typeof window.renderPage==='function'){
        lastRender=Date.now();
        try{window.renderPage(info.page)}catch(e){}
      }
      return;
    }
    var current=(location.pathname||'/')+(location.search||'');
    if(current!==info.url)try{nativeReplace.call(history,{page:info.page,tab:info.tab||''},'',info.url)}catch(e){}
    if(info.kind==='dash'){
      mark(info);
      var shown=titleTab(info);
      if(shown&&shown!==info.tab&&Date.now()-lastRender>500&&typeof window[info.name]==='function'){
        lastRender=Date.now();
        try{window[info.name](info.tab,null)}catch(e){}
      }
    }
  }
  var lastPointerAt=0;
  function captureElementIntent(el){
    try{
      if(!el)return;
      var src=el.getAttribute('onclick')||String(el.onclick||''),match=src.match(/sw(CD|UD|AD)\s*\(\s*['"]([^'"]+)['"]/);
      if(match){
        var name='sw'+match[1],base=name==='swUD'?'/dashboard':name==='swCD'?'/consultant-dashboard':'/admin-dashboard';
        setStable(name==='swAD'&&match[2]==='webinar-registrations'?'/admin/webinar-registrations':base+'?tab='+encodeURIComponent(match[2]));
        return true;
      }
      match=src.match(/(?:^|[^\w.])go\(\s*['"]([^'"]+)['"]/);
      var page=match&&match[1],urls={
        home:'/',browse:'/browse',jobs:'/find-jobs',careers:'/careers',career:'/careers',
        categories:'/categories',blog:'/blog',marketplace:'/marketplace',webinar:'/webinars','smart-finder':'/career-ai-finder',
        opportunities:'/funds-grants',login:'/login',signup:'/get-started',about:'/about',
        contact:'/contact',faq:'/faq',terms:'/terms',privacy:'/privacy',refund:'/refund',disclaimer:'/disclaimer',
        help:'/help-center',dispute:'/dispute-resolution','user-dash':'/dashboard?tab=upcoming',
        'cons-dash':'/consultant-dashboard?tab=overview','admin-dash':'/admin-dashboard?tab=overview',
        payment:'/payment',confirm:'/confirm',meeting:'/meeting',review:'/review',profile:'/profile'
      };
      if(page&&urls[page]){
        setStable(urls[page]);
        if((location.pathname+location.search)!==urls[page]){
          try{nativePush.call(history,{page:page},'',urls[page])}catch(e){}
        }
        (function(targetPage,targetUrl){
          setTimeout(function(){
            setStable(targetUrl);
            if((location.pathname+location.search)!==targetUrl)try{nativeReplace.call(history,{page:targetPage},'',targetUrl)}catch(e){}
            try{if(typeof window.renderPage==='function')window.renderPage(targetPage)}catch(e){}
          },0);
        })(page,urls[page]);
        return true;
      }
      if(page){setStable('');return true}
      var href=el.getAttribute('href');
      if(href&&!/^\s*(#|javascript:)/i.test(href)){
        var hrefUrl=new URL(href,location.origin);
        if(hrefUrl.origin===location.origin){
          var hrefPath=hrefUrl.pathname+hrefUrl.search+hrefUrl.hash;
          setStable(hrefPath);
          if((location.pathname+location.search+location.hash)!==hrefPath)try{nativePush.call(history,{page:'link'},'',hrefPath)}catch(e){}
          return true;
        }
        setStable('');return true;
      }
    }catch(e){}
    return false;
  }
  /* Mobile drawer items must NEVER pre-navigate on pointerdown/mousedown.
     A finger-down can become a vertical scroll; the drawer's tap-vs-scroll
     guard decides later whether the gesture was a genuine click. Inline
     onclick/window.go then performs normal navigation only for that click. */
  function isMobileDrawerTarget(target){
    return !!(target&&target.closest&&target.closest('#gmob-drawer'));
  }
  document.addEventListener('pointerdown',function(event){
    lastPointerAt=Date.now();
    window.__GUIDCY_LAST_POINTER_AT_V6__=lastPointerAt;
    if(isMobileDrawerTarget(event.target))return;
    captureElementIntent(event.target&&event.target.closest&&event.target.closest('button,a,[role="button"]'));
  },true);
  document.addEventListener('mousedown',function(event){
    lastPointerAt=Date.now();
    window.__GUIDCY_LAST_POINTER_AT_V6__=lastPointerAt;
    if(isMobileDrawerTarget(event.target))return;
    captureElementIntent(event.target&&event.target.closest&&event.target.closest('button,a,[role="button"]'));
  },true);
  document.addEventListener('click',function(event){
    if(isMobileDrawerTarget(event.target))return;
    if(Date.now()-lastPointerAt>1500)return;
    captureElementIntent(event.target&&event.target.closest&&event.target.closest('button,a,[role="button"]'));
  },true);
  window.addEventListener('popstate',function(){stable=(location.pathname||'/')+(location.search||'')+(location.hash||'');queueEnforceSeries()});
  window.addEventListener('pageshow',queueEnforceSeries);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)queueEnforceSeries()});
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('.page').forEach(function(page){
      try{new MutationObserver(function(){setTimeout(enforce,0)}).observe(page,{attributes:true,attributeFilter:['class']})}catch(e){}
    });
    queueEnforceSeries();
  });
  /* Slow safety check for late legacy patches. Route/page changes above are
     event-driven, so the browser no longer performs DOM work every 100 ms. */
  setInterval(function(){if(!document.hidden&&intent(stable))enforce()},1500);
})();
