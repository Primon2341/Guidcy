# Remediation status — 26 September 2026

**28 September correction:** The owner confirmed `guidcytechnologies@gmail.com` is a consultant account. The earlier admin seed incorrectly included it. Migration `20260928024013_restore_consultant_account_role.sql` removes its private administrator membership and restores its profile role to `consultant`, preserving its consultant record. Live checks confirm its admin predicate is false and the existing primary administrator remains enabled. Email-based admin bypasses were removed from cancellation, refund, Marketplace reconciliation, referral administration and the affected browser controls; configured notification addresses no longer grant these permissions. Regression checks cover the consultant mailbox even when it is configured as `ADMIN_EMAIL`.

Security changes were deployed to Guidcy's production Vercel project and Supabase project `lsthngfxehayeqyctkla`. The original audit below is retained as historical evidence; its vulnerable-code line numbers describe the pre-fix revision.

| Finding | Current treatment |
| --- | --- |
| Caller-controlled Supabase destination / credential forwarding | Removed; database hosts and credentials come from server configuration. |
| Self-assigned admin role | Private admin membership registry, protected profile fields, safe signup role assignment. |
| Forged payments / free purchases | Database derives prices and identity; protects settlement and access flags; API checks authenticated ownership and captured payment. |
| Public private records | Owner/participant RLS; public directories redact contact, financial and meeting details; webinar counts are aggregated. |
| Stored markup in profiles/reviews/notifications | Escaped affected plain-text render paths and validated profile colors. This is not a claim that every legacy renderer has been formally verified. |
| Vulnerable PDF.js | Pinned local PDF.js 6.3.289, disabled eval, updated worker loading and cleanup APIs. |
| Arbitrary transactional email | API derives recipient and event data from saved authorized records; legacy Edge entry points delegate to that authorization. Server jobs retain trusted delivery. |
| Private RAG search | Public search enforces public visibility. |
| Moderation/ownership changes | Database guards prevent owner edits to approval and protected financial/identity fields. |
| Abuse controls | Shared atomic API rate limits, bounded request bodies, restricted recovery redirects and uniform reset responses. |
| Browser / storage hardening | Live CSP, nosniff, frame protection; resume MIME/size constraints; constrained function search paths and trigger execution grants. |
| Guest support | Private inserts remain usable; new tracking IDs use 128 random bits. Guest tracking uses the exact secret ID; legacy weak IDs require account authorization. |

Verified:

- 280 Node checks pass, including new payment, email, redirect, rate-limit and SPA transport security checks.
- Production build succeeds; deployment dependency audit reports zero known npm vulnerabilities.
- Rolled-back database fixtures verify signup role safety, unauthorized role/payment writes, canonical prices, free purchases, private-field redaction, registration identity and public directory access.
- Live anonymous checks confirm private tables return no rows, directory fields are redacted, unauthorized payment/email requests are rejected, and security headers/PDF module are served.
- Live mobile browser check confirms expert cards and real PDF.js first-page rendering. Profile resource/webinar regression checks cover desktop and mobile navigation, checkout fixtures and booking-shell stability.
- No real charge, refund, user email, or Google invitation was triggered by these tests. Temporary database test records were rolled back.

Outstanding account-level actions:

1. Rotate/revoke the Supabase server credential that the old forwarding vulnerability could have exposed, update affected deployments, and review historical access logs. The vulnerability was reproducible with dummy credentials; historical exploitation was not established. No key rotation was performed: available connector tools cannot rotate it and the dashboard UI surface was unavailable. Follow [Supabase API-key rotation guidance](https://supabase.com/docs/guides/getting-started/api-keys).
2. Enable [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Supabase still reports it disabled; configuration requires dashboard/management access and the feature requires Pro or above. No plan upgrade was made.

Remaining advisor notices for intentionally callable RLS/referral/tracking helper functions require contextual review; a SECURITY DEFINER notice by itself is not proof of unrestricted data access. Do not report zero remaining warnings. The existing SPA requires inline scripts/handlers, so CSP retains `unsafe-inline`; the escaping fixes are the primary defense for the reviewed stored-markup paths. Client-only promo definitions are not trusted to lower server-calculated prices; the live database has no authoritative promo table.

These fixes reduce the verified risks. They do not certify that the system has no undiscovered vulnerabilities; key rotation and the password-setting action above remain open.

---

# Guidcy security audit — 26 September 2026

**Result: critical issues remain. The application should not be considered security-ready.**

This was a read-only review of the current workspace, live Supabase project `lsthngfxehayeqyctkla`, deployed email Edge Function, and public website headers. No production records, permissions, secrets or deployments were changed. This report is not evidence that anyone has exploited these issues.

## Findings, in priority order

### 1. Critical — API can disclose the Supabase service key

**Code:** `api/send-guidcy-email.js:233`, `:254`, `:171`, `:287`.

The referral-admin handler accepts `payload.supabase_url`. It authenticates against that caller-selected host, then sends the real server-side service key to the same host while fetching a profile. A caller-controlled server can return a fabricated user response. The service key leaves the application **before** the admin-role check. The same override also reaches referral writes.

**Verified:** a local execution of the actual handler with mocked HTTP responses sent a dummy service key to the caller-selected host with a dummy bearer token. No real credential was used or transmitted. Whether the current Vercel deployment contains this exact source was not verified.

**Fix:** remove client-supplied database URLs/keys from all privileged operations. Use only trusted server configuration; verify users against that configured project. If this version is deployed, close the path first, rotate the affected service credential across dependent services, and investigate access logs.

### 2. Critical — ordinary users can grant themselves admin privileges

**Live database evidence:** `profiles_update_own` and `Users can update own profile` authorize updates to a user's entire profile row. The authenticated role has UPDATE/INSERT privileges on `profiles.role` and `profiles.email`. No role-protection trigger exists; the role constraint explicitly permits `admin`.

`guidcy_is_admin()` trusts the editable profile role. Its UUID overload also trusts the editable profile email. Additionally, `handle_new_user()` copies `raw_user_meta_data.role` directly into `profiles.role` on signup. Signup metadata is caller-controlled.

**Impact:** an ordinary account can obtain administrative authorization used by many database policies and server handlers. Profile archive synchronization also copies the role into `users`.

**Fix:** make role/admin identity server-controlled, enforce protection for both INSERT and UPDATE, and stop deriving authorization from editable metadata/profile email. Preserve legitimate admin provisioning through a trusted server path. Review existing admin assignments after closing these paths.

### 3. Critical — clients can forge payment/access state

**Live database evidence:** `Buyer can create own marketplace order` and `Buyer or admin can update marketplace order` permit buyers to set their own `payment_verified`, `payment_status`, `download_granted`, price and payout fields. Column grants permit those writes; there are no Marketplace order protection triggers.

The private-PDF storage policy trusts `download_granted` together with completed/success/free status from those same buyer-editable orders. A private bucket alone therefore does not prevent unpaid access.

Webinar policy `reg_ins` permits public INSERT with `WITH CHECK true`; inserts can include confirmed/paid flags and a selected user ID. The meeting-read policy trusts those flags. Bookings likewise allow whole-row participant updates, including financial state; `guidcy_enforce_booking_financial_lifecycle()` enforces lifecycle consistency but does not authenticate the writer of payment flags. `lib/razorpay-utils.js:165` also prices bookings from these writable booking amounts.

**Fix:** derive prices and payment/access state on the server, make financial fields immutable to ordinary clients, constrain registration ownership, and grant access only from trusted payment confirmation. Preserve free registration through a validated server path. Review potentially forged purchases and payout records. These conclusions come from policies/grants/triggers; no fraudulent live transaction was attempted.

### 4. High — private fields are readable without signing in

**Verified live:** in a read-only transaction under the `anon` database role, SELECT exposed 41 profile rows, 26 consultant rows and 4 webinar-registration rows. Only counts were retrieved. Support tickets had zero rows, but unrestricted public read policies also cover that table.

Unrestricted policies include `profiles_select_all`, `Public profiles readable`, `consultants_select_all`, `reg_sel`, and public support-ticket read policies. Column grants expose profile email/phone, webinar registrant email/phone, consultant `upi_id`/`bank_ifsc`, and support messages. Public consultant policies also override narrower approved-only policies.

**Fix:** expose a deliberately limited public projection for consultant display and aggregate webinar seat counts. Restrict contact, financial and support fields to owners/authorized staff. Remove overlapping permissive policies. Reducing columns in the browser query does not restrict what another API caller can request.

### 5. High — stored HTML/script injection in public profiles

**Code:** `assets/js/app.js:2885`, `:2937`, `:2942`, `:2952`.

Database-controlled consultant name, bio, education, tags and review text enter template strings assigned to `innerHTML` without escaping. These fields are user-editable. The avatar URL is escaped, but adjacent text fields are not.

**Impact:** stored malicious markup can execute when a visitor opens the profile. Browser-readable authentication state increases the impact. This is a verified source-to-HTML path; no malicious content was stored or executed on the live site.

**Fix:** use text nodes or the existing HTML-escape helper for plain text, validate URL schemes for links, and sanitize any intentionally supported rich HTML. Cover every rendering path, including administrator views.

### 6. High — vulnerable PDF viewer loaded outside npm

**Code:** `assets/js/app.js:9756`, `:9860`, `:11925`, `:11928`; `assets/js/profile-resources.js:57`.

The site loads PDF.js **3.11.174** from a CDN. Its `getDocument()` calls do not disable `isEvalSupported`. That version falls within CVE-2024-4367, which permits JavaScript execution in the hosting origin when rendering a malicious PDF. The publisher identifies 4.2.67 as the first patched version and documents `isEvalSupported: false` as a workaround. [Mozilla security advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq).

**Fix:** migrate all loaders/workers to a maintained patched version, with compatibility checks for previews and resume extraction. Apply the documented workaround at every document load as immediate containment. No malicious PDF was opened during this audit. npm audit does not cover this CDN dependency.

### 7. High — payment endpoints lack consistent ownership checks

**Code:** `api/create-order.js:26`, `:59`; `api/verify-payment.js:94`, `:160`, `:167`.

`create-order` loads records through the service role without authenticating the requester or checking ownership; fulfilled records are returned in full. Locally reproduced: an unauthenticated caller received a fixture belonging to another buyer. The raw-order branch also permits anonymous Razorpay order creation.

The normal verification path returns already-fulfilled records before validating the supplied signature. Invalid signatures can mutate pending records to failed. The free-webinar branch lacks a requester ownership check. The Marketplace reconciliation branch does authenticate and check ownership, but the other branches do not share that protection.

**Fix:** authenticate and authorize before reading, returning or mutating payment records. Return minimal response fields; do not mutate records based on an unauthenticated invalid callback. Keep signature, order, currency and amount verification, and validate capture before granting paid access—the normal path currently accepts `authorized` as well as `captured`.

### 8. High — transactional email can be invoked without user authorization

**Code:** `api/send-guidcy-email.js:496`, `:527`, `:589`; live `send-guidcy-email` Edge Function version 7.

General email requests accept caller-selected recipients, notification types, subject/data and action links without verifying a signed-in user or the related business event. A local mocked execution reached the email provider without an Authorization header. **No email was sent.**

The deployed Edge Function also accepts `payload.to` without a user-level authorization check. Its gateway JWT check is enabled, but the application's public legacy anon JWT is not proof of a signed-in authorized user.

**Fix:** derive recipients/content from authorized persisted events, restrict event types and links, and rate-limit/deduplicate server-side. Apply the fix to both Vercel and Supabase implementations. This prevents spam, false payment/approval notices and phishing through the Guidcy sender.

### 9. Medium — privileged RAG search trusts caller-selected visibility

**Code:** `api/rag-search.js:27`; `lib/rag-utils.js:127`; live `match_rag_chunks` function.

Unauthenticated callers can request `filter_visibility: 'private'` or `'admin'`. The server forwards it using service credentials; the database function filters by that value rather than authorizing the caller. Locally reproduced with mocked retrieval. There are currently **no RAG document rows**, so no present document disclosure was demonstrated.

**Fix:** enforce public visibility for public search; authenticate and authorize any broader retrieval. Do not treat a supplied visibility label as authorization.

### 10. Medium — moderation and identity fields are client-writable

Consultant policies allow public insertion and owner-wide updates with no approval-field guard. Marketplace owners can change their resource status, including reactivating a moderated item. Webinar insertion has no creator-identity predicate. The weaker policies undermine stricter policies and UI-only role/approval controls.

**Fix:** protect approval/moderation fields and validate owner/creator identity in the database or trusted API, preserving the intended consultant publication flow.

### 11. Medium — abuse controls and browser hardening are incomplete

No application-level throttling was found on email, password reset, payment creation or expensive AI/search handlers. `api/forgot-password.js:31` accepts arbitrary HTTP(S) redirect destinations; final recovery redirect enforcement depends on Supabase configuration and was not tested. Upstream error messages are returned to callers. Vercel firewall/rate-limit settings were not inspected.

Live homepage headers include HTTPS/HSTS but no Content-Security-Policy, X-Frame-Options or X-Content-Type-Options. `vercel.json` has caching headers only.

**Fix:** add shared abuse controls and request bounds, use uniform password-reset responses, constrain reset origins, and introduce compatible browser headers. Roll out CSP carefully because current inline scripts/handlers would be affected.

### 12. Medium — Supabase hardening advisories and resume upload limits

Supabase reports leaked-password protection disabled, 10 functions with mutable search paths, and 10 externally executable SECURITY DEFINER functions for each of the anon/authenticated role categories. These warning sets overlap; public execution is not automatically an exploitable flaw. Review each function's intended callers rather than blindly revoking all permissions. [Search-path remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [function-execution remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

`job-resumes` is private with owner/admin read policies, but has no bucket-specific MIME or size restriction. Set explicit limits appropriate for the supported resume formats; browser validation alone can be bypassed.

## Checks that passed

- `npm audit --json`: zero reported vulnerabilities in the lockfile dependency set. The CDN PDF.js issue above remains outside that result.
- Targeted secret-pattern scan of 150 tracked text files: no matching service-role JWT, provider secret or private key; detected JWTs had the public `anon` role. No `.env` file is tracked. This is not a full Git-history or entropy-based secret scan.
- All 41 inspected public tables have RLS enabled. The permissive policies above mean this alone is not sufficient.
- Marketplace originals and job resumes use private storage buckets. Marketplace bucket limits restrict PDFs to 15 MiB; access-rule flaws remain as described above.
- Razorpay HMAC verification uses timing-safe comparison; the verification path checks order, amount and currency. Refund and meeting handlers have explicit identity/ownership checks, whose reliability also depends on fixing editable admin roles.
- Existing automated tests: **278 passed**. Four isolated local audit reproductions confirmed the service-key dispatch, anonymous email send path, anonymous payment-record read, and private-visibility forwarding. These are vulnerability reproductions, not security acceptance tests.

## Recommended fix order and verification

1. Close the service-key disclosure path and protect administrator identity; handle credential rotation if the vulnerable endpoint is deployed.
2. Lock financial/access fields and replace unrestricted private-data policies, coordinating browser queries so working features continue to load.
3. Fix HTML injection and the PDF dependency, then enforce endpoint ownership and email-event authorization.
4. Add abuse controls, compatible security headers and remaining Supabase/storage hardening.
5. Retest using separate ordinary-user, consultant, admin and anonymous identities. Include denied role changes, forged payment flags, cross-user reads, private-file downloads, foreign database URLs, and normal booking/payment/registration flows.

Row security does not restrict writable/readable columns within an allowed row, and broad table grants must be considered when narrowing privileges. [Supabase column-security guidance](https://supabase.com/docs/guides/database/postgres/column-level-security).

## Limits

No penetration test against live payment/email mutations, role changes, file uploads or malicious PDFs was performed. Live database evidence was limited to configuration and aggregate counts. Vercel deployment-source parity, historical credentials/logs, MFA/session settings, recovery redirect allowlists, infrastructure firewall rules and signs of historical exploitation require follow-up. All findings remain open; only this report was added to the workspace.
