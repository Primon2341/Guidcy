import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const rows=[
 {id:'active',title:'Active notes',uploader_id:'owner',status:'active',removed_at:null},
 {id:'inactive',title:'Inactive notes',uploader_id:'owner',status:'inactive',removed_at:null},
 {id:'removed',title:'Solutions',uploader_id:'owner',status:'removed',removed_at:null},
 {id:'timestamp',title:'Deleted notes',uploader_id:'owner',status:'active',removed_at:'2026-09-25'},
 {id:'other',title:'Another seller',uploader_id:'other',status:'active',removed_at:null},
];

for(const name of ['seller','renderSellerMarketplace'])test(name+' excludes removed uploads while keeping editable inactive notes and sales history',async()=>{
 const panel={innerHTML:''};
 const client={from(table){
  let data=table==='marketplace_notes'?rows:table==='marketplace_orders'?[{id:'sale',seller_id:'owner',marketplace_notes:{title:'Historical sale'},payment_status:'success'}]:[];
  const q={select(){return q},eq(k,v){data=data.filter(r=>r[k]===v);return q},neq(k,v){data=data.filter(r=>r[k]!==v);return q},is(k,v){data=data.filter(r=>r[k]===v);return q},order(){return Promise.resolve({data,error:null})}};
  return q;
 }};
 const context={console,Map,Date,Promise,window:{GuidcyMarketplace:{renderList(){}}},document:{},
  $:()=>panel,byId:()=>panel,sbc:()=>client,client:()=>client,uid:()=> 'owner',userId:()=> 'owner',setSide(){},
  card:n=>'<h3>'+n.title+'</h3>',esc:String,h:String,rupee:String,money:String,completed:()=>true,paidPayout:()=>false,startOfWeek:()=>new Date(0),statusPill:String};
 context.GuidcyMarketplace=context.window.GuidcyMarketplace;
 context.window.guidcyMarketplaceDescription=String;context.window.guidcyPayoutRef=()=>'';
 const code=app.split('\n').find(line=>line.startsWith('  async function '+name+'('));
 assert.ok(code,'production renderer exists');
 vm.runInNewContext(code,context);await context[name]();
 assert.match(panel.innerHTML,/Active notes/);assert.match(panel.innerHTML,/Inactive notes/);
 assert.doesNotMatch(panel.innerHTML,/Solutions|Deleted notes|Another seller/);
 assert.match(panel.innerHTML,/Historical sale/,'removing an upload does not hide historical sales');
});

test('deleting a note refreshes the current seller panel',async()=>{
 const panel={classList:{contains:()=>true}};let sellerRefresh=0,publicRefresh=0;
 const context={console,Date,window:{GuidcyMarketplace:{seller:async()=>sellerRefresh++}},
  document:{querySelector:s=>s==='#page-cons-dash.on'?panel:null},getNote:async()=>({file_path:null}),canManage:()=>true,confirm:()=>true,
  sbc:()=>({from(){const q={update:()=>q,eq:()=>q,select:()=>q,single:async()=>({data:{id:'note'},error:null})};return q}}),
  uid:()=> 'owner',isAdmin:()=>false,toastSafe(){},closeModal(){},render:async()=>publicRefresh++};
 vm.runInNewContext(app.split('\n').find(line=>line.startsWith('  async function deleteNote(')),context);
 await context.deleteNote('note');assert.equal(sellerRefresh,1);assert.equal(publicRefresh,0);
});
