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
  rateFor,
  EARN_RATES,
  getUserRow,
  CASHBACK_RATE,
  POINTS_PER_EUR,
  PRO_MULTIPLIER,
} from "./_lib.js";

function checkAdmin(request, env) {
  const expected = env.STATS_TOKEN || "";
  if (!expected) return false;
  const headerTok = request.headers.get("x-admin-token") || "";
  const url = new URL(request.url);
  const queryTok = url.searchParams.get("token") || "";
  return headerTok === expected || queryTok === expected;
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
       WHERE fr.is_approved = 0
       ORDER BY fr.created_at ASC`
    )
    .all();

  const pendingClaims = await env.DB
    .prepare(
      `SELECT c.id, c.user_id, c.firm_slug, c.order_ref, c.amount_eur,
              c.status, c.created_at,
              u.email, u.display_name, u.is_pro_bro
       FROM purchase_claims c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`
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
    default:                 return jsonError("unknown_action", 400, { action });
  }
}

// ── Actions ─────────────────────────────────────────────────────────────

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
    .prepare(`UPDATE firm_reviews SET is_approved = 1, approved_at = ? WHERE id = ?`)
    .bind(now, review_id)
    .run();
  return jsonResponse({ ok: true });
}

async function rejectReview(env, { review_id, reason }) {
  if (!review_id) return jsonError("missing_review_id", 400);
  // Simple rejection = delete the row. No points awarded, user can resubmit.
  const r = await env.DB
    .prepare(`SELECT id FROM firm_reviews WHERE id = ? AND is_approved = 0`)
    .bind(review_id)
    .first();
  if (!r) return jsonError("review_not_found_or_approved", 404);
  await env.DB.prepare(`DELETE FROM firm_reviews WHERE id = ?`).bind(review_id).run();
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
  const rate = isPro ? CASHBACK_RATE * PRO_MULTIPLIER : CASHBACK_RATE;
  const points = Math.round(c.amount_eur * rate * POINTS_PER_EUR);

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

  return jsonResponse({ ok: true, points_awarded: points });
}

async function rejectClaim(env, { claim_id, note }) {
  if (!claim_id) return jsonError("missing_claim_id", 400);
  const c = await env.DB
    .prepare(`SELECT id FROM purchase_claims WHERE id = ? AND status = 'pending'`)
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

  return jsonResponse({ ok: true });
}
