const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/app.js'),'utf8');
const key=source.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)[0];
const db='https://lsthngfxehayeqyctkla.supabase.co';
const headers={apikey:key,Authorization:'Bearer '+key};
(async()=>{
 const home=await fetch('https://www.guidcy.com');assert.equal(home.status,200);
 assert.ok(home.headers.get('content-security-policy'));assert.equal(home.headers.get('x-content-type-options'),'nosniff');
 for(const table of ['profiles','consultants','webinar_registrations','support_tickets']){
   const response=await fetch(db+'/rest/v1/'+table+'?select=*&limit=1',{headers});
   assert.equal(response.status,200,table);assert.deepEqual(await response.json(),[],table+' must be private');
 }
 for(const [table,fields] of [['guidcy_profiles','email,phone,refund_account_number'],['guidcy_consultants','bank_account,pan_number,account_number'],['guidcy_webinars','publisher_email,meet_link']]){
   const response=await fetch(db+'/rest/v1/'+table+'?select='+fields,{headers});assert.equal(response.status,200,table);
   const rows=await response.json();assert.ok(rows.length>0,table+' public rows remain visible');assert.ok(rows.every(r=>Object.values(r).every(v=>v===null)),table+' private fields masked');
 }
 for(const endpoint of ['create-order','verify-payment']){
   const response=await fetch('https://www.guidcy.com/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flow:'marketplace',orderId:'security-probe'})});
   assert.equal(response.status,401,endpoint+' anonymous denied');
 }
 const mail=await fetch(db+'/functions/v1/send-guidcy-email',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({type:'user_welcome',to:'nobody@example.invalid'})});
 assert.ok([401,403].includes(mail.status),'legacy email endpoint rejects anonymous events');
 const pdf=await fetch('https://www.guidcy.com/assets/vendor/pdf.mjs',{method:'HEAD'});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/javascript/);
 console.log('PASS: live headers, private tables, redacted directories, payment authentication, legacy email authorization and local PDF module.');
})().catch(error=>{console.error(error.message);process.exitCode=1});
