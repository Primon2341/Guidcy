import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function applyFilters(){\n  /* Navigating to a category');
const end=source.indexOf('let guidcyBrowseSearchTimer=',start);
assert.ok(start>=0&&end>start);
function setup(cards=0,ready=false){
 const filters={categories:[],languages:[],experience:[],minRating:0,minPrice:0,maxPrice:99999,search:'',sort:''};
 const attributes=new Map(),pending=[],count={textContent:'Experts'};
 const grid={cards,dataset:ready?{guidcyResultsReady:'true'}:{},writes:0,querySelectorAll(){return Array(this.cards).fill({})},set innerHTML(value){this.writes++;this.html=value},toggleAttribute(key,on){on?attributes.set(key,''):attributes.delete(key)},setAttribute(key,value){attributes.set(key,String(value))},removeAttribute(key){attributes.delete(key)}};
 const context=vm.createContext({window:{__guidcyFilterRun:0},document:{getElementById:id=>id==='browse-grid'?grid:id==='browse-count'?count:null},guidcyReadBrowseFilters:()=>JSON.parse(JSON.stringify(filters)),fetchConsultants:()=>new Promise(resolve=>pending.push(resolve)),renderGrid:rows=>{grid.cards=rows.length;return rows},console});
 vm.runInContext('let browseFilters={};\n'+source.slice(start,end),context);
 return {context,grid,count,pending,attributes,filters};
}

test('initial browse load reports loading until real expert results arrive',async()=>{
 const s=setup(),run=s.context.applyFilters();
 assert.equal(s.count.textContent,'Loading experts...');assert.match(s.grid.html,/Searching experts/);
 assert.equal(s.attributes.has('data-guidcy-background-refresh'),false);
 s.pending.shift()([{},{}]);await run;
 assert.equal(s.count.textContent,'Showing 2 experts');assert.equal(s.grid.dataset.guidcyResultsReady,'true');
 assert.equal(s.attributes.get('aria-busy'),'false');
});
test('restored expert cards keep their actual count during a background refresh',async()=>{
 const s=setup(2),run=s.context.applyFilters();
 assert.equal(s.count.textContent,'Showing 2 experts');assert.equal(s.grid.writes,0,'restored cards are not replaced by a placeholder');
 assert.equal(s.attributes.has('data-guidcy-background-refresh'),true);
 s.pending.shift()([{}, {}, {}]);await run;
 assert.equal(s.count.textContent,'Showing 3 experts');assert.equal(s.attributes.has('data-guidcy-background-refresh'),false);
});
test('completed empty results remain valid visible results during refresh',async()=>{
 const s=setup(0,true),run=s.context.applyFilters();assert.equal(s.count.textContent,'Showing 0 experts');assert.equal(s.grid.writes,0);
 s.pending.shift()([]);await run;assert.equal(s.count.textContent,'Showing 0 experts');
});
test('changed filters say updating and an older request cannot overwrite the latest result',async()=>{
 const s=setup(2,true);s.grid.dataset.guidcyFilterKey=JSON.stringify(s.filters);
 s.filters.search='First';const old=s.context.applyFilters();assert.match(s.count.textContent,/Showing 2 experts · Updating results/);
 s.filters.search='Latest';const latest=s.context.applyFilters();
 s.pending[1]([{}]);await latest;assert.equal(s.count.textContent,'Showing 1 expert');
 s.pending[0]([{}, {}, {}]);await old;
 assert.equal(s.count.textContent,'Showing 1 expert');assert.equal(s.grid.cards,1);assert.equal(s.attributes.has('data-guidcy-background-refresh'),false);
});
