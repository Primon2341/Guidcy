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
  const candidates = [
    path.join(root, file),
    path.join(distDir, file)
  ];

  for (const src of candidates) {
    if (exists(src)) {
      const dest = path.join(publicDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log("Copied:", file, "from", src.includes("/dist/") || src.includes("\\dist\\") ? "dist" : "root");
      return true;
    }
  }

  console.log("Optional file not found, skipped:", file);
  return false;
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

if (exists(distDir)) {
  console.log("Copying dist folder to public...");
  copyRecursive(distDir, publicDir);
} else {
  console.log("dist folder not found. Continuing with root files...");
}

if (!exists(path.join(publicDir, "index.html"))) {
  copyFirstAvailable("index.html");
}

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
].forEach(copyFirstAvailable);

if (!exists(path.join(publicDir, "index.html"))) {
  console.error("Build failed: index.html was not found in root or dist.");
  process.exit(1);
}

console.log("Build completed successfully.");
console.log("Vercel should deploy the public folder now.");
