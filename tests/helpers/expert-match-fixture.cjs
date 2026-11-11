const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base={is_active:true,is_approved:true,approval_status:'approved',rate:499,rating:0,review_count:0};
const consultants=[
 {...base,id:'test-expert',profile_id:'polymer-owner',name:'Polymer Expert',category:'Science',bio:'Optical fiber research and polymer development',tags:['Coatings','R&D'],current_company:'Guidcy Technologies',certs:['Materials Testing'],bank_account:'NEVER_PUBLIC'},
 {...base,id:'finance',profile_id:'finance-owner',name:'Finance Expert',category:'Finance',bio:'Investment and accounting',tags:['Tax'],rating:5},
 {...base,id:'startup',name:'Funding Expert',category:'Startup',bio:'Scholarships, grants and fundraising',rating:4.7},
 {...base,id:'retail',name:'Retail Expert',bio:'Retail sales and training',rating:5},
 {...base,id:'ai',name:'AI Expert',tags:['AI','C++'],rating:0},
 {...base,id:'inactive',name:'Hidden polymer expert',tags:['polymer'],is_active:false},
 {...base,id:'pending',name:'Unapproved polymer expert',tags:['polymer'],approval_status:'pending',is_approved:false},
];
const entries=[{profile_id:'polymer-owner',kind:'education',title:'M.Tech',organization:'IIT Roorkee',field:'Polymer Science',description:'Electrospinning research'}];
function makeHandler({rows=consultants,portfolio=entries,fail=false}={}){
 const queries=[],module={exports:{}};
 const source=fs.readFileSync(path.join(__dirname,'../../api/expert-match.js'),'utf8');
 const utils=require('../../lib/rag-utils.js');
 const supabaseFetch=async raw=>{
  queries.push(raw);if(fail)throw new Error('Fixture database unavailable');
  const url=new URL(raw,'https://fixture.invalid'),offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
  if(url.pathname.endsWith('/consultants'))return rows.filter(c=>c.is_active&&c.is_approved&&c.approval_status==='approved').slice(offset,offset+limit);
  if(url.pathname.endsWith('/profile_entries')){const ids=url.searchParams.get('profile_id').slice(4,-1).split(',');return portfolio.filter(e=>ids.includes(e.profile_id)).slice(offset,offset+limit);}
  throw new Error('Unexpected query');
 };
 vm.runInNewContext(source,{module,require:name=>name==='../lib/rag-utils'?{...utils,supabaseFetch}:name==='../lib/api-security'?{protect:fn=>fn}:require(name),console:{warn(){},error(){}},URL,Map,Set});
 async function request(goal,extra={}){
  let result;const res={setHeader(){},end(body){result=JSON.parse(body)},status(){return this}};
  await module.exports({method:'POST',body:{goal,mode:'adaptive_recommendations',...extra}},res);return result;
 }
 return {request,queries};
}
module.exports={makeHandler,consultants,entries,base};
