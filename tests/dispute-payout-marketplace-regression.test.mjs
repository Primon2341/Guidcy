import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

test('disputes render and track from Supabase without synthetic booking backfill',()=>{
  const app=read('assets/js/app.js');
  assert.match(app,/Do not manufacture dispute rows from booking status[\s\S]*?return \[\];/);
  assert.match(app,/guidcyRenderDisputesFromSupabase/);
  assert.match(app,/from\('disputes'\)\.select\('\*'\)\.eq\('is_deleted',false\)/);
  assert.match(app,/window\.gdispTrack=window\.guidcyTrackDisputeFromSupabase/);
  assert.match(app,/No dispute found in Supabase for that Dispute ID/);
});

test('consultant payouts are grouped and one action updates the complete pending batch',()=>{
  const app=read('assets/js/app.js');
  assert.match(app,/Weekly payout summary by consultant/);
  assert.match(app,/Bookings in this payout/);
  assert.match(app,/Amount paid so far/);
  assert.match(app,/Pending amount/);
  assert.match(app,/guidcyConfirmConsultantBatchPayout/);
  assert.match(app,/\.update\(\{payout_status:'paid'[\s\S]*?\.in\('id',ids\)\.select\('id,payout_status,payout_transaction_id'\)/);
  assert.match(app,/saved\.data\.length!==ids\.length/);
  assert.doesNotMatch(app,/guidcyOpenAdminPayoutModal=function\(id\)[^\n]*bVal\(b,/);
  assert.doesNotMatch(app,/guidcyConfirmAdminPayout=async function\(id\)[^\n]*bVal\(b,/);
});

test('marketplace payouts and purchases require verified gateway completion',()=>{
  const app=read('assets/js/app.js');
  const api=read('api/verify-payment.js');
  const utils=read('lib/razorpay-utils.js');
  assert.match(app,/reconcile:true/);
  assert.match(app,/o\.download_granted===true&&completed&&gatewayProof/);
  assert.match(app,/guidcyInstallPurchaseReconciliation/);
  assert.match(api,/body\.reconcile === true/);
  assert.match(api,/fetchRazorpayOrderPayments/);
  assert.match(api,/Number\(item\.amount \|\| 0\) === expectedPaise/);
  assert.match(api,/await createMarketplacePayout\(patched\)/);
  assert.match(utils,/async function fetchRazorpayOrderPayments/);
});

test('dispute migration hides only legacy synthetic rows and secures tracking',()=>{
  const sql=read('supabase/migrations/20260822203428_dispute_supabase_truth.sql');
  assert.match(sql,/add column if not exists is_deleted boolean not null default false/);
  assert.match(sql,/issue_type = 'Session issue \(raised by consultant\)'/);
  assert.match(sql,/d\.is_deleted = false/);
  assert.match(sql,/set search_path = ''/);
  assert.match(sql,/revoke all on function public\.track_dispute\(text\) from public/);
});

test('dashboard refreshes keep current content until the fresh Supabase response arrives',()=>{
  const app=read('assets/js/app.js');
  assert.match(app,/var disputeRenderToken=0/);
  assert.match(app,/var payoutRenderToken=0/);
  assert.match(app,/m\.dataset\.guidcyTruthView!=='disputes'/);
  assert.match(app,/m\.dataset\.guidcyTruthView!=='consultant-payouts'/);
  assert.match(app,/if\(token!==disputeRenderToken\)return/);
  assert.match(app,/if\(token!==payoutRenderToken\)return/);
});

test('consultant disputes are rendered only from active Supabase dispute rows',()=>{
  const app=read('assets/js/app.js');
  assert.match(app,/The disputes table is the authority/);
  assert.match(app,/\.eq\('is_deleted',false\)\.in\('booking_reference',ids\)/);
  assert.match(app,/if\(!d\)return '';/);
  assert.match(app,/if\(ss==='disputed'&&b\.__dispute\)/);
  assert.doesNotMatch(app,/esc\(\(d&&d\.status\)\|\|'Open'\)/);
});

test('meeting creation and joining accept Google Meet only',()=>{
  const app=read('assets/js/app.js');
  const index=read('index.html');
  const forbidden=['meet'+'.jit'+'.si','8x'+'8.vc','Jit'+'si','j'+ 'itsi-container'];
  for(const token of forbidden){
    assert.equal(app.toLowerCase().includes(token.toLowerCase()),false,`app contains removed conference provider token: ${token}`);
    assert.equal(index.toLowerCase().includes(token.toLowerCase()),false,`index contains removed conference provider token: ${token}`);
  }
  assert.match(app,/url\.hostname==='meet\.google\.com'/);
  assert.match(app,/window\.guidcyIsGoogleMeetLink=isGoogleMeetLink/);
  assert.match(app,/throw new Error\('Google Meet service is not ready/);
  assert.match(app,/Could not create the Google Meet link/);
});

test('weekly payout modal scrolls independently while the page is pinned',()=>{
  const app=read('assets/js/app.js');
  const css=read('assets/css/patches.css');
  assert.match(app,/lockConsultantPayoutBackground\(\)/);
  assert.match(app,/window\.guidcyCloseConsultantBatchPayout/);
  assert.match(css,/body\.guidcy-payout-modal-scroll-lock\{position:fixed!important/);
  assert.match(css,/#guidcy-consultant-batch-modal \.[^{]+\{max-height:calc\(100dvh - 36px\)!important;overflow-y:auto!important/);
});
