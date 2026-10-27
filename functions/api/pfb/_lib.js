// Shared by the scraper-data functions: /api/pfb/bot/*, /api/pfb/admin/*, /News,
// /CompareTopFirms/FastCompare and the home page (/). Written by the scraper repo
// (site_assets/site), copied in by its publish step.
//
// Everything lives in our own tables (pfb_ prefix) in the existing D1 database (env.DB).
// Nothing here reads or changes any other table. The tables are created on first use.

// The pages the scraper renders, by their public path (Cloudflare serves X.html at X).
// "/" is Mike's home page (index.html from main) with the scraper's firm table.
export const PAGES = ["/News", "/CompareTopFirms/FastCompare", "/"];

// SHA-256 of the tokens. The tokens themselves are only with the admin and in the
// scraper server's .env. The admin token can be changed from the admin page (stored
// as a hash in pfb_meta); this one is the default until then.
const DEFAULT_ADMIN_HASH = "eb70877d95ef578671a51b418ef656cf5b51c6a0cf0415f8f355affd168abce1";
const BOT_HASH = "7633af8d387c433e2a50a3bcbd76f5750bbb05e4297a7f0678d88f66fb2fa17d";

export const SESSION_HOURS = 12;
export const KEEP_VERSIONS = 10;
// A page copy older than this is ignored (the static file is newer by then).
const STALE_DAYS = 3;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pfb_page_versions (
     id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, html TEXT NOT NULL,
     bytes INTEGER NOT NULL, source TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_pfb_page_versions_path ON pfb_page_versions(path, id)`,
  `CREATE TABLE IF NOT EXISTS pfb_pages (
     path TEXT PRIMARY KEY, version_id INTEGER NOT NULL, edits_version TEXT, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pfb_data (
     kind TEXT PRIMARY KEY, data TEXT NOT NULL, items INTEGER, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pfb_edits (
     kind TEXT NOT NULL, item_id TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
     patch TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, PRIMARY KEY (kind, item_id))`,
  `CREATE TABLE IF NOT EXISTS pfb_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pfb_sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pfb_login_failures (ip TEXT NOT NULL, at TEXT NOT NULL)`,
];

let schemaReady = false;

// The database with our tables in place, or null when the DB binding isn't there.
export async function database(env) {
  if (!env.DB) return null;
  if (!schemaReady) {
    await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
    schemaReady = true;
  }
  return env.DB;
}

export const now = () => new Date().toISOString();

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function getMeta(DB, key) {
  const row = await DB.prepare("SELECT value FROM pfb_meta WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

export function setMeta(DB, key, value) {
  return DB.prepare(
    `INSERT INTO pfb_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, value, now());
}

export async function getJSON(DB, key, fallback = null) {
  const v = await getMeta(DB, key);
  if (v == null) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export const setJSON = (DB, key, value) => setMeta(DB, key, JSON.stringify(value));

// The scrape run as the admin sees it: the run's status, the last runs, and the
// server's last check-in. A queued request older than this is treated as lost.
export const QUEUE_STALE_MIN = 10;
export const RUNNING_STALE_MIN = 45;

export async function scrapeInfo(DB) {
  const [status, runs, heartbeat] = await Promise.all([
    getJSON(DB, "scrape_status", { state: "idle" }),
    getJSON(DB, "scrape_runs", []),
    getJSON(DB, "server_heartbeat", null),
  ]);
  const age = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 60e3 : Infinity);
  if (status.state === "queued" && age(status.requested_at) > QUEUE_STALE_MIN) status.stale = true;
  if (status.state === "running" && age(status.updated_at || status.started_at) > RUNNING_STALE_MIN) status.stale = true;
  return { status, runs, heartbeat, now: now() };
}

export async function isAdminToken(DB, token) {
  if (!token) return false;
  const stored = (await getMeta(DB, "admin_token_hash")) || DEFAULT_ADMIN_HASH;
  return sameHex(await sha256(token), stored);
}

export async function isBot(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token !== "" && sameHex(await sha256(token), BOT_HASH);
}

// Serve one of the scraper's pages from D1; the static file when there is no usable copy.
export async function servePage(context, path) {
  const { env, request } = context;
  try {
    const DB = await database(env);
    if (!DB) return context.next();
    const cur = await DB.prepare("SELECT version_id, updated_at FROM pfb_pages WHERE path = ?").bind(path).first();
    if (!cur || Date.now() - Date.parse(cur.updated_at) > STALE_DAYS * 864e5) return context.next();

    const url = new URL(request.url);
    const key = new Request(`${url.origin}${path}?pfb_v=${cur.version_id}`);
    const cache = caches.default;
    let res = await cache.match(key);
    if (!res) {
      const row = await DB.prepare("SELECT html FROM pfb_page_versions WHERE id = ?").bind(cur.version_id).first();
      if (!row) return context.next();
      res = new Response(row.html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
      });
      context.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    out.headers.set("x-pfb-source", `d1 v${cur.version_id}`);
    return out;
  } catch (e) {
    console.error("pfb page from D1 failed, serving the static file:", e);
    return context.next();
  }
}
