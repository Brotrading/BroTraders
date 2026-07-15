// GET  /api/rewards/firm-email         — list firm emails (with verified status) for authenticated user
// POST /api/rewards/firm-email { firm_slug, email }             — save email; auto-verify if matches login email, else send 6-digit code
// POST /api/rewards/firm-email { firm_slug, action:"verify", code } — verify with code
// POST /api/rewards/firm-email { firm_slug, action:"resend" }   — resend verification code
//
// Requires env: RESEND_API_KEY, optionally RESEND_FROM_EMAIL (default: noreply@propfirmbro.com)

import { jsonResponse, jsonError, verifySupabaseToken } from "./_lib.js";

const VALID_SLUGS = new Set(["apex","daytraders","fundedseat","lucid","phidias","mffu","nexgen","topone","tradeify"]);
const FIRM_NAMES  = {
  apex: "Apex Trader Funding", alpha: "Alpha Futures", daytraders: "Daytraders.com",
  fundedseat: "FundedSeat", lucid: "Lucid Trading", phidias: "Phidias PropFirm",
  mffu: "My Funded Futures", nexgen: "NexGen Funding", topone: "Top One Futures",
  tradeify: "Tradeify", yrm: "YRM Prop",
};
const CODE_TTL_MS = 30 * 60 * 1000;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendVerificationEmail(env, { to, firmName, code }) {
  if (!env.RESEND_API_KEY) {
    console.error("[firm-email] RESEND_API_KEY not configured");
    return false;
  }
  const from = env.RESEND_FROM_EMAIL || "noreply@propfirmbro.com";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Verify your ${firmName} email — Bro Rewards`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1117;color:#e2e8f0;border-radius:12px;">
            <h2 style="margin:0 0 16px;color:#ff6b00;">Bro Rewards</h2>
            <p style="margin:0 0 8px;color:#94a3b8;">Use the code below to verify your <strong style="color:#e2e8f0;">${firmName}</strong> email address.</p>
            <div style="background:#1a1d2e;border:1px solid #2d3748;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
              <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#ff6b00;">${code}</span>
            </div>
            <p style="margin:0;font-size:13px;color:#64748b;">This code expires in 30 minutes. If you did not request this, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });
    if (!res.ok) console.error("[firm-email] Resend error:", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("[firm-email] Resend fetch error:", e);
    return false;
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);
  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  const rows = await env.DB
    .prepare(`SELECT firm_slug, email, verified, locked FROM user_firm_emails WHERE user_id = ? ORDER BY firm_slug`)
    .bind(user.id)
    .all();

  return jsonResponse({ firm_emails: rows.results || [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);
  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  let body = {};
  try { body = await request.json(); } catch { return jsonError("invalid_json", 400); }

  const firmSlug = (body.firm_slug || "").toLowerCase().trim();
  if (!VALID_SLUGS.has(firmSlug)) return jsonError("invalid_firm_slug", 400);

  if (body.action === "verify") return handleVerify(env, user, firmSlug, body.code);
  if (body.action === "resend") return handleResend(env, user, firmSlug);
  return handleSave(env, user, firmSlug, body.email);
}

async function handleSave(env, user, firmSlug, rawEmail) {
  const email = (rawEmail || "").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonError("invalid_email", 400);
  }

  const existing = await env.DB
    .prepare(`SELECT locked FROM user_firm_emails WHERE user_id = ? AND firm_slug = ?`)
    .bind(user.id, firmSlug)
    .first();
  if (existing?.locked) return jsonError("firm_email_locked", 409, { firm_slug: firmSlug });

  const userEmail    = (user.email || "").toLowerCase().trim();
  const autoVerified = email === userEmail ? 1 : 0;
  const now          = new Date().toISOString();

  if (autoVerified) {
    await env.DB
      .prepare(`
        INSERT INTO user_firm_emails (user_id, firm_slug, email, verified, locked, created_at)
        VALUES (?, ?, ?, 1, 0, ?)
        ON CONFLICT(user_id, firm_slug) DO UPDATE SET
          email = excluded.email, verified = 1,
          verification_code = NULL, verification_expires_at = NULL
      `)
      .bind(user.id, firmSlug, email, now)
      .run();
    return jsonResponse({ ok: true, firm_slug: firmSlug, email, verified: true, auto_verified: true });
  }

  const code    = generateCode();
  const expires = new Date(Date.now() + CODE_TTL_MS).toISOString();

  await env.DB
    .prepare(`
      INSERT INTO user_firm_emails (user_id, firm_slug, email, verified, locked, verification_code, verification_expires_at, verification_attempts, created_at)
      VALUES (?, ?, ?, 0, 0, ?, ?, 0, ?)
      ON CONFLICT(user_id, firm_slug) DO UPDATE SET
        email = excluded.email, verified = 0,
        verification_code = excluded.verification_code,
        verification_expires_at = excluded.verification_expires_at,
        verification_attempts = 0
    `)
    .bind(user.id, firmSlug, email, code, expires, now)
    .run();

  const sent = await sendVerificationEmail(env, { to: email, firmName: FIRM_NAMES[firmSlug], code });
  if (!sent) return jsonError("email_send_failed", 500);

  return jsonResponse({ ok: true, firm_slug: firmSlug, email, verified: false, needs_verification: true });
}

const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS  = 60_000; // 60 seconds between resend requests

async function handleVerify(env, user, firmSlug, rawCode) {
  const code = (rawCode || "").trim();
  if (!code) return jsonError("code_required", 400);

  const row = await env.DB
    .prepare(`SELECT verification_code, verification_expires_at, verification_attempts FROM user_firm_emails WHERE user_id = ? AND firm_slug = ? AND verified = 0`)
    .bind(user.id, firmSlug)
    .first();

  if (!row) return jsonError("no_pending_verification", 404);

  const attempts = row.verification_attempts || 0;
  if (attempts >= MAX_VERIFY_ATTEMPTS) return jsonError("too_many_attempts", 429);

  if (new Date(row.verification_expires_at) < new Date()) return jsonError("code_expired", 400);

  if (row.verification_code !== code) {
    const newAttempts = attempts + 1;
    if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
      // Invalidate code — user must request a new one via resend.
      await env.DB
        .prepare(`UPDATE user_firm_emails SET verification_attempts = ?, verification_code = NULL, verification_expires_at = NULL WHERE user_id = ? AND firm_slug = ?`)
        .bind(newAttempts, user.id, firmSlug)
        .run();
      return jsonError("too_many_attempts", 429);
    }
    await env.DB
      .prepare(`UPDATE user_firm_emails SET verification_attempts = ? WHERE user_id = ? AND firm_slug = ?`)
      .bind(newAttempts, user.id, firmSlug)
      .run();
    return jsonError("invalid_code", 400, { attempts_remaining: MAX_VERIFY_ATTEMPTS - newAttempts });
  }

  await env.DB
    .prepare(`UPDATE user_firm_emails SET verified = 1, verification_code = NULL, verification_expires_at = NULL, verification_attempts = 0 WHERE user_id = ? AND firm_slug = ?`)
    .bind(user.id, firmSlug)
    .run();

  return jsonResponse({ ok: true, firm_slug: firmSlug, verified: true });
}

async function handleResend(env, user, firmSlug) {
  const row = await env.DB
    .prepare(`SELECT email, locked, last_resend_at FROM user_firm_emails WHERE user_id = ? AND firm_slug = ? AND verified = 0`)
    .bind(user.id, firmSlug)
    .first();

  if (!row)       return jsonError("no_pending_verification", 404);
  if (row.locked) return jsonError("firm_email_locked", 409);

  if (row.last_resend_at) {
    const elapsed = Date.now() - new Date(row.last_resend_at).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return jsonError("resend_too_soon", 429, { seconds_remaining: secondsLeft });
    }
  }

  const code    = generateCode();
  const expires = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const now     = new Date().toISOString();

  await env.DB
    .prepare(`UPDATE user_firm_emails SET verification_code = ?, verification_expires_at = ?, verification_attempts = 0, last_resend_at = ? WHERE user_id = ? AND firm_slug = ?`)
    .bind(code, expires, now, user.id, firmSlug)
    .run();

  const sent = await sendVerificationEmail(env, { to: row.email, firmName: FIRM_NAMES[firmSlug], code });
  if (!sent) return jsonError("email_send_failed", 500);

  return jsonResponse({ ok: true });
}
