import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const handler = require('../lib/opportunities-handler.js');
const clientSource = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

function responseHarness() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    end(body = '') { this.body = String(body); return this; },
  };
}

function request(query = {}, headers = {}) {
  return { method: 'GET', query, headers };
}

test('opportunity API sends Tavily authorization server-side and normalizes results', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = 'tvly-test_server_key_123456789';
  let upstreamOptions;
  globalThis.fetch = async (_url, options) => {
    upstreamOptions = options;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        results: [{ title: 'Startup India Seed Fund', url: 'https://example.gov/grant', content: 'Funding for eligible startups.', score: 0.93 }],
      }),
    };
  };

  try {
    const res = responseHarness();
    await handler(request({ q: 'startup grants India', type: 'startup', limit: '24' }), res);
    const payload = JSON.parse(res.body);
    const upstreamBody = JSON.parse(upstreamOptions.body);

    assert.equal(res.statusCode, 200);
    assert.match(upstreamOptions.headers.Authorization, /^Bearer tvly-/);
    assert.equal('api_key' in upstreamBody, false);
    assert.equal(upstreamBody.max_results, 20);
    assert.equal(payload.results[0].type, 'startup');
    assert.equal(payload.results[0].title, 'Startup India Seed Fund');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});

test('opportunity API supports the existing same-origin legacy key during migration', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TAVILY_API_KEY;
  const previousAlias = process.env.TAVILY_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_KEY;
  let authorization = '';
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return { ok: true, status: 200, text: async () => JSON.stringify({ results: [] }) };
  };

  try {
    const res = responseHarness();
    await handler(request({ q: 'scholarships' }, { 'x-guidcy-tavily-key': 'tvly-test_legacy_key_123456789' }), res);
    assert.equal(res.statusCode, 200);
    assert.match(authorization, /^Bearer tvly-/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
    if (previousAlias === undefined) delete process.env.TAVILY_KEY;
    else process.env.TAVILY_KEY = previousAlias;
  }
});

test('opportunity API reports missing configuration without attempting provider search', async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousAlias = process.env.TAVILY_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_KEY;
  try {
    const res = responseHarness();
    await handler(request({ q: 'fellowships' }), res);
    const payload = JSON.parse(res.body);
    assert.equal(res.statusCode, 503);
    assert.equal(payload.code, 'not_configured');
  } finally {
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
    if (previousAlias === undefined) delete process.env.TAVILY_KEY;
    else process.env.TAVILY_KEY = previousAlias;
  }
});

test('client uses the shared proxy, current Bearer fallback, and stale-request cancellation', () => {
  assert.match(clientSource, /fetch\('\/api\/opportunities\?'/);
  assert.match(clientSource, /headers\['X-Guidcy-Tavily-Key'\]=legacyKey/);
  assert.match(clientSource, /'Authorization':'Bearer '\+key/);
  assert.doesNotMatch(clientSource, /api_key:key/);
  assert.match(clientSource, /_activeOpportunitySearch\.abort\(\)/);
  assert.match(clientSource, /requestId!==_opportunitySearchRequestId/);
});
