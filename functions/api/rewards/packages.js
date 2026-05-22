// GET /api/rewards/packages — public list of redeemable Bro Packs.
//
// No auth required (the catalog is browseable).

import { jsonResponse, jsonError } from "./_lib.js";

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const rows = await env.DB
    .prepare(
      `SELECT slug, title, description, points_cost, fulfillment, stock
       FROM bro_packages
       WHERE is_active = 1
       ORDER BY points_cost ASC`
    )
    .all();

  return jsonResponse({ packages: rows.results || [] });
}
