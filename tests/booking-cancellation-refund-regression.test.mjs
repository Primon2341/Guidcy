import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260902030406_booking_cancellation_refund_workflow.sql', import.meta.url), 'utf8');
const bookingSessionLogActionMigration = readFileSync(new URL('../supabase/migrations/20260902163657_normalize_booking_session_log_cancel_action.sql', import.meta.url), 'utf8');
const financialLifecycleMigration = readFileSync(new URL('../supabase/migrations/20260902174104_booking_cancellation_payout_lifecycle.sql', import.meta.url), 'utf8');
const cancellation = readFileSync(new URL('../lib/booking-cancellation.js', import.meta.url), 'utf8');
const refund = readFileSync(new URL('../lib/booking-refund.js', import.meta.url), 'utf8');
const paymentApi = readFileSync(new URL('../api/verify-payment.js', import.meta.url), 'utf8');
const meetApi = readFileSync(new URL('../api/create-meet-link.js', import.meta.url), 'utf8');
const googleMeet = readFileSync(new URL('../lib/google-meet.js', import.meta.url), 'utf8');

test('cancellation migration keeps one booking row authoritative', () => {
  assert.match(migration, /add column if not exists refund_status text not null default 'not_required'/);
  assert.match(migration, /'refund_pending'[\s\S]*'refund_processing'[\s\S]*'refunded'[\s\S]*'refund_failed'/);
  assert.match(migration, /create or replace function public\.guidcy_cancel_booking/);
  assert.match(migration, /for update/);
  assert.match(migration, /set status = 'cancelled',[\s\S]*session_status = 'cancelled'/);
  assert.match(migration, /meet_link = null,[\s\S]*meeting_status = 'disabled'/);
  assert.match(migration, /payout_status = case when v_booking\.payout_status = 'paid' then 'paid' else 'not_required' end/);
  assert.match(migration, /payment_verified is true[\s\S]*v_effective_payment_status = 'success'/);
  assert.match(migration, /revoke all on function public\.guidcy_cancel_booking[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.guidcy_cancel_booking[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /create table\s+public\.(booking_cancellations|booking_refunds|payment_refunds)/i);
});

test('legacy cancellation audit action is normalized before the existing check constraint', () => {
  assert.match(bookingSessionLogActionMigration, /guidcy_normalize_booking_session_log_action_type/);
  assert.match(bookingSessionLogActionMigration, /new\.action_type := 'session_cancelled'/);
  assert.match(bookingSessionLogActionMigration, /before insert or update of action_type on public\.booking_session_logs/);
  assert.doesNotMatch(bookingSessionLogActionMigration, /drop constraint/i);
});

test('legacy false refunds are corrected and paid cancellations enter the refund queue', () => {
  assert.match(migration, /payment_status = 'success'[\s\S]*payment_status = 'refunded'[\s\S]*refund_transaction_id is null/);
  assert.match(migration, /then 'refund_pending'/);
  assert.match(migration, /refund_requested_at/);
  assert.match(migration, /bookings_refund_queue_idx/);
  assert.match(migration, /bookings_refund_idempotency_unique_idx/);
});

test('financial lifecycle keeps paid history separate from cancelled refund and payout state', () => {
  assert.match(financialLifecycleMigration, /payment_status = 'success'/);
  assert.match(financialLifecycleMigration, /'blocked', 'not_eligible'/);
  assert.match(financialLifecycleMigration, /create or replace function public\.guidcy_enforce_booking_financial_lifecycle/);
  assert.match(financialLifecycleMigration, /new\.status := 'cancelled';[\s\S]*new\.session_status := 'cancelled';/);
  assert.match(financialLifecycleMigration, /new\.meet_link := null;[\s\S]*new\.meeting_status := 'disabled';/);
  assert.match(financialLifecycleMigration, /new\.payout_status := case[\s\S]*'not_eligible'[\s\S]*'blocked'/);
  assert.match(financialLifecycleMigration, /v_completed and v_verified_paid/);
  assert.match(financialLifecycleMigration, /Only verified, fully completed bookings can be marked paid out/);
  assert.match(financialLifecycleMigration, /lower\(coalesce\(b\.status, ''\)\) = 'completed'/);
  assert.match(financialLifecycleMigration, /lower\(coalesce\(b\.session_status, ''\)\) = 'completed'/);
});

test('meeting creation persists the Calendar event id and cancellation deletes the event', () => {
  assert.match(meetApi, /google_calendar_event_id: created\.eventId \|\| null/);
  assert.match(meetApi, /meeting_status: 'ready'/);
  assert.match(meetApi, /A meeting cannot be created for a cancelled booking/);
  assert.match(googleMeet, /method: 'DELETE'/);
  assert.match(googleMeet, /findCalendarEventByMeetLink/);
  assert.match(googleMeet, /sendUpdates=all/);
  assert.match(cancellation, /deleteMeetEvent/);
  assert.match(cancellation, /meeting_status: 'disabled'/);
  assert.match(cancellation, /consultants\?id=eq\.\$\{encodeURIComponent\(booking\.consultant_id\)\}&select=id,profile_id&limit=1/);
  assert.doesNotMatch(cancellation, /select=id,profile_id,email/);
  assert.match(meetApi, /body\.action === 'cancel_booking'/);
});

test('final browser cancellation override wins and purges stale upcoming caches', () => {
  const workflow = app.indexOf('/* === guidcy-booking-cancellation-refund-workflow-v1 === */');
  const routeGuard = app.indexOf('/* === guidcy-tab-return-route-stability-v1 ===');
  assert.ok(workflow > routeGuard, 'the atomic cancellation override must be the final last-wins layer');
  const source = app.slice(workflow);
  assert.match(source, /postJson\('\/api\/create-meet-link'/);
  assert.match(source, /removeBookingFromStorage\(localStorage,RECENT_KEY,bookingId\)/);
  assert.match(source, /removeBookingFromStorage\(localStorage,MEETING_PENDING_KEY,bookingId\)/);
  assert.match(source, /window\.lastBooking=null/);
  assert.match(source, /guidcyForceBookingStatusRefresh/);
  assert.match(source, /window\.guidcyCancelSessionWithReason=function/);
  assert.match(source, /This session was cancelled and its meeting link is disabled/);
  assert.match(app, /function saveRows\(list\)\{list=\(list\|\|\[\]\)\.filter\(rowAgeOk\)\.filter\(isLive\)/);
  assert.match(app, /if\(!row\|\|!\(row\.id\|\|row\.booking_id\)\|\|!isLive\(row\)\)return/);
});

test('admin payments has a directly filterable refund queue and gateway action', () => {
  const source = app.slice(app.indexOf('/* === guidcy-booking-cancellation-refund-workflow-v1 === */'));
  for (const label of ['Booking ID', 'User', 'Consultant', 'Amount paid', 'Cancellation date', 'Payment', 'Booking', 'Refund status', 'Consultant payout', 'Action']) {
    assert.ok(source.includes(label), `missing admin refund column: ${label}`);
  }
  assert.match(source, /guidcy-admin-refund-filter/);
  assert.match(source, /Refund Pending/);
  assert.match(source, /Process Refund/);
  assert.match(source, /Sync Refund/);
  assert.match(source, /postJson\('\/api\/verify-payment'/);
  assert.match(source, /view==='payments'/);
});

test('refund API uses deterministic idempotency while retaining paid payment history', () => {
  assert.match(refund, /guidcy-booking-refund-\$\{booking\.id\}/);
  assert.match(refund, /refund_status: 'refund_processing'/);
  assert.match(refund, /refundLifecycleStatus/);
  assert.match(refund, /status === 'processed'\) return 'refunded'/);
  assert.match(refund, /payment_status: 'success'/);
  assert.match(refund, /payout_status: lifecycle === 'refunded' \? 'not_eligible' : 'blocked'/);
  assert.match(refund, /action_type: lifecycle === 'refunded' \? 'refund_processed' : 'refund_requested'/);
  assert.match(refund, /fetchRazorpayRefund/);
  assert.match(refund, /createRazorpayRefund/);
  assert.match(paymentApi, /body\.action === 'refund_booking'/);
  assert.doesNotMatch(refund, /insert\([^)]*bookings/i);
});

test('late captured payment callback cannot resurrect a cancelled booking', () => {
  assert.match(paymentApi, /function isCancelledBooking/);
  assert.match(paymentApi, /status: cancelled \? 'cancelled' : 'confirmed'/);
  assert.match(paymentApi, /session_status: cancelled \? 'cancelled' : row\.session_status \|\| 'scheduled'/);
});

test('processed booking refund retains paid history and permanently blocks payout eligibility', async () => {
  const utilsPath = require.resolve('../lib/razorpay-utils.js');
  const refundPath = require.resolve('../lib/booking-refund.js');
  const audit = [];
  let stored = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'cancelled',
    session_status: 'cancelled',
    payment_status: 'success',
    payment_verified: true,
    payout_status: 'blocked',
    refund_status: 'refund_pending',
    refund_amount: 1000,
    razorpay_payment_id: 'pay_123',
  };
  require.cache[utilsPath] = { id: utilsPath, filename: utilsPath, loaded: true, exports: {
    clean: (value, max = 500) => String(value ?? '').trim().slice(0, max),
    getAuthenticatedUser: async () => ({ id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.com' }),
    first: async () => ({ id: '22222222-2222-4222-8222-222222222222', role: 'admin', email: 'admin@example.com' }),
    loadPaymentRecord: async () => stored,
    authoritativeAmount: async () => 1000,
    moneyToPaise: (amount) => Math.round(Number(amount) * 100),
    supabaseRest: async (path, options) => {
      if (path.startsWith('booking_session_logs')) { audit.push(options.body); return []; }
      stored = { ...stored, ...(options.body || {}), refund_status: 'refund_processing' };
      return [stored];
    },
    patchById: async (_flow, _id, patch) => { stored = { ...stored, ...patch }; return stored; },
    createRazorpayRefund: async () => ({ id: 'rfnd_123', status: 'processed', amount: 100000 }),
    fetchRazorpayRefund: async () => ({ id: 'rfnd_123', status: 'processed', amount: 100000 }),
  }};
  delete require.cache[refundPath];
  try {
    const { refundBookingRequest } = require(refundPath);
    const result = await refundBookingRequest({ headers: { authorization: 'Bearer token' } }, { bookingId: stored.id });
    assert.equal(result.data.refunded, true);
    assert.equal(stored.payment_status, 'success');
    assert.equal(stored.refund_status, 'refunded');
    assert.equal(stored.payout_status, 'not_eligible');
    assert.equal(audit.at(-1).action_type, 'refund_processed');
  } finally {
    delete require.cache[refundPath];
    delete require.cache[utilsPath];
  }
});

test('payout screens and financial transaction displays use completed paid bookings only', () => {
  assert.match(app, /bookingStatus==='completed'&&sessionStatus==='completed'&&\(payoutStatus==='pending'\|\|payoutStatus==='paid'\)/);
  assert.match(app, /payout-eligible completed bookings/);
  assert.match(app, /Payment: <b>/);
  assert.match(app, /Recent Transactions/);
  assert.match(app, /Cancelled bookings are excluded from pending consultant payouts/);
});

test('cancellation service calls the atomic RPC once and returns the same booking id', async () => {
  const utilsPath = require.resolve('../lib/razorpay-utils.js');
  const meetPath = require.resolve('../lib/google-meet.js');
  const cancellationPath = require.resolve('../lib/booking-cancellation.js');
  const calls = [];
  const booking = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    consultant_id: '33333333-3333-4333-8333-333333333333',
    status: 'confirmed',
    session_status: 'scheduled',
    payment_status: 'success',
    payment_verified: true,
    meet_link: 'https://meet.google.com/abc-defg-hij',
    google_calendar_event_id: 'calendar-event-1',
  };
  require.cache[utilsPath] = { id: utilsPath, filename: utilsPath, loaded: true, exports: {
    clean: (value, max = 500) => String(value ?? '').trim().slice(0, max),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return body; },
    readBody: async (req) => req.body || {},
    getAuthenticatedUser: async () => ({ id: booking.user_id, email: 'user@example.com' }),
    loadPaymentRecord: async () => booking,
    first: async () => null,
    supabaseRest: async (path, options) => {
      calls.push({ path, options });
      return { ...booking, status: 'cancelled', session_status: 'cancelled', meet_link: null, meeting_status: 'disabled', refund_status: 'refund_pending' };
    },
    patchById: async (_flow, _id, body) => ({ ...booking, ...body, status: 'cancelled', session_status: 'cancelled', meet_link: null, refund_status: 'refund_pending' }),
  }};
  require.cache[meetPath] = { id: meetPath, filename: meetPath, loaded: true, exports: {
    isMeetLink: (value) => /^https:\/\/meet\.google\.com\//.test(String(value || '')),
    deleteMeetEvent: async (input) => { calls.push({ deleteMeetEvent: input }); return { ok: true, eventId: input.eventId }; },
  }};
  delete require.cache[cancellationPath];
  const { cancelBookingRequest } = require(cancellationPath);
  const result = await cancelBookingRequest({ headers: { authorization: 'Bearer token' } }, { bookingId: booking.id, role: 'user' });
  assert.equal(result.booking.id, booking.id);
  assert.equal(calls.filter((call) => call.path === 'rpc/guidcy_cancel_booking').length, 1);
  assert.equal(calls.find((call) => call.deleteMeetEvent).deleteMeetEvent.eventId, booking.google_calendar_event_id);
  delete require.cache[cancellationPath];
  delete require.cache[utilsPath];
  delete require.cache[meetPath];
});

test('Razorpay refund helper sends paise amount with the refund idempotency header', async () => {
  const utilsPath = require.resolve('../lib/razorpay-utils.js');
  delete require.cache[utilsPath];
  const originalFetch = global.fetch;
  const originalId = process.env.RAZORPAY_KEY_ID;
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';
  let request = null;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'rfnd_123', status: 'processed', amount: 105 }) };
  };
  try {
    const { createRazorpayRefund } = require(utilsPath);
    const refund = await createRazorpayRefund('pay_123', { amount: 105, idempotencyKey: 'guidcy-booking-refund-1' });
    assert.equal(refund.id, 'rfnd_123');
    assert.match(request.url, /\/v1\/payments\/pay_123\/refund$/);
    assert.equal(request.options.headers['X-Refund-Idempotency'], 'guidcy-booking-refund-1');
    assert.equal(JSON.parse(request.options.body).amount, 105);
  } finally {
    global.fetch = originalFetch;
    if (originalId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = originalId;
    if (originalSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = originalSecret;
    delete require.cache[utilsPath];
  }
});
