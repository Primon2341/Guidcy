import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('post previews respond to actual overflow and stop observing removed cards',()=>{
 const source=fs.readFileSync(new URL('../assets/js/community.js',import.meta.url),'utf8');
 const observed=new Set();let resize,bodies=[];
 const context={document:{querySelectorAll:()=>bodies},ResizeObserver:class{constructor(fn){resize=fn}observe(el){observed.add(el)}unobserve(el){observed.delete(el)}}};
 vm.runInNewContext(source.slice(source.indexOf('  const previewBodies='),source.indexOf('  function paintMe()')),context);
 const body={isConnected:true,scrollHeight:180,clientHeight:72,classList:{contains:()=>true},nextElementSibling:{hidden:true,matches:()=>true}};bodies=[body];
 context.syncPostPreviews();assert.equal(body.nextElementSibling.hidden,false);assert.equal(observed.size,1);
 body.scrollHeight=body.clientHeight;resize([{target:body}]);assert.equal(body.nextElementSibling.hidden,true,'short text has no unnecessary toggle');
 body.classList.contains=()=>false;body.nextElementSibling=null;assert.doesNotThrow(()=>resize([{target:body}]),'expanded posts no longer have a toggle');
 body.isConnected=false;bodies=[];context.syncPostPreviews();assert.equal(observed.size,0,'replaced feed cards do not accumulate observers');
});
