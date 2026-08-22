const DEFAULT_SUPABASE_URL = 'https://lsthngfxehayeqyctkla.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdGhuZ2Z4ZWhheWVxeWN0a2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTgyNzcsImV4cCI6MjA5MjY5NDI3N30.kKTzunZl1JGLNswkPZUBOy9xD8G9FyIGbx0Oh6msIo4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function env(name) {
  return process.env[name] || '';
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeSupabaseUrl(raw) {
  return clean(raw || DEFAULT_SUPABASE_URL, 500)
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '')
    .replace(/\/auth\/v1$/i, '')
    .replace(/\/rest\/v1$/i, '');
}

function emailLike(value) {
  const email = clean(value, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function safeRedirect(value) {
  const fallback = `${env('SITE_URL') || 'https://www.guidcy.com'}/login`;
  const raw = clean(value, 500) || fallback;
  try {
    const url = new URL(raw, fallback);
    if (!/^https?:$/.test(url.protocol)) return fallback;
    return url.href;
  } catch (_) {
    return fallback;
  }
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 256 * 1024) {
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

async function sendRecoveryWithResend({ email, actionLink }) {
  const resendKey = env('RESEND_API_KEY');
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured');
  const from = env('RESEND_FROM_EMAIL') || env('EMAIL_FROM') || 'Guidcy <notifications@guidcy.com>';
  const subject = 'Reset your Guidcy password';
  const html = `<!doctype html><html><body style="margin:0;background:#f6fbff;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #d8e8f5;border-radius:18px;overflow:hidden"><div style="background:#1E72BE;padding:24px;color:#fff"><div style="font-size:28px;font-weight:900">Guidcy</div><div style="font-size:13px;opacity:.9">Password reset request</div></div><div style="padding:28px"><h1 style="font-size:22px;margin:0 0 10px">Reset your password</h1><p style="font-size:15px;line-height:1.6;color:#475569">Use the button below to set a new password for your Guidcy account.</p><div style="text-align:center;margin:26px 0"><a href="${esc(actionLink)}" target="_blank" style="display:inline-block;background:#1E72BE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:800">Reset password</a></div><p style="font-size:13px;color:#64748b;line-height:1.6">If you did not request this, you can ignore this email.</p></div></div></div></body></html>`;
  const text = `Reset your Guidcy password\n\nOpen this link to reset your password:\n${actionLink}\n\nIf you did not request this, ignore this email.`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, html, text }),
  });
  const providerText = await response.text();
  let providerBody = {};
  try { providerBody = providerText ? JSON.parse(providerText) : {}; } catch (_) { providerBody = { raw: providerText }; }
  if (!response.ok) throw new Error(clean(providerBody.message || providerBody.error || providerText || `Resend error ${response.status}`, 300));
  return providerBody;
}

async function generateRecoveryLink({ supabaseUrl, serviceKey, email, redirectTo }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'recovery', email, options: { redirect_to: redirectTo } }),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }
  if (!response.ok) throw new Error(clean(body.msg || body.message || body.error || text || `Supabase error ${response.status}`, 300));
  return clean(body.action_link || body.properties?.action_link || body.properties?.hashed_token || '', 2000);
}

async function requestRecoveryEdgeFunction({ supabaseUrl, anonKey, email, redirectTo }) {
  const response = await fetch(`${supabaseUrl}/functions/v1/forgot-password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, redirectTo }),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }
  if (!response.ok || body.ok === false) throw new Error(clean(body.msg || body.message || body.error || text || `Recovery function error ${response.status}`, 300));
  return body;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    return sendJson(res, error.status || 400, { ok: false, error: error.message });
  }

  const email = emailLike(payload.email);
  if (!email) return sendJson(res, 400, { ok: false, error: 'Enter a valid email address' });

  const supabaseUrl = normalizeSupabaseUrl(env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('VITE_SUPABASE_URL'));
  const anonKey = env('SUPABASE_ANON_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY') || '';
  const redirectTo = safeRedirect(payload.redirectTo);

  try {
    if (serviceKey && env('RESEND_API_KEY')) {
      const actionLink = await generateRecoveryLink({ supabaseUrl, serviceKey, email, redirectTo });
      if (!actionLink || !/^https?:\/\//i.test(actionLink)) throw new Error('Could not generate recovery link');
      await sendRecoveryWithResend({ email, actionLink });
      return sendJson(res, 200, { ok: true, provider: 'resend_admin_link' });
    }

    await requestRecoveryEdgeFunction({ supabaseUrl, anonKey, email, redirectTo });
    return sendJson(res, 200, { ok: true, provider: 'supabase_recovery_function' });
  } catch (error) {
    const message = clean(error.message || error || 'Could not send reset email', 300);
    return sendJson(res, 502, { ok: false, error: message });
  }
};
