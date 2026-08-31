// Guards the server-side Meet link path: the IST arithmetic (which silently
// breaks if anyone reaches for `new Date(y,m,d,h,m)` on a UTC Vercel box), and
// the two request fields that are the entire reason this path exists —
// attendees + sendUpdates, without which the consultant still has to knock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSlot, isMeetLink, googleMeetConfigured } = require('../lib/google-meet.js');

const src = readFileSync(new URL('../lib/google-meet.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/create-meet-link.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');

test('parseSlot maps an IST wall clock to the right UTC instant', () => {
  const y = new Date().getFullYear();
  const { startISO, endISO } = parseSlot('Aug 30', '3:00 PM', 45);
  // 15:00 IST == 09:30 UTC
  assert.equal(startISO, `${y}-08-30T09:30:00.000Z`);
  assert.equal(endISO, `${y}-08-30T10:15:00.000Z`);
});

test('parseSlot handles the 12 AM / 12 PM boundaries', () => {
  assert.match(parseSlot('Jan 05', '12:00 AM', 60).startISO, /T18:30:00\.000Z$/); // prev-day 18:30 UTC
  assert.match(parseSlot('Jan 05', '12:00 PM', 60).startISO, /T06:30:00\.000Z$/);
});

test('parseSlot rolls to next year rather than booking in the past', () => {
  // date_label carries no year; a slot far behind us must be next year's.
  const now = new Date();
  const past = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  const label = past.toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' });
  const { startISO } = parseSlot(label, '10:00 AM', 60);
  assert.ok(new Date(startISO).getTime() > now.getTime(), `${label} -> ${startISO} should be in the future`);
});

test('parseSlot defaults a bad duration to 60 minutes', () => {
  const { startISO, endISO } = parseSlot('Aug 30', '3:00 PM', 0);
  assert.equal(new Date(endISO) - new Date(startISO), 3600000);
});

test('isMeetLink accepts real Meet URLs and nothing else', () => {
  assert.ok(isMeetLink('https://meet.google.com/abc-defg-hij'));
  assert.ok(!isMeetLink('https://zoom.us/j/123'));
  assert.ok(!isMeetLink('meet.google.com/abc-defg-hij'));
  assert.ok(!isMeetLink(''));
  assert.ok(!isMeetLink(null));
});

test('parseSlot never reads the host timezone', () => {
  // new Date(y,m,d,h,m) is local-time; on Vercel (UTC) that shifts every
  // booking by 5h30m. Date.UTC + an explicit offset is the only safe form.
  assert.ok(!/new Date\(\s*year\s*,/.test(src), 'parseSlot must not use the local-time Date constructor');
  assert.ok(src.includes('Date.UTC('), 'parseSlot should build instants with Date.UTC');
});

test('the calendar request invites both parties so nobody has to knock', () => {
  assert.ok(src.includes('sendUpdates=all'), 'invite emails must actually be sent');
  assert.ok(src.includes('attendees: guests'), 'attendees are what let Meet admit people directly');
  assert.ok(src.includes("conferenceSolutionKey: { type: 'hangoutsMeet' }"));
});

test('credentials stay server-side', () => {
  assert.ok(!app.includes('GOOGLE_CLIENT_SECRET') && !app.includes('GOOGLE_REFRESH_TOKEN'),
    'Google secrets must never appear in frontend code');
  assert.equal(googleMeetConfigured.length, 0);
});

test('the endpoint authenticates and authorises before creating anything', () => {
  assert.ok(api.includes('getAuthenticatedUser(req)'));
  assert.ok(api.includes('if (!isBuyer && !isConsultant)'), 'callers must own the booking');
  assert.ok(api.includes('isMeetLink(row.meet_link)'), 'a retry must reuse the existing link, not spawn a second meeting');
});

test('the browser falls back to its own Google flow when the server is unconfigured', () => {
  assert.ok(api.includes('configured: false'), 'GET/POST must report unconfigured instead of erroring');
  assert.ok(app.includes('return origCreate.apply(this,[consultantName,dateLabel,timeSlot,durationMin]);'),
    'the original browser implementation must remain reachable');
  assert.ok(app.includes('if(await serverConfigured())return \'server\';'),
    'the consent prompt must be skipped only when the server can do the work');
});
