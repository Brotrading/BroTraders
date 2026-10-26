// The data admin page's API (/admin/data). Signed in with the admin token; the session
// is an HttpOnly cookie scoped to this path, kept in pfb_sessions as a hash.
//
//   POST /login {token}      POST /logout          GET /me
//   GET  /overview           GET  /news            GET /firms
//   PUT  /edit {kind, id, hidden, patch}           DELETE /edit?kind=&id=
//   GET  /pages              POST /pages/restore {path, id}
//   POST /render             POST /token {token}   POST /sessions/clear
//   GET  /scrape             POST /scrape          (start a run outside the schedule)
import {
  PAGES, SESSION_HOURS, database, isAdminToken, json, now, randomId, scrapeInfo, setJSON, setMeta, sha256,
} from "../_lib.js";

const COOKIE = "pfb_admin";
const COOKIE_PATH = "/api/pfb/admin";
const MAX_FAILURES = 10; // per IP per 15 minutes

// What the admin may change, per kind of item.
const FIELDS = {
  news: { title: "text", summary: "text", code: "text", ends: "text", type: ["promo", "news"],
          market: ["futures", "cfd", "perps"] },
  firm: { name: "text", code: "text" },
  account: { price: "money", sale_price: "money" },
};

function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function readCookie(request) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

async function session(DB, request) {
  const id = readCookie(request);
  if (!id) return null;
  const row = await DB.prepare("SELECT id, expires_at FROM pfb_sessions WHERE id = ? AND expires_at > ?")
    .bind(await sha256(id), now()).first();
  return row;
}

function cleanPatch(kind, patch) {
  const allowed = FIELDS[kind];
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const rule = allowed[k];
    if (!rule || v === undefined) continue;
    if (v === null || v === "") continue; // empty = keep the scraped value
    if (rule === "text") out[k] = String(v).slice(0, 2000);
    else if (rule === "money") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error(`${k} must be a price`);
      out[k] = Math.round(n * 100) / 100;
    } else if (Array.isArray(rule)) {
      if (!rule.includes(v)) throw new Error(`${k} must be one of ${rule.join(", ")}`);
      out[k] = v;
    }
  }
  return out;
}

async function bumpEdits(DB) {
  await setMeta(DB, "edits_updated_at", now()).run();
}

async function editsOf(DB, kinds) {
  const rows = await DB.prepare(
    `SELECT kind, item_id, hidden, patch, updated_at FROM pfb_edits WHERE kind IN (${kinds.map(() => "?").join(",")})`
  ).bind(...kinds).all();
  const out = {};
  for (const e of rows.results) {
    (out[e.kind] ||= {})[e.item_id] = { hidden: !!e.hidden, patch: JSON.parse(e.patch || "{}"), updated_at: e.updated_at };
  }
  return out;
}

async function data(DB, kind) {
  const row = await DB.prepare("SELECT data, items, updated_at FROM pfb_data WHERE kind = ?").bind(kind).first();
  return row ? { data: JSON.parse(row.data), items: row.items, updated_at: row.updated_at } : null;
}

async function pagesInfo(DB) {
  const cur = await DB.prepare(
    `SELECT p.path, p.version_id, p.edits_version, p.updated_at, v.bytes
       FROM pfb_pages p LEFT JOIN pfb_page_versions v ON v.id = p.version_id`
  ).all();
  const versions = await DB.prepare(
    "SELECT id, path, bytes, source, created_at FROM pfb_page_versions ORDER BY id DESC"
  ).all();
  return PAGES.map((path) => ({
    path,
    current: cur.results.find((p) => p.path === path) || null,
    versions: versions.results.filter((v) => v.path === path),
  }));
}

const routes = {
  "GET me": async ({ sess }) => json({ ok: true, expires_at: sess.expires_at }),

  "POST logout": async ({ DB, sess }) => {
    await DB.prepare("DELETE FROM pfb_sessions WHERE id = ?").bind(sess.id).run();
    return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
  },

  "GET overview": async ({ DB }) => {
    const [news, prices, counts, meta] = await Promise.all([
      DB.prepare("SELECT items, updated_at FROM pfb_data WHERE kind = 'news'").first(),
      DB.prepare("SELECT items, updated_at FROM pfb_data WHERE kind = 'prices'").first(),
      DB.prepare("SELECT kind, COUNT(*) AS n, SUM(hidden) AS hidden FROM pfb_edits GROUP BY kind").all(),
      DB.prepare("SELECT key, value FROM pfb_meta WHERE key IN ('edits_updated_at', 'render_requested_at')").all(),
    ]);
    let promos = null;
    const full = await data(DB, "news");
    if (full) promos = full.data.items.filter((i) => i.type === "promo").length;
    return json({
      news: news && { ...news, promos },
      prices,
      edits: counts.results,
      meta: Object.fromEntries(meta.results.map((m) => [m.key, m.value])),
      pages: await pagesInfo(DB),
      scrape: await scrapeInfo(DB),
    });
  },

  "GET scrape": async ({ DB }) => json(await scrapeInfo(DB)),

  // The server checks every minute and starts the run (it can't be reached from here).
  "POST scrape": async ({ DB }) => {
    const { status } = await scrapeInfo(DB);
    if ((status.state === "queued" || status.state === "running") && !status.stale)
      return json({ error: status.state === "running" ? "A scrape is already running." : "A scrape is already waiting to start." }, 409);
    const next = { ...status, state: "queued", requested_at: now(), stale: undefined };
    await setJSON(DB, "scrape_status", next).run();
    return json({ ok: true, status: next });
  },

  "GET news": async ({ DB }) => {
    const d = await data(DB, "news");
    return json({ news: d, edits: (await editsOf(DB, ["news"])).news || {} });
  },

  "GET firms": async ({ DB }) => {
    const d = await data(DB, "prices");
    const e = await editsOf(DB, ["firm", "account"]);
    return json({ prices: d, edits: { firm: e.firm || {}, account: e.account || {} } });
  },

  "PUT edit": async ({ DB, body }) => {
    const { kind, id } = body;
    if (!FIELDS[kind] || !id || String(id).length > 300) return json({ error: "bad item" }, 400);
    let patch;
    try {
      patch = cleanPatch(kind, body.patch);
    } catch (e) {
      return json({ error: e.message }, 400);
    }
    const hidden = body.hidden ? 1 : 0;
    if (!hidden && !Object.keys(patch).length) {
      await DB.prepare("DELETE FROM pfb_edits WHERE kind = ? AND item_id = ?").bind(kind, String(id)).run();
    } else {
      await DB.prepare(
        `INSERT INTO pfb_edits (kind, item_id, hidden, patch, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kind, item_id) DO UPDATE SET hidden = excluded.hidden, patch = excluded.patch,
           updated_at = excluded.updated_at`
      ).bind(kind, String(id), hidden, JSON.stringify(patch), now()).run();
    }
    await bumpEdits(DB);
    return json({ ok: true, kind, id, hidden: !!hidden, patch });
  },

  "DELETE edit": async ({ DB, url }) => {
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id");
    if (!FIELDS[kind] || !id) return json({ error: "bad item" }, 400);
    // Removes only the admin's change; the scraped item itself is untouched.
    await DB.prepare("DELETE FROM pfb_edits WHERE kind = ? AND item_id = ?").bind(kind, id).run();
    await bumpEdits(DB);
    return json({ ok: true });
  },

  "GET pages": async ({ DB }) => json({ pages: await pagesInfo(DB) }),

  "POST pages/restore": async ({ DB, body }) => {
    const v = await DB.prepare("SELECT id, path FROM pfb_page_versions WHERE id = ? AND path = ?")
      .bind(Number(body.id), String(body.path)).first();
    if (!v) return json({ error: "no such version" }, 404);
    await DB.prepare("UPDATE pfb_pages SET version_id = ?, updated_at = ? WHERE path = ?")
      .bind(v.id, now(), v.path).run();
    return json({ ok: true, path: v.path, version: v.id });
  },

  "POST render": async ({ DB }) => {
    await setMeta(DB, "render_requested_at", now()).run();
    return json({ ok: true });
  },

  "POST token": async ({ DB, body, sess }) => {
    const token = String(body.token || "");
    if (token.length < 32) return json({ error: "use at least 32 characters" }, 400);
    await DB.batch([
      setMeta(DB, "admin_token_hash", await sha256(token)),
      DB.prepare("DELETE FROM pfb_sessions WHERE id <> ?").bind(sess.id),
    ]);
    return json({ ok: true });
  },

  "POST sessions/clear": async ({ DB, sess }) => {
    await DB.prepare("DELETE FROM pfb_sessions WHERE id <> ?").bind(sess.id).run();
    return json({ ok: true });
  },
};

async function login(DB, request) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  await DB.prepare("DELETE FROM pfb_login_failures WHERE at < ?").bind(since).run();
  const fails = await DB.prepare("SELECT COUNT(*) AS n FROM pfb_login_failures WHERE ip = ?").bind(ip).first();
  if (fails.n >= MAX_FAILURES) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);

  const body = await request.json().catch(() => ({}));
  if (!(await isAdminToken(DB, String(body.token || "").trim()))) {
    await DB.prepare("INSERT INTO pfb_login_failures (ip, at) VALUES (?, ?)").bind(ip, now()).run();
    return json({ error: "That token isn't right." }, 401);
  }
  const id = randomId();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString();
  await DB.batch([
    DB.prepare("DELETE FROM pfb_sessions WHERE expires_at < ?").bind(now()),
    DB.prepare("INSERT INTO pfb_sessions (id, created_at, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(id), now(), expires),
  ]);
  return json({ ok: true, expires_at: expires }, 200, { "set-cookie": cookie(id, SESSION_HOURS * 3600) });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const route = `${request.method} ${(params.path || []).join("/")}`;

  // Changes only from our own page, as JSON (with the SameSite cookie, this stops cross-site posts).
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json({ error: "bad origin" }, 403);
    if (request.method !== "DELETE" && !(request.headers.get("content-type") || "").includes("application/json"))
      return json({ error: "send JSON" }, 415);
  }

  const DB = await database(env);
  if (!DB) return json({ error: 'D1 binding "DB" not configured' }, 503);
  try {
    if (route === "POST login") return await login(DB, request);
    const sess = await session(DB, request);
    if (!sess) return json({ error: "signed out" }, 401, { "set-cookie": cookie("", 0) });
    const handler = routes[route];
    if (!handler) return json({ error: "not found" }, 404);
    const body = ["POST", "PUT"].includes(request.method) ? await request.json().catch(() => ({})) : null;
    return await handler({ DB, request, url, body, sess });
  } catch (e) {
    console.error("pfb admin", route, e);
    return json({ error: String(e.message || e) }, 500);
  }
}
