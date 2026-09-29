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
  function article(p,related=[]){return `<article class="blog-article"><nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a></nav><header><h1>${esc(p.title)}</h1>${byline(p)}<p class="blog-excerpt">${esc(p.excerpt)}</p></header>${cover(p,true)}<div class="blog-prose">${render(p.content)}</div><aside class="blog-next"><h2>Put your learning into practice</h2><p><a href="/find-experts">Find an expert</a> for personal guidance, explore <a href="/marketplace">learning resources</a>, or join an upcoming <a href="/webinars">webinar</a>.</p></aside></article>${related.length?'<section class="blog-related"><h2>More from Guidcy</h2>'+cards(related)+'</section>':''}`}
  return {esc,link,image,render,plain,read,date,url,cards,article};
});
