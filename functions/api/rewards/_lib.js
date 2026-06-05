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

// Purchase cashback: 2.5% of purchase amount in points (1000 pts = $1 USD).
// Pro Bro rate is base × PRO_MULTIPLIER (1.5×) = effectively 3.75%.
// Note: confirm with Mike whether rate/points-per-unit should stay in USD.
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

// Inserts a points_ledger row AND updates users.points_balance + users.points_earned atomically.
// `amount` is signed (negative for spends — we still credit lifetime "earned" only when amount > 0).
// `minBalance`: if set, the batch rolls back (RAISE ROLLBACK) if balance + amount < minBalance.
//   Callers should catch errors containing "insufficient_balance" to detect this case.
export async function postLedger(env, { user_id, amount, reason, ref_id = null, note = null, minBalance = null }) {
  const now = new Date().toISOString();
  const guardClause = minBalance !== null
    ? `AND CASE WHEN points_balance + ? >= ? THEN 1 ELSE RAISE(ROLLBACK, 'insufficient_balance') END = 1`
    : "";
  const guardBinds = minBalance !== null ? [amount, minBalance] : [];

  const statements = [
    env.DB.prepare(
      `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(user_id, amount, reason, ref_id, note, now),
    env.DB.prepare(
      `UPDATE users
         SET points_balance = points_balance + ?,
             points_earned  = points_earned + CASE WHEN ? > 0 THEN ? ELSE 0 END
         WHERE id = ? ${guardClause}`
    ).bind(amount, amount, amount, user_id, ...guardBinds),
  ];
  await env.DB.batch(statements);
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
    "Intraday Trail | Standard | 25K | One Pack":              25,
    "Intraday Trail | Standard | 25K | Five Pack":             125,
    "Intraday Trail | Standard | 50K | One Pack":              25,
    "Intraday Trail | Standard | 50K | Five Pack":             125,
    "Intraday Trail | Standard | 100K | One Pack":             50,
    "Intraday Trail | Standard | 100K | Five Pack":            250,
    "Intraday Trail | Standard | 150K | One Pack":             50,
    "Intraday Trail | Standard | 150K | Five Pack":            250,
    "Intraday Trail | No Activation Fee | 25K | One Pack":     75,
    "Intraday Trail | No Activation Fee | 25K | Five Pack":    375,
    "Intraday Trail | No Activation Fee | 50K | One Pack":     75,
    "Intraday Trail | No Activation Fee | 50K | Five Pack":    375,
    "Intraday Trail | No Activation Fee | 100K | One Pack":    100,
    "Intraday Trail | No Activation Fee | 100K | Five Pack":   500,
    "Intraday Trail | No Activation Fee | 150K | One Pack":    175,
    "Intraday Trail | No Activation Fee | 150K | Five Pack":   875,
    "EOD Trail | Standard | 25K | One Pack":                   50,
    "EOD Trail | Standard | 25K | Five Pack":                  250,
    "EOD Trail | Standard | 50K | One Pack":                   50,
    "EOD Trail | Standard | 50K | Five Pack":                  250,
    "EOD Trail | Standard | 100K | One Pack":                  50,
    "EOD Trail | Standard | 100K | Five Pack":                 250,
    "EOD Trail | Standard | 150K | One Pack":                  100,
    "EOD Trail | Standard | 150K | Five Pack":                 500,
    "EOD Trail | No Activation Fee | 25K | One Pack":          100,
    "EOD Trail | No Activation Fee | 25K | Five Pack":         500,
    "EOD Trail | No Activation Fee | 50K | One Pack":          100,
    "EOD Trail | No Activation Fee | 50K | Five Pack":         500,
    "EOD Trail | No Activation Fee | 100K | One Pack":         150,
    "EOD Trail | No Activation Fee | 150K | One Pack":         225,
  },
  daytraders: {
    "$25K (Trail)":       25,
    "$50K (Trail)":       50,
    "$150K (Trail)":      75,
    "$300K (Trail)":      100,
    "$25K (EOD)":         25,
    "$50K (EOD)":         50,
    "$150K (EOD)":        100,
    "$300K (EOD)":        150,
    "$25K (Static)":      25,
    "$50K (Static)":      25,
    "$100K (Static)":     50,
    "$150K (Static)":     50,
    "$25K (S2F)":         225,
    "$50K (S2F)":         350,
    "$150K (S2F)":        500,
    "Core Plan (S2L)":    175,
    "Edge Plan (S2L)":    325,
    "Ultra Plan (S2L)":   450,
  },
  fundedseat: {
    "$25K (1-Step Daily)":      75,
    "$50K (1-Step Daily)":      100,
    "$100K (1-Step Daily)":     175,
    "$150K (1-Step Daily)":     250,
    "$25K (1-Step Flex)":       75,
    "$50K (1-Step Flex)":       75,
    "$100K (1-Step Flex)":      125,
    "$150K (1-Step Flex)":      250,
    "$25K (1-Step Daily Pro)":  75,
    "$50K (1-Step Daily Pro)":  125,
    "$100K (1-Step Daily Pro)": 200,
    "$25K (1-Step Sprint)":     75,
    "$50K (1-Step Sprint)":     100,
    "$100K (1-Step Sprint)":    175,
    "$150K (1-Step Sprint)":    250,
    "$25K (Instant Direct)":    200,
    "$50K (Instant Direct)":    300,
    "$100K (Instant Direct)":   450,
    "$25K (Instant Bolt)":      200,
    "$50K (Instant Bolt)":      300,
    "$100K (Instant Bolt)":     400,
  },
  lucid: {
    "$25K (LucidPro)":     100,
    "$50K (LucidPro)":     125,
    "$100K (LucidPro)":    200,
    "$150K (LucidPro)":    250,
    "$25K (LucidFlex)":    75,
    "$50K (LucidFlex)":    100,
    "$100K (LucidFlex)":   150,
    "$150K (LucidFlex)":   300,
    "$25K (LucidDirect)":  250,
    "$50K (LucidDirect)":  375,
    "$100K (LucidDirect)": 500,
    "$150K (LucidDirect)": 600,
  },
  mffu: {
    "$25K (Rapid)":   75,
    "$50K (Rapid)":   125,
    "$100K (Rapid)":  225,
    "$150K (Rapid)":  275,
    "$50K (Pro)":     125,
    "$100K (Pro)":    175,
    "$150K (Pro)":    250,
    "$50K (Builder)": 100,
    "$25K (Flex)":    50,
    "$50K (Flex)":    100,
  },
  nexgen: {
    "$25K (Evaluation)":  25,
    "$50K (Evaluation)":  50,
    "$75K (Evaluation)":  50,
    "$100K (Evaluation)": 75,
    "$150K (Evaluation)": 75,
    "$25K (Instant)":     300,
    "$50K (Instant)":     400,
    "$75K (Instant)":     500,
    "$100K (Instant)":    600,
    "$150K (Instant)":    800,
  },
  phidias: {
    "$25K (Express To Live)":  275,
    "$50K (Express To Live)":  725,
    "$100K (Express To Live)": 900,
    "$150K (Express To Live)": 1125,
    "$50K (Fundamental)":      575,
    "$100K (Fundamental)":     725,
    "$150K (Fundamental)":     875,
    "$50K (Premium)":          725,
    "$100K (Premium)":         900,
    "$150K (Premium)":         1125,
    "$10K (Challenge)":        75,
  },
  topone: {
    "$25K (Elite Daily)":         100,
    "$50K (Elite Daily)":         100,
    "$100K (Elite Daily)":        200,
    "$25K (Elite Access)":        50,
    "$50K (Elite Access)":        50,
    "$100K (Elite Access)":       50,
    "$150K (Elite Access)":       50,
    "$25K (Instant Sim Funded)":  200,
    "$50K (Instant Sim Funded)":  350,
    "$100K (Instant Sim Funded)": 400,
    "$150K (Instant Sim Funded)": 475,
    "$25K (IGNITE)":              125,
    "$50K (IGNITE)":              250,
    "$100K (IGNITE)":             350,
    "$150K (IGNITE)":             475,
  },
  tradeify: {
    "$25K (Growth)":    75,
    "$50K (Growth)":    100,
    "$100K (Growth)":   175,
    "$150K (Growth)":   250,
    "$25K (Select)":    75,
    "$50K (Select)":    100,
    "$100K (Select)":   175,
    "$150K (Select)":   250,
    "$25K (Lightning)": 225,
    "$50K (Lightning)": 325,
    "$100K (Lightning)":425,
    "$150K (Lightning)":525,
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
