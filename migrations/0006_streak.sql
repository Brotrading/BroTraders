-- Migration 0006: daily login streak columns
-- Run in Cloudflare dashboard → D1 → propfirmbro-clicks → Console

ALTER TABLE users ADD COLUMN login_streak       INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_claimed_date TEXT;    -- "YYYY-MM-DD" of last daily claim
ALTER TABLE users ADD COLUMN streak_best         INTEGER DEFAULT 0;
