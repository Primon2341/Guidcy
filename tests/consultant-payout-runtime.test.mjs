import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const start = source.indexOf('/* === guidcy-supabase-truth-weekly-payouts ===');
const end = source.indexOf('/* === anonymous === */', start);
const payoutLayer = source.slice(start, end);

test('weekly payout action settles only verified paid completed bookings in one consultant batch', async () => {
  const consultantId = '11111111-1111-4111-8111-111111111111';
  const bookings = [
    { id: 'booking-1', consultant_id: consultantId, consultant_name: 'Test Expert', consultant_email: 'expert@example.com', status: 'completed', session_status: 'completed', payment_status: 'paid', payment_verified: true, payment_amount: 1050, payout_status: 'pending', created_at: '2026-08-23T00:00:00Z' },
    { id: 'booking-2', consultant_id: consultantId, consultant_name: 'Test Expert', consultant_email: 'expert@example.com', status: 'completed', session_status: 'completed', payment_status: 'success', payment_verified: true, payment_amount: 2100, payout_status: 'pending', created_at: '2026-08-23T00:01:00Z' },
    { id: 'booking-paid', consultant_id: consultantId, consultant_name: 'Test Expert', consultant_email: 'expert@example.com', status: 'completed', session_status: 'completed', payment_status: 'paid', payment_verified: true, payment_amount: 100, payout_status: 'paid', created_at: '2026-08-20T00:00:00Z' },
    { id: 'booking-cancelled', consultant_id: consultantId, consultant_name: 'Test Expert', consultant_email: 'expert@example.com', status: 'cancelled', session_status: 'cancelled', payment_status: 'success', payment_verified: true, payment_amount: 1000, refund_status: 'refund_pending', payout_status: 'blocked', created_at: '2026-08-24T00:00:00Z' },
    { id: 'booking-not-complete', consultant_id: consultantId, consultant_name: 'Test Expert', consultant_email: 'expert@example.com', status: 'confirmed', session_status: 'scheduled', payment_status: 'success', payment_verified: true, payment_amount: 1000, payout_status: 'not_eligible', created_at: '2026-08-24T00:01:00Z' },
  ];
  const consultants = [{ id: consultantId, name: 'Test Expert', email: 'expert@example.com' }];
  const logs = [];
  const updatedIds = [];

  function response(data) {
    return { then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); } };
  }
  function table(name) {
    let mode = 'select';
    let mutation = null;
    let ids = null;
    const chain = {
      select() { return chain; },
      order() { return chain; },
      in(field, values) { if (field === 'id') ids = values.map(String); return chain; },
      update(value) { mode = 'update'; mutation = value; return chain; },
      insert(value) { mode = 'insert'; mutation = value; return chain; },
      then(resolve, reject) {
        try {
          if (mode === 'select') {
            const rows = name === 'bookings' ? bookings : name === 'consultants' ? consultants : [];
            return response(rows.slice()).then(resolve, reject);
          }
          if (mode === 'update') {
            const rows = bookings.filter((row) => !ids || ids.includes(String(row.id)));
            rows.forEach((row) => { Object.assign(row, mutation); updatedIds.push(row.id); });
            return response(rows).then(resolve, reject);
          }
          if (mode === 'insert') {
            if (name === 'consultant_payout_logs') logs.push(...mutation);
            return response(mutation).then(resolve, reject);
          }
          return response([]).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return chain;
  }

  const elements = new Map([
    ['adash-main', { innerHTML: '', dataset: {} }],
    ['guidcy-batch-payout-txn', { value: 'UTR-RUNTIME-TEST' }],
    ['guidcy-batch-payout-mode', { value: 'bank_transfer' }],
    ['guidcy-batch-payout-note', { value: '' }],
    ['guidcy-batch-payout-confirm', { disabled: false, textContent: 'Confirm Paid' }],
  ]);
  const body = { style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, contains() { return true; } };
  const document = {
    body,
    documentElement: { classList: { add() {}, remove() {} }, scrollTop: 0 },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll() { return []; },
    createElement() { return { className: '', id: '', innerHTML: '', setAttribute() {}, addEventListener() {}, remove() {} }; },
    addEventListener() {},
  };
  const client = {
    from: table,
    auth: { getUser: async () => ({ data: { user: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.com' } } }) },
  };
  const window = {
    guidcyGetSupabaseClient: () => client,
    currentUser: { id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.com' },
    toast() {},
    addEventListener() {},
    sendGuidcyEmail: async () => true,
    location: { origin: 'https://guidcy.com' },
  };
  const context = vm.createContext({ window, document, sessionStorage: { setItem() {} }, location: window.location, console, setTimeout, clearTimeout, Map, Promise, Date, Number, String, Array, Math, RegExp });

  vm.runInContext(payoutLayer, context);
  await window.guidcyRenderConsultantPayoutGroups();
  const group = window.__guidcyConsultantPayoutGroups[0];
  assert.equal(window.__guidcyConsultantPayoutGroups.length, 1);
  assert.equal(group.pendingBookings, 2);
  assert.equal(group.pending, 2550);

  await window.guidcyConfirmConsultantBatchPayout(group.id);
  assert.deepEqual(updatedIds.sort(), ['booking-1', 'booking-2']);
  assert.equal(logs.length, 2);
  assert.ok(bookings.slice(0, 2).every((row) => row.payout_status === 'paid' && row.payout_transaction_id === 'UTR-RUNTIME-TEST'));
  assert.equal(bookings[3].payout_status, 'blocked');
  assert.equal(bookings[4].payout_status, 'not_eligible');
});
