/* Regression: the browser Back button jumped straight to the homepage.
   window.onpopstate fell back to 'home' whenever the history entry had a null
   state, and several pushState calls (footer routes) store exactly that. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not locate ${from} .. ${to}`);
  return src.slice(a, b + to.length);
};

const win = { location: { pathname: '/', hash: '' } };
const ctx = vm.createContext({ window: win });
vm.runInContext(slice('function getPageFromPath(){', "return h || 'home';\n}"), ctx);
const at = p => { win.location.pathname = p; return ctx.getPageFromPath(); };

test('null-state history entries still resolve to their real page, not home', () => {
  for (const [path, page] of [['/blog', 'blog'], ['/webinars', 'webinar'], ['/help-center', 'help'],
                              ['/dispute-resolution', 'dispute'], ['/browse', 'browse'],
                              ['/consultant/abc123', 'profile'], ['/', 'home']])
    assert.equal(at(path), page, path);
});

test('no popstate handler falls back to a hardcoded home', () => {
  for (const m of src.matchAll(/onpopstate\s*=\s*function[^\n]*\n?/g))
    assert.ok(!/\|\|\s*'home'\s*\)?;/.test(m[0]) || /getPageFromPath/.test(m[0]),
      `popstate handler hardcodes home: ${m[0].slice(0, 120)}`);
});

test('Back follows history through rewrites, refresh, Forward and a new navigation branch', () => {
  const entries=[{state:null,url:'/find-experts?q=career'}];let index=0;
  class History {
    get state(){return entries[index].state}
    get length(){return entries.length}
    pushState(state,title,url){entries.splice(++index);entries.push({state,url})}
    replaceState(state,title,url){entries[index]={state,url:url||entries[index].url}}
    back(){if(index)index--}
  }
  const history=new History(),location=new URL('https://guidcy.test/find-experts?q=career');
  const window={addEventListener(){},guidcyNavigate(url){history.pushState({},'',url)}};
  const context=vm.createContext({History,history,location,window,URL,document:{addEventListener(){}}});
  const core=fs.readFileSync(new URL('../assets/js/core.js',import.meta.url),'utf8');
  vm.runInContext(core,context);
  const controllers=fs.readFileSync(new URL('../assets/js/controllers.js',import.meta.url),'utf8');
  vm.runInContext(controllers.slice(controllers.indexOf('window.guidcyBack=function'),controllers.indexOf('/* === guidcy-dashboard-button-toggle')),context);
  history.pushState({page:'profile'},'','/consultant/expert');
  history.replaceState(null,'','/consultant/expert');
  vm.runInContext(core,context); // refresh preserves this entry's predecessor
  window.guidcyBack();assert.equal(entries[index].url,'/find-experts?q=career');
  assert.equal(history.state.guidcyCanGoBack,false);
  index++;window.guidcyBack();assert.equal(index,0); // Forward, then Back
  window.guidcyBack('/marketplace');assert.equal(entries[index].url,'/marketplace');
  assert.equal(entries.length,2,'fallback replaces the forward branch');
  window.__guidcyPaymentFlowLock=true;window.guidcyBack();assert.equal(index,1);
  window.__guidcyPaymentFlowLock=false;window.guidcyBack();assert.equal(index,0);
});
