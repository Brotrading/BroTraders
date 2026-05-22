// Shared helpers for the rewards API.
//
// Auth model:
//   - Frontend sends Authorization: Bearer <supabase access_token>.
//   - We verify by calling Supabase's /auth/v1/user with the bearer + apikey.
//     This proves the token is valid and not revoked; round-trip cost is fine for MVP.
//   - Pro Bro detection: users.is_pro_bro flag (manual/admin/Whop-sync in future).
//
// Earn rates live in EARN_RATES below — single source of truth.
// IMPORTANT: confirm with Mike before public launch.

// Purchase cashback: 2.5% of purchase amount in points (1000 pts = €1).
// Pro Bro rate is base × PRO_MULTIPLIER (1.5×) = effectively 3.75%.
export const CASHBACK_RATE = 0.025;
export const POINTS_PER_EUR = 1000;

export function calcCashback(amountEur, isPro) {
  const base = Math.round(amountEur * CASHBACK_RATE * POINTS_PER_EUR);
  return isPro ? Math.round(base * PRO_MULTIPLIER) : base;
}

export const EARN_RATES = {
  signup_free: 500,
  signup_pro: 750,
  profile_complete_free: 500,
  profile_complete_pro: 750,
  pro_bro_welcome: 2500,         // one-time bonus when user becomes Pro Bro
  daily_login_free: 10,
  daily_login_pro: 15,
  review_submitted_free: 250,
  review_submitted_pro: 375,
  referral_signup_free: 500,     // referral signed up (no purchase yet)
  referral_signup_pro: 750,
  referral_purchase_free: 2500,  // referral made their first purchase
  referral_purchase_pro: 3750,
};

export const PRO_MULTIPLIER = 1.5;

// Minimum purchase_cashback points a user must have earned before redeeming any Bro Pack.
// Equivalent to ~€200 in purchases at 2.5% cashback (≈ 3 challenges at discounted prices).
export const REDEMPTION_GATE_PTS = 5000;

// Pick the right rate for an action based on Pro Bro status.
export function rateFor(action, isPro) {
  const key = `${action}_${isPro ? "pro" : "free"}`;
  return EARN_RATES[key] ?? 0;
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function jsonError(message, status = 400, extra = {}) {
  return jsonResponse({ error: message, ...extra }, status);
}

// Verifies the Supabase access token by asking Supabase who it belongs to.
// Returns the Supabase user object, or null on any failure.
export async function verifySupabaseToken(request, env) {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[rewards] SUPABASE_URL / SUPABASE_ANON_KEY env vars missing");
    return null;
  }

  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    });
    if (!r.ok) return null;
    const user = await r.json();
    if (!user?.id) return null;
    return user;
  } catch (e) {
    console.error("[rewards] token verify error:", e);
    return null;
  }
}

// Generates a short, URL-friendly referral code.
export function generateReferralCode(seed) {
  const part = (seed || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  return `bro-${part || "x"}${rand}`;
}

// Inserts a points_ledger row AND updates users.points_balance + users.points_earned atomically.
// `amount` is signed (negative for spends — we still credit lifetime "earned" only when amount > 0).
export async function postLedger(env, { user_id, amount, reason, ref_id = null, note = null }) {
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(user_id, amount, reason, ref_id, note, now),
    env.DB.prepare(
      `UPDATE users
         SET points_balance = points_balance + ?,
             points_earned  = points_earned + CASE WHEN ? > 0 THEN ? ELSE 0 END
         WHERE id = ?`
    ).bind(amount, amount, amount, user_id),
  ];
  await env.DB.batch(statements);
  return { amount, reason, ref_id, note, created_at: now };
}

// Awards a reason once. Returns true if awarded, false if already awarded for this user+reason+ref_id.
export async function awardOnce(env, { user_id, reason, amount, ref_id = null, note = null }) {
  const existing = await env.DB
    .prepare(
      `SELECT 1 FROM points_ledger
       WHERE user_id = ? AND reason = ? AND (? IS NULL OR ref_id = ?)
       LIMIT 1`
    )
    .bind(user_id, reason, ref_id, ref_id)
    .first();
  if (existing) return false;
  await postLedger(env, { user_id, amount, reason, ref_id, note });
  return true;
}

// Fetch the user row, or null.
export async function getUserRow(env, user_id) {
  return env.DB
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(user_id)
    .first();
}
