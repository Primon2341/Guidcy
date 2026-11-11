# Guidcy controls and community interaction update — 10 November 2026

## Changes

- Shared action buttons use consistent spacing, semibold text, restrained rounded corners, visible keyboard focus, disabled states, and reduced-motion support. Blue remains the primary action color; green buttons use a darker brand green for readable white text. Scoped login, navigation, booking, and destructive action styles remain in place. The header Dashboard button keeps its original width, text size and filled blue style, with a slightly reduced height (36px desktop, 40px on touch devices). Its rounded ends remain consistent across routes.
- Homepage search has fully rounded ends and no visible Search button. Suggestions and Enter-to-search remain available. The mobile field is 46px tall with a compact placeholder; typed input remains 16px to avoid iOS focus zoom.
- Post text and images support touch double-tap and desktop double-click to like. Existing liked posts stay liked; scrolling and isolated taps do not like a post. The existing authenticated like operation, duplicate protection, and rollback are reused. Filled hearts use Guidcy blue.
- Comments have a rounded composer above the list, linked author identity/headline, real timestamps, existing Follow controls, own-comment deletion, and existing pagination. Post uses a compact 28px-high blue pill, at least 56px wide, inside a 44px mobile touch target. It appears only when the draft contains non-whitespace text, hides when cleared or successfully submitted, and remains available after a failed submission. The heading is simply Comments, with no sorting label. No fabricated reply, comment-like, GIF, or image controls were introduced. Existing flat text comments and permissions are reused.
- Guidcy AI participates in the shared modal scroll lock. A backdrop blocks background interaction while the conversation can scroll independently. Close/Escape restore focus and page position, and closing AI leaves another open dialog locked. A delayed answer cannot focus a closed panel.
- Dashboard drawer cleanup now returns immediately if it owns no scroll lock. Previously a global Escape handler could clear another popup's offset and scroll to zero.

## Validation

- `npm run build`.
- 18 focused Node checks: booking flow, dashboard toggle, post previews, mobile search, retired connection integration.
- `tests/community-browser.cjs`: fixture-based community/profile CRUD, Follow, likes, sharing, comments, narrow profile activity cards, 320/390/1365px layouts, touch gestures, AI nested-dialog locking, scroll restoration, and late responses. Additional mobile public-route overflow checks cover experts, marketplace, webinars, jobs, blog, funds/grants, and career finder.
- `tests/availability-browser.cjs`: booking/availability and payment reload at 390/1280px.
- `tests/profile-resources-browser.test.cjs`: resource and webinar actions, ownership, paid/free fixture checkout, and navigation at 320/390/1280px.
- `tests/mobile-dashboard-menu.test.cjs`: user, consultant, and admin menus and Back/Forward navigation.
- `git diff --check` and JavaScript syntax checks.

The older `tests/browser-flow.test.cjs` still targets the retired `.profile-name` profile markup and cannot complete its initial profile assertion. Its Supabase fixture is reused by the current community tests, but the old broad test itself needs migration to the professional-profile renderer. This run does not claim that legacy test passes.

All browser mutations and checkout operations above use local fixtures. No real payments, production database changes, or deployments were performed. Changes are built locally for review.

The company/college block sits at the far-right edge at every breakpoint. Both logos share one column and both names start at the same left-aligned text column. Shrinking text containers and normal wrapping preserve full names without cropping. Long names are checked at 320/390/768/1365px.

Post images preserve their intended full card width and equal gutters on the feed and profile activity rails. A scoped max-width override prevents the global mobile media cap from shrinking the image while leaving its negative margin in place.

People-list popups initially focus their heading, leaving the cross unframed. The close control stays accessible with Tab, with a rounded keyboard focus indication instead of a rectangular outline.

Profile company and college rows use equal-width grid rows with one fixed logo column, so short and long labels do not shift their icons. Mobile location, website and follower spacing is compact, with screenshot-based checks matching the supplied HFCL / IIT Roorkee profile at 320/390/430/768px.


## Like and loading motion

Likes animate the blue heart briefly; double-tapping post text or an image also shows a larger blue heart. Repeated double-taps on an already liked post replay feedback without writing a duplicate like. Unlike/failure cancels the effects; finished overlays remove themselves. Effects use the Web Animations API with transform/opacity, require no library, and are skipped for reduced motion. A visual-effect failure cannot prevent the existing like operation.

Existing panel loading state drives one compact segmented loading card inspired by the supplied reference: blue monospace Loading text and a blue-framed bar with green blocks, without an outer box, background or shadow. The cover moves in discrete steps to reveal the segments. The global indicator is centered horizontally and vertically in the viewport, stays outside cached content, and is hidden when requests finish or their page is no longer visible. Comments use the same design inline. Reduced motion uses a static segmented bar. There are no invented percentages, extra requests, artificial request delays, or full-page overlays. Known content regions and their page visibility are observed; detached regions are released.

Loading completion regression checks cover native DOM commits, explicit completion callbacks, rendered records containing loading-related words, and terminal errors. Automatically created loading flags are cleared when real root content is committed; explicit pending requests retain their own lifecycle. Optional identity and recommendation panels do not keep the global indicator visible after the main content is ready. `tests/loading-state-browser.test.cjs` exercises these paths without production data.

Find the Expert distinguishes a first load from background revalidation. Restored expert cards keep their actual visible count and do not trigger the global loading card. Changed filters say Updating results while the previous cards remain visible. A first load still shows Loading experts. The result count and filter identity are restored with the existing tab-local cache, including completed empty results; the old static sample count is removed. Latest-request ordering, filters, search and booking links are preserved. Regression checks cover cold loads, restored results, filter changes, out-of-order responses and reloads before app.js starts.


## Homepage profile access and mobile posting

Desktop retains the previous identity card (cover, photo, headline, organization, follower/following counts) and full post composer. At 700px and below, both cards are hidden and a compact row contains the user's profile picture, existing universal search, and a small Post button. The mobile profile picture and desktop card open the existing profile through SPA navigation; the header avatar also continues to open the profile. Guests see the Guidcy mark and the normal sign-in gate. The compact Post control uses the existing text/image editor and post records.

Both responsive identity regions use the existing account-scoped refresh cache and shared profile data, with no new database queries or systems for mobile controls. The separate Dashboard control retains its role-based behavior. Legacy cached header avatars become profile links before app startup. Consultant member redirects replace their intermediate URL so Back returns directly to the previous page.

Validation covers desktop/mobile visibility and switching at 320/390/700/768/1365px, touch targets and same-row alignment, existing composer functionality, guest gates, cached header migration, same-document profile navigation and Back. All checks use local fixtures; no deployment or production data changes.


The mobile layout also hides the My Posts / Saved Posts / Following shortcuts and For you / Following / Latest toolbar. The feed begins directly under the compact search/post row with no reserved gap. Desktop retains those controls and the existing feed logic is unchanged.


Find Expert mobile controls: the search field is reduced from 58px to 46px high, and the Filters toggle grows from 44px to 56px, transferring 12px of vertical space. The input stays 16px to prevent iOS focus zoom and the placeholder uses a compact 13px size. Sort, search suggestions, filter behavior and desktop sizing remain unchanged. Local checks cover 320/390/430px mobile widths plus 768/1280px, with no horizontal overflow and working search/filter toggles.


Profile loading now uses one shared header-shaped placeholder for user and consultant profiles, reserving the cover, avatar and text positions instead of a wide grey strip. Dedicated profile placeholders bypass the generic panel skeleton/extra loading bar; activity is treated as secondary content. Profile details and posts use small inline loading text. Existing cached profiles remain visible during revalidation, errors keep their retry UI, and booking markup is unchanged. Slow-read fixture checks cover cold member/consultant profiles at 390/1365px; the general loading lifecycle checks also pass.


Normal user and consultant sign-in now falls back to the homepage instead of automatically opening a dashboard/Upcoming Sessions. Explicit return URLs and pending booking/purchase actions keep priority. The standalone admin login still opens the admin dashboard. Password and Google sign-in use the same final destination controller, and passive auth events do not replay it.


The profile Skills section now shows compact, non-interactive labels in a horizontal wrapping list. Its owner editor and Add Profile Section entry are named Skills, and existing skills/expertise values are retained for discovery and backwards compatibility. Removed all endorsement rendering, counts, action handlers, retry UI and browser RPC requests. Existing historical database migrations/data are unchanged. Browser checks cover skill editing and absence of endorsement requests alongside the existing profile workflows.


PDF attachments and their migration/deployment status are documented in [PDF posts](community-pdf-posts-2026-11-11.md).


Follow/Following controls now use an outlined rounded button with a plus/check icon, a stronger text weight and clear hover/focus states. Following uses a neutral outline instead of the old green badge appearance. The existing immediate toggle, counts, duplicate protection and error rollback remain unchanged across posts, profiles, suggestions and people lists.

Follow/Following controls retain the icon, text weight and interaction behavior with their outer border removed.
