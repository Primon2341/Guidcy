import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
test('home routes only to the community renderer; obsolete startup jobs are removed',()=>{
 let mounts=0;
 const declaration=app.match(/^function initHome\(\).*$/m)?.[0];
 vm.runInNewContext(declaration+';initHome();',{window:{GuidcyCommunity:{mount(){mounts++;}}}});
 assert.equal(mounts,1);
 assert.match(app,/home:\(\)=>window\.GuidcyCommunity\?\.mount\(\)/);
 for(const retired of ['loadHomeStats','renderRealReviews','fetchReviews','guidcyWhenHomeVisible','guidcyRefreshHomeInternetOpportunities','guidcyRefreshPersonalization','renderStrip','patchHomeCopy'])assert.doesNotMatch(app,new RegExp('function '+retired+'\\('));
 assert.doesNotMatch(app,/containerId==='cons-grid'/);
});

test('community data uses the same refresh regions as the expert directory',()=>{
 const shell=fs.readFileSync(new URL('../assets/js/page-shell.js',import.meta.url),'utf8');
 const refresh=fs.readFileSync(new URL('../assets/js/ui-refresh.js',import.meta.url),'utf8');
 for(const id of ['gnet-me','gnet-feed','gnet-experts','gnet-compose-avatar']){
  assert.ok(shell.includes("'"+id+"'"));assert.ok(refresh.includes("'"+id+"'"));
 }
});
