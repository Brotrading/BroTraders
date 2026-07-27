// /api/affiliate-summary — affiliate revenue snapshot, token-gated.
//
// Replaces the old PUBLIC static file /data/affiliate-summary.json, which
// exposed real commission figures to anyone who guessed the URL. Data now
// lives in D1 (site_meta table, key 'affiliate_summary') and is only
// returned after a STATS_TOKEN check — same pattern as /api/click-stats.
//
// Usage:
//   GET  /api/affiliate-summary?token=<STATS_TOKEN>
//        → the summary JSON (same shape the static file had)
//   POST /api/affiliate-summary?token=<STATS_TOKEN>   body: summary JSON
//        → upserts the snapshot (used by scripts/sync_affiliate_summary.py
//          in the AIOS workspace after data/affiliate-data.csv updates)

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function authorized(request, env) {
  const url = new URL(request.url);
  const provided = url.searchParams.get('token') || request.headers.get('x-stats-token') || '';
  const expected = env.STATS_TOKEN || '';
  return expected && provided === expected;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!authorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'D1 binding "DB" not configured' }, 500);

  const row = await env.DB
    .prepare(`SELECT value, updated_at FROM site_meta WHERE key = 'affiliate_summary'`)
    .first()
    .catch(() => null);
  if (!row) return jsonResponse({ error: 'not_found', hint: 'No summary uploaded yet — run sync_affiliate_summary.py' }, 404);

  try {
    return jsonResponse(JSON.parse(row.value));
  } catch {
    return jsonResponse({ error: 'corrupt_summary' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!authorized(request, env)) return jsonResponse({ error: 'unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'D1 binding "DB" not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  if (!body || typeof body !== 'object' || !body.firms) {
    return jsonResponse({ error: 'invalid_summary', hint: 'Expected { updated_at, firms: {...} }' }, 400);
  }
  const raw = JSON.stringify(body);
  if (raw.length > 100_000) return jsonResponse({ error: 'too_large' }, 413);

  await env.DB
    .prepare(
      `INSERT INTO site_meta (key, value, updated_at)
       VALUES ('affiliate_summary', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(raw)
    .run();

  return jsonResponse({ ok: true, firms: Object.keys(body.firms).length });
}
