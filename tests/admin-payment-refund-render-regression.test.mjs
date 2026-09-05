import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const workflowStart = app.indexOf('/* === guidcy-booking-cancellation-refund-workflow-v1 === */');
const workflow = app.slice(workflowStart);

test('Payment Management renders its refund queue from DOM readiness on the first visit', () => {
  assert.ok(workflowStart >= 0, 'missing booking cancellation/refund workflow');
  assert.match(workflow, /function paymentManagementDomReady\(\)/);
  assert.match(workflow, /refundQueueObserver=new MutationObserver/);
  assert.match(workflow, /window\.guidcyScheduleAdminRefundQueue=scheduleAdminRefundQueue/);
  assert.match(workflow, /if\(view==='payments'\)\{[\s\S]*?scheduleAdminRefundQueue\(\)/);
  assert.match(app, /guidcyScheduleAdminRefundQueue\('transactions-rendered'\)/);
  assert.doesNotMatch(workflow, /setTimeout\(renderAdminRefundQueue,80\)/);
  assert.doesNotMatch(workflow, /guidcy-admin-refund-workflow'\)\)renderAdminRefundQueue\(\)/);
});

test('Admin booking rows retain Paid history while making cancellation and refund state explicit', () => {
  const start = app.indexOf("}else if(view==='bookings'){");
  const end = app.indexOf("}else if(view==='users')", start);
  const section = app.slice(start, end);

  assert.ok(start >= 0 && end > start, 'missing Admin All bookings renderer');
  assert.match(section, /isCancelled=\['cancelled','canceled'\]/);
  assert.match(section, /Payment: <b>\$\{paymentLabel\}<\/b>/);
  assert.match(section, /Refund: <b>\$\{refundLabel\}<\/b>/);
  assert.match(section, /Payout: <b>\$\{payoutLabel\}<\/b>/);
});

test('Recent Transactions has compact cancellation, refund and payout filters with search', () => {
  const start = app.indexOf('function transactionFilterControls()');
  const end = app.indexOf('async function renderAdminTransactions()', start);
  const section = app.slice(start, end);

  assert.ok(start >= 0 && end > start, 'missing Recent Transactions filters');
  assert.match(section, /guidcyFilterAdminTransactions/);
  assert.match(section, /guidcyResetAdminTransactionFilters/);
  assert.match(section, /Payout eligible/);
  assert.match(section, /Cancelled bookings/);
  assert.match(section, /Refund pending/);
  assert.match(section, /Refund processing/);
  assert.match(section, /Refunded/);
  assert.match(section, /Refund failed/);
  assert.match(section, /Search booking, client, consultant or reference/);
  assert.match(section, /data-guidcy-admin-transaction-row/);
  assert.match(section, /data-search/);
  assert.match(section, /payoutEligibleForTransaction=payoutEligible\(row\)/);
});

test('All paid booking cards retain Paid and add cancellation plus refund status tags', () => {
  const start = app.indexOf('function adminCard(b)');
  const end = app.indexOf('var prevAD=window.swAD;', start);
  const section = app.slice(start, end);

  assert.ok(start >= 0 && end > start, 'missing All paid bookings card renderer');
  assert.match(section, /statusPills/);
  assert.match(section, /status-pill sp-upcoming">Paid/);
  assert.match(section, /status-pill sp-cancelled">Cancelled/);
  assert.match(section, /Refund Pending/);
  assert.match(section, /Refund Processing/);
  assert.match(section, /Refunded/);
  assert.match(section, /data-refund-status/);
});

test('Consultant payouts display paid cancellations for audit but never make them payable', () => {
  const start = app.indexOf('function paidCancelledBooking(row)');
  const end = app.indexOf('window.guidcyRenderConsultantPayoutGroups=renderConsultantPayoutGroups;', start);
  const section = app.slice(start, end);

  assert.ok(start >= 0 && end > start, 'missing Supabase-backed consultant payout renderer');
  assert.match(section, /function cancelledPayoutAudit\(rows\)/);
  assert.match(section, /Cancelled bookings excluded from consultant payouts/);
  assert.match(section, /Booking ID/);
  assert.match(section, /Refund amount/);
  assert.match(section, /Not Eligible · ₹0/);
  assert.match(section, /bookings=allBookings\.filter\(paidBooking\)/);
  assert.match(section, /cancelledBookings=allBookings\.filter\(paidCancelledBooking\)/);
  assert.match(section, /cancelledPayoutAudit\(cancelledBookings\)/);
  assert.match(section, /No verified paid, completed bookings eligible for consultant payout/);
});

test('Fallback payout controls also reject cancelled and otherwise ineligible bookings', () => {
  const start = app.indexOf('function payoutEligibleForAdmin(b)');
  const end = app.indexOf('var prevAD=window.swAD; window.swAD=function(view,btn){if(view===\'bookings\'', start);
  const section = app.slice(start, end);

  assert.ok(start >= 0 && end > start, 'missing fallback admin payout controls');
  assert.match(section, /if\(!payoutEligibleForAdmin\(row\)\)/);
  assert.match(section, /rows=onlyPayout\?allRows\.filter\(payoutEligibleForAdmin\):allRows/);
  assert.match(section, /Cancelled booking · ₹0 consultant payout due/);
  assert.doesNotMatch(section, /cancelled\?[^;]*Mark as Paid/);
});

test('Promo Codes sidebar button keeps the icon alignment used by other admin buttons', () => {
  assert.match(app, /🏷️<\/span> Promo Codes/);
});
