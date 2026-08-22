// Guidcy transactional email Edge Function using Resend.
// Required secrets: RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL, ADMIN_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUBJECTS: Record<string, string> = {
  user_welcome: "Welcome to Guidcy",
  booking_created_user: "Your Guidcy booking request has been received",
  booking_confirmed_user: "Your Guidcy session is confirmed",
  payment_success_user: "Payment successful for your Guidcy session",
  booking_cancelled_user: "Your Guidcy session has been cancelled",
  webinar_registration_user: "You are registered for the Guidcy webinar",
  webinar_registration_consultant: "New registration for your webinar",
  new_webinar_registration_admin: "New webinar registration received",
  job_application_submitted_user: "Your job application has been submitted",
  job_post_submitted_consultant: "Your job post has been submitted for review",
  support_ticket_created_user: "Your support request has been received",
  dispute_created_user: "Your dispute has been submitted",
  consultant_signup_submitted: "Your Guidcy consultant profile has been submitted",
  consultant_approved: "Your Guidcy consultant profile is approved",
  consultant_rejected: "Your Guidcy consultant profile needs changes",
  new_consultant_admin: "New consultant approval required on Guidcy",
  new_booking_consultant: "New session booking received on Guidcy",
  new_booking_admin: "New booking created on Guidcy",
  payment_received_consultant: "Payment received for your Guidcy session",
  payment_received_admin: "New payment received on Guidcy",
  session_cancelled_consultant: "A booked session has been cancelled",
  payout_completed_consultant: "Your Guidcy payout has been completed",
  payout_pending_admin: "Consultant payout pending",
  refund_request_admin: "Refund action required on Guidcy",
  new_webinar_admin: "New webinar submitted on Guidcy",
  new_job_post_admin: "New job post approval required",
  job_reported_admin: "Job reported by user on Guidcy",
  support_ticket_admin: "New support ticket received",
  dispute_created_admin: "New dispute raised on Guidcy",
  marketplace_buyer_email: "Your Guidcy notes are ready",
  marketplace_seller_email: "Your Guidcy notes received a new sale",
};

type EmailPayload = {
  to?: string;
  recipientName?: string;
  recipientRole?: string;
  type?: string;
  data?: Record<string, unknown>;
  relatedTable?: string;
  relatedId?: string;
};

function clean(value: unknown, max = 500): string {
  return String(value ?? "").replace(/[\r\n|]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pick(data: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = clean(data[key]);
    if (value) return value;
  }
  return fallback;
}

function uuidOrNull(value: unknown): string | null {
  const text = clean(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function money(value: unknown): string {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? "INR " + Math.round(n).toLocaleString("en-IN") : "";
}

function detailsFor(type: string, data: Record<string, unknown>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const add = (label: string, value: unknown) => {
    const text = clean(value);
    if (text) rows.push([label, text]);
  };

  if (/booking|payment|session|payout/i.test(type)) {
    add("Booking ID", pick(data, ["booking_id", "id", "reference"]));
    add("User", pick(data, ["user_name", "client_name", "name"]));
    add("Consultant", pick(data, ["consultant_name", "expert_name"]));
    add("Session", pick(data, ["session_title", "category", "session_type"]));
    add("Date", pick(data, ["date_label", "session_date", "booking_date", "date"]));
    add("Time", pick(data, ["time_slot", "session_time", "booking_time", "time"]));
    add("Amount", money(pick(data, ["payment_amount", "total_amount", "amount", "price"])));
    add("Payment ID", pick(data, ["razorpay_payment_id", "razorpay_order_id", "payment_id", "transaction_id"]));
    add("Payout transaction ID", pick(data, ["payout_transaction_id", "payout_txn", "utr"]));
    add("Status", pick(data, ["status", "payment_status", "session_status", "payout_status"]));
    add("Meeting link", pick(data, ["meet_link", "meeting_link", "join_link"]));
  } else if (/webinar/i.test(type)) {
    add("Webinar", pick(data, ["webinar_title", "title", "name"]));
    add("Date", pick(data, ["webinar_date", "date", "date_label"]));
    add("Time", pick(data, ["webinar_time", "time", "time_slot"]));
    add("Host", pick(data, ["host_name", "consultant_name", "speaker_name"]));
    add("Registrant", pick(data, ["registrant_name", "user_name", "name"]));
    add("Payment status", pick(data, ["payment_status"]));
    add("Join link", pick(data, ["join_link", "webinar_link", "meeting_link", "link"]));
  } else if (/job|work/i.test(type)) {
    add("Title", pick(data, ["job_title", "title"]));
    add("Applicant", pick(data, ["applicant_name", "user_name", "name"]));
    add("Applicant email", pick(data, ["applicant_email", "user_email", "email"]));
    add("Employer", pick(data, ["employer_name", "company_name"]));
    add("Status", pick(data, ["status", "verification_status"]));
  } else {
    for (const [key, value] of Object.entries(data).slice(0, 12)) add(key.replace(/_/g, " "), value);
  }
  return rows;
}

function intro(type: string, name: string, role: string): string {
  if (type === "user_welcome") return `Hi ${name}, welcome to Guidcy. Your account is ready.`;
  if (/booking_confirmed/i.test(type)) return `Hi ${name}, your Guidcy session has been confirmed.`;
  if (/payment_success|payment_received/i.test(type)) return `Hi ${name}, payment has been received successfully.`;
  if (/payout_completed/i.test(type)) return `Hi ${name}, your Guidcy payout has been marked as completed.`;
  if (/webinar_registration/i.test(type)) return `Hi ${name}, webinar registration details are below.`;
  if (/consultant_approved/i.test(type)) return `Hi ${name}, your consultant profile is approved and ready on Guidcy.`;
  if (/consultant_rejected/i.test(type)) return `Hi ${name}, your consultant profile was reviewed and needs changes before approval.`;
  if (role === "admin") return "Hi Admin, a new Guidcy action requires review.";
  return `Hi ${name}, here is your Guidcy update.`;
}

function renderEmail(subject: string, type: string, name: string, role: string, data: Record<string, unknown>, siteUrl: string) {
  const rows = detailsFor(type, data);
  const detailsHtml = rows.map(([label, value]) => `<tr><td style="padding:9px 0;color:#64748b;border-bottom:1px solid #e5edf7">${esc(label)}</td><td style="padding:9px 0;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #e5edf7">${esc(value)}</td></tr>`).join("");
  const detailsText = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const actionLink = pick(data, ["action_link", "join_link", "meet_link", "meeting_link", "url", "link"], siteUrl);
  const actionText = pick(data, ["action_text"], /webinar/i.test(type) ? "View webinar" : /booking|session/i.test(type) ? "View session" : "Open Guidcy");
  const html = `<!doctype html><html><body style="margin:0;background:#f6fbff;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:640px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #d8e8f5;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,.08)"><div style="background:linear-gradient(135deg,#1E72BE,#3DB84A);padding:24px;color:#fff"><div style="font-size:28px;font-weight:900">Guidcy</div><div style="font-size:13px;opacity:.92;margin-top:4px">Guidance Made Simple</div></div><div style="padding:28px"><h1 style="font-size:24px;line-height:1.2;margin:0 0 10px;color:#0f172a">${esc(subject)}</h1><p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 20px">${esc(intro(type, name || "there", role))}</p>${detailsHtml ? `<div style="background:#f8fbff;border:1px solid #d8e8f5;border-radius:14px;padding:16px;margin:18px 0"><table style="width:100%;border-collapse:collapse;font-size:14px">${detailsHtml}</table></div>` : ""}<div style="text-align:center;margin:24px 0"><a href="${esc(actionLink)}" target="_blank" style="display:inline-block;background:#1E72BE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:800;font-size:14px">${esc(actionText)}</a></div><p style="font-size:13px;line-height:1.6;color:#64748b;margin:18px 0 0">For help, contact <a href="mailto:guidcytechnologies@gmail.com" style="color:#1E72BE">guidcytechnologies@gmail.com</a>.</p></div><div style="border-top:1px solid #e5edf7;background:#f8fbff;padding:16px 28px;font-size:12px;color:#64748b">This transactional email was sent by Guidcy.</div></div></div></body></html>`;
  const text = `${subject}\n\n${intro(type, name || "there", role)}\n\n${detailsText}\n\nNeed help? Contact guidcytechnologies@gmail.com\n${siteUrl}`;
  return { html, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Guidcy <notifications@guidcy.com>";
  const siteUrl = Deno.env.get("SITE_URL") || "https://www.guidcy.com";
  const adminEmail = Deno.env.get("ADMIN_EMAIL") || "guidcytechnologies@gmail.com";
  const admin = supabaseUrl && serviceRole ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } }) : null;

  let payload: EmailPayload = {};
  try { payload = await req.json(); } catch (_) {}
  const type = clean(payload.type || "general_notification", 90);
  const data = payload.data || {};
  const role = clean(payload.recipientRole || "user", 40);
  const to = clean(payload.to || (role === "admin" ? adminEmail : ""), 120);
  const name = clean(payload.recipientName || (role === "admin" ? "Admin" : pick(data, ["user_name", "consultant_name", "name"], "there")), 80);
  const relatedTable = clean(payload.relatedTable || data.related_table || "", 80);
  const rawRelatedId = clean(payload.relatedId || data.related_id || data.booking_id || data.id, 120);
  const relatedId = uuidOrNull(rawRelatedId);
  const subject = SUBJECTS[type] || clean(data.subject || "Guidcy notification", 150);
  const email = renderEmail(subject, type, name, role, data, siteUrl);

  async function insertLog(status: string, errorMessage = "", providerMessageId = "") {
    if (!admin) return;
    try {
      await admin.from("notification_logs").insert({
        recipient_email: to || null,
        recipient_role: role,
        notification_type: type,
        channel: "email",
        subject,
        message: email.text.slice(0, 5000),
        status,
        provider: "resend",
        provider_message_id: providerMessageId || null,
        error_message: errorMessage || null,
        related_table: relatedTable || null,
        related_id: relatedId,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      });
    } catch (e) {
      console.error("notification log insert failed", e);
    }
  }

  try {
    if (!to) {
      await insertLog("failed", "Recipient email missing");
      return new Response(JSON.stringify({ ok: false, error: "Recipient email missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!resendKey) {
      await insertLog("failed", "RESEND_API_KEY is not configured");
      return new Response(JSON.stringify({ ok: false, error: "Email provider is not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (admin && type === "webinar_registration_user" && relatedTable === "webinar_registrations" && rawRelatedId) {
      const { data: registration } = await admin.from("webinar_registrations")
        .select("registration_email_sent,confirmation_email_sent")
        .eq("id", rawRelatedId)
        .maybeSingle();
      if (registration?.registration_email_sent || registration?.confirmation_email_sent) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (admin && relatedTable && relatedId) {
      const { data: existing } = await admin.from("notification_logs")
        .select("id")
        .eq("recipient_email", to)
        .eq("notification_type", type)
        .eq("related_table", relatedTable)
        .eq("related_id", relatedId)
        .eq("status", "sent")
        .limit(1);
      if (existing?.length) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html: email.html, text: email.text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body?.message || body?.error || `Resend error ${res.status}`;
      await insertLog("failed", String(message));
      return new Response(JSON.stringify({ ok: false, error: message }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const providerId = body?.id || body?.data?.id || "";
    await insertLog("sent", "", providerId);
    if (admin && type === "webinar_registration_user" && relatedTable === "webinar_registrations" && rawRelatedId) {
      const now = new Date().toISOString();
      await admin.from("webinar_registrations").update({
        registration_email_sent: true,
        registration_email_sent_at: now,
        confirmation_email_sent: true,
        confirmation_email_sent_at: now,
        updated_at: now,
      }).eq("id", rawRelatedId);
    }
    return new Response(JSON.stringify({ ok: true, provider_message_id: providerId || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await insertLog("failed", String(e?.message || e));
    return new Response(JSON.stringify({ ok: false, error: "Email sending failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
