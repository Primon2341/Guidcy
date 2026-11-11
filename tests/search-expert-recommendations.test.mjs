import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './helpers/expert-match-fixture.cjs';
const {makeHandler,base}=fixture;

test('finder suggestions require actual profile keywords and do not fill with high-rated experts',async()=>{
 const api=makeHandler();
 for(const [query,expected] of [['polymer',['test-expert']],['What is polymer?',['test-expert']],['I need a mentor in polymer',['test-expert']],['Optical fiber',['test-expert']],['Guidcy Technologies',['test-expert']],['Guidcy',['test-expert']],['IIT Roorkee',['test-expert']],['Electrospinning',['test-expert']],['Materials Testing',['test-expert']],['AI',['ai']],['C++',['ai']],['Scholarship',['startup']],['tax',['finance']],['zzqxvplm',[]],['help please',[]]]){
  const result=await api.request(query);assert.equal(result.ok,true);assert.deepEqual(Array.from(result.matches,m=>m.consultant.id),expected,query);assert.deepEqual(Array.from(result.related||[]),[],'finder suggestions do not broaden to unrelated expertise');assert.ok(result.matches.every(m=>m.hits.length>0));
 }
 assert.ok(api.queries.every(q=>!new URL(q,'https://fixture.invalid').searchParams.get('select').includes('*')),'only required public columns are queried');
 assert.ok(!JSON.stringify(await api.request('polymer')).includes('NEVER_PUBLIC'),'payout data cannot appear in the response');
});

test('typos use actual profile vocabulary, and inactive/unapproved profiles are excluded',async()=>{
 const api=makeHandler();assert.deepEqual(Array.from((await api.request('polymre')).matches,m=>m.consultant.id),['test-expert']);
 const result=await api.request('polymer');assert.equal(result.matches.length,1);assert.equal(result.matches[0].consultant.rate,499);
});

test('bounded directory pagination reaches later consultants and deduplicates IDs',async()=>{
 const rows=Array.from({length:201},(_,i)=>({...base,id:'id-'+i,name:'Consultant '+i,bio:i===200?'Electrochemistry':''}));rows.push(rows[200]);
 const api=makeHandler({rows,portfolio:[]});assert.deepEqual(Array.from((await api.request('Electrochemistry')).matches,m=>m.consultant.id),['id-200']);assert.ok(api.queries.some(q=>q.includes('offset=200')));
});

test('database failure returns no arbitrary fallback consultants',async()=>{
 const result=await makeHandler({fail:true}).request('polymer');assert.equal(result.ok,false);assert.equal(result.matches.length,0);
});

test('zero-price sessions retain their actual price rather than a fallback amount',async()=>{
 const result=await makeHandler({rows:[{...base,id:'free',name:'Polymer mentor',video_price:0}],portfolio:[]}).request('polymer');assert.equal(result.matches[0].consultant.rate,0);assert.equal(result.matches[0].consultant.video_price,0);
});

test('stronger multi-keyword matches precede incidental mentions',async()=>{
 const rows=[{...base,id:'incidental',name:'IIT Delhi Mentor',rating:5},{...base,id:'exact',name:'IIT Roorkee Mentor',rating:0}];
 const result=await makeHandler({rows,portfolio:[]}).request('IIT Roorkee');assert.deepEqual(Array.from(result.matches,m=>m.consultant.id),['exact','incidental']);
});
