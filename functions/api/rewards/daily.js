// POST /api/rewards/daily — manually claim today's login points + streak logic.
//   Auth: Authorization: Bearer <supabase_access_token>
//   Body (default / omit for regular claim): {}
//   Body (restore a broken streak): { action: "restore" }
//
// Regular claim:
//   - Can only be claimed once per day (UTC).
//   - If last claim was yesterday → streak continues (+1).
//   - If last claim was 2+ days ago → streak resets to 1.
//   - Milestones: day 7 → +500 pts bonus; day 30 → +2 000 pts bonus.
//   Returns: { ok, awarded, daily_pts, milestone_bonus, new_streak, streak_best, can_restore }
//
// Restore (action: "restore"):
//   - Available only if last claim was exactly 2 days ago (missed exactly 1 day)
//     AND today has not been claimed yet.
//   - Costs 50 pts from the user's balance.
//   - Sets streak_claimed_date to yesterday so next regular claim continues the streak.
//   Returns: { ok, restored, new_streak, cost_pts }

import {
  jsonResponse,
  jsonError,
  verifySupabaseToken,
  getUserRow,
  postLedger,
  rateFor,
} from "./_lib.js";

const STREAK_MILESTONE_7  = 500;
const STREAK_MILESTONE_30 = 2000;
const RESTORE_COST        = 50;

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
function dateOffset(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  const row = await getUserRow(env, user.id);
  if (!row) return jsonError("user_not_synced", 404);

  const today      = todayUTC();
  const yesterday  = dateOffset(-1);
  const dayBefore  = dateOffset(-2);

  const lastClaimed = row.streak_claimed_date || null;
  const isPro       = !!row.is_pro_bro;

  // ── Restore action ────────────────────────────────────────────────────
  if (body.action === "restore") {
    if (lastClaimed === today)      return jsonError("daily_already_claimed", 409);
    if (lastClaimed !== dayBefore)  return jsonError("restore_not_eligible", 409);
    if ((row.points_balance || 0) < RESTORE_COST) return jsonError("insufficient_points", 409);

    const currentStreak  = row.login_streak || 0;
    const restoredStreak = currentStreak + 1;  // yesterday re-claimed
    const todayStreak    = restoredStreak + 1; // today claimed immediately after restore
    const newBest = Math.max(row.streak_best || 0, todayStreak);
    const dailyPts = rateFor("daily_login", isPro);

    let milestonePts = 0;
    if (todayStreak === 7)                              milestonePts = STREAK_MILESTONE_7;
    else if (todayStreak > 0 && todayStreak % 30 === 0) milestonePts = STREAK_MILESTONE_30;

    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
         VALUES (?, ?, 'streak_restore', ?, ?, ?)`
      ).bind(user.id, -RESTORE_COST, today, `Streak restored to day ${todayStreak}`, now),
      env.DB.prepare(
        `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
         VALUES (?, ?, 'daily_login', ?, ?, ?)`
      ).bind(user.id, dailyPts, today, `Day ${todayStreak} login bonus`, now),
      env.DB.prepare(
        `UPDATE users SET
           points_balance      = points_balance - ? + ?,
           points_earned       = points_earned + ?,
           login_streak        = ?,
           streak_claimed_date = ?,
           streak_best         = ?,
           last_login_at       = ?
         WHERE id = ?
           AND CASE WHEN points_balance >= ? THEN 1 ELSE RAISE(ROLLBACK, 'insufficient_balance') END = 1`
      ).bind(RESTORE_COST, dailyPts, dailyPts, todayStreak, today, newBest, now, user.id, RESTORE_COST),
    ];

    if (milestonePts > 0) {
      const milestoneReason = `streak_milestone_${todayStreak}`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(user.id, milestonePts, milestoneReason, today, `${todayStreak}-day streak milestone!`, now)
      );
      statements.push(
        env.DB.prepare(
          `UPDATE users SET points_balance = points_balance + ?, points_earned = points_earned + ? WHERE id = ?`
        ).bind(milestonePts, milestonePts, user.id)
      );
    }

    try {
      await env.DB.batch(statements);
    } catch (e) {
      if (String(e?.message || "").includes("insufficient_balance")) return jsonError("insufficient_points", 409);
      if (String(e?.message || "").includes("UNIQUE")) return jsonError("daily_already_claimed", 409);
      throw e;
    }

    return jsonResponse({
      ok: true,
      restored: true,
      new_streak: todayStreak,
      streak_best: newBest,
      cost_pts: RESTORE_COST,
      daily_pts: dailyPts,
      milestone_bonus: milestonePts,
    });
  }

  // ── Regular daily claim ───────────────────────────────────────────────
  if (lastClaimed === today) return jsonError("daily_already_claimed", 409);

  const prevStreak  = row.login_streak || 0;
  const streakContinues = (lastClaimed === yesterday);
  const newStreak   = streakContinues ? prevStreak + 1 : 1;
  const newBest     = Math.max(row.streak_best || 0, newStreak);

  // Base daily pts
  const dailyPts = rateFor("daily_login", isPro);

  // Milestone bonus — day 7 once, then every 30 days (30, 60, 90, …) indefinitely
  let milestonePts = 0;
  if (newStreak === 7)                          milestonePts = STREAK_MILESTONE_7;
  else if (newStreak > 0 && newStreak % 30 === 0) milestonePts = STREAK_MILESTONE_30;

  const totalAwarded = dailyPts + milestonePts;

  const now = new Date().toISOString();
  const statements = [];

  statements.push(
    env.DB.prepare(
      `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
       VALUES (?, ?, 'daily_login', ?, ?, ?)`
    ).bind(user.id, dailyPts, today, `Day ${newStreak} login bonus`, now)
  );
  statements.push(
    env.DB.prepare(
      `UPDATE users
         SET points_balance = points_balance + ?,
             points_earned  = points_earned  + ?,
             login_streak = ?, streak_claimed_date = ?, streak_best = ?, last_login_at = ?
       WHERE id = ?`
    ).bind(dailyPts, dailyPts, newStreak, today, newBest, now, user.id)
  );

  if (milestonePts > 0) {
    const milestoneReason = `streak_milestone_${newStreak}`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO points_ledger (user_id, amount, reason, ref_id, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(user.id, milestonePts, milestoneReason, today, `${newStreak}-day streak milestone!`, now)
    );
    statements.push(
      env.DB.prepare(
        `UPDATE users SET points_balance = points_balance + ?, points_earned = points_earned + ? WHERE id = ?`
      ).bind(milestonePts, milestonePts, user.id)
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE")) return jsonError("daily_already_claimed", 409);
    throw e;
  }

  // Compute restore eligibility for the response
  // (after claiming today, restore is never eligible for the current user state)
  const canRestore = false;

  return jsonResponse({
    ok: true,
    awarded: totalAwarded,
    daily_pts: dailyPts,
    milestone_bonus: milestonePts,
    milestone_day: milestonePts > 0 ? newStreak : null,
    new_streak: newStreak,
    streak_best: newBest,
    can_restore: canRestore,
  });
}
