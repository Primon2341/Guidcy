# Performance optimization — 21 September 2026

This is a measured refactoring of the existing static HTML/JavaScript SPA. No
React migration, database migration, RLS change, API contract change, or deployment
was performed. Existing routes, authentication providers, role checks, payment
calculations and responsive layouts remain in place.

## Before → after

| Metric | Before | After |
|---|---:|---:|
| Lighthouse Performance | 48 / 100 | 76 / 100 |
| LCP | 9.36 s | 5.97 s |
| CLS | 0.9566 | 0.0000 |
| Total Blocking Time | 27.5 ms | 17.0 ms |
| JS loaded (decoded, including SDK) | 2.227 MB | 2.132 MB |
| Network requests | 54 | 50 |
| Total transferred | 1.650 MB | 0.933 MB |
| Main-thread work | 1,988 ms | 1,435 ms |
| JS execution | 977 ms | 540 ms |
| TTFB (local server only) | 3.1 ms | 3.1 ms |
| INP (field) | Not measured | Not measured |

These are local production-build measurements, not production field results.
Lighthouse figures are the median of three cold mobile runs per build, with its
default simulated mobile network and 4× CPU slowdown. Chrome 153.0.8010.50,
Lighthouse 12.8.2, Node 24.15.0. Assets are served with gzip; the actual pinned
Supabase browser SDK runs against read-only, empty API fixtures with 100 ms
latency. External fetch-based data services are intercepted. The baseline's
remote Unsplash image remains part of its real asset waterfall.

INP requires representative interactions/field collection. A navigation
Lighthouse run does not measure INP. The separate browser interaction samples
below must not be interpreted as production INP. Localhost TTFB likewise does
not measure Vercel or Supabase latency.

## Bottlenecks removed

- Repeated document-wide scans for navigation bindings, avatar controls, bank
  labels and modal visibility. A shared observer visits inserted subtrees;
  modal locking watches the actual overlays' visibility attributes. Removed
  the modal poll and its scan on every click.
- Mobile CSS injected after first paint. The same rules now load from a
  stylesheet before rendering, avoiding late header and hero resizing.
- Two existing home sections inserted after startup. Their identical structure
  now ships in HTML, with event handlers attached once.
- Competing footer placement and repeated active-page class toggling. The footer
  stays after the route collection, and rendering the already-active page keeps
  its active class and scroll position.
- Home-only fetching on unrelated routes. Visibility-driven initialization
  replaces a polling gate, waits until synchronous providers are installed, and
  disconnects after initialization. Concurrent personalization refreshes share
  a promise for the same input.
- Fragile read-cache deduplication. The bounded, short-lived cache distinguishes
  identity, schema, range and response headers; invalidates at both ends of a
  mutation; prevents stale in-flight responses from refilling it; and preserves
  each caller's cancellation without cancelling other subscribers. Auth,
  storage, writes and explicitly uncached reads retain their own requests.
- Repeated panel HTML serialization. Refresh interception reuses the previous
  markup and avoids unnecessary title parsing while preserving existing content,
  focused controls, localized loading and error handling.
- Oversized images. Existing hero, logos, careers photography and jobs sprite
  now use optimized WebP assets. Hidden/noncritical images load lazily; careers
  images reserve their dimensions. Original source artwork remains available.
- Unnecessary initial font preloads and non-minified deployable assets. The hero's
  italic font is preloaded, while currency subsets remain available on demand.
  Controllers and remaining stylesheets are minified and versioned.
- Eight explicitly disabled legacy patch bodies and obsolete footer helpers,
  plus booking/payment debug output. Function/global names needed by existing
  compatibility wrappers remain stable. All four declared npm packages have
  active uses, so no dependency was removed speculatively.
- A paint-heavy skeleton animation now animates opacity; a reduced-motion rule
  also covers subsequently mounted UI.

Existing SPA navigation, shared auth initialization, route shells, local panel
loading and payment-script deferral were retained and verified. Remaining
`location` assignments in download/provider flows are intentional. Query limits
were not added to financial aggregates, and database columns were not removed
from shared records without proving every consumer's requirements.

## Browser profiling

| Route | JS execution before → after | Supabase reads before → after |
|---|---:|---:|
| `/` | 462 → 241 ms | 10 → 10 |
| `/find-experts` | 468 → 253 ms | 7 → 6 |
| `/marketplace` | 608 → 333 ms | 7 → 5 |
| `/webinars` | 584 → 321 ms | 8 → 6 |
| `/find-jobs` | 499 → 250 ms | 6 → 4 |
| `/careers` | 492 → 254 ms | 7 → 5 |

These six-route profiles use 390 × 844 mobile viewports, 4× actual Chrome CPU
throttling, a six-second settling interval and a menu-to-Categories interaction.
They record CPU profiles, long tasks, layout shifts, actual panel HTML writes,
resource requests and Supabase read URLs. They are separate from Lighthouse's
simulated timings. This is vanilla JavaScript, so React render counts do not apply.

The maximum recorded menu interaction sample was 32 → 24 ms. Identical duplicate wire reads were 0 → 0 in these fixtures (the baseline already had deduplication). Total reads across the six routes were 45 → 36. All six routes had zero uncaught browser errors. Personalization's recommendation panel HTML writes on a direct Find Experts visit fell from 2 → 0 because hidden home content no longer loads. Other legacy repeated renders remain visible in the JSON results.

The separate existing mobile navigation benchmark (mock SDK, 4× CPU) passed: navigation task time 307 → 180 ms, script time 90 → 26 ms, and measured long-task total 315 → 194 ms. Its timings are not interchangeable with the real-SDK Lighthouse results.

## Verification

- Production build succeeds; all **276** Node regression/unit checks pass.
- First-paint checks pass with app loading delayed: deep links show their own
  shell, protected routes await auth, and the signed-in header survives refresh.
- Repeated-refresh checks pass at 390 and 1280 px: four reloads per public route
  and user/consultant/admin dashboards, stable header nodes, no extra visible
  pages, correct footer position, interrupted revalidation and height release.
- Dashboard earnings checks pass at both widths with delayed fonts/auth/data,
  four reloads, tab navigation, live eligible earnings updates and empty states.
- Finder checks pass at both widths, including functional results and correct
  footer placement across 21 routes.
- Dedicated dashboard-tab and auth-navigation suites pass for all three roles
  at mobile and desktop widths, including logout/relogin and Back/Forward.
- Checkout browser coverage passes from booking through promo, refresh,
  Razorpay fixture, verification, meeting and email fixtures, plus cancelled,
  failed and rejected verification cases at widths 320–1365 px.
- Cache tests cover request identity, independently consumable responses,
  in-flight writes, abort ownership, failed responses and explicit refresh.

Two existing assertions fail on **both** the untouched baseline and optimized
build: `browser-flow.test.cjs:412` expects the admin payouts tab after a fixed
500 ms delay; `webinar-account-gate-browser.test.cjs:165` expects a new signup's
registration to remain incomplete, but its fixture already completes it. The
webinar sign-in/return/My Webinars case passes before that second assertion.
These failures were not hidden or changed to make the suite green.

Tests use fixtures: no real charge, production mutation, email delivery or live
Google OAuth round trip was performed. Those external integrations are not
certified by a local performance audit.

## Reproduce

Baseline source commit: `cd88ae76c554982974bcd72f894e6d89fca27277`.
Build the baseline in a separate checkout and keep its generated `public/`.
Build the optimized checkout using `npm run build` and run:

```sh
node --test tests/*.test.mjs
node tests/performance-audit.cjs /tmp/guidcy-before /path/to/baseline/public 3
node tests/performance-audit.cjs /tmp/guidcy-after public 3
node tests/mobile-performance.test.cjs --cpu-profile
```

The audit needs Playwright (tested with 1.62.1), Lighthouse 12.8.2 and Chrome.
Install tooling separately if desired and point `NODE_PATH` to its `node_modules`;
set `CHROME_PATH` when Chrome is not in the default macOS location. Browser
regression tests also require Playwright and the local production build. Run
CPU audits sequentially, without other browser tests competing for CPU.

The audit creates Lighthouse JSON/HTML reports, six CPU profiles, screenshots,
coverage and `summary.json`. The compact measured results and asset hashes are
checked in alongside this report as `performance-results.json`.

## Remaining limits

The main script still contains a large, order-dependent chain of global patches.
Its remaining size and startup work limit cold-load LCP. Safe route-level
splitting requires explicit module ownership and further migration/coverage;
blindly lazy-loading those patches would change working initialization behavior.
Coverage unused on a public route is not proof that code is dead across admin,
payments or authenticated routes. Existing broad records and financial history
queries also need representative production data before further projection or
pagination changes. Production field INP, real-backend TTFB and large-account
performance remain unmeasured. This pass improves the measured paths but does
not establish that every route meets Core Web Vitals targets.
