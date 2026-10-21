-- Tables for the scraper's pages and the data admin (/admin/data).
--
-- Nothing to run by hand: functions/api/pfb/_lib.js creates these on first use
-- (CREATE TABLE IF NOT EXISTS). Kept here as the record of what they are.
-- All are ours alone (pfb_ prefix); no other table is read or changed.

-- Each rendered copy of a scraper page (News, Compare); the last 10 per page are kept.
CREATE TABLE IF NOT EXISTS pfb_page_versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT NOT NULL,            -- public path, e.g. /News
  html       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  source     TEXT,                     -- scraper | render (after an admin edit)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pfb_page_versions_path ON pfb_page_versions(path, id);

-- The copy each page serves now (the admin can switch back to an older one).
CREATE TABLE IF NOT EXISTS pfb_pages (
  path          TEXT PRIMARY KEY,
  version_id    INTEGER NOT NULL,
  edits_version TEXT,                  -- the admin edits it was rendered with
  updated_at    TEXT NOT NULL
);

-- The newest scraped data, as the scraper sent it: news (news + promos), prices (firms + accounts).
CREATE TABLE IF NOT EXISTS pfb_data (
  kind       TEXT PRIMARY KEY,
  data       TEXT NOT NULL,            -- JSON
  items      INTEGER,
  updated_at TEXT NOT NULL
);

-- The admin's changes, applied on top of every scrape: hide an item, or override fields.
CREATE TABLE IF NOT EXISTS pfb_edits (
  kind       TEXT NOT NULL,            -- news | firm | account
  item_id    TEXT NOT NULL,            -- news id | firm key | firm key|plan|size
  hidden     INTEGER NOT NULL DEFAULT 0,
  patch      TEXT NOT NULL DEFAULT '{}',  -- JSON of overridden fields
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, item_id)
);

-- edits_updated_at, render_requested_at, admin_token_hash (once the admin changes the token).
CREATE TABLE IF NOT EXISTS pfb_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Admin sign-ins (SHA-256 of the cookie value) and failed attempts (15-minute limit).
CREATE TABLE IF NOT EXISTS pfb_sessions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pfb_login_failures (
  ip TEXT NOT NULL,
  at TEXT NOT NULL
);
