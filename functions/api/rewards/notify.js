// POST /api/rewards/notify — sends automatic reminder emails.
// Auth: X-Admin-Token header (same token as admin dashboard).
//
// Call this daily from an external cron service (e.g. cron-job.org):
//   POST https://propfirmbro.com/api/rewards/notify
//   Header: X-Admin-Token: <your token>
//
// Sends:
//   1. "Your claim is still under review" — for claims pending 7–8 days (fires once per claim)
//   2. "Your streak is at risk!" — for users with an active streak who missed yesterday (fires once per gap)

import { jsonResponse, jsonError } from "./_lib.js";

async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || "BroTrading <noreply@propfirmbro.com>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!r.ok) console.error("[notify] email failed:", r.status, await r.text());
  } catch (e) {
    console.error("[notify] email error:", e?.message);
  }
}

function pendingClaimEmail(firmName) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;"><table width="480" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;border:1px solid #2d3248;"><tr><td style="padding:32px 28px;"><p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Bro Rewards</p><h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#f8fafc;">⏳ Your claim is still under review</h1><p style="margin:0 0 16px;font-size:15px;color:#cbd5e1;">Your Bro Points claim for <strong style="color:#f8fafc;">${firmName}</strong> is still being reviewed. We'll email you as soon as it's processed.</p><p style="margin:0 0 24px;font-size:13px;color:#64748b;">Most claims are reviewed within a few business days. If you have questions, reply to this email.</p><a href="https://propfirmbro.com/rewards/account.html" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">View your account →</a></td></tr></table></td></tr></table></body></html>`;
}

function streakAtRiskEmail(streak) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;"><table width="480" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;border:1px solid #2d3248;"><tr><td style="padding:32px 28px;"><p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Bro Rewards</p><h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#f8fafc;">⚠️ Your ${streak}-day streak is at risk!</h1><p style="margin:0 0 16px;font-size:15px;color:#cbd5e1;">You missed yesterday's daily bonus. Claim today to restore your streak — or it will reset to zero.</p><div style="background:#0f1117;border-radius:8px;padding:16px 20px;margin:0 0 24px;"><p style="margin:0 0 4px;font-size:12px;color:#64748b;">Your current streak</p><p style="margin:0;font-size:28px;font-weight:800;color:#f97316;">🔥 ${streak} days</p></div><a href="https://propfirmbro.com/rewards/account.html" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Restore my streak →</a></td></tr></table></td></tr></table></body></html>`;
}

const FIRM_NAMES = {
  apex: "Apex Trader Funding", alpha: "Alpha Futures", daytraders: "Daytraders.com",
  fundedseat: "FundedSeat", lucid: "Lucid Trading", phidias: "Phidias PropFirm",
  mffu: "My Funded Futures", nexgen: "NexGen Funding", topone: "Top One Futures",
  tradeify: "Tradeify", yrm: "YRM Prop",
};

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const expected = env.ADMIN_TOKEN || "";
  if (!expected) return jsonError("unauthorized", 401);
  if ((request.headers.get("x-admin-token") || "") !== expected) return jsonError("unauthorized", 401);

  const now = Date.now();
  const sevenDaysAgo  = new Date(now - 7 * 86_400_000).toISOString();
  const eightDaysAgo  = new Date(now - 8 * 86_400_000).toISOString();
  const twoDaysAgoStr = new Date(now - 2 * 86_400_000).toISOString().slice(0, 10);

  // ── 1. Pending claims in the 7–8 day window ────────────────────────────
  // Only fires once per claim because the window is exactly 1 day wide.
  const staleClaims = await env.DB
    .prepare(
      `SELECT c.id, c.firm_slug, u.email
       FROM purchase_claims c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending'
         AND c.created_at <= ?
         AND c.created_at >  ?`
    )
    .bind(sevenDaysAgo, eightDaysAgo)
    .all();

  let claimEmailsSent = 0;
  for (const row of (staleClaims.results || [])) {
    await sendEmail(env, {
      to: row.email,
      subject: "Your Bro Points claim is still under review",
      html: pendingClaimEmail(FIRM_NAMES[row.firm_slug] || row.firm_slug),
    });
    claimEmailsSent++;
  }

  // ── 2. Streak-at-risk: users who last claimed exactly 2 days ago ───────
  // This fires on the 1-day window where can_restore = true.
  // Because streak_claimed_date moves every claim, each streak break fires at most once.
  const atRiskUsers = await env.DB
    .prepare(
      `SELECT email, login_streak
       FROM users
       WHERE login_streak > 0
         AND streak_claimed_date = ?`
    )
    .bind(twoDaysAgoStr)
    .all();

  let streakEmailsSent = 0;
  for (const row of (atRiskUsers.results || [])) {
    await sendEmail(env, {
      to: row.email,
      subject: `⚠️ Your ${row.login_streak}-day streak is at risk — claim today!`,
      html: streakAtRiskEmail(row.login_streak),
    });
    streakEmailsSent++;
  }

  return jsonResponse({
    ok: true,
    claim_reminders_sent: claimEmailsSent,
    streak_alerts_sent: streakEmailsSent,
  });
}
