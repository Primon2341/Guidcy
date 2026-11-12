# Purchased Notes: compact action and faster loading

## Cause and changes

The purchase renderer waited for interrupted-payment reconciliation before querying any completed purchases. A slow payment gateway therefore delayed already confirmed notes. It also fetched display metadata for the entire notes catalogue on every visit.

- Render confirmed purchases independently of background recovery. Refresh the visible purchase table after server verification succeeds; never unlock a pending payment optimistically.
- Join only note title, category and uploader name through the existing order-to-note foreign key. Fetch the order fields used by the table and completion checks, retaining legacy email-based ownership lookup and order snapshots.
- Deduplicate concurrent requests and cache results in memory for 30 seconds per user/email/auth epoch. Checkout completion and successful recovery invalidate the cache. Download authorization continues to use the existing fresh ownership checks.
- Bound purchase loading and recovery requests to 12 seconds, retain Retry, and prevent late table results from overwriting another tab or account.
- Reduce the visible View / Download control to 32px high with 12px text and compact padding. Touch devices retain a 44px button target.

No schema, RLS, production data, authentication or download/payment flow changes were made.

## Measurement

Local built-site Chrome fixture: 100ms database responses and a 1500ms pending-payment response; one confirmed legacy email-owned purchase and one pending purchase.

| Metric | Before | After |
| --- | --- | --- |
| First confirmed purchase table | 1737ms | Approximately 120ms at desktop and mobile widths |
| Requests before first table | 4 | 3 |
| Full notes catalogue read | 1 | 0 |
| Requests on a repeat visit within cache lifetime | Repeated lookups | 0 |

The first-table improvement is approximately 93% in this controlled delayed-payment scenario. This is not a production page-load or Core Web Vitals measurement. Gateway and network latency remain external factors, but confirmed purchases no longer wait on the gateway.

## Validation

- `npm run build`
- `node --test tests/purchased-notes-load.test.mjs tests/dispute-payout-marketplace-regression.test.mjs`: 11 checks passed.
- `tests/purchased-notes-browser.cjs`: 1280px and 390px, confirmed-first rendering, verified recovery, cache reuse/invalidation, concurrent lookup deduplication, account isolation, failure/retry, late-tab response handling and a downloaded PDF through the existing authenticated handler. Uses offline fixtures only.
- `tests/dashboard-tabs-browser.test.cjs`: all 88 user, consultant and admin dashboard tab/viewport combinations passed, including purchase reloads and browser history navigation.
- Syntax and whitespace checks passed. Changes are local; no deployment performed.
