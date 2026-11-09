import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const section=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)));
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const key='guidcy_recent_confirmed_bookings_v3';

test('consultant loader preserves cancelled/refunded bookings with stale dispute review flags',async()=>{
 const cancelled={id:'cancelled-refunded',status:'cancelled',session_status:'cancelled',payment_status:'success',previous_status:'confirmed',admin_review_status:'pending_review',refund_status:'refunded',scheduled_at:'2099-09-30T12:30:00Z',cancellation_reason:'Booked by mistake'};
 const rows=[cancelled,
  {...cancelled,id:'cancelled-action-required',admin_review_status:'action_required'},
  {...cancelled,id:'session-cancelled',status:'confirmed'},
  {id:'active-session',status:'confirmed',session_status:'scheduled',payment_status:'success',scheduled_at:cancelled.scheduled_at},
  {id:'open-dispute',status:'disputed',session_status:'disputed',payment_status:'success',scheduled_at:cancelled.scheduled_at}];
 const disputeLookups=[],writes=[];
 const context=vm.createContext({window:{currentUser:{id:'consultant-user'},guidcyFormatINR:String},console,
  resolveConsultantProfile:async()=>({id:'consultant'}),asId:String,
  safeSelect:async()=>rows,uniqById:rows=>rows,fetchClientMap:async()=>new Map(),
  fetchDisputesForBookings:async ids=>{disputeLookups.push(...ids);return {'open-dispute':{id:'dispute'}}},
  fetchDisputeMessages:async()=>({}),updateBookingRequestBadge:()=>{},unreadRequestCount:()=>0,
  client:()=>({from:()=>({update:body=>({in:async(_,ids)=>{writes.push({body,ids});return {}}})})}),
  esc:String});
 vm.runInContext(section('  async function loadConsultantBookingsUnified(){','  async function fetchDisputesForBookings(ids){')+
  section('  function normalizeStatus(raw){','  function updateBookingRequestBadge')+
  section("  function money(n){n=Number(n||0);return n?window.guidcyFormatINR(n)",'  var requestsRenderToken=0;'),context);
 const loaded=await context.loadConsultantBookingsUnified();
 assert.deepEqual(Array.from(loaded.groups.cancelled,b=>b.id),['cancelled-refunded','cancelled-action-required','session-cancelled']);
 assert.deepEqual(Array.from(loaded.groups.upcoming,b=>b.id),['active-session']);
 assert.deepEqual(Array.from(loaded.groups.review,b=>b.id),['open-dispute']);
 assert.deepEqual(disputeLookups,['open-dispute'],'cancellations must bypass dispute restoration');
 assert.deepEqual(writes,[],'loading cancelled bookings must not try to rewrite their status');
 const booking=loaded.groups.cancelled[0];
 assert.equal(booking.status,'cancelled');
 assert.equal(booking.refund_status,'refunded');
 assert.equal(booking.payment_status,'success');
 assert.match(context.bookingCard(booking),/>Cancelled</);
 assert.doesNotMatch(context.bookingCard(booking),/Cancel Session|Scheduled/);
});

test('authoritative cancellation removes stale Upcoming fallback for either participant, preserving history and paid status',async()=>{
 for(const role of ['user','consultant']){
  const localStorage=storage(),sessionStorage=storage();
  const cached={id:'cancelled-session',status:'confirmed',session_status:'scheduled',payment_status:'success',payment_verified:true,remembered_at:new Date().toISOString()};
  const other={...cached,id:'active-session'};
  const cancelled={...cached,status:'cancelled',session_status:'cancelled',cancelled_by:role};
  for(const store of [localStorage,sessionStorage])store.setItem(key,JSON.stringify([cached,other]));
  const window={lastBooking:cached,fetch:async()=>new Response(JSON.stringify([cancelled]))};
  const context=vm.createContext({window,localStorage,sessionStorage,Headers,Response,Request,AbortController,DOMException,Map,Set,Promise,Date});
  vm.runInContext(section('/* === guidcy-supabase-request-dedupe ===','/* ─── SUPABASE INIT ─── */'),context);
  vm.runInContext(section('/* === guidcy-final-live-upcoming-refresh-fix === */','/* === guidcy-final-login-return-to-page-fix === */'),context);
  const rows=await (await window.fetch('https://fixture.supabase.co/rest/v1/bookings?select=*')).json();
  assert.equal(window.lastBooking,null,'last paid booking cannot resurrect the cancellation');
  for(const store of [localStorage,sessionStorage])assert.deepEqual(JSON.parse(store.getItem(key)).map(row=>row.id),['active-session']);
  assert.equal(rows[0].payment_status,'success','payment history is preserved');
  // The same authoritative row goes to consultant Cancelled and user history.
  vm.runInContext(section('  function classifyBookings(rows){','  function updateBookingRequestBadge'),context);
  assert.equal(context.classifyBookings(rows).cancelled.length,1);
  assert.equal(context.classifyBookings(rows).upcoming.length,0);
  vm.runInContext("function clean(v){return String(v||'').trim()}\n"+section('  function isHistorySession(b){','  function makeCal(b)'),context);
  assert.equal(context.isHistorySession(rows[0]),true);
 }
});
