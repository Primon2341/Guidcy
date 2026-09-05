/* Regression: posting or editing a Careers opening could take the whole site down.
   1. The modal pins <body> with position:fixed; navigating away (or pressing Back)
      left it pinned with the form floating over the next page - nothing scrolled.
   2. Clicking Edit when the row could not be loaded fell through to the blank
      "Post a new opening" form, so saving inserted a duplicate instead of updating.
   3. Disabling the submit button only blocks pointer clicks; implicit submission
      (Enter / the mobile keyboard Go key) re-entered the handler and inserted the
      same opening several times. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not locate ${from} .. ${to}`);
  return src.slice(a, b + to.length);
};

const FIELDS = ['gc-r-flags', 'gc-r-title', 'gc-r-dept', 'gc-r-loc', 'gc-r-type', 'gc-r-exp',
  'gc-r-openings', 'gc-r-deadline', 'gc-r-min', 'gc-r-max', 'gc-r-desc', 'gc-r-resp',
  'gc-r-skills', 'gc-r-question', 'gc-r-status'];

function harness(overrides = {}) {
  const calls = { insert: 0, update: 0, closed: 0, toasts: [] };
  const fields = Object.fromEntries(FIELDS.map(id => [id, { value: '' }]));
  fields['gc-r-title'].value = 'Frontend Engineer';
  fields['gc-r-desc'].value = 'Build things.';
  fields['gc-r-status'].value = 'approved';
  const btn = { disabled: false, textContent: 'Publish opening' };
  const table = {
    insert: () => { calls.insert++; return Promise.resolve({ error: overrides.error || null }); },
    update: () => ({ eq: () => { calls.update++; return Promise.resolve({ error: overrides.error || null }); } })
  };
  const ctx = vm.createContext({
    cache: [],
    COMPANY: 'Guidcy Technologies Pvt. Ltd.',
    isAdmin: () => true,
    sbc: () => ({ from: () => table }),
    uid: () => 'admin-1',
    clean: v => String(v == null ? '' : v).trim(),
    $: id => fields[id],
    toast: (m, t) => calls.toasts.push([m, t]),
    closeModal: () => { calls.closed++; },
    render: () => {},
    Date, Number, Object, Promise, console
  });
  vm.runInContext(slice('  let saving=false;\n  async function saveRole(',
    '}finally{saving=false;if(btn){btn.disabled=false;btn.textContent=label}}\n  }'), ctx);
  const submit = id => ctx.saveRole({ preventDefault() {}, target: { querySelector: () => btn } }, id);
  return { calls, submit, btn, fields };
}

test('one form cannot insert the same opening twice, however the submit is re-fired', async () => {
  const h = harness();
  await Promise.all([h.submit(null), h.submit(null), h.submit(null), h.submit(null)]);
  assert.equal(h.calls.insert, 1, 'repeated submits must reach the database once');
  assert.equal(h.calls.closed, 1);
  // the guard releases, so a later deliberate save still works
  await h.submit(null);
  assert.equal(h.calls.insert, 2);
});

test('editing updates the existing row and never falls back to an insert', async () => {
  const h = harness();
  await Promise.all([h.submit('job-1'), h.submit('job-1')]);
  assert.equal(h.calls.update, 1);
  assert.equal(h.calls.insert, 0);
});

test('a failed save keeps the form open with the typed values and restores the button', async () => {
  const h = harness({ error: { message: 'network down' } });
  h.fields['gc-r-title'].value = 'Keep My Text';
  await h.submit(null);
  assert.equal(h.calls.closed, 0, 'the modal must stay open so nothing typed is lost');
  assert.equal(h.fields['gc-r-title'].value, 'Keep My Text');
  assert.equal(h.btn.disabled, false);
  assert.equal(h.btn.textContent, 'Publish opening');
  assert.match(h.calls.toasts.at(-1)[0], /could not save/i);
});

test('one apply form cannot file the same application twice', async () => {
  const calls = { insert: 0, closed: 0, toasts: [] };
  const fields = Object.fromEntries(['gc-a-name', 'gc-a-email', 'gc-a-phone', 'gc-a-portfolio',
    'gc-a-linkedin', 'gc-a-note', 'gc-a-answer', 'gc-a-start'].map(id => [id, { value: '' }]));
  fields['gc-a-name'].value = 'Ada';
  fields['gc-a-email'].value = 'ada@example.com';
  const btn = { disabled: false, textContent: 'Submit application' };
  // select(...).eq(...).eq(...).limit(...) is the "have they applied before?" probe
  const table = {
    select: () => table, eq: () => table,
    limit: () => Promise.resolve({ data: [], error: null }),
    insert: () => { calls.insert++; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'app-new' }, error: null }) }) }; },
    update: () => ({ eq: () => { calls.update = (calls.update || 0) + 1; return Promise.resolve({ error: null }); } })
  };
  const ctx = vm.createContext({
    window: {},
    COMPANY: 'Guidcy Technologies Pvt. Ltd.',
    sbc: () => ({ from: () => table }),
    authId: async () => 'user-1',
    hasApplied: async () => false,
    // the real one uploads a resume first, which is what widens the re-entry window
    uploadResume: () => new Promise(r => setTimeout(() => r({ url: 'https://example.com/cv.pdf', failed: false }), 5)),
    uid: () => 'user-1',
    clean: v => String(v == null ? '' : v).trim(),
    $: id => fields[id],
    toast: (m, t) => calls.toasts.push([m, t]),
    closeModal: () => { calls.closed++; },
    Date, setTimeout, Object, Promise, Array, String, console
  });
  vm.runInContext(slice('  let applying=false;\n  async function submitApplication(',
    "}finally{applying=false;if(btn){btn.disabled=false;btn.textContent='Submit application'}}\n  }"), ctx);
  const ev = { preventDefault() {}, target: { querySelector: () => btn } };
  const role = { id: 'job-1', title: 'Frontend Engineer' };
  await Promise.all([0, 1, 2, 3].map(() => ctx.submitApplication(ev, role)));
  assert.equal(calls.insert, 1, 'repeated submits must file one application');
  assert.equal(calls.closed, 1);
  assert.equal(btn.disabled, false);
});

function applyHarness(o = {}) {
  const calls = { insert: 0, update: 0, closed: 0, toasts: [] };
  const fields = Object.fromEntries(['gc-a-name', 'gc-a-email', 'gc-a-phone', 'gc-a-portfolio',
    'gc-a-linkedin', 'gc-a-note', 'gc-a-answer', 'gc-a-start'].map(id => [id, { value: '' }]));
  fields['gc-a-name'].value = 'Ada';
  fields['gc-a-email'].value = 'ada@example.com';
  fields['gc-a-note'].value = 'Why I am a good fit';
  const btn = { disabled: false, textContent: 'Submit application' };
  const table = {
    select: () => table, eq: () => table,
    limit: () => Promise.resolve({ data: o.priorRow ? [{ id: 'app-1' }] : [], error: null }),
    insert: () => { calls.insert++; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'app-new' }, error: null }) }) }; },
    update: () => ({ eq: () => { calls.update++; return Promise.resolve({ error: null }); } })
  };
  const ctx = vm.createContext({
    window: {}, COMPANY: 'Guidcy',
    sbc: () => ({ from: () => table }),
    authId: async () => ('authId' in o ? o.authId : 'user-1'),
    hasApplied: async () => false,
    uploadResume: async () => ({ url: '', failed: false }),
    uid: () => 'stale-page-state',
    clean: v => String(v == null ? '' : v).trim(),
    $: id => fields[id],
    toast: (m, t) => calls.toasts.push([m, t]),
    closeModal: () => { calls.closed++; },
    cache: [], render: () => { calls.rendered = (calls.rendered || 0) + 1; },
    Date, setTimeout, Object, Promise, Array, String, console
  });
  vm.runInContext(slice('  let applying=false;\n  async function submitApplication(',
    "}finally{applying=false;if(btn){btn.disabled=false;btn.textContent='Submit application'}}\n  }"), ctx);
  const run = () => ctx.submitApplication({ preventDefault() {}, target: { querySelector: () => btn } },
    { id: 'job-1', title: 'Frontend Engineer' });
  return { calls, run, fields, btn };
}

test('a filed application is confirmed without waiting on the notification email', async () => {
  // the row is already saved; awaiting a serverless email left the candidate on a
  // disabled "Submitting..." button long after the application had gone through
  let emailSettled = false;
  const h = applyHarness();
  h.sendWorkEmail = () => new Promise(() => {});
  const fn = slice('  let applying=false;\n  async function submitApplication(', 'company_name:COMPANY})))');
  assert.doesNotMatch(fn, /await\s+window\.sendWorkEmail/, 'the email must not be awaited in the submit path');
  assert.match(fn, /Promise\.resolve\(window\.sendWorkEmail\(/, 'it is fired and left to finish in the background');
  assert.equal(emailSettled, false);
});

test('an application is filed against the session id, never a null from stale page state', async () => {
  // RLS is `applicant_id = auth.uid()`; a null id is rejected and the application is lost
  const h = applyHarness({ authId: null });
  await h.run();
  assert.equal(h.calls.insert, 0, 'nothing may be sent without a real auth id');
  assert.equal(h.calls.closed, 0, 'the form stays open so the answers are not lost');
  assert.equal(h.fields['gc-a-note'].value, 'Why I am a good fit');
  assert.match(h.calls.toasts.at(-1)[0], /log in again/i);
});

test('re-applying after a withdrawal revives the existing row instead of inserting a duplicate', async () => {
  // uq_job_applications_job_applicant is not status-aware, so the withdrawn row
  // still owns (job_id, applicant_id) and a plain insert would fail as a duplicate
  const h = applyHarness({ priorRow: true });
  await h.run();
  assert.equal(h.calls.update, 1);
  assert.equal(h.calls.insert, 0);
  assert.equal(h.calls.closed, 1);
});

test('a candidate can withdraw, and the admin list can show a withdrawn application', () => {
  const fn = slice('  async function withdrawApplication(jobId,appId){', "finally{withdrawing=false}\n  }");
  assert.match(fn, /appId\?\{id:appId\}/, 'withdraw must use the id carried on the button, not a map that a re-render can empty');
  assert.match(fn, /status:'withdrawn'/, 'withdraw must set the status the schema already allows');
  assert.match(fn, /if\(withdrawing\)return/, 'withdraw needs the same re-entrancy guard');
  assert.match(src, /if\(withdrawn\(a\)\)/,
    "a withdrawn row must not render as an editable 'applied' control");
  assert.doesNotMatch(src, /opts\(\[[^\]]*'withdrawn'\]/,
    'the admin must not be able to withdraw on the candidate\u2019s behalf');
  assert.match(src, /data-gc="withdraw"/, 'the card needs a withdraw affordance');
});

test('the applicant status control names the hire state, reverts on failure, and mails only decisions', () => {
  const handler = slice("      document.querySelectorAll('.gc-app-status').forEach(sel=>{", '      });\n    }catch(e){');
  assert.match(handler, /btn\.addEventListener\('click'/, 'the write happens on the Update button, not on select');
  assert.doesNotMatch(handler, /sel\.addEventListener\('change',async/, 'picking a value must not write');
  assert.match(handler, /norm\(now\.data\.status\)==='withdrawn'/,
    'a withdrawal after the table was drawn must beat the admin decision');
  // 'selected' is the terminal state the CHECK constraint allows; say so in the UI
  assert.match(src, /selected:'Selected \/ Hired'/);
  assert.match(src, /data-prev="'\+esc\(cur\)\+'"/,
    'the control must remember what it showed so a failed write can be undone');
  assert.match(handler, /if\(prev\)sel\.value=prev/, 'a failed write must not leave the new value on screen');
  assert.match(handler, /const emailType=STATUS_EMAIL\[status\]/,
    'the template is chosen per status, not one generic status-changed event');
  assert.doesNotMatch(handler, /await\s+window\.sendWorkEmail/, 'the decision email must not block the admin');
  // the email must be sent inside the success branch, never after a failed write
  assert.ok(handler.indexOf('if(r.error)throw r.error') < handler.indexOf('sendWorkEmail'));
});

test('an uploaded resume is stored as a private path, surfaced to the admin, and never lost silently', () => {
  const upload = slice('  async function uploadResume(applicantId){', "return {url:link,failed:true}}\n  }");
  assert.doesNotMatch(upload, /getPublicUrl/, 'the bucket is private; a public URL would be a dead link');
  assert.match(upload, /return \{url:path,failed:false\}/, 'store the storage path');
  assert.match(upload, /\(applicantId\|\|uid\(\)\|\|'guest'\)/,
    'the folder must be the session id so the storage policy can match auth.uid()');

  // a failed upload with nothing to fall back on must stop, not file a resume-less application
  const submit = slice('      const resume=await uploadResume(applicantId);', 'return;\n      }');
  assert.match(submit, /resume\.failed&&!resume\.url/);
  assert.match(submit, /could not attach your resume/i);

  // admin side: paths get signed, links pass through, failures say so
  const cell = slice('  function resumeCell(a,signed){', "Unavailable</span>';\n  }");
  assert.match(cell, /\^https\?:/, 'a candidate-supplied link is used as-is');
  assert.match(cell, /signed\|\|\{\}\)\[raw\]/, 'a stored path is resolved through the signed-url map');
  assert.match(cell, /Unavailable/, 'a resume that cannot be signed must not render as a broken link');
  assert.match(src, /createSignedUrls\(paths,1800\)/, 'signed in one batch, short lived');
});

test('each application outcome sends its own email, not the submitted template', () => {
  const api = fs.readFileSync(new URL('../api/send-guidcy-email.js', import.meta.url), 'utf8');

  // the candidate hears from us exactly three times
  assert.match(src, /STATUS_EMAIL=\{shortlisted:'job_application_shortlisted_user',rejected:'job_application_rejected_user'\}/);
  assert.match(src, /sendWorkEmail\('application_submitted'/, 'and once when the application is filed');

  // regression: 'application_status_updated' resolves to the SUBMITTED template, so a
  // rejection used to arrive telling the candidate their application had been submitted
  const handler = slice("      document.querySelectorAll('.gc-app-status').forEach(sel=>{", '      });\n    }catch(e){');
  assert.doesNotMatch(handler, /sendWorkEmail\(\s*['"]application_status_updated/,
    'the careers page must never send through that alias');
  assert.match(src, /application_status_updated:'job_application_submitted_user'/,
    'the misleading alias still exists in EMAIL_TYPE_MAP - the careers page must not use it');

  // both new templates need a subject and their own body, or they fall back to a generic one
  for (const type of ['job_application_shortlisted_user', 'job_application_rejected_user']) {
    assert.ok(api.includes(type + ":"), `${type} needs a subject line`);
    assert.match(api, new RegExp(type.replace(/_user$/, '') + '/i\\.test\\(type\\)'), `${type} needs its own intro copy`);
  }
  assert.doesNotMatch(api, /job_application_shortlisted_user: 'Your job application has been submitted'/);
});

test('the once-per-email flag is scoped to the confirmation, not to the whole application', () => {
  // job_applications.confirmation_email_sent was read for EVERY type, so once the
  // candidate had the "submitted" mail, shortlisted and rejected were swallowed.
  // Both copies of the guard live in this bundle and both had the bug.
  const checks = [...src.matchAll(/if\(table===[`'"]job_applications[`'"]\)\s*return([^;]*);/g)].map(m => m[1]);
  assert.equal(checks.length, 2, 'there are two copies of this guard; both must be fixed');
  for (const c of checks) {
    assert.match(c, /submitted\|confirmation/, `guard still ignores the email type: ${c.trim()}`);
    assert.doesNotMatch(c, /^\s*!!row\.confirmation_email_sent\s*$/, 'unconditional guard is the bug');
  }
  // ...and the flag must only be written for the confirmation, or it re-arms the block
  const marks = [...src.matchAll(/table===[`'"]job_applications[`'"]\s*&&\s*\/submitted\|confirmation\//g)];
  assert.equal(marks.length, 2, 'both markers must be type-scoped too');

  // the confirmation must be flagged against the application row, not the job
  const submit = slice('      let error, appRowId=', "company_name:COMPANY}))).catch(function(){})}catch(_){}");
  assert.match(submit, /\.insert\(payload\)\.select\('id'\)\.single\(\)/, 'read the new row id back');
  assert.match(submit, /\{id:appRowId,job_title/, 'and send it, or relatedId falls back to job_id');
});

test('Enter in a single-line field cannot publish a half-filled opening', () => {
  const ctx = vm.createContext({});
  vm.runInContext(slice('  function submitOnlyOnButton(form){', '      e.preventDefault();\n    });\n  }'), ctx);
  let handler = null;
  ctx.submitOnlyOnButton({ addEventListener: (type, fn) => { if (type === 'keydown') handler = fn; } });
  assert.ok(handler, 'the guard must attach a keydown listener');

  const press = (key, target) => {
    let prevented = false;
    handler({ key, target, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  // every single-line control on the job form submits implicitly on Enter
  for (const type of ['text', 'number', 'date', 'email', 'search'])
    assert.equal(press('Enter', { tagName: 'INPUT', type }), true, `input[type=${type}]`);
  assert.equal(press('Enter', { tagName: 'SELECT' }), true, 'select');
  // ...but typing must stay usable and the form must stay submittable
  assert.equal(press('Enter', { tagName: 'TEXTAREA' }), false, 'textarea keeps newlines');
  assert.equal(press('Enter', { tagName: 'BUTTON', type: 'submit' }), false, 'keyboard users submit from the button');
  assert.equal(press('Enter', { tagName: 'INPUT', type: 'file' }), false, 'Enter still opens the file picker');
  assert.equal(press('a', { tagName: 'INPUT', type: 'text' }), false, 'ordinary typing is untouched');
});

test('both careers forms are wired to the implicit-submit guard', () => {
  const roleForm = slice('  async function openRoleForm(id){', 'submitOnlyOnButton(form);');
  assert.match(roleForm, /addEventListener\('submit',e=>saveRole/);
  const applyForm = slice('  async function applyRole(id){', 'submitOnlyOnButton(form);');
  assert.match(applyForm, /addEventListener\('submit',e=>submitApplication/);
});

test('Edit stops with an error instead of rendering the blank create form', () => {
  const fn = slice('  async function openRoleForm(id){', 'submitOnlyOnButton(form);');
  assert.match(fn, /if\(!j\)\{toast\([^)]*\);closeModal\(\);return\}/,
    'a role that will not load must abort, not fall through to roleForm(null)');
  assert.ok(fn.indexOf('openModal(') < fn.indexOf('await getRole(id)'),
    'the modal must open before the fetch so Edit shows a loading state');
});

test('leaving the careers page releases the modal and the body scroll lock', () => {
  const nav = slice('  function wrapNavigation(name){', '    window[name]=wrapped;\n  }');
  assert.ok(nav.indexOf('closeModal()') < nav.indexOf('fn.apply(this,arguments)'),
    'go()/renderPage() must close the modal before the route changes');
  assert.match(src, /popstate['"],\(\)=>\{try\{closeModal\(\)\}catch\(_\)\{\}/,
    'Back must also close the modal, or the page stays position:fixed');
});
