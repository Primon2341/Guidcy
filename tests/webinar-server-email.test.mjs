/* The webinar confirmation used to be sent by the browser after verify-payment
   returned. Close the tab in that window and the registration was paid and
   confirmed but nobody was ever told. It is sent from the server now. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const utils = require_('../lib/razorpay-utils.js');
const { sendWebinarRegistrationEmails, alreadyEmailed } = require_('../lib/webinar-emails.js');

function harness({ attendeeFails = false, noWebinarRow = false } = {}) {
  const sent = [];
  const patches = [];
  const realFetch = global.fetch;
  const realFirst = utils.first;
  const realPatch = utils.patchById;
  const realEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

  utils.first = async () => (noWebinarRow ? null : {
    id: 'W1', title: 'How to build a fully functional website',
    date: '2026-09-10', time: '23:49', speaker: 'Prakhar',
    publisher_email: 'host@example.com',
  });
  utils.patchById = async (flow, id, body) => { patches.push({ flow, id, body }); return { id, ...body }; };
  global.fetch = async (url, opts) => {
    const payload = JSON.parse(opts.body);
    sent.push({ url: String(url), type: payload.type, to: payload.to, role: payload.recipientRole, data: payload.data });
    const fail = attendeeFails && payload.type === 'webinar_registration_user';
    return { ok: !fail, text: async () => JSON.stringify(fail ? { ok: false, error: 'boom' } : { ok: true }) };
  };
  const restore = () => {
    global.fetch = realFetch; utils.first = realFirst; utils.patchById = realPatch;
    process.env.SUPABASE_URL = realEnv.url; process.env.SUPABASE_SERVICE_ROLE_KEY = realEnv.key;
  };
  return { sent, patches, restore };
}

const REG = {
  id: 'REG-1788622743387-12775', webinar_id: 'W1',
  name: 'Prakhar Tripathi', email: 'attendee@example.com',
  payment_status: 'success', registration_status: 'confirmed', payment_verified: true,
};

test('a verified registration emails the attendee, the host and admin', async () => {
  const h = harness();
  try {
    const out = await sendWebinarRegistrationEmails({ ...REG });
    assert.deepEqual(h.sent.map(s => s.type), [
      'webinar_registration_user', 'webinar_registration_consultant', 'new_webinar_registration_admin']);
    assert.equal(h.sent[0].to, 'attendee@example.com');
    assert.equal(h.sent[1].to, 'host@example.com');
    assert.equal(h.sent[2].role, 'admin', 'admin address is resolved server-side, so `to` stays empty');
    assert.equal(h.sent[2].to, '');
    // the real webinar details travel with it, not the placeholders the old client send used
    assert.equal(h.sent[0].data.webinar_title, 'How to build a fully functional website');
    assert.equal(h.sent[0].data.webinar_date, '2026-09-10');
    // and it goes through the one Edge Function that owns the templates
    assert.match(h.sent[0].url, /\/functions\/v1\/send-guidcy-email$/);
    // flags are set so the browser's fallback send stands down
    assert.equal(out.registration_email_sent, true);
    assert.equal(out.confirmation_email_sent, true);
    assert.equal(h.patches.length, 1);
  } finally { h.restore(); }
});

test('it never claims to have emailed when the attendee send failed', async () => {
  const h = harness({ attendeeFails: true });
  try {
    const out = await sendWebinarRegistrationEmails({ ...REG });
    assert.equal(h.patches.length, 0, 'setting the flags here would silently lose the email');
    assert.equal(out.registration_email_sent, undefined);
  } finally { h.restore(); }
});

test('it is a no-op once the email has already gone', async () => {
  const h = harness();
  try {
    await sendWebinarRegistrationEmails({ ...REG, registration_email_sent: true });
    await sendWebinarRegistrationEmails({ ...REG, confirmation_email_sent: true });
    assert.deepEqual(h.sent, [], 'a resend would double-mail every reconciled payment');
  } finally { h.restore(); }
});

test('a missing webinar row or email address cannot break a verified payment', async () => {
  const h = harness({ noWebinarRow: true });
  try {
    const out = await sendWebinarRegistrationEmails({ ...REG, webinar_title: 'Fallback title' });
    assert.equal(h.sent[0].data.webinar_title, 'Fallback title');
    assert.equal(h.sent.length, 2, 'no host row means no host email, attendee and admin still go');
    assert.equal(out.registration_email_sent, true);
  } finally { h.restore(); }
  const h2 = harness();
  try {
    const out = await sendWebinarRegistrationEmails({ ...REG, email: '' });
    assert.deepEqual(h2.sent, []);
    assert.equal(out.email, '');
  } finally { h2.restore(); }
  assert.equal(alreadyEmailed(null), false);
});

test('verify-payment sends on every path that confirms a webinar', () => {
  const src = require_('node:fs').readFileSync(new URL('../api/verify-payment.js', import.meta.url), 'utf8');
  assert.match(src, /require\('\.\.\/lib\/webinar-emails'\)/);
  // free registration, reconciled/idempotent payment, and the normal paid path
  assert.equal((src.match(/sendWebinarRegistrationEmails\(/g) || []).length, 3);
  assert.match(src, /free: true, flow, registration: confirmed/);
  assert.match(src, /flow === 'webinar' \? await sendWebinarRegistrationEmails\(row\) : row/);
  assert.match(src, /flow === 'webinar' \? await sendWebinarRegistrationEmails\(patched\) : patched/);
});
