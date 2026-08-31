const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', 'public');
const port = 3054;
const password = process.env.GUIDCY_AUDIT_PASSWORD || '';
let accounts = {};
try { accounts = JSON.parse(process.env.GUIDCY_AUDIT_ACCOUNTS || '{}'); } catch (_) {}
if (!password || !accounts.user || !accounts.consultant || !accounts.admin) {
  throw new Error('Set GUIDCY_AUDIT_PASSWORD and GUIDCY_AUDIT_ACCOUNTS before running this live audit.');
}

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.ico':'image/x-icon', '.xml':'application/xml'
};
const publicRoutes = [
  ['/', 'home'], ['/browse', 'browse'], ['/find-jobs', 'jobs'], ['/careers', 'careers'],
  ['/marketplace', 'marketplace'], ['/webinars', 'webinar'], ['/funds-grants', 'opportunities'],
  ['/career-ai-finder', 'smart-finder'], ['/blog', 'blog'], ['/categories', 'categories'],
  ['/about', 'about'], ['/contact', 'contact'], ['/help-center', 'help'], ['/faq', 'faq'],
  ['/dispute-resolution', 'dispute'], ['/terms', 'terms'], ['/privacy', 'privacy'],
  ['/refund', 'refund'], ['/disclaimer', 'disclaimer'], ['/login', 'login'], ['/get-started', 'signup']
];
const roleConfig = {
  user: {tab:'#li-u', dashboard:'user-dash', side:'#page-user-dash .side-btn'},
  consultant: {tab:'#li-c', dashboard:'cons-dash', side:'#page-cons-dash .side-btn'},
  admin: {tab:'#li-a', dashboard:'admin-dash', side:'#page-admin-dash .side-btn'}
};

function serve(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
  let file = path.join(root, pathname.replace(/^\/+/, ''));
  if (pathname === '/') file = path.join(root, 'index.html');
  else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  else if (!fs.existsSync(file)) file = path.join(root, 'index.html');
  res.writeHead(200, {'content-type': mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}

function diagnostics(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    try {
      const url = new URL(response.url());
      const query = [...url.searchParams].map(([key, value]) => {
        const redacted = value
          .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>')
          .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '<email>');
        return `${key}=${redacted}`;
      }).join('&');
      httpErrors.push({status:response.status(), endpoint:url.pathname+(query?`?${query}`:'')});
    } catch (_) {
      httpErrors.push({status:response.status(), endpoint:'unparseable-url'});
    }
  });
  return {pageErrors, consoleErrors, httpErrors};
}

async function auditPublic(browser) {
  const context = await browser.newContext({viewport:{width:1365,height:900}});
  const page = await context.newPage();
  const diag = diagnostics(page);
  const pages = [];
  for (const [route, pageId] of publicRoutes) {
    const started = Date.now();
    await page.goto(`http://127.0.0.1:${port}${route}`, {waitUntil:'domcontentloaded', timeout:30000});
    await page.waitForSelector(`#page-${pageId}.on,#page-${pageId}.active`, {timeout:20000});
    await page.waitForTimeout(250);
    pages.push({route, page:pageId, readyMs:Date.now()-started, bodyChars:(await page.locator(`#page-${pageId}`).innerText()).trim().length});
  }
  await context.close();
  return {pages, ...diag};
}

async function auditRole(browser, role) {
  const cfg = roleConfig[role];
  const context = await browser.newContext({viewport:{width:1365,height:900}});
  const page = await context.newPage();
  const diag = diagnostics(page);
  await page.goto(`http://127.0.0.1:${port}/login`, {waitUntil:'domcontentloaded', timeout:30000});
  await page.locator(cfg.tab).click();
  await page.locator('#li-email').fill(accounts[role]);
  await page.locator('#li-pass').fill(password);
  await page.locator('#page-login .primary-btn').click();
  try {
    await page.waitForSelector(`#page-${cfg.dashboard}.on,#page-${cfg.dashboard}.active`, {timeout:30000});
  } catch (error) {
    const state = await page.evaluate(() => ({
      url:location.pathname+location.search,
      activePage:document.querySelector('.page.on,.page.active')?.id || '',
      toast:(document.getElementById('toastbar')?.textContent || '').trim(),
      selectedRole:[...document.querySelectorAll('#page-login .type-tab')].find(el=>el.classList.contains('on'))?.textContent?.trim() || '',
      resolvedRole:window.currentProfile?.role || window.loggedIn || ''
    }));
    throw new Error(`${role} login did not open ${cfg.dashboard}: ${JSON.stringify(state)}; consoleErrors=${JSON.stringify(diag.consoleErrors.slice(-5))}`);
  }
  await page.waitForTimeout(1800);
  const resolvedRole = await page.evaluate(() => window.currentProfile?.role || window.loggedIn || '');
  const initialButtons = await page.locator(`${cfg.side}:visible`).allTextContents();
  const labels = [...new Set(initialButtons.map(text => text.replace(/\s+/g,' ').trim()).filter(Boolean))];
  const sections = [];
  for (const label of labels) {
    const button = page.locator(`${cfg.side}:visible`).filter({hasText:label}).first();
    if (!await button.count()) continue;
    await button.click();
    await page.waitForTimeout(650);
    sections.push({label, title:(await page.locator(`#page-${cfg.dashboard} .dash-title`).first().innerText().catch(()=>'')).replace(/\s+/g,' ').trim(), url:new URL(page.url()).pathname+new URL(page.url()).search});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(roleName => window.toggleDashMenu(roleName === 'consultant' ? 'cons' : roleName), role);
  const mobileDrawerOpen = await page.locator(`#page-${cfg.dashboard} .dash-side.on`).count() === 1;
  await page.evaluate(roleName => window.closeDashMenu(roleName === 'consultant' ? 'cons' : roleName), role);
  await context.close();
  return {resolvedRole, sections, mobileDrawerOpen, ...diag};
}

(async () => {
  const server = http.createServer(serve);
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  try {
    const requestedRoles=(process.env.GUIDCY_AUDIT_ROLES||'user,consultant,admin').split(',').map(value=>value.trim()).filter(role=>roleConfig[role]);
    const report = {public:process.env.GUIDCY_AUDIT_SKIP_PUBLIC==='1'?{pages:[],pageErrors:[],consoleErrors:[]}:await auditPublic(browser), roles:{}};
    for (const role of requestedRoles) report.roles[role] = await auditRole(browser, role);
    console.log(JSON.stringify(report, null, 2));
    const wrongRole = Object.entries(report.roles).find(([role, result]) => result.resolvedRole !== role);
    const emptyPage = report.public.pages.find(page => page.bodyChars < 20);
    const drawerFailure = Object.entries(report.roles).find(([, result]) => !result.mobileDrawerOpen);
    const pageErrors = [...report.public.pageErrors, ...Object.values(report.roles).flatMap(result => result.pageErrors)];
    if (wrongRole || emptyPage || drawerFailure || pageErrors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
