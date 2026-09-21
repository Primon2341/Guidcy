import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('/* === guidcy-render-page-dedupe === */'),source.indexOf('/* === guidcy-marketplace-visibility-hydration === */'));
function setup(){
  let active='home';const rendered=[];
  const window={renderPage:page=>{active=page;rendered.push(page)}};
  const document={getElementById:id=>({classList:{contains:()=>id==='page-'+active}})};
  vm.runInNewContext(code,{window,document,Date:{now:()=>1000}});
  return {window,rendered,activate:page=>{active=page}};
}
test('a recent Home render never suppresses a real return from another active route',()=>{
  const s=setup();s.window.renderPage('home');
  s.activate('marketplace'); // A legacy renderer activates this page directly.
  s.window.renderPage('home');
  assert.deepEqual(s.rendered,['home','home']);
});
test('duplicate renders of the active page are still coalesced; forced refresh passes through',()=>{
  const s=setup();s.window.renderPage('home');s.window.renderPage('home');
  assert.deepEqual(s.rendered,['home']);
  s.window.__guidcyForceRenderOnce=true;s.window.renderPage('home');
  assert.deepEqual(s.rendered,['home','home']);
  assert.equal(s.window.__guidcyForceRenderOnce,false);
});
