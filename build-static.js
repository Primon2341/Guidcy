const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

function exists(p){ return fs.existsSync(p); }

function copyRecursive(src, dest){
  if(!exists(src)) return false;
  const stat = fs.statSync(src);
  if(stat.isDirectory()){
    fs.mkdirSync(dest, {recursive:true});
    for(const item of fs.readdirSync(src)){
      copyRecursive(path.join(src,item), path.join(dest,item));
    }
  }else{
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.copyFileSync(src,dest);
  }
  return true;
}

function copyFirstAvailable(file){
  const candidates = [path.join(root,file), path.join(distDir,file)];
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

function normalizeRoute(route){
  return String(route || "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i,"")
    .replace(/[?#].*$/,"")
    .replace(/^\/+|\/+$/g,"");
}

function isAssetRoute(route){
  return route.startsWith("api/") ||
    route.includes("..") ||
    route.includes("\\") ||
    /\.(png|jpg|jpeg|gif|svg|ico|webmanifest|xml|txt|js|css|json|map|woff|woff2|ttf|eot|pdf|zip)$/i.test(route);
}

function addRoute(route, indexHtml){
  const clean = normalizeRoute(route);
  if(!clean || isAssetRoute(clean)) return;
  const routeDir = path.join(publicDir, clean);
  fs.mkdirSync(routeDir, {recursive:true});
  fs.writeFileSync(path.join(routeDir,"index.html"), indexHtml, "utf8");
  console.log("Created refresh-safe route: /" + clean);
}

fs.rmSync(publicDir, {recursive:true, force:true});
fs.mkdirSync(publicDir, {recursive:true});

if(exists(distDir)) copyRecursive(distDir, publicDir);

/* Critical: latest root index.html must override old dist/index.html */
forceCopyRootFile("index.html");

if(!exists(path.join(publicDir,"index.html"))) copyFirstAvailable("index.html");

[
  "favicon.ico","favicon.png","favicon.svg","favicon-16x16.png","favicon-32x32.png",
  "favicon-48x48.png","favicon-96x96.png","favicon-180x180.png","favicon-192x192.png",
  "favicon-512x512.png","apple-touch-icon.png","site.webmanifest","manifest.json",
  "logo.png","logo.jpeg","robots.txt","sitemap.xml"
].forEach(copyFirstAvailable);

const indexPath = path.join(publicDir,"index.html");
if(!exists(indexPath)){
  console.error("Build failed: index.html was not found in root or dist.");
  process.exit(1);
}

const indexHtml = fs.readFileSync(indexPath,"utf8");

const routes = new Set([
  "home","explore",
  "browse","profile","consultants","consultant-profile",
  "login","log-in","signin","sign-in",
  "signup","sign-up","get-started","getstarted","register","registration",
  "payment","pay","confirm","confirmation","meeting","meet","review",
  "user-dash","user-dashboard","dashboard",
  "cons-dash","consultant-dashboard","consultant-dash",
  "admin-dash","admin-dashboard","admin",
  "categories","category","become","become-a-consultant","become-consultant",
  "about","contact","faq","faqs","terms","terms-and-conditions",
  "privacy","privacy-policy","refund","refund-policy","disclaimer",
  "blog","blogs","jobs","smart-finder","smartfinder","ai-finder",
  "webinar","webinars","help","help-center","support",
  "dispute","dispute-resolution",
  "business-consultant","career-guidance","financial-advisor","startup-mentor",
  "legal-consultant","technology-consultant","marketing-consultant",
  "college-finder","college-guidance"
]);

/* Detect actual page IDs and create folders for them */
for(const match of indexHtml.matchAll(/id\s*=\s*["']page-([^"']+)["']/g)){
  routes.add(match[1]);
}

/* Detect go('page') */
for(const match of indexHtml.matchAll(/\bgo\s*\(\s*['"]([^'"]+)['"]/g)){
  routes.add(match[1]);
}

/* Detect href="/page" */
for(const match of indexHtml.matchAll(/\bhref\s*=\s*["']\/([^"':?#]+)(?:[?#][^"']*)?["']/g)){
  routes.add(match[1]);
}

/* Detect location.href="/page" */
for(const match of indexHtml.matchAll(/(?:window\.)?location\.href\s*=\s*["']\/([^"':?#]+)(?:[?#][^"']*)?["']/g)){
  routes.add(match[1]);
}

/* Detect pushState(..."/page") */
for(const match of indexHtml.matchAll(/pushState\s*\([^)]*["']\/([^"':?#]+)(?:[?#][^"']*)?["']/g)){
  routes.add(match[1]);
}

for(const route of routes) addRoute(route, indexHtml);

console.log("Build completed successfully.");
console.log("Complete refresh-state fix installed for all detected Guidcy pages.");
