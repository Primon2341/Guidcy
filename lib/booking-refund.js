const {
  clean,
  getAuthenticatedUser,
  first,
  loadPaymentRecord,
  authoritativeAmount,
  moneyToPaise,
  supabaseRest,
  patchById,
  createRazorpayRefund,
  fetchRazorpayRefund,
} = require('./razorpay-utils');

function configuredAdminEmails() {
  return new Set([
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_EMAILS,
    'guidcytechnologies@gmail.com',
    'tripathiprakhar41@gmail.com',
  ].join(',').split(',').map((value) => clean(value, 320).toLowerCase()).filter(Boolean));
}

async function requireAdmin(req) {
  const user = await getAuthenticatedUser(req);
  const profile = await first(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,email&limit=1`);
  const email = clean(user.email || profile && profile.email, 320).toLowerCase();
  if (clean(profile && profile.role, 40).toLowerCase() !== 'admin' && !configuredAdminEmails().has(email)) {
    throw Object.assign(new Error('Admin access is required'), { status: 403 });
  }
  return user;
}

function refundLifecycleStatus(refund) {
  const status = clean(refund && refund.status, 60).toLowerCase();
  if (status === 'processed') return 'refunded';
  if (status === 'failed') return 'refund_failed';
  return 'refund_processing';
}

async function writeRefundLog(booking, actor, lifecycle, refund, comment) {
  try {
    await supabaseRest('booking_session_logs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        booking_id: booking.id,
        // booking_session_logs deliberately has a small, audited action enum.
        // Processing and failure are both refund attempts; their precise
        // lifecycle stays in new_status and metadata.
        action_type: lifecycle === 'refunded' ? 'refund_processed' : 'refund_requested',
        old_status: booking.refund_status || null,
        new_status: lifecycle,
        actor_role: 'admin',
        actor_id: actor.id,
        comment: clean(comment, 1000) || null,
        metadata: {
          source: 'refund-booking-api',
          refund_id: refund && refund.id || booking.refund_transaction_id || null,
          gateway_status: refund && refund.status || null,
          amount: refund && refund.amount || null,
          refund_lifecycle: lifecycle,
        },
      },
    });
  } catch (error) {
    console.warn('refund-booking audit log warning:', error && error.message || error);
  }
}

async function refundBookingRequest(req, body) {
  let actor = null;
  let booking = null;
  try {
    actor = await requireAdmin(req);
    const bookingId = clean(body.bookingId || body.booking_id || body.id, 120);
    if (!bookingId) throw Object.assign(new Error('Booking id is required'), { status: 400 });

    booking = await loadPaymentRecord('booking', bookingId);
    if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });
    if (clean(booking.status, 40).toLowerCase() !== 'cancelled'
        || clean(booking.session_status, 40).toLowerCase() !== 'cancelled') {
      throw Object.assign(new Error('Only a cancelled booking can be refunded'), { status: 409 });
    }
    if (booking.refund_status === 'not_required') {
      throw Object.assign(new Error('This cancellation does not require a refund'), { status: 409 });
    }
    if (booking.refund_status === 'refunded') {
      const normalized = clean(booking.payment_status, 40).toLowerCase() === 'success'
        && clean(booking.payout_status, 40).toLowerCase() === 'not_eligible'
        ? booking
        : await patchById('booking', booking.id, {
          payment_status: 'success',
          payout_status: 'not_eligible',
          updated_at: new Date().toISOString(),
        });
      return { statusCode: 200, data: { ok: true, refunded: true, idempotent: true, booking: normalized || booking } };
    }
    if (!booking.payment_verified || clean(booking.payment_status, 40).toLowerCase() !== 'success') {
      throw Object.assign(new Error('The booking does not have a verified captured payment'), { status: 409 });
    }

    const paymentId = clean(booking.razorpay_payment_id || booking.payment_id, 120);
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
      throw Object.assign(new Error('A Razorpay payment id is required before processing the refund'), { status: 409 });
    }
    const refundAmount = Number(booking.refund_amount || await authoritativeAmount('booking', booking));
    const refundAmountPaise = moneyToPaise(refundAmount);
    if (refundAmountPaise <= 0) throw Object.assign(new Error('The refund amount is zero'), { status: 409 });

    const idempotencyKey = clean(booking.refund_idempotency_key || `guidcy-booking-refund-${booking.id}`, 100);
    if (['refund_pending', 'refund_failed'].includes(booking.refund_status)) {
      const claimed = await supabaseRest(
        `bookings?id=eq.${encodeURIComponent(booking.id)}`
          + '&status=eq.cancelled&refund_status=in.(refund_pending,refund_failed)&select=*',
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            refund_status: 'refund_processing',
            refund_processing_started_at: new Date().toISOString(),
            refund_failed_at: null,
            refund_failure_reason: null,
            refund_actioned_by: actor.id,
            refund_idempotency_key: idempotencyKey,
            refund_amount: refundAmount,
            refund_notes: clean(body.note || body.notes || '', 2000) || booking.refund_notes || null,
            payout_status: 'blocked',
            updated_at: new Date().toISOString(),
          },
        },
      );
      booking = Array.isArray(claimed) && claimed[0] ? claimed[0] : await loadPaymentRecord('booking', booking.id);
    }

    const refund = booking.refund_transaction_id
      ? await fetchRazorpayRefund(booking.refund_transaction_id)
      : await createRazorpayRefund(paymentId, {
        amount: refundAmountPaise,
        idempotencyKey,
        speed: 'normal',
        notes: {
          platform: 'Guidcy',
          flow: 'booking_cancellation',
          booking_id: booking.id,
        },
      });

    const lifecycle = refundLifecycleStatus(refund);
    const now = new Date().toISOString();
    const updated = await patchById('booking', booking.id, {
      refund_status: lifecycle,
      refund_transaction_id: clean(refund && refund.id, 120) || booking.refund_transaction_id || null,
      refund_gateway_status: clean(refund && refund.status, 80) || null,
      refund_last_synced_at: now,
      refund_response: refund || null,
      refund_actioned_by: actor.id,
      refund_failure_reason: lifecycle === 'refund_failed'
        ? clean(refund && (refund.error_description || refund.error_reason) || 'Razorpay reported refund failure', 1000)
        : null,
      refund_failed_at: lifecycle === 'refund_failed' ? now : null,
      refunded_at: lifecycle === 'refunded' ? (booking.refunded_at || now) : booking.refunded_at,
      // Payment stays successful for transaction history.  The distinct
      // refund_status carries Pending/Processing/Refunded/Failed.
      payment_status: 'success',
      payout_status: lifecycle === 'refunded' ? 'not_eligible' : 'blocked',
      updated_at: now,
    });
    await writeRefundLog(booking, actor, lifecycle, refund, body.note || body.notes || '');

    return {
      statusCode: lifecycle === 'refund_processing' ? 202 : 200,
      data: {
        ok: true,
        refunded: lifecycle === 'refunded',
        pending: lifecycle === 'refund_processing',
        failed: lifecycle === 'refund_failed',
        refund,
        booking: updated,
      },
    };
  } catch (error) {
    if (booking && actor && booking.id && booking.refund_status !== 'refunded') {
      try {
        const uncertain = Number(error.status) === 409 && booking.refund_status === 'refund_processing';
        const patch = {
          refund_status: uncertain ? 'refund_processing' : 'refund_failed',
          refund_gateway_status: uncertain ? 'processing' : 'failed',
          refund_failure_reason: clean(error.message || error, 1000),
          refund_failed_at: uncertain ? null : new Date().toISOString(),
          refund_last_synced_at: new Date().toISOString(),
          refund_response: error.data || null,
          refund_actioned_by: actor.id,
          payout_status: 'blocked',
          updated_at: new Date().toISOString(),
        };
        await patchById('booking', booking.id, patch);
        await writeRefundLog(booking, actor, patch.refund_status, error.data || null, error.message || 'Refund failed');
      } catch (patchError) {
        console.error('refund-booking failure-state update error:', patchError);
      }
    }
    throw error;
  }
}

module.exports = { refundBookingRequest, refundLifecycleStatus };
