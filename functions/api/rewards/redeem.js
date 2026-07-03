// POST /api/rewards/redeem  body: { package_slug, fulfillment_data?: object }
//
// Auto-fulfillment:
//   - fulfillment = 'pro_bro_extend'  → grants Pro Bro immediately
//   - uses_discount_codes = 1         → assigns code from pool, emails user, marks fulfilled
//   - otherwise                       → stays pending, Mike fulfills manually

import {
  jsonResponse,
  jsonError,
  verifySupabaseToken,
  postLedger,
  getUserRow,
  GLOBAL_UNLOCK_PURCHASE_PTS,
  PER_FIRM_UNLOCK_CLAIMS,
  EARN_RATES,
} from "./_lib.js";

async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || "BroTrading <noreply@propfirmbro.com>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!r.ok) console.error("[redeem] email failed:", r.status, await r.text());
  } catch (e) {
    console.error("[redeem] email error:", e?.message);
  }
}

function discountCodeEmail(packageTitle, code) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;"><table width="480" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;border:1px solid #2d3248;"><tr><td style="padding:32px 28px;"><p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Bro Rewards</p><h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#f8fafc;">🎉 Your Bro Pack is ready!</h1><p style="margin:0 0 16px;font-size:15px;color:#cbd5e1;">You successfully redeemed <strong style="color:#f8fafc;">${packageTitle}</strong>. Use the code below for 100% off at checkout:</p><div style="background:#0f1117;border-radius:8px;padding:20px 24px;margin:0 0 24px;text-align:center;border:1px dashed #ff6b00;"><p style="margin:0 0 6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Your discount code</p><p style="margin:0;font-size:30px;font-weight:800;color:#ff6b00;letter-spacing:0.08em;">${code}</p></div><p style="margin:0 0 24px;font-size:13px;color:#64748b;">Apply this code at checkout to get 100% off. Single-use only. Questions? <a href="mailto:support@propfirmbro.com" style="color:#ff6b00;">support@propfirmbro.com</a></p><a href="https://propfirmbro.com" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Back to propfirmbro.com →</a></td></tr></table></td></tr></table></body></html>`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    return await _handleRedeem(context);
  } catch (e) {
    console.error("[redeem] unhandled:", e?.message, e?.stack);
    return jsonError("internal_error", 500, { detail: e?.message || String(e) });
  }
}

async function _handleRedeem(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return jsonError("invalid_json", 400);
  }
  const packageSlug = (body.package_slug || "").trim();
  if (!packageSlug) return jsonError("missing_package_slug", 400);

  const pkg = await env.DB
    .prepare(`SELECT * FROM bro_packages WHERE slug = ? AND is_active = 1`)
    .bind(packageSlug)
    .first();
  if (!pkg) return jsonError("package_not_found", 404);

  const row = await getUserRow(env, user.id);
  if (!row) return jsonError("user_not_synced", 404);

  // Redemption gate (skipped for gate_exempt packs like Pro Bro):
  // unlock via EITHER 10+ approved claims at this pack's firm,
  // OR 90,000+ purchase points total across all firms.
  if (!pkg.gate_exempt) {
    const purchaseEarned = await env.DB
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM points_ledger
         WHERE user_id = ? AND reason = 'purchase_cashback'`
      )
      .bind(user.id)
      .first();
    const purchasePts = purchaseEarned?.total || 0;

    if (purchasePts < GLOBAL_UNLOCK_PURCHASE_PTS) {
      let firmClaims = 0;
      if (pkg.firm_slug) {
        const claimCount = await env.DB
          .prepare(
            `SELECT COUNT(*) AS n FROM purchase_claims
             WHERE user_id = ? AND firm_slug = ? AND status = 'approved'`
          )
          .bind(user.id, pkg.firm_slug)
          .first();
        firmClaims = claimCount?.n || 0;
      }

      if (firmClaims < PER_FIRM_UNLOCK_CLAIMS) {
        return jsonError("redemption_gate_not_met", 403, {
          purchase_pts_earned: purchasePts,
          purchase_pts_required: GLOBAL_UNLOCK_PURCHASE_PTS,
          firm_slug: pkg.firm_slug || null,
          firm_claims: firmClaims,
          firm_claims_required: pkg.firm_slug ? PER_FIRM_UNLOCK_CLAIMS : null,
          message: pkg.firm_slug
            ? `Unlock this reward with ${PER_FIRM_UNLOCK_CLAIMS} approved purchases at this firm (you have ${firmClaims}) or ${GLOBAL_UNLOCK_PURCHASE_PTS - purchasePts} more purchase points overall.`
            : `Earn ${GLOBAL_UNLOCK_PURCHASE_PTS - purchasePts} more points via purchases to unlock this Bro Pack.`,
        });
      }
    }
  }

  if (row.points_balance < pkg.points_cost) {
    return jsonError("insufficient_points", 409, {
      points_balance: row.points_balance,
      points_required: pkg.points_cost,
    });
  }

  // Atomic stock check-and-decrement (before code grab to keep rollback simple).
  if (pkg.stock !== null) {
    const stockResult = await env.DB
      .prepare(`UPDATE bro_packages SET stock = stock - 1 WHERE slug = ? AND stock > 0`)
      .bind(pkg.slug)
      .run();
    if (stockResult.meta.changes === 0) return jsonError("out_of_stock", 409);
  }

  // For code-based packages: atomically grab a code before inserting the redemption
  // so we never create orphaned pending rows when the pool is empty.
  let grabbedCode = null;
  if (pkg.uses_discount_codes) {
    const codeRow = await env.DB
      .prepare(
        `SELECT id, code FROM bro_pack_codes
         WHERE package_slug = ? AND assigned_to_user_id IS NULL
         LIMIT 1`
      )
      .bind(pkg.slug)
      .first();

    if (!codeRow) {
      if (pkg.stock !== null) {
        await env.DB.prepare(`UPDATE bro_packages SET stock = stock + 1 WHERE slug = ?`).bind(pkg.slug).run();
      }
      return jsonError("no_codes_available", 409);
    }

    const now0 = new Date().toISOString();
    const assigned = await env.DB
      .prepare(
        `UPDATE bro_pack_codes
         SET assigned_to_user_id = ?, assigned_at = ?
         WHERE id = ? AND assigned_to_user_id IS NULL`
      )
      .bind(user.id, now0, codeRow.id)
      .run();

    if (assigned.meta.changes === 0) {
      // Race condition: another request grabbed the same code.
      if (pkg.stock !== null) {
        await env.DB.prepare(`UPDATE bro_packages SET stock = stock + 1 WHERE slug = ?`).bind(pkg.slug).run();
      }
      return jsonError("no_codes_available", 409);
    }
    grabbedCode = { id: codeRow.id, code: codeRow.code };
  }

  const now = new Date().toISOString();
  const fulfillment_data = body.fulfillment_data ? JSON.stringify(body.fulfillment_data) : null;

  const insert = await env.DB
    .prepare(
      `INSERT INTO redemptions (user_id, package_slug, points_cost, status, fulfillment_data, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`
    )
    .bind(user.id, pkg.slug, pkg.points_cost, fulfillment_data, now)
    .run();

  const redemptionId = insert.meta.last_row_id;

  try {
    await postLedger(env, {
      user_id: user.id,
      amount: -pkg.points_cost,
      reason: "redemption",
      ref_id: String(redemptionId),
      note: pkg.title,
      minBalance: 0,
    });
  } catch (e) {
    if (e?.message?.includes("insufficient_balance")) {
      // Race condition: another request spent points between our check and deduction.
      if (pkg.stock !== null) {
        await env.DB.prepare(`UPDATE bro_packages SET stock = stock + 1 WHERE slug = ?`).bind(pkg.slug).run();
      }
      if (grabbedCode) {
        await env.DB
          .prepare(`UPDATE bro_pack_codes SET assigned_to_user_id = NULL, assigned_at = NULL WHERE id = ?`)
          .bind(grabbedCode.id)
          .run();
      }
      await env.DB.prepare(`UPDATE redemptions SET status = 'cancelled' WHERE id = ?`).bind(redemptionId).run();
      return jsonError("insufficient_points", 409, {
        points_balance: row.points_balance,
        points_required: pkg.points_cost,
      });
    }
    throw e;
  }

  const updated = await getUserRow(env, user.id);
  if (!updated) {
    console.error("[redeem] user row missing after postLedger for", user.id);
    return jsonError("user_not_found", 500);
  }

  // ── Auto-fulfill: Pro Bro ────────────────────────────────────────────────
  if (pkg.fulfillment === "pro_bro_extend") {
    const now2 = new Date().toISOString();
    await env.DB
      .prepare(`UPDATE users SET is_pro_bro = 1, pro_bro_since = COALESCE(pro_bro_since, ?) WHERE id = ?`)
      .bind(now2, user.id)
      .run();
    if (!updated.pro_bro_bonus_paid) {
      await postLedger(env, {
        user_id: user.id,
        amount: EARN_RATES.pro_bro_welcome,
        reason: "pro_bro_welcome",
        note: "Pro Bro welcome bonus (store redemption)",
      });
      await env.DB.prepare(`UPDATE users SET pro_bro_bonus_paid = 1 WHERE id = ?`).bind(user.id).run();
    }
    await env.DB
      .prepare(`UPDATE redemptions SET status = 'fulfilled', fulfilled_at = ? WHERE id = ?`)
      .bind(now2, redemptionId)
      .run();
    const finalRow = await getUserRow(env, user.id);
    return jsonResponse({
      ok: true,
      redemption: {
        id: redemptionId,
        package_slug: pkg.slug,
        title: pkg.title,
        points_cost: pkg.points_cost,
        status: "fulfilled",
        created_at: now,
      },
      points_balance: finalRow.points_balance,
      pro_bro_granted: true,
    });
  }

  // ── Auto-fulfill: discount code ──────────────────────────────────────────
  if (grabbedCode) {
    const now2 = new Date().toISOString();
    await env.DB
      .prepare(`UPDATE bro_pack_codes SET redemption_id = ? WHERE id = ?`)
      .bind(redemptionId, grabbedCode.id)
      .run();
    await env.DB
      .prepare(
        `UPDATE redemptions SET status = 'fulfilled', fulfilled_at = ?, discount_code = ? WHERE id = ?`
      )
      .bind(now2, grabbedCode.code, redemptionId)
      .run();
    // Fire-and-forget — use waitUntil so the runtime keeps the promise alive
    context.waitUntil(sendEmail(env, {
      to: updated.email,
      subject: `🎉 Your Bro Pack is ready — here's your discount code`,
      html: discountCodeEmail(pkg.title, grabbedCode.code),
    }));
    return jsonResponse({
      ok: true,
      redemption: {
        id: redemptionId,
        package_slug: pkg.slug,
        title: pkg.title,
        points_cost: pkg.points_cost,
        status: "fulfilled",
        created_at: now,
        discount_code: grabbedCode.code,
      },
      points_balance: updated.points_balance,
      discount_code: grabbedCode.code,
    });
  }

  // ── Manual fulfillment: Mike handles it via admin dashboard ─────────────
  return jsonResponse({
    ok: true,
    redemption: {
      id: redemptionId,
      package_slug: pkg.slug,
      title: pkg.title,
      points_cost: pkg.points_cost,
      status: "pending",
      created_at: now,
    },
    points_balance: updated.points_balance,
  });
}
