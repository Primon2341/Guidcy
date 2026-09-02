const {
  clean,
  json,
  readBody,
  loadPaymentRecord,
  authoritativeAmount,
  moneyToPaise,
  isFulfilled,
  verifyPaymentSignature,
  fetchRazorpayPayment,
  fetchRazorpayOrderPayments,
  getAuthenticatedUser,
  canReconcileMarketplaceOrder,
  patchById,
  createMarketplacePayout,
} = require('../lib/razorpay-utils');
const { refundBookingRequest } = require('../lib/booking-refund');

function fulfilledPatch(flow, row, payment, body) {
  const now = new Date().toISOString();
  const base = {
    payment_gateway: 'razorpay',
    payment_verified: true,
    razorpay_order_id: row.razorpay_order_id,
    razorpay_payment_id: payment.id,
    razorpay_signature: clean(body.razorpay_signature, 256),
    razorpay_status: payment.status || 'captured',
    payment_response: { razorpay_payment: payment },
    updated_at: now,
  };
  if (flow === 'marketplace') {
    return {
      ...base,
      payment_status: 'success',
      order_status: 'completed',
      download_granted: true,
      seller_payout_status: 'pending',
      payment_transaction_id: payment.id,
      order_reference: row.razorpay_order_id,
    };
  }
  if (flow === 'webinar') {
    return {
      ...base,
      payment_id: payment.id,
      payment_status: 'success',
      registration_status: 'confirmed',
      paid_at: now,
      amount_paid: Number(row.amount_paid || row.payment_amount || row.amount || 0),
    };
  }
  const bookingPatch = {
    ...base,
    payment_id: payment.id,
    status: 'confirmed',
    payment_status: 'success',
    paid_at: now,
  };
  const meetLink = clean(body.meet_link || row.meet_link, 500);
  if (meetLink) bookingPatch.meet_link = meetLink;
  return bookingPatch;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    if (body.action === 'refund_booking') {
      const refundResult = await refundBookingRequest(req, body);
      return json(res, refundResult.statusCode, refundResult.data);
    }
    if (body.flow || body.bookingId || body.registrationId || body.orderId || body.referenceId || body.ref) {
      const flow = clean(body.flow || 'booking', 40).toLowerCase();
      if (!['booking', 'webinar', 'marketplace'].includes(flow)) return json(res, 400, { error: 'Invalid payment flow' });

      const referenceId = clean(body.referenceId || body.bookingId || body.registrationId || body.orderId || body.ref || body.id, 120);
      if (flow === 'webinar' && body.free === true) {
        const row = await loadPaymentRecord(flow, referenceId);
        if (!row) return json(res, 404, { error: 'Webinar registration not found' });
        const amount = await authoritativeAmount(flow, row);
        if (moneyToPaise(amount) > 0) return json(res, 400, { error: 'Payment is required for this webinar' });
        const patched = await patchById(flow, row.id, {
          payment_gateway: 'free',
          payment_status: 'free',
          registration_status: 'confirmed',
          payment_verified: true,
          payment_id: null,
          amount_paid: 0,
          razorpay_order_id: null,
          razorpay_payment_id: null,
          razorpay_signature: null,
          razorpay_status: null,
          updated_at: new Date().toISOString(),
        });
        return json(res, 200, { ok: true, verified: true, free: true, flow, registration: patched });
      }

      // A buyer can close or refresh the tab after Razorpay captures payment but
      // before Checkout posts the signature back to this endpoint. Reconcile a
      // pending Marketplace order directly against Razorpay so Supabase remains
      // the authoritative source for both Purchased Notes and seller payouts.
      if (flow === 'marketplace' && body.reconcile === true) {
        const row = await loadPaymentRecord(flow, referenceId, clean(body.razorpay_order_id, 120));
        if (!row) return json(res, 404, { error: 'Marketplace order not found' });
        const actor = await getAuthenticatedUser(req);
        if (!await canReconcileMarketplaceOrder(actor, row)) return json(res, 403, { error: 'This Marketplace order does not belong to the signed-in user' });
        if (isFulfilled(flow, row)) {
          return json(res, 200, { ok: true, verified: true, flow, order: row, idempotent: true });
        }
        if (!row.razorpay_order_id) {
          return json(res, 200, { ok: true, verified: false, pending: true, flow, order: row });
        }
        const expectedPaise = moneyToPaise(await authoritativeAmount(flow, row));
        const payments = await fetchRazorpayOrderPayments(row.razorpay_order_id);
        const payment = payments
          .filter((item) => item
            && item.order_id === row.razorpay_order_id
            && Number(item.amount || 0) === expectedPaise
            && clean(item.currency).toUpperCase() === 'INR'
            && clean(item.status).toLowerCase() === 'captured')
          .sort((a, b) => {
            const statusRank = (value) => clean(value).toLowerCase() === 'captured' ? 1 : 0;
            return statusRank(b.status) - statusRank(a.status) || Number(b.created_at || 0) - Number(a.created_at || 0);
          })[0];
        if (!payment) {
          return json(res, 200, { ok: true, verified: false, pending: true, flow, order: row });
        }
        const patched = await patchById(flow, row.id, fulfilledPatch(flow, row, payment, {}));
        await createMarketplacePayout(patched);
        return json(res, 200, { ok: true, verified: true, reconciled: true, flow, order: patched });
      }

      const orderId = clean(body.razorpay_order_id, 120);
      const paymentId = clean(body.razorpay_payment_id, 120);
      const signature = clean(body.razorpay_signature, 256);
      if (!orderId || !paymentId || !signature) return json(res, 400, { error: 'Razorpay payment id, order id and signature are required' });

      const row = await loadPaymentRecord(flow, referenceId, orderId);
      if (!row) return json(res, 404, { error: 'Payment reference not found' });
      if (!row.razorpay_order_id || row.razorpay_order_id !== orderId) return json(res, 400, { error: 'Razorpay order does not match the stored payment reference' });

      if (isFulfilled(flow, row)) {
        return json(res, 200, { ok: true, verified: true, flow, booking: flow === 'booking' ? row : null, registration: flow === 'webinar' ? row : null, order: flow === 'marketplace' ? row : null, idempotent: true });
      }

      if (!verifyPaymentSignature({ orderId: row.razorpay_order_id, paymentId, signature })) {
        await patchById(flow, row.id, {
          payment_gateway: 'razorpay',
          payment_status: 'failed',
          razorpay_status: 'signature_failed',
          payment_verified: false,
          payment_response: { error: 'signature_failed', razorpay_order_id: orderId, razorpay_payment_id: paymentId },
          updated_at: new Date().toISOString(),
        });
        return json(res, 400, { error: 'Invalid Razorpay payment signature' });
      }

      const payment = await fetchRazorpayPayment(paymentId);
      const expectedPaise = moneyToPaise(await authoritativeAmount(flow, row));
      if (payment.order_id !== row.razorpay_order_id || Number(payment.amount || 0) !== expectedPaise || payment.currency !== 'INR') {
        await patchById(flow, row.id, {
          payment_gateway: 'razorpay',
          payment_status: 'failed',
          razorpay_status: 'amount_or_order_mismatch',
          payment_verified: false,
          payment_response: { error: 'amount_or_order_mismatch', razorpay_payment: payment },
          updated_at: new Date().toISOString(),
        });
        return json(res, 400, { error: 'Razorpay payment amount or order mismatch' });
      }

      if (!['captured', 'authorized'].includes(clean(payment.status).toLowerCase())) {
        await patchById(flow, row.id, {
          payment_gateway: 'razorpay',
          payment_status: 'failed',
          razorpay_status: clean(payment.status || 'failed', 80),
          payment_verified: false,
          payment_response: { razorpay_payment: payment },
          updated_at: new Date().toISOString(),
        });
        return json(res, 400, { error: `Razorpay payment is ${payment.status || 'not successful'}` });
      }

      const patched = await patchById(flow, row.id, fulfilledPatch(flow, row, payment, body));
      if (flow === 'marketplace') await createMarketplacePayout(patched);

      return json(res, 200, {
        ok: true,
        verified: true,
        flow,
        booking: flow === 'booking' ? patched : null,
        registration: flow === 'webinar' ? patched : null,
        order: flow === 'marketplace' ? patched : null,
      });
    }
    const orderId = clean(body.razorpay_order_id || body.order_id, 120);
    const paymentId = clean(body.razorpay_payment_id || body.payment_id, 120);
    const signature = clean(body.razorpay_signature, 256);
    if (!orderId || !paymentId || !signature) {
      return json(res, 400, { success: false, error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }
    const verified = verifyPaymentSignature({ orderId, paymentId, signature });
    if (!verified) return json(res, 400, { success: false, error: 'Invalid Razorpay payment signature' });
    return json(res, 200, { success: true, verified: true });
  } catch (error) {
    console.error('Razorpay standard verify-payment error:', error);
    return json(res, error.status || 500, { success: false, error: error.message || 'Payment verification failed' });
  }
};
