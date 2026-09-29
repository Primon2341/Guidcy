const fs=require('node:fs');
const path=require('node:path');
const SEO=require('../assets/js/seo');
const Blog=require('../assets/js/blog-content');
const {withRouteSeo,buildSitemap,esc,json}=require('./seo');
const definitions={
 blog:{table:'blog_posts',fields:'id,title,slug,cover_image,cover_alt,excerpt,content,author,category,published_at,meta_title,meta_description,updated_at',filters:{status:'eq.published'}},
 consultant:{table:'guidcy_consultants',fields:'id,name,specialty,category,bio,experience,tags,avatar_url,linkedin_url,highest_education,college,current_work,current_company_college,updated_at',filters:{is_active:'eq.true',approval_status:'eq.approved',profile_hidden_at:'is.null'}},
 marketplace:{table:'marketplace_notes',fields:'id,title,category,description,price,is_free,thumbnail_url,uploader_name,updated_at,created_at',filters:{status:'eq.active',removed_at:'is.null'}},
 webinars:{table:'guidcy_webinars',fields:'id,title,category,description,date,time,duration,speaker,speaker_role,price_type,price_amount,is_paid,publisher_name,created_at',filters:{}},
 careers:{table:'job_posts',fields:'id,title,company_name,description,responsibilities,required_skills,work_type,work_mode,experience_level,application_deadline,created_at,updated_at',filters:{status:'eq.approved'}}
};
const directories={'/find-experts':'consultant','/marketplace':'marketplace','/webinars':'webinars','/careers':'careers'};
let config,template;
function files(){
 config ||= JSON.parse(fs.readFileSync(path.join(process.cwd(),'public/seo-config.json'),'utf8'));
 template ||= fs.readFileSync(path.join(process.cwd(),'public/seo-template.html'),'utf8');
 return {config,template};
}
async function rows(kind,id,offset=0,limit,category){
 const def=definitions[kind],{config}=files();
 const params=new URLSearchParams({select:def.fields,...def.filters,order:'id.asc',limit:id?'1':'1000',offset:String(offset)});
 if(kind==='blog'){
  params.set('published_at','lte.'+new Date().toISOString());
  params.set('order','published_at.desc,id.asc');
  if(!id)params.set('select',def.fields.replace(',content',''));
  if(category)params.set('category','eq.'+category);
 }
 if(limit)params.set('limit',String(limit));
 if(id)params.set(kind==='blog'?'slug':'id','eq.'+id);
 const response=await fetch(config.url+'/rest/v1/'+def.table+'?'+params,{headers:{apikey:config.key,Authorization:'Bearer '+config.key},signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw new Error('Public catalog unavailable');
 const data=await response.json();
 return data;
}
const available=(kind,row)=>kind!=='careers'||!row.application_deadline||row.application_deadline>=new Date().toISOString().slice(0,10);
const detailPath=(kind,row)=>'/'+kind+'/'+encodeURIComponent(kind==='blog'?row.slug:row.id);
function content(kind,row){
 const url=detailPath(kind,row), name=esc(row.name||row.title), description=esc(row.bio||row.description||'');
 if(kind==='consultant')return `<div class="profile-main"><div class="profile-hero">${SEO.safeUrl(row.avatar_url)?`<div class="profile-avatar has-photo"><img src="${esc(row.avatar_url)}" alt="${name}" width="96" height="96"></div>`:''}<div><h1 class="profile-name">${name}</h1><div class="profile-role">${esc([row.current_work,row.current_company_college].filter(Boolean).join(', ')||row.specialty)}</div><p class="profile-meta">${esc([row.highest_education,row.college].filter(Boolean).join(' · '))}</p></div></div><section class="sec-block"><h2 class="block-title">About</h2><div class="bio-text">${description}</div></section>${row.tags?.length?`<section class="sec-block"><h2 class="block-title">Areas of expertise</h2><div class="tag-list">${row.tags.map(t=>`<span class="skill-tag">${esc(t)}</span>`).join('')}</div></section>`:''}${row.experience?`<section class="sec-block"><h2 class="block-title">Experience</h2><p>${esc(row.experience)}</p></section>`:''}<noscript><p>Enable JavaScript to choose a session and book this consultant.</p></noscript></div><aside class="profile-sidebar" aria-label="Booking"><div class="book-box" style="min-height:420px" aria-busy="true"><p class="book-header">Loading booking options…</p></div></aside>`;
 const parent=SEO.metaFor(directories['/'+kind]?'/'+kind:'/careers');
 const action=kind==='marketplace'?`<button class="btn btn-blue" data-seo-resource="${esc(row.id)}">View Details</button>`:kind==='webinars'?`<button class="btn btn-blue" data-seo-webinar="${esc(row.id)}">View registration options</button>`:`<button class="gc-btn gc-btn-green" data-gc="view" data-id="${esc(row.id)}">View details &amp; apply</button>`;
 const details=kind==='marketplace'?`${esc(row.category)} · ${row.is_free||!Number(row.price)?'Free':'₹'+esc(row.price)}${row.uploader_name?' · by '+esc(row.uploader_name):''}`:kind==='webinars'?`${esc(row.date)} · ${esc(row.time)} IST · ${esc(row.duration)}${row.speaker?' · '+esc(row.speaker):''} · ${row.is_paid||row.price_type==='paid'?'₹'+esc(row.price_amount):'Free'}`:[row.company_name,row.work_type,row.work_mode].map(esc).filter(Boolean).join(' · ');
 return `<div class="info-page"><nav aria-label="Breadcrumb"><a href="/">Guidcy</a> / <a href="${esc(parent.canonicalPath)}">${esc(parent.h1)}</a></nav><article><h1>${name}</h1>${SEO.safeUrl(row.thumbnail_url)?`<img src="${esc(row.thumbnail_url)}" alt="${name}" width="240" height="160" style="object-fit:contain">`:''}<p class="lead">${details}</p><p style="white-space:pre-line">${description}</p>${row.responsibilities?`<h2>Responsibilities</h2><p style="white-space:pre-line">${esc(row.responsibilities)}</p>`:''}${row.required_skills?`<h2>Required skills</h2><p>${esc(row.required_skills)}</p>`:''}${kind==='careers'&&String(row.work_mode).toLowerCase()==='remote'&&/^Guidcy(?:\s|$)/i.test(row.company_name||'')?'<p>Fully remote. Applicants may work from anywhere in the world.</p>':''}${action}<noscript><p>Enable JavaScript to register, purchase or apply securely.</p></noscript></article></div>`;
}
function catalog(kind,data){
 // This no-script fallback exposes the same public catalog, never bot-only content.
 return `<noscript><section class="info-page"><h2>${esc(SEO.metaFor(Object.keys(directories).find(p=>directories[p]===kind)).h1)}</h2><ul>${data.map(row=>`<li><a href="${detailPath(kind,row)}">${esc(row.name||row.title)}</a> — ${esc(SEO.short(row.bio||row.description))}</li>`).join('')}</ul></section></noscript>`;
}
async function handler(req,res){
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.setHeader('Allow','GET, HEAD');return res.end();}
 const requested=String(req.query?.path||'/');
 const route=requested.replace(/\/+$/,'')||'/';
 const isBlog=route==='/blog'||/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route);
 const match=route.match(/^\/(consultant|marketplace|webinars|careers)\/([a-zA-Z0-9_-]{1,100})$/);
 if(route!=='/sitemap.xml'&&!isBlog&&!directories[route]&&!match){res.statusCode=404;res.setHeader('X-Robots-Tag','noindex');return res.end('Not found');}
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  let html,meta,body;
  if(route==='/sitemap.xml'){
   const catalogs=await Promise.all(Object.keys(definitions).map(async kind=>{
    const entries=[];
    for(let offset=0;offset<12000;offset+=1000){
     const data=await rows(kind,null,offset);
     entries.push(...data.filter(row=>available(kind,row)).filter(row=>kind!=='webinars'||String(row.date)>=new Date().toISOString().slice(0,10)).map(row=>({path:detailPath(kind,row),lastmod:row.updated_at||row.created_at})));
     if(data.length<1000)return entries;
    }
    // Refuse silent truncation; split into a sitemap index above 12k per catalog.
    throw new Error('Catalog requires a sitemap index');
   }));
   html=buildSitemap(catalogs.flat());res.setHeader('Content-Type','application/xml; charset=utf-8');
  }else if(isBlog){
   const slug=route.slice(6);
   if(slug){
    const [post]=await rows('blog',slug);
    if(!post){
     res.statusCode=404;meta={...SEO.metaFor('/404'),canonicalPath:route,page:'blog'};
     body='<div class="blog-empty"><h1>Article not found</h1><p>This article is unavailable.</p><a href="/blog">Back to Blog</a></div>';
    }else{
     meta=SEO.blogMeta(post);
     const related=(await rows('blog',null,0,4,post.category)).filter(p=>p.id!==post.id).slice(0,3);
     body=Blog.article(post,related);
    }
   }else{
    const page=Number(req.query?.page||1);
    if(!Number.isSafeInteger(page)||page<1||page>1000){res.statusCode=404;meta={...SEO.metaFor('/404'),page:'blog',canonicalPath:'/blog'};body='<h1>Page not found</h1><a href="/blog">Back to Blog</a>';}
    else{
     const data=await rows('blog',null,(page-1)*12,13);
     meta={...SEO.metaFor('/blog'),canonicalPath:page===1?'/blog':'/blog?page='+page};
     if(page>1)meta.title='Guidcy Blog — Page '+page;
     if(!data.length&&page>1){res.statusCode=404;meta.index=false;}
     body='<header class="blog-heading"><h1>Guidcy Blog</h1><p>Ideas, practical advice, and expert perspectives to help you move forward.</p></header>'+
      (data.length?Blog.cards(data.slice(0,12)):'<div class="blog-empty">No articles published yet.</div>')+
      '<nav class="blog-pagination" aria-label="Blog pages">'+(page>1?'<a href="'+(page===2?'/blog':'/blog?page='+(page-1))+'" rel="prev">Previous</a>':'')+
      (data.length>12?'<a href="/blog?page='+(page+1)+'" rel="next">Next</a>':'')+'</nav>';
    }
   }
   html=withRouteSeo(files().template,route,meta).replace(/<div id="page-blog" class="page on" role="main">[\s\S]*?<div id="blog-list"><\/div><\/div><\/div>/,
    ()=>'<div id="page-blog" class="page on" role="main"><div class="guidcy-blog-wrap"><div id="blog-list">'+body+'</div></div></div>');
   res.setHeader('Content-Type','text/html; charset=utf-8');
  }else if(match){
   const [,kind,id]=match;
   if(kind!=='webinars'&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)){res.statusCode=404;meta=SEO.metaFor('/404');}
   else {
    const data=await rows(kind,id);
    if(data[0]&&available(kind,data[0])){
     meta=SEO.detailMeta(kind,data[0]);body=content(kind,data[0]);
     // Past webinars remain shareable but are no longer indexable event offers.
     if(kind==='webinars'&&data[0].date<new Date().toISOString().slice(0,10)){meta.index=false;delete meta.entity;}
    }else{res.statusCode=404;meta=SEO.metaFor('/404');}
   }
   html=withRouteSeo(files().template,route,meta);
   if(body)html=html.replace(kind==='consultant'?'<div id="profile-layout" class="profile-layout"></div>':'<div id="page-seo-detail" class="page on" role="main"></div>',kind==='consultant'?`<div id="profile-layout" class="profile-layout">${body}</div>`:`<div id="page-seo-detail" class="page on" role="main">${body}</div>`);
   res.setHeader('Content-Type','text/html; charset=utf-8');
  }else{
   const kind=directories[route],data=await rows(kind);
   html=withRouteSeo(files().template,route);
   // Place the accessible fallback in the matching page, not in a hidden homepage.
   const page=SEO.metaFor(route).page;
   html=html.replace(`id="page-${page}" class="page on" role="main">`,`id="page-${page}" class="page on" role="main">`+catalog(kind,data.filter(row=>available(kind,row))));
   res.setHeader('Content-Type','text/html; charset=utf-8');
  }
  if(req.query?.format==='json'){
   res.setHeader('Content-Type','application/json; charset=utf-8');
   html=json({meta,body});
  }
  // Unpublishing must remove articles from both HTML and the sitemap immediately.
  res.setHeader('Cache-Control',isBlog||route==='/sitemap.xml'?'no-store':'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  if(res.statusCode===404)res.setHeader('X-Robots-Tag','noindex');
  return res.end(req.method==='HEAD'?'':html);
 }catch(_){
  // A temporary database failure must not deindex a real listing as a 404.
  res.statusCode=503;res.setHeader('Retry-After','60');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end('Guidcy is temporarily unavailable. Please try again shortly.');
 }
}
module.exports={handler,rows,content,catalog,definitions,directories,available};
