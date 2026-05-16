const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

function exists(p) {
  return fs.existsSync(p);
}

function copyRecursive(src, dest) {
  if (!exists(src)) return false;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return true;
}

function copyFirstAvailable(file) {
  const candidates = [path.join(root, file), path.join(distDir, file)];
  for (const src of candidates) {
    if (exists(src)) {
      const dest = path.join(publicDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log("Copied:", file);
      return true;
    }
  }
  console.log("Optional file not found, skipped:", file);
  return false;
}

function forceCopyRootFile(file) {
  const src = path.join(root, file);
  if (exists(src)) {
    const dest = path.join(publicDir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("Forced latest root file:", file);
    return true;
  }
  return false;
}

function normalizeRoute(route) {
  return String(route || "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "");
}

function addRoute(route, indexHtml) {
  const clean = normalizeRoute(route);
  if (!clean) return;
  if (
    clean.startsWith("api/") ||
    clean.includes("..") ||
    clean.includes("\\") ||
    clean.match(/\.(png|jpg|jpeg|gif|svg|ico|webmanifest|xml|txt|js|css|json|map|woff|woff2|ttf|eot)$/i)
  ) return;

  const routeDir = path.join(publicDir, clean);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, "index.html"), indexHtml, "utf8");
  console.log("Created refresh-safe route: /" + clean);
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

if (exists(distDir)) copyRecursive(distDir, publicDir);

/* Always deploy latest root index.html, not old dist/index.html */
forceCopyRootFile("index.html");

if (!exists(path.join(publicDir, "index.html"))) copyFirstAvailable("index.html");

[
  "favicon.ico","favicon.png","favicon.svg","favicon-16x16.png","favicon-32x32.png",
  "favicon-48x48.png","favicon-96x96.png","favicon-180x180.png","favicon-192x192.png",
  "favicon-512x512.png","apple-touch-icon.png","site.webmanifest","manifest.json",
  "logo.png","logo.jpeg","robots.txt","sitemap.xml"
].forEach(copyFirstAvailable);

const indexPath = path.join(publicDir, "index.html");
if (!exists(indexPath)) {
  console.error("Build failed: index.html was not found in root or dist.");
  process.exit(1);
}
const indexHtml = fs.readFileSync(indexPath, "utf8");

const manualRoutes = [
  "home","explore","browse","categories","blog","blogs","jobs","smart-finder","smartfinder",
  "webinar","webinars","become","become-a-consultant","consultant","consultants",
  "login","signup","sign-up","get-started","getstarted","register","registration",
  "forgot-password","reset-password","help","help-center","support","dispute",
  "dispute-resolution","contact","about","privacy","privacy-policy","terms",
  "terms-and-conditions","refund","refund-policy","cancellation","cancellation-policy",
  "dashboard","user-dashboard","consultant-dashboard","admin","admin-dashboard",
  "profile","booking","bookings","payment","confirmation","confirm","business-consultant",
  "career-guidance","financial-advisor","startup-mentor","legal-consultant",
  "technology-consultant","marketing-consultant","college-finder","college-guidance"
];

const discoveredRoutes = new Set();
for (const match of indexHtml.matchAll(/\bgo\s*\(\s*['"]([^'"]+)['"]/g)) discoveredRoutes.add(match[1]);
for (const match of indexHtml.matchAll(/id\s*=\s*["']page-([^"']+)["']/g)) discoveredRoutes.add(match[1]);
for (const match of indexHtml.matchAll(/\bhref\s*=\s*["']\/([^"':?#]+)(?:[?#][^"']*)?["']/g)) discoveredRoutes.add(match[1]);
for (const match of indexHtml.matchAll(/(?:window\.)?location\.href\s*=\s*["']\/([^"':?#]+)(?:[?#][^"']*)?["']/g)) discoveredRoutes.add(match[1]);
for (const match of indexHtml.matchAll(/pushState\s*\([^)]*["']\/([^"':?#]+)(?:[?#][^"']*)?["']/g)) discoveredRoutes.add(match[1]);

for (const route of new Set([...manualRoutes, ...discoveredRoutes])) addRoute(route, indexHtml);

console.log("Build completed successfully.");
console.log("Refresh-safe folders created and initial path restore script included.");
