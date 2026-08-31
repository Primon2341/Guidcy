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

const { clean, json, readBody, getAuthenticatedUser, loadPaymentRecord, patchById } = require('../lib/razorpay-utils');
const { googleMeetConfigured, createMeetLink, isMeetLink } = require('../lib/google-meet');

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
    if (!googleMeetConfigured()) {
      // Not an error: the browser fallback handles this deployment.
      return json(res, 200, { ok: false, configured: false, link: '' });
    }

    const body = await readBody(req);
    const user = await getAuthenticatedUser(req);
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
      if (isMeetLink(row.meet_link)) return json(res, 200, { ok: true, configured: true, link: row.meet_link, reused: true });
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
      await patchById('booking', row.id, { meet_link: created.link, updated_at: new Date().toISOString() });
    }
    return json(res, 200, { ok: true, configured: true, link: created.link, persisted: Boolean(row), attendees: created.attendees });
  } catch (error) {
    console.error('create-meet-link error:', error);
    return json(res, error.status || 500, { error: error.message || 'Meeting link could not be created' });
  }
};
