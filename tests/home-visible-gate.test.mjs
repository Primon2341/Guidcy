import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const start=source.indexOf('/* === guidcy-home-section-gate ===');
const code=source.slice(start,source.indexOf('/* Scan newly mounted controls',start));
function setup(path='/'){
  const state={path,active:true,boot:null,ready:'interactive'};
  const observers=[],microtasks=[],listeners={};
  const home={classList:{contains:()=>state.active}};
  const window={};
  const document={get readyState(){return state.ready},documentElement:{getAttribute:()=>state.boot},getElementById:()=>home,addEventListener:(name,fn)=>{listeners[name]=fn}};
  class MutationObserver{
    constructor(fn){this.fn=fn;this.connected=true;observers.push(this)}
    observe(){}
    disconnect(){this.connected=false}
  }
  vm.runInNewContext(code,{window,document,location:{get pathname(){return state.path}},MutationObserver,queueMicrotask:fn=>microtasks.push(fn),console});
  return {window,state,flush:()=>microtasks.splice(0).forEach(fn=>fn()),mutate:()=>observers.filter(o=>o.connected).forEach(o=>o.fn()),listeners,observers};
}
test('home initialization waits until the current script has installed its data providers',()=>{
  const s=setup();let initialized=0;
  s.window.guidcyWhenHomeVisible(()=>initialized++);
  assert.equal(initialized,0);
  s.flush();s.mutate();s.flush();
  assert.equal(initialized,1);
  assert.equal(s.observers[0].connected,false);
});
test('a deep link does not fetch hidden home data, but later SPA navigation initializes it once',()=>{
  const s=setup('/marketplace');let initialized=0;
  s.window.guidcyWhenHomeVisible(()=>initialized++);
  s.flush();s.mutate();assert.equal(initialized,0);
  s.state.path='/';s.state.boot='marketplace';s.mutate();assert.equal(initialized,0);
  s.state.boot=null;s.state.active=false;s.mutate();assert.equal(initialized,0);
  s.state.active=true;s.mutate();s.mutate();assert.equal(initialized,1);
});
test('parser-time registration waits for DOMContentLoaded and remains idempotent',()=>{
  const s=setup();s.state.ready='loading';let initialized=0;
  s.window.guidcyWhenHomeVisible(()=>initialized++);
  s.flush();assert.equal(initialized,0);
  s.listeners.DOMContentLoaded();s.mutate();assert.equal(initialized,1);
});
