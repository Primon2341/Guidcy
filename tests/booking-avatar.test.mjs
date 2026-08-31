import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

/* Run just the bkAvatar IIFE against a stub window so the branch logic is exercised
   for real, not merely grepped for. */
function loadHelper(consultants){
  const start = source.indexOf('  if(window.bkAvatar)return;');
  assert.ok(start > 0, 'bkAvatar helper not found');
  const open = source.lastIndexOf('(function(){', start);
  const close = source.indexOf('})();', start);
  const ctx = vm.createContext({
    setTimeout(){ return 0 },
    document: { querySelectorAll: () => [] },
    window: { mkInitials: n => (n||'').split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2) },
  });
  ctx.window.window = ctx.window;
  ctx.__seed = consultants || {};
  vm.runInContext('window.consultantsById = new Map(Object.entries(__seed));', ctx);
  vm.runInContext(source.slice(open, close + 5), ctx);
  return ctx.window.bkAvatar;
}

test('booking cards render the profile photo when the consultant has one', () => {
  const bkAvatar = loadHelper({ 'c-1': { id:'c-1', avatar_url:'https://cdn.test/a.jpg' } });
  const html = bkAvatar('Asha Rao', 'c-1', 'background:var(--surface2)');
  assert.match(html, /^<img class="bk-av" src="https:\/\/cdn\.test\/a\.jpg"/);
  // Initials stay reachable as the onerror fallback, so a broken URL never leaves a blank circle.
  assert.match(html, /onerror="this\.outerHTML=this\.dataset\.fb"/);
  assert.match(html, /data-fb="[^"]*AR/);
});

test('booking cards fall back to initials when no photo is known', () => {
  const bkAvatar = loadHelper({ 'c-1': { id:'c-1', avatar_url:'' } });
  const html = bkAvatar('Asha Rao', 'c-1', 'background:var(--surface2)');
  assert.match(html, /^<div class="bk-av" style="background:var\(--surface2\)"/);
  assert.match(html, />AR<\/div>$/);
  // Tagged so the batched lookup can swap a photo in without a re-render.
  assert.match(html, /data-bkav="consultants:c-1"/);
});

test('client-side cards look photos up in profiles, and names are escaped', () => {
  const bkAvatar = loadHelper({});
  const html = bkAvatar('<b>x</b> Roy', 'u-9', 'background:var(--surface2)', 'profiles');
  assert.match(html, /data-bkav="profiles:u-9"/);
  assert.doesNotMatch(html, /<b>/);
});

test('every booking card renders through the shared helper', () => {
  // No card may go back to a hardcoded initials-only circle.
  assert.equal((source.match(/class="bk-av"/g) || []).length, 4); // helper img + helper fallback + saved-consultants photo/initials
  assert.ok((source.match(/bkAvatar\(/g) || []).length >= 8);
});
