-- Email verification columns for user_firm_emails.
-- Apply with: Cloudflare dashboard → D1 → propfirmbro-clicks → Console → paste + Execute

ALTER TABLE user_firm_emails ADD COLUMN verified               INTEGER DEFAULT 0;
ALTER TABLE user_firm_emails ADD COLUMN verification_code      TEXT;
ALTER TABLE user_firm_emails ADD COLUMN verification_expires_at TEXT;
