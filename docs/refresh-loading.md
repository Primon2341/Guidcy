# Refresh and loading behavior

Guidcy is a static HTML/JavaScript SPA, not a React application. Its equivalents
of root layouts and providers are `index.html`, the shared Supabase client, and
the URL/dashboard controllers in `assets/js/app.js`.

## Causes found

- Several public page structures existed only in JavaScript. The initial HTML
  displayed a generic placeholder and handed over on any page-class mutation.
- Auth errors were treated as signed-out results by route guards. Concurrent
  boot readers repeated session/profile work; some dashboard renderers bypassed
  those guards and published empty results before authentication completed.
- Panel refreshes discarded existing content after six seconds and restarted an
  opacity animation on each assignment.
- The footer was nested inside Home and hidden until a JavaScript readiness flag.
- Legacy internal navigation fallbacks reloaded the document. Startup also
  canonicalized requested URLs before the final router was installed.

## Current behavior

The initial document supplies route structures, the base background, and the
footer. The build inlines the small `page-shell.js` bootstrap. Existing fonts
remain self-hosted/preloaded and the logo retains its explicit dimensions.

`auth-lifecycle.js` shares concurrent session reads without replacing Supabase's
session persistence, token refresh, or OAuth implementation. Unknown/error auth
states do not imply sign-out. Dashboard writes wait for session/profile readiness;
the real route is replayed on readiness. Network failures provide a local Retry
action and retry on reconnection. Role-query failures do not select a fallback
dashboard. Explicit login/role checks retain their existing logic.

`page-shell.js` restores allowlisted display regions before deferred application
code executes. The cache is tab-local sessionStorage, scoped to the exact URL and
current project's user ID, expires after ten minutes, and is bounded to six routes
and roughly 900 KB of serialized characters. Restored content is inert and its
inline handlers are removed until live renderers take over. It does not set a
user, role, token, permission, or data-model value. Logout/account changes clear
it. Auth forms and payment/confirmation/meeting/review flows are excluded;
checkout continues to restore its existing booking context.

`ui-refresh.js` attaches before the first application renderer. It holds existing
content during revalidation, reserves space in empty regions, skips identical
markup writes, and does not add a timeout wipe, global progress bar, or swap fade.
Normal internal navigation uses the existing SPA route controller, preserving
queries, fragments, and browser history. Dashboard nested links such as
`/dashboard/webinars` select the corresponding tab without rewriting that URL.

A browser refresh necessarily creates a new document. This implementation keeps
the *visual shell* consistent across that boundary. SPA navigation preserves the
actual header/footer nodes. Cache misses, disabled storage, and expired caches use
structural HTML and local loading regions. External payment/OAuth services and
backend RLS remain authoritative.

## Verification

- `npm run build`
- `node --test tests/auth-lifecycle.test.mjs tests/auth-session-race.test.mjs tests/google-oauth.test.mjs tests/routing-payment-regression.test.mjs tests/webinar-flow-regression.test.mjs tests/admin-payment-refund-render-regression.test.mjs tests/panel-refresh.test.mjs`
- Browser tests: `refresh-first-paint-browser.test.cjs`,
  `refresh-stability-browser.test.cjs`, `auth-navigation-browser.test.cjs`,
  `mobile-dashboard-menu.test.cjs`, and `browser-flow.test.cjs`.

Browser tests use controlled SDK/API fixtures. They do not charge cards, modify
production data, or test live Google/provider availability. Run the static build
before browser tests; Playwright and Chrome must be available locally.
