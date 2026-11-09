# Community homepage

The homepage is now a professional community feed. All existing destinations remain accessible through the existing navigation and homepage discovery links. Consultant author links use `/consultant/<existing consultant ID>` and the existing booking/availability/payment UI. Non-consultants use `/profile?member=<existing profile ID>`; this adds a public presentation of existing profile fields, not another identity store.

## Implementation

- `assets/js/community.js` and `assets/css/community.css` own the new experience. Styles use the unique `gnet-` prefix.
- `index.html` replaces only `page-home`. Existing SEO metadata, navigation, footer and authentication remain in place.
- Small integrations in `app.js` retire replaced homepage loaders, distinguish member profile URLs from remembered consultant URLs, and exempt post images from the existing avatar cropper.
- Share links are `/?post=<UUID>`. Public visitors can read posts and open expert profiles. Authenticated actions use the existing login flow. Share previews currently use the homepage metadata.
- Community/Following/Latest, My Posts, Saved Posts, and a paginated Following list use real records. The initial empty feed is intentional: no demonstration content or engagement is inserted.

## Database

`supabase/migrations/20261001143257_community_feed.sql` was applied to the configured project `lsthngfxehayeqyctkla` on 2026-10-01. It adds five `community_*` tables, indexed foreign keys into existing profiles/posts, RLS, two bounded read RPCs, an update timestamp trigger, and the `community-images` bucket. It does not alter any existing application table, data, identity, booking or payment policy.

Posts are public. Only their authors can edit/delete them. Likes/follows have composite primary keys; self-follow is rejected. Saves are private. Authenticated callers cannot supply or modify creation timestamps. The public author projection returns only professional fields, without email, phone, bank, payment, or administrative fields.

Images are compressed client-side to WebP, at most 1600px on the longest side. Storage enforces WebP and 2MB, with uploads/deletes scoped to the signed-in owner, following [Supabase storage access policies](https://supabase.com/docs/guides/storage/security/access-control). Failed post saves clean up uploaded images; replaced/deleted images receive best-effort cleanup. Account deletion or an interrupted browser can leave unreferenced storage objects; periodic orphan cleanup is a future operational task, not a second identity/booking system.

The feed returns at most 13 records (12 visible and one next-page sentinel) per keyset query. Followed authors receive a 12-hour recency boost in For you; Latest is chronological. The ranking resets on refresh, so following someone does not move the post being read. Comments load 10 at a time; following lists load 20. Feed reuse is in-memory for 45 seconds, resets with authentication changes, and supports explicit refresh. No realtime subscriptions or new package dependencies are introduced.

Homepage refresh uses the existing tab-local, account-scoped page-shell cache (10-minute expiry and the existing size limit). Profile, composer avatar, suggestions, and feed remain visible while fresh data loads, just like the expert directory. Repeated inline avatar images are stored once per snapshot to avoid overflowing the cache. Cached cards remain inert until live data is ready; snapshots never authorize actions. Empty/error states still render, and switching feed views clears the previous view. Liked hearts use the shared post button's pressed state to show a solid red heart, including optimistic updates and failed-request rollback.

The old homepage review/featured renderers, trust statistics, personalized rails, opportunity/startup panels, public marketing strip, reorder timers, and their unused component styles have been deleted. Shared discovery/search, consultant reviews, existing administration controls and backend tables remain available to their existing pages. Homepage routes now call the community renderer directly.

## Verification

- `npm run build`
- `node --test tests/availability.test.cjs tests/routing-payment-regression.test.mjs tests/render-page-dedupe.test.mjs tests/security-boundaries.test.mjs tests/seo.test.cjs` — 28 checks passed.
- `tests/community-browser.cjs` (existing Playwright installation required) — fixture-only CRUD, image compression, mutation failure/draft recovery, pagination, follows, comments, likes, saves, sharing, guest/login gates, existing consultant booking UI, public member links, and 320/390/1365px checks.
- Set `COMMUNITY_LIVE=1` for additional **read-only** checks against the configured public Supabase project: real suggested experts, post reads, missing permalink, existing consultant booking page, mobile overflow, and no obsolete homepage opportunity-cache reads.
- `tests/profile-resources-browser.test.cjs` — passed at 1280/390/320px: profile resources, webinars, paid/free resource checkout, SPA/back/refresh and booking stability.
- `tests/community-rls.sql` — executed against the actual database. Owner/other-user/anonymous roles, counts, constraints, private saves and cascades passed. The transaction rolls back every test row.

The broader existing `browser-flow.test.cjs` passes its payment transition, refresh and booking-deep-link checks, then fails its Blog → Back → Categories expectation at line 298. The same failure was reproduced in an isolated copy with the original homepage and without the community script. That pre-existing Blog navigation issue was left outside this homepage task.

## Professional profiles (2026-10-02)

The professional profile is now the sole public profile renderer. `openProfile` creates the new loading shell and retains the original booking DOM. It calls `GuidcyCommunity.mountProfile` directly. The old header/about/credentials markup, three delayed education renderers, the old experience renderer, and the old profile-link injector were removed; there is no old-profile-first transition or subtree observer doing a later redesign. The existing LinkedIn/portfolio link appears under More.

The header contains a cover, overlapping photo, professional headline, company/location/education, clickable followers/following, owner or visitor actions, and profile sharing. Member links retain `/profile?member=<existing profile UUID>` and consultants retain `/consultant/<existing consultant ID>`, so existing URLs and routing continue working. Sharing supports Copy Link, WhatsApp, LinkedIn, X and native sharing. Connection and view counts are omitted because the platform does not track them.

About supports 2,000 characters and See more. Company history reuses `profiles.company_experience` and `consultants.company_experience`; the new editor preserves older fields, saves employment/location/skills, and displays roles chronologically. Concurrent experience edits reject stale saves. The existing dashboard editor preserves the new metadata when saving its fields. Skills update the existing consultant `tags` used by discovery/search and an added skills array for ordinary members.

Education, certifications, awards, projects, patents, publications and achievements use owner-controlled `profile_entries`, with explicit limits and indexes. Existing education and certification data was copied into structured entries while preserving the source fields; 33 distinct education records were retained at migration time. Optional sections are hidden publicly when empty. Owners can add/edit/delete entries and see a private completion score with a suggested next field.

Activity uses existing community posts and comments, with Posts / Comments / Achievements tabs. Five items are shown per page with keyset pagination. No second post system or sample engagement was introduced. The Achievements tab filters the existing Achievement post type.

Featured holds at most eight foreign-key references to existing posts, marketplace products, professional entries or webinars. Resource View/Buy invokes `GuidcyMarketplace.openDetails` / `buyOrDownload`; the original product modal, entitlement checks, Razorpay checkout and downloads handle the transaction. Deleted referenced records cascade out of Featured; unpublished resources are omitted from the public projection. Webinar choices use the existing owner or named-speaker fields, without a new attendance system. Public reads expose no meeting links, registration details or payout fields.

The consultation card shows existing video pricing for 30 minutes, actual published-review aggregates, expertise and the next listed slot when the existing resolver supplies a dated/recurring schedule. Slot availability is still checked by the existing booking flow; the card does not reserve slots. The original calendar, duration controls, availability refresh, booking state and payments remain intact. Resources, webinars, client reviews, and availability/session options are expanded automatically when a profile opens. Visitors can still collapse them.

Applied additive migrations:

- `20261002035622_compact_community_profiles.sql`: cover/bio, owner profile update, private messages.
- `20261002044148_professional_portfolio.sql`: skills, structured entries, featured references, public projections and bounded activity reads.
- `20261002104954_professional_portfolio_validation.sql`: validated skill writes and preservation of experience metadata.
- `20261002105326_profile_webinar_appearances.sql`: reuse existing host/speaker data for featured webinars.
- `20261002110114_profile_legacy_compatibility.sql`: retain dashboard bio updates, public portfolio links and older experience entries with blank titles.

Covers use the existing owner-scoped community image bucket and compression. Community messaging was subsequently removed from the application. Its historical table/data and participant-only policies are retained; no messaging controls, handlers or queries remain in the community UI. No changes were made to booking, availability, payment, marketplace or webinar database structures/policies.

### Verification of the expanded profile

- Build and 32 unit/regression checks passed (availability, payment routing, render deduplication, security boundaries, SEO, profile/review avatars, dashboard experience metadata preservation).
- `tests/community-browser.cjs`: homepage interactions plus experience/education/portfolio CRUD, skills, featured selection, inline posts/comments/achievements, pagination, public/owner controls, sharing, covers and 320/390/1365px layouts. A delayed profile RPC and DOM observer verify that the legacy profile never renders. `COMMUNITY_LIVE=1` adds read-only public Supabase checks.
- `tests/profile-resources-browser.test.cjs`: passed at 1280/390/320px, including Featured View/Buy through the original resource modal and paid checkout, free/owned downloads, webinars, realtime removal, SPA/back/refresh and booking DOM preservation.
- `tests/availability-browser.cjs`: passed at 390/1280px, including schedule save/reload, monthly calendars, recurrence/overrides, duration boundaries, slot selection and payment-page reload from the redesigned profile.
- `tests/professional-profile-rls.sql` and `tests/profile-webinar-feature-rls.sql`: passed against the configured Supabase project with every test write rolled back. Ownership, immutable ownership columns, invalid input, stale updates, discovery synchronization, public projections, featured references and cascading removal were checked.

The supplied Guidcy mark is used for brand placeholders and all favicons. The updated transparent mark is also used for navigation and authentication branding. The frontend is built locally, not deployed; database migrations are applied. Existing unrelated working-tree changes were preserved.

## Homepage search and image-path fix (2026-10-07)

The homepage search reuses the existing universal destination handlers and shared consultant search, with separate element IDs so consultant-only search cannot override it. It offers public post/article matches and routes to marketplace, webinars, jobs, grants, blog and help/account pages. Content reads are debounced and bounded; expert/resource/webinar suggestions use a one-minute cache. Job/grant results use existing loaded data and always offer the corresponding search page. The composer uses the existing photo, achievement and text-post flows.

`20261007000100_community_image_paths.sql` corrects double-escaped image-path checks in the deployed storage policy, profile RPC and profile/post constraints. Literal-dot character classes avoid escaping differences during migration transport. Existing owner restrictions, storage limits and identities are preserved. The cover edit control also sits above the overlapping profile heading so pointer/touch input reaches it. `tests/community-image-paths.sql` exercises upload metadata, cover replacement/removal and cross-owner/invalid-path rejection in a rolled-back transaction against the deployed schema.

## Stable professional identity and network (2026-10-07)

Profiles no longer participate in the legacy HTML replay cache or generic panel placeholder interception. The professional layout class is present in static HTML, with one responsive header layout. Cover/photo overlap, company/education, free-form headline (240 characters), direct Share and contact information use this renderer. Native dialogs and the avatar cropper now participate in the existing central body scroll lock. Destructive profile controls use an outlined treatment and retain confirmation.

`20261007010000_professional_network.sql` adds optional pronouns, public website/email and professional status to existing profiles; it reuses the existing LinkedIn field and existing headline updates. Contact details are opt-in and independent of private account email. Offering services does not approve a consultant or enable booking.

Connections use one ordered pair of existing profile IDs. Only the invitee can accept; either participant can cancel/decline/remove. Pending requests are private; accepted connection counts/lists are public. The list uses 20-row keyset pagination. Skill endorsements require a real listed skill, reject self-endorsement and have a unique profile/skill/endorser key. All writes use authenticated RPCs; tables enforce foreign keys, checks, indexes and RLS. No engagement or connections are seeded. `tests/professional-network-rls.sql` verifies permissions and atomic identity updates in a rolled-back transaction.

## Photo popups (2026-10-07)

The owner's photo and cover are keyboard/touch/click targets with a subtle hover/focus treatment, without persistent edit labels. Each opens a photo-only dialog with Edit (crop/zoom/position), Update (file picker), Delete (confirmation) and Close. Neither opens profile settings or navigates away. Profile details retain their own editor. Company and college text is bold.

`20261007020000_profile_photo_update.sql` supplies an owner-only atomic write into the existing avatar/cover fields. The existing dashboard avatar helper and the new popup share it; consultant avatars are mirrored in the same transaction. Cover uploads keep the existing compressed WebP bucket and owner-folder checks. `tests/profile-photo-rls.sql` checks ownership, validation, deletion, consultant synchronization and preservation of unrelated fields with rollback.


## Organization logos, presence and branding (2026-10-07)

`community_organizations` is a shared directory of company and college names/logos. Admin → Organization Directory supports adding/editing entries, uploading a logo through the existing compressed image bucket, or using an HTTPS image URL. Approval controls public visibility. No companies, colleges or logos are invented/seeded. Names are deduplicated within their type, ignoring case and repeated whitespace; existing profile/career/education text is preserved. Approved entries provide bounded native autocomplete suggestions and automatically supply logos for exact normalized names in headers, experience and education. Use the official suggested name to match an entry. This is not proof of employment or affiliation. Different abbreviations do not match automatically.

`20261007030000_profile_status_location.sql` extends the existing status field with Hiring and Content (happy in the current role), retaining Open to work and Offering services. Frames overlay the profile photo with curved text; uploads/crops remain unchanged. The current-location editor offers a show-on-profile checkbox; the public profile RPC omits a hidden city, while its owner can still edit it. Existing location visibility is preserved by default.

The post composer has no post-type or image-description controls. Existing categories and old image descriptions survive editing; the Achievement shortcut/activity tab still creates achievement posts. New images have the existing author-based fallback alt text. The newer transparent logo supplies PNG/ICO favicons, install icons, navigation, authentication, footer and brand placeholders. The legacy runtime favicon injector was removed so it cannot override the versioned static icons.

Verification: `tests/profile-presence-directory.sql` verifies public location masking, real status persistence, organization approval/read/write permissions, unsafe-logo rejection and normalized name uniqueness, with all writes rolled back. `tests/community-browser.cjs` covers logo matching/autocomplete, directory add/edit/hide, all requested frames, retained location, composer simplification, original description preservation, image popup behavior and responsive profiles. Frontend deployment remains separate; migrations are applied.

The homepage identity card now uses a full-width cover, overlapping photo, two-line headline, optional visible location and approved organization logo. The entire identity links to the existing profile; follower/following counts and hide/restore remain available. Status frames share the profile renderer with separate SVG IDs, and the card remains visible on mobile. Suggested-expert refreshes merge public fields so they do not discard the owner’s status/cover metadata. The footer contains the supplied mark followed by “Guidance Made Simple”; the old wordmark injector has been removed.

## Retired public contact and professional status controls (2026-10-08)

Professional status selectors, notes, frames and public contact-info controls have been removed from the homepage/profile UI. The profile identity RPC no longer accepts those retired fields, and the public profile RPC no longer returns them. Public directory projections also mask contact email, website and LinkedIn fields for other people. Existing private account/contact records and schema columns remain intact for compatibility; authentication, bookings and owner/admin access are preserved. This supersedes the earlier status/frame and public-contact features documented above.

The existing Save consultant control now lives in the profile action row below the cover, and is reattached after identity refreshes using the same saved-consultants handler. `tests/profile-contact-privacy.sql` verifies private-data preservation and masking for anonymous/other-member access with rollback. Existing network/directory SQL checks and the community browser suite cover the revised behavior.

## Profile summaries and optional website (2026-10-08)

Education entries now supply the profile's college/degree summary; deleting an entry selects the latest remaining education or clears the summary. Legacy dashboard education edits synchronize with those entries. Removing or ending the displayed current role clears its company summary, and explicitly cleared company fields no longer fall back to older combined company/college values. Profile mutations refresh the homepage identity card too. Entry editors label the destructive action “Delete” and retain confirmation.

Edit Profile now offers an optional website URL and a separate “Show website on my public profile” checkbox. Existing stored links remain private by default; only explicitly published HTTP(S) links appear on public profiles. This restores only the website feature requested after contact-info removal; email, LinkedIn and status controls remain retired. `20261008010000_profile_summary_website.sql` is applied. `tests/profile-summary-website.sql` verifies deletion, legacy synchronization, website opt-in/removal and invalid URL rejection with rollback; browser checks cover the corresponding controls and header/sidebar updates.

Post cards no longer render category tags (Insight, Achievement, etc.) anywhere the shared renderer is used. The composer has only Photo and Write a post shortcuts; it no longer chooses or writes categories. Activity shows Posts and Comments without category filters. Existing database category values are preserved when editing posts for backward compatibility.

## Registered organization suggestions (2026-10-08)

Company and institution inputs now search both the approved directory and existing approved, active consultant display names through `community_organization_matches`. Exact, prefix and substring matches are ranked, with eight suggestions maximum. Selecting a suggestion saves its official name in the existing fields. Exact normalized names resolve logos in the profile header, experience/education and homepage card; supported legacy inline avatar images work too. No employee's avatar is inferred from their employer field. Guidcy Technologies is returned from its real registered account without creating duplicate organization records.

Curated directory names override registered names, including hidden directory entries. Inactive/unapproved accounts are excluded; ambiguous duplicate names do not select an arbitrary logo. Existing company/college text remains valid. `20261008020000_registered_organization_lookup.sql` is applied, with a bounded public RPC and normalized-name index. `tests/registered-organization-lookup.sql` checks ranking, exact logo resolution, approval/visibility and directory overrides with rollback; the browser suite verifies suggestions and logo rendering after profile/experience edits.

`20261008030000_organization_profile_links.sql` adds the matching public consultant ID to lookup results, including curated directory entries with one exact registered match. Company/college names and logos link to the existing consultant route in the profile header, Experience, Education and homepage card. Unregistered/ambiguous directory entries remain unlinked; no substitute profile pages are created. The homepage organization row sits outside the owner's profile link to keep links valid and independently accessible. Browser checks exercise college suggestions, company/college navigation and return to the original profile; SQL checks verify registered destinations and absence of invented links.

## Company deletion across expert cards (2026-10-08)

The reported Guidcy Technologies record had an empty `current_company` but retained “HFCL” in `current_company_college` on both the consultant and profile. Those two stale display values were corrected conditionally in the live database, preserving the remaining profile data. `20261008040000_company_display_sync.sql` now synchronizes company display/search fields for intro edits, legacy dashboard writes and experience changes. An explicit blank remains blank in the shared expert-card normalizer and profile merge.

Profile mutations update local identity fields and invalidate consultant/profile reads. Expert-source, filter-result and search caches also invalidate, and an older in-flight read cannot restore its stale company after a save. `tests/company-display-sync.sql` covers intro/experience deletion and legacy edits with rollback; the browser suite covers warm expert/search caches and the rendered expert card. Existing profile RLS, summary, compatibility, search and request-cache checks remain passing.

Consultant pricing: `20261010010000_consultant_price_sync.sql` keeps `rate`, `price`, and `video_price` synchronized on every insert and price update, including older editors that write just one alias. Conflicting amounts and invalid prices are rejected; explicit zero remains free. Missing aliases are filled only where existing amounts agree. The existing 2000 default is preserved by the insert trigger. Audio/chat prices, existing bookings, duration multipliers, and payment fees are unchanged. Expert cards reuse the booking price helper; profile and availability editors validate whole-rupee amounts. The live Suhani Bohra mismatch (rate 499, price 2, video price 1) was conditionally corrected to 499 in all three aliases. SQL rollback tests cover synchronization, validation, owner permissions, free sessions, and the default; availability browser tests cover save/reload and checkout.

Education duplicates: `20261010020000_unique_profile_education.sql` removes redundant imported records only when their details match, keeping the fuller degree title. A unique index protects all profiles against duplicate qualifications at the same institution, field, and dates, including concurrent saves. Matching ignores case/spacing and a trailing acronym only when it matches the expanded degree's initials (for example, Bachelor of Dental Surgery and Bachelor of Dental Surgery (BDS)). Different degrees, specializations, and attendance dates remain separate. The editor explains duplicate-save errors without clearing the form. `tests/profile-education-duplicates.sql` and the existing summary/deletion checks run with rollback.


Profile refresh: the same bounded, viewer-scoped tab cache now restores the redesigned member and consultant layouts before deferred scripts execute. Unversioned legacy profile HTML is ignored. Restored controls stay inert until their owning data renderer refreshes them; booking controls are rebuilt from the existing live consultant/availability flow. Profile details and activity retain their previous content while revalidating, replacing it only after fresh results (including empty results) arrive. The shared post card retains the red filled liked heart. No schema or payment changes are required.


2026-10-12 booking and education: active consultants can see their own consultation/availability card; visitor booking still uses the existing flow. `nested_education_summary_sync` fixes nested education updates from legacy dashboard editors without bypassing the recursion guard on legacy writes. `reconcile_cleared_education` repairs only consultant copies whose profile explicitly has empty education and no remaining education entries (the Guidcy Technologies mismatch). Finder/profile merges preserve explicit empty values rather than restoring older aliases. SQL rollback checks cover both dashboard editors, last-entry deletion, and keeping other qualifications; browser checks cover owner/visitor booking, reload, checkout, and warm finder/search education deletion.


Self-transactions (2026-10-12): consultant owners can inspect their availability, but both booking CTAs are disabled and the shared booking/payment entry points reject their own profile ID. Marketplace, profile-resource and featured-resource purchase buttons identify the owner's uploads; the shared checkout rejects paid and free self-orders. Payment creation, verification and reconciliation validate ownership against the actual consultant/resource record. `prevent_self_purchases` applies the same rule to database inserts, identity changes and new checkout/settlement transitions, including server writes, while leaving historical records available for ordinary administration. No existing transactions were deleted.
