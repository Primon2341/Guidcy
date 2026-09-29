/* Route metadata changes only on navigation or a completed public profile render. */
(function(){
 'use strict';
 const SEO=window.GuidcySEO;if(!SEO)return;
 let initial;try{initial=JSON.parse(document.getElementById('guidcy-seo-state')?.textContent||'null')}catch(_){}
 let last=initial?JSON.stringify(initial):'',request=0;
 const pending=new Map();
 let cached=initial?.page==='seo-detail'?{meta:initial,at:Date.now()}:null;
 function setMeta(key,value,property=false){
  const attr=property?'property':'name';let node=document.head.querySelector(`meta[${attr}="${key}"]`);
  if(!node){node=document.createElement('meta');node.setAttribute(attr,key);document.head.append(node)}
  node.content=value;
 }
 function apply(meta){
  const signature=JSON.stringify(meta);if(last===signature)return;last=signature;
  document.title=meta.title;setMeta('description',meta.description);
  setMeta('robots',meta.index?'index, follow, max-image-preview:large':'noindex, follow');
  let canonical=document.head.querySelector('link[rel="canonical"]');
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical)}
  canonical.href=SEO.origin+meta.canonicalPath;
  const image=meta.image||SEO.origin+'/logo.png';
  for(const [key,value] of Object.entries({'og:site_name':'Guidcy','og:type':meta.blogPost?'article':'website','og:title':meta.title,'og:description':meta.description,'og:url':canonical.href,'og:image':image,'og:image:alt':meta.image?meta.h1:'Guidcy — Guidance Made Simple'}))setMeta(key,value,true);
  for(const [key,value] of Object.entries({'twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':image,'twitter:image:alt':meta.image?meta.h1:'Guidcy — Guidance Made Simple'}))setMeta(key,value);
  let script=document.getElementById('guidcy-route-jsonld');
  if(!script){script=document.createElement('script');script.id='guidcy-route-jsonld';script.type='application/ld+json';document.head.append(script)}
  script.textContent=JSON.stringify(SEO.graph(meta));
 }
 function sync(){
  const path=location.pathname.replace(/\/+$/,'')||'/';
  if(initial?.canonicalPath===path){apply(initial);return}
  if(/^\/consultant\//.test(path)){
   const c=window.curCons;if(c&&path==='/consultant/'+encodeURIComponent(c.dbId||c.id)){profile(c);return}
   // Preserve server metadata while the profile request is in flight.
   return;
  }
  if(/^\/(marketplace|webinars|careers|blog)\/[^/]+$/.test(path))return;
  apply(SEO.metaFor(path));
 }
 function profile(c){
  const row={...c,id:c.dbId||c.id,specialty:c.specialty||c.role};
  const meta=SEO.detailMeta('consultant',row);
  if(location.pathname===meta.canonicalPath){initial=null;apply(meta)}
 }
 window.guidcySeoApply=meta=>{initial=null;apply(meta)};
 window.guidcySeoBlog=post=>{initial=null;apply(post?SEO.blogMeta(post):SEO.metaFor('/blog'))};
 window.guidcySeoProfile=profile;
 window.guidcySeoSync=sync;
 window.guidcyRenderSeoDetail=async function(raw){
  const path=new URL(raw,location.origin).pathname,token=++request;
  const host=document.getElementById('page-seo-detail');
  if(cached?.meta.canonicalPath===path&&host?.children.length&&Date.now()-cached.at<60000){apply(cached.meta);window.renderPage('seo-detail');return}
  try{
   if(!pending.has(path))pending.set(path,fetch('/api/jobs?service=seo&format=json&path='+encodeURIComponent(path)).then(response=>{
    if(!response.ok&&response.status!==404)throw new Error('Unavailable');
    return response.json();
   }).finally(()=>pending.delete(path)));
   const result=await pending.get(path);
   if(token!==request||location.pathname!==path)return;
   initial=null;cached={meta:result.meta,at:Date.now()};apply(result.meta);
   host.innerHTML=result.body||'<div class="info-page"><h1>Page not found</h1><p>This listing is no longer available.</p><a href="/">Return to Guidcy</a></div>';
   window.renderPage('seo-detail');
  }catch(_){
   if(token!==request||location.pathname!==path)return;
   cached=null;
   host.innerHTML='<div class="info-page"><h1>Unable to load this page</h1><p>Please try again shortly.</p><button class="btn" data-seo-retry>Try again</button></div>';
   window.renderPage('seo-detail');
  }
 };
 document.addEventListener('click',event=>{
  const resource=event.target.closest('[data-seo-resource]'),webinar=event.target.closest('[data-seo-webinar]');
  if(resource){window.GuidcyMarketplace?.openDetails(resource.dataset.seoResource);return}
  if(webinar){window.wbnOpenReg?.(webinar.dataset.seoWebinar);return}
  if(event.target.closest('[data-seo-retry]')){window.guidcyRenderSeoDetail(location.href);return}
  const link=event.target.closest('a.guidcy-content-link');
  if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();event.stopPropagation();window.guidcyNavigate(link.getAttribute('href'));
 },true);
 window.addEventListener('popstate',sync);
 sync();
})();
