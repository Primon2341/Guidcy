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


## Homepage profile access

Removed the homepage identity card, its renderer, card-only styles, and refresh-cache regions. Community shortcuts, the composer, feed, and suggested experts remain available. The top-right account photo/initials now link to the existing member profile, which resolves consultants to their existing consultant profile. Avatar navigation is delegated immediately, works with keyboard/native links, preserves SPA navigation, and closes mobile menus. Legacy cached dashboard avatars are upgraded before app startup. The separate Dashboard control retains its existing role-based behavior. Consultant member redirects replace their intermediate URL so Back returns directly to the previous page.

Validation covers absence of the retired card for guests and members, old cached header migration before app startup, same-document avatar navigation and Back at 320/390/1365px, and existing user/consultant/admin Dashboard controls. All checks use local fixtures; no deployment or production data changes.
