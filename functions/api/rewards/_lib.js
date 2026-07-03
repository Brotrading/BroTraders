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

export const EARN_RATES = {
  signup_free: 5000,
  profile_complete_free: 1000,
  profile_complete_pro: 1500,
  pro_bro_welcome: 25000,         // one-time bonus when user becomes Pro Bro
  daily_login_free: 100,
  daily_login_pro: 150,
  review_submitted_free: 2500,
  review_submitted_pro: 3750,
  first_claim_bonus: 500,         // one-time bonus on user's first approved purchase claim
  // referral_purchase equals the referred user's purchase cashback points (proportional)
};

export const PRO_MULTIPLIER = 1.5;

// Unlock rule for non-exempt Bro Packs (decided 2026-07-03): a firm-bound account
// reward unlocks when the user has EITHER
//   a) >= PER_FIRM_UNLOCK_CLAIMS approved purchase claims at that pack's firm, OR
//   b) >= GLOBAL_UNLOCK_PURCHASE_PTS purchase_cashback points across all firms
//      (~$9,000 spend at 1% cashback) — then ALL account rewards are unlocked.
// This mirrors the deal pitched to firms: every free account goes to someone who
// bought 10+ accounts at that firm, or is a proven high-volume buyer overall.
// Packs without firm_slug use only rule (b). Zero-cost packs (Pro Bro, sponsored
// codes Mike wants always available) bypass everything via gate_exempt = 1.
export const GLOBAL_UNLOCK_PURCHASE_PTS = 90000;
export const PER_FIRM_UNLOCK_CLAIMS = 10;

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
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
      signal: controller.signal,
    });
    clearTimeout(tid);
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

// Inserts a points_ledger row AND updates users.points_balance + users.points_earned.
// `amount` is signed (negative for spends — lifetime "earned" only increments when amount > 0).
// `minBalance`: if set, throws "insufficient_balance" when balance + amount < minBalance.
//   The guard runs as a conditional WHERE so we never use RAISE() (not allowed outside triggers in D1).
export async function postLedger(env, { user_id, amount, reason, ref_id = null, note = null, minBalance = null }) {
  const now = new Date().toISOString();

  if (minBalance !== null) {
    // Run UPDATE first with WHERE balance guard; only insert ledger row if update succeeded.
    const upd = await env.DB
      .prepare(
        `UPDATE users
           SET points_balance = points_balance + ?,
               points_earned  = points_earned + CASE WHEN ? > 0 THEN ? ELSE 0 END
           WHERE id = ? AND (points_balance + ?) >= ?`
      )
      .bind(amount, amount, amount, user_id, amount, minBalance)
      .run();
    if (upd.meta.changes === 0) throw new Error("insufficient_balance");
    await env.DB
      .prepare(
        `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(user_id, amount, reason, ref_id, note, now)
      .run();
  } else {
    await env.DB.batch([
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
    ]);
  }

  return { amount, reason, ref_id, note, created_at: now };
}

// Awards a reason once. Returns true if awarded, false if already awarded for this user+reason+ref_id.
// Application-level SELECT catches the common case; the DB-level UNIQUE index on
// (user_id, reason, ref_id) WHERE ref_id IS NOT NULL is the safety net for concurrent requests.
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
  try {
    await postLedger(env, { user_id, amount, reason, ref_id, note });
  } catch (e) {
    if (e?.message?.includes("UNIQUE constraint failed")) return false;
    throw e;
  }
  return true;
}

// Fetch the user row, or null.
export async function getUserRow(env, user_id) {
  return env.DB
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(user_id)
    .first();
}

// Fixed Bro Points per account type for firms using the lookup-based system.
// Keys must match the `label` field in data/firm-accounts.json exactly.
// Base points are for regular users; ProBro gets base × PRO_MULTIPLIER rounded to nearest 25.
export const FIRM_POINTS = {
  apex: {
    "Intraday Trail | Standard | 25K | One Pack":              200,
    "Intraday Trail | Standard | 25K | Five Pack":             850,
    "Intraday Trail | Standard | 50K | One Pack":              250,
    "Intraday Trail | Standard | 50K | Five Pack":             950,
    "Intraday Trail | Standard | 100K | One Pack":             400,
    "Intraday Trail | Standard | 100K | Five Pack":            1750,
    "Intraday Trail | Standard | 150K | One Pack":             600,
    "Intraday Trail | Standard | 150K | Five Pack":            2450,
    "Intraday Trail | No Activation Fee | 25K | One Pack":     700,
    "Intraday Trail | No Activation Fee | 25K | Five Pack":    2950,
    "Intraday Trail | No Activation Fee | 50K | One Pack":     800,
    "Intraday Trail | No Activation Fee | 50K | Five Pack":    3450,
    "Intraday Trail | No Activation Fee | 100K | One Pack":    1100,
    "Intraday Trail | No Activation Fee | 100K | Five Pack":   4950,
    "Intraday Trail | No Activation Fee | 150K | One Pack":    1700,
    "Intraday Trail | No Activation Fee | 150K | Five Pack":   7950,
    "EOD Trail | Standard | 25K | One Pack":                   400,
    "EOD Trail | Standard | 25K | Five Pack":                  1750,
    "EOD Trail | Standard | 50K | One Pack":                   450,
    "EOD Trail | Standard | 50K | Five Pack":                  1950,
    "EOD Trail | Standard | 100K | One Pack":                  600,
    "EOD Trail | Standard | 100K | Five Pack":                 2750,
    "EOD Trail | Standard | 150K | One Pack":                  1100,
    "EOD Trail | Standard | 150K | Five Pack":                 4950,
    "EOD Trail | No Activation Fee | 25K | One Pack":          900,
    "EOD Trail | No Activation Fee | 25K | Five Pack":         3950,
    "EOD Trail | No Activation Fee | 50K | One Pack":          1100,
    "EOD Trail | No Activation Fee | 50K | Five Pack":         4450,
    "EOD Trail | No Activation Fee | 100K | One Pack":         1400,
    "EOD Trail | No Activation Fee | 150K | One Pack":         2300,
  },
  daytraders: {
    "$25K (Trail)":       250,
    "$50K (Trail)":       375,
    "$150K (Trail)":      700,
    "$300K (Trail)":      875,
    "$25K (EOD)":         300,
    "$50K (EOD)":         475,
    "$150K (EOD)":        900,
    "$300K (EOD)":        1600,
    "$25K (Static)":      225,
    "$50K (Static)":      300,
    "$100K (Static)":     500,
    "$150K (Static)":     600,
    "$25K (S2F)":         2225,
    "$50K (S2F)":         3425,
    "$150K (S2F)":        4950,
    "Core Plan (S2L)":    1800,
    "Edge Plan (S2L)":    3200,
    "Ultra Plan (S2L)":   4500,
  },
  fundedseat: {
    "$25K (1-Step Daily)":      700,
    "$50K (1-Step Daily)":      1000,
    "$100K (1-Step Daily)":     1700,
    "$150K (1-Step Daily)":     2400,
    "$25K (1-Step Flex)":       650,
    "$50K (1-Step Flex)":       850,
    "$100K (1-Step Flex)":      1250,
    "$150K (1-Step Flex)":      2500,
    "$25K (1-Step Daily Pro)":  800,
    "$50K (1-Step Daily Pro)":  1200,
    "$100K (1-Step Daily Pro)": 1900,
    "$25K (1-Step Sprint)":     750,
    "$50K (1-Step Sprint)":     1100,
    "$100K (1-Step Sprint)":    1650,
    "$150K (1-Step Sprint)":    2600,
    "$25K (Instant Direct)":    2000,
    "$50K (Instant Direct)":    3000,
    "$100K (Instant Direct)":   4500,
    "$25K (Instant Bolt)":      1900,
    "$50K (Instant Bolt)":      3000,
    "$100K (Instant Bolt)":     4000,
  },
  lucid: {
    "$25K (LucidPro)":     950,
    "$50K (LucidPro)":     1300,
    "$100K (LucidPro)":    2000,
    "$150K (LucidPro)":    2600,
    "$25K (LucidFlex)":    700,
    "$50K (LucidFlex)":    975,
    "$100K (LucidFlex)":   1575,
    "$150K (LucidFlex)":   2950,
    "$25K (LucidDirect)":  2375,
    "$50K (LucidDirect)":  3650,
    "$100K (LucidDirect)": 4900,
    "$150K (LucidDirect)": 5875,
  },
  mffu: {
    "$25K (Rapid)":   875,
    "$50K (Rapid)":   1150,
    "$100K (Rapid)":  2125,
    "$150K (Rapid)":  2775,
    "$50K (Pro)":     1150,
    "$100K (Pro)":    1725,
    "$150K (Pro)":    2400,
    "$50K (Builder)": 925,
    "$25K (Flex)":    575,
    "$50K (Flex)":    925,
  },
  nexgen: {
    "$25K (Evaluation)":  300,
    "$50K (Evaluation)":  500,
    "$75K (Evaluation)":  600,
    "$100K (Evaluation)": 650,
    "$150K (Evaluation)": 800,
    "$25K (Instant)":     3000,
    "$50K (Instant)":     4000,
    "$75K (Instant)":     5000,
    "$100K (Instant)":    6000,
    "$150K (Instant)":    8000,
  },
  phidias: {
    "$25K (Express To Live)":  2775,
    "$50K (Express To Live)":  7225,
    "$100K (Express To Live)": 9000,
    "$150K (Express To Live)": 11225,
    "$50K (Fundamental)":      5800,
    "$100K (Fundamental)":     7225,
    "$150K (Fundamental)":     8625,
    "$50K (Premium)":          7225,
    "$100K (Premium)":         9000,
    "$150K (Premium)":         11225,
    "$10K (Challenge)":        650,
  },
  topone: {
    "$25K (Elite Daily)":         900,
    "$50K (Elite Daily)":         1100,
    "$100K (Elite Daily)":        2000,
    "$25K (Elite Access)":        400,
    "$50K (Elite Access)":        400,
    "$100K (Elite Access)":       400,
    "$150K (Elite Access)":       400,
    "$25K (Instant Sim Funded)":  2100,
    "$50K (Instant Sim Funded)":  3400,
    "$100K (Instant Sim Funded)": 4100,
    "$150K (Instant Sim Funded)": 4700,
    "$25K (IGNITE)":              1300,
    "$50K (IGNITE)":              2400,
    "$100K (IGNITE)":             3375,
    "$150K (IGNITE)":             4800,
  },
  tradeify: {
    "$25K (Growth)":    650,
    "$50K (Growth)":    950,
    "$100K (Growth)":   1650,
    "$150K (Growth)":   2400,
    "$25K (Select)":    700,
    "$50K (Select)":    1075,
    "$100K (Select)":   1725,
    "$150K (Select)":   2475,
    "$25K (Lightning)": 2250,
    "$50K (Lightning)": 3200,
    "$100K (Lightning)":4300,
    "$150K (Lightning)":5175,
  },
};

// Returns fixed points for a firm+accountType combo, or null if the firm/type is not in the lookup.
// isPro applies PRO_MULTIPLIER to the base, rounded to the nearest 25.
export function lookupFixedPoints(firmSlug, accountType, isPro) {
  const firmData = FIRM_POINTS[firmSlug];
  if (!firmData) return null;
  const base = firmData[accountType];
  if (base == null) return null;
  if (!isPro) return base;
  return Math.round((base * PRO_MULTIPLIER) / 25) * 25;
}
