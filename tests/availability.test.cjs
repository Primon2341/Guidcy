const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const A=require('../assets/js/availability');
const rule={enabled:true,days:[1,2,3,4,5],start:'18:00',end:'21:00',interval:60};
test('weekday hours, unavailable days, copy semantics and legacy conversion',()=>{
 const weekly={enabled:true,interval:60,weekly:Array.from({length:7},(_,i)=>i===0||i===6?{start:'10:00',end:'18:00'}:{start:'19:00',end:'22:00'})};
 assert.deepEqual(A.slots('2026-10-05',{},weekly),['7:00 PM','8:00 PM','9:00 PM']);
 assert.deepEqual(A.slots('2026-10-10',{},weekly),['10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM']);
 assert.deepEqual(A.slots('2026-10-11',{},weekly,90),['10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM']);
 weekly.weekly[3]=null;assert.deepEqual(A.slots('2026-10-07',{},weekly),[]);
 assert.deepEqual(A.slots('2026-10-07',{'2026-10-07':['9:00 AM']},weekly),['9:00 AM']);
 assert.deepEqual(A.slots('2026-10-10',{'2026-10-10':[]},weekly),[]);
 assert.deepEqual(A.slots('2029-01-06',{},weekly),['10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM']);
 const converted=A.weeklyRule(rule);assert.deepEqual(converted.weekly,[null,...Array.from({length:5},()=>({start:'18:00',end:'21:00'})),null]);
 converted.weekly[1].start='19:00';assert.equal(converted.weekly[2].start,'18:00');assert.equal(rule.start,'18:00');
 assert.deepEqual(A.resolve({}, {enabled:true,interval:60,weekly:Array(7).fill(null)}),{});
 for(const bad of [{...weekly,weekly:[]},{...weekly,weekly:null},{...weekly,interval:0},{...weekly,weekly:Array(7).fill({start:'22:00',end:'19:00'})},{...weekly,weekly:Array(7).fill({start:'10:00',end:'10:15'})},{...weekly,weekly:Array(7).fill({})}])assert.throws(()=>A.validate(bad));
});
test('recurrence, custom date, blocked date and reset are independent',()=>{
 const map={'2026-10-05':[],'2026-10-06':['10:00 AM']};
 assert.deepEqual(A.slots('2026-10-07',map,rule),['6:00 PM','7:00 PM','8:00 PM']);
 assert.deepEqual(A.slots('2026-10-05',map,rule),[]);
 assert.deepEqual(A.slots('2026-10-06',map,rule),['10:00 AM']);
 assert.deepEqual(A.slots('2026-10-10',map,rule),[]);
 delete map['2026-10-05'];assert.equal(A.slots('2026-10-05',map,rule).length,3);
 assert.deepEqual(A.slots('2026-10-06',map,{...rule,enabled:false}),['10:00 AM']);
});
test('full rolling year, IST boundary, leap day and duration limits',()=>{
 assert.equal(A.today(new Date('2026-12-31T19:00:00Z')),'2027-01-01');
 const map=A.resolve({},rule,new Date('2026-09-29T12:00:00Z'));
 assert.deepEqual(map['2027-09-29'],['6:00 PM','7:00 PM','8:00 PM']);assert.ok(Object.keys(map).length>250);
 assert.deepEqual(A.resolve({'2029-01-01':[]},rule,new Date('2026-09-29T12:00:00Z'),60,['2029-01'])['2029-01-02'],['6:00 PM','7:00 PM','8:00 PM']);
 assert.equal(A.resolve({'2029-01-01':[]},rule,new Date('2026-09-29T12:00:00Z'),60,['2029-01'])['2029-01-01'],undefined);
 assert.equal(A.date('2027-02-29'),null);assert.ok(A.date('2028-02-29'));
 assert.deepEqual(A.slots('2026-10-05',{},rule,90),['6:00 PM','7:00 PM']);
 assert.deepEqual(A.slots('2026-10-05',{}, {...rule,interval:30},30),['6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM']);
 for(const bad of [{...rule,days:[8]},{...rule,days:[]},{...rule,start:'21:00',end:'18:00'},{...rule,interval:0},{...rule,start:'25:00'}])assert.throws(()=>A.validate(bad));
});
test('existing booking dates resolve recurrence and never turn blocked days into fallback slots',()=>{
 const source=fs.readFileSync('assets/js/app.js','utf8');const functions=source.slice(source.indexOf('function guidcyISTClock('),source.indexOf('function makeGoogleCalendarLink('));
 const overrides={'2026-10-05':[],'2026-10-06':['10:00 AM']};
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-04T18:00:00Z']))}}
 const ctx={Date:Clock,Intl,window:{GuidcyAvailability:A},curCons:{availability_map:overrides,recurring_availability:rule},selDur:60};
 vm.runInNewContext(functions,ctx);const dates=vm.runInNewContext('buildDates()',ctx);
 assert.equal(dates[0].key,'2026-10-06');assert.ok(dates.length>250);
 assert.ok(dates.some(d=>d.key==='2027-09-29'));
 ctx.window.__guidcyBookingMonth='2029-01';
 assert.ok(vm.runInNewContext('buildDates()',ctx).some(d=>d.key==='2029-01-01'));
 ctx.window.__guidcyBookingMonth='';
 assert.deepEqual(ctx.curCons.availability_map,overrides,'raw blocked overrides survive repeat calculations');
 assert.deepEqual(Array.from(ctx.curCons.availabilityMap['2026-10-07']),['6:00 PM','7:00 PM','8:00 PM']);
 vm.runInNewContext('selDur=90;buildDates()',ctx);assert.deepEqual(Array.from(ctx.curCons.availabilityMap['2026-10-07']),['6:00 PM','7:00 PM']);
 ctx.curCons={availability_map:{'2026-10-06':['10:00 AM']},availabilityMap:{'2026-10-06':['10:00 AM']}};
 assert.equal(vm.runInNewContext('buildDates()',ctx)[0].key,'2026-10-06','legacy dated availability still works');
});
test('duration changes preserve the selected date when an earlier day loses its last slot',()=>{
 const source=fs.readFileSync('assets/js/app.js','utf8');
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-05T14:00:00Z']))}}
 const ctx={Date:Clock,Intl,console,document:{hidden:false,getElementById:id=>id==='page-profile'?{classList:{contains:()=>true}}:null},window:{GuidcyAvailability:A,__guidcySelectedDateKey:'2026-10-06',__guidcyBookingMonth:'2026-10'},curCons:{availability_map:{},recurring_availability:rule},selDur:60,selDate:1,selSlot:'6:00 PM'};
 vm.runInNewContext(source.slice(source.indexOf('function guidcyISTClock('),source.indexOf('function makeGoogleCalendarLink(')),ctx);
 vm.runInNewContext(source.slice(source.indexOf('function guidcyRefreshVisibleAvailability('),source.indexOf('if(!window.__guidcyAvailabilityClock)')),ctx);
 assert.equal(vm.runInNewContext('buildDates()[selDate].key',ctx),'2026-10-06');
 vm.runInNewContext('selDur=90;guidcyRefreshVisibleAvailability()',ctx);
 assert.equal(ctx.selDate,0);assert.equal(ctx.selSlot,'6:00 PM');assert.equal(vm.runInNewContext('buildDates()[selDate].key',ctx),'2026-10-06');
 ctx.window.__guidcySelectedDateKey='2026-10-05';ctx.selSlot='8:00 PM';
 vm.runInNewContext('guidcyRefreshVisibleAvailability()',ctx);
 assert.equal(ctx.selDate,-1);assert.equal(ctx.selSlot,null,'an unavailable date never shifts a booking to another day');
});
