# PDF posts

Users can attach one PDF or photo to an existing community post. PDF-only posts are supported, as are optional captions. Limits: 20 MB and 200 pages. The composer rejects malformed, oversized, and password-protected files without losing the draft. Replacing/removing attachments and deleting posts clean up their storage objects; failed post writes clean up newly uploaded files.

The feed, shared post URLs, and profile Activity use the same post records. The embedded reader supports previous/next buttons, arrow keys, mobile swipes, a page count, accessible page text, download, and retry after failures. Visitors can read public PDFs without signing in; social actions retain existing authentication.

## Performance and security

- Reuses the pinned PDF.js dependency and loader. Reader code, worker, CMaps, fonts and image decoders load only when needed.
- Renders one page at a time, caps canvas resolution, and releases offscreen/detached documents and workers. No PDF engine request is made for an ordinary text/photo feed.
- Uses the existing UUIDs and post ownership RLS. A separate public `community-documents` bucket accepts PDF MIME uploads up to 20 MB, restricted to the authenticated owner's UUID folder. Existing image limits and marketplace resources are unchanged.
- Database constraints enforce owner paths, document metadata, and one attachment per post. New security-invoker RPCs wrap the existing bounded feed/activity queries; original RPC contracts remain unchanged. The frontend can fall back to old RPCs during rollout.
- PDF JavaScript/XFA are not enabled. The reader uses canvas/text rather than embedded plugins or third-party viewers. CSP permits the local PDF decoder's WebAssembly via `wasm-unsafe-eval`, while JavaScript `unsafe-eval` and object embeds remain blocked.
- Changes to a post also refresh its already-mounted owner profile Activity, preventing stale attachments from reappearing.

## Deployment state

The additive migration `20261111084823_community_post_documents.sql` was applied to the existing Guidcy Supabase project. Verified the document columns, bucket restrictions, public reader RPC permissions, existing post RLS, and equal old/new feed results. The security advisor reported no new findings relative to the pre-migration baseline. No production posts or engagement records were created by these checks.

The updated frontend is built locally in `public/`; it has not been deployed to the live website.

## Validation

- `npm run build` and JS syntax/diff checks.
- `tests/post-documents-browser.cjs`: actual PDF.js parsing/rendering with local fixtures and the production CSP. Covers invalid/201-page/oversized PDFs, failed-save cleanup, PDF-only posting, keyboard/arrows/swipes, 320/390/430/1365px layouts, anonymous shared posts, reader retry, profile Activity, edits, attachment replacement, deletion and lazy loading.
- `tests/community-browser.cjs`: existing social/profile, booking/profile integration, photo editing, modal behavior, Skills labels, cache and mobile workflows.
- `tests/post-documents-schema.cjs`: isolated PostgreSQL migration validation, old RPC compatibility, PDF-only posts, constraints, anonymous reading and owner-only post/storage mutations. Uses PGlite as a temporary test tool: install `@electric-sql/pglite@0.3.14` outside the project and point `GUIDCY_PGLITE_MODULE` to its module path, then run the test. No runtime dependency was added.

References: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), [Supabase storage restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets#restricting-uploads), [WebAssembly CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_webassembly_execution).


## PDF alignment

The reader reserves its full post width even under the global mobile max-width rule. Its stage has an explicit full width so the page's aspect ratio and height cap cannot shrink the stage against the left edge on desktop. The canvas is centered within that stage. Browser checks compare the horizontal centers of the post, reader, stage and canvas at 320/390/430/1365px and in profile Activity.

Published PDF cards omit the document title, filename, page-total/size metadata header and PDF badge. Compact page-navigation controls and a download icon sit below the centered page. Original filenames remain available in the owner’s file-selection preview and downloads.


## Reader restart and double-tap gestures

A rapid desktop page hide/show could release the PDF canvas without triggering a new IntersectionObserver transition. This was reproduced on the public homepage with the existing uploaded file. Already-mounted visible readers now restart explicitly after that transition, while failure state prevents automatic retry loops. Manual retry can also restart a reader independently of a stale visibility flag. Optional text extraction cannot hide a successfully rendered page.

The shared double-tap handler covers PDF pages, native video surfaces, images, text and non-interactive post space in the feed and profile Activity. It reuses the existing authenticated Like operation, blue-heart motion, duplicate protection and rollback. Native playback/seek strips, PDF buttons, links, forms and comment interactions retain their normal actions. Scrolling and PDF swipes do not like posts. Tests cover PDF double-click and actual touch input, photo/video touch input, repeated taps, swipe rejection, player controls, guest sign-in gating and the reader restart regression.

These UI/reader fixes are built locally and require frontend deployment. The existing stored PDF was verified as intact and readable; this work did not replace or modify that file.


## Full-screen reading

The expand button opens a native modal covering the viewport on desktop and mobile. It moves the same reader into the modal, retains the current page and PDF worker, and fits the page to the larger space. Arrows, swipes, keyboard paging, download and double-tap liking continue to work. Close/Escape restores the inline reader, focus and background scroll position. The shared modal manager locks background scrolling while open. Navigation/removal closes the expanded view, and refresh snapshots normalize it to an inline reader so a modal is never accidentally restored.

Local browser checks cover 390/1365px full-screen dimensions, larger desktop rendering, page preservation, close/Escape, focus/scroll restoration, no duplicate document download, heart feedback in the modal, normalized snapshots and profile-navigation cleanup. The updated frontend remains local and requires deployment.

The full-screen close control is a plain cross with no circular background/border. Opening focuses the dialog rather than drawing a ring around the cross; keyboard users retain an underline focus indicator and a 44px touch target.


## Full-screen keyboard paging and zoom

Left/right arrow keys now change pages from anywhere within the full-screen reader, including immediately after opening and after using toolbar buttons. Rendering keeps focus inside the reader when a focused button is temporarily disabled. Inline keyboard paging remains scoped to its page area.

The reader toolbar adds zoom out, a percentage/Fit page button and zoom in (50–300% in 25% steps). The +/− keys zoom, and 0 restores fit-to-page; browser Ctrl/Cmd shortcuts are preserved. Enlarged pages scroll in both directions with background scrolling still locked. Zoom persists across page changes, each new page starts at the top, and mobile panning at enlarged sizes does not trigger page swipes. Rendering uses the existing PDF document/worker and caps raster resolution to bound memory on large displays. Closing restores the centered inline reader; cache snapshots remove transient zoom wrappers and controls.

Build and real PDF.js browser checks passed at 390/1365px for keyboard focus, page boundaries, zoom buttons/shortcuts, 300% scrollability, raster limits, fit reset, close/Escape, page/scroll restoration and no extra PDF download. Existing upload/edit/delete, public viewing, retries, likes and 320–1365px inline layout checks also pass. Local frontend changes are not deployed.
