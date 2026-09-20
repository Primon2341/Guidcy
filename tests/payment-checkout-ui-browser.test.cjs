// Checkout UI and existing flow, using local SDK/HTTP fixtures; no real charges.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', 'public');
const harnessSource = fs.readFileSync(path.join(__dirname, 'browser-flow.test.cjs'), 'utf8');
const fakeMatch = harnessSource.match(/const fakeSupabase = `([\s\S]*?)`;\n\n\(async \(\) => \{/);
if (!fakeMatch) throw new Error('Could not load the shared browser Supabase harness.');
const fakeSupabase = fakeMatch[1];

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
};

function serve(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  let file = path.join(root, pathname.replace(/^\/+/, ''));
  if (pathname === '/') file = path.join(root, 'index.html');
  else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  else if (!fs.existsSync(file)) file = path.join(root, 'index.html');
  res.writeHead(200, {'content-type': mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}

async function waitForUrlTab(page, tab) {
  await page.waitForFunction(expected => new URLSearchParams(location.search).get('tab') === expected, tab, {timeout: 10000});
}

(async () => {
  const server = http.createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({headless: true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context = await browser.newContext({viewport: {width: 1365, height: 900}});
  const page = await context.newPage();
  const pageErrors = [];
 const consoleErrors = [];
 const apiFailures = [];
 const responseErrors = [];
 const dashboardAvatar = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Crect width=%22120%22 height=%22120%22 fill=%22%231E72BE%22/%3E%3Ccircle cx=%2260%22 cy=%2245%22 r=%2224%22 fill=%22white%22/%3E%3Cpath d=%22M20 115c6-31 25-45 40-45s34 14 40 45%22 fill=%22white%22/%3E%3C/svg%3E';

 try {
    await context.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.__guidcyPaymentEvents = [];
      window.__guidcyFailNextCalendar = false;
      const response = (data, status = 200) => new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
      });

      function restRows(table) {
        if (table === 'bookings') return window.__guidcyTestBookings || [];
        if (table === 'consultants') return [{id: 'test-expert', profile_id: 'expert-profile', name: 'Test Expert'}];
        if (table === 'profiles') {
          const rows = [
            {id: 'test-user', email: 'user@example.com', full_name: 'Test User', role: 'user'},
            {id: 'expert-profile', email: 'expert@example.com', full_name: 'Test Expert', role: 'consultant'},
          ];
          const active = window.__guidcyTestProfile;
          if (active && !rows.some(row => String(row.id) === String(active.id))) rows.push(active);
          return rows;
        }
        return [];
      }

      function filterRestRows(rows, requestUrl) {
        let filtered = rows.slice();
        requestUrl.searchParams.forEach((rawValue, field) => {
          if (['select', 'order', 'limit', 'offset'].includes(field) || field === 'or') return;
          if (rawValue.startsWith('eq.')) {
            const expected = rawValue.slice(3);
            filtered = filtered.filter(row => String(row && row[field]) === expected);
          } else if (rawValue.startsWith('in.(') && rawValue.endsWith(')')) {
            const expected = rawValue.slice(4, -1).split(',').map(String);
            filtered = filtered.filter(row => expected.includes(String(row && row[field])));
          }
        });
        const orFilter = requestUrl.searchParams.get('or');
        if (orFilter) {
          const clauses = orFilter.replace(/^\(|\)$/g, '').split(',').map(clause => {
            const match = clause.match(/^([^.]+)\.eq\.(.*)$/);
            return match && {field: match[1], value: match[2]};
          }).filter(Boolean);
          if (clauses.length) filtered = filtered.filter(row => clauses.some(clause => String(row && row[clause.field]) === clause.value));
        }
        const limit = Number(requestUrl.searchParams.get('limit'));
        return Number.isFinite(limit) && limit >= 0 ? filtered.slice(0, limit) : filtered;
      }

      window.fetch = async function(input, init) {
        const url = typeof input === 'string' ? input : input.url;
        const body = (() => { try { return JSON.parse(init && init.body || '{}'); } catch (_) { return {}; } })();

        if (/\/api\/create-order(?:\?|$)/.test(url)) {
          window.__guidcyPaymentEvents.push({type: 'create-order', bookingId: body.bookingId});
          return response({keyId: 'rzp_test_guidcy', order: {id: 'order_GUIDCYTEST123', amount: Math.round(Number((window.__guidcyTestBookings||[]).find(row=>row.id===body.bookingId)?.total_amount||0)*100), currency: 'INR'}});
        }
        if (/\/api\/verify-payment(?:\?|$)/.test(url)) {
          window.__guidcyPaymentEvents.push({type: 'verify-payment', bookingId: body.bookingId});
          if(window.__verifyFail)return response({error:'Verification rejected'},400);
          const row = (window.__guidcyTestBookings || []).find(item => String(item.id) === String(body.bookingId));
          if (row) Object.assign(row, {
            status: 'confirmed',
            payment_status: 'success',
            payment_verified: true,
            payment_id: body.razorpay_payment_id,
            razorpay_payment_id: body.razorpay_payment_id,
            razorpay_order_id: body.razorpay_order_id,
            paid_at: new Date().toISOString(),
          });
          return response({ok: true, verified: true, booking: Object.assign({}, row || {id: body.bookingId}, {
            status: 'confirmed', payment_status: 'success', payment_verified: true,
          })});
        }
        if (/googleapis\.com\/calendar\/v3\/calendars\/primary\/events/.test(url)) {
          if (window.__guidcyFailNextCalendar) {
            window.__guidcyFailNextCalendar = false;
            window.__guidcyPaymentEvents.push({type: 'calendar-failed'});
            return response({error: {message: 'simulated Calendar failure'}}, 500);
          }
          window.__guidcyPaymentEvents.push({type: 'calendar-created'});
          return response({conferenceData: {entryPoints: [{entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij'}]}});
        }
        if (/\/api\/send-guidcy-email(?:\?|$)/.test(url)) {
          const booking = body.booking || body.data || {};
          window.__guidcyPaymentEvents.push({type: 'email', meetLink: booking.meet_link || ''});
          const id = body.bookingId || booking.id || body.relatedId;
          const row = (window.__guidcyTestBookings || []).find(item => String(item.id) === String(id));
          if (row) Object.assign(row, {user_email_sent: true, consultant_email_sent: true});
          return response({ok: true, user: {sent: true}, consultant: {sent: true}});
        }
        const requestUrl = new URL(url, location.href);
        if (requestUrl.hostname.endsWith('.supabase.co') && requestUrl.pathname.startsWith('/rest/v1/')) {
          const table = decodeURIComponent(requestUrl.pathname.slice('/rest/v1/'.length));
          const method = String(init && init.method || 'GET').toUpperCase();
          const sourceRows = restRows(table);
          const matchingRows = filterRestRows(sourceRows, requestUrl);
          if (method === 'GET' || method === 'HEAD') return response(method === 'HEAD' ? null : matchingRows);
          if (method === 'PATCH') {
            matchingRows.forEach(row => Object.assign(row, body));
            return response(matchingRows);
          }
          if (method === 'POST') {
            const inserted = (Array.isArray(body) ? body : [body]).map((row, index) => Object.assign({
              id: `${table}-rest-test-${sourceRows.length + index + 1}`,
              created_at: new Date().toISOString(),
            }, row));
            if (table === 'bookings') sourceRows.push(...inserted);
            return response(inserted);
          }
          if (method === 'DELETE') {
            matchingRows.forEach(row => {
              const index = sourceRows.indexOf(row);
              if (index >= 0) sourceRows.splice(index, 1);
            });
            return response([]);
          }
          return response([]);
        }
        return nativeFetch(input, init);
      };
    });

    await context.route('**/assets/vendor/supabase.js*', route => route.fulfill({status: 200, contentType: 'text/javascript', body: fakeSupabase}));
    await context.route('https://api.tavily.com/search', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({results:[]})}));
    await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `(function(){window.google={accounts:{oauth2:{initTokenClient:function(config){return {callback:config.callback,requestAccessToken:function(){window.__guidcyPaymentEvents.push({type:'google-authorized'});var self=this;setTimeout(function(){self.callback({access_token:'guidcy-test-token'})},0)}}}}}}})();`,
    }));
    await context.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `(function(){window.Razorpay=function(options){this.options=options;var handlers={};this.on=function(name,handler){handlers[name]=handler};this.open=function(){var mode=window.__guidcyRazorpayMode||'success';window.__guidcyPaymentEvents.push({type:'razorpay-opened',mode:mode,activePages:Array.from(document.querySelectorAll('.page.on,.page.active')).map(function(page){return page.id})});setTimeout(function(){if(mode==='cancel'){if(options.modal&&options.modal.ondismiss)options.modal.ondismiss();return}if(mode==='failed'){if(handlers['payment.failed'])handlers['payment.failed']({error:{description:'Simulated payment failure'}});return}options.handler({razorpay_order_id:options.order_id,razorpay_payment_id:'pay_GUIDCYTEST123',razorpay_signature:'test-signature'})},0)}}})();`,
    }));

  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) responseErrors.push({status: response.status(), url: response.url()}); });
    page.on('requestfailed', request => {
      if (request.url().startsWith(origin) && /\/api\//.test(request.url())) apiFailures.push(request.url());
    });


    await page.goto(`${origin}/consultant/test-expert`, {waitUntil:'domcontentloaded'});
    await page.waitForSelector('#page-profile.on .profile-name');
    await page.locator('.avail-slot').first().click();
    await page.getByRole('button',{name:'Book this session'}).click();
    await page.waitForSelector('#page-payment.on .pay-consultant');
    assert.equal(await page.locator('#page-payment h1').innerText(),'Complete your payment');
    assert.match(await page.locator('.pay-consultant h3').innerText(),/Test Expert/);
    assert.equal(await page.locator('.pay-session-fields dd').last().innerText(),'60 minutes');
    for(const width of [1365,390]){
      await page.setViewportSize({width,height:900});
      await page.reload();await page.waitForSelector('#page-payment.on .pay-consultant');
      await page.evaluate(()=>window.__sameCheckoutDocument=true);
      await page.locator('#page-payment .pay-back').click();
      await page.waitForURL(/\/consultant\/test-expert$/);
      await page.waitForSelector('#page-profile.on .profile-name');
      assert.ok(await page.evaluate(()=>window.__sameCheckoutDocument),'profile return stays in the SPA');
      await page.goBack();await page.waitForSelector('#page-payment.on .pay-consultant');
      await page.goForward();await page.waitForSelector('#page-profile.on .profile-name');
      await page.goBack();await page.waitForSelector('#page-payment.on .pay-consultant');
    }
    // The prior document is unrelated: the stored booking owns the target.
    await page.evaluate(()=>window.guidcyNavigate('/browse'));
    await page.goto(origin+'/payment');await page.waitForSelector('#page-payment.on .pay-consultant');
    await page.locator('#page-payment .pay-back').click();
    await page.waitForURL(/\/consultant\/test-expert$/);
    await page.goBack();await page.waitForSelector('#page-payment.on .pay-consultant');
    await page.setViewportSize({width:1365,height:900});
    const before=await page.evaluate(()=>window.renderPaymentSummaryWithLatest());
    assert.equal(await page.locator('.pay-sum-row.final span').last().innerText(),'₹'+before.totalAmount.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}));
    await page.evaluate(()=>window.__checkoutNav=document.querySelector('#nav-right').firstElementChild);
    for(const width of [1365,1058,820,390,320]){
      await page.setViewportSize({width,height:900});
      const layout=await page.evaluate(()=>{
        const l=document.querySelector('.pay-checkout').getBoundingClientRect();
        return {left:l.toJSON(),scroll:document.documentElement.scrollWidth,viewport:innerWidth};
      });
      assert.ok(layout.scroll<=layout.viewport+1,'no horizontal overflow at '+width);
      assert.equal(await page.locator('#page-payment .pay-method-row').isVisible(),false,'legacy payment controls remain hidden at '+width);
      const targets=await page.locator('#page-payment .green-btn,.guidcy-promo-row button,.guidcy-promo-row input').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
      assert.ok(targets.every(height=>height>=44),'checkout controls retain usable tap targets at '+width);
      if(width===1365)assert.ok(layout.left.height<900,'desktop checkout stays compact');
      assert.equal(await page.locator('.pay-overview').count(),0,'duplicate overview card removed');
      assert.ok(layout.left.width<=680,'single checkout stays compact');
      assert.ok(Math.abs(layout.left.left-(layout.viewport-layout.left.right))<=2,'checkout centered');
      await page.locator('#page-payment .pay-wrap').screenshot({path:'/private/tmp/guidcy-checkout-'+width+'.png'});
    }
    await page.setViewportSize({width:1365,height:900});
    await page.locator('#guidcy-promo-code').fill('NOTVALID');
    await page.locator('.guidcy-promo-row button').click();
    await page.locator('#guidcy-promo-note.err').waitFor();
    assert.equal(await page.evaluate(()=>window.renderPaymentSummaryWithLatest().totalAmount),before.totalAmount);
    await page.evaluate(()=>localStorage.setItem('guidcy_admin_promo_codes_v1',JSON.stringify([{code:'UITEST',type:'fixed',value:37,active:true}])));
    await page.locator('#guidcy-promo-code').fill('UITEST');
    await page.locator('.guidcy-promo-row button').click();
    await page.locator('#guidcy-promo-note.ok').waitFor();
    const discounted=await page.evaluate(()=>window.renderPaymentSummaryWithLatest());
    assert.equal(discounted.discount,37);
    assert.equal(discounted.totalAmount,Math.round((before.baseFee-37)*1.05*100)/100);
    assert.equal(await page.locator('.pay-sum-row.final span').last().innerText(),new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(discounted.totalAmount));
    assert.ok(await page.evaluate(()=>window.__checkoutNav===document.querySelector('#nav-right').firstElementChild));
    await page.reload();await page.waitForSelector('#page-payment.on .pay-consultant');
    assert.equal(await page.locator('#guidcy-promo-code').inputValue(),'UITEST','promo and booking restore on refresh');
    await page.evaluate(()=>{window.__guidcyRazorpayMode='success';window.__guidcyFailNextCalendar=false});
    await page.locator('#page-payment .green-btn').click();
    await page.waitForFunction(()=>window.lastBooking?.payment_verified&&window.lastBooking?.meet_link);
    await page.waitForFunction(()=>window.__guidcyPaymentEvents.some(e=>e.type==='email'));
    const result=await page.evaluate(()=>({booking:window.lastBooking,events:window.__guidcyPaymentEvents,confirmed:[...document.querySelectorAll('#page-payment .step-circle')].every(n=>n.classList.contains('done'))}));
    const index=type=>result.events.findIndex(e=>e.type===type);
    assert.ok(index('create-order')>=0&&index('razorpay-opened')>index('create-order')&&index('verify-payment')>index('razorpay-opened'));
    assert.ok(index('calendar-created')>index('verify-payment')&&index('email')>index('calendar-created'));
    assert.equal(result.booking.payment_verified,true);assert.ok(result.confirmed);
    assert.equal(result.booking.total_amount,discounted.totalAmount);
    assert.equal(result.booking.meet_link,'https://meet.google.com/abc-defg-hij');
    console.log('Slot → checkout → invalid/valid promo → refresh → Razorpay → verification → meeting → confirmation/email passed');
    for(const mode of ['cancel','failed','verify-failed']){
      await page.goto(`${origin}/consultant/test-expert`);await page.waitForSelector('#page-profile.on .profile-name');
      await page.locator('.avail-slot').first().click();await page.getByRole('button',{name:'Book this session'}).click();
      await page.waitForSelector('#page-payment.on .pay-consultant');
      await page.evaluate(mode=>{window.lastBooking=null;window.__guidcyRazorpayMode=mode==='verify-failed'?'success':mode;window.__verifyFail=mode==='verify-failed'},mode);
      await page.locator('#page-payment .green-btn').click();
      await page.waitForSelector('#guidcy-payment-status.'+(mode==='cancel'?'cancelled':'error'));
      assert.ok(await page.locator('#page-payment .green-btn').isEnabled());
      assert.equal(await page.evaluate(()=>!!window.lastBooking?.payment_verified),false);
    }
    assert.deepEqual(pageErrors,[]);
    console.log('Cancellation, checkout failure, rejected verification, dynamic values and 320–1365px layouts passed');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
