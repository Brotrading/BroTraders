-- 0009: Fraud hardening
--
-- 1. Brute-force protection on firm email verification codes
-- 2. DB-level uniqueness enforcement for awardOnce (non-null ref_id rows)
-- 3. Preserve firm review history on rejection instead of hard-deleting
-- 4. Prevent duplicate order_ref submissions per user+firm

-- 1. Track failed code-entry attempts; code is invalidated after 5.
ALTER TABLE user_firm_emails ADD COLUMN verification_attempts INTEGER DEFAULT 0;

-- 2. Enforce awardOnce at DB level for rows that carry a ref_id.
--    Rows with ref_id IS NULL (daily logins, signup bonus) rely on
--    application-level checks only — SQLite treats each NULL as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_once
  ON points_ledger(user_id, reason, ref_id)
  WHERE ref_id IS NOT NULL;

-- 3. Reviews now carry an explicit status instead of being hard-deleted on rejection.
ALTER TABLE firm_reviews ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE firm_reviews ADD COLUMN rejection_reason TEXT;

-- Back-fill existing rows so is_approved stays consistent with status.
UPDATE firm_reviews SET status = 'approved' WHERE is_approved = 1;

-- 4. The same order_ref may only be submitted once per user per firm.
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_order_ref
  ON purchase_claims(user_id, firm_slug, order_ref);
