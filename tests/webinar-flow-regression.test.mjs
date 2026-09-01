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
