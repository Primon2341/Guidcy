Guidcy Vercel Deployment

Upload this folder to GitHub and deploy it on Vercel.

After deployment check:
1. https://www.guidcy.com/robots.txt
2. https://www.guidcy.com/sitemap.xml
3. https://www.guidcy.com/google092e467728cf55b4.html
4. https://www.guidcy.com/browse should open directly without redirect.

In Google Search Console:
- Verify using the HTML file method or HTML tag method.
- Submit sitemap.xml.
- Inspect https://www.guidcy.com/ and click Request Indexing.

Important: In Vercel Domains, set www.guidcy.com as the primary production domain. If Google reports “Page with redirect”, inspect the final URL https://www.guidcy.com/ rather than https://guidcy.com/.
