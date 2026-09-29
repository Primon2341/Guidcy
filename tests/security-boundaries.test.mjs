import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
process.env.SUPABASE_URL='https://database.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';
process.env.SUPABASE_ANON_KEY='fixture-anon';
process.env.RAZORPAY_KEY_ID='fixture-razorpay';
process.env.RAZORPAY_KEY_SECRET='fixture-secret';
const security=require('../lib/api-security');
const {authorizeEmail}=require('../lib/email-authorization');
async function call(module,body,token){
 let output='';const headers={};
 const res={statusCode:200,setHeader(k,v){headers[k]=v},writeHead(status,h){this.statusCode=status;Object.assign(headers,h)},end(s){output=s}};
 await require(module)({method:'POST',body,headers:token?{authorization:'Bearer '+token}:{},socket:{remoteAddress:'127.0.0.1'}},res);
 return {status:res.statusCode,body:JSON.parse(output),headers};
}
test('payment, mail, reset and rate-limit trust boundaries',async()=>{
 const previous=global.fetch;let calls=[];let allow=true;
 global.fetch=async(input,options={})=>{
   const url=new URL(input);calls.push({url:url.href,options});
   assert.equal(url.origin,'https://database.invalid','no credentials sent to caller-supplied hosts');
   let data=[];let status=200;
   if(url.pathname.endsWith('/guidcy_rate_limit'))data=allow;
   else if(url.pathname==='/auth/v1/user')data={id:'alice',email:'alice@example.com',email_confirmed_at:'2026-01-01'};
   else if(url.pathname.endsWith('/profiles'))data=[{id:'alice',role:'user',email:'alice@example.com'}];
   else if(url.pathname.endsWith('/marketplace_orders'))data=[{id:'order-1',buyer_id:'bob',buyer_email:'bob@example.com',download_granted:true,payment_verified:true,payment_status:'success'}];
   else if(url.pathname.endsWith('/bookings'))data=[{id:'booking-1',user_id:'alice',user_email:'alice@example.com',consultant_id:'consultant-1',payment_status:'success',payment_verified:true}];
   else if(url.pathname.endsWith('/consultants'))data=[{id:'consultant-1',profile_id:'expert'}];
   else {status=400;data={error:'not found'}}
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 };
 try{
   assert.equal((await call('../api/create-order.js',{flow:'marketplace',orderId:'order-1'})).status,401);
   assert.equal((await call('../api/create-order.js',{flow:'marketplace',orderId:'order-1'},'alice')).status,403);
   assert.equal((await call('../api/verify-payment.js',{flow:'marketplace',orderId:'order-1',razorpay_order_id:'order_RZ',razorpay_payment_id:'pay_RZ',razorpay_signature:'invalid'},'alice')).status,403);
   const denied=await call('../api/send-guidcy-email.js',{type:'admin_referral_code',supabase_url:'https://attacker.invalid',supabase_key:'fake'},'alice');
   assert.equal(denied.status,403);
   const event=await authorizeEmail({headers:{authorization:'Bearer alice'}},{type:'booking_confirmed_user',bookingId:'booking-1',to:'attacker@example.com',data:{action_link:'javascript:alert(1)'}});
   assert.equal(event.to,'alice@example.com');assert.equal(event.data.action_link,'https://www.guidcy.com/dashboard');
   assert.equal(security.safeRedirect('https://attacker.vercel.app/login'),'https://www.guidcy.com/login');
   assert.equal(security.safeRedirect('javascript:alert(1)'),'https://www.guidcy.com/login');
   assert.equal(security.safeRedirect('/reset-password'),'https://www.guidcy.com/reset-password');
   allow=false;
   assert.equal((await call('../api/create-order.js',{flow:'marketplace',orderId:'order-1'},'alice')).status,429);
   assert.equal(calls.filter(c=>/razorpay|resend/.test(new URL(c.url).hostname)).length,0);
 }finally{global.fetch=previous}
});
test('SPA transport preserves requests, masks directory reads and authenticates API calls',async()=>{
 let seen=[];const window={fetch:async request=>{seen.push(request);return new Response('[]')},sb:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-user'}}})}}};
 vm.runInNewContext(readFileSync(new URL('../assets/js/security-client.js',import.meta.url),'utf8'),{window,location:{href:'https://www.guidcy.com/',origin:'https://www.guidcy.com'},URL,Request,Headers,Promise});
 await window.fetch('https://lsthngfxehayeqyctkla.supabase.co/rest/v1/consultants?select=name');
 assert.match(seen.at(-1).url,/guidcy_consultants\?select=name/);
 await window.fetch('/api/create-order',{method:'POST',body:JSON.stringify({orderId:'one'}),headers:{'Content-Type':'application/json'}});
 assert.equal(seen.at(-1).headers.get('authorization'),'Bearer fixture-user');assert.equal(await seen.at(-1).text(),'{"orderId":"one"}');
 assert.equal(window.guidcyEscapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});

test('consultant support mailbox never grants admin access through email fallbacks',async()=>{
 const previous=global.fetch,previousAdminEmail=process.env.ADMIN_EMAIL;
 process.env.ADMIN_EMAIL='guidcytechnologies@gmail.com';
 const user={id:'consultant-account',email:'guidcytechnologies@gmail.com',email_confirmed_at:'2026-01-01'};
 global.fetch=async(input,options={})=>{
  const url=new URL(input);
  assert.equal(url.origin,'https://database.invalid');
  assert.equal(options.method||'GET','GET','denied consultant must not issue a write or refund');
  let data=[];
  if(url.pathname==='/auth/v1/user')data=user;
  else if(url.pathname.endsWith('/profiles'))data=[{...user,role:'consultant'}];
  else if(url.pathname.endsWith('/bookings'))data=[{id:'other-booking',user_id:'another-user',consultant_id:'another-consultant'}];
  else if(url.pathname.endsWith('/consultants'))data=[{id:'another-consultant',profile_id:'another-expert'}];
  return new Response(JSON.stringify(data),{status:200});
 };
 try{
  assert.equal(await security.isAdmin(user),false);
  assert.equal(await require('../lib/razorpay-utils').canReconcileMarketplaceOrder(user,{buyer_id:'another-user',buyer_email:'other@example.com'}),false);
  const req={headers:{authorization:'Bearer consultant'}};
  await assert.rejects(require('../lib/booking-refund').refundBookingRequest(req,{bookingId:'other-booking'}),error=>error.status===403);
  await assert.rejects(require('../lib/booking-cancellation').cancelBookingRequest(req,{bookingId:'other-booking',role:'admin'}),error=>error.status===403);
  await assert.rejects(authorizeEmail(req,{type:'admin_referral_code'}),error=>error.status===403);
 }finally{
  global.fetch=previous;
  if(previousAdminEmail===undefined)delete process.env.ADMIN_EMAIL;else process.env.ADMIN_EMAIL=previousAdminEmail;
 }
});
