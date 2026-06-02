-- Snapshot the click timestamp at claim submission time.
-- Prevents live joins from changing the displayed click status after a claim is submitted.
ALTER TABLE purchase_claims ADD COLUMN last_click_at TEXT;
