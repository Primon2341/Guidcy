404 fix applied:
- Added Vercel build step using build.js
- Added dist/ output folder generation
- Updated vercel.json with outputDirectory=dist and SPA rewrites

Deploy this ZIP root to GitHub/Vercel. In Vercel project settings, keep:
- Framework Preset: Other
- Build Command: npm run build
- Output Directory: dist
