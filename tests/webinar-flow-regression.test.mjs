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
test('a stale blocking flag cannot survive a page load and trap the tab', () => {
  const at = webinarFlow.indexOf('var bootState = paymentState();');
  assert.ok(at > 0, 'a fresh document must release a persisted blocking flag');
  const block = webinarFlow.slice(at, at + 260);
  assert.match(block, /bootState\.blocking && !bootState\.completed/,
    'only an in-flight-looking flag is released; a completed payment keeps its state');
  assert.match(block, /bootState\.blocking = false/);
  assert.match(block, /savePaymentState\(bootState\)/, 'the release must be persisted, not just in memory');

  // it has to run before go() is wrapped, or the first navigation still sees blocking
  assert.ok(at < webinarFlow.indexOf("window.go = function (page)"),
    'the release must happen before the go() wrapper is installed');
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
