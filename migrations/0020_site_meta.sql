-- Small key/value store for site metadata that must NOT be publicly served.
-- First use: the affiliate revenue summary (key 'affiliate_summary'), which
-- used to live as a public static file at /data/affiliate-summary.json and is
-- now served token-gated via /api/affiliate-summary (GET) and updated via a
-- token-gated POST from the AIOS sync script.
--
-- Numbered 0020: 0002-0019 are taken by the rewards system (nick/rewards-system
-- branch) and have already been applied to both D1 databases.
--
-- Apply with: Cloudflare dashboard → D1 → Console → paste + Execute
-- Run on BOTH production (propfirmbro-clicks) and preview (propfirmbro-clicks-preview).

CREATE TABLE IF NOT EXISTS site_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,          -- JSON blob
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
