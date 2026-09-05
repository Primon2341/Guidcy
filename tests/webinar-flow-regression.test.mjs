import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const webinarFlow = fs.readFileSync(new URL('../assets/js/webinar-flow.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const createOrder = fs.readFileSync(new URL('../api/create-order.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260901023013_webinar_registration_uniqueness.sql', import.meta.url), 'utf8');

test('webinar flow override loads after existing application controllers', () => {
  const controllersAt = index.indexOf('/assets/js/controllers.js');
  const webinarFlowAt = index.indexOf('/assets/js/webinar-flow.js');
  assert.ok(controllersAt >= 0);
  assert.ok(webinarFlowAt > controllersAt);
});

test('published webinar guard rejects past date/time before the existing publisher runs', () => {
  assert.match(webinarFlow, /startsAt\.getTime\(\) <= Date\.now\(\)/);
  assert.match(webinarFlow, /Past webinars are not shown in the Upcoming webinars list/);
  assert.match(webinarFlow, /dateInput\.min/);
});

test('paid webinar checkout is locked to Payment page and confirms only verified rows', () => {
  assert.match(webinarFlow, /openWebinarPaymentPage\(webinar, registration, details\)/);
  assert.match(webinarFlow, /ensurePaymentPage\(\)/);
  assert.match(webinarFlow, /flow: 'webinar'/);
  assert.match(webinarFlow, /registrationId: state\.registration\.id/);
  assert.match(webinarFlow, /if \(!isConfirmedRegistration\(state\.registration\)\)/);
  assert.match(webinarFlow, /dataset\.paymentFlow = 'webinar'/);
  assert.match(webinarFlow, /Payment cancelled[\s\S]*registration was not confirmed or marked as paid/);
});

test('admin webinar filter and export recompute from the current selected webinar', () => {
  assert.match(webinarFlow, /function dashboardFilteredRows\(\)/);
  assert.match(webinarFlow, /selected !== 'all' && registrationWebinarId\(row\) !== selected/);
  assert.match(webinarFlow, /window\.guidcyFilterWebinarRegs = function/);
  assert.match(webinarFlow, /window\.guidcyExportFilteredWebinarRegs = function/);
  assert.match(webinarFlow, /var rows = dashboardFilteredRows\(\)/);
  assert.match(webinarFlow, /count\.textContent/);
});

test('view webinar registrations activates and renders the admin route on the first click', () => {
  assert.match(webinarFlow, /window\.guidcyOpenWebinarRegistrations = function/);
  assert.match(webinarFlow, /history\.pushState\(\{ page: 'admin-dash', tab: 'webinar-registrations' \}, '', target\)/);
  assert.match(webinarFlow, /window\.guidcyRefreshRouteFromLocation\(\)/);
  assert.match(webinarFlow, /activateWebinarRegistrationDashboard\(\)[\s\S]*window\.swAD\('webinar-registrations', null\)/);
  assert.match(webinarFlow, /event\.stopImmediatePropagation\(\)[\s\S]*window\.guidcyOpenWebinarRegistrations\(event\)/);
});

test('the same captured webinar registration tap path is used on mobile and desktop', () => {
  const start = webinarFlow.indexOf('window.guidcyOpenWebinarRegistrations = function');
  const end = webinarFlow.indexOf('function dedupeWebinars', start);
  assert.ok(start >= 0 && end > start);
  const navigation = webinarFlow.slice(start, end);
  assert.match(navigation, /document\.addEventListener\('click',[\s\S]*#wbn-manage-regs-btn[\s\S]*}, true\)/);
  assert.doesNotMatch(navigation, /matchMedia|innerWidth|pointerType|ontouchstart/);
});

test('database and order creation prevent duplicate active webinar payments', () => {
  assert.doesNotMatch(createOrder, /flow !== 'webinar' && \/\^order_/);
  assert.match(createOrder, /\^order_\[A-Za-z0-9\]\+\$/);
  assert.match(migration, /create unique index if not exists webinar_registrations_one_active_email_per_webinar/i);
  assert.match(migration, /on public\.webinar_registrations \(webinar_id, lower\(btrim\(email\)\)\)/i);
  assert.match(migration, /where coalesce\(is_deleted, false\) is false/i);
});

/* The blocking flag stops someone wandering off mid-checkout, but it lived in
   sessionStorage and was only cleared by pressing Back on the payment page or by
   cancelling a checkout that had actually started. A user who merely navigated
   away or reloaded stayed blocked, so every later go() in that tab was redirected
   to /payment - the whole site became unusable - and each redirect re-ran
   ensurePaymentPage(), which re-homes the footer against whatever page happened to
   be active, putting the footer above the content. */
test('a stale payment state cannot survive into a later visit', () => {
  const at = webinarFlow.indexOf('var bootState = paymentState();');
  assert.ok(at > 0, 'a fresh document must vet the persisted state');
  const block = webinarFlow.slice(at, at + 900);

  // nothing persisted may outlive its window - a days-old state was being replayed
  assert.match(webinarFlow, /WEBINAR_PAYMENT_MAX_AGE_MS = 30 \* 60 \* 1000/);
  assert.match(block, /Date\.now\(\) - openedAt\) > WEBINAR_PAYMENT_MAX_AGE_MS/);
  assert.match(block, /if \(stale\) \{[\s\S]*?clearPaymentState\(\)/,
    'a stale state - completed or not - must be dropped, not replayed');
  assert.match(block, /!openedAt \|\|/, 'a state with no timestamp counts as stale');

  // a genuinely fresh, unfinished payment keeps its state but loses the nav lock
  assert.match(block, /bootState\.blocking && !bootState\.completed/);
  assert.match(block, /bootState\.blocking = false/);
  assert.match(block, /savePaymentState\(bootState\)/, 'the release must be persisted, not just in memory');

  // it has to run before go() is wrapped, or the first navigation still sees blocking
  assert.ok(at < webinarFlow.indexOf("window.go = function (page)"),
    'the vetting must happen before the go() wrapper is installed');
});

/* The replayed state carried an old registration id, so /api/create-order answered
   alreadyPaid and the client showed "Payment successful" without Razorpay ever
   opening - and startWebinarPayment returned early on state.completed, so the Pay
   button did nothing at all. Both are only safe while stale states are dropped. */
test('a completed state still short-circuits the pay button, so it must not be stale', () => {
  assert.match(webinarFlow, /if \(webinarPaymentBusy \|\| state\.completed\) return;/,
    'the early return is what made the Pay button silently do nothing');
  assert.match(webinarFlow, /if \(state\.completed\) showWebinarConfirmation\(/,
    'and this is what re-showed a stale success popup on load');
  const at = webinarFlow.indexOf('var bootState = paymentState();');
  assert.ok(at < webinarFlow.indexOf('if (state.completed) showWebinarConfirmation('),
    'the state must be vetted before the restore handler can replay it');
});

test('navigating away mid-checkout is still refused', () => {
  const at = webinarFlow.indexOf('window.go = function (page)');
  const wrapper = webinarFlow.slice(at, at + 420);
  assert.match(wrapper, /state && state\.blocking && page !== 'payment'/,
    'an in-session checkout must still hold the user on the payment page');
  assert.match(wrapper, /return 'webinar_payment_locked'/);
  assert.match(wrapper, /state && !state\.blocking && page !== 'payment'\) clearPaymentState\(\)/,
    'and a released state must clear itself on the first navigation away');
});

/* app.js wraps wbnSubmitReg to fire the registration emails the moment the submit
   resolves. For a paid webinar that is before any payment, so the attendee was
   told "You are registered for the Guidcy webinar" while the row was still
   pending_payment. The wrapper opts out of any submit already marked as running a
   verified-payment flow; webinar-flow's submit was missing that marker. */
test('the paid webinar submit is exempt from the send-on-registration wrapper', () => {
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /!oldWbn\.__resendWrapped&&!oldWbn\.__guidcyVerifiedPaymentFlow/,
    'the wrapper must keep honouring the opt-out marker');
  assert.match(webinarFlow, /window\.wbnSubmitReg\.__guidcyVerifiedPaymentFlow = true/,
    'without the marker the attendee is emailed before paying');
  // the marker has to be set on the same function that is exported as wbnSubmitReg
  const at = webinarFlow.indexOf('window.wbnSubmitReg = submitWebinarRegistration;');
  assert.ok(at > 0 && webinarFlow.indexOf('window.wbnSubmitReg.__guidcyVerifiedPaymentFlow = true') > at);
});

test('every webinar email is sent only after the registration is confirmed', () => {
  // free path: emails come after the free verify-payment call has confirmed the row
  const free = webinarFlow.slice(webinarFlow.indexOf("free: true"));
  const confirmAt = free.indexOf('if (!isConfirmedRegistration(registration)) throw');
  const sendAt = free.indexOf('await sendWebinarEmails(registration, webinar)');
  assert.ok(confirmAt > -1 && sendAt > confirmAt, 'free registration must be confirmed before emailing');

  // paid path: emails come after server-side verification, inside the success block
  const paid = webinarFlow.slice(webinarFlow.indexOf('async function startWebinarPayment'));
  const verifyAt = paid.indexOf('if (!isConfirmedRegistration(state.registration))');
  const paidSendAt = paid.indexOf('await sendWebinarEmails(state.registration, state.webinar)');
  assert.ok(verifyAt > -1 && paidSendAt > verifyAt, 'payment must be verified before emailing');
});

/* Registering again with an email that already paid is not a payment: Razorpay is
   never opened and nothing is charged, so the popup must not claim otherwise. */
test('an already-paid registration never reaches the payment page or claims a payment', () => {
  assert.match(webinarFlow, /if \(registration\.__alreadyConfirmed \|\| isConfirmedRegistration\(registration\)\) \{[\s\S]{0,400}?clearPaymentState\(\)/,
    'it must stop before openWebinarPaymentPage and drop any payment state');
  const at = webinarFlow.indexOf('if (registration.__alreadyConfirmed || isConfirmedRegistration(registration)) {');
  const openAt = webinarFlow.indexOf('openWebinarPaymentPage(webinar, registration, details);', at);
  assert.ok(at > 0 && openAt > at, 'the already-registered branch must return before the payment page opens');
  assert.match(webinarFlow, /alreadyRegistered \? 'You are already registered' : 'Payment successful'/,
    'the popup must say which of the two actually happened');
});

/* The payment page's step bar is static markup: step 2 "Payment" stayed lit after
   the payment was confirmed, so a paid user was still looking at "Payment"
   instead of "Confirmed". */
test('a confirmed payment advances the step bar to Confirmed', () => {
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /function guidcySetPaymentStep\(done\)/);
  assert.match(app, /guidcySetPaymentStep\(kind==='success'\)/,
    'the shared status setter must drive the bar, so every flow gets it');

  const fn = app.slice(app.indexOf('function guidcySetPaymentStep(done)'), app.indexOf('window.guidcySetPaymentStep=guidcySetPaymentStep'));
  // forward: step 2 becomes done, its line fills, step 3 lights up
  assert.match(fn, /circles\[1\]\.classList\.add\('done'\)/);
  assert.match(fn, /lines\[1\]\)lines\[1\]\.classList\.add\('done'\)/);
  assert.match(fn, /circles\[2\]\.classList\.add\('active'\)/);
  // and back again, so a failed payment does not leave the bar claiming success
  assert.match(fn, /circles\[1\]\.classList\.remove\('done'\)/);
  assert.match(fn, /circles\[2\]\.classList\.remove\('active'\)/);

  // webinar-flow's own fallback status path must drive it too
  assert.match(webinarFlow, /window\.guidcySetPaymentStep && window\.guidcySetPaymentStep\(kind === 'success'\)/);
});
