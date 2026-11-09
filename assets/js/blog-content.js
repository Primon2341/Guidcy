/* Shared structured rich text: stored data never becomes executable HTML. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GuidcyBlogContent=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const tags=new Set(['p','h2','h3','blockquote','ul','ol','li','strong','em','u','a','br','code','pre']);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function link(value){
    const raw=String(value||'').trim();
    if(/[\u0000-\u0020\\]/.test(raw))return '';
    if(/^\/(?!\/)/.test(raw)||/^#[\w-]+$/.test(raw))return raw;
    try{const url=new URL(raw);return /^https?:$/.test(url.protocol)?url.href:''}catch(_){return ''}
  }
  function image(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:''}catch(_){return ''}}
  function render(nodes,depth=0){
    if(!Array.isArray(nodes)||depth>20)return '';
    return nodes.map(node=>{
      if(typeof node==='string')return esc(node);
      if(!node||!tags.has(node.type))return '';
      if(node.type==='br')return '<br>';
      const body=render(node.children,depth+1);
      if(node.type==='a'){const href=link(node.href);return href?`<a href="${esc(href)}" rel="noopener noreferrer">${body}</a>`:body}
      return `<${node.type}>${body}</${node.type}>`;
    }).join('');
  }
  function plain(nodes,depth=0){return !Array.isArray(nodes)||depth>20?'':nodes.map(n=>typeof n==='string'?n:n&&tags.has(n.type)?plain(n.children,depth+1)+(/^(p|h2|h3|li|blockquote|br)$/.test(n.type)?' ':''):'').join('')}
  function read(element){
    return Array.from(element.childNodes).flatMap(node=>{
      if(node.nodeType===3)return [node.textContent];
      if(node.nodeType!==1||/^(SCRIPT|STYLE|IFRAME|OBJECT|SVG|MATH|TEMPLATE)$/.test(node.tagName))return [];
      const type=({DIV:'p',B:'strong',I:'em',H1:'h2'})[node.tagName]||node.tagName.toLowerCase();
      const children=read(node);
      if(!tags.has(type))return children;
      return [{type,children,...(type==='a'?{href:link(node.getAttribute('href'))}:{})}];
    });
  }
  function date(value){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kolkata'}):''}
  const url=p=>'/blog/'+encodeURIComponent(p.slug);
  function cover(p,eager=false){const src=image(p.cover_image);return src?`<img class="blog-cover" src="${esc(src)}" alt="${esc(p.cover_alt||p.title)}" width="1200" height="675" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async">`:''}
  function byline(p){return `<p class="blog-byline">${esc(p.author)} · ${esc(p.category)}${p.published_at?' · <time datetime="'+esc(p.published_at)+'">'+esc(date(p.published_at))+'</time>':''}</p>`}
  function cards(posts){return `<div class="blog-grid">${posts.map(p=>`<article class="blog-card">${cover(p)}<div class="blog-card-body">${byline(p)}<h2><a href="${url(p)}">${esc(p.title)}</a></h2><p>${esc(p.excerpt)}</p><a class="btn" href="${url(p)}">Read article</a></div></article>`).join('')}</div>`}
  function listingUrl({page=1,search='',category=''}={}){
    const params=new URLSearchParams();
    if(search)params.set('q',search);
    if(category)params.set('category',category);
    if(page>1)params.set('page',page);
    return '/blog'+(params.size?'?'+params:'');
  }
  function listing(posts,{page=1,search='',category='',hasNext=false}={}){
    const arrow='<span aria-hidden="true">→</span>';
    const categories=Array.from(new Set(['Career','Education','Guidance','Jobs','Experts','Startups',...posts.map(p=>p.category),category].filter(Boolean)));
    const card=(p,featured=false)=>`<article class="blog-card blog-list-card${featured?' blog-featured':''}"><a class="blog-image-link" href="${url(p)}" tabindex="-1" aria-hidden="true">${cover(p,featured)||'<img class="blog-cover" src="/assets/images/blog-cover-default.webp" alt="" width="1672" height="941" decoding="async" '+(featured?'fetchpriority="high"':'loading="lazy"')+'>'}</a><div class="blog-card-body"><div class="blog-card-meta"><span class="blog-category" data-category="${esc(p.category)}">${esc(p.category)}</span>${p.published_at?'<span aria-hidden="true">·</span><time datetime="'+esc(p.published_at)+'">'+esc(date(p.published_at))+'</time>':''}</div><h2><a href="${url(p)}">${esc(p.title)}</a></h2><p>${esc(p.excerpt)}</p><span class="blog-card-author">By ${esc(p.author)}</span><a class="blog-read-link" href="${url(p)}">Read article ${arrow}<span class="blog-sr-only">: ${esc(p.title)}</span></a></div></article>`;
    const featured=page===1&&!search&&!category&&posts.length>0;
    const latest=featured?posts.slice(1):posts;
    return `<div class="blog-landing"><header class="blog-hero"><div class="blog-heading"><h1>Guidcy <span>Blog</span></h1><p>Ideas, practical advice, and expert perspectives<br class="blog-desktop-break"> to help you move forward.</p></div><img class="blog-hero-art" src="/assets/images/blog-hero.webp" alt="" width="900" height="600" fetchpriority="high"><form class="blog-search" action="/blog" method="get" role="search"><label class="blog-sr-only" for="blog-search-input">Search articles</label><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="blog-search-input" type="search" name="q" value="${esc(search)}" maxlength="120" placeholder="Search articles, topics or keywords…">${category?'<input type="hidden" name="category" value="'+esc(category)+'">':''}<button type="submit" aria-label="Search articles">${arrow}</button></form></header><nav class="blog-filters" aria-label="Article categories"><a href="${esc(listingUrl({search}))}" ${!category?'aria-current="page"':''}>All</a>${categories.map(c=>`<a href="${esc(listingUrl({search,category:c}))}" ${c===category?'aria-current="page"':''}>${esc(c)}</a>`).join('')}</nav>${featured?card(posts[0],true):''}${latest.length?`<section class="blog-latest" id="blog-latest" aria-labelledby="blog-latest-title"><div class="blog-section-heading"><div><h2 id="blog-latest-title">${search?'Search results':category?esc(category)+' articles':'Latest Articles'}</h2><p>${search?'Articles matching “'+esc(search)+'”.':'Explore more insights, tips and stories from our experts.'}</p></div>${search||category?'<a href="/blog">See all articles '+arrow+'</a>':''}</div><div class="blog-list-grid">${latest.map(p=>card(p)).join('')}</div></section>`:posts.length?'':'<div class="blog-empty" role="status"><h2>'+ (search||category?'No matching articles':'New perspectives are on their way')+'</h2><p>'+(search||category?'Try another keyword or explore all articles.':'Check back soon for ideas and practical guidance from our experts.')+'</p>'+(search||category?'<a href="/blog">See all articles '+arrow+'</a>':'')+'</div>'}<nav class="blog-pagination" aria-label="Blog pages">${page>1?'<a href="'+esc(listingUrl({page:page-1,search,category}))+'" rel="prev">← Previous</a>':''}${hasNext?'<a href="'+esc(listingUrl({page:page+1,search,category}))+'" rel="next">Next '+arrow+'</a>':''}</nav></div>`;
  }
  function article(p,related=[]){return `<article class="blog-article"><nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a></nav><header><h1>${esc(p.title)}</h1>${byline(p)}<p class="blog-excerpt">${esc(p.excerpt)}</p></header>${cover(p,true)}<div class="blog-prose">${render(p.content)}</div><aside class="blog-next"><h2>Put your learning into practice</h2><p><a href="/find-experts">Find an expert</a> for personal guidance, explore <a href="/marketplace">learning resources</a>, or join an upcoming <a href="/webinars">webinar</a>.</p></aside></article>${related.length?'<section class="blog-related"><h2>More from Guidcy</h2>'+cards(related)+'</section>':''}`}
  return {esc,link,image,render,plain,read,date,url,cards,article,listing,listingUrl};
});
