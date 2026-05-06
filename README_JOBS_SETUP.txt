GUIDCY JOBS PAGE SETUP

This package adds:
1. /jobs page for live job search.
2. /api/jobs Vercel Serverless Function.
3. Sitemap entry for https://www.guidcy.com/jobs.
4. Jobs navigation button in the site header.

IMPORTANT SECURITY STEP:
Do not paste the RapidAPI key directly inside frontend HTML.
Add it in Vercel environment variables:

Vercel Dashboard → Project → Settings → Environment Variables
Name: RAPIDAPI_KEY
Value: your X-RapidAPI-Key from RapidAPI
Environment: Production, Preview, Development
Save → Redeploy

After deployment, test:
https://www.guidcy.com/jobs
https://www.guidcy.com/api/jobs?q=software%20developer&location=India

If you previously exposed your RapidAPI key publicly, rotate/regenerate the key in RapidAPI after testing.
