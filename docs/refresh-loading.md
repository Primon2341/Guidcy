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

## Repeated refresh and layout follow-up (2026-09-15)

The menu was not identical at first paint: Marketplace and Career & College AI
Finder were appended after boot. Auth callbacks also replaced the account
buttons repeatedly because router binding attributes made their serialized HTML
look different. The complete menu now lives in `index.html`; the account renderer
compares visible state and preserves unchanged nodes and listeners. Header cache
restoration runs just after the closing nav tag, rather than racing the parser.
Only the account renderer writes that cache, using markup with reconnectable
navigation actions.

`page-shell.js` previously overwrote a good region with an empty snapshot when
saving during revalidation. It also treated `aria-busy="false"` as busy, which
excluded completed finder results. Find Jobs also explicitly deleted its existing
search-data cache on ordinary reloads, preventing the live renderer from
reconnecting cached results; that deletion is removed, retaining its existing
expiry and external-link return behavior. The shell cache now checks the value, retains valid pending
regions with their original expiry, and releases temporary height reservations
when live markup takes over in `ui-refresh.js`.

Mobile frame inspection caught a second visible page below the footer: a legacy
DOMContentLoaded callback unconditionally activated Blog on every route. That
callback is removed. Both footer placement helpers now keep the shared footer
after the complete route collection instead of moving it after whichever page
happens to be active during startup. No overflow clipping or height cap was added.

Find Jobs (`#jobs-main-area`) and Career & College AI Finder (`#sf-results`) each
had an empty static results container permanently marked as a skeleton before a
search was submitted. Their idle markup is now empty without a loading class;
the existing search handlers still render their own pending/results/error states.
The optional shell-capture helper no longer marks these idle search regions busy.

Additional browser coverage:
- `repeated-refresh-layout-browser.test.cjs`: four consecutive reloads of seven
  public routes and each dashboard role at 390px and 1280px; unchanged menu node
  identity during restoration, single visible route, account actions, interrupted
  cache writes (including aria-busy=false), and released cached heights.
- `finder-layout-browser.test.cjs`: real UI submissions against local API
  fixtures for jobs and both AI modes; zero-height idle results without pseudo
  skeletons; footer boundaries on 21 public routes at mobile and desktop sizes,
  including opening/closing the mobile menu.

These checks use local Chrome and fixtures; they do not deploy the changes or
exercise live payment/OAuth providers. Screenshots are written outside the repo
under `/private/tmp`.
