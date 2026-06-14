const { getPayUConfig, readBody, clean, amount2, requestHash } = require('../lib/payu-utils');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));

  try {
    const cfg = getPayUConfig(req);
    const body = await readBody(req);
    const txnid = clean(body.txnid || `GDYPAYU-${Date.now()}-${Math.floor(Math.random() * 900000 + 100000)}`, 40);
    const amount = amount2(body.amount);
    const productinfo = clean(body.productinfo || 'Guidcy consultation', 100);
    const firstname = clean(body.firstname || 'Guidcy User', 60);
    const email = clean(body.email, 80);
    const phone = clean(body.phone || '', 20);
    const udf1 = clean(body.bookingId || body.udf1 || '', 80);
    const udf2 = clean(body.flow || body.udf2 || 'booking', 40);
    const udf3 = clean(body.userId || body.udf3 || '', 80);
    const udf4 = clean(body.consultantId || body.webinarId || body.noteId || body.udf4 || '', 80);
    const udf5 = clean(body.source || body.udf5 || 'guidcy-web', 80);

    if (!email || !email.includes('@')) return res.status(400).end(JSON.stringify({ error: 'Valid customer email is required.' }));
    if (!udf1) return res.status(400).end(JSON.stringify({ error: 'Payment reference is required before payment.' }));

    const params = {
      key: cfg.key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl: cfg.surl,
      furl: cfg.furl,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5
    };
    params.hash = requestHash({ ...params, salt: cfg.salt });

    return res.status(200).end(JSON.stringify({
      ok: true,
      gateway: 'payu',
      mode: cfg.mode,
      action: cfg.baseUrl,
      params
    }));
  } catch (e) {
    console.error('PayU create payment error:', e);
    return res.status(e.status || 500).end(JSON.stringify({ error: e.message || 'Unable to initiate PayU payment.' }));
  }
};
