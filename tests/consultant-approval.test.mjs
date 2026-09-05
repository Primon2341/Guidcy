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

/* "Hide until the profile is updated" is a third state, distinct from suspended:
   it restores itself when the consultant saves. Its whole safety rests on the
   profile_update_required flag - if a write forgets it, either the consultant is
   stranded invisible, or a suspended account quietly reappears. */
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not locate ${from} .. ${to}`);
  return src.slice(a, b + to.length);
};

test('hiding removes the consultant from both public gates but not from their own dashboard', () => {
  const hide = slice('async function guidcyHideConsultantUntilUpdate(consId,idx){', "toast('Consultant hidden until they update their profile','green');");
  // both gates the public queries read
  assert.match(hide, /is_active:false/);
  assert.match(hide, /is_approved:false/);
  assert.match(hide, /profile_update_required:true/);
  // the dashboard gate is `approval_status==='pending' || (is_approved===false && approval_status!=='approved')`,
  // so approval_status must stay 'approved' or the consultant loses the editor they need
  assert.doesNotMatch(hide, /approval_status:\s*'(pending|rejected|hidden|suspended)'/,
    'changing approval_status would replace their dashboard with an "under review" notice');
});

test('the automatic restore only ever un-hides rows this feature hid', () => {
  const restore = slice('        var vis=await c.from(\'consultants\').select(\'profile_update_required', 'profile_hidden_at:null}).eq(\'id\',resolved);');
  assert.match(restore, /visRow\.profile_update_required===true/,
    'without this guard a suspended or rejected consultant would reactivate itself by saving');
  assert.match(restore, /approval_status\|\|''\)\.toLowerCase\(\)==='approved'/,
    'and an account approval later revoked must not come back either');
  assert.match(restore, /guidcyConsultantProfileComplete/, 'a no-op save must not restore an still-empty profile');
});

test('suspend stays a separate, non-self-restoring state', () => {
  const suspend = slice('async function suspendConsultant(consId,idx){', "toast('Consultant suspended');");
  assert.doesNotMatch(suspend, /profile_update_required/,
    'a suspended consultant must never be eligible for the automatic restore');
});

test('the admin table offers hide only where it makes sense', () => {
  const rows = slice('      const pendingUpdate=awaitingUpdate(c);', 'guidcyUnhideConsultant');
  assert.match(rows, /pendingUpdate\?/, 'a hidden row shows Unhide, not Suspend/Hide');
  assert.match(src, /guidcyHideConsultantUntilUpdate\('\$\{c\.id\|\|''\}',\$\{i\}\)/,
    'the hide button is wired to the row it belongs to');
  assert.match(src, /const isActive=c\.is_active&&!pendingUpdate/,
    'a hidden row must not also read as Active');
});

test('profile completeness is satisfiable from the fields every settings form renders', () => {
  const fn = slice('function guidcyConsultantProfileComplete(c){', '\n}');
  for (const field of ['name', 'specialty', 'bio']) assert.match(fn, new RegExp('c\\.' + field));
  // education/college/current_work are not on every settings form variant - requiring
  // them would leave the consultant permanently unable to restore themselves
  for (const field of ['highest_education', 'college', 'current_work'])
    assert.doesNotMatch(fn, new RegExp('c\\.' + field), `${field} is not always rendered; requiring it strands the consultant`);
});
