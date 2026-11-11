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
