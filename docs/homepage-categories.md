# Homepage Popular Categories navigation fix

The four-card state was reproduced by loading `/marketplace`, waiting for startup,
then clicking Home. It persisted after startup completed. Refreshing Home showed
twelve visible cards.

The cause was `capPopularCategoriesToTwoRows`, not a data-fetch limit. While Home
was hidden, Chrome returned `repeat(6, 1fr)` for `gridTemplateColumns`. Splitting
that string on spaces incorrectly counted two columns, producing a four-card
limit. The function stored that result against viewport width and card identity;
revealing Home did not invalidate it. Inline `display:none` values remained.

Multiple startup functions also rewrote the same grid. The final-render marker
could survive another renderer replacing its children, leaving thirteen DOM
cards, of which twelve appeared on desktop after refresh.

The browser regression also exposed a rapid Back-navigation issue: the 600 ms
render deduplication cache remembered Home even after a legacy Marketplace
renderer activated another page. Returning immediately could leave Marketplace
visible at the Home URL. Deduplication now also requires the requested page to
be the page actually displayed; genuine returns and forced refreshes pass through.

The homepage now contains the exact twelve tiles from the correctly rendered
desktop view: eleven named categories and View All. The duplicate home renderers,
expansion branch, row cap and associated resize work are removed. CSS retains six
columns/two rows on desktop and the existing responsive column breakpoints on
smaller screens, with every card available. Category-page rendering, category
filters, links and database behavior are unchanged. This app uses vanilla
JavaScript, so React mounting and effect dependencies do not apply.

Verification:

```sh
npm run build
node --test tests/*.test.mjs
node tests/home-categories-navigation-browser.test.cjs
```

The browser test uses local SDK fixtures and installed Chrome/Playwright. It
covers cold deep links followed by Home, late startup timers, refresh, direct
visits, actual desktop/mobile navigation controls, Back/Forward, resizing while
Home is hidden, and the Technology/View All links. It checks exactly twelve
visible cards, no duplicates or stale inline hiding, two desktop rows and no
uncaught browser errors.
