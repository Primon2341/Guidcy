/* One Google Meet per webinar, created when it is published.
 *
 * Reuses the same calendar integration as a 1:1 consultant booking
 * (lib/google-meet.js). The link is kept in public.webinar_meetings, not in
 * webinars.meet_link, because webinars has a SELECT policy of `true` - anything
 * stored there is readable by every visitor, registered or not.
 *
 * Publishing twice, or editing the webinar, must not create a second meeting:
 * the stored row is the record of what already exists. A changed date or time
 * moves that event instead, which keeps the link and re-notifies the guests.
 */
const utils = require('./razorpay-utils');
const { clean } = utils;
const { googleMeetConfigured, createMeetLink, updateMeetEvent, deleteMeetEvent, isMeetLink } = require('./google-meet');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/* A webinar carries a real date, so the exact instant is computed here rather
   than left to the label heuristic, which infers the year from today. */
function toInstants(date, time, durationMin) {
  const d = String(date || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const t = String(time || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!d || !t) return null;
  const startMs = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], 0) - IST_OFFSET_MS;
  if (!Number.isFinite(startMs)) return null;
  const mins = Number(durationMin) > 0 ? Number(durationMin) : 60;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + mins * 60000).toISOString() };
}

/* webinars store date as 2026-09-10 and time as 23:49; parseSlot wants
   "Sep 10" and "11:49 PM". */
function toSlot(date, time) {
  const d = String(date || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const t = String(time || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!d || !t) return null;
  const month = MONTHS[Math.max(0, Math.min(11, parseInt(d[2], 10) - 1))];
  let hours = parseInt(t[1], 10);
  const mins = t[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return {
    dateLabel: `${month} ${parseInt(d[3], 10)} ${d[1]}`,
    timeSlot: `${hours}:${mins} ${ampm}`,
  };
}

function durationMinutes(webinar) {
  const raw = clean(webinar && webinar.duration, 40);
  const n = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

async function storedMeeting(webinarId) {
  const id = clean(webinarId, 200);
  if (!id) return null;
  try {
    return await utils.first(`webinar_meetings?webinar_id=eq.${encodeURIComponent(id)}&select=*`);
  } catch (_) {
    return null;
  }
}

async function saveMeeting(row) {
  const { url, serviceKey } = utils.getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/webinar_meetings?on_conflict=webinar_id`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });
  const text = await response.text();
  if (!response.ok) throw Object.assign(new Error(`Could not save the webinar meeting: ${text.slice(0, 200)}`), { status: 502 });
  let saved = null;
  try { saved = JSON.parse(text); } catch (_) { saved = null; }
  return Array.isArray(saved) ? saved[0] : saved;
}

/* Returns { link, eventId, created, moved, reused, configured }. Never creates a
   second meeting for a webinar that already has one. */
async function ensureWebinarMeeting(webinar) {
  if (!webinar || !webinar.id) return { link: '', configured: false, skipped: 'no-webinar' };
  if (!googleMeetConfigured()) return { link: '', configured: false, skipped: 'not-configured' };

  const slot = toSlot(webinar.date, webinar.time);
  if (!slot) return { link: '', configured: true, skipped: 'no-date-or-time' };

  const duration = durationMinutes(webinar);
  const summary = clean(webinar.title, 200) || 'Guidcy webinar';
  const description = `Guidcy webinar - ${summary}. Hosted on guidcy.com`;
  const existing = await storedMeeting(webinar.id);

  if (existing && isMeetLink(existing.meet_link)) {
    const sameStart = clean(existing.start_at) && new Date(existing.start_at).getTime();
    let moved = false;
    let link = existing.meet_link;
    let eventId = existing.event_id || '';
    if (eventId) {
      /* Only touch Google when the slot actually changed. */
      const wanted = toInstants(webinar.date, webinar.time, duration);
      if (wanted && (!sameStart || new Date(wanted.startISO).getTime() !== sameStart)) {
        const updated = await updateMeetEvent({ eventId, dateLabel: slot.dateLabel, timeSlot: slot.timeSlot, duration, summary, description, startISO: wanted.startISO, endISO: wanted.endISO });
        link = isMeetLink(updated.link) ? updated.link : link;
        moved = true;
        await saveMeeting({
          webinar_id: webinar.id, meet_link: link, event_id: eventId,
          start_at: updated.startISO, end_at: updated.endISO, updated_at: new Date().toISOString(),
        });
      }
    }
    return { link, eventId, configured: true, reused: !moved, moved };
  }

  const made = await createMeetLink({
    summary,
    description,
    dateLabel: slot.dateLabel,
    timeSlot: slot.timeSlot,
    duration,
    attendees: [clean(webinar.publisher_email, 160)].filter(Boolean),
    startISO: (toInstants(webinar.date, webinar.time, duration) || {}).startISO,
    endISO: (toInstants(webinar.date, webinar.time, duration) || {}).endISO,
  });
  await saveMeeting({
    webinar_id: webinar.id, meet_link: made.link, event_id: made.eventId,
    start_at: made.startISO, end_at: made.endISO, updated_at: new Date().toISOString(),
  });
  return { link: made.link, eventId: made.eventId, configured: true, created: true };
}

/* Deleting a webinar has to take its meeting off the calendar too, or the event
 * stays there and everyone who registered still has a session on their own
 * calendar that is not happening. Google is asked with sendUpdates=all, so the
 * guests are told it is cancelled.
 *
 * Must run while the webinar row still exists: that row is what proves who owns
 * the meeting, and webinar_meetings is removed with it by the foreign key.
 * Idempotent - a webinar with no meeting, or an event Google has already lost,
 * is a no-op rather than an error. */
async function deleteWebinarMeeting(webinarId) {
  const id = clean(webinarId, 200);
  if (!id) return { ok: true, skipped: 'no-webinar' };
  const existing = await storedMeeting(id);
  if (!existing) return { ok: true, skipped: 'no-meeting' };

  let removed = { ok: true };
  if (googleMeetConfigured()) {
    removed = await deleteMeetEvent({ eventId: existing.event_id, meetLink: existing.meet_link });
  }

  const { url, serviceKey } = utils.getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/webinar_meetings?webinar_id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw Object.assign(new Error(`Could not remove the webinar meeting: ${text.slice(0, 200)}`), { status: 502 });
  }
  return { ok: true, deleted: true, eventId: existing.event_id || '', alreadyGone: !!removed.alreadyDeleted };
}

module.exports = { ensureWebinarMeeting, deleteWebinarMeeting, storedMeeting, toSlot, toInstants, durationMinutes };
