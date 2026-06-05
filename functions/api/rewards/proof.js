// GET /api/rewards/proof?claim_id=<id> — admin retrieves proof attachment for a claim.
//   Auth: X-Admin-Token header or ?token=
//   Returns: { proof_data: "<base64>", proof_mime: "<mime>" }

import { jsonResponse, jsonError } from "./_lib.js";

function checkAdmin(request, env) {
  const expected = env.ADMIN_TOKEN || "";
  if (!expected) return false;
  const url = new URL(request.url);
  return (
    request.headers.get("x-admin-token") === expected ||
    url.searchParams.get("token") === expected
  );
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);
  if (!checkAdmin(request, env)) return jsonError("unauthorized", 401);

  const url = new URL(request.url);
  const claimId = parseInt(url.searchParams.get("claim_id") || "", 10);
  if (!claimId) return jsonError("missing_claim_id", 400);

  const row = await env.DB
    .prepare(`SELECT proof_data, proof_mime FROM purchase_claims WHERE id = ?`)
    .bind(claimId)
    .first();

  if (!row) return jsonError("claim_not_found", 404);
  if (!row.proof_data) return jsonError("no_proof", 404);

  return jsonResponse({
    proof_data: row.proof_data,
    proof_mime: row.proof_mime || "image/jpeg",
  });
}
