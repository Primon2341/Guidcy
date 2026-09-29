const SEO = require('../assets/js/seo');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g,'\\u003c');
function withRouteSeo(template, route, override){
  const meta=override||SEO.metaFor(route), url=SEO.origin+meta.canonicalPath;
  let html=template.replace(/<title>[\s\S]*?<\/title>/gi,'')
    .replace(/<meta\s+(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,'')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi,'')
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<script[^>]*id="guidcy-seo-state"[^>]*>[\s\S]*?<\/script>/gi,'');
  const image=meta.image||SEO.origin+'/logo.png';
  const tags=[`<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="robots" content="${meta.index?'index, follow, max-image-preview:large':'noindex, follow'}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    ...Object.entries({'og:site_name':'Guidcy','og:type':meta.blogPost?'article':'website','og:title':meta.title,'og:description':meta.description,'og:url':url,'og:image':image,'og:image:alt':meta.image?meta.h1:'Guidcy — Guidance Made Simple','og:locale':'en_IN'}).map(([k,v])=>`<meta property="${k}" content="${esc(v)}">`),
    ...Object.entries({'twitter:card':'summary_large_image','twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':image,'twitter:image:alt':meta.image?meta.h1:'Guidcy — Guidance Made Simple'}).map(([k,v])=>`<meta name="${k}" content="${esc(v)}">`),
    `<script type="application/ld+json" id="guidcy-route-jsonld">${json(SEO.graph(meta))}</script>`,
    `<script type="application/json" id="guidcy-seo-state">${json(meta)}</script>`];
  if(meta.canonicalPath==='/')html=html.replace('<head>','<head>\n<link rel="preload" as="image" href="/assets/images/home-hero.webp" fetchpriority="high">');
  html=html.replace('</head>',()=>tags.join('\n')+'\n</head>');
  // The real route content is visible in the HTML, including with JavaScript off.
  // Other SPA pages remain mounted for existing client navigation.
  if(meta.page){
    html=html.replace(/(<div\b[^>]*id="page-[^"]+"[^>]*class=")page(?: on)?(")/g,'$1page$2');
    html=html.replace(`id="page-${meta.page}" class="page"`,`id="page-${meta.page}" class="page on"`);
  }
  if(meta.page==='not-found')html=html.replace('</body>','<div id="page-not-found" class="page on"><div class="info-page"><h1>Page not found</h1><p>This page is unavailable. <a href="/">Return to Guidcy</a> or <a href="/find-experts">find an expert</a>.</p></div></div></body>');
  return html;
}
function buildSitemap(entries=[]){
  const paths=Object.entries(SEO.routes).filter(([,m])=>!m.aliasOf).map(([path])=>({path}));
  const unique=new Map([...paths,...entries].map(row=>[row.path,row]));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+Array.from(unique.values(),row=>`<url><loc>${esc(SEO.origin+row.path)}</loc>${row.lastmod&&Number.isFinite(Date.parse(row.lastmod))?`<lastmod>${new Date(row.lastmod).toISOString()}</lastmod>`:''}</url>`).join('\n')+'\n</urlset>\n';
}
function buildRobots(){
  // Let crawlers see noindex on account routes. Robots exclusion isn't security.
  return `User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/jobs\nAllow: /api/opportunities\n\nSitemap: ${SEO.origin}/sitemap.xml\n`;
}
module.exports={withRouteSeo,buildSitemap,buildRobots,esc,json};
