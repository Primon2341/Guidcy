const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const paths=['/','/find-experts','/find-jobs','/webinars','/marketplace','/funds-grants','/career-ai-finder','/login','/this-page-does-not-exist-seo-check','/sitemap.xml','/robots.txt'];
 const rows=await Promise.all(paths.map(async path=>{
  const start=Date.now();const response=await fetch('https://www.guidcy.com'+path);const html=await response.text();
  const value=pattern=>html.match(pattern)?.[1]||'';
  return {path,status:response.status,ms:Date.now()-start,bytes:Buffer.byteLength(html),title:value(/<title>(.*?)<\/title>/),canonical:value(/rel="canonical" href="([^"]+)/),robots:value(/name="robots" content="([^"]+)/),schemas:Array.from(html.matchAll(/"@type"\s*:\s*"([^"]+)"/g),m=>m[1]),sitemapCount:(html.match(/<loc>/g)||[]).length};
 }));
 for(const url of ['http://guidcy.com/find-experts','https://guidcy.com/find-experts','http://www.guidcy.com/find-experts','https://www.guidcy.com/browse']){
  const res=await fetch(url,{redirect:'manual'});rows.push({url,status:res.status,location:res.headers.get('location')});
 }
 let crawl=[];
 if(process.argv.includes('--validate')){
  const xml=await (await fetch('https://www.guidcy.com/sitemap.xml')).text();
  assert.match(xml,/xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  const urls=Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g),m=>m[1]);
  assert.equal(new Set(urls).size,urls.length);
  for(let i=0;i<urls.length;i+=4){
   crawl.push(...await Promise.all(urls.slice(i,i+4).map(async url=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)}),html=await response.text();
    assert.equal(response.status,200,url);
    assert.ok(!/noindex/.test(response.headers.get('x-robots-tag')||''),url);
    assert.ok(!/<meta name="robots" content="noindex/.test(html),url);
    assert.equal((html.match(/rel="canonical"/g)||[]).length,1,url);
    const canonical=html.match(/rel="canonical" href="([^"]+)/)?.[1];assert.equal(canonical,url);
    const graphs=Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),m=>JSON.parse(m[1]));
    assert.equal(graphs.length,1,url);
    return {url,status:response.status,types:graphs[0]['@graph'].map(x=>x['@type'])};
   })));
  }
  assert.equal(rows.find(x=>x.path==='/this-page-does-not-exist-seo-check').status,404);
  const home=await (await fetch('https://www.guidcy.com/')).text();
  const asset=home.match(/src="(\/assets\/js\/seo.js\?v=[a-f0-9]+)"/)[1];
  const cached=await fetch('https://www.guidcy.com'+asset,{method:'HEAD'});
  assert.match(cached.headers.get('cache-control'),/immutable/);
 }
 const report={checkedAt:new Date().toISOString(),rows,crawl};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1});
