
const crypto = require('crypto');

function sha512(value) {
  return crypto.createHash('sha512').update(String(value), 'utf8').digest('hex');
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function envAny(names) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return '';
}

function getPayUConfig(req) {
  const key = envAny(['PAYU_MERCHANT_KEY', 'PAYU_KEY', 'PAYU_KEY_ID', 'PAYU_MERCHANT_ID', 'NEXT_PUBLIC_PAYU_MERCHANT_KEY', 'VITE_PAYU_MERCHANT_KEY']);
  const salt = envAny(['PAYU_MERCHANT_SALT', 'PAYU_SALT', 'PAYU_SECRET', 'PAYU_MERCHANT_SECRET', 'NEXT_PUBLIC_PAYU_MERCHANT_SALT', 'VITE_PAYU_MERCHANT_SALT']);
  const mode = String(env('PAYU_MODE', 'test')).toLowerCase();
  const baseUrl = env('PAYU_BASE_URL') || (mode === 'production' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment');
  const origin = env('APP_BASE_URL') || `${(req.headers['x-forwarded-proto'] || 'https').split(',')[0]}://${req.headers.host}`;
  const surl = env('PAYU_SUCCESS_URL') || `${origin}/api/payu-success`;
  const furl = env('PAYU_FAILURE_URL') || `${origin}/api/payu-failure`;
  if (!key || !salt) {
    const missing = [];
    if (!key) missing.push('PAYU_MERCHANT_KEY or PAYU_KEY');
    if (!salt) missing.push('PAYU_MERCHANT_SALT or PAYU_SALT');
    const e = new Error(`Missing PayU environment variable(s): ${missing.join(', ')}`);
    e.status = 500;
    throw e;
  }
  return { key, salt, baseUrl, surl, furl, origin, mode };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return Object.fromEntries(new URLSearchParams(raw)); }
}

function clean(v, max = 180) {
  return String(v == null ? '' : v).trim().replace(/[\r\n|]/g, ' ').slice(0, max);
}


const BOOKING_STATUSES = new Set(['pending_payment', 'payment_failed', 'confirmed', 'cancelled', 'completed']);
const PAYMENT_STATUSES = new Set(['pending', 'success', 'failed', 'refunded']);

function validateBookingPatch(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, 'status') && !BOOKING_STATUSES.has(String(body.status))) {
    throw Object.assign(new Error(`Invalid booking status: ${body.status}`), { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'payment_status') && !PAYMENT_STATUSES.has(String(body.payment_status))) {
    throw Object.assign(new Error(`Invalid payment_status: ${body.payment_status}`), { status: 400 });
  }
}

function amount2(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error('Invalid payment amount'), { status: 400 });
  return n.toFixed(2);
}

function requestHash({ key, salt, txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) {
  return sha512([key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, '', '', '', '', '', salt].join('|'));
}

function responseHash(body, salt) {
  const parts = [
    salt,
    clean(body.status),
    '', '', '', '', '',
    clean(body.udf5),
    clean(body.udf4),
    clean(body.udf3),
    clean(body.udf2),
    clean(body.udf1),
    clean(body.email),
    clean(body.firstname),
    clean(body.productinfo),
    clean(body.amount),
    clean(body.txnid),
    clean(body.key)
  ];
  const base = parts.join('|');
  if (body.additionalCharges || body.additional_charges) {
    return sha512(`${clean(body.additionalCharges || body.additional_charges)}|${base}`);
  }
  return sha512(base);
}

async function supabasePatchBooking(idOrTxn, body) {
  validateBookingPatch(body);
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw Object.assign(new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'), { status: 500 });
  const filter = idOrTxn && String(idOrTxn).startsWith('GDYPAYU-')
    ? `payu_txnid=eq.${encodeURIComponent(idOrTxn)}`
    : `id=eq.${encodeURIComponent(idOrTxn)}`;
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/bookings?${filter}&select=*`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw Object.assign(new Error(typeof data === 'string' ? data : (data && data.message) || 'Supabase booking update failed'), { status: r.status, data });
  return Array.isArray(data) ? data[0] : data;
}

async function supabasePatchWebinarRegistration(idOrTxn, body) {
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw Object.assign(new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'), { status: 500 });
  const filter = idOrTxn && String(idOrTxn).startsWith('GDYPAYU-')
    ? `payu_txnid=eq.${encodeURIComponent(idOrTxn)}`
    : `id=eq.${encodeURIComponent(idOrTxn)}`;
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/webinar_registrations?${filter}&select=*`, {
    method: 'PATCH',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw Object.assign(new Error(typeof data === 'string' ? data : (data && data.message) || 'Supabase webinar registration update failed'), { status: r.status, data });
  return Array.isArray(data) ? data[0] : data;
}

async function supabasePatchMarketplaceOrder(idOrTxn, body) {
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw Object.assign(new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'), { status: 500 });
  const filter = idOrTxn && String(idOrTxn).startsWith('GDYMKT-')
    ? `payment_transaction_id=eq.${encodeURIComponent(idOrTxn)}`
    : `id=eq.${encodeURIComponent(idOrTxn)}`;
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/marketplace_orders?${filter}&select=*`, {
    method: 'PATCH',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw Object.assign(new Error(typeof data === 'string' ? data : (data && data.message) || 'Supabase marketplace order update failed'), { status: r.status, data });
  return Array.isArray(data) ? data[0] : data;
}

async function supabaseCreateMarketplacePayout(order) {
  if (!order || Number(order.price || 0) <= 0 || !order.download_granted) return null;
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw Object.assign(new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'), { status: 500 });
  const existing = await fetch(`${url.replace(/\/$/, '')}/rest/v1/marketplace_payouts?order_id=eq.${encodeURIComponent(order.id)}&select=id`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  const existingText = await existing.text();
  const rows = existingText ? JSON.parse(existingText) : [];
  if (Array.isArray(rows) && rows.length) return rows[0];
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/marketplace_payouts?select=*`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      order_id: order.id,
      note_id: order.note_id,
      seller_id: order.seller_id,
      buyer_id: order.buyer_id || null,
      buyer_name: order.buyer_name || '',
      buyer_email: order.buyer_email || '',
      seller_name: order.seller_name || '',
      seller_email: order.seller_email || '',
      note_title: order.note_title || '',
      note_category: order.note_category || '',
      payment_transaction_id: order.payment_transaction_id || '',
      seller_payable: order.seller_payable,
      commission_amount: order.commission_amount,
      payout_status: 'pending'
    })
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw Object.assign(new Error(typeof data === 'string' ? data : (data && data.message) || 'Supabase marketplace payout insert failed'), { status: r.status, data });
  const payout = Array.isArray(data) ? data[0] : data;
  if (payout && payout.id) {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/marketplace_orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seller_payout_id: payout.id, seller_payout_status: 'pending', updated_at: new Date().toISOString() })
    });
  }
  return payout;
}

async function supabaseDeleteWebinarRegistration(idOrTxn) {
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw Object.assign(new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'), { status: 500 });
  const filter = idOrTxn && String(idOrTxn).startsWith('GDYPAYU-')
    ? `payu_txnid=eq.${encodeURIComponent(idOrTxn)}`
    : `id=eq.${encodeURIComponent(idOrTxn)}`;
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/webinar_registrations?${filter}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  if (!r.ok) throw Object.assign(new Error('Supabase webinar registration delete failed'), { status: r.status });
  return true;
}

function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

module.exports = { getPayUConfig, readBody, clean, amount2, requestHash, responseHash, validateBookingPatch, supabasePatchBooking, supabasePatchWebinarRegistration, supabasePatchMarketplaceOrder, supabaseCreateMarketplacePayout, supabaseDeleteWebinarRegistration, redirect };
