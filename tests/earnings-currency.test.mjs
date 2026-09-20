import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const ctx={window:{},Intl,Date,Map,Set};vm.createContext(ctx);
function run(start,end){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),ctx)}
run('/* === guidcy-inr-formatting ===','/* === end guidcy-inr-formatting ===');
// Exercise the production payout predicate and payable function, not a replica.
const finance=source.slice(source.indexOf('/* === guidcy-supabase-truth-weekly-payouts ==='));
for(const name of ['lower','round2','paidBooking','bookingGross','bookingFee','bookingPayable']){
 const start=finance.indexOf('  function '+name+'(');let depth=0,end=finance.indexOf('{',start);
 depth=0;let opened=false;
 for(let i=finance.indexOf('{',start);i<finance.length;i++){if(finance[i]==='{'){depth++;opened=true}if(finance[i]==='}')depth--;if(opened&&depth===0){end=i+1;break}}
 vm.runInContext(finance.slice(start,end),ctx);
}
ctx.window.guidcyBookingIsPaidForPayout=ctx.paidBooking;ctx.window.guidcyBookingPayable=ctx.bookingPayable;
run('/* === guidcy-consultant-earnings-trend ===','/* === end guidcy-consultant-earnings-trend ===');
const base={id:'a',consultant_id:'c',payment_verified:true,payment_status:'success',status:'completed',session_status:'completed',payout_status:'pending',amount:1000,session_completed_at:'2026-09-12T10:00:00Z'};
test('INR formatting retains rupees, precision, grouping, zero and sign',()=>{
 const f=ctx.window.guidcyFormatINR;
 for(const [input,expected] of [[499,'₹499'],[24.95,'₹24.95'],[523.95,'₹523.95'],[1.05,'₹1.05'],[0,'₹0'],[-24.95,'-₹24.95'],[-24.945,'-₹24.95'],[1234567.8,'₹12,34,567.80']])assert.equal(f(input),expected);
 assert.equal(f(499,{decimals:2}),'₹499.00');assert.equal(f('bad'),'—');
});
test('only eligible completed bookings count, once, for the booked consultant',()=>{
 const rows=[base,{...base,id:'stored',consultant_payout_amount:400},base,
 ...[{payment_verified:false},{payment_status:'pending'},{status:'cancelled'},{session_status:'disputed'},{payout_status:'not_eligible'},{consultant_id:'other'},{status:'confirmed'}].map((p,i)=>({...base,id:'excluded-'+i,...p}))];
 const months=ctx.guidcyEarningsMonths(rows,'c',new Date('2026-09-19'));
 assert.equal(months.length,12);assert.equal(months.at(-1).key,'2026-09');assert.equal(months.at(-1).amount,1250);
 assert.equal(months.reduce((s,m)=>s+m.amount,0),1250);
});
test('completion month uses IST and old records fall back to their creation month',()=>{
 const months=ctx.guidcyEarningsMonths([{...base,session_completed_at:'2026-08-31T20:00:00Z'},
 {...base,id:'old',session_completed_at:null,created_at:'2026-08-15T00:00:00Z'},
 {...base,id:'outside',session_completed_at:'2025-08-15T00:00:00Z'}],'c',new Date('2026-09-19'));
 assert.equal(months.at(-1).amount,850);assert.equal(months.at(-2).amount,850);
 assert.match(ctx.guidcyRenderEarningsTrend([],'c'),/No earnings data yet/);
 assert.doesNotMatch(ctx.guidcyRenderEarningsTrend([],'c'),/class="earnings-bar"/);
});

test('the trend exposes earned amounts as visible text, not only tooltips',()=>{
 const row={...base,session_completed_at:new Date().toISOString()};
 const html=ctx.guidcyRenderEarningsTrend([row],'c');
 assert.match(html,/<span>Earned in this period<\/span><strong>₹850<\/strong>/);
 assert.match(html,/class="earnings-value">₹850<\/span>/);
 assert.equal((html.match(/class="earnings-value"/g)||[]).length,12);
});
