#!/usr/bin/env node
/* One-off: mints GOOGLE_REFRESH_TOKEN for lib/google-meet.js.
   Run it, sign in as the Guidcy account that should own every booking,
   paste the printed token into Vercel. Not used at runtime.

   Requires http://localhost:5555/callback in the OAuth client's
   Authorized redirect URIs (Google permits http for localhost). */
const http = require('http');
const { URL } = require('url');

const PORT = 5555;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const clientId = process.env.GOOGLE_CLIENT_ID || process.argv[2];
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.argv[3];

if (!clientId || !clientSecret) {
  console.error('Usage: node mint-google-refresh-token.js <client-id> <client-secret>');
  console.error('   or: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node mint-google-refresh-token.js');
  process.exit(1);
}

/* access_type=offline is what makes Google return a refresh token at all;
   prompt=consent forces a fresh one even if this account already consented
   once (Google silently omits it on repeat grants otherwise). */
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
});

async function exchange(code) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error_description || data.error || `HTTP ${resp.status}`);
  if (!data.refresh_token) throw new Error('No refresh_token returned. Revoke this app at myaccount.google.com/permissions and rerun.');
  return data.refresh_token;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }

  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (err || !code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Authorization failed: ${err || 'no code'}`);
    console.error('\nFailed:', err || 'no code returned');
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const token = await exchange(code);
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Done. Token printed in your terminal — close this tab.');
    console.log('\nGOOGLE_REFRESH_TOKEN=' + token);
    console.log('\nPaste that into Vercel > Settings > Environment Variables, then redeploy.');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Exchange failed: ' + e.message);
    console.error('\nExchange failed:', e.message);
    process.exitCode = 1;
  }
  server.close();
});

server.listen(PORT, () => {
  console.log('Sign in as the Guidcy account that should own every booking:\n');
  console.log(authUrl + '\n');
  console.log(`Waiting on ${REDIRECT} ...`);
});
