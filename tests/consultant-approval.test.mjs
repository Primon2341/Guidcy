import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

/* A consultant record is what the public listings read. Every listing filters
   is_active=true, so a record created live is publicly bookable the instant
   signup finishes - before any admin has seen it. The three creation sites all
   shared the same "badge:'new' ... is_active:true" signature; this fails if a
   fourth one shows up, or an old one is reverted. */
test('no consultant record is ever created already live', () => {
  const live = src.match(/badge:'new',\s*is_active:true/g) || [];
  assert.deepEqual(live, [], 'consultant inserts must start pending, not active');
  assert.equal((src.match(/badge:'pending',\s*is_active:false/g) || []).length, 3,
    'signup, the doSignup replacement, and the self-heal path all create pending records');
});

/* is_active:true alone no longer lists anyone - the public query also demands
   approval_status/is_approved - so an approve button that sets only is_active
   silently reactivates an account into invisibility. */
test('every approve action sets the fields the public query reads', () => {
  const approves = src.match(/\.update\(\{[^}]*is_active:true[^}]*\}\)/g) || [];
  assert.ok(approves.length >= 1);
  for (const a of approves) {
    assert.match(a, /is_approved:true/, `approve write missing is_approved: ${a.slice(0, 80)}`);
    assert.match(a, /approval_status:'approved'/, `approve write missing approval_status: ${a.slice(0, 80)}`);
  }
});

/* One is_active=false flag means three different things to the person reading
   the dashboard. A brand-new applicant must not be told they were deactivated. */
test('the inactive dashboard distinguishes pending, rejected and deactivated', () => {
  const gate = src.slice(src.indexOf('if(!isActive&&consRecord){'));
  const block = gate.slice(0, gate.indexOf('\n  const name='));
  assert.match(block, /apStatus==='rejected'/);
  assert.match(block, /consRecord\.is_approved===true\|\|apStatus==='approved'/);
  assert.match(block, /Complete your profile to get approved/);
  assert.match(block, /nothing is visible to clients/);
  // The pending screen has to lead somewhere; profile stays reachable while inactive.
  assert.match(block, /onclick="swCD\('profile'\)"/);
  // ...and the deactivation copy must only be reachable via the was-approved branch.
  assert.ok(block.indexOf('may have been deactivated') > block.indexOf("apStatus==='approved'"));
});
