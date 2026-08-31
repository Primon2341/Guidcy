import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');

function functionSource(name){
  const start=app.indexOf(`async function ${name}(`);
  assert.ok(start>=0,`${name} must exist`);
  const open=app.indexOf('{',start);
  let depth=0;
  for(let i=open;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}'&&--depth===0)return app.slice(start,i+1);
  }
  throw new Error(`Could not extract ${name}`);
}

function reviewRuntime({consultantLookupFails=false}={}){
  const calls=[];
  const reviewRows=[{
    id:'review-1',consultant_id:'consultant-1',user_id:'user-1',
    reviewer_name:'A User',rating:5,text:'Helpful',is_published:true
  }];
  const client={
    from(table){
      const state={table,select:''};
      const query={
        select(value){state.select=value;calls.push({table,value});return query},
        eq(){return query},order(){return query},limit(){return query},in(){return query},
        then(resolve,reject){
          let response;
          if(table==='reviews'){
            if(state.select.includes('consultants'))return Promise.reject(new Error('relationship unavailable')).then(resolve,reject);
            response={data:reviewRows.map(row=>({...row})),error:null};
          }else if(table==='consultants'){
            response=consultantLookupFails
              ?{data:null,error:{message:'consultant lookup denied'}}
              :{data:[{id:'consultant-1',name:'Expert One'}],error:null};
          }else if(table==='profiles'){
            response={data:[{id:'user-1',avatar_url:'https://example.test/avatar.jpg'}],error:null};
          }else response={data:[],error:null};
          return Promise.resolve(response).then(resolve,reject);
        }
      };
      return query;
    }
  };
  const context=vm.createContext({
    window:{guidcyGetSupabaseClient:()=>client},sb:client,console,
    Map,Set,Promise,Array,String
  });
  const start=app.indexOf('async function guidcyAttachReviewAvatars');
  const end=app.indexOf('/* ═══════════════════════════════════════════\n   HOME',start);
  vm.runInContext(app.slice(start,end),context);
  return {context,calls};
}

test('homepage review rows do not depend on an embedded consultants relationship',async()=>{
  const {context,calls}=reviewRuntime();
  const rows=await vm.runInContext('fetchReviews()',context);
  assert.equal(rows.length,1);
  assert.equal(rows[0].consultants.name,'Expert One');
  assert.equal(rows[0].reviewer_avatar,'https://example.test/avatar.jpg');
  assert.deepEqual(calls.find(call=>call.table==='reviews'),{table:'reviews',value:'*'});
});

test('a failed consultant-name lookup cannot hide valid homepage reviews',async()=>{
  const {context}=reviewRuntime({consultantLookupFails:true});
  const rows=await vm.runInContext('fetchReviews()',context);
  assert.equal(rows.length,1);
  assert.equal(rows[0].text,'Helpful');
  assert.equal(rows[0].reviewer_avatar,'https://example.test/avatar.jpg');
});

test('homepage reviews still render when Featured Experts loading fails',async()=>{
  let reviewRenders=0;
  const context=vm.createContext({
    fetchConsultants:async()=>{throw new Error('consultants unavailable')},
    renderRealReviews:async()=>{reviewRenders++},renderGrid:()=>{},
    console:{warn(){}},Promise
  });
  vm.runInContext(functionSource('initHome'),context);
  await vm.runInContext('initHome()',context);
  assert.equal(reviewRenders,1);
});

test('featured-aware homepage initializer starts reviews independently',()=>{
  const start=app.indexOf('function orderFeatured(list)');
  const end=app.indexOf('async function buildFeatureAdmin()',start);
  const section=app.slice(start,end);
  assert.match(section,/const reviewsTask=typeof renderRealReviews==='function'/);
  assert.match(section,/await reviewsTask/);
  assert.doesNotMatch(section,/renderGrid\(orderFeatured\(list\|\|\[\]\),'cons-grid'\); if\(typeof renderRealReviews/);
});
