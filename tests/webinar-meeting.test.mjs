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
  assert.match(emails, /addMeetAttendees\(\{ eventId: meeting\.event_id, emails: \[clean\(row\.email, 160\)\] \}\)/);
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
  assert.match(fn, /sendUpdates=all/, 'Google sends the invitation');
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
  assert.match(flow, /storedMeetingLink\(webinarId \|\| editingWebinarId\(\)\)\.then\(showGeneratedMeetingLink\)/);
  // cleared so a previous webinar's link never shows against a different one
  assert.match(flow, /window\.wbnCancelEdit = function \(\) \{\s*showGeneratedMeetingLink\(''\);/);
  /* The input is saved to webinars.meet_link, which every visitor can read.
     Putting the generated link in it would publish the join URL. */
  assert.doesNotMatch(flow, /byId\('wbn-pub-link'\)\.value\s*=/,
    'the generated link must never be written into the field that saves to the public column');
});
