/* Route features retain their existing renderers, auth and event handlers. */
(function(){
  'use strict';
  const pending=new Map();
  function load(name){
    if(pending.has(name))return pending.get(name);
    const request=(async()=>{
      for(const tag of document.querySelectorAll('[data-guidcy-feature="'+name+'"]')){
        // A missing export after initial deferred loading means that script failed.
        if(tag.src){tag.dataset.src=tag.getAttribute('src');tag.removeAttribute('src');tag.type='application/json';}
        await window.guidcyLoadScript(tag.dataset.src);
      }
    })();
    pending.set(name,request);
    request.catch(()=>pending.delete(name));
    return request;
  }
  function bridge(name,object,methods){
    if(window[object])return;
    const proxy={};
    methods.forEach(method=>{proxy[method]=async function(...args){
      try{
        await load(name);
        document.getElementById('guidcy-feature-error-'+name)?.remove();
        if(window[object]!==proxy)return window[object][method](...args);
      }catch(_){
        const page=document.querySelector('.page.on');
        if(!page||document.getElementById('guidcy-feature-error-'+name))return;
        const error=document.createElement('div');error.id='guidcy-feature-error-'+name;error.setAttribute('role','status');
        error.innerHTML='<p>This section could not load.</p><button type="button" class="btn btn-blue">Try again</button>';
        error.querySelector('button').onclick=()=>{error.remove();proxy[method](...args);};page.prepend(error);
      }
    };});
    window[object]=proxy;
  }
  bridge('community','GuidcyCommunity',['mount','member','mountProfile']);
  bridge('resources','GuidcyProfileResources',['mount','refresh']);
  bridge('blog','GuidcyBlog',['renderPublic','renderAdmin']);
  window.initHome=()=>window.GuidcyCommunity.mount();
  window.renderGuidcyBlog=window.renderBlog=()=>window.GuidcyBlog.renderPublic();
  let lastRoute='';
  function activate(){
    const key=(location.pathname||'/')+location.search+'|'+(document.querySelector('.page.on')?.id||'');
    if(key===lastRoute)return;lastRoute=key;
    if(document.getElementById('page-home')?.classList.contains('on'))window.GuidcyCommunity.mount();
    if(document.getElementById('page-profile')?.classList.contains('on')){
      const member=new URLSearchParams(location.search).get('member');
      if(member)window.GuidcyCommunity.member(member);
      else{window.GuidcyCommunity.mountProfile();if(window.curCons)window.GuidcyProfileResources.mount(window.curCons);}
    }
    if(document.getElementById('page-blog')?.classList.contains('on'))window.GuidcyBlog.renderPublic();
  }
  for(const id of ['page-home','page-profile','page-blog']){
    const page=document.getElementById(id);
    if(page)new MutationObserver(activate).observe(page,{attributes:true,attributeFilter:['class']});
  }
  window.addEventListener('guidcy:routechange',()=>queueMicrotask(activate));
  window.addEventListener('popstate',()=>queueMicrotask(activate));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activate,{once:true});else activate();
})();
