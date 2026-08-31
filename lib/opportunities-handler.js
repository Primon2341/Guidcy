const crypto = require('crypto');

function clean(value, max = 500) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(20, parsed));
}

function validTavilyKey(value) {
  const key = clean(value, 240);
  return /^tvly-[A-Za-z0-9_-]{12,}$/.test(key) ? key : '';
}

function resolveTavilyKey(req) {
  const serverKey = validTavilyKey(process.env.TAVILY_API_KEY || process.env.TAVILY_KEY);
  if (serverKey) return serverKey;

  // Backward-compatible migration path for the key already shipped in older Guidcy builds.
  // The browser sends it only to this same-origin proxy; new deployments should use TAVILY_API_KEY.
  return validTavilyKey(req && req.headers && req.headers['x-guidcy-tavily-key']);
}

function sourceName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, 80) || 'Web Search';
  } catch (_) {
    return 'Web Search';
  }
}

function normalizeResult(item, index, type) {
  const url = clean(item && item.url, 1500);
  if (!/^https?:\/\//i.test(url)) return null;
  const title = clean(item && item.title, 180);
  if (!title) return null;
  const id = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20);
  const content = clean(item && (item.content || item.raw_content), 1200);
  return {
    id: `tv_${id || index}`,
    type,
    title,
    url,
    description: content,
    desc: content,
    source: sourceName(url),
    score: Number(item && item.score) || 0,
    verified: false,
  };
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(status).end(JSON.stringify(payload));
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, X-Guidcy-Tavily-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'method_not_allowed', error: 'Method not allowed.' });

  const query = clean((req.query && (req.query.q || req.query.query)) || '', 500);
  if (!query) return sendJson(res, 400, { ok: false, code: 'invalid_query', error: 'Search query is required.' });

  const key = resolveTavilyKey(req);
  if (!key) {
    return sendJson(res, 503, {
      ok: false,
      code: 'not_configured',
      error: 'Opportunity search is not configured. Add TAVILY_API_KEY to the deployment environment.',
    });
  }

  const type = clean(req.query && req.query.type, 30).toLowerCase() === 'startup' ? 'startup' : 'student';
  const maxResults = clampLimit(req.query && req.query.limit);

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        topic: 'general',
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        max_results: maxResults,
      }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
    });

    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = {}; }

    if (!response.ok) {
      const code = response.status === 429
        ? 'rate_limited'
        : (response.status === 401 || response.status === 403 ? 'unauthorized' : 'provider_error');
      const status = response.status === 429 ? 429 : (code === 'unauthorized' ? 401 : 502);
      return sendJson(res, status, {
        ok: false,
        code,
        error: code === 'rate_limited'
          ? 'Opportunity search is temporarily rate limited.'
          : (code === 'unauthorized' ? 'The Tavily API key was rejected.' : 'The opportunity search provider returned an error.'),
      });
    }

    const results = (Array.isArray(payload.results) ? payload.results : [])
      .map((item, index) => normalizeResult(item, index, type))
      .filter(Boolean);

    return sendJson(res, 200, { ok: true, results });
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return sendJson(res, 502, {
      ok: false,
      code: timedOut ? 'timeout' : 'network',
      error: timedOut ? 'Opportunity search timed out. Please try again.' : 'Could not reach the opportunity search provider.',
    });
  }
}

module.exports = handler;
module.exports._test = { clampLimit, normalizeResult, resolveTavilyKey, validTavilyKey };
