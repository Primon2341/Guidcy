/* Webinar registration emails, sent from the server.
 *
 * These used to be triggered by the browser after /api/verify-payment returned.
 * That works right up until the tab is closed, refreshed or loses its network in
 * the second between the payment being verified and the send - and then the
 * registration is paid and confirmed but nobody is ever told. Verification is the
 * moment we know the registration is real, so send from there.
 *
 * Delivery goes through the same send-guidcy-email Edge Function the client uses,
 * so there is exactly one place that owns subjects, templates and the send log.
 *
 * Never throws: a failed email must not fail a verified payment. The client keeps
 * its own send as a fallback and skips when it sees the flags this sets.
 */
/* first() and patchById() are called through the module object rather than
   destructured, so the data layer can be substituted in tests. */
const utils = require('./razorpay-utils');
const { clean, getSupabaseConfig } = utils;

function alreadyEmailed(row) {
  return !!(row && (row.registration_email_sent === true || row.confirmation_email_sent === true));
}

async function loadWebinar(webinarId) {
  const id = clean(webinarId, 140);
  if (!id) return null;
  try {
    return await utils.first(
      `webinars?id=eq.${encodeURIComponent(id)}` +
      `&select=id,title,date,time,speaker,publisher_email,publisher_name,price_amount`
    );
  } catch (_) {
    return null;
  }
}

async function invokeEmail(url, serviceKey, payload) {
  const response = await fetch(`${url}/functions/v1/send-guidcy-email`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
  return { ok: response.ok && (!body || body.ok !== false), body };
}

/* Returns the registration row, with the sent flags set when the attendee email
 * went out. Safe to call more than once - it no-ops once the flags are set. */
async function sendWebinarRegistrationEmails(registration) {
  const row = registration;
  if (!row || !row.id || alreadyEmailed(row)) return row;
  const to = clean(row.email, 160);
  if (!to) return row;

  let url = '';
  let serviceKey = '';
  try { ({ url, serviceKey } = getSupabaseConfig()); } catch (_) { return row; }

  const webinar = (await loadWebinar(row.webinar_id)) || {};
  const siteUrl = clean(process.env.SITE_URL || 'https://www.guidcy.com', 200).replace(/\/+$/, '');
  const data = Object.assign({}, row, {
    webinar_title: clean(webinar.title || row.webinar_title || 'Guidcy webinar', 200),
    webinar_date: webinar.date || '',
    webinar_time: webinar.time || '',
    host_name: clean(webinar.speaker || webinar.publisher_name || '', 120),
    action_link: `${siteUrl}/webinars`,
  });

  let attendeeSent = false;
  try {
    const result = await invokeEmail(url, serviceKey, {
      to,
      recipientName: clean(row.name, 120) || 'there',
      recipientRole: 'user',
      type: 'webinar_registration_user',
      relatedTable: 'webinar_registrations',
      relatedId: row.id,
      data,
    });
    attendeeSent = result.ok;
    if (!result.ok) console.warn('Webinar attendee email not sent:', result.body);
  } catch (error) {
    console.warn('Webinar attendee email failed:', error && error.message);
  }

  const hostEmail = clean(webinar.publisher_email, 160);
  if (hostEmail) {
    try {
      await invokeEmail(url, serviceKey, {
        to: hostEmail,
        recipientName: data.host_name || 'Consultant',
        recipientRole: 'consultant',
        type: 'webinar_registration_consultant',
        relatedTable: 'webinar_registrations',
        relatedId: row.id,
        data: Object.assign({}, data, {
          registrant_name: clean(row.name, 120),
          registrant_email: to,
          action_link: `${siteUrl}/consultant-dashboard`,
        }),
      });
    } catch (error) {
      console.warn('Webinar host email failed:', error && error.message);
    }
  }

  try {
    await invokeEmail(url, serviceKey, {
      to: '',
      recipientName: 'Admin',
      recipientRole: 'admin',
      type: 'new_webinar_registration_admin',
      relatedTable: 'webinar_registrations',
      relatedId: row.id,
      data: Object.assign({}, data, {
        registrant_name: clean(row.name, 120),
        registrant_email: to,
      }),
    });
  } catch (error) {
    console.warn('Webinar admin email failed:', error && error.message);
  }

  /* Only claim it once the attendee actually has it: these flags are what stops
     the browser sending a second copy, so setting them after a failure would lose
     the email entirely. */
  if (!attendeeSent) return row;
  const now = new Date().toISOString();
  try {
    return await utils.patchById('webinar', row.id, {
      registration_email_sent: true,
      registration_email_sent_at: now,
      confirmation_email_sent: true,
      confirmation_email_sent_at: now,
      updated_at: now,
    });
  } catch (error) {
    console.warn('Webinar email flag update failed:', error && error.message);
    return row;
  }
}

module.exports = { sendWebinarRegistrationEmails, alreadyEmailed };
