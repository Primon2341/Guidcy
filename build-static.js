const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {minify_sync} = require("terser");
const CleanCSS = require("clean-css");

const root = process.cwd();
const publicDir = path.join(root, "public");
const siteUrl = "https://www.guidcy.com";

function exists(p){ return fs.existsSync(p); }

function copyDirRecursive(src, dest){
  if(!exists(src)) return false;
  fs.mkdirSync(dest, {recursive:true});
  for(const item of fs.readdirSync(src)){
    const s = path.join(src,item), d = path.join(dest,item);
    if(fs.statSync(s).isDirectory()) copyDirRecursive(s,d);
    else fs.copyFileSync(s,d);
  }
  return true;
}

function removeMacDuplicateRouteDirs(dir){
  if(!exists(dir)) return;
  for(const item of fs.readdirSync(dir)){
    const full = path.join(dir, item);
    if(fs.statSync(full).isDirectory() && /\s+\d+$/.test(item)){
      fs.rmSync(full, {recursive:true, force:true});
      console.log("Removed duplicate generated route folder:", path.relative(root, full));
    }
  }
}

function copyFirstAvailable(file){
  const candidates = [path.join(root,file)];
  for(const src of candidates){
    if(exists(src)){
      const dest = path.join(publicDir,file);
      fs.mkdirSync(path.dirname(dest), {recursive:true});
      fs.copyFileSync(src,dest);
      console.log("Copied:", file);
      return true;
    }
  }
  console.log("Optional file not found, skipped:", file);
  return false;
}

function forceCopyRootFile(file){
  const src = path.join(root,file);
  if(exists(src)){
    const dest = path.join(publicDir,file);
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.copyFileSync(src,dest);
    console.log("Forced latest root file:", file);
    return true;
  }
  return false;
}

function esc(value){
  return String(value == null ? "" : value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

const routeMeta = {
  "/": {
    title: "Guidcy - Expert Guidance On Demand",
    description: "Guidcy helps people find verified experts, book consultations, discover notes, webinars, jobs, grants, and career guidance in one trusted platform.",
    h1: "Find the Right Expert. Get the Right Guidance.",
    summary: "Book expert consultations and explore trusted guidance resources across career, business, education, finance, startups and more.",
    priority: "1.0",
    changefreq: "weekly"
  },
  "/find-experts": {
    title: "Find Experts & Consultants Online - Guidcy",
    description: "Browse verified Guidcy experts and consultants for business, career, finance, startup, legal, education and professional guidance.",
    h1: "Find Experts & Consultants Online",
    summary: "Search and compare verified consultants, review their expertise, and book the right expert session on Guidcy.",
    priority: "0.95"
  },
  "/browse": {
    aliasOf: "/find-experts"
  },
  "/experts": {
    aliasOf: "/find-experts"
  },
  "/consultants": {
    aliasOf: "/browse"
  },
  "/find-jobs": {
    title: "Find Jobs, Internships & Opportunities - Guidcy",
    description: "Search jobs, internships, openings and saved opportunities on Guidcy for students, professionals and career explorers.",
    h1: "Find Jobs and Career Opportunities",
    summary: "Discover job opportunities, internships and openings that match your skills, goals and preferred career path.",
    priority: "0.9",
    changefreq: "daily"
  },
  "/jobs": {
    aliasOf: "/find-jobs"
  },
  "/careers": {
    title: "Careers at Guidcy - Join Our Team",
    description: "Explore open positions at Guidcy. Join a small, senior team building India's expert guidance marketplace across engineering, product, marketing and operations.",
    h1: "Careers at Guidcy",
    summary: "See current job openings at Guidcy and apply to help millions of learners and professionals get better guidance.",
    priority: "0.7",
    changefreq: "weekly"
  },
  "/find-work": {
    aliasOf: "/careers"
  },
  "/work": {
    aliasOf: "/careers"
  },
  "/guidcy-work": {
    aliasOf: "/careers"
  },
  "/marketplace": {
    title: "Marketplace Notes & Study Resources - Guidcy",
    description: "Buy, preview, download and sell PDF notes and study resources on the Guidcy Marketplace.",
    h1: "Guidcy Marketplace Notes",
    summary: "Browse study notes and PDF resources with previews, payments, downloads and seller tracking built into Guidcy.",
    priority: "0.9"
  },
  "/webinars": {
    title: "Webinars, Workshops & Expert Sessions - Guidcy",
    description: "Discover upcoming Guidcy webinars, workshops and expert-led online sessions for career, exams, business and professional growth.",
    h1: "Guidcy Webinars and Workshops",
    summary: "Register for live expert-led webinars and learning sessions hosted through Guidcy.",
    priority: "0.88"
  },
  "/webinar": {
    aliasOf: "/webinars"
  },
  "/funds-grants": {
    title: "Funds, Grants & Scholarships Finder - Guidcy",
    description: "Use Guidcy to discover funding opportunities, grants, scholarships and support programs for students, founders and professionals.",
    h1: "Funds, Grants and Scholarships Finder",
    summary: "Find relevant scholarships, grants, startup funds and funding programs with Guidcy.",
    priority: "0.9"
  },
  "/opportunities": {
    aliasOf: "/funds-grants"
  },
  "/career-ai-finder": {
    title: "Career & College AI Finder - Guidcy",
    description: "Explore career, college, exam and education options with Guidcy's AI-assisted career and college finder.",
    h1: "Career and College AI Finder",
    summary: "Get structured career and college suggestions, compare options and connect with guidance experts.",
    priority: "0.9"
  },
  "/career-ai": {
    aliasOf: "/career-ai-finder"
  },
  "/smart-finder": {
    aliasOf: "/career-ai-finder"
  },
  "/blog": {
    title: "Guidcy Blog - Expert Guidance Articles",
    description: "Read Guidcy articles about expert guidance, career decisions, learning, professional growth and online consultation.",
    h1: "Guidcy Blog",
    summary: "Read practical guidance articles from Guidcy about careers, learning, expert consultations and personal growth.",
    priority: "0.8"
  },
  "/categories": {
    title: "Consultation Categories - Guidcy",
    description: "Explore Guidcy consultation categories including business, career, finance, legal, education, startup, technology and wellness.",
    h1: "Guidcy Consultation Categories",
    summary: "Browse consultation categories and find the right kind of expert guidance for your goal.",
    priority: "0.75"
  },
  "/about": {
    title: "About Guidcy",
    description: "Learn about Guidcy, an expert guidance platform connecting users with verified consultants, resources, webinars and opportunities.",
    h1: "About Guidcy",
    summary: "Guidcy helps people access trustworthy expert guidance and resources from one online platform.",
    priority: "0.65"
  },
  "/contact": {
    title: "Contact Guidcy",
    description: "Contact Guidcy support and the Guidcy Hyderabad Office Near TCS Adibatla for help with bookings, webinars, marketplace notes and accounts.",
    h1: "Contact Guidcy",
    summary: "Reach Guidcy for support, questions, partnerships and account help.",
    priority: "0.65"
  },
  "/help-center": {
    title: "Guidcy Help Center",
    description: "Get help with Guidcy bookings, payments, marketplace notes, webinars, jobs, grants, accounts and consultant dashboards.",
    h1: "Guidcy Help Center",
    summary: "Find support for common Guidcy workflows including bookings, notes, webinars and payments.",
    priority: "0.65"
  },
  "/help": {
    aliasOf: "/help-center"
  },
  "/support": {
    aliasOf: "/help-center"
  },
  "/faq": {
    title: "Guidcy FAQ",
    description: "Find answers to frequently asked questions about Guidcy consultations, payments, experts, webinars and marketplace notes.",
    h1: "Guidcy FAQ",
    summary: "Answers to common questions about using Guidcy.",
    priority: "0.55"
  },
  "/dispute-resolution": {
    title: "Guidcy Dispute Resolution",
    description: "Learn how Guidcy handles disputes, support issues, booking concerns, marketplace concerns and payment-related complaints.",
    h1: "Guidcy Dispute Resolution",
    summary: "Guidcy support helps review disputes and support issues raised by users and consultants.",
    priority: "0.5"
  },
  "/dispute": {
    aliasOf: "/dispute-resolution"
  },
  "/terms": {
    title: "Guidcy Terms and Conditions",
    description: "Read the Guidcy terms and conditions for users, consultants, bookings, payments, webinars and marketplace use.",
    h1: "Guidcy Terms and Conditions",
    summary: "Terms governing use of the Guidcy platform.",
    priority: "0.35"
  },
  "/privacy": {
    title: "Guidcy Privacy Policy",
    description: "Read how Guidcy collects, uses and protects user, consultant, booking and platform data.",
    h1: "Guidcy Privacy Policy",
    summary: "Guidcy privacy information for users, consultants and visitors.",
    priority: "0.35"
  },
  "/refund": {
    title: "Guidcy Refund Policy",
    description: "Read Guidcy's refund policy for consultation bookings, payments and platform transactions.",
    h1: "Guidcy Refund Policy",
    summary: "Refund rules and timelines for Guidcy transactions.",
    priority: "0.35"
  },
  "/disclaimer": {
    title: "Guidcy Disclaimer",
    description: "Read important disclaimers about Guidcy consultations, expert guidance, outcomes and professional advice.",
    h1: "Guidcy Disclaimer",
    summary: "Important information about guidance provided through Guidcy.",
    priority: "0.35"
  }
};

function metaFor(route){
  const cleanRoute = "/" + String(route || "").replace(/^\/+|\/+$/g, "");
  const key = cleanRoute === "/" ? "/" : cleanRoute;
  const meta = routeMeta[key] || routeMeta["/" + String(route || "").replace(/^\/+|\/+$/g,"")] || routeMeta["/"];
  if(meta.aliasOf) return Object.assign({}, metaFor(meta.aliasOf), {canonicalPath: meta.aliasOf});
  return Object.assign({canonicalPath:key, changefreq:"weekly"}, meta);
}

function setOrInsert(html, pattern, replacement, before = "</head>"){
  if(pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace(before, `${replacement}\n${before}`);
}

function routeJsonLd(meta){
  const url = siteUrl + (meta.canonicalPath === "/" ? "/" : meta.canonicalPath);
  const crumbs = [
    {"@type":"ListItem","position":1,"name":"Guidcy","item":siteUrl + "/"}
  ];
  if(meta.canonicalPath !== "/") crumbs.push({"@type":"ListItem","position":2,"name":meta.h1,"item":url});
  return {
    "@context":"https://schema.org",
    "@graph":[
      {"@type":"WebPage","name":meta.title,"description":meta.description,"url":url,"isPartOf":{"@type":"WebSite","name":"Guidcy","url":siteUrl + "/"}},
      {"@type":"BreadcrumbList","itemListElement":crumbs}
    ]
  };
}

function withRouteSeo(indexHtml, route){
  const meta = metaFor(route);
  const url = siteUrl + (meta.canonicalPath === "/" ? "/" : meta.canonicalPath);
  let html = indexHtml;
  html = setOrInsert(html, /<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.title)}</title>`);
  html = setOrInsert(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${esc(meta.description)}">`);
  html = setOrInsert(html, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${esc(url)}">`);
  html = setOrInsert(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${esc(meta.title)}">`);
  html = setOrInsert(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${esc(meta.description)}">`);
  html = setOrInsert(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${esc(url)}">`);
  html = setOrInsert(html, /<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${esc(meta.title)}">`);
  html = setOrInsert(html, /<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${esc(meta.description)}">`);
  const json = JSON.stringify(routeJsonLd(meta)).replace(/</g,"\\u003c");
  html = html.replace("</head>", `<script type="application/ld+json" id="guidcy-route-jsonld">${json}</script>\n</head>`);
  const links = Object.entries(routeMeta)
    .filter(([routeKey, item]) => !item.aliasOf && routeKey !== "/")
    .slice(0, 18)
    .map(([routeKey, item]) => `<li><a href="${routeKey}">${esc(item.h1 || item.title)}</a></li>`)
    .join("");
  const noscript = `<noscript><main id="guidcy-seo-route-content"><h1>${esc(meta.h1)}</h1><p>${esc(meta.summary)}</p><nav aria-label="Important Guidcy pages"><ul>${links}</ul></nav></main></noscript>`;
  return html.replace(/<body([^>]*)>/i, `<body$1>\n${noscript}`);
}

function addRoute(route, indexHtml){
  const clean = String(route||"").trim().replace(/^\/+|\/+$/g,"");
  if(!clean) return;
  if(clean.startsWith("api/") || clean.includes("..") || clean.includes("\\") || /\.(png|jpg|jpeg|gif|svg|ico|webmanifest|xml|txt|js|css|json|map|woff|woff2|ttf|eot|pdf|zip)$/i.test(clean)) return;
  const dir = path.join(publicDir, clean);
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir,"index.html"), withRouteSeo(indexHtml, "/" + clean), "utf8");
  console.log("Created route:", "/" + clean);
}

function buildSitemap(){
  const urls = Object.entries(routeMeta)
    .filter(([, meta]) => !meta.aliasOf)
    .map(([route, meta]) => {
      const loc = siteUrl + (route === "/" ? "/" : route);
      return `  <url><loc>${loc}</loc><changefreq>${meta.changefreq || "weekly"}</changefreq><priority>${meta.priority || "0.6"}</priority></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildRobots(){
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin-dashboard\nDisallow: /dashboard\nDisallow: /user-dashboard\nDisallow: /consultant-dashboard\nDisallow: /payment\nDisallow: /confirm\nDisallow: /meeting\nDisallow: /review\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

fs.rmSync(publicDir, {recursive:true, force:true});
fs.mkdirSync(publicDir, {recursive:true});

forceCopyRootFile("index.html");
if(!exists(path.join(publicDir,"index.html"))) copyFirstAvailable("index.html");

[
  "favicon.ico","favicon.png","favicon.svg","favicon-16x16.png","favicon-32x32.png",
  "favicon-48x48.png","favicon-96x96.png","favicon-180x180.png","favicon-192x192.png",
  "favicon-512x512.png","apple-touch-icon.png","site.webmanifest","manifest.json",
  "logo.png","logo.jpeg","logo-header.png",
  "careers-team.jpg","careers-work.jpg"
].forEach(copyFirstAvailable);

copyDirRecursive(path.join(root,"assets"), path.join(publicDir,"assets"));
console.log("Copied: assets/ (css/js, single copy, not duplicated per route)");

// Keep the database client on the same origin as the app. Depending on an
// unpinned third-party CDN here delayed every deferred app script in a fresh
// browser window; a refresh appeared to fix Careers only because the SDK had
// entered the browser cache by then.
const supabaseBrowserSdk = path.join(root,"node_modules","@supabase","supabase-js","dist","umd","supabase.js");
if(!exists(supabaseBrowserSdk)){
  throw new Error("Pinned Supabase browser SDK is missing. Run npm install before building.");
}
const supabaseBrowserDest = path.join(publicDir,"assets","vendor","supabase.js");
fs.mkdirSync(path.dirname(supabaseBrowserDest), {recursive:true});
fs.copyFileSync(supabaseBrowserSdk, supabaseBrowserDest);
console.log("Copied: pinned Supabase browser SDK (local, same-origin)");

// Reduce the mobile download/parse cost while keeping the authored source
// readable. Name mangling and compression rewrites stay disabled because the
// legacy SPA intentionally inspects some function source and global names.
function minifyDeployableJavaScript(relPath){
  const full = path.join(publicDir, relPath);
  if(!exists(full)) return;
  const source = fs.readFileSync(full, "utf8");
  const result = minify_sync(source, {
    /* Remove only statically unreachable legacy patch bodies. Broader
       compression remains off because parts of the SPA inspect handler source
       and depend on stable global names. */
    compress: {defaults:false, dead_code:true, unused:false},
    mangle: {toplevel:false, keep_fnames:true, keep_classnames:true},
    keep_fnames: true,
    keep_classnames: true,
    ecma: 2020,
    format: {comments: false}
  });
  if(result.error || !result.code) throw result.error || new Error(`Could not minify ${relPath}`);
  fs.writeFileSync(full, result.code, "utf8");
  const saved = source.length - result.code.length;
  console.log(`Optimized: ${relPath} (${saved.toLocaleString()} bytes removed)`);
}
["assets/js/core.js","assets/js/app.js","assets/js/shared-search.js"].forEach(minifyDeployableJavaScript);

function minifyDeployableCss(relPath){
  const full = path.join(publicDir, relPath);
  if(!exists(full)) return;
  const source = fs.readFileSync(full, "utf8");
  const output = new CleanCSS({level:1,rebase:false,returnPromise:false}).minify(source);
  if(output.errors && output.errors.length) throw new Error(`Could not minify ${relPath}: ${output.errors.join("; ")}`);
  fs.writeFileSync(full, output.styles, "utf8");
  console.log(`Optimized: ${relPath} (${(source.length-output.styles.length).toLocaleString()} bytes removed)`);
}
["assets/css/base.css","assets/css/patches.css"].forEach(minifyDeployableCss);

// Cache-bust core.js/app.js/base.css/patches.css with a hash of their own
// content. Without this, browsers and CDN edges can keep serving a stale
// cached copy of these files indefinitely after a deploy - every JS/CSS fix
// in this repo ships to the same unversioned URL, so a visitor (or an edge
// cache) that already has app.js cached has no reason to ever re-fetch it.
function assetVersionTag(relPath){
  const full = path.join(publicDir, relPath);
  if(!exists(full)) return "";
  const hash = crypto.createHash("md5").update(fs.readFileSync(full)).digest("hex").slice(0,10);
  return hash;
}
function cacheBustAssets(html){
  [
    "assets/js/core.js",
    "assets/js/app.js",
    "assets/js/shared-search.js",
    "assets/vendor/supabase.js",
    "assets/css/base.css",
    "assets/css/patches.css"
  ].forEach(relPath => {
    const version = assetVersionTag(relPath);
    if(!version) return;
    const escaped = relPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(["'\`/])${escaped}(?:\\?v=[a-f0-9]+)?(["'\`])`, "g");
    html = html.replace(re, `$1${relPath}?v=${version}$2`);
  });
  return html;
}

const indexPath = path.join(publicDir,"index.html");
if(!exists(indexPath)){
  console.error("Build failed: index.html missing.");
  process.exit(1);
}

const rawIndexHtml = cacheBustAssets(fs.readFileSync(indexPath,"utf8"));
fs.writeFileSync(indexPath, withRouteSeo(rawIndexHtml, "/"), "utf8");
const indexHtml = fs.readFileSync(indexPath,"utf8");

const routeSet = new Set(Object.keys(routeMeta).filter(route => route !== "/").map(route => route.replace(/^\/+/,"")));
  const utilityRoutes = [
    "login","signup","get-started","consultant","book","home","profile","support",
    "dashboard","user-dashboard","consultant-dashboard","admin","admin-dashboard",
    "admin/webinar-registrations"
  ];
utilityRoutes.forEach(route => routeSet.add(route));

for(const match of indexHtml.matchAll(/id\s*=\s*["']page-([^"']+)["']/g)){
  const id = match[1];
  if(!/dash|payment|confirm|meeting|review|profile/.test(id)) routeSet.add(id);
}
for(const route of routeSet) addRoute(route, rawIndexHtml);

fs.writeFileSync(path.join(publicDir, "sitemap.xml"), buildSitemap(), "utf8");
fs.writeFileSync(path.join(publicDir, "robots.txt"), buildRobots(), "utf8");
fs.writeFileSync(path.join(publicDir, "404.html"), indexHtml, "utf8");
removeMacDuplicateRouteDirs(publicDir);
console.log("Created route-aware sitemap.xml, robots.txt and SPA fallback.");

console.log("Build completed successfully. Route-specific SEO metadata generated for public pages.");
