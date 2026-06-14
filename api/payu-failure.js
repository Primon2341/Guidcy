const { getPayUConfig, readBody, responseHash, clean, supabasePatchBooking, supabasePatchWebinarRegistration, supabasePatchMarketplaceOrder, supabaseDeleteWebinarRegistration, redirect } = require('../lib/payu-utils');

module.exports = async function handler(req, res) {
  try {
    const cfg = getPayUConfig(req);
    const body = await readBody(req);
    const expected = responseHash(body, cfg.salt);
    const received = clean(body.hash, 256).toLowerCase();
    const txnid = clean(body.txnid, 80);
    const refId = clean(body.udf1, 80);
    const flow = clean(body.udf2 || 'booking', 40).toLowerCase();
    const hashOk = !!received && received === expected.toLowerCase();

    if (flow === 'webinar') {
      // A failed paid webinar payment must not create a usable registration.
      try { await supabaseDeleteWebinarRegistration(refId || txnid); }
      catch (_) { await supabasePatchWebinarRegistration(refId || txnid, { payment_status: 'failed', payment_gateway: 'payu', payment_id: txnid, payu_txnid: txnid, payment_verified: false, payment_response: { ...body, hash_verified: hashOk } }); }
      return redirect(res, `${cfg.origin}/webinar?payu=failure&flow=webinar&txnid=${encodeURIComponent(txnid)}&ref=${encodeURIComponent(refId)}`);
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
      return redirect(res, `${cfg.origin}/marketplace?payu=failure&flow=marketplace&txnid=${encodeURIComponent(txnid)}&order=${encodeURIComponent(refId)}`);
    }

    await supabasePatchBooking(refId || txnid, {
      status: 'payment_failed', payment_status: 'failed', payment_gateway: 'payu', payment_id: txnid,
      payu_txnid: txnid, payu_mihpayid: clean(body.mihpayid, 80), payu_status: clean(body.status || 'failure', 40),
      payu_mode: clean(body.mode || body.PG_TYPE || '', 40), payment_amount: Number(body.amount || 0),
      payment_verified: false, payment_response: { ...body, hash_verified: hashOk }
    });
    return redirect(res, `${cfg.origin}/payment?payu=failure&flow=booking&txnid=${encodeURIComponent(txnid)}&booking=${encodeURIComponent(refId)}`);
  } catch (e) {
    console.error('PayU failure callback error:', e);
    const origin = process.env.APP_BASE_URL || `${(req.headers['x-forwarded-proto'] || 'https').split(',')[0]}://${req.headers.host}`;
    return redirect(res, `${origin}/payment?payu=failure&reason=server_error`);
  }
};
