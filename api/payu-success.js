const { getPayUConfig, readBody, responseHash, clean, supabasePatchBooking, supabasePatchWebinarRegistration, supabasePatchMarketplaceOrder, supabaseCreateMarketplacePayout, redirect } = require('../lib/payu-utils');

module.exports = async function handler(req, res) {
  try {
    const cfg = getPayUConfig(req);
    const body = await readBody(req);
    const expected = responseHash(body, cfg.salt);
    const received = clean(body.hash, 256).toLowerCase();
    const txnid = clean(body.txnid, 80);
    const refId = clean(body.udf1, 80);
    const flow = clean(body.udf2 || 'booking', 40).toLowerCase();
    const status = clean(body.status || 'success', 40).toLowerCase();
    const verified = !!received && received === expected.toLowerCase() && status === 'success';

    if (verified && flow === 'webinar') {
      await supabasePatchWebinarRegistration(refId || txnid, {
        payment_status: 'paid',
        payment_gateway: 'payu',
        payment_id: txnid,
        payu_txnid: txnid,
        payu_mihpayid: clean(body.mihpayid, 80),
        payu_status: status,
        payu_mode: clean(body.mode || body.PG_TYPE || '', 40),
        amount_paid: Number(body.amount || 0),
        payment_verified: true,
        paid_at: new Date().toISOString(),
        payment_response: body
      });
      return redirect(res, `${cfg.origin}/webinar?payu=success&flow=webinar&txnid=${encodeURIComponent(txnid)}&ref=${encodeURIComponent(refId)}`);
    }

    if (verified && flow === 'marketplace') {
      const order = await supabasePatchMarketplaceOrder(refId || txnid, {
        payment_status: 'success',
        payment_gateway: 'payu',
        payment_transaction_id: txnid,
        order_status: 'completed',
        download_granted: true,
        payment_verified: true,
        seller_payout_status: 'pending',
        updated_at: new Date().toISOString()
      });
      await supabaseCreateMarketplacePayout(order);
      return redirect(res, `${cfg.origin}/marketplace?payu=success&flow=marketplace&txnid=${encodeURIComponent(txnid)}&order=${encodeURIComponent(refId)}`);
    }

    if (verified) {
      await supabasePatchBooking(refId || txnid, {
        status: 'confirmed',
        payment_status: 'success',
        payment_gateway: 'payu',
        payment_id: txnid,
        payu_txnid: txnid,
        payu_mihpayid: clean(body.mihpayid, 80),
        payu_status: status,
        payu_mode: clean(body.mode || body.PG_TYPE || '', 40),
        payment_amount: Number(body.amount || 0),
        payment_verified: true,
        paid_at: new Date().toISOString(),
        payment_response: body,
        user_email_sent: false,
        consultant_email_sent: false,
        email_last_error: null
      });
      return redirect(res, `${cfg.origin}/payment?payu=success&flow=booking&txnid=${encodeURIComponent(txnid)}&booking=${encodeURIComponent(refId)}`);
    }

    if (flow === 'webinar') {
      await supabasePatchWebinarRegistration(refId || txnid, {
        payment_status: 'failed', payment_gateway: 'payu', payment_id: txnid, payu_txnid: txnid,
        payu_status: status || 'hash_mismatch', payment_verified: false, payment_response: body
      });
      return redirect(res, `${cfg.origin}/webinar?payu=failure&flow=webinar&reason=invalid_hash&txnid=${encodeURIComponent(txnid)}&ref=${encodeURIComponent(refId)}`);
    }

    if (flow === 'marketplace') {
      await supabasePatchMarketplaceOrder(refId || txnid, {
        payment_status: 'failed',
        payment_gateway: 'payu',
        payment_transaction_id: txnid,
        order_status: 'failed',
        download_granted: false,
        payment_verified: false,
        updated_at: new Date().toISOString()
      });
      return redirect(res, `${cfg.origin}/marketplace?payu=failure&flow=marketplace&reason=invalid_hash&txnid=${encodeURIComponent(txnid)}&order=${encodeURIComponent(refId)}`);
    }

    await supabasePatchBooking(refId || txnid, {
      status: 'payment_failed', payment_status: 'failed', payment_gateway: 'payu', payment_id: txnid,
      payu_txnid: txnid, payu_mihpayid: clean(body.mihpayid, 80), payu_status: status || 'hash_mismatch',
      payment_verified: false, payment_response: body
    });
    return redirect(res, `${cfg.origin}/payment?payu=failure&flow=booking&reason=invalid_hash&txnid=${encodeURIComponent(txnid)}&booking=${encodeURIComponent(refId)}`);
  } catch (e) {
    console.error('PayU success callback error:', e);
    const origin = process.env.APP_BASE_URL || `${(req.headers['x-forwarded-proto'] || 'https').split(',')[0]}://${req.headers.host}`;
    return redirect(res, `${origin}/payment?payu=failure&reason=server_error`);
  }
};
