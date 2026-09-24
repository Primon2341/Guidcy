# Consultant Marketplace resources

Public profiles include `Resources by [Name]` before Experience. The section reads
`marketplace_notes.uploader_id = consultants.profile_id`; it never matches display
names or copies resources into profile records. Only `status = active` and
`removed_at IS NULL` listings are displayed, including for sellers and admins.

Four cards render initially. View all resources expands the visible window by 20,
with Show more for larger catalogs. Empty catalogs hide the section. Cards show
the first page of the existing public PDF preview (an uploaded thumbnail when no preview exists), category, description,
price/free, and download counts. The current Marketplace schema has no rating
column, so no rating is fabricated. The existing PDF renderer loads only near visible cards; first-page thumbnails are cached in memory. Marketplace popups use the shared background scroll lock.

Actions check the current publication state, then call the existing
`GuidcyMarketplace.openDetails` or `buyOrDownload` handlers. Download labels use the
same buyer ID and `download_granted` entitlement as the final secure Marketplace
checkout. Labels never grant access; the existing flow verifies access again.
Paid and free purchases keep the existing order, payment, email and private-file
handling. Checkout completion/cancellation triggers a local section refresh.

The profile shell and booking controls are untouched during resource refreshes.
Identical results do not replace the cards. Concurrent requests are coalesced and
responses for an old profile/viewer are discarded. Realtime listens to the current
seller's inserts/updates and visible-resource deletes; leaving the profile or
hiding the tab removes the subscription and timer. Returning to the tab refreshes.
Public RLS can suppress an event when an active row becomes private, so a 60-second
visible-page refresh also removes withdrawn resources without a schema/RLS change.

## Verification

- `npm run build`
- `node --test tests/*.test.mjs` (278 passing)
- `NODE_PATH=/Users/prakhartripathi/.npm/_npx/705bc6b22212b352/node_modules node tests/profile-resources-browser.test.cjs`
- Browser fixtures at 1280, 390 and 320 pixels cover profile placement, publisher
  matching, all inactive states, empty profiles, expansion, details, paid/free
  checkout, existing-order downloads, no duplicate orders, deletion/unpublishing,
  stale-card action prevention, network errors/recovery, delayed profile responses,
  SPA navigation/back/refresh, and stable booking DOM.
- Payment-provider responses and the final download boundary are mocked; no live
  payments, production writes, database migrations or RLS changes were performed.
- Agent-browser visual verification: profile and home render, no page errors.
