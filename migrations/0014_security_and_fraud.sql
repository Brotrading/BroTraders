-- IP logging for fraud pattern detection (punt 14)
ALTER TABLE purchase_claims ADD COLUMN submitter_ip TEXT;

-- Proof deduplication: hash of proof_data + flag when same hash seen before (punt 16)
ALTER TABLE purchase_claims ADD COLUMN proof_hash TEXT;
ALTER TABLE purchase_claims ADD COLUMN is_duplicate_proof INTEGER NOT NULL DEFAULT 0;
