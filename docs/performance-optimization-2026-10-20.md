# Guidcy performance audit — 20 October 2026

This pass optimizes the existing vanilla JavaScript SPA. It does not introduce
React or redesign the interface. No deployment, production-data update, schema
migration, RLS change or payment calculation change was made during this pass.

## Measured comparison

| Before / problem | Optimization | After | Measured improvement |
|---|---|---|---|
| Homepage Lighthouse 75; LCP 6.31 s | Remove obsolete hero preload, avoid unrelated feature downloads, reduce the brand image and unnecessary font preloading | Lighthouse 79; LCP 5.05 s | 20% lower LCP; target 2.5 s / score 90 remains unmet |
| 1,011,450 bytes transferred; 34 requests on cold home load | Same changes | 798,389 bytes; 30 requests | 21% fewer transferred bytes; four fewer requests |
| Find Expert initially downloads social/profile and blog implementations | Keep direct-route scripts in server HTML; load other features only when their route is visited | Initial compressed JavaScript 553,123 → 518,558 bytes, including SDK | About 6% less initial JavaScript on unrelated routes |
| Same fuzzy token comparisons repeated across expert profiles | Share token-distance results within each search | 11.29 → 2.17 ms per search in a 200-candidate benchmark | About 81% less search computation; all compared rankings/scores identical |
| Small logo uses a 256 px, 54,443-byte PNG | Serve the same artwork as a 128 px lossless WebP | 13,882 bytes | 75% smaller; enough pixels for the current header/footer at 2× density |
| Autocomplete selects every consultant/profile column | Select explicit fields and filter active consultants | Anonymous consultant response 325,250 → 310,665 JSON bytes for 20 rows | 4.5% smaller logical response; this is uncompressed JSON, not wire transfer |
| Reminder loop reads the same consultant email once per booking | Fetch it once for the batch | One email query for a nonempty batch | N → 1 queries; every booking still receives its existing reminder/review processing |
| Session-history polling continues in a hidden browser tab | Skip that poll while the document is hidden | No hidden-tab poll requests | Visible-page behavior and existing live update handlers retained |
| Find Expert CLS 0.638; populated home 0.191; AI Finder 0.136 | Render the existing guidance form in initial HTML, reserve the loading profile card, remove the obsolete mobile style override | 0.0004 / 0.0006 / 0.0008 respectively | All 14 final route fixtures meet CLS < 0.1 |

Homepage figures are medians of three cold mobile Lighthouse runs per build.
Homepage CLS improved from **0.0836 to 0.0706**, within the 0.1 target.
Median total blocking time increased from **44.5 to 95.6 ms** in this run. The
large shared script still limits cold loading.
These results do not establish production field INP or a score above 90.
First contentful paint stayed approximately **1.51 s**. Median main-thread time
was **1.00 → 1.17 s**, and JavaScript execution **476 → 530 ms**. Startup CPU/TBT
results varied between runs; no overall startup-CPU improvement is claimed.

The admin overview also had a repeat-render loop: old completion timers replayed
an overview that a newer request had already rendered correctly. The controller
now replays only when an older, different tab actually overwrote the requested
tab. Query invocations fell from **518 to 34** in the same fixture scenario,
a **93% reduction**. The accompanying JSON records the counts.
These fixture SDK counts describe repeated client work, not billed wire requests.

The separate slow-mobile route lab recorded the following. Its mock SDK and
single run per route mean these timings should be used as comparisons within
this lab, not as production Core Web Vitals. The largest sampled menu interaction
was 72 ms; that sample is not field INP.

| Route | LCP before → after, ms | Requests before → after | SDK query invocations before → after |
|---|---:|---:|---:|
| Home | 1,748 → 1,296 | 30 → 26 | 10 → 10 |
| Find Expert | 1,408 → 1,304 | 30 → 25 | 6 → 6 |
| Consultant profile | 1,732 → 1,248 | 34 → 31 | 84 → 84 |
| User dashboard | 1,408 → 1,260 | 29 → 26 | 10 → 10 |
| Consultant dashboard | 1,408 → 1,272 | 30 → 27 | 19 → 19 |
| Admin dashboard | 1,424 → 1,256 | 30 → 26 | 518 → 34 |
| Login | 1,404 → 1,284 | 29 → 26 | 0 → 0 |
| Signup | 1,408 → 1,304 | 28 → 25 | 0 → 0 |
| Webinars | 1,416 → 1,292 | 32 → 29 | 3 → 3 |
| Marketplace | 1,368 → 1,264 | 36 → 32 | 16 → 16 |
| Blog | 1,424 → 1,356 | 30 → 28 | 3 → 3 |
| Find Jobs | 1,408 → 1,268 | 31 → 27 | 8 → 8 |
| Career AI Finder | 1,424 → 1,284 | 30 → 27 | 3 → 3 |
| Careers | 3,256 → 2,796 | 31 → 27 | 4 → 4 |

## What changed

- `feature-loader.js` loads the existing community, profile resources and blog
  scripts by route. The server still emits ordinary deferred script tags for
  features required by a direct visit, preserving early discovery and SEO.
  Dependencies stay ordered, concurrent downloads share one promise, and failed
  downloads remain retryable with a visible retry control.
- The shared script loader removes failed script elements before retrying.
  Feature activation follows actual URL/page changes. Same-page author filters
  update without a full reload, and no-op class writes cannot start a render loop.
- Dashboard completion guards stop redundant overview reloads while retaining
  correction when a stale render paints the wrong tab. Financial calculations,
  authorization and data ownership are unchanged.
- Expert search retains fuzzy matching, suggestions, photos and spelling
  correction. Its per-search cache is discarded after each search and cannot
  retain private account data. Existing query cancellation, debouncing and
  identity-aware request caching remain in place.
- Profile header avatars load eagerly; below-the-fold avatars retain lazy
  loading. New avatar crops save as WebP through the existing validated photo
  API. Existing stored photos are unchanged. Post/cover compression, PDF preview
  lazy loading and image dimensions already present in the application remain.
- Removed the old homepage hero image preload and the global italic-font
  preload. Font faces remain available with `font-display: swap`.
- The existing expert matching form now ships in HTML with actions disabled
  until its current handlers are ready. Removed its delayed insertion function,
  retry timers and redundant search wrapper. The AI page's obsolete mobile
  selector no longer changes columns after inline styles are normalized; its
  final layout is preserved from first paint. Home reserves profile-card space
  only while the existing loading skeleton is present.

The existing packages all have active uses: Supabase, Razorpay, PDF.js, Terser
and CleanCSS. None was removed speculatively. Existing build minification,
versioned assets, deferred payment/document libraries, CSS bundling, skeletons
and refresh shells were retained. The order-dependent global patch chain cannot
be treated as dead code solely because a public-route coverage report does not
execute it.

## Method and artifacts

- Baseline is the saved production build immediately before this optimization
  pass, including the user's existing homepage/profile changes.
- Lighthouse uses Chrome, Lighthouse 12.8.2, gzip assets, the real pinned
  Supabase browser SDK and local read-only empty API fixtures with 100 ms latency.
  Read-only feed RPCs return valid empty responses. Writes are rejected.
- Six public-route CPU profiles use a 390 × 844 viewport and 4× CPU throttling.
- A separate 14-route lab uses fixture accounts/data, a mock SDK, 4× CPU
  throttling and 1.6 Mbps / 150 ms network emulation. Its timings and query
  invocations must not be confused with real-backend latency or Lighthouse's
  simulated timings. Corrected guest/blog fixtures were applied equally to
  baseline and optimized measurements.
- The search microbenchmark runs six queries over 200 candidates, five rounds
  of 30 searches. The median is divided by 30. Exact result IDs, scores and tiers
  were compared between versions; it is an unthrottled Node benchmark.
- Query response sizes were checked with an anonymous, read-only database query.
  Only aggregate byte counts were returned. No account or resource data changed.
- `performance-2026-10-20.json` contains compact results and build asset hashes.
  Full local Lighthouse reports and CPU profiles are under
  `/private/tmp/guidcy-perf-oct20-{before,after}/valid-feed/`.

Reproduce with `npm run build`, then run `tests/performance-audit.cjs` against
each saved build and `tests/performance-routes.cjs` against the same two builds.
Both tools need local Playwright/Chrome; the Lighthouse audit also needs
Lighthouse. CPU measurements should run sequentially without other browser tests.

## Verification and limits

The production build and focused search/cache/loading/dashboard tests pass.
Browser checks cover role-specific login/logout and callback fixtures, all three
dashboards, profile/resource actions, booking availability and checkout,
Razorpay success/failure/verification fixtures, blog administration and public
rendering, Back/Forward, SEO metadata and JavaScript-disabled public content.
Community checks cover posts, reactions, comments, sharing, follow lists,
connections, endorsements, photo controls, career/education/portfolio editors,
featured items and guest gates. Desktop and mobile widths are covered.

Webinar checks hold back photos and seat counts: cards appear first, only one
listing request occurs per refresh, existing cards survive enrichment, failures
preserve real content, and valid empty responses clear it. Two outdated browser
fixtures were corrected: the secure webinar directory/count paths, and the
expectation that a profile without a college should display a degree as a college.

The broad Node run has **292 passes out of 297**, with five unrelated failures
still visible: an obsolete experience-section source assertion, a similar-expert
source assertion, a date-sensitive Meet assertion (its fixed August date is now in the past), and two old opportunities
cache source-extraction assertions. They were not suppressed to obtain a clean
test count. Live account creation, Google-provider consent, real charges, email
delivery and production field INP were not exercised by fixture tests.

## Remaining bottlenecks requiring separate work

1. **Shared legacy bundle and mounted-page HTML.** About 1.74 MB of minified
   `app.js` remains shared across routes. Its global wrappers inspect and replace
   one another, so further splitting needs explicit ownership of dashboard,
   marketplace, webinar, jobs and AI modules with flow-by-flow migration. Blind
   deferred execution would change initialization and payment behavior.
2. **Existing inline avatars.** Avatar values account for 281,396 of the 325,250
   anonymous consultant JSON bytes (about 87%). Moving old embedded images to
   storage and serving cached responsive thumbnails would substantially reduce
   repeated directory payloads. That requires a planned data/storage migration;
   this pass only optimizes future image saves.
3. **Financial/history scale.** Existing financial summaries depend on complete
   records. Paging them safely requires server-side totals and paginated detail
   endpoints rather than silently truncating transactions.
4. **Database advisors.** Read-only inspection reported 27 uncovered foreign
   keys, 129 auth/RLS init-plan notices, 60 multiple-permissive-policy notices,
   two duplicate-index notices and 69 unused-index notices. Current tables are
   small (63 bookings, 26 consultants at inspection); scan counts alone do not
   prove a missing-index bottleneck. RLS rewrites and index removals require
   query plans, role/security tests and a backward-compatible migration. See
   Supabase's [foreign-key index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
   [RLS init-plan guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
   and [duplicate-index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).
5. **Production field data.** All 14 final route fixtures meet the 0.1 CLS
   target. Populated home improved from 0.191 → 0.0006, Find Expert from
   0.638 → 0.0004, and Career AI Finder from 0.136 → 0.0008. Those improvements
   come from reserving the loading profile card, rendering the existing expert
   form in initial HTML, and removing an obsolete inline-style-sensitive mobile
   rule. Production field INP, large-account latency and real mobile hardware
   remain unmeasured. Menu interaction samples and Lighthouse blocking time are
   not substitutes for INP.

Changes are ready locally; production behavior has not been verified after a
deployment because this pass has not been deployed.
