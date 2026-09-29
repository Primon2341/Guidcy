const { getAuthenticatedUser, first, clean } = require('./razorpay-utils');
const { isAdmin, fail, rateLimit } = require('./api-security');

// Templates receive persisted event data, never a caller-selected recipient/link.
async function authorizeEmail(req, payload) {
  const type = clean(payload.type || payload.event, 90);
  let user;
  try { user = await getAuthenticatedUser(req); }
  catch (error) {
    if (!['support_ticket_created_user','support_ticket_admin','dispute_created_user','dispute_created_admin'].includes(type)) throw error;
    await rateLimit(req,'guest-support-email',5,3600);
    user={};
  }
  const admin = await isAdmin(user);
  const role = clean(payload.recipientRole || 'user', 30);
  if (!['user','consultant','admin'].includes(role)) throw fail('Invalid notification recipient');
  const id = clean(payload.bookingId || payload.booking_id || payload.relatedId || payload.data?.booking_id || payload.data?.id, 120);
  const profile = async uid => uid ? await first(`profiles?id=eq.${encodeURIComponent(uid)}&select=id,full_name,email`) : null;
  const get = (table, key=id) => first(`${table}?id=eq.${encodeURIComponent(key)}&select=*`);
  const same = (a,b) => Boolean(a && b && String(a)===String(b));
  const denied = () => { throw fail('This notification is not authorized'); };
  const paid = row => row.payment_verified === true && ['success','free'].includes(row.payment_status);
  let row, table, recipient, data;
  if (type === 'admin_referral_code') {
    if (!admin) denied();
    return payload;
  }
  if (type === 'user_welcome') {
    recipient=await profile(user.id);row=recipient;table='profiles';
  } else if (/^(booking_|payment_|session_|new_booking_|refund_request_|payout_)/.test(type) || type==='booking_confirmation_pair') {
    table='bookings';row=await get(table);if(!row) denied();
    const consultant=await get('consultants',row.consultant_id);
    if(!admin&&!same(row.user_id,user.id)&&!same(consultant?.profile_id,user.id)) denied();
    if(/confirmed|confirmation_pair|payment_|payout_/.test(type)&&!paid(row)) denied();
    if(/cancelled/.test(type)&&row.status!=='cancelled') denied();
    if(/payout_completed/.test(type)&&row.payout_status!=='paid') denied();
    if(/refund_request/.test(type)&&!['refund_pending','refund_processing','refund_failed'].includes(row.refund_status)) denied();
    recipient=await profile(role==='consultant'?consultant?.profile_id:row.user_id);
    if(type==='booking_confirmation_pair')return {type,bookingId:row.id,booking:row};
  } else if (/^marketplace_(buyer|seller)_email$/.test(type)) {
    table='marketplace_orders';row=await get(table);if(!row||!paid(row)||!row.download_granted)denied();
    if(!admin&&!same(row.buyer_id,user.id)&&!same(row.seller_id,user.id))denied();
    recipient=await profile(type==='marketplace_seller_email'?row.seller_id:row.buyer_id);
  } else if (/^(webinar_registration_|new_webinar_registration_)/.test(type)) {
    table='webinar_registrations';row=await get(table);if(!row||!paid(row)||row.registration_status!=='confirmed'||row.is_deleted)denied();
    const webinar=await get('webinars',row.webinar_id);
    if(!admin&&!same(row.user_id,user.id)&&!same(webinar?.created_by,user.id))denied();
    recipient=role==='consultant'?await profile(webinar?.created_by):{email:row.email,full_name:row.name};
    data={...row,webinar_title:webinar?.title,webinar_date:webinar?.date,webinar_time:webinar?.time,host_name:webinar?.speaker};
  } else if (/^(consultant_|new_consultant_)/.test(type)) {
    table='consultants';row=await get(table);if(!row||(!admin&&!same(row.profile_id,user.id)))denied();
    if(/approved/.test(type)&&(!row.is_approved||row.approval_status!=='approved'))denied();
    if(/rejected/.test(type)&&row.approval_status!=='rejected')denied();
    if(/profile_update_required/.test(type)&&!row.profile_update_required)denied();
    if(/profile_restored/.test(type)&&(!row.is_active||row.profile_update_required))denied();
    recipient=await profile(row.profile_id);
  } else if (/^new_webinar_admin$/.test(type)) {
    table='webinars';row=await get(table);if(!row||(!admin&&!same(row.created_by,user.id)))denied();
  } else if (/^(job_application_)/.test(type)) {
    table='job_applications';row=await get(table);if(!row)denied();
    const job=await get('job_posts',row.job_id);
    if(!admin&&!same(row.applicant_id,user.id)&&!same(job?.posted_by,user.id))denied();
    if(/shortlisted|rejected/.test(type)&&(!admin&&!same(job?.posted_by,user.id)))denied();
    if(/shortlisted/.test(type)&&row.status!=='shortlisted')denied();
    if(/rejected/.test(type)&&row.status!=='rejected')denied();
    recipient=await profile(row.applicant_id);data={...row,job_title:job?.title};
  } else if (/^(job_post_|new_job_post_|job_reported_)/.test(type)) {
    table='job_posts';row=await get(table);if(!row||(!admin&&!same(row.posted_by,user.id)))denied();
    recipient=await profile(row.posted_by);
  } else if (/^(support_ticket_|dispute_)/.test(type)) {
    table=type.startsWith('support_')?'support_tickets':'disputes';row=await get(table);if(!row)denied();
    const guest=!user.id&&!row.created_by&&!row.raised_by&&!row.booking_id&&Date.now()-Date.parse(row.created_at)<600000;
    if(!admin&&!guest&&!same(row.created_by,user.id)&&!same(row.raised_by,user.id))denied();
    if(/reply|status_updated/.test(type)&&!admin)denied();
    recipient=row.email?{email:row.email,full_name:row.name}:await profile(row.raised_by||row.created_by);
  } else denied();
  data ||= row;
  const base=new URL(process.env.SITE_URL||'https://www.guidcy.com').origin;
  const to=role==='admin'?(process.env.ADMIN_EMAIL||'guidcytechnologies@gmail.com'):recipient?.email;
  if(!to)denied();
  return {type,recipientRole:role,to,recipientName:recipient?.full_name||'Admin',relatedTable:table,relatedId:row.id,
    data:{...data,action_link:base+(role==='admin'?'/admin-dashboard':role==='consultant'?'/consultant-dashboard':'/dashboard')}};
}

module.exports={authorizeEmail};
