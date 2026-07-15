// POST /api/rewards/review  body: { firm_slug, rating (1-5), title?, body }
//
// Submits a firm review. Stored with is_approved=0; admin approves from /admin/rewards.html,
// which is when the points reward is paid out (handled by /api/rewards/admin).
//
// Returns the review id; no points awarded yet.

import {
  jsonResponse,
  jsonError,
  verifySupabaseToken,
  getUserRow,
} from "./_lib.js";

const VALID_FIRMS = new Set([
  "apex",
  "daytraders",
  "fundedseat",
  "lucid",
  "phidias",
  "mffu",
  "nexgen",
  "topone",
  "tradeify",
]);

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
  const firmSlug = (body.firm_slug || "").trim().toLowerCase();
  const rating = parseInt(body.rating, 10);
  const title = (body.title || "").trim().slice(0, 120) || null;
  const reviewBody = (body.body || "").trim();

  if (!VALID_FIRMS.has(firmSlug)) return jsonError("invalid_firm_slug", 400);
  if (!(rating >= 1 && rating <= 5)) return jsonError("invalid_rating", 400);
  if (reviewBody.length < 40) return jsonError("body_too_short", 400, { min_chars: 40 });
  if (reviewBody.length > 4000) return jsonError("body_too_long", 400, { max_chars: 4000 });

  const row = await getUserRow(env, user.id);
  if (!row) return jsonError("user_not_synced", 404);

  const now = new Date().toISOString();
  try {
    const insert = await env.DB
      .prepare(
        `INSERT INTO firm_reviews (user_id, firm_slug, rating, title, body, is_approved, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      )
      .bind(user.id, firmSlug, rating, title, reviewBody, now)
      .run();
    return jsonResponse({
      ok: true,
      review_id: insert.meta.last_row_id,
      status: "pending_approval",
      note: "Points are awarded once an admin approves the review.",
    });
  } catch (e) {
    // UNIQUE(user_id, firm_slug) collision = already reviewed.
    if (String(e?.message || "").includes("UNIQUE")) {
      return jsonError("already_reviewed_firm", 409);
    }
    return jsonError("insert_failed", 500, { detail: String(e?.message || e) });
  }
}
