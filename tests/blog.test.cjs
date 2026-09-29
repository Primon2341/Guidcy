const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const B=require('../assets/js/blog-content'),{handler}=require('../lib/seo-public');
const post={id:'00000000-0000-4000-8000-000000000001',slug:'test-article',title:'Test article',excerpt:'Useful guidance.',author:'Guidcy',category:'Guidance',status:'published',published_at:'2026-05-10T00:00:00Z',updated_at:'2026-09-28T00:00:00Z',meta_title:'Custom title | Guidcy',meta_description:'Custom description',cover_image:'https://example.com/cover.webp',content:[{type:'h2',children:['A heading']},{type:'p',children:['Helpful ',{type:'strong',children:['content']},{type:'a',href:'/find-experts',children:['Find guidance']}]}]};
const capture=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(body){this.body=body}});
test('rich text escapes content and allowlists tags, links and image protocols',()=>{
 assert.match(B.render(post.content),/<h2>A heading<\/h2>/);
 assert.match(B.render([{type:'p',children:['<img src=x onerror=alert(1)>',{type:'script',children:['alert(1)']},{type:'a',href:'javascript:alert(1)',children:['unsafe']}]}]),/&lt;img/);
 assert.ok(!B.render([{type:'a',href:'javascript:alert(1)',children:['unsafe']}]).includes('href'));
 for(const url of ['javascript:alert(1)','data:text/html,hello','//evil.test','/\\evil.test','java\nscript:alert(1)'])assert.equal(B.link(url),'');
 assert.equal(B.image('data:image/svg+xml,<svg/>'),'');
 assert.ok(!B.article({...post,title:'</script><script>alert(1)</script>'}).includes('<script>'));
});
test('anonymous blog HTML, metadata, pagination, sitemap, missing article and outages',async()=>{
 const original=global.fetch;
 try{
  let empty=false,down=false;
  global.fetch=async(raw,options)=>{
   const url=new URL(raw);
   assert.equal(JSON.parse(Buffer.from(options.headers.apikey.split('.')[1],'base64url')).role,'anon');
   if(down)throw new Error('unavailable');
   if(!url.pathname.endsWith('/blog_posts'))return {ok:true,json:async()=>[]};
   assert.equal(url.searchParams.get('status'),'eq.published');assert.match(url.searchParams.get('published_at'),/^lte\./);
   if(url.searchParams.has('slug'))assert.equal(url.searchParams.get('slug'),'eq.test-article');
   if(!url.searchParams.has('slug'))assert.ok(!url.searchParams.get('select').split(',').includes('content'));
   return {ok:true,json:async()=>empty?[]:[post]};
  };
  const article=capture();await handler({method:'GET',query:{path:'/blog/test-article'}},article);
  assert.equal(article.statusCode,200);assert.match(article.body,/<title>Custom title \| Guidcy<\/title>/);assert.match(article.body,/property="og:type" content="article"/);
  assert.match(article.body,/<link rel="canonical" href="https:\/\/www.guidcy.com\/blog\/test-article">/);
  assert.match(article.body,/<div class="blog-prose"><h2>A heading/);assert.match(article.body,/"datePublished":"2026-05-10T00:00:00Z"/);
  assert.equal(article.headers['cache-control'],'no-store');assert.match(article.body,/href="\/find-experts"/);
  const list=capture();await handler({method:'GET',query:{path:'/blog'}},list);assert.match(list.body,/<a href="\/blog\/test-article">Test article<\/a>/);
  const sitemap=capture();await handler({method:'GET',query:{path:'/sitemap.xml'}},sitemap);assert.match(sitemap.body,/<loc>https:\/\/www.guidcy.com\/blog\/test-article<\/loc>/);assert.equal(sitemap.headers['cache-control'],'no-store');
  empty=true;const missing=capture();await handler({method:'GET',query:{path:'/blog/test-article',format:'json'}},missing);assert.equal(missing.statusCode,404);assert.equal(JSON.parse(missing.body).meta.index,false);
  const removed=capture();await handler({method:'GET',query:{path:'/sitemap.xml'}},removed);assert.ok(!removed.body.includes('/blog/test-article'));
  down=true;const unavailable=capture();await handler({method:'GET',query:{path:'/blog/test-article'}},unavailable);assert.equal(unavailable.statusCode,503);assert.equal(unavailable.headers['cache-control'],'no-store');
  const badMethod=capture();await handler({method:'POST',query:{path:'/blog'}},badMethod);assert.equal(badMethod.statusCode,405);
 }finally{global.fetch=original}
});

test('SEO titles preserve dollar replacement tokens as literal text',()=>{
 const {withRouteSeo}=require('../lib/seo'),SEO=require('../assets/js/seo');
 const html=withRouteSeo('<html><head></head><body></body></html>','/blog/test-article',SEO.blogMeta({...post,meta_title:'A $& guide'}));
 assert.ok(html.includes('<title>A $&amp; guide</title>'));
 assert.equal((html.match(/<\/head>/g)||[]).length,1);
});
