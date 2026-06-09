-- Adds discount-code pool support to the Bro Store.
-- bro_pack_codes: one-time-use codes per package, assigned on redemption.
-- bro_packages.uses_discount_codes: marks a package as code-based (auto-fulfilled).
-- redemptions.discount_code: stores the assigned code for the user's records.

ALTER TABLE bro_packages ADD COLUMN uses_discount_codes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE redemptions   ADD COLUMN discount_code TEXT;

CREATE TABLE IF NOT EXISTS bro_pack_codes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  package_slug         TEXT NOT NULL,
  code                 TEXT NOT NULL,
  assigned_to_user_id  TEXT,
  assigned_at          TEXT,
  redemption_id        INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(code)
);

CREATE INDEX IF NOT EXISTS idx_bro_pack_codes_slug
  ON bro_pack_codes(package_slug, assigned_to_user_id);
