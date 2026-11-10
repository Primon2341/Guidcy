import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/js/community.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function dateRank('),source.indexOf('  function entryHTML('));
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const context={Date,Map,Set,esc,ownProfile:()=>true,organizationKey:s=>s.trim().replace(/\s+/g,' ').toLowerCase(),
 organizationMark:s=>'<span class="logo">'+esc(s)+'</span>',organizationName:esc,longText:s=>'<p>'+esc(s)+'</p>'};
vm.createContext(context);vm.runInContext(code,context);

test('overlapping roles count calendar months once and do not invent durations for missing months',()=>{
 const rows=[{start_date:'2023-07',end_date:'2024-09'},{start_date:'2023-07',end_date:'2024-06'}];
 assert.equal(context.experienceDuration(rows),'1 yr 3 mos');
 assert.equal(context.experienceDuration([{start_date:'2024-07',currently_working:true}],new Date(2024,8,1)),'3 mos');
 assert.equal(context.experienceDuration([{start_date:'2020',end_date:'2022'}]),'');
 assert.equal(context.experienceDuration([...rows,{start_date:'2020'}]),'');
 assert.equal(context.experienceDuration([{start_date:'2020-01',end_date:'2020-02'},{start_date:'2021-01',end_date:'2021-01'}]),'3 mos','gaps are not counted as employment');
});

test('date labels and month/year edits preserve existing legacy dates',()=>{
 assert.equal(context.experienceDateLabel('01/07/2023'),'Jul 2023');
 assert.equal(context.experienceDateLabel('2023'),'2023');
 assert.equal(context.experienceDateLabel('2023-13'),'2023-13','unrecognized legacy dates are preserved rather than guessed');
 const data=new Map([['start_year','2023'],['start_month','07']]);
 assert.equal(context.experienceDateValue(data,'start','01/07/2023'),'01/07/2023');
 assert.equal(context.experienceDateValue(data,'start','2023-07-15'),'2023-07-15');
 data.set('start_month','08');assert.equal(context.experienceDateValue(data,'start','01/07/2023'),'2023-08');
 data.set('start_month','');assert.equal(context.experienceDateValue(data,'start',''),'2023');
 data.set('start_month','13');assert.throws(()=>context.experienceDateValue(data,'start',''),/valid month/);
 data.set('start_month','07');data.set('start_year','');assert.throws(()=>context.experienceDateValue(data,'start',''),/Select a year/);
 data.set('start_year','1800');assert.throws(()=>context.experienceDateValue(data,'start',''),/1900/);
});

test('company timelines retain original edit indices after chronological sorting',()=>{
 const rows=context.experienceRows({company_experience:[
  {designation:'Engineer',company_name:'Example',start_date:'2020-01',end_date:'2021-01'},
  {designation:'Manager',company_name:' example ',start_date:'2021-02',currently_working:true,location_type:'Hybrid',skills:['Research','Testing','Coatings']},
  {designation:'Intern',company_name:'Other Company',start_date:'2019-01',end_date:'2019-06'},
 ]});
 const html=context.experienceHTML(rows);
 assert.equal((html.match(/class="gnet-experience-group"/g)||[]).length,2);
 assert.ok(html.indexOf('Manager')<html.indexOf('Engineer'));
 assert.match(html,/data-entry="1" aria-label="Edit Manager"/);
 assert.match(html,/data-entry="0" aria-label="Edit Engineer"/);
 assert.match(html,/and \+1 skills/);
 context.ownProfile=()=>false;assert.doesNotMatch(context.experienceHTML(rows),/data-action="edit-experience"/);context.ownProfile=()=>true;
 assert.doesNotMatch(context.experienceHTML([{designation:'<img src=x>',company_name:'<script>',index:0}]),/<img src=x>|<script>/);
});
