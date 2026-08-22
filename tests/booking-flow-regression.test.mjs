import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const built = fs.readFileSync(new URL('../public/assets/js/app.js', import.meta.url), 'utf8');

test('deployable JavaScript is optimized from the current source', () => {
  assert.ok(built.length < source.length);
  assert.match(built, /__GUIDCY_FINAL_PAYMENT_PROMO_STATE_FIX__/);
  assert.match(built, /guidcy_booking_payment_context_v4/);
});

test('dashboard-to-public navigation remains inside the SPA', () => {
  assert.doesNotMatch(source, /if\(leavingDashboard\)\{location\.assign\(target\.url\);return\}/);
  assert.match(source, /All internal navigation remains in the SPA/);
});

test('booking restores auth before deciding that login is required', () => {
  assert.match(source, /async function restoreBookingSession\(\)/);
  assert.match(source, /if\(!isLoggedIn\(\)\)await restoreBookingSession\(\)/);
});

test('missing slot is handled before expired availability validation', () => {
  const start = source.indexOf('window.startBooking=function(){', source.indexOf('guidcy-final-payment-promo-state-fix'));
  const end = source.indexOf('if(!userNow())', start);
  const block = source.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.ok(block.indexOf("return 'missing_slot'") < block.indexOf("return 'expired_slot'"));
});

test('profile and payment context survive a browser refresh', () => {
  assert.match(source, /guidcy_last_consultant_id/);
  assert.match(source, /guidcyRestoreBookingContext/);
  assert.match(source, /guidcy_booking_payment_context_v4/);
  assert.match(source, /if\(!slotNow\(\)\|\|onLockedFlow\)set\('selSlot',snapshot\.timeSlot\)/);
  assert.match(source, /consultant:c\|\|null/);
  assert.match(source, /target\.url='\/consultant\/'\+encodeURIComponent\(consultantId\)/);
});

test('payment activation explicitly re-anchors the footer', () => {
  const start = source.indexOf('function showPaymentPage(s)');
  const end = source.indexOf('window.startBooking=function()', start);
  assert.match(source.slice(start, end), /guidcyPlaceFooterAfterPages/);
});
