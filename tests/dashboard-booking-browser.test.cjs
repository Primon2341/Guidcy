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
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({viewport: {width: 1365, height: 900}});
  const page = await context.newPage();
  const pageErrors = [];
 const consoleErrors = [];
 const apiFailures = [];
 const responseErrors = [];
 const dashboardAvatar = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Crect width=%22120%22 height=%22120%22 fill=%22%231E72BE%22/%3E%3Ccircle cx=%2260%22 cy=%2245%22 r=%2224%22 fill=%22white%22/%3E%3Cpath d=%22M20 115c6-31 25-45 40-45s34 14 40 45%22 fill=%22white%22/%3E%3C/svg%3E';

 async function applyDashboardAvatar(role, avatarId) {
   await page.evaluate(({role, avatarUrl}) => {
     window.currentProfile = Object.assign({}, window.currentProfile || {}, {role, avatar_url: avatarUrl});
     window.__guidcyTestProfile = Object.assign({}, window.currentProfile);
     if (window.currentUser) {
       window.currentUser.user_metadata = Object.assign({}, window.currentUser.user_metadata || {}, {avatar_url: avatarUrl});
     }
     try { currentProfile = window.currentProfile; currentUser = window.currentUser; } catch (_) {}
     try { window.updateNav && window.updateNav(); } catch (_) {}
     const marker = document.createElement('span');
     marker.hidden = true;
     document.body.appendChild(marker);
     marker.remove();
   }, {role, avatarUrl: dashboardAvatar});
   await page.waitForFunction(id => {
     const avatar = document.getElementById(id);
     return !!(avatar && avatar.classList.contains('has-photo') && getComputedStyle(avatar).backgroundImage !== 'none');
   }, avatarId, {timeout: 10000});
 }

 async function assertDashboardLayout(pageId, avatarId, drawerRole, width) {
   await page.setViewportSize({width, height: 900});
   await page.waitForSelector(`#${pageId}.on`, {timeout: 10000});
   await page.waitForFunction(({pageId, desktop}) => {
     const root = document.getElementById(pageId);
     const toggle = root && root.querySelector('.dash-mobile-toggle');
     if (!toggle) return false;
   return desktop ? getComputedStyle(toggle).display === 'none' : getComputedStyle(toggle).display !== 'none';
   }, {pageId, desktop: width > 900}, {timeout: 10000});
   if (width <= 900) {
     await page.waitForFunction(id => {
       const side = document.querySelector(`#${id} .dash-side`);
       return !!(side && !side.classList.contains('on') && side.getBoundingClientRect().left <= -250);
     }, pageId, {timeout: 10000});
   }

   const closed = await page.evaluate(({pageId, avatarId}) => {
     const root = document.getElementById(pageId);
     const side = root.querySelector('.dash-side');
     const main = root.querySelector('.dash-main');
     const toggle = root.querySelector('.dash-mobile-toggle');
     const avatar = document.getElementById(avatarId);
     return {
       side: side.getBoundingClientRect().toJSON(),
       main: main.getBoundingClientRect().toJSON(),
       toggleDisplay: getComputedStyle(toggle).display,
       sidePosition: getComputedStyle(side).position,
       avatar: avatar.getBoundingClientRect().toJSON(),
       avatarBackground: getComputedStyle(avatar).backgroundImage,
       avatarPhoto: avatar.classList.contains('has-photo'),
       scrollWidth: document.documentElement.scrollWidth,
     };
   }, {pageId, avatarId});

   assert.ok(closed.scrollWidth <= width + 2, `${pageId} must not overflow at ${width}px`);
   assert.equal(closed.avatarPhoto, true);
   assert.notEqual(closed.avatarBackground, 'none');
   if (width > 900) {
     assert.equal(closed.toggleDisplay, 'none');
     assert.equal(closed.sidePosition, 'sticky');
     assert.ok(Math.abs(closed.side.width - 240) <= 1, `${pageId} desktop sidebar width`);
     assert.ok(Math.abs(closed.side.left) <= 1, `${pageId} desktop sidebar position`);
     assert.ok(closed.main.left >= closed.side.right - 1, `${pageId} desktop main follows sidebar`);
     assert.ok(closed.main.width >= width - 242, `${pageId} desktop main width`);
     assert.ok(closed.avatar.width >= 40 && closed.avatar.height >= 40, `${pageId} desktop avatar visibility ${JSON.stringify(closed.avatar)}`);
     return;
   }

   assert.notEqual(closed.toggleDisplay, 'none');
   assert.ok(closed.side.left <= -250, `${pageId} closed drawer must be off screen at ${width}px: ${JSON.stringify(closed.side)}`);
   assert.ok(Math.abs(closed.main.left) <= 1, `${pageId} mobile/tablet main starts at viewport edge`);
   assert.ok(closed.main.width >= width - 2, `${pageId} mobile/tablet main width`);
   await page.evaluate(id => {
     const root = document.getElementById(id);
     const side = root.querySelector('.dash-side');
     const overlay = root.querySelector('.dash-overlay');
     side.style.setProperty('transition', 'none', 'important');
     side.classList.add('on');
     if (overlay) overlay.classList.add('on');
   }, pageId);
   try {
     await page.waitForFunction(id => {
       const side = document.querySelector(`#${id} .dash-side.on`);
       return !!(side && Math.abs(side.getBoundingClientRect().left) <= 1);
     }, pageId, {timeout: 10000});
   } catch (error) {
     const state = await page.evaluate(id => {
       const side = document.querySelector(`#${id} .dash-side`);
       return side ? {className: side.className, rect: side.getBoundingClientRect().toJSON(), left: getComputedStyle(side).left, body: document.body.className} : null;
     }, pageId);
     throw new Error(`${pageId} drawer did not open at ${width}px: ${JSON.stringify(state)}`, {cause: error});
   }
   const openAvatar = await page.locator(`#${pageId} #${avatarId}`).evaluate(avatar => ({
     rect: avatar.getBoundingClientRect().toJSON(),
     display: getComputedStyle(avatar).display,
     background: getComputedStyle(avatar).backgroundImage,
   }));
   assert.notEqual(openAvatar.display, 'none');
   assert.notEqual(openAvatar.background, 'none');
   assert.ok(openAvatar.rect.width >= 40 && openAvatar.rect.height >= 40, `${pageId} drawer avatar visibility at ${width}px`);
   await page.evaluate(id => {
     const root = document.getElementById(id);
     const side = root.querySelector('.dash-side');
     const overlay = root.querySelector('.dash-overlay');
     side.classList.remove('on', 'open');
     if (overlay) overlay.classList.remove('on', 'open');
   }, pageId);
   await page.waitForFunction(id => {
     const side = document.querySelector(`#${id} .dash-side`);
     return !!(side && !side.classList.contains('on') && side.getBoundingClientRect().left <= -250);
   }, pageId, {timeout: 5000});
   await page.evaluate(id => document.querySelector(`#${id} .dash-side`).style.removeProperty('transition'), pageId);
 }

 try {
    await context.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.__guidcyPaymentEvents = [];
      window.__guidcyFailNextCalendar = true;
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
          return response({keyId: 'rzp_test_guidcy', order: {id: 'order_GUIDCYTEST123', amount: 105000, currency: 'INR'}});
        }
        if (/\/api\/verify-payment(?:\?|$)/.test(url)) {
          window.__guidcyPaymentEvents.push({type: 'verify-payment', bookingId: body.bookingId});
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

    await page.goto(`${origin}/consultant/test-expert`, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#page-profile.on .profile-name', {timeout: 15000});
    await page.locator('.avail-slot').first().click();
    await page.getByRole('button', {name: /Book this session/i}).click();
    await page.waitForSelector('#page-payment.on', {timeout: 10000});
assert.equal(new URL(page.url()).pathname, '/payment');
assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('.page.on,.page.active')).map(page => page.id)), ['page-payment']);
await page.evaluate(() => { window.__guidcyRazorpayMode = 'success'; });
await page.locator('#page-payment .green-btn').click();

    try{
      await page.waitForFunction(() => window.lastBooking && window.lastBooking.payment_verified === true, null, {timeout: 15000});
    }catch(error){
      console.error('payment-debug', JSON.stringify(await page.evaluate(() => ({
        activePages:Array.from(document.querySelectorAll('.page.on,.page.active')).map(page => page.id),
        events:window.__guidcyPaymentEvents || [],
        lastBooking:window.lastBooking || null,
        toast:document.querySelector('#toastbar')?.textContent || '',
        path:location.pathname,
      }))));
      console.error('payment-page-errors', JSON.stringify(pageErrors));
      console.error('payment-console-errors', JSON.stringify(consoleErrors));
      throw error;
    }
    await page.waitForFunction(() => !!localStorage.getItem('guidcy_pending_meeting_link'), null, {timeout: 10000});
    const afterPayment = await page.evaluate(() => ({
      events: window.__guidcyPaymentEvents.slice(),
      booking: Object.assign({}, window.lastBooking),
      stored: (window.__guidcyTestBookings || []).find(row => row.id === window.lastBooking.id),
    }));
    const verifyAt = afterPayment.events.findIndex(event => event.type === 'verify-payment');
    const googleAt = afterPayment.events.findIndex(event => event.type === 'google-authorized');
    const calendarFailureAt = afterPayment.events.findIndex(event => event.type === 'calendar-failed');
    const razorpayOpened = afterPayment.events.find(event => event.type === 'razorpay-opened');
    assert.ok(verifyAt >= 0 && googleAt > verifyAt, 'Google login must be requested only after payment verification');
    assert.ok(calendarFailureAt > googleAt, 'Calendar work must follow post-payment Google authorization');
    assert.deepEqual(razorpayOpened?.activePages, ['page-payment']);
    assert.equal(afterPayment.booking.payment_verified, true);
    assert.equal(afterPayment.booking.meet_link || '', '');
    assert.equal(afterPayment.events.some(event => event.type === 'email'), false, 'email must wait for a persisted meeting link');

 await page.waitForSelector('#booking-confirm-popup[data-payment-outcome="success"]', {timeout: 10000});
 assert.equal(new URL(page.url()).pathname, '/payment');
 assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('.page.on,.page.active')).map(page => page.id)), ['page-payment']);
 assert.match(await page.locator('#guidcy-payment-status').innerText(), /Payment successful/i);
 assert.equal(await page.locator('#guidcy-payment-status.success').count(), 1);
 await page.evaluate(() => window.go('webinar'));
 await page.waitForTimeout(250);
 assert.equal(new URL(page.url()).pathname, '/payment');
 assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('.page.on,.page.active')).map(page => page.id)), ['page-payment']);
 assert.equal(await page.locator('#booking-confirm-popup[data-payment-outcome="success"]').count(), 1);
 await page.getByRole('button', {name: /View booking/i}).click();
    await page.waitForSelector('#page-user-dash.on', {timeout: 10000});
    const retry = page.getByRole('button', {name: /Retry meeting link/i});
    await retry.waitFor({state: 'visible', timeout: 10000});
    await retry.click();
    await page.waitForFunction(() => {
      const row = (window.__guidcyTestBookings || []).find(item => item.id === window.lastBooking.id);
      return /^https:\/\/meet\.google\.com\//.test(row && row.meet_link || '') && !localStorage.getItem('guidcy_pending_meeting_link');
    }, null, {timeout: 15000});
    const afterRetry = await page.evaluate(() => ({
      events: window.__guidcyPaymentEvents.slice(),
      row: (window.__guidcyTestBookings || []).find(item => item.id === window.lastBooking.id),
    }));
    const calendarReadyAt = afterRetry.events.findIndex(event => event.type === 'calendar-created');
    const emailAt = afterRetry.events.findIndex(event => event.type === 'email');
    assert.ok(calendarReadyAt > calendarFailureAt && emailAt > calendarReadyAt, 'email must follow successful meeting persistence');
    assert.equal(afterRetry.row.meet_link, 'https://meet.google.com/abc-defg-hij');
    assert.ok(afterRetry.events.filter(event => event.type === 'email').every(event => /^https:\/\/meet\.google\.com\//.test(event.meetLink)));
 console.log('step-payment-meeting-retry-email-passed');

 async function verifyUnsuccessfulPayment(mode, statusClass, statusPattern, storedStatus) {
   const preservedBookings = await page.evaluate(() => (window.__guidcyTestBookings || []).map(row => Object.assign({}, row)));
   await page.goto(`${origin}/consultant/test-expert`, {waitUntil: 'domcontentloaded'});
   await page.evaluate(rows => {
     window.__guidcyTestBookings.splice(0, window.__guidcyTestBookings.length, ...rows);
   }, preservedBookings);
   await page.waitForSelector('#page-profile.on .profile-name', {timeout: 15000});
   await page.locator('.avail-slot').first().click();
   await page.getByRole('button', {name: /Book this session/i}).click();
   await page.waitForSelector('#page-payment.on', {timeout: 10000});
   await page.evaluate(value => { window.__guidcyRazorpayMode = value; }, mode);
   await page.locator('#page-payment .green-btn').click();
   await page.waitForSelector(`#guidcy-payment-status.${statusClass}`, {timeout: 10000});
   assert.equal(new URL(page.url()).pathname, '/payment');
   assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('.page.on,.page.active')).map(item => item.id)), ['page-payment']);
   assert.match(await page.locator('#guidcy-payment-status').innerText(), statusPattern);
   assert.equal(await page.locator('#booking-confirm-popup').count(), 0);
   const latest = await page.evaluate(() => Object.assign({}, (window.__guidcyTestBookings || []).at(-1)));
   assert.equal(latest.payment_status, storedStatus);
   assert.equal(latest.payment_verified, false);
 }

 await verifyUnsuccessfulPayment('cancel', 'cancelled', /Payment cancelled/i, 'cancelled');
 await verifyUnsuccessfulPayment('failed', 'error', /Payment failed|Simulated payment failure/i, 'failed');
 await page.evaluate(() => { window.__guidcyRazorpayMode = 'success'; window.go('user-dash'); });
 await page.waitForSelector('#page-user-dash.on', {timeout: 10000});
 await page.waitForFunction(() => {
   const main = document.getElementById('udash-main');
   return !!(main && main.querySelector('.dash-title') && !/loading/i.test(main.textContent || ''));
 }, null, {timeout: 10000});
 console.log('step-payment-cancel-and-failure-stay-on-payment-passed');

 await applyDashboardAvatar('user', 'udash-av');
 for (const width of [1365, 820, 390]) await assertDashboardLayout('page-user-dash', 'udash-av', 'user', width);
 console.log('step-user-dashboard-responsive-layout-and-avatar-passed');

 await page.setViewportSize({width: 390, height: 844});
  async function chooseUserTab(tab) {
    await page.locator('#page-user-dash .dash-mobile-toggle').click();
    await page.waitForSelector('#page-user-dash .dash-side.on', {timeout: 5000});
    try{
      await page.waitForFunction(() => {
        const side=document.querySelector('#page-user-dash .dash-side.on');
        return !!(side&&Math.abs(side.getBoundingClientRect().left)<=1);
      }, null, {timeout: 5000});
    }catch(error){
      console.error('drawer-transition-debug', JSON.stringify(await page.evaluate(() => {
        const side=document.querySelector('#page-user-dash .dash-side');
        return side?{className:side.className,rect:side.getBoundingClientRect().toJSON(),left:getComputedStyle(side).left,transform:getComputedStyle(side).transform,body:document.body.className}:null;
      })));
      throw error;
    }
    try{
      await page.locator(`#page-user-dash [data-dash-section="${tab}"]`).click();
    }catch(error){
      console.error('dashboard-debug', JSON.stringify(await page.evaluate(() => {
        const side=document.querySelector('#page-user-dash .dash-side');
        return {
          activePages:Array.from(document.querySelectorAll('.page.on,.page.active')).map(page => page.id),
          requestedUrl:window.__GUIDCY_REQUESTED_URL_V6__ || '',
          path:location.pathname+location.search,
          sideClass:side?.className || '',
          sideRect:side?Object.assign({},side.getBoundingClientRect().toJSON()):null,
        };
      })));
      throw error;
    }
      await waitForUrlTab(page, tab);
      assert.equal(await page.locator('#page-user-dash .dash-side.on').count(), 0);
    }
  for (const tab of ['history', 'upcoming', 'history', 'upcoming', 'history', 'upcoming']) await chooseUserTab(tab);
  await page.locator('#page-user-dash .dash-mobile-toggle').click();
  await page.evaluate(() => {
    const button = document.querySelector('#page-user-dash [data-dash-section="history"]');
    const pointerId = 887;
    button.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10}));
    button.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerId, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 70}));
    button.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, pointerId, pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 70}));
    button.dispatchEvent(new MouseEvent('click', {bubbles: true, button: 0}));
  });
  await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'upcoming', 'a scroll gesture must not change dashboard tab');
 await page.locator('#page-user-dash .dash-overlay.on').click({position: {x: 370, y: 20}});
  assert.equal(await page.locator('#page-user-dash .dash-side.on').count(), 0);
    console.log('step-user-dashboard-single-tap-and-scroll-guard-passed');

await page.evaluate(() => {
      const completed = {id:'metric-completed',consultant_id:'test-expert',consultant_name:'Test Expert',payment_status:'success',payment_verified:true,status:'completed',session_status:'completed',payment_amount:500,consultant_payout_amount:425,payout_status:'pending',created_at:new Date().toISOString()};
      const disputed = {id:'metric-disputed',consultant_id:'test-expert',consultant_name:'Test Expert',payment_status:'success',payment_verified:true,status:'disputed',session_status:'disputed',payment_amount:300,consultant_payout_amount:255,payout_status:'pending',created_at:new Date().toISOString()};
      const orderOnly = {id:'metric-order-only',consultant_id:'test-expert',consultant_name:'Test Expert',payment_status:'pending',payment_verified:false,status:'pending_payment',razorpay_order_id:'order_NOT_PAID',payment_amount:900,payout_status:'pending',created_at:new Date().toISOString()};
      if (!(window.__guidcyTestBookings || []).some(row => row.id === completed.id)) window.__guidcyTestBookings.push(completed, disputed, orderOnly);
      if (!(window.__guidcyTestDisputes || []).some(row => row.booking_id === disputed.id)) window.__guidcyTestDisputes.push({id:'dispute-metric-1',booking_id:disputed.id,booking_reference:disputed.id,status:'Under Review',is_deleted:false,created_at:new Date().toISOString()});
      const consultantUser={id:'expert-profile',email:'expert@example.com',user_metadata:{full_name:'Test Expert',role:'consultant'}};
      const consultantProfile={id:consultantUser.id,email:consultantUser.email,full_name:'Test Expert',role:'consultant'};
      window.__guidcyTestAuthUser=consultantUser; window.__guidcyTestProfile=consultantProfile;
      window.currentUser=consultantUser; window.currentProfile=consultantProfile; window.loggedIn='consultant';
      try{currentUser=consultantUser;currentProfile=consultantProfile;loggedIn='consultant'}catch(_){}
    window.__GUIDCY_LAST_POINTER_AT_V6__=Date.now();
    window.go('cons-dash');
    window.swCD('overview',document.querySelector('#page-cons-dash [data-dash-section="overview"]'));
  });
await page.waitForSelector('#page-cons-dash.on .dash-mobile-toggle', {timeout: 10000});
await page.waitForFunction(() => /Total earned/i.test(document.querySelector('#cdash-main')?.textContent || ''), null, {timeout: 10000});
await applyDashboardAvatar('consultant', 'cdash-av');
for (const width of [1365, 820, 390]) await assertDashboardLayout('page-cons-dash', 'cdash-av', 'cons', width);
console.log('step-consultant-dashboard-responsive-layout-and-avatar-passed');
const overviewPayable = await page.locator('#cdash-main .stat-box').filter({hasText: 'Total earned'}).locator('.stat-val').innerText();
  await page.locator('#page-cons-dash .dash-mobile-toggle').click();
    await page.locator('#page-cons-dash [data-dash-section="earnings"]').click();
    await waitForUrlTab(page, 'earnings');
    await page.waitForFunction(() => /Paid bookings/i.test(document.querySelector('#cdash-main')?.textContent || ''), null, {timeout: 10000});
  const metricCards = await page.locator('#cdash-main .gmkt-money-card').evaluateAll(cards => Object.fromEntries(cards.map(card => [card.querySelector('span')?.textContent.trim(), card.querySelector('b')?.textContent.trim()])));
assert.equal(metricCards['Completed sessions'], '1');
assert.equal(metricCards['Paid bookings'], '6');
assert.equal(metricCards['Disputed bookings'], '1');
assert.match(await page.locator('#cdash-main tr[data-booking-id="metric-completed"] td').nth(2).innerText(), /Completed/i);
assert.match(await page.locator('#cdash-main tr[data-booking-id="metric-completed"] td').nth(6).innerText(), /pending/i);
assert.match(await page.locator('#cdash-main tr[data-booking-id="metric-disputed"] td').nth(2).innerText(), /Disputed.*Under Review/i);
assert.match(await page.locator('#cdash-main tr[data-booking-id="metric-disputed"] td').nth(6).innerText(), /On hold.*dispute/i);
const earningsPayable = await page.locator('#cdash-main tbody tr').evaluateAll(rows => rows.reduce((sum, row) => {
    const value = row.querySelectorAll('td')[5]?.textContent || '';
    return sum + Number(value.replace(/[^0-9.-]/g, '') || 0);
  }, 0));
assert.equal(Number(overviewPayable.replace(/[^0-9.-]/g, '') || 0), earningsPayable);
assert.equal(await page.locator('#page-cons-dash .dash-side.on').count(), 0);
const idleSnapshot = await page.evaluate(() => ({html:document.getElementById('cdash-main').innerHTML, reads:window.__guidcyBookingReadCount}));
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForTimeout(900);
assert.deepEqual(await page.evaluate(() => ({html:document.getElementById('cdash-main').innerHTML, reads:window.__guidcyBookingReadCount})), idleSnapshot, 'focus must not repaint or refetch an idle dashboard tab');
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForTimeout(1300);
assert.equal(new URL(page.url()).searchParams.get('tab'), 'earnings', 'stale dashboard restorers must not switch the tab back');
assert.deepEqual(await page.evaluate(() => ({html:document.getElementById('cdash-main').innerHTML, reads:window.__guidcyBookingReadCount})), idleSnapshot, 'focus/visibility must not repaint or refetch an idle dashboard tab');
    console.log('step-consultant-menu-and-session-metrics-passed');

    await page.evaluate(() => {
      const admin={id:'test-admin',email:'tripathiprakhar41@gmail.com',user_metadata:{full_name:'Test Admin',role:'admin'}};
      const adminProfile={id:admin.id,email:admin.email,full_name:'Test Admin',role:'admin',is_admin:true};
      window.__guidcyTestAuthUser=admin; window.__guidcyTestProfile=adminProfile;
      window.currentUser=admin; window.currentProfile=adminProfile; window.loggedIn='admin';
      try{currentUser=admin;currentProfile=adminProfile;loggedIn='admin'}catch(_){}
    window.__GUIDCY_LAST_POINTER_AT_V6__=Date.now();
    window.go('admin-dash');
    window.swAD('overview',document.querySelector('#page-admin-dash [data-admin-section="overview"]'));
    });
await page.waitForSelector('#page-admin-dash.on [data-admin-section="promo-codes"]', {timeout: 10000});
await page.waitForFunction(() => !!document.querySelector('#adash-main .dash-title'), null, {timeout: 10000});
await applyDashboardAvatar('admin', 'adash-av');
for (const width of [1365, 820, 390]) await assertDashboardLayout('page-admin-dash', 'adash-av', 'admin', width);
console.log('step-admin-dashboard-responsive-layout-and-avatar-passed');
await page.locator('#page-admin-dash .dash-mobile-toggle').click();
    await page.waitForSelector('#page-admin-dash .dash-side.on', {timeout: 5000});
    await page.locator('#page-admin-dash [data-admin-section="promo-codes"]').click();
    await waitForUrlTab(page, 'promo-codes');
    assert.equal(await page.locator('#page-admin-dash .dash-side.on').count(), 0);
    assert.match(await page.locator('#adash-main .dash-title').innerText(), /Promo Codes/i);
    await page.waitForTimeout(2200);
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'promo-codes');
  console.log('step-admin-promo-menu-close-passed');

  await page.setViewportSize({width: 1365, height: 900});
  await page.getByRole('button', {name: 'Sign out', exact: true}).click();
  await page.waitForSelector('#page-home.on', {timeout: 10000});
  await page.waitForTimeout(1000);
  assert.equal(new URL(page.url()).pathname, '/');
  await page.locator('#main-nav .nav-link').filter({hasText: 'Find the Expert'}).click();
  await page.waitForSelector('#page-browse.on', {timeout: 10000});
    await page.locator('#main-nav .nav-link').filter({hasText: 'Categories'}).click();
    await page.waitForSelector('#page-categories.on', {timeout: 10000});
    await page.goBack();
    await page.waitForSelector('#page-browse.on', {timeout: 10000});
    await page.goForward();
    await page.waitForSelector('#page-categories.on', {timeout: 10000});
    console.log('step-logout-home-navigation-back-forward-passed');

    await page.goto(`${origin}/dashboard?tab=history`, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#page-user-dash.on', {timeout: 10000});
    await waitForUrlTab(page, 'history');
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#page-user-dash.on', {timeout: 10000});
    await waitForUrlTab(page, 'history');
    assert.match(await page.locator('#udash-main .dash-title').innerText(), /Session history/i);
    console.log('step-direct-dashboard-url-refresh-passed');

 const unexpectedConsoleErrors = consoleErrors.filter(message => !/Google Calendar API response had no Meet link|Payment verified but meeting link is pending|Google Meet generation failed|Razorpay booking payment failed: Error: (?:Payment cancelled|Simulated payment failure)/i.test(message));
  if (unexpectedConsoleErrors.length) console.error('unexpected-response-errors', JSON.stringify(responseErrors));
  assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpectedConsoleErrors, []);
    assert.deepEqual(apiFailures, []);
    console.log('step-no-unexpected-console-or-api-failures-passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
