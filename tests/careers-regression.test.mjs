import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const productionFiles=['index.html','assets/js/app.js','assets/js/core.js','assets/css/patches.css','build-static.js'];

test('former open work marketplace code and routes are removed',()=>{
  const source=productionFiles.map(file=>read(file)).join('\n');
  const obsolete=[
    /Find Work/i,/\/find-work/i,/guidcyWork/i,/page-work/i,/\bgw-[a-z]/i,
    /work-marketplace/i,/work-applications/i,/posted-work/i,/Loading work opportunities/i
  ];
  obsolete.forEach(pattern=>assert.doesNotMatch(source,pattern));
});

test('Career is footer-only and routes to the Careers page',()=>{
  const html=read('index.html');
  const nav=(html.match(/<div class="nav-links"[\s\S]*?<\/div>/)||[''])[0];
  const platform=(html.match(/<div class="footer-col"><h4>Platform<\/h4>[\s\S]*?<\/div>/)||[''])[0];
  const company=(html.match(/<div class="footer-col"><h4>Company<\/h4>[\s\S]*?<\/div>/)||[''])[0];
  assert.doesNotMatch(nav,/>Careers?</i);
  assert.doesNotMatch(platform,/>Career<\/a>/);
  assert.match(company,/<a href="\/careers"[^>]*>Career<\/a>/);
  assert.match(read('build-static.js'),/["']\/careers["']\s*:/);
  assert.doesNotMatch(read('build-static.js'),/["']\/(?:find-work|guidcy-work|work)["']\s*:/);
});

test('background authentication events never issue dashboard navigation',()=>{
  const app=read('assets/js/app.js');
  const authBlock=(app.match(/sb\.auth\.onAuthStateChange\(async\(event,session\)=>\{[\s\S]*?\n\s*\}\);/)||[''])[0];
  assert.doesNotMatch(authBlock,/go\(role===['"]consultant['"]\?['"]cons-dash/);
  assert.doesNotMatch(app,/onAuthStateChange\(\(ev,session\)=>\{if\(session\?\.user && ev===['"]SIGNED_IN['"]\) setTimeout\(\(\)=>window\.guidcyRestorePendingAction/);
  assert.doesNotMatch(app,/onAuthStateChange\?\.\(function\(\)\{setTimeout\(restorePending/);
});

test('SPA progress completion and centralized popup scroll locking are installed',()=>{
  const app=read('assets/js/app.js');
  const css=read('assets/css/patches.css');
  assert.match(app,/if\(internal\)done\(520\)/);
  assert.match(app,/guidcyHideNavigationLoading\?\.\(80\)/);
  assert.match(app,/__GUIDCY_GLOBAL_POPUP_SCROLL_LOCK__/);
  assert.match(app,/window\.scrollTo\(\{top:savedY,left:0,behavior:'auto'\}\)/);
  assert.match(css,/body\.guidcy-popup-scroll-locked[\s\S]*?position:fixed!important/);
  assert.match(css,/\.gcareer-dialog[\s\S]*?-webkit-overflow-scrolling:touch/);
});

test('Careers queries only approved admin posts and enforces the Guidcy payload',()=>{
  const app=read('assets/js/app.js');
  assert.match(app,/from\('job_posts'\)\.select\('\*'\)\.eq\('status','approved'\)\.eq\('posted_by_role','admin'\)/);
  assert.match(app,/posted_by_role:'admin'/);
  assert.match(app,/company_name:'Guidcy Technologies Pvt\. Ltd\.'/);
  assert.match(app,/status:'approved'/);
  assert.match(app,/if\(!isAdmin\(\)\).*Only Guidcy admin can post career openings/s);
});

test('Careers uses optimized original imagery while preserving the job card layout',()=>{
  const app=read('assets/js/app.js');
  const assets=['assets/images/careers-team-guidcy.jpg','assets/images/careers-collaboration-guidcy.jpg'];
  assets.forEach(file=>{
    const stat=fs.statSync(path.join(root,file));
    assert.ok(stat.size>100000,`${file} must contain a real optimized photograph`);
    assert.ok(stat.size<300000,`${file} must stay below the mobile performance budget`);
    assert.match(app,new RegExp(file.replace('assets/','\\/assets\\/')));
  });
  assert.match(app,/<article class="gcareer-card"><div class="gcareer-card-head">[\s\S]*?<p class="gcareer-summary">[\s\S]*?<div class="gcareer-tags">[\s\S]*?<div class="gcareer-card-foot">/);
});

test('database policy uses immutable admin claims and restricts inserts',()=>{
  const sql=read('supabase/migrations/20260822162826_careers_admin_only.sql');
  assert.match(sql,/alter table public\.job_posts enable row level security/i);
  assert.match(sql,/as restrictive\s+for insert/i);
  assert.match(sql,/auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'/i);
  assert.doesNotMatch(sql,/user_metadata/i);
  assert.match(sql,/posted_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql,/posted_by_role\s*=\s*'admin'/i);
  assert.match(sql,/lower\(company_name\)/i);
});

test('Find Work database cleanup preserves Careers and Find Jobs tables',()=>{
  const sql=read('supabase/migrations/20260822171617_remove_obsolete_find_work_tables.sql');
  assert.match(sql,/drop table if exists public\.job_reports/i);
  assert.match(sql,/drop table if exists public\.job_categories/i);
  assert.doesNotMatch(sql,/drop table[^;]*public\.job_posts/i);
  assert.doesNotMatch(sql,/drop table[^;]*public\.job_applications/i);
  assert.doesNotMatch(sql,/drop table[^;]*public\.job_saves/i);
});
