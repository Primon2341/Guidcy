const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
test('existing dashboard experience editors preserve the professional metadata',()=>{
 const original={company_name:'Optical Research',designation:'Engineer',employment_type:'Full-time',location:'Delhi',skills:['Polymer Science'],department:'R&D',start_date:'2022-06',end_date:'',description:'Original description',currently_working:true};
 const normalized=vm.runInNewContext("function clean(v){return String(v??'').trim();}\n"+app.slice(app.indexOf('  function parseExp(raw)'),app.indexOf('  function latestFirst(list)'))+'\nnormalizeExp([original])[0]',{original});
 assert.equal(normalized.employment_type,'Full-time');assert.equal(normalized.location,'Delhi');assert.equal(normalized.skills[0],'Polymer Science');
 const row={dataset:{expOriginal:JSON.stringify(normalized)},querySelector(selector){const key=selector.match(/="([^"]+)"/)[1];return key==='currently_working'?{type:'checkbox',checked:true}:{type:'text',value:key==='description'?'Edited through the existing dashboard':original[key]||''};}};
 for(const [begin,end,name] of [['  function collectExperience(prefix)','  function expPatch(list','collectExperience'],['  function collect(prefix)','  function experiencePatch(prefix','collect']]){
  const start=app.indexOf(begin),code=app.slice(start,app.indexOf(end,start));
  const result=vm.runInNewContext("function clean(v){return String(v??'').trim();}\n"+code+'\n'+name+"('cd')[0]",{document:{querySelectorAll:()=>[row]}});
  assert.equal(result.employment_type,original.employment_type);assert.equal(result.location,original.location);assert.equal(result.skills[0],original.skills[0]);assert.equal(result.description,'Edited through the existing dashboard');
 }
 assert.ok(app.includes('data-exp-original="\'+esc(JSON.stringify(e))'));
 assert.equal(app.includes('function profileExperienceHtml'),false);
 assert.equal(app.includes('function addEducationToProfile'),false);
 assert.equal(app.includes('function syncProfileEdu'),false);
});


test('company edits invalidate in-flight expert sources without restoring the deleted company',async()=>{
 const pending=[],window={consultantsById:new Map()};
 const client={from(){const q={};q.select=q.eq=()=>q;q.limit=()=>new Promise(resolve=>pending.push(resolve));return q;}};
 const begin=app.indexOf('  const GUIDCY_CONSULTANT_SOURCE_TTL='),end=app.indexOf('  async function guidcyFetchConsultants',begin);
 vm.runInNewContext(app.slice(begin,end)+'\nwindow.load=loadConsultantSource;', {window,sbc:()=>client,fetchProfilesForConsultants:async rows=>rows,approved:()=>true,normalizeConsultant:c=>c,Date});
 const old=window.load();window.guidcyInvalidateConsultantSourceCache();const fresh=window.load();
 pending[1]({data:[{id:'expert',current_company:''}]});assert.equal((await fresh)[0].current_company,'');
 pending[0]({data:[{id:'expert',current_company:'HFCL'}]});assert.equal((await old)[0].current_company,'');
 assert.equal((await window.load())[0].current_company,'');assert.equal(pending.length,2);
});

test('empty education stays deleted when consultant records merge with older profiles and aliases',async()=>{
 const stale={id:'owner',highest_education:'M.Tech',college:'IIT Roorkee'};
 const client={from:()=>({select:()=>({in:async()=>({data:[stale]})})})};
 const start=app.indexOf('  async function fetchProfilesForConsultants(rows)'),end=app.indexOf('  const GUIDCY_CONSULTANT_SOURCE_TTL=',start);
 const merge=vm.runInNewContext(app.slice(start,end)+'\nfetchProfilesForConsultants',{sbc:()=>client,console});
 const [cleared,legacy]=await merge([{id:'expert',profile_id:'owner',highest_education:'',college:''},{id:'older',profile_id:'owner'}]);
 assert.equal(cleared.highest_education,'');assert.equal(cleared.college,'');
 assert.equal(legacy.highest_education,'M.Tech');assert.equal(legacy.college,'IIT Roorkee');
 const begin=app.indexOf('  function eduOf(c)'),finish=app.indexOf('  function eduLine(c)',begin);
 const education=vm.runInNewContext(app.slice(begin,finish)+'\neduOf',{txt:v=>String(v??'')});
 const display=education({...cleared,education:'M.Tech',degree:'M.Tech',university:'IIT Roorkee'});
 assert.equal(display.degree,'');assert.equal(display.college,'');
});
