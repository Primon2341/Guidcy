const SUBJECTS = {
  user_welcome: 'Welcome to Guidcy',
  booking_created_user: 'Your Guidcy booking request has been received',
  booking_confirmed_user: 'Your Guidcy session is confirmed',
  payment_success_user: 'Payment successful for your Guidcy session',
  booking_cancelled_user: 'Your Guidcy session has been cancelled',
  session_reminder_user: 'Reminder: your Guidcy session starts soon',
  webinar_registration_user: 'You are registered for the Guidcy webinar',
  webinar_registration_consultant: 'New registration for your webinar',
  new_webinar_registration_admin: 'New webinar registration received',
  job_application_submitted_user: 'Your job application has been submitted',
  job_application_shortlisted_user: 'You have been shortlisted for the interview round',
  job_application_rejected_user: 'Update on your Guidcy application',
  job_post_submitted_consultant: 'Your job post has been submitted for review',
  support_ticket_created_user: 'Your support request has been received',
  dispute_created_user: 'Your dispute has been submitted',
  consultant_signup_submitted: 'Your Guidcy consultant profile has been submitted',
  consultant_approved: 'Your Guidcy consultant profile is approved',
  consultant_rejected: 'Your Guidcy consultant profile needs changes',
  consultant_profile_update_required: 'Action needed: complete your Guidcy profile',
  consultant_profile_restored_admin: 'A consultant profile is complete and live again',
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
  dispute_reply: 'New reply on your Guidcy dispute',
  dispute_status_updated: 'Your Guidcy dispute status has been updated',
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

function normalizeSupabaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')
    .replace(/\/auth\/v1$/i, '')
    .replace(/\/storage\/v1$/i, '');
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
    add('Payment ID', pick(data, ['razorpay_payment_id', 'razorpay_order_id', 'payment_id', 'transaction_id']));
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
  if (/consultant_profile_update_required/i.test(type)) return `Hi ${name}, your Guidcy profile is currently hidden from the website because it is incomplete. Open Profile & settings in your consultant dashboard, add your professional title and a short bio, and press Save - your profile goes live again automatically, with no further review. Your account, bookings and earnings are untouched in the meantime.`;
  if (/consultant_profile_restored_admin/i.test(type)) return "Hi Admin, a consultant who was hidden pending a profile update has completed their profile, and their listing is live on Guidcy again. No action is required - this is a notice only.";
  if (/job_application_submitted/i.test(type)) return `Hi ${name}, thank you for applying to Guidcy. We have received your application and our hiring team is reviewing it. You will hear from us by email as it moves forward - the details you sent are below.`;
  if (/job_application_shortlisted/i.test(type)) return `Hi ${name}, good news - your application has been shortlisted for the interview round. Our hiring team will be in touch shortly to arrange a date and time that works for you. Please keep an eye on this inbox, and do reply if none of the proposed slots suit you. In the meantime, it is worth having a couple of examples of your recent work ready to talk through.`;
  if (/job_application_rejected/i.test(type)) return `Hi ${name}, thank you for taking the time to apply and for your interest in Guidcy. After careful consideration we have decided to move forward with other candidates whose experience is closer to what this particular role needs right now. This is not a reflection of your ability, and we would genuinely welcome an application from you for future openings. We wish you every success with your search.`;
  if (/dispute_reply/i.test(type)) return `Hi ${name}, there is a new reply on your Guidcy dispute.`;
  if (/dispute_status_updated/i.test(type)) return `Hi ${name}, the status of your Guidcy dispute has changed.`;
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

async function supabaseRest(path, options = {}, overrideUrl = '') {
  const supabaseUrl = normalizeSupabaseUrl(clean(overrideUrl, 500) || env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL') || '');
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

async function getAdminUser(req, payload = {}) {
  const supabaseUrl = normalizeSupabaseUrl(clean(payload.supabase_url, 500) || env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL') || '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY') || '';
  const anonKey = env('SUPABASE_ANON_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || clean(payload.supabase_key, 3000) || serviceKey;
  const bearer = clean((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), 3000);
  const adminEmails = new Set(
    [env('ADMIN_EMAIL'), env('ADMIN_EMAILS'), 'guidcytechnologies@gmail.com']
      .join(',')
      .split(',')
      .map(v => emailLike(v))
      .filter(Boolean)
  );
  if (!supabaseUrl || !serviceKey) throw new Error('Admin database service is not configured');
  if (!bearer) throw new Error('Admin session is missing');
  const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
  });
  const authText = await auth.text();
  let user = {};
  try { user = authText ? JSON.parse(authText) : {}; } catch (_) { user = {}; }
  if (!auth.ok || !user.id) throw new Error('Admin session is invalid');
  const profileResult = await supabaseRest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role&limit=1`, {}, supabaseUrl);
  const profile = Array.isArray(profileResult && profileResult.data) ? profileResult.data[0] : null;
  const email = emailLike(user.email || (profile && profile.email));
  const role = clean(profile && profile.role).toLowerCase();
  if (!adminEmails.has(email) && role !== 'admin') throw new Error('Only admin can perform this action');
  return { id: user.id, email, role: role || 'admin' };
}

function referralPayload(input) {
  const row = input && typeof input === 'object' ? input : {};
  const code = clean(row.code, 80).toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '');
  const ambassadorName = clean(row.ambassador_name || row.ambassadorName, 120);
  if (!code) throw new Error('Referral code is required');
  if (!ambassadorName) throw new Error('Ambassador name is required');
  return {
    code,
    ambassador_name: ambassadorName,
    ambassador_email: emailLike(row.ambassador_email || row.ambassadorEmail) || null,
    ambassador_phone: clean(row.ambassador_phone || row.ambassadorPhone, 40) || null,
    ambassador_type: clean(row.ambassador_type || row.ambassadorType || 'campus_ambassador', 60) || 'campus_ambassador',
    linked_user_id: uuidOrNull(row.linked_user_id || row.linkedUserId),
    linked_consultant_id: uuidOrNull(row.linked_consultant_id || row.linkedConsultantId),
    college_name: clean(row.college_name || row.collegeName, 160) || null,
    city: clean(row.city, 80) || null,
    state: clean(row.state, 80) || null,
    start_date: clean(row.start_date || row.startDate, 20) || null,
    end_date: clean(row.end_date || row.endDate, 20) || null,
    notes: clean(row.notes, 1000) || null,
    is_active: row.is_active !== false && row.active !== false,
    updated_at: new Date().toISOString(),
  };
}

async function handleAdminReferral(payload, req, debugId) {
  await getAdminUser(req, payload);
  const supabaseUrl = clean(payload.supabase_url, 500);
  const action = clean(payload.action || payload.referralAction || 'save', 40).toLowerCase();
  const id = uuidOrNull(payload.id || payload.referralId || (payload.row && payload.row.id));
  if (action === 'delete') {
    if (!id) return { status: 400, body: { ok: false, error: 'Referral code ID is required', debug_id: debugId } };
    const deleted = await supabaseRest(`referral_codes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' }, supabaseUrl);
    if (!deleted || !deleted.ok) return { status: deleted && deleted.status || 500, body: { ok: false, error: 'Unable to delete referral code', detail: deleted && deleted.data, debug_id: debugId } };
    return { status: 200, body: { ok: true, deleted: true, id, debug_id: debugId } };
  }
  if (action === 'toggle') {
    if (!id) return { status: 400, body: { ok: false, error: 'Referral code ID is required', debug_id: debugId } };
    const patch = { is_active: payload.is_active === true || payload.active === true, updated_at: new Date().toISOString() };
    const updated = await supabaseRest(`referral_codes?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'PATCH', prefer: 'return=representation', body: patch }, supabaseUrl);
    if (!updated || !updated.ok) return { status: updated && updated.status || 500, body: { ok: false, error: 'Unable to update referral code', detail: updated && updated.data, debug_id: debugId } };
    return { status: 200, body: { ok: true, row: Array.isArray(updated.data) ? updated.data[0] : updated.data, debug_id: debugId } };
  }
  const row = referralPayload(payload.row || payload);
  const result = id
    ? await supabaseRest(`referral_codes?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'PATCH', prefer: 'return=representation', body: row }, supabaseUrl)
    : await supabaseRest('referral_codes?select=*', { method: 'POST', prefer: 'return=representation', body: row }, supabaseUrl);
  if (!result || !result.ok) return { status: result && result.status || 500, body: { ok: false, error: 'Unable to save referral code', detail: result && result.data, debug_id: debugId } };
  return { status: 200, body: { ok: true, row: Array.isArray(result.data) ? result.data[0] : result.data, debug_id: debugId } };
}

function bookingId(row) {
  return clean(row && (row.id || row.booking_id), 100);
}

function isPaidOrFreeConfirmed(row) {
  const payment = clean(row && row.payment_status).toLowerCase();
  const status = clean(row && row.status).toLowerCase();
  return !!(row && (
    row.payment_verified === true ||
    ['success', 'paid', 'completed', 'free', 'not_required'].includes(payment) ||
    (['confirmed', 'upcoming', 'completed'].includes(status) && payment !== 'pending')
  ));
}

async function getBookingForEmail(id, fallback) {
  if (id) {
    const rows = await supabaseRest(`bookings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    if (rows && rows.ok !== false) {
      const row = Array.isArray(rows && rows.data) ? rows.data[0] : Array.isArray(rows) ? rows[0] : rows && rows.data ? rows.data : rows;
      if (row && row.id) return row;
    }
  }
  return fallback && typeof fallback === 'object' ? fallback : null;
}

async function patchBookingEmailFlags(id, patch) {
  if (!id || !patch || !Object.keys(patch).length) return null;
  return supabaseRest(`bookings?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch,
  });
}

async function firstProfileEmail(ids) {
  const seen = new Set();
  for (const id of ids.filter(Boolean).map(String)) {
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const rows = await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}&select=email&limit=1`);
      const profile = Array.isArray(rows && rows.data) ? rows.data[0] : Array.isArray(rows) ? rows[0] : rows && rows.data ? rows.data : rows;
      const found = emailLike(profile && profile.email);
      if (found) return found;
    } catch (_) {}
  }
  return '';
}

async function resolveBookingConsultantEmail(row) {
  const direct = emailLike(row && row.consultant_email);
  if (direct) return direct;
  const ids = [row && row.consultant_id, row && row.consultant_profile_id, row && row.consultant_user_id].filter(Boolean).map(String);
  const profileIds = [];
  for (const id of ids) {
    for (const col of ['id', 'profile_id']) {
      try {
        const rows = await supabaseRest(`consultants?${col}=eq.${encodeURIComponent(id)}&select=profile_id&limit=1`);
        const consultant = Array.isArray(rows && rows.data) ? rows.data[0] : Array.isArray(rows) ? rows[0] : rows && rows.data ? rows.data : rows;
        if (consultant) profileIds.push(consultant.profile_id);
      } catch (_) {}
    }
    profileIds.push(id);
  }
  return firstProfileEmail(profileIds);
}

async function sendEmailWithResend({ to, name, role, type, relatedTable, relatedId, data, debugId }) {
  const recipient = emailLike(to);
  if (!recipient) throw new Error(`${role || 'recipient'} email missing`);
  const siteUrl = env('SITE_URL') || 'https://www.guidcy.com';
  const resendKey = env('RESEND_API_KEY');
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured');
  if (await alreadySent({ to: recipient, type, relatedTable, relatedId })) {
    return { skipped: true, reason: 'already_sent' };
  }
  const subject = SUBJECTS[type] || 'Guidcy notification';
  const rendered = renderEmail(subject, type, name || recipient, role || 'user', data || {}, siteUrl);
  const baseLog = {
    recipient_email: recipient,
    recipient_role: role || 'user',
    notification_type: type,
    channel: 'email',
    subject,
    message: rendered.text.slice(0, 5000),
    provider: 'resend',
    related_table: relatedTable || null,
    related_id: relatedId,
  };
  const from = env('RESEND_FROM_EMAIL') || env('EMAIL_FROM') || 'Guidcy <notifications@guidcy.com>';
  console.info('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'pair_provider_send_start', provider: 'resend', type, role, to: recipient }));
  const provider = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [recipient], subject, html: rendered.html, text: rendered.text }),
  });
  const providerText = await provider.text();
  let providerBody = {};
  try { providerBody = providerText ? JSON.parse(providerText) : {}; } catch (_) { providerBody = { raw: providerText }; }
  if (!provider.ok) {
    const message = clean(providerBody.message || providerBody.error || providerText || `Resend error ${provider.status}`, 300);
    await insertLog({ ...baseLog, status: 'failed', error_message: message });
    throw new Error(message);
  }
  const providerId = clean(providerBody.id || providerBody.data?.id || '', 120);
  await insertLog({ ...baseLog, status: 'sent', provider_message_id: providerId || null, sent_at: new Date().toISOString() });
  return { sent: true, provider_message_id: providerId || null };
}

async function sendBookingConfirmationPair(payload, debugId) {
  const id = clean(payload.bookingId || payload.booking_id || payload.id || (payload.booking && payload.booking.id), 100);
  const row = await getBookingForEmail(id, payload.booking);
  if (!row) return { status: 404, body: { ok: false, error: 'Booking not found', debug_id: debugId } };
  if (!isPaidOrFreeConfirmed(row)) return { status: 409, body: { ok: false, error: 'Booking payment is not confirmed', debug_id: debugId } };
  if (!clean(row.meet_link)) return { status: 409, body: { ok: false, error: 'Meeting link is missing', debug_id: debugId } };

  const relatedId = uuidOrNull(bookingId(row));
  const now = new Date().toISOString();
  const consultantEmail = await resolveBookingConsultantEmail(row);
  const patch = { email_last_error: null };
  const errors = [];
  const result = {
    ok: true,
    debug_id: debugId,
    booking_id: bookingId(row),
    user: { skipped: !!row.user_email_sent },
    consultant: { skipped: !!row.consultant_email_sent, email: consultantEmail || null },
  };
  const bookingData = Object.assign({
    booking_id: bookingId(row),
    action_link: row.meet_link,
    action_text: 'Join session',
  }, row);

  if (!row.user_email_sent) {
    try {
      result.user = await sendEmailWithResend({
        to: row.user_email,
        name: row.user_name || 'Guidcy User',
        role: 'user',
        type: 'payment_success_user',
        relatedTable: 'bookings',
        relatedId,
        data: bookingData,
        debugId,
      });
      patch.user_email_sent = true;
      patch.user_email_sent_at = now;
    } catch (error) { errors.push(`user:${clean(error.message || error, 220)}`); }
  }

  if (!row.consultant_email_sent) {
    try {
          result.consultant = await sendEmailWithResend({
        to: consultantEmail,
        name: row.consultant_name || 'Consultant',
        role: 'consultant',
        type: 'payment_received_consultant',
        relatedTable: 'bookings',
        relatedId,
        data: Object.assign({}, bookingData, { consultant_email: consultantEmail }),
        debugId,
          });
          result.consultant.email = consultantEmail;
      patch.consultant_email = consultantEmail;
      patch.consultant_email_sent = true;
      patch.consultant_email_sent_at = now;
    } catch (error) { errors.push(`consultant:${clean(error.message || error, 220)}`); }
  }

  if ((row.user_email_sent || patch.user_email_sent) && (row.consultant_email_sent || patch.consultant_email_sent)) {
    patch.confirmation_email_sent_at = row.confirmation_email_sent_at || now;
    patch.payment_email_sent_at = row.payment_email_sent_at || now;
  }
  if (errors.length) {
    patch.email_last_error = errors.join(' | ');
    result.ok = false;
    result.errors = errors;
  }
  await patchBookingEmailFlags(bookingId(row), patch);
  return { status: errors.length ? 207 : 200, body: result };
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

  if (clean(payload.type || payload.event, 80) === 'admin_referral_code') {
    try {
      const result = await handleAdminReferral(payload, req, debugId);
      return sendJson(res, result.status, result.body);
    } catch (error) {
      return sendJson(res, /Only admin|session/.test(error.message || '') ? 403 : 500, { ok: false, error: error.message || 'Referral admin action failed', debug_id: debugId });
    }
  }

  if (clean(payload.type || payload.event, 80) === 'booking_confirmation_pair' || payload.bookingId || payload.booking_id) {
    try {
      const paired = await sendBookingConfirmationPair(payload, debugId);
      return sendJson(res, paired.status, paired.body);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || 'Booking confirmation email failed', debug_id: debugId });
    }
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
  const rawRelatedId = clean(payload.relatedId || data.related_id || data.booking_id || data.id, 120);
  const relatedId = uuidOrNull(rawRelatedId);
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
  if (type === 'webinar_registration_user' && relatedTable === 'webinar_registrations' && rawRelatedId) {
    const existing = await supabaseRest(`webinar_registrations?id=eq.${encodeURIComponent(rawRelatedId)}&select=registration_email_sent,confirmation_email_sent&limit=1`);
    const row = existing && existing.ok && Array.isArray(existing.data) ? existing.data[0] : null;
    if (row && (row.registration_email_sent || row.confirmation_email_sent)) {
      return sendJson(res, 200, { ok: true, skipped: true, reason: 'already_sent', debug_id: debugId });
    }
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
    if (type === 'webinar_registration_user' && relatedTable === 'webinar_registrations' && rawRelatedId) {
      const now = new Date().toISOString();
      await supabaseRest(`webinar_registrations?id=eq.${encodeURIComponent(rawRelatedId)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: {
          registration_email_sent: true,
          registration_email_sent_at: now,
          confirmation_email_sent: true,
          confirmation_email_sent_at: now,
          updated_at: now,
        },
      });
    }
    console.info('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'provider_send_success', provider_message_id: providerId || null }));
    return sendJson(res, 200, { ok: true, provider_message_id: providerId || null, debug_id: debugId });
  } catch (error) {
    const message = clean(error.message || error, 300);
    await insertLog({ ...baseLog, status: 'failed', error_message: message });
    console.warn('[guidcy-email]', JSON.stringify({ debug_id: debugId, step: 'send_exception', error: message }));
    return sendJson(res, 500, { ok: false, error: 'Email sending failed', detail: message, debug_id: debugId });
  }
};
