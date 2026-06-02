-- Propfirm email linking for cashback claims (fraud prevention).
-- Users must register the email they used at each prop firm before submitting a claim.
-- The email is locked (read-only) after the first approved claim for that firm.
--
-- Apply with: Cloudflare dashboard → D1 → propfirmbro-clicks → Console → paste + Execute

CREATE TABLE IF NOT EXISTS user_firm_emails (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  firm_slug  TEXT NOT NULL,
  email      TEXT NOT NULL,
  -- 1 = locked after first approved claim
  locked     INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, firm_slug),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_firm_emails_user ON user_firm_emails(user_id);
