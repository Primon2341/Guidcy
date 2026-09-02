// Server-side Google Meet link creation.
//
// The browser used to do this against the buyer's own calendar
// (assets/js/app.js createGoogleMeetLink), which forced a Google consent
// prompt on every booking and left the consultant off the invite entirely -
// so Meet treated them as an uninvited guest and made them knock. Creating
// the event here under one Guidcy identity, with both parties as attendees,
// removes both problems.
//
// Credentials live in Vercel env vars only, never in frontend code.
// When they are absent every function here reports "not configured" and the
// caller falls back to the old browser flow, so a deployment without the
// env vars behaves exactly as it did before.

const MEET_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function env(name) {
  return String(process.env[name] || '').trim();
}

function googleMeetConfig() {
  return {
    clientId: env('GOOGLE_CLIENT_ID') || env('GOOGLE_MEET_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET') || env('GOOGLE_MEET_CLIENT_SECRET'),
    refreshToken: env('GOOGLE_REFRESH_TOKEN') || env('GOOGLE_MEET_REFRESH_TOKEN'),
    calendarId: env('GOOGLE_MEET_CALENDAR_ID') || 'primary',
  };
}

function googleMeetConfigured() {
  const cfg = googleMeetConfig();
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
}

// Warm Vercel containers reuse module scope, so a booking burst spends one
// token exchange instead of one per request. 60s of slack against clock skew.
let cachedToken = { value: '', expiresAt: 0 };

async function accessToken() {
  const cfg = googleMeetConfig();
  if (!googleMeetConfigured()) throw Object.assign(new Error('Google Meet is not configured'), { status: 503, code: 'not_configured' });
  if (cachedToken.value && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    // invalid_grant here almost always means the OAuth app is still in
    // "Testing", where Google expires refresh tokens after 7 days.
    const detail = data.error_description || data.error || `HTTP ${resp.status}`;
    throw Object.assign(new Error(`Google token refresh failed: ${detail}`), { status: 502 });
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000,
  };
  return cachedToken.value;
}

// "Aug 30" + "3:00 PM" + 60 -> UTC instants for an IST wall clock.
// Built from an explicit offset rather than new Date(y,m,d,h,m): that
// constructor reads the host timezone, which is IST in the browser but UTC
// on Vercel, and would silently shift every server-made booking by 5h30m.
function parseSlot(dateLabel, timeSlot, durationMin) {
  const parts = String(dateLabel || '').trim().split(/\s+/);
  const now = new Date();
  const mon = Object.prototype.hasOwnProperty.call(MONTHS, parts[0]) ? MONTHS[parts[0]] : now.getMonth();
  const day = parseInt(parts[1], 10) || now.getDate();

  const [timePart, ampmRaw] = (String(timeSlot || '10:00 AM').trim() + ' ').split(/\s+/);
  const ampm = String(ampmRaw || '').toUpperCase();
  let [hrs, mins] = String(timePart || '10:00').split(':').map((n) => parseInt(n, 10) || 0);
  if (ampm === 'PM' && hrs !== 12) hrs += 12;
  if (ampm === 'AM' && hrs === 12) hrs = 0;

  let year = now.getFullYear();
  let startMs = Date.UTC(year, mon, day, hrs, mins, 0) - IST_OFFSET_MS;
  // date_label carries no year, so a December booking for a January slot
  // would otherwise land eleven months in the past.
  if (startMs < now.getTime() - 30 * 24 * 60 * 60 * 1000) {
    year += 1;
    startMs = Date.UTC(year, mon, day, hrs, mins, 0) - IST_OFFSET_MS;
  }
  const duration = Number(durationMin) > 0 ? Number(durationMin) : 60;
  return {
    startISO: new Date(startMs).toISOString(),
    endISO: new Date(startMs + duration * 60000).toISOString(),
  };
}

function isMeetLink(value) {
  return /^https:\/\/meet\.google\.com\/[a-z0-9-]+/i.test(String(value || ''));
}

/**
 * Creates a Calendar event with a Meet conference and returns the join URL.
 * attendees are put on the invite so Google recognises them and lets them in
 * without the host admitting them; sendUpdates:'all' makes Google deliver the
 * invite email to both parties.
 */
async function createMeetLink({ summary, description, dateLabel, timeSlot, duration, attendees }) {
  const token = await accessToken();
  const { startISO, endISO } = parseSlot(dateLabel, timeSlot, duration);
  const guests = (attendees || [])
    .map((email) => String(email || '').trim().toLowerCase())
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    .filter((email, i, list) => list.indexOf(email) === i)
    .map((email) => ({ email, responseStatus: 'accepted' }));

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleMeetConfig().calendarId)}`
    + '/events?conferenceDataVersion=1&sendUpdates=all';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: summary || 'Guidcy Session',
      description: description || 'Expert consultation booked via Guidcy (guidcy.com)',
      start: { dateTime: startISO, timeZone: MEET_TIMEZONE },
      end: { dateTime: endISO, timeZone: MEET_TIMEZONE },
      attendees: guests,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      conferenceData: {
        createRequest: {
          requestId: `guidcy-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = (data.error && (data.error.message || data.error.status)) || `HTTP ${resp.status}`;
    throw Object.assign(new Error(`Google Calendar rejected the event: ${detail}`), { status: 502 });
  }
  const link = (data.conferenceData
    && Array.isArray(data.conferenceData.entryPoints)
    && (data.conferenceData.entryPoints.find((e) => e && e.entryPointType === 'video') || {}).uri)
    || data.hangoutLink
    || '';
  if (!isMeetLink(link)) {
    throw Object.assign(new Error('Google Calendar returned no Meet link'), { status: 502 });
  }
  return { link, eventId: data.id || '', startISO, endISO, attendees: guests.map((g) => g.email) };
}

function eventMeetLink(event) {
  if (!event || typeof event !== 'object') return '';
  const entries = event.conferenceData && Array.isArray(event.conferenceData.entryPoints)
    ? event.conferenceData.entryPoints
    : [];
  const video = entries.find((entry) => entry && entry.entryPointType === 'video');
  return String(video && video.uri || event.hangoutLink || '').trim();
}

async function deleteCalendarEvent(token, eventId) {
  const cfg = googleMeetConfig();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}`
    + `/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok || response.status === 404 || response.status === 410) {
    return { ok: true, alreadyDeleted: response.status === 404 || response.status === 410 };
  }
  const data = await response.json().catch(() => ({}));
  const detail = data.error && (data.error.message || data.error.status) || `HTTP ${response.status}`;
  throw Object.assign(new Error(`Google Calendar could not delete the meeting event: ${detail}`), {
    status: 502,
    googleStatus: response.status,
  });
}

async function findCalendarEventByMeetLink(token, { meetLink, dateLabel, timeSlot, duration }) {
  if (!isMeetLink(meetLink)) return null;
  const cfg = googleMeetConfig();
  const { startISO, endISO } = parseSlot(dateLabel, timeSlot, duration);
  const timeMin = new Date(new Date(startISO).getTime() - 6 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(new Date(endISO).getTime() + 6 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    singleEvents: 'true',
    showDeleted: 'false',
    maxResults: '50',
    timeMin,
    timeMax,
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}`
    + `/events?${params.toString()}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error && (data.error.message || data.error.status) || `HTTP ${response.status}`;
    throw Object.assign(new Error(`Google Calendar could not locate the meeting event: ${detail}`), { status: 502 });
  }
  const expected = String(meetLink).replace(/\/+$/, '').toLowerCase();
  return (Array.isArray(data.items) ? data.items : []).find((event) => (
    eventMeetLink(event).replace(/\/+$/, '').toLowerCase() === expected
  )) || null;
}

async function deleteMeetEvent({ eventId, meetLink, dateLabel, timeSlot, duration }) {
  if (!googleMeetConfigured()) return { ok: true, configured: false, skipped: true };
  const token = await accessToken();
  const cleanEventId = String(eventId || '').trim();
  if (cleanEventId) {
    const deleted = await deleteCalendarEvent(token, cleanEventId);
    return { ...deleted, configured: true, eventId: cleanEventId };
  }
  const event = await findCalendarEventByMeetLink(token, { meetLink, dateLabel, timeSlot, duration });
  if (!event || !event.id) return { ok: true, configured: true, notFound: true };
  const deleted = await deleteCalendarEvent(token, event.id);
  return { ...deleted, configured: true, eventId: event.id, foundByMeetLink: true };
}

module.exports = {
  googleMeetConfig,
  googleMeetConfigured,
  parseSlot,
  isMeetLink,
  createMeetLink,
  deleteMeetEvent,
  MEET_TIMEZONE,
};
