// GET /api/rewards/me — current user state + recent ledger.
//
// Returns:
//   { user: {...}, ledger: [...20 most recent], redemptions: [...10 most recent], claims: [...10 most recent] }

import { jsonResponse, jsonError, verifySupabaseToken, getUserRow } from "./_lib.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  const row = await getUserRow(env, user.id);
  if (!row) return jsonError("user_not_synced", 404, { hint: "Call /api/rewards/sync first" });

  const ledger = await env.DB
    .prepare(
      `SELECT id, amount, reason, ref_id, note, created_at
       FROM points_ledger
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .bind(user.id)
    .all();

  const redemptions = await env.DB
    .prepare(
      `SELECT r.id, r.package_slug, r.points_cost, r.status, r.created_at, r.fulfilled_at,
              p.title, p.description
       FROM redemptions r
       JOIN bro_packages p ON p.slug = r.package_slug
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 10`
    )
    .bind(user.id)
    .all();

  const claims = await env.DB
    .prepare(
      `SELECT id, firm_slug, order_ref, amount_eur, status, points_awarded, created_at, reviewed_at
       FROM purchase_claims
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`
    )
    .bind(user.id)
    .all();

  // Streak eligibility checks
  const today         = new Date().toISOString().slice(0, 10);
  const yesterday     = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const dayBefore     = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const lastClaimed   = row.streak_claimed_date || null;
  const claimedToday  = lastClaimed === today;
  const canRestore    = !claimedToday && lastClaimed === dayBefore;
  // Streak is "broken" when the user had an active streak but missed 2+ days
  // (not claimed today, not claimable to continue from yesterday, not restorable from day-before).
  const streakBroken  = !claimedToday
    && (row.login_streak || 0) > 0
    && lastClaimed !== yesterday
    && lastClaimed !== dayBefore;

  return jsonResponse({
    user: {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      is_pro_bro: !!row.is_pro_bro,
      points_balance: row.points_balance,
      points_earned: row.points_earned,
      profile_complete: !!row.profile_complete,
      referral_code: row.referral_code,
      created_at: row.created_at,
      login_streak: row.login_streak || 0,
      streak_claimed_date: lastClaimed,
      streak_best: row.streak_best || 0,
      claimed_today: claimedToday,
      can_restore: canRestore,
      streak_broken: streakBroken,
    },
    ledger: ledger.results || [],
    redemptions: redemptions.results || [],
    claims: claims.results || [],
  });
}
