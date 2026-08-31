import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const sectionStart = source.indexOf('/* ---------- Webinar payouts ---------- */');
const helperStart = source.indexOf('function roundMoney(v)', sectionStart);
const helperEnd = source.indexOf('async function loadWebinarPayoutRows', helperStart);
const sectionEnd = source.indexOf('/* ---------- Consultant earnings summary ---------- */', sectionStart);

test('webinar payout math keeps paise for small payments', () => {
  assert.ok(sectionStart >= 0 && helperStart >= 0 && helperEnd > helperStart);
  const context = {};
  vm.runInNewContext(
    `${source.slice(helperStart, helperEnd)}\nthis.roundMoney=roundMoney;this.webinarPayable=webinarPayable;`,
    context,
  );

  assert.equal(context.roundMoney(1 * 0.15), 0.15);
  assert.equal(context.roundMoney(1 - context.roundMoney(1 * 0.15)), 0.85);
  assert.equal(context.webinarPayable({ payout_status: 'pending', payout_amount: 1, _payable: 0.85 }), 0.85);
  assert.equal(context.webinarPayable({ payout_status: 'paid', payout_amount: 1, _payable: 0.85 }), 1);
  assert.equal(context.webinarPayable({ payout_status: 'paid', payout_amount: 0, _payable: 0.85 }), 0);
});

test('pending webinar UI and confirmation use recalculated payable, not stale payout_amount', () => {
  const section = source.slice(sectionStart, sectionEnd);
  assert.match(section, /var comm=roundMoney\(collected\*COMMISSION_RATE\)/);
  assert.match(section, /var payable=roundMoney\(Math\.max\(0,collected-comm\)\)/);
  assert.ok((section.match(/webinarPayable\(/g) || []).length >= 6);
  assert.doesNotMatch(section, /payout_amount\|\|(?:w|row)\._payable/);
});
