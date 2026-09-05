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
  const hide = slice('async function guidcyApplyConsultantHide(consId,idx,fields,note){', "toast('Hidden until they update: '+label,'green');");
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
  const restore = slice("        var vis=await c.from('consultants').select('*').eq('id',resolved).maybeSingle();", 'profile_hidden_snapshot:{}}).eq(\'id\',resolved);');
  assert.match(restore, /visRow\.profile_update_required===true/,
    'without this guard a suspended or rejected consultant would reactivate itself by saving');
  assert.match(restore, /approval_status\|\|''\)\.toLowerCase\(\)==='approved'/,
    'and an account approval later revoked must not come back either');
  assert.match(restore, /guidcyProfileRequirementsMet\(visRow,visRow\.profile_update_fields,visRow\.profile_hidden_snapshot\)/,
    'the restore must judge the fields the admin named, against the snapshot');
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

/* Hiding is only useful if the consultant finds out, and the in-app note reaches
   them only if they happen to log in and open the bell. */
test('a hidden consultant is told three ways: banner, notification and email', () => {
  const hide = slice('async function guidcyApplyConsultantHide(consId,idx,fields,note){', "toast('Hidden until they update: '+label,'green');");
  assert.match(hide, /from\('notifications'\)\.insert/, 'in-app notification');
  assert.match(hide, /type:'consultant_profile_update_required'/, 'email to the consultant');
  assert.match(hide, /sendGuidcyEmail/);
  // the banner module renders while the flag is set and removes itself when it clears
  const banner = slice('/* === guidcy-consultant-profile-hidden-banner === */', 'guidcy-cons-hidden-banner');
  assert.ok(banner.length > 0);
  assert.match(src, /Your profile is hidden from the website/);
  assert.match(src, /profile_update_required===true/);
});

test('the admin is told when a consultant restores themselves', () => {
  const restore = slice("        var vis=await c.from('consultants').select('*').eq('id',resolved).maybeSingle();", "action_text:'Open Manage Consultants'");
  assert.match(restore, /type:'consultant_profile_restored_admin'/);
  assert.match(restore, /recipientRole:'admin'/, 'the address resolves server-side, so this does not depend on notifications RLS');
});

/* Both new types must survive the "is this email essential" gates, or they are
   dropped before the transport with reason non_essential_email. */
test('the new consultant-profile emails pass the suppression gates', () => {
  const gates = src.match(/consultant\.\*approv[^/]*\//g) || [];
  assert.ok(gates.length >= 2, 'both copies of the importance filter exist');
  for (const g of gates) assert.match(g, /consultant_profile/, `gate would suppress the new emails: ${g.slice(0, 60)}`);
});

/* Same two-sender trap as the careers templates: the Edge Function is what sends. */
test('both senders carry the consultant-profile templates with identical subjects', () => {
  const api = readFileSync(new URL('../api/send-guidcy-email.js', import.meta.url), 'utf8');
  const edge = readFileSync(new URL('../supabase/functions/send-guidcy-email/index.ts', import.meta.url), 'utf8');
  for (const type of ['consultant_profile_update_required', 'consultant_profile_restored_admin']) {
    assert.ok(edge.includes(type + ':'), `${type} missing from the Edge Function - the one that actually sends`);
    assert.ok(api.includes(type + ':'), `${type} missing from the Vercel fallback`);
    assert.equal(
      (api.match(new RegExp(type + ": ('[^']*')"))||[])[1].replace(/'/g, '"'),
      (edge.match(new RegExp(type + ': ("[^"]*")'))||[])[1],
      `${type} subject differs between senders`);
    for (const f of [api, edge]) assert.match(f, new RegExp(type + '/i\\.test\\(type\\)'), `${type} needs its own body`);
  }
});

/* The reason this exists: pressing Save with nothing edited used to restore the
   profile, because the check only asked whether the fields were non-empty. */
test('a save that changes nothing cannot restore the profile', () => {
  const ctx = {};
  const fn = slice('function guidcyProfileRequirementsMet(row,fields,snapshot){', '\n  return true;\n}');
  const met = new Function('guidcyConsultantProfileComplete', fn + '; return guidcyProfileRequirementsMet;')(() => true);

  const snapshot = { bio: 'One line.', specialty: 'Coach' };
  const required = ['bio', 'specialty'];

  // saved without editing anything -> still hidden
  assert.equal(met({ bio: 'One line.', specialty: 'Coach' }, required, snapshot), false);
  // only one of the two changed -> still hidden
  assert.equal(met({ bio: 'A much longer bio about my work.', specialty: 'Coach' }, required, snapshot), false);
  // whitespace-only edit does not count
  assert.equal(met({ bio: '  One line. ', specialty: 'Career Coach' }, required, snapshot), false);
  // emptying a required field does not count either
  assert.equal(met({ bio: '', specialty: 'Career Coach' }, required, snapshot), false);
  // both genuinely changed -> restored
  assert.equal(met({ bio: 'A much longer bio about my work.', specialty: 'Career Coach' }, required, snapshot), true);
});

test('the admin must name at least one required change before hiding', () => {
  const picker = slice('async function guidcyHideConsultantUntilUpdate(consId,idx){', 'guidcyApplyConsultantHide(consId,idx,fields,String(note).trim());');
  assert.match(picker, /if\(!fields\.length\)/, 'hiding with no requirement would be unsatisfiable');
  assert.match(picker, /gc-hide-field:checked/);
  assert.match(picker, /guidcy-hide-note/, 'the admin can add a message explaining what is wrong');
});

test('hiding snapshots exactly the fields it demands', () => {
  const apply = slice('async function guidcyApplyConsultantHide(consId,idx,fields,note){', "toast('Hidden until they update: '+label,'green');");
  assert.match(apply, /fields\.forEach\(function\(f\)\{snapshot\[f\]=/);
  assert.match(apply, /profile_update_fields:fields/);
  assert.match(apply, /profile_hidden_snapshot:snapshot/);
  assert.match(apply, /required_changes:label/, 'the email says what to change');
});

test('restoring by either route clears the requirement', () => {
  for (const marker of ["profile_update_fields:\\[\\],profile_update_note:null,profile_hidden_snapshot:\\{\\}",
                        "profile_update_fields:\\[\\], profile_update_note:null, profile_hidden_snapshot:\\{\\}"]) {
    assert.match(src, new RegExp(marker), 'a stale requirement would re-hide on the next save');
  }
});
