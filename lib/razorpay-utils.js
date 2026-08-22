const crypto = require('crypto');

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/[\r\n|]/g, ' ').slice(0, max);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return Object.fromEntries(new URLSearchParams(raw)); }
}

function getRazorpayConfig() {
  const keyId = env('RAZORPAY_KEY_ID');
  const keySecret = env('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) {
    const missing = [!keyId && 'RAZORPAY_KEY_ID', !keySecret && 'RAZORPAY_KEY_SECRET'].filter(Boolean).join(', ');
    throw Object.assign(new Error(`Missing Razorpay environment variable(s): ${missing}`), { status: 500 });
  }
  return { keyId, keySecret };
}

function normalizeSupabaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')
    .replace(/\/auth\/v1$/i, '')
    .replace(/\/storage\/v1$/i, '');
}

function getSupabaseConfig() {
  const url = normalizeSupabaseUrl(env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL') || '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  if (!url || !serviceKey) throw Object.assign(new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'), { status: 500 });
  return { url, serviceKey };
}

async function supabaseRest(path, options = {}) {
  const { url, serviceKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || '',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : (data && (data.message || data.error)) || 'Supabase request failed';
    throw Object.assign(new Error(message), { status: response.status, data });
  }
  return data;
}

async function first(path) {
  const data = await supabaseRest(`${path}${path.includes('?') ? '&' : '?'}limit=1`);
  return Array.isArray(data) ? data[0] || null : data || null;
}

function flowTable(flow) {
  if (flow === 'marketplace') return 'marketplace_orders';
  if (flow === 'webinar') return 'webinar_registrations';
  return 'bookings';
}

function referenceFromBody(body) {
  return clean(body.referenceId || body.bookingId || body.registrationId || body.orderId || body.ref || body.id, 120);
}

async function loadPaymentRecord(flow, referenceId, orderId = '') {
  const table = flowTable(flow);
  if (orderId) {
    const row = await first(`${table}?razorpay_order_id=eq.${encodeURIComponent(orderId)}&select=*`);
    if (row) return row;
  }
  if (!referenceId) return null;
  return first(`${table}?id=eq.${encodeURIComponent(referenceId)}&select=*`);
}

function moneyToPaise(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error('Invalid payment amount in database'), { status: 400 });
  return Math.round(n * 100);
}

function positiveNumber() {
  for (const value of arguments) {
    const n = Number(value || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

async function authoritativeAmount(flow, row) {
  if (!row) throw Object.assign(new Error('Payment reference not found'), { status: 404 });
  if (flow === 'marketplace') {
    const noteId = clean(row.note_id || row.noteId, 120);
    if (noteId) {
      try {
        const note = await first(`marketplace_notes?id=eq.${encodeURIComponent(noteId)}&select=price,is_free`);
        if (note && (note.is_free === true || Number(note.price || 0) <= 0)) return 0;
        if (note && Number(note.price || 0) > 0) return Number(note.price);
      } catch (_) {}
    }
    return positiveNumber(row.price, row.amount_paid, row.payment_amount, row.amount);
  }
  if (flow === 'webinar') {
    const webinarId = clean(row.webinar_id || row.webinarId, 140);
    if (webinarId) {
      try {
        const webinar = await first(`webinars?id=eq.${encodeURIComponent(webinarId)}&select=price_amount,is_paid,price_type`);
        if (webinar && (webinar.is_paid === false || clean(webinar.price_type).toLowerCase() === 'free')) return 0;
        if (webinar) return positiveNumber(webinar.price_amount);
      } catch (_) {}
    }
    return positiveNumber(row.amount_paid, row.payment_amount, row.amount, row.price);
  }
  return positiveNumber(row.total_amount, row.payment_amount, row.amount);
}

function isFulfilled(flow, row) {
  if (!row) return false;
  if (flow === 'marketplace') return row.payment_verified === true && row.download_granted === true && /success|paid|completed/i.test(clean(row.payment_status));
  if (flow === 'webinar') return row.payment_verified === true && /paid|success|completed/i.test(clean(row.payment_status));
  return row.payment_verified === true && clean(row.payment_status).toLowerCase() === 'success';
}

function basicAuth(keyId, keySecret) {
  return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

function receipt(flow, id) {
  const suffix = String(Date.now()).slice(-10);
  return `${flow.slice(0, 3).toUpperCase()}-${clean(id, 22)}-${suffix}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

async function createRazorpayOrder({ flow, row, amountPaise }) {
  const cfg = getRazorpayConfig();
  return createRawRazorpayOrder({
    amount: amountPaise,
    currency: 'INR',
    receipt: receipt(flow, row.id || row.booking_id || row.registration_id || row.order_reference || 'guidcy'),
    notes: {
      platform: 'Guidcy',
      flow,
      reference_id: clean(row.id || '', 120),
    },
  }, cfg);
}

async function createRawRazorpayOrder(input, cfg = getRazorpayConfig()) {
  const amount = Number(input && input.amount);
  if (!Number.isInteger(amount) || amount < 100) {
    throw Object.assign(new Error('Amount must be at least 100 paise'), { status: 400 });
  }
  const currency = clean(input.currency || 'INR', 3).toUpperCase() || 'INR';
  const rawReceipt = clean(input.receipt || `guidcy-${Date.now()}`, 40);
  const body = {
    amount,
    currency,
    receipt: rawReceipt,
  };
  if (input.notes && typeof input.notes === 'object') body.notes = input.notes;
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(cfg.keyId, cfg.keySecret)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    throw Object.assign(new Error((data && (data.error && data.error.description || data.message)) || 'Unable to create Razorpay order'), { status: response.status, data });
  }
  return data;
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const { keySecret } = getRazorpayConfig();
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(clean(signature, 256), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function fetchRazorpayPayment(paymentId) {
  const cfg = getRazorpayConfig();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${basicAuth(cfg.keyId, cfg.keySecret)}` },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!response.ok) throw Object.assign(new Error((data && (data.error && data.error.description || data.message)) || 'Unable to fetch Razorpay payment'), { status: response.status, data });
  return data;
}

async function patchById(flow, id, body) {
  const table = flowTable(flow);
  const data = await supabaseRest(`${table}?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body,
  });
  return Array.isArray(data) ? data[0] || null : data;
}

async function createMarketplacePayout(order) {
  if (!order || Number(order.price || 0) <= 0 || !order.download_granted) return null;
  try {
    const existing = await supabaseRest(`marketplace_payouts?order_id=eq.${encodeURIComponent(order.id)}&select=id&limit=1`);
    if (Array.isArray(existing) && existing.length) return existing[0];
  } catch (_) {}
  const payload = {
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
    payment_transaction_id: order.payment_transaction_id || order.razorpay_payment_id || '',
    seller_payable: order.seller_payable,
    commission_amount: order.commission_amount,
    payout_status: 'pending',
  };
  const inserted = await supabaseRest('marketplace_payouts?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload,
  });
  const payout = Array.isArray(inserted) ? inserted[0] : inserted;
  if (payout && payout.id) {
    await supabaseRest(`marketplace_orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      body: { seller_payout_id: payout.id, seller_payout_status: 'pending', updated_at: new Date().toISOString() },
    });
  }
  return payout;
}

module.exports = {
  clean,
  json,
  readBody,
  getRazorpayConfig,
  loadPaymentRecord,
  authoritativeAmount,
  moneyToPaise,
  isFulfilled,
  createRazorpayOrder,
  createRawRazorpayOrder,
  verifyPaymentSignature,
  fetchRazorpayPayment,
  patchById,
  createMarketplacePayout,
};
