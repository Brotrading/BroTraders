// The scraper server's side: send data and rendered pages, read the admin's edits.
// Authorization: Bearer <SITE_INGEST_TOKEN from the scraper's .env>.
//
//   GET  /api/pfb/bot/sync   edits, the edits version and what each page was rendered with
//   POST /api/pfb/bot/data   {kind: "news" | "prices", data}
//   POST /api/pfb/bot/page   {path, html, edits_version}
//   POST /api/pfb/bot/status {event: "start" | "progress" | "finish" | "heartbeat", ...}
import {
  PAGES, KEEP_VERSIONS, database, getJSON, getMeta, isBot, json, now, scrapeInfo, setJSON,
} from "../_lib.js";

const KEEP_RUNS = 10;

const MAX_HTML = 1_900_000; // a D1 row holds up to 2 MB

function checkData(kind, data) {
  if (kind === "news") {
    const n = Array.isArray(data?.items) ? data.items.length : 0;
    return n > 0 ? n : "news needs at least one item";
  }
  if (kind === "prices") {
    const n = data && typeof data.firms === "object" ? Object.keys(data.firms).length : 0;
    return n > 0 ? n : "prices needs at least one firm";
  }
  return `unknown kind ${kind}`;
}

async function sync(DB) {
  const edits = await DB.prepare("SELECT kind, item_id, hidden, patch, updated_at FROM pfb_edits").all();
  const pages = await DB.prepare("SELECT path, version_id, edits_version, updated_at FROM pfb_pages").all();
  return json({
    edits: edits.results.map((e) => ({ ...e, hidden: !!e.hidden, patch: JSON.parse(e.patch || "{}") })),
    edits_version: (await getMeta(DB, "edits_updated_at")) || "",
    render_requested_at: (await getMeta(DB, "render_requested_at")) || "",
    pages: Object.fromEntries(pages.results.map((p) => [p.path, p])),
    page_paths: PAGES, // what this deploy accepts: the scraper sends only these
    scrape: (await scrapeInfo(DB)).status,
  });
}

// A scrape run reporting in (run_all.sh, progress.py), or the server's check-in (d1sync).
async function putStatus(DB, body) {
  const at = now();
  const prev = await getJSON(DB, "scrape_status", { state: "idle" });
  const step = { step: body.step || null, pct: Math.max(0, Math.min(100, Number(body.pct) || 0)),
                 label: String(body.label || "").slice(0, 200), updated_at: at };
  if (body.event === "heartbeat") {
    await setJSON(DB, "server_heartbeat", {
      at, next_run: body.next_run || null, active: !!body.active, host: String(body.host || "").slice(0, 60),
    }).run();
  } else if (body.event === "start") {
    await setJSON(DB, "scrape_status", {
      state: "running", ...step, started_at: at, finished_at: null,
      trigger: body.trigger || (prev.state === "queued" ? "manual" : "schedule"),
    }).run();
  } else if (body.event === "progress") {
    // A lost "start" (a deploy switching over, a network blip) doesn't hide the run.
    const run = prev.state === "running" ? prev
      : { state: "running", started_at: at, finished_at: null, trigger: prev.state === "queued" ? "manual" : "schedule" };
    await setJSON(DB, "scrape_status", { ...run, ...step }).run();
  } else if (body.event === "finish") {
    const failed = (Array.isArray(body.failed) ? body.failed : []).map(String).slice(0, 10);
    const done = { ...prev, ...step, pct: 100, state: failed.length ? "failed" : "done", finished_at: at, failed };
    const runs = await getJSON(DB, "scrape_runs", []);
    runs.unshift({ started_at: done.started_at, finished_at: at, trigger: done.trigger, failed });
    await DB.batch([setJSON(DB, "scrape_status", done), setJSON(DB, "scrape_runs", runs.slice(0, KEEP_RUNS))]);
  } else {
    return json({ error: "unknown event" }, 400);
  }
  return json({ ok: true });
}

async function putData(DB, body) {
  const n = checkData(body.kind, body.data);
  if (typeof n === "string") return json({ error: n }, 400);
  await DB.prepare(
    `INSERT INTO pfb_data (kind, data, items, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET data = excluded.data, items = excluded.items, updated_at = excluded.updated_at`
  ).bind(body.kind, JSON.stringify(body.data), n, now()).run();
  return json({ ok: true, kind: body.kind, items: n });
}

async function putPage(DB, body) {
  const { path, html } = body;
  if (!PAGES.includes(path)) return json({ error: `unknown page ${path}` }, 400);
  if (typeof html !== "string" || html.length < 20_000 || !html.includes("</html>"))
    return json({ error: "html looks incomplete" }, 400);
  if (html.length > MAX_HTML) return json({ error: "html too large" }, 413);

  const at = now();
  const row = await DB.prepare(
    "INSERT INTO pfb_page_versions (path, html, bytes, source, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id"
  ).bind(path, html, html.length, body.source || "scraper", at).first();
  await DB.batch([
    DB.prepare(
      `INSERT INTO pfb_pages (path, version_id, edits_version, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET version_id = excluded.version_id,
         edits_version = excluded.edits_version, updated_at = excluded.updated_at`
    ).bind(path, row.id, body.edits_version || "", at),
    // Only our own old copies of this page, never the one in use.
    DB.prepare(
      `DELETE FROM pfb_page_versions WHERE path = ?1
         AND id NOT IN (SELECT id FROM pfb_page_versions WHERE path = ?1 ORDER BY id DESC LIMIT ?2)
         AND id <> (SELECT version_id FROM pfb_pages WHERE path = ?1)`
    ).bind(path, KEEP_VERSIONS),
  ]);
  return json({ ok: true, path, version: row.id });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!(await isBot(request))) return json({ error: "unauthorized" }, 401);
  const DB = await database(env);
  if (!DB) return json({ error: 'D1 binding "DB" not configured' }, 503);

  const route = (params.path || []).join("/");
  try {
    if (request.method === "GET" && route === "sync") return await sync(DB);
    if (request.method === "POST" && ["data", "page", "status"].includes(route)) {
      const body = await request.json();
      if (route === "status") return await putStatus(DB, body);
      return await (route === "data" ? putData(DB, body) : putPage(DB, body));
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error("pfb bot", route, e);
    return json({ error: String(e.message || e) }, 500);
  }
}
