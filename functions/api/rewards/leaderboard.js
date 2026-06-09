// GET /api/rewards/leaderboard — public leaderboard (no auth required).
// Returns top 10 earners and top 10 referrers, with names anonymised to display_name or masked email.

import { jsonResponse, jsonError } from "./_lib.js";

function maskEmail(email) {
  const [local, domain] = (email || "").split("@");
  if (!local || !domain) return "—";
  return local.slice(0, 2) + "***@" + domain;
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const [topEarners, topReferrers] = await Promise.all([
    env.DB
      .prepare(
        `SELECT display_name, email, points_earned, is_pro_bro
         FROM users
         WHERE points_earned > 0
         ORDER BY points_earned DESC
         LIMIT 10`
      )
      .all(),
    env.DB
      .prepare(
        `SELECT u.display_name, u.email, u.is_pro_bro,
                COUNT(pc.id) AS referred_approvals
         FROM users u
         JOIN users referred ON referred.referred_by = u.id
         JOIN purchase_claims pc ON pc.user_id = referred.id AND pc.status = 'approved'
         GROUP BY u.id
         ORDER BY referred_approvals DESC
         LIMIT 10`
      )
      .all(),
  ]);

  function fmt(row) {
    return {
      name: row.display_name || maskEmail(row.email),
      is_pro: !!row.is_pro_bro,
    };
  }

  return jsonResponse({
    top_earners: (topEarners.results || []).map((r, i) => ({
      rank: i + 1,
      ...fmt(r),
      points_earned: r.points_earned,
    })),
    top_referrers: (topReferrers.results || []).map((r, i) => ({
      rank: i + 1,
      ...fmt(r),
      referred_approvals: r.referred_approvals,
    })),
  });
}
