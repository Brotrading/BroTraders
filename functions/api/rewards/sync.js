// POST /api/rewards/sync — idempotent "make sure this user exists in D1" endpoint.
//
// Called by js/auth.js on every sign-in. Effects:
//   • First call ever → INSERT into users + award signup bonus (5k free / 7.5k pro).
//   • If profile complete and not yet rewarded → award profile_complete bonus.
//   • If is_pro_bro and pro_bro_bonus_paid = 0 → award 25k welcome bonus.
//   • If a body.referral_code is set AND not yet attributed → record referrer + pay referrer.
//   • Daily-login bonus: if last_login_at is on an earlier day (UTC), award daily-login points.
//
// Returns the synced user row (balance, status, etc).

import {
  jsonResponse,
  jsonError,
  verifySupabaseToken,
  generateReferralCode,
  rateFor,
  EARN_RATES,
  postLedger,
  getUserRow,
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
    body = {};
  }
  const referralCode = (body.referral_code || "").trim() || null;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  let row = await getUserRow(env, user.id);

  // ── First-ever sync: create the row + signup bonus ──────────────────
  if (!row) {
    const email = user.email || user.user_metadata?.email || "";
    const displayName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      null;

    // Resolve referrer (if any) BEFORE we award signup bonus.
    let referredBy = null;
    if (referralCode) {
      const ref = await env.DB
        .prepare(`SELECT id FROM users WHERE referral_code = ? LIMIT 1`)
        .bind(referralCode)
        .first();
      if (ref && ref.id !== user.id) referredBy = ref.id;
    }

    // Generate a unique-ish referral code for this user.
    let myCode = generateReferralCode(displayName || email.split("@")[0]);
    for (let i = 0; i < 4; i++) {
      const exists = await env.DB
        .prepare(`SELECT 1 FROM users WHERE referral_code = ? LIMIT 1`)
        .bind(myCode)
        .first();
      if (!exists) break;
      myCode = generateReferralCode(displayName || email.split("@")[0]);
    }

    await env.DB
      .prepare(
        `INSERT INTO users (id, email, display_name, is_pro_bro, points_balance, points_earned, referral_code, referred_by, last_login_at, created_at)
         VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`
      )
      .bind(user.id, email, displayName, myCode, referredBy, now, now)
      .run();

    row = await getUserRow(env, user.id);

    // Signup bonus (Free tier by default — Pro Bro status is set later via Whop sync/admin).
    await postLedger(env, {
      user_id: user.id,
      amount: rateFor("signup", false),
      reason: "signup",
      note: "Account creation bonus",
    });

    // Referral signup bonus intentionally removed — referrer is paid only when the referred
    // user's first purchase claim is approved (see admin.js approveClaim). This prevents
    // fake-account abuse where someone creates many accounts just to harvest referral points.

    row = await getUserRow(env, user.id);
  } else {
    // Update last_login_at for tracking purposes (daily bonus is now claimed manually via /api/rewards/daily).
    const lastDay = (row.last_login_at || "").slice(0, 10);
    if (lastDay !== today) {
      await env.DB
        .prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
        .bind(now, user.id)
        .run();
      row = await getUserRow(env, user.id);
    }
  }

  // ── One-time Pro Bro welcome bonus ──────────────────────────────────
  if (row && row.is_pro_bro && !row.pro_bro_bonus_paid) {
    await postLedger(env, {
      user_id: user.id,
      amount: EARN_RATES.pro_bro_welcome,
      reason: "pro_bro_welcome",
      note: "Pro Bro welcome bonus",
    });
    await env.DB
      .prepare(`UPDATE users SET pro_bro_bonus_paid = 1, pro_bro_since = COALESCE(pro_bro_since, ?) WHERE id = ?`)
      .bind(now, user.id)
      .run();
    row = await getUserRow(env, user.id);
  }

  return jsonResponse({
    ok: true,
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
    },
  });
}
