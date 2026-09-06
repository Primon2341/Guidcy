/* The AI matcher never actually ran in production. api/expert-match.js built its
   own Supabase base URL and only stripped a trailing slash, but the SUPABASE_URL
   env carries a "/rest/v1" suffix - which is exactly why lib/razorpay-utils has
   normalizeSupabaseUrl. Every call asked for /rest/v1/rest/v1/... and Supabase
   answered "Invalid path specified in request URL", so zero consultants were
   fetched, zero matches were returned, and the browser fell back to keyword
   ranking every single time. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require_ = createRequire(import.meta.url);
const match = fs.readFileSync(new URL('../api/expert-match.js', import.meta.url), 'utf8');
const agentic = fs.readFileSync(new URL('../api/agentic-guidcy.js', import.meta.url), 'utf8');

test('a Supabase base URL keeps only its origin', () => {
  const origin = raw => { try { return new URL(String(raw).trim()).origin; } catch (_) { return ''; } };
  // the shape that actually broke it
  assert.equal(origin('https://ref.supabase.co/rest/v1'), 'https://ref.supabase.co');
  assert.equal(origin('https://ref.supabase.co/rest/v1/'), 'https://ref.supabase.co');
  assert.equal(origin('https://ref.supabase.co/'), 'https://ref.supabase.co');
  assert.equal(origin('https://ref.supabase.co'), 'https://ref.supabase.co');
  // the old code only did this, which leaves the path on
  assert.equal('https://ref.supabase.co/rest/v1'.replace(/\/$/, ''), 'https://ref.supabase.co/rest/v1');
});

test('expert-match uses the shared helper rather than its own base URL', () => {
  assert.match(match, /const supabaseRest = supabaseFetch;/,
    'it must go through rag-utils, which takes the origin');
  assert.doesNotMatch(match, /const SUPABASE_URL =/,
    'a second, differently-normalised base URL is how this broke');
  assert.doesNotMatch(match, /GUIDCY_PUBLIC_ANON_KEY/,
    'the hardcoded anon key went with it');
  assert.match(match, /supabaseFetch,/, 'and it must actually be imported');
});

test('the shared helper still builds paths the same way', () => {
  const utils = require_('../lib/rag-utils.js');
  assert.equal(typeof utils.supabaseFetch, 'function', 'expert-match depends on this export');
});

test('agentic-guidcy had the same trap and no longer does', () => {
  assert.match(agentic, /new URL\(raw\)\.origin/);
  assert.doesNotMatch(agentic, /\|\| 'https:\/\/lsthngfxehayeqyctkla\.supabase\.co'\)\.replace\(\/\\\/\$\/, ''\)/,
    'the slash-only strip is what left /rest/v1 on the base');
});
