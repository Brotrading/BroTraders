// POST /api/rewards/claim   — user submits a purchase cashback claim
//   Auth: Authorization: Bearer <supabase_access_token>
//   Body: { firm_slug, order_ref?, amount_eur }
//   Returns: { ok, claim: { id, firm_name, points_pending, status } }
//
// GET  /api/rewards/claim   — admin lists claims
//   Auth: X-Admin-Token header (same STATS_TOKEN as the analytics dashboard)
//   Query: ?status=pending|approved|rejected  (default: pending)
//   Returns: { claims: [...] }

import {
  jsonResponse,
  jsonError,
  verifySupabaseToken,
  getUserRow,
  CASHBACK_RATE,
  POINTS_PER_EUR,
  PRO_MULTIPLIER,
} from "./_lib.js";

const FIRM_NAMES = {
  apex:       "Apex Trader Funding",
  alpha:      "Alpha Futures",
  daytraders: "Daytraders.com",
  fundedseat: "FundedSeat",
  lucid:      "Lucid Trading",
  phidias:    "Phidias PropFirm",
  mffu:       "My Funded Futures",
  nexgen:     "NexGen Funding",
  topone:     "Top One Futures",
  tradeify:   "Tradeify",
  yrm:        "YRM Prop",
};

const VALID_SLUGS = new Set(Object.keys(FIRM_NAMES));

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  let body = {};
  try { body = await request.json(); } catch { return jsonError("invalid_json", 400); }

  const firmSlug = (body.firm_slug || "").toLowerCase().trim();
  if (!VALID_SLUGS.has(firmSlug)) return jsonError("invalid_firm_slug", 400);

  const orderRef = (body.order_ref || "").slice(0, 200).trim() || null;

  const amountEur = parseFloat(body.amount_eur);
  if (!Number.isFinite(amountEur) || amountEur <= 0 || amountEur > 50000) {
    return jsonError("invalid_amount_eur", 400);
  }

  // Max 1 pending claim per firm per user — prevents flooding before Mike reviews.
  const existing = await env.DB
    .prepare(
      `SELECT id FROM purchase_claims
       WHERE user_id = ? AND firm_slug = ? AND status = 'pending' LIMIT 1`
    )
    .bind(user.id, firmSlug)
    .first();
  if (existing) return jsonError("claim_already_pending", 409);

  const now = new Date().toISOString();
  const insert = await env.DB
    .prepare(
      `INSERT INTO purchase_claims (user_id, firm_slug, order_ref, amount_eur, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    )
    .bind(user.id, firmSlug, orderRef, amountEur, now)
    .run();

  const row = await getUserRow(env, user.id);
  const isPro = !!(row && row.is_pro_bro);
  const rate = isPro ? CASHBACK_RATE * PRO_MULTIPLIER : CASHBACK_RATE;
  const pointsPending = Math.round(amountEur * rate * POINTS_PER_EUR);

  return jsonResponse({
    ok: true,
    claim: {
      id: insert.meta.last_row_id,
      firm_slug: firmSlug,
      firm_name: FIRM_NAMES[firmSlug],
      order_ref: orderRef,
      amount_eur: amountEur,
      status: "pending",
      points_pending: pointsPending,
      is_pro: isPro,
      created_at: now,
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const expected = env.STATS_TOKEN || "";
  if (!expected) return jsonError("unauthorized", 401);
  const url = new URL(request.url);
  const tok = request.headers.get("x-admin-token") || url.searchParams.get("token") || "";
  if (tok !== expected) return jsonError("unauthorized", 401);

  const status = url.searchParams.get("status") || "pending";
  const rows = await env.DB
    .prepare(
      `SELECT c.id, c.user_id, c.firm_slug, c.order_ref, c.amount_eur,
              c.status, c.points_awarded, c.note, c.created_at, c.reviewed_at,
              u.email, u.display_name, u.is_pro_bro
       FROM purchase_claims c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = ?
       ORDER BY c.created_at ASC
       LIMIT 100`
    )
    .bind(status)
    .all();

  return jsonResponse({ claims: rows.results || [] });
}
