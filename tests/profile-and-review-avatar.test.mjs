import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

function extract(signature){
  const start = source.indexOf(signature);
  assert.ok(start > 0, signature + ' not found in app.js');
  const end = source.indexOf('\n', source.indexOf('}', start)) ;
  return source.slice(start, source.indexOf('\n', start));
}

/* The dashboard header reads window.currentProfile, but currentProfile is a
   top-level `let` and so is NOT the same binding. Saving a new name only
   updated the lexical one, leaving the header stale until a page reload. */
test('setCurrentProfile mirrors onto window so the dashboard header updates', () => {
  const fn = extract('function setCurrentProfile(p){');
  const ctx = vm.createContext({ window: {} });
  vm.runInContext('let currentProfile=null;\n' + fn.trim(), ctx);
  vm.runInContext('setCurrentProfile({full_name:"New Name"})', ctx);
  assert.equal(ctx.window.currentProfile.full_name, 'New Name');
  assert.equal(vm.runInContext('currentProfile.full_name', ctx), 'New Name');
});

test('review cards prefer the reviewer photo and fall back to initials', () => {
  const start = source.indexOf('function guidcyReviewAvatar(');
  assert.ok(start > 0, 'guidcyReviewAvatar not found');
  const ctx = vm.createContext({
    mkInitials: n => String(n).slice(0, 2).toUpperCase(),
  });
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
  const render = vm.runInContext('guidcyReviewAvatar', ctx);

  const withPhoto = render({ reviewer_name: 'Asha Rao', reviewer_avatar: 'https://x/a.png' }, 'test-av', '');
  assert.match(withPhoto, /background:url\('https:\/\/x\/a\.png'\)/);
  assert.ok(!withPhoto.includes('AS'), 'initials should not render when a photo exists');

  const quotedPhoto = render({ reviewer_name: 'Asha Rao', reviewer_avatar: "https://x/a'b.png" }, 'test-av', '');
  assert.match(quotedPhoto, /a%27b\.png/);

  const noPhoto = render({ reviewer_name: 'Asha Rao', reviewer_avatar: '' }, 'test-av', '');
  assert.ok(noPhoto.includes('AS'), 'initials are the fallback');
  assert.ok(!noPhoto.includes('background:url'));
});

test('the homepage review card no longer hardcodes initials', () => {
  assert.ok(!source.includes(`<div class="test-av" style="background:var(--blue-l);color:var(--blue)">\${mkInitials(`),
    'homepage review card still renders initials unconditionally');
});
