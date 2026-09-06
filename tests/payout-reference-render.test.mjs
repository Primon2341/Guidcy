/* The Payout cell shows a status pill and, under it, the payout reference.
   28 bookings have the literal string "Paid" in payout_transaction_id - typed
   into the transaction-id box instead of a UTR - so the cell read "Paid" twice.
   A real reference must still show, so the fix is to drop only a reference that
   repeats the status. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

function loadHelper() {
  const from = app.indexOf('window.guidcyPayoutRef=function');
  assert.ok(from > -1, 'the payout reference helper must exist');
  const to = app.indexOf('\n  };', from) + 5;
  const win = {};
  new Function('window', app.slice(from, to))(win);
  return win.guidcyPayoutRef;
}

test('the payout reference never repeats the status pill', () => {
  const ref = loadHelper();
  assert.equal(ref('paid', 'Paid'), '', 'this is the reported duplicate');
  assert.equal(ref('not_eligible', 'Not Eligible'), '', 'underscores and case must not defeat it');
  assert.equal(ref('pending', '  pending  '), '', 'padding must not defeat it');
  assert.equal(ref('paid', ''), '');
  assert.equal(ref('paid', null), '');
  assert.equal(ref('paid', undefined), '');
});

test('a genuine payout reference still shows, and is escaped', () => {
  const ref = loadHelper();
  assert.equal(ref('paid', 'UTR123456789'), '<br><small>UTR123456789</small>');
  assert.equal(ref('paid', 'NEFT/2026/0093'), '<br><small>NEFT/2026/0093</small>');
  assert.equal(ref('paid', '<b>x</b>'), '<br><small>&lt;b&gt;x&lt;/b&gt;</small>',
    'the reference is operator input and must stay escaped');
});

test('every payout cell goes through the helper', () => {
  assert.equal((app.match(/window\.guidcyPayoutRef\(/g) || []).length, 4,
    'all four payout tables must use it, or one keeps printing the duplicate');
  assert.doesNotMatch(app, /<br><small>'\+h\(b\.payout_transaction_id\|\|''\)/,
    'no payout cell may still print the raw reference');
  assert.doesNotMatch(app, /<br><small>'\+esc\(p\?\.payout_transaction_id\|\|''\)/);
});
