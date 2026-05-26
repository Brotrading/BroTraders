// GET  /api/rewards/firm-email         — list all firm emails for the authenticated user
// POST /api/rewards/firm-email { firm_slug, email } — set/update a firm email (blocked if locked)

import { jsonResponse, jsonError, verifySupabaseToken } from "./_lib.js";

const VALID_SLUGS = new Set([
  "apex", "alpha", "daytraders", "fundedseat", "lucid",
  "phidias", "mffu", "nexgen", "topone", "tradeify", "yrm",
]);

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);
  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  const rows = await env.DB
    .prepare(`SELECT firm_slug, email, locked FROM user_firm_emails WHERE user_id = ? ORDER BY firm_slug`)
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

  const email = (body.email || "").toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("invalid_email", 400);
  if (email.length > 254) return jsonError("invalid_email", 400);

  const existing = await env.DB
    .prepare(`SELECT locked FROM user_firm_emails WHERE user_id = ? AND firm_slug = ?`)
    .bind(user.id, firmSlug)
    .first();

  if (existing?.locked) return jsonError("firm_email_locked", 409, { firm_slug: firmSlug });

  const now = new Date().toISOString();
  await env.DB
    .prepare(`
      INSERT INTO user_firm_emails (user_id, firm_slug, email, locked, created_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(user_id, firm_slug) DO UPDATE SET email = excluded.email
    `)
    .bind(user.id, firmSlug, email, now)
    .run();

  return jsonResponse({ ok: true, firm_slug: firmSlug, email });
}
