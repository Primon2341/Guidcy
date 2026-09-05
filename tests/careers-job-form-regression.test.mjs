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
  const ctx = vm.createContext({
    window: {},
    COMPANY: 'Guidcy Technologies Pvt. Ltd.',
    sbc: () => ({ from: () => ({ insert: () => { calls.insert++; return Promise.resolve({ error: null }); } }) }),
    hasApplied: async () => false,
    // the real one uploads a resume first, which is what widens the re-entry window
    uploadResume: () => new Promise(r => setTimeout(() => r('https://example.com/cv.pdf'), 5)),
    uid: () => 'user-1',
    clean: v => String(v == null ? '' : v).trim(),
    $: id => fields[id],
    toast: (m, t) => calls.toasts.push([m, t]),
    closeModal: () => { calls.closed++; },
    setTimeout, Object, Promise, Array, String, console
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

test('Edit stops with an error instead of rendering the blank create form', () => {
  const fn = slice('  async function openRoleForm(id){', "if(form)form.addEventListener('submit',e=>saveRole(e,j&&j.id));\n  }");
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
