// /go/<firm> — affiliate redirect with click tracking.
//
// - Looks up the firm slug in functions/go/_links.js
// - Logs the click to D1 (env binding "DB") without blocking the redirect
// - 302 redirects to the real affiliate URL
//
// Update affiliate URLs in _links.js — never hardcode them in HTML.

import { LINKS } from './_links.js';

export async function onRequest(context) {
  const { params, request, env } = context;
  const firm = (params.firm || '').toLowerCase();
  const dest = LINKS[firm];

  if (!dest) {
    return new Response(`Unknown affiliate slug: ${firm}`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // Fire-and-forget logging — never block or fail the redirect on a DB hiccup.
  context.waitUntil(logClick(env, request, firm));

  return Response.redirect(dest, 302);
}

async function logClick(env, request, firm) {
  if (!env.DB) return; // D1 binding not configured yet — skip silently.

  const url = new URL(request.url);
  const referrer = (request.headers.get('referer') || '').slice(0, 500);
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 500);
  const country = request.cf?.country || '';
  const colo = request.cf?.colo || '';
  const utmSource = url.searchParams.get('utm_source') || '';
  const utmMedium = url.searchParams.get('utm_medium') || '';
  const utmCampaign = url.searchParams.get('utm_campaign') || '';
  const now = new Date().toISOString();

  try {
    await env.DB
      .prepare(
        `INSERT INTO clicks
           (firm, referrer, user_agent, country, colo,
            utm_source, utm_medium, utm_campaign, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(firm, referrer, userAgent, country, colo, utmSource, utmMedium, utmCampaign, now)
      .run();
  } catch (e) {
    // Logged to Pages Function logs; redirect already happened.
    console.error('[go] D1 log failed', firm, e?.message);
  }
}
