module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));
  try {
    const txnid = String(req.query.txnid || '').trim();
    const ref = String(req.query.booking || req.query.ref || '').trim();
    const flow = String(req.query.flow || 'booking').trim().toLowerCase();
    if (!txnid && !ref) return res.status(400).end(JSON.stringify({ error: 'txnid or reference is required' }));
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    const table = flow === 'webinar' ? 'webinar_registrations' : flow === 'marketplace' ? 'marketplace_orders' : 'bookings';
    const txnColumn = flow === 'marketplace' ? 'payment_transaction_id' : 'payu_txnid';
    const filter = ref ? `id=eq.${encodeURIComponent(ref)}` : `${txnColumn}=eq.${encodeURIComponent(txnid)}`;
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?${filter}&select=*`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const text = await r.text();
    const data = text ? JSON.parse(text) : [];
    if (!r.ok) return res.status(r.status).end(JSON.stringify({ error: data.message || 'Unable to verify payment record' }));
    const row = Array.isArray(data) ? data[0] : data;
    const verified = flow === 'webinar'
      ? !!row && row.payment_verified === true && row.payment_status === 'paid'
      : flow === 'marketplace'
        ? !!row && row.payment_verified === true && row.payment_status === 'success' && row.download_granted === true
        : !!row && row.payment_verified === true && row.payment_status === 'success';
    return res.status(200).end(JSON.stringify({ ok: !!row, flow, booking: flow === 'booking' ? row || null : null, registration: flow === 'webinar' ? row || null : null, order: flow === 'marketplace' ? row || null : null, verified }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message || 'Payment verification failed' }));
  }
};
