const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {withRouteSeo}=require('../lib/seo');
const SEO=require('../assets/js/seo');
const {content}=require('../lib/seo-public');
const fixture=fs.readFileSync(path.join(__dirname,'browser-flow.test.cjs'),'utf8');
const start=fixture.indexOf('const fakeSupabase ='),end=fixture.indexOf('\n(async',start);
const fake=vm.runInNewContext(fixture.slice(start,end)+'\nfakeSupabase');
const root=path.resolve(__dirname,'../public'),template=fs.readFileSync(path.join(root,'seo-template.html'),'utf8');
const id='11111111-1111-4111-8111-111111111111';
const item={id,title:'SEO test guide',description:'Full public description of a guide.',category:'Career',price:10,uploader_name:'Test Expert'};
const meta=SEO.detailMeta('marketplace',item),body=content('marketplace',item);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/expert-match'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,matches:[{consultant:{id:'test-expert',name:'Test Expert',specialty:'Career Coach',price:500}}]}))}
 if(url.pathname==='/api/jobs'&&url.searchParams.get('path')==='/marketplace/unavailable'){res.statusCode=503;return res.end('Unavailable')}
 if(url.pathname==='/api/jobs'&&url.searchParams.get('service')==='seo'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({meta,body}))}
 if(url.pathname==='/marketplace/'+id){res.setHeader('Content-Type','text/html');return res.end(withRouteSeo(template,url.pathname,meta).replace('<div id="page-seo-detail" class="page on" role="main"></div>','<div id="page-seo-detail" class="page on" role="main">'+body+'</div>'))}
 let file=path.join(root,url.pathname);
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.statusCode=404;file=path.join(root,'404.html')}
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{let browser;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>{const u=route.request().url();if(u.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fake});if(!u.startsWith(origin))return route.abort();return route.continue()});
 const page=await context.newPage();
 await page.goto(origin+'/about');await page.waitForFunction(()=>typeof window.guidcyNavigate==='function');await page.waitForTimeout(1400);
 for(const [route,pageId] of [['/find-experts','browse'],['/find-jobs','jobs'],['/webinars','webinar'],['/marketplace','marketplace'],['/funds-grants','opportunities'],['/career-ai-finder','smart-finder'],['/login','login'],['/','home']]){
  await page.evaluate(route=>window.guidcyNavigate(route),route);await page.locator('#page-'+pageId+'.on').waitFor();
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),SEO.origin+route,route);
  assert.equal(await page.title(),SEO.metaFor(route).title,route);
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),route==='/login'?'noindex, follow':'index, follow, max-image-preview:large');
 }
 await page.goto(origin+'/find-experts');
 await page.locator('#gm-browse-panel').waitFor();
 assert.equal(await page.locator('#gm-browse-panel').count(),1);
 await page.locator('#gm-browse-goal').fill('Career guidance');
 await page.locator('#gm-browse-panel').getByRole('button',{name:'Find Best Expert Match →',exact:true}).click();
 await page.locator('#guidcy-browse-match-results').getByText('Test Expert',{exact:true}).waitFor();
 await page.evaluate(()=>window.guidcyNavigate('/about'));await page.goBack();
 await page.locator('#page-browse.on #gm-browse-panel').waitFor();
 assert.equal(await page.locator('#gm-browse-panel').count(),1,'panel survives Back without duplication');
 await page.evaluate(()=>window.guidcyNavigate('/'));
 await page.evaluate(id=>window.guidcyNavigate('/marketplace/'+id),id);
 await page.locator('#page-seo-detail.on h1').waitFor();assert.equal(await page.title(),meta.title);
 await page.goBack();await page.locator('#page-home.on').waitFor();await page.waitForFunction(title=>document.title===title,SEO.metaFor('/').title,{timeout:5000});assert.equal(await page.title(),SEO.metaFor('/').title);
 await page.goForward();await page.locator('#page-seo-detail.on').waitFor();await page.waitForFunction(title=>document.title===title,meta.title,{timeout:5000});assert.equal(await page.title(),meta.title);
 await page.goto(origin+'/marketplace/'+id);await page.waitForTimeout(2000);
 assert.equal(await page.locator('#page-seo-detail.on h1').textContent(),'SEO test guide');
 assert.equal(await page.title(),meta.title);assert.equal(new URL(page.url()).pathname,'/marketplace/'+id);
 // A single click still delegates to the existing purchase/detail owner.
 await page.evaluate(()=>{window.GuidcyMarketplace.openDetails=id=>{window.__seoOpened=id}});
 await page.locator('[data-seo-resource]').click();assert.equal(await page.evaluate(()=>window.__seoOpened),id);
 await page.evaluate(()=>window.guidcyNavigate('/marketplace/unavailable'));
 await page.locator('[data-seo-retry]').waitFor();
 await page.goBack();
 await page.locator('#page-seo-detail.on h1').filter({hasText:'SEO test guide'}).waitFor();
 await page.goto(origin+'/not-a-real-page');await page.waitForTimeout(1800);
 assert.equal(await page.locator('#page-not-found.on').count(),1);assert.match(await page.title(),/Page not found/);
 const nojs=await browser.newContext({javaScriptEnabled:false});const plain=await nojs.newPage();
 for(const [route,selector] of [['/about','#page-about'],['/marketplace/'+id,'#page-seo-detail']]){await plain.goto(origin+route);assert.ok(await plain.locator(selector).isVisible());assert.equal(await plain.locator('.page:visible').count(),1)}
 await nojs.close();console.log('PASS: SPA metadata, noindex transitions, detail direct visits, Back/Forward, existing action delegation, real missing pages, and JS-disabled route content.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
