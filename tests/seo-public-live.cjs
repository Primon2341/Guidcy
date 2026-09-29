const fs=require('node:fs'),assert=require('node:assert/strict');
const {rows,handler}=require('../lib/seo-public');
(async()=>{
 const paths=[];
 for(const kind of ['consultant','marketplace','webinars','careers','blog']){
  const data=await rows(kind);console.log(kind+': '+data.length+' public records');
  const sample=data.find(r=>kind!=='webinars'||r.date>=new Date().toISOString().slice(0,10));
  if(!sample)continue;
  const route='/'+kind+'/'+(kind==='blog'?sample.slug:sample.id);
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body}};
  await handler({method:'GET',query:{path:route}},res);
  assert.equal(res.statusCode,200,route);assert.ok(res.body.includes(kind==='consultant'?sample.name:sample.title));
  assert.ok(!res.body.includes('"publisher_email"'));assert.ok(!res.body.includes('"file_path"'));
  paths.push(route);
 }
 fs.writeFileSync('/private/tmp/guidcy-seo-public-paths.json',JSON.stringify(paths));
 console.log('PASS: real anonymous public data renders safely for each catalog.');
})().catch(error=>{console.error(error);process.exitCode=1});
