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

const {routes:routeMeta} = require('./assets/js/seo');
const {withRouteSeo, buildSitemap, buildRobots} = require('./lib/seo');

function addRoute(route, indexHtml){
  const clean = String(route||"").trim().replace(/^\/+|\/+$/g,"");
  if(!clean) return;
  if(clean.startsWith("api/") || clean.includes("..") || clean.includes("\\") || /\.(png|jpg|jpeg|gif|svg|ico|webmanifest|xml|txt|js|css|json|map|woff|woff2|ttf|eot|pdf|zip)$/i.test(clean)) return;
  const dir = path.join(publicDir, clean);
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir,"index.html"), withRouteSeo(indexHtml, "/" + clean), "utf8");
  console.log("Created route:", "/" + clean);
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
for (const name of ["pdf.mjs", "pdf.worker.mjs"]) fs.copyFileSync(path.join(root,"node_modules","pdfjs-dist","build",name), path.join(publicDir,"assets","vendor",name));

// Reduce the mobile download/parse cost while keeping the authored source
// readable. Global names and function names remain stable because the legacy
// SPA intentionally inspects some function source and global names.
function minifyDeployableJavaScript(relPath){
  const full = path.join(publicDir, relPath);
  if(!exists(full)) return;
  const source = fs.readFileSync(full, "utf8");
  const result = minify_sync(source, {
    /* Remove statically unreachable code and unused local bindings. Broader
       compression remains off because parts of the SPA inspect handler source
       and depend on stable global names. */
    compress: {defaults:false, dead_code:true, unused:true},
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
["assets/js/availability.js","assets/js/blog-content.js","assets/js/blog.js","assets/js/seo.js","assets/js/seo-client.js","assets/js/cookie-consent.js","assets/js/security-client.js","assets/js/page-shell.js","assets/js/auth-lifecycle.js","assets/js/jobs-search.js","assets/js/core.js","assets/js/app.js","assets/js/profile-resources.js","assets/js/shared-search.js","assets/js/webinar-flow.js","assets/js/ui-refresh.js","assets/js/razorpay-checkout.js","assets/js/controllers.js"].forEach(minifyDeployableJavaScript);

function minifyDeployableCss(relPath){
  const full = path.join(publicDir, relPath);
  if(!exists(full)) return;
  const source = fs.readFileSync(full, "utf8");
  const output = new CleanCSS({level:1,rebase:false,returnPromise:false}).minify(source);
  if(output.errors && output.errors.length) throw new Error(`Could not minify ${relPath}: ${output.errors.join("; ")}`);
  fs.writeFileSync(full, output.styles, "utf8");
  console.log(`Optimized: ${relPath} (${(source.length-output.styles.length).toLocaleString()} bytes removed)`);
}
["assets/css/blog.css","assets/css/cookie-consent.css","assets/css/jobs-search.css","assets/css/base.css","assets/css/patches.css","assets/css/fonts.css","assets/css/login.css","assets/css/mobile.css"].forEach(minifyDeployableCss);

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
  // The seven global stylesheets always load together. Preserve their exact
  // cascade in one versioned file instead of seven render-blocking requests.
  const sheets=Array.from(html.matchAll(/<link rel="stylesheet" href="(\/assets\/css\/[^"?]+)"\s*\/?>(?:\n)?/g));
  const css=sheets.map(match=>fs.readFileSync(path.join(publicDir,match[1]),'utf8')).join('\n');
  fs.writeFileSync(path.join(publicDir,'assets/css/site.css'),css);
  const cssTag='<link rel="stylesheet" href="/assets/css/site.css?v='+assetVersionTag('assets/css/site.css')+'">\n';
  sheets.forEach((match,i)=>{html=html.replace(match[0],i===0?cssTag:'')});
  // Small critical bootstrap is part of the document, with no blocking network hop.
  const shellScript = fs.readFileSync(path.join(publicDir, 'assets/js/page-shell.js'), 'utf8');
  html = html.replace('<script src="/assets/js/page-shell.js"></script>', () => '<script>'+shellScript+'</script>');
  [
 "assets/js/availability.js","assets/js/blog-content.js","assets/js/blog.js","assets/js/seo.js","assets/js/seo-client.js","assets/js/cookie-consent.js",
 "assets/css/cookie-consent.css",
 "assets/js/security-client.js",
 "assets/js/jobs-search.js",
 "assets/css/jobs-search.css",
 "assets/js/core.js",
 "assets/js/controllers.js",
 "assets/js/razorpay-checkout.js",
 "assets/js/page-shell.js",
 "assets/js/auth-lifecycle.js",
 "assets/js/app.js","assets/js/profile-resources.js",
 "assets/js/shared-search.js",
 "assets/js/webinar-flow.js",
 "assets/js/ui-refresh.js",
 "assets/vendor/supabase.js",
    "assets/css/base.css",
    "assets/css/patches.css",
    "assets/css/fonts.css",
    "assets/css/login.css",
    "assets/css/mobile.css"
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

// Only the already-public anonymous key is used by SEO rendering; RLS remains in force.
const clientSource=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const publicUrl=clientSource.match(/supabase_url:\s*'([^']+)'/)[1];
const publicKey=clientSource.match(/supabase_key:\s*'([^']+)'/)[1];
if(JSON.parse(Buffer.from(publicKey.split('.')[1],'base64url')).role!=='anon')throw new Error('SEO requires an anonymous database key');
fs.writeFileSync(path.join(publicDir,'seo-config.json'),JSON.stringify({url:publicUrl,key:publicKey}));

const rawIndexHtml = cacheBustAssets(fs.readFileSync(indexPath,"utf8"));
fs.writeFileSync(indexPath, withRouteSeo(rawIndexHtml, "/"), "utf8");
const indexHtml = fs.readFileSync(indexPath,"utf8");
fs.writeFileSync(path.join(publicDir,"seo-template.html"),rawIndexHtml);

const routeSet = new Set(Object.keys(routeMeta).filter(route => route !== "/").map(route => route.replace(/^\/+/,"")));
  const utilityRoutes = [
    "login","signup","get-started","consultant","book","home","profile","support","payment","confirm","meeting","review",
    "dashboard","user-dashboard","consultant-dashboard","admin","admin-dashboard",
    "admin/webinar-registrations"
  ];
utilityRoutes.forEach(route => routeSet.add(route));

for(const match of indexHtml.matchAll(/id\s*=\s*["']page-([^"']+)["']/g)){
  const id = match[1];
  if(!/dash|payment|confirm|meeting|review|profile|seo-detail/.test(id)) routeSet.add(id);
}
for(const route of routeSet) addRoute(route, rawIndexHtml);

fs.writeFileSync(path.join(publicDir, "sitemap.xml"), buildSitemap(), "utf8");
fs.writeFileSync(path.join(publicDir, "robots.txt"), buildRobots(), "utf8");
fs.writeFileSync(path.join(publicDir, "404.html"), withRouteSeo(rawIndexHtml, "/404"), "utf8");
removeMacDuplicateRouteDirs(publicDir);
console.log("Created route-aware sitemap.xml, robots.txt and SPA fallback.");

console.log("Build completed successfully. Route-specific SEO metadata generated for public pages.");

// Directory shells stay on the static CDN: a public catalog snapshot helps
// no-JavaScript visitors without adding a database round trip to every cold page.
// Interactive catalogs and the dynamic sitemap continue to use current data.
if(process.env.VERCEL==='1'||process.env.GUIDCY_BUILD_PUBLIC_CATALOG==='1'){
  const {rows,catalog,directories,available}=require('./lib/seo-public');
  Promise.all(Object.entries(directories).map(async ([route,kind])=>{
    const data=(await rows(kind)).filter(row=>available(kind,row));
    const file=path.join(publicDir,route,'index.html');
    const page=require('./assets/js/seo').metaFor(route).page;
    const html=fs.readFileSync(file,'utf8').replace(`id="page-${page}" class="page on" role="main">`,`id="page-${page}" class="page on" role="main">`+catalog(kind,data));
    fs.writeFileSync(file,html);
  })).then(()=>console.log('Created public catalog snapshots for static directory pages.')).catch(error=>{console.error('Public catalog snapshot failed:',error.message);process.exitCode=1});
}
