// GET /api/rewards/packages — public list of redeemable Bro Packs.
//
// No auth required (the catalog is browseable).

import { jsonResponse, jsonError } from "./_lib.js";

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const rows = await env.DB
    .prepare(
      `SELECT p.slug, p.title, p.description, p.points_cost, p.fulfillment, p.stock,
              p.uses_discount_codes,
              COALESCE(c.available, 0) AS available_codes
       FROM bro_packages p
       LEFT JOIN (
         SELECT package_slug,
                SUM(CASE WHEN assigned_to_user_id IS NULL THEN 1 ELSE 0 END) AS available
         FROM bro_pack_codes GROUP BY package_slug
       ) c ON c.package_slug = p.slug
       WHERE p.is_active = 1
       ORDER BY p.points_cost ASC`
    )
    .all();

  return jsonResponse({ packages: rows.results || [] });
}
