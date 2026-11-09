const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'browser-flow.test.cjs'),'utf8'),start=source.indexOf('const fakeSupabase =');
const fixture=vm.runInNewContext(source.slice(start,source.indexOf('\n(async',start))+'\nfakeSupabase')
 .replace("rpc:function(){return Promise.resolve({data:[],error:null})}", "rpc:function(name,args){return Promise.resolve({data:name==='community_profile'?{id:consultant.profile_id,name:consultant.name,headline:consultant.specialty,consultant_id:consultant.id,expertise:[],followers:0,following:0}:[],error:null})}")
 .replace("if(table==='consultants')return [consultant,", "if(table==='consultants'){Object.assign(consultant,JSON.parse(localStorage.getItem('__availability')||'{}'));} if(table==='consultants')return [consultant,")
 .replace("q.eq=function(field,value){filters.push(function(row){return String(row&&row[field])===String(value)});return q};", "q.eq=function(field,value){filters.push(function(row){return (typeof row?.[field]==='object'&&row?.[field]!==null?JSON.stringify(row[field]):String(row?.[field]))===String(value)});return q};q.is=function(field,value){filters.push(row=>row[field]==null&&value===null);return q};")
 .replace("if(mutation==='update')out.forEach(function(row){Object.assign(row,mutationValue)});", "if(mutation==='update')out.forEach(function(row){Object.assign(row,mutationValue);if(table==='consultants')localStorage.setItem('__availability',JSON.stringify(row))});");
const fixtureWithErrors=fixture.replace("out=mutationValue;","if(table==='bookings')window.__availabilityBooking=mutationValue[0];out=mutationValue;").replace("q.single=function(){return Promise.resolve({data:result()[0]||null,error:null})};","q.single=function(){return Promise.resolve(mutation==='update'&&table==='consultants'&&window.__denyAvailability?{data:null,error:{message:'Save denied'}}:{data:result()[0]||null,error:null})};");
const root=path.resolve(__dirname,'../public');
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))file=path.join(root,'index.html');res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(()=>{
   if(!localStorage.getItem('__availability'))localStorage.setItem('__availability',JSON.stringify({recurring_availability:{enabled:false,days:[1,2,3,4,5],start:'18:00',end:'21:00',interval:60}}));
   if(localStorage.getItem('__availabilityViewer')!=='customer'){window.__guidcyTestAuthUser={id:'expert-profile',email:'expert@example.com',user_metadata:{full_name:'Test Expert',role:'consultant'}};
   window.__guidcyTestProfile={id:'expert-profile',email:'expert@example.com',full_name:'Test Expert',role:'consultant'};}
   localStorage.setItem('guidcy_cookie_consent_v1',JSON.stringify({version:1,analytics:false,savedAt:Date.now()}));
  });
  await context.route('**/*',route=>{const url=route.request().url();if(url.includes('/assets/vendor/supabase.js'))return route.fulfill({contentType:'text/javascript',body:fixtureWithErrors});if(url==='https://checkout.razorpay.com/v1/checkout.js')return route.fulfill({contentType:'text/javascript',body:"window.Razorpay=function(options){this.on=function(){};this.open=function(){window.__availabilityCheckout=options}};"});if(url.includes('/api/create-order'))return route.fulfill({json:{keyId:'rzp_test_fixture',order:{id:'order_AVAILABILITY',amount:183750,currency:'INR'}}});if(!url.startsWith(origin)||url.includes('/api/'))return route.abort();return route.continue()});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/consultant-dashboard?tab=schedule');await page.locator('#recurring-enabled').waitFor();
  await page.locator('#recurring-enabled').check();
  const nextYear=await page.evaluate(()=>Number(window.GuidcyAvailability.today().slice(0,4))+1);
  await page.locator('#availability-year').fill(String(nextYear));await page.locator('#availability-year').dispatchEvent('change');
  for(let month=0;month<12;month++){await page.locator('#availability-month').selectOption(String(month));assert.equal(await page.locator('.avail-date-card').count(),new Date(Date.UTC(nextYear,month+1,0)).getUTCDate());}
  await page.locator('#availability-month').selectOption('0');
  const [blocked,custom]=await page.locator('.avail-date-card.has-slots').evaluateAll(nodes=>nodes.slice(0,2).map(n=>n.dataset.date));
  await page.locator('[data-date="'+blocked+'"]').click();await page.getByRole('button',{name:'Block date',exact:true}).click();
  assert.match(await page.locator('[data-date="'+blocked+'"]').innerText(),/Blocked/);
  await page.getByRole('button',{name:'Use recurring schedule',exact:true}).click();assert.match(await page.locator('[data-date="'+blocked+'"]').innerText(),/Recurring/);
  await page.getByRole('button',{name:'Block date',exact:true}).click();
  await page.locator('[data-date="'+custom+'"]').click();await page.getByRole('button',{name:'6:00 PM',exact:true}).click();
  assert.match(await page.locator('[data-date="'+custom+'"]').innerText(),/Custom/);
  await page.locator('#price-video').fill('1250');
  await page.evaluate(()=>window.swCD('schedule',null));assert.equal(await page.locator('#availability-year').inputValue(),String(nextYear));assert.match(await page.locator('[data-date="'+blocked+'"]').innerText(),/Blocked/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.screenshot({path:'/private/tmp/guidcy-availability-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Save Availability & Pricing',exact:true}).click();
  await page.locator('#availability-status').filter({hasText:'Availability and pricing saved.'}).waitFor();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('__availability')));
  assert.equal(saved.rate,1250);assert.equal(saved.price,1250,'availability saves the same rate for expert cards and booking');
  assert.deepEqual(saved.availability_map[blocked],[]);assert.deepEqual(saved.availability_map[custom],['7:00 PM','8:00 PM']);assert.equal(saved.recurring_availability.enabled,true);assert.equal(saved.video_price,1250);assert.deepEqual(saved.session_types,['video']);
  await page.reload();await page.locator('#recurring-enabled').waitFor();assert.equal(await page.locator('#recurring-enabled').isChecked(),true);
  assert.equal(await page.locator('#price-video').inputValue(),'1250');
  await page.locator('#recurring-end-1').fill('17:00');await page.locator('#recurring-end-1').dispatchEvent('change');await page.getByRole('button',{name:'Save Availability & Pricing',exact:true}).click();
  await page.locator('#availability-status').filter({hasText:'end time after'}).waitFor();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('__availability'))),saved);
  await page.locator('#recurring-end-1').fill('22:00');await page.locator('#recurring-end-1').dispatchEvent('change');
  await page.evaluate(()=>{window.__denyAvailability=true});await page.getByRole('button',{name:'Save Availability & Pricing',exact:true}).click();await page.locator('#availability-status').filter({hasText:'Save denied'}).waitFor();assert.equal(await page.locator('#recurring-end-1').inputValue(),'22:00');
  await page.evaluate(()=>{window.__denyAvailability=false});
  await page.locator('#recurring-start-1').fill('19:00');
  await page.locator('.recurring-copy summary').click();
  async function copyHours(source,targets){
    await page.locator('#recurring-copy-source').selectOption(String(source));
    for(let i=0;i<7;i++)await page.locator('[name="recurring-copy-day"][value="'+i+'"]').setChecked(targets.includes(i));
    await page.getByRole('button',{name:'Apply to selected days',exact:true}).click();
  }
  await copyHours(1,[1,2,3,4,5]);
  await page.locator('#recurring-day-6').check();await page.locator('#recurring-start-6').fill('10:00');await page.locator('#recurring-end-6').fill('18:00');
  await copyHours(6,[0,6]);
  await page.locator('#recurring-day-3').uncheck();await copyHours(3,[2]);
  assert.equal(await page.locator('#recurring-start-2').isDisabled(),true,'copying unavailable status disables the target');
  await copyHours(1,[2]);
  assert.equal(await page.locator('#recurring-start-2').inputValue(),'19:00');
  assert.equal(await page.locator('#recurring-start-6').inputValue(),'10:00','copying weekdays leaves weekends unchanged');
  assert.equal(await page.locator('#recurring-end-0').inputValue(),'18:00');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'weekday editor has no horizontal overflow');
  await page.getByRole('button',{name:'Save Availability & Pricing',exact:true}).click();await page.locator('#availability-status').filter({hasText:'Availability and pricing saved.'}).waitFor();
  const weeklySaved=await page.evaluate(()=>JSON.parse(localStorage.getItem('__availability')));
  assert.deepEqual(weeklySaved.recurring_availability.weekly,[{start:'10:00',end:'18:00'},{start:'19:00',end:'22:00'},{start:'19:00',end:'22:00'},null,{start:'19:00',end:'22:00'},{start:'19:00',end:'22:00'},{start:'10:00',end:'18:00'}]);
  assert.deepEqual(weeklySaved.availability_map,saved.availability_map,'changing weekly hours preserves every date override');
  await page.reload();await page.locator('#recurring-day-3').waitFor();assert.equal(await page.locator('#recurring-day-3').isChecked(),false);assert.equal(await page.locator('#recurring-end-1').inputValue(),'22:00');assert.equal(await page.locator('#recurring-start-6').inputValue(),'10:00');
  await page.locator('#recurring-availability').screenshot({path:'/private/tmp/guidcy-weekday-editor-'+width+'.png'});
  const manual=nextYear+'-01-10';
  await page.evaluate(manual=>{const row=JSON.parse(localStorage.getItem('__availability'));row.availability_map[manual]=Array.from({length:48},(_,i)=>GuidcyAvailability.label(i*30));row.session_types=['audio','chat','video'];localStorage.setItem('__availability',JSON.stringify(row));},manual);
  // Consultants can inspect their own booking card and availability, including after reload.
  await page.goto(origin+'/consultant/test-expert');
  await page.locator('.gnet-profile-actions [data-action=edit-profile]').waitFor();
  await page.locator('.gnet-consultation .book-box').waitFor({state:'visible'});
  assert.equal(await page.locator('#gnet-booking-options').evaluate(el=>el.open),true);
  await page.reload();await page.locator('.gnet-consultation .book-box').waitFor({state:'visible'});
  assert.equal(await page.locator('.gnet-consultation').evaluate(el=>el.hidden),false);
  assert.equal(await page.locator('.gnet-consultation [data-action=book]').isDisabled(),true);
  assert.equal(await page.locator('.book-footer .green-btn').isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.startBooking()),'own_session');
  assert.equal(await page.evaluate(()=>!!window.__availabilityBooking||!!window.__availabilityCheckout),false);
  assert.match(page.url(),/consultant\/test-expert/);
  // Public profile resolves the persisted weekly rule into the existing date/slot UI.
  await page.evaluate(()=>localStorage.setItem('__availabilityViewer','customer'));await page.goto(origin+'/consultant/test-expert');await page.locator('.gnet-profile-actions [data-action=book]').click();await page.locator('#profile-layout .date-btn').first().waitFor();
  const availability=await page.evaluate(({blocked,custom})=>({dates:buildDates(),map:curCons.availabilityMap,blocked:window.GuidcyAvailability.slots(blocked,curCons.availability_map,curCons.recurring_availability),custom:window.GuidcyAvailability.slots(custom,curCons.availability_map,curCons.recurring_availability)}),{blocked,custom});
  assert.ok(availability.dates.length>250);assert.deepEqual(availability.blocked,[]);assert.deepEqual(availability.custom,['7:00 PM','8:00 PM']);
  assert.ok(Object.keys(availability.map).some(k=>k.startsWith(String(nextYear))),'booking model contains next-year availability');
  assert.equal(await page.locator('#profile-layout .stype-btn').count(),0);
  assert.match(await page.locator('#profile-layout .book-header').innerText(),/Video Session/i);
  assert.doesNotMatch(await page.locator('#profile-layout .book-box').innerText(),/Audio|Message|Select Session Type/);
  assert.equal(await page.evaluate(()=>selSType),'video');
  async function goToMonth(target){
    for(let i=0;i<36;i++){const month=await page.evaluate(()=>window.__guidcyBookingMonth);if(month===target)return;await page.getByRole('button',{name:month<target?'Next booking month':'Previous booking month',exact:true}).click();}
    assert.fail('Month navigation did not reach '+target);
  }
  await goToMonth(nextYear+'-01');
  const weekDates=await page.locator('[data-booking-date]').evaluateAll(nodes=>Object.fromEntries([0,3,6].map(day=>[day,nodes.map(n=>n.dataset.bookingDate).find(key=>new Date(key+'T00:00:00Z').getUTCDay()===day)])));
  assert.equal(await page.locator('[data-booking-date="'+weekDates[3]+'"]').isDisabled(),true,'unavailable Wednesday is not bookable');
  for(const day of [0,6]){
    await page.locator('[data-booking-date="'+weekDates[day]+'"]').click();
    assert.deepEqual(await page.locator('#avail-slots-container .avail-slot').allTextContents(),['10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM']);
  }
  assert.equal(await page.locator('[data-booking-date="'+blocked+'"]').isDisabled(),true);
  await page.locator('[data-booking-date="'+custom+'"]').click();
  assert.deepEqual(await page.locator('#avail-slots-container .avail-slot').allTextContents(),['7:00 PM','8:00 PM']);
  await page.getByRole('button',{name:'7:00 PM',exact:true}).click();
  await page.getByRole('button',{name:'Next booking month',exact:true}).click();
  assert.equal(await page.evaluate(()=>selSlot),null,'month change clears the old slot');
  await goToMonth(nextYear+'-01');await page.locator('[data-booking-date="'+manual+'"]').click();
  assert.equal(await page.locator('#avail-slots-container .avail-slot').count(),48);
  const scroll=await page.locator('#avail-slots-container').evaluate(el=>{el.scrollTop=150;return {height:el.clientHeight,total:el.scrollHeight,top:el.scrollTop}});
  assert.ok(scroll.height<=210&&scroll.total>scroll.height&&scroll.top>0,'many slots remain inside a scrollable list');
  // Recurring months beyond the rolling year are generated as they are viewed.
  await goToMonth((nextYear+1)+'-01');
  const farDate=await page.locator('#booking-calendar .date-btn:not(:disabled)').evaluateAll(nodes=>nodes.map(n=>n.dataset.bookingDate).find(key=>[1,2,4,5].includes(new Date(key+'T00:00:00Z').getUTCDay())));
  await page.locator('[data-booking-date="'+farDate+'"]').click();await page.getByRole('button',{name:'9:00 PM',exact:true}).click();
  await page.locator('#profile-layout .dur-btn').filter({hasText:'90 min'}).click();
  assert.equal(await page.evaluate(()=>selSlot),null,'overrunning recurring slot is cleared for a longer session');
  assert.equal(await page.evaluate(()=>window.__guidcySelectedDateKey),farDate);
  assert.deepEqual(await page.locator('#avail-slots-container .avail-slot').allTextContents(),['7:00 PM','8:00 PM']);
  await page.getByRole('button',{name:'7:00 PM',exact:true}).click();
  await page.evaluate(()=>guidcyRefreshVisibleAvailability());
  assert.equal(await page.evaluate(()=>buildDates()[selDate].key),farDate);
  assert.equal(await page.evaluate(()=>selSlot),'7:00 PM');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'profile has no horizontal overflow');
  await page.locator('#profile-layout .book-box').screenshot({path:'/private/tmp/guidcy-booking-calendar-'+width+'.png'});
  await page.getByRole('button',{name:'Book this session',exact:true}).click();await page.waitForURL('**/payment');
  await page.locator('.pay-session-fields').waitFor();
  let snapshot=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('guidcy_booking_price_lock_v3')));
  assert.equal(snapshot.dateKey,farDate);assert.equal(snapshot.sessionType,'video');assert.equal(snapshot.duration,90);assert.equal(snapshot.fee,1750);assert.equal(snapshot.totalAmount,1837.5);
  await page.reload();await page.locator('.pay-session-fields').waitFor();
  snapshot=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('guidcy_booking_price_lock_v3')));
  assert.equal(snapshot.dateKey,farDate);assert.equal(snapshot.timeSlot,'7:00 PM');assert.equal(snapshot.sessionType,'video');
  assert.equal(await page.evaluate(()=>buildDates()[selDate].key),farDate,'payment reload preserves a date beyond next year');
  await page.locator('#page-payment .green-btn').click();await page.waitForFunction(()=>!!window.__availabilityCheckout);
  const booking=await page.evaluate(()=>window.__availabilityBooking);
  assert.equal(booking.session_type,'video');assert.equal(booking.date_label,snapshot.dateLabel);assert.equal(booking.time_slot,'7:00 PM');assert.equal(booking.duration,90);assert.equal(booking.amount,1750);assert.equal(booking.total_amount,1837.5);
  await page.evaluate(()=>window.__availabilityCheckout.modal.ondismiss());await page.waitForFunction(()=>!window.__guidcyRazorpayBookingBusy);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS '+width+'px: weekday/weekend hours, bulk copy, unavailable weekdays, 12 months, block/custom/reset, save/reload, failed-save retention, video-only monthly booking, scrolling, duration boundaries and payment reload');await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
