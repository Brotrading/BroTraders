// /api/click-stats — aggregated click data from D1.
//
// Returns JSON with click totals by firm + by day.
// Protected by a token query param to avoid scraping.
//
// Usage:
//   GET /api/click-stats?token=<STATS_TOKEN>&days=7
//
// Set STATS_TOKEN as a Pages environment variable (Settings → Environment variables).

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Auth check
  const provided = url.searchParams.get('token') || '';
  const expected = env.STATS_TOKEN || '';
  if (!expected || provided !== expected) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  if (!env.DB) {
    return jsonResponse({ error: 'D1 binding "DB" not configured' }, 500);
  }

  const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get('days') || '7', 10)));
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();

  try {
    // 1) Totals per firm
    const byFirm = await env.DB
      .prepare(
        `SELECT firm, COUNT(*) AS clicks
         FROM clicks
         WHERE created_at >= ?
         GROUP BY firm
         ORDER BY clicks DESC`
      )
      .bind(sinceIso)
      .all();

    // 2) Daily totals
    const byDay = await env.DB
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS clicks
         FROM clicks
         WHERE created_at >= ?
         GROUP BY day
         ORDER BY day ASC`
      )
      .bind(sinceIso)
      .all();

    // 3) Top source pages (referrer host + path)
    const byReferrer = await env.DB
      .prepare(
        `SELECT referrer, COUNT(*) AS clicks
         FROM clicks
         WHERE created_at >= ? AND referrer != ''
         GROUP BY referrer
         ORDER BY clicks DESC
         LIMIT 20`
      )
      .bind(sinceIso)
      .all();

    // 4) Top countries
    const byCountry = await env.DB
      .prepare(
        `SELECT country, COUNT(*) AS clicks
         FROM clicks
         WHERE created_at >= ? AND country != ''
         GROUP BY country
         ORDER BY clicks DESC
         LIMIT 20`
      )
      .bind(sinceIso)
      .all();

    const total = (byFirm.results || []).reduce((sum, r) => sum + r.clicks, 0);

    return jsonResponse({
      range_days: days,
      since: sinceIso,
      total_clicks: total,
      by_firm: byFirm.results || [],
      by_day: byDay.results || [],
      by_referrer: byReferrer.results || [],
      by_country: byCountry.results || [],
    });
  } catch (e) {
    return jsonResponse({ error: 'query_failed', detail: String(e?.message || e) }, 500);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
