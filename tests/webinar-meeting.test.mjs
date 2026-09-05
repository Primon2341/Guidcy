/* Publishing a webinar books its meeting on the same calendar a 1:1 booking
   uses, and the link is not public. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require_ = createRequire(import.meta.url);
const { toInstants, toSlot, durationMinutes } = require_('../lib/webinar-meeting.js');
const meeting = fs.readFileSync(new URL('../lib/webinar-meeting.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/create-meet-link.js', import.meta.url), 'utf8');
const emails = fs.readFileSync(new URL('../lib/webinar-emails.js', import.meta.url), 'utf8');
const gmeet = fs.readFileSync(new URL('../lib/google-meet.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260905190000_webinar_meetings.sql', import.meta.url), 'utf8');

test('a webinar slot becomes the exact instant, not a guess from today', () => {
  // 23:49 IST is 18:19 UTC the same day
  assert.equal(toInstants('2026-09-10', '23:49', 60).startISO, '2026-09-10T18:19:00.000Z');
  assert.equal(toInstants('2026-09-10', '23:49', 60).endISO, '2026-09-10T19:19:00.000Z');
  // past midnight IST rolls back a day in UTC
  assert.equal(toInstants('2028-01-01', '00:30', 90).startISO, '2027-12-31T19:00:00.000Z');
  // the year is honoured - parseSlot's label heuristic infers it from today and
  // would put a 2028 webinar in the wrong year
  assert.match(toInstants('2028-03-04', '10:00', 60).startISO, /^2028-03-04/);
  assert.equal(toInstants('', '10:00', 60), null);
  assert.equal(toInstants('2026-09-10', '', 60), null);
  // duration falls back to an hour rather than producing a zero-length event
  assert.equal(durationMinutes({ duration: '90 minutes' }), 90);
  assert.equal(durationMinutes({ duration: '' }), 60);
  assert.equal(durationMinutes({}), 60);
  // 12-hour conversion for the human-readable label
  assert.equal(toSlot('2026-09-10', '00:30').timeSlot, '12:30 AM');
  assert.equal(toSlot('2026-09-10', '12:05').timeSlot, '12:05 PM');
  assert.equal(toSlot('2026-09-10', '09:05').timeSlot, '9:05 AM');
});

test('a second publish or an edit never creates a second meeting', () => {
  // an existing row short-circuits creation; only a changed instant touches Google
  assert.match(meeting, /if \(existing && isMeetLink\(existing\.meet_link\)\)/);
  assert.match(meeting, /if \(wanted && \(!sameStart \|\| new Date\(wanted\.startISO\)\.getTime\(\) !== sameStart\)\)/,
    'an unchanged date must not re-issue the event');
  assert.match(meeting, /updateMeetEvent\(/, 'a moved webinar updates the event rather than making a new one');
  assert.match(meeting, /on_conflict=webinar_id/, 'one row per webinar');
  assert.match(meeting, /resolution=merge-duplicates/);
});

test('only the host or an admin can generate a webinar meeting', () => {
  assert.match(api, /if \(!isHost && !isAdmin\) return json\(res, 403/);
  assert.match(api, /webinars\?id=eq\./);
  assert.match(api, /ensureWebinarMeeting\(webinar\)/);
});

test('the generated link is not public', () => {
  // webinars has a SELECT policy of `true`, so the link cannot live there
  assert.doesNotMatch(meeting, /meet_link['"]?\s*:\s*.*\bwebinars\b/, 'the link must not be written to the public webinars row');
  assert.match(migration, /alter table public\.webinar_meetings enable row level security/);
  assert.match(migration, /Confirmed registrant reads webinar meeting/);
  assert.match(migration, /Host and admin read webinar meeting/);
  // no write policy is granted, so only the service role can create a meeting
  assert.doesNotMatch(migration, /for (insert|update|delete)/i);
});

test('a registration puts the person on the invite and carries the link', () => {
  assert.match(emails, /addMeetAttendees\(\{[\s\S]*?eventId: meeting\.event_id,[\s\S]*?emails: \[clean\(row\.email, 160\)\],/);
  assert.match(emails, /meet_link: meetLink/);
  assert.match(emails, /join_link: meetLink/, 'the email template renders Join link from join_link');
  // a calendar hiccup must not cost them the confirmation email
  assert.match(emails, /Webinar calendar invite skipped/);
});

test('adding a guest keeps the ones already invited', () => {
  const fn = gmeet.slice(gmeet.indexOf('async function addMeetAttendees'), gmeet.indexOf('module.exports'));
  assert.match(fn, /const existing = Array\.isArray\(event\.attendees\)/,
    'Calendar replaces the attendee list wholesale, so it must be read first');
  assert.match(fn, /if \(!added\.length\) return \{ ok: true, alreadyInvited: true/,
    're-confirming a registration must not re-notify everyone');
  assert.match(fn, /const send = notify === false \? 'none' : 'all';/,
    'Calendar notifies all guests or none, so a webinar must be able to opt out');
});

/* The bug this guards: window.wbnPublish is assigned in a dozen places across
   app.js, and several of those replace it outright instead of wrapping. A
   meeting call added to any but the LAST assignment in load order is dead code
   - which is exactly what happened, and why a published webinar got no link. */
test('the publish that actually runs is the one that books the meeting', () => {
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const order = [...index.matchAll(/src="\/(assets\/js\/[\w.-]+\.js)"/g)].map(m => m[1]);
  assert.ok(order.indexOf('assets/js/webinar-flow.js') > order.indexOf('assets/js/app.js'),
    'the wrapper that books the meeting has to be installed after every app.js assignment');

  const loaded = order
    .map(rel => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8'))
    .join('\n/* ---- next file ---- */\n');
  const assignments = [...loaded.matchAll(/window\.wbnPublish\s*=\s*(async\s*)?function/g)];
  assert.ok(assignments.length > 1, 'expected the layered publish definitions to still be there');
  const winner = loaded.slice(assignments[assignments.length - 1].index);
  assert.match(winner.slice(0, 2000), /await window\.guidcyEnsureWebinarMeeting\(webinarId\)/,
    'the last wbnPublish assignment wins at runtime, so it is the one that must book the meeting');

  // and it needs an id for both paths: a new publish hands one over, an edit already has it
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  assert.match(app, /window\.__guidcyLastPublishedWebinarId\s*=\s*immediate\.id\s*\|\|\s*id/,
    'the publish that generates the id must expose it');
  assert.match(winner.slice(0, 2000), /var editId = editingWebinarId\(\);/,
    'the edit id has to be read before publishing, which clears edit mode');
});

test('the publisher can see the link, without it becoming public', () => {
  const flow = fs.readFileSync(new URL('../assets/js/webinar-flow.js', import.meta.url), 'utf8');
  // read back through RLS rather than from any cached or public source
  assert.match(flow, /from\('webinar_meetings'\)\.select\('meet_link'\)\.eq\('webinar_id', id\)/);
  // shown after publishing, and again whenever the host reopens the webinar
  assert.match(flow, /showGeneratedMeetingLink\(link\)/);
  assert.match(flow, /showGeneratedMeetingLink\(await storedMeetingLink\(editingWebinarId\(\) \|\| webinarId\)\)/);
  // cleared so a previous webinar's link never shows against a different one
  assert.match(flow, /window\.wbnCancelEdit = function \(\) \{\s*showGeneratedMeetingLink\(''\);/);

  /* It is shown IN the field, so the save must not carry it: #wbn-pub-link is
     written to webinars.meet_link, which every visitor can read. The wrapper
     clears it before delegating and restores it after. */
  const wrapper = flow.slice(flow.lastIndexOf('window.wbnPublish = async function'));
  const cleared = wrapper.indexOf("showGeneratedMeetingLink('')");
  const saved = wrapper.indexOf('await originalPublish.apply');
  const restored = wrapper.indexOf('showGeneratedMeetingLink(link)');
  assert.ok(cleared > -1 && saved > -1 && restored > -1, 'publish must clear, save, then restore the field');
  assert.ok(cleared < saved, 'the generated link has to leave the field before the save reads it');
  assert.ok(saved < restored, 'and go back in only once the meeting is confirmed');

  // a link the host typed is theirs: never overwritten, never silently dropped
  assert.match(flow, /function hostTypedTheirOwnLink\(input\) \{[\s\S]*?return !!current && current !== shownGeneratedLink;/);
  assert.match(flow, /if \(input && !hostTypedTheirOwnLink\(input\)\) input\.value = '';/);
  assert.match(flow, /if \(input && hostTypedTheirOwnLink\(input\)\) return;/);
});

/* Runs the field logic for real, rather than asserting on its source: the
   branches decide whether a host's own link survives a publish. */
test('the field shows the generated link but never saves it', () => {
  const flow = fs.readFileSync(new URL('../assets/js/webinar-flow.js', import.meta.url), 'utf8');
  const from = flow.indexOf('var shownGeneratedLink');
  const to = flow.indexOf('async function storedMeetingLink');
  assert.ok(from > -1 && to > from, 'the field helpers must still be there to exercise');

  const input = { value: '', parentNode: { appendChild() {} } };
  const note = { textContent: '', style: {} };
  const stubs = {
    byId: id => (id === 'wbn-pub-link' ? input : id === 'wbn-pub-link-note' ? note : null),
    clean: v => String(v == null ? '' : v).trim(),
  };
  const show = new Function('byId', 'clean', 'window',
    flow.slice(from, to) + '\nreturn showGeneratedMeetingLink;')(stubs.byId, stubs.clean, {});

  // an empty field gets the generated link, and the note explains it
  show('https://meet.google.com/aaa-bbbb-ccc');
  assert.equal(input.value, 'https://meet.google.com/aaa-bbbb-ccc');
  assert.match(note.textContent, /Visible only to you and confirmed registrants/);

  // publishing takes it back out, so the save cannot write it to the public column
  show('');
  assert.equal(input.value, '', 'the generated link must not be in the field when the save reads it');
  assert.equal(note.style.display, 'none');

  // a link the host typed is left alone - not replaced, and not wiped by a publish
  input.value = 'https://zoom.us/j/hosts-own-room';
  show('https://meet.google.com/aaa-bbbb-ccc');
  assert.equal(input.value, 'https://zoom.us/j/hosts-own-room', 'the host’s own link must not be overwritten');
  show('');
  assert.equal(input.value, 'https://zoom.us/j/hosts-own-room', 'and must still be there for the save');
});

/* The bug this guards: wbnEditSession calls the async edit-form opener without
   awaiting it, so hooking wbnEditSession left our webinar_meetings fetch racing
   the form fill - and that fill ends with setVal('wbn-pub-link', w.link), empty
   for a generated meeting. Whichever answered first won, so the link showed up
   only every third or fourth attempt. */
test('opening a webinar for editing shows the link every time, not sometimes', async () => {
  const flow = fs.readFileSync(new URL('../assets/js/webinar-flow.js', import.meta.url), 'utf8');
  const from = flow.indexOf('var originalOpenEditForm = window.guidcyOpenWebinarEditForm;');
  const to = flow.indexOf('var originalCancelEdit');
  assert.ok(from > -1 && to > from, 'the edit-form wrapper must still be there to exercise');

  const LINK = 'https://meet.google.com/aaa-bbbb-ccc';
  const field = { value: '' };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const win = {
    // the real opener resolves late and finishes by blanking the link field
    guidcyOpenWebinarEditForm: async () => { await tick(); await tick(); field.value = ''; return true; },
  };
  new Function('window', 'showGeneratedMeetingLink', 'storedMeetingLink', 'editingWebinarId',
    flow.slice(from, to))(
    win,
    link => { field.value = link || ''; },
    async () => { await tick(); return LINK; },   // resolves BEFORE the form fill
    () => 'WBN-test',
  );

  await win.guidcyOpenWebinarEditForm('WBN-test');
  assert.equal(field.value, LINK,
    'the link must be written after the form fill, otherwise the fill blanks it');
});

/* wbnRender() -> wbnApplyAdminState() (app.js:7648) sets #wbn-admin-panel to
   display:none whenever isAdmin() is false, which it is for a consultant
   publishing their own webinar. Publishing therefore took the panel away before
   the generated link reached the field, so it was written somewhere invisible. */
test('the panel stays open until the link is in the field', () => {
  const flow = fs.readFileSync(new URL('../assets/js/webinar-flow.js', import.meta.url), 'utf8');
  const from = flow.indexOf('function panelIsOpen()');
  const to = flow.indexOf('function generatedLinkNote()');
  assert.ok(from > -1 && to > from, 'the panel helpers must still be there to exercise');

  const panel = { style: { display: 'block' } };
  const win = {};
  const [isOpen, reopen] = new Function('byId', 'window', 'showGeneratedMeetingLink',
    flow.slice(from, to) + '\nreturn [panelIsOpen, keepPanelOpen];')(() => panel, win, () => {});

  // publishing hides it; it is put back because it was open when the host clicked
  const wasOpen = isOpen();
  panel.style.display = 'none';
  reopen(wasOpen);
  assert.equal(panel.style.display, 'block', 'a panel the host had open must survive the publish');

  // a panel that was already closed is left closed - never revealed to anyone
  panel.style.display = 'none';
  reopen(false);
  assert.equal(panel.style.display, 'none', 'it must not open a panel the host could not already see');

  // and it is re-asserted after the link is written, not only before
  const wrapper = flow.slice(flow.lastIndexOf('window.wbnPublish = async function'));
  assert.ok(wrapper.indexOf('showGeneratedMeetingLink(link)') < wrapper.lastIndexOf('keepPanelOpen(panelWasOpen)'),
    'the panel has to be held open through the render that lands while the meeting is being created');

  // the host's own Close button wins: nothing reopens the panel behind them
  panel.style.display = 'block';
  win.guidcyCloseWebinarPanel();
  assert.equal(panel.style.display, 'none', 'Close must actually close it');
  reopen(true);
  assert.equal(panel.style.display, 'none', 'an explicit close must not be undone by the publish flow');
});

test('deleting a webinar takes its meeting off the calendar', async (t) => {
  const lib = require_('../lib/webinar-meeting.js');
  const utils = require_('../lib/razorpay-utils.js');

  assert.deepEqual(await lib.deleteWebinarMeeting(''), { ok: true, skipped: 'no-webinar' });

  const firstStub = t.mock.method(utils, 'first', async () => null);
  assert.deepEqual(await lib.deleteWebinarMeeting('WBN-x'), { ok: true, skipped: 'no-meeting' },
    'a webinar that never had a meeting is a no-op, not an error');

  firstStub.mock.mockImplementation(async () => ({
    webinar_id: 'WBN-x', meet_link: 'https://meet.google.com/aaa-bbbb-ccc', event_id: 'evt-1',
  }));
  t.mock.method(utils, 'getSupabaseConfig', () => ({ url: 'https://db.example', serviceKey: 'k' }));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), method: init && init.method });
    return { ok: true, text: async () => '' };
  });

  const result = await lib.deleteWebinarMeeting('WBN-x');
  assert.equal(result.deleted, true);
  assert.equal(calls.length, 1, 'Google is skipped when Meet is not configured, but the row still goes');
  assert.equal(calls[0].method, 'DELETE');
  assert.match(calls[0].url, /webinar_meetings\?webinar_id=eq\.WBN-x$/);

  // a failed delete must not report success
  calls.length = 0;
  globalThis.fetch = async () => ({ ok: false, text: async () => 'permission denied' });
  await assert.rejects(() => lib.deleteWebinarMeeting('WBN-x'), /Could not remove the webinar meeting/);
});

test('the calendar event is removed, with the guests told, behind the same gate', () => {
  // sendUpdates=all is what cancels it on every registrant's own calendar
  assert.match(gmeet, /events\/\$\{encodeURIComponent\(eventId\)\}\?sendUpdates=all/);
  assert.match(meeting, /deleteMeetEvent\(\{ eventId: existing\.event_id, meetLink: existing\.meet_link \}\)/);
  // and it is asked for only after the host/admin check, not before
  const gate = api.indexOf("return json(res, 403, { error: 'Only the webinar host can create its meeting' })");
  const del = api.indexOf("body.action === 'delete_webinar_meeting'");
  assert.ok(gate > -1 && del > gate, 'deleting a meeting must sit behind the host/admin gate');
});

test('deleting from the UI clears the calendar first, and puts confirm back', async () => {
  const flow = fs.readFileSync(new URL('../assets/js/webinar-flow.js', import.meta.url), 'utf8');
  const from = flow.indexOf('var originalDeleteSession = window.wbnDeleteSession;');
  const to = flow.indexOf('var originalCancelEdit');
  assert.ok(from > -1 && to > from, 'the delete wrapper must still be there to exercise');

  const nativeConfirm = () => { throw new Error('the real confirm must be restored, not left overridden'); };
  const order = [];
  const build = (answer, meetingDeletion) => {
    const win = {
      confirm: answer,
      wbnDeleteSession: async () => {
        // the chain asks again; it must see the suppressed confirm, synchronously
        order.push(win.confirm() ? 'inner-delete' : 'inner-cancelled');
        return 'deleted';
      },
    };
    new Function('window', 'clean', 'toast', 'requestMeetingDeletion', flow.slice(from, to))(
      win,
      v => String(v == null ? '' : v).trim(),
      () => {},
      async id => { order.push('calendar:' + id); return meetingDeletion(); },
    );
    return win;
  };

  // saying no does nothing at all - no calendar call, no delete
  let win = build(() => false, () => ({ ok: true }));
  assert.equal(await win.wbnDeleteSession('WBN-x'), undefined);
  assert.deepEqual(order, [], 'declining must not touch the calendar or the rows');

  // saying yes clears the calendar BEFORE the rows, then restores confirm
  order.length = 0;
  win = build(() => true, () => ({ ok: true }));
  const answered = win.confirm;
  assert.equal(await win.wbnDeleteSession('WBN-x'), 'deleted');
  assert.deepEqual(order, ['calendar:WBN-x', 'inner-delete'],
    'the meeting has to go while the webinar row still proves who owns it');
  assert.equal(win.confirm, answered, 'confirm must be restored after the delete');

  // a calendar failure still deletes the webinar, and confirm is still restored
  order.length = 0;
  win = build(() => true, () => { throw new Error('google down'); });
  win.confirm = nativeConfirm;
  win.confirm = () => true;
  const restored = win.confirm;
  assert.equal(await win.wbnDeleteSession('WBN-x'), 'deleted',
    'a calendar outage must not block deleting the webinar');
  assert.equal(win.confirm, restored, 'confirm must be restored even when the calendar call threw');
});

/* A webinar's guest list is every registrant. Calendar shows that list to all of
   them and can only notify all guests or none - so the invite was handing each
   registrant everyone else's email address, and re-mailing the whole list every
   time somebody new signed up. */
test('registering does not expose the other registrants', () => {
  const add = gmeet.slice(gmeet.indexOf('async function addMeetAttendees'), gmeet.indexOf('module.exports'));
  assert.match(add, /hideGuestList \? \{ attendees, guestsCanSeeOtherGuests: false \} : \{ attendees \}/,
    'the guest list must be hidden from the guests');
  assert.match(emails, /hideGuestList: true/);
  assert.match(emails, /notify: false/,
    'adding one registrant must not mail every earlier registrant');
  // the new webinar event is created that way in the first place
  assert.match(meeting, /hideGuestList: true/);
  assert.match(gmeet, /\.\.\.\(hideGuestList \? \{ guestsCanSeeOtherGuests: false \} : \{\}\)/);

  // the registrant still gets the link - our own email carries it
  assert.match(emails, /meet_link: meetLink/);
  assert.match(emails, /join_link: meetLink/);

  // a 1:1 booking is untouched: both parties are meant to see each other
  const create = gmeet.slice(gmeet.indexOf('async function createMeetLink'), gmeet.indexOf('function eventMeetLink'));
  assert.doesNotMatch(create, /guestsCanSeeOtherGuests: false,\n/,
    'the booking path must not hide guests unconditionally');
});

test('the payment step bar lines its circles up with its labels', () => {
  const css = fs.readFileSync(new URL('../assets/css/patches.css', import.meta.url), 'utf8');
  /* Measured in Chrome at 320/390/768/1464px: without this the circles sat at
     526/673/819 against labels at 539/732/925 - the last one 106px adrift and
     133px short of the bar's own right edge. With it: even 206px gaps and a
     symmetric -13/0/+13 offset, which is just the circle's radius against the
     left- and right-aligned end labels. */
  assert.match(css, /\.step-item:last-child\{flex:0 0 auto\}/,
    'only the first two step items carry a line, so the last must not claim an equal third');

  // the webinar summary uses the payment card's own row style, not the 14px default
  const flow = fs.readFileSync(new URL('../assets/js/webinar-flow.js', import.meta.url), 'utf8');
  assert.doesNotMatch(flow, /class="detail-row"/,
    'detail-row sets no font-size, so those rows rendered at 14px beside 13px siblings');
});
