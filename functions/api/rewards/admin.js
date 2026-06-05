// /api/rewards/admin — admin actions for Mike. Token-gated (header X-Admin-Token or ?token=).
//
// Uses the same STATS_TOKEN env var as /api/click-stats. Could be split into ADMIN_TOKEN later.
//
// Actions (POST body { action, ... }):
//   - lookup_user        { email }                              → user row + ledger + redemptions
//   - award_points       { user_id, amount, note }              → manual award/adjust
//   - set_pro_bro        { user_id, is_pro_bro: 0|1 }           → toggle Pro Bro
//   - fulfill_redemption { redemption_id, fulfillment_notes? }  → marks fulfilled, runs side-effects (e.g. extend Pro Bro)
//   - cancel_redemption  { redemption_id, reason? }             → refunds points to user
//   - approve_review     { review_id }                          → marks approved + awards review points
//   - reject_review      { review_id, reason? }                 → marks rejected (no points)
//   - approve_claim      { claim_id, note? }                    → awards cashback points, marks approved
//   - reject_claim       { claim_id, note? }                    → marks rejected, no points
//   - list_pending       (no body)                              → pending redemptions + pending reviews
//
// GET: returns recent activity summary for the admin dashboard (incl. pending claims).

import {
  jsonResponse,
  jsonError,
  postLedger,
  awardOnce,
  rateFor,
  EARN_RATES,
  getUserRow,
  CASHBACK_RATE,
  POINTS_PER_EUR,
  PRO_MULTIPLIER,
  lookupFixedPoints,
} from "./_lib.js";

const FIRM_NAMES_EMAIL = {
  apex: "Apex Trader Funding", alpha: "Alpha Futures", daytraders: "Daytraders.com",
  fundedseat: "FundedSeat", lucid: "Lucid Trading", phidias: "Phidias PropFirm",
  mffu: "My Funded Futures", nexgen: "NexGen Funding", topone: "Top One Futures",
  tradeify: "Tradeify", yrm: "YRM Prop",
};

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
    if (!r.ok) console.error("[rewards] email send failed:", r.status, await r.text());
  } catch (e) {
    console.error("[rewards] email send error:", e?.message);
  }
}

function approvalEmail(firmName, points) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;"><table width="480" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;border:1px solid #2d3248;"><tr><td style="padding:32px 28px;"><p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">BroBros Rewards</p><h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#f8fafc;">✅ Bro Points claim approved</h1><p style="margin:0 0 16px;font-size:15px;color:#cbd5e1;">Your claim for <strong style="color:#f8fafc;">${firmName}</strong> has been approved.</p><div style="background:#0f1117;border-radius:8px;padding:16px 20px;margin:0 0 24px;"><p style="margin:0 0 4px;font-size:12px;color:#64748b;">Points credited</p><p style="margin:0;font-size:28px;font-weight:800;color:#ff6b00;">+${points.toLocaleString("en-US")} pts</p></div><a href="https://propfirmbro.com/rewards/account.html" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">View your account →</a></td></tr></table></td></tr></table></body></html>`;
}

function rejectionEmail(firmName, note) {
  const reasonLine = note ? `<p style="margin:0 0 16px;font-size:14px;color:#cbd5e1;"><strong style="color:#f8fafc;">Reason:</strong> ${note}</p>` : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;"><table width="480" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;border:1px solid #2d3248;"><tr><td style="padding:32px 28px;"><p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">BroBros Rewards</p><h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#f8fafc;">❌ Bro Points claim not approved</h1><p style="margin:0 0 16px;font-size:15px;color:#cbd5e1;">Your claim for <strong style="color:#f8fafc;">${firmName}</strong> could not be approved.</p>${reasonLine}<p style="margin:0;font-size:13px;color:#64748b;">Questions? Reply to this email or contact us at <a href="mailto:support@propfirmbro.com" style="color:#ff6b00;">support@propfirmbro.com</a>.</p></td></tr></table></td></tr></table></body></html>`;
}

function checkAdmin(request, env) {
  const expected = env.ADMIN_TOKEN || "";
  if (!expected) return false;
  const headerTok = request.headers.get("x-admin-token") || "";
  return headerTok === expected;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);
  if (!checkAdmin(request, env)) return jsonError("unauthorized", 401);

  const pendingRedemptions = await env.DB
    .prepare(
      `SELECT r.id, r.user_id, r.package_slug, r.points_cost, r.status, r.fulfillment_data,
              r.created_at, p.title, u.email, u.display_name
       FROM redemptions r
       JOIN bro_packages p ON p.slug = r.package_slug
       JOIN users u ON u.id = r.user_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`
    )
    .all();

  const pendingReviews = await env.DB
    .prepare(
      `SELECT fr.id, fr.user_id, fr.firm_slug, fr.rating, fr.title, fr.body, fr.created_at,
              u.email, u.display_name, u.is_pro_bro
       FROM firm_reviews fr
       JOIN users u ON u.id = fr.user_id
       WHERE fr.is_approved = 0 AND (fr.status IS NULL OR fr.status = 'pending')
       ORDER BY fr.created_at ASC`
    )
    .all();

  const pendingClaims = await env.DB
    .prepare(
      `SELECT c.id, c.user_id, c.firm_slug, c.account_type, c.order_ref, c.amount_eur,
              c.purchase_date, c.used_bro_code, c.is_suspicious, c.risk_level,
              c.status, c.created_at,
              CASE WHEN c.proof_data IS NOT NULL THEN 1 ELSE 0 END AS has_proof,
              u.email, u.display_name, u.is_pro_bro,
              c.last_click_at, c.submitter_ip, c.is_duplicate_proof,
              fe.email    AS firm_email,
              fe.locked   AS firm_email_locked,
              fe.verified AS firm_email_verified,
              (SELECT COUNT(DISTINCT ufe2.user_id) FROM user_firm_emails ufe2
               WHERE ufe2.email = fe.email AND ufe2.verified = 1 AND ufe2.user_id != c.user_id) AS shared_email_count
       FROM purchase_claims c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN user_firm_emails fe ON fe.user_id = c.user_id AND fe.firm_slug = c.firm_slug
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`
    // Note: submitter_ip and is_duplicate_proof added in migration 0014
    )
    .all();

  const totals = await env.DB
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users_count,
         (SELECT COUNT(*) FROM users WHERE is_pro_bro = 1) AS pro_count,
         (SELECT COALESCE(SUM(points_balance), 0) FROM users) AS points_outstanding,
         (SELECT COALESCE(SUM(points_earned), 0) FROM users) AS lifetime_earned`
    )
    .first();

  return jsonResponse({
    totals,
    pending_redemptions: pendingRedemptions.results || [],
    pending_reviews: pendingReviews.results || [],
    pending_claims: pendingClaims.results || [],
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);
  if (!checkAdmin(request, env)) return jsonError("unauthorized", 401);

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return jsonError("invalid_json", 400);
  }
  const action = (body.action || "").trim();

  switch (action) {
    case "lookup_user":      return lookupUser(env, body);
    case "award_points":     return awardPoints(env, body);
    case "set_pro_bro":      return setProBro(env, body);
    case "fulfill_redemption": return fulfillRedemption(env, body);
    case "cancel_redemption": return cancelRedemption(env, body);
    case "approve_review":   return approveReview(env, body);
    case "reject_review":    return rejectReview(env, body);
    case "approve_claim":    return approveClaim(env, body);
    case "reject_claim":     return rejectClaim(env, body);
    case "view_proof":       return viewProof(env, body);
    case "list_referrals":   return listReferrals(env);
    default:                 return jsonError("unknown_action", 400, { action });
  }
}

// ── Actions ─────────────────────────────────────────────────────────────

async function viewProof(env, { claim_id }) {
  if (!claim_id) return jsonError("missing_claim_id", 400);
  const row = await env.DB
    .prepare(`SELECT proof_data, proof_mime FROM purchase_claims WHERE id = ?`)
    .bind(claim_id)
    .first();
  if (!row) return jsonError("claim_not_found", 404);
  if (!row.proof_data) return jsonError("no_proof", 404);
  return jsonResponse({ proof_data: row.proof_data, proof_mime: row.proof_mime || "image/jpeg" });
}

async function lookupUser(env, { email }) {
  if (!email) return jsonError("missing_email", 400);
  const u = await env.DB
    .prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`)
    .bind(email.trim())
    .first();
  if (!u) return jsonError("user_not_found", 404);

  const ledger = await env.DB
    .prepare(
      `SELECT id, amount, reason, ref_id, note, created_at
       FROM points_ledger WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 50`
    )
    .bind(u.id)
    .all();
  const redemptions = await env.DB
    .prepare(
      `SELECT id, package_slug, points_cost, status, fulfillment_data, created_at, fulfilled_at
       FROM redemptions WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 20`
    )
    .bind(u.id)
    .all();

  return jsonResponse({ user: u, ledger: ledger.results || [], redemptions: redemptions.results || [] });
}

async function awardPoints(env, { user_id, amount, note }) {
  if (!user_id) return jsonError("missing_user_id", 400);
  const amt = parseInt(amount, 10);
  if (!Number.isFinite(amt) || amt === 0) return jsonError("invalid_amount", 400);
  await postLedger(env, {
    user_id,
    amount: amt,
    reason: amt > 0 ? "manual_bonus" : "admin_adjust",
    note: (note || "").slice(0, 200) || null,
  });
  const u = await getUserRow(env, user_id);
  return jsonResponse({ ok: true, new_balance: u?.points_balance ?? null });
}

async function setProBro(env, { user_id, is_pro_bro }) {
  if (!user_id) return jsonError("missing_user_id", 400);
  const flag = is_pro_bro ? 1 : 0;
  const now = new Date().toISOString();
  const before = await getUserRow(env, user_id);
  if (!before) return jsonError("user_not_found", 404);
  await env.DB
    .prepare(
      `UPDATE users SET is_pro_bro = ?, pro_bro_since = COALESCE(pro_bro_since, ?) WHERE id = ?`
    )
    .bind(flag, flag ? now : before.pro_bro_since, user_id)
    .run();
  // Pay welcome bonus if first time going Pro.
  if (flag && !before.pro_bro_bonus_paid) {
    await postLedger(env, {
      user_id,
      amount: EARN_RATES.pro_bro_welcome,
      reason: "pro_bro_welcome",
      note: "Pro Bro welcome bonus (admin)",
    });
    await env.DB.prepare(`UPDATE users SET pro_bro_bonus_paid = 1 WHERE id = ?`).bind(user_id).run();
  }
  return jsonResponse({ ok: true });
}

async function fulfillRedemption(env, { redemption_id, fulfillment_notes }) {
  if (!redemption_id) return jsonError("missing_redemption_id", 400);
  const r = await env.DB
    .prepare(`SELECT * FROM redemptions WHERE id = ?`)
    .bind(redemption_id)
    .first();
  if (!r) return jsonError("redemption_not_found", 404);
  if (r.status !== "pending") return jsonError("not_pending", 409, { current_status: r.status });

  // Side-effect: extending Pro Bro membership is currently handled outside this API
  // (Mike grants the extension via Whop manually). We just mark the redemption fulfilled.
  const now = new Date().toISOString();
  await env.DB
    .prepare(
      `UPDATE redemptions SET status = 'fulfilled', fulfilled_at = ?, admin_note = ? WHERE id = ?`
    )
    .bind(now, (fulfillment_notes || "").slice(0, 500) || null, redemption_id)
    .run();
  return jsonResponse({ ok: true });
}

async function cancelRedemption(env, { redemption_id, reason }) {
  if (!redemption_id) return jsonError("missing_redemption_id", 400);
  const r = await env.DB
    .prepare(`SELECT * FROM redemptions WHERE id = ?`)
    .bind(redemption_id)
    .first();
  if (!r) return jsonError("redemption_not_found", 404);
  if (r.status !== "pending") return jsonError("not_pending", 409, { current_status: r.status });

  // Refund points.
  await postLedger(env, {
    user_id: r.user_id,
    amount: r.points_cost, // positive (refund)
    reason: "admin_adjust",
    ref_id: String(r.id),
    note: `Redemption ${r.id} cancelled: ${reason || "no reason given"}`.slice(0, 200),
  });
  await env.DB
    .prepare(`UPDATE redemptions SET status = 'cancelled', admin_note = ? WHERE id = ?`)
    .bind((reason || "").slice(0, 500) || null, redemption_id)
    .run();
  // Restock if the package tracks stock.
  await env.DB
    .prepare(`UPDATE bro_packages SET stock = stock + 1 WHERE slug = ? AND stock IS NOT NULL`)
    .bind(r.package_slug)
    .run();
  return jsonResponse({ ok: true });
}

async function approveReview(env, { review_id }) {
  if (!review_id) return jsonError("missing_review_id", 400);
  const r = await env.DB
    .prepare(`SELECT * FROM firm_reviews WHERE id = ?`)
    .bind(review_id)
    .first();
  if (!r) return jsonError("review_not_found", 404);
  if (r.is_approved) return jsonError("already_approved", 409);

  const u = await getUserRow(env, r.user_id);
  const isPro = !!(u && u.is_pro_bro);

  await postLedger(env, {
    user_id: r.user_id,
    amount: rateFor("review_submitted", isPro),
    reason: "review_submitted",
    ref_id: String(r.id),
    note: `Review of ${r.firm_slug} approved`,
  });
  const now = new Date().toISOString();
  await env.DB
    .prepare(`UPDATE firm_reviews SET is_approved = 1, approved_at = ?, status = 'approved' WHERE id = ?`)
    .bind(now, review_id)
    .run();
  return jsonResponse({ ok: true });
}

async function rejectReview(env, { review_id, reason }) {
  if (!review_id) return jsonError("missing_review_id", 400);
  const r = await env.DB
    .prepare(`SELECT id FROM firm_reviews WHERE id = ? AND is_approved = 0 AND (status IS NULL OR status != 'rejected')`)
    .bind(review_id)
    .first();
  if (!r) return jsonError("review_not_found_or_approved", 404);
  await env.DB
    .prepare(`UPDATE firm_reviews SET status = 'rejected', rejection_reason = ? WHERE id = ?`)
    .bind((reason || "").slice(0, 200) || null, review_id)
    .run();
  return jsonResponse({ ok: true, reason: reason || null });
}

async function approveClaim(env, { claim_id, note }) {
  if (!claim_id) return jsonError("missing_claim_id", 400);
  const c = await env.DB
    .prepare(`SELECT * FROM purchase_claims WHERE id = ?`)
    .bind(claim_id)
    .first();
  if (!c) return jsonError("claim_not_found", 404);
  if (c.status !== "pending") return jsonError("not_pending", 409, { current_status: c.status });

  const u = await getUserRow(env, c.user_id);
  const isPro = !!(u && u.is_pro_bro);
  const fixedPoints = lookupFixedPoints(c.firm_slug, c.account_type, isPro);
  const points = fixedPoints !== null
    ? fixedPoints
    : Math.round(c.amount_eur * (isPro ? CASHBACK_RATE * PRO_MULTIPLIER : CASHBACK_RATE) * POINTS_PER_EUR);

  await postLedger(env, {
    user_id: c.user_id,
    amount: points,
    reason: "purchase_cashback",
    ref_id: String(c.id),
    note: `${c.firm_slug} · €${c.amount_eur} · ${isPro ? "Pro" : "Free"} rate`,
  });

  const now = new Date().toISOString();
  await env.DB
    .prepare(
      `UPDATE purchase_claims
       SET status = 'approved', points_awarded = ?, note = ?, reviewed_at = ?
       WHERE id = ?`
    )
    .bind(points, (note || "").slice(0, 200) || null, now, claim_id)
    .run();

  // Lock the firm email so it can no longer be changed.
  await env.DB
    .prepare(`UPDATE user_firm_emails SET locked = 1 WHERE user_id = ? AND firm_slug = ? AND locked = 0`)
    .bind(c.user_id, c.firm_slug)
    .run();

  // Notify user by email (fire-and-forget — don't fail approve if email fails).
  await sendEmail(env, {
    to: u.email,
    subject: `Your Bro Points claim was approved — +${points.toLocaleString("en-US")} pts`,
    html: approvalEmail(FIRM_NAMES_EMAIL[c.firm_slug] || c.firm_slug, points),
  });

  // If this is the buyer's first approved purchase, pay the referrer a bonus.
  const prevApproved = await env.DB
    .prepare(
      `SELECT COUNT(*) AS cnt FROM purchase_claims
       WHERE user_id = ? AND status = 'approved' AND id != ?`
    )
    .bind(c.user_id, claim_id)
    .first();

  if ((prevApproved?.cnt || 0) === 0 && u?.referred_by) {
    const referrer = await getUserRow(env, u.referred_by);
    if (referrer) {
      await awardOnce(env, {
        user_id: u.referred_by,
        amount: rateFor("referral_purchase", !!referrer.is_pro_bro),
        reason: "referral_purchase",
        ref_id: c.user_id,
        note: `${u.email} made their first purchase`,
      });
    }
  }

  return jsonResponse({ ok: true, points_awarded: points });
}

async function listReferrals(env) {
  const rows = await env.DB
    .prepare(
      `SELECT u.id, u.email, u.display_name, u.referral_code, u.created_at, u.is_pro_bro,
              r.email AS referrer_email, r.display_name AS referrer_name,
              (SELECT COUNT(*) FROM purchase_claims pc
               WHERE pc.user_id = u.id AND pc.status = 'approved') AS approved_claims
       FROM users u
       JOIN users r ON r.id = u.referred_by
       ORDER BY u.created_at DESC
       LIMIT 500`
    )
    .all();
  return jsonResponse({ referrals: rows.results || [] });
}

async function rejectClaim(env, { claim_id, note }) {
  if (!claim_id) return jsonError("missing_claim_id", 400);
  const c = await env.DB
    .prepare(`SELECT id, user_id, firm_slug FROM purchase_claims WHERE id = ? AND status = 'pending'`)
    .bind(claim_id)
    .first();
  if (!c) return jsonError("claim_not_found_or_not_pending", 404);

  const now = new Date().toISOString();
  await env.DB
    .prepare(
      `UPDATE purchase_claims SET status = 'rejected', note = ?, reviewed_at = ? WHERE id = ?`
    )
    .bind((note || "").slice(0, 200) || null, now, claim_id)
    .run();

  // Notify user by email (fire-and-forget).
  const u = await getUserRow(env, c.user_id);
  if (u?.email) {
    await sendEmail(env, {
      to: u.email,
      subject: `Your Bro Points claim was not approved`,
      html: rejectionEmail(FIRM_NAMES_EMAIL[c.firm_slug] || c.firm_slug, (note || "").slice(0, 200) || null),
    });
  }

  return jsonResponse({ ok: true });
}
