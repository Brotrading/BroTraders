// POST /api/rewards/redeem  body: { package_slug, fulfillment_data?: object }
//
// Validates user has enough points + package is active + stock available, then:
//   1. Inserts redemption row (status='pending')
//   2. Deducts points from balance via ledger (negative amount, reason='redemption', ref_id=redemption.id)
//   3. Decrements bro_packages.stock if not NULL
// Mike fulfills manually from /admin/rewards.html.

import {
  jsonResponse,
  jsonError,
  verifySupabaseToken,
  postLedger,
  getUserRow,
  REDEMPTION_GATE_PTS,
} from "./_lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return jsonError("invalid_json", 400);
  }
  const packageSlug = (body.package_slug || "").trim();
  if (!packageSlug) return jsonError("missing_package_slug", 400);

  const pkg = await env.DB
    .prepare(`SELECT * FROM bro_packages WHERE slug = ? AND is_active = 1`)
    .bind(packageSlug)
    .first();
  if (!pkg) return jsonError("package_not_found", 404);

  const row = await getUserRow(env, user.id);
  if (!row) return jsonError("user_not_synced", 404);

  // Redemption gate: must have earned minimum purchase_cashback points first.
  const purchaseEarned = await env.DB
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM points_ledger
       WHERE user_id = ? AND reason = 'purchase_cashback'`
    )
    .bind(user.id)
    .first();
  const purchasePts = purchaseEarned?.total || 0;
  if (!pkg.gate_exempt && purchasePts < REDEMPTION_GATE_PTS) {
    return jsonError("redemption_gate_not_met", 403, {
      purchase_pts_earned: purchasePts,
      purchase_pts_required: REDEMPTION_GATE_PTS,
      message: `Earn ${REDEMPTION_GATE_PTS - purchasePts} more points via purchases to unlock Bro Packs.`,
    });
  }

  if (row.points_balance < pkg.points_cost) {
    return jsonError("insufficient_points", 409, {
      points_balance: row.points_balance,
      points_required: pkg.points_cost,
    });
  }

  // Atomic stock check-and-decrement. Doing this BEFORE inserting the redemption
  // prevents a race where two concurrent requests both see stock=1 and both succeed.
  if (pkg.stock !== null) {
    const stockResult = await env.DB
      .prepare(`UPDATE bro_packages SET stock = stock - 1 WHERE slug = ? AND stock > 0`)
      .bind(pkg.slug)
      .run();
    if (stockResult.meta.changes === 0) return jsonError("out_of_stock", 409);
  }

  const now = new Date().toISOString();
  const fulfillment_data = body.fulfillment_data ? JSON.stringify(body.fulfillment_data) : null;

  // Insert the redemption row, then deduct points.
  const insert = await env.DB
    .prepare(
      `INSERT INTO redemptions (user_id, package_slug, points_cost, status, fulfillment_data, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`
    )
    .bind(user.id, pkg.slug, pkg.points_cost, fulfillment_data, now)
    .run();

  const redemptionId = insert.meta.last_row_id;

  try {
    await postLedger(env, {
      user_id: user.id,
      amount: -pkg.points_cost,
      reason: "redemption",
      ref_id: String(redemptionId),
      note: pkg.title,
      minBalance: 0,
    });
  } catch (e) {
    if (e?.message?.includes("insufficient_balance")) {
      // Race condition: another request spent the points between our check and deduction.
      if (pkg.stock !== null) {
        await env.DB.prepare(`UPDATE bro_packages SET stock = stock + 1 WHERE slug = ?`).bind(pkg.slug).run();
      }
      await env.DB.prepare(`UPDATE redemptions SET status = 'cancelled' WHERE id = ?`).bind(redemptionId).run();
      return jsonError("insufficient_points", 409, { points_balance: row.points_balance, points_required: pkg.points_cost });
    }
    throw e;
  }

  const updated = await getUserRow(env, user.id);

  return jsonResponse({
    ok: true,
    redemption: {
      id: redemptionId,
      package_slug: pkg.slug,
      title: pkg.title,
      points_cost: pkg.points_cost,
      status: "pending",
      created_at: now,
    },
    points_balance: updated.points_balance,
  });
}
