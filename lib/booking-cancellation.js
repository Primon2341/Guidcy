const {
  clean,
  getAuthenticatedUser,
  loadPaymentRecord,
  first,
  supabaseRest,
  patchById,
} = require('./razorpay-utils');
const { deleteMeetEvent, isMeetLink } = require('./google-meet');

function adminEmails() {
  return new Set([
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_EMAILS,
    'guidcytechnologies@gmail.com',
    'tripathiprakhar41@gmail.com',
  ].join(',').split(',').map((value) => clean(value, 320).toLowerCase()).filter(Boolean));
}

async function actorRoleFor(user, booking, requestedRole) {
  const requested = clean(requestedRole, 40).toLowerCase();
  const isOwner = String(booking.user_id || '') === String(user.id);
  const consultant = booking.consultant_id
    ? await first(`consultants?id=eq.${encodeURIComponent(booking.consultant_id)}&select=id,profile_id&limit=1`)
    : null;
  const isAssignedConsultant = Boolean(consultant && String(consultant.profile_id || '') === String(user.id));
  const profile = await first(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,email&limit=1`);
  const email = clean(user.email || profile && profile.email, 320).toLowerCase();
  const isAdmin = clean(profile && profile.role, 40).toLowerCase() === 'admin' || adminEmails().has(email);

  if (requested === 'admin' && isAdmin) return 'admin';
  if (requested === 'consultant' && isAssignedConsultant) return 'consultant';
  if (requested === 'user' && isOwner) return 'user';
  if (isOwner) return 'user';
  if (isAssignedConsultant) return 'consultant';
  if (isAdmin) return 'admin';
  return '';
}

async function cancelBookingRequest(req, body) {
  const user = await getAuthenticatedUser(req);
  const bookingId = clean(body.bookingId || body.booking_id || body.id, 120);
  if (!bookingId) throw Object.assign(new Error('Booking id is required'), { status: 400 });

  const booking = await loadPaymentRecord('booking', bookingId);
  if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });
  const actorRole = await actorRoleFor(user, booking, body.role || body.actorRole);
  if (!actorRole) {
    throw Object.assign(new Error('This booking cannot be cancelled by the signed-in user'), { status: 403 });
  }

  const rpcResult = await supabaseRest('rpc/guidcy_cancel_booking', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      p_booking_id: booking.id,
      p_actor_id: user.id,
      p_actor_role: actorRole,
      p_reason: clean(body.reason || body.cancellationReason || '', 2000) || null,
    },
  });
  let cancelled = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!cancelled || !cancelled.id) cancelled = await loadPaymentRecord('booking', booking.id);
  if (!cancelled) throw Object.assign(new Error('Cancelled booking could not be read back'), { status: 500 });

  let meetingCleanup = { ok: true, skipped: true };
  let meetingCleanupError = '';
  if (booking.google_calendar_event_id || isMeetLink(booking.meet_link)) {
    try {
      meetingCleanup = await deleteMeetEvent({
        eventId: booking.google_calendar_event_id,
        meetLink: booking.meet_link,
        dateLabel: booking.date_label,
        timeSlot: booking.time_slot,
        duration: booking.duration,
      });
      if (meetingCleanup.eventId && !cancelled.google_calendar_event_id) {
        cancelled = await patchById('booking', booking.id, {
          google_calendar_event_id: meetingCleanup.eventId,
          meeting_last_error: null,
          meeting_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }) || cancelled;
      }
    } catch (error) {
      meetingCleanupError = clean(error && error.message || error, 1000);
      cancelled = await patchById('booking', booking.id, {
        meeting_status: 'disabled',
        meeting_last_error: meetingCleanupError,
        meeting_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }) || cancelled;
    }
  }

  return {
    ok: true,
    booking: cancelled,
    actorRole,
    refundPending: cancelled.refund_status === 'refund_pending',
    meetingDisabled: !cancelled.meet_link && cancelled.meeting_status === 'disabled',
    meetingCleanup,
    meetingCleanupError: meetingCleanupError || null,
    browserMeetingCleanupRecommended: Boolean(
      booking.google_calendar_event_id
      && (meetingCleanup.skipped || meetingCleanup.notFound || meetingCleanup.alreadyDeleted || meetingCleanupError)
    ),
  };
}

module.exports = { cancelBookingRequest };
