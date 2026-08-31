import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SITE_URL = "https://www.guidcy.com";
const recentRequests = new Map<string, number>();

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validEmail(value: unknown) {
  const email = clean(value, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeRedirect(value: unknown) {
  const fallback = `${DEFAULT_SITE_URL}/login`;
  try {
    const url = new URL(clean(value, 500) || fallback);
    const hostname = url.hostname.toLowerCase();
    const allowed = hostname === "guidcy.com" || hostname === "www.guidcy.com" ||
      hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".vercel.app");
    return allowed && /^https?:$/.test(url.protocol) ? url.href : fallback;
  } catch (_) {
    return fallback;
  }
}

function isMissingUser(message: string) {
  return /user not found|no user|email not found|does not exist/i.test(message);
}

async function generateRecoveryLink(email: string, redirectTo: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) throw new Error("Recovery service is not configured");

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "recovery", email, options: { redirect_to: redirectTo } }),
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { error: text };
  }
  if (!response.ok) {
    const message = clean(body.msg || body.message || body.error || text || `Supabase error ${response.status}`, 300);
    if (isMissingUser(message)) return "";
    throw new Error(message);
  }
  const properties = body.properties && typeof body.properties === "object"
    ? body.properties as Record<string, unknown>
    : {};
  return clean(body.action_link || properties.action_link || "", 2200);
}

async function sendRecoveryEmail(email: string, actionLink: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") || Deno.env.get("EMAIL_FROM") ||
    "Guidcy <notifications@guidcy.com>";
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured");
  const subject = "Reset your Guidcy password";
  const html = `<!doctype html><html><body style="margin:0;background:#f6fbff;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #d8e8f5;border-radius:16px;overflow:hidden"><div style="background:#1E72BE;padding:24px;color:#fff"><div style="font-size:28px;font-weight:900">Guidcy</div><div style="font-size:13px;margin-top:4px">Password reset request</div></div><div style="padding:28px"><h1 style="font-size:22px;margin:0 0 10px">Reset your password</h1><p style="font-size:15px;line-height:1.6;color:#475569">Use the button below to set a new password for your Guidcy account.</p><div style="text-align:center;margin:26px 0"><a href="${esc(actionLink)}" target="_blank" style="display:inline-block;background:#1E72BE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:800">Reset password</a></div><p style="font-size:13px;color:#64748b;line-height:1.6">If you did not request this, you can ignore this email.</p></div></div></div></body></html>`;
  const text = `Reset your Guidcy password\n\nOpen this link to reset your password:\n${actionLink}\n\nIf you did not request this, ignore this email.`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: "guidcytechnologies@gmail.com",
      subject,
      html,
      text,
    }),
  });
  const providerText = await response.text();
  let providerBody: Record<string, unknown> = {};
  try {
    providerBody = providerText ? JSON.parse(providerText) : {};
  } catch (_) {
    providerBody = { error: providerText };
  }
  if (!response.ok) {
    throw new Error(clean(providerBody.message || providerBody.error || providerText || `Resend error ${response.status}`, 300));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_) {
    return json(400, { ok: false, error: "Invalid request" });
  }

  const email = validEmail(payload.email);
  if (!email) return json(400, { ok: false, error: "Enter a valid email address" });

  const now = Date.now();
  const previous = recentRequests.get(email) || 0;
  if (now - previous < 60_000) {
    return json(429, { ok: false, error: "Please wait a minute before requesting another reset link." });
  }
  recentRequests.set(email, now);

  try {
    const actionLink = await generateRecoveryLink(email, safeRedirect(payload.redirectTo));
    if (!actionLink) return json(200, { ok: true });
    if (!/^https:\/\//i.test(actionLink)) throw new Error("Could not generate a secure recovery link");
    await sendRecoveryEmail(email, actionLink);
    return json(200, { ok: true });
  } catch (error) {
    const detail = clean(error instanceof Error ? error.message : error, 300);
    console.error("Password recovery failed", detail);
    if (/only send testing emails|verify a domain|domain.*not verified/i.test(detail)) {
      return json(503, { ok: false, code: "resend_domain_unverified", error: "Guidcy's Resend sending domain is not verified yet." });
    }
    if (/RESEND_API_KEY is not configured/i.test(detail)) {
      return json(503, { ok: false, code: "resend_not_configured", error: "Guidcy's Resend email service is not configured." });
    }
    return json(502, { ok: false, error: "Could not deliver the reset email. Please try again shortly." });
  }
});
