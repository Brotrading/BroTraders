-- Purchase cashback claims (part of the Bro Rewards system).
-- Users submit a claim after buying through a /go/<firm> link.
-- Mike approves or rejects from /admin/rewards.html.
-- On approval: cashback points are automatically posted to points_ledger.
--
-- Apply with: Cloudflare dashboard → D1 → propfirmbro-clicks → Console → paste + Execute

CREATE TABLE IF NOT EXISTS purchase_claims (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT NOT NULL,
  firm_slug      TEXT NOT NULL,          -- matches /go/<slug>
  order_ref      TEXT,                   -- order number / confirmation code (user-entered, optional)
  amount_eur     REAL NOT NULL,          -- purchase amount in euros (user-entered)
  status         TEXT DEFAULT 'pending', -- pending / approved / rejected
  points_awarded INTEGER DEFAULT 0,     -- filled on approval
  note           TEXT,                  -- admin note (internal only)
  created_at     TEXT NOT NULL,
  reviewed_at    TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_claims_status ON purchase_claims(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_user   ON purchase_claims(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_firm   ON purchase_claims(firm_slug, status);
