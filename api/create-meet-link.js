// Creates the Google Meet link for a booking on the server.
//
// GET  -> { configured: bool }   cheap probe so the browser knows whether it
//                                still needs to fall back to its own Google
//                                sign-in. Reveals no credentials.
// POST -> { link }               requires a signed-in Guidcy session.
//
// With { bookingId } the row supplies both parties' emails, they go on the
// calendar invite (so Meet lets them straight in instead of making them
// knock), and the link is persisted. Without it the link is still created but
// only the caller is invited and nothing is written.

const { clean, json, readBody, getAuthenticatedUser, loadPaymentRecord, patchById, first } = require('../lib/razorpay-utils');
const { googleMeetConfigured, createMeetLink, isMeetLink } = require('../lib/google-meet');
const { cancelBookingRequest } = require('../lib/booking-cancellation');
const { ensureWebinarMeeting, deleteWebinarMeeting } = require('../lib/webinar-meeting');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return json(res, 200, { configured: googleMeetConfigured() });
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    if (body.action === 'cancel_booking') {
      return json(res, 200, await cancelBookingRequest(req, body));
    }
    if (!googleMeetConfigured()) {
      // Not an error: the browser fallback handles this deployment.
      return json(res, 200, { ok: false, configured: false, link: '' });
    }

    const user = await getAuthenticatedUser(req);

    /* Publishing a webinar generates its meeting through the same calendar
       integration a 1:1 booking uses. Only the host or an admin may ask, and
       ensureWebinarMeeting() reuses the existing event - clicking Publish twice
       or editing the webinar never produces a second meeting. */
    const webinarId = clean(body.webinarId || body.webinar_id || '', 200);
    if (webinarId) {
      const webinar = await first(`webinars?id=eq.${encodeURIComponent(webinarId)}&select=*`);
      if (!webinar) return json(res, 404, { error: 'Webinar not found' });
      const callerEmail = String(user.email || '').toLowerCase();
      const isHost = String(webinar.created_by || '') === String(user.id)
        || (Boolean(callerEmail) && callerEmail === String(webinar.publisher_email || '').toLowerCase());
      let isAdmin = false;
      if (!isHost) {
        const profile = await first(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role`);
        isAdmin = String(profile && profile.role || '').toLowerCase() === 'admin';
      }
      if (!isHost && !isAdmin) return json(res, 403, { error: 'Only the webinar host can create its meeting' });

      /* Deleting the webinar takes its meeting off the calendar, so registrants
         are not left holding an invite to a session that is not happening. Same
         gate as creating it, and asked while the webinar row is still there -
         that row is what proves ownership. */
      if (body.action === 'delete_webinar_meeting') {
        return json(res, 200, await deleteWebinarMeeting(webinarId));
      }

      const meeting = await ensureWebinarMeeting(webinar);
      if (!meeting.link) return json(res, 200, { ok: false, configured: meeting.configured !== false, link: '', reason: meeting.skipped || 'no-link' });
      return json(res, 200, {
        ok: true, configured: true, link: meeting.link, eventId: meeting.eventId || '',
        created: !!meeting.created, reused: !!meeting.reused, moved: !!meeting.moved,
      });
    }

    const bookingId = clean(body.bookingId || body.booking_id || '', 120);

    let row = null;
    if (bookingId) {
      row = await loadPaymentRecord('booking', bookingId);
      if (!row) return json(res, 404, { error: 'Booking not found' });
      const callerEmail = String(user.email || '').toLowerCase();
      const isBuyer = String(row.user_id || '') === String(user.id);
      const isConsultant = Boolean(callerEmail) && callerEmail === String(row.consultant_email || '').toLowerCase();
      if (!isBuyer && !isConsultant) return json(res, 403, { error: 'This booking does not belong to the signed-in user' });
      // Re-running checkout or the retry button must not spawn a second
      // meeting for a booking that already has one.
      if (String(row.status || '').toLowerCase() === 'cancelled' || String(row.session_status || '').toLowerCase() === 'cancelled') {
        return json(res, 409, { error: 'A meeting cannot be created for a cancelled booking' });
      }
      if (isMeetLink(row.meet_link)) {
        return json(res, 200, {
          ok: true,
          configured: true,
          link: row.meet_link,
          eventId: row.google_calendar_event_id || '',
          reused: true,
        });
      }
    }

    const consultantName = clean(body.consultantName || (row && row.consultant_name) || 'Consultant', 160);
    const created = await createMeetLink({
      summary: `Guidcy Session — ${consultantName}`,
      dateLabel: clean(body.dateLabel || (row && row.date_label) || '', 60),
      timeSlot: clean(body.timeSlot || (row && row.time_slot) || '', 40),
      duration: Number(body.duration || (row && row.duration) || 60),
      attendees: [
        user.email,
        row && row.user_email,
        row && row.consultant_email,
        body.consultantEmail,
      ],
    });

    if (row) {
      await patchById('booking', row.id, {
        meet_link: created.link,
        google_calendar_event_id: created.eventId || null,
        meeting_status: 'ready',
        meeting_last_error: null,
        meeting_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return json(res, 200, {
      ok: true,
      configured: true,
      link: created.link,
      eventId: created.eventId || '',
      persisted: Boolean(row),
      attendees: created.attendees,
    });
  } catch (error) {
    console.error('create-meet-link error:', error);
    return json(res, error.status || 500, { error: error.message || 'Meeting link could not be created' });
  }
};
