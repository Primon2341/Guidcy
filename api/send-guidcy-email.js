const SUBJECTS = {
  user_welcome: 'Welcome to Guidcy',
  booking_created_user: 'Your Guidcy booking request has been received',
  booking_confirmed_user: 'Your Guidcy session is confirmed',
  payment_success_user: 'Payment successful for your Guidcy session',
  booking_cancelled_user: 'Your Guidcy session has been cancelled',
  webinar_registration_user: 'You are registered for the Guidcy webinar',
  webinar_registration_consultant: 'New registration for your webinar',
  new_webinar_registration_admin: 'New webinar registration received',
  job_application_submitted_user: 'Your job application has been submitted',
  job_post_submitted_consultant: 'Your job post has been submitted for review',
  support_ticket_created_user: 'Your support request has been received',
  dispute_created_user: 'Your dispute has been submitted',
  consultant_signup_submitted: 'Your Guidcy consultant profile has been submitted',
  consultant_approved: 'Your Guidcy consultant profile is approved',
  consultant_rejected: 'Your Guidcy consultant profile needs changes',
  new_consultant_admin: 'New consultant approval required on Guidcy',
  new_booking_consultant: 'New session booking received on Guidcy',
  new_booking_admin: 'New booking created on Guidcy',
  payment_received_consultant: 'Payment received for your Guidcy session',
  payment_received_admin: 'New payment received on Guidcy',
  session_cancelled_consultant: 'A booked session has been cancelled',
  payout_completed_consultant: 'Your Guidcy payout has been completed',
  payout_pending_admin: 'Consultant payout pending',
  refund_request_admin: 'Refund action required on Guidcy',
  new_webinar_admin: 'New webinar submitted on Guidcy',
  new_job_post_admin: 'New job post approval required',
  job_reported_admin: 'Job reported by user on Guidcy',
  support_ticket_admin: 'New support ticket received',
  dispute_created_admin: 'New dispute raised on Guidcy',
  marketplace_buyer_email: 'Your Guidcy notes are ready',
  marketplace_seller_email: 'Your Guidcy notes received a new sale',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function env(name) {
  return process.env[name] || '';
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\r\n|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function emailLike(value) {
  const text = clean(value, 180);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

function uuidOrNull(value) {
  const text = clean(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pick(data, keys, fallback = '') {
  for (const key of keys) {
    const value = clean(data[key]);
    if (value) return value;
  }
  return fallback;
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `INR ${Math.round(n).toLocaleString('en-IN')}` : '';
}

function detailsFor(type, data) {
  const rows = [];
  const add = (label, value) => {
    const text = clean(value);
    if (text) rows.push([label, text]);
  };

  if (/booking|payment|session|payout/i.test(type)) {
    add('Booking ID', pick(data, ['booking_id', 'id', 'reference']));
    add('User', pick(data, ['user_name', 'client_name', 'name']));
    add('Consultant', pick(data, ['consultant_name', 'expert_name']));
    add('Session', pick(data, ['session_title', 'category', 'session_type']));
    add('Date', pick(data, ['date_label', 'session_date', 'booking_date', 'date']));
    add('Time', pick(data, ['time_slot', 'session_time', 'booking_time', 'time']));
    add('Amount', money(pick(data, ['payment_amount', 'total_amount', 'amount', 'price'])));
    add('Payment ID', pick(data, ['payu_txnid', 'payu_mihpayid', 'payment_id', 'transaction_id']));
    add('Payout transaction ID', pick(data, ['payout_transaction_id', 'payout_txn', 'utr']));
    add('Status', pick(data, ['status', 'payment_status', 'session_status', 'payout_status']));
    add('Meeting link', pick(data, ['meet_link', 'meeting_link', 'join_link']));
  } else if (/webinar/i.test(type)) {
    add('Webinar', pick(data, ['webinar_title', 'title', 'name']));
    add('Date', pick(data, ['webinar_date', 'date', 'date_label']));
    add('Time', pick(data, ['webinar_time', 'time', 'time_slot']));
    add('Host', pick(data, ['host_name', 'consultant_name', 'speaker_name']));
    add('Registrant', pick(data, ['registrant_name', 'user_name', 'name']));
    add('Payment status', pick(data, ['payment_status']));
    add('Join link', pick(data, ['join_link', 'webinar_link', 'meeting_link', 'link']));
  } else if (/job|work/i.test(type)) {
    add('Title', pick(data, ['job_title', 'title']));
    add('Applicant', pick(data, ['applicant_name', 'user_name', 'name']));
    add('Applicant email', pick(data, ['applicant_email', 'user_email', 'email']));
    add('Employer', pick(data, ['employer_name', 'company_name']));
    add('Status', pick(data, ['status', 'verification_status']));
  } else {
    Object.entries(data).slice(0, 12).forEach(([key, value]) => add(key.replace(/_/g, ' '), value));
  }
  return rows;
}

function intro(type, name, role) {
  if (type === 'user_welcome') return `Hi ${name}, welcome to Guidcy. Your account is ready.`;
  if (/booking_confirmed/i.test(type)) return `Hi ${name}, your Guidcy session has been confirmed.`;
  if (/payment_success|payment_received/i.test(type)) return `Hi ${name}, payment has been received successfully.`;
  if (/payout_completed/i.test(type)) return `Hi ${name}, your Guidcy payout has been marked as completed.`;
  if (/webinar_registration/i.test(type)) return `Hi ${name}, webinar registration details are below.`;
  if (/consultant_approved/i.test(type)) return `Hi ${name}, your consultant profile is approved and ready on Guidcy.`;
  if (/consultant_rejected/i.test(type)) return `Hi ${name}, your consultant profile was reviewed and needs changes before approval.`;
  if (role === 'admin') return 'Hi Admin, a new Guidcy action requires review.';
  return `Hi ${name}, here is your Guidcy update.`;
}

function renderEmail(subject, type, name, role, data, siteUrl) {
  const rows = detailsFor(type, data);
  const detailsHtml = rows.map(([label, value]) => `<tr><td style="padding:9px 0;color:#64748b;border-bottom:1px solid #e5edf7">${esc(label)}</td><td style="padding:9px 0;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #e5edf7">${esc(value)}</td></tr>`).join('');
  const detailsText = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const actionLink = pick(data, ['action_link', 'join_link', 'meet_link', 'meeting_link', 'url', 'link'], siteUrl);
  const actionText = pick(data, ['action_text'], /webinar/i.test(type) ? 'View webinar' : /booking|session/i.test(type) ? 'View session' : 'Open Guidcy');
  const html = `<!doctype html><html><body style="margin:0;background:#f6fbff;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:640px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #d8e8f5;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,.08)"><div style="background:linear-gradient(135deg,#1E72BE,#3DB84A);padding:24px;color:#fff"><div style="font-size:28px;font-weight:900">Guidcy</div><div style="font-size:13px;opacity:.92;margin-top:4px">Guidance Made Simple</div></div><div style="padding:28px"><h1 style="font-size:24px;line-height:1.2;margin:0 0 10px;color:#0f172a">${esc(subject)}</h1><p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 20px">${esc(intro(type, name || 'there', role))}</p>${detailsHtml ? `<div style="background:#f8fbff;border:1px solid #d8e8f5;border-radius:14px;padding:16px;margin:18px 0"><table style="width:100%;border-collapse:collapse;font-size:14px">${detailsHtml}</table></div>` : ''}<div style="text-align:center;margin:24px 0"><a href="${esc(actionLink)}" target="_blank" style="display:inline-block;background:#1E72BE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:800;font-size:14px">${esc(actionText)}</a></div><p style="font-size:13px;line-height:1.6;color:#64748b;margin:18px 0 0">For help, contact <a href="mailto:guidcytechnologies@gmail.com" style="color:#1E72BE">guidcytechnologies@gmail.com</a>.</p></div><div style="border-top:1px solid #e5edf7;background:#f8fbff;padding:16px 28px;font-size:12px;color:#64748b">This transactional email was sent by Guidcy.</div></div></div></body></html>`;
  const text = `${subject}\n\n${intro(type, name || 'there', role)}\n\n${detailsText}\n\nNeed help? Contact guidcytechnologies@gmail.com\n${siteUrl}`;
  return { html, text };
}

async function supabaseRest(path, options = {}) {
  const supabaseUrl = (env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL') || '').replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY') || '';
  if (!supabaseUrl || !serviceKey) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
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
  return { ok: response.ok, status: response.status, data };
}

async function insertLog(entry) {
  try {
    await supabaseRest('notification_logs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: entry,
    });
  } catch (error) {
    console.warn('[guidcy-email]', JSON.stringify({ step: 'log_failed', error: clean(error.message || error, 160) }));
  }
}

async function alreadySent({ to, type, relatedTable, relatedId }) {
  if (!to || !relatedTable || !relatedId) return false;
  const query = `notification_logs?select=id&recipient_email=eq.${encodeURIComponent(to)}&notification_type=eq.${encodeURIComponent(type)}&related_table=eq.${encodeURIComponent(relatedTable)}&related_id=eq.${encodeURIComponent(relatedId)}&status=eq.sent&limit=1`;
  const result = await supabaseRest(query);
  return !!(result && result.ok && Array.isArray(result.data) && result.data.length);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (_) { reject(Object.assign(new Error('Invalid JSON payload'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  const debugId = `email_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    return sendJson(res, error.status || 400, { ok: false, error: error.message, debug_id: debugId });
  }

  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const type = clean(payload.type || 'general_notification', 90);
  const role = clean(payload.recipientRole || 'user', 40);
  const adminEmail = emailLike(env('ADMIN_EMAIL')) || 'guidcytechnologies@gmail.com';
  const to = emailLike(
    payload.to ||
    payload.recipient ||
    payload.recipientEmail ||
    payload.recipient_email ||
    data.to ||
    data.to_email ||
    data.recipient ||
    data.recipient_email ||
    data.user_email ||
    data.consultant_email ||
    data.email ||
    (role === 'admin' ? adminEmail : '')
  );
  const name = clean(payload.recipientName || (role === 'admin' ? 'Admin' : pick(data, ['user_name', 'consultant_name', 'name'], 'there')), 80);
  const relatedTable = clean(payload.relatedTable || data.related_table || '', 80);
  const relatedId = uuidOrNull(payload.relatedId || data.related_id || data.booking_id || data.id);
  const subject = SUBJECTS[type] || clean(data.subject || payload.subject || 'Guidcy notification', 150);
  const siteUrl = env('SITE_URL') || 'https://www.guidcy.com';
  const resendKey = env('RESEND_API_KEY');
  const from = env('RESEND_FROM_EMAIL') || env('EMAIL_FROM') || 'Guidcy <notifications@guidcy.com>';

  console.info('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'request_received', type, role, has_recipient: !!to, related_table: relatedTable || null, related_id: relatedId || null }));

  const email = renderEmail(subject, type, name, role, data, siteUrl);
  const baseLog = {
    recipient_email: to || null,
    recipient_role: role,
    notification_type: type,
    channel: 'email',
    subject,
    message: email.text.slice(0, 5000),
    provider: 'resend',
    related_table: relatedTable || null,
    related_id: relatedId,
  };

  if (!to) {
    await insertLog({ ...baseLog, status: 'failed', error_message: 'Recipient email missing' });
    return sendJson(res, 400, { ok: false, error: 'Recipient email missing', debug_id: debugId });
  }
  if (!resendKey) {
    await insertLog({ ...baseLog, status: 'failed', error_message: 'RESEND_API_KEY is not configured' });
    return sendJson(res, 500, { ok: false, error: 'Email provider is not configured', missing_env: ['RESEND_API_KEY'], debug_id: debugId });
  }
  if (await alreadySent({ to, type, relatedTable, relatedId })) {
    return sendJson(res, 200, { ok: true, skipped: true, reason: 'already_sent', debug_id: debugId });
  }

  try {
    console.info('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'provider_send_start', provider: 'resend', type }));
    const provider = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html: email.html, text: email.text }),
    });
    const providerText = await provider.text();
    let providerBody = {};
    try { providerBody = providerText ? JSON.parse(providerText) : {}; } catch (_) { providerBody = { raw: providerText }; }
    if (!provider.ok) {
      const message = clean(providerBody.message || providerBody.error || providerText || `Resend error ${provider.status}`, 300);
      await insertLog({ ...baseLog, status: 'failed', error_message: message });
      console.warn('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'provider_send_failed', status: provider.status, error: message }));
      return sendJson(res, 502, { ok: false, error: message, provider_status: provider.status, debug_id: debugId });
    }

    const providerId = clean(providerBody.id || providerBody.data?.id || '', 120);
    await insertLog({ ...baseLog, status: 'sent', provider_message_id: providerId || null, sent_at: new Date().toISOString() });
    console.info('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'provider_send_success', provider_message_id: providerId || null }));
    return sendJson(res, 200, { ok: true, provider_message_id: providerId || null, debug_id: debugId });
  } catch (error) {
    const message = clean(error.message || error, 300);
    await insertLog({ ...baseLog, status: 'failed', error_message: message });
    console.warn('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'send_exception', error: message }));
    return sendJson(res, 500, { ok: false, error: 'Email sending failed', detail: message, debug_id: debugId });
  }
};
