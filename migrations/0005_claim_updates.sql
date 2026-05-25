-- Fraud-prevention and proof fields for purchase_claims.
-- Apply with: Cloudflare dashboard → D1 → propfirmbro-clicks → Console → paste + Execute
--
-- purchase_date  : user-entered purchase date (YYYY-MM-DD); validated ≤30 days old + after account creation
-- proof_data     : base64-encoded proof attachment (≤500 KB raw → ≤~680 KB base64)
-- proof_mime     : MIME type: image/jpeg | image/png | image/webp | application/pdf
-- used_bro_code  : 1 = user confirmed they purchased via a BRO affiliate link
-- is_suspicious  : 1 = no attributed click found for this user+firm in the past 60 days
-- risk_level     : 'low' | 'medium' | 'high' — computed at submission time from amount + is_suspicious

ALTER TABLE purchase_claims ADD COLUMN purchase_date  TEXT;
ALTER TABLE purchase_claims ADD COLUMN proof_data     TEXT;
ALTER TABLE purchase_claims ADD COLUMN proof_mime     TEXT;
ALTER TABLE purchase_claims ADD COLUMN used_bro_code  INTEGER DEFAULT 0;
ALTER TABLE purchase_claims ADD COLUMN is_suspicious  INTEGER DEFAULT 0;
ALTER TABLE purchase_claims ADD COLUMN risk_level     TEXT DEFAULT 'medium';
