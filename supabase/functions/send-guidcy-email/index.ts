// Guidcy transactional email Edge Function using Resend.
// Required Supabase Edge Function secrets:
// RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL, ADMIN_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Deploy: supabase functions deploy send-guidcy-email
// Secrets: supabase secrets set RESEND_API_KEY=... RESEND_FROM_EMAIL="Guidcy <notifications@guidcy.com>" SITE_URL=https://www.guidcy.com ADMIN_EMAIL=guidcytechnologies@gmail.com SUPABASE_SERVICE_ROLE_KEY=...
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EmailPayload = {
  to?: string;
  recipientName?: string;
  recipientRole?: "user" | "consultant" | "admin" | string;
  type?: string;
  data?: Record<string, unknown>;
  relatedTable?: string;
  relatedId?: string;
};

const SUBJECTS: Record<string, string> = {
  user_welcome: "Welcome to Guidcy",
  booking_created_user: "Your Guidcy booking request has been received",
  booking_confirmed_user: "Your Guidcy session is confirmed",
  payment_success_user: "Payment successful for your Guidcy session",
  session_reminder_user: "Reminder: Your Guidcy session starts soon",
  booking_cancelled_user: "Your Guidcy session has been cancelled",
  refund_initiated_user: "Your Guidcy refund has been initiated",
  refund_completed_user: "Your Guidcy refund has been processed",
  webinar_registration_user: "You are registered for the Guidcy webinar",
  webinar_reminder_user: "Reminder: Your Guidcy webinar starts soon",
  job_application_submitted_user: "Your job application has been submitted",
  support_ticket_created_user: "Your support request has been received",
  dispute_created_user: "Your dispute has been submitted",
  consultant_signup_submitted: "Your Guidcy consultant profile has been submitted",
  consultant_approved: "Your Guidcy consultant profile is approved",
  consultant_rejected: "Your Guidcy consultant profile needs changes",
  new_booking_consultant: "New session booking received on Guidcy",
  booking_confirmed_consultant: "A Guidcy session booking is confirmed",
  payment_received_consultant: "Payment received for your Guidcy session",
  session_cancelled_consultant: "A booked session has been cancelled",
  payout_completed_consultant: "Your Guidcy payout has been completed",
  bank_details_updated_consultant: "Your bank details were updated",
  webinar_published_consultant: "Your Guidcy webinar has been published",
  webinar_registration_consultant: "New registration for your webinar",
  job_post_submitted_consultant: "Your job post has been submitted for review",
  job_post_approved_consultant: "Your job post has been approved",
  job_post_rejected_consultant: "Your job post needs changes",
  new_consultant_admin: "New consultant approval required on Guidcy",
  new_booking_admin: "New booking created on Guidcy",
  payment_received_admin: "New payment received on Guidcy",
  payout_pending_admin: "Consultant payout pending",
  consultant_bank_updated_admin: "Consultant bank details updated",
  refund_request_admin: "Refund action required on Guidcy",
  new_webinar_admin: "New webinar submitted on Guidcy",
  new_webinar_registration_admin: "New webinar registration received",
  new_job_post_admin: "New job post approval required",
  job_reported_admin: "Job reported by user on Guidcy",
  support_ticket_admin: "New support ticket received",
  dispute_created_admin: "New dispute raised on Guidcy",
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function value(data: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const v = data[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}

function money(v: unknown): string {
  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—";
}

function buildDetails(type: string, data: Record<string, unknown>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const add = (label: string, val: unknown) => {
    if (val !== undefined && val !== null && String(val).trim() !== "") rows.push([label, String(val)]);
  };

  if (type.includes("booking") || type.includes("payment") || type.includes("session") || type.includes("payout")) {
    add("Booking ID", value(data, ["booking_id", "id", "reference"]));
    add("User", value(data, ["user_name", "client_name", "name"]));
    add("Consultant", value(data, ["consultant_name", "expert_name"]));
    add("Session", value(data, ["session_title", "category", "session_type"]));
    add("Date", value(data, ["date_label", "session_date", "booking_date", "date"]));
    add("Time", value(data, ["time_slot", "session_time", "booking_time", "time"]));
    add("Amount paid", money(value(data, ["payment_amount", "total_amount", "amount", "price"])));
    add("Guidcy commission", money(value(data, ["platform_fee", "commission_amount"]))) ;
    add("Consultant payable", money(value(data, ["consultant_payout_amount", "payout_amount", "payable_amount"])));
    add("Payment ID", value(data, ["payu_txnid", "payu_mihpayid", "payment_id", "transaction_id"]));
    add("Payout transaction ID", value(data, ["payout_transaction_id", "payout_txn", "utr"]));
    add("Status", value(data, ["status", "payment_status", "session_status", "payout_status"]));
    add("Reason", value(data, ["cancellation_reason", "rejection_reason", "reason"]));
    add("Meeting link", value(data, ["meet_link", "meeting_link", "join_link"]));
  } else if (type.includes("webinar")) {
    add("Webinar", value(data, ["webinar_title", "title", "name"]));
    add("Date", value(data, ["webinar_date", "date", "date_label"]));
    add("Time", value(data, ["webinar_time", "time", "time_slot"]));
    add("Host", value(data, ["host_name", "consultant_name", "speaker_name", "published_by_name"]));
    add("Registration status", value(data, ["registration_status", "status"], "registered"));
    add("Payment status", value(data, ["payment_status"]));
    add("Join link", value(data, ["join_link", "webinar_link", "meeting_link", "link"]));
  } else if (type.includes("job")) {
    add("Job title", value(data, ["job_title", "title"]));
    add("Applicant", value(data, ["applicant_name", "user_name", "name"]));
    add("Applicant email", value(data, ["applicant_email", "user_email", "email"]));
    add("Employer", value(data, ["employer_name", "company_name"]));
    add("Status", value(data, ["status", "verification_status"]));
    add("Reason", value(data, ["reason", "rejection_reason"]));
  } else if (type.includes("support") || type.includes("dispute")) {
    add("Reference", value(data, ["ticket_id", "dispute_id", "id"]));
    add("Name", value(data, ["user_name", "name"]));
    add("Email", value(data, ["user_email", "email"]));
    add("Subject", value(data, ["ticket_subject", "subject", "title"]));
    add("Message", value(data, ["message", "description", "issue"]));
  } else {
    for (const [k, v] of Object.entries(data || {}).slice(0, 12)) add(k.replace(/_/g, " "), v as string);
  }
  return rows;
}

function intro(type: string, name: string, role: string): string {
  if (type === "user_welcome") return `Hi ${name}, welcome to Guidcy. Your account is ready.`;
  if (type.includes("booking_confirmed")) return `Hi ${name}, your Guidcy session has been confirmed.`;
  if (type.includes("booking_created")) return `Hi ${name}, your Guidcy booking request has been received.`;
  if (type.includes("payment_success") || type.includes("payment_received")) return `Hi ${name}, payment has been received successfully.`;
  if (type.includes("payout_completed")) return `Hi ${name}, your Guidcy payout has been marked as completed.`;
  if (type.includes("cancelled")) return `Hi ${name}, this Guidcy session update requires your attention.`;
  if (type.includes("webinar_registration")) return `Hi ${name}, webinar registration details are below.`;
  if (type.includes("consultant_approved")) return `Hi ${name}, your consultant profile is approved and ready on Guidcy.`;
  if (type.includes("consultant_rejected")) return `Hi ${name}, your consultant profile needs changes before approval.`;
  if (role === "admin") return `Hi Admin, a new Guidcy action requires review.`;
  return `Hi ${name}, here is your Guidcy update.`;
}

function renderHtml(subject: string, type: string, recipientName: string, recipientRole: string, data: Record<string, unknown>, siteUrl: string): string {
  const rows = buildDetails(type, data).map(([k, v]) => `<tr><td style="padding:9px 0;color:#64748b;border-bottom:1px solid #e5edf7">${esc(k)}</td><td style="padding:9px 0;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #e5edf7">${esc(v)}</td></tr>`).join("");
  const actionLink = value(data, ["action_link", "join_link", "meet_link", "meeting_link", "url", "link"], siteUrl);
  const actionText = value(data, ["action_text"], type.includes("webinar") ? "View webinar" : type.includes("booking") || type.includes("session") ? "View session" : "Open Guidcy");
  return `<!doctype html><html><body style="margin:0;background:#f6fbff;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:640px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #d8e8f5;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,.08)"><div style="background:linear-gradient(135deg,#1E72BE,#3DB84A);padding:24px;color:#fff"><div style="font-size:28px;font-weight:900;letter-spacing:-.4px">Guidcy</div><div style="font-size:13px;opacity:.92;margin-top:4px">Guidance Made Simple</div></div><div style="padding:28px"><h1 style="font-size:24px;line-height:1.2;margin:0 0 10px;color:#0f172a">${esc(subject)}</h1><p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 20px">${esc(intro(type, recipientName || "there", recipientRole))}</p>${rows ? `<div style="background:#f8fbff;border:1px solid #d8e8f5;border-radius:14px;padding:16px;margin:18px 0"><table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table></div>` : ""}${actionLink ? `<div style="text-align:center;margin:24px 0"><a href="${esc(actionLink)}" target="_blank" style="display:inline-block;background:#1E72BE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:800;font-size:14px">${esc(actionText)}</a></div>` : ""}<p style="font-size:13px;line-height:1.6;color:#64748b;margin:18px 0 0">For help, contact <a href="mailto:guidcytechnologies@gmail.com" style="color:#1E72BE">guidcytechnologies@gmail.com</a>.</p></div><div style="border-top:1px solid #e5edf7;background:#f8fbff;padding:16px 28px;font-size:12px;color:#64748b">This transactional email was sent by Guidcy. Visit <a href="${esc(siteUrl)}" style="color:#1E72BE">www.guidcy.com</a></div></div></div></body></html>`;
}

function renderText(subject: string, type: string, recipientName: string, recipientRole: string, data: Record<string, unknown>, siteUrl: string): string {
  const details = buildDetails(type, data).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `${subject}\n\n${intro(type, recipientName || "there", recipientRole)}\n\n${details}\n\nNeed help? Contact guidcytechnologies@gmail.com\n${siteUrl}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "Guidcy <notifications@guidcy.com>";
  const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.guidcy.com";
  const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "guidcytechnologies@gmail.com";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let payload: EmailPayload = {};
  try { payload = await req.json(); } catch (_) {}

  const type = String(payload.type || "general_notification");
  const data = payload.data || {};
  const recipientRole = String(payload.recipientRole || "user");
  const to = String(payload.to || (recipientRole === "admin" ? ADMIN_EMAIL : "")).trim();
  const recipientName = String(payload.recipientName || (recipientRole === "admin" ? "Admin" : value(data, ["user_name", "consultant_name", "name"], "there")));
  const relatedTable = payload.relatedTable || String(data.related_table || "");
  const relatedId = payload.relatedId || String(data.related_id || data.booking_id || data.id || "") || null;
  const subject = SUBJECTS[type] || String(data.subject || "Guidcy notification");
  const html = renderHtml(subject, type, recipientName, recipientRole, data, SITE_URL);
  const text = renderText(subject, type, recipientName, recipientRole, data, SITE_URL);

  async function insertLog(status: string, errorMessage = "", providerMessageId = "") {
    try {
      await admin.from("notification_logs").insert({
        recipient_email: to || null,
        recipient_role: recipientRole,
        notification_type: type,
        channel: "email",
        subject,
        message: text.slice(0, 5000),
        status,
        provider: "resend",
        provider_message_id: providerMessageId || null,
        error_message: errorMessage || null,
        related_table: relatedTable || null,
        related_id: relatedId || null,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      });
    } catch (e) { console.error("notification log insert failed", e); }
  }

  try {
    if (!to) {
      await insertLog("failed", "Recipient email missing");
      return new Response(JSON.stringify({ ok: false, error: "Recipient email missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!RESEND_API_KEY) {
      await insertLog("failed", "RESEND_API_KEY is not configured");
      return new Response(JSON.stringify({ ok: false, error: "Email provider is not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (relatedTable && relatedId) {
      const { data: existing } = await admin.from("notification_logs")
        .select("id")
        .eq("recipient_email", to)
        .eq("notification_type", type)
        .eq("related_table", relatedTable)
        .eq("related_id", relatedId)
        .eq("status", "sent")
        .limit(1);
      if (existing && existing.length) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text }),
    });
    const responseBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = responseBody?.message || responseBody?.error || `Resend error ${res.status}`;
      await insertLog("failed", String(msg));
      return new Response(JSON.stringify({ ok: false, error: msg }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await insertLog("sent", "", responseBody?.id || responseBody?.data?.id || "");
    return new Response(JSON.stringify({ ok: true, provider_message_id: responseBody?.id || responseBody?.data?.id || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await insertLog("failed", String(e?.message || e));
    return new Response(JSON.stringify({ ok: false, error: "Email sending failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
