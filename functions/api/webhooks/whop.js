// POST /api/webhooks/whop — Whop membership webhook handler.
//
// Automatically toggles Pro Bro status when a member subscribes or cancels on Whop.
// Uses the Standard Webhooks signature spec (HMAC-SHA256, same as Stripe).
//
// Required Cloudflare env var:
//   WHOP_WEBHOOK_SECRET  — signing secret from Whop dashboard → Developer → Webhooks
//                          Format: "whsec_<base64>" or plain base64 string
//
// Setup (Mike does this once in Whop dashboard):
//   1. Whop dashboard → Developer → Webhooks → Add endpoint
//   2. URL: https://propfirmbro.com/api/webhooks/whop
//   3. Events: membership.activated + membership.deactivated
//   4. Copy the signing secret → add as WHOP_WEBHOOK_SECRET in Cloudflare env vars
//
// Matching logic: Whop user email ↔ Supabase/D1 user email.
// If the emails match, Pro Bro status is flipped automatically.
// If no match: event is logged and ignored (user may not have a BroBros account yet).

import { jsonResponse, jsonError, postLedger, getUserRow, EARN_RATES } from "../rewards/_lib.js";

const STALE_THRESHOLD_SECONDS = 300; // reject webhooks older than 5 minutes

async function verifySignature(webhookId, webhookTimestamp, rawBody, secret) {
  try {
    const ts = parseInt(webhookTimestamp, 10);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > STALE_THRESHOLD_SECONDS) return false;

    // Accept both "whsec_<base64>" and plain base64 formats.
    const base64Secret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const secretBytes = Uint8Array.from(atob(base64Secret), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const toSign = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

    // webhook-signature header can contain multiple sigs: "v1,sig1 v1,sig2"
    const incoming = (webhookId && webhookTimestamp)
      ? (arguments[4] || "")  // passed explicitly below
      : "";
    return incoming.split(" ").some((s) => s.replace(/^v\d+,/, "") === computed);
  } catch (e) {
    console.error("[whop-webhook] signature error:", e?.message);
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.WHOP_WEBHOOK_SECRET || "";
  if (!secret) {
    console.error("[whop-webhook] WHOP_WEBHOOK_SECRET not set");
    return jsonError("webhook_secret_not_configured", 500);
  }

  const webhookId        = request.headers.get("webhook-id") || "";
  const webhookTimestamp = request.headers.get("webhook-timestamp") || "";
  const webhookSignature = request.headers.get("webhook-signature") || "";

  // Read raw body first — can only be consumed once.
  const rawBody = await request.text();

  // Verify signature.
  try {
    const ts = parseInt(webhookTimestamp, 10);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > STALE_THRESHOLD_SECONDS) {
      return jsonError("stale_webhook", 400);
    }

    const base64Secret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const secretBytes = Uint8Array.from(atob(base64Secret), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const toSign = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

    const valid = webhookSignature.split(" ").some((s) => s.replace(/^v\d+,/, "") === computed);
    if (!valid) {
      console.error("[whop-webhook] invalid signature");
      return jsonError("invalid_signature", 401);
    }
  } catch (e) {
    console.error("[whop-webhook] verification failed:", e?.message);
    return jsonError("signature_verification_failed", 400);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError("invalid_json", 400);
  }

  const event = payload?.event || "";
  const data  = payload?.data || {};
  const email = (data?.user?.email || "").toLowerCase().trim();

  if (!email) {
    console.warn("[whop-webhook] no user email in payload, event:", event);
    return jsonResponse({ ok: true, skipped: "no_email" });
  }

  const DEACTIVATION_EVENTS = new Set([
    "membership.deactivated",
    "membership.went_invalid",
    "membership.expired",
    "membership.cancelled",
  ]);
  const isActivation = event === "membership.activated";
  if (!isActivation && !DEACTIVATION_EVENTS.has(event)) {
    return jsonResponse({ ok: true, skipped: "unhandled_event", event });
  }

  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await env.DB
    .prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`)
    .bind(email)
    .first();

  if (!user) {
    // User hasn't created a BroBros account yet — harmless, log and move on.
    console.log(`[whop-webhook] ${event}: no BroBros account for ${email}`);
    return jsonResponse({ ok: true, skipped: "user_not_found" });
  }
  const now = new Date().toISOString();

  await env.DB
    .prepare(
      `UPDATE users
       SET is_pro_bro = ?,
           pro_bro_since = CASE WHEN ? = 1 THEN COALESCE(pro_bro_since, ?) ELSE pro_bro_since END
       WHERE id = ?`
    )
    .bind(isActivation ? 1 : 0, isActivation ? 1 : 0, now, user.id)
    .run();

  // Award the one-time Pro Bro welcome bonus on first activation.
  if (isActivation && !user.pro_bro_bonus_paid) {
    await postLedger(env, {
      user_id: user.id,
      amount: EARN_RATES.pro_bro_welcome,
      reason: "pro_bro_welcome",
      note: "Pro Bro welcome bonus (Whop)",
    });
    await env.DB
      .prepare(`UPDATE users SET pro_bro_bonus_paid = 1 WHERE id = ?`)
      .bind(user.id)
      .run();
  }

  console.log(`[whop-webhook] ${event}: ${email} → is_pro_bro=${isActivation ? 1 : 0}`);
  return jsonResponse({ ok: true, event, email, is_pro_bro: isActivation });
}
