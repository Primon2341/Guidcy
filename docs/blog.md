# Blog

Open **Admin Dashboard → Blog Management** (`/admin-dashboard?tab=blog`). Create an article, enter the title, slug, author, category, excerpt and rich text, then save as Draft or Published. Preview opens the current unsaved content in an accessible dialog. Existing articles have Edit, Preview, Publish/Unpublish and Delete actions.

- Publication dates use the editor's local time zone and are stored as UTC timestamps. Published articles with future dates remain private until that time.
- Slugs are unique and become immutable on first publication, preserving shared links and search results. Titles and SEO fields remain editable.
- Cover uploads go to the Supabase `blog-covers` bucket (JPEG/PNG/WebP, maximum 5 MB). HTTPS image URLs are also supported. Cover assets are public; draft article content remains private. Replaced images remain in Storage because their URLs can be reused by another article.
- Conflicting edits from another session are rejected instead of silently overwriting newer content. Failed saves preserve the form.
- Rich text is stored as structured JSON and rendered through an allowlist with escaped text. Pasted content is plain text; headings, emphasis, lists, quotes and links can be applied with the toolbar.

## Public delivery

`/blog` and `/blog/[slug]` are rendered by the existing SEO service in `api/jobs.js`. The initial HTML contains the article, canonical URL, metadata, Open Graph/Twitter tags, Article and breadcrumb schema, and internal links. Listings are paginated (12 articles per page). Related articles use the same category.

The service always queries Supabase using the anonymous key, even for signed-in administrators. Draft, future-dated, unpublished and deleted articles return 404. Database failures return 503, preserving the distinction between a missing article and a temporary outage. Published articles are included in the dynamic `/sitemap.xml`. Blog responses and the dynamic sitemap use `no-store` so unpublishing takes effect on the next request; article content is excluded from the browser's page snapshot cache.

Database authorization uses the existing `guidcy_is_admin(auth.uid())` function. Browser roles do not grant write access. Policies follow [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Deployment and validation

Migration `20260928163609_blog_publication.sql` has been applied to project `lsthngfxehayeqyctkla`. It creates the blog table, RLS policies, storage bucket and concurrency trigger, and preserves the previously hardcoded public article. Legacy localStorage posts are left untouched for recovery but are never rendered or published automatically.

Deploy the normal Vercel build (`npm run build`) to release the website changes. No additional environment variables, packages or serverless functions are required. Static-only hosting does not execute these routes; Vercel or the equivalent Node route service is required.

Checks:

```sh
npm run build
node --test tests/blog.test.cjs tests/seo.test.cjs tests/security-boundaries.test.mjs tests/vercel-hobby-function-limit.test.mjs
node tests/blog-editor-browser.cjs
node tests/seo-public-live.cjs
```

Browser checks use the existing Playwright installation and a local server. Run `tests/blog-database.sql` in the Supabase SQL editor or through psql to verify admin/non-admin/anonymous access and publication transitions. The SQL checks roll back all test records.
