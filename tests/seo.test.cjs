const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const SEO=require('../assets/js/seo');
const {withRouteSeo,buildSitemap,buildRobots}=require('../lib/seo');
const {handler}=require('../lib/seo-public');
const template=fs.readFileSync('public/seo-template.html','utf8');
assert.equal((template.match(/rel="stylesheet"/g)||[]).length,1,'global CSS uses a single request');
const id='11111111-1111-4111-8111-111111111111';
const row={id,name:'Test Expert',title:'Test Resource',bio:'Public experience.',specialty:'Career Guidance',description:'A useful resource <script>alert(1)</script>',price:20,category:'Career',date:'2026-10-10',time:'12:05',duration:'60 minutes',created_at:'2026-09-01T00:00:00Z',company_name:'Guidcy',work_mode:'Remote'};
function capture(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(body){this.body=body}}}
test('every canonical static route has one brand title/canonical/graph and the correct first paint',()=>{
 for(const [route,original] of Object.entries(SEO.routes)){
  const meta=SEO.metaFor(route),html=withRouteSeo(template,route);
  assert.match(meta.title,/Guidcy/);assert.ok(meta.description.length>30);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.equal((html.match(/id="guidcy-route-jsonld"/g)||[]).length,1);
  assert.ok(html.includes('href="'+SEO.origin+meta.canonicalPath+'"'));
  assert.ok(html.includes('id="page-'+meta.page+'" class="page on"'),route);
  if(original.aliasOf)assert.equal(SEO.routes[meta.canonicalPath].aliasOf,undefined);
 }
 assert.equal(SEO.metaFor('/consultants').canonicalPath,'/find-experts');
});
test('private routes and missing routes are never homepage canonicals or indexable',()=>{
 for(const route of ['/login','/get-started','/dashboard','/admin-dashboard/users','/payment','/unknown']){
  const html=withRouteSeo(template,route);assert.match(html,/name="robots" content="noindex, follow"/);
  assert.ok(!html.includes('<link rel="canonical" href="https://www.guidcy.com/">'));
 }
});
test('site identity, schema truthfulness, XML namespace and robots',()=>{
 const graph=SEO.graph(SEO.metaFor('/'))['@graph'];
 assert.equal(graph.find(x=>x['@type']==='WebSite').name,'Guidcy');
 assert.equal(graph.find(x=>x['@type']==='WebSite').alternateName,'guidcy.com');
 assert.equal(SEO.detailMeta('consultant',row).entity['@type'],'Person');
 assert.equal(SEO.detailMeta('marketplace',row).entity.offers.price,'20');
 assert.equal(SEO.detailMeta('webinars',row).entity.startDate,'2026-10-10T12:05:00+05:30');
 assert.equal(SEO.detailMeta('careers',{...row,company_name:'Another employer'}).entity,undefined,'missing job location must not be invented');
 assert.equal(SEO.detailMeta('careers',{...row,applicant_country:'India'}).entity['@type'],'JobPosting');
 const xml=buildSitemap([{path:'/marketplace/'+id,lastmod:row.created_at}]);
 assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
 assert.ok(!xml.includes('/login'));assert.ok(!xml.includes('/browse'));
 assert.match(buildRobots(),/Sitemap: https:\/\/www.guidcy.com\/sitemap.xml/);
 assert.ok(!buildRobots().includes('Disallow: /consultant'));
});
test('public rendering is anonymous, selective, escaped; missing and failed data have correct status',async()=>{
 const previous=global.fetch;
 try{
  let urlUsed;
  global.fetch=async(url,options)=>{
   urlUsed=new URL(url);
   const payload=JSON.parse(Buffer.from(options.headers.apikey.split('.')[1],'base64url'));
   assert.equal(payload.role,'anon');assert.ok(!urlUsed.searchParams.get('select').includes('*'));
   return {ok:true,json:async()=>[row]};
  };
  for(const kind of ['consultant','marketplace','webinars','careers']){
   const res=capture();await handler({method:'GET',query:{path:'/'+kind+'/'+id}},res);
   assert.equal(res.statusCode,200);assert.ok(res.body.includes('Test '));
   assert.ok(!res.body.includes('<script>alert(1)</script>'));
   assert.ok(!res.body.includes('publisher_email'));assert.ok(!res.body.includes('file_path'));
   if(kind==='marketplace'){assert.equal(urlUsed.searchParams.get('status'),'eq.active');assert.equal(urlUsed.searchParams.get('removed_at'),'is.null')}
  }
  global.fetch=async()=>({ok:true,json:async()=>[]});
  const gone=capture();await handler({method:'GET',query:{path:'/marketplace/'+id}},gone);assert.equal(gone.statusCode,404);assert.match(gone.body,/noindex/);
  global.fetch=async()=>{throw new Error('down')};
  const down=capture();await handler({method:'GET',query:{path:'/marketplace/'+id}},down);assert.equal(down.statusCode,503);assert.equal(down.headers['cache-control'],'no-store');
  const invalid=capture();await handler({method:'GET',query:{path:'/private'}},invalid);assert.equal(invalid.statusCode,404);
  const post=capture();await handler({method:'POST',query:{path:'/marketplace/'+id}},post);assert.equal(post.statusCode,405);
 }finally{global.fetch=previous}
});
