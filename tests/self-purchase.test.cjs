const test=require('node:test'),assert=require('node:assert/strict');
process.env.SUPABASE_URL='https://database.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
process.env.SUPABASE_ANON_KEY='fixture';
process.env.RAZORPAY_KEY_ID='fixture';process.env.RAZORPAY_KEY_SECRET='fixture';
const {assertNotSelfPurchase}=require('../lib/api-security');
async function call(api,body){
 let output;const res={statusCode:200,setHeader(){},writeHead(status){this.statusCode=status},end(text){output=JSON.parse(text)}};
 await require('../api/'+api)({method:'POST',body,headers:{authorization:'Bearer fixture'},socket:{remoteAddress:'127.0.0.1'}},res);
 return {status:res.statusCode,body:output};
}
test('listing ownership blocks self-checkout at create, verify and reconciliation before payment calls',async()=>{
 const previous=global.fetch;const calls=[];let owner='seller';
 global.fetch=async(input,options={})=>{
  const url=new URL(input);calls.push(url.href);assert.equal(url.origin,'https://database.invalid','self-purchase must never reach Razorpay');
  let data=[];
  if(url.pathname.endsWith('/guidcy_rate_limit'))data=true;
  else if(url.pathname==='/auth/v1/user')data={id:'seller'};
  else if(url.pathname.endsWith('/consultants'))data=[{profile_id:owner}];
  else if(url.pathname.endsWith('/marketplace_notes'))data=[{uploader_id:owner}];
  else if(url.pathname.endsWith('/bookings'))data=[{id:'fixture',user_id:'seller',consultant_id:'expert',razorpay_order_id:'order_OLD',payment_verified:false}];
  else if(url.pathname.endsWith('/marketplace_orders'))data=[{id:'fixture',buyer_id:'seller',seller_id:'forged-other-seller',note_id:'note',razorpay_order_id:'order_OLD',payment_verified:false}];
  else if(url.pathname.endsWith('/profiles'))data=[{id:'seller',role:'user'}];
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 };
 try{
  for(const flow of ['booking','marketplace']){
   const body={flow,referenceId:'fixture'};
   const created=await call('create-order.js',body);assert.equal(created.status,403);assert.match(created.body.error,/yourself|your own resource/);
   const verified=await call('verify-payment.js',{...body,razorpay_order_id:'order_OLD',razorpay_payment_id:'pay_test',razorpay_signature:'fixture'});assert.equal(verified.status,403);
  }
  assert.equal((await call('verify-payment.js',{flow:'marketplace',referenceId:'fixture',reconcile:true})).status,403);
  await assert.rejects(assertNotSelfPurchase('booking',{consultant_id:'expert'},{id:'seller'}),/yourself/);
  await assert.rejects(assertNotSelfPurchase('marketplace',{note_id:'note'},{id:'seller'}),/own resource/);
  owner='other';
  await assertNotSelfPurchase('booking',{user_id:'seller',consultant_id:'expert'});
  await assertNotSelfPurchase('marketplace',{buyer_id:'seller',seller_id:'seller',note_id:'note'});
  await assertNotSelfPurchase('webinar',{});
  assert.ok(calls.length>0);
 }finally{global.fetch=previous}
});
