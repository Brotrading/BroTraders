// POST /api/rewards/claim — user submits a purchase cashback claim.
//   Auth: Authorization: Bearer <supabase_access_token>
//   Body: {
//     firm_slug       string   required
//     amount_eur      number   required  1–50000
//     order_ref       string   required  order/confirmation number from the firm
//     purchase_date   string   required  YYYY-MM-DD; ≤30 days ago; ≥ account creation date
//     proof_data      string   required  base64-encoded file (≤500 KB raw)
//     proof_mime      string   required  image/jpeg | image/png | image/webp | application/pdf
//     used_bro_code   boolean  required  must be true (user confirms BRO affiliate link used)
//   }
//   Returns: { ok, claim: { id, firm_name, points_pending, is_suspicious, risk_level, ... } }
//
// GET /api/rewards/claim — admin lists claims.
//   Auth: X-Admin-Token header or ?token=
//   Query: ?status=pending|approved|rejected  (default: pending)
//   Returns: { claims: [...] }   — proof_data is NOT included; use GET /api/rewards/proof?claim_id=X

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

const VALID_SLUGS     = new Set(Object.keys(FIRM_NAMES));
const ALLOWED_MIME    = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_PROOF_B64   = 700_000;   // ~500 KB raw file → ~680 KB base64
// MAX_CLAIMS_MONTH intentionally removed — to be decided with Mike before enabling.

// Low   : click ≤7d + account ≥14d + not first claim + click before purchase + amount ≤€500
// Medium: click 8–30d  OR  account <14d  OR  first claim  (and no high-risk condition)
// High  : no click | click >30d | click after purchase date | amount >€500
function computeRiskLevel({ amountEur, daysSinceClick, accountAgeDays, isFirstClaim, clickAfterPurchase }) {
  if (amountEur > 500)                                return "high";
  if (daysSinceClick === null || daysSinceClick > 30) return "high";
  if (clickAfterPurchase)                             return "high";
  if (daysSinceClick > 7)                             return "medium";
  if (accountAgeDays < 14)                            return "medium";
  if (isFirstClaim)                                   return "medium";
  return "low";
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  let body = {};
  try { body = await request.json(); } catch { return jsonError("invalid_json", 400); }

  // ── Firm ───────────────────────────────────────────────────────────────
  const firmSlug = (body.firm_slug || "").toLowerCase().trim();
  if (!VALID_SLUGS.has(firmSlug)) return jsonError("invalid_firm_slug", 400);

  // ── Amount ─────────────────────────────────────────────────────────────
  const amountEur = parseFloat(body.amount_eur);
  if (!Number.isFinite(amountEur) || amountEur <= 0 || amountEur > 50000) {
    return jsonError("invalid_amount_eur", 400);
  }

  // ── Order reference — required ─────────────────────────────────────────
  const orderRef = (body.order_ref || "").slice(0, 200).trim();
  if (!orderRef) return jsonError("order_ref_required", 400);

  // ── BRO code confirmation — required ───────────────────────────────────
  if (body.used_bro_code !== true) return jsonError("bro_code_required", 400);

  // ── Purchase date — required + validated ───────────────────────────────
  const purchaseDateStr = (body.purchase_date || "").trim();
  if (!purchaseDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDateStr)) {
    return jsonError("purchase_date_required", 400);
  }
  const todayStr         = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (purchaseDateStr > todayStr)         return jsonError("purchase_date_future", 400);
  if (purchaseDateStr < thirtyDaysAgoStr) return jsonError("purchase_too_old", 400);

  // ── Proof — required ───────────────────────────────────────────────────
  const proofMime = (body.proof_mime || "image/jpeg").trim();
  const proofData = (body.proof_data || "").trim();
  if (!proofData)                         return jsonError("proof_required", 400);
  if (!ALLOWED_MIME.has(proofMime))       return jsonError("proof_invalid_type", 400);
  if (proofData.length > MAX_PROOF_B64)   return jsonError("proof_too_large", 400);

  // ── User row (needed for account-creation date + Pro status) ───────────
  const userRow = await getUserRow(env, user.id);
  if (!userRow) return jsonError("user_not_found", 404);

  // Purchase date must not be before account creation date
  const accountCreatedDateStr = userRow.created_at.slice(0, 10);
  if (purchaseDateStr < accountCreatedDateStr) return jsonError("purchase_before_account", 400);

  // ── Firm email check — required and must be verified before claiming ──
  const firmEmailRow = await env.DB
    .prepare(`SELECT email, verified FROM user_firm_emails WHERE user_id = ? AND firm_slug = ?`)
    .bind(user.id, firmSlug)
    .first();
  if (!firmEmailRow) {
    return jsonError("firm_email_not_set", 400, { firm_slug: firmSlug });
  }
  if (!firmEmailRow.verified) {
    return jsonError("firm_email_not_verified", 400, { firm_slug: firmSlug });
  }

  // ── Max 1 pending claim per firm per user ──────────────────────────────
  const existing = await env.DB
    .prepare(
      `SELECT id FROM purchase_claims
       WHERE user_id = ? AND firm_slug = ? AND status = 'pending' LIMIT 1`
    )
    .bind(user.id, firmSlug)
    .first();
  if (existing) return jsonError("claim_already_pending", 409);

  // ── Account age ────────────────────────────────────────────────────────
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(userRow.created_at).getTime()) / 86_400_000
  );

  // ── First claim check ──────────────────────────────────────────────────
  const prevApproved = await env.DB
    .prepare(`SELECT COUNT(*) AS cnt FROM purchase_claims WHERE user_id = ? AND status = 'approved'`)
    .bind(user.id)
    .first();
  const isFirstClaim = (prevApproved?.cnt || 0) === 0;

  // ── Click correlation ──────────────────────────────────────────────────
  const clickCheck = await env.DB
    .prepare(
      `SELECT MAX(created_at) AS last_click FROM clicks
       WHERE user_id = ? AND firm = ?`
    )
    .bind(user.id, firmSlug)
    .first();
  const lastClick = clickCheck?.last_click ?? null;
  const daysSinceClick = lastClick
    ? Math.floor((Date.now() - new Date(lastClick).getTime()) / 86_400_000)
    : null;

  // Click must be on or before the purchase date (click after purchase = attribution fraud signal)
  const clickAfterPurchase = lastClick
    ? new Date(lastClick) > new Date(purchaseDateStr + "T23:59:59Z")
    : false;

  const isSuspicious = (daysSinceClick === null || daysSinceClick > 30 || clickAfterPurchase) ? 1 : 0;

  // ── Risk level ─────────────────────────────────────────────────────────
  const riskLevel = computeRiskLevel({ amountEur, daysSinceClick, accountAgeDays, isFirstClaim, clickAfterPurchase });

  // ── Points estimate ────────────────────────────────────────────────────
  const isPro  = !!(userRow && userRow.is_pro_bro);
  const rate   = isPro ? CASHBACK_RATE * PRO_MULTIPLIER : CASHBACK_RATE;
  const pointsPending = Math.round(amountEur * rate * POINTS_PER_EUR);

  // ── Insert ─────────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  let insert;
  try {
    insert = await env.DB
      .prepare(
        `INSERT INTO purchase_claims
           (user_id, firm_slug, order_ref, amount_eur, purchase_date,
            proof_data, proof_mime, used_bro_code, is_suspicious, risk_level, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending', ?)`
      )
      .bind(user.id, firmSlug, orderRef, amountEur, purchaseDateStr,
            proofData, proofMime, isSuspicious, riskLevel, now)
      .run();
  } catch (e) {
    if (e?.message?.includes("UNIQUE constraint failed")) {
      return jsonError("order_ref_duplicate", 409, { order_ref: orderRef });
    }
    throw e;
  }

  return jsonResponse({
    ok: true,
    claim: {
      id:             insert.meta.last_row_id,
      firm_slug:      firmSlug,
      firm_name:      FIRM_NAMES[firmSlug],
      order_ref:      orderRef,
      purchase_date:  purchaseDateStr,
      amount_eur:     amountEur,
      status:         "pending",
      points_pending: pointsPending,
      is_suspicious:  isSuspicious === 1,
      risk_level:     riskLevel,
      is_pro:         isPro,
      created_at:     now,
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
              c.purchase_date, c.used_bro_code, c.is_suspicious, c.risk_level,
              c.status, c.points_awarded, c.note, c.created_at, c.reviewed_at,
              CASE WHEN c.proof_data IS NOT NULL THEN 1 ELSE 0 END AS has_proof,
              u.email, u.display_name, u.is_pro_bro,
              lc.last_click_at
       FROM purchase_claims c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN (
         SELECT user_id, firm, MAX(created_at) AS last_click_at
         FROM clicks
         GROUP BY user_id, firm
       ) lc ON lc.user_id = c.user_id AND lc.firm = c.firm_slug
       WHERE c.status = ?
       ORDER BY c.created_at ASC
       LIMIT 200`
    )
    .bind(status)
    .all();

  return jsonResponse({ claims: rows.results || [] });
}
