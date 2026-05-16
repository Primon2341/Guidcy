const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
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
}

function copyIfExists(file) {
  const src = path.join(root, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

// Copy current dist website into public output.
copyRecursive(distDir, publicDir);

// Also copy root index.html if dist/index.html is missing.
if (!fs.existsSync(path.join(publicDir, "index.html"))) {
  copyIfExists("index.html");
}

// Force-copy root-level SEO/favicon/static files into final output root.
[
  "favicon.ico",
  "favicon.png",
  "favicon.svg",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon-48x48.png",
  "favicon-96x96.png",
  "favicon-180x180.png",
  "favicon-192x192.png",
  "favicon-512x512.png",
  "apple-touch-icon.png",
  "site.webmanifest",
  "manifest.json",
  "logo.png",
  "logo.jpeg",
  "robots.txt",
  "sitemap.xml"
].forEach(copyIfExists);

// Fail fast if favicon files are still not in the deployed output.
const required = ["index.html", "favicon.ico", "favicon-48x48.png", "site.webmanifest"];
const missing = required.filter(file => !fs.existsSync(path.join(publicDir, file)));

if (missing.length) {
  console.error("Build failed. Missing required files in public output:", missing.join(", "));
  console.error("Put these files in the project root, then redeploy.");
  process.exit(1);
}

console.log("Static build completed. Public output contains favicon files.");
