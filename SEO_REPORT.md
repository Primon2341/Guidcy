# Guidcy technical SEO implementation — 27 September 2026

Preferred public origin: **https://www.guidcy.com**. Search rankings and Google's chosen site name remain Google's decisions; this implementation supplies consistent, crawlable signals rather than promising a ranking.

## Changes delivered

1. **Brand identity:** one linked `Organization` / `WebSite` graph with stable IDs, `name: Guidcy`, `alternateName: guidcy.com`, logo and official HTTPS URL. Retained the existing favicon family, including valid 48×48 and 96×96 icons, and the Guidcy web manifest. No unverified social profiles are claimed in `sameAs`.
2. **Shared metadata:** the static build, public server renderer and SPA share titles, descriptions, canonical URLs and schema definitions. Unique metadata covers Experts, Jobs, Webinars, Marketplace, Funds & Grants, Career & College AI Finder, company/help/legal pages, individual consultants and public detail pages. Internal navigation, Back/Forward and profile rendering update metadata without document reloads.
3. **Canonical consolidation:** permanent 308 redirects consolidate the bare domain and route aliases such as `/browse`, `/experts`, `/webinar`, `/jobs`, `/home` and `/index.html`. Search parameters survive alias redirects. HTTP upgrades remain managed by Vercel; HTTP on the bare domain can take an HTTPS hop followed by the canonical-host hop.
4. **Indexability:** account, dashboard, checkout and other utility pages explicitly carry `noindex`. Robots allows important public content and permits crawlers to see utility-page noindex instructions. Private API endpoints are excluded; the public jobs/opportunities endpoints remain available for rendering and carry an HTTP noindex header. All CSS/JS rendering assets remain crawlable. Preview hosts receive `X-Robots-Tag: noindex, nofollow`. Unknown document/asset URLs return real HTTP 404 responses instead of the homepage with HTTP 200.
5. **Sitemap:** corrected the sitemap XML namespace; list only canonical public URLs, including published consultants, active resources, upcoming webinars, unexpired approved career openings and the existing published article. Dynamic entries use real update/publication timestamps. The sitemap reads current anonymous/public data and is CDN cached briefly. It currently contains **48 URLs**. The build also emits a valid static sitemap.
6. **Server-visible content:** static route HTML activates the correct page before JavaScript. Public consultant profiles include their name, biography, expertise and experience in the server response. Resources, webinars and career openings have dedicated public detail documents with full descriptions and metadata. Directory pages provide no-JavaScript links from an anonymous public-data snapshot generated during deployment; their page shells remain static CDN responses, while interactive catalogs use live data. The existing built-in blog article and blog index render static content. No special user-agent or Googlebot-only content is served.
7. **Structured data:** `BreadcrumbList` on public routes; `ProfilePage` + `Person` on consultant profiles; `Product` + `Offer` on active resource pages; `Event` on dated upcoming webinar details; `JobPosting` on sufficiently specified approved career openings; `Article` on the existing published blog post. No fabricated reviews, ratings, salary estimates, meeting URLs or ticket availability. Per the owner's confirmation, Guidcy's fully remote openings state worldwide eligibility; eligible countries are enumerated for Google's remote-job requirements. Unrelated employers and unspecified on-site jobs do not inherit this policy.
8. **Internal linking:** desktop navigation and brand logo are real anchors while preserving SPA behavior. Expert, resource, webinar and career titles link to stable detail paths. Resources on consultant profiles link to their existing Marketplace records. Webinar sharing now uses `/webinars/{id}` instead of a fragment. Existing purchase, registration, booking and application actions retain their original handlers.
9. **Semantics:** page containers have main landmarks; the expert directory has an accessible H1; consultant names use H1 and their content sections use H2 with unchanged styling. Blog article pages have one primary H1. Breadcrumb navigation identifies its purpose.
10. **Social metadata:** title, description, canonical social URL, site name, locale, image and image alternative text are emitted in the initial HTML and updated during SPA navigation. Consultant/resource images are used only when a valid public image exists; otherwise the existing brand logo is used.
11. **Performance/crawl efficiency:** versioned CSS/JS assets now use one-year immutable caching, with content-hash URLs changed by the build. The seven global stylesheets are combined into one versioned file in their original cascade order, removing six render-blocking requests. The homepage hero preload is discovered at the beginning of the head. Existing image/font optimization and deferred scripts remain. Detail navigation coalesces duplicate requests and reuses the current result for up to 60 seconds. Sitemap catalog reads run concurrently with pagination. No dependency or extra serverless function was added; the deployment remains at 12 functions.
12. **Safe failure behavior:** SEO data requests use the existing anonymous key and RLS, explicit public columns, bounded request timeouts, and escaped HTML/JSON. Missing/unpublished/deleted resources return 404; transient database failure returns 503 + Retry-After rather than incorrectly treating a real page as deleted. Public responses cache for 60 seconds plus a 120-second revalidation window; publication changes can take up to that cache window to reach crawlers.

## Validation

- Production build and JavaScript syntax checks passed.
- 284 automated checks passed, including metadata uniqueness, canonical alias resolution, schema generation, sitemap namespace, escaping, anonymous access, private-page noindex and 404/503 behavior.
- Browser SEO checks passed for direct visits, internal navigation, Back/Forward, noindex-to-public transitions, original action delegation, unknown pages and JavaScript-disabled rendering.
- Existing authentication/navigation checks passed for user, consultant and admin roles at 390px and 1280px, including Google callback return handling, logout, re-login, role guards and Back/Forward.
- Anonymous real-data checks passed for 20 public consultants, 4 active resources, 3 listed webinars and 2 career openings. Only upcoming webinars are included in the sitemap.
- Preview verified a real server-rendered consultant profile, sitemap XML, security headers, preview noindex and query-preserving 308 alias redirects.
- Final live crawl passed for all **48 sitemap URLs**: HTTP 200, one correct canonical, one valid JSON-LD graph and no accidental noindex. Unknown pages return 404; canonical-domain/alias redirects return 308; versioned assets have immutable caching.
- Resource-detail navigation also recovers correctly when visiting a temporarily unavailable listing and using Back; an error screen is never reused as cached resource content.

## Before → after measurements

Mobile Lighthouse against the production homepage, with the same simulated mobile CPU/network settings and a fresh browser. These are individual lab samples, not field Core Web Vitals or a statistical ranking prediction.

| Measurement | Before | After |
| --- | ---: | ---: |
| Lighthouse Performance | 88 | 85 |
| Lighthouse SEO | 100 | 100 |
| LCP | 3.48 s | 3.44 s |
| Total Blocking Time | 61.5 ms | 38 ms |
| CLS | 0 | 0 |
| TTFB, Lighthouse server response audit | 63.9 ms | 84.9 ms |
| First Contentful Paint | 1.93 s | 2.29 s |
| Main-thread work | 2,043 ms | 1,876 ms |
| JavaScript execution | 686 ms | 627 ms |
| JavaScript loaded, decoded bytes | 2,146,545 | 2,166,279 |
| Network requests | 66 | 62 |
| Field INP | Not available | Not available |
| Sitemap URLs | 19 | 48 |

Blocking time fell about 38%, measured main-thread work fell about 8%, and six stylesheet requests were replaced by one. The two SEO scripts add about 20 KB decoded JavaScript, yielding four fewer total requests. LCP was essentially unchanged; FCP/TTFB and the overall Performance score were worse in this final sample. This is **not an across-the-board performance improvement**, and the legacy shared bundle remains the main performance limitation. The existing Lighthouse SEO score was already 100; it does not measure whether Google recognizes a brand or fully audits dynamic content. No field INP improvement is claimed.

Two intermediate deployments measured Performance 69/67 and LCP 7.85/5.61 seconds. Investigation led to static CDN directory shells, avoiding duplicate initial metadata writes, earlier hero discovery and stylesheet consolidation; the final sample above is after these fixes. Directory cold loads no longer wait for a database query. Reports are saved as `/private/tmp/guidcy-seo-before-lighthouse.report.{json,html}`, `/private/tmp/guidcy-seo-final-lighthouse.report.{json,html}` and `/private/tmp/guidcy-seo-final.json`.

## Google Search Console — owner actions

1. Add/verify the **Domain property `guidcy.com`** in [Google Search Console](https://search.google.com/search-console). Add the DNS TXT token supplied by Google at the authoritative DNS provider. Vercel's verified-domain status is not Search Console verification. Retain the TXT record.
2. Submit **https://www.guidcy.com/sitemap.xml** under Sitemaps. Inspect its processing result and discovered URL count after Google fetches it.
3. In URL Inspection, run Test Live URL and Request Indexing for the homepage first, then the main Experts, Jobs, Webinars, Marketplace, Funds & Grants and Career Finder pages, plus representative consultant/resource/webinar/job/article pages. A sitemap covers the rest; repeated manual requests do not guarantee faster indexing.
4. Inspect Google's selected canonical after recrawling. It should be the matching `https://www.guidcy.com/...` URL. Redirected aliases being excluded is expected; account/checkout noindex exclusions are intentional.
5. Run representative public detail URLs through [Rich Results Test](https://search.google.com/test/rich-results) and review Search Console enhancement reports. Local schema checks validate syntax, fields and correspondence to content; they are not a claim of Google rich-result eligibility or approval. Person/site-name schema can also be checked with [Schema Markup Validator](https://validator.schema.org/).
6. Review Page Indexing, Crawl Stats, Core Web Vitals, HTTPS, Manual Actions and Security Issues. Field INP/LCP/CLS require real-user data and time; Lighthouse is a lab test, not field evidence.
7. Track the exact query **Guidcy** in Performance, along with impressions/clicks and the homepage's indexing status. Allow time for recrawling and site-name processing. Do not use Google's temporary removal tool for alias consolidation.

## Content follow-ups / limits

- Link genuine official social/company profiles back to Guidcy and provide their verified URLs before adding Organization `sameAs`. The existing generic social destinations are not evidence of official brand profiles.
- New blog posts currently may fall back to browser-local storage when no shared blog table exists. The existing built-in article is now crawlable; locally saved posts cannot be published to Google. A shared publishing workflow is a separate content/data feature and was not invented in this SEO refactor.
- Find Jobs aggregates external vacancies. No misleading `JobPosting` markup was put on the search-results page or on incomplete external job summaries. The dedicated, approved Guidcy career detail pages carry job markup.
- The current sitemap supports up to 12,000 records per catalog (under the 50,000-URL sitemap ceiling in total). It fails explicitly rather than silently truncating if that ceiling is reached; introduce a sitemap index before that scale.
- The legacy SPA still ships its shared application bundle. This task preserves business/auth/payment behavior; it does not claim a full bundle rewrite or a field Core Web Vitals pass.

Implementation follows Google's [site-name guidance](https://developers.google.com/search/docs/appearance/site-names), [canonicalization guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) and [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies). Remote job markup follows [Google's JobPosting requirements](https://developers.google.com/search/docs/appearance/structured-data/job-posting).
