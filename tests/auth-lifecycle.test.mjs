import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/auth-lifecycle.js',import.meta.url),'utf8');
function fixture(){
 const listeners={},window={addEventListener:(name,fn)=>listeners[name]=fn};
 const context={window,document:{documentElement:{setAttribute(){},removeAttribute(){}},querySelector(){return null}},Promise,queueMicrotask};
 vm.runInNewContext(source,context);
 return {window,listeners};
}
test('concurrent session restores share one SDK call without replacing its result',async()=>{
 const {window}=fixture();let finish,calls=0;
 const client={auth:{getSession(){calls++;return new Promise(r=>finish=r)},onAuthStateChange(){}}};
 window.guidcyConfigureAuthClient(client);window.guidcyConfigureAuthClient(client);
 const a=client.auth.getSession(),b=client.auth.getSession();await Promise.resolve();
 assert.equal(calls,1);assert.equal(a,b);
 const result={data:{session:{user:{id:'one'}}},error:null};finish(result);
 assert.equal(await a,result);assert.equal(window.__guidcyAuthUser.id,'one');
});
test('network failure remains unknown and does not publish a logged-out session',async()=>{
 const {window}=fixture();const error=new Error('offline');
 const client={auth:{getSession:async()=>({data:{session:null},error}),onAuthStateChange(){}}};
 window.guidcyConfigureAuthClient(client);assert.equal((await client.auth.getSession()).error,error);
 assert.equal(window.__guidcyAuthResolved,false);
 assert.equal(window.guidcyDashboardAuthReady(),false);
});
test('a read that finishes after logout cannot restore its user',async()=>{
 const {window}=fixture();let finish;
 const client={auth:{getSession:()=>new Promise(r=>finish=r),onAuthStateChange(){}}};
 window.guidcyConfigureAuthClient(client);const pending=client.auth.getSession();await Promise.resolve();
 window.__guidcyAuthEpoch=1;window.__guidcyAuthUser=null;
 finish({data:{session:{user:{id:'old'}}},error:null});await pending;
 assert.equal(window.__guidcyAuthUser,null);
});
