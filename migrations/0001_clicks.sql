-- D1 schema for affiliate click tracking.
-- Apply with: wrangler d1 execute propfirmbro-clicks --file=./migrations/0001_clicks.sql --remote

CREATE TABLE IF NOT EXISTS clicks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  firm          TEXT NOT NULL,
  referrer      TEXT,
  user_agent    TEXT,
  country       TEXT,
  colo          TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  created_at    TEXT NOT NULL  -- ISO 8601 timestamp
);

CREATE INDEX IF NOT EXISTS idx_clicks_firm        ON clicks(firm);
CREATE INDEX IF NOT EXISTS idx_clicks_created_at  ON clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_clicks_firm_date   ON clicks(firm, created_at);
