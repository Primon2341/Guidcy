import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../assets/js/core.js', import.meta.url), 'utf8');
const controllers = fs.readFileSync(new URL('../assets/js/controllers.js', import.meta.url), 'utf8');
const verifier = fs.readFileSync(new URL('../api/verify-payment.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing section start: ${start}`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('route bootstrap delegates instead of rendering or inferring clicks', () => {
  assert.match(core, /__GUIDCY_HANDLE_POPSTATE_V7__/);
  assert.doesNotMatch(core, /MutationObserver|setInterval|pointerdown|mousedown|addEventListener\('click'/);
  assert.doesNotMatch(core, /pushState\s*=|replaceState\s*=/);
});

test('dashboard navigation has one click owner and rejects scroll gestures', () => {
  assert.equal((controllers.match(/addEventListener\('click',handleDashboardClick,true\)/g) || []).length, 1);
  assert.match(controllers, /stopImmediatePropagation\(\)/);
  assert.match(controllers, /TAP_MOVE_LIMIT=12/);
  assert.match(controllers, /pointercancel/);
  assert.match(controllers, /isBlockedGesture\(button\)/);
  assert.match(controllers, /claimDashboardControl\(toggle\)/);
  assert.match(controllers, /claimDashboardControl\(button\)/);
});

test('logout clears UI state and synchronously reinitializes home', () => {
  const logout = section(controllers, 'window.logOut=function()', 'try{logOut=window.logOut}');
  assert.match(logout, /closeAllTransientUi\(\)/);
  assert.match(logout, /clearSessionUiState\(\)/);
  assert.match(controllers, /history\.replaceState\(\{page:'home'\},'','\/'\)/);
  assert.match(controllers, /window\.initHome/);
  assert.match(logout, /signOut\(\{scope:'local'\}\)/);
});

test('paid checkout verifies payment before Google authorization, meeting generation and persistence', () => {
  const payment = section(app, 'async function startBookingPayment(){', 'window.guidcyStartRazorpayBooking=startBookingPayment');
  const checkout = payment.indexOf('await openCheckout');
  const verify = payment.indexOf("postJSON('/api/verify-payment'");
  const google = payment.indexOf('await window.guidcyEnsureGoogleCalendarAuthorization()', verify);
  const meeting = payment.indexOf('await createMeetingLinkSafe(s)', checkout);
  const persist = payment.indexOf('await persistMeetingLink', meeting);
  assert.ok(checkout >= 0 && verify > checkout, 'server verification must follow Razorpay checkout');
  assert.ok(google > verify, 'Google authorization must not be requested before verified payment');
  assert.ok(meeting > google, 'meeting generation must follow post-payment Google authorization');
  assert.ok(persist > meeting, 'meeting link must be persisted after generation');
  assert.doesNotMatch(payment.slice(0, checkout), /guidcyEnsureGoogleCalendarAuthorization/);
  assert.doesNotMatch(payment.slice(verify, payment.indexOf(');', verify) + 2), /meet_link/);
  assert.match(payment, /rememberMeetingRetry\(booking,s,meetingError\)/);
  assert.match(payment, /Payment verified and booking confirmed\. Meeting link is pending/);
});

test('payment verifier updates only payment fields and preserves blank meeting links', () => {
  const fulfilled = section(verifier, 'function fulfilledPatch', 'module.exports');
  assert.doesNotMatch(fulfilled, /user_email_sent|consultant_email_sent|email_last_error/);
  assert.match(fulfilled, /if \(meetLink\) bookingPatch\.meet_link = meetLink/);
});

test('paid and completed session metrics share canonical predicates', () => {
  const metricBlock = section(app, 'function guidcyBookingIsPaid', 'function joinMeeting');
  assert.doesNotMatch(metricBlock, /razorpay_order_id|payment_id/);
  assert.match(metricBlock, /payment_verified===true/);
  assert.match(metricBlock, /bookingStatus==='completed'\|\|sessionStatus==='completed'/);

  const overview = section(app, "if(view==='overview')", "}else if(view==='earnings')");
  assert.match(overview, /if\(guidcyBookingIsCompleted\(r\)\)ovDone\+\+/);
  assert.match(overview, /if\(!guidcyBookingIsPaid\(r\)\)return/);
  assert.match(overview, /window\.guidcyBookingPayable/);

  const earnings = section(app, 'async function renderConsultantEarnings(btn)', '/* persistWrap installs');
  assert.match(earnings, /completedBookings=bookings\.filter/);
  assert.match(earnings, /consultantEarningsDisputeMap/);
  assert.match(earnings, /visibleBookings=bookings\.filter/);
  assert.match(earnings, /Disputed bookings/);
  assert.match(earnings, /On hold — dispute/);
  assert.match(earnings, /<span>Completed sessions<\/span>/);
});

test('dashboard refresh is mutation-driven and category filtering is registration-exact', () => {
  const liveRefresh = section(app, '/* === guidcy-scoped-dashboard-live-refresh-v1 === */', '/* === guidcy-cancellation-email-live-refresh-repair-v1 === */');
  assert.doesNotMatch(liveRefresh, /addEventListener\('focus'|addEventListener\('pageshow'|visibilitychange|background-poll/);
  assert.match(liveRefresh, /guidcyBroadcastDataChange/);
  assert.match(app, /matchesRegisteredCategory\(c,cat\)/);
  assert.doesNotMatch(app, /cats\.some\(cat=>consultantScore\(c,cat\)>=80\)/);
});

test('payment route owns the only visible page through Razorpay and post-payment Google authorization', () => {
  const isolation = section(app, 'function ensurePaymentPageOnly()', 'window.startBooking=function()');
  assert.match(isolation, /classList\.remove\('on','active'\)/);
  assert.match(isolation, /page\.id==='page-payment'/);
  assert.match(isolation, /paymentPage\.classList\.add\('on'\)/);

  const payment = section(app, 'async function startBookingPayment(){', 'window.guidcyStartRazorpayBooking=startBookingPayment');
  assert.ok((payment.match(/guidcyEnsurePaymentPageOnly\(\)/g) || []).length >= 3);
  assert.ok(payment.indexOf('guidcyEnsurePaymentPageOnly()', payment.indexOf('Opening Razorpay')) < payment.indexOf('await openCheckout'));
  assert.ok(payment.indexOf('guidcyEnsurePaymentPageOnly()', payment.indexOf('payment_verified')) < payment.indexOf('guidcyEnsureGoogleCalendarAuthorization'));

  const router = section(app, 'function renderUrl(raw)', 'function forceLoginDestination');
  assert.match(router, /page==='payment'.*guidcyEnsurePaymentPageOnly/);
  assert.match(router, /paymentRequested=window\.__guidcyPaymentFlowLock\|\|pathOnly\(\)==='\/payment'/);
  assert.match(router, /__GUIDCY_REQUESTED_URL_V6__/);
  assert.match(router, /if\(paymentRequested\)/);
  assert.match(app, /window\.__guidcyPaymentFlowLock=true/);
  assert.match(app, /guidcyPaymentOutcomeAction\('dashboard'\)/);
  assert.match(payment, /setPaymentPageStatus\('success','Payment successful'/);
  assert.match(payment, /setPaymentPageStatus\(e\.cancelled\?'cancelled':'error'/);
  assert.doesNotMatch(payment, /go\('confirm'\)/);
});

test('missing meeting links expose retry actions and promo navigation closes its drawer', () => {
  assert.match(app, /window\.guidcyRetryMeetingLink=function/);
  assert.ok((app.match(/Retry meeting link/g) || []).length >= 2);
  const promo = section(app, 'function renderPromoAdmin(btn)', 'window.guidcyRenderPromoAdmin=renderPromoAdmin');
  assert.match(promo, /window\.closeDashMenu\('admin'\)/);
});

test('returning to a browser tab preserves the exact current route and visible page', () => {
  const start = app.indexOf('/* === guidcy-tab-return-route-stability-v1 ===');
  assert.ok(start >= 0);
  const stability = app.slice(start);
  assert.match(stability, /snapshot=\{url:url,page:activePage\(\),capturedAt:Date\.now\(\)\}/);
  assert.match(stability, /history\.replaceState\(\{page:snapshot\.page\|\|'',guidcyTabReturn:true\},'',snapshot\.url\)/);
  assert.match(stability, /window\.guidcyRefreshRouteFromLocation\(\)/);
  assert.match(stability, /visibilitychange[\s\S]*document\.hidden[\s\S]*captureRoute\(false\)[\s\S]*scheduleRestore\(\)/);
  assert.match(stability, /window\.addEventListener\('popstate',cancelForUserNavigation\)/);
  assert.match(stability, /document\.addEventListener\('click',cancelForUserNavigation,true\)/);
  assert.match(stability, /#wbn-manage-regs-btn/);
  assert.match(stability, /\^\(\?:\\\/payment\|\\\/confirm\|\\\/meeting\|\\\/review\)\$/);
});

test('tab return repairs a stale background route replay before it becomes the visible page', () => {
  const start = app.indexOf('/* === guidcy-tab-return-route-stability-v1 ===');
  const stability = app.slice(start);
  const handlers = { window: {}, document: {} };
  const timers = [];
  const location = { origin: 'https://guidcy.test', pathname: '/webinars', search: '', hash: '' };
  let active = 'webinar';
  let refreshes = 0;
  const document = {
    hidden: false,
    querySelector(selector) {
      return selector === '.page.on' || selector === '.page.active' ? { id: `page-${active}` } : null;
    },
    addEventListener(type, handler) {
      (handlers.document[type] ||= []).push(handler);
    }
  };
  const window = {
    addEventListener(type, handler) {
      (handlers.window[type] ||= []).push(handler);
    },
    __GUIDCY_SET_ROUTE_INTENT_V6__() {},
    guidcyRefreshRouteFromLocation() {
      refreshes++;
      active = location.pathname === '/webinars' ? 'webinar' : 'jobs';
    }
  };
  const history = {
    replaceState(_state, _title, url) {
      const parsed = new URL(url, location.origin);
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    }
  };
  vm.runInNewContext(stability, {
    window,
    document,
    history,
    location,
    URL,
    Date,
    console,
    setTimeout(handler, delay) {
      const timer = { handler, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cancelled = true;
    }
  });

  document.hidden = true;
  handlers.document.visibilitychange[0]();
  document.hidden = false;
  handlers.document.visibilitychange[0]();
  timers.find(timer => timer.delay === 0 && !timer.cancelled).handler();

  location.pathname = '/find-jobs';
  active = 'jobs';
  timers.find(timer => timer.delay === 120 && !timer.cancelled).handler();

  assert.equal(location.pathname, '/webinars');
  assert.equal(active, 'webinar');
  assert.equal(refreshes, 1);
});
