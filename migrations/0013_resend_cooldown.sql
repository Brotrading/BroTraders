-- Prevent email spam by tracking when a verification code was last resent.
ALTER TABLE user_firm_emails ADD COLUMN last_resend_at TEXT;
