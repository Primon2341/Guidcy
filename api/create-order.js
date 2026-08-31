const {
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
  patchById,
} = require('../lib/razorpay-utils');

function appReference(body) {
  return clean(body.referenceId || body.bookingId || body.registrationId || body.orderId || body.ref || body.id, 120);
}

async function createGuidcyFlowOrder(body) {
  const cfg = getRazorpayConfig();
  const flow = clean(body.flow || 'booking', 40).toLowerCase();
  if (!['booking', 'webinar', 'marketplace'].includes(flow)) throw Object.assign(new Error('Invalid payment flow'), { status: 400 });
  const referenceId = appReference(body);
  if (!referenceId) throw Object.assign(new Error('Payment reference is required'), { status: 400 });

  const row = await loadPaymentRecord(flow, referenceId);
  if (!row) throw Object.assign(new Error('Payment reference not found'), { status: 404 });
  if (isFulfilled(flow, row)) {
    return { ok: true, alreadyPaid: true, keyId: cfg.keyId, flow, referenceId, row };
  }

  const amount = await authoritativeAmount(flow, row);
  const amountPaise = moneyToPaise(amount);
  if (amountPaise <= 0) {
    return { ok: true, free: true, order_id: null, amount: 0, currency: 'INR', flow, referenceId };
  }

  if (flow !== 'webinar' && /^order_[A-Za-z0-9]+$/.test(clean(row.razorpay_order_id)) && /pending|created|attempted/i.test(clean(row.payment_status || row.razorpay_status || 'pending'))) {
    const order = { id: row.razorpay_order_id, amount: amountPaise, currency: 'INR', status: row.razorpay_status || 'created' };
    return { ok: true, keyId: cfg.keyId, flow, referenceId, order, order_id: order.id, amount: order.amount, currency: order.currency };
  }

  const order = await createRazorpayOrder({ flow, row, amountPaise });
  const patch = {
    payment_gateway: 'razorpay',
    payment_status: 'pending',
    payment_verified: false,
    razorpay_order_id: order.id,
    razorpay_status: order.status || 'created',
    payment_response: { razorpay_order: order },
    updated_at: new Date().toISOString(),
  };
  if (flow === 'booking') patch.payment_amount = amount;
  if (flow === 'webinar') patch.amount_paid = amount;
  if (flow === 'marketplace') patch.order_reference = order.id;
  await patchById(flow, row.id, patch);
  return { ok: true, keyId: cfg.keyId, flow, referenceId, order, order_id: order.id, amount: order.amount, currency: order.currency };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    if (body.flow || appReference(body)) {
      const data = await createGuidcyFlowOrder(body);
      return json(res, 200, data);
    }
    const amount = Number(body.amount);
    const currency = clean(body.currency || 'INR', 3).toUpperCase() || 'INR';
    const receipt = clean(body.receipt || `guidcy-${Date.now()}`, 40);
    const order = await createRawRazorpayOrder({ amount, currency, receipt });
    return json(res, 200, {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Razorpay standard create-order error:', error);
    const message = error.message || 'Unable to create Razorpay order';
    const status = Number(error.status || 500);
    return json(res, status, { error: message });
  }
};
