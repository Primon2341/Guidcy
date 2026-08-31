import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');

test('consultant earnings uses the same paid predicate and payable calculation as consultant payouts', () => {
  const start = app.indexOf('/* ---------- Consultant earnings summary ---------- */');
  const end = app.indexOf('/* ---------- wiring ---------- */', start);
  const section = app.slice(start, end);

  assert.match(app, /window\.guidcyBookingIsPaidForPayout=paidBooking/);
  assert.match(section, /window\.guidcyBookingIsPaidForPayout\?window\.guidcyBookingIsPaidForPayout\(b\)/);
  assert.match(section, /window\.guidcyBookingPayable\?window\.guidcyBookingPayable\(b\)/);
  assert.match(section, /payment_status,payment_verified,payout_status/);
  assert.doesNotMatch(section, /ps==='success'\|\|ps==='completed'\|\|b\.razorpay_order_id/);
  assert.doesNotMatch(section, /Math\.round\(gross\*COMMISSION_RATE\)/);
  assert.match(section, /row\.pending=roundMoney\(row\.pending\+payable\)/);
});

test('find-expert filtering shares one consultant source load across startup callers', () => {
  assert.match(app, /const GUIDCY_CONSULTANT_SOURCE_TTL=8000/);
  assert.match(app, /if\(guidcyConsultantSourceInflight\)return guidcyConsultantSourceInflight/);
  assert.match(app, /let rows=\(await loadConsultantSource\(\)\)\.map/);
  assert.match(app, /table==='consultants'\|\|table==='profiles'/);
  assert.match(app, /guidcyInvalidateConsultantSourceCache/);
});

test('featured expert ranks and limits never display or persist the legacy 9999 sentinel', () => {
  const start = app.indexOf('function cleanFeaturedLimit');
  const end = app.indexOf('const helpTopics=', start);
  const section = app.slice(start, end);

  assert.match(section, /limit>=1&&limit<9999\?limit:fallback/);
  assert.match(section, /rank>=1&&rank<9999\?Math\.floor\(rank\):fallback/);
  assert.match(section, /value="\$\{esc\(cleanFeaturedRank\(ranks\[k\],i\+1\)\)\}"/);
  assert.match(section, /selected\.forEach\(\(key,index\)=>\{ranks\[key\]=index\+1\}\)/);
  assert.doesNotMatch(section, /Number\(inp\.value\|\|9999\)/);
});

test('homepage route always calls the final featured-aware initHome renderer', () => {
  const renderStart = app.indexOf('function renderPage(page)');
  const renderEnd = app.indexOf('function go(page)', renderStart);
  const renderSection = app.slice(renderStart, renderEnd);

  assert.match(renderSection, /home:\(\)=>\{const fn=typeof window\.initHome==='function'\?window\.initHome:initHome;return fn\(\)\}/);
  assert.doesNotMatch(renderSection, /home:initHome/);
  assert.match(app, /guidcySaveFeaturedLimit=function\(\)[\s\S]*?try\{window\.initHome\(\)\}/);
});

test('homepage card render boundary cannot be repainted with every consultant', () => {
  const start = app.indexOf('/* === guidcy-featured-experts-final-render-boundary ===');
  const section = app.slice(start);

  assert.ok(start >= 0);
  assert.match(section, /String\(containerId\|\|''\)==='cons-grid'/);
  assert.match(section, /window\.guidcyOrderFeaturedExperts\(rows\)/);
  assert.match(section, /stored>=1&&stored<9999/);
  assert.match(section, /rows=rows\.slice\(0,limit\)/);
  assert.match(section, /renderGrid=window\.renderGrid/);
});

test('marketplace mark-paid action reuses the compact webinar payout button sizing', () => {
  assert.match(app, /class="green-btn guidcy-paid-mini-btn gmkt-pay-action"/);
  assert.match(css, /\.gmkt-pay-action\{width:auto!important;min-width:auto!important;padding:7px 12px!important;border-radius:999px!important/);
});
