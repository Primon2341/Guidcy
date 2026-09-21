import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('/* === guidcy-supabase-request-dedupe ==='),source.indexOf('/* ─── SUPABASE INIT ─── */'));
const url='https://fixture.supabase.co/rest/v1/bookings?select=id';
function setup(fetch){
  const window={fetch};
  vm.runInNewContext(code,{window,Headers,Response,Request,AbortController,DOMException,Map,Set,Promise,Date});
  return window;
}
const response=(id=1)=>new Response(JSON.stringify([{id}]),{headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('identical reads share a request and independently consumable responses',async()=>{
  let calls=0;const w=setup(async()=>{calls++;return response()});
  const [a,b]=await Promise.all([w.fetch(url),w.fetch(url)]);
  assert.equal(calls,1);assert.deepEqual(await a.json(),await b.json());
  assert.deepEqual(await (await w.fetch(url)).json(),[{id:1}]);assert.equal(calls,1);
});
test('identity, schema, ranges and object response headers stay isolated',async()=>{
  let calls=0;const w=setup(async()=>{calls++;return response()});
  for(const headers of [{authorization:'Bearer A'},{Authorization:'Bearer A'},{authorization:'Bearer B'},{'accept-profile':'private'},{range:'0-9'},{range:'10-19'},{accept:'application/vnd.pgrst.object+json'}])await w.fetch(url,{headers});
  assert.equal(calls,6,'header casing shares; identities and response shapes do not');
});
test('a write prevents an old in-flight read from repopulating the cache',async()=>{
  let resolveOld,calls=0;
  const w=setup(async(input,init)=>{if(init.method==='PATCH')return response(2);if(++calls===1)return new Promise(r=>resolveOld=r);return response(2)});
  const old=w.fetch(url);await tick();
  await w.fetch(url,{method:'PATCH',body:'{}'});
  assert.deepEqual(await (await w.fetch(url)).json(),[{id:2}]);
  resolveOld(response(1));await old;
  assert.deepEqual(await (await w.fetch(url)).json(),[{id:2}]);assert.equal(calls,2);
});
test('Request mutations, explicit refresh and RPC invalidation keep fetch semantics',async()=>{
  let calls=0;const methods=[];
  const w=setup(async(input,init)=>{calls++;methods.push(init?.method||input.method||'GET');return response()});
  await w.fetch(url);await w.fetch(new Request(url,{method:'POST',body:'{}'}));await w.fetch(url);
  assert.deepEqual(methods,['GET','POST','GET']);
  await w.fetch(url,{cache:'no-store'});await w.fetch(url,{cache:'reload'});assert.equal(calls,5);
  await w.fetch('https://fixture.supabase.co/rest/v1/rpc/update_bookings',{method:'POST'});await w.fetch(url);assert.equal(calls,7);
});
test('one subscriber aborting does not cancel another panel',async()=>{
  let finish,wireSignal,calls=0;const w=setup(async(_,init)=>{calls++;wireSignal=init.signal;return new Promise(r=>finish=r)});
  const a=new AbortController(),b=new AbortController();
  const first=w.fetch(url,{signal:a.signal}),second=w.fetch(url,{signal:b.signal});
  const rejected=assert.rejects(first,{name:'AbortError'});await tick();a.abort();await rejected;
  assert.equal(wireSignal.aborted,false);finish(response());assert.deepEqual(await (await second).json(),[{id:1}]);assert.equal(calls,1);
});
test('aborting every subscriber cancels the wire request and permits retry',async()=>{
  let calls=0,signal;const w=setup(async(_,init)=>{calls++;signal=init.signal;if(calls>1)return response();return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)))});
  const controller=new AbortController();const pending=w.fetch(url,{signal:controller.signal});
  const rejected=assert.rejects(pending,{name:'AbortError'});await tick();controller.abort();await rejected;await tick();
  assert.equal(signal.aborted,true);await w.fetch(url);assert.equal(calls,2);
});
test('errors are not cached; a failed write still invalidates previous data',async()=>{
  let calls=0;const w=setup(async(_,init)=>{calls++;if(init?.method==='PATCH')throw new Error('offline');return calls===1?new Response('',{status:503}):response()});
  await w.fetch(url);await w.fetch(url);assert.equal(calls,2);
  await assert.rejects(w.fetch(url,{method:'PATCH'}),/offline/);await w.fetch(url);assert.equal(calls,4);
});
