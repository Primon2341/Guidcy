const crypto = require('node:crypto');
const { supabaseRest, getAuthenticatedUser, first } = require('./razorpay-utils');

function fail(message, status = 403) { return Object.assign(new Error(message), { status }); }

async function isAdmin(user) {
  if (!user?.id) return false;
  const profile = await first(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role`);
  return profile?.role === 'admin';
}

async function paymentOwner(req, flow, row, user) {
  user ||= await getAuthenticatedUser(req);
  const owner = flow === 'marketplace' ? row.buyer_id : row.user_id;
  const email = flow === 'marketplace' ? row.buyer_email : flow === 'webinar' ? row.email : row.user_email;
  if (owner === user.id || (!owner && user.email_confirmed_at && email?.toLowerCase() === user.email?.toLowerCase()) || await isAdmin(user)) return user;
  throw fail('This payment does not belong to your account');
}

function safeRedirect(value) {
  const base = new URL(process.env.SITE_URL || 'https://www.guidcy.com');
  try {
    const url = new URL(value || '/login', base);
    if (url.origin === base.origin && url.protocol === 'https:') return url.href;
  } catch (_) {}
  return new URL('/login', base).href;
}

async function rateLimit(req, scope, limit, seconds) {
  // Shared Postgres counter: concurrent Vercel/Edge instances use one atomic limit.
  const ip = String(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = crypto.createHash('sha256').update(`${scope}:${ip}`).digest('hex');
  const allowed = await supabaseRest('rpc/guidcy_rate_limit', { method: 'POST', body: { p_key: key, p_limit: limit, p_seconds: seconds } });
  if (allowed !== true) throw fail('Too many requests. Please try again later.', 429);
}

function protect(handler, { scope, limit = 60, seconds = 60 } = {}) {
  return async function securedHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return handler(req, res);
    try {
      if (Number(req.headers?.['content-length'] || 0) > 1024 * 1024 || (req.body && Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) > 1024 * 1024)) throw fail('Request body too large', 413);
      await rateLimit(req, scope, limit, seconds);
      return await handler(req, res);
    } catch (error) {
      const status = [400,401,403,404,409,413,429].includes(Number(error.status)) ? Number(error.status) : 503;
      if (status === 429) res.setHeader('Retry-After', String(seconds));
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: status === 503 ? 'Service temporarily unavailable. Please try again.' : error.message }));
    }
  };
}

module.exports = { fail, isAdmin, paymentOwner, safeRedirect, rateLimit, protect };
